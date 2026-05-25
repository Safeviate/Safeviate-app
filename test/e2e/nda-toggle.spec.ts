import { expect, test, type Page } from '@playwright/test';

async function stubFailedLoginAndNdaStatus(page: Page, enabled: boolean) {
  await page.route('**/api/auth/callback/credentials', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        status: 401,
        error: 'CredentialsSignin',
        url: 'http://127.0.0.1:9002/login?error=CredentialsSignin',
      }),
    });
  });

  await page.route('**/api/auth/nda-status**', async (route) => {
    const url = new URL(route.request().url());
    const email = url.searchParams.get('email') || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        accepted: false,
        enabled,
        version: 'beta-nda-v1',
        tenantId: 'safeviate',
        email,
      }),
    });
  });
}

test('login stays on sign in when the NDA gate is disabled', async ({ page }) => {
  await stubFailedLoginAndNdaStatus(page, false);

  await page.goto('/login');
  await page.getByLabel('Email Address').fill('tester@safeviate.com');
  await page.getByLabel('Password').fill('bad-password');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText('The beta NDA is currently turned off for this tenant.')).toBeHidden();
});

test('login redirects to the NDA page when the NDA gate is enabled and not yet accepted', async ({ page }) => {
  await stubFailedLoginAndNdaStatus(page, true);

  await page.goto('/login');
  await page.getByLabel('Email Address').fill('tester@safeviate.com');
  await page.getByLabel('Password').fill('bad-password');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForURL(/\/beta-nda/);
  await expect(page).toHaveURL(/\/beta-nda/);
});

test('password setup errors are shown directly without an NDA bounce', async ({ page }) => {
  let ndaStatusCalled = false;

  await page.route('**/api/auth/callback/credentials', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        status: 401,
        error: 'CredentialsSignin',
        url: 'http://127.0.0.1:9002/login?error=CredentialsSignin',
      }),
    });
  });

  await page.route('**/api/auth/nda-status**', async (route) => {
    ndaStatusCalled = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        accepted: false,
        enabled: true,
        passwordSetupPending: true,
        passwordSetupMessage: 'Password setup is still pending. Please open the reset link you received and save a new password.',
        version: 'beta-nda-v1',
        tenantId: 'safeviate',
      }),
    });
  });

  await page.goto('/login');
  await page.getByLabel('Email Address').fill('tester@safeviate.com');
  await page.getByLabel('Password').fill('bad-password');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.locator('body')).toContainText('Password setup is still pending. Please open the reset link you received and save a new password.', { timeout: 15000 });
  expect(ndaStatusCalled).toBeTruthy();
  await expect(page).toHaveURL(/\/login/);
});
