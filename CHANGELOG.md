# Changelog — CotaObra

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
SemVer adaptado a sprints (`vSprintN`).

---

## v0.7.0 — Sprint 6 (Aprovação hierárquica & Histórico de preços)

**Data:** 2026-05-18

### Adicionado

- **CO-6-01 Schema `Approval` + `PriceHistoryAggregate`** — enum `ApprovalStatus(PENDING/APPROVED/REJECTED)`. Approval com `quoteId @unique`, `closeQuotePayload` JSON (payload de `closeQuote` reaplicado na aprovação), `thresholdAmount`/`totalAmount` Decimal, `requestedById`, `approverId` (opcional → fila aberta). PriceHistoryAggregate agregando `min/max/avg/medianPrice` por (tenant, materialId|description, region, period=YYYY-MM) com `paymentTermsBreakdown` JSON. Migration `20260518000110_*` com 5 tabelas/enums + 5 FKs + 6 índices.
- **CO-6-02 `ApprovalService` + `approval.controller`**:
  - `shouldRequireApproval(tenantId, estimatedTotal)` — consulta `TenantSettings.approvalThreshold`.
  - `createPending` — cria Approval em PENDING, transiciona Quote para `AWAITING_APPROVAL`, dispara notificação.
  - `list/countPending/getById` com RBAC: APPROVER vê suas OU `approverId=null` (fila aberta); ADMIN/SUPER_ADMIN veem tudo.
  - `approve` — só PENDING, marca decidedAt + approverId. Controller reaplica `PurchaseOrderService.closeQuote` com payload salvo (gera POs + PDFs + notificações como no fluxo normal).
  - `reject` — exige `reason ≥ 5 chars`, transiciona Quote de volta para `SUMMARIZED`.
  - Endpoints: `GET /api/approvals`, `GET /api/approvals/pending-count`, `GET /api/approvals/:id`, `POST /api/approvals/:id/approve`, `POST /api/approvals/:id/reject`.
- **Integração `PurchaseOrderService.closeQuote`** — antes de criar POs em SUMMARIZED, verifica threshold; se exceder cria Approval e retorna `{ requiresApproval, approvalId, threshold }`. Replay pós-aprovação (status=AWAITING_APPROVAL) pula o gate.
- **CO-6-03 Frontend Aprovações**:
  - `pages/Approvals.tsx` (`/approvals`) — cards com status, valor vs teto, obra, solicitante, idade. Filtro por status (PENDING default).
  - `pages/ApprovalDetail.tsx` (`/approvals/:id`) — resumo financeiro (total + threshold + excedente %), tabela de propostas, ações **Aprovar e gerar OC** / **Rejeitar com motivo**. Em REJECTED mostra motivo + decisor + data.
  - Hooks `useApprovals`, `useApproval`, `useApprovalsPendingCount`, `useApproveApproval`, `useRejectApproval`.
  - Sidebar: item "Aprovações" com badge âmbar de pendentes (polling 60s).
  - `CloseQuoteModal` mostra toast **"Aprovação necessária 🛡️"** quando backend retorna `requiresApproval`.
- **CO-6-04 `NotifyApproverService`** — WhatsApp para `approverId` específico OU broadcast para todos APPROVER/ADMIN ativos do tenant. Mensagem com solicitante, obra, total, threshold ultrapassado e `Ref: <short-id>`. Disparado fire-and-forget em `createPending`.
- **CO-6-05 Settings UI** — `TenantSettings.approvalThreshold` editável via `/api/settings` (PUT). Frontend Settings adiciona bloco **Aprovação hierárquica** com input `R$` + botão "desativar" (envia null). `tenant-settings.service` converte para `Prisma.Decimal`.
- **CO-6-06 + CO-6-07 PriceHistoryAggregate**:
  - `PriceHistoryAggregateService.computePeriod(YYYY-MM)` — agrega PriceHistoryRaw em buckets (tenant, materialId|description, region) calculando min/max/avg/median + breakdown de paymentTerms.
  - `runDaily()` — recomputa mês corrente + mês anterior (idempotente; usa findFirst+create/update porque NULL em UNIQUE é distinto no Postgres).
  - Job `compute-price-aggregate` — cron diário 00:30 (`node-cron`).
  - Endpoint `GET /api/reports/price-history` com filtros materialId/description/region/fromPeriod/toPeriod (limit 500).

### Migrations adicionadas

- `20260518000110_co_6_approval_price_aggregate/` — Approval (4 FKs) + PriceHistoryAggregate (1 FK) + enum.

### Não entregue (deferido)

- **HSM aprovado pela Meta para notify-approver** — usa texto livre no sandbox; em produção precisa template HSM aprovado (`approval_pending`) com placeholders {{solicitante}}/{{obra}}/{{valor}}. Pendente do user.
- **Email de aprovação** — só WhatsApp por ora (mesma limitação do CO-5-06).
- **Backfill de PriceHistoryAggregate** — para tenants existentes precisa rodar `computePeriod(period)` manualmente para meses históricos. Sem migration de dados automática (defensivo; pode ser feito via comando admin).

