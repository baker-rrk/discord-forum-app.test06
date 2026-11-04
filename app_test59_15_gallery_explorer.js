/* app_test59_15_gallery_explorer.js — シナリオ専用ギャラリーの「拡大表示」（エクスプローラー風の整理画面）
 * 左：カテゴリ（フォルダ）一覧／右：選択中カテゴリの画像グリッド（大きめ）。
 *  ・カテゴリの追加・名前変更・削除
 *  ・画像の複数選択（クリック／Shift+クリックで範囲）→ 一括削除・一括移動（ドラッグ＆ドロップ、または「移動先」メニュー）
 *  ・PCの画像・フォルダ・ZIPを右のグリッドへドロップして登録（14_gallery.js の galleryDrop を使い回す）
 * データは 14_gallery.js と同じ（各シナリオの imageCategories / images）。対象シナリオは galScOverride で指定する。 */
let gxQuery = '', gxSel = new Set(), gxLast = null, gxEdit = null, gxOpener = null, gxDragIds = null;
const gxEl = () => document.getElementById('gxOverlay');
const gxCtx = () => galCtx('scenario');   // 拡大表示の間は activeScenario() が対象シナリオを返す

function openGalleryExplorer(scenarioId) {
  const sc = appState.scenarios.find(s => s.id === scenarioId); if (!sc) return toast('⚠️ シナリオが見つかりません');
  if (gxEl()) return;
  gxOpener = document.activeElement; galScOverride = sc; gxQuery = ''; gxSel = new Set(); gxLast = null; gxEdit = null; gxDragIds = null;
  const ov = document.createElement('div'); ov.id = 'gxOverlay'; ov.className = 'gx-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'ギャラリー拡大表示');
  document.body.appendChild(ov); gxRender();
  const c = ov.querySelector('[data-gx="close"]'); if (c) c.focus();
}
function closeGalleryExplorer() {
  const ov = gxEl(); if (!ov) return;
  const lb = document.getElementById('gxLightbox'); if (lb) lb.remove();
  ov.remove(); galScOverride = (typeof sdId !== 'undefined' && sdId && document.getElementById('sdOverlay')) ? (appState.scenarios.find(s => s.id === sdId) || null) : null; gxSel = new Set();   // シナリオ詳細が下で開いているときは、その対象に戻す gxEdit = null; gxDragIds = null;
  renderGalleryAll();
  if (gxOpener && document.contains(gxOpener) && gxOpener.focus) { try { gxOpener.focus(); } catch (e) { logSoft('closeGalleryExplorer', e); } } gxOpener = null;
}
function gxVisible(ctx, cur) {   // 検索中は全カテゴリからファイル名で絞り込み、そうでなければ選択中カテゴリの画像
  const terms = parseQuery(gxQuery);
  return terms.length ? ctx.items.filter(a => { const nm = normSearch(a.name || ''); return terms.every(t => nm.includes(t)); }) : ctx.items.filter(a => a.category === cur);
}
function gxTilesHtml(ctx, cur) {
  const list = gxVisible(ctx, cur), q = !!parseQuery(gxQuery).length;
  return list.map(a => `<div class="gx-tile${gxSel.has(a.id) ? ' sel' : ''}" data-gx-id="${escapeHTML(a.id)}" draggable="true" title="クリックで選択／ダブルクリックで原寸表示"><img ${imgAttr(galUrl(a))} alt="${escapeHTML(a.name)}" loading="lazy" draggable="false"><span class="gx-check" aria-hidden="true">✓</span>${q ? `<span class="gx-cat-tag">${escapeHTML(a.category)}</span>` : ''}<div class="gx-name">${escapeHTML(a.name)}</div></div>`).join('')
    || `<div class="gal-empty">${q ? '該当する画像がありません。' : 'このカテゴリには、まだ画像がありません。ここへ画像・フォルダ・ZIPをドロップして追加できます。'}</div>`;
}
function gxRenderGrid() {   // 検索入力のたびに、画像グリッドだけを描き直す（入力欄のフォーカスを保つ）
  const ov = gxEl(), ctx = gxCtx(); if (!ov || !ctx) return; const cur = galCur('scenario', ctx), g = ov.querySelector('.gx-grid'); if (!g) return;
  const vis = new Set(gxVisible(ctx, cur).map(a => a.id)); gxSel.forEach(id => { if (!vis.has(id)) gxSel.delete(id); });   // 見えなくなった画像の選択は外す（見えない画像を誤って削除しない）
  g.innerHTML = gxTilesHtml(ctx, cur); gxUpdateSel();
}
function gxRender() {
  const ov = gxEl(); if (!ov) return; const ctx = gxCtx();
  if (!ctx) { closeGalleryExplorer(); return; }
  const sc = activeScenario(), cur = galCur('scenario', ctx), count = c => ctx.items.filter(a => a.category === c).length;
  const valid = new Set(ctx.items.map(a => a.id)); gxSel.forEach(id => { if (!valid.has(id)) gxSel.delete(id); });   // 消えた画像の選択は外す
  const cats = ctx.cats.map(c => gxEdit === c
    ? `<div class="gx-cat on"><input type="text" class="gx-rename" data-gx-orig="${escapeHTML(c)}" value="${escapeHTML(c)}" aria-label="フォルダ名"></div>`
    : `<div class="gx-cat${c === cur ? ' on' : ''}" data-gx-cat="${escapeHTML(c)}" role="button" tabindex="0" aria-pressed="${c === cur}"><span class="gx-cat-name">📁 ${escapeHTML(c)}</span><small>${count(c)}</small><span class="gx-cat-btns"><button type="button" class="gal-mini" data-gx="rename" data-gx-c="${escapeHTML(c)}" title="名前を変更">✎</button>${ctx.cats.length > 1 ? `<button type="button" class="gal-mini" data-gx="del-cat" data-gx-c="${escapeHTML(c)}" title="フォルダを削除">✕</button>` : ''}</span></div>`).join('');
  const tiles = gxTilesHtml(ctx, cur);
  const moveOpts = (gxQuery ? ctx.cats : ctx.cats.filter(c => c !== cur)).map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
  ov.innerHTML = `<div class="gx-window">
    <div class="gx-head"><div class="gx-title">🖼️ ギャラリー <small>${escapeHTML(sc.title || '無題')}</small></div><button type="button" class="btn-sort" data-gx="close">✕ 閉じる</button></div>
    <div class="gx-body">
      <aside class="gx-left"><div class="gx-left-head"><span>📁 カテゴリ</span><button type="button" class="btn-sort" data-gx="add-cat">＋ 追加</button></div><div class="gx-cats">${cats}</div><div class="gx-hint">画像をドラッグして、カテゴリへ移動できます</div></aside>
      <section class="gx-right">
        <div class="gx-tools">
          <input type="search" id="gxSearch" class="gx-search" placeholder="🔍 ファイル名で絞り込み（全フォルダ）" value="${escapeHTML(gxQuery)}" aria-label="ファイル名で絞り込み" autocomplete="off">
          <button type="button" class="btn-sort" data-gx="sel-all">☑ 全選択／解除</button>
          <span class="gx-count" id="gxCount" aria-live="polite"></span>
          <select id="gxMoveTo" aria-label="移動先のカテゴリ"${moveOpts ? '' : ' disabled'}>${moveOpts || '<option>（移動先なし）</option>'}</select>
          <button type="button" class="btn-sort" data-gx="move" id="gxMoveBtn">📂 選択を移動</button>
          <button type="button" class="btn-sort btn-danger" data-gx="del-sel" id="gxDelBtn">🗑 選択を削除</button>
          <button type="button" class="btn-sort" data-gx="add-files">📥 画像・ZIPを追加</button>
          <input type="file" id="gxFile" multiple accept="image/*,.zip" style="display:none;">
        </div>
        <div class="gx-grid" data-gdrop="scenario" data-gcat="${escapeHTML(cur)}">${tiles}</div>
      </section>
    </div></div>`;
  gxUpdateSel();
  const ri = ov.querySelector('.gx-rename'); if (ri) { ri.focus(); ri.select(); }
}
function gxUpdateSel() {   // 選択の見た目と、ボタンの有効/無効だけを更新（画像を描き直さない）
  const ov = gxEl(); if (!ov) return; const n = gxSel.size;
  ov.querySelectorAll('.gx-tile').forEach(t => t.classList.toggle('sel', gxSel.has(t.dataset.gxId)));
  const c = ov.querySelector('#gxCount'); if (c) c.textContent = n ? `選択中 ${n} 枚` : (gxQuery.trim() ? `${ov.querySelectorAll('.gx-tile').length} 件ヒット` : '画像をクリックして選択');
  ['gxDelBtn', 'gxMoveBtn'].forEach(id => { const b = ov.querySelector('#' + id); if (b) b.disabled = !n; });
}
function gxMove(ids, cat) {   // 画像を別カテゴリへ移す（並びは移動先の末尾）
  const ctx = gxCtx(); if (!ctx || !ctx.cats.includes(cat)) return 0;
  const set = new Set(ids), moving = ctx.items.filter(a => set.has(a.id) && a.category !== cat); if (!moving.length) return 0;
  moving.forEach(a => { a.category = cat; ctx.items.splice(ctx.items.indexOf(a), 1); ctx.items.push(a); });
  ctx.save(); return moving.length;
}
function gxCommitRename(input) {
  const ctx = gxCtx(), orig = input.dataset.gxOrig; gxEdit = null; if (!ctx) return gxRender();
  const nn = input.value.trim();
  if (nn && nn !== orig && !ctx.cats.includes(nn)) { ctx.cats[ctx.cats.indexOf(orig)] = nn; ctx.items.forEach(a => { if (a.category === orig) a.category = nn; }); if (galSel.scenario === orig) galSel.scenario = nn; const sid = activeScenario().id; if (galOpen.delete(sid + '|' + orig)) galOpen.add(sid + '|' + nn); ctx.save(); }
  else if (nn && nn !== orig) toast('同じ名前のフォルダが既にあります');
  gxRender();
}
async function gxShowOriginal(id) {   // ダブルクリック：原寸（に近い）表示
  const ctx = gxCtx(), a = ctx && ctx.items.find(x => x.id === id); if (!a) return;
  let u = galUrl(a);
  if (u.startsWith('@img:')) { const h = u.slice(5); await ensureLocalUrl(h); u = hashToUrl.get(h); if (!u) { requestImage(h); return toast('☁️ 画像をクラウドから取得中です。少し待ってからもう一度お試しください。'); } }
  const lb = document.createElement('div'); lb.id = 'gxLightbox'; lb.className = 'gx-lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', a.name || '画像');
  const img = document.createElement('img'); img.src = u; img.alt = a.name || ''; lb.appendChild(img); lb.addEventListener('click', () => lb.remove()); document.body.appendChild(lb);
}

