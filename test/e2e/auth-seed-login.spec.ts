import { expect, test } from '@playwright/test';

test('master seed login works for the barry super user', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill('barry@safeviate.com');
  await page.getByLabel('Password').fill('SafeviateTemp2026!');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  await expect(page).toHaveURL(/\/dashboard/);
});
