# CotaObra — Roteiro de Desenvolvimento (Sprint 0 → Sprint 1)

**Documento operacional para os devs backend e frontend iniciarem o projeto.**

Autor: PO Sênior (Claude)
Data: 18 de maio de 2026
Versão: 1.0
Documentos relacionados: `CotaObra_Backlog_PO_Senior_v2.md`, `PLANO_DE_FORK.md`, `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md`

---

## 1. Decisões fechadas no kickoff

| # | Decisão | Valor | Impacto imediato |
|---|---------|-------|-------------------|
| D-01 | Provedor WhatsApp primário | **Evolution API** (self-hosted, Docker) | Cria container Evolution no Sprint 0; remove dependência Meta HSM aprovação; ajusta CO-0-09 e CO-3-08 |
| D-02 | Stack | Mantida do CotaAgro: Node 20+TS, React+Vite, Postgres 15, Redis 7, Bull, Prisma | Fork direto sem stack-rewrite |
| D-03 | Hospedagem staging | Mesmo VPS Hetzner do cotaAgro, stack Docker separada | DNS novo `cotaobra.staging.app` |
| D-04 | Tracking de tasks | GitHub Projects (board kanban) | Importação por CSV no início do Sprint 0 |
| D-05 | Repositório | `github.com/samuckamorais/cotaobra` (privado) | Setup no D-01 |
| D-06 | Gateway pagamento | Asaas (sandbox no Sprint 0; produção no Sprint 8) | Solicitar credenciais sandbox agora |

**Decisões ainda em aberto** (sem bloqueio para Sprint 0–2):

- Catálogo inicial de materiais: SINAPI curated vs blank. Decidir no Sprint 1, durante CO-1-05.
- Mobile do engenheiro: PWA (default) vs nativo. Mantém PWA no MVP.
- Integração ERP: webhook outbound (Sprint 8). Integração nativa Sienge/GVdasa entra em v2.

---

## 2. Ajustes ao backlog v2 dado o uso de Evolution

Como Evolution não usa HSM da Meta, algumas tasks mudam de natureza. Mantemos os IDs originais para rastreabilidade.

### CO-0-09 — Templates de mensagem (reformulada)

- **Antes:** redigir 6 templates HSM para submissão à Meta.
- **Agora:** redigir 6 mensagens em PT-BR como **strings parametrizadas** em `messages.ts`. Sem submissão Meta. O dev de backend define a interface `MessageTemplate { name, locale, variables[], body }` e o módulo `whatsapp/` resolve a string em runtime. Submissão à Meta volta como **opt-in futuro** quando algum tenant ENTERPRISE pedir provider Twilio/Meta.

### CO-3-08 — Submeter templates HSM à Meta (descontinuada no MVP)

- **Antes:** 3 SP de submissão à Meta.
- **Agora:** **substituída** por nova task **CO-0-14: provisionar instância Evolution + warming do número** (2 SP). Detalhada abaixo.

### CO-0-10 / AUD-04 — Fix HSM (reformulada)

- **Antes:** wrapper recusa envio livre fora da janela 24h sem template HSM.
- **Agora:** wrapper aplica **rate limit conservador** (máx 30 msg/h por número nos primeiros 14 dias após warming), **delays randômicos** (entre 8 e 25s entre mensagens), e **abort em padrão de erro do Evolution** (se 3 erros 5xx consecutivos, pausa o número por 1h e alerta). Mitigação contra bloqueio.

### Nova task CO-0-14 — Provisionar instância Evolution + warming

- **Tipo:** ✨ NEW
- **SP:** 2
- **Prioridade:** P0
- **Módulo:** infra
- **Dependências:** CO-0-11 (staging up)
- **AC:**
  - Container Evolution rodando no VPS staging em porta interna.
  - 1 número WhatsApp dedicado conectado via QR code (de preferência um chip novo, sem histórico de spam).
  - "Warming" inicial: 7 dias antes do go-live mandar ~10 mensagens orgânicas/dia para contatos reais (PO + 2 fornecedores aceitos) para fingerprint do número parecer "humano".
  - Webhook do Evolution apontando para `https://cotaobra.staging.app/api/whatsapp/webhook` com signature verificada.

