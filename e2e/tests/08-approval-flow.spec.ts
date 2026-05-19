import { test, expect } from './fixtures';

test.describe('E2E-08 Approval flow', () => {
  test('quote acima do teto → AWAITING_APPROVAL → APPROVER aprova → OC', async ({ page, loginAsAdmin, browser }) => {
    await loginAsAdmin();

    // Set threshold a R$ 1,00 para forçar aprovação em qualquer cotação
    await page.goto('/settings');
    await page.locator('input[type=number]').filter({ hasText: '' }).last().fill('1');
    await page.getByRole('button', { name: /salvar/i }).click();
    await expect(page.getByText(/salvas|sucesso/i)).toBeVisible();

    // Fechar cotação (deve cair em aprovação)
    const quoteId = process.env.E2E_QUOTE_ID_SUMMARIZED;
    test.skip(!quoteId, 'E2E_QUOTE_ID_SUMMARIZED não setado');
    await page.goto(`/quotes/${quoteId}`);
    await page.getByRole('button', { name: /fechar cotação/i }).click();
    await page.getByRole('button', { name: /vencedor único|winner/i }).click();
    await page.getByRole('button', { name: /confirmar/i }).click();

    await expect(page.getByText(/aprovação necessária|aguardando aprovador/i)).toBeVisible({ timeout: 15_000 });

    // Approver loga e aprova (mesmo usuário admin = ADMIN tem permissão)
    await page.goto('/approvals');
    await page.getByText(/aguardando/i).first().click();
    await page.getByRole('button', { name: /aprovar e gerar OC/i }).click();

    // Confirm
    page.once('dialog', (d) => d.accept());
    await expect(page.getByText(/aprovado|ordem.*gerad/i)).toBeVisible({ timeout: 20_000 });
  });
});
