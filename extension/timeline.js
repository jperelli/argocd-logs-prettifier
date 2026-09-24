(function (root) {
  'use strict';

  const api = root.ArgoLogsPrettifier;
  const ORDER = ['none', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  const COLORS = { none: '#c5ccd3', trace: '#a0aab4', debug: '#7c8ea3', info: '#1f8bd6', warn: '#e39b16', error: '#d9363e', fatal: '#7a0d12' };
  const STEPS = [100, 200, 500, 1e3, 2e3, 5e3, 10e3, 15e3, 30e3, 60e3, 120e3, 300e3, 600e3, 900e3, 1800e3, 3600e3, 7200e3, 4 * 3600e3, 6 * 3600e3, 12 * 3600e3, 86400e3];
  const TARGET_BUCKETS = 120;
  const HEIGHT = 48;
  const HANDLE_PX = 6;
  const NO_DATA = "No timestamps in these lines. Turn on Argo CD's timestamps (clock button) to see the timeline.";

  const pad = (n) => String(n).padStart(2, '0');
  function fmtTime(ms, step) {
    const d = new Date(ms);
    const hms = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    if (step >= 3600e3) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hms.slice(0, 5)}`;
    if (step < 1000) return `${hms}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    return hms;
  }
  function fmtStep(step) {
    if (step < 1000) return `${step} ms`;
    if (step < 60e3) return `${step / 1e3} s`;
    if (step < 3600e3) return `${step / 60e3} min`;
    return `${step / 3600e3} h`;
  }
  const fmtCount = (n) => n.toLocaleString();

  class Timeline {
    constructor(container, { onRange }) {
      this.onRange = onRange;
      this.hist = null;
      this.range = null;
      this.drag = null;
      this.hover = null;

      this.el = document.createElement('div');
      this.el.className = 'ajl-timeline';
      this.canvas = document.createElement('canvas');
      this.canvas.height = HEIGHT;
      this.el.appendChild(this.canvas);
      this.caption = document.createElement('div');
      this.caption.className = 'ajl-timeline-caption';
      this.captionText = document.createElement('span');
      this.caption.appendChild(this.captionText);
      this.clearBtn = document.createElement('button');
      this.clearBtn.type = 'button';
      this.clearBtn.className = 'ajl-btn';
      this.clearBtn.textContent = 'Clear selection';
      this.clearBtn.hidden = true;
      this.clearBtn.addEventListener('click', () => this.commit(null));
      this.caption.appendChild(this.clearBtn);
      this.el.appendChild(this.caption);
      this.warn = document.createElement('div');
      this.warn.className = 'ajl-timeline-warn';
      this.warn.hidden = true;
      this.el.appendChild(this.warn);
      container.appendChild(this.el);
      this.ctx = this.canvas.getContext('2d');

      new ResizeObserver(() => this.draw()).observe(this.el);
      const c = this.canvas;
      c.addEventListener('pointerdown', (e) => this.onDown(e));
      c.addEventListener('pointermove', (e) => this.onMove(e));
      c.addEventListener('pointerup', (e) => this.onUp(e));
      c.addEventListener('pointercancel', () => {
        this.drag = null;
        this.draw();
      });
      c.addEventListener('pointerleave', () => {
        if (this.drag) return;
        this.hover = null;
        this.updateCaption();
        this.draw();
      });
      c.addEventListener('dblclick', () => this.commit(null));
    }

    // recs: array of { ts, level }; only those with a timestamp count
    update(recs, totalLines) {
      const few = totalLines > 0 && recs.length < totalLines * 0.5;
      this.warn.hidden = !few || !recs.length;
      if (few && recs.length) this.warn.textContent = `Only ${fmtCount(recs.length)} of ${fmtCount(totalLines)} lines have a timestamp. Turn on Argo CD's timestamps (clock button) for a complete timeline.`;
      let min = Infinity;
      let max = -Infinity;
      for (const r of recs) {
        if (r.ts == null) continue;
        if (r.ts < min) min = r.ts;
        if (r.ts > max) max = r.ts;
      }
      if (!Number.isFinite(min)) {
        this.hist = null;
        if (this.range) this.commit(null);
      } else {
        const span = Math.max(1, max - min);
        const step = STEPS.find((s) => span / s <= TARGET_BUCKETS) || STEPS[STEPS.length - 1];
        const start = Math.floor(min / step) * step;
        const n = Math.floor((max - start) / step) + 1;
        const counts = {};
        for (const lvl of ORDER) counts[lvl] = new Uint32Array(n);
        const total = new Uint32Array(n);
        let peak = 0;
        for (const r of recs) {
          if (r.ts == null) continue;
          const i = ((r.ts - start) / step) | 0;
          counts[r.level][i]++;
          if (++total[i] > peak) peak = total[i];
        }
        this.hist = { start, step, n, end: start + n * step, counts, total, peak };
      }
      this.updateCaption();
      this.draw();
    }

    xOf(t) {
      const h = this.hist;
      return ((t - h.start) / (h.end - h.start)) * this.width();
    }
    tOf(x) {
      const h = this.hist;
      return h.start + (x / this.width()) * (h.end - h.start);
    }
    width() {
      return this.el.clientWidth || 1;
    }
    snapDown(t) {
      const h = this.hist;
      return Math.min(h.end - h.step, Math.max(h.start, Math.floor((t - h.start) / h.step) * h.step + h.start));
    }
    snapUp(t) {
      const h = this.hist;
      return Math.max(h.start + h.step, Math.min(h.end, Math.ceil((t - h.start) / h.step) * h.step + h.start));
    }

    hitMode(x) {
      if (!this.range) return 'new';
      const x0 = this.xOf(this.range[0]);
      const x1 = this.xOf(this.range[1]);
      if (Math.abs(x - x0) <= HANDLE_PX) return 'left';
      if (Math.abs(x - x1) <= HANDLE_PX) return 'right';
      if (x > x0 && x < x1) return 'move';
      return 'new';
    }

    onDown(e) {
      if (!this.hist || e.button !== 0) return;
      const x = e.offsetX;
      const mode = this.hitMode(x);
      const t = this.snapDown(this.tOf(x));
      this.drag = { mode, startX: x, origin: this.range ? [...this.range] : null, range: mode === 'new' ? [t, t + this.hist.step] : [...this.range], moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }

    onMove(e) {
      if (!this.hist) return;
      const x = e.offsetX;
      const h = this.hist;
      if (!this.drag) {
        const mode = this.hitMode(x);
        this.canvas.style.cursor = mode === 'move' ? 'grab' : mode === 'new' ? 'crosshair' : 'ew-resize';
        const i = Math.min(h.n - 1, Math.max(0, Math.floor((this.tOf(x) - h.start) / h.step)));
        if (i !== this.hover) {
          this.hover = i;
          this.updateCaption();
          this.draw();
        }
        return;
      }
      const d = this.drag;
      d.moved = true;
      if (d.mode === 'new') {
        const a = this.tOf(d.startX);
        const b = this.tOf(x);
        d.range = [this.snapDown(Math.min(a, b)), this.snapUp(Math.max(a, b))];
      } else if (d.mode === 'left') {
        d.range[0] = Math.min(this.snapDown(this.tOf(x)), d.range[1] - h.step);
      } else if (d.mode === 'right') {
        d.range[1] = Math.max(this.snapUp(this.tOf(x)), d.range[0] + h.step);
      } else {
        const len = d.origin[1] - d.origin[0];
        let dt = Math.round((this.tOf(x) - this.tOf(d.startX)) / h.step) * h.step;
        dt = Math.max(h.start - d.origin[0], Math.min(h.end - d.origin[1], dt));
        d.range = [d.origin[0] + dt, d.origin[0] + dt + len];
      }
      this.canvas.style.cursor = d.mode === 'move' ? 'grabbing' : d.mode === 'new' ? 'crosshair' : 'ew-resize';
      this.updateCaption();
      this.draw();
    }

    onUp(e) {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      this.canvas.releasePointerCapture(e.pointerId);
      if (!d.moved && d.mode === 'new') this.commit(this.range ? null : d.range);
      else this.commit(d.range);
    }

    commit(range) {
      const changed = JSON.stringify(range) !== JSON.stringify(this.range);
      this.range = range;
      this.updateCaption();
      this.draw();
      if (changed) this.onRange(range);
    }

    countIn(range) {
      const h = this.hist;
      let sum = 0;
      const i0 = Math.max(0, Math.round((range[0] - h.start) / h.step));
      const i1 = Math.min(h.n, Math.round((range[1] - h.start) / h.step));
      for (let i = i0; i < i1; i++) sum += h.total[i];
      return sum;
    }

    updateCaption() {
      const h = this.hist;
      const sel = this.drag ? this.drag.range : this.range;
      this.clearBtn.hidden = !this.range;
      if (!h) {
        this.captionText.textContent = '';
        return;
      }
      let text;
      if (this.hover != null && !this.drag) {
        const i = this.hover;
        const t = h.start + i * h.step;
        const parts = [];
        for (const lvl of ['warn', 'error', 'fatal']) if (h.counts[lvl][i]) parts.push(`${h.counts[lvl][i]} ${lvl}`);
        text = `${fmtTime(t, h.step)} – ${fmtTime(t + h.step, h.step)} · ${fmtCount(h.total[i])} lines${parts.length ? ` (${parts.join(', ')})` : ''}`;
      } else if (sel) {
        text = `${this.drag ? 'Selecting' : 'Showing'} ${fmtTime(sel[0], h.step)} – ${fmtTime(sel[1], h.step)} · ${fmtCount(this.countIn(sel))} lines`;
      } else {
        text = `${fmtTime(h.start, h.step)} – ${fmtTime(h.end, h.step)} · ${h.n} buckets of ${fmtStep(h.step)} · drag to select`;
      }
      this.captionText.textContent = text;
    }

    draw() {
      const w = this.width();
      const dpr = window.devicePixelRatio || 1;
      const c = this.canvas;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(HEIGHT * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(HEIGHT * dpr);
      }
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, HEIGHT);
      const styles = getComputedStyle(this.el);
      const h = this.hist;
      if (!h) {
        ctx.fillStyle = styles.getPropertyValue('--ajl-muted').trim() || '#6b7785';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(NO_DATA, w / 2, HEIGHT / 2, w - 16);
        return;
      }
      const bw = w / h.n;
      const scale = (HEIGHT - 2) / Math.max(1, h.peak);
      for (let i = 0; i < h.n; i++) {
        let y = HEIGHT;
        for (const lvl of ORDER) {
          const cnt = h.counts[lvl][i];
          if (!cnt) continue;
          const bh = cnt * scale;
          ctx.fillStyle = COLORS[lvl];
          ctx.fillRect(i * bw + 0.5, y - bh, Math.max(1, bw - 1), bh);
          y -= bh;
        }
      }
      if (this.hover != null && !this.drag) {
        ctx.fillStyle = 'rgba(24, 190, 148, 0.18)';
        ctx.fillRect(this.hover * bw, 0, bw, HEIGHT);
      }
      const sel = this.drag ? this.drag.range : this.range;
      if (sel) {
        const x0 = this.xOf(sel[0]);
        const x1 = this.xOf(sel[1]);
        ctx.fillStyle = styles.getPropertyValue('--ajl-dim').trim() || 'rgba(255,255,255,0.65)';
        ctx.fillRect(0, 0, x0, HEIGHT);
        ctx.fillRect(x1, 0, w - x1, HEIGHT);
        ctx.fillStyle = '#18be94';
        ctx.fillRect(x0 - 1, 0, 2, HEIGHT);
        ctx.fillRect(x1 - 1, 0, 2, HEIGHT);
      }
    }
  }

  api.Timeline = Timeline;
})(window);
