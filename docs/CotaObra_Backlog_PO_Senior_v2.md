# CotaObra — Backlog PO Sênior v2.0

**Plataforma de Cotação de Materiais de Construção via WhatsApp + Web**

Documento de Backlog Priorizado — versão 2.0
Autor: PO Sênior (Claude)
Data: 18 de maio de 2026
Status: Aprovado para execução — base para Sprint 0
Documentos relacionados: `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` v1.0, `PLANO_DE_FORK.md` v1.0
Repositório-alvo: `C:\Workstation\cotaObra` (a criar via fork de `C:\Workstation\cotaAgro`)

---

## 0. Histórico de versões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | mai/2026 | PO Sênior | Backlog inicial concebido como construção do zero (~270 SP). |
| 2.0 | 18/05/2026 | PO Sênior | Reclassificação Fork/Adapt/Nova após decisão de forkar o cotaAgro. Recálculo de SP (~223 SP totais). Tasks reescritas com User Story, AC Gherkin, DoD, test plan e risco por item. Sprint 0 introduzido. |

---

## 1. Sumário executivo

O CotaObra é o irmão do CotaAgro/FarmFlow para construção civil. A decisão estratégica é **forkar** o cotaAgro em produção piloto em vez de construir do zero. Este backlog v2.0 destrincha 9 sprints (18 semanas) que levam o produto de fork verde a piloto em produção com 1 cliente fechando ≥10 cotações/semana.

**Métricas-alvo do MVP (saída ao final do sprint 9):**

- Tempo médio para cotar 5 itens com 5 fornecedores: ≤ 25 minutos (versus 4–6 horas no processo manual).
- Taxa de resposta de fornecedor em ≤ 24h: ≥ 70%.
- Economia média por cotação fechada (delta entre maior e menor preço corrigido): ≥ 8%.
- SLA da plataforma (p95 de latência de webhook → mensagem enviada): ≤ 4s.
- Zero incidentes de bloqueio de número WhatsApp por uso indevido de template HSM.

**Resumo de esforço por sprint:**

| Sprint | Tema | SP | Sem. cumulativas | Saída |
|--------|------|----|-----------------|-------|
| 0 | Fork & Refactor mecânico | 24 | 1 | Repo `cotaobra` com branding novo, build verde |
| 1 | Fundação de domínio (Obra, Material, refinamento de schema) | 30 | 3 | CRUD de Obra/Material em produção, smoke E2E |
| 2 | FSM Solicitante via WhatsApp + Painel "solicitações pendentes" | 28 | 5 | Engenheiro cria solicitação por WhatsApp |
| 3 | Dispatch & FSM Fornecedor | 30 | 7 | Comprador dispara e recebe propostas em fluxo fim a fim |
| 4 | Consolidação, ranking corrigido & quadro comparativo | 28 | 9 | Pricing engine + comparativo lado a lado funcionando |
| 5 | Fechamento, Purchase Order e PDF | 26 | 11 | Pedido fechado gera OC PDF anexável ao ERP |
| 6 | Aprovação hierárquica & Histórico de preços | 22 | 13 | Diretor aprova; histórico de preços por material/região |
| 7 | Relatórios, Dashboard e Onboarding | 18 | 15 | 5 relatórios + KPIs + walkthrough da 1ª cotação |
| 8 | Integração ERP + Billing (Asaas Pix) | 22 | 17 | Webhook ERP signed + cobrança recorrente |
| 9 | Polish, E2E, Hardening, Go-to-Pilot | 14 | 18 | Smoke 100%, runbook, 1 cliente em produção |
| **Total** | | **242** | **18 sem.** | |

Observação: 242 SP é levemente superior aos 223 estimados no `PLANO_DE_FORK.md` porque este backlog adiciona overhead realista de PO/QA (testes, refinamento de issues, code review) que o plano de fork não computava como linha de esforço. Mantemos a folga de 15% sobre capacidade para imprevistos.

---

## 2. Convenções

### 2.1 Anatomia de cada task

Todas as tasks abaixo seguem o mesmo template:

```
ID: CO-{sprint}-{ordem}              (ex.: CO-0-01)
Título: Frase curta no infinitivo
Tipo:  🔀 FORK-COPY  | 🔧 FORK-ADAPT | ✏️ FORK-RENAME | ✨ NEW
Story Points: número (1, 2, 3, 5, 8, 13)
Prioridade: P0 (bloqueia sprint) | P1 (importante) | P2 (nice-to-have)
Módulo: backend, frontend, schema, infra, conteúdo, docs
Origem: caminho do arquivo cotaAgro de referência (quando aplicável)
Dependências: lista de IDs de outras tasks
User Story: Como X, eu quero Y, para que Z.
Contexto / racional: por que existe e o que muda do cotaAgro
Critérios de Aceitação (AC): Gherkin (Given/When/Then) ou bullets verificáveis
Notas técnicas: arquivos afetados, contratos, gotchas
Test plan: unit / integration / E2E / manual
Definition of Done (DoD): checklist final
Riscos / observações: o que pode dar errado
```

### 2.2 Tipos de tarefa (legenda)

- **🔀 FORK-COPY** — copia de cotaAgro com no máximo `sed` de strings de branding. Esforço mínimo, risco mínimo.
- **🔧 FORK-ADAPT** — base do cotaAgro existe mas precisa mudar lógica. Maior parte das adaptações.
- **✏️ FORK-RENAME** — apenas renomeação de identificador (`Producer` → `Requester`), preservando lógica.
- **✨ NEW** — não existe no cotaAgro, criar do zero.

### 2.3 Critérios de pronto (Definition of Ready — DoR)

Uma task só entra em sprint se:

1. Tem AC escritos.
2. Tem dependências resolvidas ou tasks pré-requisito agendadas no mesmo sprint anterior.
3. Tem owner técnico atribuído.
4. SP foi validado por ≥ 1 dev.
5. Mockup ou wireframe anexado (quando frontend).

### 2.4 Critérios de feito (Definition of Done — DoD genérico)

Aplica a TODAS as tasks salvo override explícito:

1. Código merged em `main` após code review ≥ 1 aprovação.
2. CI verde (lint + typecheck + unit + integration).
3. Cobertura ≥ 60% no módulo tocado (ou justificativa formal).
4. Testes E2E críticos passando (quando aplicável).
5. Migration aplicada em staging sem erro.
6. Documento atualizado: `CHANGELOG.md` no repo + `STATUS.md` quando relevante.
7. Sem warnings novos no Sentry (staging).
8. PO valida o AC em staging antes de deploy em prod.

---

## 3. Resumo executivo por épico

| Épico | Sprints | SP | Owner sugerido |
|-------|---------|----|----------------|
| E1 — Fork & Branding | 0 | 24 | Tech Lead |
| E2 — Domínio Obra/Material | 1 | 30 | Backend Sênior |
| E3 — FSM Solicitante | 2 | 28 | Backend Pleno + WhatsApp specialist |
| E4 — FSM Fornecedor & Dispatch | 3 | 30 | Backend Pleno |
| E5 — Pricing Engine & Comparativo | 4 | 28 | Backend + Frontend Sênior |
| E6 — Fechamento & PO PDF | 5 | 26 | Full-stack |
| E7 — Aprovação & Histórico | 6 | 22 | Backend + Frontend |
| E8 — Reports & Onboarding | 7 | 18 | Frontend Sênior |
| E9 — Integrations & Billing | 8 | 22 | Backend Sênior |
| E10 — Hardening & Pilot | 9 | 14 | Tech Lead + QA |

---

# SPRINT 0 — Fork & Refactor mecânico (24 SP / 1 semana)

**Meta do sprint:** ter o repositório `cotaobra` rodando localmente e em staging com nome/branding novos, CI verde, banco isolado, sem nenhuma mudança de comportamento funcional. Zero feature nova.

**Critério de sucesso do sprint:**

- `cotaobra.staging.app` sobe.
- Login com usuário seed funciona.
- `npm test` no backend e frontend passa 100%.
- 5 smoke tests E2E (Playwright) passam.

---

### CO-0-01 — Criar repositório `cotaobra` por fork preservando histórico

- **Tipo:** 🔀 FORK-COPY
- **SP:** 1
- **Prioridade:** P0
- **Módulo:** infra / git
- **Origem:** `C:\Workstation\cotaAgro` (clone integral)
- **Dependências:** nenhuma
- **User Story:** Como tech lead, eu quero um novo repositório `cotaobra` independente do `cotaAgro` mas com histórico preservado, para que eu possa fazer cherry-pick de fixes futuros nos dois sentidos sem reconstruir histórico.
- **Contexto:** o `PLANO_DE_FORK.md` define que o fork tem que manter o histórico. Não é só `git clone` para outra pasta — precisamos publicar o repositório novo no GitHub e configurar remotes para que cherry-picks bidirecionais sejam fáceis.
- **AC:**
  - **Given** o repositório `cotaagro` no GitHub
  - **When** o tech lead clona localmente e roda os comandos do §2.2 do `PLANO_DE_FORK.md`
  - **Then** o repositório `cotaobra` existe no GitHub (privado), tem o histórico completo do `cotaagro`, e o remote `upstream-cotaagro` aponta para o original.
  - **And** o branch `main` está protegido (require PR, require CI, no force push).
  - **And** existe um branch `sprint-0/refactor-cotaobra` criado a partir do main.
- **Notas técnicas:**
  - Repo GitHub: `github.com/samuckamorais/cotaobra` (privado).
  - Branch protection: rules em "Settings → Branches".
  - GitHub Actions secrets a recriar: `OPENAI_API_KEY`, `TWILIO_*`, `DATABASE_URL_TEST` apontando para Postgres dedicado.
- **Test plan:** apenas verificação manual.
- **DoD:**
  - Repo público acessível pelo time.
  - README do repo já renomeado de "FarmFlow" para "CotaObra" (substituição rápida; refinamento vem na CO-0-02).
  - CI verde no primeiro push (workflow herdado do cotaAgro).
- **Riscos:** secrets antigos vazarem em logs se mantidos do upstream; revisar `.env.example` antes de publicar.

---

### CO-0-02 — Refactor de branding `FarmFlow`/`farmflow` → `CotaObra`/`cotaobra`

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend + frontend + docs
- **Origem:** ~860 ocorrências em ~140 arquivos (cf. `PLANO_DE_FORK.md` §2.3)
- **Dependências:** CO-0-01
- **User Story:** Como usuário final do painel web, eu quero ver "CotaObra" em todo lugar (logo, título, e-mails, mensagens WhatsApp) para que não haja confusão de marca durante o piloto.
- **Contexto:** o cotaAgro tem `FarmFlow` (com F maiúsculo) em strings de UI, e-mail templates, README, mensagens WhatsApp, logo, manifest do PWA, package.json, docker-compose, etc. A v2 do fork precisa substituir tudo, mas com cuidado em dois pontos: (1) não trocar nomes legítimos em comentários históricos do código, (2) verificar manualmente strings de mensagens WhatsApp que podem precisar de re-aprovação de template HSM na Meta.
- **AC:**
  - **Given** o repo `cotaobra` recém-clonado
  - **When** o dev executa `git grep -l FarmFlow` e `git grep -l farmflow` e `git grep -l cotaagro`
  - **Then** o total de ocorrências cai a zero (exceto em `CHANGELOG.md` e em comentários de histórico marcados com `// LEGACY:`).
  - **And** o build `npm run build` no backend e frontend continua passando.
  - **And** as 5 mensagens WhatsApp principais (`messages.ts`) foram revisadas manualmente para naturalidade em português (não basta `sed` — "FarmFlow agradece" precisa virar "CotaObra agradece" mas sem soar robótico).
- **Notas técnicas:**
  - Script: `scripts/rename-brand.sh` que faz `find + sed` em batches (`*.ts`, `*.tsx`, `*.md`, `*.json`, `*.yml`, `Dockerfile`).
  - Logo SVG: substituir `frontend/src/components/ui/logo.tsx` por novo logo (placeholder OK no Sprint 0; design final no Sprint 1).
  - PWA manifest: `frontend/public/manifest.json` — trocar `name`, `short_name`, `theme_color`.
  - Domínios em `docker-compose.yml`, `.env.example`, `traefik.yml`.
- **Test plan:**
  - Unit: rodar `npm test` integralmente; não pode haver regressão.
  - Manual: abrir app local, navegar pelas 12 telas principais e checar string visualmente.
- **DoD:**
  - `git grep` retorna zero exceto whitelist.
  - 5 templates de mensagem WhatsApp lidos por humano e marcados como "OK natural".
  - PR aprovado e mergeado.
- **Riscos:** mudança de URL de webhook quebra integração de fornecedor existente. Mitigação: cotaAgro continua em paralelo no domínio antigo; nada do cotaAgro é tocado.

---

### CO-0-03 — Deletar pasta legacy `middlewares/` e ajustar imports

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 1
- **Prioridade:** P0
- **Módulo:** backend
- **Origem:** `backend/src/middlewares/` (duplicado do oficial `backend/src/middleware/`)
- **Dependências:** CO-0-02
- **User Story:** Como dev novo no projeto, eu quero uma única pasta de middlewares para que eu não importe do lugar errado e introduza bug.
- **Contexto:** O cotaAgro tem dívida técnica: existem `middleware/` e `middlewares/`. O segundo é legacy e parcialmente duplicado. PLANO_DE_FORK §4.3 já indicou apagar.
- **AC:**
  - **Given** o repo `cotaobra` no branch sprint-0
  - **When** o dev apaga `backend/src/middlewares/` e roda `npx tsc --noEmit`
  - **Then** não há erro de import.
  - **And** todos os arquivos que importavam de `middlewares/` agora importam de `middleware/`.
- **Notas técnicas:**
  - Antes de apagar, comparar conteúdo arquivo a arquivo (`diff`) para garantir que nada está em `middlewares/` que não esteja em `middleware/`.
  - Se houver divergência, escolher a versão mais recente e abrir issue para revalidar.
- **Test plan:** typecheck + suite de testes existente.
- **DoD:**
  - Pasta `middlewares/` removida do repo.
  - `git grep "from.*middlewares/"` retorna zero.
- **Riscos:** versão antiga em `middlewares/` ter fix que ainda não foi aplicado em `middleware/`. Inspeção manual obrigatória.

---

### CO-0-04 — Renomear modelo Prisma `ProducerSettings` → `TenantSettings`

- **Tipo:** ✏️ FORK-RENAME
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** schema + backend
- **Origem:** `backend/prisma/schema.prisma` modelo `ProducerSettings`
- **Dependências:** CO-0-02
- **User Story:** Como admin do tenant, eu quero que configurações como teto de aprovação, política de pagamento e provedor WhatsApp sejam definidas a nível de empresa (tenant), não por usuário, porque uma construtora tem várias pessoas comprando mas as regras valem para todas.
- **Contexto:** No cotaAgro, settings eram por produtor (1 produtor = 1 conta = 1 fazenda). No CotaObra, settings têm que ser por construtora (tenant). É a mudança estrutural mais importante do schema fora a introdução de `Site`.
- **AC:**
  - **Given** o schema atual
  - **When** o dev renomeia `ProducerSettings` para `TenantSettings` no Prisma e ajusta a FK de `producerId` para `tenantId` (ambos uuid, mesma cardinalidade 1:1)
  - **Then** `npx prisma migrate dev --name rename-producer-settings-to-tenant-settings` gera migration.
  - **And** todos os services que liam `producerSettings` agora leem `tenantSettings`.
  - **And** o seed atualiza para criar settings com `tenantId` em vez de `producerId`.
- **Notas técnicas:**
  - Arquivos a tocar: `schema.prisma`, `services/producer-settings.service.ts` → `tenant-settings.service.ts`, todos imports.
  - Migration manual de dados: tabela vazia no fork, então um `RENAME TABLE` simples basta.
  - Atualizar testes que mockavam `prisma.producerSettings.*`.
