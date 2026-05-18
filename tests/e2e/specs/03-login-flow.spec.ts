import { test, expect } from '@playwright/test';

/**
 * Cenário 3 — Fluxo de login com credenciais do seed.
 *
 * Espera: login com admin@cotaobra.dev / senha-dev-123 redireciona
 * para o dashboard (rota protegida).
 *
 * Pré-requisitos:
 *   - Backend rodando + DB migrado + seed aplicado (admin@cotaobra.dev existe).
 *   - Frontend rodando.
 */
test('login com seed credentials → dashboard', async ({ page }) => {
  await page.goto('/login');

  // Preencher campos
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.fill('admin@cotaobra.dev');

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill('senha-dev-123');

  // Submeter (clica no botão "Entrar" / "Login")
  await page.getByRole('button', { name: /entrar|login|acessar/i }).click();

  // Espera redirect para /dashboard (com até 10s para latência da API)
  await page.waitForURL(/\/dashboard|\/forced-change-password|\/admin\/2fa-setup/, {
    timeout: 10_000,
  });

  // Sanity: alguma página autenticada renderizou
  await expect(page.locator('body')).not.toContainText(/inválido|invalid/i);
});
