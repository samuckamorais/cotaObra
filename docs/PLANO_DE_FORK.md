# CotaObra — Plano de Fork do CotaAgro

Plano arquivo-por-arquivo para forkar o cotaAgro como ponto de partida do CotaObra.
Autor: BO Sênior (Claude) — Data: 18 de maio de 2026 — Versão: 1.0
Repositório fonte: `C:\Workstation\cotaAgro`
Repositório destino: `C:\Workstation\cotaObra` (a criar)
Pasta de produto: `G:\Meu Drive\CotaObra\CotaObra` (apenas documentos)

---

## 1. Convenções deste documento

Cada arquivo ou pasta recebe um dos cinco rótulos:

- **COPY** — copia como está. No máximo refactor de string `FarmFlow` → `CotaObra` automatizado.
- **RENAME** — renomeia arquivo/identificador (por exemplo `Producer` → `Requester`), preservando lógica.
- **ADAPT** — código muda significativamente. Estimativa de horas indicada.
- **NEW** — não existe no cotaAgro, criar do zero.
- **DELETE** — não vai pro MVP do CotaObra.

A coluna "Esforço" usa story points (1 SP ≈ 2h–4h de trabalho focado).

---

## 2. Estratégia geral do fork

### 2.1 Princípios
- Não tocar no cotaAgro original. Trabalhar sempre em fork (`cotaObra`) como repositório separado.
- Preservar o histórico git do cotaAgro no fork — futuro cherry-pick de fixes nos dois sentidos é mais barato com histórico comum.
- Refactor de nomes em PRs pequenos e isolados (1 conceito por PR) para revisão eficiente.
- Bater verde no CI a cada PR (mesmo o sprint 0 de renomeação).
- Não adicionar features novas durante o sprint 0. Apenas renomeação e limpeza.

### 2.2 Comandos iniciais (executar uma vez)
```bash
cd C:\Workstation
git clone cotaAgro cotaObra
cd cotaObra
git remote rename origin upstream-cotaagro
git remote add origin https://github.com/samuckamorais/cotaobra.git
git checkout -b sprint-0/refactor-cotaobra
```

### 2.3 Mapa global de renomeação semântica

Estes pares de renomeação aparecem dezenas/centenas de vezes no código. Executar com `git grep` + `sed -i` em batches isolados, um PR por par.

| De (cotaAgro) | Para (cotaObra) | Motivo |
|---|---|---|
| `FarmFlow` (string em logs, README, .env.example) | `CotaObra` | Branding |
| `farmflow` (slugs, urls, IDs em testes) | `cotaobra` | Branding |
| `cotaagro` (nome do banco, do storage bucket) | `cotaobra` | Branding |
| `Producer` (entidade) | `User` com `role=REQUESTER` + `Site` separado | Domínio (ver §3) |
| `producer.flow.ts` | `requester.flow.ts` | FSM tem semântica diferente |
| `producers` (rota `/api/producers`) | `users` (já existe) + `sites` (nova) | Endpoint |
| `supplier-categories.ts` (sementes, fertilizantes…) | `material-categories.ts` (cimento, agregados…) | Domínio |
| `culturas` (atributo do produtor) | descartar; obra não tem cultura | Domínio |
| `regiao agrícola` | `região de obra` (livre) | Domínio |
| `insumos` | `materiais` | Domínio |

A primeira passada manual identificou ~860 ocorrências de "FarmFlow" + "farmflow" + "cotaagro" no código (excluindo node_modules), distribuídas em ~140 arquivos. Plano realista: 2–3 dias de refactor mecânico (sed + revisão manual onde o contexto importa, como strings de UI para o usuário final).

---

## 3. Schema Prisma — delta detalhado

O `schema.prisma` do cotaAgro tem **25 modelos** e **39 migrations**. Análise modelo a modelo:

