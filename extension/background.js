const SCRIPT_ID = 'argocd-logs-prettifier';
const FILES = { js: ['parser.js', 'timeline.js', 'content.js'], css: ['styles.css'] };
const SITE_PATTERN = /^https?:\/\/[^*]+\/\*$/;

async function storedOrigins() {
  const { origins = [] } = await chrome.storage.sync.get('origins');
  return origins;
}

async function grantedOrigins() {
  const granted = new Set((await chrome.permissions.getAll()).origins || []);
  return (await storedOrigins()).filter((o) => granted.has(o));
}

// Chrome closes the popup when it shows the permission dialog, so the popup cannot
// reliably record the site itself: the granted permissions are the source of truth.
async function reconcileWithGranted() {
  const stored = await storedOrigins();
  const granted = ((await chrome.permissions.getAll()).origins || []).filter((o) => SITE_PATTERN.test(o));
  const missing = granted.filter((o) => !stored.includes(o));
  if (missing.length) await chrome.storage.sync.set({ origins: [...stored, ...missing] });
}

async function applyContentScripts() {
  const matches = await grantedOrigins();
  const [existing] = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (!matches.length) {
    if (existing) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  const script = { id: SCRIPT_ID, matches, js: FILES.js, css: FILES.css, runAt: 'document_idle', persistAcrossSessions: true };
  if (existing) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}

// install/startup and storage.onChanged can fire together; registrations must not overlap
let syncQueue = Promise.resolve();
function syncContentScripts() {
  syncQueue = syncQueue.then(applyContentScripts, applyContentScripts);
  return syncQueue;
}

async function injectIntoOpenTabs(patterns) {
  if (!patterns.length) return;
  const tabs = await chrome.tabs.query({ url: patterns });
  for (const tab of tabs) {
    if (!tab.id) continue;
    const target = { tabId: tab.id };
    const [{ result: already } = {}] = await chrome.scripting
      .executeScript({ target, func: () => Boolean(window.ArgoLogsPrettifier) })
      .catch(() => [{}]);
    if (already) continue;
    await chrome.scripting.insertCSS({ target, files: FILES.css }).catch(() => {});
    await chrome.scripting.executeScript({ target, files: FILES.js }).catch(() => {});
  }
}

async function start() {
  await reconcileWithGranted();
  await syncContentScripts();
}

chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);

chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  const added = origins.filter((o) => SITE_PATTERN.test(o));
  if (!added.length) return;
  const stored = await storedOrigins();
  const next = [...stored, ...added.filter((o) => !stored.includes(o))];
  if (next.length !== stored.length) await chrome.storage.sync.set({ origins: next });
});

chrome.permissions.onRemoved.addListener(async ({ origins = [] }) => {
  const stored = await storedOrigins();
  const next = stored.filter((o) => !origins.includes(o));
  if (next.length !== stored.length) await chrome.storage.sync.set({ origins: next });
  else await syncContentScripts();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync' || !changes.origins) return;
  await syncContentScripts();
  await injectIntoOpenTabs(await grantedOrigins());
});
