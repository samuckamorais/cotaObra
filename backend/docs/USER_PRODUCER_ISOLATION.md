# Modelo 1:1 USER ↔ Producer + Isolamento de Acesso

**Task de origem:** FF-BE-026 — Bugfix: Vínculo User-Producer + Isolamento de Acesso

## Contexto

O schema já previa o vínculo 1:1 entre `User` e `Producer` (campo `User.producerId @unique`), mas:

1. **`ProducerService.create()` nunca atualizava `User.producerId`** — o vínculo ficava órfão.
2. **`list/getById/update/delete` filtravam apenas por `tenantId`** — usuários do mesmo tenant viam dados uns dos outros.

Resultado: vazamento de dados pessoais entre clientes do mesmo tenant (risco LGPD).

## Modelo de autorização

Toda operação do `ProducerService` recebe um `AuthContext` (resolvido pelo helper `getAuthContext(req)`):

```ts
type AuthContext = {
  userId: string;
  tenantId: string;
  producerId: string | null;  // null = admin/super_admin; preenchido = user-produtor
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
};
```

### Matriz de comportamento

| Papel                 | create()                          | list()                     | getById()                | update/delete            |
|-----------------------|-----------------------------------|----------------------------|--------------------------|--------------------------|
| `USER` (sem vínculo)  | Cria + auto-link em transação     | Lista vazia                | 404                      | 404                      |
| `USER` (já vinculado) | 409 Conflict                      | Vê só o seu                | Só se `id === producerId`| Só se `id === producerId`|
| `ADMIN`               | Cria sem auto-link                | Todos do tenant            | Qualquer do tenant       | Qualquer do tenant       |
| `SUPER_ADMIN`         | Cria sem auto-link (cross-tenant) | Cross-tenant               | Cross-tenant             | Cross-tenant             |

### Por que 404 e não 403 quando `USER` acessa producer alheio?

Para não vazar a existência do recurso. Um 403 confirmaria que aquele ID existe; um 404 é indistinguível de "ID não existe".

## Auto-link no `create()`

Quando um `USER` com `producerId=null` cria seu primeiro producer, tudo acontece dentro de `prisma.$transaction`:

1. Cria o `Producer`
2. Atualiza `User.producerId = producer.id`
3. Cria `FSMEvent` com `eventType: 'producer_auto_linked_to_user'` para auditoria

Se a transação falhar em qualquer passo, nada é persistido. A constraint `@unique` em `User.producerId` protege contra race condition de dois requests simultâneos.

## Script de migração legacy

```bash
npm run migrate:producer-links
```

Idempotente: para cada tenant, se houver **exatamente 1 USER órfão + 1 Producer órfão**, faz o auto-link. Casos ambíguos (>1 user OU >1 producer) vão para log `WARN` — super admin resolve manualmente (futuro endpoint `/api/admin/users/:id/link-producer`).

Rodar de novo após primeira execução é seguro: users já vinculados não são reprocessados; producers já linkados não aparecem como candidatos.

## Tracking / Observabilidade

Eventos logados (incluem `tenantId`, `userId`, `producerId`):

- `producer_auto_linked_to_user` — FSMEvent + log INFO ao criar producer com auto-link
- `producer_auto_linked_to_user_legacy_migration` — FSMEvent no script de migração
- `producer_create_blocked_already_linked` — log WARN quando USER tenta criar 2º producer
- `producer_isolation_violation_attempted` — log WARN quando USER tenta acessar producer alheio

## Out of scope (próximas tasks)

- Endpoint admin `/api/admin/users/:id/link-producer` para relink manual (FEAT-008)
- Migração de outros recursos (Quote, Subscription) — não há vazamento similar
- Permitir USER ter múltiplos producers (premissa do produto é 1:1)
- Transferência de producer entre users (operação manual via SUPER_ADMIN)