| Modelo cotaAgro | Ação | Justificativa |
|---|---|---|
| `Tenant` | **COPY** | Manter. Adicionar campo `cnpj` opcional (já tem `email`). |
| `WhatsAppConfig` | **COPY** | Funciona igual. Provider continua sendo twilio/evolution/meta. |
| `WhatsAppConfigLog` | **COPY** | Auditoria de mudanças. |
| `Producer` | **DELETE + MIGRAR** | Substituído por `User` (já existe) e `Site` (nova entidade). |
| `ProducerSettings` | **RENAME → `TenantSettings`** | Configurações migram para nível de tenant, não usuário. |
| `ProducerSupplier` | **DELETE** | Construtora não tem fornecedores "preferidos por usuário"; é por tenant. Substituído por `Supplier.tenantId`. |
| `QuoteTemplate` | **COPY + RENAME** | Mantém estrutura, vincula a `User` em vez de `Producer`. |
| `Supplier` | **ADAPT** | Mantém estrutura, troca `categories` string[] para usar o novo enum/lista de materiais (cimento, agregados, aço…). 2 SP. |
| `Quote` | **ADAPT** | Adicionar `siteId` (FK obrigatória), `freightMode (CIF/FOB)`, `approvalStatus`, remover `culturaId` ou similar. 5 SP. |
| `QuoteItem` | **COPY** | Já existe e modela multi-item exatamente como precisamos. |
| `Proposal` | **ADAPT** | Adicionar `correctedTotal`, `rank` (já tem isWinner). 2 SP. |
| `ProposalItem` | **COPY** | Excelente: já modela proposta por item. |
| `SupplierConversationState` | **COPY** | Já fixed (TASK 1.2 do cotaAgro). |
| `ConversationState` | **COPY** | Pra estado da FSM do solicitante. |
| `QuoteSupplierNotification` | **COPY** | Tracking de envio + delivery + read receipts. |
| `Lead` | **COPY** | Para landing page de aquisição. |
| `QuoteToken` | **COPY** | Para multi-item form. |
| `ProposalToken` | **COPY** | Para form de proposta do fornecedor. |
| `Subscription` | **ADAPT** | Trocar enum de planos (BASIC/PRO/ENTERPRISE → STARTER/PRO/ENTERPRISE com novos limites e preços). Adicionar `sitesLimit`. 2 SP. |
| `ConversationMetric` | **COPY** | A/B testing de fluxo conversacional. |
| `Experiment` | **COPY** | Idem. |
| `ExperimentAssignment` | **COPY** | Idem. |
| `User` | **ADAPT** | Adicionar role `REQUESTER` e `APPROVER` no enum Role. Adicionar campo opcional `siteIds` (obras que pode solicitar). 2 SP. |
| `AuditLog` | **COPY** | Maduro. |
| `Permission` | **COPY** | RBAC granular. |
| **NOVO**: `Site` | **NEW** | Obra/canteiro. CRUD + relacionamento com Quote, User. 5 SP. |
| **NOVO**: `Material` | **NEW** | Catálogo de SKUs de construção. Com `tenantId` opcional (null = rede compartilhada). 5 SP. |
| **NOVO**: `PurchaseOrder` | **NEW** | Pedido gerado pós-cotação, separado do Quote. 3 SP. |
| **NOVO**: `Approval` | **NEW** | Fila de aprovação para compras acima do teto. 3 SP. |
| **NOVO**: `PriceHistoryAggregate` | **NEW** | Tabela materializada de histórico de preços (cron diário). 2 SP. |

Total schema: aproveitamento ~80%. Esforço de adaptação: ~31 SP.

**Migration plan**:
1. Sprint 0 PR1: rename `ProducerSettings` → `TenantSettings`, remover `ProducerSupplier`, fazer Producer entidade ‘deprecated’ (`@@map("_legacy_producers")`).
2. Sprint 1 PR1: criar Site + relacionamento com Quote (Quote.siteId nullable inicialmente, depois NOT NULL após migração de dados).
3. Sprint 1 PR2: criar Material + seed inicial.
4. Sprint 1 PR3: criar PurchaseOrder + extrair lógica de fechamento do Quote.
5. Sprint 2 PR1: criar Approval + workflow.
6. Sprint 6 PR1: criar PriceHistoryAggregate + cron de atualização.

---

## 4. Backend — arquivo por arquivo

### 4.1 `backend/src/config/`

| Arquivo | Ação | Notas |
|---|---|---|
| `database.ts` | **COPY** | Prisma client singleton. |
| `env.ts` | **ADAPT** | Adicionar `ASAAS_API_KEY`, `ERP_WEBHOOK_*`. Remover variáveis cotaAgro não usadas. 0.5 SP. |
| `plans.ts` | **ADAPT** | Trocar definição de planos (preços + limites). 1 SP. |
| `redis.ts` | **COPY** | Cliente Redis singleton. |

### 4.2 `backend/src/utils/`

| Arquivo | Ação | Notas |
|---|---|---|
| `auth-context.ts` | **COPY** | AsyncLocalStorage de tenantId/userId. |
| `category-normalizer.ts` | **ADAPT** | Normaliza categorias de material (cimento, areia, brita…). Substituir lista. 1 SP. |
| `error-handler.ts` | **COPY** | Classes de erro custom. |
| `fuzzy-match.ts` | **COPY** | Match aproximado para NLU. |
| `logger.ts` | **COPY** | Winston estruturado. |
| `password-generator.ts` | **COPY** | OK. |
| `password-strength.ts` | **COPY** | OK. |
| `phone.ts` | **COPY** | Validação BR. |
| `totp.ts` | **COPY** | 2FA. |
| `unit-normalizer.ts` | **ADAPT** | Trocar unidades aceitas: kg, t, m³, m², saca, peça, vergalhão, m linear. 1 SP. |
| `validators.ts` | **COPY** | Validators Zod genéricos. |