- **Test plan:**
  - Unit: testes do service migrado passam.
  - Integration: endpoint `/api/settings` (já existente) retorna 200 com novo shape.
- **DoD:** migration aplicada em staging, endpoint testado manualmente, PR aprovado.
- **Riscos:** baixo (tabela vazia, pequena footprint de uso). Atenção a referências em Bull jobs.

---

### CO-0-05 — Remover modelo `ProducerSupplier` (junction table obsoleta)

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** schema + backend
- **Origem:** `backend/prisma/schema.prisma` modelo `ProducerSupplier`
- **Dependências:** CO-0-04
- **User Story:** Como admin do tenant, eu quero que fornecedores sejam vinculados à construtora (e não a um produtor específico), para que qualquer comprador da empresa veja a mesma carteira de fornecedores.
- **Contexto:** No cotaAgro, cada produtor tinha sua lista de fornecedores preferidos via tabela junction. No CotaObra, a fonte da verdade é `Supplier.tenantId`. Cada fornecedor pertence a uma construtora (ou à rede CotaObra se `tenantId IS NULL`). Não há "fornecedor preferido por usuário".
- **AC:**
  - **Given** a tabela `ProducerSupplier` existe
  - **When** o dev a remove do schema e migra
  - **Then** `npx prisma migrate dev` aplica `DROP TABLE producer_suppliers`.
  - **And** todos os locais que faziam `prisma.producerSupplier.*` foram refatorados para `prisma.supplier.findMany({ where: { tenantId } })`.
  - **And** nenhum endpoint quebra (lista de fornecedores do comprador agora puxa de `Supplier` direto).
- **Notas técnicas:**
  - Inspecionar `supplier.service.ts`, `producer.service.ts`, `quotes.service.ts` em busca de joins.
  - Atenção ao endpoint `GET /api/producers/:id/suppliers` — será descontinuado; substituído por `GET /api/suppliers?tenantId={current}`.
- **Test plan:** integration tests de `/api/suppliers`.
- **DoD:** suite verde, endpoint antigo retorna 410 Gone com mensagem de deprecação.
- **Riscos:** se o frontend ainda chamar endpoint antigo, quebra. Mitigação: chamada será removida na CO-0-08.

---

### CO-0-06 — Renomear `producer.flow.ts` → `requester.flow.ts` (FSM)

- **Tipo:** ✏️ FORK-RENAME
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** backend / flows
- **Origem:** `backend/src/flows/producer.flow.ts`
- **Dependências:** CO-0-02, CO-0-05
- **User Story:** Como dev, eu quero que a FSM do lado de quem solicita cotação se chame `requester` (não `producer`), para que o nome reflita o domínio de construção civil onde "solicitante" é a persona certa.
- **Contexto:** Sprint 0 só renomeia. A lógica nova (incluir `AWAITING_SITE_SELECTION`, perguntas adaptadas) entra no Sprint 2 (CO-2-01).
- **AC:**
  - **Given** a FSM atual `producer.flow.ts`
  - **When** o dev renomeia o arquivo, classe interna, exports e imports
  - **Then** todos os 12 testes da FSM continuam passando.
  - **And** a string `producer` não aparece mais nos identificadores de código exceto em LEGACY comments.
- **Notas técnicas:**
  - VS Code rename symbol (F2) é a forma mais segura.
  - Atualizar `flows/index.ts`, `whatsapp.controller.ts`, jobs que referenciam a FSM por nome.
  - Manter `producer.flow.ts.bak` durante 2 sprints? Não — o histórico git basta; arquivo `.bak` polui.
- **Test plan:** testes unit da FSM existentes.
- **DoD:** PR mergeado, testes verdes, grep limpo.
- **Riscos:** caches de produção que dependam do nome do arquivo (não há).

---

### CO-0-07 — Substituir lista de categorias e unidades

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** backend / constants
- **Origem:** `backend/src/constants/supplier-categories.ts`, `backend/src/utils/unit-normalizer.ts`
- **Dependências:** CO-0-02
- **User Story:** Como engenheiro/comprador, eu quero ver categorias e unidades de medida do meu domínio (cimento, m³, saca, etc.) e não do agro (semente, hectare, saca de soja), para que o cadastro de fornecedor e o catálogo de materiais façam sentido.
- **Contexto:** Lista oficial está em `PLANO_DE_FORK.md` §6.
- **AC:**
  - **Given** a constante `SUPPLIER_CATEGORIES` antiga
  - **When** o dev substitui pelo array `MATERIAL_CATEGORIES` definido no plano (17 categorias)
  - **Then** o seed do banco usa as novas categorias.
  - **And** a UI de cadastro de fornecedor mostra as novas opções no multi-select.
  - **And** `unit-normalizer.ts` aceita: `un, pc, cx, pct, kg, t, m, m2, m3, ml, saca, fardo, rolo, l, gal, balde`.
- **Notas técnicas:**
  - Arquivo `material-categories.ts` substitui o antigo.
  - `unit-normalizer.test.ts` precisa cobrir todas as novas unidades.
- **Test plan:**
  - Unit: normalizer com 100% das unidades cobertas.
  - Manual: cadastrar fornecedor pelo painel.
- **DoD:** PR aprovado, testes verdes, screenshot do dropdown.
- **Riscos:** dado em produção (não há ainda — banco do fork é novo).

---

### CO-0-08 — Apagar páginas frontend de Landing/PreLaunch/ComingSoon e referências a "Producers"

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 1
- **Prioridade:** P0
- **Módulo:** frontend
- **Origem:** `frontend/src/pages/Landing.tsx`, `PreLaunch.tsx`, `ComingSoon.tsx`, `Producers.tsx`
- **Dependências:** CO-0-05
- **User Story:** Como usuário, eu quero entrar direto na tela de login sem ver páginas de marketing do cotaAgro, e quero que o menu lateral mostre "Obras" em vez de "Produtores" no lugar correto.
- **Contexto:** Páginas de marketing serão reescritas no Sprint 1 (CO-1-08). Por enquanto, basta apagar e ajustar o roteador para que `/` mande para `/login`. "Producers" some do menu — "Sites/Obras" entra mas vazio até o Sprint 1.
- **AC:**
  - **Given** o app frontend recém-clonado
  - **When** o dev acessa `/`
  - **Then** é redirecionado para `/login`.
  - **And** o menu lateral não tem mais "Produtores".
  - **And** existe um item "Obras" no menu (rota `/sites`) que mostra placeholder "Em construção" (literalmente — bem ao tema do produto).
- **Notas técnicas:**
  - Apagar arquivos, ajustar `App.tsx` (rotas), ajustar `components/layout/Sidebar.tsx`.
  - Remover imports `import Landing from '@/pages/Landing'` etc.
- **Test plan:** smoke manual + lint para imports não usados.
- **DoD:** rotas funcionam, menu correto, build verde.
- **Riscos:** nenhum significativo.

---

### CO-0-09 — Adaptar templates de e-mail (drip de 5 e-mails) e mensagens WhatsApp para domínio construção

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** conteúdo + backend
- **Origem:** `backend/src/services/email-drip.service.ts`, `backend/src/flows/messages.ts`
- **Dependências:** CO-0-02
- **User Story:** Como construtora prospect, eu quero receber e-mails e mensagens WhatsApp que falem da realidade de construção civil (obras, cimento, prazo de entrega), não de fazenda, porque cotaAgro/CotaObra usam o mesmo motor mas conteúdo precisa ser do meu setor.
- **Contexto:** drip atual é "boas-vindas + 4 emails de educação" no contexto agro. Reescrever cada com o tom e exemplos da construção. Mensagens WhatsApp também: "Sua cotação de sementes" → "Sua cotação de materiais", etc.
- **AC:**
  - **Given** os 5 templates HTML de e-mail e ~30 strings WhatsApp em `messages.ts`
  - **When** o conteúdo é reescrito por humano (PO) e validado por engenheiro de obra real (1 entrevista)
  - **Then** todos os textos passaram revisão e estão em PT-BR formal-amigável.
  - **And** os 6 templates HSM principais (cf. §11 do `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md`) estão escritos com variáveis `{{1}}, {{2}}` para submissão à Meta — mas a submissão em si é uma task separada (CO-3-08).
  - **And** todos os subject lines e CTAs foram revisados.
- **Notas técnicas:**
  - Pasta `backend/src/templates/emails/` com 5 arquivos HBS.
  - `messages.ts` agora vai expor namespaces: `messages.requester.*` e `messages.supplier.*`.
- **Test plan:**
  - Unit: snapshot tests dos templates renderizados.
  - Manual: PO + 1 engenheiro de obra externo revisam.
- **DoD:** conteúdo aprovado por PO, testes snapshot atualizados, screenshot dos 5 e-mails renderizados em Mailpit local.
- **Riscos:** templates HSM precisam re-aprovação Meta (~3 dias úteis). Não bloqueia Sprint 0; bloqueia Sprint 3.

---

### CO-0-10 — Aplicar os 4 fixes CRITICAL herdados do COTAGRO_AUDIT (AUD-01, AUD-02, AUD-03, AUD-04)

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 5
- **Prioridade:** P0
- **Módulo:** backend / infra
- **Origem:** auditoria do cotaAgro (referência: `C:\Users\User\OneDrive\Documentos\FARMFLOW\FarmFlow\COTAGRO_AUDIT.docx`)
- **Dependências:** CO-0-04
- **User Story:** Como tech lead, eu quero importar para o fork as 4 correções críticas que o cotaAgro já tem (ou ainda vai aplicar nestas 2 semanas) para que o CotaObra não nasça com a mesma dívida.
- **Contexto:** O cotaAgro tem 4 issues CRITICAL conhecidas. Como o fork está sendo criado AGORA, a janela perfeita é aplicar todos os 4 fixes antes de qualquer feature nova.
  - **AUD-01:** race condition em `consolidate-quote.job.ts` sem lock distribuído.
  - **AUD-02:** field encryption de CPF/CNPJ usando IV fixo (vulnerabilidade LGPD).
  - **AUD-03:** rate limit do login não considera tenant — atacante pode bloquear conta de outro.
  - **AUD-04:** envio de mensagem WhatsApp fora da janela de 24h sem usar template HSM aprovado → risco de bloqueio do número.
- **AC (um sub-AC por AUD):**
  - **AUD-01:** Redlock implementado em `consolidate-quote` e `expire-quote`; teste de concorrência simulada com 3 instâncias passa.
  - **AUD-02:** field-encryption.service.ts usa IV aleatório por registro; migration roda re-encrypt em dados existentes (no fork, dados vazios — só impacta seed).
  - **AUD-03:** rate-limit aplica `${ip}+${tenantSlug}+${email}` como chave; teste verifica que o ataque cross-tenant não é mais possível.
  - **AUD-04:** wrapper `sendWhatsApp` recusa enviar mensagem livre fora da janela de 24h se não há `templateName` configurado.
- **Notas técnicas:** consultar o repo `cotaagro` para ver se algum desses fixes já foi mergeado e usar cherry-pick (`git cherry-pick <sha>`) preservando autoria.
- **Test plan:**
  - Unit + integration cobrindo cada AUD.
  - Pen test manual para AUD-03.
- **DoD:** 4 fixes mergeados, 4 testes regredores escritos, AUDIT_FIXES.md atualizado.
- **Riscos:** AUD-04 pode bloquear envios legítimos se template não estiver configurado — a CO-0-09 garante que templates foram redigidos; configuração na Meta vem na CO-3-08.

---

### CO-0-11 — Configurar staging `cotaobra.staging.app` independente

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** infra
- **Origem:** infra-as-code do cotaAgro (Hetzner + Traefik + Docker Compose)
- **Dependências:** CO-0-02
- **User Story:** Como time de desenvolvimento, eu quero um ambiente de staging dedicado do CotaObra, totalmente isolado do staging do cotaAgro, para que possamos validar PRs sem risco de cross-contaminação.
- **Contexto:** Mesmo VPS, novo container stack, novo Postgres database, novo Redis namespace.
- **AC:**
  - **Given** o servidor staging-shared existente
  - **When** o devops sobe a stack do cotaobra via `docker compose -f docker-compose.staging.yml up -d`
  - **Then** `https://cotaobra.staging.app` retorna a tela de login.
  - **And** o banco `cotaobra_staging` está isolado de `cotaagro_staging`.
  - **And** Sentry tem projeto novo `cotaobra` para evitar misturar erros.
  - **And** PostHog tem projeto novo (apenas em staging por enquanto; prod no Sprint 1).
- **Notas técnicas:**
  - Subdomain DNS apontando para mesmo IP.
  - Traefik labels nos containers.
  - Migration `prisma migrate deploy` no startup.
- **Test plan:** smoke manual: login + dashboard carregam.
- **DoD:** URL acessível externamente, healthchecks verdes.
- **Riscos:** custo. Mesmo VPS é OK até pilot; mover para PaaS dedicado vem no Sprint 9 hardening.

---

### CO-0-12 — Escrever 5 smoke tests E2E (Playwright) que bloqueiam merge

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** testes
- **Origem:** nenhuma — não existem E2E no cotaAgro (dívida técnica conhecida)
- **Dependências:** CO-0-11
- **User Story:** Como tech lead, eu quero 5 cenários E2E rodando em CI que cubram os fluxos vitais do produto para que regressões críticas sejam detectadas antes do deploy.
- **Contexto:** O cotaAgro tem cobertura zero de E2E — listada como AUD em vários documentos. Vamos corrigir desde o dia 1 no fork. Os cenários cobrem o "caminho feliz" do MVP. Mais cenários vêm em sprints futuras.
- **AC:**
  - **Given** o staging `cotaobra.staging.app`
  - **When** o pipeline de CI roda os 5 testes Playwright a cada PR
  - **Then** os 5 passam em ≤ 5 minutos.
  - **And** o PR é bloqueado de merge se qualquer um falhar.
  - **Cenário 1:** login com usuário seed → dashboard carrega.
  - **Cenário 2:** cadastrar fornecedor manualmente → fornecedor aparece na lista.
  - **Cenário 3:** cadastrar obra manualmente → obra aparece na lista.
  - **Cenário 4:** criar cotação direta pelo painel com 1 item e 1 fornecedor → cotação salva.
  - **Cenário 5:** abrir página de configurações, mudar `defaultExpiryHours` para 48 → settings persistem.
- **Notas técnicas:**
  - Playwright Test config com `baseURL` parametrizado por env (`local` vs `ci-staging`).
  - Workflow GitHub Actions `e2e.yml` separado, só roda em PRs para `main`.
- **Test plan:** os próprios cenários.
- **DoD:** suite verde 3 runs consecutivos; documentação em `tests/e2e/README.md`.
- **Riscos:** flakiness inicial; mitigação com `retry: 2`.

---

### CO-0-13 — Validar build, deploy e smoke; fechar Sprint 0

- **Tipo:** ✨ NEW
- **SP:** 1
- **Prioridade:** P0
- **Módulo:** processo
- **Dependências:** CO-0-01 a CO-0-12
- **User Story:** Como PO, eu quero uma demo de fim de sprint mostrando o ambiente funcionando para garantir que estamos prontos para começar feature work no Sprint 1.
- **AC:**
  - Staging acessível via URL pública.
  - Login + 4 telas básicas (dashboard, fornecedores, obras [placeholder], settings) navegáveis sem erro 500.
  - 5 smoke E2E passam.
  - CHANGELOG.md atualizado com tudo do sprint 0.
  - Lista de issues CRITICAL no Sentry: zero.
- **DoD:** demo gravada em vídeo (5min) e compartilhada com stakeholders.
- **Riscos:** se algum AC falhar, decidir em retrospectiva o que vira hotfix no início do Sprint 1.

---

**Sprint 0 — totalização:** 1+3+1+2+2+2+2+1+3+5+2+3+1 = **28 SP** (4 SP acima dos 24 estimados no plano de fork). Decisão de PO: aceitar o estouro porque CO-0-10 (4 AUDs) e CO-0-12 (E2E novos) eram subestimados no plano de fork. Folga de 80% de slack vira ~50%, ainda saudável.

