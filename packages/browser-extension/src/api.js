// API client — fetches block lists from the public Supabase Edge Function

import { getApiUrl } from './storage.js';

async function getBaseUrl() {
  const url = await getApiUrl();
  if (!url) throw new Error('API URL not configured. Open the extension popup to set it up.');
  return url.replace(/\/+$/, '');
}

export async function fetchLists() {
  const base = await getBaseUrl();
  const res = await fetch(base, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch lists: ${res.status}`);
  return res.json();
}

export async function fetchListBySlug(slug) {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/${encodeURIComponent(slug)}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch list "${slug}": ${res.status}`);
  return res.json();
}

/**
 * Fetch all accounts for a list, paginating through the full result set.
 * Supports incremental sync via `since` parameter.
 * Returns an array of { handle, twitter_id, added_at }.
 */
export async function fetchAllAccountsForList(slug, since = null) {
  const base = await getBaseUrl();
  const allAccounts = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ limit: '200' });
    if (since) params.set('since', since);
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${base}/${encodeURIComponent(slug)}/accounts?${params}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) throw new Error(`Failed to fetch accounts for "${slug}": ${res.status}`);

    const body = await res.json();
    allAccounts.push(...(body.data || []));
    cursor = body.cursor;
    hasMore = body.has_more;
  }

  return allAccounts;
}
