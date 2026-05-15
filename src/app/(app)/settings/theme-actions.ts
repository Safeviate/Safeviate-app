'use server';

import { prisma } from '@/lib/prisma';
import { authenticateAiRequest } from '@/lib/server/ai-auth';
import { ensureTenantConfigSchema } from '@/lib/server/bootstrap-db';
import { revalidatePath } from 'next/cache';

/**
 * Saves the current theme configuration as the organization default in the database.
 * This will be applied to all users within the same tenant.
 */
export async function saveOrganizationThemeAction(themeConfig: any) {
  try {
    const auth = await authenticateAiRequest();
    
    if (!auth.ok) {
      return { ok: false, error: auth.error };
    }

    // Check permissions (Developer or Admin)
    const role = auth.userProfile.role?.toLowerCase();
    const isDeveloper = role === 'dev' || role === 'developer';
    
    if (!isDeveloper && !auth.effectivePermissions.has('admin-settings-manage') && !auth.effectivePermissions.has('settings-manage')) {
      return { ok: false, error: 'Unauthorized to update organization branding.' };
    }

    await ensureTenantConfigSchema();

    // The data we save is the theme configuration object
    const tenantId = auth.tenantId;
    
    await prisma.tenantConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        data: themeConfig,
      },
      update: {
        data: themeConfig,
        updatedAt: new Date(),
      },
    });

    revalidatePath('/');
    
    return { ok: true };
  } catch (error) {
    console.error('[saveOrganizationThemeAction] error:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