---

# SPRINT 1 — Fundação de domínio: Obra & Material (30 SP / 2 semanas)

**Meta do sprint:** introduzir os dois conceitos estruturais que diferenciam o CotaObra do CotaAgro — **Obra** (Site) e **Material** (catálogo de SKUs). Ao fim deste sprint, o comprador consegue cadastrar obras, materiais e fornecedores e criar uma cotação MANUALMENTE pelo painel (sem WhatsApp ainda) que termina em PDF placeholder.

**Critério de sucesso do sprint:**

- CRUD completo de Obra com 100% das colunas do schema.
- CRUD de Material com import CSV de até 500 linhas.
- Seed inicial de 30 SKUs nacionais (cimento, areia, brita, vergalhão, blocos, hidráulica básica).
- Quote.siteId é NOT NULL e UI obriga seleção de obra.

---

### CO-1-01 — Criar modelo Prisma `Site` (Obra) completo

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** schema + backend
- **Origem:** nada (entidade nova)
- **Dependências:** CO-0-04
- **User Story:** Como construtora, eu quero cadastrar cada obra com endereço, CNO, engenheiro responsável e orçamento, para que minhas cotações sejam atreladas à obra correta e o sistema possa calcular frete, agrupar histórico e gerar relatório por canteiro.
- **Contexto:** Modelo definido em `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` §5 — replicar 1:1.
- **AC:**
  - **Given** o schema atual
  - **When** o dev adiciona o modelo `Site` com todos os campos (id, tenantId, name, cno, address, city, state, zip, region, manager, managerPhone, budget, status enum, startAt, endAt, createdAt, updatedAt)
  - **Then** a migration `add_site_model` aplica sem erro.
  - **And** o índice composto `(tenantId)` e o índice em `region` existem.
  - **And** o enum `SiteStatus` (ACTIVE | PAUSED | CLOSED) está criado.
- **Notas técnicas:** ver arquitetura §5 para os campos. `managerPhone` é string e-164 (`+5511999999999`), validar via zod.
- **Test plan:**
  - Unit: validações zod do DTO.
  - Integration: criar Site via Prisma raw com todos os campos.
- **DoD:** migration aplicada em staging, ER diagram atualizado.
- **Riscos:** decidir hoje se `region` é livre ou enum. Decisão: **livre** (string indexada) com sugestões no frontend para evitar lock-in prematuro.

---

### CO-1-02 — Módulo backend `sites/` com CRUD + RBAC

- **Tipo:** ✨ NEW
- **SP:** 5
- **Prioridade:** P0
- **Módulo:** backend
- **Origem:** padrão dos módulos existentes (ex.: `backend/src/modules/suppliers/`)
- **Dependências:** CO-1-01
- **User Story:** Como admin/comprador, eu quero criar, listar, editar e arquivar obras via painel para gerir o portfólio de canteiros da minha empresa.
- **AC:**
  - **Given** um usuário com role BUYER autenticado
  - **When** ele chama `GET /api/sites`
  - **Then** recebe `200 OK` com array filtrado por `tenantId` (multi-tenant respeitado).
  - **Endpoints implementados:** `GET /api/sites`, `GET /api/sites/:id`, `POST /api/sites`, `PATCH /api/sites/:id`, `DELETE /api/sites/:id` (soft delete = status `CLOSED`).
  - **Validações:**
    - `name` ≥ 3 chars
    - `cno` opcional mas se preenchido valida formato 12 dígitos
    - `state` ∈ lista de UFs BR
    - `managerPhone` E.164
    - `budget` ≥ 0 ou null
  - **RBAC:**
    - REQUESTER: read-only nas obras em `siteIds`
    - BUYER: read/write em todas as obras do tenant
    - ADMIN/APPROVER: read/write/delete
- **Notas técnicas:**
  - `controller.ts`, `routes.ts`, `service.ts`, `dto.ts`, `permissions.ts` (5 arquivos novos).
  - Permission entry `sites:read`, `sites:write`, `sites:delete` na tabela `Permission`.
  - Logger emite `tenantId` + `userId` + `siteId` em toda operação.
- **Test plan:**
  - Unit: 8 tests do service (criar válido, criar inválido, listar filtrado por tenant, deletar marcando soft, etc.).
  - Integration: supertests dos 5 endpoints (200, 401, 403, 422).
- **DoD:** Postman/Insomnia collection atualizada, AC validado em staging.
- **Riscos:** rota antiga `/api/producers` continua respondendo até CO-1-09 — comunicar claramente que está deprecated.

---

### CO-1-03 — Tela `Sites.tsx` (lista) + `SiteDetail.tsx` (formulário CRUD)

- **Tipo:** ✨ NEW
- **SP:** 5
- **Prioridade:** P0
- **Módulo:** frontend
- **Origem:** template de `Suppliers.tsx` e `SupplierDetail.tsx`
- **Dependências:** CO-1-02
- **User Story:** Como comprador, eu quero uma tela onde vejo todas as obras da minha empresa em uma tabela filtrável e consigo abrir o detalhe de cada uma para editar.
- **AC:**
  - **Given** o usuário logado clica em "Obras" no menu lateral
  - **When** acessa `/sites`
  - **Then** vê tabela com colunas: Nome, Cidade/UF, Status, Engenheiro, Orçamento, Ações.
  - **And** filtros: por status (ACTIVE/PAUSED/CLOSED, default ACTIVE), busca livre.
  - **And** botão "Nova Obra" abre form modal/lateral.
  - **And** clicar em uma linha leva para `/sites/:id` com form de edição inline.
  - **And** formulário valida em tempo real (zod resolver no react-hook-form).
- **Notas técnicas:**
  - Componentes: usar shadcn/ui Table, Sheet (lateral), Form.
  - Hook `useSites` em `hooks/useSites.ts` baseado em `useSuppliers` existente.
  - Empty state quando não há obras: ilustração + CTA "Cadastre sua primeira obra".
- **Test plan:**
  - Componente: 3 tests com React Testing Library (renderiza vazio, com dados, com erro de API).
  - E2E: cenário "criar obra" entra no CO-0-12.
- **DoD:** screenshots responsivo desktop e mobile, AC validado em staging.
- **Riscos:** UX do orçamento — formato BR (R$ 1.234.567,89) pede mask. Usar `react-imask`.

---

### CO-1-04 — Hook `useSites` + cliente API + tipos compartilhados

- **Tipo:** ✨ NEW
- **SP:** 1
- **Prioridade:** P0
- **Módulo:** frontend
- **Origem:** padrão `hooks/useSuppliers.ts`
- **Dependências:** CO-1-02
- **User Story:** Como dev frontend, eu quero um hook React Query para CRUD de Site com tipos derivados do schema Prisma para evitar drift.
- **AC:**
  - `useSites()`, `useSite(id)`, `useCreateSite()`, `useUpdateSite()`, `useDeleteSite()` exportados.
  - Tipos importados de `@types/api.ts` (espelham Prisma).
  - Invalidação de cache correta após mutations.
- **DoD:** hooks usados nas telas CO-1-03 sem any types.
- **Riscos:** baixo.

---

### CO-1-05 — Modelo Prisma `Material` + seed inicial de 30 SKUs

- **Tipo:** ✨ NEW
- **SP:** 5
- **Prioridade:** P0
- **Módulo:** schema + backend + dados
- **Origem:** nada (entidade nova) + lista de SKUs nacionais via SINAPI/CUB
- **Dependências:** CO-0-07
- **User Story:** Como comprador, eu quero um catálogo padrão com os 30 itens mais usados em obra para que minha primeira cotação seja rápida e o sistema já mostre histórico de preço dia 1.
- **AC:**
  - Modelo `Material` criado conforme arquitetura §5 (id, tenantId nullable, sku, name, category, defaultUnit, spec).
  - Migration aplicada.
  - Seed cria 30 materiais com `tenantId = NULL` (catálogo CotaObra compartilhado), cobrindo: cimento (3 SKUs), agregados (4), aço (4), blocos (4), hidráulica (5), elétrica (4), gesso (2), revestimento (2), pintura (2).
  - Cada item tem `defaultUnit` apropriada (saca, m³, kg, peça, m, vergalhão).
- **Notas técnicas:**
  - Seed em `scripts/seed-materials.ts` legível e versionado.
  - Spec usa NBR quando aplicável (ex.: "Cimento CP-II-Z 32 NBR 11578").
- **Test plan:** unit do seed (idempotência), manual: query SQL conta 30 linhas.
- **DoD:** seed roda em staging, AC validado.
- **Riscos:** lock-in em decisão de marca. Por isso seed usa especificação técnica genérica, não marca proprietária.

---

### CO-1-06 — Módulo backend `materials/` com CRUD + import CSV

- **Tipo:** ✨ NEW
- **SP:** 5
- **Prioridade:** P0
- **Módulo:** backend
- **Origem:** padrão dos módulos existentes
- **Dependências:** CO-1-05
- **User Story:** Como admin, eu quero importar uma lista de até 500 materiais via CSV no formato `sku,name,category,unit,spec` para popular meu catálogo customizado.
- **AC:**
  - Endpoints: `GET /api/materials?category=...&q=...`, `POST /api/materials`, `PATCH /api/materials/:id`, `DELETE /api/materials/:id`, `POST /api/materials/import-csv`.
  - Import retorna `{ created, updated, errors: [{ line, message }] }`.
  - Categoria validada contra `MATERIAL_CATEGORIES`.
  - SKU é único por tenant (`@@unique([tenantId, sku])`).
- **Notas técnicas:**
  - Usar `papaparse` no backend para parse stream.
  - Limite de tamanho de arquivo: 1MB (~10k linhas).
- **Test plan:**
  - Unit: parser CSV (3 tests: ok, com erros, vazio).
  - Integration: import endpoint com fixture CSV de 50 linhas.
- **DoD:** suite verde, doc de formato CSV em `docs/import-csv-materials.md`.
- **Riscos:** atributos extras no CSV — design decision: ignora colunas desconhecidas e avisa no resultado.

---

### CO-1-07 — Tela `Materials.tsx` com tabela, busca, filtro por categoria e botão de import CSV

- **Tipo:** ✨ NEW
- **SP:** 4
- **Prioridade:** P0
- **Módulo:** frontend
- **Origem:** padrão `Suppliers.tsx`
- **Dependências:** CO-1-06
- **User Story:** Como comprador, eu quero navegar pelo catálogo de materiais, buscar por nome ou SKU, filtrar por categoria, e fazer upload de CSV para acelerar cadastro.
- **AC:**
  - Tabela paginada (50 itens/página).
  - Busca debounced (300ms).
  - Filtro por categoria (multi-select com badges).
  - Modal de import CSV: drag-and-drop + botão, preview das primeiras 5 linhas, validação, mostra resultado.
  - Mostra distinção visual entre catálogo CotaObra (compartilhado) e customizado (do tenant).
- **Test plan:** componente + e2e (cenário "import 5 materiais via CSV").
- **DoD:** screenshots, AC validado.
- **Riscos:** UX da preview do CSV — testar com arquivos malformados.

---

### CO-1-08 — Adaptar tabela `Supplier` para usar novas categorias de construção

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** schema + backend + frontend
- **Origem:** `backend/prisma/schema.prisma` modelo `Supplier`
- **Dependências:** CO-0-07
- **User Story:** Como comprador, eu quero cadastrar fornecedores indicando quais categorias de material eles fornecem (cimento, aço, etc.) e quais regiões atendem, para que o sistema sugira automaticamente os fornecedores certos.
- **AC:**
  - Schema: `categories` muda de validação livre para validação contra `MATERIAL_CATEGORIES` (slugs).
  - Backend: endpoint `POST /api/suppliers` rejeita categoria não cadastrada (422).
  - Frontend: campo "Categorias" em `SupplierDetail.tsx` é multi-select dos slugs com labels traduzidos.
  - Migration: dados existentes (vazios no fork) não impactados.
- **Notas técnicas:** se já existem suppliers em produção piloto do cotaAgro, eles não vêm para o fork — base limpa.
- **Test plan:** integration test verifica recusa de categoria inválida.
- **DoD:** AC validado em staging.

---

### CO-1-09 — Adaptar `User` para incluir roles `REQUESTER` e `APPROVER` + campo `siteIds`

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** schema + backend + frontend
- **Origem:** `backend/prisma/schema.prisma` modelo `User`, enum `Role`
- **Dependências:** CO-1-01
- **User Story:** Como admin, eu quero criar usuários com papel "Engenheiro/Solicitante" (vinculado a 1+ obras) ou "Diretor/Aprovador" (recebe aprovações) para refletir a hierarquia da construtora.
- **AC:**
  - Enum `Role` ganha `REQUESTER` e `APPROVER` (além dos existentes ADMIN, BUYER, SUPER_ADMIN).
  - Campo `siteIds: String[]` adicionado em User (default `[]`).
  - Endpoint `PATCH /api/users/:id` aceita atualizar `role` e `siteIds`.
  - Frontend: tela Users mostra coluna "Role" com badge colorido por papel.
  - Validação: se role = REQUESTER, `siteIds` precisa ter ≥ 1 obra ou o usuário recebe erro 422.
  - Permission seed: REQUESTER ganha `quotes:create` em obras vinculadas; APPROVER ganha `approvals:write`.
- **Notas técnicas:**
  - Considerar `siteIds` como `String[]` array Postgres vs tabela junction `UserSite`. Array Postgres é suficiente até 10 obras por usuário; acima disso revisitar.
  - Sidebar do REQUESTER esconde menus que ele não tem permissão (Settings, Suppliers, etc.).
- **Test plan:**
  - Unit: validações zod.
  - Integration: 4 cenários de permission (REQUESTER vendo quotes, APPROVER aprovando, etc.).
- **DoD:** AC validado, seed atualizado com 1 usuário de cada role.
- **Riscos:** REQUESTER autenticando direto no painel web (não só WhatsApp) — decisão: sim, ele pode logar e ver suas obras + suas solicitações, mas não pode disparar cotação direta nem ver fornecedores.

---

### CO-1-10 — Adicionar `siteId` (NOT NULL) ao modelo Quote + migration de dados

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** schema
- **Origem:** `backend/prisma/schema.prisma` modelo `Quote`
- **Dependências:** CO-1-01
- **User Story:** Como sistema, eu quero garantir que toda cotação esteja vinculada a uma obra para que rateio de custos, sugestão de fornecedores por região e relatórios por canteiro sejam possíveis.
- **AC:**
  - Schema: adicionar `siteId String` (FK obrigatória para `Site`).
  - Migration em 2 fases: primeiro adiciona `siteId String?` (nullable), depois aplica `UPDATE quotes SET siteId = ...` (no fork não há dados), depois muda para NOT NULL.
  - Frontend: criar/editar cotação obriga selecionar obra.
- **Notas técnicas:** essa task fica mais complexa quando houver dados em produção; no fork é simples.
- **Test plan:** integration: criar Quote sem siteId retorna 422.
- **DoD:** AC validado, schema documentado.
- **Riscos:** baixíssimo (banco vazio).

---

### CO-1-11 — Marcar modelo `Producer` como legacy (`@@map`) e bloquear novos writes

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 1
- **Prioridade:** P1
- **Módulo:** schema + backend
- **Origem:** modelo `Producer`
- **Dependências:** CO-0-05
- **User Story:** Como tech lead, eu quero impedir uso acidental do modelo `Producer` no código novo até que a migração para `User+Site` esteja 100% concluída.
- **AC:**
  - `Producer` marcado com `@@map("_legacy_producers")` no Prisma.
  - Linter custom (ESLint rule) avisa em PR se importar `Producer` do prisma client.
  - Documentação `STATUS.md` marca como DEPRECATED.
