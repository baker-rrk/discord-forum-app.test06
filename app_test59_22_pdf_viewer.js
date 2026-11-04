/* app_test59_22_pdf_viewer.js — STEP 3：ブラウザ内PDFビューア（pdf.js で描画。文字の層は自前で作る）
 *  ・表示：縦スクロール（連続）／単ページ／見開き2ページ　・拡大縮小　・PDFの切り替え
 *  ・選択：マウスドラッグのテキスト選択、「▭ 矩形選択」（操作後に枠は必ず消す）→ 選んだ文字（座標つき）を onSelect で通知
 *  ・検索：全ページの文字から検索し、件数・前へ／次へ・ジャンプ・ハイライト
 *  ・別ウィンドウ：window.open した about:blank（同じオリジン）の中に、同じビューアを作る。選択はそのままメイン画面の onSelect に届く
 *    （file:// で開いたアプリでも動くよう、BroadcastChannel／postMessage は使わず、同じオリジンのウィンドウへ直接つなぐ）
 * 文字の層の座標は pdf.js の viewport.transform から計算する（回転したページは未対応）。 */
const PV_CSS = `
.pv-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dc-bg-sub,#2b2d31);color:var(--dc-text-normal,#f2f3f5);font:13px/1.4 system-ui,"Hiragino Sans","Yu Gothic UI",sans-serif}
.pv-bar{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;padding:6px 8px;background:var(--dc-bg-card,#1e1f22);border-bottom:1px solid var(--dc-border,#3f4147)}
.pv-bar select,.pv-bar input[type=search],.pv-bar input[type=number]{background:var(--dc-bg-input,#1e1f22);color:inherit;border:1px solid var(--dc-border,#3f4147);border-radius:6px;padding:3px 6px;font:inherit;min-width:0}
.pv-bar button{background:var(--dc-bg-btn,#4e5058);color:var(--dc-text-normal,#f2f3f5);border:none;border-radius:6px;padding:4px 8px;font:inherit;cursor:pointer}
.pv-bar button:hover:not(:disabled){background:var(--dc-bg-btn-hover,#5d6069)} .pv-bar button:disabled{opacity:.45;cursor:not-allowed} .pv-bar button.on{background:var(--dc-accent,#5865f2);color:#fff}
.pv-sep{width:1px;align-self:stretch;background:var(--dc-border,#3f4147)} .pv-grow{flex:1} .pv-count{min-width:4.5em;text-align:center;color:var(--dc-text-muted,#b5bac1)} .pv-status{margin-left:auto;color:var(--dc-text-muted,#b5bac1);font-size:12px}
.pv-pdf-select{max-width:260px} .pv-search{width:150px}
.pv-scroll{flex:1;min-height:0;overflow:auto;position:relative;background:var(--dc-bg-tertiary,#313338)}
.pv-pages{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px;min-height:100%;box-sizing:border-box}
.pv-pages.pv-spread{flex-direction:row;flex-wrap:wrap;justify-content:center;align-items:flex-start}
.pv-page{position:relative;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35);overflow:hidden;flex:none}
.pv-page[hidden]{display:none} .pv-page canvas{display:block;position:absolute;left:0;top:0}
.pv-text{position:absolute;inset:0;line-height:1;color:transparent;cursor:text}
.pv-text span{position:absolute;white-space:pre;transform-origin:0 0;color:transparent}
.pv-text span::selection{background:rgba(88,101,242,.45);color:transparent}
.pv-hit{background:rgba(255,213,0,.55);border-radius:2px} .pv-hit-cur{background:rgba(255,120,0,.7);outline:1px solid #ff7800}
.pv-rectmode .pv-text{cursor:crosshair;user-select:none;-webkit-user-select:none} .pv-rectmode .pv-page{cursor:crosshair;touch-action:none}
.pv-rect{position:absolute;border:2px dashed #5865f2;background:rgba(88,101,242,.18);pointer-events:none;z-index:5}
.pv-empty{margin:auto;padding:40px 20px;text-align:center;color:var(--dc-text-muted,#b5bac1)}
.pv-popup-body{margin:0;height:100vh;background:#313338}
`;
function pvEnsureStyle(doc) { if (doc.getElementById('pv-style')) return; const st = doc.createElement('style'); st.id = 'pv-style'; st.textContent = PV_CSS; doc.head.appendChild(st); }
const pvSleep = ms => new Promise(r => setTimeout(r, ms));
const pvMul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];   // pdf.js の Util.transform と同じ
const pvNorm = s => String(s == null ? '' : s).normalize('NFKC').toLowerCase();

