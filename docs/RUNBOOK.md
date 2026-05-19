# CotaObra — Runbook operacional

Documento vivo para oncall + suporte. Mantenha curto; quando algo escapar, adicione aqui.

---

## 1. Arquitetura essencial

```
┌────────────┐    HTTPS     ┌──────────────┐
│  Frontend  │ ───────────► │  Backend API │ ──► Postgres
│  (React)   │              │   (Express)  │ ──► Redis (Bull jobs)
└────────────┘              └──────┬───────┘ ──► MinIO (PDFs)
                                   │
                            ┌──────┴───────────┐
                            ▼                  ▼
                       WhatsApp           Asaas (billing)
                       (Twilio/Meta)      Sentry (errors)
                                          PostHog (analytics)
                                          ERP webhook (cliente)
```

## 2. Health checks

| Endpoint           | Significado                       | Status code esperado |
|--------------------|-----------------------------------|----------------------|
| `GET /health`      | DB + Redis + integrações booleans | 200 (ok)/ 503        |
| `GET /health/ready`| Readiness probe                   | 200/503              |
| `GET /health/live` | Liveness probe                    | 200 sempre que vivo  |

`/health` retorna `commit` (GIT_SHA) — use para confirmar qual versão está rodando.

## 3. Variáveis de ambiente críticas

**Obrigatórias (boot trava sem):**
- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — `redis://redis:6379`
- `JWT_SECRET` — 32+ chars random
- `ENCRYPTION_KEY` — 32-byte hex para AES-256-GCM
- `MINIO_INTERNAL_ENDPOINT` — `http://minio:9000`

**Externas (opcionais, mas pilote sem isso não fica robusto):**
- `WHATSAPP_PROVIDER` + credenciais Twilio/Meta — fluxo de mensageria
- `ASAAS_API_KEY` — billing real (sem ela, stub IDs `cus_stub_xxx`)
- `SENTRY_DSN` — alerta de exceções
- `POSTHOG_API_KEY` — funnel/conversion analytics

## 4. Comandos comuns

```bash
# Aplicar migrations em produção
cd backend && npx prisma migrate deploy

# Regerar Prisma client
npx prisma generate

# Seed inicial (cria tenant demo + admin)
npm run db:seed

# Logs no container backend
docker logs -f cotaobra-backend --tail=200

# Replicar query lenta em Postgres
docker exec -it cotaobra-db psql -U cotaobra -c "EXPLAIN ANALYZE <sql>"
```

## 5. Cenários de incidente

### 5.1 Backend não inicia
1. `docker logs cotaobra-backend` — busque `❌ Invalid environment variables` ou erro Prisma.
2. Verifique `DATABASE_URL` resolve: `docker exec backend pg_isready -h db`.
3. Se migration nova, rode `prisma migrate deploy`. Se schema dessincado: `prisma db pull` para investigar.

### 5.2 PDF não gera (cotação fica DRAFT)
1. `GET /health` → veja status do Redis. Bull precisa dele.
2. `docker logs backend | grep po_pdf` para erro do job.
3. Verifique credenciais MinIO + bucket existe.
4. Re-enfileirar: chamar `enqueuePurchaseOrderPdfJob(poId)` via REPL interno ou recriar PO.

### 5.3 Webhook ERP falhando
1. Sintoma: `erp_webhook.send_failed` no log do tenant X.
2. Confirme URL/secret em `TenantSettings` do tenant (via Admin Panel).
3. Cliente pode estar com firewall: verifique IP de saída do CotaObra está liberado.
4. Bull tenta 5x com backoff exponencial. Após isso, job vai pra "failed" — investigar em Bull dashboard ou via Redis CLI.

### 5.4 Aprovações travadas (quotes em AWAITING_APPROVAL)
1. Confirme tem APPROVER ativo no tenant: `SELECT id, name FROM users WHERE tenantId=? AND role='APPROVER' AND active=true;`
2. Se não há, o aprovador foi desativado — ADMIN do tenant precisa reativar OU promover novo APPROVER.
3. Workaround emergencial: ADMIN aprovar via `POST /api/approvals/:id/approve` direto.

### 5.5 Billing: cliente diz que pagou mas plano não ativou
1. Verifique evento Asaas chegou: `docker logs backend | grep billing`.
2. Webhook precisa ter `asaas-access-token` header — se Asaas não enviou, plano não ativa via webhook.
3. Workaround: ativar manualmente — `UPDATE subscriptions SET active=true WHERE asaasSubscriptionId=?`.
4. Reconciliação: chamar `GET https://api.asaas.com/v3/subscriptions/{id}` para conferir status.

## 6. Pilot mode: limitações conhecidas

- **HSM Meta**: notify-approver usa texto livre. Em produção Meta exige template HSM aprovado — pendente.
- **CNPJ supplier no ERP**: webhook expõe apenas `cnpjHash` (criptografado em repouso). Decryption será adicionada conforme demanda dos pilots.
- **Multi-currency**: tudo em BRL. Para clientes internacionais, schema precisa de currency code.
- **Histórico de preços pre-pilot**: backfill manual via `PriceHistoryAggregateService.computePeriod(YYYY-MM)` em REPL.

## 7. Contatos / escalonamento

- Backend bugs críticos: abrir issue em https://github.com/samuckamorais/cotaObra/issues com label `incident`
- Database: Postgres rodando dentro do Docker Compose; backups via `pg_dump` agendado (não automatizado ainda — TODO sprint 10).
