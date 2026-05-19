import { test, expect } from './fixtures';

test.describe('E2E-01 Auth: login', () => {
  test('login bem-sucedido redireciona para /dashboard', async ({ page, loginAsAdmin }) => {
    await loginAsAdmin();
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('senha errada exibe erro', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill('qualquer@cotaobra.dev');
    await page.getByLabel(/senha/i).fill('senha-errada-123');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page.getByText(/credenciais inválidas|senha incorret/i)).toBeVisible();
  });
});
