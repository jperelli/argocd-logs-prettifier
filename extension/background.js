const SCRIPT_ID = 'argocd-jsonl-logs';
const FILES = { js: ['parser.js', 'content.js'], css: ['styles.css'] };

async function grantedOrigins() {
  const { origins = [] } = await chrome.storage.sync.get('origins');
  const granted = new Set((await chrome.permissions.getAll()).origins || []);
  return origins.filter((o) => granted.has(o));
}

async function syncContentScripts() {
  const matches = await grantedOrigins();
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([
    { id: SCRIPT_ID, matches, js: FILES.js, css: FILES.css, runAt: 'document_idle', persistAcrossSessions: true },
  ]);
}

async function injectIntoOpenTabs(patterns) {
  if (!patterns.length) return;
  const tabs = await chrome.tabs.query({ url: patterns });
  for (const tab of tabs) {
    if (!tab.id) continue;
    const target = { tabId: tab.id };
    const [{ result: already } = {}] = await chrome.scripting
      .executeScript({ target, func: () => Boolean(window.ArgoJsonl) })
      .catch(() => [{}]);
    if (already) continue;
    await chrome.scripting.insertCSS({ target, files: FILES.css }).catch(() => {});
    await chrome.scripting.executeScript({ target, files: FILES.js }).catch(() => {});
  }
}

chrome.runtime.onInstalled.addListener(syncContentScripts);
chrome.runtime.onStartup.addListener(syncContentScripts);
chrome.permissions.onRemoved.addListener(syncContentScripts);
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync' || !changes.origins) return;
  await syncContentScripts();
  await injectIntoOpenTabs(await grantedOrigins());
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