class PdfViewer {
  constructor({ doc, container, mode = 'scroll', scale = 1.25, onSelect, onState }) {
    this.doc = doc; this.win = doc.defaultView; this.scroller = container; this.onSelect = onSelect || (() => {}); this.onState = onState || (() => {});
    this.mode = mode; this.scale = scale; this.pdf = null; this.numPages = 0; this.current = 1; this.pages = []; this.rawCache = new Map(); this.gen = 0; this.base = { w: 612, h: 792 };
    this.rectMode = false; this.rectEl = null; this.hits = []; this.hitIdx = -1; this.searchToken = 0; this.searching = false; this.query = '';
    this.mctx = doc.createElement('canvas').getContext('2d');
    this.pagesEl = doc.createElement('div'); this.pagesEl.className = 'pv-pages'; container.appendChild(this.pagesEl);
    this.io = ('IntersectionObserver' in this.win) ? new this.win.IntersectionObserver(es => es.forEach(e => this._onVisible(e)), { root: container, rootMargin: '1200px 0px' }) : null;
    this._bind();
  }
  _bind() {
    const d = this.doc, w = this.win;
    this._h = {
      down: e => this._rectDown(e), move: e => this._rectMove(e), up: e => this._rectUp(e), cancel: () => this.clearRect(),
      mouseup: () => { if (!this.rectMode) setTimeout(() => this._dragSelect(), 0); },
      key: e => { if (e.key === 'Escape') this.clearRect(); }, blur: () => this.clearRect(),
      scroll: () => this._onScroll()
    };
    this.pagesEl.addEventListener('pointerdown', this._h.down); this.pagesEl.addEventListener('pointermove', this._h.move); this.pagesEl.addEventListener('pointerup', this._h.up);
    this.pagesEl.addEventListener('pointercancel', this._h.cancel); this.pagesEl.addEventListener('lostpointercapture', this._h.cancel);
    this.pagesEl.addEventListener('mouseup', this._h.mouseup); d.addEventListener('keydown', this._h.key); w.addEventListener('blur', this._h.blur); this.scroller.addEventListener('scroll', this._h.scroll, { passive: true });
  }
  destroy() {
    const d = this.doc, w = this.win; this.searchToken++; this.gen++; this.clearRect();
    try { d.removeEventListener('keydown', this._h.key); w.removeEventListener('blur', this._h.blur); this.scroller.removeEventListener('scroll', this._h.scroll); } catch (e) { logSoft('pv.destroy', e); }
    if (this.io) this.io.disconnect(); this.pages.forEach(r => this._cancel(r)); this.pagesEl.remove(); this.pdf = null;
  }
  _emitState() { this.onState({ page: this.current, numPages: this.numPages, scale: this.scale, mode: this.mode, hitCount: this.hits.length, hitIdx: this.hitIdx, searching: this.searching, query: this.query }); }

