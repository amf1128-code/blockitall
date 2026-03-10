// Popup script — UI logic for the extension popup

import {
  getApiUrl,
  setApiUrl,
  getSubscriptions,
  subscribe,
  unsubscribe,
  getSyncedAccounts,
  getBlockedHandles,
  getLog,
  clearLog,
  clearAllData,
  appendLog,
} from './storage.js';

// DOM Elements
const connectionStatus = document.getElementById('connection-status');
const connectionText = document.getElementById('connection-text');
const setupSection = document.getElementById('setup-section');
const mainContent = document.getElementById('main-content');
const apiUrlInput = document.getElementById('api-url-input');
const saveApiUrlBtn = document.getElementById('save-api-url');
const apiUrlError = document.getElementById('api-url-error');
const listsContainer = document.getElementById('lists-container');
const refreshListsBtn = document.getElementById('refresh-lists');
const blockControls = document.getElementById('block-controls');
const syncStatus = document.getElementById('sync-status');
const syncBtn = document.getElementById('sync-btn');
const blockBtn = document.getElementById('block-btn');
const dryRunToggle = document.getElementById('dry-run-toggle');
const progressSection = document.getElementById('progress-section');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const logContainer = document.getElementById('log-container');
const clearLogBtn = document.getElementById('clear-log');
const settingsApiUrl = document.getElementById('settings-api-url');
const updateApiUrlBtn = document.getElementById('update-api-url');
const clearDataBtn = document.getElementById('clear-data');
const versionEl = document.getElementById('version');

// Set version
const manifest = chrome.runtime.getManifest();
versionEl.textContent = `v${manifest.version}`;

// Initialize popup
async function init() {
  await checkTwitterConnection();
  const apiUrl = await getApiUrl();

  if (!apiUrl) {
    setupSection.classList.remove('hidden');
    mainContent.classList.add('hidden');
  } else {
    setupSection.classList.add('hidden');
    mainContent.classList.remove('hidden');
    settingsApiUrl.value = apiUrl;
    await loadLists();
    await updateSyncStatus();
    await renderLog();
  }
}

// Check Twitter connection
async function checkTwitterConnection() {
  connectionStatus.className = 'status-bar checking';
  connectionText.textContent = 'Checking Twitter connection...';

  try {
    const result = await chrome.runtime.sendMessage({ type: 'CHECK_TWITTER_SESSION' });
    if (result.connected) {
      connectionStatus.className = 'status-bar connected';
      connectionText.textContent = 'Connected to Twitter/X';
    } else {
      connectionStatus.className = 'status-bar disconnected';
      connectionText.textContent = 'Not connected — open x.com and log in';
    }
  } catch {
    connectionStatus.className = 'status-bar disconnected';
    connectionText.textContent = 'Not connected — open x.com and log in';
  }
}

// Load and render available lists from the API
async function loadLists() {
  listsContainer.innerHTML = '<p class="muted">Loading lists...</p>';

  try {
    const lists = await chrome.runtime.sendMessage({ type: 'FETCH_LISTS' });

    if (lists.error) {
      listsContainer.innerHTML = `<p class="error">${lists.error}</p>`;
      return;
    }

    if (!lists.length) {
      listsContainer.innerHTML = '<p class="muted">No public lists available</p>';
      return;
    }

    const subs = await getSubscriptions();
    listsContainer.innerHTML = '';

    for (const list of lists) {
      const isSubscribed = !!subs[list.slug];
      const card = document.createElement('div');
      card.className = 'list-card';
      card.innerHTML = `
        <div class="list-card-header">
          <span class="list-name">${escapeHtml(list.name)}</span>
          <span class="list-count">${list.account_count} accounts</span>
        </div>
        ${list.description ? `<div class="list-description">${escapeHtml(list.description)}</div>` : ''}
        <div class="list-actions">
          <button class="btn btn-sm ${isSubscribed ? 'btn-unsubscribe' : 'btn-subscribe'}"
                  data-slug="${escapeHtml(list.slug)}"
                  data-action="${isSubscribed ? 'unsubscribe' : 'subscribe'}"
                  data-list='${JSON.stringify(list).replace(/'/g, '&#39;')}'>
            ${isSubscribed ? 'Unsubscribe' : 'Subscribe'}
          </button>
        </div>
      `;
      listsContainer.appendChild(card);
    }

    // Show block controls if any subscriptions
    if (Object.keys(subs).length > 0) {
      blockControls.classList.remove('hidden');
    }
  } catch (err) {
    listsContainer.innerHTML = `<p class="error">Failed to load lists: ${err.message}</p>`;
  }
}

