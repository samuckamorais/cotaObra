# FSMEvent — Eventos do Funil Conversacional (FF-BE-009)

Tabela `fsm_events` é a fonte de verdade para o funil de WhatsApp.
Independente do `ConversationMetric` (este mantém métricas de mensagens
e errors em geral). Toda escrita acontece via `FSMEventService.track()`
e nunca propaga falha (observabilidade não pode quebrar fluxo do produtor).

## Eventos

| eventType | Quando dispara | Onde | Payload típico |
|---|---|---|---|
| `quote_started` | Primeira transição `IDLE` → qualquer `AWAITING_*` | `FSMEngine.setState` (hook universal) | `{ }` (toState/fromState nas colunas) |
| `state_transition` | Toda mudança de estado FSM (incluindo voltas) | `FSMEngine.setState` (hook universal) | `{ durationMs }` |
| `quote_dispatched` | Cotação criada e enviada para fornecedores | `producer.flow.createAndDispatchQuote` | `{ quoteId, supplierCount, category, itemsCount, scope }` |
| `quote_completed` | Produtor escolheu vencedor | `producer.flow.handleAwaitingChoice` | `{ quoteId, supplierId, durationMs }` |
| `quote_abandoned` | Conversa parada > 24h em estado não-terminal | `jobs/detect-abandoned-quotes` (03:00 BRT) | `{ lastUpdatedAt, idleHours }` |
| `command_global` | Producer digitou `cancelar` ou `ajuda` | `producer.flow.handleMessage` | `{ command }` |
| `smart_fill_activated` | NLU detectou 2+ campos em IDLE (FF-BE-013) | `producer.flow.handleIdle` | `{ fieldsExtracted, missingFields }` |
| `smart_fill_confirmed` | Produtor confirmou resumo | `producer.flow.handleSmartFillConfirmation` | `{ quoteId }` |
| `smart_fill_corrected` | Produtor digitou "corrigir tudo" | idem | `{ resetTo }` |
| `inline_edit_used` | Edição inline pós-resumo (FF-BE-017a/b) | idem | `{ field, oldValue, newValue }` |
| `fuzzy_match_accepted` | Sugestão "Você quis dizer X?" aceita (FF-BE-018) | NLU | `{ original, suggested, confidence }` |
| `validation_failed` | Validação semântica rejeitou campo (FF-BE-012) | NLU pipeline | `{ field, reason, value }` |
| `low_confidence_field` | NLU retornou confiança < 0.5 (FF-BE-010) | NLU pipeline | `{ field, confidence }` |
| `mid_flow_collision` | Smart fill recebido durante outra cotação (FF-BE-022) | `producer.flow.handleIdle` | `{ activeState, choice }` |

## Esquema da tabela

```prisma
model FSMEvent {
  id         String   @id @default(cuid())
  producerId String
  timestamp  DateTime @default(now())
  eventType  String
  fromState  String?
  toState    String?
  payload    Json?
  createdAt  DateTime @default(now())

  @@index([producerId, timestamp])
  @@index([eventType, timestamp])
  @@index([toState, timestamp])
  @@map("fsm_events")
}
```

Os 3 índices cobrem os padrões de leitura conhecidos:

- `(producerId, timestamp)` — drop-off individual de um produtor.
- `(eventType, timestamp)` — agregações por evento (volumetria).
- `(toState, timestamp)` — job de abandono filtra por estado destino.

## Endpoint de leitura

`GET /api/reports/conversational-funnel?from=YYYY-MM-DD&to=YYYY-MM-DD`

Retorna 5 visões agregadas (funnel, dropOff, messagesPerQuote,
avgTimeToDispatch, eventCounts). Default: últimos 7 dias.

## Cron de abandono

`startDetectAbandonedQuotesJob()` em `backend/src/jobs/detect-abandoned-quotes.job.ts`.

- Frequência: 03:00 BRT diariamente.
- Critério: `conversationState.updatedAt < now - 24h` E `step != IDLE/CLOSED/QUOTE_ACTIVE`.
- Idempotência: só dispara `quote_abandoned` se não há evento mais recente
  que `updatedAt` para o mesmo produtor.

## Como adicionar um novo evento

1. Adicionar nome em `FSMEventType` (`backend/src/services/fsm-event.service.ts`).
2. Chamar `FSMEventService.track()` no call-site.
3. Adicionar linha nesta tabela.
4. Se for um indicador para o dashboard, adicionar query em `FSMEventService` e
   expor via `ReportController.conversationalFunnel`.
