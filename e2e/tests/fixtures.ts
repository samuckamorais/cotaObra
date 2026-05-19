import { test as base, expect } from '@playwright/test';

/**
 * Shared fixtures: helper para login admin + acesso a APIs internas via fetch.
 *
 * Assume que existe um usuário admin seed com email/password em env:
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 */

type Fixtures = {
  loginAsAdmin: () => Promise<void>;
};

export const test = base.extend<Fixtures>({
  loginAsAdmin: async ({ page }, use) => {
    await use(async () => {
      const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@cotaobra.dev';
      const password = process.env.E2E_ADMIN_PASSWORD ?? 'changeme';
      await page.goto('/login');
      await page.getByLabel(/e-?mail/i).fill(email);
      await page.getByLabel(/senha/i).fill(password);
      await page.getByRole('button', { name: /entrar/i }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  },
});

export { expect };
