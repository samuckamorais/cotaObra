import { FSMEngine } from './fsm';
import { Messages } from './messages';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { prisma } from '../config/database';
import { SupplierState, ConversationContext } from '../types';
import { logger, logWithContext } from '../utils/logger';
import { supplierNotificationService } from '../services/supplier-notification.service';
import { ProposalTokenService } from '../services/proposal-token.service';
import { TenantSettingsService } from '../services/tenant-settings.service';
import { SupplierStateService } from '../services/supplier-state.service';
import { markQuoteResponse, tryConsolidateEarly } from '../jobs/consolidate-quote.job';

/**
 * FSM do Fornecedor - Gerencia fluxo de resposta a cotações
 * Estados: SUPPLIER_IDLE → SUPPLIER_AWAITING_RESPONSE → ... → SUPPLIER_PROPOSAL_SENT
 */
export class SupplierFSM extends FSMEngine<SupplierState> {
  /**
   * Handler principal que roteia mensagem para o handler do estado atual
   */
  async handleMessage(supplierId: string, message: string): Promise<void> {
    const supplier = await prisma.supplier.findUniqueOrThrow({
      where: { id: supplierId },
    });

    // Buscar estado (Redis cache → PostgreSQL fallback)
    const stateData = await SupplierStateService.get(supplierId);
    const currentState: SupplierState = stateData?.state ?? 'SUPPLIER_IDLE';
    const context: ConversationContext = stateData?.context ?? {};

    logWithContext('info', 'Supplier message received', {
      supplierId,
      currentState,
      message,
    });

    try {
      // Rotear para handler do estado
      switch (currentState) {
        case 'SUPPLIER_IDLE':
          await whatsappService.sendMessage({
            to: supplier.phone,
            body: 'Você receberá notificações quando houver novas cotações disponíveis. 📬',
          });
          break;

        case 'SUPPLIER_AWAITING_INTEREST':
          await this.handleAwaitingInterest(supplierId, supplier.phone, message, context);
          break;

        case 'SUPPLIER_AWAITING_RESPONSE':
          await this.handleAwaitingResponse(supplierId, supplier.phone, message, context);
          break;

        case 'SUPPLIER_AWAITING_PRICE':
          await this.handleAwaitingPrice(supplierId, supplier.phone, message, context);
          break;

        case 'SUPPLIER_AWAITING_DELIVERY':
          await this.handleAwaitingDelivery(supplierId, supplier.phone, message, context);
          break;

        case 'SUPPLIER_AWAITING_PAYMENT':
          await this.handleAwaitingPayment(supplierId, supplier.phone, message, context);
          break;

        case 'SUPPLIER_AWAITING_OBS':
          await this.handleAwaitingObs(supplierId, supplier.phone, message, context);
          break;

        default:
          await whatsappService.sendMessage({
            to: supplier.phone,
            body: Messages.UNKNOWN_INPUT,
          });
      }
    } catch (error) {
      logger.error('Error in SupplierFSM', { error, supplierId, currentState });
      await whatsappService.sendMessage({
        to: supplier.phone,
        body: Messages.ERROR,
      });
    }
  }

  /**
   * Estado SUPPLIER_AWAITING_INTEREST - Aguardando o fornecedor sinalizar
   * interesse após o hook inicial. Qualquer resposta diferente de recusa
   * dispara o envio dos detalhes da cotação e avança para AWAITING_RESPONSE.
   */
  private async handleAwaitingInterest(
    supplierId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.trim().toLowerCase();

    const isDecline =
      normalized === '2' ||
      normalized === 'não' ||
      normalized === 'nao' ||
      normalized === 'não tenho interesse' ||
      normalized === 'nao tenho interesse' ||
      normalized.startsWith('não obrigado') ||
      normalized.startsWith('nao obrigado');

    if (isDecline) {
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.PROPOSAL_DECLINED,
      });
      await this.deleteSupplierState(supplierId);