### 4.3 `backend/src/middleware/`

Pasta `middleware/` é a oficial; pasta `middlewares/` (com s) é legacy duplicado — durante o sprint 0 deletar `middlewares/` e ajustar imports (0.5 SP).

| Arquivo | Ação |
|---|---|
| `auth.middleware.ts` | **COPY** |
| `error.middleware.ts` | **COPY** |
| `force-password-change.middleware.ts` | **COPY** |
| `permissions.middleware.ts` | **COPY** |
| `rate-limit.middleware.ts` | **COPY** |
| `rbac.middleware.ts` | **COPY** |
| `require-2fa.middleware.ts` | **COPY** |
| `tenant.middleware.ts` | **COPY** |
| `with-reason.middleware.ts` | **COPY** |

### 4.4 `backend/src/lib/`

| Arquivo | Ação |
|---|---|
| `sse-manager.ts` | **COPY** (preparar consumo no frontend depois) |

### 4.5 `backend/src/constants/` e `backend/src/data/`

| Arquivo | Ação | Notas |
|---|---|---|
| `supplier-categories.ts` | **ADAPT → `material-categories.ts`** | Substituir lista do agro pela lista da construção (ver §8). 1 SP. |
| `brazil-regions.ts` | **COPY** | Continua útil. |

### 4.6 `backend/src/flows/`

| Arquivo | Ação | Notas |
|---|---|---|
| `fsm.ts` | **COPY** | Motor de FSM genérico. |
| `messages.ts` | **ADAPT** | Reescrever templates de mensagem WhatsApp para o contexto de construção. ~80% das strings mudam. 5 SP. |
| `producer.flow.ts` | **ADAPT → `requester.flow.ts`** | Manter motor; adicionar estado `AWAITING_SITE_SELECTION` no início; mudar perguntas (insumo → material; cultura → especificação). 8 SP. |
| `supplier.flow.ts` | **ADAPT** | Manter estrutura; ajustar prompts e validações para preço por item + condições de pagamento típicas (à vista, 28dd, 28/56dd, 30/60/90dd). 3 SP. |

### 4.7 `backend/src/jobs/`

| Arquivo | Ação | Notas |
|---|---|---|
| `collect-ratings.job.ts` | **COPY** | Coleta avaliações pós-cotação. |
| `consolidate-quote.job.ts` | **ADAPT** | Plugar `pricing-engine.ts` para calcular ranking corrigido em vez de só menor preço. 5 SP. |
| `data-retention.job.ts` | **COPY** | LGPD. |
| `detect-abandoned-quotes.job.ts` | **COPY** | Recupera cotações que travaram na FSM. |
| `dispatch-quote.job.ts` | **ADAPT** | Adicionar sugestão automática de fornecedores por categoria + região da Obra. 3 SP. |
| `email-drip.job.ts` | **COPY** | Sequência de boas-vindas. |
| `expire-quotes.job.ts` | **COPY** | Lock distribuído já tem. |
| `expire-supplier-states.job.ts` | **COPY** | Limpa Redis. |
| `followup-suppliers.job.ts` | **COPY** | Lembrete HSM. |
| `generate-quote-pdf.job.ts` | **ADAPT → `generate-purchase-order-pdf.job.ts`** | Mudar template do PDF para formato de Ordem de Compra. 5 SP. |
| `proactive-quotes.job.ts` | **DELETE no MVP** | Disparo proativo por preço do agro (não se aplica). Voltar como feature futura. |
| `queue.config.ts` | **COPY** | Configuração Bull. |
| `reset-quotas.job.ts` | **COPY** | Reset mensal de quotas do plano. |
| `scheduled-reports.job.ts` | **COPY** | Já bom; finalizar envio por email no sprint 7 (gap conhecido do cotaAgro). |

### 4.8 `backend/src/services/` (40+ services)

