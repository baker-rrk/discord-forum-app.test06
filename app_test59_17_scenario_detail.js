/* app_test59_17_scenario_detail.js — 📋 シナリオ詳細モーダル
 * ホームのカード／一覧の行をクリックすると開く。概要・スペック、同梱ファイル・素材（ギャラリー）、アクションボタンをまとめて見せる。
 *  ・すぐ編集したいときは、カードの「📝 編集」ボタン（Discord投稿・編集画面で開く）
 *  ・このモーダルへ画像・フォルダ・ZIPをドロップすると、シナリオ専用ギャラリーへ追加できる（登録処理は 14_gallery.js の galleryDrop）
 *  ・PDFの登録枠は STEP 2 以降用（sc.pdfs が配列で入ったら一覧表示する）
 *  ・アクションの追加：SD_EXTRA_ACTIONS に { id, label, title, run(sc) } を足すだけ（例：STEP 3 の「♟️ ココフォリア準備で開く」） */
let sdId = null, sdOpener = null;
const SD_EXTRA_ACTIONS = [];   // 将来のアクション用の差し込み口（ここへ push すると、モーダルの下部に並ぶ）
const sdEl = () => document.getElementById('sdOverlay');
const sdSc = () => appState.scenarios.find(s => s.id === sdId) || null;

