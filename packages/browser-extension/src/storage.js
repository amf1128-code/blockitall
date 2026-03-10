// Storage layer — wraps chrome.storage.local for extension state

const KEYS = {
  API_URL: 'apiUrl',
  SUBSCRIPTIONS: 'subscriptions',     // { [slug]: { listId, name, slug, lastSyncedAt } }
  SYNCED_ACCOUNTS: 'syncedAccounts',  // { [slug]: [{ handle, twitter_id, added_at }] }
  BLOCKED_HANDLES: 'blockedHandles',  // Set-like array of handles already blocked
  SETTINGS: 'settings',              // { dryRun: bool }
  LOG: 'log',                        // [{ timestamp, level, message }]
};

export async function getApiUrl() {
  const result = await chrome.storage.local.get(KEYS.API_URL);
  return result[KEYS.API_URL] || null;
}

export async function setApiUrl(url) {
  await chrome.storage.local.set({ [KEYS.API_URL]: url });
}

export async function getSubscriptions() {
  const result = await chrome.storage.local.get(KEYS.SUBSCRIPTIONS);
  return result[KEYS.SUBSCRIPTIONS] || {};
}

export async function setSubscriptions(subs) {
  await chrome.storage.local.set({ [KEYS.SUBSCRIPTIONS]: subs });
}

export async function subscribe(list) {
  const subs = await getSubscriptions();
  subs[list.slug] = {
    listId: list.id,
    name: list.name,
    slug: list.slug,
    accountCount: list.account_count,
    lastSyncedAt: null,
  };
  await setSubscriptions(subs);
}

export async function unsubscribe(slug) {
  const subs = await getSubscriptions();
  delete subs[slug];
  await setSubscriptions(subs);

  // Also remove synced accounts for this list
  const synced = await getSyncedAccounts();
  delete synced[slug];
  await setSyncedAccounts(synced);
}

export async function getSyncedAccounts() {
  const result = await chrome.storage.local.get(KEYS.SYNCED_ACCOUNTS);
  return result[KEYS.SYNCED_ACCOUNTS] || {};
}

export async function setSyncedAccounts(accounts) {
  await chrome.storage.local.set({ [KEYS.SYNCED_ACCOUNTS]: accounts });
}

export async function getBlockedHandles() {
  const result = await chrome.storage.local.get(KEYS.BLOCKED_HANDLES);
  return new Set(result[KEYS.BLOCKED_HANDLES] || []);
}

export async function addBlockedHandles(handles) {
  const existing = await getBlockedHandles();
  for (const h of handles) {
    existing.add(h);
  }
  await chrome.storage.local.set({ [KEYS.BLOCKED_HANDLES]: [...existing] });
}

export async function getSettings() {
  const result = await chrome.storage.local.get(KEYS.SETTINGS);
  return result[KEYS.SETTINGS] || { dryRun: false };
}

export async function updateSettings(partial) {
  const current = await getSettings();
  await chrome.storage.local.set({ [KEYS.SETTINGS]: { ...current, ...partial } });
}

// Log management
const MAX_LOG_ENTRIES = 200;

export async function getLog() {
  const result = await chrome.storage.local.get(KEYS.LOG);
  return result[KEYS.LOG] || [];
}

export async function appendLog(level, message) {
  const log = await getLog();
  log.push({ timestamp: new Date().toISOString(), level, message });
  // Keep only the most recent entries
  const trimmed = log.slice(-MAX_LOG_ENTRIES);
  await chrome.storage.local.set({ [KEYS.LOG]: trimmed });
}

export async function clearLog() {
  await chrome.storage.local.set({ [KEYS.LOG]: [] });
}

export async function clearAllData() {
  await chrome.storage.local.clear();
}
