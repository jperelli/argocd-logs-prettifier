(function () {
  'use strict';

  const { parseLine, formatTime, LEVELS } = window.ArgoJsonl;
  const STORAGE_KEY = 'ajlEnabled';

  const state = {
    enabled: true,
    search: '',
    levels: new Set([...LEVELS, 'none']),
    expanded: new Set(),
    wrap: false,
    followScroll: true,
    viewer: null,
    panel: null,
    rowsEl: null,
    toolbarEl: null,
    toggleBtn: null,
    lineObserver: null,
    renderTimer: null,
    entries: [],
  };

  chrome.storage.local.get(STORAGE_KEY, (res) => {
    if (res[STORAGE_KEY] === false) state.enabled = false;
    attach();
  });

  const bodyObserver = new MutationObserver(() => scheduleAttach());
  bodyObserver.observe(document.documentElement, { childList: true, subtree: true });

  let attachTimer = null;
  function scheduleAttach() {
    if (attachTimer) return;
    attachTimer = setTimeout(() => {
      attachTimer = null;
      attach();
    }, 150);
  }

  function attach() {
    const viewer = document.querySelector('.pod-logs-viewer');
    const settings = document.querySelector('.pod-logs-viewer__settings');

    if (settings && !settings.contains(state.toggleBtn)) {
      state.toggleBtn = document.createElement('button');
      state.toggleBtn.type = 'button';
      state.toggleBtn.className = 'ajl-toggle';
      state.toggleBtn.title = 'Toggle structured JSON log view';
      state.toggleBtn.textContent = '{ } JSON';
      state.toggleBtn.addEventListener('click', () => setEnabled(!state.enabled));
      settings.appendChild(state.toggleBtn);
      syncToggle();
    }

    if (viewer !== state.viewer) {
      detachViewer();
      state.viewer = viewer;
      if (viewer) mountPanel(viewer);
    }
    if (state.viewer) applyEnabled();
  }

  function detachViewer() {
    if (state.lineObserver) state.lineObserver.disconnect();
    state.lineObserver = null;
    if (state.panel && state.panel.parentNode) state.panel.remove();
    if (state.viewer) state.viewer.classList.remove('ajl-on');
    state.panel = null;
    state.rowsEl = null;
    state.viewer = null;
    state.entries = [];
  }

  function setEnabled(on) {
    state.enabled = on;
    chrome.storage.local.set({ [STORAGE_KEY]: on });
    syncToggle();
    applyEnabled();
  }

  function syncToggle() {
    if (state.toggleBtn) state.toggleBtn.classList.toggle('ajl-active', state.enabled);
  }

  function applyEnabled() {
    if (!state.viewer) return;
    state.viewer.classList.toggle('ajl-on', state.enabled);
    if (state.panel) state.panel.style.display = state.enabled ? '' : 'none';
    if (state.enabled) scheduleRender();
  }

  function mountPanel(viewer) {
    const panel = document.createElement('div');
    panel.className = 'ajl-panel';

    const toolbar = document.createElement('div');
    toolbar.className = 'ajl-toolbar';

    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Filter parsed rows (message, logger, fields)…';
    search.addEventListener('input', () => {
      state.search = search.value.trim().toLowerCase();
      scheduleRender();
    });
    toolbar.appendChild(search);

    for (const lvl of [...LEVELS, 'none']) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `ajl-chip ajl-chip-${lvl} ajl-active`;
      chip.dataset.level = lvl;
      chip.innerHTML = `${lvl === 'none' ? 'other' : lvl}<b>0</b>`;
      chip.addEventListener('click', (ev) => {
        if (ev.altKey || ev.metaKey || ev.ctrlKey) {
          const solo = state.levels.size === 1 && state.levels.has(lvl);
          state.levels = solo ? new Set([...LEVELS, 'none']) : new Set([lvl]);
        } else if (state.levels.has(lvl)) {
          state.levels.delete(lvl);
        } else {
          state.levels.add(lvl);
        }
        scheduleRender();
      });
      toolbar.appendChild(chip);
    }

    const wrapBtn = document.createElement('button');
    wrapBtn.type = 'button';
    wrapBtn.className = 'ajl-btn';
    wrapBtn.textContent = 'Wrap';
    wrapBtn.addEventListener('click', () => {
      state.wrap = !state.wrap;
      panel.classList.toggle('ajl-wrap', state.wrap);
    });
    toolbar.appendChild(wrapBtn);

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'ajl-btn';
    expandBtn.textContent = 'Expand all';
    expandBtn.addEventListener('click', () => {
      const allOpen = state.entries.length && state.entries.every((e) => state.expanded.has(e.key));
      state.expanded = allOpen ? new Set() : new Set(state.entries.map((e) => e.key));
      scheduleRender();
    });
    toolbar.appendChild(expandBtn);

    const stats = document.createElement('span');
    stats.className = 'ajl-stats';
    toolbar.appendChild(stats);

    const rows = document.createElement('div');
    rows.className = 'ajl-rows';

    panel.appendChild(toolbar);
    panel.appendChild(rows);
    viewer.appendChild(panel);

    state.panel = panel;
    state.toolbarEl = toolbar;
    state.rowsEl = rows;

    state.lineObserver = new MutationObserver((muts) => {
      if (muts.every((m) => state.panel.contains(m.target))) return;
      state.followScroll = true;
      scheduleRender();
    });
    state.lineObserver.observe(viewer, { childList: true, subtree: true, characterData: true });
  }

  function scheduleRender() {
    if (state.renderTimer) return;
    state.renderTimer = setTimeout(() => {
      state.renderTimer = null;
      render();
    }, 120);
  }

  function collectLines() {
    const out = [];
    const lines = state.viewer.querySelectorAll(':scope > :not(.ajl-panel) div.noscroll');
    lines.forEach((div, i) => {
      const last = div.lastElementChild;
      const text = last ? last.textContent : div.textContent;
      let pod = '';
      if (div.children.length > 1) pod = (div.firstElementChild.textContent || '').trim();
      out.push({ index: i, text, pod });
    });
    return out;
  }

  function render() {
    if (!state.viewer || !state.enabled || !state.rowsEl) return;
    const panel = state.panel;
    panel.classList.toggle('ajl-dark', state.viewer.classList.contains('pod-logs-viewer--inverted'));

    const lines = collectLines();
    const entries = lines.map((l) => {
      const parsed = parseLine(l.text);
      return { key: `${l.index}:${l.text}`, index: l.index, pod: l.pod, parsed };
    });
    state.entries = entries;

    const counts = {};
    for (const lvl of [...LEVELS, 'none']) counts[lvl] = 0;
    for (const e of entries) counts[e.parsed.level || 'none']++;
    state.toolbarEl.querySelectorAll('.ajl-chip').forEach((chip) => {
      const lvl = chip.dataset.level;
      chip.querySelector('b').textContent = counts[lvl];
      chip.classList.toggle('ajl-active', state.levels.has(lvl));
    });

    const wasAtBottom =
      state.followScroll && state.rowsEl.scrollTop + state.rowsEl.clientHeight >= state.rowsEl.scrollHeight - 4;
    state.followScroll = false;
    const frag = document.createDocumentFragment();
    let shown = 0;
    let parsedCount = 0;
    for (const e of entries) {
      if (e.parsed.format !== 'raw') parsedCount++;
      const lvl = e.parsed.level || 'none';
      if (!state.levels.has(lvl)) continue;
      if (state.search && !matches(e)) continue;
      shown++;
      frag.appendChild(renderRow(e));
      if (state.expanded.has(e.key)) frag.appendChild(renderDetail(e));
    }
    state.rowsEl.replaceChildren(frag);
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'ajl-empty';
      empty.textContent = 'No log lines yet.';
      state.rowsEl.appendChild(empty);
    }
    state.toolbarEl.querySelector('.ajl-stats').textContent = `${shown} / ${entries.length} lines · ${parsedCount} structured`;
    if (wasAtBottom) state.rowsEl.scrollTop = state.rowsEl.scrollHeight;
  }

  function matches(e) {
    const q = state.search;
    const p = e.parsed;
    if (p.raw.toLowerCase().includes(q)) return true;
    if (p.message.toLowerCase().includes(q)) return true;
    if (p.logger && p.logger.toLowerCase().includes(q)) return true;
    if (e.pod && e.pod.toLowerCase().includes(q)) return true;
    return false;
  }

  function renderRow(e) {
    const p = e.parsed;
    const lvl = p.level || 'none';
    const row = document.createElement('div');
    row.className = `ajl-row ajl-lvl-${lvl}${p.format === 'raw' ? ' ajl-raw' : ''}${state.expanded.has(e.key) ? ' ajl-open' : ''}`;
    row.dataset.key = e.key;

    const n = document.createElement('span');
    n.className = 'ajl-n';
    n.textContent = String(e.index + 1);
    row.appendChild(n);

    const time = document.createElement('span');
    time.className = 'ajl-time';
    time.textContent = formatTime(p.time);
    if (p.time) time.title = p.time;
    row.appendChild(time);

    const level = document.createElement('span');
    level.className = `ajl-level ajl-level-${lvl}`;
    level.textContent = lvl === 'none' ? '—' : lvl;
    if (p.levelRaw !== null && p.levelRaw !== undefined) level.title = String(p.levelRaw);
    row.appendChild(level);

    if (e.pod) {
      const pod = document.createElement('span');
      pod.className = 'ajl-logger';
      pod.textContent = e.pod;
      pod.title = e.pod;
      row.appendChild(pod);
    }

    if (p.logger) {
      const logger = document.createElement('span');
      logger.className = 'ajl-logger';
      logger.textContent = p.logger;
      logger.title = p.logger;
      row.appendChild(logger);
    }

    const msg = document.createElement('span');
    msg.className = 'ajl-msg';
    msg.textContent = p.message || (p.format === 'raw' ? '' : '(no message)');
    msg.title = p.message;
    row.appendChild(msg);

    const extraKeys = Object.keys(p.extras);
    if (extraKeys.length) {
      const extras = document.createElement('span');
      extras.className = 'ajl-extras';
      extraKeys.slice(0, 6).forEach((k, i) => {
        const key = document.createElement('span');
        key.className = 'ajl-k';
        key.textContent = (i ? ' ' : '') + k + '=';
        extras.appendChild(key);
        extras.appendChild(document.createTextNode(String(p.extras[k])));
      });
      if (extraKeys.length > 6) extras.appendChild(document.createTextNode(` +${extraKeys.length - 6}`));
      row.appendChild(extras);
    }

    row.addEventListener('click', () => {
      if (window.getSelection().toString()) return;
      if (state.expanded.has(e.key)) state.expanded.delete(e.key);
      else state.expanded.add(e.key);
      render();
    });
    return row;
  }

  function renderDetail(e) {
    const p = e.parsed;
    const wrap = document.createElement('div');
    wrap.className = 'ajl-detail';

    const actions = document.createElement('div');
    actions.className = 'ajl-detail-actions';
    const copyJson = document.createElement('button');
    copyJson.type = 'button';
    copyJson.className = 'ajl-btn';
    copyJson.textContent = p.record ? 'Copy JSON' : 'Copy';
    copyJson.addEventListener('click', (ev) => {
      ev.stopPropagation();
      navigator.clipboard.writeText(p.record ? JSON.stringify(p.record, null, 2) : p.raw);
      copyJson.textContent = 'Copied';
      setTimeout(() => (copyJson.textContent = p.record ? 'Copy JSON' : 'Copy'), 1200);
    });
    actions.appendChild(copyJson);
    if (p.record) {
      const copyRaw = document.createElement('button');
      copyRaw.type = 'button';
      copyRaw.className = 'ajl-btn';
      copyRaw.textContent = 'Copy raw';
      copyRaw.addEventListener('click', (ev) => {
        ev.stopPropagation();
        navigator.clipboard.writeText(p.raw);
      });
      actions.appendChild(copyRaw);
    }
    wrap.appendChild(actions);

    const pre = document.createElement('pre');
    if (p.record) appendJson(pre, p.record, 0);
    else pre.textContent = p.raw;
    wrap.appendChild(pre);
    return wrap;
  }

  function appendJson(parent, value, depth) {
    const indent = '  '.repeat(depth);
    const inner = '  '.repeat(depth + 1);
    if (Array.isArray(value)) {
      if (!value.length) return parent.appendChild(document.createTextNode('[]'));
      parent.appendChild(document.createTextNode('[\n'));
      value.forEach((v, i) => {
        parent.appendChild(document.createTextNode(inner));
        appendJson(parent, v, depth + 1);
        parent.appendChild(document.createTextNode(i < value.length - 1 ? ',\n' : '\n'));
      });
      return parent.appendChild(document.createTextNode(indent + ']'));
    }
    if (value !== null && typeof value === 'object') {
      const keys = Object.keys(value);
      if (!keys.length) return parent.appendChild(document.createTextNode('{}'));
      parent.appendChild(document.createTextNode('{\n'));
      keys.forEach((k, i) => {
        parent.appendChild(document.createTextNode(inner));
        const key = document.createElement('span');
        key.className = 'ajl-k';
        key.textContent = JSON.stringify(k);
        parent.appendChild(key);
        parent.appendChild(document.createTextNode(': '));
        appendJson(parent, value[k], depth + 1);
        parent.appendChild(document.createTextNode(i < keys.length - 1 ? ',\n' : '\n'));
      });
      return parent.appendChild(document.createTextNode(indent + '}'));
    }
    const span = document.createElement('span');
    if (typeof value === 'string') {
      span.className = 'ajl-s';
      span.textContent = JSON.stringify(value);
    } else if (typeof value === 'number') {
      span.className = 'ajl-num';
      span.textContent = String(value);
    } else {
      span.className = 'ajl-b';
      span.textContent = String(value);
    }
    return parent.appendChild(span);
  }
})();
