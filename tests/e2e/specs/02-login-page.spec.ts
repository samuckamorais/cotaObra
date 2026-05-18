import { test, expect } from '@playwright/test';

/**
 * Cenário 2 — Página de Login
 *
 * Espera: tela de login renderiza com:
 *   - campo email
 *   - campo senha
 *   - botão de submit
 *   - branding CotaObra visível
 */
test('Login page renderiza com campos e branding CotaObra', async ({ page }) => {
  await page.goto('/login');

  // Branding CotaObra (logo ou nome em alguma parte do DOM)
  await expect(page.locator('body')).toContainText(/CotaObra/i);

  // Campos do formulário
  const emailInput = page.locator(
    'input[type="email"], input[name="email"], input[placeholder*="email" i]',
  );
  await expect(emailInput).toBeVisible();

  const passwordInput = page.locator('input[type="password"]');
  await expect(passwordInput).toBeVisible();

  // Botão de submit
  const submit = page.getByRole('button', { name: /entrar|login|acessar/i });
  await expect(submit).toBeVisible();
});