Total Sprint 0 ajustado: 28 SP (antes) + 2 SP (CO-0-14) - 3 SP (CO-3-08 removida) = **27 SP**. Confortável.

---

## 3. Pré-flight checklist (D-1: 4 horas operacionais antes de codar)

Estas atividades **não são código**, mas destravam o Sprint 0. Devem acontecer antes da primeira manhã de desenvolvimento.

### 3.1 Tech Lead — 2h

- [ ] Criar repo `github.com/samuckamorais/cotaobra` (privado).
- [ ] Adicionar como collaborators: dev backend, dev frontend, QA (se houver).
- [ ] Configurar branch protection no `main`: PR obrigatório, ≥ 1 review, CI green.
- [ ] Criar GitHub Project (board) "CotaObra Sprint 0" e importar as 13 tasks (será gerado o CSV).
- [ ] Provisionar Postgres 15 e Redis 7 no VPS staging (databases isolados: `cotaobra_staging`, `cotaobra_redis` namespace).
- [ ] Apontar DNS `cotaobra.staging.app` para o VPS.
- [ ] Criar Sentry project novo "cotaobra".
- [ ] Criar PostHog project novo (se for adotar; senão, decidir no Sprint 7).
- [ ] Solicitar credenciais sandbox Asaas (cadastro em asaas.com/sandbox).

### 3.2 PO (Samucka) — 1h

- [ ] Definir 1 número de WhatsApp dedicado ao CotaObra (chip novo) e levar até o tech lead para warming.
- [ ] Aprovar 5 wireframes de baixa fidelidade (esboço a mão ou Excalidraw) das telas P0: Obras, Materiais, Fila de Solicitações, Detalhe da Cotação, Comparativo. Não precisa Figma polido — só estrutura.
- [ ] Liberar credenciais OpenAI (mesma key do cotaAgro pode reusar para staging).

### 3.3 Devs (backend + frontend) — 1h cada

- [ ] Clonar localmente o cotaAgro como estudo (`git clone <repo cotaagro> ~/study-cotaagro`).
- [ ] Ler `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` + `PLANO_DE_FORK.md` + Sprint 0 do `CotaObra_Backlog_PO_Senior_v2.md`.
- [ ] Listar 3 dúvidas técnicas para esclarecer no kickoff de 1h.

---

## 4. Sprint 0 — Roteiro day-by-day (5 dias / 1 semana)

Time recomendado: **1 dev backend + 1 dev frontend + tech lead** (lead pode codar parcial).

### Dia 1 (Segunda) — Setup

**Manhã (4h)**

- 09:00 **Kickoff de 1h** (PO + devs + tech lead): revisão das decisões, plan-poker das 13 tasks, atribuição de owner.
- 10:00 **Backend** começa **CO-0-01** (fork do repo + push do `main` inicial).
- 10:00 **Frontend** começa setup local: clona o repo (após CO-0-01), instala deps, roda `npm run dev`, valida que tudo sobe.
- 10:00 **Tech Lead** começa **CO-0-14** (provisionar Evolution no VPS staging).

**Tarde (4h)**

- 13:00 **Backend** começa **CO-0-02** (refactor branding). Script `scripts/rename-brand.sh` (`find + sed`).
- 13:00 **Frontend** começa **CO-0-02** em paralelo no lado React (UI strings, manifest, logo placeholder).
- 17:00 PR único da CO-0-02 aberto. CI roda. Code review cruzado backend ↔ frontend.

**Saída do dia 1:**
- Repo no GitHub com `main` verde.
- PR `feat/CO-0-02-rebrand` aberto.
- Evolution container subindo no VPS.

---

### Dia 2 (Terça) — Limpeza estrutural

**Manhã**