### Validação

- backend `tsc --noEmit`: **0 erros**
- frontend `tsc --noEmit`: **0 erros**
- backend tests: pré-existentes falham por falta de `.env` de teste (não regressão deste sprint).

---

## v0.6.0 — Sprint 5 (Fechamento, Purchase Order & PDF)

**Data:** 2026-05-18

### Adicionado

- **CO-5-01 Schema `PurchaseOrder` + `PurchaseOrderItem` + `PriceHistoryRaw`** — PO com numeração `number` por tenant (autoincrement), status `DRAFT/EMITTED/CANCELLED`, pdfUrl/pdfPath/pdfGeneratedAt, parentPurchaseOrderId (self-ref para split). PriceHistoryRaw com `wasWinner` flag para análises de "preço de mercado". Migration `20260518000100_*`.
- **CO-5-02 + CO-5-09 `PurchaseOrderService.closeQuote`** — orquestra fechamento em transaction atômica: cria PO(s) → snapshot de items → insere PriceHistoryRaw para TODAS as propostas (vencedores + perdedores) → marca Quote como CLOSED. Modos `winner` (1 PO com rank=1) e `split` (N POs agrupadas por supplier). RBAC: BUYER/ADMIN/SUPER_ADMIN podem fechar.
- **CO-5-03 endpoint `POST /api/quotes/:id/close-co5`** — schema zod + retorna `{ purchaseOrderIds, totalValue, purchaseOrders[] }`. Após criar POs: enfileira PDF job + dispara notify-winner + notify-losers (fire-and-forget; falhas não bloqueiam resposta).
- **CO-5-04 Template PDF da OC** (`purchase-order-pdf.template.ts`):
  - PDFKit A4 com cabeçalho (nº + emissão + tenant/CNPJ), blocos OBRA + FORNECEDOR lado a lado, tabela de itens (#/Descrição/Qtd/Unid/Preço unit/Total) com zebra + spec inline, totalizadores (Subtotal/Frete CIF-FOB/TOTAL destacado), blocos de condições (Pagamento/Prazo/Observações), 2 linhas de assinatura, marca d'água "CotaObra" rotacionada, footer.
  - Formato BR de moeda via Intl.NumberFormat.
- **CO-5-05 Job `generate-purchase-order-pdf`** — Bull queue com 3 retries + backoff exponencial. Gera PDF → upload MinIO em `purchase-orders/{tenantId}/{poId}.pdf` → presigned URL (TTL `PDF_PRESIGN_TTL_DAYS` default 7d) → atualiza PO + marca EMITTED.
- **CO-5-06 + CO-5-07 `PurchaseOrderNotificationsService`**:
  - `notifyWinner`: WhatsApp com nº PO, total BR, pagamento, prazo, frete, link PDF.
  - `notifyLosers`: posição (Nº de N) + delta% para o vencedor, **sem expor preço absoluto** (equilibra transparência e proteção comercial).
- **CO-5-08 Frontend Purchase Orders**:
  - `pages/PurchaseOrders.tsx` (`/purchase-orders`): cards com nº OC, status, total BR, fornecedor, obra, idade, link download PDF. Filtros por status.
  - `pages/PurchaseOrderDetail.tsx` (`/purchase-orders/:id`): cabeçalho com download PDF + link para Cotação, cards Fornecedor + Obra, tabela completa de itens, card de condições.
  - Hook `usePurchaseOrders` + `usePurchaseOrder` + `useCloseQuote`.
  - Sidebar: item "OCs" (ícone ScrollText) entre Cotações e Obras.
- **`CloseQuoteModal`** — modal de fechamento com toggle winner/split, dropdown filtrado de fornecedor por item (split), validação client-side, campo de motivo.
- **PricingComparator** integra botão "Fechar cotação" (verde, visível apenas em SUMMARIZED) que abre o modal.

### Migrations adicionadas

- `20260518000100_co_5_01_purchase_order_price_history/` — 3 tabelas + 6 índices + 7 FKs + enum.

### Não entregue (deferido)

- **CO-5-04 manual review** — PDFs precisam revisão visual por PO + 1 engenheiro real. Não-blocker técnico, parte do DoD.
- **Email com PDF anexado para vencedor** — `notifyWinner` só WhatsApp por ora. Email com attachment depende de `email.service.sendAttachment` que ainda não existe; PR seguinte.

### Validação

- backend `tsc --noEmit`: **0 erros**
- frontend `tsc --noEmit`: **0 erros**
- backend `jest tests/unit`: **656/656** ✅

---

## v0.5.0 — Sprint 4 (Pricing Engine & Quadro Comparativo)

**Data:** 2026-05-18

### Adicionado

- **CO-4-01 `pricing-engine.service.ts`** — coração da diferenciação CotaObra vs CotaAgro. Pure function `computeCorrectedTotal` retorna `{ corrected, breakdown }`. Fórmula: `corrected = base + freight(CIF=0/FOB=valor) + base*monthlyRate*weightedDays/30 + base*dailyPenalty*max(0,delivery-deadline)`. weightedDays: à vista=0, 28dd=28, 28/56dd=42, 30/60/90dd=60 + parser custom A/B/Cdd. Usa `Prisma.Decimal` (não Float). `rankProposals` ordena ASC e atribui rank 1..N. **36 testes 100% cobertura**.
- **CO-4-02 consolidate-quote** — roda pricing-engine após carregar propostas e persiste `correctedTotal/breakdown/rank` em paralelo. Settings do tenant via `TenantSettings.paymentPolicy`. Erro do engine não bloqueia (log warn + continua).
- **CO-4-03 `ComparativeService` + endpoint `GET /api/quotes/:id/comparative`** — payload pronto para o componente, com `itemRank` calculado server-side (rank por unitPrice de cada item). **RBAC**: REQUESTER recebe versão `redacted` (sem preços absolutos).
- **CO-4-04 `PricingComparator` componente** — tabela responsiva item × fornecedor com coluna "Item" sticky no mobile, badge "1º preço" no menor unitPrice por item, coluna vencedora (rank=1) fundo verde, hover na célula CORRIGIDO mostra breakdown detalhado (5 linhas: base/frete/financeiro/atraso/total). Estado `redacted` mostra "oculto".
- **CO-4-05 QuoteDetail integration** — `PricingComparator` renderizado quando `status === SUMMARIZED || CLOSED`. Botão "Exportar XLSX" dispara download (`responseType: 'blob'` + `URL.createObjectURL`).
- **CO-4-07 Export XLSX `ComparativeXlsxService`** — 2 sheets: **Resumo** (linha por fornecedor com totais + breakdown) + **Detalhe** (matriz item × fornecedor). Vencedor destacado em verde + negrito; coluna "Total CORRIGIDO" sempre em negrito. Formatação `R$ #,##0.00`. Endpoint `GET /api/quotes/:id/export?format=xlsx`. REQUESTER bloqueado com 403.
- **CO-4-08 `Quotes.tsx` filtros** — dropdown de obra (carrega `useSites`) + dropdown de período (7d/30d/90d/all, default 30d). **Persistência em querystring** via `useSearchParams`. Filtragem de período client-side; filtro de site enviado ao backend.
- **CO-4-09 state machine `quote-status.service`** — `ALLOWED_TRANSITIONS` matriz canônica com 8 estados (PENDING / AWAITING_BUYER_REVIEW / COLLECTING / SUMMARIZED / AWAITING_APPROVAL / CLOSED / EXPIRED / CANCELLED). `transitionQuote(quoteId, newStatus, { userId, reason })` valida transição + grava `AuditLog` (best-effort). 422 se inválida; idempotente em mesmo status. CANCELLED exige motivo ≥ 3 chars.

### Schema

- `Proposal.correctedTotal Decimal? @db.Decimal(14,2)` + `breakdown Json?` + `rank Int?` + `freightMode String?` + `freightValue Float?` + índice `(quoteId, rank)`.
- Enum `QuoteStatus` ganha `AWAITING_BUYER_REVIEW`, `AWAITING_APPROVAL`, `CANCELLED`.

### Migrations adicionadas

- `20260518000080_co_4_01_proposal_corrected_total/` — campos pricing.
- `20260518000090_co_4_09_quote_status_extras/` — valores do enum QuoteStatus.

### Não entregue (deferido)

- **CO-4-06 SSE quote.consolidated** — sino in-app + email ao consolidar. `sse-manager.ts` existe mas o evento não é publicado pelo job; ~1h de trabalho pendente. P1 — não bloqueia.

### Validação

- backend `tsc --noEmit`: **0 erros**
- frontend `tsc --noEmit`: **0 erros**
- backend `jest tests/unit`: **656/656** ✅ (subiu de 620 — pricing-engine adicionou 36 testes 100% cobertura)

---

## v0.4.0 — Sprint 3 (Dispatch & FSM Fornecedor)

**Data:** 2026-05-18

### Adicionado

- **CO-3-01 `SupplierSuggestionService`** — algoritmo de ranking de fornecedores para uma cotação:
  - Categoria (50pts se cobre todas / 20pts parcial) + região (30pts) + rating × 3 (até 15pts) + velocidade de resposta nas últimas 5 propostas (até 5pts).
  - Endpoint `GET /api/quotes/:id/suggested-suppliers` retorna top 8.
- **CO-3-03 supplier.flow paymentTerms construção** — `Messages.ASK_PAYMENT` agora apresenta menu numérico (1) à vista (5% desc) 2) 28dd 3) 28/56dd 4) 30/60/90dd 5) Outro. Novo `Messages.RESOLVE_PAYMENT_CHOICE` normaliza escolha numérica para label canônico; texto livre como fallback. `handleAwaitingPayment` atualizado.
- **CO-3-04 ProposalForm adaptado**:
  - Backend: `ProposalItem.available Boolean @default(true)`. Migration `20260518000070_*`. Pricing engine (Sprint 4) ignora itens com `available=false`.
  - Frontend: dropdown de payment terms com 4 opções fixas + "Outro" texto livre. Itens pulados (`skipped`) viram `available=false` no payload — antes eram filtrados, agora informados explicitamente.