  // ----- 読み込み・レイアウト -----
  async load(pdf) {
    this.gen++; this.searchToken++; this.clearRect(); this.clearHits(true); this.rawCache.clear();
    this.pages.forEach(r => { this._cancel(r); if (this.io) this.io.unobserve(r.el); }); this.pagesEl.textContent = ''; this.pages = [];
    this.pdf = pdf; this.numPages = pdf ? pdf.numPages : 0; this.current = 1;
    if (!pdf) { this._emitState(); return; }
    try { const p1 = await pdf.getPage(1), vp = p1.getViewport({ scale: 1 }); this.base = { w: vp.width, h: vp.height }; } catch (e) { logSoft('pv.load', e); }
    for (let n = 1; n <= this.numPages; n++) {
      const el = this.doc.createElement('div'); el.className = 'pv-page'; el.dataset.page = String(n); this.pagesEl.appendChild(el);
      this.pages.push({ n, el, state: 'idle', items: null, canvas: null, text: null, task: null, w: 0, h: 0 });
    }
    this._applyLayout(); this._emitState();
  }
  _size(rec) { const r = rec.w ? { w: rec.w, h: rec.h } : { w: this.base.w * this.scale, h: this.base.h * this.scale }; rec.el.style.width = r.w + 'px'; rec.el.style.height = r.h + 'px'; }
  _visibleSet() {
    if (this.mode === 'single') return [this.current];
    if (this.mode === 'spread') return [this.current, this.current + 1].filter(n => n <= this.numPages);
    return null;   // 全ページ（連続スクロール）
  }
  _applyLayout() {
    this.pagesEl.classList.toggle('pv-spread', this.mode === 'spread'); const vis = this._visibleSet();
    this.pages.forEach(r => {
      const show = !vis || vis.includes(r.n); r.el.hidden = !show; this._size(r);
      if (this.io) { this.io.unobserve(r.el); if (this.mode === 'scroll') this.io.observe(r.el); }   // 観察し直すと、いま見えているページの通知がもう一度来て、再描画される（拡大縮小・モード変更のあと）
      if (show && this.mode !== 'scroll') this.ensureRendered(r.n); else if (!show) this._release(r);
    });
    if (this.mode === 'scroll') this._onScroll();
  }
  setMode(m) { if (!['scroll', 'single', 'spread'].includes(m) || m === this.mode) return; this.mode = m; if (m === 'spread' && this.current % 2 === 0) this.current--; this._applyLayout(); this._emitState(); this._reapplyHits(); }
  setScale(s) {
    s = Math.max(0.4, Math.min(4, s)); if (Math.abs(s - this.scale) < 0.001) return; this.scale = s; this.gen++;
    this.pages.forEach(r => { this._cancel(r); this._release(r); r.w = 0; r.h = 0; }); this._applyLayout(); this._emitState();
  }
  fitWidth() { const avail = (this.scroller.clientWidth || 600) - 28; this.setScale(this.mode === 'spread' ? (avail / 2 - 8) / this.base.w : avail / this.base.w); }
  _onVisible(e) { const n = Number(e.target.dataset.page); if (e.isIntersecting) this.ensureRendered(n); else { const r = this.pages[n - 1]; if (r && r.state === 'done') this._release(r); } }
  _onScroll() {   // 見えている面積がいちばん大きいページを「現在のページ」にする
    if (this.mode !== 'scroll' || !this.pages.length) return; const top = this.scroller.scrollTop, bot = top + this.scroller.clientHeight; let cur = this.current, best = -1;
    for (const r of this.pages) { const t = r.el.offsetTop, b = t + r.el.offsetHeight, ov = Math.min(b, bot) - Math.max(t, top); if (ov > best) { best = ov; cur = r.n; } }
    if (cur !== this.current) { this.current = cur; this._emitState(); }
  }
  goto(n) {
    n = Math.max(1, Math.min(this.numPages, Number(n) || 1));
    if (this.mode === 'scroll') { const r = this.pages[n - 1]; if (r) { this.scroller.scrollTop = Math.max(0, r.el.offsetTop - 10); this.current = n; this._emitState(); } }
    else { this.current = this.mode === 'spread' && n % 2 === 0 ? n - 1 : n; this._applyLayout(); this._emitState(); this._reapplyHits(); }
  }
  step(dir) { this.goto(this.mode === 'spread' ? this.current + 2 * dir : this.current + dir); }