- **Notas técnicas:** considerar deletar definitivamente em Sprint 3 quando todas as referências saírem.
- **Test plan:** lint roda em CI; PR teste falha.
- **DoD:** PR aprovado.
- **Riscos:** baixo.

---

### CO-1-12 — Atualizar dashboard `Dashboard.tsx` com KPIs estáticos (placeholder até dados reais)

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P1
- **Módulo:** frontend
- **Origem:** `frontend/src/pages/Dashboard.tsx`
- **Dependências:** CO-1-09
- **User Story:** Como comprador, eu quero ver na home do app um dashboard com 4 KPIs principais (Cotações abertas, Propostas pendentes, Economia 30d, Obras ativas) mesmo que ainda zerados, para que eu sinta o produto.
- **AC:**
  - 4 KPI cards usando dados reais agregados via novos endpoints (que retornam zero válido).
  - Layout em grid responsivo.
  - Skeleton state enquanto carrega.
- **Test plan:** componente test + visual review.
- **DoD:** AC validado.
- **Riscos:** dados reais virão progressivamente; manter loading state robusto.

---

### CO-1-13 — Demo + retrospectiva Sprint 1

- **Tipo:** ✨ NEW
- **SP:** 0 (overhead, não conta SP)
- **Prioridade:** P0
- **Dependências:** todas do sprint 1
- **AC:** demo gravada com fluxo: login → criar obra → criar fornecedor → import CSV de 5 materiais → criar cotação manual com 2 itens (sem dispatch ainda).
- **DoD:** vídeo + ata de retrospectiva + ajustes no backlog do sprint 2.

---

**Sprint 1 — totalização:** 3+5+5+1+5+5+4+3+3+2+1+2 = **39 SP** (9 acima do estimado).

**Mitigação:** CO-1-12 pode pular para Sprint 2 (P1, baixo impacto). CO-1-11 também pode pular. Reduz para 36 SP. Time de 3 devs entrega 36 em 2 semanas com folga.

---

# SPRINT 2 — FSM Solicitante via WhatsApp + Fila de Solicitações (28 SP / 2 semanas)

**Meta do sprint:** o engenheiro de obra consegue mandar mensagem WhatsApp e abrir uma solicitação que cai na fila do comprador. A FSM lida com seleção de obra, item único e multi-item via link web. NLU extrai entidades.

**Critério de sucesso do sprint:**

- Engenheiro manda "preciso de 200 sacas de cimento na obra Aurora pra sexta" e o sistema cria solicitação em ≤ 10s.
- Comprador vê a solicitação na fila e consegue promover para Quote.

---

### CO-2-01 — Adaptar `requester.flow.ts`: estado AWAITING_SITE_SELECTION + estados de item

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 8
- **Prioridade:** P0
- **Módulo:** backend / flows
- **Origem:** `backend/src/flows/requester.flow.ts` (já renomeado em CO-0-06)
- **Dependências:** CO-1-09, CO-1-10
- **User Story:** Como engenheiro de obra, eu quero conversar pelo WhatsApp com o CotaObra e o sistema entender qual obra eu represento, qual material preciso, quantos e até quando, sem eu precisar entrar em painel ou app.
- **Contexto:** A FSM do cotaAgro perguntava direto sobre o item. No CotaObra precisamos primeiro identificar qual obra o usuário está representando, porque um engenheiro pode trabalhar em várias obras simultaneamente. Estados FSM definidos em `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` §6.1.
- **AC:**
  - **Given** um número de WhatsApp cadastrado em `User.phone` com role `REQUESTER` e `siteIds: [siteA, siteB]`
  - **When** o usuário envia "oi" pela primeira vez
  - **Then** o bot responde: "Olá! Você está atrelado a 2 obras: 1) Aurora Torre A 2) Vila Nova. Em qual obra é esta solicitação? Responda 1 ou 2."
  - **And** após resposta válida, FSM avança para `AWAITING_MODE` (item único ou multi-item).
  - **And** se o usuário tem `siteIds: [único]`, pula direto para `AWAITING_MODE`.
  - **Estados implementados:** IDLE → AWAITING_SITE_SELECTION → AWAITING_MODE → AWAITING_MATERIAL → AWAITING_QUANTITY → AWAITING_UNIT → AWAITING_SPEC (opcional) → AWAITING_DEADLINE → AWAITING_OBSERVATION → AWAITING_CONFIRMATION → SUBMITTED.
  - Cada transição grava `ConversationState.context`.
  - Idempotência via `messageId` (já existe no cotaAgro, herdar).
- **Notas técnicas:**
  - 12 testes unit cobrindo cada transição.
  - Mensagens de cada estado em `messages.requester.*`.
  - Quando entrar em SUBMITTED, criar registro em nova tabela `QuoteRequest` (sub-task CO-2-08) com status `PENDING_REVIEW`.
- **Test plan:**
  - Unit: simulador de FSM com 15 cenários (caminho feliz, retorno errado, timeout, multi-obra).
  - Manual: WhatsApp real em staging com 2 obras seed.
- **DoD:** AC validado, cobertura ≥ 80% no arquivo.
- **Riscos:** complexidade alta — quebrar em 3 PRs (estados de seleção, estados de item, confirmação).

---

### CO-2-02 — Adaptar NLU prompt do GPT-4o para entidades de construção

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend / nlu
- **Origem:** `backend/src/services/nlu-extractor.service.ts`
- **Dependências:** CO-1-05 (catálogo de materiais)
- **User Story:** Como engenheiro, eu quero mandar texto livre como "preciso de 200 sacas de cimento CP-II na obra Aurora pra sexta" e o bot já preencher os campos sozinho, sem eu responder 7 perguntas.
- **AC:**
  - Prompt-engineered no `nlu-extractor.service.ts` retorna JSON: `{ material: string, quantity: number, unit: string, siteHint?: string, deadlineHint?: string, spec?: string }`.
  - Material: tenta fazer match fuzzy contra `Material.name` + `Material.spec` do catálogo do tenant (e do CotaObra global). Se confiança ≥ 0.8, vincula `materialId`; senão, mantém string livre.
  - Quantity: number ou null.
  - Unit: normalizado contra lista (CO-0-07).
  - SiteHint: nome ou trecho do nome da obra (matching feito na CO-2-01).
  - DeadlineHint: data parseada (com `chrono-node` ou similar) — "sexta" → próxima sexta-feira.
  - Fallback regex se a chamada GPT-4o falhar ou exceder timeout (3s).
- **Notas técnicas:**
  - Few-shot prompt com 5 exemplos do domínio construção.
  - Custo OpenAI: estimar ~$0.001 por mensagem. Aceitável.
- **Test plan:**
  - Unit: 20 frases-amostra com gold output esperado.
  - Eval: rodar tooling de regressão (existe no cotaAgro? Senão criar simples).
- **DoD:** AC validado, doc com prompt e exemplos em `docs/nlu-prompt.md`.
- **Riscos:** GPT-4o sazonalmente piora (alucinação). Manter test de regressão automatizado.

---

### CO-2-03 — Smart-fill da FSM consumindo NLU para pular etapas

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend / flows
- **Origem:** `backend/src/services/smart-fill.service.ts`
- **Dependências:** CO-2-01, CO-2-02
- **User Story:** Como engenheiro, eu quero pular as 7 perguntas do bot quando minha primeira mensagem já tem a informação completa.
- **AC:**
  - Primeira mensagem após `IDLE` é passada ao NLU.
  - Campos com confiança ≥ 0.8 são pré-preenchidos.
  - FSM pula para `AWAITING_CONFIRMATION` mostrando resumo.
  - Usuário confirma com "ok"/"sim" ou corrige campo específico (ex.: "muda pra 300 sacas") com inline-edit (já existe no cotaAgro).
- **Notas técnicas:** reutilizar `inline-edit-advanced.service.ts` para correções em qualquer campo do resumo.
- **Test plan:**
  - Unit: 10 cenários (resumo completo, parcial, com correção inline, ambíguo).
- **DoD:** AC validado.
- **Riscos:** smart-fill pular obra errada → pesquisa em `siteIds` do usuário para limitar escopo.

---

### CO-2-04 — Multi-item: gerar link web `quote-token` e tela `QuoteRequestForm.tsx`

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 5
- **Prioridade:** P0
- **Módulo:** backend + frontend
- **Origem:** `backend/src/modules/quote-form/` (já existe estrutura)
- **Dependências:** CO-2-01
- **User Story:** Como engenheiro, quando tenho 5+ itens diferentes para pedir, eu quero clicar num link e preencher tudo num formulário pelo celular em vez de responder 5×7 perguntas no WhatsApp.
- **AC:**
  - Em `AWAITING_MODE`, se usuário escolhe "multi-item", FSM cria `QuoteToken` com TTL configurável (default 24h) e responde com URL pública: `https://cotaobra.app/r/{token}`.
  - Tela carrega obra já pré-selecionada (do token).
  - Form permite adicionar 1..N itens (cada um com material, qty, unit, spec).
  - Botão "adicionar item" e "remover item".
  - Validação client-side e server-side.
  - Ao submeter, FSM finaliza para `SUBMITTED` e o `ConversationState` é limpo.
- **Notas técnicas:**
  - Token JWT curto, assinatura HS256, payload `{ userId, siteId, exp }`.
  - Form usa autocomplete sobre catálogo de materiais (CO-1-06).
- **Test plan:** integration + e2e (cenário CO-2-13 adicional).
- **DoD:** AC validado, screenshots desktop e mobile.
- **Riscos:** UX no mobile pequeno — auditar com engenheiro real.

---

### CO-2-05 — Resolver vínculo telefone → User → siteIds (lookup principal)

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** backend
- **Dependências:** CO-1-09
- **User Story:** Como sistema, eu quero identificar o usuário e suas obras pelo número de WhatsApp recebido no webhook, para personalizar a FSM logo na primeira mensagem.
- **AC:**
  - Função `resolveRequester(phone)` retorna `{ user, sites: Site[] } | null`.
  - Caso `null`, FSM responde "número não cadastrado — fale com seu comprador".
  - Caso 1 site, FSM pula seleção de obra.
  - Caso ≥ 2 sites, FSM entra em `AWAITING_SITE_SELECTION`.
- **Notas técnicas:** considera `User.phone` (normalizado E.164) + `User.role IN (REQUESTER, BUYER, ADMIN)`.
- **Test plan:** unit 5 cenários.
- **DoD:** AC validado.
- **Riscos:** número compartilhado entre usuários (não permitir cadastro duplicado: `@@unique([tenantId, phone])`).

---

### CO-2-06 — Modelo `QuoteRequest` (pré-Quote em revisão) + endpoints

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** schema + backend
- **Dependências:** CO-2-01
- **User Story:** Como comprador, eu quero uma fila separada de "Solicitações Pendentes" que mostre o que veio do WhatsApp/form antes de virar uma cotação para que eu revise antes de disparar para fornecedores.
- **AC:**
  - Modelo `QuoteRequest` no Prisma com: id, tenantId, siteId, requesterId, items JSON (array { description, qty, unit, spec, materialId? }), deadlineAt, observation, status `PENDING_REVIEW | PROMOTED | REJECTED`, createdAt.
  - Endpoints: `GET /api/quote-requests?status=pending`, `GET /api/quote-requests/:id`, `POST /api/quote-requests/:id/promote` (cria Quote a partir dela), `POST /api/quote-requests/:id/reject`.
  - Promote: cria Quote com status `AWAITING_BUYER_REVIEW` e QuoteItems mapeados; marca a request como PROMOTED.
- **Notas técnicas:**
  - Por que separar Quote vs QuoteRequest? Porque o comprador pode rejeitar a solicitação antes dela virar cotação real (evita poluir histórico de quotes com lixo).
- **Test plan:** integration 5 endpoints.
- **DoD:** migration aplicada, AC validado.
- **Riscos:** complexidade extra — alguns produtos juntam tudo em Quote com status. Decisão: separar agora porque o relatório de "taxa de conversão de solicitação → cotação" é métrica importante para o comprador.

---

### CO-2-07 — Tela `QuoteRequests.tsx` (fila do comprador)

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** frontend
- **Dependências:** CO-2-06
- **User Story:** Como comprador, eu quero entrar no painel e ver imediatamente quantas solicitações novas chegaram para revisar, com badge no menu lateral.
- **AC:**
  - Rota `/quote-requests`.
  - Lista: cards com obra, solicitante (foto/nome), itens (preview 3 primeiros), prazo, idade (há 2h, etc.).
  - Ações por linha: "Revisar" (abre detalhe) e "Rejeitar" (com motivo).
  - "Revisar" abre modal ou tela `QuoteRequestReview.tsx` (item nessa task) que permite:
    - Mapear cada item livre para um Material do catálogo (autocomplete).
    - Editar quantidade/unidade.
    - Definir prazo final (deadline) e expiração.
    - Selecionar fornecedores manualmente OU usar "Sugerir fornecedores" (CO-3-01).
    - Botão "Promover para Cotação" cria Quote em `AWAITING_BUYER_REVIEW` e redireciona para `/quotes/:id`.
  - Badge no Sidebar com contagem (hook `useSidebarBadges`).
- **Notas técnicas:**
  - SSE para badge live (já existe `sse-manager.ts` no cotaAgro).
- **Test plan:** componente + e2e.
- **DoD:** AC validado.
- **Riscos:** UX do mapeamento item livre → material catalogado. Considerar "auto-mapear" com confiança alta e mostrar diff.

---

### CO-2-08 — Mensagem de confirmação ao solicitante após criar QuoteRequest

- **Tipo:** ✨ NEW
- **SP:** 1
- **Prioridade:** P0
- **Módulo:** backend
- **Dependências:** CO-2-01
- **User Story:** Como engenheiro, depois de fechar a solicitação no bot, quero receber confirmação clara: "Sua solicitação #1234 foi recebida e está sendo analisada pelo comprador. Você será notificado quando os preços chegarem."
- **AC:**
  - Após `SUBMITTED`, bot envia mensagem com número da solicitação e link de tracking (placeholder até sprint 5).
- **Test plan:** integration.
- **DoD:** AC validado em staging com WhatsApp real.
- **Riscos:** baixo.

---

### CO-2-09 — Tratamento de timeout & abandono da FSM (job já existente, adaptar)

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 1
- **Prioridade:** P1
- **Módulo:** backend / jobs
- **Origem:** `backend/src/jobs/detect-abandoned-quotes.job.ts`
- **Dependências:** CO-2-01
- **User Story:** Como sistema, eu quero detectar quando um solicitante parou no meio da conversa por > 30min e mandar lembrete amigável ou encerrar o estado.
- **AC:**
  - Job que roda a cada 10min, encontra `ConversationState` com role `REQUESTER` parados há > 30min.
  - Envia lembrete: "Sua solicitação ainda está em andamento. Quer continuar?" com opção "continuar" / "cancelar".
  - Após 24h sem resposta, limpa o estado.
- **Test plan:** unit + simulação temporal.
- **DoD:** AC validado.
- **Riscos:** baixo (job já existe, só adaptar textos).

---

### CO-2-10 — Audio transcription path para solicitação por áudio

- **Tipo:** 🔀 FORK-COPY (ajuste mínimo)
- **SP:** 1
- **Prioridade:** P1
- **Módulo:** backend
- **Origem:** `backend/src/services/audio-transcription.service.ts`
- **Dependências:** CO-2-02
- **User Story:** Como engenheiro de obra (com mãos sujas, capacete, no canteiro), eu quero mandar áudio em vez de digitar a solicitação.
- **Contexto:** Whisper já está integrado no cotaAgro. Pertinente para construção também — engenheiro raramente está em condição de digitar.
- **AC:**
  - Webhook recebe mensagem tipo `audio`.
  - Sistema baixa o áudio, transcreve com Whisper API, passa o texto pelo NLU.
  - Resposta segue fluxo normal.
- **Test plan:** integration com fixture de áudio.
- **DoD:** AC validado.
- **Riscos:** custo Whisper (~$0.006/min). Limitar áudios a 60s.

