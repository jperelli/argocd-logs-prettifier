(function () {
  'use strict';

  const { parseLine, formatTime, toMillis, LEVELS, Timeline } = window.ArgoLogsPrettifier;
  const STORAGE_KEY = 'ajlEnabled';
  const ALL_LEVELS = [...LEVELS, 'none'];
  const RENDER_INTERVAL_MS = 250;
  const WINDOW_STEP = 1000;

  const state = {
    enabled: true,
    search: '',
    levels: new Set(ALL_LEVELS),
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
    // content key -> { key, line, row, detail, text, pod, parsed, level, visible }
    recs: new Map(),
    byLine: new WeakMap(),
    textCounts: new Map(),
    lineCount: 0,
    lastTs: null,
    timeRange: null,
    timeline: null,
    windowSize: WINDOW_STEP,
    mounted: 0,
    hidden: 0,
    moreEl: null,
    dirty: new Set(),
    appended: new Set(),
    structureChanged: true,
    filterChanged: true,
    counts: Object.fromEntries(ALL_LEVELS.map((l) => [l, 0])),
    shown: 0,
    structured: 0,
    emptyEl: null,
  };

  // exposed on the panel as data-perf for scripts/perf.js
  const stats = { renders: 0, totalMs: 0, maxMs: 0, lines: 0, walks: 0, appends: 0 };
  window.ArgoLogsPrettifier.stats = stats;

  chrome.storage.local.get(STORAGE_KEY, (res) => {
    if (res[STORAGE_KEY] === false) state.enabled = false;
    attach();
  });

  const bodyObserver = new MutationObserver((muts) => {
    // our own panel writes must not re-trigger attach(), that would loop
    if (state.panel && muts.every((m) => state.panel.contains(m.target))) return;
    scheduleAttach();
  });
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
      if (viewer) {
        mountPanel(viewer);
        applyEnabled();
      }
    }
  }

  function detachViewer() {
    if (state.lineObserver) state.lineObserver.disconnect();
    state.lineObserver = null;
    if (state.panel && state.panel.parentNode) state.panel.remove();
    if (state.viewer) state.viewer.classList.remove('ajl-on');
    state.panel = null;
    state.rowsEl = null;
    state.viewer = null;
    state.recs = new Map();
    state.byLine = new WeakMap();
    state.textCounts = new Map();
    state.lineCount = 0;
    state.lastTs = null;
    state.timeRange = null;
    state.timeline = null;
    state.windowSize = WINDOW_STEP;
    state.mounted = 0;
    state.hidden = 0;
    state.moreEl = null;
    state.dirty = new Set();
    state.appended = new Set();
    state.structureChanged = true;
    state.filterChanged = true;
    for (const l of ALL_LEVELS) state.counts[l] = 0;
    state.shown = 0;
    state.structured = 0;
    state.emptyEl = null;
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
    if (state.enabled) {
      // mutations were ignored while disabled, so start over from the DOM
      state.structureChanged = true;
      state.filterChanged = true;
      scheduleRender();
    }
  }

  function setFilterChanged() {
    state.filterChanged = true;
    state.structureChanged = true;
    scheduleRender();
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
      setFilterChanged();
    });
    toolbar.appendChild(search);

    for (const lvl of ALL_LEVELS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `ajl-chip ajl-chip-${lvl} ajl-active`;
      chip.dataset.level = lvl;
      chip.innerHTML = `${lvl === 'none' ? 'other' : lvl}<b>0</b>`;
      chip.addEventListener('click', (ev) => {
        if (ev.altKey || ev.metaKey || ev.ctrlKey) {
          const solo = state.levels.size === 1 && state.levels.has(lvl);
          state.levels = solo ? new Set(ALL_LEVELS) : new Set([lvl]);
        } else if (state.levels.has(lvl)) {
          state.levels.delete(lvl);
        } else {
          state.levels.add(lvl);
        }
        setFilterChanged();
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
      const recs = [...state.recs.values()].filter((r) => r.mounted);
      const allOpen = recs.length && recs.every((r) => state.expanded.has(r.key));
      if (allOpen) state.expanded.clear();
      else for (const r of recs) state.expanded.add(r.key);
      for (const r of recs) syncOpen(r);
    });
    toolbar.appendChild(expandBtn);

    const statsEl = document.createElement('span');
    statsEl.className = 'ajl-stats';
    toolbar.appendChild(statsEl);

    const rows = document.createElement('div');
    rows.className = 'ajl-rows';

    const more = document.createElement('div');
    more.className = 'ajl-more';
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'ajl-btn';
    moreBtn.addEventListener('click', showEarlier);
    more.appendChild(moreBtn);
    rows.appendChild(more);
    new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) showEarlier();
    }, { root: rows }).observe(more);

    panel.appendChild(toolbar);
    state.timeline = new Timeline(panel, {
      onRange: (range) => {
        state.timeRange = range;
        setFilterChanged();
      },
    });
    panel.appendChild(rows);
    viewer.appendChild(panel);

    state.panel = panel;
    state.toolbarEl = toolbar;
    state.rowsEl = rows;
    state.moreEl = more;

    // Mutation records tell us which Argo lines changed. New lines appended at the
    // end (the normal follow case) are handled without touching the rest of the
    // list, which holds 10k+ lines when viewing a Deployment.
    state.lineObserver = new MutationObserver((muts) => {
      let relevant = false;
      for (const m of muts) {
        if (panel.contains(m.target)) continue;
        relevant = true;
        const line = lineOf(m.target);
        if (line) {
          state.dirty.add(line);
          continue;
        }
        if (m.type !== 'childList' || m.removedNodes.length) {
          state.structureChanged = true;
          continue;
        }
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.matches('div.noscroll')) state.appended.add(n);
          else state.structureChanged = true;
        }
      }
      if (!relevant || !state.enabled) return;
      state.followScroll = true;
      scheduleRender();
    });
    state.lineObserver.observe(viewer, { childList: true, subtree: true, characterData: true });
  }

  function lineOf(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return el ? el.closest('div.noscroll') : null;
  }

  function scheduleRender() {
    if (state.renderTimer) return;
    state.renderTimer = setTimeout(() => {
      state.renderTimer = null;
      render();
    }, RENDER_INTERVAL_MS);
  }

  function render() {
    if (!state.viewer || !state.enabled || !state.rowsEl) return;
    const t0 = performance.now();
    renderNow();
    const ms = performance.now() - t0;
    stats.renders++;
    stats.totalMs += ms;
    if (ms > stats.maxMs) stats.maxMs = ms;
    stats.lines = state.lineCount;
    state.panel.dataset.perf = JSON.stringify(stats);
  }

  function renderNow() {
    state.panel.classList.toggle('ajl-dark', state.viewer.classList.contains('pod-logs-viewer--inverted'));
    const container = state.rowsEl;
    const atBottom =
      state.followScroll &&
      (!container.firstChild || container.scrollTop + container.clientHeight >= container.scrollHeight - 4);
    state.followScroll = false;

    const dirty = state.dirty;
    const appended = state.appended;
    state.dirty = new Set();
    state.appended = new Set();
    let structure = state.structureChanged;
    state.structureChanged = false;

    if (!structure) {
      for (const line of dirty) {
        if (appended.has(line)) continue;
        const rec = state.byLine.get(line);
        if (!rec || !line.isConnected) {
          structure = true;
          break;
        }
        const { text, pod } = readLine(line);
        if (text !== rec.text || pod !== rec.pod) {
          structure = true;
          break;
        }
      }
    }
    if (!structure) {
      for (const line of appended) {
        if (!line.isConnected || !appendLine(line)) {
          structure = true;
          break;
        }
        stats.appends++;
      }
    }
    if (structure) {
      stats.walks++;
      walkAll();
    }

    for (const chip of state.toolbarEl.querySelectorAll('.ajl-chip')) {
      const lvl = chip.dataset.level;
      chip.querySelector('b').textContent = state.counts[lvl];
      chip.classList.toggle('ajl-active', state.levels.has(lvl));
    }
    state.toolbarEl.querySelector('.ajl-stats').textContent = `${state.shown} / ${state.lineCount} lines · ${state.structured} structured`;
    if (state.hidden !== state.lastHidden) {
      state.lastHidden = state.hidden;
      state.moreEl.hidden = !state.hidden;
      state.moreEl.firstChild.textContent = `Show ${Math.min(WINDOW_STEP, state.hidden)} earlier lines (${state.hidden} not shown)`;
    }

    if (atBottom) container.scrollTop = container.scrollHeight;
    state.timeline.update(timelineRecs(), state.lineCount);
  }

  function timelineRecs() {
    const out = [];
    for (const rec of state.recs.values()) if (rec.ts != null && isVisible(rec, true)) out.push(rec);
    return out;
  }

  function keyFor(pod, text, n) {
    return `${pod} ${n} ${text}`;
  }

  function appendLine(line) {
    const { text, pod } = readLine(line);
    const n = state.textCounts.get(text) || 0;
    const key = keyFor(pod, text, n);
    if (state.recs.has(key)) return false;
    state.textCounts.set(text, n + 1);
    const rec = createRec(key, line, text, pod);
    inheritTs(rec, state.lastTs);
    state.lastTs = rec.ts;
    state.lineCount++;
    if (rec.parsed.format !== 'raw') state.structured++;
    if (rec.visible) {
      state.shown++;
      mount(rec, null);
      while (state.mounted > state.windowSize) {
        unmount(state.moreEl.nextSibling._ajl);
        state.hidden++;
      }
    }
    if (state.emptyEl) {
      state.emptyEl.remove();
      state.emptyEl = null;
    }
    return true;
  }

  // Argo prints a timestamp only when it differs from the previous line's second;
  // the lines in between inherit it.
  function inheritTs(rec, prevTs) {
    if (rec.ts != null || prevTs == null || !rec.parsed.inheritTime) return;
    rec.ts = prevTs;
    rec.timeEl.textContent = formatTime(prevTs);
    rec.timeEl.classList.add('ajl-time-inherited');
    setVisible(rec, isVisible(rec));
  }

  function mount(rec, before) {
    state.rowsEl.insertBefore(rec.row, before);
    if (rec.detail) state.rowsEl.insertBefore(rec.detail, before);
    rec.mounted = true;
    state.mounted++;
  }

  function unmount(rec) {
    if (!rec.mounted) return;
    rec.row.remove();
    if (rec.detail) rec.detail.remove();
    rec.mounted = false;
    state.mounted--;
  }

  // Full pass: rows are keyed by content, so when Argo's tail rolls (every node's
  // text shifts by one line) rows are moved, not rebuilt, and expanded rows stay open.
  // Only the last windowSize visible rows are in the DOM; layout of 10k+ rows is what
  // made the page crawl.
  function walkAll() {
    const container = state.rowsEl;
    const lines = state.viewer.querySelectorAll(':scope > :not(.ajl-panel) div.noscroll');
    const refilter = state.filterChanged;
    state.filterChanged = false;

    const textCounts = new Map();
    const live = new Set();
    const order = [];
    for (const line of lines) {
      const { text, pod } = readLine(line);
      const n = textCounts.get(text) || 0;
      textCounts.set(text, n + 1);
      const key = keyFor(pod, text, n);
      live.add(key);
      order.push({ line, key, text, pod });
    }
    for (const [key, rec] of state.recs) {
      if (live.has(key)) continue;
      state.counts[rec.level]--;
      state.recs.delete(key);
      unmount(rec);
    }

    const visible = [];
    let structured = 0;
    let prevTs = null;
    for (let i = 0; i < order.length; i++) {
      const o = order[i];
      let rec = state.recs.get(o.key);
      if (!rec) {
        rec = createRec(o.key, o.line, o.text, o.pod);
        inheritTs(rec, prevTs);
      } else {
        rec.line = o.line;
        state.byLine.set(o.line, rec);
        if (refilter) {
          setVisible(rec, isVisible(rec));
          syncOpen(rec);
        }
      }
      if (rec.parsed.format !== 'raw') structured++;
      if (rec.ts != null) prevTs = rec.ts;
      if (rec.visible) visible.push(rec);
    }
    state.lastTs = prevTs;

    const start = Math.max(0, visible.length - state.windowSize);
    for (let i = 0; i < start; i++) unmount(visible[i]);

    let cursor = state.moreEl.nextSibling;
    const place = (node) => {
      if (node === cursor) cursor = cursor.nextSibling;
      else container.insertBefore(node, cursor);
    };
    for (let i = start; i < visible.length; i++) {
      const rec = visible[i];
      place(rec.row);
      if (rec.detail) place(rec.detail);
      rec.mounted = true;
    }
    while (cursor) {
      const next = cursor.nextSibling;
      cursor.remove();
      cursor = next;
    }
    state.mounted = visible.length - start;
    state.hidden = start;
    state.textCounts = textCounts;
    state.lineCount = order.length;
    state.shown = visible.length;
    state.structured = structured;

    if (state.emptyEl) {
      state.emptyEl.remove();
      state.emptyEl = null;
    }
    if (!order.length) {
      state.emptyEl = document.createElement('div');
      state.emptyEl.className = 'ajl-empty';
      state.emptyEl.textContent = 'No log lines yet.';
      container.appendChild(state.emptyEl);
    }
  }

  function showEarlier() {
    if (!state.hidden) return;
    state.windowSize += WINDOW_STEP;
    state.structureChanged = true;
    render();
  }
  function readLine(line) {
    const last = line.lastElementChild;
    const text = last ? last.textContent : line.textContent;
    const pod = line.children.length > 1 ? (line.firstElementChild.textContent || '').trim() : '';
    return { text, pod };
  }

  function createRec(key, line, text, pod) {
    const parsed = parseLine(text);
    const rec = { key, line, text, pod, parsed, level: parsed.level || 'none', row: document.createElement('div'), detail: null, visible: false, mounted: false, ts: toMillis(parsed.time), timeEl: null };
    rec.row._ajl = rec;
    rec.row.addEventListener('click', () => onRowClick(rec));
    state.recs.set(key, rec);
    state.byLine.set(line, rec);
    state.counts[rec.level]++;
    fillRow(rec);
    setVisible(rec, isVisible(rec));
    syncOpen(rec);
    return rec;
  }

  function isVisible(rec, ignoreTime) {
    if (!state.levels.has(rec.level)) return false;
    if (state.search && !matches(rec)) return false;
    if (ignoreTime || !state.timeRange) return true;
    return rec.ts != null && rec.ts >= state.timeRange[0] && rec.ts < state.timeRange[1];
  }

  function setVisible(rec, visible) {
    rec.visible = visible;
    if (!visible) unmount(rec);
  }

  function matches(rec) {
    const q = state.search;
    const p = rec.parsed;
    if (p.raw.toLowerCase().includes(q)) return true;
    if (p.message.toLowerCase().includes(q)) return true;
    if (p.logger && p.logger.toLowerCase().includes(q)) return true;
    if (rec.pod && rec.pod.toLowerCase().includes(q)) return true;
    return false;
  }

  function onRowClick(rec) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && rec.row.contains(sel.anchorNode)) return;
    if (state.expanded.has(rec.key)) state.expanded.delete(rec.key);
    else state.expanded.add(rec.key);
    syncOpen(rec);
  }

  function syncOpen(rec) {
    const open = state.expanded.has(rec.key);
    rec.row.classList.toggle('ajl-open', open);
    if (open && rec.visible) {
      if (!rec.detail) rec.detail = renderDetail(rec.parsed);
      if (rec.row.isConnected && rec.detail.previousSibling !== rec.row) rec.row.after(rec.detail);
    } else if (rec.detail) {
      rec.detail.remove();
      rec.detail = null;
    }
  }
  function fillRow(rec) {
    const p = rec.parsed;
    const lvl = rec.level;
    const row = rec.row;
    row.className = `ajl-row ajl-lvl-${lvl}${p.format === 'raw' ? ' ajl-raw' : ''}`;
    const frag = document.createDocumentFragment();

    const time = document.createElement('span');
    time.className = 'ajl-time';
    time.textContent = formatTime(p.time);
    if (p.time) time.title = p.time;
    rec.timeEl = time;
    frag.appendChild(time);

    const level = document.createElement('span');
    level.className = `ajl-level ajl-level-${lvl}`;
    level.textContent = lvl === 'none' ? '—' : lvl;
    if (p.levelRaw !== null && p.levelRaw !== undefined) level.title = String(p.levelRaw);
    frag.appendChild(level);

    if (rec.pod) {
      const pod = document.createElement('span');
      pod.className = 'ajl-logger';
      pod.textContent = rec.pod;
      pod.title = rec.pod;
      frag.appendChild(pod);
    }

    if (p.logger) {
      const logger = document.createElement('span');
      logger.className = 'ajl-logger';
      logger.textContent = p.logger;
      logger.title = p.logger;
      frag.appendChild(logger);
    }

    const msg = document.createElement('span');
    msg.className = 'ajl-msg';
    msg.textContent = p.message || (p.format === 'raw' ? '' : '(no message)');
    msg.title = p.message;
    frag.appendChild(msg);

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
      frag.appendChild(extras);
    }
    row.replaceChildren(frag);
  }

  function renderDetail(p) {
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
