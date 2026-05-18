import { prisma } from '../../config/database';
import { QuoteTokenService } from '../../services/quote-token.service';
import { dispatchQuoteJob } from '../../jobs/dispatch-quote.job';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { Messages } from '../../flows/messages';
import { TenantSettingsService } from '../../services/tenant-settings.service';
import { env } from '../../config/env';
import { resolveCategoryValue } from '../../constants/supplier-categories';

export interface QuoteFormItem {
  product: string;
  quantity: number;
  unit: string;
  observation?: string;
  activeIngredient?: string;
}

export interface QuoteFormSubmitData {
  category: string;
  items: QuoteFormItem[];
  region: string;
  deadline: string;
  observations?: string;
  freight: 'CIF' | 'FOB';
  paymentTerms: string;
  selectedSupplierIds: string[];
}

export interface CreateSupplierFromFormData {
  name: string;
  phone: string;
  category?: string;
}

export class QuoteFormSupplierConflictError extends Error {
  constructor(public existingName: string) {
    super('SUPPLIER_ALREADY_LINKED');
  }
}

export class QuoteFormValidationError extends Error {
  constructor(public field: 'name' | 'phone' | 'category', message: string) {
    super(message);
  }
}

export class QuoteFormService {
  /**
   * Retorna os dados necessários para renderizar o formulário de cotação.
   */
  static async getFormData(token: string) {
    const record = await QuoteTokenService.validate(token);
    const { producer } = record;

    // CO-0-05: fornecedores próprios agora são por tenant (não mais via ProducerSupplier).
    const ownSuppliersRaw = await prisma.supplier.findMany({
      where: { tenantId: producer.tenantId, isNetworkSupplier: false },
      select: {
        id: true,
        name: true,
        company: true,
        categories: true,
        isNetworkSupplier: true,
        rating: true,
      },
    });

    const ownSuppliers = ownSuppliersRaw.map((s) => ({ ...s, isOwn: true }));

    const ownSupplierIds = ownSuppliers.map((s) => s.id);

    // Fornecedores da rede — exibidos apenas quando a feature está habilitada.
    // ENABLE_NETWORK_SUPPLIERS=false no lançamento: rede vazia = experiência quebrada.
    const networkSuppliers = env.ENABLE_NETWORK_SUPPLIERS
      ? await prisma.supplier.findMany({
          where: {
            isNetworkSupplier: true,
            id: { notIn: ownSupplierIds.length ? ownSupplierIds : [''] },
          },
          select: {
            id: true,
            name: true,
            company: true,
            categories: true,
            isNetworkSupplier: true,
            rating: true,
          },
        })
      : [];

    const allSuppliers = [
      ...ownSuppliers,
      ...networkSuppliers.map((s) => ({ ...s, isOwn: false })),
    ];

    return {
      token: record.token,
      expiresAt: record.expiresAt.toISOString(),
      producer: {
        name: producer.name,
        city: producer.city,
        region: producer.region,
      },
      suppliers: allSuppliers,
    };
  }

  /**
   * Processa o formulário de cotação preenchido pelo produtor:
   * cria Quote + QuoteItems e dispara para fornecedores selecionados.
   */
  static async submitForm(token: string, data: QuoteFormSubmitData) {
    const record = await QuoteTokenService.validate(token);
    const { producer } = record;

    // FF-BE-025 — Defesa em profundidade: front novo já envia value canônico,
    // mas clientes antigos / API direta podem enviar "Sementes", "Defensivos" etc.
    // Normaliza tudo via resolveCategoryValue; rejeita valor totalmente
    // desconhecido para evitar Quote.category divergente do dicionário.
    const canonicalCategory = resolveCategoryValue(data.category);
    if (!canonicalCategory) {
      throw new QuoteFormValidationError(
        'category',
        `Categoria inválida: "${data.category}". Use uma das categorias do sistema.`,
      );
    }

    // CO-0-04: settings agora são por tenant; producer carrega tenantId no select.
    const settings = await TenantSettingsService.getOrCreate(producer.tenantId);

    const quote = await prisma.$transaction(async (tx) => {
      const newQuote = await tx.quote.create({
        data: {
          producerId: producer.id,
          tenantId: producer.tenantId,
          category: canonicalCategory,
          // campos legados — preencher com primeiro item
          product: data.items[0].product,
          quantity: String(data.items[0].quantity),
          unit: data.items[0].unit,
          region: data.region,
          deadline: new Date(data.deadline),
          observations: data.observations,
          freight: data.freight,
          paymentTerms: data.paymentTerms,
          supplierScope: 'ALL',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + settings.quoteExpiryHours * 60 * 60 * 1000),
        },
      });

      await tx.quoteItem.createMany({
        data: data.items.map((item) => ({
          quoteId: newQuote.id,
          product: item.product,
          quantity: item.quantity,
          unit: item.unit,
          observation: item.observation,
          activeIngredient: item.activeIngredient,
        })),
      });

      return newQuote;
    });