| Arquivo | Ação | Notas |
|---|---|---|
| `analytics.service.ts` | **COPY** | Wrapper PostHog. |
| `anti-loop.service.ts` | **COPY** | Anti-loop de FSM. |
| `audio-transcription.service.ts` | **COPY** | Whisper transcrição (engenheiro provavelmente vai mandar áudio — pertinente!). |
| `audit-log.service.ts` | **COPY** | |
| `auth-token.service.ts` | **COPY** | |
| `contact-extractor.service.ts` | **COPY** | NLU de contato em mensagem. |
| `credentials-encryptor.service.ts` | **COPY** | AES-256-GCM. |
| `email-drip.service.ts` | **ADAPT** | Trocar conteúdo dos emails (5 emails da sequência). 3 SP. |
| `email.service.ts` | **COPY** | Nodemailer wrapper. |
| `feature-flags.service.ts` | **COPY** | |
| `field-encryption.service.ts` | **COPY** | LGPD para CPF/CNPJ. |
| `fsm-event.service.ts` | **COPY** | Eventos da FSM. |
| `fuzzy-match.service.ts` | **COPY** | |
| `inline-edit-advanced.service.ts` | **COPY** | Inline editing na conversa. |
| `inline-edit.service.ts` | **COPY** | |
| `job-lock.service.ts` | **COPY** | Redlock — fix já aplicado. |
| `metrics.service.ts` | **COPY** | |
| `mid-flow-buffer.service.ts` | **COPY** | Buffer de FSM. |
| `nlu-extractor.service.ts` | **ADAPT** | Re-treinar prompt do GPT-4o para entidades de construção: material, qty, unit, obra, deadline, spec. 3 SP. |
| `nlu-types.ts` | **ADAPT** | Tipos derivados. 1 SP. |
| `onboarding.service.ts` | **ADAPT** | Adaptar walkthrough: 1ª cotação demo de cimento + areia. 3 SP. |
| `openai.service.ts` | **COPY** | Wrapper genérico. |
| `otp.service.ts` | **COPY** | |
| `pattern-detection.service.ts` | **COPY** | |
| `pdf-generation.service.ts` | **ADAPT** | Template de OC novo. 3 SP. Ver `templates/`. |
| `producer-settings.service.ts` | **RENAME → `tenant-settings.service.ts`** | Settings movem para nível de tenant. 2 SP. |
| `product-category.service.ts` | **ADAPT** | Categorias de construção. 2 SP. |
| `proposal-token.service.ts` | **COPY** | |
| `quote-results.service.ts` | **ADAPT** | Adicionar quadro comparativo por item + cálculo corrigido. 3 SP. |
| `quote-status.service.ts` | **ADAPT** | Adicionar estados `AWAITING_BUYER_REVIEW` e `AWAITING_APPROVAL`. 2 SP. |
| `quote-token.service.ts` | **COPY** | |
| `rating.service.ts` | **COPY** | Rating de fornecedor. |
| `referral.service.ts` | **COPY** | Referral entre construtoras. |
| `refresh-pending-tokens.service.ts` | **COPY** | |
| `semantic-validator.service.ts` | **ADAPT** | Validação semântica de material (ex: rejeita "1000 sacas de cimento" se quantidade incoerente vs obra média). 2 SP. |
| `sentry.service.ts` | **ADAPT** | Hoje é stub no cotaAgro — implementar de verdade agora (mesma feature dos dois). 2 SP. |
| `smart-defaults.service.ts` | **ADAPT** | Defaults: prazo padrão, condição padrão. Ajustar para construção. 1 SP. |
| `smart-fill.service.ts` | **ADAPT** | Smart-fill agora pode preencher também a obra via match com `User.siteIds`. 2 SP. |
| `status-rate-limit.service.ts` | **COPY** | |
| `supplier-notification.service.ts` | **COPY** | |
| `supplier-state.service.ts` | **COPY** | |
| `whatsapp-config.service.ts` | **COPY** | |
| `storage/minio.storage.ts` | **COPY** | |
| **NOVO** `pricing-engine.service.ts` | **NEW** | Ranking corrigido. Função pure, testável. 3 SP. |
| **NOVO** `site.service.ts` | **NEW** | CRUD de Obra. 3 SP. |
| **NOVO** `material.service.ts` | **NEW** | CRUD do catálogo. 2 SP. |
| **NOVO** `purchase-order.service.ts` | **NEW** | Geração de OC. 3 SP. |
| **NOVO** `approval.service.ts` | **NEW** | Fluxo de aprovação. 3 SP. |
| **NOVO** `erp-webhook.service.ts` | **NEW** | Disparo signed para ERP. 3 SP. |

### 4.9 `backend/src/modules/`

Cada módulo é tipicamente `*.controller.ts` + `*.routes.ts` (ou similar). Vou agrupar por módulo.

