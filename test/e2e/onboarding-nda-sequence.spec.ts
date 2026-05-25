import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
test.setTimeout(120000);

const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
const SEED_EMAIL = process.env.AUTH_SEED_EMAIL || 'barry@safeviate.com';
const SEED_PASSWORD = process.env.AUTH_SEED_PASSWORD || 'SafeviateTemp2026!';
const TENANT_ID = 'safeviate-qsm';

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required for the onboarding NDA sequence test.');
}

async function withClient<T>(fn: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function cleanupUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  await withClient(async (client) => {
    const userRows = await client.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM users WHERE email = $1`,
      [normalizedEmail],
    );

    for (const row of userRows.rows) {
      await client.query(`DELETE FROM password_setup_invites WHERE user_id = $1 OR email = $2`, [row.id, normalizedEmail]);
      await client.query(`DELETE FROM personnel WHERE id = $1 OR email = $2`, [row.id, normalizedEmail]);
      await client.query(`DELETE FROM users WHERE id = $1 OR email = $2`, [row.id, normalizedEmail]);
    }

    await client.query(`DELETE FROM beta_nda_acceptances WHERE email = $1`, [normalizedEmail]);
  });
}

test('new tenant users see the NDA only after password setup and first login', async ({ browser, page }) => {
  const unique = randomUUID().replace(/-/g, '');
  const email = `onboarding-${unique}@example.com`;
  const password = `TenantFlow2026!${unique.slice(0, 6)}`;
  const userNumber = `AUT-${unique.slice(0, 6).toUpperCase()}`;

  await cleanupUser(email);

  try {
    await page.goto('/login');
    await page.getByLabel('Email Address').fill(SEED_EMAIL);
    await page.getByLabel('Password').fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    const createResponse = await page.request.post('/api/admin/create-personnel', {
      data: {
        tenantId: TENANT_ID,
        email,
        firstName: 'Onboarding',
        lastName: 'Proof',
        userType: 'Personnel',
        role: 'Administrator',
        department: 'QSM',
        userNumber,
      },
    });
    const createResult = await createResponse.json().catch(() => null);

    expect(createResponse.status()).toBe(200);
    expect(createResult?.diagnostics?.inviteLink).toBeTruthy();

    const inviteLink = String(createResult.diagnostics.inviteLink);

    const userContext = await browser.newContext({ baseURL: 'http://127.0.0.1:9002' });
    const userPage = await userContext.newPage();

    await userPage.goto(inviteLink);
    await expect(userPage.getByText('Create your password')).toBeVisible({ timeout: 15000 });
    await userPage.getByLabel('New Password').fill(password);
    await userPage.getByLabel('Confirm Password').fill(password);
    await userPage.getByRole('button', { name: 'Save Password' }).click();

    await userPage.waitForURL(/\/login\?setup=1/, { timeout: 15000 });
    await expect(userPage).toHaveURL(new RegExp(`/login\\?setup=1.*email=${encodeURIComponent(email).replace(/\+/g, '\\+')}`));

    const ndaStatusResponse = await userPage.request.get(`/api/auth/nda-status?email=${encodeURIComponent(email)}`);
    const ndaStatus = await ndaStatusResponse.json();
    expect(ndaStatusResponse.status()).toBe(200);
    expect(ndaStatus.passwordSetupPending).toBe(false);
    expect(ndaStatus.accepted).toBe(false);
    expect(ndaStatus.tenantId).toBe(TENANT_ID);

    await userPage.getByLabel('Password').fill(password);
    await userPage.getByRole('button', { name: 'Sign In' }).click();

    await userPage.waitForURL(/\/beta-nda/, { timeout: 15000 });
    await expect(userPage).toHaveURL(new RegExp(`/beta-nda\\?email=${encodeURIComponent(email).replace(/\+/g, '\\+')}`));

    await userPage.getByLabel('Full Name').fill('Onboarding Proof');
    const canvas = userPage.locator('canvas').first();
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error('Could not find signature pad canvas.');
    }
    await userPage.mouse.move(box.x + 20, box.y + 30);
    await userPage.mouse.down();
    await userPage.mouse.move(box.x + 120, box.y + 80, { steps: 8 });
    await userPage.mouse.move(box.x + 200, box.y + 40, { steps: 8 });
    await userPage.mouse.up();
    await userPage.getByLabel(/I have read the beta NDA/i).click();
    await userPage.getByRole('button', { name: 'Accept NDA' }).click();

    await userPage.waitForURL(/\/login\?email=.*nda=accepted/, { timeout: 15000 });
    await userPage.getByLabel('Password').fill(password);
    await userPage.getByRole('button', { name: 'Sign In' }).click();

    await userPage.waitForURL(/\/dashboard/, { timeout: 15000 });
    await expect(userPage).toHaveURL(/\/dashboard/);
    await userContext.close();
  } finally {
    await cleanupUser(email);
  }
});
