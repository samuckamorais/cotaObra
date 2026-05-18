import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * FF-BE-009 — Eventos do funil conversacional
 *
 * Fonte de verdade para o dashboard /reports/funnel e para detecção
 * de abandono (job noturno). Independente do ConversationMetric, que
 * mantém outras métricas (mensagens, errors, conversion rates).
 *
 * Os tipos abaixo são usados por todos os call-sites; novos eventos
 * devem ser adicionados aqui antes de tracking em código.
 */
export type FSMEventType =
  | 'quote_started'        // Primeira transição IDLE → AWAITING_*
  | 'state_transition'     // Toda mudança de estado FSM
  | 'quote_dispatched'     // Cotação criada e enviada para fornecedores
  | 'quote_completed'      // Produtor escolheu vencedor
  | 'quote_abandoned'      // Detectado pelo job noturno (>24h em estado != IDLE/CLOSED)
  | 'command_global'       // 'cancelar', 'ajuda' invocados
  | 'smart_fill_activated' // Smart fill detectou 2+ campos (FF-BE-013)
  | 'smart_fill_confirmed' // Produtor confirmou resumo do smart fill
  | 'smart_fill_corrected' // Produtor escolheu "corrigir tudo"
  | 'inline_edit_used'     // Edição inline (FF-BE-017a/b)
  | 'fuzzy_match_accepted' // Sugestão "Você quis dizer X?" aceita
  | 'validation_failed'    // FF-BE-012: validação semântica rejeitou campo
  | 'low_confidence_field' // FF-BE-010: NLU retornou confiança < 0.5 em algum campo
  | 'mid_flow_collision'   // Smart fill enquanto outra cotação está em curso
  // FEAT-PDF-001 (FF-PDF) — Telemetria do pipeline de PDF de resultado
  | 'pdf_generation_started'   // Job pegou o quoteId e começou a gerar
  | 'pdf_generation_completed' // PDFKit OK + upload MinIO OK
  | 'pdf_generation_failed'    // Falha no PDFKit ou upload (sujeito a retry)
  | 'pdf_generation_skipped'   // §14.4: PDF_GENERATION_ENABLED=false
  | 'pdf_delivery_completed'   // Twilio aceitou envio (status sent)
  | 'pdf_delivery_failed'      // Twilio retornou erro (4xx/5xx) após retries
  | 'pdf_fallback_text_sent';  // Enviado link do dashboard como fallback

export interface TrackFSMEventInput {
  producerId: string;
  eventType: FSMEventType;
  fromState?: string | null;
  toState?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Serviço de tracking do funil conversacional. Falhas de escrita NÃO
 * propagam — funil é observabilidade, não pode quebrar fluxo do produtor.
 */
export class FSMEventService {
  static async track(input: TrackFSMEventInput): Promise<void> {
    try {
      await prisma.fSMEvent.create({
        data: {
          producerId: input.producerId,
          eventType: input.eventType,
          fromState: input.fromState ?? null,
          toState: input.toState ?? null,
          payload: input.payload
            ? (JSON.parse(JSON.stringify(input.payload)) as object)
            : undefined,
        },
      });
    } catch (error) {
      logger.error('Failed to track FSMEvent', {
        error,
        producerId: input.producerId,
        eventType: input.eventType,
      });
    }
  }

  /**
   * Conveniências para os call-sites mais comuns.
   */
  static async trackTransition(
    producerId: string,
    fromState: string | null | undefined,
    toState: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    return this.track({
      producerId,
      eventType: 'state_transition',
      fromState: fromState ?? null,
      toState,
      payload,
    });
  }