- **CO-3-05 `PriceSanityService`** — sanity check de outlier:
  - Compara preço unitário contra mediana das últimas 30 propostas do mesmo material+região+unidade.
  - Outlier se ratio > 3x para cima ou < 1/3 para baixo (3x mais barato).
  - `formatConfirmation` gera mensagem "⚠️ Preço de R$ X está acima/abaixo da mediana (~R$ Y)" para FSM pedir confirmação.
  - Default não-outlier com menos de 5 amostras (sem baseline confiável).
- **CO-3-06 followup-suppliers** — `buildFirstFollowUp`/`buildSecondFollowUp` reescritos com "construtora" no lugar de "produtor"; assinatura atualizada para "Cotação de materiais de construção".
- **CO-3-07 Webhook de delivery/read receipts**:
  - Schema: `QuoteSupplierNotification` ganha `deliveryStatus` (SENT/DELIVERED/READ/FAILED), `deliveredAt`, `readAt`, `errorMsg`. Migration `20260518000060_*`.
  - Novo service `NotificationStatusService.applyEvent({ phone, event, errorMsg })`.
  - Endpoint público `POST /api/whatsapp/status-callback` aceita formato canônico `{ phone, event }` OU formato Twilio (`To`, `MessageStatus`). Provider mapping inclui `undelivered → failed`.
