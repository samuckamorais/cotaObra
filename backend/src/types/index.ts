// Re-export Prisma types
export { SupplierScope, QuoteStatus, PlanType, Producer, Supplier, Quote, Proposal } from '@prisma/client';

// ===================================
// DTOs (Data Transfer Objects)
// ===================================

export interface CreateProducerDTO {
  name: string;
  cpfCnpj: string;
  stateRegistration?: string;
  farm?: string;
  city: string;
  phone: string;
  region: string;
}

export interface UpdateProducerDTO {
  name?: string;
  cpfCnpj?: string;
  stateRegistration?: string;
  farm?: string;
  city?: string;
  phone?: string;
  region?: string;
}

export interface CreateSupplierDTO {
  name: string;
  phone: string;
  company?: string;
  email?: string;
  regions: string[];
  categories: string[];
  isNetworkSupplier?: boolean;
}

export interface UpdateSupplierDTO {
  name?: string;
  phone?: string;
  company?: string;
  email?: string;
  regions?: string[];
  categories?: string[];
  isNetworkSupplier?: boolean;
}

export interface QuoteItemDTO {
  product: string;
  quantity: number;
  unit: string;
}

export interface CreateQuoteDTO {
  producerId: string;
  category?: string;
  // Legado (cotação com 1 item via WhatsApp antigo)
  product?: string;
  quantity?: string;
  unit?: string;
  // Multi-item
  items?: QuoteItemDTO[];
  region: string;
  deadline: Date;
  observations?: string;
  freight?: string;
  supplierScope: 'MINE' | 'NETWORK' | 'ALL';
}

export interface CreateProposalItemDTO {
  quoteItemId: string;
  unitPrice: number;
  totalPrice: number;
}

export interface CreateProposalDTO {
  quoteId: string;
  supplierId: string;
  price: number;
  totalPrice: number;
  paymentTerms: string;
  deliveryDays: number;
  observations?: string;
  isOwnSupplier?: boolean;
  isPartial?: boolean;
  items?: CreateProposalItemDTO[];
}

export interface CreateSubscriptionDTO {
  producerId: string;
  plan: 'BASIC' | 'PRO' | 'ENTERPRISE';
  startDate: Date;
  endDate: Date;
}

// ===================================
// WhatsApp Types
// ===================================

export interface IncomingMessage {
  from: string; // número do remetente com DDI
  body: string; // corpo da mensagem
  timestamp?: Date;
  type?: 'text' | 'audio' | 'image'; // tipo de mensagem
  mediaUrl?: string; // URL do arquivo de mídia
  mimeType?: string; // MIME type do arquivo
}

export interface OutgoingMessage {
  to: string; // número do destinatário com DDI
  body: string; // corpo da mensagem
}

/**
 * FEAT-PDF-001 — Mensagem com documento (PDF) anexado.
 *
 * O provider escolhido (Twilio em prod) só aceita envio de mídia via
 * URL pública HTTPS — daí o campo `mediaUrl` ser obrigatório e único
 * (não há fallback de Buffer). A URL deve estar acessível pela internet,
 * normalmente uma presigned URL do MinIO.
 */
export interface OutgoingDocumentMessage {
  to: string;
  /** URL pública HTTPS (Twilio precisa baixar de fora do cluster). */
  mediaUrl: string;
  /** Nome do arquivo que o destinatário vê. */
  filename: string;
  /** Legenda opcional acompanhando o documento (até 1024 chars no WhatsApp). */
  caption?: string;
  /** Default 'application/pdf'. */
  mimeType?: string;
}

export interface WhatsAppWebhookPayload {
  from: string;
  body: string;
  timestamp?: string;
  contacts?: Array<{
    name?: string;
    phones?: Array<{ phone: string; type?: string }>;
  }>;
  [key: string]: unknown; // permite outras propriedades específicas do provider
}

export interface ContactData {
  name: string;
  phone: string;
  company?: string;
  email?: string;
}

// ===================================
// FSM (Finite State Machine) Types
// ===================================

