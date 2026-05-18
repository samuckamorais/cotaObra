<!--
CotaObra — PR Template
Destino: .github/PULL_REQUEST_TEMPLATE.md no repositório cotaobra.
-->

## 📋 Task

<!-- ID da task no backlog v2 (ex: CO-1-02). Se for hotfix sem task, justifique. -->

**Task ID:** CO-X-XX
**Tipo:** 🔀 FORK-COPY | 🔧 FORK-ADAPT | ✏️ FORK-RENAME | ✨ NEW
**Sprint:** Sprint X
**Story Points:** X

Link para a task no board: <!-- cole aqui o link do GitHub Project / Linear / Jira -->

---

## 🎯 O que este PR faz

<!-- Resumo em 2-3 linhas. Foco no QUE muda no produto, não em detalhes técnicos. -->

---

## 🔍 Como testar

<!-- Passos numerados para o reviewer reproduzir localmente. -->

1.
2.
3.

---

## ✅ Critérios de Aceitação (do backlog v2)

<!-- Cole aqui os AC da task original e marque com [x] o que foi implementado. -->

- [ ] AC 1: ...
- [ ] AC 2: ...
- [ ] AC 3: ...

---

## 📦 Tipo de mudança

- [ ] 🐛 Bugfix (não muda comportamento esperado)
- [ ] ✨ Feature (adiciona funcionalidade nova)
- [ ] 💥 Breaking change (quebra compatibilidade — descreva impacto abaixo)
- [ ] 📝 Documentação
- [ ] 🔧 Refactor / chore / dívida técnica
- [ ] 🧪 Testes
- [ ] 🚀 Infra / CI / build

---

## 🗂️ Arquivos críticos tocados

<!-- Marque se alterou qualquer um destes (acionam review obrigatório de 2 devs). -->

- [ ] `backend/prisma/schema.prisma`
- [ ] `backend/src/flows/requester.flow.ts` ou `supplier.flow.ts`
- [ ] `backend/src/modules/whatsapp/`
- [ ] `backend/src/services/pricing-engine.service.ts`
- [ ] `backend/src/middleware/auth.middleware.ts` ou `tenant.middleware.ts`
- [ ] Workflow CI/CD ou docker-compose

---

## 🧪 Definition of Done (DoD)

Marque APENAS o que de fato foi feito. Não marque preventivamente.

- [ ] CI verde (lint + typecheck + unit + integration)
- [ ] Cobertura ≥ 60% no(s) módulo(s) tocado(s) — ou justificativa abaixo
- [ ] Testes E2E críticos passando (quando aplicável)
- [ ] Migration Prisma aplicada em staging sem erro (quando aplicável)
- [ ] `CHANGELOG.md` atualizado nesta PR
- [ ] Sem warnings novos no Sentry (staging) após deploy preview
- [ ] AC validado em staging por PO (apenas para tasks P0)
- [ ] Documentação inline / docs/ atualizada (quando aplicável)
- [ ] Para mudanças de UI: screenshots desktop **e** mobile abaixo

---

## 📸 Screenshots / Screencasts

<!-- Obrigatório para qualquer mudança visível ao usuário final. -->

| Antes | Depois |
|-------|--------|
| <!-- img --> | <!-- img --> |

---

## 🔁 Migration / Side effects

<!-- Tocou em schema.prisma? Aplicou migration? Tem rollback? -->

- [ ] Sem migration
- [ ] Migration reversível (rollback testado em staging)
- [ ] Migration NÃO reversível — justifique:

<!-- Exemplo: 'DROP TABLE producer_suppliers' — tabela vazia, sem dado em produção. -->

---

## 🚨 Riscos / Observações para o reviewer

<!-- Algo que o reviewer precisa olhar com atenção especial?
     Decisões que tomou e gostaria de validar?
     Trade-offs aceitos? -->

---

## 🧹 Checklist final

- [ ] Branch atualizada com `main` (`git pull --rebase origin main`)
- [ ] Conventional Commits: `type(scope): mensagem (CO-X-XX)`
- [ ] Removi `console.log`, código comentado e TODOs sem ticket
- [ ] PR vai ser **squash on merge**
- [ ] Não toquei em módulos fora do escopo da task

---

<sub>📚 Referências: [Backlog v2](../docs/CotaObra_Backlog_PO_Senior_v2.md) · [Roteiro Sprint 0](../docs/CotaObra_Roteiro_Desenvolvimento_Sprint0.md) · [Arquitetura](../docs/ARQUITETURA_E_ESPECIFICACAO_TECNICA.md)</sub>