// Update sync status display
async function updateSyncStatus() {
  const subs = await getSubscriptions();
  const synced = await getSyncedAccounts();
  const blocked = await getBlockedHandles();
  const slugs = Object.keys(subs);

  if (slugs.length === 0) {
    syncStatus.textContent = 'No lists subscribed';
    syncBtn.disabled = true;
    blockBtn.disabled = true;
    blockControls.classList.add('hidden');
    return;
  }

  blockControls.classList.remove('hidden');
  syncBtn.disabled = false;

  let totalAccounts = 0;
  for (const slug of slugs) {
    totalAccounts += (synced[slug] || []).length;
  }

  const unblockedCount = totalAccounts - blocked.size;
  syncStatus.textContent = `${slugs.length} list(s) subscribed · ${totalAccounts} accounts synced · ${unblockedCount > 0 ? unblockedCount : 0} to block`;
  blockBtn.disabled = unblockedCount <= 0;
}

// Render log entries
async function renderLog() {
  const log = await getLog();

  if (log.length === 0) {
    logContainer.innerHTML = '<p class="muted">No activity yet</p>';
    return;
  }

  logContainer.innerHTML = '';
  // Show most recent first
  for (const entry of log.slice().reverse()) {
    const div = document.createElement('div');
    div.className = `log-entry ${entry.level}`;
    const time = new Date(entry.timestamp).toLocaleTimeString();
    div.textContent = `[${time}] ${entry.message}`;
    logContainer.appendChild(div);
  }
}

// Event: Save API URL (initial setup)
saveApiUrlBtn.addEventListener('click', async () => {
  const url = apiUrlInput.value.trim();
  if (!url) {
    showError(apiUrlError, 'Please enter your API URL');
    return;
  }

  try {
    new URL(url);
  } catch {
    showError(apiUrlError, 'Invalid URL format');
    return;
  }

  await setApiUrl(url);
  await appendLog('info', 'API URL configured');
  setupSection.classList.add('hidden');
  mainContent.classList.remove('hidden');
  settingsApiUrl.value = url;
  await loadLists();
});

// Event: Update API URL (from settings)
updateApiUrlBtn.addEventListener('click', async () => {
  const url = settingsApiUrl.value.trim();
  if (!url) return;

  try {
    new URL(url);
  } catch {
    return;
  }

  await setApiUrl(url);
  await appendLog('info', 'API URL updated');
  await loadLists();
});

// Event: Refresh lists
refreshListsBtn.addEventListener('click', async () => {
  await loadLists();
  await updateSyncStatus();
});

// Event: Subscribe/unsubscribe click delegation
listsContainer.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const slug = btn.dataset.slug;

  if (action === 'subscribe') {
    const list = JSON.parse(btn.dataset.list);
    await subscribe(list);
    await appendLog('info', `Subscribed to ${list.name}`);
  } else {
    await unsubscribe(slug);
    await appendLog('info', `Unsubscribed from ${slug}`);
  }

  await loadLists();
  await updateSyncStatus();
  await renderLog();
});

// Event: Sync button
syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing...';

  try {
    const result = await chrome.runtime.sendMessage({ type: 'SYNC_SUBSCRIPTIONS' });
    if (result.error) {
      await appendLog('error', `Sync failed: ${result.error}`);
    }
  } catch (err) {
    await appendLog('error', `Sync error: ${err.message}`);
  }

  syncBtn.disabled = false;
  syncBtn.textContent = 'Sync Lists';
  await updateSyncStatus();
  await renderLog();
});

// Event: Block button
blockBtn.addEventListener('click', async () => {
  const isDryRun = dryRunToggle.checked;

  blockBtn.disabled = true;
  syncBtn.disabled = true;
  blockBtn.textContent = isDryRun ? 'Dry run...' : 'Blocking...';
  progressSection.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Starting...';

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'RUN_BLOCKS',
      dryRun: isDryRun,
    });

    if (result.error) {
      await appendLog('error', `Block failed: ${result.error}`);
    }
  } catch (err) {
    await appendLog('error', `Block error: ${err.message}`);
  }

  blockBtn.disabled = false;
  syncBtn.disabled = false;
  blockBtn.textContent = 'Block All';
  progressSection.classList.add('hidden');
  await updateSyncStatus();
  await renderLog();
});

// Listen for progress updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'BLOCK_PROGRESS') {
    const pct = Math.round((message.current / message.total) * 100);
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${message.current}/${message.total} — @${message.handle}`;
  }
});

// Event: Clear log
clearLogBtn.addEventListener('click', async () => {
  await clearLog();
  await renderLog();
});

// Event: Clear all data
clearDataBtn.addEventListener('click', async () => {
  if (confirm('This will clear all extension data including subscriptions and blocked accounts. Continue?')) {
    await clearAllData();
    await appendLog('info', 'All data cleared');
    location.reload();
  }
});

// Helpers
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// Boot
init();