  // ----- ページの描画（canvas＋自前の文字の層） -----
  _cancel(r) { try { if (r.task && r.task.cancel) r.task.cancel(); } catch (e) { /* 取り消しずみ */ } r.task = null; }
  _release(r) { this._cancel(r); if (r.canvas) { r.canvas.width = 0; r.canvas.remove(); r.canvas = null; } if (r.text) { r.text.remove(); r.text = null; } r.state = 'idle'; }
  async ensureRendered(n) {
    const r = this.pages[n - 1]; if (!r || r.state === 'done' || r.state === 'rendering' || !this.pdf) return;
    const gen = this.gen, pdf = this.pdf; r.state = 'rendering';
    try {
      const page = await pdf.getPage(n); if (gen !== this.gen) return;
      const vp = page.getViewport({ scale: this.scale }); r.w = vp.width; r.h = vp.height; this._size(r);
      const dpr = Math.min(2, this.win.devicePixelRatio || 1), canvas = this.doc.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(vp.width * dpr)); canvas.height = Math.max(1, Math.floor(vp.height * dpr)); canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
      r.el.textContent = ''; r.el.appendChild(canvas); r.canvas = canvas;
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: this.scale * dpr }) }); r.task = task; await task.promise; if (gen !== this.gen) return;
      const tc = await page.getTextContent(); if (gen !== this.gen) return; this.rawCache.set(n, tc.items);
      this._buildText(r, tc.items, vp); r.state = 'done'; r.task = null; this._applyHitsTo(r);
      try { page.cleanup(); } catch (e) { logSoft('pv.cleanup', e); }
    } catch (e) { if (gen === this.gen && !(e && /cancel/i.test(String(e.name || e.message)))) { logSoft('pv.render', e); r.state = 'error'; } else r.state = 'idle'; }
  }
  _buildText(r, raw, vp) {
    const layer = this.doc.createElement('div'); layer.className = 'pv-text'; const items = [];
    raw.forEach((it, idx) => {
      if (!it || typeof it.str !== 'string') { items[idx] = null; return; }
      const t = it.transform || [1, 0, 0, 1, 0, 0], tx = pvMul(vp.transform || [vp.scale || this.scale, 0, 0, -(vp.scale || this.scale), 0, vp.height], t);
      const fh = Math.hypot(tx[2], tx[3]) || 1, wpx = (it.width || 0) * (vp.scale || this.scale), left = tx[4], top = tx[5] - fh * 0.88;
      const rec = { str: it.str, x: t[4], y: t[5], w: it.width || 0, h: Math.hypot(t[2], t[3]) || it.height || 0, page: r.n, idx, el: null, box: { l: left, t: top, r: left + Math.max(wpx, 1), b: top + fh * 1.1 } };
      if (it.str.trim() !== '') {
        const sp = this.doc.createElement('span'); sp.textContent = it.str; sp.style.left = left + 'px'; sp.style.top = top + 'px'; sp.style.fontSize = fh + 'px';
        this.mctx.font = fh + 'px sans-serif'; const mw = this.mctx.measureText(it.str).width, sx = mw > 0 && wpx > 0 ? Math.max(0.2, Math.min(5, wpx / mw)) : 1; sp.style.transform = 'scaleX(' + sx + ')';
        layer.appendChild(sp); rec.el = sp;
      }
      items[idx] = rec;
    });
    r.el.appendChild(layer); r.text = layer; r.items = items;
  }

  // ----- 選択（ドラッグ／矩形） -----
  _emit(items, meta) { const out = items.filter(i => i && i.str).map(({ str, x, y, w, h, page, idx }) => ({ str, x, y, w, h, page, idx })); if (out.length) this.onSelect(out, meta); }
  _dragSelect() {
    const sel = this.win.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount || !this.pagesEl.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
    const items = []; this.pages.forEach(r => (r.items || []).forEach(i => { if (i && i.el && sel.containsNode(i.el, true)) items.push(i); }));
    this._emit(items, { source: 'drag', pages: [...new Set(items.map(i => i.page))] });
  }
  setRectMode(on) { this.rectMode = !!on; this.pagesEl.classList.toggle('pv-rectmode', this.rectMode); this.scroller.classList.toggle('pv-rectmode', this.rectMode); this.clearRect(); try { this.win.getSelection().removeAllRanges(); } catch (e) { logSoft('pv.rect', e); } this._emitState(); }
  clearRect() { if (this.rectEl) { this.rectEl.remove(); this.rectEl = null; } this._rect = null; }   // 枠は、どんな終わり方でも必ず消す
  _rectDown(e) {
    if (!this.rectMode || e.button !== 0) return; const pg = e.target.closest && e.target.closest('.pv-page'); if (!pg) return;
    e.preventDefault(); this.clearRect(); const b = pg.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    this._rect = { page: Number(pg.dataset.page), pg, x0: x, y0: y, x1: x, y1: y, id: e.pointerId };
    try { pg.setPointerCapture(e.pointerId); } catch (err) { logSoft('pv.capture', err); }
    this.rectEl = this.doc.createElement('div'); this.rectEl.className = 'pv-rect'; pg.appendChild(this.rectEl); this._drawRect();
  }
  _rectMove(e) { const r = this._rect; if (!r) return; const b = r.pg.getBoundingClientRect(); r.x1 = Math.max(0, Math.min(b.width, e.clientX - b.left)); r.y1 = Math.max(0, Math.min(b.height, e.clientY - b.top)); this._drawRect(); }
  _drawRect() { const r = this._rect; if (!r || !this.rectEl) return; Object.assign(this.rectEl.style, { left: Math.min(r.x0, r.x1) + 'px', top: Math.min(r.y0, r.y1) + 'px', width: Math.abs(r.x1 - r.x0) + 'px', height: Math.abs(r.y1 - r.y0) + 'px' }); }
  _rectUp(e) {
    const r = this._rect; if (!r) return; this._rectMove(e);
    const rc = { l: Math.min(r.x0, r.x1), r: Math.max(r.x0, r.x1), t: Math.min(r.y0, r.y1), b: Math.max(r.y0, r.y1) }, rec = this.pages[r.page - 1];
    try { r.pg.releasePointerCapture(r.id); } catch (err) { logSoft('pv.release', err); }
    this.clearRect();   // 先に枠を消してから、結果を通知する
    if (rc.r - rc.l < 4 || rc.b - rc.t < 4 || !rec || !rec.items) return;
    const items = rec.items.filter(i => { if (!i || !i.el) return false; const w = Math.min(rc.r, i.box.r) - Math.max(rc.l, i.box.l), h = Math.min(rc.b, i.box.b) - Math.max(rc.t, i.box.t); return w > 0 && h > 0 && (w * h) / (((i.box.r - i.box.l) * (i.box.b - i.box.t)) || 1) >= 0.4; });
    this._emit(items, { source: 'rect', pages: [r.page] });
  }

  // ----- 検索 -----
  async rawItems(n) { if (this.rawCache.has(n)) return this.rawCache.get(n); const page = await this.pdf.getPage(n), tc = await page.getTextContent(); this.rawCache.set(n, tc.items); return tc.items; }
  clearHits(silent) { this.hits = []; this.hitIdx = -1; this.query = silent ? '' : this.query; this.pages.forEach(r => this._clearMarks(r)); if (!silent) this._emitState(); }
  _clearMarks(r) { (r.items || []).forEach(i => { if (i && i.el) i.el.classList.remove('pv-hit', 'pv-hit-cur'); }); }
  async search(q) {
    const token = ++this.searchToken; this.hits = []; this.hitIdx = -1; this.pages.forEach(r => this._clearMarks(r)); this.query = q; const nq = pvNorm(q).replace(/\s+/g, '');
    if (!this.pdf || !nq) { this.searching = false; this._emitState(); return 0; }
    this.searching = true; this._emitState();
    for (let n = 1; n <= this.numPages; n++) {
      if (token !== this.searchToken) return 0;
      let raw; try { raw = await this.rawItems(n); } catch (e) { logSoft('pv.search', e); continue; }
      let s = '', map = [];
      raw.forEach((it, k) => { if (!it || typeof it.str !== 'string') return; for (const ch of it.str) { const c = pvNorm(ch); for (const cc of c) { if (/\s/.test(cc)) continue; s += cc; map.push(k); } } });
      for (let from = 0, i; (i = s.indexOf(nq, from)) >= 0; from = i + nq.length) this.hits.push({ page: n, items: [...new Set(map.slice(i, i + nq.length))] });
      if (n % 4 === 0) { this._emitState(); await pvSleep(0); }
    }
    if (token !== this.searchToken) return 0;
    this.searching = false; this.hitIdx = this.hits.length ? 0 : -1; this._emitState(); this._reapplyHits(); if (this.hits.length) await this.gotoHit(0);
    return this.hits.length;
  }
  _applyHitsTo(r) {
    if (!r.items) return; this._clearMarks(r);
    this.hits.forEach((h, k) => { if (h.page !== r.n) return; h.items.forEach(ix => { const it = r.items[ix]; if (it && it.el) it.el.classList.add('pv-hit'); if (it && it.el && k === this.hitIdx) it.el.classList.add('pv-hit-cur'); }); });
  }
  _reapplyHits() { this.pages.forEach(r => this._applyHitsTo(r)); }
  async gotoHit(i) {
    if (!this.hits.length) return; this.hitIdx = ((i % this.hits.length) + this.hits.length) % this.hits.length; const h = this.hits[this.hitIdx];
    this.goto(h.page); await this.ensureRendered(h.page);
    for (let k = 0; k < 30 && this.pages[h.page - 1].state !== 'done'; k++) await pvSleep(50);   // 描画の完了を少し待つ
    this._reapplyHits(); this._emitState();
    const r = this.pages[h.page - 1], it = r && r.items && r.items[h.items[0]]; if (it && it.el && it.el.scrollIntoView) it.el.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  nextHit(dir) { return this.gotoHit(this.hitIdx + (dir || 1)); }
}