---

### CO-2-11 — Logs estruturados e métricas da FSM solicitante

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 1
- **Prioridade:** P1
- **Módulo:** backend / observabilidade
- **Origem:** `backend/src/services/fsm-event.service.ts`, `metrics.service.ts`
- **Dependências:** CO-2-01
- **User Story:** Como tech lead, eu quero medir taxa de conclusão da FSM solicitante (entrou em IDLE → saiu em SUBMITTED) para que possamos otimizar onde os usuários desistem.
- **AC:**
  - Cada transição emite evento `fsm.requester.transition` no PostHog com `from`, `to`, `siteId`, `tenantId`.
  - Métrica Prometheus `fsm_requester_state_total{from, to}`.
  - Dashboard Grafana (ou PostHog insight) mostra funil.
- **Test plan:** unit verifica que evento é emitido.
- **DoD:** dashboard configurado + screenshot.
- **Riscos:** baixo.

---

### CO-2-12 — Demo + retrospectiva Sprint 2

- **Tipo:** ✨ NEW / overhead
- **SP:** 0
- **AC:** demo: engenheiro real (ou PO atuando) envia áudio "preciso de 300 sacas de cimento na Aurora pra sexta", solicitação aparece na fila em ≤ 30s.
- **DoD:** vídeo demo, ata, ajustes backlog sprint 3.

---

**Sprint 2 — totalização:** 8+3+3+5+2+3+3+1+1+1+1 = **31 SP** (3 acima do estimado). Aceitável.

---

# SPRINT 3 — Dispatch & FSM Fornecedor (30 SP / 2 semanas)

**Meta do sprint:** o comprador clica em "Disparar" na cotação e os fornecedores selecionados recebem WhatsApp com cotação para responder. Templates HSM aprovados na Meta. FSM do fornecedor coleta preço/prazo/condição/frete.

**Critério de sucesso do sprint:**

- Cotação saída do CO-2-07 dispara para 3 fornecedores em ≤ 5s.
- Fornecedor responde via WhatsApp e proposta entra no banco.
- 6 templates HSM aprovados na Meta antes do go-live do sprint.

---

### CO-3-01 — Sugestão automática de fornecedores por categoria + região

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend
- **Dependências:** CO-1-08, CO-1-09
- **User Story:** Como comprador, ao revisar uma cotação eu quero o sistema sugerir os fornecedores certos com base nas categorias dos itens e na região da obra, para que eu não precise pensar.
- **AC:**
  - Função `suggestSuppliers(quoteId): Supplier[]` que retorna até 8 sugestões ranqueadas.
  - Critérios de match:
    - Fornecedor cobre TODAS as categorias dos itens (peso 50%) ou pelo menos uma (peso 20%).
    - Fornecedor atende a região da obra (peso 30%).
    - Histórico: rating médio nas últimas 10 cotações (peso 15%).
    - Velocidade média de resposta nas últimas 5 cotações (peso 5%).
  - Botão "Sugerir fornecedores" na revisão preenche os checkboxes; comprador desmarca os que não quer.
  - Endpoint: `GET /api/quotes/:id/suggested-suppliers`.
- **Test plan:** unit 6 cenários + integration.
- **DoD:** AC validado.
- **Riscos:** algoritmo simples — refinar com ML em sprints futuros.

---

### CO-3-02 — Job `dispatch-quote` adaptado para construção

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend / jobs
- **Origem:** `backend/src/jobs/dispatch-quote.job.ts`
- **Dependências:** CO-3-01, CO-3-08 (templates HSM)
- **User Story:** Como comprador, ao clicar "Disparar" eu quero o sistema notificar todos os fornecedores selecionados em paralelo via WhatsApp, criar registros de tracking e iniciar a janela de coleta.
- **AC:**
  - Endpoint `POST /api/quotes/:id/dispatch` enfileira o job.
  - Job: para cada fornecedor selecionado, cria `QuoteSupplierNotification` com status `PENDING` e envia mensagem HSM `cotacao_nova` com variáveis: número da cotação, construtora, itens (resumo), prazo, link do form proposta.
  - Quote.status muda para `COLLECTING`.
  - `Quote.expiresAt` é setado com base em `tenant.defaultExpiryHours`.
  - Falhas individuais não bloqueiam o batch — fornecedor com erro fica `FAILED` com `errorMsg`.
  - Lock distribuído (Redlock) evita duplicação se job for retried.
- **Notas técnicas:** observar AUD-04 (corrigido em CO-0-10): só HSM fora da janela 24h.
- **Test plan:** integration com 3 fornecedores mock + integration com WhatsApp sandbox.
- **DoD:** AC validado em staging.
- **Riscos:** Twilio/Meta sandbox para staging tem limite de mensagens — usar para 3 sandbox numbers seed.

---

### CO-3-03 — Adaptar `supplier.flow.ts` com condições de pagamento de construção

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend / flows
- **Origem:** `backend/src/flows/supplier.flow.ts`
- **Dependências:** CO-3-02
- **User Story:** Como fornecedor, eu quero responder cotação via WhatsApp coletando preço, prazo, condição (à vista, 28dd, 28/56dd, 30/60/90dd) e frete (CIF/FOB), porque é o padrão da construção e não do agro.
- **AC:**
  - Estados conforme `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` §6.2.
  - `AWAITING_PAYMENT_TERMS` mostra menu numérico:
    - 1) À vista
    - 2) 28 dias
    - 3) 28/56 dias
    - 4) 30/60/90 dias
    - 5) Outro (texto livre)
  - `AWAITING_FREIGHT` mostra: 1) CIF (frete por minha conta) 2) FOB (cliente retira). Se FOB, pula `AWAITING_FREIGHT_VALUE`. Se CIF, pergunta valor numérico.
  - Validações: preço > 0, prazo ≥ 0 dias, condição obrigatória.
  - Suporte a inline-edit ("muda o preço pra 95") em qualquer ponto antes do SUBMITTED.
- **Test plan:** unit 12 cenários, integration.
- **DoD:** AC validado.
- **Riscos:** lista de condições não cobre tudo — campo "outro" + texto livre como escape.

---

### CO-3-04 — Multi-item: form web do fornecedor para responder múltiplos itens

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 4
- **Prioridade:** P0
- **Módulo:** backend + frontend
- **Origem:** `frontend/src/pages/ProposalForm.tsx` + `backend/src/modules/proposal-token/`
- **Dependências:** CO-3-02
- **User Story:** Como fornecedor, quando a cotação tem 5+ itens, eu quero clicar num link e preencher tudo num form do celular em vez de responder 5×4 perguntas no WhatsApp.
- **AC:**
  - Template HSM `cotacao_nova_multi_item` inclui link `https://cotaobra.app/p/{token}`.
  - Form mostra cabeçalho com construtora, obra, prazo de entrega solicitado.
  - Tabela de itens com colunas: Material | Qtd | Unidade | Preço unitário (R$) | Disponível? (checkbox).
  - Campos globais: prazo (dias úteis), pagamento (select), frete (CIF/FOB+valor), observação.
  - Cálculo de total em tempo real.
  - Validação client+server.
  - Botão "Enviar proposta" cria `Proposal` + `ProposalItem`s, FSM finaliza para `SUBMITTED`.
- **Test plan:** componente + e2e.
- **DoD:** AC validado mobile real.
- **Riscos:** UX em tela pequena com 10+ itens — testar com mockup com 15 itens.

---

### CO-3-05 — Validações semânticas extras (sanity check de preço)

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P1
- **Módulo:** backend
- **Origem:** `backend/src/services/semantic-validator.service.ts`
- **Dependências:** CO-3-03, CO-1-05
- **User Story:** Como sistema, eu quero detectar quando o fornecedor errou um zero ("R$ 350,00 a saca de cimento" quando o mercado é R$ 35) para pedir confirmação antes de aceitar.
- **AC:**
  - Para cada `ProposalItem.unitPrice`, comparar com mediana das últimas 30 propostas do mesmo material+região.
  - Se desvio > 3x mediana, FSM pergunta: "O preço de R$ 350,00/saca é bem acima do mercado (~R$ 35). Confirma?".
  - Mesma lógica para preço muito abaixo (suspeita de erro ou dump).
- **Test plan:** unit 4 cenários.
- **DoD:** AC validado.
- **Riscos:** falso positivo no início (sem histórico). Default: válido se < 5 amostras.

---

### CO-3-06 — Cron `send-followup` para lembrar fornecedores que não responderam

- **Tipo:** 🔀 FORK-COPY (adapt texto)
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** backend / jobs
- **Origem:** `backend/src/jobs/followup-suppliers.job.ts`
- **Dependências:** CO-3-02
- **User Story:** Como sistema, eu quero lembrar amigavelmente fornecedores que ainda não responderam quando faltam 6h para a cotação expirar, para aumentar a taxa de resposta.
- **AC:**
  - Cron a cada 30min varre `QuoteSupplierNotification` em status `SENT`/`DELIVERED` para quotes em `COLLECTING` cuja `expiresAt` está a < 6h.
  - Manda template HSM `cotacao_followup` (1 vez só por fornecedor por cotação).
  - Respeita rate limit do tenant (30 msg/min, 1000/h).
- **Test plan:** unit + simulação.
- **DoD:** AC validado.
- **Riscos:** spam — limitar a 1 followup por fornecedor por quote (idempotência).

---

### CO-3-07 — Tracking de delivery/read receipts WhatsApp

- **Tipo:** 🔀 FORK-COPY
- **SP:** 1
- **Prioridade:** P1
- **Módulo:** backend
- **Origem:** `backend/src/modules/whatsapp/` + `QuoteSupplierNotification`
- **Dependências:** CO-3-02
- **User Story:** Como comprador, eu quero ver no painel se a mensagem foi entregue e lida pelo fornecedor para que eu saiba quem realmente engajou.
- **AC:**
  - Webhook `/api/whatsapp/status-callback` recebe eventos (sent, delivered, read, failed) e atualiza `QuoteSupplierNotification`.
  - Frontend (CO-4-05) mostra cada fornecedor com ícone de status.
- **Test plan:** integration com fixture de webhook payload.
- **DoD:** AC validado.
- **Riscos:** webhook signature verification (já feito no cotaAgro, herdar).

---

### CO-3-08 — Submeter 6 templates HSM à aprovação da Meta

- **Tipo:** ✨ NEW (processo, não código)
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** processo / conteúdo
- **Dependências:** CO-0-09
- **User Story:** Como PO, eu quero garantir que os 6 templates HSM essenciais estejam aprovados pela Meta antes do go-live do sprint para não bloquearmos por falta de canal.
- **AC:**
  - 6 templates submetidos no Business Manager:
    - `cotacao_nova` (4 variáveis)
    - `cotacao_nova_multi_item` (5 variáveis: inclui link)
    - `cotacao_followup` (2 variáveis)
    - `cotacao_resultado_vencedor` (3 variáveis)
    - `cotacao_resultado_perdedor` (3 variáveis)
    - `solicitacao_recebida` (2 variáveis)
  - Idioma: `pt_BR`.
  - Categoria: UTILITY (não MARKETING — UTILITY é mais barato e libera).
  - Cada template aprovado registrado em `whatsapp_config.templates` JSON do tenant.
- **Notas técnicas:** tempo médio de aprovação Meta é 24–72h. Submeter no início do sprint.
- **DoD:** 6 templates com status `APPROVED` no Business Manager + screenshots.
- **Riscos:** Meta rejeita por linguagem promocional. Mitigação: texto utilitário, sem CTAs comerciais.

---

### CO-3-09 — Quadro de status `Quote` no painel (visão tempo real)

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** frontend
- **Origem:** `frontend/src/pages/QuoteDetail.tsx`
- **Dependências:** CO-3-07
- **User Story:** Como comprador, eu quero ver na tela de detalhe da cotação cada fornecedor convidado com seu status (Pendente | Recebeu | Visualizou | Respondeu | Sem resposta), atualizado em tempo real.
- **AC:**
  - Lista de fornecedores convidados com avatar/nome + chip de status colorido.
  - SSE atualiza status sem reload.
  - Contador "3/5 responderam" no topo.
- **Test plan:** componente + integration SSE.
- **DoD:** AC validado.
- **Riscos:** SSE em mobile — fallback polling se SSE falhar.

---

### CO-3-10 — Antiloop e rate limit por telefone + tenant

- **Tipo:** 🔀 FORK-COPY
- **SP:** 1
- **Prioridade:** P0
- **Módulo:** backend
- **Origem:** `anti-loop.service.ts`, `status-rate-limit.service.ts`
- **Dependências:** CO-3-02
- **User Story:** Como sistema, eu quero impedir loops infinitos e bombardeio de mensagens para o mesmo número.
- **AC:**
  - Anti-loop: nunca enviar > 5 mensagens automatizadas em < 60s para o mesmo número.
  - Rate limit: 30 msg/min e 1000 msg/h por tenant.
- **Test plan:** unit + load test simulando burst.
- **DoD:** AC validado.
- **Riscos:** clientes com piloto grande podem estourar — alarme no Sentry quando rate limit é atingido.

---

### CO-3-11 — Métricas de funil do fornecedor

- **Tipo:** 🔀 FORK-COPY
- **SP:** 1
- **Prioridade:** P1
- **Módulo:** backend / observabilidade
- **Origem:** `fsm-event.service.ts`
- **Dependências:** CO-3-03
- **User Story:** Como PO, eu quero medir taxa de fornecedores que: receberam → abriram link → responderam → submeteram proposta.
- **AC:**
  - 4 eventos PostHog: `supplier.notified`, `supplier.opened_link`, `supplier.started_proposal`, `supplier.submitted_proposal`.
  - Insight no PostHog visualiza funil.
- **DoD:** funil configurado.
- **Riscos:** baixo.

---

### CO-3-12 — Demo + retrospectiva Sprint 3

- **SP:** 0
- **AC:** demo: comprador revisa solicitação CO-2-* → dispara para 3 fornecedores → 2 respondem via WhatsApp em < 10min → 1 não responde. Painel reflete tudo.

---

**Sprint 3 — totalização:** 3+3+3+4+2+2+1+3+3+1+1 = **26 SP** (4 abaixo do estimado, sobra para imprevistos).

---

# SPRINT 4 — Consolidação, Pricing Engine & Quadro Comparativo (28 SP / 2 semanas)

**Meta do sprint:** quando todos os fornecedores respondem (ou expira o prazo), o sistema consolida as propostas, calcula o ranking corrigido (preço + frete + custo financeiro + ajuste de prazo) e mostra ao comprador um quadro comparativo lado a lado em que ele pode decidir.

**Critério de sucesso do sprint:**

- Cotação com 3 fornecedores responde → após expirar, comprador vê quadro com ranking corrigido em ≤ 30s.
- Comprador consegue ver detalhe item a item e exportar resumo CSV.
- Ranking corrigido difere do ranking bruto em ≥ 30% das cotações de teste (prova que a fórmula faz diferença).

---

### CO-4-01 — `pricing-engine.service.ts` (NEW) com ranking corrigido pure-function

