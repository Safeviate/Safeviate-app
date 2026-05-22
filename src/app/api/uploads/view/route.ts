import { authOptions } from '@/auth';
import { getAzureBlobContainerClient } from '@/lib/server/azure-blob';
import { enforceRateLimit } from '@/lib/server/request-security';
import { readFile } from 'node:fs/promises';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import path from 'node:path';

function getContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(request: Request) {
  const rateLimit = enforceRateLimit({
    request,
    key: 'uploads-view',
    limit: 120,
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

  const url = new URL(request.url);
  const blobPath = url.searchParams.get('path')?.trim();

  if (!blobPath || blobPath.includes('..') || blobPath.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid file path.' }, { status: 400 });
  }

  const containerClient = getAzureBlobContainerClient();
  if (containerClient) {
    const blobClient = containerClient.getBlobClient(blobPath);
    const exists = await blobClient.exists();

    if (exists) {
      const downloadResponse = await blobClient.download();

      if (!downloadResponse.readableStreamBody) {
        return NextResponse.json({ error: 'File could not be read.' }, { status: 500 });
      }

      const headers = new Headers();
      headers.set('Content-Type', downloadResponse.contentType || 'application/octet-stream');
      headers.set('Cache-Control', 'private, max-age=300');

      if (downloadResponse.contentLength !== undefined) {
        headers.set('Content-Length', String(downloadResponse.contentLength));
      }

      return new Response(downloadResponse.readableStreamBody as unknown as BodyInit, { headers });
    }
  }

  const localFilePath = path.join(process.cwd(), 'public', blobPath);
  try {
    const fileBuffer = await readFile(localFilePath);
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': getContentType(localFilePath),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }
}
