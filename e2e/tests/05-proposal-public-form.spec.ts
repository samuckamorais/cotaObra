import { test, expect } from '@playwright/test';

/**
 * Acesso público via token. Requer fixture seed que gere um token válido
 * em E2E_PROPOSAL_TOKEN (variável de ambiente).
 */
test.describe('E2E-05 Proposal public form', () => {
  test('fornecedor abre link, preenche preços e submete', async ({ page }) => {
    const token = process.env.E2E_PROPOSAL_TOKEN;
    test.skip(!token, 'E2E_PROPOSAL_TOKEN não setado — gerar via seed');

    await page.goto(`/proposta/${token}`);
    await expect(page.getByText(/cotação|proposta/i)).toBeVisible();

    const priceInputs = page.locator('input[type=number]');
    const count = await priceInputs.count();
    for (let i = 0; i < count; i++) {
      await priceInputs.nth(i).fill(String(100 + i * 50));
    }

    await page.getByLabel(/pagamento/i).fill('28dd');
    await page.getByLabel(/prazo/i).fill('5');

    await page.getByRole('button', { name: /enviar|submeter/i }).click();
    await expect(page.getByText(/recebid|obrigad/i)).toBeVisible({ timeout: 15_000 });
  });
});