(function () {
  document.addEventListener('click', async e => {
    const open = e.target.closest && e.target.closest('[data-gx="open"]');
    if (open) { openGalleryExplorer(open.dataset.sid); return; }
    const ov = gxEl(); if (!ov || !ov.contains(e.target)) return;
    const b = e.target.closest('[data-gx]'), ctx = gxCtx(); if (!ctx) return;
    if (b) {
      const k = b.dataset.gx;
      if (k === 'close') return closeGalleryExplorer();
      if (k === 'add-cat') { const n = uniqueCategory(ctx.cats, '新しいフォルダ'); ctx.cats.push(n); galSel.scenario = n; gxEdit = n; gxSel.clear(); ctx.save(); return gxRender(); }
      if (k === 'rename') { gxEdit = b.dataset.gxC; return gxRender(); }
      if (k === 'del-cat') {
        const c = b.dataset.gxC, n = ctx.items.filter(a => a.category === c).length;
        if (!(await appConfirm('フォルダ「' + c + '」を削除しますか？' + (n ? '\n中の画像 ' + n + ' 枚は、先頭のフォルダへ移します。' : ''), { okText: '削除', danger: true }))) return;
        const c2 = gxCtx(); if (!c2 || c2.cats.length < 2) return;   // 確認中に状態が変わっていないか再確認
        const rest = c2.cats.filter(x => x !== c); c2.items.forEach(a => { if (a.category === c) a.category = rest[0]; }); c2.cats.splice(0, c2.cats.length, ...rest);
        galSel.scenario = rest[0]; gxSel.clear(); const sid = activeScenario().id; galOpen.delete(sid + '|' + c); c2.save(); return gxRender();
      }
      if (k === 'sel-all') { const cur = galCur('scenario', ctx), ids = gxVisible(ctx, cur).map(a => a.id); const all = ids.length && ids.every(id => gxSel.has(id)); ids.forEach(id => all ? gxSel.delete(id) : gxSel.add(id)); return gxUpdateSel(); }
      if (k === 'move') { const to = ov.querySelector('#gxMoveTo'); if (!to || to.disabled) return; const n = gxMove([...gxSel], to.value); gxSel.clear(); gxRender(); return toast(n ? `✅ ${n}枚を「${to.value}」へ移しました` : '移動する画像がありません'); }
      if (k === 'del-sel') {
        const ids = [...gxSel]; if (!ids.length) return;
        if (!(await appConfirm(`選択した ${ids.length} 枚の画像を削除しますか？\nこの操作は元に戻せません。`, { okText: '削除', danger: true }))) return;
        const c2 = gxCtx(); if (!c2) return; const set = new Set(ids); const before = c2.items.length;
        c2.items.splice(0, c2.items.length, ...c2.items.filter(a => !set.has(a.id))); gxSel.clear(); c2.save(); gxRender(); return toast(`🗑 ${before - c2.items.length}枚を削除しました`);
      }
      if (k === 'add-files') { const f = ov.querySelector('#gxFile'); if (f) f.click(); return; }
    }
    const cat = e.target.closest('.gx-cat[data-gx-cat]');
    if (cat && !e.target.closest('input')) { galSel.scenario = cat.dataset.gxCat; gxQuery = ''; gxSel.clear(); gxLast = null; return gxRender(); }
    const tile = e.target.closest('.gx-tile');
    if (tile) {
      const id = tile.dataset.gxId, tiles = [...ov.querySelectorAll('.gx-tile')].map(t => t.dataset.gxId);
      if (e.shiftKey && gxLast && tiles.includes(gxLast)) { const a = tiles.indexOf(gxLast), z = tiles.indexOf(id); tiles.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(x => gxSel.add(x)); }
      else { if (gxSel.has(id)) gxSel.delete(id); else gxSel.add(id); gxLast = id; }
      gxUpdateSel();
    }
  });
  document.addEventListener('input', e => { if (e.target && e.target.id === 'gxSearch') { gxQuery = e.target.value; gxRenderGrid(); } });
  document.addEventListener('dblclick', e => { const t = e.target.closest && e.target.closest('#gxOverlay .gx-tile'); if (t) gxShowOriginal(t.dataset.gxId); });
  document.addEventListener('change', async e => {
    if (!e.target || e.target.id !== 'gxFile') return;
    const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
    await galleryDrop('scenario', files.map(file => ({ file })));
  });
  document.addEventListener('keydown', e => {
    const ov = gxEl(); if (!ov) return;
    const ri = e.target.closest && e.target.closest('.gx-rename');
    if (ri) { if (e.key === 'Enter') { e.preventDefault(); gxCommitRename(ri); } else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); gxEdit = null; gxRender(); } return; }
    if (e.key === 'Escape' && !document.querySelector('.app-dialog-overlay')) {
      e.stopImmediatePropagation(); const lb = document.getElementById('gxLightbox'); if (lb) lb.remove(); else closeGalleryExplorer(); return;
    }
    const cat = e.target.closest && e.target.closest('.gx-cat[data-gx-cat]'); if (cat && (e.key === 'Enter' || e.key === ' ') && e.target === cat) { e.preventDefault(); cat.click(); }
  }, true);
  document.addEventListener('focusout', e => { const i = e.target.closest && e.target.closest('.gx-rename'); if (i && gxEdit !== null) gxCommitRename(i); });
  // ----- ドラッグ＆ドロップ：画像 → 左のカテゴリへ移動／OSのファイル → 右のグリッドへ登録（登録は 14_gallery.js のドロップ処理） -----
  document.addEventListener('dragstart', e => {
    const t = e.target.closest && e.target.closest('#gxOverlay .gx-tile'); if (!t) return;
    const id = t.dataset.gxId; gxDragIds = gxSel.has(id) ? [...gxSel] : [id];   // 選択中の画像をつかんだら、選択ぶんをまとめて動かす
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'gx-images'); t.classList.add('dragging');
  });
  document.addEventListener('dragend', () => { gxDragIds = null; document.querySelectorAll('#gxOverlay .dragging, #gxOverlay .gx-drop').forEach(x => x.classList.remove('dragging', 'gx-drop')); });
  document.addEventListener('dragover', e => { const c = e.target.closest && e.target.closest('#gxOverlay .gx-cat[data-gx-cat]'); if (!c) return; const files = e.dataTransfer && [...e.dataTransfer.types].includes('Files'); if (!gxDragIds && !files) return; e.preventDefault(); e.dataTransfer.dropEffect = gxDragIds ? 'move' : 'copy'; c.classList.add('gx-drop'); });
  document.addEventListener('dragleave', e => { const c = e.target.closest && e.target.closest('#gxOverlay .gx-cat'); if (c && !(e.relatedTarget && c.contains(e.relatedTarget))) c.classList.remove('gx-drop'); });
  document.addEventListener('drop', async e => {
    const c = e.target.closest && e.target.closest('#gxOverlay .gx-cat[data-gx-cat]'); if (!c) return;
    e.preventDefault(); e.stopPropagation(); c.classList.remove('gx-drop'); const to = c.dataset.gxCat;
    if (gxDragIds) { const n = gxMove(gxDragIds, to); gxDragIds = null; gxSel.clear(); gxRender(); if (n) toast(`✅ ${n}枚を「${to}」へ移しました`); return; }
    if (e.dataTransfer && e.dataTransfer.files.length) { galSel.scenario = to; await galleryDrop('scenario', snapshotDrop(e.dataTransfer)); }
  }, true);
})();