function openScenarioDetail(id) {
  const sc = appState.scenarios.find(s => s.id === id); if (!sc) return;
  if (sdEl()) closeScenarioDetail();
  sdOpener = document.activeElement; sdId = id; galScOverride = sc;   // 素材の追加・履歴の表示が、このシナリオを対象にする
  const ov = document.createElement('div'); ov.id = 'sdOverlay'; ov.className = 'sd-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'シナリオ詳細');
  document.body.appendChild(ov); sdRender();
  const c = ov.querySelector('[data-sd="close"]'); if (c) c.focus();
}
function closeScenarioDetail() {
  const ov = sdEl(); if (!ov) return; ov.remove(); sdId = null; if (!document.getElementById('gxOverlay')) galScOverride = null;
  if (sdOpener && document.contains(sdOpener) && sdOpener.focus) { try { sdOpener.focus(); } catch (e) { logSoft('closeScenarioDetail', e); } } sdOpener = null;
  if (typeof renderGalleryAll === 'function') renderGalleryAll();
}
function sdRender() {
  const ov = sdEl(), sc = sdSc(); if (!ov) return; if (!sc) return closeScenarioDetail();
  const e = escapeHTML, cats = sanitizeCats(sc.imageCategories, DEFAULT_SCENARIO_CATS), images = Array.isArray(sc.images) ? sc.images : [];
  if (galSel.scenario && !cats.includes(galSel.scenario)) galSel.scenario = cats[0];
  const dropCat = cats.includes(galSel.scenario) ? galSel.scenario : cats[0];
  const posted = (sc.postedChannels || []).length;
  const specs = Object.entries(typeof FLAT_MAP !== 'undefined' ? FLAT_MAP : {}).filter(([, f]) => String(sc[f] || '').trim()).map(([label, f]) => `<div class="sd-spec-row"><dt>${e(label)}</dt><dd>${e(sc[f])}</dd></div>`).join('');
  const tags = (sc.tags || []).map(t => `<span class="sd-tag">🏷️ ${e(t)}</span>`).join('');
  const hos = (sc.secretHOs || []).filter(h => h && typeof h === 'object');
  const gallery = cats.map(c => { const list = images.filter(a => a.category === c);
    return `<div class="sd-cat"><div class="sd-cat-head"><span>📁 ${e(c)}</span><small>${list.length}枚</small></div>${list.length ? `<div class="sd-thumbs">${list.slice(0, 8).map(a => `<img ${imgAttr(galUrl(a))} alt="${e(a.name)}" title="${e(a.name)}" loading="lazy">`).join('')}${list.length > 8 ? `<span class="sd-more">+${list.length - 8}</span>` : ''}</div>` : '<div class="sd-cat-empty">画像なし</div>'}</div>`; }).join('');
  const extra = SD_EXTRA_ACTIONS.map(a => `<button type="button" class="btn btn-secondary" data-sd-x="${e(a.id)}" title="${e(a.title || '')}">${e(a.label)}</button>`).join('');
  ov.innerHTML = `<div class="sd-window">
    <div class="sd-head"><div class="sd-title">📋 シナリオ詳細</div><button type="button" class="btn-sort" data-sd="close">✕ 閉じる</button></div>
    <div class="sd-body">
      <section class="sd-hero">
        <div class="sd-thumb">${sc.imageUrl ? `<img ${imgAttr(sc.imageUrl)} alt="トレーラー画像">` : '<div class="sd-thumb-empty">🖼️<small>トレーラー画像なし</small></div>'}</div>
        <div class="sd-hero-info">
          <h2 class="sd-name">${sc.favorite ? '<span class="sd-fav">★</span> ' : ''}${e(sc.title || '無題')}</h2>
          <div class="sd-tags">${tags || '<span class="sd-muted">タグなし</span>'}</div>
          <div class="sd-status">${posted ? `<span class="badge badge-posted">✓ 投稿済 (${posted})</span>` : '<span class="badge badge-unposted">未投稿</span>'}${safeUrl(sc.shopUrl) ? ` <a href="${e(safeUrl(sc.shopUrl))}" target="_blank" rel="noopener noreferrer" class="sd-link">🔗 ショップを開く</a>` : ''}</div>
        </div>
      </section>
      <div class="sd-grid">
        <section class="sd-card"><h3>📌 基本情報</h3>${specs ? `<dl class="sd-spec">${specs}</dl>` : '<div class="sd-muted">入力済みの基本項目はありません</div>'}</section>
        <section class="sd-card"><h3>🎭 秘匿HO <small>${hos.length}件</small></h3>${hos.length ? `<ul class="sd-ho">${hos.map(h => `<li><b>${e(h.name || 'HO')}</b>${h.tagline ? `<span>${e(h.tagline)}</span>` : ''}</li>`).join('')}</ul>` : '<div class="sd-muted">秘匿HOはありません</div>'}</section>
        <section class="sd-card sd-wide"><h3>📖 あらすじ・備考</h3>${String(sc.trailer || '').trim() ? `<div class="sd-text">${e(sc.trailer)}</div>` : '<div class="sd-muted">あらすじ（トレーラー）は未入力です</div>'}${String(sc.notes || '').trim() ? `<div class="sd-sub">注意事項・備考</div><div class="sd-text">${e(sc.notes)}</div>` : ''}</section>
      </div>
      <section class="sd-card sd-files"><div class="sd-card-head"><h3>📁 同梱ファイル・素材 <small>画像 ${images.length}枚</small></h3><button type="button" class="btn-sort" data-sd="gallery">🗗 拡大表示</button></div>
        <div class="sd-cats">${gallery}</div>
        ${scenarioPdfsHtml(sc)}
        <div class="sd-drop" data-gdrop="scenario" data-gcat="${e(dropCat)}"><div class="sd-drop-text">⬇️ ここへ画像・フォルダ・ZIPをドロップして素材を追加</div><label class="sd-drop-cat">追加先：<select data-sd-cat aria-label="追加先のカテゴリ">${cats.map(c => `<option value="${e(c)}" ${c === dropCat ? 'selected' : ''}>${e(c)}</option>`).join('')}</select></label></div>
      </section>
    </div>
    <div class="sd-actions"><div class="sd-actions-main"><button type="button" class="btn" data-sd="open">📝 Discord投稿・編集画面で開く</button><button type="button" class="btn btn-secondary" data-sd="gallery">🗗 素材ギャラリーを整理</button><button type="button" class="btn btn-secondary" data-sd="history">📜 投稿履歴を見る</button></div><div class="sd-actions-extra" data-slot="extra">${extra}</div></div>
  </div>`;
  if (typeof markMissingPdfs === 'function') markMissingPdfs(ov);
}
(function () {
  document.addEventListener('click', e => {
    const ov = sdEl(); if (!ov || !ov.contains(e.target)) return;
    if (e.target === ov) return closeScenarioDetail();   // 外側クリックで閉じる
    const x = e.target.closest('[data-sd-x]');
    if (x) { const a = SD_EXTRA_ACTIONS.find(v => v.id === x.dataset.sdX), sc = sdSc(); if (a && sc) a.run(sc); return; }
    const b = e.target.closest('[data-sd]'); if (!b) return; const k = b.dataset.sd, sc = sdSc(); if (!sc) return;
    if (k === 'close') closeScenarioDetail();
    else if (k === 'open') { const id = sc.id; closeScenarioDetail(); activateScenario(id); }   // 作業中の未保存内容があれば、ここで確認が出る
    else if (k === 'gallery') openGalleryExplorer(sc.id);
    else if (k === 'history') openHistoryModal();
  });
  document.addEventListener('change', e => { if (e.target && e.target.matches && e.target.matches('#sdOverlay [data-sd-cat]')) { galSel.scenario = e.target.value; const z = e.target.closest('.sd-drop'); if (z) z.dataset.gcat = e.target.value; } });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !sdEl() || document.querySelector('.app-dialog-overlay, .gx-overlay, #gxLightbox')) return;
    e.stopImmediatePropagation(); closeScenarioDetail();
  }, true);
})();
