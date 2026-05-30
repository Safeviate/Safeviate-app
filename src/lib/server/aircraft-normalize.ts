import { normalizeUploadUrl } from '@/lib/server/azure-blob';
import type { Aircraft } from '@/types/aircraft';

export function normalizeAircraftRecord(aircraft: unknown): Aircraft {
  if (!aircraft || typeof aircraft !== 'object') return aircraft as Aircraft;

  const record = aircraft as Record<string, unknown>;
  const documents = Array.isArray(record.documents)
    ? record.documents.map((document) => {
        if (!document || typeof document !== 'object') return document;
        const docRecord = document as Record<string, unknown>;
        return {
          ...docRecord,
          url: typeof docRecord.url === 'string' ? normalizeUploadUrl(docRecord.url) : docRecord.url,
        };
      })
    : record.documents;

  const tailNumber =
    typeof record.tailNumber === 'string' && record.tailNumber.trim()
      ? record.tailNumber.trim()
      : typeof record.registration === 'string' && record.registration.trim()
        ? record.registration.trim()
        : typeof record.registrationNumber === 'string' && record.registrationNumber.trim()
          ? record.registrationNumber.trim()
          : undefined;

  return {
    ...record,
    tailNumber: tailNumber || record.tailNumber,
    registration: typeof record.registration === 'string' && record.registration.trim() ? record.registration.trim() : tailNumber || record.registration,
    registrationNumber:
      typeof record.registrationNumber === 'string' && record.registrationNumber.trim()
        ? record.registrationNumber.trim()
        : tailNumber || record.registrationNumber,
    documents,
  } as unknown as Aircraft;
}
