# 🏗️ CotaObra — Comece Aqui

**Mapa de navegação dos documentos e roteiro de orientação para o desenvolvedor.**

Versão: 1.0 — 18/05/2026
Atualizado por: PO Sênior

---

## 🎯 TL;DR — se você acabou de entrar no projeto

Faça **exatamente nesta ordem** (total: ~4 horas):

| Etapa | Tempo | O que fazer | Por quê |
|-------|-------|-------------|---------|
| 1️⃣ Contexto | 60 min | Ler `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` | Entender O QUE é o CotaObra e por que existe |
| 2️⃣ Estratégia | 30 min | Ler `PLANO_DE_FORK.md` | Entender por que partimos do cotaAgro e o que muda |
| 3️⃣ Backlog | 45 min | Ler **§1 + §2 + Sprint 0** de `CotaObra_Backlog_PO_Senior_v2.md` | Saber EXATAMENTE o que vamos fazer nas próximas 2 semanas |
| 4️⃣ Roteiro | 30 min | Ler `CotaObra_Roteiro_Desenvolvimento_Sprint0.md` (todo) | Ver o dia-a-dia do Sprint 0 |
| 5️⃣ Setup | 60 min | Seguir `dev-bootstrap/README.md` passo a passo | Subir ambiente local |
| 6️⃣ Pegar task | 5 min | Abrir GitHub Project, pegar 1 task `In Todo`, mover para `In Progress` | Começar a codar |

⚠️ **Não pule etapas.** Cada etapa anterior é pré-requisito da próxima. Pular o §1 do backlog v2 é o erro #1 que produz PR fora do escopo.

---

## 📚 Mapa completo dos documentos do projeto

