const DEPRECATED_SSL_MODES = new Set(['prefer', 'require', 'verify-ca']);

export function normalizePostgresConnectionString(connectionString?: string | null) {
  const trimmed = connectionString?.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const sslmode = url.searchParams.get('sslmode');

    if (sslmode && DEPRECATED_SSL_MODES.has(sslmode) && !url.searchParams.has('uselibpqcompat')) {
      url.searchParams.set('sslmode', 'verify-full');
    }

    return url.toString();
  } catch {
    return trimmed;
  }
}
