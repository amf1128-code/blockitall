const TWITTER_HANDLE_REGEX = /^[a-zA-Z0-9_]{1,15}$/;

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return TWITTER_HANDLE_REGEX.test(handle);
}

export function parseBulkImport(input: string): {
  valid: string[];
  invalid: string[];
  duplicates: string[];
} {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];

  const lines = input.split(/[\n,]+/);
  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;

    const normalized = normalizeHandle(raw);
    if (!isValidHandle(normalized)) {
      invalid.push(raw);
      continue;
    }

    if (seen.has(normalized)) {
      duplicates.push(raw);
      continue;
    }

    seen.add(normalized);
    valid.push(normalized);
  }

  return { valid, invalid, duplicates };
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function sanitizeInput(input: string): string {
  return input.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;' };
    return map[c] || c;
  });
}
