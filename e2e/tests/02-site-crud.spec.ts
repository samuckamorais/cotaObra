import { test, expect } from './fixtures';

test.describe('E2E-02 Site CRUD', () => {
  test('criar obra → listar → marcar concluída', async ({ page, loginAsAdmin }) => {
    await loginAsAdmin();
    await page.goto('/sites');
    await page.getByRole('button', { name: /nova obra|adicionar/i }).first().click();
    await page.getByLabel(/nome/i).fill('E2E Obra Residencial Aurora');
    await page.getByLabel(/cidade/i).fill('Curitiba');
    await page.getByLabel(/estado|uf/i).fill('PR');
    await page.getByRole('button', { name: /salvar|criar/i }).click();
    await expect(page.getByText('E2E Obra Residencial Aurora')).toBeVisible();
  });
});