- 09:00 Merge da CO-0-02 (após overnight CI verde + review).
- 09:30 **Backend** começa **CO-0-03** (deletar `middlewares/` legacy).
- 09:30 **Backend** segue para **CO-0-04** (rename ProducerSettings → TenantSettings).
- 09:30 **Frontend** começa **CO-0-08** (deletar Landing/PreLaunch/ComingSoon/Producers, ajustar Sidebar com "Obras" placeholder).

**Tarde**

- 13:00 **Backend** começa **CO-0-05** (remover ProducerSupplier) + **CO-0-06** (rename producer.flow → requester.flow).
- 13:00 **Frontend** continua CO-0-08.
- 17:00 PRs `chore/CO-0-03-04-05-06` (podem ser PRs separados ou um único — decisão do tech lead).

**Saída do dia 2:**
- 3 PRs de limpeza mergeados.
- Schema Prisma já com `TenantSettings` em vez de `ProducerSettings`, sem `ProducerSupplier`.
- FSM renomeada para `requester.flow.ts`.

---

### Dia 3 (Quarta) — Domínio inicial

**Manhã**

- 09:00 **Backend** começa **CO-0-07** (substituir categorias + unidades). Arquivo `material-categories.ts` cria.
- 09:00 **Frontend** ajusta dropdowns que usavam categorias antigas em `Suppliers.tsx` (preview, será refinado na CO-1-08).
- 11:00 **Tech Lead** começa **CO-0-11** (subir staging completo cotaobra com PostgreSQL/Redis novos).

**Tarde**

- 13:00 **Backend** começa **CO-0-09** (adaptar email-drip + mensagens WhatsApp, lembrando: agora strings parametrizadas, não HSM Meta).
- 13:00 **Frontend** começa adaptação de logo, favicon, manifest PWA, tela de Login (apenas swap visual).

**Saída do dia 3:**
- Categorias + unidades da construção em produção.
- Staging respondendo na URL.
- Login funcional com branding CotaObra.

---

### Dia 4 (Quinta) — Hardening (AUDs)

**Manhã + Tarde**

- 09:00 **Backend + Tech Lead** dedicam o dia inteiro a **CO-0-10** (aplicar os 4 fixes CRITICAL do COTAGRO_AUDIT):
  - AUD-01: Redlock em `consolidate-quote` e `expire-quote` (cherry-pick se já houver fix no cotaAgro).
  - AUD-02: field-encryption com IV aleatório por registro.
  - AUD-03: rate-limit incluindo `tenantSlug` na chave.
  - AUD-04: wrapper Evolution com rate limit conservador + delays randômicos + abort em erro 5xx repetido (versão Evolution do fix, não HSM).
- 09:00 **Frontend** começa **CO-0-12** (smoke E2E Playwright — 5 cenários).

**Saída do dia 4:**
- 4 AUDs corrigidos.
- Suite Playwright rodando local + CI.

---

### Dia 5 (Sexta) — Polimento e fechamento

**Manhã**

- 09:00 Buffer para bugs descobertos nos dias 1-4.
- 11:00 **CO-0-14** (warming do Evolution): tech lead manda algumas mensagens reais do número para 2-3 contatos cadastrados (PO e tester).

**Tarde**

- 13:00 **Demo** (CO-0-13) para PO. Roteiro: abrir staging → login → navegar → mostrar logo novo, categorias novas, smoke E2E passando, Evolution conectado.
- 15:00 **Retrospectiva** Sprint 0: o que funcionou, o que travou, ajustes para Sprint 1.
- 16:00 Refinement das tasks do Sprint 1 (CO-1-01 a CO-1-13): plan-poker, atribuição.

**Saída do dia 5:**
- Sprint 0 fechado.
- Sprint 1 pronto para começar segunda.

---

## 5. Trilha Backend — sequência de PRs (Sprint 0)

