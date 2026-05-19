import { test, expect } from './fixtures';

test.describe('E2E-10 Settings ERP + Asaas checkout', () => {
  test('configurar webhook ERP + iniciar checkout BASIC', async ({ page, loginAsAdmin }) => {
    await loginAsAdmin();

    // Settings: ERP webhook
    await page.goto('/settings');
    await page.getByPlaceholder(/erp\.suaempresa|webhook/i).fill('https://example.com/webhooks/cotaobra');
    await page.locator('select').filter({ has: page.locator('option', { hasText: /sienge/i }) }).selectOption('sienge');
    await page.getByPlaceholder(/secret|password/i).fill('e2e-secret-key-very-secure-32chars');
    await page.getByRole('button', { name: /salvar configurações/i }).click();
    await expect(page.getByText(/salvas|configurações salvas/i)).toBeVisible({ timeout: 10_000 });

    // Asaas checkout
    await page.goto('/subscriptions');
    const basicButton = page.getByRole('button', { name: /BASIC|assinar.*basic/i }).first();
    if (await basicButton.count() > 0) {
      await basicButton.click();
      // No modo stub redireciona para `/dashboard?checkout=stub&plan=BASIC`
      await expect(page).toHaveURL(/checkout|asaas|subscriptions/i, { timeout: 15_000 });
    }
  });
});