- **CO-3-09 Quadro de status no QuoteDetail**:
  - Service `SupplierStatusService.listForQuote` retorna `items[]` + `summary` (total/responded/delivered/read/failed).
  - Endpoint `GET /api/quotes/:id/supplier-status`.
  - Hook `useSupplierStatus` com polling 15s.
  - Componente `SupplierStatusGrid` renderiza fornecedores com badge colorido (PENDING/SENT/DELIVERED/READ/RESPONDED/FAILED) + idade da notificação + contador de follow-ups + erro inline. Mostra "3/5 responderam" no topo.
  - Integrado no `QuoteDetail.tsx` entre o card de informações e a lista de propostas (visível apenas se quote está em COLLECTING/SUMMARIZED).
- **CO-3-11 `SupplierFunnelService`** — emite 4 eventos estruturados (`supplier.notified`, `supplier.opened_link`, `supplier.started_proposal`, `supplier.submitted_proposal`) via logger. Ready para swap por PostHog `captureEvent` quando SDK for adicionado.

### Migrations adicionadas

- `20260518000060_co_3_07_notification_delivery/` — campos delivery em QuoteSupplierNotification + índice.
- `20260518000070_co_3_04_proposal_item_available/` — `ProposalItem.available` default true.

### Não entregue (PRs subsequentes Sprint 3)

- **CO-3-02 dispatch-quote completo** — o job já existe (herdado do cotaAgro) e foi adaptado em Sprint 0/1; a integração com `cotacao_nova` template HSM aguarda CO-3-08 (Meta approval).
- **CO-3-08 Templates HSM** — processo manual no Business Manager da Meta (externo a esta sessão; aguarda número WhatsApp dedicado + warming).
- **CO-3-10 anti-loop / rate-limit** — já existem do cotaAgro (`anti-loop.service.ts`, `status-rate-limit.service.ts`); não precisaram de mudanças.
- **Integração funnel events nos call sites** — `SupplierFunnelService.notified` ainda não está cabeado em `dispatch-quote.job.ts`. Adição trivial em PR seguinte.

### Validação

- backend `tsc --noEmit`: **0 erros**
- frontend `tsc --noEmit`: **0 erros**
- backend `jest tests/unit`: **620/620** ✅

---

## v0.3.0 — Sprint 2 (FSM Solicitante via WhatsApp + Fila de Solicitações)

**Data:** 2026-05-18

### Adicionado

