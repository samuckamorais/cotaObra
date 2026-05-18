import { FSMEngine } from './fsm';
import { Messages } from './messages';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { prisma } from '../config/database';
import { ProducerState, NLUResult, ConversationContext, ContactData } from '../types';
import { logger, logWithContext } from '../utils/logger';
import { parseDeadline } from '../utils/validators';
import { dispatchQuoteJob } from '../jobs/dispatch-quote.job';
import { enqueueQuotePdfJob } from '../jobs/generate-quote-pdf.job';
import { contactExtractorService } from '../services/contact-extractor.service';
import { nluExtractorService } from '../services/nlu-extractor.service';
import { openaiService } from '../services/openai.service';
import { supplierNotificationService } from '../services/supplier-notification.service';
import { TenantSettingsService } from '../services/tenant-settings.service';
import { QuoteTokenService } from '../services/quote-token.service';
import { env } from '../config/env';
import { QuoteStatusService } from '../services/quote-status.service';
import { StatusCheckRateLimit } from '../services/status-rate-limit.service';
import { metricsService } from '../services/metrics.service';
import { normalizeCategoryName } from '../utils/category-normalizer';
import {
  SUPPLIER_CATEGORIES,
  SUPPLIER_CATEGORY_LABELS,
  resolveCategoryValue,
} from '../constants/supplier-categories';
import { normalizeUnit } from '../utils/unit-normalizer';
import { FSMEventService } from '../services/fsm-event.service';
import {
  SmartFillService,
  RE_CONFIRM,
  RE_CORRECT_ALL,
  RE_VIEW_SUPPLIERS,
} from '../services/smart-fill.service';
import { SmartDefaultsService } from '../services/smart-defaults.service';
import { parseInlineEdit } from '../services/inline-edit.service';
import {
  trackFieldAttempt,
  resetFieldAttempts,
} from '../services/anti-loop.service';
import { MidFlowBufferService } from '../services/mid-flow-buffer.service';
import {
  parseAdvancedEdit,
  applyRemoveSupplier,
  applyTopNSuppliers,
} from '../services/inline-edit-advanced.service';

// ─────────────────────────────────────────────────────────────────────────────
// Detecção de intent: consulta de status de cotação
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_INTENT_EXACT = new Set(['status', 'andamento', 'propostas', 'progresso']);

const STATUS_INTENT_PATTERNS: RegExp[] = [
  /^ver (status|andamento|propostas|progresso)\b/,
  /^como (esta|anda|estao|estão)\b.*\b(cotacao|proposta|propostas)\b/,
  /^andamento d[ao] (cotacao|proposta)/,
  /^acompanhar (cotacao|proposta|propostas)/,
  /\bminha cotacao\b.*\b(status|andamento|progresso)\b/,
];

/**
 * CO-0-04: settings migraram de Producer para Tenant. Como a FSM trabalha por producerId,
 * resolvemos o tenantId via lookup curto antes de chamar o TenantSettingsService.
 */
async function resolveTenantIdFromProducer(producerId: string): Promise<string> {
  const p = await prisma.producer.findUniqueOrThrow({
    where: { id: producerId },
    select: { tenantId: true },
  });
  return p.tenantId;
}

export function isStatusCheckIntent(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return false;
  if (STATUS_INTENT_EXACT.has(normalized)) return true;
  return STATUS_INTENT_PATTERNS.some((re) => re.test(normalized));
}

const STATE_TO_TASK_NAME: Partial<Record<ProducerState, string>> = {
  AWAITING_REPEAT_CHOICE: 'a escolha de repetir cotação',
  AWAITING_QUOTE_MODE: 'a escolha do modo da cotação',
  AWAITING_QUOTE_FORM: 'o preenchimento do formulário de cotação',
  AWAITING_CATEGORY: 'a escolha da categoria',
  AWAITING_PRODUCT: 'a indicação do produto',
  AWAITING_ACTIVE_PRINCIPLE: 'a informação do princípio ativo',
  AWAITING_QUANTITY: 'a informação da quantidade',
  AWAITING_MORE_ITEMS: 'a inclusão de itens',
  AWAITING_REGION: 'a informação da região',
  AWAITING_DEADLINE: 'a informação do prazo',
  AWAITING_OBSERVATIONS: 'as observações',
  AWAITING_FREIGHT: 'a escolha do frete',
  AWAITING_PAYMENT_TERMS: 'a condição de pagamento',
  AWAITING_SUPPLIER_SCOPE: 'a escolha dos fornecedores',
  AWAITING_SUPPLIER_SELECTION: 'a seleção dos fornecedores',
  AWAITING_SUPPLIER_EXCLUSION: 'a exclusão de fornecedores',
  AWAITING_SUPPLIER_CONFIRMATION: 'a confirmação dos fornecedores',
  AWAITING_CONFIRMATION: 'a confirmação da cotação',
  AWAITING_CHOICE: 'a escolha do fornecedor',
  AWAITING_SUPPLIER_CONTACT: 'o cadastro do fornecedor',
  AWAITING_SUPPLIER_CATEGORY: 'a categoria do fornecedor',
  AWAITING_SMART_CONFIRMATION: 'a confirmação dos dados',
  AWAITING_RECOVERY_CHOICE: 'a continuação da cotação anterior',
  AWAITING_RATING: 'a avaliação do fornecedor',
};

const STATUS_CHECK_ALLOWED_STATES = new Set<ProducerState>([
  'IDLE',
  'CLOSED',
  'QUOTE_ACTIVE',
  'AWAITING_QUOTE_STATUS_CHOICE',
]);


/**
 * FSM do Produtor - Gerencia fluxo de criação de cotações
 * Estados: IDLE → AWAITING_PRODUCT → ... → QUOTE_ACTIVE → CLOSED
 */