Todos estão em `G:\Meu Drive\CotaObra\CotaObra\` (workspace do projeto).

### Documentos estratégicos (fonte da verdade do produto)

| # | Documento | Propósito | Quem lê | Quando |
|---|-----------|-----------|---------|--------|
| 1 | `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` | Blueprint do produto: domínio, schema Prisma, endpoints, FSMs, jobs, segurança, observabilidade. Define O QUE construir. | Todos | Antes do primeiro PR. Consultar sempre que houver dúvida de schema/endpoint. |
| 2 | `PLANO_DE_FORK.md` | Mapa arquivo-por-arquivo de cotaAgro → CotaObra: o que copiar, renomear, adaptar, deletar, criar do zero. Define DE ONDE vem o código. | Backend Sr, Tech Lead | Antes de cada task FORK-*. Consultar para saber qual arquivo do cotaAgro espelhar. |
| 3 | `CotaObra_Backlog_PO_Senior_v2.md` | Backlog priorizado: 9 sprints, ~70 tasks com User Story, AC em Gherkin, DoD, testes, riscos. Define EM QUE ORDEM construir. | Todos | Diariamente. Cada PR referencia 1 task daqui. |

### Documentos operacionais (como executar)

| # | Documento | Propósito | Quem lê | Quando |
|---|-----------|-----------|---------|--------|
| 4 | `CotaObra_Roteiro_Desenvolvimento_Sprint0.md` | Roteiro day-by-day do Sprint 0: 5 dias, ordem das PRs, ajustes Evolution, decisões locked. | Todos | Início do Sprint 0. Consultar diariamente nos 5 dias. |
| 5 | `CotaObra_Sprint0_TaskBoard.csv` | 14 tasks do Sprint 0 em formato CSV para importar no GitHub Projects / Linear / Jira. | Tech Lead | Antes do Sprint 0 — uma vez (import). |
| 6 | `00_COMECE_AQUI.md` | **(Este documento.)** Mapa de orientação. | Todos | Primeiro contato com o projeto. |

### Bootstrap técnico (arquivos prontos para copiar no repo)

Tudo dentro de `dev-bootstrap/`:

| # | Arquivo | Destino no repo | Função |
|---|---------|-----------------|--------|
| 7 | `dev-bootstrap/README.md` | (referência apenas) | Guia de uso do bootstrap |
| 8 | `dev-bootstrap/docker-compose.dev.yml` | raiz do repo | Sobe Postgres, Redis, Evolution, MinIO, Mailpit local |
| 9 | `dev-bootstrap/backend.env.example` | `backend/.env.example` | Template de env do backend (50+ vars) |
| 10 | `dev-bootstrap/frontend.env.example` | `frontend/.env.example` | Template de env do frontend |
| 11 | `dev-bootstrap/PULL_REQUEST_TEMPLATE.md` | `.github/PULL_REQUEST_TEMPLATE.md` | Template padronizado de PR com DoD |
| 12 | `dev-bootstrap/ci.yml` | `.github/workflows/ci.yml` | Workflow CI principal (lint + tipo + testes + branding guard) |
| 13 | `dev-bootstrap/e2e.yml` | `.github/workflows/e2e.yml` | Workflow E2E Playwright |
| 14 | `dev-bootstrap/seed.ts` | `backend/prisma/seed.ts` | Seed inicial: tenant + 3 usuários + 1 obra + 5 fornecedores + 30 materiais |
| 15 | `dev-bootstrap/wireframes_p0.html` | `docs/wireframes/p0.html` | Wireframes baixa fidelidade das 5 telas P0 |

---

## 🧭 Ordem de leitura por persona

### Tech Lead (dia 1 — 4h)

1. ✅ `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` — **completo**, com atenção em §4 (camadas), §5 (schema), §6 (FSMs), §11 (WhatsApp/HSM), §12 (segurança).
2. ✅ `PLANO_DE_FORK.md` — **completo**.
3. ✅ `CotaObra_Backlog_PO_Senior_v2.md` — §1, §2, §3 (resumo épicos), Sprint 0 inteiro. Skim Sprints 1–9.
4. ✅ `CotaObra_Roteiro_Desenvolvimento_Sprint0.md` — **completo**.
5. ✅ `dev-bootstrap/README.md` + revisar todos os arquivos do bootstrap.
6. ✅ Apêndices §4.3 (Risk Register) e §4.7 (Caminho crítico) do backlog v2.

### Dev Backend (dia 1 — 3h)

1. ✅ `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` §1, §2, §4, §5, §6, §7, §10, §11.
2. ✅ `PLANO_DE_FORK.md` §3 (schema), §4 (backend arquivo-por-arquivo).
3. ✅ `CotaObra_Backlog_PO_Senior_v2.md` §1, §2, Sprint 0 (tasks de back), suas tasks atribuídas.
4. ⏩ Skim `CotaObra_Roteiro_Desenvolvimento_Sprint0.md` §5 (trilha backend).
5. ✅ `dev-bootstrap/README.md` + `backend.env.example`.
6. ⏩ Estudar localmente: `C:\Workstation\cotaAgro\backend\src\flows\producer.flow.ts` (será espelhado em `requester.flow.ts`).

### Dev Frontend (dia 1 — 3h)

1. ✅ `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` §1, §2, §9 (telas).
2. ✅ `PLANO_DE_FORK.md` §5 (frontend arquivo-por-arquivo).
3. ✅ `CotaObra_Backlog_PO_Senior_v2.md` §1, §2, suas tasks atribuídas (especialmente CO-1-03, CO-2-07, CO-4-04 e CO-4-05).
4. ⏩ Skim `CotaObra_Roteiro_Desenvolvimento_Sprint0.md` §6 (trilha frontend).
5. ✅ `dev-bootstrap/wireframes_p0.html` — abrir no navegador e estudar.
6. ⏩ Estudar localmente: `C:\Workstation\cotaAgro\frontend\src\pages\Suppliers.tsx` e `QuoteDetail.tsx` (estruturas a espelhar).

### QA (dia 1 — 2h)

1. ⏩ Skim `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` §1, §3 (escopo MVP), §14 (testes).
2. ✅ `CotaObra_Backlog_PO_Senior_v2.md` §1, §2, Sprint 9 (E2E completo) + §4.8 (checklist pré-piloto).
3. ✅ `dev-bootstrap/e2e.yml` — entender o workflow Playwright.
4. ⏩ Skim CO-0-12 e CO-9-02 para escrever os 10 cenários alvo.

### PO (Samucka)

1. Já tem domínio dos 3 docs estratégicos.
2. Foco: aprovar wireframes (CO-1-03, CO-2-07, CO-4-04, CO-4-05), validar AC em staging ao final de cada sprint, conduzir retro.

---

## ⚡ Primeira hora do dev — checklist prático

### Para o dev Backend

```
[ ] Clonei o repo cotaobra (após Tech Lead criar — CO-0-01)
[ ] Copiei os arquivos do bootstrap (docker-compose, .env.example, seed.ts) para o repo
[ ] Rodei: docker compose -f docker-compose.dev.yml up -d
[ ] Validei healthchecks: docker compose ps (todos saudáveis)
[ ] Criei backend/.env a partir de backend.env.example
[ ] Peguei OPENAI_API_KEY com o Tech Lead
[ ] Rodei: cd backend && pnpm install
[ ] Rodei: pnpm prisma migrate dev
[ ] Rodei: pnpm seed (deve criar tenant + 3 users + 1 obra + 5 fornecedores + 30 materiais)
[ ] Rodei: pnpm dev → backend ouve em http://localhost:3000
[ ] Testei: curl http://localhost:3000/health → { ok: true }
[ ] Abri Postgres no DBeaver/TablePlus (conexão localhost:5433 / cotaobra:cotaobra)
[ ] Conferi: SELECT * FROM tenants → 1 linha (Construtora Aurora Ltda)
[ ] Conferi: SELECT * FROM materials WHERE tenant_id IS NULL → 30 linhas
[ ] Movi minha primeira task no GH Project para In Progress
[ ] Criei branch: git checkout -b feat/CO-X-XX-descricao-curta
```

### Para o dev Frontend

```
[ ] Clonei o repo cotaobra
[ ] Copiei dev-bootstrap/frontend.env.example para frontend/.env
[ ] Rodei: cd frontend && pnpm install
[ ] Rodei: pnpm dev → frontend em http://localhost:5173
[ ] Loguei com admin@cotaobra.dev / senha-dev-123
[ ] Confirmei que dashboard placeholder carrega
[ ] Abri dev-bootstrap/wireframes_p0.html no Chrome para estudar as 5 telas P0
[ ] Identifiquei minha primeira task no GH Project
[ ] Verifiquei se há mockup/wireframe disponível para ela (DoR exige)
[ ] Criei branch e comecei a codar
```

---

## 🔍 Quando consultar cada documento no dia a dia

| Situação | Documento a consultar | Seção |
|----------|------------------------|-------|
| "Qual o shape do modelo Quote?" | `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` | §5 |
| "Como funciona a FSM do solicitante?" | `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` | §6.1 |
| "Qual a fórmula do preço corrigido?" | `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` | §10 |
| "Que endpoints o módulo `quotes` expõe?" | `ARQUITETURA_E_ESPECIFICACAO_TECNICA.md` | §8.5 |
| "Esse arquivo do cotaAgro é pra copiar ou adaptar?" | `PLANO_DE_FORK.md` | §4 (backend) ou §5 (frontend) |
| "Qual a estimativa de SP da minha task?" | `CotaObra_Backlog_PO_Senior_v2.md` | sprint correspondente |
| "Quais são os critérios de aceitação dessa task?" | `CotaObra_Backlog_PO_Senior_v2.md` | dentro da task (Gherkin) |
| "Como exatamente é o DoD?" | `CotaObra_Backlog_PO_Senior_v2.md` | §2.4 |
| "Qual a ordem das PRs do Sprint 0?" | `CotaObra_Roteiro_Desenvolvimento_Sprint0.md` | §4 (day-by-day) ou §5/§6 (trilhas) |
| "Como configuro o Evolution local?" | `dev-bootstrap/README.md` | passo 7 |
| "Qual senha do usuário admin no dev?" | `dev-bootstrap/seed.ts` | constante DEFAULT_PASSWORD |
| "O que esperam de mim no PR?" | `dev-bootstrap/PULL_REQUEST_TEMPLATE.md` | (todo) |
| "Esse erro de CI é o quê?" | `dev-bootstrap/ci.yml` | job correspondente |
| "Como ficará a tela X?" | `dev-bootstrap/wireframes_p0.html` | wireframe correspondente |

---

## 🚦 Sinais de que você está pronto para fazer seu primeiro PR

- [ ] Consigo explicar em 2 frases o que o CotaObra faz.
- [ ] Sei a diferença entre `Producer` (cotaAgro) e `Site + Requester` (CotaObra).
- [ ] Entendi por que `Quote` ganhou `siteId` obrigatório.
- [ ] Sei dizer se minha task é FORK-COPY, FORK-ADAPT, FORK-RENAME ou NEW.
- [ ] Sei qual arquivo do cotaAgro espelha a base da minha task (ou que é NEW e não tem base).
- [ ] Entendi por que estamos usando Evolution e não Twilio/Meta.
- [ ] Rodei `pnpm test` localmente e passou.
- [ ] Olhei minha task no GH Project e abri uma branch com naming correto (`type/CO-X-XX-slug`).

Se 8/8 ✅: codifique sem medo. Se ≤ 6/8: volte 2 passos na ordem de leitura.

---

## ⚠️ Antipadrões — o que NÃO fazer

1. ❌ Começar a codar sem ler o backlog v2 da sua sprint.
2. ❌ Espelhar `producer.flow.ts` direto sem ler `requester.flow.ts` no §6.1 da arquitetura.
3. ❌ Mudar dependências (Node/Postgres/Redis versions) — manter idêntico ao cotaAgro.
4. ❌ Pular o DoD do PR template "porque é refactor pequeno".
5. ❌ Adicionar feature "porque dá pra adiantar". Sprint 0 é refactor mecânico — nada novo entra.
6. ❌ Ignorar o `branding-guard` no CI — se falhar, é sinal de que faltou `sed` em algum lugar.
7. ❌ Commitar `.env` (mesmo `.env.example` foi versionado, mas `.env` real está no `.gitignore`).
8. ❌ Logar `tenantId` errado nos services — sempre passar pelo `auth-context.ts`.

---

## 📞 Quem chamar quando travar

| Travamento | Quem | Como |
|------------|------|------|
| Dúvida de produto / "isso é certo?" | PO (Samucka) | WhatsApp; se for grande, call 30min |
| Dúvida arquitetural / "como espelhar X?" | Tech Lead | Slack `#cotaobra-dev` ou pair 2h agendado |
| Ambiente local não sobe | Tech Lead | Pair imediato (primeiro setup) |
| Cobertura caiu / CI vermelho | Time todo | Slack `#cotaobra-dev` |
| Bloqueio externo (Asaas, OpenAI quota, etc.) | Tech Lead + PO | Imediato |

---

## 🗺️ Próximas atualizações deste documento

- Sprint 1: incluir referências a tasks de Site + Material.
- Sprint 3: ajustar quando templates HSM voltarem (se trocarmos Evolution por Meta no futuro).
- Sprint 9: incluir runbook operacional + plano de rollout do piloto.

---

**Bons commits.** 🚀

<sub>Para feedback sobre este guia, abra issue com label `docs` ou fale com o PO.</sub>
