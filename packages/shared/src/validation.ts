import { TWITTER_HANDLE_REGEX } from './constants';

/**
 * Normalize a Twitter handle: strip @, lowercase, trim whitespace.
 */
export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

/**
 * Validate that a string is a valid Twitter handle (after normalization).
 */
export function isValidHandle(handle: string): boolean {
  return TWITTER_HANDLE_REGEX.test(handle);
}

/**
 * Parse a bulk import string (one handle per line) into normalized, validated handles.
 * Returns { valid, invalid, duplicates } arrays.
 */
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