// ===== ビューアの画面部品（ツールバー付き）。メイン画面と別ウィンドウで共用 =====
// host: { entries(): [{ key, name, role }], load(key): Promise<pdfDoc>, onSelect(items, meta), onPopout?() }
function pvBuildUI(doc, mount, { modes = ['scroll'], defaultMode = 'scroll', popup = false, host }) {
  pvEnsureStyle(doc);
  const root = doc.createElement('div'); root.className = 'pv-root';
  const MODE_LABEL = { scroll: '縦スクロール', single: '単ページ', spread: '見開き2ページ' };
  root.innerHTML = `<div class="pv-bar">
      <select class="pv-pdf-select" aria-label="表示するPDF"></select><button type="button" data-pv="open" title="PCのPDFを一時的に開く">📂 開く</button><input type="file" accept="application/pdf,.pdf" hidden>
      ${popup ? '' : '<button type="button" data-pv="popout" title="別ウィンドウで開く">↗ 別窓</button>'}
      <span class="pv-sep"></span>
      <button type="button" data-pv="zoomout" title="縮小">−</button><span class="pv-count" data-pv="zoom">125%</span><button type="button" data-pv="zoomin" title="拡大">＋</button><button type="button" data-pv="fit" title="幅に合わせる">↔</button>
      <select data-pv="mode" aria-label="表示モード">${modes.map(m => `<option value="${m}">${MODE_LABEL[m]}</option>`).join('')}</select>
      <button type="button" data-pv="prev" title="前のページ">◀</button><span class="pv-count" data-pv="page">- / -</span><button type="button" data-pv="next" title="次のページ">▶</button>
      <span class="pv-sep"></span>
      <button type="button" data-pv="rect" title="矩形（四角枠）で範囲を選択">▭ 矩形選択</button>
      <span class="pv-sep"></span>
      <input type="search" class="pv-search" placeholder="🔍 PDF内を検索" aria-label="PDF内を検索"><span class="pv-count" data-pv="hits">0 / 0</span><button type="button" data-pv="hprev" title="前の一致">▲</button><button type="button" data-pv="hnext" title="次の一致">▼</button>
      ${!popup && host.onScanNpc ? '<span class="pv-sep"></span><button type="button" data-pv="npcscan" title="登録PDFの全ページを走査して、NPC（ステータス・技能のブロック）を検出します">🔍 PDFからNPCを一括検出</button>' : ''}
      <span class="pv-status" data-pv="status" aria-live="polite"></span></div>
    <div class="pv-scroll"><div class="pv-empty">PDFが選ばれていません</div></div>`;
  mount.appendChild(root);
  const q = s => root.querySelector(s), sel = q('.pv-pdf-select'), scroller = q('.pv-scroll'), file = q('input[type=file]'), modeSel = q('[data-pv="mode"]');
  if (modes.length < 2) modeSel.style.display = 'none';
  const viewer = new PdfViewer({ doc, container: scroller, mode: defaultMode, onSelect: (items, meta) => host.onSelect(items, meta, ui),
    onState: s => {
      q('[data-pv="zoom"]').textContent = Math.round(s.scale * 100) + '%'; q('[data-pv="page"]').textContent = s.numPages ? `${s.page} / ${s.numPages}` : '- / -'; modeSel.value = s.mode;
      q('[data-pv="hits"]').textContent = s.searching ? '検索中…' : (s.query ? `${s.hitCount ? s.hitIdx + 1 : 0} / ${s.hitCount}` : '0 / 0');
      q('[data-pv="rect"]').classList.toggle('on', viewer.rectMode); ['prev', 'next'].forEach(k => { q(`[data-pv="${k}"]`).disabled = !s.numPages; });
      ['hprev', 'hnext'].forEach(k => { q(`[data-pv="${k}"]`).disabled = !s.hitCount; });
    } });
  let loadToken = 0;
  async function open(key) {
    const my = ++loadToken, pdf = key ? await host.load(key) : null; if (my !== loadToken) return;
    const emp = scroller.querySelector('.pv-empty'); if (emp) emp.remove(); await viewer.load(pdf);
    if (!pdf) { const e = doc.createElement('div'); e.className = 'pv-empty'; e.textContent = 'PDFが選ばれていません'; scroller.insertBefore(e, viewer.pagesEl); }
    const qv = q('.pv-search').value; if (qv && pdf) viewer.search(qv);
  }
  function refreshList(selectKey) {
    const list = host.entries(), cur = selectKey || sel.value;
    sel.innerHTML = list.length ? list.map(e => `<option value="${escapeHTML(e.key)}">${escapeHTML((e.role === 'main' ? '★ ' : '') + e.name)}</option>`).join('') : '<option value="">（登録されたPDFがありません）</option>';
    const keep = list.find(e => e.key === cur) ? cur : (list[0] && list[0].key) || ''; sel.value = keep; return keep;
  }
  const ui = { root, viewer, refreshList, open, setStatus: t => { q('[data-pv="status"]').textContent = t || ''; }, destroy: () => { viewer.destroy(); root.remove(); } };
  sel.addEventListener('change', () => open(sel.value));
  q('[data-pv="open"]').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => { const f = file.files[0]; file.value = ''; if (!f) return; const key = await host.addLocal(f); if (key) { refreshList(key); open(key); } });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-pv]'); if (!b) return; const k = b.dataset.pv;
    if (k === 'zoomin') viewer.setScale(viewer.scale * 1.15); else if (k === 'zoomout') viewer.setScale(viewer.scale / 1.15); else if (k === 'fit') viewer.fitWidth();
    else if (k === 'prev') viewer.step(-1); else if (k === 'next') viewer.step(1); else if (k === 'rect') viewer.setRectMode(!viewer.rectMode);
    else if (k === 'hprev') viewer.nextHit(-1); else if (k === 'hnext') viewer.nextHit(1); else if (k === 'popout' && host.onPopout) host.onPopout(); else if (k === 'npcscan' && host.onScanNpc) host.onScanNpc();
  });
  modeSel.addEventListener('change', () => viewer.setMode(modeSel.value));
  let st = null; q('.pv-search').addEventListener('input', e => { clearTimeout(st); st = setTimeout(() => viewer.search(e.target.value), 250); });
  q('.pv-search').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (viewer.hits.length) viewer.nextHit(e.shiftKey ? -1 : 1); else viewer.search(e.target.value); } });
  viewer._emitState();
  return ui;
}

