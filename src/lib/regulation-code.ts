function normalizeRegulationCodeInternal(
  value: unknown,
  seen: WeakSet<object>,
  depth: number
): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (!value || depth > 3) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeRegulationCodeInternal(entry, seen, depth + 1))
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '';
    }

    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of ['regulationCode', 'code', 'value', 'label', 'text', 'name']) {
      const normalized = normalizeRegulationCodeInternal(record[key], seen, depth + 1);
      if (normalized) {
        return normalized;
      }
    }
  }

  return '';
}

export function normalizeRegulationCode(value: unknown): string {
  try {
    return normalizeRegulationCodeInternal(value, new WeakSet<object>(), 0);
  } catch {
    return '';
  }
}

export function normalizeTextValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value).trim();
  }

  return '';
}

function normalizeIndentationValue(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(6, Math.max(0, Math.round(value)));
}

export function normalizeIndentationArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeIndentationValue(entry))
    .filter((entry): entry is number => entry !== null);
}

export function sanitizeComplianceMatrixEntry<T>(item: T): T {
  if (!item || typeof item !== 'object') {
    return item;
  }
  const record = item as Record<string, unknown>;
  return {
    ...item,
    structureType: typeof record.structureType === 'string' ? record.structureType.trim() : undefined,
    regulationCode: normalizeRegulationCode(record.regulationCode),
    parentRegulationCode: normalizeRegulationCode(record.parentRegulationCode),
    documentHeading: normalizeTextValue(record.documentHeading),
    regulationStatement: normalizeTextValue(record.regulationStatement),
    technicalStandard: normalizeTextValue(record.technicalStandard),
    technicalStandardIndentation: normalizeIndentationArray(record.technicalStandardIndentation),
    companyReference: normalizeTextValue(record.companyReference),
    responsibleManagerId: normalizeTextValue(record.responsibleManagerId),
    gapStatusDate: normalizeTextValue(record.gapStatusDate),
    nextAuditDate: normalizeTextValue(record.nextAuditDate),
  } as T;
}