export class ProducerFSM extends FSMEngine<ProducerState> {
  /**
   * Handler principal que roteia mensagem para o handler do estado atual
   */
  async handleMessage(producerId: string, message: string, nluResult?: NLUResult): Promise<void> {
    const producer = await prisma.producer.findUniqueOrThrow({
      where: { id: producerId },
      include: { conversationState: true, subscription: true },
    });

    const currentState = (producer.conversationState?.step as ProducerState) || 'IDLE';
    const context = (producer.conversationState?.context as ConversationContext) || {};

    // Check TTL via getState for expired state detection
    const stateResult = await this.getState(producerId, 'producer');

    logWithContext('info', 'Producer message received', {
      producerId,
      currentState,
      message,
    });

    try {
      // Verificar comando global de cancelar
      if (message.toLowerCase().trim() === 'cancelar') {
        await FSMEventService.trackCommand(producerId, 'cancelar', currentState);
        await this.handleCancel(producerId, producer.phone);
        return;
      }

      // Verificar comando global de ajuda
      if (message.toLowerCase().trim() === 'ajuda') {
        await FSMEventService.trackCommand(producerId, 'ajuda', currentState);
        await whatsappService.sendMessage({
          to: producer.phone,
          body: Messages.HELP,
        });
        return;
      }

      // Verificar comando global de consulta de status (CA-01)
      if (isStatusCheckIntent(message)) {
        await this.handleStatusCheckTrigger(
          producerId,
          producer.phone,
          producer.tenantId,
          currentState,
        );
        return;
      }

      // Check for expired state — offer recovery
      if (stateResult?.expired && currentState !== 'IDLE') {
        if (currentState === 'AWAITING_RECOVERY_CHOICE') {
          // Already in recovery — handle the choice
          await this.handleRecoveryChoice(producerId, producer.phone, message, context);
          return;
        }
        // State expired — offer recovery
        await whatsappService.sendMessage({
          to: producer.phone,
          body: Messages.CONTEXT_RECOVERY(context, stateResult.minutesAgo || 30),
        });
        await this.setState(producerId, 'producer', 'AWAITING_RECOVERY_CHOICE', context);
        return;
      }

      // FF-BE-022 — Detecção de mid-flow collision: produtor manda
      // mensagem rica enquanto está em outro fluxo. Pergunta antes
      // de cancelar a cotação anterior. Detecção só roda quando o
      // smart fill está ligado e estamos em estado intermediário.
      const collisionHandled = await this.maybeHandleMidFlowCollision(
        producerId,
        producer.phone,
        message,
        currentState,
        context,
      );
      if (collisionHandled) return;

      // Rotear para handler do estado
      switch (currentState) {
        case 'IDLE':
          await this.handleIdle(producerId, producer.phone, message, nluResult);
          break;

        case 'AWAITING_REPEAT_CHOICE':
          await this.handleAwaitingRepeatChoice(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_QUOTE_MODE':
          await this.handleAwaitingQuoteMode(producerId, producer.phone, message, producer.tenantId);
          break;

        case 'AWAITING_QUOTE_FORM':
          await this.handleAwaitingQuoteForm(producerId, producer.phone);
          break;

        case 'AWAITING_ACTIVE_PRINCIPLE':
          await this.handleAwaitingActivePrinciple(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_CATEGORY':
          await this.handleAwaitingCategory(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_PRODUCT':
          await this.handleAwaitingProduct(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_QUANTITY':
          await this.handleAwaitingQuantity(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_MORE_ITEMS':
          await this.handleAwaitingMoreItems(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_REGION':
          await this.handleAwaitingRegion(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_DEADLINE':
          await this.handleAwaitingDeadline(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_OBSERVATIONS':
          await this.handleAwaitingObservations(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_FREIGHT':
          await this.handleAwaitingFreight(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_PAYMENT_TERMS':
          await this.handleAwaitingPaymentTerms(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_SUPPLIER_SCOPE':
          await this.handleAwaitingSupplierScope(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_SUPPLIER_SELECTION':
          await this.handleAwaitingSupplierSelection(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_SUPPLIER_EXCLUSION':
          await this.handleAwaitingSupplierExclusion(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_SUPPLIER_CONFIRMATION':
          await this.handleAwaitingSupplierConfirmation(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_CONFIRMATION':
          await this.handleAwaitingConfirmation(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_CHOICE':
          await this.handleAwaitingChoice(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_SUPPLIER_CONTACT':
          await this.handleAwaitingSupplierContact(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_SUPPLIER_CATEGORY':
          await this.handleAwaitingSupplierCategory(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_SMART_CONFIRMATION':
          await this.handleSmartFillConfirmation(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_RECOVERY_CHOICE':
          await this.handleRecoveryChoice(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_MID_FLOW_DECISION':
          await this.handleAwaitingMidFlowDecision(producerId, producer.phone, message);
          break;

        case 'AWAITING_NEW_SUPPLIER_NAME':
          await this.handleAwaitingNewSupplierName(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_NEW_SUPPLIER_PHONE':
          await this.handleAwaitingNewSupplierPhone(producerId, producer.phone, message, context);
          break;

        case 'AWAITING_QUOTE_STATUS_CHOICE':
          await this.handleAwaitingQuoteStatusChoice(
            producerId,
            producer.phone,
            message,
            context,
            producer.tenantId,
          );
          break;

        case 'QUOTE_ACTIVE':
        case 'CLOSED':
        case 'AWAITING_PROACTIVE_CHOICE':
        case 'AWAITING_IMAGE_CHOICE':
          // Estado finalizado ou sem handler ativo — tratar como IDLE
          await this.resetState(producerId, 'producer');
          await this.handleIdle(producerId, producer.phone, message, nluResult);
          break;

        default:
          // Estado desconhecido — resetar e enviar boas-vindas
          await this.resetState(producerId, 'producer');
          await whatsappService.sendMessage({
            to: producer.phone,
            body: Messages.WELCOME(producer.name, !!producer.lastQuotePreferences),
          });
      }
    } catch (error) {
      logger.error('Error in ProducerFSM', { error, producerId, currentState });
      await whatsappService.sendMessage({
        to: producer.phone,
        body: Messages.ERROR,
      });
    }
  }

  /**
   * Estado IDLE - Aguardando início de nova cotação
   */
  private async handleIdle(
    producerId: string,
    phone: string,
    message: string,
    nluResult?: NLUResult
  ): Promise<void> {
    // Buscar dados do produtor uma única vez (otimização)
    const producer = await prisma.producer.findUniqueOrThrow({
      where: { id: producerId },
      include: { subscription: true },
    });

    const normalized = message.toLowerCase().trim();

    // Verificar se é um vCard (contato compartilhado)
    if (contactExtractorService.isVCard(message)) {
      await this.handleContactShared(producerId, phone, message);
      return;
    }

    // Verificar se usuário quer cadastrar fornecedor
    if (normalized === '2' || normalized.includes('cadastrar') || normalized.includes('fornecedor')) {
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.ADD_SUPPLIER_INSTRUCTIONS,
      });
      await this.setState(producerId, 'producer', 'AWAITING_SUPPLIER_CONTACT', {});
      return;
    }

    // Verificar se usuário quer iniciar cotação
    if (normalized === '1' || normalized === 'começar' || normalized === 'comecar' || normalized.includes('nova') || normalized.includes('cotação') || normalized.includes('cotacao')) {
      // Verificar limite de cotações (já temos subscription do fetch acima)
      if (producer.subscription && producer.subscription.quotesUsed >= producer.subscription.quotesLimit) {
        await whatsappService.sendMessage({
          to: phone,
          body: Messages.QUOTA_EXCEEDED(producer.subscription.quotesLimit),
        });
        return;
      }

      // Verificar se tem última cotação salva para oferecer repetir
      if (producer.lastQuotePreferences) {
        const last = producer.lastQuotePreferences as any;

        await whatsappService.sendMessage({
          to: phone,
          body: Messages.REPEAT_LAST_QUOTE(last),
        });

        // Aguardar resposta se quer repetir ou nova
        await this.setState(producerId, 'producer', 'AWAITING_REPEAT_CHOICE', {
          lastQuote: last,
        });
        return;
      }

      // Perguntar modo: chat ou formulário web
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.ASK_QUOTE_MODE,
      });
      await this.setState(producerId, 'producer', 'AWAITING_QUOTE_MODE', {});
      return;
    }

    // FF-BE-013 — Smart Fill (FEAT-007). Kill-switch global via env.
    if (env.SMART_FILL_ENABLED) {
      const validated = await nluExtractorService.extractAndValidate(message, { producerId });
      if (SmartFillService.shouldActivate(validated)) {
        const prefs = await SmartDefaultsService.loadFor(producerId);
        const state = SmartFillService.buildContext(validated, {}, prefs);
        // Marca origem para suprimir nudge pós-dispatch (FF-BE-019)
        (state.context as any)._smartFillUsed = true;

        await FSMEventService.track({
          producerId,
          eventType: 'smart_fill_activated',
          payload: {
            fieldsExtracted: state.fieldsExtractedCount,
            missingFields: state.missing,
            source: state.source,
            warningsCount: state.warnings.length,
          },
        });

        // FF-BE-016 — Confirmação unificada: quando smart fill está
        // completo, pré-seleciona fornecedores da categoria e mostra
        // contagem no resumo. Confirmação única em vez de 4 etapas.
        if (state.missing.length === 0) {
          const suppliers = await this.loadSuppliersForSmartFill(
            producerId,
            state.context.category,
          );
          state.context.supplierScope = 'MINE';
          state.context.selectedSuppliers = suppliers.map((s) => ({
            id: s.id,
            name: s.name,
            phone: s.phone,
          }));

          await whatsappService.sendMessage({
            to: phone,
            body: SmartFillService.buildSummary(state, suppliers.length),
          });
        } else {
          // Faltam dados — pergunta agrupada
          await whatsappService.sendMessage({
            to: phone,
            body: SmartFillService.buildGroupedQuestion(state.missing),
          });
        }

        await this.setState(producerId, 'producer', 'AWAITING_SMART_CONFIRMATION', state.context);
        return;
      }
    }

    // Se NLU detectou intenção de nova cotação — também perguntar o modo
    if (nluResult?.intent === 'nova_cotacao' && nluResult.entities.product) {
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.ASK_QUOTE_MODE,
      });
      await this.setState(producerId, 'producer', 'AWAITING_QUOTE_MODE', {
        product: nluResult.entities.product,
        quantity: nluResult.entities.quantity,
        unit: nluResult.entities.unit,
        region: nluResult.entities.region,
        deadline: nluResult.entities.deadline,
      });
      return;
    }

    // Mensagem de boas-vindas — usuário recorrente recebe versão curta.
    // FF-BE-019: quando smart fill está ligado, primeira interação
    // (sem lastQuotePreferences) recebe welcome com exemplo de mensagem rica.
    const isReturning = !!producer.lastQuotePreferences;
    if (env.SMART_FILL_ENABLED && !isReturning) {
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.SMART_FILL_WELCOME(producer.name),
      });
    } else {
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.WELCOME(producer.name, isReturning),
      });
    }
  }

  /**
   * Estado AWAITING_QUOTE_MODE - Pergunta se a cotação tem mais de 1 produto.
   * Sim → gera link do formulário web.
   * Não → inicia fluxo normal pelo chat.
   */
  private async handleAwaitingQuoteMode(
    producerId: string,
    phone: string,
    message: string,
    tenantId: string
  ): Promise<void> {
    const normalized = message.toLowerCase().trim();

    const isMultiple =
      normalized === '1' ||
      normalized.includes('sim') ||
      normalized.includes('vários') ||
      normalized.includes('varios') ||
      normalized.includes('mais');

    const isSingle =
      normalized === '2' ||
      normalized.includes('não') ||
      normalized.includes('nao') ||
      normalized.includes('apenas') ||
      normalized.includes('só') ||
      normalized.includes('so') ||
      normalized.includes('1 produto') ||
      normalized.includes('um produto');

    if (isMultiple) {
      const url = await QuoteTokenService.generateFormUrl(producerId, tenantId);
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.QUOTE_FORM_LINK(url),
      });
      await this.setState(producerId, 'producer', 'AWAITING_QUOTE_FORM', {});
      return;
    }

    if (isSingle) {
      await this.startCategorySelection(producerId, phone, tenantId);
      return;
    }

    await whatsappService.sendMessage({
      to: phone,
      body: 'Digite *1* para vários produtos ou *2* para apenas 1 produto.',
    });
  }

  /**
   * Estado AWAITING_QUOTE_FORM - Aguardando o produtor preencher o formulário web
   */
  private async handleAwaitingQuoteForm(
    producerId: string,
    phone: string
  ): Promise<void> {
    const token = await prisma.quoteToken.findFirst({
      where: {
        producerId,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (token) {
      const url = QuoteTokenService.buildUrl(token.token);
      await whatsappService.sendMessage({
        to: phone,
        body: `Seu formulário ainda está disponível:\n${url}\n\nPreencha para finalizar a cotação.\n\nPara cancelar, digite *cancelar*.`,
      });
    } else {
      // Token expirado ou não encontrado — resetar
      await this.resetState(producerId, 'producer');
      await whatsappService.sendMessage({
        to: phone,
        body: 'O link da sua cotação expirou. Digite *nova cotação* para recomeçar.',
      });
    }
  }

  /**
   * Estado AWAITING_REPEAT_CHOICE - Aguardando escolha se repete ou nova cotação
   */
  private async handleAwaitingRepeatChoice(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.toLowerCase().trim();

    // Validação tolerante
    if (normalized === '1' || normalized.includes('sim') || normalized.includes('repetir')) {
      // Repetir última cotação - pré-preencher contexto
      const last = context.lastQuote as any;

      let updatedContext: ConversationContext;

      if (last.items && last.items.length > 0) {
        // Formato multi-item (salvo pelo formulário web ou chat multi-item)
        const firstItem = last.items[0];
        updatedContext = {
          category: last.category,
          items: last.items,
          product: firstItem.product,
          quantity: String(firstItem.quantity),
          unit: firstItem.unit,
          region: last.region,
          deadline: last.deadline,
        };
      } else {
        // Formato legado (1 item via chat)
        updatedContext = {
          product: last.product,
          quantity: last.quantity,
          unit: last.unit,
          region: last.region,
          deadline: last.deadline,
        };
      }

      // Ir direto para confirmação de fornecedores
      await this.askOrApplySupplierScope(producerId, phone, updatedContext);
      return;
    }

    if (normalized === '2' || normalized.includes('nova') || normalized.includes('diferente')) {
      // Nova cotação — passar pela pergunta de múltiplos produtos
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.ASK_QUOTE_MODE,
      });
      await this.setState(producerId, 'producer', 'AWAITING_QUOTE_MODE', {});
      return;
    }

    // Opção inválida
    await whatsappService.sendMessage({
      to: phone,
      body: 'Por favor, digite *1* para repetir ou *2* para nova cotação.',
    });
  }

  /**
   * Busca categorias únicas dos fornecedores do tenant e inicia seleção de categoria
   */
  /**
   * Aplica o escopo de fornecedores: se o padrão nas settings for MINE ou NETWORK,
   * pula a pergunta e avança direto. Se for ALL, exibe a pergunta de seleção.
   *
   * Quando ENABLE_NETWORK_SUPPLIERS=false (lançamento), força sempre MINE
   * e nunca exibe a pergunta de escopo ao produtor.
   */
  private async askOrApplySupplierScope(
    producerId: string,
    phone: string,
    context: ConversationContext
  ): Promise<void> {
    // ── Feature flag: rede CotaObra desabilitada ──────────────────────────
    if (!env.ENABLE_NETWORK_SUPPLIERS) {
      context.supplierScope = 'MINE';
      await this.showSupplierListForSelection(producerId, phone, context);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    const tenantId = await resolveTenantIdFromProducer(producerId);
    const settings = await TenantSettingsService.getOrCreate(tenantId);
    const scope = settings.defaultSupplierScope;

    if (scope === 'MINE') {
      context.supplierScope = 'MINE';
      await this.showSupplierListForSelection(producerId, phone, context);
      return;
    }

    if (scope === 'NETWORK') {
      context.supplierScope = 'NETWORK';
      await this.showQuoteConfirmation(producerId, phone, context);
      return;
    }

    // ALL — perguntar ao usuário
    await whatsappService.sendMessage({
      to: phone,
      body: Messages.ASK_SUPPLIER_SCOPE,
    });
    await this.setState(producerId, 'producer', 'AWAITING_SUPPLIER_SCOPE', context);
  }

  private async startCategorySelection(
    producerId: string,
    phone: string,
    _tenantId: string,
    prefilledContext: ConversationContext = {}
  ): Promise<void> {
    // Lista canônica de categorias (mesma do cadastro de fornecedor no
    // painel web). Garante consistência entre os canais e mostra todas
    // as áreas de atuação suportadas pelo sistema, mesmo as que ainda
    // não têm fornecedores cadastrados no tenant.
    const categories = [...SUPPLIER_CATEGORY_LABELS];

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.ASK_CATEGORY(categories),
    });

    await this.setState(producerId, 'producer', 'AWAITING_CATEGORY', {
      ...prefilledContext,
      availableCategories: categories,
    });
  }

  /** Verifica se a categoria é Defensivos (case-insensitive) */
  private isDefensivo(category?: string): boolean {
    return !!category && category.toLowerCase().includes('defensivo');
  }

  /**
   * Estado AWAITING_CATEGORY - Aguardando escolha da categoria
   */
  private async handleAwaitingCategory(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.trim();
    const categories = context.availableCategories || [];

    let selectedCategory: string;

    // Verificar se é um número válido
    const num = parseInt(normalized);
    if (!isNaN(num) && num >= 1 && num <= categories.length) {
      selectedCategory = categories[num - 1];
    } else if (normalized.length >= 2) {
      // Aceitar texto livre como categoria
      selectedCategory = normalized;
    } else {
      await whatsappService.sendMessage({
        to: phone,
        body: categories.length > 0
          ? `Responda com o *número* da categoria (1 a ${categories.length}) ou digite o nome.`
          : 'Por favor, informe a categoria (mínimo 2 caracteres).',
      });
      return;
    }

    context.category = normalizeCategoryName(selectedCategory);

    const askProductMsg = this.isDefensivo(context.category)
      ? Messages.ASK_PRODUCT_DEFENSIVO(context.category)
      : Messages.ASK_PRODUCT(context.category);

    await whatsappService.sendMessage({
      to: phone,
      body: askProductMsg,
    });

    await this.setState(producerId, 'producer', 'AWAITING_PRODUCT', context);
  }

  /**
   * Estado AWAITING_ACTIVE_PRINCIPLE - Aguardando Princípio Ativo (apenas para Defensivos)
   */
  private async handleAwaitingActivePrinciple(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const activeIngredient = message.trim();

    if (activeIngredient.length < 2) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Por favor, informe o Princípio Ativo (mínimo 2 caracteres).\n\nEx: Glifosato, Imidacloprido, Azoxistrobina, Lambda-cialotrina',
      });
      return;
    }

    context.activeIngredient = activeIngredient;

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.ASK_QUANTITY(context.product!, context.category),
    });

    await this.setState(producerId, 'producer', 'AWAITING_QUANTITY', context);
  }

  /**
   * Estado AWAITING_FREIGHT - Aguardando escolha do tipo de frete (CIF/FOB)
   */
  private async handleAwaitingFreight(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.toLowerCase().trim();

    let freight: 'CIF' | 'FOB';

    if (normalized === '1' || normalized === 'cif' || normalized.includes('entrega') || normalized.includes('incluso')) {
      freight = 'CIF';
    } else if (normalized === '2' || normalized === 'fob' || normalized.includes('retira') || normalized.includes('busca')) {
      freight = 'FOB';
    } else {
      await whatsappService.sendMessage({
        to: phone,
        body: `Não entendi "${message}".\n\nDigite *1* para CIF (entrega inclusa) ou *2* para FOB (retira no fornecedor).`,
      });
      return;
    }

    context.freight = freight;

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.ASK_PAYMENT_TERMS(freight),
    });
    await this.setState(producerId, 'producer', 'AWAITING_PAYMENT_TERMS', context);
  }

  /**
   * Estado AWAITING_PAYMENT_TERMS - Aguardando forma de pagamento desejada pelo produtor
   */
  private async handleAwaitingPaymentTerms(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const terms = message.trim();

    if (terms.length < 2) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Por favor, informe a forma de pagamento. Exemplo: *à vista*, *30 dias*, *30/60/90 dias*.',
      });
      return;
    }

    context.quotePaymentTerms = terms;

    await this.askOrApplySupplierScope(producerId, phone, context);
  }

