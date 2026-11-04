/* app_test59_14_gallery.js — ギャラリー（共通／シナリオ専用）・フォルダ／ZIPのドラッグ＆ドロップ一括登録・画像選択モーダル・投稿履歴モーダル
 * Webブラウザだけで動く。フォルダは FileSystemEntry（webkitGetAsEntry）で、ZIPは DecompressionStream で読み、画像は圧縮して保存する。
 */
const galSel = { scenario: null };   // 選択中のカテゴリ
let galEdit = null;                                  // 名前を変更中のカテゴリ { scope, cat }
let galScOverride = null;   // 拡大表示をホームのカードから開いたとき、その対象シナリオ（投稿・編集画面の選択とは別に扱う）
const galOpen = new Set();   // 開いているカテゴリ（アコーディオン）。キーは「シナリオID|カテゴリ名」
const activeScenario = () => (galScOverride && appState.scenarios.includes(galScOverride)) ? galScOverride : (appState.scenarios.find(s => s.id === currentScenarioId) || null);
function galCtx(scope) {
  const sc = activeScenario(); if (!sc) return null;
  sc.imageCategories = sanitizeCats(sc.imageCategories, DEFAULT_SCENARIO_CATS); if (!Array.isArray(sc.images)) sc.images = [];
  return { cats: sc.imageCategories, items: sc.images, save: () => saveState() };
}
const galCur = (scope, ctx) => { if (!galSel[scope] || !ctx.cats.includes(galSel[scope])) galSel[scope] = ctx.cats[0]; return galSel[scope]; };
function galleryHtml(scope, opts = {}) {   // opts.pick: 画像選択モーダルとして（クリックで選ぶ。編集ボタンは出さない）
  const ctx = galCtx(scope);
  if (!ctx) return '<div class="gal-note">シナリオを「DBに保存」すると、このシナリオ専用の画像素材を管理できます。（ホームでシナリオを選ぶか、投稿・編集画面で「入力中の内容をDBに保存/更新」を押してください）</div>';
  const cur = galCur(scope, ctx), count = c => ctx.items.filter(a => a.category === c).length;
  const cats = ctx.cats.map(c => galEdit && galEdit.scope === scope && galEdit.cat === c
    ? `<span class="gal-cat on"><input type="text" class="gal-rename" data-grename="${escapeHTML(c)}" value="${escapeHTML(c)}" aria-label="フォルダ名"></span>`
    : `<span class="gal-cat${c === cur ? ' on' : ''}" data-gcat="${escapeHTML(c)}" data-gscope="${scope}">${escapeHTML(c)} <small>${count(c)}</small>${opts.pick ? '' : ` <button type="button" class="gal-mini" data-gal="rename" data-gcat="${escapeHTML(c)}" title="名前を変更">✎</button>${ctx.cats.length > 1 ? `<button type="button" class="gal-mini" data-gal="del-cat" data-gcat="${escapeHTML(c)}" title="フォルダを削除">✕</button>` : ''}`}</span>`).join('');
  const items = ctx.items.filter(a => a.category === cur).map(a => `<div class="gal-item" data-gid="${escapeHTML(a.id)}" data-gscope="${scope}"><img ${imgAttr(galUrl(a))} alt="${escapeHTML(a.name)}" loading="lazy"><div class="gal-name" title="${escapeHTML(a.name)}">${escapeHTML(a.name)}</div>${opts.pick ? '' : `<button type="button" class="gal-mini gal-x" data-gal="del-img" data-gid="${escapeHTML(a.id)}" title="削除">✕</button>`}</div>`).join('');
  if (!opts.pick) return galleryAccordionHtml(scope, ctx);
  return `<div class="gal" data-gscope="${scope}">${opts.pick ? '' : '<div class="gal-bar"><button type="button" class="btn btn-secondary btn-sm" data-gal="add-folder" data-gscope="' + scope + '">📁 新規フォルダを追加</button><span class="gal-hint">画像ファイル、または PC の「フォルダ」をここへドラッグ＆ドロップ（フォルダ名のカテゴリを自動で作り、中の画像を一括登録）</span></div>'}<div class="gal-cats">${cats}</div><div class="gal-drop" ${opts.pick ? '' : `data-gdrop="${scope}"`}><div class="gal-grid">${items || '<div class="gal-empty">このフォルダには、まだ画像がありません。</div>'}</div></div></div>`;
}
function galleryAccordionHtml(scope, ctx) {   // 通常画面：カテゴリ（フォルダ）ごとに開閉。開いているカテゴリの画像だけを描く（枚数が多くても重くならない）
  const sc = activeScenario(), sid = sc ? sc.id : '', cur = galCur(scope, ctx);
  if (sid && ![...galOpen].some(k => k.startsWith(sid + '|'))) galOpen.add(sid + '|' + cur);   // 初めて開いたシナリオは、選択中のカテゴリだけ開く
  const accs = ctx.cats.map(c => {
    const list = ctx.items.filter(a => a.category === c), open = galOpen.has(sid + '|' + c);
    const head = galEdit && galEdit.scope === scope && galEdit.cat === c
      ? `<input type="text" class="gal-rename" data-grename="${escapeHTML(c)}" value="${escapeHTML(c)}" aria-label="フォルダ名">`
      : `<span class="gal-acc-name">📁 ${escapeHTML(c)}</span> <small>${list.length}枚</small><span class="gal-acc-btns"><button type="button" class="gal-mini" data-gal="rename" data-gcat="${escapeHTML(c)}" title="名前を変更">✎</button>${ctx.cats.length > 1 ? `<button type="button" class="gal-mini" data-gal="del-cat" data-gcat="${escapeHTML(c)}" title="フォルダを削除">✕</button>` : ''}</span>`;
    const body = open ? `<div class="gal-grid">${list.map(a => `<div class="gal-item" data-gid="${escapeHTML(a.id)}" data-gscope="${scope}"><img ${imgAttr(galUrl(a))} alt="${escapeHTML(a.name)}" loading="lazy"><div class="gal-name" title="${escapeHTML(a.name)}">${escapeHTML(a.name)}</div><button type="button" class="gal-mini gal-x" data-gal="del-img" data-gid="${escapeHTML(a.id)}" title="削除">✕</button></div>`).join('') || '<div class="gal-empty">このフォルダには、まだ画像がありません。ここへ画像・フォルダ・ZIPをドロップして追加できます。</div>'}</div>` : '';
    return `<details class="gal-acc" data-gcat="${escapeHTML(c)}" ${open ? 'open' : ''}><summary class="gal-acc-sum">${head}</summary><div class="gal-acc-body" data-gdrop="${scope}" data-gcat="${escapeHTML(c)}">${body}</div></details>`;
  }).join('');
  return `<div class="gal" data-gscope="${scope}"><div class="gal-bar"><button type="button" class="btn btn-secondary btn-sm" data-gal="add-folder" data-gscope="${scope}">📁 新規フォルダを追加</button><span class="gal-hint">フォルダ（カテゴリ）ごとに開閉できます。画像ファイル・PCのフォルダ・ZIPは、開いたフォルダへドラッグ＆ドロップで登録できます</span></div>${accs}</div>`;
}
document.addEventListener('toggle', e => {   // 開閉の記憶（描き直しても同じ状態を保つ）
  const d = e.target; if (!d || !d.classList || !d.classList.contains('gal-acc')) return;
  const sc = activeScenario(); if (!sc) return; const k = sc.id + '|' + d.dataset.gcat;
  if (d.open === galOpen.has(k)) return;   // 描き直しで作られた要素の通知は無視
  if (d.open) { galOpen.add(k); galSel.scenario = d.dataset.gcat; } else galOpen.delete(k);
  renderGalleryAll();
}, true);
function renderGalleryAll() {
  const sg = document.getElementById('scenarioGallery'); if (sg) { const asc = activeScenario(); sg.innerHTML = '<div class="card-title">🖼️ このシナリオのギャラリー <small class="gal-hint">（シナリオ専用の素材）</small>' + (asc ? '<button type="button" class="btn-sort gal-expand" data-gx="open" data-sid="' + escapeHTML(asc.id) + '" title="大きな画面で、フォルダの整理・画像の移動・一括削除ができます">🗗 拡大表示</button>' : '') + '</div>' + galleryHtml('scenario') + (asc ? scenarioPdfsHtml(asc) : ''); if (asc && typeof markMissingPdfs === 'function') markMissingPdfs(sg); }
  if (typeof gxRender === 'function' && document.getElementById('gxOverlay')) gxRender();
  if (typeof sdRender === 'function' && document.getElementById('sdOverlay')) sdRender();
  const nm = document.getElementById('editScenarioName'); if (nm) { const sc = activeScenario(); nm.textContent = sc ? '選択中：' + (sc.title || '無題') : '（新規・未保存）'; }
  const ge = document.querySelector('.gal-rename'); if (ge) { ge.focus(); ge.select(); }
}
// ----- 画像の読み込み -----
const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
const isImageName = n => IMAGE_EXTS.includes(String(n).split('.').pop().toLowerCase());
const readAsDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
async function imageFileToDataUrl(file) { return file.size > 2.5 * 1024 * 1024 ? compressImage(file, 1920, 1920, 0.88) : readAsDataUrl(file); }   // 大きい画像は縮小して保存
// ----- ドラッグ＆ドロップされたもの（画像ファイル・フォルダ・ZIP）の取り出し -----
function snapshotDrop(dt) {   // ドロップの処理中（同期）に、ファイルとフォルダ（FileSystemEntry）を取り出しておく。中身は、あとで非同期に読む（最初の await より前に呼ぶこと）
  const out = [], items = dt && dt.items ? [...dt.items] : [], files = [...((dt && dt.files) || [])];   // items も files も、同期のうちに配列へ吸い出す（await をはさむと失効する）
  const looksDir = f => !!f && !f.type && !/\.[A-Za-z0-9]{1,6}$/.test(f.name) && (f.size === 0 || f.size % 4096 === 0);   // フォルダを File として渡してくるブラウザの目印
  if (items.some(i => i.kind === 'file')) items.forEach((i, k) => {
    if (i.kind !== 'file') return; let en = null; try { en = typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null; } catch (e) { logSoft('snapshotDrop', e); }
    if (en && en.isDirectory) out.push({ dir: en }); else { let f = null; try { f = i.getAsFile(); } catch (e) { logSoft('snapshotDrop', e); } f = f || files[k]; if (f) out.push(!en && looksDir(f) ? { dirLike: f.name } : { file: f }); }
  });
  else files.forEach(f => out.push(looksDir(f) ? { dirLike: f.name } : { file: f }));
  return out;
}
const readAllEntries = reader => new Promise((res, rej) => {   // readEntries は1回で全件を返さない：空の配列が返るまで繰り返す
  const all = []; let n = 0;
  const step = () => { if (++n > 500) return res(all); try { reader.readEntries(es => { if (!es || !es.length) return res(all); all.push(...es); step(); }, rej); } catch (e) { rej(e); } };
  step();
});
const entryFile = en => new Promise((res, rej) => en.file(res, rej));
const readDirImages = dir => readDirFiles(dir, isImageName);
async function confirmImageRemoval(u) {   // 画像ブロックの「画像を解除」：ギャラリーにも無い（解除すると戻せない）画像のときだけ確認する
  u = String(u || ''); if (!u) return true; const sc = activeScenario();
  if (/^https?:/i.test(u) || (sc && (sc.images || []).some(a => a.dataUrl === u))) return true;
  return appConfirm('この画像を解除しますか？\nギャラリーに登録していない画像は、解除すると元に戻せません（もう一度アップロードが必要です）。', { okText: '解除', danger: true });
}
async function zipExtract(file, { maxFiles = 300, maxEntryBytes = 30 * 1024 * 1024, pdfMaxBytes = 200 * 1024 * 1024, accept = isImageName } = {}) {   // ZIPの中の画像（accept で指定すればPDFも）を、ブラウザだけで取り出す（中央ディレクトリを読み、deflate はブラウザの DecompressionStream で展開）
  const buf = await file.arrayBuffer(), dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1; for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIPとして読めません');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  if (n === 0xffff || p === 0xffffffff) throw new Error('ZIP64形式は未対応です');
  const utf8 = new TextDecoder('utf-8'); let sjis; try { sjis = new TextDecoder('shift_jis'); } catch (e) { sjis = utf8; }
  let canInflate = false; try { canInflate = typeof DecompressionStream === 'function' && !!new DecompressionStream('deflate-raw'); } catch (e) { canInflate = false; }   // 古いSafariなどは未対応
  const out = []; let bad = 0, unsupported = 0, total = 0;
  for (let k = 0; k < n && out.length < maxFiles; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = ((flags & 0x800) ? utf8 : sjis).decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    const base = name.split('/').pop();
    if (name.endsWith('/') || name.startsWith('__MACOSX/') || base.startsWith('.') || !accept(name) || usize > (/\.pdf$/i.test(base) ? pdfMaxBytes : maxEntryBytes) || (flags & 1)) continue;   // フォルダ・隠しファイル・画像以外・巨大・暗号化は除く
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), raw = u8.subarray(start, start + csize);
    if (start < 0 || start + csize > buf.byteLength) { bad++; continue; }   // 壊れたエントリ
    let bytes;
    try {
      if (method === 0) bytes = raw; else if (method === 8) { if (!canInflate) { unsupported++; continue; } bytes = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); } else { unsupported++; continue; }
    } catch (e) { bad++; continue; }   // 1枚が壊れていても、ほかの画像は取り込む
    if (bytes.length > (/\.pdf$/i.test(base) ? pdfMaxBytes : maxEntryBytes)) { bad++; continue; } total += bytes.length; if (total > 600 * 1024 * 1024) break;   // 申告サイズより実際が大きい（ZIP爆弾）／合計が大きすぎる場合の安全弁
    const zf = new File([bytes], base, { type: MIME_BY_EXT[base.split('.').pop().toLowerCase()] || (/\.pdf$/i.test(base) ? 'application/pdf' : 'image/png') }); zf.zipPath = name; out.push(zf);   // zipPath：ZIP内の元のパス（フォルダ分けの判定用）
  }
  if (!out.length && unsupported) throw new Error('このブラウザはZIPの圧縮の展開に未対応です。Safari 16.4以降／Chrome／Edge／Firefoxで開くか、ZIPを解凍してフォルダごとドロップしてください');
  out.sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true })); out.bad = bad + unsupported; return out;
}
const zipImageFiles = (file, o) => zipExtract(file, { ...o, accept: isImageName });   // 画像だけ取り出す従来の呼び方
async function readDirFiles(dirEntry, pred) {   // フォルダ直下のファイル（サブフォルダの中は対象外）。1ファイルが読めなくても、ほかは取り込む（seen：見えた件数／skipped：読めなかった件数）
  const files = []; files.seen = 0; files.skipped = 0;
  for (const en of await readAllEntries(dirEntry.createReader())) { files.seen++; if (en.isFile && pred(en.name) && !en.name.startsWith('.')) { try { files.push(await entryFile(en)); } catch (e) { files.skipped++; logSoft('readDirFiles', e); } } }
  return files.sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
}
async function galleryDrop(scope, dropped) {   // dropped: snapshotDrop() の結果。フォルダ＝フォルダ名のカテゴリ、ZIP＝ZIPの名前のカテゴリへ、中の画像を一括登録
  const ctx = galCtx(scope); if (!ctx) return toast('先にシナリオをDBに保存してください');
  let added = 0, folders = 0, zips = 0, skipped = 0; const pdfFiles = [];
  const addFiles = async (files, cat) => { for (const f of files) { try { ctx.items.push({ id: galId(), name: f.name, dataUrl: await imageFileToDataUrl(f), category: cat }); added++; } catch (e) { logSoft('galleryDrop', e); skipped++; } } };
  if (dropped.some(d => d.dir || (d.file && /\.zip$/i.test(d.file.name)))) toast('📥 読み込んでいます…');
  for (const d of dropped) {
    if (d.dir || d.dirLike) {
      const name = d.dir ? d.dir.name : d.dirLike; let imgs = [], pdfs = [], got = false;
      try { if (d.dir) { imgs = await readDirImages(d.dir); pdfs = scope === 'scenario' ? await readDirFiles(d.dir, isPdfName) : []; got = imgs.length > 0 || pdfs.length > 0 || imgs.seen > 0; } } catch (e) { logSoft('galleryDrop', e); }
      if (!got && typeof folderFallbackFiles === 'function') {   // ドラッグ＆ドロップでは読めない（file:// の制限など）→ フォルダ選択ダイアログへ誘導
        const alt = await folderFallbackFiles(name); if (alt) { const top = alt.filter(x => !String(x.path).includes('/')).map(x => x.file); imgs = top.filter(x => isImageName(x.name)); pdfs = scope === 'scenario' ? top.filter(x => isPdfName(x.name)) : []; got = true; }
      }
      if (!got) { toast('⚠️ フォルダを読み取れませんでした：' + name); skipped++; continue; }
      try { const cat = addCategory(ctx.cats, (typeof SG !== 'undefined' && SG.cleanScenarioName(name)) || name) || ctx.cats[0]; await addFiles(imgs, cat); pdfFiles.push(...pdfs); folders++; galSel[scope] = cat; } catch (e) { logSoft('galleryDrop', e); toast('⚠️ フォルダを読み取れませんでした：' + name); skipped++; }
      continue;
    }
    const f = d.file;
    if (/\.zip$/i.test(f.name)) { try { const all = await zipExtract(f, { accept: n => isImageName(n) || (scope === 'scenario' && isPdfName(n)) }), imgs = Object.assign(all.filter(x => !isPdfName(x.name)), { bad: all.bad }), cat = addCategory(ctx.cats, (typeof SG !== 'undefined' && SG.cleanScenarioName(f.name)) || f.name.replace(/\.zip$/i, '')) || ctx.cats[0]; await addFiles(imgs, cat); pdfFiles.push(...all.filter(x => isPdfName(x.name))); zips++; skipped += imgs.bad || 0; galSel[scope] = cat; } catch (e) { logSoft('galleryDrop', e); toast('⚠️ ZIPを読み取れませんでした：' + f.name + (e && e.message ? '\n' + e.message : '')); skipped++; } continue; }
    if (f.type && f.type.startsWith('image/')) await addFiles([f], galCur(scope, ctx)); else if (scope === 'scenario' && isPdfName(f.name)) pdfFiles.push(f); else skipped++;
  }
  let pdfAdded = 0; if (pdfFiles.length && typeof attachPdfs === 'function') pdfAdded = await attachPdfs(activeScenario(), pdfFiles);
  ctx.save(); renderGalleryAll();
  if (pdfAdded) toast(`✅ PDF ${pdfAdded}件を登録しました` + (added ? `（画像 ${added}枚も登録）` : '')); else toast(added ? `✅ ${added}枚の画像を登録しました${folders ? '（フォルダ ' + folders + ' 件）' : ''}${zips ? '（ZIP ' + zips + ' 件）' : ''}` : '登録できる画像がありませんでした（画像ファイル・フォルダ・ZIPをドロップしてください）');
}
const galUrl = a => a.dataUrl;
async function materializeAsset(a) {   // ギャラリーの画像を、ブロックなどに入れられる形にする
  if (/^(zipview|file):/i.test(a.dataUrl || '')) throw new Error('デスクトップ版で登録された画像のため、Web版では使えません');
  return a.dataUrl;
}
// ----- 画像選択モーダル（シナリオ専用／共通素材） -----
function pickGalleryImage() {
  return new Promise(resolve => {
    if (!activeScenario()) { toast('⚠️ 先にシナリオを「DBに保存」すると、専用ギャラリーから画像を選べます'); return resolve(null); }
    const scope = 'scenario';
    const ov = document.createElement('div'); ov.className = 'app-dialog-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    const box = document.createElement('div'); box.className = 'app-dialog gal-picker'; ov.appendChild(box);
    const done = v => { document.removeEventListener('keydown', onKey, true); ov.remove(); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(null); } };
    const draw = () => { box.innerHTML = `<div class="app-dialog-title">🖼️ ギャラリーから画像を選ぶ</div><div class="gal-tabs"><button type="button" class="gal-tab on" data-ptab="scenario">🎭 このシナリオ専用</button></div><div class="gal-picker-body">${galleryHtml(scope, { pick: true })}</div><div class="app-dialog-actions"><button type="button" class="app-dialog-btn" data-pcancel="1">キャンセル</button></div>`; };
    box.addEventListener('click', e => {
      const t = e.target.closest('[data-ptab]'); if (t) return;
      if (e.target.closest('[data-pcancel]')) return done(null);
      const c = e.target.closest('[data-gcat]'); if (c) { galSel[scope] = c.dataset.gcat; draw(); return; }
      const it = e.target.closest('.gal-item'); if (it) { const ctx = galCtx(scope), a = ctx && ctx.items.find(x => x.id === it.dataset.gid); if (a) materializeAsset(a).then(done).catch(err => { logSoft('pick', err); toast('⚠️ 画像を読み込めませんでした：' + (err && err.message || '')); }); }
    });
    ov.addEventListener('mousedown', e => { if (e.target === ov) done(null); });
    draw(); document.body.appendChild(ov); document.addEventListener('keydown', onKey, true);
  });
}
async function pickBotAvatarFromGallery() {
  const url = await pickGalleryImage(); if (!url) return;
  try { const blob = await (await fetchRetry(url, {}, 1, 20000)).blob(); await setBotAvatar(new File([blob], 'avatar.png', { type: blob.type || 'image/png' })); } catch (e) { logSoft('pickBotAvatar', e); toast('⚠️ 画像を読み込めませんでした'); }
}
// ----- 投稿履歴モーダル（選択中のシナリオの postedChannels／postedInfo と、投稿の記録） -----
function openHistoryModal() {
  const sc = activeScenario(), ov = document.createElement('div'); ov.className = 'app-dialog-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  const box = document.createElement('div'); box.className = 'app-dialog hist-modal'; ov.appendChild(box);
  const done = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(); } };
  let body;
  if (!sc) body = '<div class="gal-note">投稿履歴は、シナリオをDBに保存すると見られます。ホームでシナリオを選ぶか、「入力中の内容をDBに保存/更新」を押してください。</div>';
  else {
    const pc = (sc.postedChannels || []).map(id => { const i = (sc.postedInfo || {})[id] || {}, c = chById(id); return `<tr><td>${escapeHTML(i.name || (c && c.name) || id)}</td><td>${escapeHTML(i.date ? fmtDate(i.date) : '-')}</td><td>${escapeHTML((i.tags || []).join(', ') || '-')}</td></tr>`; }).join('');
    const hist = (appState.history || []).filter(h => titlesSame(h.title, sc.title)).slice().reverse(), HCAP = 50;   // 多い場合は新しい順に50件まで（残りは全体の履歴で検索）
    const histRows = hist.slice(0, HCAP).map(h => `<tr><td>${escapeHTML(fmtDate(h.date))}</td><td>${escapeHTML(h.channels || '-')}</td><td>${threadLinksHtml(h) || '-'}</td></tr>`).join('') + (hist.length > HCAP ? `<tr><td colspan="3" style="text-align:center;color:var(--dc-text-muted);">ほか ${hist.length - HCAP} 件（「すべての投稿履歴（全体）」で検索できます）</td></tr>` : '');
    body = `<div class="hist-sub">📌 投稿済みのチャンネル</div>${pc ? `<table class="hist-table"><thead><tr><th>チャンネル</th><th>最終投稿</th><th>タグ</th></tr></thead><tbody>${pc}</tbody></table>` : '<div class="gal-empty">まだどのチャンネルにも投稿していません。</div>'}<div class="hist-sub">🕒 投稿の記録</div>${hist.length ? `<table class="hist-table"><thead><tr><th>日時</th><th>チャンネル</th><th>スレッド</th></tr></thead><tbody>${histRows}</tbody></table>` : '<div class="gal-empty">このシナリオの投稿記録はありません。</div>'}`;
  }
  box.innerHTML = `<div class="app-dialog-title">📜 投稿履歴${sc ? ' — ' + escapeHTML(sc.title || '無題') : ''}</div><div class="hist-body">${body}</div><div class="app-dialog-actions"><button type="button" class="app-dialog-btn" data-hall="1">すべての投稿履歴（全体）を開く</button><button type="button" class="app-dialog-btn primary" data-hclose="1">閉じる</button></div>`;
  box.addEventListener('click', e => { if (e.target.closest('[data-hclose]')) done(); else if (e.target.closest('[data-hall]')) { done(); switchTab('historyTab'); } });
  ov.addEventListener('mousedown', e => { if (e.target === ov) done(); });
  document.body.appendChild(ov); document.addEventListener('keydown', onKey, true); const b = box.querySelector('.primary'); if (b) b.focus();
}
// ----- 操作（クリック・名前変更・ドラッグ＆ドロップ） -----
(function () {
  const commitRename = (input) => {
    if (!galEdit) return; const { scope, cat } = galEdit, ctx = galCtx(scope); galEdit = null; if (!ctx) return renderGalleryAll();
    const nn = input.value.trim(); if (nn && nn !== cat && !ctx.cats.includes(nn)) { ctx.cats[ctx.cats.indexOf(cat)] = nn; ctx.items.forEach(a => { if (a.category === cat) a.category = nn; }); if (galSel[scope] === cat) galSel[scope] = nn; ctx.save(); } else if (nn && nn !== cat) toast('同じ名前のフォルダが既にあります');
    renderGalleryAll();
  };
  document.addEventListener('click', async e => {
    if (e.target.closest('.gal-picker')) return;
    const g = e.target.closest('[data-gal]');
    if (g) { const k = g.dataset.gal, scope = g.dataset.gscope || (g.closest('[data-gscope]') || {}).dataset?.gscope || 'scenario', ctx = galCtx(scope); if (!ctx) return;
      if (k === 'add-folder') { const n = uniqueCategory(ctx.cats, '新しいフォルダ'); ctx.cats.push(n); galSel[scope] = n; galEdit = { scope, cat: n }; ctx.save(); renderGalleryAll(); }   // 追加すると、すぐ名前を入力できる
      else if (k === 'rename') { galEdit = { scope, cat: g.dataset.gcat }; renderGalleryAll(); }
      else if (k === 'del-cat') { const c = g.dataset.gcat, n = ctx.items.filter(a => a.category === c).length; if (!(await appConfirm('フォルダ「' + c + '」を削除しますか？' + (n ? '\n中の画像 ' + n + ' 枚は、先頭のフォルダへ移します。' : ''), { okText: '削除', danger: true }))) return; const rest = ctx.cats.filter(x => x !== c); ctx.items.forEach(a => { if (a.category === c) a.category = rest[0]; }); ctx.cats.splice(0, ctx.cats.length, ...rest); galSel[scope] = rest[0]; ctx.save(); renderGalleryAll(); }
      else if (k === 'del-img') { const a0 = ctx.items.find(a => a.id === g.dataset.gid); if (!a0) return; if (!(await appConfirm('画像「' + (a0.name || '無題') + '」をギャラリーから削除しますか？\nこの操作は元に戻せません。', { okText: '削除', danger: true }))) return; const i = ctx.items.findIndex(a => a.id === g.dataset.gid); if (i >= 0) { ctx.items.splice(i, 1); ctx.save(); renderGalleryAll(); } }   // 誤クリックで即消えないよう確認
      return; }
    const c = e.target.closest('.gal-cat[data-gcat]'); if (c && !e.target.closest('input')) { const scope = c.dataset.gscope; galSel[scope] = c.dataset.gcat; renderGalleryAll(); }
  });
  document.addEventListener('keydown', e => { const i = e.target.closest && e.target.closest('.gal-rename'); if (!i) return; if (e.key === 'Enter') { e.preventDefault(); commitRename(i); } else if (e.key === 'Escape') { e.stopImmediatePropagation(); galEdit = null; renderGalleryAll(); } }, true);
  document.addEventListener('focusout', e => { const i = e.target.closest && e.target.closest('.gal-rename'); if (i && galEdit) commitRename(i); });
  const zoneOf = e => e.target.closest && e.target.closest('[data-gdrop]');
  document.addEventListener('dragover', e => { const z = zoneOf(e); if (z && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); z.classList.add('dragover'); } });
  document.addEventListener('dragleave', e => { const z = zoneOf(e); if (z && !(e.relatedTarget && z.contains(e.relatedTarget))) z.classList.remove('dragover'); });
  document.addEventListener('drop', async e => {
    const z = zoneOf(e); if (!z || !e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault(); e.stopPropagation(); z.classList.remove('dragover'); if (z.dataset.gcat) galSel[z.dataset.gdrop] = z.dataset.gcat; await galleryDrop(z.dataset.gdrop, snapshotDrop(e.dataTransfer));
  }, true);
  // 画面が切り替わる・シナリオが変わるたびに、ギャラリー等を描き直す
  const hookAfter = (name, fn) => { const o = globalThis[name]; globalThis[name] = function (...a) { const r = o.apply(this, a); if (r && typeof r.then === 'function') return r.then(v => { fn(); return v; }); fn(); return r; }; };
  ['switchTab', 'loadScenarioFromDB', 'saveCurrentToDB', 'autoSyncToDBOnPost', 'resetForm', 'resetInputs', 'deleteScenarioDB'].forEach(n => { if (typeof globalThis[n] === 'function') hookAfter(n, renderGalleryAll); });
  renderGalleryAll();
})();