| Módulo | Ação | Notas |
|---|---|---|
| `admin/` | **COPY** | Super-admin maduro. |
| `analytics/` | **COPY** | |
| `auth/` | **COPY** | Login, OTP, refresh, 2FA. Sólido. |
| `billing/` | **ADAPT** | Stub no cotaAgro — implementar Asaas (Pix recorrente). 5 SP. |
| `dashboard/` | **ADAPT** | Trocar KPIs do dashboard. 3 SP. |
| `docs/` | **COPY** | Geração de docs internos. |
| `events/` | **COPY** | Webhook receiver de events. |
| `health/` | **COPY** | |
| `leads/` | **COPY** | Captura de leads da landing. |
| `onboarding/` | **ADAPT** | Adaptar checklist (cadastrar obra, fornecedor, material, 1ª cotação, fechar). 3 SP. |
| `privacy/` | **COPY** | LGPD endpoints. |
| `producers/` | **DELETE + MIGRAR** | Funcionalidades migram para `users/` (com role REQUESTER) e novo `sites/`. 0 SP de criar, mas 3 SP de migração de rotas. |
| `product-category/` | **ADAPT → `material-category/`** | 2 SP. |
| `proposals/` | **COPY** | Recepção/leitura de propostas. |
| `quote-form/` | **COPY** | Form web público multi-item. |
| `quote-templates/` | **COPY** | Templates de cotação (favoritos). |
| `quotes/` | **ADAPT** | Adicionar dispatch com sugestão automática, close com split, integration com PurchaseOrder. 8 SP. |
| `referral/` | **COPY** | |
| `reports/` | **ADAPT** | Adaptar 5 relatórios para construção (manter estrutura, trocar agregações). Adicionar histórico de preço por material/região. 5 SP. |
| `settings/` | **RENAME → tenant-settings** | Migra para nível de tenant. 2 SP. |
| `subscriptions/` | **COPY** | |
| `supplier-dashboard/` | **COPY** | Dashboard que o fornecedor vê (acesso por link, sem login). |
| `suppliers/` | **ADAPT** | Trocar enum de categorias; remover lógica de "fornecedor por produtor" e usar "por tenant". 3 SP. |
| `users/` | **ADAPT** | Adicionar role REQUESTER e APPROVER no enum + UI. 2 SP. |
| `whatsapp/` | **COPY** | Webhook + providers. |
| `whatsapp-config/` | **COPY** | UI de config de WhatsApp por tenant. |
| **NOVO** `sites/` | **NEW** | CRUD de Obra + endpoints. 5 SP. |
| **NOVO** `materials/` | **NEW** | CRUD + import CSV. 5 SP. |
| **NOVO** `purchase-orders/` | **NEW** | Geração + listagem + PDF. 3 SP. |
| **NOVO** `approvals/` | **NEW** | Fila + workflow do diretor. 5 SP. |
| **NOVO** `integrations/` | **NEW** | Webhook outbound para ERP + config. 5 SP. |

### 4.10 `backend/src/templates/`

| Arquivo | Ação | Notas |
|---|---|---|
| `quote-pdf.template.ts` | **ADAPT → `purchase-order-pdf.template.ts`** | Reescrever layout: cabeçalho com dados da construtora, obra de destino, itens em tabela com unidade técnica (saca/m³/t), totais, condição. Mantém PDFKit + estrutura geral. 5 SP. |

### 4.11 `backend/src/@types/`, `cli/`, `scripts/`, `types/`

| Pasta | Ação |
|---|---|
| `@types/` | **COPY** (override de tipos de libs) |
| `cli/` | **COPY** (scripts CLI de manutenção) |
| `scripts/` | **COPY** (seeds, fixtures) — adaptar seed para materiais de construção (2 SP) |
| `types/` | **COPY** (tipos globais) |

### 4.12 `backend/prisma/`

| Item | Ação |
|---|---|
| `migrations/*` (39 atuais) | **COPY** preservar todas; nova migration inicial do CotaObra parte do estado atual. Cuidado: ao rodar `prisma migrate dev` no fork, vai criar uma migration combinada. Validar antes de mergear. |
| `seed.ts` | **ADAPT** seed inicial: 1 tenant demo, 3 usuários (admin+buyer+requester), 1 obra, 5 fornecedores, 30 materiais base. 3 SP. |

---

## 5. Frontend — arquivo por arquivo

### 5.1 `frontend/src/pages/`