- **Tipo:** ✨ NEW
- **SP:** 5
- **Prioridade:** P0
- **Módulo:** backend / services
- **Origem:** especificação em `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` §10
- **Dependências:** nenhuma (pode rodar em paralelo)
- **User Story:** Como comprador, eu quero comparar propostas com prazos, fretes e condições diferentes de forma justa, para não acabar fechando com quem cobra mais caro porque parece mais barato no preço bruto.
- **Contexto:** Esta é a **decisão de produto central** do CotaObra versus CotaAgro. No agro, ranking era por menor preço total. Aqui, precisamos corrigir por (1) frete real, (2) custo financeiro do parcelamento, (3) penalidade por atraso vs prazo desejado.
- **AC:**
  - Função `computeCorrectedTotal(proposal, quote, settings): { corrected, breakdown }` pure (sem side effect).
  - Fórmula:
    ```
    base = sum(proposalItems.totalPrice where available=true)
    freight = (proposal.freightMode === 'CIF') ? 0 : proposal.freightValue ?? 0
       // Nota: CIF = frete já incluso no preço; FOB = comprador paga separado
    financialCost = base * monthlyRate * weightedDays(paymentTerms) / 30
    deliveryAdjustment = max(0, (proposal.deliveryDays - quote.deadlineDays)) * dailyPenalty% * base
    corrected = base + freight + financialCost + deliveryAdjustment
    ```
  - `monthlyRate` default 1.0% (configurável em `TenantSettings.paymentPolicy.monthlyRate`).
  - `dailyPenalty` default 0.5%/dia (configurável).
  - `weightedDays('AVISTA')` = 0; `weightedDays('28DD')` = 28; `weightedDays('28/56DD')` = média ponderada = 42; `weightedDays('30/60/90')` = 60.
  - Retorna breakdown explícito: `{ base, freight, financialCost, deliveryAdjustment, corrected }` para exibir tooltip no UI.
  - Cobertura 100% (pure function, sem desculpa).
- **Notas técnicas:**
  - Arquivo: `backend/src/services/pricing-engine.service.ts`.
  - Decimal.js para precisão (não float).
- **Test plan:**
  - Unit: 15+ casos cobrindo cada combinação CIF/FOB + cada modalidade de pagamento + casos edge (proposal sem frete, prazo igual ao deadline, propostas idênticas com pagamento diferente).
- **DoD:** 100% cobertura, documentação inline + exemplo no JSDoc.
- **Riscos:** stakeholder pode querer mudar fórmula (CFO da construtora pode argumentar "custo financeiro nosso é 0,8%, não 1%"). Por isso é tudo configurável.

---

### CO-4-02 — Adaptar `consolidate-quote.job.ts` para usar o pricing engine

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend / jobs
- **Origem:** `backend/src/jobs/consolidate-quote.job.ts`
- **Dependências:** CO-4-01
- **User Story:** Como sistema, eu quero rodar consolidação automaticamente quando: (a) todos os fornecedores responderam OU (b) expirou o prazo (`expiresAt < now`), e gerar ranking corrigido.
- **AC:**
  - Cron a cada 5min seleciona quotes em `COLLECTING` que ou estão 100% respondidas ou venceram.
  - Para cada quote selecionada (lock distribuído Redlock):
    - Calcula `correctedTotal` para cada `Proposal` via pricing engine.
    - Atribui `rank` por ordem crescente de `correctedTotal` (1 = melhor).
    - Marca quote como `SUMMARIZED`.
    - Dispara evento SSE para o painel do comprador atualizar live.
    - Envia notificação push ao comprador (email + sino do app): "Cotação #1234 consolidada. Você economizou R$ X com o ranking corrigido."
  - Quote sem nenhuma proposta vai para `EXPIRED` (não `SUMMARIZED`).
- **Notas técnicas:** lock Redlock já existe (AUD-01 fix em CO-0-10).
- **Test plan:** unit + integration: 4 cenários (100% respondida, expirada com respostas, expirada sem respostas, lock contention).
- **DoD:** AC validado em staging.
- **Riscos:** propostas chegam DURANTE a consolidação — handle race: ignorar propostas com `receivedAt > job startTime`.

---

### CO-4-03 — Endpoint `GET /api/quotes/:id/comparative`

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend
- **Dependências:** CO-4-02
- **User Story:** Como frontend, eu quero um payload pronto para renderizar a tabela comparativa (item × fornecedor × preço × subtotal) com ranking pré-calculado, para não fazer 5 chamadas e fazer aggregation no cliente.
- **AC:**
  - Endpoint retorna JSON estruturado:
    ```json
    {
      "quote": { id, number, siteName, items: [{id, description, qty, unit, materialName}] },
      "proposals": [
        {
          "supplierId", "supplierName", "rank",
          "totalValue", "correctedTotal", "breakdown": {...},
          "freightMode", "freightValue",
          "paymentTerms", "deliveryDays",
          "items": [{ "quoteItemId", "unitPrice", "totalPrice", "available", "rank" }]
        }
      ],
      "summary": {
        "lowestCorrectedTotal", "highestCorrectedTotal",
        "savings": (highest - lowest),
        "winnerSupplierId"
      }
    }
    ```
  - RBAC: BUYER, ADMIN, APPROVER podem ler; REQUESTER vê apenas resumo (sem preços absolutos).
- **Notas técnicas:** N+1 queries proibidas — usar Prisma `include` chained.
- **Test plan:** integration 3 cenários (cotação consolidada, em coleta, expirada vazia).
- **DoD:** AC validado, p95 latência ≤ 200ms.
- **Riscos:** payload grande com 10 fornecedores × 20 itens — paginação por item (rara mas considerar).

---

### CO-4-04 — Componente `PricingComparator` (quadro lado a lado)

- **Tipo:** ✨ NEW
- **SP:** 5
- **Prioridade:** P0
- **Módulo:** frontend
- **Dependências:** CO-4-03
- **User Story:** Como comprador, eu quero ver os fornecedores lado a lado em colunas, com itens nas linhas, com totais (bruto e corrigido) destacados, com o vencedor em verde, para tomar decisão num único olhar.
- **AC:**
  - Layout: tabela responsiva (desktop = horizontal; mobile = scroll horizontal + freeze coluna "item").
  - Linhas: 1 por `QuoteItem` (com nome + qty + unidade no cabeçalho da linha).
  - Colunas: 1 por `Proposal` (cabeçalho com nome do fornecedor + rank).
  - Células: preço unitário + total (subtotal por item × proposta).
  - Linha de rodapé: `totalValue` (bruto) e `correctedTotal` com chip mostrando o breakdown ao hover.
  - Linha "Frete": valor + modalidade (CIF/FOB).
  - Linha "Pagamento": modalidade.
  - Linha "Prazo": dias.
  - Cell com `available: false` é cinza com "indisponível".
  - Cell vencedora do item (menor preço naquele item) tem badge "1º".
  - Cabeçalho de coluna do vencedor geral (rank 1 por correctedTotal) tem fundo verde.
  - Ações por linha: ver detalhe (drawer), trocar coluna (split).
  - Ações globais: "Fechar com este fornecedor", "Fechar com split", "Cancelar cotação", "Exportar CSV".
- **Notas técnicas:**
  - Tabela com `<thead>` sticky + virtualização para > 30 linhas.
  - Tooltip do breakdown usa Radix Popover.
- **Test plan:**
  - Componente: 5 tests (vazio, com 1 proposta, com 5 propostas + 10 itens, com indisponíveis, hover do breakdown).
  - E2E: cenário "ver comparativo".
- **DoD:** AC validado, design review com PO, screenshots desktop+mobile.
- **Riscos:** UX complexa — fazer protótipo Figma antes da implementação (incluído em CO-1-13 retro).

---

### CO-4-05 — Adaptar `QuoteDetail.tsx` para usar PricingComparator + ações

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 5
- **Prioridade:** P0
- **Módulo:** frontend
- **Origem:** `frontend/src/pages/QuoteDetail.tsx`
- **Dependências:** CO-4-04, CO-3-09
- **User Story:** Como comprador, a tela de detalhe da cotação é meu cockpit: vejo dados da obra, itens, lista de fornecedores convidados (com status), e quando consolida vejo o PricingComparator com ações.
- **AC:**
  - Layout em 3 seções: Cabeçalho (obra, prazo, observação) | Fornecedores convidados (com status live) | Quadro comparativo (se consolidada).
  - Estados visuais por `Quote.status`:
    - AWAITING_BUYER_REVIEW → só cabeçalho + botão "Promover" (vindo de QuoteRequest)
    - COLLECTING → cabeçalho + lista de status + spinner "aguardando..."
    - SUMMARIZED → PricingComparator + ações
    - CLOSED → comparativo readonly + badge vencedor + link PDF
    - EXPIRED → mensagem + botão "reabrir / novo dispatch"
    - CANCELED → mensagem
  - Quebrar em 3 PRs (gerencia complexidade): (a) refator skeleton, (b) seção fornecedores, (c) integração comparator + ações.
- **Test plan:** componente + E2E cenário fim a fim (sprint 9).
- **DoD:** AC validado, screenshots de cada status.
- **Riscos:** maior tela do produto — alocar dev mais sênior. Code review estendido.

---

### CO-4-06 — Notificações in-app (SSE + sino do app) para comprador

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P1
- **Módulo:** backend + frontend
- **Origem:** `backend/src/lib/sse-manager.ts`
- **Dependências:** CO-4-02
- **User Story:** Como comprador, eu quero receber notificação no painel (sino) e por email quando uma cotação consolida, sem precisar ficar atualizando F5.
- **AC:**
  - Backend: ao consolidar, publica evento SSE `quote.consolidated` + envia email.
  - Frontend: sino no header mostra badge com contagem não-lida; dropdown lista últimas 10.
  - Clicar leva para `/quotes/:id`.
- **Test plan:** integration SSE + componente.
- **DoD:** AC validado.
- **Riscos:** SSE em reverse proxy — Traefik suporta nativamente.

---

### CO-4-07 — Exportar quadro comparativo como CSV/XLSX

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P1
- **Módulo:** backend + frontend
- **Dependências:** CO-4-03
- **User Story:** Como comprador, eu quero baixar o comparativo em Excel para anexar à reunião de decisão com a diretoria.
- **AC:**
  - Botão "Exportar Excel" gera XLSX com 2 sheets: "Resumo" (totais por fornecedor) e "Detalhe" (item × fornecedor).
  - Coluna `correctedTotal` em destaque (negrito + cor).
  - Endpoint: `GET /api/quotes/:id/export?format=xlsx`.
- **Notas técnicas:** usar `exceljs` (já familiar no ecossistema do user).
- **Test plan:** integration, manual abre o arquivo.
- **DoD:** AC validado.
- **Riscos:** baixo.

---

### CO-4-08 — Tela `Quotes.tsx` (lista filtrável)

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** frontend
- **Origem:** `frontend/src/pages/Quotes.tsx`
- **Dependências:** CO-1-09
- **User Story:** Como comprador, eu quero listar todas as cotações com filtros por status, obra, período e comprador responsável.
- **AC:**
  - Tabela paginada com colunas: #, Obra, Itens (qtd), Status (chip), Convidados/Respostas, Valor (corrigido se aplicável), Comprador, Criado em, Ações.
  - Filtros laterais: status (multi), obra (multi), período (range picker), comprador.
  - Persistência de filtros em querystring.
  - Empty state com CTA.
- **Test plan:** componente + e2e cenário "filtrar por obra".
- **DoD:** AC validado.
- **Riscos:** filtro de período mal configurado é causa comum de "não vejo minha cotação" — default últimos 30d.

---

### CO-4-09 — `quote-status.service.ts` adaptado com estados novos

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 1
- **Prioridade:** P0
- **Módulo:** backend
- **Origem:** `backend/src/services/quote-status.service.ts`
- **Dependências:** CO-4-02
- **User Story:** Como sistema, eu quero centralizar a máquina de estados da Quote (AWAITING_BUYER_REVIEW → COLLECTING → SUMMARIZED → AWAITING_APPROVAL → CLOSED) para que transições inválidas sejam bloqueadas (ex.: não dá pra fechar uma cotação em COLLECTING).
- **AC:**
  - Função `transitionQuote(quoteId, newStatus, ctx): Quote` rejeita transições não permitidas (mapping explícito).
  - Auditoria: cada transição grava `AuditLog` com `userId`/`reason`.
- **Test plan:** unit matrix de transições.
- **DoD:** AC validado.

---

### CO-4-10 — Demo + retrospectiva Sprint 4

- **SP:** 0
- **AC:** demo end-to-end: criar cotação → disparar 3 fornecedores → 3 respondem → consolida → comprador vê comparativo com ranking corrigido + breakdown.

---

**Sprint 4 — totalização:** 5+3+3+5+5+2+2+2+1 = **28 SP** (no estimado, sem folga).

---

# SPRINT 5 — Fechamento, Purchase Order & PDF (26 SP / 2 semanas)

**Meta do sprint:** comprador fecha cotação (winner-takes-all OU split por item), sistema cria `PurchaseOrder`, gera PDF anexável ao ERP, notifica vencedor e perdedores.

**Critério de sucesso do sprint:**

- Comprador fecha → PO criada com PDF em ≤ 5s.
- Vencedor recebe WhatsApp confirmando + PDF.
- Perdedores recebem notificação respeitosa, sem expor preços absolutos.

---

### CO-5-01 — Modelo Prisma `PurchaseOrder` + migration

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** schema
- **Origem:** especificação em arquitetura §5
- **Dependências:** nenhuma
- **User Story:** Como sistema, eu quero persistir o pedido (PO) separado da cotação porque o pedido tem vida própria (PDF anexo, aprovado por X, integrado ao ERP por Y).
- **AC:**
  - Modelo conforme arquitetura: id, tenantId, quoteId UNIQUE, supplierId, totalValue, paymentTerms, deliveryDays, pdfUrl nullable, approvedById nullable, createdAt.
  - Para split: model `PurchaseOrder` ganha campo `parentPurchaseOrderId String?` (self-ref) para POs filhas.
  - Migration aplica sem erro.
- **Test plan:** integration.
- **DoD:** ER diagram atualizado.
- **Riscos:** numeração humana das POs — adicionar `number Int @default(autoincrement) @@unique([tenantId, number])` similar a Quote.

---

### CO-5-02 — `purchase-order.service.ts` (NEW)

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend
- **Dependências:** CO-5-01
- **User Story:** Como sistema, eu quero uma service que orquestre: receber decisão de fechamento → criar PO(s) → gerar PDF → notificar partes → atualizar quote.
- **AC:**
  - Função `closeQuote(quoteId, mode: 'winner' | 'split', selections, userId): { purchaseOrders }`.
  - **mode='winner':** uma única PO com o `rank=1` por correctedTotal (ou o supplierId passado explicitamente se override).
  - **mode='split':** cria N POs (uma por fornecedor distinto), agrupando os items selecionados.
  - Validações:
    - quote.status === 'SUMMARIZED' ou 'AWAITING_APPROVAL_APPROVED' (aprovação já feita).
    - Cada item da quote deve ter exatamente 1 supplier no split.
  - Side effects: dispara job `generate-po-pdf` + job `notify-winner` + atualiza quote.status para CLOSED.
- **Test plan:** unit 8 cenários + integration.
- **DoD:** AC validado.
- **Riscos:** split parcial (alguns itens fechados, outros não) — fora de escopo MVP; rejeitar com 422.

---

### CO-5-03 — Endpoint `POST /api/quotes/:id/close`

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** backend
- **Dependências:** CO-5-02
- **User Story:** Como frontend, eu quero um endpoint que receba a decisão do comprador (modo + seleções) e dispare todo o fluxo de fechamento.
- **AC:**
  - Body: `{ mode: 'winner' | 'split', selections?: { [quoteItemId]: supplierId }, reason?: string }`.
  - RBAC: somente BUYER ou ADMIN podem fechar; se valor acima do `approvalThreshold`, retorna 409 com `requiresApproval: true` (CO-6-*).
  - Retorna: `{ purchaseOrderIds: [...], pdfUrls: [...] }` (URLs assinadas, TTL 1h).
- **Test plan:** integration 5 cenários.
- **DoD:** AC validado.

---

