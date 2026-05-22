import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureCompanyDocumentsSchema } from '@/lib/server/bootstrap-db';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

async function getTenantIdForSession(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email?.trim().toLowerCase()) {
    return null;
  }
  return getTenantIdFromSession(request);
}

export async function GET(request: Request) {
  try {
    await ensureCompanyDocumentsSchema();
    const tenantId = await getTenantIdForSession(request);
    if (!tenantId) {
      return NextResponse.json({ documents: [] }, { status: 200 });
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, url, upload_date, expiration_date, doc_type FROM company_documents WHERE tenant_id = $1 ORDER BY created_at ASC`,
      tenantId
    );

    return NextResponse.json({
      documents: rows.map((row) => ({
        id: row.id,
        name: row.name,
        url: row.url,
        uploadDate: row.upload_date ? new Date(row.upload_date).toISOString() : new Date().toISOString(),
        expirationDate: row.expiration_date ? new Date(row.expiration_date).toISOString() : null,
        type: row.doc_type === 'image' ? 'image' : 'file',
      })),
    });
  } catch (error) {
    console.error('[company-documents] fallback to empty list:', error);
    return NextResponse.json({ documents: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCompanyDocumentsSchema();
    const tenantId = await getTenantIdForSession(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const id = payload?.id?.toString() || crypto.randomUUID();
    const name = payload?.name?.toString()?.trim();
    const url = payload?.url?.toString()?.trim();
    const uploadDate = payload?.uploadDate ? new Date(payload.uploadDate) : new Date();
    const expirationDate = payload?.expirationDate ? new Date(payload.expirationDate) : null;
    const docType = payload?.type === 'image' ? 'image' : 'file';

    if (!name || !url) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO company_documents (id, tenant_id, name, url, upload_date, expiration_date, doc_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      id,
      tenantId,
      name,
      url,
      uploadDate,
      expirationDate,
      docType
    );

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('[company-documents] write failed:', error);
    return NextResponse.json({ error: 'Failed to save company document.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCompanyDocumentsSchema();
    const tenantId = await getTenantIdForSession(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const id = payload?.id?.toString();
    const expirationDate = payload?.expirationDate ? new Date(payload.expirationDate) : null;

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE company_documents SET expiration_date = $3, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      id,
      tenantId,
      expirationDate
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[company-documents] patch failed:', error);
    return NextResponse.json({ error: 'Failed to update company document.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCompanyDocumentsSchema();
    const tenantId = await getTenantIdForSession(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(`DELETE FROM company_documents WHERE id = $1 AND tenant_id = $2`, id, tenantId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[company-documents] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete company document.' }, { status: 500 });
  }
}
