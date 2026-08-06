/* ==========================================================================
   lab.js — interactive artifact engine for science-notes
   No dependencies. Builds SVG plots, slider panels, and stat readouts.
   Usage:
     Lab.make({
       mount: '#my-widget',
       title: '...', badge: '...',
       controls: [ {id:'I', label:'전류 I', min:0.01, max:5, step:0.01, value:0.5, unit:'mA', fmt:v=>v.toFixed(2)} ],
       stats:    [ {id:'Q', label:'전하량 Q', unit:'C'} ],
       plot:     {xLabel:'t (s)', yLabel:'두께 (µm)', ...},
       compute:  (v) => ({ stats:{Q: ...}, series:[{points:[[x,y],...], color:'--accent'}] })
     });
   ========================================================================== */
(function (global) {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, kids) {
    const n = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(c =>
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  function h(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(c =>
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  const cssVar = name => name && name.startsWith('--')
    ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#c96442'
    : (name || '#c96442');

  /* ---------- number formatting ---------- */
  function sci(x, digits) {
    digits = digits == null ? 3 : digits;
    if (x === 0) return '0';
    if (!isFinite(x)) return '—';
    const a = Math.abs(x);
    if (a >= 1e5 || a < 1e-3) {
      const e = Math.floor(Math.log10(a));
      const m = x / Math.pow(10, e);
      return m.toFixed(digits - 1) + '×10' + supDigits(e);
    }
    if (a >= 100) return x.toFixed(Math.max(0, digits - 3));
    if (a >= 10) return x.toFixed(Math.max(0, digits - 2));
    if (a >= 1) return x.toFixed(digits - 1);
    return x.toFixed(digits);
  }
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function supDigits(n) { return String(n).split('').map(c => SUP[c] || c).join(''); }
  function eng(x, unit, digits) {
    const pfx = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
    const a = Math.abs(x);
    if (a === 0) return '0 ' + (unit || '');
    for (const [f, p] of pfx) if (a >= f) return (x / f).toFixed(digits == null ? 2 : digits) + ' ' + p + (unit || '');
    return sci(x, 3) + ' ' + (unit || '');
  }

  /* ==========================================================================
     Plot — a 2-D SVG plotter with linear/log axes
     ========================================================================== */
  function Plot(opt) {
    this.o = Object.assign({
      width: 620, height: 380,
      padL: 62, padR: 22, padT: 20, padB: 46,
      xLabel: 'x', yLabel: 'y',
      xLog: false, yLog: false,
      xMin: 0, xMax: 1, yMin: 0, yMax: 1,
      autoX: true, autoY: true,
      yInvert: false, equalAspect: false,
      xTicks: 6, yTicks: 5,
      grid: true
    }, opt || {});
    this.svg = el('svg', {
      viewBox: '0 0 ' + this.o.width + ' ' + this.o.height,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img'
    });
    this.gGrid = el('g'); this.gAx = el('g'); this.gData = el('g'); this.gOver = el('g');
    this.svg.appendChild(this.gGrid); this.svg.appendChild(this.gData);
    this.svg.appendChild(this.gAx); this.svg.appendChild(this.gOver);
  }
  Plot.prototype.node = function () { return this.svg; };
  Plot.prototype.plotW = function () { return this.o.width - this.o.padL - this.o.padR; };
  Plot.prototype.plotH = function () { return this.o.height - this.o.padT - this.o.padB; };
  Plot.prototype.sx = function (x) {
    const o = this.o;
    let t = o.xLog
      ? (Math.log10(Math.max(x, 1e-300)) - Math.log10(o.xMin)) / (Math.log10(o.xMax) - Math.log10(o.xMin))
      : (x - o.xMin) / (o.xMax - o.xMin);
    return o.padL + t * this.plotW();
  };
  Plot.prototype.sy = function (y) {
    const o = this.o;
    let t = o.yLog
      ? (Math.log10(Math.max(y, 1e-300)) - Math.log10(o.yMin)) / (Math.log10(o.yMax) - Math.log10(o.yMin))
      : (y - o.yMin) / (o.yMax - o.yMin);
    if (o.yInvert) t = 1 - t;
    return o.padT + (1 - t) * this.plotH();
  };
  Plot.prototype.invX = function (px) {
    const o = this.o, t = (px - o.padL) / this.plotW();
    return o.xLog ? Math.pow(10, Math.log10(o.xMin) + t * (Math.log10(o.xMax) - Math.log10(o.xMin)))
      : o.xMin + t * (o.xMax - o.xMin);
  };
  Plot.prototype.invY = function (py) {
    const o = this.o;
    let t = 1 - (py - o.padT) / this.plotH();
    if (o.yInvert) t = 1 - t;
    return o.yLog ? Math.pow(10, Math.log10(o.yMin) + t * (Math.log10(o.yMax) - Math.log10(o.yMin)))
      : o.yMin + t * (o.yMax - o.yMin);
  };

  function niceTicks(lo, hi, count) {
    if (!(isFinite(lo) && isFinite(hi)) || hi <= lo) return [lo];
    const raw = (hi - lo) / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const out = []; let v = Math.ceil(lo / step) * step;
    for (; v <= hi + step * 1e-9 && out.length < 60; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  function decadeTicks(lo, hi) {
    const out = [];
    for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)) + 1e-9; e++) out.push(Math.pow(10, e));
    return out.length ? out : [lo, hi];
  }

  Plot.prototype.setRange = function (r) { Object.assign(this.o, r); };

  Plot.prototype.autoscale = function (series) {
    const o = this.o;
    let xs = [], ys = [];
    series.forEach(s => (s.points || []).forEach(p => {
      if (isFinite(p[0]) && isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); }
    }));
    if (!xs.length) return;
    if (o.autoX) {
      let lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs);
      if (o.xLog) { lo = Math.max(lo, 1e-12); o.xMin = Math.pow(10, Math.floor(Math.log10(lo))); o.xMax = Math.pow(10, Math.ceil(Math.log10(hi))); }
      else { const pad = (hi - lo) * 0.04 || 1; o.xMin = lo - pad * 0; o.xMax = hi + pad * 0; }
    }
    if (o.autoY) {
      let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
      if (o.yLog) { lo = Math.max(lo, 1e-12); o.yMin = Math.pow(10, Math.floor(Math.log10(lo))); o.yMax = Math.pow(10, Math.ceil(Math.log10(hi))); }
      else {
        if (hi === lo) { hi = lo + 1; }
        const pad = (hi - lo) * 0.08;
        o.yMin = (o.yMinFixed != null) ? o.yMinFixed : lo - pad;
        o.yMax = hi + pad;
      }
    }
    if (o.equalAspect) {
      // keep x and y at the same units-per-pixel (used for Nyquist plots)
      const uxp = (o.xMax - o.xMin) / this.plotW();
      const uyp = (o.yMax - o.yMin) / this.plotH();
      const u = Math.max(uxp, uyp);
      const cx = (o.xMax + o.xMin) / 2, cy = (o.yMax + o.yMin) / 2;
      o.xMin = cx - u * this.plotW() / 2; o.xMax = cx + u * this.plotW() / 2;
      o.yMin = cy - u * this.plotH() / 2; o.yMax = cy + u * this.plotH() / 2;
      if (o.yMinFixed != null && o.yMin > o.yMinFixed) { const d = o.yMin - o.yMinFixed; o.yMin -= d; o.yMax -= d; }
    }
  };

  Plot.prototype.drawAxes = function () {
    const o = this.o, L = o.padL, T = o.padT, W = this.plotW(), H = this.plotH();
    this.gGrid.textContent = ''; this.gAx.textContent = '';
    const ink3 = cssVar('--ink-3'), rule = cssVar('--rule-2'), ink2 = cssVar('--ink-2');

    const xt = o.xLog ? decadeTicks(o.xMin, o.xMax) : niceTicks(o.xMin, o.xMax, o.xTicks);
    const yt = o.yLog ? decadeTicks(o.yMin, o.yMax) : niceTicks(o.yMin, o.yMax, o.yTicks);

    if (o.grid) {
      xt.forEach(v => this.gGrid.appendChild(el('line', {
        x1: this.sx(v), y1: T, x2: this.sx(v), y2: T + H, stroke: rule, 'stroke-width': 1
      })));
      yt.forEach(v => this.gGrid.appendChild(el('line', {
        x1: L, y1: this.sy(v), x2: L + W, y2: this.sy(v), stroke: rule, 'stroke-width': 1
      })));
    }
    // frame
    this.gAx.appendChild(el('line', { x1: L, y1: T + H, x2: L + W, y2: T + H, stroke: cssVar('--rule'), 'stroke-width': 1.2 }));
    this.gAx.appendChild(el('line', { x1: L, y1: T, x2: L, y2: T + H, stroke: cssVar('--rule'), 'stroke-width': 1.2 }));

    const fmtX = o.xTickFmt || (v => o.xLog ? '10' + supDigits(Math.round(Math.log10(v))) : sci(v, 3));
    const fmtY = o.yTickFmt || (v => o.yLog ? '10' + supDigits(Math.round(Math.log10(v))) : sci(v, 3));

    xt.forEach(v => {
      const x = this.sx(v);
      if (x < L - 1 || x > L + W + 1) return;
      this.gAx.appendChild(el('text', { x: x, y: T + H + 17, 'text-anchor': 'middle', class: 'tm', fill: ink3 }, fmtX(v)));
    });
    yt.forEach(v => {
      const y = this.sy(v);
      if (y < T - 1 || y > T + H + 1) return;
      this.gAx.appendChild(el('text', { x: L - 8, y: y + 4, 'text-anchor': 'end', class: 'tm', fill: ink3 }, fmtY(v)));
    });
    this.gAx.appendChild(el('text', { x: L + W / 2, y: o.height - 8, 'text-anchor': 'middle', class: 'ts', fill: ink2 }, o.xLabel));
    const yl = el('text', { x: 14, y: T + H / 2, 'text-anchor': 'middle', class: 'ts', fill: ink2, transform: 'rotate(-90 14 ' + (T + H / 2) + ')' }, o.yLabel);
    this.gAx.appendChild(yl);
  };

  Plot.prototype.path = function (points) {
    let d = '', pen = false;
    for (const p of points) {
      if (!isFinite(p[0]) || !isFinite(p[1])) { pen = false; continue; }
      const x = this.sx(p[0]), y = this.sy(p[1]);
      if (!isFinite(x) || !isFinite(y)) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
      pen = true;
    }
    return d;
  };

  Plot.prototype.render = function (series, overlays) {
    this.autoscale(series || []);
    this.drawAxes();
    this.gData.textContent = ''; this.gOver.textContent = '';
    const clip = 'clip' + Math.random().toString(36).slice(2, 8);
    const cp = el('clipPath', { id: clip }, el('rect', {
      x: this.o.padL, y: this.o.padT, width: this.plotW(), height: this.plotH()
    }));
    this.gData.appendChild(cp);
    const g = el('g', { 'clip-path': 'url(#' + clip + ')' });
    this.gData.appendChild(g);

    (series || []).forEach(s => {
      const col = cssVar(s.color || '--accent');
      if (s.type === 'area') {
        const pts = s.points.slice();
        const base = s.baseline == null ? this.o.yMin : s.baseline;
        let d = this.path(pts);
        if (d) {
          d += 'L' + this.sx(pts[pts.length - 1][0]).toFixed(2) + ' ' + this.sy(base).toFixed(2) +
            ' L' + this.sx(pts[0][0]).toFixed(2) + ' ' + this.sy(base).toFixed(2) + ' Z';
          g.appendChild(el('path', { d: d, fill: col, 'fill-opacity': s.opacity == null ? 0.14 : s.opacity, stroke: 'none' }));
        }
      }
      if (s.type === 'scatter') {
        s.points.forEach(p => {
          if (!isFinite(p[0]) || !isFinite(p[1])) return;
          g.appendChild(el('circle', {
            cx: this.sx(p[0]), cy: this.sy(p[1]), r: s.r || 3,
            fill: s.fill === false ? 'none' : col, stroke: col, 'stroke-width': 1.4
          }));
        });
      }
      if (s.type === 'bars') {
        const bw = s.barWidth || (this.plotW() / (s.points.length * 1.6));
        s.points.forEach(p => {
          const y0 = this.sy(Math.max(this.o.yMin, 0)), y1 = this.sy(p[1]);
          g.appendChild(el('rect', {
            x: this.sx(p[0]) - bw / 2, y: Math.min(y0, y1), width: bw, height: Math.abs(y1 - y0),
            fill: col, 'fill-opacity': s.opacity == null ? 0.75 : s.opacity
          }));
        });
      }
      if (!s.type || s.type === 'line') {
        const d = this.path(s.points || []);
        if (d) g.appendChild(el('path', {
          d: d, fill: 'none', stroke: col, 'stroke-width': s.width || 2,
          'stroke-dasharray': s.dash || '', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          'stroke-opacity': s.opacity == null ? 1 : s.opacity
        }));
      }
    });

    (overlays || []).forEach(ov => {
      const col = cssVar(ov.color || '--ink-3');
      if (ov.type === 'vline') {
        this.gOver.appendChild(el('line', {
          x1: this.sx(ov.x), y1: this.o.padT, x2: this.sx(ov.x), y2: this.o.padT + this.plotH(),
          stroke: col, 'stroke-width': 1.2, 'stroke-dasharray': ov.dash || '4 4'
        }));
        if (ov.label) this.gOver.appendChild(el('text', {
          x: this.sx(ov.x) + 5, y: this.o.padT + 13, class: 'tm', fill: col
        }, ov.label));
      }
      if (ov.type === 'hline') {
        this.gOver.appendChild(el('line', {
          x1: this.o.padL, y1: this.sy(ov.y), x2: this.o.padL + this.plotW(), y2: this.sy(ov.y),
          stroke: col, 'stroke-width': 1.2, 'stroke-dasharray': ov.dash || '4 4'
        }));
        if (ov.label) this.gOver.appendChild(el('text', {
          x: this.o.padL + 5, y: this.sy(ov.y) - 5, class: 'tm', fill: col, 'text-anchor': 'start'
        }, ov.label));
      }
      if (ov.type === 'point') {
        const px = this.sx(ov.x), py = this.sy(ov.y);
        this.gOver.appendChild(el('circle', {
          cx: px, cy: py, r: ov.r || 5, fill: cssVar(ov.color || '--accent'),
          stroke: cssVar('--panel'), 'stroke-width': 2
        }));
        if (ov.label) {
          // flip the label to the left when the point sits near the right edge
          const right = this.o.padL + this.plotW();
          const flip = px > right - 88;
          this.gOver.appendChild(el('text', {
            x: flip ? px - 9 : px + 9, y: py - 8, class: 'tm',
            'text-anchor': flip ? 'end' : 'start',
            fill: cssVar(ov.color || '--accent')
          }, ov.label));
        }
      }
      if (ov.type === 'text') {
        this.gOver.appendChild(el('text', {
          x: this.sx(ov.x), y: this.sy(ov.y), class: ov.cls || 'ts',
          fill: cssVar(ov.color || '--ink-2'), 'text-anchor': ov.anchor || 'start'
        }, ov.text));
      }
      if (ov.type === 'band') {
        const x1 = this.sx(ov.x1), x2 = this.sx(ov.x2);
        this.gOver.appendChild(el('rect', {
          x: Math.min(x1, x2), y: this.o.padT, width: Math.abs(x2 - x1), height: this.plotH(),
          fill: col, 'fill-opacity': ov.opacity == null ? 0.1 : ov.opacity
        }));
        if (ov.label) this.gOver.appendChild(el('text', {
          x: (x1 + x2) / 2, y: this.o.padT + 14, class: 'tm', fill: col, 'text-anchor': 'middle'
        }, ov.label));
      }
    });
  };

  /* legend as HTML under the plot */
  function legend(items) {
    const box = h('div', { class: 'btnrow', style: 'gap:16px;margin-top:8px;font-size:12px;color:var(--ink-2)' });
    items.forEach(it => {
      const sw = h('span', { style: 'display:inline-block;width:11px;height:3px;margin-right:6px;vertical-align:middle;background:' + cssVar(it.color) });
      const s = h('span', {}, [sw]);
      s.appendChild(document.createTextNode(it.label));
      box.appendChild(s);
    });
    return box;
  }

  /* ==========================================================================
     make() — build a full interactive panel
     ========================================================================== */
  function make(cfg) {
    const host = typeof cfg.mount === 'string' ? document.querySelector(cfg.mount) : cfg.mount;
    if (!host) { console.warn('Lab.make: mount not found', cfg.mount); return null; }

    const panel = h('div', { class: 'panel accent-top' });
    const hd = h('div', { class: 'panel-hd' }, [
      h('h4', {}, cfg.title || '인터랙티브'),
      h('span', {}, cfg.badge || 'INTERACTIVE')
    ]);
    panel.appendChild(hd);

    const bd = h('div', { class: 'panel-bd' });
    const layout = h('div', { class: cfg.plot === false ? 'lab-solo' : 'lab' });
    const left = h('div', {});
    const right = h('div', {});
    layout.appendChild(left);
    if (cfg.plot !== false) layout.appendChild(right);
    bd.appendChild(layout);
    panel.appendChild(bd);

    /* controls */
    const state = {};
    const outs = {};
    (cfg.controls || []).forEach(c => {
      state[c.id] = c.value;
      if (c.type === 'select') {
        const row = h('div', { class: 'ctl' });
        row.appendChild(h('label', { for: 'c_' + c.id }, c.label));
        const sel = h('select', { id: 'c_' + c.id });
        c.options.forEach(o => {
          const op = h('option', { value: o.value }, o.label);
          if (o.value === c.value) op.setAttribute('selected', 'selected');
          sel.appendChild(op);
        });
        sel.addEventListener('change', () => { state[c.id] = sel.value; update(); });
        row.appendChild(sel);
        left.appendChild(row);
      } else if (c.type === 'toggle') {
        const row = h('div', { class: 'btnrow' });
        c.options.forEach(o => {
          const b = h('button', { type: 'button' }, o.label);
          b.setAttribute('aria-pressed', String(o.value === c.value));
          b.addEventListener('click', () => {
            state[c.id] = o.value;
            Array.from(row.children).forEach(x => x.setAttribute('aria-pressed', 'false'));
            b.setAttribute('aria-pressed', 'true');
            update();
          });
          row.appendChild(b);
        });
        if (c.label) left.appendChild(h('div', { class: 'hint', style: 'margin:12px 0 4px' }, c.label));
        left.appendChild(row);
      } else {
        const row = h('div', { class: 'ctl' });
        row.appendChild(h('label', { for: 'c_' + c.id }, c.label));
        const inp = h('input', {
          type: 'range', id: 'c_' + c.id,
          min: c.log ? 0 : c.min, max: c.log ? 1000 : c.max,
          step: c.log ? 1 : (c.step || (c.max - c.min) / 100),
          value: c.log ? logPos(c.value, c.min, c.max) : c.value
        });
        const out = h('output', { for: 'c_' + c.id });
        outs[c.id] = { node: out, cfg: c };
        const setv = () => {
          const raw = parseFloat(inp.value);
          state[c.id] = c.log ? logVal(raw, c.min, c.max) : raw;
          out.textContent = fmtCtl(c, state[c.id]);
        };
        inp.addEventListener('input', () => { setv(); update(); });
        setv();
        row.appendChild(inp); row.appendChild(out);
        left.appendChild(row);
      }
    });

    function logPos(v, lo, hi) { return 1000 * (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)); }
    function logVal(p, lo, hi) { return Math.pow(10, Math.log10(lo) + (p / 1000) * (Math.log10(hi) - Math.log10(lo))); }
    function fmtCtl(c, v) {
      const s = c.fmt ? c.fmt(v) : sci(v, 3);
      return s + (c.unit ? ' ' + c.unit : '');
    }

    /* extra buttons (presets) */
    if (cfg.presets && cfg.presets.length) {
      const row = h('div', { class: 'btnrow' });
      cfg.presets.forEach(p => {
        const b = h('button', { type: 'button' }, p.label);
        b.addEventListener('click', () => {
          Object.assign(state, p.set);
          (cfg.controls || []).forEach(c => {
            if (!(c.id in p.set)) return;
            const inp = left.querySelector('#c_' + c.id);
            if (!inp) return;
            if (c.type === 'select') inp.value = p.set[c.id];
            else { inp.value = c.log ? logPos(p.set[c.id], c.min, c.max) : p.set[c.id]; }
            if (outs[c.id]) outs[c.id].node.textContent = fmtCtl(c, p.set[c.id]);
          });
          update();
        });
        row.appendChild(b);
      });
      left.appendChild(row);
    }

    if (cfg.note) left.appendChild(h('p', { class: 'hint', html: cfg.note }));

    /* plot */
    let plot = null;
    if (cfg.plot !== false) {
      plot = new Plot(cfg.plot || {});
      right.appendChild(plot.node());
      if (cfg.legend) right.appendChild(legend(cfg.legend));
      if (cfg.plotNote) right.appendChild(h('p', { class: 'hint' }, cfg.plotNote));
    }

    /* second plot (optional) */
    let plot2 = null;
    if (cfg.plot2) {
      plot2 = new Plot(cfg.plot2);
      right.appendChild(h('div', { style: 'height:14px' }));
      right.appendChild(plot2.node());
      if (cfg.legend2) right.appendChild(legend(cfg.legend2));
    }

    /* custom svg surface (schematics) */
    let custom = null;
    if (cfg.custom) {
      custom = h('div', {});
      left.appendChild(h('div', { style: 'height:12px' }));
      left.appendChild(custom);
    }

    /* stats */
    let statsBox = null;
    if (cfg.stats && cfg.stats.length) {
      statsBox = h('dl', { class: 'stats' });
      cfg.stats.forEach(s => {
        const cell = h('div', { class: 'stat' });
        cell.appendChild(h('dt', {}, s.label));
        const dd = h('dd', { id: 's_' + s.id }, '—');
        cell.appendChild(dd);
        statsBox.appendChild(cell);
      });
      panel.appendChild(statsBox);
    }

    function update() {
      let res;
      try { res = cfg.compute(state) || {}; }
      catch (e) { console.error('Lab compute error', cfg.title, e); return; }
      if (plot && res.plot) plot.setRange(res.plot);
      if (plot) plot.render(res.series || [], res.overlays || []);
      if (plot2 && res.plot2) plot2.setRange(res.plot2);
      if (plot2) plot2.render(res.series2 || [], res.overlays2 || []);
      if (statsBox && res.stats) {
        (cfg.stats || []).forEach(s => {
          const node = statsBox.querySelector('#s_' + s.id);
          if (!node) return;
          const v = res.stats[s.id];
          if (v == null) { node.textContent = '—'; return; }
          const txt = typeof v === 'string' ? v : (s.fmt ? s.fmt(v) : sci(v, 3));
          node.innerHTML = '';
          node.appendChild(document.createTextNode(txt));
          if (s.unit) node.appendChild(h('small', {}, s.unit));
        });
      }
      if (custom && res.custom !== undefined) {
        custom.innerHTML = '';
        if (typeof res.custom === 'string') custom.innerHTML = res.custom;
        else if (res.custom) custom.appendChild(res.custom);
      }
      if (cfg.after) cfg.after(state, res, { panel: panel, left: left, right: right });
    }

    host.appendChild(panel);
    update();

    // re-render on theme switch so CSS-var colors follow
    document.addEventListener('themechange', update);
    return { update: update, state: state, panel: panel, plot: plot, plot2: plot2 };
  }

  /* ==========================================================================
     Complex helpers (used by EIS / impedance widgets)
     ========================================================================== */
  const C = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
    inv: a => C.div([1, 0], a),
    abs: a => Math.hypot(a[0], a[1]),
    arg: a => Math.atan2(a[1], a[0]) * 180 / Math.PI,
    par: (a, b) => C.inv(C.add(C.inv(a), C.inv(b))),
    pow: (a, p) => {
      const r = Math.pow(C.abs(a), p), th = Math.atan2(a[1], a[0]) * p;
      return [r * Math.cos(th), r * Math.sin(th)];
    }
  };
  /* CPE impedance: Z = 1 / (Q (jω)^n) */
  function zCPE(w, Q, n) {
    const jw = C.pow([0, w], n);
    return C.div([1, 0], [Q * jw[0], Q * jw[1]]);
  }
  /* finite-length Warburg (short circuit) / semi-infinite */
  function zWarburgInf(w, sigma) {
    const s = sigma / Math.sqrt(w);
    return [s, -s];
  }
  function logspace(lo, hi, n) {
    const out = [], a = Math.log10(lo), b = Math.log10(hi);
    for (let i = 0; i < n; i++) out.push(Math.pow(10, a + (b - a) * i / (n - 1)));
    return out;
  }
  function linspace(lo, hi, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(lo + (hi - lo) * i / (n - 1));
    return out;
  }

  global.Lab = {
    make: make, Plot: Plot, el: el, h: h, cssVar: cssVar,
    sci: sci, eng: eng, sup: supDigits, legend: legend,
    C: C, zCPE: zCPE, zWarburgInf: zWarburgInf,
    logspace: logspace, linspace: linspace, niceTicks: niceTicks
  };
})(window);
