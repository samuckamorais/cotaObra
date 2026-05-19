import path from 'path';
import { test, expect } from './fixtures';

test.describe('E2E-03 Material CSV import', () => {
  test('importa CSV de catálogo e lista materiais', async ({ page, loginAsAdmin }) => {
    await loginAsAdmin();
    await page.goto('/materials');
    const importButton = page.getByRole('button', { name: /import.* csv/i });
    await importButton.click();

    const fileInput = page.locator('input[type=file]');
    await fileInput.setInputFiles(path.resolve(__dirname, '../fixtures/materials-sample.csv'));

    await expect(page.getByText(/import\w* (concluído|sucesso|ok)/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/cimento|areia|brita/i)).toBeVisible();
  });
});