  /**
   * Estado AWAITING_PRODUCT - Aguardando nome do produto
   * Usa NLU para extrair múltiplas entidades de uma vez
   */
  private async handleAwaitingProduct(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    // Usar NLU para extrair todas as entidades possíveis
    const extracted = await nluExtractorService.extractEntities(
      message,
      'AWAITING_PRODUCT',
      context
    );

    // Merge dos dados extraídos (NLU pode ter falhado, então usar fallback)
    if (Object.keys(extracted).length > 0) {
      Object.assign(context, extracted);
    } else {
      // Fallback: comportamento antigo (pegar apenas o produto)
      const product = message.trim();
      if (product.length >= 2) {
        context.product = product;
      }
    }

    // Validação mínima
    if (!context.product || context.product.length < 2) {
      // Tentar sugerir correções usando OpenAI
      const suggestions = await openaiService.suggestCorrections(
        message,
        'product',
        'Insumos agrícolas comuns'
      );

      if (suggestions.length > 0) {
        await whatsappService.sendMessage({
          to: phone,
          body: Messages.ERROR_WITH_SUGGESTIONS(message, suggestions),
        });
      } else {
        // Fallback se OpenAI falhar
        await whatsappService.sendMessage({
          to: phone,
          body: 'Por favor, informe um produto válido (mínimo 2 caracteres).\n\nExemplos: ração, soja, milho, fertilizante',
        });
      }
      return;
    }

    // Se categoria é defensivo, solicitar Princípio Ativo antes de continuar
    if (this.isDefensivo(context.category) && !context.activeIngredient) {
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.ASK_ACTIVE_PRINCIPLE(context.product!),
      });
      await this.setState(producerId, 'producer', 'AWAITING_ACTIVE_PRINCIPLE', context);
      return;
    }

    // Determinar próximo estado baseado no que foi extraído
    const nextState = nluExtractorService.determineNextState(context);

    let askMessage = '';

    switch (nextState) {
      case 'AWAITING_QUANTITY':
        askMessage = Messages.ASK_QUANTITY(context.product, context.category);
        break;
      case 'AWAITING_REGION':
        askMessage = Messages.ASK_REGION();
        break;
      case 'AWAITING_DEADLINE':
        askMessage = Messages.ASK_DEADLINE();
        break;
      case 'AWAITING_FREIGHT':
        askMessage = Messages.ASK_FREIGHT;
        break;
      default:
        // Se tudo foi extraído (AWAITING_SUPPLIER_SCOPE), ir para confirmação
        await this.showQuoteConfirmation(producerId, phone, context);
        return;
    }

    await whatsappService.sendMessage({
      to: phone,
      body: askMessage,
    });

    await this.setState(producerId, 'producer', nextState, context);
  }

  /**
   * Estado AWAITING_QUANTITY - Aguardando quantidade + unidade
   */
  private async handleAwaitingQuantity(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    // Extrair quantidade e unidade (ex: "100 sacos", "500 kg", "10 bag", "50 ton", "3000 lts")
    const match = message.match(
      /(\d+(?:[.,]\d+)?)\s*(big\s*bags?|bags?|sacos?|sacas?|kg|kgs|quilos?|litros?|lts?|toneladas?|ton?|l|unidades?|un|sc|caixas?|cx|km|kms|hectares?|ha)?/i,
    );

    if (!match) {
      const suggestions = await openaiService.suggestCorrections(
        message,
        'quantity',
        'Formato: número + unidade (sacas, kg, litros)'
      );

      if (suggestions.length > 0) {
        await whatsappService.sendMessage({
          to: phone,
          body: Messages.ERROR_WITH_SUGGESTIONS(message, suggestions),
        });
      } else {
        await whatsappService.sendMessage({
          to: phone,
          body: 'Por favor, informe a quantidade no formato: *100 sacas* ou *500 kg*',
        });
      }
      return;
    }

    const quantityFloat = parseFloat(match[1].replace(',', '.'));
    const unit = normalizeUnit(match[2]);

    // Acumular item na lista
    if (!context.items) context.items = [];
    context.items.push({
      product: context.product!,
      quantity: quantityFloat,
      unit,
      activeIngredient: context.activeIngredient,
    });

    // Limpar campos temporários do item
    context.quantity = String(quantityFloat);
    context.unit = unit;
    context.activeIngredient = undefined;

    // Verificar limite de itens das configurações do tenant (CO-0-04)
    const tenantId = await resolveTenantIdFromProducer(producerId);
    const settings = await TenantSettingsService.getOrCreate(tenantId);
    const itemsList = context.items
      .map((it, i) => `${i + 1}. ${it.product} — ${it.quantity} ${it.unit}`)
      .join('\n');

    if (context.items.length >= settings.maxItemsPerQuote) {
      // Limite atingido — avança direto para região
      await whatsappService.sendMessage({
        to: phone,
        body: `Limite de ${settings.maxItemsPerQuote} itens atingido.\n\n${itemsList}`,
      });
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.ASK_REGION(),
      });
      await this.setState(producerId, 'producer', 'AWAITING_REGION', context);
      return;
    }

    // Perguntar se quer adicionar mais itens (mesma categoria)
    await whatsappService.sendMessage({
      to: phone,
      body: Messages.ASK_MORE_ITEMS(context.items),
    });

    await this.setState(producerId, 'producer', 'AWAITING_MORE_ITEMS', context);
  }

  /**
   * Estado AWAITING_MORE_ITEMS - Pergunta se quer adicionar mais itens
   */
  private async handleAwaitingMoreItems(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.toLowerCase().trim();

    if (normalized === '1' || normalized.includes('sim') || normalized.includes('adicionar')) {
      // Limpar produto/quantidade temporários e voltar para AWAITING_PRODUCT
      context.product = undefined;
      context.quantity = undefined;
      context.unit = undefined;
      context.activeIngredient = undefined;

      const itemCount = context.items?.length || 0;

      await whatsappService.sendMessage({
        to: phone,
        body: Messages.ASK_PRODUCT(context.category || '') + `\n_(item ${itemCount + 1})_`,
      });

      await this.setState(producerId, 'producer', 'AWAITING_PRODUCT', context);
      return;
    }

    if (normalized === '2' || normalized.includes('não') || normalized.includes('nao') || normalized.includes('continuar')) {
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.ASK_REGION(),
      });

      await this.setState(producerId, 'producer', 'AWAITING_REGION', context);
      return;
    }

    await whatsappService.sendMessage({
      to: phone,
      body: 'Digite *1* para adicionar mais um produto ou *2* para continuar.',
    });
  }

  /**
   * Estado AWAITING_REGION - Aguardando região de entrega
   */
  private async handleAwaitingRegion(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const region = message.trim();

    if (region.length < 2) {
      // Tentar sugerir correções
      const suggestions = await openaiService.suggestCorrections(
        message,
        'region',
        'Cidades ou regiões do Brasil'
      );

      if (suggestions.length > 0) {
        await whatsappService.sendMessage({
          to: phone,
          body: Messages.ERROR_WITH_SUGGESTIONS(message, suggestions),
        });
      } else {
        await whatsappService.sendMessage({
          to: phone,
          body: 'Por favor, informe uma região válida (mínimo 2 caracteres).\n\nExemplos: Goiânia, Rio Verde, Jataí',
        });
      }
      return;
    }

    context.region = region;

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.ASK_DEADLINE(),
    });

    await this.setState(producerId, 'producer', 'AWAITING_DEADLINE', context);
  }

  /**
   * Estado AWAITING_DEADLINE - Aguardando prazo de entrega
   */
  private async handleAwaitingDeadline(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const deadline = parseDeadline(message);

    if (!deadline) {
      // Tentar sugerir correções
      const suggestions = await openaiService.suggestCorrections(
        message,
        'deadline',
        'Formato: amanhã, em X dias, ou data DD/MM/AAAA'
      );

      if (suggestions.length > 0) {
        await whatsappService.sendMessage({
          to: phone,
          body: Messages.ERROR_WITH_SUGGESTIONS(message, suggestions),
        });
      } else {
        await whatsappService.sendMessage({
          to: phone,
          body: 'Prazo inválido. Use: *amanhã*, *em 5 dias* ou *30/03/2024*',
        });
      }
      return;
    }

    context.deadline = deadline.toISOString();

    // Pular observações (agora opcional) e ir direto para escopo de fornecedores
    // Se usuário quiser adicionar observações, pode digitar antes de confirmar
    await whatsappService.sendMessage({
      to: phone,
      body: Messages.ASK_OBSERVATIONS_OPTIONAL(),
    });

    await this.setState(producerId, 'producer', 'AWAITING_OBSERVATIONS', context);
  }

  /**
   * Estado AWAITING_OBSERVATIONS - Aguardando observações (agora opcional)
   */
  private async handleAwaitingObservations(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.toLowerCase().trim();

    // Validação tolerante para "continuar sem observações"
    const skipObservations =
      normalized === 'continuar' ||
      normalized === 'continuar sem observações' ||
      normalized === 'continuar sem observacoes' ||
      normalized === 'não' ||
      normalized === 'nao' ||
      normalized === 'sem observações' ||
      normalized === 'sem observacoes' ||
      normalized === '0' ||
      normalized === 'pular' ||
      normalized === 'sem';

    if (!skipObservations) {
      // Usuário digitou algo, considerar como observação
      context.observations = message.trim();
    }

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.ASK_FREIGHT,
    });

    await this.setState(producerId, 'producer', 'AWAITING_FREIGHT', context);
  }

  /**
   * Estado AWAITING_SUPPLIER_SCOPE - Aguardando escolha de escopo de fornecedores
   */
  private async handleAwaitingSupplierScope(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    // ── Guard: rede desabilitada ────────────────────────────────────
    // Se a flag estiver off, o produtor nunca deveria chegar aqui.
    // Pode acontecer com estados presos no banco (pré-flag).
    // Forçar MINE e continuar — sem perguntar nada.
    if (!env.ENABLE_NETWORK_SUPPLIERS) {
      context.supplierScope = 'MINE';
      await this.showSupplierListForSelection(producerId, phone, context);
      return;
    }
    // ────────────────────────────────────────────────────────────────

    const normalized = message.toLowerCase().trim();

    // Validação tolerante - aceita variações
    let scope: 'MINE' | 'NETWORK' | 'ALL';

    if (normalized === '1' || normalized.includes('meus') || normalized.includes('apenas meus')) {
      scope = 'MINE';
    } else if (normalized === '2' || normalized.includes('rede') || normalized.includes('cotaobra')) {
      scope = 'NETWORK';
    } else if (normalized === '3' || normalized.includes('todos') || normalized.includes('meus + rede')) {
      scope = 'ALL';
    } else {
      // Mensagem de erro condicional à flag — defesa em profundidade.
      // O guard acima já evita esse caminho com flag off, mas garantir
      // aqui blinda contra futuras alterações no roteamento.
      const errorMsg = env.ENABLE_NETWORK_SUPPLIERS
        ? `Não entendi "${message}".\n\nPor favor, responda com:\n1 — Meus fornecedores\n2 — Rede CotaObra\n3 — Todos`
        : `Não entendi "${message}".\n\nPor favor, responda com:\n1 — Meus fornecedores`;
      await whatsappService.sendMessage({
        to: phone,
        body: errorMsg,
      });
      return;
    }

    context.supplierScope = scope;

    // Se escolheu "Apenas seus fornecedores" (MINE), mostrar lista para seleção
    if (scope === 'MINE') {
      await this.showSupplierListForSelection(producerId, phone, context);
    } else {
      // Para NETWORK ou ALL, ir direto para confirmação
      await this.showQuoteConfirmation(producerId, phone, context);
    }
  }

  /**
   * Mostra lista de fornecedores para seleção
   */
  private async showSupplierListForSelection(
    producerId: string,
    phone: string,
    context: ConversationContext
  ): Promise<void> {
    // CO-0-05: fornecedores do tenant (não mais via ProducerSupplier).
    const producerForList = await prisma.producer.findUniqueOrThrow({
      where: { id: producerId },
      select: { tenantId: true },
    });
    const suppliers = await prisma.supplier.findMany({
      where: {
        isNetworkSupplier: false,
        tenantId: producerForList.tenantId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        categories: true,
        rating: true,
        totalProposals: true,
        acceptedProposals: true,
        proposals: {
          where: {
            quote: {
              producerId: producerId,
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            price: true,
            createdAt: true,
          },
        },
      },
      orderBy: [
        { rating: 'desc' }, // Ordenar por rating (melhores primeiro)
        { name: 'asc' },
      ],
    });

    // Filtrar por categoria da cotação (case-insensitive)
    const filteredSuppliers = context.category
      ? suppliers.filter((s: any) =>
          s.categories.some(
            (cat: string) => cat.toLowerCase() === context.category!.toLowerCase()
          )
        )
      : suppliers;

    const suppliersToUse = filteredSuppliers.length > 0 ? filteredSuppliers : suppliers;
    const categoryWarning =
      context.category && filteredSuppliers.length === 0
        ? `Nenhum fornecedor cadastrado para a categoria *${context.category}*. Mostrando todos.\n\n`
        : '';

    // Lista vazia (FF-BE-007): em vez de cair na rede, oferecer cadastro inline.
    if (suppliersToUse.length === 0) {
      const categoryLabel = context.category ? ` — ${context.category}` : '';
      await whatsappService.sendMessage({
        to: phone,
        body:
          `*Seus Fornecedores*${categoryLabel} (0 encontrados)\n\n` +
          `Você ainda não tem fornecedores cadastrados${context.category ? ' nesta categoria' : ''}.\n\n` +
          `1 — Cadastrar fornecedor`,
      });

      // availableSuppliers = [] sinaliza ao handler que estamos no caminho "lista vazia",
      // onde a opção "1" significa cadastrar (e não "enviar para todos").
      context.availableSuppliers = [];
      context.excludedSuppliers = [];
      await this.setState(producerId, 'producer', 'AWAITING_SUPPLIER_SELECTION', context);
      return;
    }

    // Salvar lista de fornecedores disponíveis no contexto
    context.availableSuppliers = suppliersToUse.map((s: any) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
    }));
    context.excludedSuppliers = [];

    // Montar mensagem com lista numerada e informações
    const categoryLabel = context.category ? ` — ${context.category}` : '';
    let message = `${categoryWarning}*Seus Fornecedores*${categoryLabel} (${suppliersToUse.length} encontrado${suppliersToUse.length !== 1 ? 's' : ''})\n\n`;

    suppliersToUse.forEach((supplier: any, index: number) => {
      message += `${index + 1}. ${supplier.name}\n`;
    });

    message += '\nEnviar para todos ou escolher?\n\n';
    message += '1 — Enviar para todos\n';
    message += '2 — Escolher fornecedores\n';
    message += '3 — Cadastrar novo fornecedor';

    await whatsappService.sendMessage({
      to: phone,
      body: message,
    });

    await this.setState(producerId, 'producer', 'AWAITING_SUPPLIER_SELECTION', context);
  }

  /**
   * Estado AWAITING_SUPPLIER_SELECTION - Aguardando seleção inicial dos fornecedores
   */
  private async handleAwaitingSupplierSelection(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.toLowerCase().trim();
    const availableSuppliers = context.availableSuppliers || [];
    const isEmptyList = availableSuppliers.length === 0;

    // FF-BE-007 — caminho "lista vazia": só existe a opção 1 (cadastrar).
    if (isEmptyList) {
      if (normalized === '1' || normalized.includes('cadastr')) {
        await this.startInlineSupplierRegistration(producerId, phone, context);
        return;
      }
      await whatsappService.sendMessage({
        to: phone,
        body: `Não entendi "${message}".\n\nPor favor, responda com:\n1 — Cadastrar fornecedor`,
      });
      return;
    }

    // FF-BE-007 — caminho lista popular: opção 3 = cadastrar novo
    if (normalized === '3' || normalized.includes('cadastrar novo') || normalized.includes('novo fornecedor')) {
      await this.startInlineSupplierRegistration(producerId, phone, context);
      return;
    }

    // Opção 1: Enviar para todos
    if (normalized === '1' || normalized.includes('todos') || normalized.includes('enviar para todos')) {
      // Não excluir ninguém, ir direto para confirmação
      await this.showSupplierListForConfirmation(producerId, phone, context);
      return;
    }

    // Opção 2: Escolher fornecedores
    if (normalized === '2' || normalized.includes('escolher')) {
      const supplierList = availableSuppliers
        .map((s, i) => `${i + 1}. ${s.name}`)
        .join('\n');
      await whatsappService.sendMessage({
        to: phone,
        body: `Fornecedores selecionados:\n${supplierList}\n\nDigite os *números* dos fornecedores que deseja *REMOVER* (separados por vírgula):\n\nExemplo: 1,3\n\nOu digite *voltar* para enviar para todos.`,
      });
      // Continuar no mesmo estado aguardando os números
      return;
    }

    // Se digitou números ou "voltar"
    if (normalized === 'voltar' || normalized === 'não' || normalized === 'nao') {
      await this.showSupplierListForConfirmation(producerId, phone, context);
      return;
    }

    // Processar números para exclusão
    const numbers = message
      .split(',')
      .map((n) => parseInt(n.trim()))
      .filter((n) => !isNaN(n));

    if (numbers.length === 0) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Por favor, digite os números separados por vírgula ou *não* para manter todos.',
      });
      return;
    }

    // Validar números
    const invalidNumbers = numbers.filter((n) => n < 1 || n > availableSuppliers.length);

    if (invalidNumbers.length > 0) {
      await whatsappService.sendMessage({
        to: phone,
        body: `Números inválidos: ${invalidNumbers.join(', ')}. Use números de 1 a ${availableSuppliers.length}.`,
      });
      return;
    }

    // Marcar fornecedores como excluídos
    context.excludedSuppliers = numbers.map((n) => availableSuppliers[n - 1].id);

    await this.showSupplierListForConfirmation(producerId, phone, context);
  }

  /**
   * Mostra lista final de fornecedores e pede confirmação
   */
  private async showSupplierListForConfirmation(
    producerId: string,
    phone: string,
    context: ConversationContext
  ): Promise<void> {
    const availableSuppliers = context.availableSuppliers || [];
    const excludedIds = context.excludedSuppliers || [];

    // Filtrar fornecedores selecionados (não excluídos)
    const selectedSuppliers = availableSuppliers.filter((s) => !excludedIds.includes(s.id));

    if (selectedSuppliers.length === 0) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Você excluiu todos os fornecedores. Vamos recomeçar a seleção.',
      });
      await this.showSupplierListForSelection(producerId, phone, context);
      return;
    }

    context.selectedSuppliers = selectedSuppliers;

    // Montar mensagem de confirmação
    let message = '*Lista Final de Fornecedores*\n\nA cotação será enviada para:\n\n';

    selectedSuppliers.forEach((supplier, index) => {
      message += `${index + 1}. ${supplier.name}\n`;
    });

    message += `\n*Total: ${selectedSuppliers.length} fornecedor(es)*\n\nDeseja continuar com esta lista?\n\n`;
    message += 'Digite *sim* para confirmar\n';
    message += 'Digite *refazer* para ajustar a seleção';

    await whatsappService.sendMessage({
      to: phone,
      body: message,
    });

    await this.setState(producerId, 'producer', 'AWAITING_SUPPLIER_EXCLUSION', context);
  }

  /**
   * Estado AWAITING_SUPPLIER_EXCLUSION - Aguardando confirmação de mais exclusões
   */
  private async handleAwaitingSupplierExclusion(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.toLowerCase().trim();

    if (normalized === 'sim') {
      // Ir para confirmação final da cotação
      await this.showQuoteConfirmation(producerId, phone, context);
      return;
    }

    if (normalized === 'refazer') {
      // Resetar exclusões e mostrar lista novamente
      context.excludedSuppliers = [];
      await this.showSupplierListForSelection(producerId, phone, context);
      return;
    }

    await whatsappService.sendMessage({
      to: phone,
      body: 'Digite *sim* para confirmar ou *refazer* para ajustar.',
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // FF-BE-007 — Cadastro inline de fornecedor durante cotação
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Inicia o cadastro inline de fornecedor a partir de AWAITING_SUPPLIER_SELECTION.
   * Compartilhado pelos caminhos "lista vazia" e "lista populada (opção 3)".
   */
  private async startInlineSupplierRegistration(
    producerId: string,
    phone: string,
    context: ConversationContext,
  ): Promise<void> {
    await whatsappService.sendMessage({
      to: phone,
      body: 'Nome do fornecedor:',
    });
    await this.setState(producerId, 'producer', 'AWAITING_NEW_SUPPLIER_NAME', context);
  }

  /**
   * Estado AWAITING_NEW_SUPPLIER_NAME — captura o nome e avança para o telefone.
   */
  private async handleAwaitingNewSupplierName(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext,
  ): Promise<void> {
    const name = message.trim();
    if (!name || name.length < 2) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Por favor, informe um nome válido para o fornecedor:',
      });
      return; // mantém o estado
    }

    context.newSupplierName = name;

    await whatsappService.sendMessage({
      to: phone,
      body: `Telefone de ${name} (com DDD, ex: 64999990000):`,
    });
    await this.setState(producerId, 'producer', 'AWAITING_NEW_SUPPLIER_PHONE', context);
  }

  /**
   * Estado AWAITING_NEW_SUPPLIER_PHONE — valida telefone, cria/vincula fornecedor
   * (com tratamento de duplicidade) e retorna à lista atualizada.
   */
  private async handleAwaitingNewSupplierPhone(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext,
  ): Promise<void> {
    // Normalizar: remover espaços, traços, parênteses, manter apenas dígitos e +
    const rawPhone = message.replace(/[^\d+]/g, '').trim();
    const isValid = /^(\+55)?\d{10,11}$/.test(rawPhone);

    if (!isValid) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Número inválido. Informe o telefone com DDD (ex: 64999990000):',
      });
      return; // mantém o estado
    }

    const supplierName = context.newSupplierName;
    if (!supplierName) {
      // Salvaguarda: contexto perdeu o nome — recomeça o cadastro
      await this.setState(producerId, 'producer', 'AWAITING_NEW_SUPPLIER_NAME', context);
      await whatsappService.sendMessage({
        to: phone,
        body: 'Vamos retomar — informe o nome do fornecedor:',
      });
      return;
    }

    const producer = await prisma.producer.findUniqueOrThrow({
      where: { id: producerId },
      select: { tenantId: true, region: true },
    });

    // Tratamento de duplicidade (consistente com handleAwaitingSupplierContact):
    // Se o fornecedor já existe no tenant, apenas vincula ao produtor.
    const existing = await prisma.supplier.findFirst({
      where: { phone: rawPhone, tenantId: producer.tenantId },
    });

    let supplierName_persisted = supplierName;
    let alreadyExisted = false;

    if (existing) {
      alreadyExisted = true;
      supplierName_persisted = existing.name;

      // CO-0-05: fornecedor já no tenant → "vínculo" implícito via Supplier.tenantId.
      // Garante apenas que a categoria do contexto (vinda da cotação) esteja
      // como VALUE canônico nas categorias do fornecedor existente.
      const ctxCategory = resolveCategoryValue(context.category);
      if (ctxCategory && !existing.categories.includes(ctxCategory)) {
        await prisma.supplier.update({
          where: { id: existing.id },
          data: { categories: { push: ctxCategory } },
        });
      }
    } else {
      // FF-BE-024: cadastro novo grava VALUE canônico (não label/lowercase livre)
      // CO-0-05: criar Supplier no tenant é suficiente — sem tabela join.
      const ctxCategory = resolveCategoryValue(context.category);
      await prisma.supplier.create({
        data: {
          name: supplierName,
          phone: rawPhone,
          tenantId: producer.tenantId,
          isNetworkSupplier: false,
          categories: ctxCategory ? [ctxCategory] : [],
          regions: producer.region ? [producer.region] : [],
        },
      });
    }

    // Limpar campo temporário antes de persistir o estado novamente
    delete context.newSupplierName;

    await whatsappService.sendMessage({
      to: phone,
      body: alreadyExisted
        ? `*${supplierName_persisted}* já estava cadastrado e foi adicionado à sua lista. ✅`
        : `Fornecedor *${supplierName_persisted}* cadastrado com sucesso! ✅`,
    });

    logWithContext('info', 'Inline supplier registration completed', {
      producerId,
      tenantId: producer.tenantId,
      alreadyExisted,
    });

    // Volta para a lista atualizada (showSupplierListForSelection refaz a query
    // e seta novamente AWAITING_SUPPLIER_SELECTION)
    await this.showSupplierListForSelection(producerId, phone, context);
  }

  /**
   * Mostra resumo da cotação e pede confirmação final
   */
  private async showQuoteConfirmation(
    producerId: string,
    phone: string,
    context: ConversationContext
  ): Promise<void> {
    let scopeLabel: string;

    switch (context.supplierScope) {
      case 'MINE':
        const count = context.selectedSuppliers?.length || 0;
        scopeLabel = `Seus fornecedores selecionados (${count})`;
        break;
      case 'NETWORK':
        scopeLabel = 'Rede CotaObra';
        break;
      case 'ALL':
        scopeLabel = 'Todos (seus + rede)';
        break;
      default:
        scopeLabel = 'Não definido';
    }

    const items = context.items && context.items.length > 0
      ? context.items
      : [{ product: context.product!, quantity: parseFloat(context.quantity || '1'), unit: context.unit || 'unidades' }];

    const summary = {
      category: context.category,
      items,
      region: context.region!,
      deadline: new Date(context.deadline!).toLocaleDateString('pt-BR'),
      observations: context.observations,
      freight: context.freight,
      quotePaymentTerms: context.quotePaymentTerms,
      scope: scopeLabel,
    };

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.CONFIRM_QUOTE(summary),
    });

    await this.setState(producerId, 'producer', 'AWAITING_SUPPLIER_CONFIRMATION', context);
  }

  /**
   * Estado AWAITING_SUPPLIER_CONFIRMATION - Confirmação final antes de enviar
   */
  private async handleAwaitingSupplierConfirmation(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.toLowerCase().trim();

    // Validação tolerante
    if (normalized === 'sim' || normalized === 's' || normalized.includes('enviar') || normalized.includes('confirmar')) {
      await this.createAndDispatchQuote(producerId, phone, context);
      return;
    }

    if (normalized === 'corrigir' || normalized === 'não' || normalized === 'nao' || normalized.includes('editar')) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Vamos recomeçar. Digite *nova cotação* quando estiver pronto.',
      });
      await this.resetState(producerId, 'producer');
      return;
    }

    await whatsappService.sendMessage({
      to: phone,
      body: 'Digite *sim* para confirmar ou *corrigir* para refazer.',
    });
  }

  /**
   * Cria cotação e dispara para fornecedores
   */
  private async createAndDispatchQuote(
    producerId: string,
    phone: string,
    context: ConversationContext
  ): Promise<void> {
    const producer = await prisma.producer.findUniqueOrThrow({
      where: { id: producerId },
      select: { tenantId: true },
    });

    // CO-0-04: settings agora são por tenant; reutiliza o tenantId já carregado acima.
    const settings = await TenantSettingsService.getOrCreate(producer.tenantId);
    const quoteExpiryMs = settings.quoteExpiryHours * 60 * 60 * 1000;

    // Normalizar itens: se não há context.items (fluxo legado), criar a partir dos campos soltos
    const items = context.items && context.items.length > 0
      ? context.items
      : [{
          product: context.product!,
          quantity: parseFloat(context.quantity || '1'),
          unit: context.unit || 'unidades',
        }];

    // Criar cotação + QuoteItems em uma única transaction
    const quote = await prisma.$transaction(async (tx) => {
      const newQuote = await tx.quote.create({
        data: {
          producerId,
          tenantId: producer.tenantId,
          category: context.category,
          // Campos legados — preencher com o primeiro item para compatibilidade
          product: items[0].product,
          quantity: String(items[0].quantity),
          unit: items[0].unit,
          region: context.region!,
          deadline: new Date(context.deadline!),
          observations: context.observations,
          freight: context.freight,
          paymentTerms: context.quotePaymentTerms,
          supplierScope: context.supplierScope!,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + quoteExpiryMs),
        },
      });

      await tx.quoteItem.createMany({
        data: items.map((item) => ({
          quoteId: newQuote.id,
          product: item.product,
          quantity: item.quantity,
          unit: item.unit,
          activeIngredient: item.activeIngredient,
        })),
      });

      return newQuote;
    });

    // Incrementar contador de cotações usadas (1 cota independente do nº de itens)
    await prisma.subscription.updateMany({
      where: { producerId },
      data: { quotesUsed: { increment: 1 } },
    });

    // Disparar para fornecedores
    let suppliersCount: number;
    if (context.supplierScope === 'MINE' && context.selectedSuppliers) {
      const selectedIds = context.selectedSuppliers.map((s) => s.id);
      suppliersCount = await dispatchQuoteJob(quote.id, selectedIds);
    } else {
      suppliersCount = await dispatchQuoteJob(quote.id);
    }

    // FF-BE-009 — eventos do funil
    await FSMEventService.track({
      producerId,
      eventType: 'quote_dispatched',
      payload: {
        quoteId: quote.id,
        supplierCount: suppliersCount,
        category: context.category,
        itemsCount: items.length,
        scope: context.supplierScope,
      },
    });

    // Salvar preferências para próxima cotação (array de itens)
    await prisma.producer.update({
      where: { id: producerId },
      data: {
        lastQuotePreferences: {
          category: context.category,
          items: items as any,
          region: context.region,
          deadline: context.deadline,
          freight: context.freight,
          paymentTerms: context.quotePaymentTerms,
        } as any,
      },
    });

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.QUOTE_DISPATCHED(suppliersCount),
    });

    // FF-BE-019 — Nudge pós-cotação sequencial. Só envia quando o
    // produtor não usou smart fill (didático). Suprimido também
    // quando o kill-switch está off.
    if (env.SMART_FILL_ENABLED && !(context as any)._smartFillUsed) {
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.SMART_FILL_NUDGE(),
      });
    }

    context.quoteId = quote.id;
    await this.setState(producerId, 'producer', 'QUOTE_ACTIVE', context);
  }

  /**
   * Estado AWAITING_CONFIRMATION - Aguardando confirmação da cotação
   */
  private async handleAwaitingConfirmation(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.toLowerCase().trim();

    if (normalized === 'sim') {
      // Validar contexto antes de criar cotação
      const validationError = FSMEngine.validateContext('AWAITING_CONFIRMATION', context as Record<string, unknown>);
      if (validationError) {
        await whatsappService.sendMessage({ to: phone, body: validationError });
        return;
      }
      await this.createAndDispatchQuote(producerId, phone, context);
      return;
    }

    if (normalized === 'corrigir') {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Vamos recomeçar. Digite *nova cotação* quando estiver pronto.',
      });
      await this.resetState(producerId, 'producer');
      return;
    }

    await whatsappService.sendMessage({
      to: phone,
      body: 'Digite *sim* para confirmar ou *corrigir* para refazer.',
    });
  }

  /**
   * Estado AWAITING_CHOICE - Aguardando escolha do fornecedor
   */
  private async handleAwaitingChoice(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.toLowerCase().trim();

    if (normalized === 'cancelar') {
      await this.handleCancel(producerId, phone);
      return;
    }

    // Verificar se é um número válido
    const choice = parseInt(message);
    if (isNaN(choice) || choice < 1) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Opção inválida. Digite o *número* do fornecedor ou *cancelar*.',
      });
      return;
    }

    // Buscar propostas da cotação
    const proposals = await prisma.proposal.findMany({
      where: { quoteId: context.quoteId! },
      include: { supplier: true },
      orderBy: [{ price: 'asc' }, { deliveryDays: 'asc' }],
    });

    const selectedProposal = proposals[choice - 1];

    if (!selectedProposal) {
      await whatsappService.sendMessage({
        to: phone,
        body: `Fornecedor não encontrado. Digite um número de *1* a *${proposals.length}*.`,
      });
      return;
    }

    // Fechar cotação
    const quoteRecord = await prisma.quote.update({
      where: { id: context.quoteId! },
      data: {
        status: 'CLOSED',
        closedSupplierId: selectedProposal.supplierId,
      },
      select: { id: true, createdAt: true },
    });

    // FF-BE-009 — quote_completed com duração total IDLE → CLOSED
    await FSMEventService.track({
      producerId,
      eventType: 'quote_completed',
      payload: {
        quoteId: quoteRecord.id,
        supplierId: selectedProposal.supplierId,
        durationMs: Date.now() - new Date(quoteRecord.createdAt).getTime(),
      },
    });

    // Notificar todos os fornecedores sobre o resultado (assíncrono)
    supplierNotificationService.notifyQuoteResult(context.quoteId!).catch((err) => {
      logger.error('Failed to notify quote result', { error: err, quoteId: context.quoteId });
    });

    // FEAT-PDF-001 — Enfileira geração + envio do PDF de resultado.
    // Idempotente, async, NÃO bloqueia o fechamento (AC-06).
    const producer = await prisma.producer.findUnique({
      where: { id: producerId },
      select: { tenantId: true, phone: true },
    });
    if (producer?.tenantId) {
      enqueueQuotePdfJob({
        quoteId: context.quoteId!,
        tenantId: producer.tenantId,
        producerId,
        producerPhone: producer.phone,
      }).catch((err) =>
        logger.error('PDF enqueue failed (cotação continua fechada)', {
          quoteId: context.quoteId,
          error: (err as Error).message,
        }),
      );
    }

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.QUOTE_CLOSED(selectedProposal.supplier.name),
    });

    await this.resetState(producerId, 'producer');
  }

  /**
   * Cancela a ação atual e volta para IDLE
   */
  private async handleCancel(producerId: string, phone: string): Promise<void> {
    // Cancelar tokens de formulário pendentes para este produtor
    await QuoteTokenService.cancelByProducer(producerId);

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.QUOTE_CANCELLED,
    });

    await this.resetState(producerId, 'producer');
  }

  /**
   * Gatilho global de consulta de status. Aplica rate limit, valida o estado
   * atual (não interrompe fluxos críticos) e delega para o handler apropriado.
   */
  private async handleStatusCheckTrigger(
    producerId: string,
    phone: string,
    tenantId: string,
    currentState: ProducerState,
  ): Promise<void> {
    // CA-07: bloquear consulta se há fluxo crítico em andamento
    if (!STATUS_CHECK_ALLOWED_STATES.has(currentState)) {
      const taskName = STATE_TO_TASK_NAME[currentState] ?? 'a tarefa atual';
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.STATUS_CHECK_BUSY(taskName),
      });
      return;
    }

    // CA-06: rate limit
    const rl = await StatusCheckRateLimit.check(producerId);
    if (!rl.allowed) {
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.STATUS_CHECK_RATE_LIMITED,
      });
      logger.info('Status check rate-limited', { producerId, count: rl.count });
      return;
    }

    await this.handleConsultQuoteStatus(producerId, phone, tenantId);
  }

  /**
   * Lê as cotações ativas do produtor e responde com o andamento agregado
   * (sem expor identidades ou valores antes da consolidação — CA-03).
   */
  private async handleConsultQuoteStatus(
    producerId: string,
    phone: string,
    tenantId: string,
  ): Promise<void> {
    const quotes = await QuoteStatusService.getActiveQuotes(producerId, tenantId);

    if (quotes.length === 0) {
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.NO_ACTIVE_QUOTE,
      });
      // Garante estado IDLE caso o produtor venha de outro estado terminal
      await this.setState(producerId, 'producer', 'IDLE', {});
      return;
    }

    if (quotes.length === 1) {
      const q = quotes[0];
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.QUOTE_STATUS_PROGRESS({
          summary: q.summary,
          respondedCount: q.respondedCount,
          totalSuppliers: q.totalSuppliers,
          expiresAt: q.expiresAt,
        }),
      });
      await this.trackStatusChecked(producerId, q);
      return;
    }

    // Múltiplas cotações: lista numerada e aguarda escolha
    await whatsappService.sendMessage({
      to: phone,
      body: Messages.MULTIPLE_ACTIVE_QUOTES(quotes),
    });

    await this.setState(producerId, 'producer', 'AWAITING_QUOTE_STATUS_CHOICE', {
      activeQuoteIds: quotes.map((q) => q.quoteId),
    });
  }

  /**
   * Estado AWAITING_QUOTE_STATUS_CHOICE - aguardando o produtor escolher
   * uma das cotações ativas listadas.
   */
  private async handleAwaitingQuoteStatusChoice(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext,
    tenantId: string,
  ): Promise<void> {
    const ids = (context.activeQuoteIds as string[] | undefined) ?? [];
    const choice = parseInt(message.trim(), 10);

    if (Number.isNaN(choice) || choice < 1 || choice > ids.length) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Responda com o número da cotação que quer acompanhar.',
      });
      return;
    }

    // Re-buscar para refletir propostas que possam ter chegado entre a listagem e a escolha
    const allQuotes = await QuoteStatusService.getActiveQuotes(producerId, tenantId);
    const targetId = ids[choice - 1];
    const target = allQuotes.find((q) => q.quoteId === targetId);

    if (!target) {
      await whatsappService.sendMessage({
        to: phone,
        body: 'Essa cotação não está mais ativa.',
      });
      await this.setState(producerId, 'producer', 'IDLE', {});
      return;
    }

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.QUOTE_STATUS_PROGRESS({
        summary: target.summary,
        respondedCount: target.respondedCount,
        totalSuppliers: target.totalSuppliers,
        expiresAt: target.expiresAt,
      }),
    });

    await this.trackStatusChecked(producerId, target);
    await this.setState(producerId, 'producer', 'IDLE', {});
  }

  /**
   * Telemetria: evento quote_status_checked com contadores e horas restantes.
   * Não bloqueia o fluxo em caso de falha.
   */
  private async trackStatusChecked(
    producerId: string,
    snapshot: { quoteId: string; respondedCount: number; totalSuppliers: number; expiresAt: Date },
  ): Promise<void> {
    try {
      const hoursUntilExpiry = Math.max(
        0,
        Math.round((snapshot.expiresAt.getTime() - Date.now()) / 3_600_000),
      );
      await metricsService.trackEvent({
        userId: producerId,
        userType: 'producer',
        eventType: 'message_sent',
        metadata: {
          event: 'quote_status_checked',
          quoteId: snapshot.quoteId,
          respondedCount: snapshot.respondedCount,
          totalSuppliers: snapshot.totalSuppliers,
          hoursUntilExpiry,
        },
      });
    } catch (error) {
      logger.warn('Failed to track quote_status_checked', { error, producerId });
    }
  }

  /**
   * Estado AWAITING_SUPPLIER_CONTACT - Aguardando contato do fornecedor
   */
  private async handleAwaitingSupplierContact(
    producerId: string,
    phone: string,
    message: string,
    _context: ConversationContext
  ): Promise<void> {
    // Verificar se é um vCard
    if (contactExtractorService.isVCard(message)) {
      await this.handleContactShared(producerId, phone, message);
      return;
    }

    // Tentar extrair dados do texto livre
    const contactData = await contactExtractorService.extractContactData(message);

    if (!contactData) {
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.SUPPLIER_ADD_ERROR,
      });
      return;
    }

    // Criar fornecedor
    await this.createSupplierFromContact(producerId, phone, contactData);
  }

  /**
   * Estado AWAITING_SUPPLIER_CATEGORY - Aguardando categoria do fornecedor recém-cadastrado.
   *
   * FF-BE-024: parse robusto da resposta do produtor — aceita números da lista,
   * texto canônico ("Defensivo"), variações ("Defensivos", "calcario") e mistura.
   * Sempre persiste o VALUE canônico (ex: "defensivo") em Supplier.categories
   * para o frontend marcar o checkbox corretamente.
   */
  private async handleAwaitingSupplierCategory(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext
  ): Promise<void> {
    const normalized = message.trim();
    const categoryLabels =
      (context.availableCategories as string[] | undefined) ??
      [...SUPPLIER_CATEGORY_LABELS];
    const supplierId = context.supplierId as string;
    const supplierName = context.supplierName as string;

    if (!supplierId) {
      await this.resetState(producerId, 'producer');
      return;
    }

    const parts = normalized.split(',').map((p) => p.trim()).filter(Boolean);
    const selectedValues: string[] = [];
    const rejected: string[] = [];

    for (const part of parts) {
      const num = parseInt(part);
      if (!isNaN(num) && num >= 1 && num <= categoryLabels.length) {
        // Número da lista → pega o label e resolve para o value canônico
        const value = resolveCategoryValue(categoryLabels[num - 1]);
        if (value) selectedValues.push(value);
      } else if (part.length >= 2) {
        // Texto livre → normaliza contra a lista canônica
        const value = resolveCategoryValue(part);
        if (value) selectedValues.push(value);
        else rejected.push(part);
      }
    }

    // Nenhuma categoria reconhecida → remostra a lista e mantém o estado
    if (selectedValues.length === 0) {
      const rejectedDisplay = rejected.join(', ') || message.trim();
      await whatsappService.sendMessage({
        to: phone,
        body:
          `Não reconheci "${rejectedDisplay}" como categoria válida.\n\n` +
          Messages.ASK_SUPPLIER_CATEGORY(supplierName, [
            ...SUPPLIER_CATEGORY_LABELS,
          ]),
      });
      // Estado permanece AWAITING_SUPPLIER_CATEGORY (aceita nova tentativa)
      return;
    }

    const uniqueValues = [...new Set(selectedValues)];

    await prisma.supplier.update({
      where: { id: supplierId },
      data: { categories: uniqueValues },
    });

    logWithContext('info', 'Supplier categories saved', {
      producerId,
      supplierId,
      categories: uniqueValues,
      rejected,
    });

    // Mensagem de sucesso mostra os LABELS (UX), mas o banco tem os values
    const labelsToShow = uniqueValues.map((v) => {
      const cat = SUPPLIER_CATEGORIES.find((c) => c.value === v);
      return cat?.label ?? v;
    });

    const partialWarning = rejected.length > 0
      ? `\n\n⚠️ Não reconheci: ${rejected.join(', ')}. Salvei só as válidas.`
      : '';

    await whatsappService.sendMessage({
      to: phone,
      body: Messages.SUPPLIER_CATEGORY_SAVED(supplierName, labelsToShow) + partialWarning,
    });

    await this.resetState(producerId, 'producer');
  }

  /**
   * Processa contato compartilhado (vCard ou estruturado)
   */
  private async handleContactShared(
    producerId: string,
    phone: string,
    message: string
  ): Promise<void> {
    logWithContext('info', 'Processing shared contact', { producerId });

    // Extrair dados do vCard
    const contactData = contactExtractorService.extractFromVCard(message);

    if (!contactData) {
      // Tentar extrair com OpenAI
      const extracted = await contactExtractorService.extractContactData(message);
      if (!extracted) {
        await whatsappService.sendMessage({
          to: phone,
          body: Messages.SUPPLIER_ADD_ERROR,
        });
        return;
      }
      await this.createSupplierFromContact(producerId, phone, extracted);
      return;
    }

    await this.createSupplierFromContact(producerId, phone, contactData);
  }

  /**
   * Cria fornecedor a partir dos dados do contato
   */
  private async createSupplierFromContact(
    producerId: string,
    phone: string,
    contactData: ContactData
  ): Promise<void> {
    try {
      // Buscar produtor para obter tenantId e região
      const producer = await prisma.producer.findUniqueOrThrow({
        where: { id: producerId },
      });

      // Verificar se fornecedor já existe no mesmo tenant
      const existingSupplier = await prisma.supplier.findFirst({
        where: { phone: contactData.phone, tenantId: producer.tenantId },
      });

      if (existingSupplier) {
        // CO-0-05: fornecedor já está no tenant → considerado já "vinculado".
        await whatsappService.sendMessage({
          to: phone,
          body: Messages.SUPPLIER_ALREADY_EXISTS(existingSupplier.name),
        });
        await this.resetState(producerId, 'producer');
        return;
      }

      // CO-0-05: criar fornecedor no tenant é suficiente — sem tabela join.
      const supplier = await prisma.supplier.create({
        data: {
          name: contactData.name,
          phone: contactData.phone,
          company: contactData.company,
          email: contactData.email,
          tenantId: producer.tenantId,
          regions: [producer.region], // região do produtor como padrão
          categories: [], // será preenchido posteriormente
          isNetworkSupplier: false, // fornecedor da construtora
        },
      });

      logWithContext('info', 'Supplier created from contact', {
        producerId,
        supplierId: supplier.id,
        supplierName: supplier.name,
      });

      // FF-BE-024: usa SEMPRE a lista canônica completa em vez de extrair
      // categorias do tenant (que misturava formatos antigos divergentes e
      // limitava as opções ao que outros fornecedores já tinham).
      const availableCategories = [...SUPPLIER_CATEGORY_LABELS];

      await whatsappService.sendMessage({
        to: phone,
        body: Messages.ASK_SUPPLIER_CATEGORY(supplier.name, availableCategories),
      });

      await this.setState(producerId, 'producer', 'AWAITING_SUPPLIER_CATEGORY', {
        supplierId: supplier.id,
        supplierName: supplier.name,
        availableCategories,
      });
    } catch (error) {
      logger.error('Failed to create supplier from contact', { error, producerId, contactData });
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.SUPPLIER_ADD_ERROR,
      });
    }
  }

  // ===================================
  // Smart Fill Confirmation Handlers
  // ===================================

  private async handleSmartFillConfirmation(
    producerId: string,
    phone: string,
    message: string,
    context: ConversationContext,
  ): Promise<void> {
    const choice = message.trim();

    // FF-BE-013 — Vocabulário regex curado pelo PO
    if (RE_CONFIRM.test(choice)) {
      const missingFields = this.getMissingFields(context);
      if (missingFields.length === 0) {
        await FSMEventService.track({
          producerId,
          eventType: 'smart_fill_confirmed',
          payload: { hasWarnings: false, unified: true },
        });

        // FF-BE-016 — Confirmação unificada: dispatch direto sem
        // passar pelas 3 confirmações intermediárias do fluxo
        // sequencial. selectedSuppliers já vem do handleIdle.
        if (
          context.supplierScope === 'MINE' &&
          context.selectedSuppliers &&
          context.selectedSuppliers.length > 0
        ) {
          await this.createAndDispatchQuote(producerId, phone, context);
          return;
        }

        // Fallback (caso o handleIdle não tenha pré-selecionado):
        // segue caminho tradicional. Não deveria acontecer com
        // smart fill v2, mas mantém retrocompatibilidade.
        await this.askOrApplySupplierScope(producerId, phone, context);
      } else {
        // Resta algum campo — pergunta agrupada (não cai mais em fluxo
        // sequencial campo a campo)
        await whatsappService.sendMessage({
          to: phone,
          body: SmartFillService.buildGroupedQuestion(missingFields),
        });
        // mantém estado AWAITING_SMART_CONFIRMATION — próxima resposta
        // tenta preencher os faltantes
      }
      return;
    }

    if (RE_CORRECT_ALL.test(choice)) {
      await FSMEventService.track({
        producerId,
        eventType: 'smart_fill_corrected',
        payload: { resetTo: 'AWAITING_CATEGORY' },
      });
      await whatsappService.sendMessage({
        to: phone,
        body: Messages.ASK_CATEGORY([...SUPPLIER_CATEGORY_LABELS]),
      });
      await this.setState(
        producerId,
        'producer',
        'AWAITING_CATEGORY',
        { items: [], availableCategories: [...SUPPLIER_CATEGORY_LABELS] },
        'AWAITING_SMART_CONFIRMATION',
      );
      return;
    }

    if (RE_VIEW_SUPPLIERS.test(choice)) {
      // FF-BE-016 trata; aqui só fazemos placeholder mostrando qty
      // de fornecedores via showSupplierListForSelection.
      await this.askOrApplySupplierScope(producerId, phone, context);
      return;
    }

    // FF-BE-017b — Edição inline AVANÇADA: "tira o Pedro", "top 3 maiores".
    // Roda antes do parser básico — comandos avançados são mais específicos.
    const advanced = parseAdvancedEdit(choice);
    if (advanced) {
      let result;
      if (advanced.kind === 'remove_supplier') {
        result = applyRemoveSupplier(context, advanced.targets);
      } else {
        result = await applyTopNSuppliers(context, advanced.n);
      }

      await FSMEventService.track({
        producerId,
        eventType: 'inline_edit_used',
        payload: {
          field: 'suppliers',
          kind: advanced.kind,
          rawInput: advanced.rawInput,
          removedCount: result.removed.length,
          notFoundCount: result.notFound.length,
        },
      });

      // Se nenhum match foi encontrado em uma remoção, avisa o produtor
      if (advanced.kind === 'remove_supplier' && result.notFound.length > 0 && result.removed.length === 0) {
        await whatsappService.sendMessage({
          to: phone,
          body: `Não encontrei "${result.notFound.join(', ')}" na sua lista. Tente o nome exato.`,
        });
        return;
      }

      // Re-renderiza resumo com a contagem atualizada
      const stillMissing = this.getMissingFields(result.context);
      const state = {
        context: result.context,
        missing: stillMissing,
        warnings: [],
        source: 'regex' as const,
        fieldsExtractedCount: 1,
        defaulted: [],
      };
      const note =
        result.removed.length > 0
          ? `_Removido(s): ${result.removed.join(', ')}_\n\n`
          : '';

      await whatsappService.sendMessage({
        to: phone,
        body: note + SmartFillService.buildSummary(state, result.selectedAfter.length),
      });
      await this.setState(producerId, 'producer', 'AWAITING_SMART_CONFIRMATION', result.context);
      return;
    }

    // FF-BE-017a — Edição inline: "frete FOB", "pagamento à vista",
    // "80 ton", "região Sorriso", "prazo 15/09".
    const edit = parseInlineEdit(choice);
    if (edit) {
      const newContext = edit.apply(context);

      await FSMEventService.track({
        producerId,
        eventType: 'inline_edit_used',
        payload: { field: edit.field, rawInput: edit.rawInput },
      });

      // Re-renderiza o resumo com o novo valor
      const stillMissing = this.getMissingFields(newContext);
      const state = {
        context: newContext,
        missing: stillMissing,
        warnings: [],
        source: 'regex' as const,
        fieldsExtractedCount: 1,
        defaulted: [],
      };

      if (stillMissing.length === 0) {
        await whatsappService.sendMessage({
          to: phone,
          body: SmartFillService.buildSummary(
            state,
            newContext.selectedSuppliers?.length,
          ),
        });
      } else {
        await whatsappService.sendMessage({
          to: phone,
          body: SmartFillService.buildGroupedQuestion(stillMissing),
        });
      }

      await this.setState(producerId, 'producer', 'AWAITING_SMART_CONFIRMATION', newContext);
      return;
    }

    // Resposta com mais campos — tenta preencher faltantes via NLU v2
    const validated = await nluExtractorService.extractAndValidate(message, { producerId });
    // Carrega defaults também na resposta (cobre caso de produtor que
    // não respondeu freight/payment e quer usar o histórico).
    const prefs = await SmartDefaultsService.loadFor(producerId);
    const merged = SmartFillService.buildContext(validated, context, prefs);

    if (merged.fieldsExtractedCount > 0) {
      // FF-BE-021 — Anti-loop: se o produtor respondeu mas o campo
      // ainda está faltando, é provável que esteja preso. Conta
      // tentativas no mesmo campo.
      let nextContext = merged.context;
      if (merged.missing.length > 0) {
        const stuckField = merged.missing[0];
        const loop = trackFieldAttempt(nextContext, stuckField);
        nextContext = loop.context;

        if (loop.escapeMessage) {
          await FSMEventService.track({
            producerId,
            eventType: 'low_confidence_field',
            payload: {
              field: stuckField,
              attempts: loop.attempts,
              escape: true,
            },
          });
          await whatsappService.sendMessage({ to: phone, body: loop.escapeMessage });
          await this.setState(producerId, 'producer', 'AWAITING_SMART_CONFIRMATION', nextContext);
          return;
        }
      } else {
        // Conseguiu preencher tudo — limpa contadores
        nextContext = resetFieldAttempts(nextContext);
      }

      await this.setState(producerId, 'producer', 'AWAITING_SMART_CONFIRMATION', nextContext);

      if (merged.missing.length > 0) {
        await whatsappService.sendMessage({
          to: phone,
          body: SmartFillService.buildGroupedQuestion(merged.missing),
        });
      } else {
        await whatsappService.sendMessage({
          to: phone,
          body: SmartFillService.buildSummary(merged),
        });
      }
      return;
    }

    await whatsappService.sendMessage({
      to: phone,
      body: 'Não entendi. Responda *sim* para confirmar ou edite (ex: "frete FOB"), ou digite *corrigir tudo* para recomeçar.',
    });
  }

  private getMissingFields(context: ConversationContext): string[] {
    const missing: string[] = [];
    if (!context.items || context.items.length === 0 || !context.items[0]?.product) missing.push('product');
    if (context.items?.[0] && !context.items[0].quantity) missing.push('quantity');
    if (!context.region) missing.push('region');
    if (!context.deadline) missing.push('deadline');
    if (!context.freight) missing.push('freight');
    if (!context.quotePaymentTerms) missing.push('paymentTerms');
    return missing;
  }

  private getStateForField(field: string): ProducerState {
    const map: Record<string, ProducerState> = {
      product: 'AWAITING_PRODUCT',
      quantity: 'AWAITING_QUANTITY',
      region: 'AWAITING_REGION',
      deadline: 'AWAITING_DEADLINE',
      freight: 'AWAITING_FREIGHT',
      paymentTerms: 'AWAITING_PAYMENT_TERMS',
    };
    return map[field] || 'AWAITING_CATEGORY';
  }

  /**
   * FF-BE-016 — Resolve a lista de fornecedores que receberá a cotação
   * via smart fill (scope MINE + filtro por categoria com fallback).
   * Pré-seleciona TODOS — o produtor pode editar via FF-BE-017.
   */
  private async loadSuppliersForSmartFill(
    producerId: string,
    category?: string,
  ): Promise<Array<{ id: string; name: string; phone: string }>> {
    // CO-0-05: fornecedores são por tenant.
    const producer = await prisma.producer.findUniqueOrThrow({
      where: { id: producerId },
      select: { tenantId: true },
    });
    const all = await prisma.supplier.findMany({
      where: {
        isNetworkSupplier: false,
        tenantId: producer.tenantId,
      },
      select: { id: true, name: true, phone: true, categories: true },
    });

    if (!category) return all.map((s) => ({ id: s.id, name: s.name, phone: s.phone }));

    const filtered = all.filter((s) =>
      s.categories.some((c) => c.toLowerCase() === category.toLowerCase()),
    );

    // Fallback: se não há match por categoria, manda para todos os
    // próprios fornecedores (preserva o comportamento existente do
    // showSupplierListForSelection que cai no warning de categoria).
    const list = filtered.length > 0 ? filtered : all;
    return list.map((s) => ({ id: s.id, name: s.name, phone: s.phone }));
  }

  // ────────────────────────────────────────────────────────────────────
  // FF-BE-022 — Mid-flow collision
  // ────────────────────────────────────────────────────────────────────

  /**
   * Detecta se o produtor mandou mensagem rica enquanto está em outro
   * fluxo. Retorna true quando capturou e tratou (caller deve return).
   *
   * Não roda em IDLE (smart fill ativa naturalmente lá), nem em
   * estados terminais (CLOSED), nem dentro do próprio prompt de
   * decisão (AWAITING_MID_FLOW_DECISION).
   */
  private async maybeHandleMidFlowCollision(
    producerId: string,
    phone: string,
    message: string,
    currentState: ProducerState,
    context: ConversationContext,
  ): Promise<boolean> {
    if (!env.SMART_FILL_ENABLED) return false;

    const SAFE_STATES: ProducerState[] = [
      'IDLE',
      'CLOSED',
      'QUOTE_ACTIVE',
      'AWAITING_SMART_CONFIRMATION',
      'AWAITING_MID_FLOW_DECISION',
      'AWAITING_RECOVERY_CHOICE',
    ];
    if (SAFE_STATES.includes(currentState)) return false;

    const validated = await nluExtractorService.extractAndValidate(message, { producerId });
    if (!SmartFillService.shouldActivate(validated)) return false;

    // Constrói novo contexto com defaults para que, se o produtor
    // confirmar "sim", a gente reaproveite tudo.
    const prefs = await SmartDefaultsService.loadFor(producerId);
    const state = SmartFillService.buildContext(validated, {}, prefs);
    (state.context as any)._smartFillUsed = true;

    await MidFlowBufferService.set(producerId, {
      newContext: state.context,
      interruptedState: currentState,
      originalMessage: message,
      fieldsExtracted: state.fieldsExtractedCount,
      storedAt: new Date().toISOString(),
    });

    await FSMEventService.track({
      producerId,
      eventType: 'mid_flow_collision',
      payload: {
        interruptedState: currentState,
        fieldsExtracted: state.fieldsExtractedCount,
      },
    });

    await whatsappService.sendMessage({
      to: phone,
      body:
        `Você já tem uma cotação em andamento.\n\n` +
        `Cancelar a anterior e iniciar nova?\n\n` +
        `1 — Sim, iniciar nova\n2 — Continuar a anterior`,
    });

    await this.setState(
      producerId,
      'producer',
      'AWAITING_MID_FLOW_DECISION',
      // Preserva contexto interrompido no estado para retomar se "continuar"
      { ...context, _midFlowPrev: { state: currentState } },
      currentState,
    );
    return true;
  }

  /**
   * Estado AWAITING_MID_FLOW_DECISION — produtor responde se cancela
   * a cotação anterior ou continua.
   */
  private async handleAwaitingMidFlowDecision(
    producerId: string,
    phone: string,
    message: string,
  ): Promise<void> {
    const choice = message.trim().toLowerCase();
    const buffered = await MidFlowBufferService.get(producerId);

    const wantsNew =
      choice === '1' || choice === 'sim' || choice.startsWith('iniciar') || choice.includes('cancelar');
    const wantsContinue =
      choice === '2' || choice === 'continuar' || choice.includes('anterior');

    if (wantsNew && buffered) {
      await MidFlowBufferService.clear(producerId);

      // Pré-resolve fornecedores e mostra resumo unificado
      if (buffered.newContext.category) {
        const suppliers = await this.loadSuppliersForSmartFill(
          producerId,
          buffered.newContext.category,
        );
        buffered.newContext.supplierScope = 'MINE';
        buffered.newContext.selectedSuppliers = suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.phone,
        }));
      }

      // Reconstrói o state pra render
      const validated = await nluExtractorService.extractAndValidate(buffered.originalMessage, { producerId });
      const prefs = await SmartDefaultsService.loadFor(producerId);
      const state = SmartFillService.buildContext(validated, buffered.newContext, prefs);

      if (state.missing.length > 0) {
        await whatsappService.sendMessage({
          to: phone,
          body: SmartFillService.buildGroupedQuestion(state.missing),
        });
      } else {
        await whatsappService.sendMessage({
          to: phone,
          body: SmartFillService.buildSummary(
            state,
            buffered.newContext.selectedSuppliers?.length,
          ),
        });
      }
      await this.setState(producerId, 'producer', 'AWAITING_SMART_CONFIRMATION', state.context);
      return;
    }

    if (wantsContinue && buffered) {
      await MidFlowBufferService.clear(producerId);

      // Restaura estado anterior. Como o ConversationState atual já
      // tem o context interrompido (preservado), basta reverter o step.
      const prevState = (buffered.interruptedState ?? 'IDLE') as ProducerState;
      await this.setState(producerId, 'producer', prevState, {});
      await whatsappService.sendMessage({
        to: phone,
        body: 'Ok, vamos continuar de onde parou. Pode mandar a próxima resposta.',
      });
      return;
    }

    await whatsappService.sendMessage({
      to: phone,
      body: 'Responda *1* para iniciar nova cotação ou *2* para continuar a anterior.',
    });
  }

  private async goToFieldState(producerId: string, phone: string, state: ProducerState, context: ConversationContext): Promise<void> {
    const prompts: Record<string, string> = {
      AWAITING_PRODUCT: Messages.ASK_PRODUCT(context.category || 'Geral'),
      AWAITING_QUANTITY: Messages.ASK_QUANTITY(context.items?.[0]?.product || 'produto', context.category),
      AWAITING_REGION: Messages.ASK_REGION(),
      AWAITING_DEADLINE: Messages.ASK_DEADLINE(),
      AWAITING_FREIGHT: Messages.ASK_FREIGHT,
      AWAITING_PAYMENT_TERMS: Messages.ASK_PAYMENT_TERMS(context.freight || 'CIF'),
    };
    const prompt = prompts[state] || 'Qual informação você gostaria de adicionar?';
    await whatsappService.sendMessage({ to: phone, body: prompt });
    await this.setState(producerId, 'producer', state, context, 'AWAITING_SMART_CONFIRMATION');
  }

  // ===================================
  // Context Recovery Handler
  // ===================================

  private async handleRecoveryChoice(producerId: string, phone: string, message: string, context: ConversationContext): Promise<void> {
    const choice = message.trim();
    if (choice === '1') {
      // Continue — go to next missing field
      const missing = this.getMissingFields(context);
      if (missing.length > 0) {
        const nextState = this.getStateForField(missing[0]);
        await this.goToFieldState(producerId, phone, nextState, context);
      } else {
        await this.askOrApplySupplierScope(producerId, phone, context);
      }
      return;
    }
    if (choice === '2') {
      await this.resetState(producerId, 'producer');
      const producer = await prisma.producer.findUniqueOrThrow({ where: { id: producerId } });
      await whatsappService.sendMessage({ to: phone, body: Messages.WELCOME(producer.name, false) });
      return;
    }
    await whatsappService.sendMessage({ to: phone, body: 'Responda *1* para continuar ou *2* para começar nova cotação.' });
  }
}
