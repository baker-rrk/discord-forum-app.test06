/* app_test59_16_asset_store.js — 大容量データの保存基盤（ハイブリッド保存）と、容量の見える化
 *
 * ■ 保存先の使い分け
 *   ・軽量なJSON（シナリオのテキスト・設定・カテゴリ構造・今後のココフォリア駒データ）
 *       → appState。端末内は IndexedDB の 'kv' ストア（localStorage の5MB制限を受けない）／クラウド同期は Firebase。
 *   ・画像の実体
 *       → IndexedDB の 'images'（原寸）と 'thumbs'（サムネイル）。appState には '@img:<ハッシュ>' という参照だけを保存する
 *         （02_storage_images.js。画面に出たとき・投稿時に、非同期で取り出す）。クラウドへは1枚ずつ別ドキュメントで同期。
 *   ・PDFなど画像以外の大容量バイナリ（今後追加）
 *       → IndexedDB の 'assets' ストア。appState には '@asset:<assetId>' という参照だけを保存する（下の assetStore）。
 *         端末内のみ。Firebase（1ドキュメント1MB）には載せない。
 * ■ 既存データの移行
 *   旧版の localStorage の保存データは、起動時に IndexedDB へ移行済み（05_channels_save_sync.js）。
 *   さらに、データの中に画像の実体（data:image/…）が残っている場合は、起動後に参照へ置き換えて保存し直す（migrateInlineImages）。 */

// ----- 汎用バイナリ保存（assetStore） -----
const ASSET_MAX_BYTES = 200 * 1024 * 1024;   // 1ファイルの上限（ブラウザの端末内保存。大きすぎる誤操作を防ぐ）
const ASSET_REF_RE = /^@asset:(ast_[a-z0-9]{8,24})$/;
const newAssetId = () => 'ast_' + [...crypto.getRandomValues(new Uint8Array(8))].map(b => (b % 36).toString(36)).join('');
const assetRef = id => '@asset:' + id;
const assetIdOf = ref => { const m = ASSET_REF_RE.exec(String(ref || '')); return m ? m[1] : (/^ast_[a-z0-9]{8,24}$/.test(String(ref || '')) ? String(ref) : null); };
window.assetStore = {
  // file: File/Blob。meta.name を省略するとファイル名を使う。戻り値は assetId（appState には assetRef(id) を保存）
  async put(file, meta) {
    if (!(file instanceof Blob)) throw new Error('保存できるのはファイル（Blob）だけです');
    const name = String((meta && meta.name) || file.name || 'file').replace(/[\u0000-\u001f\\/]/g, '_').slice(0, 200);
    if (isDangerousName(name)) throw new Error('実行ファイルの種類は保存できません：' + name);
    if (file.size > ASSET_MAX_BYTES) throw new Error('ファイルが大きすぎます（上限 ' + Math.round(ASSET_MAX_BYTES / 1048576) + 'MB）：' + name);
    const id = newAssetId();
    try { await idbPut('assets', id, { blob: file, name, type: String(file.type || 'application/octet-stream'), size: file.size, createdAt: Date.now() }); }
    catch (e) { throw new Error(e && e.name === 'QuotaExceededError' ? 'ブラウザの保存容量が足りません。不要なデータを削除してください。' : '保存に失敗しました：' + (e && e.message || e)); }
    return id;
  },
  async get(idOrRef) { const id = assetIdOf(idOrRef); if (!id) return null; const r = await idbGet('assets', id); return r && r.blob instanceof Blob ? { id, blob: r.blob, name: r.name, type: r.type, size: r.size, createdAt: r.createdAt } : null; },
  async remove(idOrRef) { const id = assetIdOf(idOrRef); if (!id) return false; const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete(id); tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => rej(tx.error); }); },
  async list() {   // 中身（Blob）は読まずに、一覧の情報だけ返す
    const db = await idbOpen();
    return new Promise((res, rej) => { const out = [], r = db.transaction('assets').objectStore('assets').openCursor(); r.onsuccess = () => { const c = r.result; if (c) { const v = c.value || {}; out.push({ id: c.key, name: v.name, type: v.type, size: v.size, createdAt: v.createdAt }); c.continue(); } else res(out); }; r.onerror = () => rej(r.error); });
  }
};

// ----- 旧データの移行：データの中に残った画像の実体（data:image/…）を、IndexedDB の参照へ置き換える -----
function countInlineImages(o, depth) {
  if (!o || typeof o !== 'object' || (depth || 0) > 40 || o instanceof Blob) return 0; let n = 0;
  for (const k in o) { const v = o[k]; if (typeof v === 'string') { if (k !== 'botAvatarData' && v.startsWith('data:image/')) n++; } else if (v && typeof v === 'object') n += countInlineImages(v, (depth || 0) + 1); }
  return n;
}
async function migrateInlineImages() {
  try {
    const n = countInlineImages(appState); if (!n) return;
    saveState();   // 保存時に、画像は 'images' ストアへ移され、appState には参照だけが書かれる
    await window.imgFlush();
    toast(`✅ ${n}枚の画像を、ブラウザ内のデータベース（IndexedDB）へ移しました`);
  } catch (e) { logSoft('migrateInlineImages', e); }
}

// ----- 容量の見える化と、保存の永続化 -----
const fmtBytes = n => n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
let storageWarned = false;
async function refreshStorageInfo() {
  const box = document.getElementById('storageInfo'); if (!box) return;
  try {
    if (!(navigator.storage && navigator.storage.estimate)) { box.textContent = ''; return; }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate(), pct = quota ? usage / quota * 100 : 0;
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    box.innerHTML = `💽 このブラウザでの使用量：<b>${fmtBytes(usage)}</b>${quota ? ` / 上限の目安 ${fmtBytes(quota)}（${pct < 0.1 ? '0.1% 未満' : pct.toFixed(1) + '%'}）` : ''}`
      + (persisted === true ? ' ・ 🔒 自動削除されない設定' : persisted === false ? ' ・ ⚠️ ブラウザの空き容量不足のとき自動削除される可能性があります（定期的に「JSONに保存」でバックアップしてください）' : '')
      + '<br><small>画像・PDFなどの大きなデータは、この端末のブラウザ内データベース（IndexedDB）に保存しています。クラウド同期の対象は、テキスト・設定・画像です（PDFなどは端末内のみ）。</small>';
    if (pct >= 80 && !storageWarned) { storageWarned = true; toast('⚠️ ブラウザの保存容量の使用が80%を超えています。不要な画像を整理するか、バックアップを取ってください。'); }
  } catch (e) { logSoft('refreshStorageInfo', e); }
}
(function () {
  if (window.appReady) window.appReady.then(() => {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(() => refreshStorageInfo(), () => {}); } catch (e) { logSoft('persist', e); }   // 容量不足でもデータを自動削除されにくくする（許可はブラウザが判断）
    setTimeout(migrateInlineImages, 1200); setTimeout(refreshStorageInfo, 1500);
  });
})();
