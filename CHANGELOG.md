# Changelog — CotaObra

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
SemVer adaptado a sprints (`vSprintN`).

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
