# CotaObra — E2E Tests (Playwright)

Cobertura dos fluxos críticos do pilot. **Setup separado do backend/frontend** porque Playwright traz Chromium pesado.

## Setup

```bash
cd e2e
npm install
npx playwright install --with-deps chromium
```

`playwright.config.ts` em `e2e/playwright.config.ts`. `baseURL` lido de `E2E_BASE_URL` (default `http://localhost:5173`).

## Como rodar

```bash
# Pré-requisito: backend + frontend rodando localmente (ou apontar para staging)
E2E_BASE_URL=https://staging.cotaobra.com.br \
E2E_ADMIN_EMAIL=admin+e2e@cotaobra.com.br \
E2E_ADMIN_PASSWORD=secret \
npx playwright test
```

## Cenários cobertos (10)

| # | Arquivo                             | O que valida                                                      |
|---|-------------------------------------|-------------------------------------------------------------------|
| 1 | `01-auth-login.spec.ts`            | Login feliz + erro com senha errada                               |
| 2 | `02-site-crud.spec.ts`             | Criar/editar/concluir Obra                                        |
| 3 | `03-material-import.spec.ts`       | Import CSV de catálogo + listagem                                 |
| 4 | `04-quote-create-dispatch.spec.ts` | Criar cotação, escolher fornecedores, dispatch                    |
| 5 | `05-proposal-public-form.spec.ts`  | Acesso público via token, preencher proposta                      |
| 6 | `06-quote-comparative.spec.ts`     | Quadro comparativo carrega + winner highlighted                   |
| 7 | `07-close-quote-winner.spec.ts`    | Fechar cotação modo winner + OC gerada + PDF baixável             |
| 8 | `08-approval-flow.spec.ts`         | Quote acima do teto → AWAITING_APPROVAL → Approver aprova → OC    |
| 9 | `09-reports-tabs.spec.ts`          | 7 abas de relatório carregam sem erro                             |
| 10| `10-settings-erp-asaas.spec.ts`    | Settings UI: salvar threshold + webhook ERP + checkout BASIC      |

Os specs no diretório atual são **scaffolds** — assumem fixtures de seed e env vars. Para rodar em produção, adapte seletores e fixtures conforme deploy real.

## Política

- E2E roda em CI no branch `main` apenas — não bloqueia PRs (lento, flaky).
- Falhas críticas (auth, quote create, close) bloqueiam release.
- Outras (relatórios, settings) são warnings.
