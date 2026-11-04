/* app_test59_02_storage_images.js — 画像の保存(IndexedDB)・直列化・画像の遅延読み込み
 * 読み込み順は 01→07（HTMLの<script>の並び）。全ファイルが同じグローバルスコープを共有します。
 * 各ファイルは、前のファイルで定義された関数・変数を使えます。 */
  const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const imgUrlToHash = new Map(), hashToUrl = new Map(), thumbMap = new Map(), dataHashCache = new Map(), storedHashes = new Set();
  let persistChain = Promise.resolve();
  function hashStr(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + 'x' + str.length.toString(36);
  }
  function imgSrc(u) { u = String(u || ''); return u.startsWith('@img:') ? PLACEHOLDER : u; }
  function thumbSrc(u) { return thumbMap.get(u) || imgSrc(u); }
  async function makeThumb(blob) {
    try {
      const bmp = await createImageBitmap(blob), sc = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
      return await new Promise(r => c.toBlob(r, 'image/webp', 0.7));
    } catch (e) { return null; }
  }
  function queueImage(h, dataUrl) {
    if (storedHashes.has(h)) return; storedHashes.add(h);
    persistChain = persistChain.then(async () => {
      const blob = dataURLtoBlob(dataUrl); await idbPut('images', h, blob);
      const t = await makeThumb(blob); if (t) { await idbPut('thumbs', h, t); thumbMap.set(dataUrl, URL.createObjectURL(t)); }
    }).catch(e => { storedHashes.delete(h); console.error(e); });
  }
  function urlToRef(u) {
    if (u.startsWith('blob:')) { const h = imgUrlToHash.get(u); return h ? '@img:' + h : u; }
    if (u.startsWith('data:image/')) { let h = dataHashCache.get(u); if (!h) { h = hashStr(u); dataHashCache.set(u, h); if (dataHashCache.size > 30) dataHashCache.delete(dataHashCache.keys().next().value); } queueImage(h, u); return '@img:' + h; }
    return u;
  }
  function serializeState(o) { return JSON.stringify(o, (k, v) => (typeof v === 'string' && k !== 'botAvatarData') ? urlToRef(v) : v); }
  function walkStrings(o, fn) { for (const k in o) { const v = o[k]; if (typeof v === 'string') { const r = fn(v); if (r !== undefined) o[k] = r; } else if (v && typeof v === 'object' && !(v instanceof Blob)) walkStrings(v, fn); } }
  async function ensureLocalUrl(h) {
    if (hashToUrl.has(h)) return;
    try {
      const blob = await idbGet('images', h); if (!blob) return;
      storedHashes.add(h);
      const url = URL.createObjectURL(blob); hashToUrl.set(h, url); imgUrlToHash.set(url, h);
      const t = await idbGet('thumbs', h);
      if (t) thumbMap.set(url, URL.createObjectURL(t));
      else makeThumb(blob).then(async tb => { if (tb) { await idbPut('thumbs', h, tb); thumbMap.set(url, URL.createObjectURL(tb)); } });
    } catch (e) { console.error(e); }
  }
  function replaceRefs(o) { let n = 0; walkStrings(o, v => { if (v.startsWith('@img:')) { const u = hashToUrl.get(v.slice(5)); if (u) { n++; return u; } } }); return n; }
  async function hydrateRefs(root) {
    const refs = new Set(); walkStrings(root, v => { if (v.startsWith('@img:')) refs.add(v.slice(5)); });
    await Promise.all([...refs].map(ensureLocalUrl)); replaceRefs(root);
  }
  window.imgFlush = () => persistChain;
  window.idbImageDataUrl = async (h) => {
    const blob = await idbGet('images', h); if (!blob) return null;
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  };
  // クラウドにしかない画像は、画面に出たとき（または投稿・読込で必要になったとき）だけ端末に取り込む
  const lazyQueue = new Set(), lazyBusy = new Set(), lazyFailed = new Set(); let lazyWorkers = 0, lazyRefresh = null;
  function requestImage(h) { if (h && !hashToUrl.has(h) && !lazyBusy.has(h) && !lazyFailed.has(h)) { lazyQueue.add(h); drainLazy(); } }
  function requestRefsIn(o) { walkStrings(o, v => { if (v.startsWith('@img:')) requestImage(v.slice(5)); }); }
  window.fetchMissingImages = () => { lazyFailed.forEach(h => lazyQueue.add(h)); lazyFailed.clear(); drainLazy(); };
  function drainLazy() {
    if (!window.cloudImagesReady) return;
    while (lazyWorkers < 3 && lazyQueue.size) {
      const h = lazyQueue.values().next().value; lazyQueue.delete(h); lazyBusy.add(h); lazyWorkers++;
      (async () => {
        try { const d = await window.cloudFetchImage(h); if (d) { await idbPut('images', h, dataURLtoBlob(d)); await ensureLocalUrl(h); } }
        catch (e) { console.error(e); }
        if (!hashToUrl.has(h)) lazyFailed.add(h);
        lazyBusy.delete(h); lazyWorkers--;
        clearTimeout(lazyRefresh);
        lazyRefresh = setTimeout(() => {
          const a = replaceRefs(appState), b = replaceRefs(blockOrder);
          if (a) renderDBView(); if (b) { renderBlockUI(); renderPreview(); }
        }, 300);
        drainLazy();
      })();
    }
  }
  function imgAttr(u) { u = String(u || ''); return u.startsWith('@img:') ? `src="${PLACEHOLDER}" data-ref="${escapeHTML(u.slice(5))}"` : `src="${escapeHTML(thumbSrc(u))}"`; }
  const lazyIO = ('IntersectionObserver' in window) ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { lazyIO.unobserve(e.target); requestImage(e.target.dataset.ref); } }), { rootMargin: '300px' }) : null;
  const lazyMO = new MutationObserver(() => { document.querySelectorAll('img[data-ref]:not([data-obs])').forEach(i => { i.dataset.obs = '1'; if (lazyIO) lazyIO.observe(i); else requestImage(i.dataset.ref); }); });
  const startLazyMO = () => lazyMO.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startLazyMO); else startLazyMO();

  function toast(msg, kind) {
    msg = String(msg); kind = kind || (/^(❌|⚠️)/.test(msg) ? 'error' : /^✅/.test(msg) ? 'success' : 'info');
    let box = document.getElementById('toast-box');
    if (!box) { box = document.createElement('div'); box.id = 'toast-box'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast toast-' + kind; t.textContent = msg; t.onclick = () => t.remove(); box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3000);
  }
  let dragFrom = null;
  function enhanceSortable(container) {
    [...container.children].forEach((item, idx) => {
      const hd = item.querySelector('.sortable-header'); if (!hd) return;
      const h = document.createElement('span'); h.className = 'drag-handle'; h.textContent = '⠿'; h.title = 'ドラッグで並べ替え'; h.draggable = true;
      h.addEventListener('dragstart', e => { dragFrom = idx; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'block'); try { e.dataTransfer.setDragImage(item, 20, 20); } catch (x) { logSoft('enhanceSortable', x); } item.classList.add('dragging'); });
      h.addEventListener('dragend', () => { dragFrom = null; container.querySelectorAll('.dragging,.drag-over-top,.drag-over-bottom').forEach(x => x.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom')); });
      h.addEventListener('click', e => e.stopPropagation()); hd.prepend(h);
      const before = e => { const r = item.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; };
      item.addEventListener('dragover', e => { if (dragFrom === null) return; e.preventDefault(); e.stopPropagation(); const b = before(e); item.classList.toggle('drag-over-top', b); item.classList.toggle('drag-over-bottom', !b); });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over-top', 'drag-over-bottom'));
      item.addEventListener('drop', e => {
        if (dragFrom === null) return; e.preventDefault(); e.stopPropagation();
        const from = dragFrom; dragFrom = null; let to = idx + (before(e) ? 0 : 1); if (to > from) to--;
        if (to !== from) { const t = blockOrder.splice(from, 1)[0]; blockOrder.splice(to, 0, t); renderBlockUI(); renderPreview(); }
      });
    });
  }