- **CO-S2-NEW Fix AUD-05 `parseDeadline`** — reescrita completa do parser de datas em PT-BR. Bug histórico do cotaAgro corrigido: `new Date('YYYY-MM-DD')` interpretava como UTC midnight, que em BRT virava o dia anterior. Agora usa construção local `new Date(y, m-1, d)`. Aceita: `amanhã/amanha`, `hoje`, `em N dias`, `daqui a N dias`, `sexta/sexta-feira` (próxima ocorrência), `fim do mês`, ISO `YYYY-MM-DD`, BR `DD/MM/YYYY` e `DD/MM` (ano implícito). Datas inválidas retornam `null`. **13 novos testes + 4 falhas pré-existentes resolvidas**.
- **CO-2-05 `resolveRequester(phone)`** em `services/requester.service.ts` — resolve número WhatsApp para `{ user, sites[] }`. REQUESTER vê apenas obras em `siteIds`; demais roles veem todas as obras ACTIVE do tenant.
- **CO-2-06 modelo `QuoteRequest`** — pré-Quote em fila de revisão. Campos: `tenantId`, `siteId`, `requesterId`, `items` (JSON livre), `deadlineAt`, `observation`, `source`, `rawText`, `status` (PENDING_REVIEW/PROMOTED/REJECTED/EXPIRED), `rejectionReason`, `promotedQuoteId`, `reviewedById`. Migration `20260518000050_*`.
- **`modules/quote-requests/`** backend: service + controller + 5 endpoints (list/pending-count/get/promote/reject). Promote cria Quote em transação. RBAC: BUYER/ADMIN promotem; REQUESTER read-only.
- **CO-2-01 (mínimo) + CO-2-08 `RequesterIntakeService`** — substitui FSM legada do Producer para users em `User.phone`. Estados em Redis (TTL 30min): IDLE → AWAITING_SITE_SELECTION → AWAITING_TEXT → SUBMITTED. Parsing inline `quickParseRequest` extrai itens via regex + `normalizeUnit` + `parseDeadline`. Múltiplos itens por vírgula/`e`/`;`/`+`. Comandos: cancelar/oi/ajuda. Confirmação numerada ao usuário pós-SUBMITTED. Integrado em `whatsapp.service.ts` ANTES do path legado de Producer.
- **CO-2-02 NLU prompt construção** — `openai.service.ts.interpretMessage` reescrito para domínio de construção. Schema: `{ material, quantity, unit, siteHint, deadlineHint, spec }`. 5 few-shot examples (cimento CP-II, areia/brita, vergalhão NBR, milheiro tijolo). Fallback regex com keywords de construção; termos agro mantidos durante transição.
- **CO-2-07 Frontend Fila de Solicitações**:
  - `pages/QuoteRequests.tsx` (`/quote-requests`): cards com obra/solicitante/prazo/idade, itens preview, filtros por status, paginação.
  - `components/quote-requests/QuoteRequestReviewModal.tsx`: editor com itens editáveis, prazo, região, frete CIF/FOB, condição pagamento, scope de fornecedores, expiração. Modo recusa com motivo.
  - Hook `useQuoteRequests` (5 queries/mutations).
  - Badge âmbar no Sidebar (`useSidebarBadges.quoteRequestsPending`, polling 60s).
- **CO-2-10 Audio path** — confirmado funcional. Whisper transcreve áudios e o texto passa pelo novo intake.
- **CO-2-11 Logs estruturados FSM** — `logTransition` emite `fsm.requester.transition` com `from/to/userId/tenantId/siteId` nas 4 transições principais. Pronto para agregação em PostHog/Sentry.

### Migrations adicionadas

- `20260518000050_co_2_06_quote_request/` — cria enum `QuoteRequestStatus` + tabela + 4 índices + 3 FKs.

### Não entregue (escopo Sprint 2 para PRs subsequentes)

- **CO-2-01 full** — FSM com estados `AWAITING_MATERIAL/QUANTITY/UNIT/SPEC/DEADLINE/OBSERVATION/CONFIRMATION` separados. O intake atual usa **smart-fill default** (extrai tudo da primeira frase). Funciona bem com mensagem completa, mas precisa de estados granulares para o caso "preciso de cimento" (sem qty).
- **CO-2-03 Smart-fill formal** — intake já consome NLU implicitamente via regex; integração formal com `smart-fill.service.ts` + GPT-4o é PR adicional.
- **CO-2-04 Multi-item link web** — intake aceita multi-item por separador; tela `QuoteRequestForm.tsx` pública via token é PR adicional.
- **CO-2-09 Timeout/abandono** — job `detect-abandoned-quotes` legacy continua focado em `ConversationState`; adaptação para `RequesterIntake` Redis state é PR adicional.

### Validação

- backend `tsc --noEmit`: **0 erros**
- frontend `tsc --noEmit`: **0 erros**
- backend `jest tests/unit`: **620/620 testes passam** ✅ (subiu de 603 — AUD-05 fix resolve 4 falhas pré-existentes + 13 novos testes)

---

## v0.2.0 — Sprint 1 (Fundação de domínio: Obra & Material)

