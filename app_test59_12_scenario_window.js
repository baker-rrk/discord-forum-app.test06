/* app_test59_12_scenario_window.js — シナリオDBの「シナリオウィンドウ」
 * 一覧でシナリオをクリック → ウィンドウ（従来の編集画面と同じ大きさ）に、公開情報と各HOのプレビューを表示する。
 * 「編集」→ 同じウィンドウの中で、投稿作成ページと同じ編集画面（公開情報のブロック＋HOタブ）を使って編集し、保存する。
 * 仕組み：投稿作成ページの部品（プレビュー／入力欄／HOタブ）を、開いている間だけウィンドウへ移して使い回す。
 *         開く前の作業内容は退避しておき、閉じるときに元へ戻す（作業中の投稿内容は失われない）。 */
let swIdx = -1, swMode = 'preview', swSnap = null, swDirty = false, swMoved = [];
const swEl = id => document.getElementById(id);
const swNodes = () => ['hoTabs', 'hoPanel', 'postForm'].map(swEl).concat([document.querySelector('.preview-area')]).filter(Boolean);
function swCapture() {   // 開く前の、投稿作成ページの状態
  const fields = {}; document.querySelectorAll('#postForm [id]').forEach(el => { if (el.closest('#sortableBlockContainer') || !('value' in el)) return; fields[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
  return { blocks: blockOrder, hos: secretHOs, activeHO, cur: currentScenarioId, tags: new Set(activeTagNames), channels: new Set(selectedChannelCols), fields };
}
function swRestore(s) {
  blockOrder = s.blocks; secretHOs = s.hos; activeHO = s.activeHO; currentScenarioId = s.cur; activeTagNames = s.tags; selectedChannelCols = s.channels;
  Object.entries(s.fields).forEach(([id, v]) => { const el = swEl(id); if (!el) return; if (el.type === 'checkbox') el.checked = v; else el.value = v; });
  renderBlockUI(); renderHoAll(); renderChannelCheckboxes(); updateTagCheckboxes(); checkDuplicateStatus(); renderPreview();
}
function swUnplace() {   // 移した部品を、元の場所へ戻す
  swMoved.reverse().forEach(({ n, parent, next }) => { if (next && next.parentNode === parent) parent.insertBefore(n, next); else parent.appendChild(n); }); swMoved = [];
}
function swPlace(mode) {
  const move = (n, to) => { swMoved.push({ n, parent: n.parentNode, next: n.nextSibling }); to.appendChild(n); };
  const win = document.querySelector('.scenario-window'), tabs = swEl('swTabs'), body = swEl('swBody');
  move(swEl('hoTabs'), tabs);
  if (mode === 'edit') { move(swEl('postForm'), body); move(swEl('hoPanel'), body); } else move(document.querySelector('.preview-area'), body);
  win.classList.toggle('sw-editing', mode === 'edit'); win.classList.toggle('sw-preview', mode !== 'edit');
  swEl('swModePreview').classList.toggle('active', mode !== 'edit'); swEl('swModeEdit').classList.toggle('active', mode === 'edit'); swEl('swSave').style.display = mode === 'edit' ? '' : 'none';
  applyHoView(); renderPreview();
}
function swSetMode(mode) { if (swIdx < 0 || mode === swMode) return; swUnplace(); swMode = mode; swPlace(mode); }
function openScenarioWindow(id, mode) {
  if (swIdx >= 0) closeScenarioWindow(true);
  const idx = appState.scenarios.findIndex(s => s.id === id); if (idx < 0) return;
  swIdx = idx; swSnap = swCapture(); window.__editingScenario = true; swDirty = false;
  loadScenarioFromDB(appState.scenarios[idx].id);   // 投稿作成ページと同じ仕組みで読み込む（編集もプレビューも、これを使い回す）
  swMode = mode === 'edit' ? 'edit' : 'preview'; swEl('swTitle').textContent = appState.scenarios[idx].title || 'シナリオ';
  swPlace(swMode); showModal('editScenarioModal'); swEl('editScenarioModal').scrollTop = 0;
}
async function closeScenarioWindow(force) {
  if (swIdx < 0) return;
  if (!force && swMode === 'edit' && swDirty && !(await appConfirm('編集中の内容を破棄して閉じますか？', { okText: '破棄して閉じる', danger: true }))) return;
  swUnplace(); swRestore(swSnap); swEl('editScenarioModal').style.display = 'none'; swIdx = -1; swSnap = null; swDirty = false; window.__editingScenario = false; scheduleDraftSave();
}
async function saveScenarioWindow() {
  const sc = appState.scenarios[swIdx]; if (!sc) return;
  const title = swEl('title').value.trim(); if (!title) return toast('シナリオタイトルを入力してください');
  if (appState.scenarios.some((s, i) => i !== swIdx && titlesSame(s.title, title)) && !(await appConfirm('「' + title + '」という同名のシナリオが既にあります。このまま保存しますか？', { okText: '保存する' }))) return;
  sc.title = title; sc.shopUrl = swEl('topShopUrl').value; sc.trailer = swEl('topTrailer').value; if (swEl('topTrailerDecor')) sc.trailerDecor = swEl('topTrailerDecor').value;
  sc.autoReply = swEl('autoReplyText').value; sc.tags = [...activeTagNames];
  sc.fullBlockData = sanitizeBlocks(JSON.parse(JSON.stringify(blockOrder.map(b => ({ ...b, file: null })))));
  sc.secretHOs = cloneHOs(); deriveFlat(sc);
  saveState(); populateScenarioDBSelect(); renderDBView(); toast('✅ シナリオを更新しました');
  swDirty = false; await closeScenarioWindow(true);
}
function openEditScenarioModal(idx) { const sc = appState.scenarios[idx]; if (sc) openScenarioWindow(sc.id, 'edit'); }   // 一覧の「編集」ボタンから（従来の関数名のまま）
const swGuardDraft = scheduleDraftSave; scheduleDraftSave = function () { if (window.__editingScenario) return; swGuardDraft(); };   // ウィンドウで編集中の内容は、投稿作成ページの下書きに保存しない
(function () {
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-sw]');
    if (b) { const k = b.dataset.sw; if (k === 'close') closeScenarioWindow(); else if (k === 'save') saveScenarioWindow(); else swSetMode(k); return; }
    if (swIdx >= 0 && swMode === 'edit' && e.target.closest('#swBody, #swTabs') && e.target.closest('button, [data-ba], [data-ho-act]')) swDirty = true;
    const card = e.target.closest && e.target.closest('[data-sid]');   // 一覧の行・カードをクリック → プレビュー（ボタンやリンクの上は除く）
    if (card && swIdx < 0 && !e.target.closest('[data-act], a, button, input, select, textarea, label')) openScenarioDetail(card.dataset.sid);   // クリック → 📋 シナリオ詳細（すぐ編集したいときは、カードの「📝 編集」）
  });
  document.addEventListener('input', e => { if (swIdx < 0 || !e.target.closest('#editScenarioModal')) return; if (swMode === 'edit') swDirty = true; if (e.target.id === 'title') swEl('swTitle').textContent = e.target.value || 'シナリオ'; });
  document.addEventListener('change', e => { if (swIdx >= 0 && swMode === 'edit' && e.target.closest('#editScenarioModal')) swDirty = true; });
  document.addEventListener('drop', e => { if (swIdx >= 0 && swMode === 'edit' && e.target.closest('#editScenarioModal')) swDirty = true; }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && swIdx >= 0 && swEl('editScenarioModal').style.display === 'flex' && !document.querySelector('.preview-area.zoomed')) { e.stopImmediatePropagation(); closeScenarioWindow(); } }, true);   // Escでも、部品を元へ戻して閉じる
})();