  static async trackCommand(
    producerId: string,
    command: 'cancelar' | 'ajuda' | string,
    fromState: string | null | undefined,
  ): Promise<void> {
    return this.track({
      producerId,
      eventType: 'command_global',
      fromState: fromState ?? null,
      payload: { command },
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // Read API — alimenta dashboard /reports/conversational-funnel
  // ──────────────────────────────────────────────────────────────────

  /**
   * Funil agregado: contagem de produtores únicos que entraram em cada
   * estado dentro do período. Útil para Sankey ou barras com drop-off.
   */
  static async getFunnel(params: {
    startDate: Date;
    endDate: Date;
  }): Promise<Array<{ state: string; count: number }>> {
    const rows = await prisma.$queryRaw<Array<{ state: string; count: bigint }>>`
      SELECT "toState" AS state, COUNT(DISTINCT "producerId")::bigint AS count
      FROM "fsm_events"
      WHERE "timestamp" >= ${params.startDate}
        AND "timestamp" <= ${params.endDate}
        AND "eventType" = 'state_transition'
        AND "toState" IS NOT NULL
      GROUP BY "toState"
      ORDER BY count DESC
    `;
    return rows.map((r) => ({ state: r.state, count: Number(r.count) }));
  }

  /**
   * Drop-off por estado: top-N estados com maior abandono. Cruza
   * state_transition (entrada no estado) com quote_abandoned (saída
   * sem progredir) e quote_dispatched (progrediu).
   */
  static async getDropOff(params: {
    startDate: Date;
    endDate: Date;
    limit?: number;
  }): Promise<Array<{ state: string; entered: number; abandoned: number; rate: number }>> {
    const rows = await prisma.$queryRaw<Array<{ state: string; entered: bigint; abandoned: bigint }>>`
      SELECT
        t."toState" AS state,
        COUNT(DISTINCT t."producerId")::bigint AS entered,
        COUNT(DISTINCT a."producerId")::bigint AS abandoned
      FROM "fsm_events" t
      LEFT JOIN "fsm_events" a
        ON a."producerId" = t."producerId"
        AND a."eventType" = 'quote_abandoned'
        AND a."fromState" = t."toState"
        AND a."timestamp" BETWEEN ${params.startDate} AND ${params.endDate}
      WHERE t."timestamp" >= ${params.startDate}
        AND t."timestamp" <= ${params.endDate}
        AND t."eventType" = 'state_transition'
        AND t."toState" IS NOT NULL
      GROUP BY t."toState"
      ORDER BY abandoned DESC
      LIMIT ${params.limit ?? 10}
    `;
    return rows.map((r) => {
      const entered = Number(r.entered);
      const abandoned = Number(r.abandoned);
      return {
        state: r.state,
        entered,
        abandoned,
        rate: entered > 0 ? parseFloat(((abandoned / entered) * 100).toFixed(2)) : 0,
      };
    });
  }

  /**
   * Distribuição de mensagens por cotação concluída (histograma).
   * Mensagens contadas via state_transitions por produtor entre
   * quote_started e quote_dispatched/completed.
   */
  static async getMessagesPerCompletedQuote(params: {
    startDate: Date;
    endDate: Date;
  }): Promise<Array<{ producerId: string; transitions: number }>> {
    const rows = await prisma.$queryRaw<Array<{ producerId: string; transitions: bigint }>>`
      SELECT t."producerId" AS "producerId", COUNT(*)::bigint AS transitions
      FROM "fsm_events" t
      WHERE t."timestamp" >= ${params.startDate}
        AND t."timestamp" <= ${params.endDate}
        AND t."eventType" = 'state_transition'
        AND EXISTS (
          SELECT 1 FROM "fsm_events" d
          WHERE d."producerId" = t."producerId"
            AND d."eventType" = 'quote_dispatched'
            AND d."timestamp" BETWEEN ${params.startDate} AND ${params.endDate}
        )
      GROUP BY t."producerId"
      ORDER BY transitions DESC
    `;
    return rows.map((r) => ({
      producerId: r.producerId,
      transitions: Number(r.transitions),
    }));
  }

  /**
   * Tempo médio do IDLE → DISPATCHED (em segundos).
   */
  static async getAvgTimeToDispatch(params: {
    startDate: Date;
    endDate: Date;
  }): Promise<{ avgSeconds: number; samples: number }> {
    const rows = await prisma.$queryRaw<Array<{ avg: number | null; samples: bigint }>>`
      SELECT
        AVG(EXTRACT(EPOCH FROM (d."timestamp" - s."timestamp")))::float AS avg,
        COUNT(*)::bigint AS samples
      FROM "fsm_events" s
      JOIN "fsm_events" d
        ON d."producerId" = s."producerId"
        AND d."eventType" = 'quote_dispatched'
        AND d."timestamp" > s."timestamp"
      WHERE s."eventType" = 'quote_started'
        AND s."timestamp" >= ${params.startDate}
        AND s."timestamp" <= ${params.endDate}
        AND d."timestamp" <= ${params.endDate}
    `;
    const r = rows[0];
    return {
      avgSeconds: r?.avg ? parseFloat(r.avg.toFixed(1)) : 0,
      samples: r?.samples ? Number(r.samples) : 0,
    };
  }

  /**
   * Counts by event type — útil para visão geral.
   */
  static async getEventCounts(params: {
    startDate: Date;
    endDate: Date;
  }): Promise<Array<{ eventType: string; count: number }>> {
    const rows = await prisma.fSMEvent.groupBy({
      by: ['eventType'],
      where: {
        timestamp: { gte: params.startDate, lte: params.endDate },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    return rows.map((r) => ({ eventType: r.eventType, count: r._count.id }));
  }
}