### CO-5-04 — Template PDF da Ordem de Compra

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 5
- **Prioridade:** P0
- **Módulo:** backend / templates
- **Origem:** `backend/src/templates/quote-pdf.template.ts` (template do cotaAgro)
- **Dependências:** CO-5-02
- **User Story:** Como comprador, eu quero um PDF profissional da OC para anexar ao ERP da minha empresa, com cabeçalho da construtora, dados da obra, fornecedor, itens, totais, condição, prazo e campo de assinatura.
- **AC:**
  - PDF gerado com PDFKit (já no stack).
  - Layout em 1 página (até 15 itens) ou 2 (16+ itens).
  - **Cabeçalho:** logo do tenant + nome + CNPJ + endereço.
  - **Bloco "Obra":** nome + endereço + CNO + responsável.
  - **Bloco "Fornecedor":** razão social + CNPJ + contato.
  - **Tabela de itens:** colunas: # | Descrição | Qtd | Unid | Preço unit | Total.
  - **Rodapé:** Subtotal | Frete (CIF/FOB) | Total | Condição de pagamento | Prazo de entrega | Observações.
  - **Assinatura:** 2 linhas (Comprador / Fornecedor) com data.
  - **Identidade visual:** cores neutras (preto/cinza), tipografia Inter/Helvetica.
  - **Marca d'água:** "CotaObra" tênue no rodapé.
  - Salvo no MinIO em `purchase-orders/{tenantId}/{poId}.pdf` com URL assinada.
- **Notas técnicas:**
  - Tipo de papel A4 portrait.
  - Margem 2cm.
- **Test plan:** unit: snapshot do PDF gerado em test. Manual: abrir 3 PDFs gerados de cotações com 5, 15 e 30 itens.
- **DoD:** PDFs revisados pelo PO + 1 engenheiro/comprador real.
- **Riscos:** layout quebra em qty de itens edge — testar com 1, 5, 15, 30.

---

### CO-5-05 — Job `generate-purchase-order-pdf`

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** backend / jobs
- **Origem:** `backend/src/jobs/generate-quote-pdf.job.ts`
- **Dependências:** CO-5-04
- **User Story:** Como sistema, eu quero gerar o PDF de forma assíncrona para não bloquear a resposta HTTP do fechamento.
- **AC:**
  - Job enfileirado pelo `closeQuote`, retry 3x com backoff exponencial.
  - Após sucesso, atualiza `PurchaseOrder.pdfUrl`.
  - SSE notifica frontend.
- **Test plan:** integration + retry test (simular falha do MinIO).
- **DoD:** AC validado.

---

### CO-5-06 — Job `notify-winner` (WhatsApp + email)

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend / jobs
- **Dependências:** CO-5-02, CO-3-08 (templates HSM)
- **User Story:** Como fornecedor vencedor, eu quero receber confirmação de que ganhei a cotação, com resumo da OC e o PDF anexado, via WhatsApp e email.
- **AC:**
  - Para cada PO criada, envia HSM `cotacao_resultado_vencedor` com variáveis: nº PO, total, prazo, link do PDF.
  - Email com PDF anexado (se fornecedor.email != null).
  - Audit log: registro de envio.
- **Test plan:** integration com fixture supplier.
- **DoD:** AC validado.
- **Riscos:** link do PDF público (URL assinada) tem TTL — definir 7 dias.

---

### CO-5-07 — Notificação aos fornecedores não vencedores (sem expor preços)

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P1
- **Módulo:** backend
- **Dependências:** CO-5-02, CO-3-08
- **User Story:** Como fornecedor que não ganhou, eu quero saber que a cotação fechou e em que posição fiquei (sem ver preços absolutos dos concorrentes) para que eu ajuste minha estratégia.
- **AC:**
  - Envia HSM `cotacao_resultado_perdedor` com variáveis: nº cotação, posição (2º de 5), delta% para o vencedor (ex.: "+8%" sem revelar preço absoluto).
  - Não expõe `correctedTotal` do vencedor.
  - Exposição: posição + delta% — equilibra transparência e proteção comercial do comprador.
- **Test plan:** integration.
- **DoD:** AC validado.
- **Riscos:** alguns clientes podem querer ocultar até a posição. Fazer configurável em `TenantSettings.notifyLosersMode` (`none | position_only | full`). Default `position_only`.

---

### CO-5-08 — Tela `PurchaseOrders.tsx` (lista) + `PurchaseOrderDetail.tsx`

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** frontend
- **Dependências:** CO-5-02
- **User Story:** Como comprador, eu quero listar todas as POs geradas e abrir o detalhe com link de download do PDF para reenviar quando necessário.
- **AC:**
  - Rota `/purchase-orders` lista paginada com colunas: # | Cotação relacionada | Fornecedor | Obra | Total | Status (DRAFT|EMITTED|CANCELED) | PDF | Ações.
  - Detail mostra dados + iframe do PDF (PDF.js) + botão re-emitir PDF.
- **Test plan:** componente + e2e.
- **DoD:** AC validado.

---

### CO-5-09 — Atualizar histórico de preços ao fechar (insert em `PriceHistoryRaw`)

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P1
- **Módulo:** backend
- **Dependências:** CO-5-02
- **User Story:** Como sistema, eu quero registrar cada `ProposalItem` vencedor numa tabela de histórico raw para alimentar o relatório de evolução de preços (CO-7-*).
- **AC:**
  - Modelo `PriceHistoryRaw`: id, tenantId, materialId, supplierId, siteId, region, unitPrice, qty, paymentTerms, observedAt.
  - Insert acontece dentro da transaction do `closeQuote`.
  - Inclui propostas vencedoras E perdedoras (para "preço de mercado", não só vencedor).
- **Test plan:** integration.
- **DoD:** AC validado.

---

### CO-5-10 — Demo + retrospectiva Sprint 5

- **SP:** 0
- **AC:** demo fim a fim: criar → consolidar → fechar (winner) → PDF gerado → vencedor recebe WhatsApp → perdedor recebe sem preço.

---

**Sprint 5 — totalização:** 2+3+2+5+2+3+2+3+2 = **24 SP** (2 abaixo, folga).

---

# SPRINT 6 — Aprovação hierárquica & Histórico de preços (22 SP / 2 semanas)

**Meta do sprint:** compras acima do teto configurado pelo admin entram em fila de aprovação do diretor antes de virar PO. Histórico de preços tem cron de agregação diária.

**Critério de sucesso do sprint:**

- Cotação > R$ 50k (configurável) fica em `AWAITING_APPROVAL` até diretor aprovar.
- Diretor recebe notificação WhatsApp + email + push.
- Histórico de preços agregado disponível via endpoint.

---

### CO-6-01 — Modelo Prisma `Approval` + workflow

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** schema
- **Dependências:** CO-1-09
- **AC:**
  - Modelo: id, tenantId, quoteId, requestedById (buyer), approverId (User APPROVER), status (PENDING|APPROVED|REJECTED), thresholdAmount, totalAmount, reason (text — quando rejeita), decidedAt, createdAt.
  - Constraint: 1 approval ativo por quote.
- **Test plan:** integration.
- **DoD:** migration aplicada.

---

### CO-6-02 — `approval.service.ts` + endpoints

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend
- **Dependências:** CO-6-01
- **User Story:** Como sistema, eu quero rotear cotação para fila de aprovação quando `correctedTotal` da escolha do comprador exceder `approvalThreshold` do tenant.
- **AC:**
  - Endpoints: `GET /api/approvals?status=pending`, `POST /api/approvals/:id/approve`, `POST /api/approvals/:id/reject` (com reason obrigatório).
  - Quando comprador fecha quote acima do teto, `closeQuote` cria `Approval` em PENDING e muda quote para `AWAITING_APPROVAL`.
  - Quando aprovador aprova: chama `closeQuote` internamente para finalizar.
  - Quando aprovador rejeita: quote volta para `SUMMARIZED` com flag de "rejeitada pelo diretor", comprador pode escolher outra opção.
  - RBAC: APPROVER e ADMIN podem aprovar.
- **Test plan:** integration 6 cenários.
- **DoD:** AC validado.

---

### CO-6-03 — Tela `Approvals.tsx` (fila do diretor) + `ApprovalDetail.tsx`

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** frontend
- **Dependências:** CO-6-02
- **AC:**
  - Lista paginada: # | Cotação | Obra | Comprador | Valor | Solicitado em | Ações (Aprovar/Rejeitar).
  - Detail mostra resumo da quote + comparativo + botões Aprovar/Rejeitar com modal de motivo.
  - Aprovador APPROVER vê apenas suas fila; ADMIN vê todas do tenant.
- **Test plan:** componente + e2e.
- **DoD:** AC validado.

---

### CO-6-04 — Notificação ao aprovador (WhatsApp + email + sino)

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** backend
- **Dependências:** CO-6-02, CO-3-08
- **AC:**
  - Quando approval entra em PENDING: envia HSM `aprovacao_pendente` (novo template — submeter à Meta) + email + SSE.
  - Lembrete após 24h sem decisão.
- **Test plan:** integration.
- **DoD:** template HSM submetido + AC validado.

---

### CO-6-05 — Setting de teto de aprovação na tela `Settings.tsx`

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** frontend
- **Origem:** `frontend/src/pages/Settings.tsx`
- **Dependências:** CO-0-04
- **User Story:** Como admin do tenant, eu quero definir o teto (R$) acima do qual cotações precisam de aprovação para que minha hierarquia interna seja respeitada.
- **AC:**
  - Campo numérico com mask BR.
  - Default: R$ 0 (sem aprovação obrigatória).
  - Salvar gera audit log.
  - Switch: "exigir aprovação acima do teto" (on/off).
- **Test plan:** componente.
- **DoD:** AC validado.

---

### CO-6-06 — `PriceHistoryAggregate` model + cron diário

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P1
- **Módulo:** schema + backend / jobs
- **Origem:** `PriceHistoryRaw` (CO-5-09)
- **Dependências:** CO-5-09
- **User Story:** Como sistema, eu quero pré-agregar histórico de preços diariamente para que relatórios sejam rápidos mesmo com milhões de linhas raw.
- **AC:**
  - Modelo: id, tenantId, materialId, region, period (YYYY-MM), minPrice, maxPrice, avgPrice, medianPrice, samples, paymentTermsBreakdown JSON.
  - Cron 03:00 diário (lock Redlock) recalcula últimos 13 meses por material+região.
  - Performance: 100k+ raw linhas processadas em ≤ 60s.
- **Test plan:** unit do agregador + load test.
- **DoD:** cron rodando em staging com seed de dados.
- **Riscos:** cresce rápido — particionar por ano se necessário (v2).

---

### CO-6-07 — Endpoint `GET /api/reports/price-history`

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P1
- **Módulo:** backend
- **Dependências:** CO-6-06
- **AC:**
  - Query params: `materialId` (obrigatório), `region` (opcional), `from` (yyyy-mm), `to` (yyyy-mm).
  - Retorna série temporal com min/max/avg/median + samples por período.
  - Cache Redis (TTL 1h).
- **Test plan:** integration.
- **DoD:** AC validado.

---

### CO-6-08 — Demo + retrospectiva Sprint 6

- **SP:** 0
- **AC:** demo: criar cotação grande (> teto), comprador fecha, vai pra fila do diretor, diretor aprova ou rejeita; gráfico de histórico de preço do cimento aparece.

---

**Sprint 6 — totalização:** 2+3+3+2+2+3+2 = **17 SP** (5 abaixo). Sobra para imprevistos do sprint anterior.

---

# SPRINT 7 — Relatórios, Dashboard real & Onboarding (18 SP / 2 semanas)

**Meta do sprint:** 5 relatórios essenciais funcionando com dados reais; KPIs do dashboard puxam dos endpoints; onboarding checklist guia novo usuário até fechar 1ª cotação.

---

### CO-7-01 — `/api/reports/funnel`

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** backend
- **Origem:** `backend/src/modules/reports/`
- **Dependências:** dados acumulados nos sprints 2-6
- **User Story:** Como comprador, eu quero ver funil: Solicitações → Cotações criadas → Cotações disparadas → Cotações consolidadas → Cotações fechadas, com taxa de conversão entre etapas.
- **AC:**
  - Endpoint retorna `{ stages: [{ name, count }], conversions: [{ from, to, rate }] }`.
  - Filtros: período (default 30d), obra (opcional).
- **Test plan:** integration com seed.
- **DoD:** AC validado.

---

### CO-7-02 — `/api/reports/savings`

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** backend
- **Dependências:** CO-5-09
- **User Story:** Como diretor, eu quero saber quanto a plataforma "economizou" definido como Σ(highestCorrectedTotal - winnerCorrectedTotal) das quotes fechadas no período.
- **AC:**
  - Retorna `{ totalSavings, savingsBySite: [...], savingsByPeriod: [...] }`.
- **Test plan:** integration.
- **DoD:** AC validado.
- **Riscos:** "economia" é métrica delicada — documentar fórmula explicitamente para evitar contestação.

---

### CO-7-03 — `/api/reports/supplier-performance`

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P1
- **Módulo:** backend
- **Origem:** existente no cotaAgro
- **AC:**
  - Para cada fornecedor: invitations | responses | wins | avg response time | avg rank | rating médio.
  - Filtros: período, categoria.
- **DoD:** AC validado.

---

### CO-7-04 — `/api/reports/site-spend`

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P1
- **Módulo:** backend
- **Dependências:** CO-5-09
- **User Story:** Como diretor, eu quero ver quanto cada obra gastou em compras no mês para identificar overbudget.
- **AC:**
  - Endpoint retorna por obra: total gasto | budget configurado | % consumido | top 5 categorias.
- **DoD:** AC validado.

---

### CO-7-05 — Tela `Reports.tsx` com 5 relatórios

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** frontend
- **Origem:** `frontend/src/pages/Reports.tsx`
- **Dependências:** CO-7-01 a CO-7-04 + CO-6-07
- **AC:**
  - Tabs: Funil | Economia | Fornecedores | Obras | Preços históricos.
  - Cada tab tem gráfico Recharts + tabela detalhe + export CSV.
- **Test plan:** componente + visual review.
- **DoD:** AC validado.

---

### CO-7-06 — Dashboard real com 4 KPIs vivos

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** frontend
- **Origem:** `Dashboard.tsx`
- **Dependências:** todas as reports
- **AC:**
  - 4 KPIs: Cotações abertas | Propostas pendentes | Economia 30d | Obras ativas.
  - Cada KPI clicável leva para lista filtrada.
  - Mini gráfico de tendência (sparkline) em cada card.
- **DoD:** AC validado.

---

### CO-7-07 — Onboarding checklist (walkthrough da 1ª cotação)

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 3
- **Prioridade:** P1
- **Módulo:** frontend
- **Origem:** `frontend/src/components/onboarding/`
- **Dependências:** todas as features principais
- **User Story:** Como novo usuário, eu quero um checklist no canto da tela que me guie pelos 5 passos para criar e fechar minha primeira cotação.
- **AC:**
  - Checklist com itens: 1) Cadastrar obra | 2) Cadastrar 3 fornecedores | 3) Criar primeira cotação | 4) Disparar para fornecedores | 5) Fechar cotação.
  - Cada item, ao concluído, marca check e mostra próximo.
  - Persiste em `User.onboardingProgress JSON`.
- **DoD:** AC validado.

---

### CO-7-08 — `scheduled-reports.job` (envio por email)

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P2
- **Módulo:** backend / jobs
- **Origem:** existente, mas incompleto no cotaAgro (gap conhecido)
- **AC:**
  - Tenant pode configurar: "enviar resumo semanal para email X às segundas 8h".
  - Job lê config e envia email com KPIs + PDF anexo com top 5 cotações fechadas na semana.
- **Test plan:** integration + simulação cron.
- **DoD:** AC validado.

---

### CO-7-09 — Demo + retro Sprint 7

- **SP:** 0

---

**Sprint 7 — totalização:** 2+2+2+2+3+2+3+2 = **18 SP**.

---

# SPRINT 8 — Integração ERP via Webhook & Billing (Asaas Pix) (22 SP / 2 semanas)

**Meta do sprint:** integração outbound para ERP (Sienge / GVdasa / customizado via webhook) com assinatura HMAC; cobrança via Asaas Pix recorrente; planos novos.

---

