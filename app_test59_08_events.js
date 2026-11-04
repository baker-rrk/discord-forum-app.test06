/* app_test59_08_events.js — ブロック編集画面のイベント（インライン onclick 等の代わり）
 * HTML側の data-ba（クリック）/ data-bi（入力）/ data-bc（変更）属性を見て、document で一括して受け取ります。
 * 各ブロックは data-bid（ブロックID）で特定し、その時点の並び順を blockIdx() で引きます。 */
(function () {
  const idxOf = el => blockIdx(el.dataset.bid);
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-ba]'); if (!el) return;
    const act = el.dataset.ba, i = idxOf(el);
    if (act === 'pick') { if (e.target.matches && e.target.matches('input[type=file]')) return; const fi = document.getElementById('fileInput_' + el.dataset.bid); if (fi) fi.click(); return; }
    if (i < 0) return;   // ブロックが既に無い
    if (act === 'toggle') { const inner = e.target.closest('input,textarea,select,button,label,.sort-controls'); if (inner && inner !== el) return; toggleBlockCollapse(i); }
    else if (act === 'up') moveBlock(i, -1);
    else if (act === 'down') moveBlock(i, 1);
    else if (act === 'del') deleteCustomBlock(i);
    else if (act === 'item-add') addSummaryItem(i);
    else if (act === 'item-del') deleteSummaryItem(i, Number(el.dataset.i));
    else if (act === 'img-clear') { const bb = blockOrder[i], bid = el.dataset.bid; confirmImageRemoval(bb.previewUrl || (bb.file ? 'blob:file' : '')).then(ok => { const j = blockIdx(bid); if (ok && j >= 0) clearImageFile(j); }); }   // 戻せない画像だけ確認
    else if (act === 'gallery') { const bid = el.dataset.bid; pickGalleryImage().then(url => { const j = blockIdx(bid); if (url && j >= 0) { blockOrder[j].previewUrl = url; blockOrder[j].file = null; renderBlockUI(); renderPreview(); } }); }
    else if (act === 'sub-add') { const b = blockOrder[i]; (b.subItems = b.subItems || []).push(newSub()); renderBlockUI(); renderPreview(); }
    else if (act === 'sub-del') { const b = blockOrder[i]; (b.subItems || []).splice(Number(el.dataset.i), 1); renderBlockUI(); renderPreview(); }
    else if (act === 'fmt') insertFmt(el.dataset.bid, el.dataset.fb, el.dataset.fa || '');
  });
  document.addEventListener('input', e => {
    const el = e.target.closest && e.target.closest('[data-bi]'); if (!el) return;
    const i = idxOf(el); if (i < 0) return; const b = blockOrder[i], v = el.value, k = el.dataset.bi, it = b.items && b.items[Number(el.dataset.i)];
    if (k === 'key') { b.keyName = v; renderPreview(); }
    else if (k === 'item-key' && it) { it.keyName = v; renderPreview(); }
    else if (k === 'item-val' && it) { it.val = v; renderPreview(); }
    else if (k === 'sub-title' || k === 'sub-text' || k === 'sub-style') { const s = (b.subItems || [])[Number(el.dataset.i)]; if (s) { s[SUB_FIELD[k.slice(4)]] = v; renderPreview(); } }
    else if (k === 'free') { b.freeText = v; renderPreview(); }
    else if (k === 'img-url') handleImageUrlInput(i, v);
    else if (k === 'val') updateBlockValue(i, v);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest && e.target.closest('[data-bc]'); if (!el) return;
    const i = idxOf(el); if (i < 0) return;
    if (el.dataset.bc === 'decor') { blockOrder[i].decorStyle = el.value; renderPreview(); }
    else if (el.dataset.bc === 'file') handleFileSelect(e, i);
  });
  const zone = e => e.target.closest && e.target.closest('[data-ba="pick"]');
  document.addEventListener('dragover', e => { if (zone(e)) handleDragOver(e); }, true);
  document.addEventListener('dragleave', e => { if (zone(e)) handleDragLeave(e); }, true);
  document.addEventListener('drop', e => { const z = zone(e); if (z) handleFileDrop(e, blockIdx(z.dataset.bid)); }, true);   // キャプチャ段階で受けて伝播を止める（親コンテナの handleContainerDrop と二重にならないように）
})();

// 固定ヘッダーの高さをCSS変数に反映（プレビュー枠などをヘッダーの下に置くため。折り返しで高さが変わっても追従）
(function () {
  const h = document.querySelector('.app-header'); if (!h) return;
  const set = () => document.documentElement.style.setProperty('--app-header-h', h.offsetHeight + 'px');
  set(); window.addEventListener('resize', set); if (window.ResizeObserver) new ResizeObserver(set).observe(h);
})();
