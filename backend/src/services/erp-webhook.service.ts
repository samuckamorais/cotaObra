import { createHmac } from 'crypto';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * CO-8-01/02 — Webhook outbound para o ERP do cliente.
 *
 * Quando uma `PurchaseOrder` muda para EMITTED, envia POST signed (HMAC-SHA256)
 * para `TenantSettings.erpWebhookUrl`. O cliente valida via header
 * `x-cotaobra-signature: sha256=<hex>`.
 *
 * Adapters disponíveis (em `erpAdapter`):
 *   - `generic`: payload completo e flat (default)
 *   - `sienge` : mapping para Sienge (campos POMaster/POItem)
 *   - `gvdasa` : mapping para GVdasa (campos similares ao Sienge mas com diff)
 *
 * Não bloqueia a emissão da PO — falha do webhook só loga + agenda retry.
 * Retry: Bull com 3 tentativas + backoff exponencial.
 */

type Adapter = 'generic' | 'sienge' | 'gvdasa';

export interface ErpPurchaseOrderPayload {
  event: 'purchase_order.created';
  occurredAt: string;
  tenant: { id: string; name: string; cnpj?: string | null };
  purchaseOrder: {
    id: string;
    number: number;
    status: string;
    totalValue: number;
    paymentTerms: string;
    deliveryDays: number;
    freightMode: string | null;
    freightValue: number | null;
    observations: string | null;
    pdfUrl: string | null;
    createdAt: string;
    items: Array<{
      description: string;
      qty: number;
      unit: string;
      unitPrice: number;
      totalPrice: number;
    }>;
    supplier: {
      id: string;
      name: string;
      cnpjHash?: string | null;
      email?: string | null;
      phone?: string | null;
    };
    site: {
      id: string;
      name: string;
      address?: string | null;
      cno?: string | null;
    } | null;
  };
}

