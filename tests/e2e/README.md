# CotaObra — E2E (Playwright)

Suite de **smoke tests** que valida o Sprint 0 está sustentado: frontend
buildado renderiza, login funciona com seed credentials, rotas protegidas
respeitam auth, /sites placeholder existe, e o backend está saudável.

## 5 cenários P0

1. **01-root-redirect** — `/` redireciona pra `/login` (CO-0-08: Landing removida)
2. **02-login-page** — formulário de login renderiza com email/senha/submit
3. **03-login-flow** — login com `admin@cotaobra.dev / senha-dev-123` → `/dashboard`
4. **04-sites-placeholder** — `/sites` (autenticado) mostra placeholder "Em construção"
5. **05-health-and-api** — `GET /health` 200, login com payload inválido retorna 4xx (não 500)

## Como rodar localmente

Pré-requisitos:
- Backend rodando em `http://localhost:3000` com banco migrado + seed.
- Frontend rodando em `http://localhost:5173` (ou ajuste `BASE_URL`).

```bash
cd tests/e2e
pnpm install          # ou: npm install
pnpm exec playwright install --with-deps chromium
pnpm test             # roda os 5 cenários
pnpm test:headed      # com browser visível (debug)
pnpm report           # abrir relatório HTML do último run
```

## Em CI

O workflow `.github/workflows/e2e.yml` faz tudo: sobe Postgres + Redis,
roda migrations + seed, builda e starta backend/frontend, instala Playwright
e roda os 5 cenários. Artefatos (screenshots, vídeos, traces) ficam disponíveis
em "Workflow run → Artifacts".

## Variáveis de ambiente

| Var | Default | Uso |
|-----|---------|-----|
| `BASE_URL` | `http://localhost:5173` | URL do frontend (Vite preview no CI usa `:4173`) |
| `API_URL`  | `http://localhost:3000` | URL do backend |
| `CI`       | (auto) | Quando true: `retries: 2`, `workers: 1`, reporter HTML |

## Cobertura — escopo Sprint 0

Esta suite NÃO testa:
- FSM via WhatsApp (Sprint 2, depende de Evolution real)
- CRUD de obra/material (Sprint 1)
- Workflow de aprovação (Sprint 2)
- Geração de PDF de OC (Sprint 4+)

Para Sprint 0, o objetivo é apenas **detectar regressão estrutural**: o
build não quebrou, autenticação funciona, healthcheck verde.