| Ordem | Task | Branch sugerida | Tempo estimado | Notas |
|-------|------|-----------------|-----------------|-------|
| 1 | CO-0-01 | `chore/CO-0-01-fork-setup` | 2h | Sem código de produto, só git/CI |
| 2 | CO-0-02 (back) | `feat/CO-0-02-rebrand-back` | 4h | Coordenar com frontend para 1 PR conjunto |
| 3 | CO-0-03 | `chore/CO-0-03-remove-legacy-middlewares` | 1h | Diff arquivo a arquivo antes de apagar |
| 4 | CO-0-04 | `feat/CO-0-04-tenant-settings` | 3h | Migration Prisma + service rename |
| 5 | CO-0-05 | `feat/CO-0-05-drop-producer-supplier` | 3h | Migration + ajuste de queries em quotes.service |
| 6 | CO-0-06 | `refactor/CO-0-06-requester-flow` | 2h | VS Code rename symbol; testes existentes seguem passando |
| 7 | CO-0-07 | `feat/CO-0-07-material-categories` | 3h | Novo arquivo `constants/material-categories.ts` + atualizar unit-normalizer |
| 8 | CO-0-09 (back) | `feat/CO-0-09-messages-templates` | 4h | Reescrever 6 strings parametrizadas + 5 templates email |
| 9 | CO-0-10 | `fix/CO-0-10-audit-criticals` | 8h | Pode quebrar em 4 PRs (1 por AUD); recomendado |
| 10 | CO-0-14 | `infra/CO-0-14-evolution-provision` | 2h | Docker compose + webhook |

**Convenções Git para o time backend:**

- Branch naming: `{type}/CO-{sprint}-{task}-{slug-curto}` — type ∈ `feat | fix | chore | refactor | infra | docs | test`.
- Conventional commits: `feat(quotes): add siteId to Quote model (CO-1-10)`.
- PR template (já existe no cotaAgro, adaptar): título do PR = título da task + ID; checklist DoD; link para issue do GH Project.
- Squash on merge.
- CI obrigatório verde: `lint` + `typecheck` + `test:unit` + `test:integration`.

**Arquivos para nunca tocar no Sprint 0:**

- `backend/src/modules/auth/` — herdar como está, fix de bug só se CRITICAL.
- `backend/src/modules/admin/` — herdar como está.
- `backend/src/middleware/auth.middleware.ts` — herdar como está.

**Arquivos críticos do Sprint 0 (review obrigatório de 2 devs):**

- `backend/prisma/schema.prisma` — qualquer mudança no schema.
- `backend/src/flows/requester.flow.ts` — coração do produto.
- `backend/src/modules/whatsapp/` — gateway Evolution.

---

## 6. Trilha Frontend — sequência de PRs (Sprint 0)

| Ordem | Task | Branch sugerida | Tempo estimado | Notas |
|-------|------|-----------------|-----------------|-------|
| 1 | CO-0-02 (front) | `feat/CO-0-02-rebrand-front` | 4h | PR conjunto com backend |
| 2 | CO-0-08 | `chore/CO-0-08-cleanup-pages` | 3h | Deleta Landing/PreLaunch/ComingSoon/Producers; ajusta App.tsx + Sidebar |
| 3 | Setup logo + favicon + manifest | `feat/CO-0-rebrand-visual` | 2h | Pode ser sub-PR do CO-0-02 |
| 4 | CO-0-12 (E2E) | `test/CO-0-12-playwright-smoke` | 6h | 5 cenários — usar fixtures de seed do backend |

**Convenções Frontend:**

- Tailwind classes em ordem (Prettier plugin).
- shadcn/ui como base — não criar componente custom se shadcn já tem.
- React Query (TanStack) para estado de servidor — nada de fetch manual em useEffect.
- Zod resolvers em todos os forms.
- A11y mínima: labels em inputs, alt em imagens, focus visível.

**Tela placeholder de "Obras" (CO-0-08):**

Criar `frontend/src/pages/SitesPlaceholder.tsx` simples:

```tsx
import { Construction } from "lucide-react";

export default function SitesPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Construction className="size-16 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Em construção</h1>
      <p className="text-muted-foreground">
        O módulo de Obras será habilitado no próximo sprint.
      </p>
    </div>
  );
}
```

Rota registrada como `/sites` no `App.tsx`.

---

## 7. Como rodar localmente (passo a passo para o dev novo)

### 7.1 Pré-requisitos

