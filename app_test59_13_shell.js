/* app_test59_13_shell.js — 左サイドバー＋右メインのレイアウトまわり（ページ名・検索バー・絞り込みタグ・ホームのカードからの遷移） */
const shEl = id => document.getElementById(id);
let dbTagSel = new Set();   // サイドバーで選んだ絞り込みタグ
const PAGE_NAMES = { databaseTab: '🏠 ホーム', postTab: '📝 Discord投稿・編集', ccfoliaTab: '♟️ ココフォリア準備', historyTab: '📜 投稿履歴（全体）' };
(function () {
  const st = switchTab; switchTab = function (tabId, evt) { if (tabId === 'settingsTab') { openSettingsModal(); return; } st(tabId, evt); document.body.dataset.page = tabId; const pn = shEl('pageName'); if (pn) pn.textContent = PAGE_NAMES[tabId] || ''; const m = shEl('mainArea'); if (m) m.scrollTop = 0; };   // 切り替えたら、ページ名を更新して先頭へ
  const rd = renderDBView; renderDBView = function () { rd(); renderSidebarTags(); };   // 一覧を描き直すたびに、タグの一覧も更新
})();
function renderSidebarTags() {
  const box = shEl('sbTags'); if (!box) return; const counts = new Map();
  appState.scenarios.forEach(sc => (sc.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
  const items = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  box.innerHTML = (items.map(([t, n]) => `<button type="button" class="sb-tag${dbTagSel.has(t) ? ' on' : ''}" data-sbtag="${escapeHTML(t)}" aria-pressed="${dbTagSel.has(t)}">${escapeHTML(t)} <span>${n}</span></button>`).join('') || '<span class="sb-empty">タグはまだありません</span>')
    + (dbTagSel.size ? '<button type="button" class="sb-tag clear" data-sbtag-clear="1">✕ 解除</button>' : '');
}
function activateScenario(id) {   // ホームのカードから：そのシナリオを選択して、投稿・編集画面へ
  const sc = appState.scenarios.find(s => s.id === id); if (!sc) return;
  const unsaved = !currentScenarioId && (shEl('title').value.trim() || (blockOrder.some(b => b.type !== 'split' && b.val && String(b.val).trim())));
  const go = () => { loadScenarioFromDB(id); switchTab('postTab'); };
  if (unsaved) appConfirm('作業中の内容（シナリオに保存されていません）が、選んだシナリオの内容で置き換わります。\n続けますか？', { okText: '置き換えて開く', danger: true }).then(ok => { if (ok) go(); }); else go();
}
(function () {
  document.addEventListener('input', e => {
    if (e.target.id !== 'sbSearch') return; const s = shEl('dbSearchInput'); if (!s) return; s.value = e.target.value;
    switchTab('databaseTab'); renderDBView();
  });
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-sbtag],[data-sbtag-clear]'); if (!t) return;
    if (t.dataset.sbtagClear) dbTagSel.clear(); else { const k = t.dataset.sbtag; if (dbTagSel.has(k)) dbTagSel.delete(k); else dbTagSel.add(k); }
    switchTab('databaseTab'); renderDBView();
  });
})();

document.body.dataset.page = 'databaseTab';   // 「フォーム初期化」「入力内容のみクリア」「初期設定」ボタンは、投稿・編集画面（postTab）でだけ表示（CSSの .post-only）

// ----- ⚙️ 初期設定ポップアップ（旧「初期設定」ページを、投稿・編集画面から開くモーダルに） -----
let smOpener = null;
function openSettingsModal() {
  const m = shEl('settingsModal'); if (!m || m.style.display === 'flex') return;
  smOpener = document.activeElement; m.style.display = 'flex'; const b = m.querySelector('.settings-body'); if (b) b.scrollTop = 0;
  if (typeof refreshStorageInfo === 'function') refreshStorageInfo();
  const c = shEl('settingsCloseBtn'); if (c) c.focus();
}
function closeSettingsModal() {
  const m = shEl('settingsModal'); if (!m) return; m.style.display = 'none';
  if (smOpener && smOpener.focus && document.contains(smOpener)) { try { smOpener.focus(); } catch (e) { logSoft('closeSettingsModal', e); } } smOpener = null;
}
(function () {
  const m = shEl('settingsModal'); if (!m) return;
  m.addEventListener('mousedown', e => { if (e.target === m) closeSettingsModal(); });   // 外側クリックで閉じる（設定は入力のたびに自動保存）
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && m.style.display === 'flex' && !document.querySelector('.app-dialog-overlay, .gx-overlay')) { e.stopImmediatePropagation(); closeSettingsModal(); } }, true);
})();