    // Incrementar cotações usadas na assinatura
    await prisma.subscription.updateMany({
      where: { producerId: producer.id },
      data: { quotesUsed: { increment: 1 } },
    });

    // Disparar para os fornecedores selecionados
    const suppliersCount = await dispatchQuoteJob(quote.id, data.selectedSupplierIds);

    // Marcar token como usado
    await QuoteTokenService.markUsed(token);

    // Salvar preferências da última cotação (com category já canônico)
    await prisma.producer.update({
      where: { id: producer.id },
      data: {
        lastQuotePreferences: {
          category: canonicalCategory,
          items: data.items,
          region: data.region,
          deadline: data.deadline,
          freight: data.freight,
          paymentTerms: data.paymentTerms,
        } as any,
      },
    });

    // Notificar produtor via WhatsApp e resetar estado do FSM
    await whatsappService.sendMessage({
      to: producer.phone,
      body: Messages.QUOTE_DISPATCHED(suppliersCount),
    });

    await prisma.conversationState.updateMany({
      where: { producerId: producer.id },
      data: { step: 'IDLE', context: {} },
    });

    return { quoteId: quote.id, suppliersCount };
  }

  /**
   * FF-BE-008 — Cadastra um novo fornecedor a partir do formulário web,
   * autenticando o produtor via token da cotação.
   *
   * - Valida o token (reaproveita QuoteTokenService.validate).
   * - Valida nome (>=2 chars) e telefone (10-11 dígitos com +55 opcional).
   * - Em caso de duplicidade (phone+tenantId já cadastrado e vinculado ao
   *   produtor): lança QuoteFormSupplierConflictError → 409 no controller.
   * - Cria Supplier + ProducerSupplier em transação atômica, herdando a
   *   categoria informada (geralmente a categoria selecionada na cotação).
   */
  static async createSupplier(token: string, data: CreateSupplierFromFormData) {
    const record = await QuoteTokenService.validate(token);
    const { producer } = record;

    const name = (data.name ?? '').trim();
    if (!name || name.length < 2) {
      throw new QuoteFormValidationError('name', 'Informe um nome válido (mínimo 2 caracteres).');
    }

    const phone = (data.phone ?? '').replace(/[^\d+]/g, '');
    if (!/^(\+55)?\d{10,11}$/.test(phone)) {
      throw new QuoteFormValidationError(
        'phone',
        'Telefone inválido. Informe com DDD (ex: 64999990000).',
      );
    }

    // FF-BE-025 — normaliza categoria para value canônico antes de gravar.
    // category é opcional aqui (cadastro inline pode vir sem contexto de cotação).
    const canonicalCategory = data.category
      ? resolveCategoryValue(data.category)
      : undefined;
    if (data.category && !canonicalCategory) {
      throw new QuoteFormValidationError(
        'category',
        `Categoria inválida: "${data.category}". Use uma das categorias do sistema.`,
      );
    }

    // Verificar duplicidade no tenant (constraint @@unique([tenantId, phone]))
    const existing = await prisma.supplier.findFirst({
      where: { phone, tenantId: producer.tenantId },
    });

    if (existing) {
      // CO-0-05: fornecedor já existe no tenant → conflito 409.
      // (Antes havia o conceito de "existe mas não vinculado a este producer";
      //  agora vínculo é direto via Supplier.tenantId, então existência = vínculo.)
      if (existing.isNetworkSupplier === false) {
        throw new QuoteFormSupplierConflictError(existing.name);
      }

      // Caso de borda: telefone bate com um network supplier (tenantId=null
      // ou tenantId diferente). Adicionar a categoria ao existente.
      if (canonicalCategory && !existing.categories.includes(canonicalCategory)) {
        const updated = await prisma.supplier.update({
          where: { id: existing.id },
          data: { categories: { push: canonicalCategory } },
        });
        return { ...updated, isOwn: true };
      }
      return { ...existing, isOwn: true };
    }

    // Criar novo fornecedor no tenant (vínculo é via tenantId, sem tabela join).
    const supplier = await prisma.supplier.create({
      data: {
        name,
        phone,
        tenantId: producer.tenantId,
        isNetworkSupplier: false,
        categories: canonicalCategory ? [canonicalCategory] : [],
        regions: producer.region ? [producer.region] : [],
      },
    });

    return { ...supplier, isOwn: true };
  }
}