- Node 20.x (recomendado via `nvm`).
- Docker Desktop ou Docker Engine + docker-compose.
- pnpm (preferência da equipe; ou npm).
- VS Code com extensões: Prisma, ESLint, Prettier, Tailwind CSS IntelliSense.

### 7.2 Setup do backend

```bash
# Clone
cd C:\Workstation
git clone git@github.com:samuckamorais/cotaobra.git
cd cotaobra/backend

# Variáveis de ambiente
cp .env.example .env
# Editar .env:
#   DATABASE_URL="postgresql://cotaobra:cotaobra@localhost:5433/cotaobra_dev"
#   REDIS_URL="redis://localhost:6380"
#   OPENAI_API_KEY="sk-..."  (pegar com tech lead)
#   EVOLUTION_API_URL="http://localhost:8080"
#   EVOLUTION_API_KEY="local-dev-key"
#   ASAAS_API_KEY="sandbox_..."  (Sprint 8; pode ficar vazio agora)
#   JWT_SECRET="dev-secret-change-me"

# Subir Postgres + Redis + Evolution local
docker compose -f docker-compose.dev.yml up -d

# Instalar deps
pnpm install

# Aplicar migrations + seed
pnpm prisma migrate dev
pnpm seed

# Rodar
pnpm dev
```

Backend ouve em `http://localhost:3000`. Healthcheck: `curl http://localhost:3000/health` deve retornar `{ ok: true }`.

### 7.3 Setup do frontend

```bash
cd cotaobra/frontend
cp .env.example .env
# VITE_API_URL=http://localhost:3000

pnpm install
pnpm dev
```

Frontend em `http://localhost:5173`. Login com seed: `admin@cotaobra.dev` / `senha-dev-123` (criar no seed inicial).

### 7.4 Subir Evolution local (para testar WhatsApp em dev)

```yaml
# docker-compose.dev.yml já inclui Evolution
services:
  evolution:
    image: atendai/evolution-api:latest
    ports:
      - "8080:8080"
    environment:
      - AUTHENTICATION_API_KEY=local-dev-key
      - DATABASE_ENABLED=false
      - SERVER_URL=http://localhost:8080
    volumes:
      - evolution_data:/evolution/instances
```

Após subir:
1. Abrir `http://localhost:8080/manager` no navegador.
2. Criar instância "cotaobra-dev".
3. Escanear QR code com WhatsApp pessoal (em dev — em prod usar número dedicado).
4. Configurar webhook: `http://host.docker.internal:3000/api/whatsapp/webhook` (Windows/Mac) ou IP da máquina (Linux).

### 7.5 Rodar testes

```bash
# Backend
cd backend
pnpm test:unit
pnpm test:integration

# Frontend
cd frontend
pnpm test
pnpm test:e2e   # Playwright
```

---

## 8. Critérios de fechamento do Sprint 0 (DoD do sprint)

Antes de a sexta-feira do Sprint 0 ser declarada "done":

- [ ] 13 tasks (CO-0-01 a CO-0-14) com PR mergeado em `main`.
- [ ] Cobertura backend ≥ cobertura herdada do cotaAgro (não pode regredir).
- [ ] Suite unit + integration backend passando 100%.
- [ ] 5 smoke E2E Playwright passando em CI 3 runs consecutivos.
- [ ] Staging `cotaobra.staging.app` acessível com login funcional.
- [ ] Evolution conectado e respondendo "ping" via mensagem teste.
- [ ] `CHANGELOG.md` no repo atualizado com cada PR.
- [ ] Sentry: zero erros CRITICAL nas últimas 24h em staging.
- [ ] Demo de 5min gravada e enviada para PO.
- [ ] Retrospectiva feita, ata em `docs/retros/sprint-0.md`.
- [ ] Sprint 1 com 10+ tasks em DoR (Definition of Ready).

---

## 9. Após Sprint 0 — visão das próximas 4 semanas

