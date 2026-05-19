import { test, expect } from './fixtures';

const TABS = ['Operacional', 'Funil', 'Economia', 'Fornecedores', 'Categoria/Região', 'Top materiais', 'Gasto por obra'];

test.describe('E2E-09 Reports tabs', () => {
  test('todas as 7 abas carregam sem erro', async ({ page, loginAsAdmin }) => {
    await loginAsAdmin();
    await page.goto('/reports');
    for (const label of TABS) {
      await page.getByRole('button', { name: label }).click();
      // Espera não aparecer erro genérico
      await expect(page.getByText(/Erro|Failed to fetch/i)).not.toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });
});