### CO-8-01 — `erp-webhook.service.ts` (NEW) com signature HMAC

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** backend
- **Dependências:** CO-5-02
- **User Story:** Como construtora, ao fechar uma cotação eu quero que o sistema envie automaticamente o pedido para o nosso ERP via webhook, eliminando re-digitação.
- **AC:**
  - Endpoint outbound configurável por tenant: URL, secret HMAC.
  - Payload: PurchaseOrder + Quote + Site + Supplier + Items.
  - Assinatura: header `X-CotaObra-Signature: sha256={hex}` (HMAC-SHA256 do body com secret).
  - Retry 5x com backoff exponencial (1s, 4s, 16s, 1min, 5min).
  - Falhas finais geram alerta no painel + email admin.
- **Test plan:** unit + integration com mock receiver.
- **DoD:** AC validado.
- **Riscos:** ERPs diferentes querem schemas diferentes. MVP: 1 schema canônico, custom mappers em v2.

---

### CO-8-02 — Tela `Integrations.tsx` (config webhook + test)

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** frontend
- **Dependências:** CO-8-01
- **AC:**
  - Tela para configurar URL + gerar secret + botão "Enviar payload de teste".
  - Log das últimas 20 entregas (status, timestamp, response code, retry count).
  - Reenviar manualmente.
- **DoD:** AC validado.

---

### CO-8-03 — Integração Asaas (Pix recorrente)

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 5
- **Prioridade:** P0
- **Módulo:** backend
- **Origem:** stub `backend/src/modules/billing/`
- **Dependências:** CO-0-04
- **User Story:** Como tenant, eu quero pagar mensalmente via Pix recorrente automatizado, sem boletos, sem cartão internacional.
- **AC:**
  - Onboarding cria cliente no Asaas via API.
  - Plano (STARTER/PRO/ENT) cria assinatura recorrente Pix.
  - Webhook Asaas atualiza `Subscription.status`.
  - Falha de pagamento gera retry em D+3 + email; após 2 falhas suspende acesso (modo readonly).
- **Notas técnicas:** `.env` `ASAAS_API_KEY` + sandbox key.
- **Test plan:** integration usando sandbox Asaas.
- **DoD:** assinatura criada e cobrada em staging.
- **Riscos:** Asaas pode falhar — fallback boleto manual no MVP.

---

### CO-8-04 — Atualizar planos e tela `Subscriptions.tsx`

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** backend + frontend
- **Origem:** `config/plans.ts` + `Subscriptions.tsx`
- **Dependências:** CO-8-03
- **AC:**
  - 3 planos:
    - **STARTER** R$ 297/mês — 1 obra, 50 cotações/mês, 1 usuário, suporte email
    - **PRO** R$ 697/mês — 5 obras, 250 cotações/mês, 5 usuários, suporte WhatsApp, ERP webhook
    - **ENTERPRISE** R$ 1.997/mês — ilimitado, SLA, aprovador, customizações
  - Settings `sitesLimit`, `quotesLimit`, `usersLimit` enforced.
  - Tela mostra plano atual + uso + CTA upgrade.
- **DoD:** AC validado.

---

### CO-8-05 — Reset de quotas mensal

- **Tipo:** 🔀 FORK-COPY
- **SP:** 1
- **Prioridade:** P0
- **Módulo:** backend / jobs
- **Origem:** `reset-quotas.job.ts`
- **Dependências:** CO-8-04
- **AC:**
  - Cron 1º dia do mês 00:01 reseta `Tenant.monthlyQuotesUsed = 0`.
- **DoD:** AC validado.

---

### CO-8-06 — Webhook dispatch após `closeQuote` (gating por plano)

- **Tipo:** ✨ NEW
- **SP:** 1
- **Prioridade:** P0
- **Módulo:** backend
- **Dependências:** CO-8-01, CO-8-04
- **AC:**
  - Após `closeQuote`, se `tenant.plan in [PRO, ENTERPRISE]` E `tenant.erpWebhookUrl` configurado, dispara webhook.
- **DoD:** AC validado.

---

### CO-8-07 — Lead capture na nova Landing (futura task — placeholder)

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P1
- **Módulo:** frontend
- **Dependências:** CO-0-08
- **User Story:** Como prospect, eu quero deixar meu email + CNPJ + telefone numa landing simples para começar trial.
- **AC:**
  - Landing nova em `/`: hero + 3 features + pricing + form lead.
  - Form salva em `Lead` (módulo existente) + dispara email-drip (CO-0-09).
- **DoD:** AC validado; design final pode evoluir no sprint 9.

---

### CO-8-08 — Demo + retrospectiva Sprint 8

- **SP:** 0
- **AC:** fechar cotação → ERP recebe webhook → admin paga primeira mensalidade Asaas → tenant fica ativo.

---

**Sprint 8 — totalização:** 3+3+5+2+1+1+2 = **17 SP** (5 abaixo do estimado). Sobra para ajustes.

---

# SPRINT 9 — Polish, Hardening, E2E completo & Go-to-Pilot (14 SP / 2 semanas)

**Meta do sprint:** levantar cobertura a 60%+, criar 10 cenários E2E, hardening de segurança (RBAC audit + pen test interno), preparar onboarding do primeiro piloto.

---

### CO-9-01 — Aumentar cobertura de teste backend para ≥ 60%

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** testes
- **Dependências:** todas as features anteriores
- **AC:**
  - Cobertura agregada ≥ 60% (linhas).
  - Cobertura por módulo: `quotes`, `proposals`, `sites`, `materials`, `approvals` ≥ 70%.
  - `pricing-engine.service.ts` 100% (já no CO-4-01).
  - CI bloqueia merge se cobertura cair.
- **DoD:** badge no README + relatório Istanbul/c8.
- **Riscos:** times tendem a escrever testes superficiais — review com QA.

---

### CO-9-02 — Suite completa Playwright (10 cenários E2E)

- **Tipo:** ✨ NEW
- **SP:** 3
- **Prioridade:** P0
- **Módulo:** testes
- **Dependências:** todas
- **AC:** 10 cenários cobrindo: login, criar obra, criar fornecedor, import CSV material, criar QuoteRequest via API, promover para Quote, disparar, simular proposta via API, consolidar, fechar (winner e split), aprovação acima do teto, falha de webhook ERP com retry.
- **DoD:** suite ≤ 15min, verde em 3 runs consecutivos.
- **Riscos:** flakiness — usar `expect.soft` para asserções múltiplas e `retry: 1` por suite.

---

### CO-9-03 — Pen test interno + audit RBAC

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** segurança
- **Dependências:** todas
- **AC:**
  - Checklist OWASP top 10 aplicado.
  - Teste cross-tenant: usuário do tenant A não consegue ler/escrever recursos do tenant B em nenhum endpoint (script automatizado).
  - Sentry sem CRITICAL aberto.
- **DoD:** relatório de pentest em `docs/security/pentest-pilot.md` + 0 issues abertas.
- **Riscos:** descobrir vulnerabilidade em vésperas do piloto. Mitigação: dedicar buffer de 2 dias no fim do sprint.

---

### CO-9-04 — Performance / load test (50 cotações simultâneas)

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P1
- **Módulo:** infra / testes
- **Dependências:** todas
- **AC:**
  - K6 ou Artillery executa 50 cotações sendo disparadas em paralelo, cada com 5 fornecedores.
  - p95 latência dispatch ≤ 5s.
  - Bull queue não acumula > 200 jobs no pico.
  - Zero erros 5xx.
- **DoD:** report em `docs/perf/pilot-baseline.md`.
- **Riscos:** descobrir gargalo no Postgres — provisionar índices identificados.

---

### CO-9-05 — Runbook operacional + documentação usuário

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** docs
- **Dependências:** todas
- **AC:**
  - `RUNBOOK.md`: como restartar, como limpar fila Bull, como expandir storage, como rotacionar secrets.
  - `docs/user/getting-started.md` para o cliente piloto.
  - 3 vídeos curtos (≤ 2min cada): "Como cadastrar obra", "Como disparar cotação", "Como fechar e gerar PDF".
- **DoD:** material entregue ao piloto.

---

### CO-9-06 — Landing page profissional & hospedada

- **Tipo:** 🔧 FORK-ADAPT
- **SP:** 1
- **Prioridade:** P1
- **Módulo:** frontend
- **Origem:** CO-8-07
- **Dependências:** CO-8-07
- **AC:**
  - Versão polida com testimonial (pode ser placeholder até piloto), pricing tabela, FAQ.
- **DoD:** publicada em `cotaobra.app/`.

---

### CO-9-07 — Plano de rollout do piloto

- **Tipo:** ✨ NEW
- **SP:** 1
- **Prioridade:** P0
- **Módulo:** processo
- **Dependências:** todas
- **AC:**
  - Documento `docs/pilot-rollout.md` definindo:
    - Cliente piloto identificado + contato + escopo (1 obra, 5 fornecedores).
    - Cronograma de onboarding: D1 cadastros, D2-3 1ª cotação assistida, D7 checkpoint, D14 review.
    - Métricas de sucesso piloto: ≥ 10 cotações fechadas em 30d, NPS ≥ 7.
- **DoD:** plano aprovado por PO.

---

### CO-9-08 — Go/no-go meeting + deploy produção

- **SP:** 0
- **AC:** todas as anteriores verdes. Deploy production. Cliente piloto recebe credenciais.

---

**Sprint 9 — totalização:** 3+3+2+2+2+1+1 = **14 SP** (no estimado).

---

# 4. Apêndices

## 4.1 Total de SP do MVP

| Sprint | Estimado | Realizado planejado |
|--------|----------|----------------------|
| 0 | 24 | 28 |
| 1 | 30 | 36 (após mitigação) |
| 2 | 28 | 31 |
| 3 | 30 | 26 |
| 4 | 28 | 28 |
| 5 | 26 | 24 |
| 6 | 22 | 17 |
| 7 | 18 | 18 |
| 8 | 22 | 17 |
| 9 | 14 | 14 |
| **Total** | **242** | **239** |

Capacidade time (3 devs × 18 semanas × 5 SP/semana/dev) = 270 SP. Folga ~13% — saudável para imprevistos.

## 4.2 Backlog v2.x (pós-piloto, fora do MVP)

| ID | Tema | Justificativa |
|----|------|----------------|
| BL-01 | App mobile nativo (engenheiro) | PWA cobre 80% no início; nativo melhora UX em 6 meses |
| BL-02 | Marketplace aberto de fornecedores | Após 5+ pilotos validados |
| BL-03 | Recomendação ML de fornecedor por histórico | Precisa de ≥ 10k propostas para treinar |
| BL-04 | Integração nativa Sienge/GVdasa (não só webhook) | Vendas enterprise pedem |
| BL-05 | Gestão de empreitada/serviço | Diferente de material — fluxo distinto |
| BL-06 | Cotação proativa (sistema sugere recompra) | Após acumular padrão de consumo |
| BL-07 | App de fornecedor (não só WhatsApp) | Fornecedores grandes querem dashboard |
| BL-08 | Multi-idioma (espanhol p/ LATAM) | Após R$ 1M ARR |

## 4.3 Risk Register consolidado

| ID | Risco | Probabilidade | Impacto | Mitigação | Owner |
|----|-------|---------------|---------|-----------|-------|
| R-01 | Templates HSM rejeitados pela Meta | Média | Alto | Submeter na semana 1 do sprint 3; ter fallback de número novo | PO |
| R-02 | Bloqueio do número WhatsApp por uso indevido | Média | Crítico | AUD-04 fix + rate limit (CO-3-10) + nunca msg livre fora janela | Tech Lead |
| R-03 | Pricing engine contestado pelo CFO do cliente | Alta | Médio | Tudo configurável + breakdown explícito + doc da fórmula | PO |
| R-04 | UX comparativo confuso | Média | Alto | Protótipo Figma + teste com comprador real antes de implementar | Design |
| R-05 | Custo OpenAI escalando linear | Baixa | Médio | Cache de respostas NLU + fallback regex; monitorar via dashboard | Tech Lead |
| R-06 | Asaas falha pagamento | Média | Alto | Fallback boleto manual no MVP | PO |
| R-07 | Migration combinada Prisma quebra staging | Baixa | Alto | Banco do fork é novo desde dia 1 (sem mistura) | Tech Lead |
| R-08 | Time de devs subdimensionado | Média | Alto | 3 devs full-time × 18 sem com folga 13%; PO + QA part-time | Tech Lead / PO |
| R-09 | Cliente piloto desiste | Média | Alto | Onboarding hands-on (CO-9-05) + 2 clientes piloto em paralelo se possível | PO |
| R-10 | Cobertura E2E baixa permite regressão | Alta | Médio | 10 cenários no sprint 9; bloqueio de merge | QA |

## 4.4 RACI por épico

| Épico | Responsible | Accountable | Consulted | Informed |
|-------|-------------|-------------|-----------|----------|
| E1 Fork | Tech Lead | Tech Lead | PO | Devs |
| E2 Domínio | Backend Sr | Tech Lead | PO | Frontend, QA |
| E3 FSM Solicitante | Backend Pl + WhatsApp specialist | Tech Lead | PO | QA |
| E4 FSM Fornecedor | Backend Pl | Tech Lead | PO | QA |
| E5 Pricing & Comparator | Backend Sr + Frontend Sr | Tech Lead | PO + CFO cliente | QA |
| E6 Fechamento & PDF | Full-stack | Tech Lead | PO | Comprador piloto |
| E7 Aprovação & Histórico | Backend + Frontend | Tech Lead | PO | Diretor piloto |
| E8 Reports & Onboarding | Frontend Sr | Tech Lead | PO | Devs |
| E9 Integrations & Billing | Backend Sr | Tech Lead | PO + cliente piloto | Comercial |
| E10 Hardening & Pilot | Tech Lead + QA | PO | Tech Lead + Devs | Comercial |

## 4.5 Definition of Ready (DoR) detalhado

Uma task entra em sprint se cumprir:

1. **Story escrita** — User Story preenchida com sujeito + ação + benefício.
2. **AC verificáveis** — pelo menos 1 AC escrito em Gherkin ou checklist.
3. **Dependências mapeadas** — toda task pré-requisito está done OU agendada no mesmo sprint anterior.
4. **SP validado** — pelo menos 1 dev sênior estimou.
5. **Mockup/wireframe** anexado (se frontend).
6. **Decisões abertas resolvidas** — toda pergunta no campo "Riscos" tem decisão tomada antes do refinement.
7. **Owner técnico** atribuído.

## 4.6 Definition of Done (DoD) detalhado

Já listado na §2.4. Aplicação obrigatória.

## 4.7 Mapa de dependências críticas (caminho crítico)

```
CO-0-01 → CO-0-02 → CO-0-04 → CO-1-01 → CO-1-02 → CO-2-01 → CO-2-06 → CO-3-02 → CO-3-08 → CO-4-02 → CO-5-02 → CO-6-02 → CO-9-08
```

Qualquer atraso nessas tasks puxa todo o cronograma. Atenção redobrada.

## 4.8 Checklist final pré-piloto

- [ ] 100% das tasks P0 do sprint 0-9 done
- [ ] Cobertura backend ≥ 60%
- [ ] 10 cenários E2E verdes em 3 runs consecutivos
- [ ] Pen test interno sem critical
- [ ] 6 templates HSM aprovados pela Meta (+ 1 para aprovação)
- [ ] Asaas em modo produção
- [ ] Dominio cotaobra.app + SSL válido
- [ ] Sentry com alertas configurados
- [ ] Runbook publicado
- [ ] 3 vídeos de onboarding produzidos
- [ ] Cliente piloto contratado com SOW assinado
- [ ] Plano de rollback (caso piloto falhe)

---

**Fim do documento — CotaObra Backlog PO Sênior v2.0**

Próximo entregável sugerido: **CotaObra_Sprint0_TaskBoard.csv** com as 13 tasks do sprint 0 prontas para importação em Linear/Jira/GitHub Projects.


