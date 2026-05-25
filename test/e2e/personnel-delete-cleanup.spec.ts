import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
const SEED_EMAIL = process.env.AUTH_SEED_EMAIL || 'barry@safeviate.com';
const SEED_PASSWORD = process.env.AUTH_SEED_PASSWORD || 'SafeviateTemp2026!';
const BETA_NDA_VERSION = 'beta-nda-v1';

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required for the personnel delete cleanup test.');
}

type CleanupFixture = {
  tenantId: string;
  userId: string;
  email: string;
};

async function withClient<T>(fn: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function createCleanupFixture(): Promise<CleanupFixture> {
  const tenantId = 'safeviate';
  const userId = `test_user_${randomUUID().replace(/-/g, '')}`;
  const email = `delete-cleanup-${randomUUID().replace(/-/g, '')}@safeviate.test`;
  const tokenHash = `token_${randomUUID().replace(/-/g, '')}`;
  const inviteId = `invite_${randomUUID().replace(/-/g, '')}`;
  const ndaId = `nda_${randomUUID().replace(/-/g, '')}`;
  const passwordHash = '$2b$12$0123456789abcdefghijklmnopqrstuv';

  await withClient(async (client) => {
    await client.query(
      `INSERT INTO tenants (id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [tenantId, 'Safeviate'],
    );

    await client.query(
      `INSERT INTO users (
         id, tenant_id, email, password_hash, suspended_at,
         first_name, last_name, role, profile_path
       ) VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8)`,
      [
        userId,
        tenantId,
        email,
        passwordHash,
        'Cleanup',
        'Target',
        'Personnel',
        `tenants/${tenantId}/personnel/${userId}`,
      ],
    );

    await client.query(
      `INSERT INTO personnel (
         id, tenant_id, user_number, first_name, last_name, email,
         contact_number, organization_id, department, role,
         primary_instructor_id, instructor_assignment_history,
         progression_recommendation, progression_review_history,
         permissions, access_overrides, documents, user_type,
         can_be_instructor, can_be_student, can_be_pic,
         is_erp_incerfa_contact, is_erp_alerfa_contact
       ) VALUES (
         $1, $2, NULL, $3, $4, $5,
         NULL, NULL, NULL, $6,
         NULL, '[]'::jsonb,
         '{}'::jsonb, '[]'::jsonb,
         '[]'::jsonb, NULL, '[]'::jsonb, 'Personnel',
         FALSE, FALSE, FALSE,
         FALSE, FALSE
       )`,
      [userId, tenantId, 'Cleanup', 'Target', email, 'Personnel'],
    );

    await client.query(
      `INSERT INTO password_setup_invites (
         id, tenant_id, user_id, email, name, token_hash, expires_at, used_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '7 days', NULL)`,
      [inviteId, tenantId, userId, email, 'Cleanup Target', tokenHash],
    );

    await client.query(
      `INSERT INTO beta_nda_acceptances (
         id, tenant_id, email, name, nda_version, agreement_text,
         signature_data_url, accepted_at, ip_address, user_agent
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NULL, NULL)`,
      [
        ndaId,
        tenantId,
        email,
        'Cleanup Target',
        BETA_NDA_VERSION,
        'Fixture NDA acceptance for delete cleanup testing.',
        'data:image/png;base64,fixture',
      ],
    );
  });

  return { tenantId, userId, email };
}

async function deleteCleanupFixture(fixture: CleanupFixture) {
  await withClient(async (client) => {
    await client.query(`DELETE FROM password_setup_invites WHERE tenant_id = $1 AND (user_id = $2 OR email = $3)`, [
      fixture.tenantId,
      fixture.userId,
      fixture.email,
    ]);
    await client.query(`DELETE FROM beta_nda_acceptances WHERE tenant_id = $1 AND email = $2`, [
      fixture.tenantId,
      fixture.email,
    ]);
    await client.query(`DELETE FROM personnel WHERE tenant_id = $1 AND id = $2`, [
      fixture.tenantId,
      fixture.userId,
    ]);
    await client.query(`DELETE FROM users WHERE tenant_id = $1 AND id = $2`, [
      fixture.tenantId,
      fixture.userId,
    ]);
  });
}

test('deleting a user removes their auth, invite, and NDA records', async ({ page }) => {
  const fixture = await createCleanupFixture();

  try {
    await page.goto('/login');
    await page.getByLabel('Email Address').fill(SEED_EMAIL);
    await page.getByLabel('Password').fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    await page.goto('/users/personnel');
    await expect(page.getByText(fixture.email)).toBeVisible({ timeout: 15000 });

    const deleteResponse = await page.evaluate(async (userId) => {
      const response = await fetch(`/api/personnel/${userId}`, {
        method: 'DELETE',
      });
      return {
        status: response.status,
        body: await response.text(),
      };
    }, fixture.userId);

    expect(deleteResponse.status).toBe(200);

    const remaining = await withClient(async (client) => {
      const userRow = await client.query(`SELECT id FROM users WHERE id = $1 OR email = $2`, [fixture.userId, fixture.email]);
      const personnelRow = await client.query(`SELECT id FROM personnel WHERE id = $1 OR email = $2`, [fixture.userId, fixture.email]);
      const inviteRows = await client.query(`SELECT id FROM password_setup_invites WHERE user_id = $1 OR email = $2`, [fixture.userId, fixture.email]);
      const ndaRows = await client.query(`SELECT id FROM beta_nda_acceptances WHERE tenant_id = $1 AND email = $2`, [fixture.tenantId, fixture.email]);

      return {
        userCount: userRow.rowCount,
        personnelCount: personnelRow.rowCount,
        inviteCount: inviteRows.rowCount,
        ndaCount: ndaRows.rowCount,
      };
    });

    expect(remaining).toEqual({
      userCount: 0,
      personnelCount: 0,
      inviteCount: 0,
      ndaCount: 0,
    });
  } finally {
    await deleteCleanupFixture(fixture);
  }
});
