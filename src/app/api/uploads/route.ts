import { authOptions } from '@/auth';
import { buildUploadViewUrl, getAzureBlobContainerClient } from '@/lib/server/azure-blob';
import { enforceRateLimit, validateUploadFile } from '@/lib/server/request-security';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(request: Request) {
  const rateLimit = enforceRateLimit({
    request,
    key: 'uploads-create',
    limit: 20,
  });
  if (rateLimit) {
    return NextResponse.json(
      { error: rateLimit.message },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email?.trim().toLowerCase();

  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const displayNameRaw = formData.get('displayName');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  const fileValidationError = await validateUploadFile(file);
  if (fileValidationError) {
    return NextResponse.json({ error: fileValidationError }, { status: 400 });
  }

  const displayName = typeof displayNameRaw === 'string' && displayNameRaw.trim() ? displayNameRaw.trim() : file.name;
  const now = new Date();
  const datePrefix = now.toISOString().slice(0, 10);
  const safeDisplayName = sanitizeFileName(displayName);
  const safeFileName = sanitizeFileName(file.name);
  const blobPath = `uploads/${datePrefix}/${safeDisplayName}-${Date.now()}-${safeFileName}`;

  const containerClient = getAzureBlobContainerClient();
  if (containerClient) {
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    const bytes = await file.arrayBuffer();
    await blockBlobClient.uploadData(Buffer.from(bytes), {
      blobHTTPHeaders: {
        blobContentType: file.type || 'application/octet-stream',
      },
    });

    return NextResponse.json({
      name: displayName,
      url: buildUploadViewUrl(blobPath),
      uploadDate: now.toISOString(),
      expirationDate: null,
      size: file.size,
      contentType: file.type || null,
    });
  }

  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        error:
          'Azure Blob Storage is not configured. Add AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER_NAME to enable file uploads in production.',
      },
      { status: 503 }
    );
  }

  const localUrlPath = buildUploadViewUrl(blobPath);
  const uploadsRoot = path.join(process.cwd(), 'public');
  const localFilePath = path.join(uploadsRoot, blobPath);
  await mkdir(path.dirname(localFilePath), { recursive: true });
  const bytes = await file.arrayBuffer();
  await writeFile(localFilePath, Buffer.from(bytes));

  return NextResponse.json({
    name: displayName,
    url: localUrlPath,
    uploadDate: now.toISOString(),
    expirationDate: null,
    size: file.size,
    contentType: file.type || null,
  });
}
