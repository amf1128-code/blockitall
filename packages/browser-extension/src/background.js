// Background script — handles syncing and blocking via messages from popup/content script

import { api } from './compat.js';
import { fetchLists, fetchAllAccountsForList } from './api.js';
import {
  getSubscriptions,
  setSubscriptions,
  getSyncedAccounts,
  setSyncedAccounts,
  getBlockedHandles,
  addBlockedHandles,
  getSettings,
  appendLog,
} from './storage.js';

// Message handler — popup and content scripts communicate through here
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // keep the message channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {
    case 'FETCH_LISTS':
      return fetchLists();

    case 'SYNC_SUBSCRIPTIONS':
      return syncSubscriptions();

    case 'RUN_BLOCKS':
      return runBlocks(message.dryRun);

    case 'CHECK_TWITTER_SESSION':
      return checkTwitterSession();

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

/**
 * Sync all subscribed lists — fetches new accounts since last sync.
 */
async function syncSubscriptions() {
  const subs = await getSubscriptions();
  const slugs = Object.keys(subs);
  if (slugs.length === 0) {
    await appendLog('warn', 'No lists subscribed');
    return { synced: 0, newAccounts: 0 };
  }

  const syncedAccounts = await getSyncedAccounts();
  let totalNew = 0;

  for (const slug of slugs) {
    const sub = subs[slug];
    await appendLog('info', `Syncing list: ${sub.name}...`);

    try {
      // Use incremental sync if we've synced before
      const accounts = await fetchAllAccountsForList(slug, sub.lastSyncedAt);

      if (sub.lastSyncedAt && accounts.length > 0) {
        // Merge new accounts with existing
        const existing = syncedAccounts[slug] || [];
        const existingHandles = new Set(existing.map(a => a.handle));
        const newOnes = accounts.filter(a => !existingHandles.has(a.handle));
        syncedAccounts[slug] = [...existing, ...newOnes];
        totalNew += newOnes.length;
        await appendLog('success', `${sub.name}: ${newOnes.length} new accounts`);
      } else if (!sub.lastSyncedAt) {
        // First sync — download everything
        syncedAccounts[slug] = accounts;
        totalNew += accounts.length;
        await appendLog('success', `${sub.name}: ${accounts.length} accounts (initial sync)`);
      } else {
        await appendLog('info', `${sub.name}: already up to date`);
      }

      // Update last synced timestamp
      subs[slug].lastSyncedAt = new Date().toISOString();
    } catch (err) {
      await appendLog('error', `Failed to sync ${sub.name}: ${err.message}`);
    }
  }

  await setSyncedAccounts(syncedAccounts);
  await setSubscriptions(subs);

  return { synced: slugs.length, newAccounts: totalNew };
}

/**
 * Run blocks against all synced accounts that haven't been blocked yet.
 * Sends block commands to the content script running on Twitter.
 */
async function runBlocks(dryRun = false) {
  const settings = await getSettings();
  const isDryRun = dryRun ?? settings.dryRun;

  const syncedAccounts = await getSyncedAccounts();
  const blockedHandles = await getBlockedHandles();

  // Collect all unblocked handles across all subscribed lists
  const toBlock = [];
  for (const slug of Object.keys(syncedAccounts)) {
    for (const account of syncedAccounts[slug]) {
      if (!blockedHandles.has(account.handle) && !toBlock.some(a => a.handle === account.handle)) {
        toBlock.push(account);
      }
    }
  }

  if (toBlock.length === 0) {
    await appendLog('info', 'No new accounts to block');
    return { blocked: 0, failed: 0, skipped: 0, total: 0 };
  }

  await appendLog('info', `${isDryRun ? '[DRY RUN] ' : ''}Starting to block ${toBlock.length} accounts...`);

  // Find an active Twitter tab to send block commands to
  const tabs = await api.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
  if (tabs.length === 0) {
    await appendLog('error', 'No Twitter/X tab found. Please open twitter.com or x.com first.');
    return { blocked: 0, failed: 0, skipped: 0, total: toBlock.length, error: 'No Twitter tab open' };
  }

  const tabId = tabs[0].id;
  let blocked = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < toBlock.length; i++) {
    const account = toBlock[i];

    if (isDryRun) {
      await appendLog('info', `[DRY RUN] Would block @${account.handle}`);
      skipped++;
      // Send progress
      api.runtime.sendMessage({
        type: 'BLOCK_PROGRESS',
        current: i + 1,
        total: toBlock.length,
        handle: account.handle,
        status: 'skipped',
      }).catch(() => {}); // popup may be closed
      continue;
    }

    try {
      // Send block command to the content script
      const result = await api.tabs.sendMessage(tabId, {
        type: 'BLOCK_USER',
        handle: account.handle,
      });

      if (result?.success) {
        blocked++;
        await addBlockedHandles([account.handle]);
        await appendLog('success', `Blocked @${account.handle}`);
      } else {
        failed++;
        await appendLog('error', `Failed to block @${account.handle}: ${result?.error || 'unknown error'}`);
      }
    } catch (err) {
      failed++;
      await appendLog('error', `Error blocking @${account.handle}: ${err.message}`);
    }

    // Send progress update
    api.runtime.sendMessage({
      type: 'BLOCK_PROGRESS',
      current: i + 1,
      total: toBlock.length,
      handle: account.handle,
      status: blocked > failed ? 'success' : 'error',
    }).catch(() => {});

    // Rate-limit: pause between blocks to avoid Twitter rate limits
    if (!isDryRun && i < toBlock.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  await appendLog('info',
    `${isDryRun ? '[DRY RUN] ' : ''}Done. Blocked: ${blocked}, Failed: ${failed}, Skipped: ${skipped}`
  );

  return { blocked, failed, skipped, total: toBlock.length };
}

/**
 * Check if the user has an active Twitter session by looking for cookies.
 */
async function checkTwitterSession() {
  try {
    const cookies = await api.cookies.getAll({ domain: '.x.com' });
    const authCookie = cookies.find(c => c.name === 'auth_token' || c.name === 'ct0');

    if (authCookie) {
      return { connected: true };
    }

    // Also check twitter.com domain
    const twitterCookies = await api.cookies.getAll({ domain: '.twitter.com' });
    const twitterAuth = twitterCookies.find(c => c.name === 'auth_token' || c.name === 'ct0');

    if (twitterAuth) {
      return { connected: true };
    }

    return { connected: false };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}