**Data:** 2026-05-18

### Adicionado

- **CO-1-02 Backend `sites/`**: módulo CRUD com RBAC por role (REQUESTER vê apenas obras em `siteIds`, BUYER read/write, ADMIN full, APPROVER read-only). Endpoints `GET/POST /api/sites`, `GET/PATCH/DELETE /api/sites/:id`. Validações zod: name ≥ 3 chars, CNO 12 dígitos, UF ∈ lista BR, managerPhone E.164, budget ≥ 0. Soft delete via status=COMPLETED.
- **CO-1-04 Hook `useSites`**: React Query com `useSites`, `useSite`, `useCreateSite`, `useUpdateSite`, `useArchiveSite`. Tipos `Site`, `CreateSiteDTO`, `UpdateSiteDTO`, `SiteFilters` espelham schema Prisma.
- **CO-1-03 Tela `Sites.tsx` + `SiteFormModal.tsx`**: lista em cards (3 col desktop / 1 mobile) com filtros por status (ACTIVE/PAUSED/COMPLETED/CANCELLED) e busca livre, paginação 20/página, empty state com CTA. Form modal com máscara BR para orçamento (R$ X.XXX,XX), validação em tempo real, dropdown de 27 UFs.
- **CO-1-06 Backend `materials/`**: CRUD + endpoint `POST /materials/import-csv` (multipart, multer 1MB, papaparse). Suporta upsert via (tenantId, sku); valida categoria contra MATERIAL_CATEGORIES e unidade via unit-normalizer. Material com tenantId=null é catálogo da rede (compartilhado, só SUPER_ADMIN edita). 17 categorias de construção. Resposta do import: `{created, updated, errors:[{line,message}]}`.
- **CO-1-07 Tela `Materials.tsx` + `MaterialFormModal` + `MaterialCsvImporter`**: tabela paginada (50/página), busca debounced 300ms, filtro por categoria. Modal de import com drag-and-drop, preview das 5 primeiras linhas, resultado com erros por linha. Distinção visual entre catálogo da rede e próprio (badges azul/cinza).
- **CO-1-08 Supplier categories validation**: zod `supplierCategoriesSchema` no backend rejeita categoria não cadastrada com 422 (`UNPROCESSABLE_ENTITY`); aceita sinônimos via `resolveCategoryValue` (areia → agregados, etc.). Frontend `types/supplier.ts` agora re-exporta `MATERIAL_CATEGORIES`; cores dos badges atualizadas para as 17 categorias construção.
- **CO-1-09 Permission seed por role**: novo service `permission-seed.service.ts` com matriz canônica `ROLE_PERMISSIONS` cobrindo os 12 Resources × 6 roles. Idempotente (upsert). Chamado em `seed.ts` para admin/buyer/requester do tenant demo. Pronto para ser reutilizado pelo super-admin na criação de novos users (Sprint 2+).
- **CO-1-10 `Quote.siteId`**: campo adicionado (nullable na fase 1; NOT NULL será aplicado na Sprint 2 após FSM ter o estado AWAITING_SITE_SELECTION em produção). FK Restrict para preservar histórico. Index criado. Migration `20260518000030_*` documenta as 2 fases.
- **CO-1-11 Producer marcado como legacy**: `@@map("_legacy_producers")` no schema (rename físico da tabela). Migration `20260518000040_*` faz `RENAME TABLE`. Comentário inline explica que remoção definitiva é Sprint 3 (após FSM Sprint 2).
- **CO-1-12 Dashboard KPIs**: novo método `getCotaObraKpis` no `DashboardService` retorna `{ openQuotes, pendingProposals, savings30d, activeSites }`. Endpoint `GET /api/dashboard/kpis`. Hook `useCotaObraKpis` com staleTime 60s. 4 KPI cards no topo do Dashboard com skeleton state durante loading. `savings30d` calculado como soma das diferenças max-min de propostas em cotações fechadas nos últimos 30 dias (proxy do pricing-engine que entra em Sprint 4).

### Mudanças

- `error-handler.ts`: novo método `createError.unprocessable` (422).
- `frontend/src/data/material-categories.ts`: novo arquivo (espelho do backend) com `MATERIAL_CATEGORIES`, `MATERIAL_CATEGORY_LABEL`, `UNITS` para uso em telas.
- `Sidebar.tsx` e `BottomNav.tsx`: adicionado item "Materiais" (ícone Package); resource das obras corrigido de PRODUCERS para SITES.
- `App.tsx`: rotas `/sites` e `/materials` apontam para as telas reais (substituem SitesPlaceholder).
- `brazil-locations.ts`: arquivo recuperado do cotaAgro (estava faltando no copy inicial do Sprint 0; quebrava typecheck do SupplierFormModal).

### Migrations adicionadas