| Semana | Sprint | Foco | Saída esperada |
|--------|--------|------|----------------|
| Sem 1 | 0 | Fork + branding + AUDs | Staging up, smoke verde |
| Sem 2-3 | 1 | Site, Material, User roles | CRUD funcional + 30 SKUs seed + comprador cria cotação manual |
| Sem 4-5 | 2 | FSM Solicitante via WhatsApp | Engenheiro abre solicitação por WhatsApp; comprador vê na fila |

**O dev de backend** vai gastar 80% do tempo nos sprints 1–2 em: schema (Site, Material, User adapt), services novos (`site.service.ts`, `material.service.ts`), módulos novos (`sites/`, `materials/`), e na FSM `requester.flow.ts`.

**O dev de frontend** vai gastar 80% do tempo nos sprints 1–2 em: 5 telas novas (`Sites.tsx`, `SiteDetail.tsx`, `Materials.tsx`, `Users.tsx` adapt, `QuoteRequests.tsx`), com hooks correspondentes.

**Trabalho em paralelo:** backend e frontend trabalham SEM bloqueio mútuo se backend entrega contratos da API (DTOs zod + endpoint stub respondendo 200 com mock) **antes** do frontend começar a tela. Disciplina mínima: cada PR de backend que adiciona endpoint público deve atualizar `docs/api.md` ou OpenAPI spec.

---

## 10. Riscos operacionais do Sprint 0 e mitigação

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Evolution não conecta no VPS (firewall, IP banido) | Média | Tech Lead testa Evolution local antes de provisionar staging; ter número de backup |
| `sed` de branding pega string indevida (ex.: nome empresa demo "FarmFlow Demo") | Média | Whitelist em `scripts/rename-brand.sh` + code review obrigatório |
| Migration Prisma renomeação trava com dados existentes | Baixa | Banco do fork é novo desde dia 1, sem dados — sem risco real |
| Dev não consegue subir o ambiente local | Alta no primeiro dia | Documentação §7 detalhada + tech lead disponível em pair no primeiro setup |
| AUD-04 com Evolution bloqueia mensagens legítimas em dev | Média | Rate limit conservador é configurável via env; em dev usar valores frouxos |
| Playwright flakiness no CI | Alta | `retry: 2` + screenshots/vídeos em falha + suite isolada por feature |

---

## 11. Canais de comunicação durante o sprint

- **Daily** 09:00 (15min): o que fiz ontem, o que vou fazer hoje, bloqueios.
- **Slack/Discord** canal `#cotaobra-dev` para comunicação assíncrona.
- **PR review** em até 4h durante horário de trabalho; ≤ 24h fora.
- **Tech Lead** disponível para par programming agendado (slot de 2h por dia se necessário).
- **PO** disponível para tirar dúvidas de produto via WhatsApp; questões maiores em call de 30min agendada.

---

## 12. O que NÃO fazer no Sprint 0

- ❌ Adicionar feature nova que não esteja no escopo das 13 tasks.
- ❌ Refatorar código fora da lista (nem mesmo "enquanto eu estava ali").
- ❌ Mudar dependências (versões de Node/Postgres/Redis) — manter idêntico ao cotaAgro.
- ❌ Otimização prematura (perf vem no Sprint 9).
- ❌ Criar testes "para subir cobertura" sem valor real.
- ❌ Tocar em `auth/`, `admin/`, `2fa/` (módulos herdados estáveis).

---

## 13. Próximos passos imediatos (D-0, hoje)

1. **PO (Samucka):** confirmar Asaas sandbox solicitada (5 min via web).
2. **PO:** separar 1 chip novo de WhatsApp para o número CotaObra; mandar IMEI/número para tech lead.
3. **Tech Lead:** criar repo no GitHub + adicionar collaborators (15 min).
4. **Tech Lead:** agendar kickoff de 1h para amanhã às 09:00.
5. **Dev backend & frontend:** clonar cotaAgro localmente e fazer leitura dirigida dos 3 docs (`ARQUITETURA`, `PLANO_DE_FORK`, `BACKLOG_v2`) — 3h de estudo.

Com isso feito até hoje à noite, o time entra no kickoff de amanhã preparado e o Sprint 0 começa de fato em D+1.

---

**Fim do roteiro — Boa execução.**