| Arquivo | Ação | Notas |
|---|---|---|
| `ComingSoon.tsx` | **DELETE** ou **COPY** | Página estática. Manter se for útil pré-launch. |
| `Dashboard.tsx` | **ADAPT** | Novos KPIs (cotações abertas, economia 30d, SLA fornecedor, obras ativas). 3 SP. |
| `ForcedChangePassword.tsx` | **COPY** | |
| `ForgotPassword.tsx` | **COPY** | |
| `Landing.tsx` | **DELETE + REWRITE** | Landing nova específica do CotaObra. 5 SP. (pode ser stack diferente — Next.js estático) |
| `LeadsAdmin.tsx` | **COPY** | Listagem dos leads que vieram da landing. |
| `Login.tsx` | **COPY** | Trocar logo/marca. |
| `PreLaunch.tsx` | **DELETE** | Não usar agora. |
| `Producers.tsx` | **DELETE → SUBSTITUI POR `Sites.tsx`** | Sites é a nova tela. Producers vai virar parte de Users + Sites. |
| `ProposalForm.tsx` | **ADAPT** | Adicionar coluna "disponível" por item + ajustes de UI. 3 SP. |
| `QuoteDetail.tsx` | **ADAPT** | Quadro comparativo lado a lado + ações split. 8 SP (telona mais complexa do produto). |
| `QuoteForm.tsx` | **ADAPT** | Wizard 3 passos: obra, itens, fornecedores. 5 SP. |
| `QuoteResults.tsx` | **ADAPT** | Visão consolidada com ranking corrigido. 3 SP. |
| `Quotes.tsx` | **ADAPT** | Filtros: status, obra, comprador, período. 2 SP. |
| `Referral.tsx` | **COPY** | |
| `Reports.tsx` | **ADAPT** | 5 relatórios adaptados (ver §4.9). 3 SP. |
| `ResetPassword.tsx` | **COPY** | |
| `Settings.tsx` | **ADAPT** | Adicionar config de teto de aprovação, política de pagamento, ERP webhook URL. 3 SP. |
| `Signup.tsx` | **ADAPT** | Formulário de cadastro com campos: nome, empresa, CNPJ, cidade, #obras. 2 SP. |
| `Subscriptions.tsx` | **COPY** | Trocar planos. 1 SP. |
| `Suppliers.tsx` | **ADAPT** | Filtros por categoria (material de construção). 2 SP. |
| `Users.tsx` | **ADAPT** | Adicionar role REQUESTER e APPROVER, vincular siteIds. 3 SP. |
| `Verify2FA.tsx` | **COPY** | |
| `WhatsAppConfig.tsx` | **COPY** | |
| `admin/*` (8 telas) | **COPY** | Super-admin completo. |
| **NOVO** `Sites.tsx` + `SiteDetail.tsx` | **NEW** | CRUD de Obras. 5 SP. |
| **NOVO** `Materials.tsx` + import CSV | **NEW** | Catálogo. 5 SP. |
| **NOVO** `Approvals.tsx` + `ApprovalDetail.tsx` | **NEW** | Fila do diretor. 3 SP. |
| **NOVO** `PurchaseOrders.tsx` + `PurchaseOrderDetail.tsx` | **NEW** | Listagem e detalhe de OC. 3 SP. |
| **NOVO** `Integrations.tsx` | **NEW** | Config de webhook ERP. 3 SP. |

### 5.2 `frontend/src/components/`

| Pasta | Ação |
|---|---|
| `admin/*` | **COPY** |
| `command/*` | **COPY** (command palette) |
| `guards/*` | **COPY** (ProtectedRoute, RoleGuard) |
| `layout/*` | **COPY** + ajustar logo/cores |
| `onboarding/*` | **ADAPT** (3 SP) |
| `producers/*` | **DELETE → substitui por `sites/*`** |
| `settings/*` | **ADAPT** (mudar campos) — 2 SP |
| `subscriptions/*` | **COPY** + texto de planos |
| `suppliers/*` | **ADAPT** (categorias) — 2 SP |
| `ui/*` (badge, breadcrumb, button, card, confirm-modal, empty-state, input, label, logo, page-loading, skeleton) | **COPY** + trocar `logo.tsx` |
| `users/*` | **ADAPT** (role REQUESTER/APPROVER) — 2 SP |
| `whatsapp/*` | **COPY** |
| **NOVO** `sites/*` | **NEW** — 3 SP |
| **NOVO** `materials/*` | **NEW** — 3 SP |
| **NOVO** `approvals/*` | **NEW** — 2 SP |
| **NOVO** `pricing-comparator/*` | **NEW** (quadro comparativo lado a lado) — 5 SP |

### 5.3 `frontend/src/hooks/`