export class ErpWebhookService {
  static sign(payload: string, secret: string): string {
    return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Carrega PO e gera payload para o ERP. Retorna null se tenant não tem
   * integração configurada.
   */
  static async buildPayload(
    purchaseOrderId: string,
  ): Promise<{
    url: string;
    secret: string;
    adapter: Adapter;
    body: any;
  } | null> {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        items: true,
        supplier: true,
        quote: { include: { site: true } },
        tenant: {
          include: { settings: true },
        },
      },
    });
    if (!po) {
      logger.warn('erp_webhook.po_not_found', { purchaseOrderId });
      return null;
    }
    const settings = po.tenant.settings;
    if (!settings?.erpWebhookUrl || !settings?.erpWebhookSecret) {
      logger.info('erp_webhook.skip_not_configured', {
        purchaseOrderId,
        tenantId: po.tenantId,
      });
      return null;
    }

    const adapter = ((settings.erpAdapter ?? 'generic') as Adapter);
    const generic: ErpPurchaseOrderPayload = {
      event: 'purchase_order.created',
      occurredAt: new Date().toISOString(),
      tenant: {
        id: po.tenantId,
        name: po.tenant.name,
        cnpj: po.tenant.cnpj,
      },
      purchaseOrder: {
        id: po.id,
        number: po.number,
        status: po.status,
        totalValue: Number(po.totalValue),
        paymentTerms: po.paymentTerms,
        deliveryDays: po.deliveryDays,
        freightMode: po.freightMode,
        freightValue: po.freightValue !== null ? Number(po.freightValue) : null,
        observations: po.observations,
        pdfUrl: po.pdfUrl,
        createdAt: po.createdAt.toISOString(),
        items: po.items.map((it) => ({
          description: it.description,
          qty: Number(it.qty),
          unit: it.unit,
          unitPrice: Number(it.unitPrice),
          totalPrice: Number(it.totalPrice),
        })),
        supplier: {
          id: po.supplier.id,
          name: po.supplier.name,
          // CO-8-01: CNPJ está criptografado; expomos só o hash pra ERP
          // poder buscar/correlacionar. Decrypt explícito virá em sprint futura.
          cnpjHash: po.supplier.cpfCnpjHash,
          email: po.supplier.email,
          phone: po.supplier.phone,
        },
        site: po.quote.site
          ? {
              id: po.quote.site.id,
              name: po.quote.site.name,
              address: po.quote.site.address,
              cno: po.quote.site.cno,
            }
          : null,
      },
    };

    const body = this.transform(adapter, generic);

    return {
      url: settings.erpWebhookUrl,
      secret: settings.erpWebhookSecret,
      adapter,
      body,
    };
  }

  /**
   * Aplica transformação por adapter.
   */
  private static transform(adapter: Adapter, generic: ErpPurchaseOrderPayload): any {
    if (adapter === 'generic') return generic;

    const po = generic.purchaseOrder;
    if (adapter === 'sienge') {
      // Mapping mínimo Sienge — exporta POMaster + POItems[]
      return {
        eventType: generic.event,
        occurredAt: generic.occurredAt,
        company: { cnpj: generic.tenant.cnpj, name: generic.tenant.name },
        POMaster: {
          externalId: po.id,
          number: String(po.number).padStart(6, '0'),
          status: po.status,
          totalAmount: po.totalValue,
          paymentTerms: po.paymentTerms,
          deliveryDays: po.deliveryDays,
          freightType: po.freightMode,
          freightValue: po.freightValue,
          observations: po.observations,
          attachmentUrl: po.pdfUrl,
          issuedAt: po.createdAt,
          supplierCnpjHash: po.supplier.cnpjHash,
          supplierName: po.supplier.name,
          siteCno: po.site?.cno ?? null,
          siteName: po.site?.name ?? null,
        },
        POItems: po.items.map((it, idx) => ({
          sequence: idx + 1,
          description: it.description,
          quantity: it.qty,
          unit: it.unit,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
        })),
      };
    }

    if (adapter === 'gvdasa') {
      // Mapping GVdasa — schema próximo do Sienge mas com nomenclatura própria
      return {
        evento: generic.event,
        emitidoEm: generic.occurredAt,
        empresa: { cnpj: generic.tenant.cnpj, razaoSocial: generic.tenant.name },
        cabecalhoOC: {
          idExterno: po.id,
          numero: po.number,
          situacao: po.status,
          valorTotal: po.totalValue,
          condicaoPagamento: po.paymentTerms,
          prazoEntregaDias: po.deliveryDays,
          tipoFrete: po.freightMode,
          valorFrete: po.freightValue,
          observacoes: po.observations,
          anexoPDF: po.pdfUrl,
          dataEmissao: po.createdAt,
          fornecedor: {
            cnpjHash: po.supplier.cnpjHash,
            razaoSocial: po.supplier.name,
            email: po.supplier.email,
            telefone: po.supplier.phone,
          },
          obra: po.site
            ? { cno: po.site.cno, nome: po.site.name, endereco: po.site.address }
            : null,
        },
        itensOC: po.items.map((it, idx) => ({
          seq: idx + 1,
          descricao: it.description,
          quantidade: it.qty,
          unidade: it.unit,
          precoUnitario: it.unitPrice,
          precoTotal: it.totalPrice,
        })),
      };
    }

    return generic;
  }

  /**
   * Envia o webhook (chamado pelo Bull job). Lança em caso de falha 4xx/5xx
   * para acionar retry.
   */
  static async send(purchaseOrderId: string): Promise<void> {
    const payload = await this.buildPayload(purchaseOrderId);
    if (!payload) return;

    const bodyString = JSON.stringify(payload.body);
    const signature = this.sign(bodyString, payload.secret);

    const res = await fetch(payload.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CotaObra-Webhook/1.0',
        'x-cotaobra-signature': signature,
        'x-cotaobra-adapter': payload.adapter,
        'x-cotaobra-event': 'purchase_order.created',
      },
      body: bodyString,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn('erp_webhook.send_failed', {
        purchaseOrderId,
        url: payload.url,
        status: res.status,
        bodySnippet: text.slice(0, 300),
      });
      throw new Error(`ERP webhook returned ${res.status}`);
    }

    logger.info('erp_webhook.sent', {
      purchaseOrderId,
      adapter: payload.adapter,
      status: res.status,
    });
  }
}
