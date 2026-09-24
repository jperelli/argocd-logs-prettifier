const toggleBtn = document.getElementById('toggle-site');
const toggleLabel = document.getElementById('toggle-label');
const toggleIcon = toggleBtn.querySelector('.icon');
const siteEl = document.getElementById('site');
const statusEl = document.getElementById('status');
const aboutEl = document.getElementById('about');

document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

let pattern = null;
let enabled = false;

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let origin = null;
  try {
    const url = new URL(tab?.url || '');
    if (url.protocol === 'http:' || url.protocol === 'https:') origin = url.origin;
  } catch (e) {
    /* no usable url */
  }
  if (!origin) {
    siteEl.textContent = 'Not available on this page';
    toggleBtn.disabled = true;
    return;
  }
  pattern = origin + '/*';
  siteEl.textContent = origin.replace(/^https?:\/\//, '');
  const { origins = [] } = await chrome.storage.sync.get('origins');
  enabled = origins.includes(pattern);
  renderToggle();
  toggleBtn.disabled = false;
}

function renderToggle() {
  toggleBtn.classList.toggle('danger', enabled);
  toggleIcon.textContent = enabled ? '×' : '+';
  toggleLabel.textContent = enabled ? 'Disable on this site' : 'Enable on this site';
}

toggleBtn.addEventListener('click', () => {
  if (!pattern) return;
  statusEl.textContent = '';
  if (enabled) {
    disableSite();
  } else {
    // permissions.request must run before any await, or the click gesture is lost
    chrome.permissions.request({ origins: [pattern] }).then(enableSite, (e) => {
      statusEl.textContent = e.message;
    });
  }
});

async function enableSite(granted) {
  if (!granted) {
    statusEl.textContent = 'Permission not granted, the site was not enabled.';
    return;
  }
  const { origins = [] } = await chrome.storage.sync.get('origins');
  if (!origins.includes(pattern)) await chrome.storage.sync.set({ origins: [...origins, pattern] });
  enabled = true;
  renderToggle();
  statusEl.style.color = '#1a7f37';
  statusEl.textContent = 'Enabled. Open a pod’s Logs tab to see it.';
}

async function disableSite() {
  const { origins = [] } = await chrome.storage.sync.get('origins');
  await chrome.storage.sync.set({ origins: origins.filter((o) => o !== pattern) });
  await chrome.permissions.remove({ origins: [pattern] }).catch(() => {});
  enabled = false;
  renderToggle();
  statusEl.style.color = '';
  statusEl.textContent = 'Disabled on this site. Reload the page to restore the original logs.';
}

document.getElementById('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

document.getElementById('about-btn').addEventListener('click', () => {
  aboutEl.hidden = !aboutEl.hidden;
});

init();
