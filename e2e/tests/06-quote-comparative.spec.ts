import { test, expect } from './fixtures';

test.describe('E2E-06 Comparativo', () => {
  test('quadro comparativo carrega + vencedor destacado', async ({ page, loginAsAdmin }) => {
    await loginAsAdmin();
    const quoteId = process.env.E2E_QUOTE_ID_SUMMARIZED;
    test.skip(!quoteId, 'E2E_QUOTE_ID_SUMMARIZED não setado');

    await page.goto(`/quotes/${quoteId}`);
    await expect(page.getByText(/quadro comparativo/i)).toBeVisible();
    await expect(page.getByText(/1º preço|1º lugar/i).first()).toBeVisible();
    await expect(page.getByText(/total corrigido/i)).toBeVisible();
  });
});
