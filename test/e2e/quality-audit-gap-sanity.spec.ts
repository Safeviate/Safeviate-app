import { expect, test } from '@playwright/test';

async function loginAsSeedUser(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill('barry@safeviate.com');
  await page.getByLabel('Password').fill('SafeviateTemp2026!');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

test('audit and gap quality screens render after seeded login', async ({ page }) => {
  await loginAsSeedUser(page);

  await page.goto('/quality/gap-analyses');
  await expect(page.getByRole('link', { name: /new gap analysis template/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /gap analyses/i })).toBeVisible();

  await page.goto('/quality/gap-analyses/template/new');
  await expect(page.getByLabel('Template Title')).toBeVisible();
  await expect(page.getByLabel('Selected Company')).toBeVisible();
  await expect(page.getByRole('link', { name: /back to gap checklists/i })).toBeVisible();

  await page.goto('/quality/audit-checklists');
  await expect(page.getByRole('button', { name: /new checklist template/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /^audits$/i })).toBeVisible();

  await page.goto('/quality/audits');
  await expect(page.getByRole('link', { name: /audit templates/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /^audit checklists$/i })).toBeVisible();
});