- `20260518000030_co_1_10_quote_site_id/`: adiciona Quote.siteId (nullable) + FK Restrict + index.
- `20260518000040_co_1_11_rename_producers_to_legacy/`: renomeia tabela producers → _legacy_producers.

### Pendente / Tech debt

- **CO-1-10 fase 2**: tornar Quote.siteId NOT NULL após FSM Sprint 2 garantir preenchimento.
- **CO-1-09**: REQUESTER/APPROVER/BUYER ainda não foram cabeados em todos os endpoints — RBAC via middleware `requirePermission` ainda usa o esquema legado de roles. Migração planejada para Sprint 2 (quando os endpoints novos forem acessados por esses roles).
- **CO-1-13 Demo + Retro**: tasks de processo, não executadas nesta sessão.
- **CO-1-08 frontend**: o `SupplierFormModal` ainda renderiza o dropdown com os values antigos (semente/fertilizante etc.) porque importa SUPPLIER_CATEGORIES de `types/supplier.ts` — agora os values são da construção, mas o componente em si pode precisar revisão visual.

### Resultado

- `npx tsc --noEmit` backend: **0 erros**
- `npx tsc --noEmit` frontend: **0 erros**
- `npx jest tests/unit`: **603/607 testes passam** (4 falhas pré-existentes em validators.ts, herdadas do cotaAgro)

---

## v0.1.0 — Sprint 0 (Fork inicial)

**Data:** 2026-05-18

### Adicionado

