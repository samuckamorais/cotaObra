# CotaObra — Pilot Go-Live Checklist

Pré-requisitos para promover **piloto** com construtora real. Marque cada item antes do go-live; lacunas = riscos documentados.

## 1. Infraestrutura

- [ ] VPS provisionada (mínimo 4 vCPU / 8GB RAM / 80GB SSD)
- [ ] DNS apontado: `app.cotaobra.com.br` + `api.cotaobra.com.br`
- [ ] TLS via Traefik + Let's Encrypt (cert renovação automatizada)
- [ ] Docker Compose com restart=unless-stopped em todos serviços
- [ ] Backup automatizado de Postgres (cron diário, retenção 30 dias)
- [ ] MinIO com volume persistente + backup semanal incremental
- [ ] Healthcheck do Traefik → backend `/health/ready`

## 2. Configuração de ambiente

- [ ] `.env` populado com **todos** os secrets de produção (não usar defaults)
- [ ] `JWT_SECRET` ≥ 32 chars random (gerar via `openssl rand -hex 32`)
- [ ] `ENCRYPTION_KEY` 32 bytes hex (gerar via `openssl rand -hex 32`)
- [ ] `ALLOWED_ORIGINS` com domínios reais (não `*`)
- [ ] `NODE_ENV=production`
- [ ] `GIT_SHA` populado via build args do Docker

## 3. Integrações externas

### WhatsApp
- [ ] Conta Twilio Business OU Meta Cloud API ativa
- [ ] Número aprovado (Twilio sandbox **não** serve em produção)
- [ ] Webhook configurado: `https://api.cotaobra.com.br/api/whatsapp/webhook`
- [ ] Templates HSM aprovados pela Meta:
  - [ ] `quote_invite_supplier` (convite ao fornecedor)
  - [ ] `quote_reminder` (lembrete de proposta)
  - [ ] `winner_notify` (vencedor)
  - [ ] `approval_pending` (aprovação) — **CO-6-04 pendente**

### Asaas (billing)
- [ ] Conta Asaas Business ativa
- [ ] `ASAAS_API_KEY` no env (sandbox para testes, produção no go-live)
- [ ] Webhook configurado em Asaas Dashboard:
  - URL: `https://api.cotaobra.com.br/api/billing/webhook`
  - Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED`

### ERP do cliente (opcional por tenant)
- [ ] Cliente fornece `erpWebhookUrl` + secret
- [ ] Adapter correto selecionado (sienge/gvdasa/generic)
- [ ] Dry-run testado: emitir 1 PO sandbox e confirmar recebimento no lado do ERP

### Observability
- [ ] `SENTRY_DSN` ativo (projeto Sentry criado para este pilot)
- [ ] `POSTHOG_API_KEY` setado + dashboard configurado com funnel principal
- [ ] Alertas Sentry para `error` level em `#cotaobra-pilot-oncall`

## 4. Dados iniciais (seed do pilot)

- [ ] Tenant da construtora criado (`name`, `cnpj`, `email`, `slug`)
- [ ] Usuário ADMIN inicial (com 2FA TOTP ativo)
- [ ] Pelo menos 1 obra (`Site`) cadastrada
- [ ] Catálogo de materiais importado via CSV (>= 50 itens recomendado)
- [ ] 5+ fornecedores cadastrados com phone WhatsApp válido
- [ ] `TenantSettings.approvalThreshold` definido (se workflow ativo)

## 5. Treinamento / handoff

- [ ] Sessão de 1h com 1 ADMIN + 1 BUYER + 1 APPROVER da construtora
- [ ] Walkthrough do fluxo: criar cotação → dispatch → receber proposta → fechar → emitir PO
- [ ] Documentação resumida de cada papel impressa ou em PDF
- [ ] Canal Slack/WhatsApp dedicado para suporte durante primeiros 30 dias

## 6. Validação técnica final

- [ ] backend `tsc --noEmit`: 0 erros
- [ ] frontend `tsc --noEmit`: 0 erros
- [ ] `prisma migrate status` mostra todas applied
- [ ] `GET /health` retorna 200 com todas integrações `true`
- [ ] Smoke test E2E manual:
  1. [ ] Login com admin
  2. [ ] Criar cotação de 3 itens
  3. [ ] Dispatch para 2 fornecedores
  4. [ ] Receber proposta via formulário público
  5. [ ] Ver comparativo no painel
  6. [ ] Fechar cotação modo `winner`
  7. [ ] PDF da OC baixado com sucesso
  8. [ ] Fornecedor vencedor recebeu WhatsApp

## 7. Go-live + 7 dias depois

- [ ] Acompanhar Sentry diariamente — qualquer erro novo é alta prioridade
- [ ] Conferir PostHog: funnel está progredindo (signups → quotes → POs)
- [ ] Coletar feedback do BUYER: latência? mensagens travando? UX?
- [ ] Backup restaurado em ambiente staging para validar procedimento

## 8. Pendências documentadas (não bloqueiam pilot, mas devem ser anotadas)

Itens explicitamente **não entregues** que o cliente precisa saber:

- HSM `approval_pending` precisa ser submetido + aprovado pela Meta
- Decryption de CNPJ do supplier no webhook ERP (Sprint 10+)
- Multi-currency (apenas BRL)
- E2E automatizado (Playwright) — só smoke manual disponível
- Backup automatizado MinIO (manual por enquanto)
- Comparação de períodos com top-materials/site-spending reports

---

**Aprovação final do go-live:** _________________ (assinatura) — Data: __/__/____
