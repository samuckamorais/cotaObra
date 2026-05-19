import { test, expect } from './fixtures';

test.describe('E2E-07 Fechar cotação (winner mode)', () => {
  test('fechar quote em modo winner → OC gerada → PDF baixável', async ({ page, loginAsAdmin }) => {
    await loginAsAdmin();
    const quoteId = process.env.E2E_QUOTE_ID_SUMMARIZED;
    test.skip(!quoteId, 'E2E_QUOTE_ID_SUMMARIZED não setado');

    await page.goto(`/quotes/${quoteId}`);
    await page.getByRole('button', { name: /fechar cotação/i }).click();

    // Modal CloseQuoteModal
    await page.getByRole('button', { name: /vencedor único|winner/i }).click();
    await page.getByLabel(/motivo/i).fill('E2E close test');
    await page.getByRole('button', { name: /confirmar|fechar/i }).click();

    await expect(page.getByText(/OC.* criada|ordem.* gerada/i)).toBeVisible({ timeout: 20_000 });
    await page.goto('/purchase-orders');
    const firstPO = page.locator('a, button').filter({ hasText: /OC #/i }).first();
    await firstPO.click();
    await expect(page.getByText(/baixar pdf|download pdf/i)).toBeVisible({ timeout: 60_000 });
  });
});
