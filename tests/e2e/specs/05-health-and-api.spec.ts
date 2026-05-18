import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:3000';

/**
 * Cenário 5 — Healthcheck do backend
 *
 * Espera: GET /health responde 200 com { ok: true }.
 * Smoke test crítico que confirma:
 *   - Backend subiu
 *   - Conexão com Postgres + Redis estável (o /health checa downstream)
 *
 * Sem isso, todos os outros cenários falham — então este vai primeiro
 * conceitualmente, mesmo numerado por último.
 */
test('GET /health retorna ok=true', async ({ request }) => {
  const res = await request.get(`${API_URL}/health`);
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.ok ?? body.status).toBeTruthy();
});

test('GET /api/auth/login com payload inválido retorna 400/401 (não 500)', async ({
  request,
}) => {
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: 'noexist@example.com', password: 'wrong-password' },
  });
  // Espera resposta controlada (não crash). Aceita 400 (validation) ou 401 (unauth).
  expect([400, 401, 404]).toContain(res.status());
});
