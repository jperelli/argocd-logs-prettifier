const form = document.getElementById('add-form');
const input = document.getElementById('url');
const list = document.getElementById('list');
const status = document.getElementById('status');

function toPattern(value) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are supported');
  return `${url.origin}/*`;
}

async function load() {
  const { origins = [] } = await chrome.storage.sync.get('origins');
  list.replaceChildren();
  if (!origins.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No Argo CD instances configured yet.';
    list.appendChild(li);
    return;
  }
  for (const pattern of origins) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = pattern.replace(/\/\*$/, '');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      await chrome.storage.sync.set({ origins: origins.filter((o) => o !== pattern) });
      await chrome.permissions.remove({ origins: [pattern] }).catch(() => {});
      await load();
    });
    li.append(span, remove);
    list.appendChild(li);
  }
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  status.textContent = '';
  let pattern;
  try {
    pattern = toPattern(input.value);
  } catch (e) {
    status.textContent = e.message;
    return;
  }
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    status.textContent = 'Permission was not granted, the site was not added.';
    return;
  }
  const { origins = [] } = await chrome.storage.sync.get('origins');
  if (!origins.includes(pattern)) await chrome.storage.sync.set({ origins: [...origins, pattern] });
  input.value = '';
  await load();
});

load();