// ===== 別ウィンドウ =====
let pvPopup = null;
function pvOpenPopup(host) {
  if (pvPopup && pvPopup.win && !pvPopup.win.closed) { pvPopup.win.focus(); return pvPopup; }
  const win = window.open('', 'ccfolia_pdf_viewer', 'width=980,height=1100,resizable=yes,scrollbars=yes'); if (!win) return null;
  win.document.open(); win.document.write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>PDFビューア（ココフォリア準備）</title></head><body class="pv-popup-body"></body></html>'); win.document.close();
  const ui = pvBuildUI(win.document, win.document.body, { modes: ['single', 'spread', 'scroll'], defaultMode: 'single', popup: true,
    host: { ...host, onSelect: (items, meta) => { host.onSelect(items, { ...meta, from: 'popup' }); const n = items.reduce((s, i) => s + i.str.length, 0); ui.setStatus(`メイン画面へ送信しました（${n}文字）`); } } });
  pvPopup = { win, ui };
  const gone = () => { if (pvPopup && pvPopup.win === win) { try { ui.destroy(); } catch (e) { logSoft('pvPopup', e); } pvPopup = null; } };
  win.addEventListener('pagehide', gone); win.addEventListener('beforeunload', gone);
  return pvPopup;
}
window.addEventListener('pagehide', () => { if (pvPopup && pvPopup.win && !pvPopup.win.closed) { try { pvPopup.win.close(); } catch (e) { logSoft('pvPopup.close', e); } } });   // メイン画面を閉じたら、別ウィンドウも閉じる
