import { test, expect } from '@playwright/test';

/**
 * Cenário 4 — Placeholder de Obras
 *
 * Espera: /sites (autenticado) mostra a tela placeholder criada em CO-0-08.
 * Reutiliza o login do cenário 3.
 */
test('rota /sites mostra placeholder "Em construção"', async ({ page }) => {
  // Login primeiro (ProtectedLayout redireciona /sites → /login se não auth)
  await page.goto('/login');
  await page.locator('input[type="email"], input[name="email"]').first().fill('admin@cotaobra.dev');
  await page.locator('input[type="password"]').first().fill('senha-dev-123');
  await page.getByRole('button', { name: /entrar|login|acessar/i }).click();
  await page.waitForURL(/\/dashboard|\/forced-change-password|\/admin\/2fa-setup/, {
    timeout: 10_000,
  });

  // Navega para /sites
  await page.goto('/sites');

  // Validações: o placeholder tem h1 "Em construção" ou label "Obras"
  await expect(page.locator('body')).toContainText(/em construção|obras/i);
});