| Arquivo | Ação |
|---|---|
| `use-toast.tsx` | **COPY** |
| `useAnalytics.ts` | **COPY** |
| `useDashboard.ts` | **ADAPT** (novos KPIs) — 1 SP |
| `useDraftSave.ts` | **COPY** |
| `useOnboardingProgress.ts` | **ADAPT** — 1 SP |
| `usePerformance.ts` | **COPY** |
| `useProducers.ts` | **DELETE → `useSites.ts` + `useUsers.ts` já existe** |
| `usePullToRefresh.ts` | **COPY** |
| `useQuotes.ts` | **ADAPT** (adicionar filtro por obra) — 1 SP |
| `useReports.ts` | **ADAPT** — 1 SP |
| `useSettings.ts` | **ADAPT** (tenant settings) — 1 SP |
| `useSidebarBadges.ts` | **COPY** |
| `useSubscriptions.ts` | **COPY** |
| `useSuppliers.ts` | **COPY** |
| `useSwipeGesture.ts` | **COPY** |
| `useUsers.ts` | **COPY** |
| **NOVO** `useSites.ts`, `useMaterials.ts`, `useApprovals.ts`, `usePurchaseOrders.ts` | **NEW** — 1 SP cada = 4 SP |

### 5.4 `frontend/src/api/` e `frontend/src/contexts/`

| Arquivo | Ação |
|---|---|
| `api/client.ts` | **COPY** (axios + interceptors) |
| `api/admin.ts` | **COPY** |
| `api/whatsapp-config.ts` | **COPY** |
| `contexts/AuthContext.tsx` | **COPY** |
| `contexts/ThemeContext.tsx` | **COPY** |

---

## 6. Categorias de materiais — lista de referência para o catálogo

Substituir a lista de categorias do cotaAgro pela lista abaixo (em `constants/material-categories.ts`):

```ts
export const MATERIAL_CATEGORIES = [
  { slug: 'cimento',       label: 'Cimento e cal' },
  { slug: 'agregados',     label: 'Agregados (areia, brita, pedrisco)' },
  { slug: 'aco',           label: 'Aço e ferragens' },
  { slug: 'blocos',        label: 'Blocos, tijolos e lajotas' },
  { slug: 'concreto',      label: 'Concreto usinado e argamassa' },
  { slug: 'hidraulica',    label: 'Hidráulica (tubos, conexões, registros)' },
  { slug: 'eletrica',      label: 'Elétrica (fios, eletrodutos, quadros)' },
  { slug: 'gesso',         label: 'Gesso e drywall' },
  { slug: 'revestimento',  label: 'Revestimento cerâmico e porcelanato' },
  { slug: 'pintura',       label: 'Tintas e vernizes' },
  { slug: 'cobertura',     label: 'Telhas e cobertura' },
  { slug: 'esquadrias',    label: 'Esquadrias (portas, janelas)' },
  { slug: 'impermeabilizacao', label: 'Impermeabilização' },
  { slug: 'vidracaria',    label: 'Vidraçaria' },
  { slug: 'ferramentas',   label: 'Ferramentas e EPIs' },
  { slug: 'madeira',       label: 'Madeira e tapumes' },
  { slug: 'outros',        label: 'Outros materiais' },
] as const;
```

Lista de unidades padrão (`utils/unit-normalizer.ts`):

```ts
export const UNITS = [
  'un', 'pc', 'cx', 'pct',  // contagem
  'kg', 't',                 // massa
  'm', 'm2', 'm3', 'ml',     // dimensional
  'saca', 'fardo', 'rolo',   // embalagem
  'l', 'gal', 'balde',       // líquido
  'h', 'dia'                 // tempo (para serviço — fora MVP)
] as const;
```

---

## 7. Plano de execução — Sprint 0 (1 semana de fork)

| Dia | Atividade | Saída |
|---|---|---|
| Seg manhã | Clone + setup git + verificação CI atual | Repositório `cotaobra` no GitHub com CI passando |
| Seg tarde | PR #1: rename `FarmFlow` → `CotaObra` em todas strings de UI/log (sed automatizado + revisão manual) | PR mergeado, ~860 substituições |
| Ter manhã | PR #2: rename `farmflow`/`cotaagro` → `cotaobra` em slugs, .env, docker-compose, package.json | PR mergeado |
| Ter tarde | PR #3: delete `middlewares/` (com s) duplicado + deletar Landing/PreLaunch/ComingSoon antigas | PR mergeado |
| Qua dia inteiro | PR #4: Schema Prisma — rename `ProducerSettings`→`TenantSettings`, deletar `ProducerSupplier`, marcar `Producer` como legacy, criar `Site` e `Material` vazias | PR mergeado, migration aplicada em staging |
| Qui manhã | PR #5: Renomear `producer.flow.ts` → `requester.flow.ts`; ajustar imports; manter FSM funcional via redirecionamento | PR mergeado |
| Qui tarde | PR #6: Substituir lista de categorias de fornecedor + unidades | PR mergeado |
| Sex manhã | PR #7: Adaptar `email-drip` e templates HSM (texto novo) | PR mergeado |
| Sex tarde | Buffer de bugs, deploy staging, smoke test manual: login + criar fornecedor + ver dashboard funcionando | Sprint fechado |

