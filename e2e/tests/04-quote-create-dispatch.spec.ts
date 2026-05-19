import { test, expect } from './fixtures';

test.describe('E2E-04 Quote: criar + dispatch', () => {
  test('criar cotação de 3 itens e disparar para 2 fornecedores', async ({ page, loginAsAdmin }) => {
    await loginAsAdmin();
    await page.goto('/quotes');
    await page.getByRole('button', { name: /nova cotação|criar cotação/i }).click();

    await page.getByLabel(/obra|site/i).first().click();
    await page.getByRole('option').first().click();

    // 3 itens
    for (let i = 0; i < 3; i++) {
      if (i > 0) await page.getByRole('button', { name: /adicionar item/i }).click();
      await page.locator('input[name*=description]').nth(i).fill(`Item E2E ${i + 1}`);
      await page.locator('input[name*=quantity]').nth(i).fill('10');
      await page.locator('input[name*=unit]').nth(i).fill('un');
    }

    await page.getByRole('button', { name: /salvar/i }).click();
    await expect(page).toHaveURL(/\/quotes\/[a-z0-9-]+$/);

    // Dispatch
    await page.getByRole('button', { name: /selecionar fornecedores|dispatch/i }).click();
    await page.locator('input[type=checkbox]').first().check();
    await page.locator('input[type=checkbox]').nth(1).check();
    await page.getByRole('button', { name: /disparar|enviar/i }).click();

    await expect(page.getByText(/COLLECTING|coletando/i)).toBeVisible({ timeout: 15_000 });
  });
});
