type HeaderCapableRequest = {
  headers?: Headers | Record<string, unknown> | undefined;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

const ONE_MINUTE_MS = 60_000;

export function getRequestClientIp(request: HeaderCapableRequest) {
  const headerSource = request.headers;
  const getHeader = (name: string) => {
    if (!headerSource) return '';
    if (typeof (headerSource as Headers).get === 'function') {
      return (headerSource as Headers).get(name)?.trim() || '';
    }

    const value = (headerSource as Record<string, unknown>)[name];
    return typeof value === 'string' ? value.trim() : '';
  };

  const forwardedFor = getHeader('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return getHeader('x-real-ip') || 'unknown';
}

export function enforceRateLimit(input: {
  request: HeaderCapableRequest;
  key: string;
  limit: number;
  windowMs?: number;
  identity?: string | null;
}) {
  const windowMs = input.windowMs ?? ONE_MINUTE_MS;
  const now = Date.now();
  const ip = getRequestClientIp(input.request);
  const identitySuffix = input.identity?.trim() ? `:${input.identity.trim().toLowerCase()}` : '';
  const bucketKey = `${input.key}:${ip}${identitySuffix}`;
  const existing = rateLimitBuckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return null;
  }

  if (existing.count >= input.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      retryAfterSeconds,
      message: 'Too many requests. Please wait a moment and try again.',
    };
  }

  existing.count += 1;
  rateLimitBuckets.set(bucketKey, existing);
  return null;
}

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'text/csv',
  'text/plain',
]);

const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.csv',
  '.gif',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.svg',
  '.txt',
  '.webp',
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function matchesFileSignature(buffer: Uint8Array, mimeType: string, extension: string) {
  if (mimeType === 'application/pdf' || extension === '.pdf') {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  if (mimeType === 'image/png' || extension === '.png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }

  if (mimeType === 'image/jpeg' || extension === '.jpg' || extension === '.jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === 'image/gif' || extension === '.gif') {
    return (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    );
  }

  if (mimeType === 'image/webp' || extension === '.webp') {
    return (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }

  if (mimeType === 'text/plain' || mimeType === 'text/csv' || extension === '.txt' || extension === '.csv') {
    return true;
  }

  if (mimeType === 'image/svg+xml' || extension === '.svg') {
    return false;
  }

  return true;
}

export async function validateUploadFile(file: File) {
  const fileName = file.name.trim().toLowerCase();
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
  const mimeType = (file.type || '').trim().toLowerCase();

  if (!fileName) {
    return 'A file name is required.';
  }

  if (file.size <= 0) {
    return 'The selected file is empty.';
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `Files must be ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB or smaller.`;
  }

  if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
    return 'This file type is not allowed for upload.';
  }

  if (mimeType && !ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
    return 'This file content type is not allowed for upload.';
  }

  if (extension === '.svg' || mimeType === 'image/svg+xml') {
    return 'SVG uploads are not allowed.';
  }

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!matchesFileSignature(bytes, mimeType, extension)) {
    return 'The uploaded file content does not match its expected file type.';
  }

  return null;
}