Total Sprint 0: ~24 SP (cabem nas 18 horas/dia × 5 dias × 3 devs = 270h disponíveis, com folga de 80% para imprevistos).

---

## 8. Riscos e cuidados

### 8.1 Riscos técnicos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Migration combinada do Prisma quebra dados de staging cotaAgro | Alta no início | Fork tem DB próprio do dia 1; staging cotaAgro nunca compartilha banco com cotaObra |
| Refactor mecânico (sed) muda string em produção (ex: nome de empresa fictício "FarmFlow Demo") | Média | Code review humano em todo PR de rename; whitelist de exclusões em CHANGELOG |
| Importar dívida técnica do cotaAgro (AUD-01, AUD-04) | Alta | Sprint 0 PR #8: aplicar os 4 fixes CRITICAL do COTAGRO_AUDIT antes de qualquer feature nova |
| Cobertura de teste zero do cotaAgro permite regressão | Alta | Smoke tests E2E (5 cenários) escritos antes do PR #1 — bloqueia merge se quebrarem |
| FSM Producer adaptada quebra fluxo do solicitante | Média | Manter `producer.flow.ts.bak` durante 2 sprints; testes E2E cobrem caminho feliz |
| Tela QuoteDetail é grande demais (8 SP) e atrasa o sprint | Média | Quebrar em 3 PRs: tabela comparativa, ações de fechamento, split por item |

### 8.2 Cuidados de processo

- **Code freeze do cotaAgro nas primeiras 2 semanas** — para evitar conflitos cruzados durante o fork. Comunicar ao time do cotaAgro.
- **CHANGELOG.md no fork** — registrar cada PR de refactor, facilita futuro cherry-pick.
- **Dois ambientes em paralelo** — staging.cotaagro.com.br continua rodando; staging.cotaobra.com.br sobe em dia 1.
- **Não merge no main** sem CI verde + 1 review.

---

## 9. Recomendação final de aproveitamento

| Área | % Aproveitado | Esforço para adaptar (SP) |
|---|---|---|
| Auth + Multi-tenant + RBAC | 100% | 0 SP |
| WhatsApp providers + webhook | 100% | 0 SP |
| Jobs e crons | 80% | 13 SP |
| Services compartilhados | 90% | 28 SP |
| FSM + flows | 60% | 19 SP |
| Frontend layout + componentes base | 95% | 5 SP |
| Frontend páginas existentes | 65% | 45 SP |
| Schema Prisma | 80% | 31 SP |
| Frontend páginas novas (Site/Material/Approval/PO) | 0% (NEW) | 32 SP |
| Backend módulos novos (sites/materials/approvals/POs/integrations) | 0% (NEW) | 23 SP |
| Pricing engine | 0% (NEW) | 3 SP |
| **Total** | **~70%** | **~199 SP** |

**Comparativo:**
- Construir do zero conforme backlog original: 190 SP + arquitetura/setup ~80 SP de fundação = 270 SP totais.
- Forkar e adaptar conforme este plano: ~24 SP de Sprint 0 + 199 SP de adaptação = 223 SP totais.
- **Economia líquida estimada: ~47 SP (17%)** — equivalente a ~2 sprints (4 semanas) com time de 3 devs.

A economia em horas é menor do que parece à primeira vista porque o cotaAgro tem MUITA coisa que precisa adaptar (FSM, jobs, schema, telas grandes), não só copiar. **O ganho real do fork não é tanto em horas, e sim em risco**: estamos partindo de código testado em produção piloto, com bugs conhecidos e documentados, em vez de boilerplate verde-amarelo.

---

## 10. Próximos passos

1. **Decisão de go/no-go** do fork — pode ser feita agora.
2. Se for go: criar repo `cotaobra` no GitHub, executar Sprint 0 conforme §7.
3. Em paralelo, corrigir AUD-01, AUD-02, AUD-04 do cotaAgro (são 4 horas de trabalho) e fazer cherry-pick para o fork no fim do Sprint 0.
4. Sprint 1 segue o backlog original (`CotaObra_Backlog_PO_Senior.docx`), mas com tasks marcadas como "Fork" (esforço reduzido) versus "Nova".
5. Atualizar `CotaObra_Backlog_PO_Senior.docx` v2.0 reclassificando cada task em Fork/Adaptar/Nova com SP recalculado — pode ser próximo entregável.

---

**Fim do documento.**