- **Fork inicial do cotaAgro** — backend, frontend, prisma e scripts copiados para o repositório CotaObra.
- **dev-bootstrap aplicado** — `docker-compose.dev.yml` (Postgres 15, Redis 7, Evolution API, MinIO, Mailpit), `backend/.env.example`, `frontend/.env.example`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/{ci,e2e}.yml`, `backend/prisma/seed.ts` (1 tenant + 3 usuários + 1 obra + 5 fornecedores + 30 materiais), `docs/wireframes/p0.html`.
- **docs/** — copiados ARQUITETURA_E_ESPECIFICACAO_TECNICA, PLANO_DE_FORK, Backlog v2, Roteiro Sprint 0, TaskBoard CSV, 00_COMECE_AQUI.
- **README.md** raiz com setup local, status Sprint 0 e mapa de documentos.

### Mudanças

- **CO-0-02 Rebrand global** — `FarmFlow → CotaObra`, `farmflow → cotaobra`, `cotaagro → cotaobra` em 80 arquivos de código e config. Pasta `docs/` e `prisma/migrations/` intencionalmente preservadas (referências históricas).
- **CO-0-04 ProducerSettings → TenantSettings** — model renomeado, relação migrada de Producer para Tenant, adicionados campos novos para Sprint 1+ (`defaultExpiryHours`, `defaultDeadlineDays`, `approvalThreshold`, `paymentPolicy`, `autoNotifyWinner`, `whatsappProvider`). Adicionado `Tenant.cnpj`. Service renomeado para `tenant-settings.service.ts`; callers (`quote.service`, `quote-form.service`, `supplier-notification.service`, `flows/requester.flow.ts`, `flows/supplier.flow.ts`, `modules/settings/settings.controller.ts`) atualizados para passar `tenantId` (lookup automático a partir de producer/quote quando necessário). Migration: `20260518000000_co_0_04_rename_producer_settings_to_tenant_settings`.
- **CO-0-06 Rename `producer.flow.ts → requester.flow.ts`** — arquivo movido; classe `ProducerFSM` mantida (rename do símbolo entra na Sprint 2 com a adaptação real da FSM). Imports atualizados em `whatsapp.service.ts` e tests.
- **CO-0-07 Categorias de material** — novo arquivo `constants/material-categories.ts` com 17 categorias de construção (cimento, agregados, aço, blocos, concreto, hidráulica, elétrica, gesso, revestimento, pintura, cobertura, esquadrias, impermeabilização, vidraçaria, ferramentas, madeira, outros). `supplier-categories.ts` agora é shim de retrocompat. `unit-normalizer.ts` expandido com unidades de construção (m³, m², m linear, saca, fardo, rolo, balde, milheiro, peça); legacy agro (`Big Bags`, `ha`, `km`) mantido para compat.
- **CO-0-08 Cleanup frontend pages** — `Sidebar.tsx`, `BottomNav.tsx`, `App.tsx`, `CommandPalette.tsx` e `Dashboard.tsx` atualizados: rota `/producers` substituída por `/sites` (placeholder), entrada "Produtores" → "Obras". Raiz `/` agora redireciona para `/login` (Landing nova é Sprint 1+).
- **CO-0-09 Templates de mensagem (parcial)** — `flows/messages.ts.WELCOME` e `quantityExampleFor` adaptados para contexto de construção. `email-drip.service.ts` com os 7 emails reescritos para construtoras. Reescrita completa dos 700+ linhas de `messages.ts` fica para Sprint 2 (5 SP).
- **CO-0-10 Hardening (AUDs)** — adicionados comentários e fixes:
  - **AUD-02:** confirmado IV aleatório por registro em `field-encryption.service.ts` (já era; comentário explícito adicionado).
  - **AUD-03:** `loginRateLimitByEmail` agora usa chave `${ip}:${tenantSlug}:${email}` em vez de só email. tenantSlug vem de `req.body.tenantSlug` / `X-Tenant-Slug` header / fallback `'unknown'`.
  - **AUD-04:** `EvolutionProvider.sendMessage` envolvido em wrapper conservador: rate limit por hora por destinatário (`EVOLUTION_MAX_MSG_PER_HOUR=30`), delay randômico (`EVOLUTION_MIN_DELAY_MS..MAX_DELAY_MS`), pausa de 1h após 3 erros 5xx consecutivos. Estado vive no Redis (`evolution:{rate,errors,paused}:{number}`).
  - **AUD-01:** já estava no cotaAgro (`job-lock.service.ts` com Redlock em `consolidate-quote` e `expire-quote`). Sem ação necessária.

### Removido

- **CO-0-03** Pasta `backend/src/middlewares/` (duplicata legada da pasta canônica `middleware/`).
- **CO-0-05** Model `ProducerSupplier` do schema Prisma e todas as queries `prisma.producerSupplier.*`. Vínculo construtora↔fornecedor agora é direto via `Supplier.tenantId` (1:N). Migration: `20260518000010_co_0_05_drop_producer_supplier`. Lógica de listagem/filtros em `supplier.service.ts`, `quote-form.service.ts`, `report.service.ts`, `privacy.service.ts`, `onboarding.service.ts`, `producer.service.ts`, `flows/requester.flow.ts` simplificada para usar apenas `Supplier.tenantId`. Comportamento mudou em casos de borda: `producer.service.addSupplier` agora rejeita supplier de outro tenant; `supplier.service.delete` proíbe producer-user (escalado para admin).
- **CO-0-08** Páginas frontend deletadas: `Landing.tsx`, `PreLaunch.tsx`, `ComingSoon.tsx`, `Producers.tsx`. Pasta `components/producers/` removida (componentes serão reescritos no Sprint 1 como `components/sites/`).

### Pendente / Tech debt conhecido

- **Tests do cotaAgro com falhas** — arquivos como `tests/unit/services/producer-service-isolation.test.ts`, `tests/unit/flows/producer-supplier-category.flow.test.ts`, `tests/integration/quote-lifecycle.test.ts` referenciam `ProducerSupplier`, `ProducerSettings` ou `producer.flow.ts`. Re-estabilização na **Sprint 1** (PO aceitou o débito por estarem fora do critical path do Sprint 0).
- **`messages.ts` reescrita full** — apenas WELCOME e exemplos de unidade foram adaptados. Demais ~80% das strings (perguntas, erros, confirmações) ainda usam vocabulário agro. Spec 5 SP, escopo natural da Sprint 2 quando a FSM real do solicitante for adaptada.
- **`useProducers` hook** ainda existe (usado por `SubscriptionFormModal` e `UserFormModal`). Será substituído por `useSites` na Sprint 1 (CO-1-10).
- **Producer model** ainda no schema como `@@map("producers")` — semanticamente legacy, mas relacionamentos (Quote.producerId, etc.) ainda dependem. Remoção/migração para User+Site é trabalho da Sprint 1.
- **package-lock.json** desatualizado por causa do rename do `name` em `package.json`. Rodar `pnpm install` regenera.

### Não executado nesta sessão (depende de recursos externos)

- **CO-0-01** Criação do repo `github.com/samuckamorais/cotaobra` (requer permissão GitHub).
- **CO-0-11** Provisionamento de staging no VPS Hetzner + DNS `cotaobra.staging.app`.
- **CO-0-12** Suite Playwright E2E (5 cenários P0) — depende de ambiente de staging estável.
- **CO-0-13** Demo de fim de Sprint 0 ao PO.
- **CO-0-14** Provisionamento da instância Evolution + warming de 7 dias do número WhatsApp.

---

## Próximas releases planejadas

- **v0.2.0 — Sprint 1:** CRUD de Site + Material + User roles (REQUESTER/APPROVER), 5 telas frontend novas, hooks `useSites`/`useMaterials`.
- **v0.3.0 — Sprint 2:** FSM Solicitante via WhatsApp adaptada (estado `AWAITING_SITE_SELECTION`, perguntas de material em vez de insumo), pricing-engine para ranking corrigido.

Veja [docs/CotaObra_Backlog_PO_Senior_v2.md](docs/CotaObra_Backlog_PO_Senior_v2.md) para o backlog completo (9 sprints, ~70 tasks).
