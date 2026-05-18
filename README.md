# CotaObra

Cotação multi-fornecedor de **materiais de construção** via WhatsApp.

Fork do [cotaAgro](https://github.com/samuckamorais/cotaAgro) — mesma arquitetura (Node 20 + Postgres 15 + Redis 7 + Bull + Prisma), domínio adaptado para construtoras.

---

## 📚 Por onde começar

Se você é um(a) dev novo(a) no projeto, **siga exatamente esta ordem**:

| Etapa | Tempo | Documento |
|-------|-------|-----------|
| 1 | 60 min | [docs/ARQUITETURA_E_ESPECIFICACAO_TECNICA.md](docs/ARQUITETURA_E_ESPECIFICACAO_TECNICA.md) — O QUE é o produto |
| 2 | 30 min | [docs/PLANO_DE_FORK.md](docs/PLANO_DE_FORK.md) — De onde vem o código |
| 3 | 45 min | [docs/CotaObra_Backlog_PO_Senior_v2.md](docs/CotaObra_Backlog_PO_Senior_v2.md) §1+§2+Sprint 0 |
| 4 | 30 min | [docs/CotaObra_Roteiro_Desenvolvimento_Sprint0.md](docs/CotaObra_Roteiro_Desenvolvimento_Sprint0.md) — day-by-day |
| 5 | 60 min | Setup local (abaixo) |

Mapa completo de orientação: [docs/00_COMECE_AQUI.md](docs/00_COMECE_AQUI.md).

---

## ⚙️ Setup local (primeiro dev — ~30 min)

### Pré-requisitos

- Node 20.x (recomendado via `nvm use 20`)
- Docker Desktop ou Docker Engine + `docker-compose`
- `pnpm` (preferência da equipe) ou `npm`

### Subir a infra

```bash
docker compose -f docker-compose.dev.yml up -d
```

Serviços expostos:

| Serviço | Porta host | UI |
|---------|------------|----|
| Postgres 15 | 5433 | — |
| Redis 7 | 6380 | — |
| Evolution API (WhatsApp dev) | 8080 | http://localhost:8080/manager |
| MinIO (S3 local) | 9000 / 9001 | http://localhost:9001 (`minioadmin` / `minioadmin-dev`) |
| Mailpit (SMTP local) | 1025 / 8025 | http://localhost:8025 |

### Backend

```bash
cd backend
cp .env.example .env       # preencher OPENAI_API_KEY com o tech lead
pnpm install
pnpm prisma generate
pnpm prisma migrate dev    # aplica todas as migrations (inclui CO-0-04 e CO-0-05 do Sprint 0)
pnpm seed                  # popula tenant demo + 3 usuários + 1 obra + 5 fornecedores + 30 materiais
pnpm dev                   # http://localhost:3000
```

Healthcheck: `curl http://localhost:3000/health` → `{ ok: true }`.

### Frontend

```bash
cd frontend
cp .env.example .env
pnpm install
pnpm dev                   # http://localhost:5173
```

Login dev: `admin@cotaobra.dev` / `senha-dev-123` (veja [backend/prisma/seed.ts](backend/prisma/seed.ts)).

### Testes

```bash
cd backend
pnpm test:unit             # rápido — sem rede, sem DB
pnpm test:integration      # precisa Postgres + Redis docker up
```

---

## 🏗️ Estrutura do repositório

```
cotaobra/
├── docker-compose.dev.yml    # infra de dev (Postgres, Redis, Evolution, MinIO, Mailpit)
├── README.md                 # este arquivo
├── CHANGELOG.md              # histórico de mudanças por Sprint
├── .github/
│   ├── workflows/
│   │   ├── ci.yml            # lint + typecheck + unit + integration + branding-guard
│   │   └── e2e.yml           # Playwright (5 cenários P0)
│   └── PULL_REQUEST_TEMPLATE.md
├── backend/                  # Node 20 + Express + Prisma + Bull
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma     # 25 modelos (legacy Producer ainda presente; será removido até Sprint 1)
│   │   ├── migrations/       # histórico preservado do cotaAgro + migrations do Sprint 0
│   │   └── seed.ts
│   ├── src/
│   │   ├── flows/
│   │   │   ├── requester.flow.ts   # FSM do solicitante (renomeado de producer.flow em CO-0-06)
│   │   │   ├── supplier.flow.ts
│   │   │   ├── messages.ts         # templates parametrizados (CO-0-09)
│   │   │   └── fsm.ts
│   │   ├── modules/                # auth, quotes, suppliers, settings, whatsapp, …
│   │   ├── services/               # tenant-settings.service, pricing-engine (Sprint 1), …
│   │   ├── middleware/             # auth, rbac, rate-limit (AUD-03 fix em CO-0-10)
│   │   ├── constants/
│   │   │   ├── material-categories.ts   # 17 categorias de construção (CO-0-07)
│   │   │   └── supplier-categories.ts   # shim de retrocompat (re-exporta material-categories)
│   │   └── utils/unit-normalizer.ts     # m³, saca, peça, balde, … (CO-0-07)
│   └── tests/
├── frontend/                 # React 18 + Vite + Tailwind + shadcn/ui
│   ├── .env.example
│   ├── src/
│   │   ├── App.tsx           # rotas; `/sites` é placeholder até Sprint 1
│   │   ├── pages/
│   │   │   └── SitesPlaceholder.tsx
│   │   ├── components/layout/Sidebar.tsx   # "Obras" em vez de "Produtores" (CO-0-08)
│   │   └── …
│   └── public/manifest.json
├── docs/                     # fonte de verdade (não rebrandado intencionalmente)
└── scripts/                  # scripts de deploy/manutenção do cotaAgro (a serem revisados Sprint 1)
```

---

## 🚦 Status Sprint 0

Concluído **localmente** (sem deploy externo, sem GitHub repo CO-0-01, sem Evolution warming CO-0-14):

| Task | Status | Notas |
|------|--------|-------|
| CO-0-02 Rebrand FarmFlow → CotaObra | ✅ | 80 arquivos modificados |
| CO-0-03 Drop legacy `backend/src/middlewares/` | ✅ | |
| CO-0-04 ProducerSettings → TenantSettings | ✅ | migration `20260518000000_*` |
| CO-0-05 Drop ProducerSupplier | ✅ | migration `20260518000010_*` |
| CO-0-06 Rename producer.flow.ts → requester.flow.ts | ✅ | classe `ProducerFSM` mantida (Sprint 2 renomeia) |
| CO-0-07 material-categories.ts + unit-normalizer | ✅ | 17 categorias de construção |
| CO-0-08 Cleanup frontend (Landing/PreLaunch/Producers) | ✅ | `/sites` placeholder criado |
| CO-0-09 Templates messages + 5 emails drip | ✅ | top-of-funnel atualizado; reescrita full é Sprint 2 |
| CO-0-10 AUD-02/03/04 fixes | ✅ | AUD-01 já estava no cotaAgro |

Pendente (depende de recursos externos):

| Task | Bloqueio |
|------|----------|
| CO-0-01 Criar repo GitHub | Permissão GitHub do PO |
| CO-0-11 Provisionar staging VPS | Hetzner + DNS `cotaobra.staging.app` |
| CO-0-12 Smoke E2E Playwright (5 cenários) | Sprint 1 — depende de tela funcional |
| CO-0-13 Demo Sprint 0 ao PO | Após CO-0-11 |
| CO-0-14 Warming do número Evolution | Chip novo + 7 dias |

### Tests do cotaAgro com falhas conhecidas

Alguns testes que referenciam `ProducerSupplier`, `ProducerSettings`, `producer.flow.ts` (antes do rename) ou strings legadas de unidades (`Unidades`, `Caixas`) **precisam ser re-estabilizados na Sprint 1**. Isto é esperado por o spec do CO-0-04/05/06/07 e está documentado em [CHANGELOG.md](CHANGELOG.md).

---

## 🔁 CI / branding-guard

A pipeline `.github/workflows/ci.yml` inclui um job `branding-guard` que bloqueia o merge se `FarmFlow`, `farmflow` ou `cotaagro` ainda aparecerem fora da whitelist (`docs/`, `migrations/`, `package-lock.json`, `CHANGELOG.md`).

---

## 📞 Suporte

- Time interno: canal `#cotaobra-dev` (Slack)
- PO: Samucka (samuckaemail@gmail.com)
- Issues técnicas: usar GitHub Issues do repo `cotaobra`

---

**Versão:** Sprint 0 (fork inicial)
**Última atualização:** 2026-05-18