export type ProducerState =
  | 'IDLE'
  | 'AWAITING_REPEAT_CHOICE'
  | 'AWAITING_IMAGE_CHOICE'
  | 'AWAITING_PROACTIVE_CHOICE'
  | 'AWAITING_QUOTE_MODE'
  | 'AWAITING_QUOTE_FORM'
  | 'AWAITING_ACTIVE_PRINCIPLE'
  | 'AWAITING_CATEGORY'
  | 'AWAITING_PRODUCT'
  | 'AWAITING_QUANTITY'
  | 'AWAITING_MORE_ITEMS'
  | 'AWAITING_REGION'
  | 'AWAITING_DEADLINE'
  | 'AWAITING_OBSERVATIONS'
  | 'AWAITING_FREIGHT'
  | 'AWAITING_PAYMENT_TERMS'
  | 'AWAITING_SUPPLIER_SCOPE'
  | 'AWAITING_SUPPLIER_SELECTION'
  | 'AWAITING_SUPPLIER_EXCLUSION'
  | 'AWAITING_SUPPLIER_CONFIRMATION'
  | 'AWAITING_CONFIRMATION'
  | 'QUOTE_ACTIVE'
  | 'AWAITING_CHOICE'
  | 'AWAITING_SUPPLIER_CONTACT'
  | 'AWAITING_SUPPLIER_CATEGORY'
  | 'AWAITING_RATING'
  | 'AWAITING_SMART_CONFIRMATION'
  | 'AWAITING_RECOVERY_CHOICE'
  | 'AWAITING_QUOTE_STATUS_CHOICE'
  | 'AWAITING_NEW_SUPPLIER_NAME'
  | 'AWAITING_NEW_SUPPLIER_PHONE'
  | 'AWAITING_MID_FLOW_DECISION'
  | 'CLOSED';

export type SupplierState =
  | 'SUPPLIER_IDLE'
  | 'SUPPLIER_AWAITING_INTEREST'
  | 'SUPPLIER_AWAITING_RESPONSE'
  | 'SUPPLIER_AWAITING_PRICE'
  | 'SUPPLIER_AWAITING_DELIVERY'
  | 'SUPPLIER_AWAITING_PAYMENT'
  | 'SUPPLIER_AWAITING_OBS'
  | 'SUPPLIER_PROPOSAL_SENT';

export interface QuoteItemContext {
  product: string;
  quantity: number;
  unit: string;
  activeIngredient?: string;
}

export interface ConversationContext {
  category?: string;
  availableCategories?: string[];

  // Multi-item: lista acumulada de itens na cotação em andamento
  items?: QuoteItemContext[];

  // Item atual sendo coletado (product/quantity/unit temporários antes de push em items)
  product?: string;
  quantity?: string;
  unit?: string;
  activeIngredient?: string; // princípio ativo atual (apenas para Defensivos)

  region?: string;
  deadline?: string;
  observations?: string;
  freight?: 'CIF' | 'FOB';
  quotePaymentTerms?: string; // Forma de pagamento exigida pelo produtor
  supplierScope?: 'MINE' | 'NETWORK' | 'ALL';
  quoteId?: string;

  // Supplier selection context
  availableSuppliers?: Array<{ id: string; name: string; phone: string }>;
  excludedSuppliers?: string[]; // IDs dos fornecedores excluídos
  selectedSuppliers?: Array<{ id: string; name: string; phone: string }>;

  // Supplier registration context
  supplierId?: string;
  supplierName?: string;

  // Inline supplier registration (FF-BE-007) — temporário durante AWAITING_NEW_SUPPLIER_NAME/PHONE
  newSupplierName?: string;

  // Supplier FSM: preço por item (multi-item)
  currentItemIndex?: number; // índice do QuoteItem que está sendo cotado
  quoteItems?: Array<{ id: string; product: string; quantity: number; unit: string }>;
  proposalItems?: Array<{ quoteItemId: string; unitPrice: number; totalPrice: number }>;

  // Supplier context (legado / 1 item)
  price?: number;
  deliveryDays?: number;
  paymentTerms?: string;
  isOwnSupplier?: boolean;

  [key: string]: unknown;
}

export interface StateTransition {
  nextState: ProducerState | SupplierState;
  response: string;
  updateContext?: Partial<ConversationContext>;
}

// ===================================
// OpenAI NLU Types
// ===================================

export interface NLUResult {
  intent:
    | 'nova_cotacao'
    | 'ver_cotacao'
    | 'cancelar'
    | 'saudacao'
    | 'ajuda'
    | 'responder_cotacao'
    | 'recusar_cotacao'
    | 'desconhecido';
  entities: {
    product?: string;
    quantity?: string;
    unit?: string;
    region?: string;
    deadline?: string;
  };
  confidence: number;
}

// ===================================
// API Response Types
// ===================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ===================================
// Dashboard Types
// ===================================

export interface DashboardStats {
  quotesToday: number;
  proposalsReceived: number;
  closureRate: number; // taxa de fechamento em %
  activeProducers: number;
}

export interface QuotesByDay {
  date: string;
  count: number;
}

export interface TopProduct {
  product: string;
  count: number;
}

// ===================================
// Error Types
// ===================================

export class AppError extends Error {
  constructor(
    public message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}