      // FEAT-EARLY-CLOSE — rastreia recusa formal e tenta consolidar
      // antecipadamente se todos os convidados já responderam.
      if (context.quoteId) {
        await markQuoteResponse(context.quoteId, supplierId, 'DECLINED');
        // Fire-and-forget: não bloqueia a UX do fornecedor.
        tryConsolidateEarly(context.quoteId).catch((err) =>
          logger.error('tryConsolidateEarly after decline failed', {
            quoteId: context.quoteId,
            error: (err as Error).message,
          }),
        );
      }
      return;
    }

    const quote = await prisma.quote.findUniqueOrThrow({
      where: { id: context.quoteId! },
      include: { items: true },
    });

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.NEW_QUOTE_DETAILS({
        items: quote.items.map((it) => ({
          product: it.product,
          quantity: it.quantity,
          unit: it.unit,
          activeIngredient: it.activeIngredient || undefined,
        })),
        freight: quote.freight || undefined,
        paymentTerms: quote.paymentTerms || undefined,
        observations: quote.observations || undefined,
        proposalFormUrl: context.proposalFormUrl as string | undefined,
        expiresAt: quote.expiresAt,
      }),
    });

    await this.setSupplierState(supplierId, 'SUPPLIER_AWAITING_RESPONSE', context);
  }

  /**
   * Estado SUPPLIER_AWAITING_RESPONSE - Aguardando aceite/recusa da cotação
   */
  private async handleAwaitingResponse(
    supplierId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const choice = message.trim();

    if (choice === '1') {
      // Fornecedor quer enviar proposta
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.ASK_PRICE,
      });

      await this.setSupplierState(supplierId, 'SUPPLIER_AWAITING_PRICE', context);
      return;
    }

    if (choice === '2') {
      // Fornecedor recusou
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.PROPOSAL_DECLINED,
      });

      await this.deleteSupplierState(supplierId);

      // FEAT-EARLY-CLOSE — rastreia recusa e tenta consolidar cedo.
      if (context.quoteId) {
        await markQuoteResponse(context.quoteId, supplierId, 'DECLINED');
        tryConsolidateEarly(context.quoteId).catch((err) =>
          logger.error('tryConsolidateEarly after decline failed', {
            quoteId: context.quoteId,
            error: (err as Error).message,
          }),
        );
      }
      return;
    }

    await whatsappService.sendMessage({
      to: phone,
      body: 'Opção inválida. Digite *1* para enviar proposta ou *2* para recusar.',
    });
  }

  /**
   * Estado SUPPLIER_AWAITING_PRICE - Aguardando preço da proposta (fluxo 1 item via WhatsApp)
   */
  private async handleAwaitingPrice(
    supplierId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const price = parseFloat(message.replace(/[^\d.,-]/g, '').replace(',', '.'));

    if (isNaN(price) || price <= 0) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Preço inválido. Digite apenas números. Exemplo: *15000*',
      });
      return;
    }

    context.price = price;
    // Para 1 item via WhatsApp, criar ProposalItem no final com base no price total
    if (context.quoteItems && context.quoteItems.length > 0) {
      const item = context.quoteItems[0];
      context.proposalItems = [{
        quoteItemId: item.id,
        unitPrice: price / item.quantity,
        totalPrice: price,
      }];
    }

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.ASK_DELIVERY,
    });

    await this.setSupplierState(supplierId, 'SUPPLIER_AWAITING_DELIVERY', context);
  }

  /**
   * Estado SUPPLIER_AWAITING_DELIVERY - Aguardando prazo de entrega
   */
  private async handleAwaitingDelivery(
    supplierId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const deliveryDays = parseInt(message.trim());

    if (isNaN(deliveryDays) || deliveryDays <= 0) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Prazo inválido. Digite apenas o número de dias. Exemplo: *5*',
      });
      return;
    }

    context.deliveryDays = deliveryDays;

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.ASK_PAYMENT,
    });

    await this.setSupplierState(supplierId, 'SUPPLIER_AWAITING_PAYMENT', context);
  }

  /**
   * Estado SUPPLIER_AWAITING_PAYMENT - Aguardando condição de pagamento.
   *
   * CO-3-03 — Aceita escolha numérica 1-4 do menu de construção
   * (à vista / 28dd / 28/56dd / 30/60/90dd) ou texto livre como fallback.
   */
  private async handleAwaitingPayment(
    supplierId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const resolved = Messages.RESOLVE_PAYMENT_CHOICE(message);

    if (!resolved) {
      // Veio "5" (Outro) ou input curto demais — pede texto livre.
      await whatsappService.sendMessage({
        to: phone,
        body: 'Digite a condição de pagamento em texto livre (ex: 45 dias, à vista com 5% desc, parcelado em 4x).',
      });
      return;
    }

    context.paymentTerms = resolved;

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.ASK_SUPPLIER_OBS,
    });

    await this.setSupplierState(supplierId, 'SUPPLIER_AWAITING_OBS', context);
  }

  /**
   * Estado SUPPLIER_AWAITING_OBS - Aguardando observações
   */
  private async handleAwaitingObs(
    supplierId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.toLowerCase().trim();

    if (normalized !== 'não' && normalized !== 'nao') {
      context.observations = message.trim();
    }

    // Criar proposta no banco
    const quote = await prisma.quote.findUniqueOrThrow({
      where: { id: context.quoteId! },
      include: { items: true },
    });

    const proposalItems = context.proposalItems || [];
    const totalPrice = proposalItems.length > 0
      ? proposalItems.reduce((sum, it) => sum + it.totalPrice, 0)
      : context.price!;
    const isPartial = quote.items.length > 0 && proposalItems.length < quote.items.length;

    const proposal = await prisma.$transaction(async (tx) => {
      const newProposal = await tx.proposal.create({
        data: {
          quoteId: context.quoteId!,
          supplierId,
          tenantId: quote.tenantId,
          price: totalPrice,
          totalPrice,
          paymentTerms: context.paymentTerms!,
          deliveryDays: context.deliveryDays!,
          observations: context.observations,
          isOwnSupplier: context.isOwnSupplier || false,
          isPartial,
        },
      });

      if (proposalItems.length > 0) {
        await tx.proposalItem.createMany({
          data: proposalItems.map((it) => ({
            proposalId: newProposal.id,
            quoteItemId: it.quoteItemId,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
          })),
        });
      }

      return newProposal;
    });

    // Enviar feedback com ranking (assíncrono, não bloquear)
    supplierNotificationService.sendProposalRankingFeedback(proposal.id).catch((err) => {
      logger.error('Failed to send ranking feedback', { error: err, proposalId: proposal.id });
    });

    // Mensagem simples inicial (o ranking vem depois)
    await whatsappService.sendMessage({
      to: phone,
      body: Messages.PROPOSAL_SENT,
    });

    // Limpar estado
    await this.deleteSupplierState(supplierId);

    logger.info('Supplier proposal created', { supplierId, quoteId: context.quoteId });

    // FEAT-EARLY-CLOSE — rastreia que esse fornecedor respondeu e tenta
    // consolidar antecipadamente se todos os convidados já responderam.
    if (context.quoteId) {
      await markQuoteResponse(context.quoteId, supplierId, 'PROPOSAL');
      // Fire-and-forget: feedback de ranking + tryConsolidate paralelos.
      tryConsolidateEarly(context.quoteId).catch((err) =>
        logger.error('tryConsolidateEarly after proposal failed', {
          quoteId: context.quoteId,
          error: (err as Error).message,
        }),
      );
    }
  }

  /**
   * Salva estado do fornecedor (PostgreSQL + Redis cache)
   */
  private async setSupplierState(
    supplierId: string,
    state: SupplierState,
    context: ConversationContext,
  ): Promise<void> {
    await SupplierStateService.set(supplierId, state, context);
  }

  /**
   * Remove estado do fornecedor (PostgreSQL + Redis)
   */
  private async deleteSupplierState(supplierId: string): Promise<void> {
    await SupplierStateService.delete(supplierId);
  }

  /**
   * Notifica fornecedor sobre nova cotação disponível
   * Define estado inicial como SUPPLIER_AWAITING_RESPONSE
   */
  async notifyNewQuote(supplierId: string, quoteId: string, isOwnSupplier: boolean): Promise<void> {
    const supplier = await prisma.supplier.findUniqueOrThrow({
      where: { id: supplierId },
    });

    const quote = await prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: {
        producer: { select: { name: true, city: true } },
        items: true,
      },
    });

    const isMultiItem = quote.items.length > 1;

    // Carregar configurações do tenant para usar expiração personalizada
    // CO-0-04: settings migraram para nível de tenant.
    const tenantSettings = await TenantSettingsService.getOrCreate(quote.tenantId);

    // Para multi-item, gerar link do formulário web
    let proposalFormUrl: string | undefined;
    if (isMultiItem) {
      proposalFormUrl = await ProposalTokenService.generateFormUrl(
        quoteId,
        supplierId,
        tenantSettings.proposalLinkExpiryHours
      );
    }

    const quoteData = {
      id: quote.id,
      producerName: quote.producer.name,
      producerCity: quote.producer.city,
      category: quote.category || undefined,
      items: quote.items.map((it) => ({
        product: it.product,
        quantity: it.quantity,
        unit: it.unit,
        activeIngredient: it.activeIngredient || undefined,
      })),
      region: quote.region,
      deadline: quote.deadline.toLocaleDateString('pt-BR'),
      observations: quote.observations || undefined,
      freight: quote.freight || undefined,
      paymentTerms: quote.paymentTerms || undefined,
      proposalFormUrl,
    };

    // Envia apenas o hook. Os detalhes só são enviados após o fornecedor
    // sinalizar interesse (handleAwaitingInterest), conforme a CTA do hook
    // ("Tem interesse? Responda para ver detalhes.").
    await whatsappService.sendMessage({
      to: supplier.phone,
      body: Messages.NEW_QUOTE_HOOK(quoteData),
    });

    const context: ConversationContext = {
      quoteId,
      isOwnSupplier,
      quoteItems: quote.items.map((it) => ({
        id: it.id,
        product: it.product,
        quantity: it.quantity,
        unit: it.unit,
      })),
      proposalFormUrl,
    };

    // TTL alinhado ao prazo real da cotação (mínimo 1h)
    const ttlMs = Math.max(0, quote.deadline.getTime() - Date.now());
    const ttlHours = Math.max(1, Math.ceil(ttlMs / 3_600_000));

    await SupplierStateService.set(supplierId, 'SUPPLIER_AWAITING_INTEREST', context, {
      ttlHours,
      tenantId: supplier.tenantId,
    });

    logger.info('Supplier notified about new quote', { supplierId, quoteId, isMultiItem });
  }
}
