import { test, expect } from '@playwright/test';

/**
 * Cenário 1 — Root path
 *
 * Espera: GET / redireciona para /login (CO-0-08 removeu Landing.tsx).
 *
 * Validação rápida que confirma o front buildado e o roteamento básico funciona.
 */
test('GET / redireciona para /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});
