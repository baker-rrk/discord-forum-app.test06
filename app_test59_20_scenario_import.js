/* app_test59_20_scenario_import.js — STEP 2：PDF・フォルダ・ZIPのドロップ → シナリオの自動推測・登録・マージ
 *  ・pdf.js（CDN）でPDFの序盤の文字を読み、19_scenario_guess.js の SG でタイトル・スペックを推測
 *  ・PDF本体は IndexedDB（assetStore）に保存し、シナリオには sc.pdfs（参照キー assetId だけの軽いJSON）で紐づける
 *  ・ホーム／投稿・編集画面の全体がドロップ先。1件だけなら登録後に投稿・編集画面へ、複数件ならホームに留まって一括登録
 *  ・同名シナリオ（クレンジング後）があれば、新規作成せず「素材のマージ」を確認
 *  ・pdf.js が読めない（オフラインなど）場合も、PDFの保存・紐づけは行い、スペックの推測だけを諦める */

const isPdfName = n => /\.pdf$/i.test(String(n));
const importState = { busy: false };

// ===== 1. pdf.js の読み込み（index.html の <script defer> → 未読込なら待って、5秒たっても無ければ読み込み直す） =====
const PDFJS_VERSION = '3.11.174', PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/';
let pdfjsLoading = null, pdfjsFailedAt = 0;
function pdfjsReady() {
  const lib = window.pdfjsLib; if (!lib) return null;
  try { if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js'; } catch (e) { logSoft('pdfjsReady', e); }
  return lib;
}
function loadPdfJs() {
  const lib = pdfjsReady(); if (lib) return Promise.resolve(lib);
  if (Date.now() - pdfjsFailedAt < 60000) return Promise.reject(new Error('pdf.js を読み込めませんでした（ネットワークをご確認ください）'));   // 直前に失敗していたら、待たずに諦める
  if (!pdfjsLoading) pdfjsLoading = new Promise((resolve, reject) => {
    const t0 = Date.now(); let injected = false;
    const tick = () => {
      const l = pdfjsReady(); if (l) { pdfjsLoading = null; return resolve(l); }
      if (!injected && Date.now() - t0 > 5000) { injected = true; const s = document.createElement('script'); s.src = PDFJS_BASE + 'pdf.min.js'; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; s.dataset.pdfjs = 'retry'; document.head.appendChild(s); }
      if (Date.now() - t0 > 20000) { pdfjsLoading = null; pdfjsFailedAt = Date.now(); return reject(new Error('pdf.js を読み込めませんでした（ネットワークをご確認ください）')); }
      setTimeout(tick, 150);
    }; tick();
  });
  return pdfjsLoading;
}
// pdf.js に渡す共通の設定。cMap（日本語の文字コード表）と標準フォントは、PDFに埋め込まれていない文字を読むために必要（CDNから取得）
const PDFJS_RES = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VERSION + '/';
const pdfOpenOptions = data => ({ data, isEvalSupported: false, enableXfa: false, cMapUrl: PDFJS_RES + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS_RES + 'standard_fonts/' });
const withTimeout = (p, ms, msg) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(msg || 'timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });

// PDFの序盤（既定5ページ）の文字と、1〜2ページ目の最大フォントの文字列を取り出す
async function analyzePdfFile(file, { maxPages = 5 } = {}) {
  const lib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());   // pdf.js に渡す分は別のコピー（保存するファイル自体は触らない）
  const task = lib.getDocument({ ...pdfOpenOptions(data), disableFontFace: true });
  let doc; try { doc = await withTimeout(task.promise, 30000, 'PDFを開けませんでした（時間切れ）'); } catch (e) { try { task.destroy(); } catch (x) { logSoft('analyzePdfFile', x); } throw e; }
  try {
    const n = Math.min(doc.numPages, maxPages), texts = [], big = [];
    for (let p = 1; p <= n; p++) {
      const page = await withTimeout(doc.getPage(p), 15000, 'ページを読めませんでした'), tc = await withTimeout(page.getTextContent(), 15000, '文字を読めませんでした');
      texts.push(SG.itemsToText(tc.items)); if (p <= 2) big.push({ page: p, items: tc.items });
      try { page.cleanup(); } catch (e) { logSoft('analyzePdfFile', e); }
    }
    return { text: texts.join('\n'), title: SG.biggestText(big), numPages: doc.numPages };
  } finally { try { await doc.destroy(); } catch (e) { logSoft('analyzePdfFile', e); } }
}

async function openPdfDocument(blob) {   // ビューア用：PDFを開いて PDFDocumentProxy を返す（STEP 3）
  const lib = await loadPdfJs(), data = new Uint8Array(await blob.arrayBuffer()), task = lib.getDocument(pdfOpenOptions(data));
  try { return await withTimeout(task.promise, 30000, 'PDFを開けませんでした（時間切れ）'); } catch (e) { try { task.destroy(); } catch (x) { logSoft('openPdfDocument', x); } throw e; }
}

// ===== 2. ドロップされたものを「シナリオの単位」にまとめる =====
async function readDirTree(dirEntry, { maxFiles = 400, maxDepth = 4 } = {}) {   // フォルダの中の画像・PDF（サブフォルダも）。1ファイル・1サブフォルダが読めなくても、ほかは取り込む
  const out = []; out.seen = 0; out.skipped = 0;   // seen：見えたエントリ数／skipped：読めなかった件数
  const walk = async (dir, rel, depth, isRoot) => {
    let entries; try { entries = await readAllEntries(dir.createReader()); } catch (e) { logSoft('readDirTree', e); if (isRoot) throw e; out.skipped++; return; }   // ルートが読めないときだけ、呼び出し側へ（セキュリティ制限などの検知）
    out.seen += entries.length;
    for (const en of entries) {
      if (out.length >= maxFiles) return; if (en.name.startsWith('.') || en.name === '__MACOSX') continue;
      if (en.isFile) { if (isImageName(en.name) || isPdfName(en.name)) { try { out.push({ path: rel + en.name, file: await entryFile(en) }); } catch (e) { logSoft('readDirTree.file', e); out.skipped++; } } }
      else if (en.isDirectory && depth < maxDepth) await walk(en, rel + en.name + '/', depth + 1, false);
    }
  };
  await walk(dirEntry, '', 0, true); return out;
}
// ドラッグ＆ドロップでフォルダを読めないとき（file:// のセキュリティ制限など）の代わり：フォルダ選択ダイアログ
function unitsFromFileList(list) {   // <input webkitdirectory> や複数ファイル選択の結果 → buildUnits に渡せる形
  const out = [], groups = new Map();
  [...list].forEach(f => {
    const parts = String(f.webkitRelativePath || '').split('/').filter(Boolean);
    if (parts.length >= 2) {
      const root = parts[0], sub = parts.slice(1); if (!groups.has(root)) groups.set(root, []);
      if (!sub.some(p => p.startsWith('.') || p === '__MACOSX') && (isImageName(f.name) || isPdfName(f.name))) groups.get(root).push({ path: sub.join('/'), file: f });
    } else out.push({ file: f });
  });
  groups.forEach((files, name) => out.unshift({ dirFiles: { name, files: files.slice(0, 400) } }));
  return out;
}
function pickFilesViaInput({ folder = false, accept = '' } = {}) {   // ダイアログで選ばせる。キャンセル（cancelイベント、または戻ってきても選択なし）なら空の配列
  return new Promise(resolve => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.style.display = 'none'; if (folder) inp.webkitdirectory = true; if (accept) inp.accept = accept;
    document.body.appendChild(inp); let done = false;
    const fin = v => { if (done) return; done = true; window.removeEventListener('focus', onFocus); inp.remove(); resolve(v); };
    const onFocus = () => setTimeout(() => { if (!inp.files || !inp.files.length) fin([]); }, 800);   // cancel を送らないブラウザ向け：ダイアログから戻っても選択が無ければ中止扱い
    inp.addEventListener('change', () => fin([...inp.files])); inp.addEventListener('cancel', () => fin([])); window.addEventListener('focus', onFocus, { once: true });
    inp.click();
  });
}
async function folderFallbackFiles(name) {   // 戻り値：[{ path, file }]（フォルダの中身。選べなければ null）
  const viaFile = location.protocol === 'file:';
  const ok = await appConfirm(`フォルダ「${name}」を、ドラッグ＆ドロップでは読み取れませんでした。` + (viaFile ? '\n（HTMLをファイルとして直接開いているため、ブラウザのセキュリティ制限で拒否されることがあります）' : '') + '\n\n「フォルダを選ぶ」から、ダイアログでフォルダを選んでください。\nまたは、アプリを http://localhost などのローカルサーバー経由で開くと、ドラッグ＆ドロップで読める場合があります。', { okText: '📁 フォルダを選ぶ' });
  if (!ok) return null;
  const grp = unitsFromFileList(await pickFilesViaInput({ folder: true })).find(d => d.dirFiles); return grp ? grp.dirFiles.files : null;
}
async function buildUnits(dropped) {   // snapshotDrop() の結果 → { units: [{ kind, name, files:[{path,file}] }], loose（単独の画像）, problems, fallbacks（読めなかったフォルダ） }
  const units = [], loose = [], problems = [], fallbacks = [];
  for (const d of dropped) {
    if (d.dirFiles) { units.push({ kind: 'dir', name: d.dirFiles.name, files: d.dirFiles.files }); if (!d.dirFiles.files.length) problems.push('フォルダ「' + d.dirFiles.name + '」に画像・PDFがありません'); continue; }
    if (d.dir || d.dirLike) {
      const name = d.dir ? d.dir.name : d.dirLike;
      try {
        if (!d.dir) throw new Error('フォルダの中身を取り出せないドロップです');
        const files = await readDirTree(d.dir);
        if (files.length) { units.push({ kind: 'dir', name, files }); if (files.skipped) problems.push(`フォルダ「${name}」のうち ${files.skipped} 件は読み取れませんでした（ほかは取り込みます）`); }
        else if (files.seen > 0) problems.push(`フォルダ「${name}」に画像・PDFがありません`);
        else fallbacks.push({ name });   // 空に見える＝読めていない可能性 → 選択ダイアログへ
      } catch (e) { logSoft('buildUnits', e); fallbacks.push({ name, error: e }); }
      continue;
    }
    const f = d.file; if (!f) continue;
    if (/\.zip$/i.test(f.name)) {
      try { const all = await zipExtract(f, { accept: n => isImageName(n) || isPdfName(n) }); units.push({ kind: 'zip', name: f.name.replace(/\.zip$/i, ''), files: all.map(x => ({ path: x.zipPath || x.name, file: x })), bad: all.bad || 0 }); }
      catch (e) { logSoft('buildUnits', e); problems.push('「' + f.name + '」' + (e && e.message ? '：' + e.message : '')); } continue;
    }
    if (isPdfName(f.name)) { units.push({ kind: 'pdf', name: f.name, files: [{ path: f.name, file: f }] }); continue; }
    if (isImageName(f.name) || (f.type || '').startsWith('image/')) loose.push({ path: f.name, file: f }); else problems.push('「' + f.name + '」');
  }
  return { units, loose, problems, fallbacks };
}
function relPaths(files, stripRoot) {   // ZIPのときだけ、共通の最上位フォルダは外す。カテゴリ名は「サブフォルダ名」（直下の画像はカテゴリなし）
  const segs = files.map(x => String(x.path).split('/').filter(Boolean));
  const first = segs.length && segs.every(s => s.length >= 2) ? segs[0][0] : null, strip = stripRoot && first && segs.every(s => s[0] === first) ? 1 : 0;
  return files.map((x, i) => { const s = segs[i].slice(strip); return { ...x, rel: s.join('/'), cat: s.length >= 2 ? s[0].slice(0, 40) : '', root: s.length < 2 }; });
}

// ===== 3. 1つの単位を解析（名前・PDF・スペック・トレーラー画像） =====
async function analyzeUnit(unit) {
  const files = relPaths(unit.files, unit.kind === 'zip'), pdfs = files.filter(f => isPdfName(f.file.name)), images = files.filter(f => isImageName(f.file.name) || (f.file.type || '').startsWith('image/'));
  const { main, subs } = SG.classifyPdfs(pdfs.map(p => ({ name: p.file.name, size: p.file.size, ref: p })), unit.kind === 'pdf' ? '' : unit.name);
  const mainPdf = main ? main.ref : null, subPdfs = subs.map(s => s.ref);
  const nameInfo = SG.analyzeName(unit.kind === 'pdf' ? unit.name : unit.name);
  let specs = {}, pdfTitle = '', analysisError = '';
  if (mainPdf) {
    try {
      const m = await analyzePdfFile(mainPdf.file); pdfTitle = m.title; specs = SG.extractSpecs(m.text);
      for (const sp of subPdfs.slice(0, 3)) {   // 足りない項目だけ、サブ資料の序盤から補う
        if (['playerCount', 'playTime', 'recSkills', 'lostRate', 'trailer'].every(k => specs[k])) break;
        try { const r = await analyzePdfFile(sp.file); const e = SG.extractSpecs(r.text); Object.keys(e).forEach(k => { if (!specs[k]) specs[k] = e[k]; }); } catch (e) { logSoft('analyzeUnit.sub', e); }
      }
    } catch (e) { logSoft('analyzeUnit', e); analysisError = e && e.message ? e.message : String(e); }
  }
  if (!specs.playerCount && nameInfo.players) specs.playerCount = nameInfo.players;   // PDFで見つからなければ、フォルダ名の人数表記
  if (!specs.system && nameInfo.system) specs.system = nameInfo.system;
  const t = SG.decideTitle({ folder: unit.kind === 'pdf' ? '' : unit.name, mainName: mainPdf ? mainPdf.file.name : (unit.kind === 'pdf' ? unit.name : ''), pdfTitle });
  const trailer = SG.pickTrailerImage(images.map(i => ({ name: i.file.name, root: i.root, ref: i })));
  const imgs = images.map(i => ({ file: i.file, cat: trailer && trailer.ref === i ? 'トレーラー' : (i.cat || '未分類'), isTrailer: !!(trailer && trailer.ref === i) }));
  return { unit, title: t.title, titleSource: t.source, specs, pdfs: pdfs.map(p => ({ file: p.file, role: mainPdf && p === mainPdf ? 'main' : 'sub' })), images: imgs, analysisError, bad: unit.bad || 0 };
}

// ===== 4. 素材（画像・PDF）をシナリオへ追加 =====
const asPdfFile = f => (f.type === 'application/pdf' ? f : new File([f], f.name, { type: 'application/pdf' }));
async function attachPdfs(sc, items) {   // items: [{ file, role }] または File。戻り値：追加した件数（保存に失敗したものは数えない）
  if (!sc) return 0; if (!Array.isArray(sc.pdfs)) sc.pdfs = [];
  let n = 0;
  for (const it of items) {
    const file = it.file || it, role = it.role === 'main' && !sc.pdfs.some(p => p.role === 'main') ? 'main' : 'sub';
    if (sc.pdfs.some(p => p.name === file.name && p.size === file.size)) continue;   // 同じPDFは二重に登録しない
    try { const assetId = await window.assetStore.put(asPdfFile(file), { name: file.name }); sc.pdfs.push({ id: 'pdf_' + Math.random().toString(36).slice(2, 10), name: String(file.name).slice(0, 200), size: file.size, assetId, role, addedAt: Date.now() }); n++; }
    catch (e) { logSoft('attachPdfs', e); toast('⚠️ 「' + file.name + '」を保存できませんでした：' + (e && e.message || e)); }
  }
  return n;
}
async function addMaterials(sc, an) {
  sc.imageCategories = sanitizeCats(sc.imageCategories, DEFAULT_SCENARIO_CATS); if (!Array.isArray(sc.images)) sc.images = [];
  let imgN = 0, skipped = 0, trailerUrl = '';
  for (const it of an.images.slice(0, 300)) {
    try {
      const dataUrl = await imageFileToDataUrl(it.file), cat = addCategory(sc.imageCategories, it.cat) || sc.imageCategories[0];
      if (!sc.images.some(a => a.name === it.file.name && a.category === cat && a.dataUrl === dataUrl)) { sc.images.push({ id: galId(), name: it.file.name, dataUrl, category: cat }); imgN++; }
      if (it.isTrailer) trailerUrl = dataUrl;
    } catch (e) { logSoft('addMaterials', e); skipped++; }
  }
  const pdfN = await attachPdfs(sc, an.pdfs);
  return { imgN, pdfN, skipped, trailerUrl };
}

// ===== 5. 登録（新規作成 or 既存へマージ） =====
async function registerUnit(an) {   // 戻り値：{ sc, kind: 'created' | 'merged' | 'skipped' }
  const ex = appState.scenarios.find(s => titlesSame(s.title, an.title));
  if (ex) {
    if (!(await appConfirm(`既存シナリオ『${ex.title}』に画像・PDF素材を追加（マージ）しますか？\n（画像 ${an.images.length}枚・PDF ${an.pdfs.length}件）`, { okText: 'マージする' }))) return { sc: ex, kind: 'skipped' };
    const mat = await addMaterials(ex, an); saveState(); renderDBView(); renderGalleryAll(); return { sc: ex, kind: 'merged', mat };
  }
  const sp = an.specs;
  const sc = { id: uid(), title: an.title, system: sp.system || '', playerCount: sp.playerCount || '', playTime: sp.playTime || '', reqSkills: sp.reqSkills || '', recSkills: sp.recSkills || '', semiRecSkills: sp.semiRecSkills || '', lostRate: sp.lostRate || '', aftereffect: sp.aftereffect || '',
    trailer: sp.trailer || '', trailerDecor: 'default', shopUrl: '', notes: '', autoReply: '', tags: [], postedChannels: [], postedInfo: {}, secretHOs: [], fullBlockData: createDefaultBlocks(), imageCategories: [...DEFAULT_SCENARIO_CATS], images: [], pdfs: [] };
  const mat = await addMaterials(sc, an); sc.imageUrl = mat.trailerUrl || '';   // 一覧用の画像も先に入れておく（applyFlatToBlocks が空の値でブロックを上書きしないように）
  if (mat.trailerUrl) sc.fullBlockData.unshift({ id: 'trailer_' + Date.now().toString(36), type: 'image', label: 'トレーラー画像', file: null, previewUrl: mat.trailerUrl, sectionType: 'image', collapsed: false, isCustom: true });
  applyFlatToBlocks(sc);   // 各項目をブロックへ書き込み、一覧用の項目（imageUrl など）を作り直す
  appState.scenarios.push(sc); saveState(); refreshScenarioViews(sc);
  return { sc, kind: 'created', mat };
}

function refreshScenarioViews(sc) {   // タイトル・各項目が変わったあと、一覧・選択肢・編集画面の入力欄を確実に描き直す
  populateScenarioDBSelect(); renderDBView(); if (typeof renderGalleryAll === 'function') renderGalleryAll();
  if (currentScenarioId === sc.id && typeof loadScenarioFromDB === 'function') loadScenarioFromDB(sc.id);
}

// ===== 6. ドロップ全体の流れ =====
async function handleScenarioDrop(dropped) {
  if (importState.busy) return toast('⚠️ 前の取り込みを処理中です。終わってからもう一度ドロップしてください');
  importState.busy = true; document.body.classList.add('import-busy');
  try {
    toast('📥 読み込んでいます…');
    const { units, loose, problems, fallbacks } = await buildUnits(dropped);
    for (const fb of fallbacks) { const files = await folderFallbackFiles(fb.name); if (files && files.length) units.push({ kind: 'dir', name: fb.name, files }); else if (files) problems.push('フォルダ「' + fb.name + '」に画像・PDFがありません'); else problems.push('フォルダ「' + fb.name + '」（読み取れませんでした）'); }
    if (problems.length) toast('⚠️ 読み取れませんでした：' + problems.join('、'));
    const onPost = document.body.dataset.page === 'postTab', cur = onPost && currentScenarioId ? appState.scenarios.find(s => s.id === currentScenarioId) : null;
    if (!units.length) {
      if (loose.length && cur) return await galleryDrop('scenario', loose.map(l => ({ file: l.file })));   // 投稿・編集画面に画像だけ：選択中シナリオのギャラリーへ
      if (!problems.length) toast(loose.length ? '画像だけでは新規登録できません。フォルダ・ZIP・PDFをドロップしてください' : '登録できるファイル（フォルダ・ZIP・PDF）がありませんでした');
      return;
    }
    if (units.length === 1 && loose.length) units[0].files.push(...loose);   // 1件だけのドロップなら、一緒に落とした画像はそのシナリオの素材
    if (cur && units.length === 1) {   // 投稿・編集画面で、シナリオを開いたまま1件ドロップ → そのシナリオへ素材を追加（新規作成はしない）
      const files = relPaths(units[0].files, units[0].kind === 'zip'), nI = files.filter(f => !isPdfName(f.file.name)).length, nP = files.length - nI;
      if (!(await appConfirm(`「${cur.title || '無題'}」に画像・PDF素材を追加しますか？\n（画像 ${nI}枚・PDF ${nP}件）`, { okText: '追加する' }))) return;
      const an = { images: files.filter(f => !isPdfName(f.file.name)).map(f => ({ file: f.file, cat: f.cat || '未分類', isTrailer: false })), pdfs: files.filter(f => isPdfName(f.file.name)).map(f => ({ file: f.file, role: 'sub' })) };
      const mat = await addMaterials(cur, an); saveState(); renderGalleryAll(); renderDBView();
      return toast(`✅ 「${cur.title || '無題'}」に追加しました（画像 ${mat.imgN}枚・PDF ${mat.pdfN}件）`);
    }
    const single = units.length === 1, res = { created: 0, merged: 0, skipped: 0, failed: 0 }; let last = null;
    for (let i = 0; i < units.length; i++) {
      if (!single) toast(`📥 解析中… ${i + 1} / ${units.length}`);
      try {
        const an = await analyzeUnit(units[i]);
        if (an.analysisError) toast('⚠️ PDFの文字を読み取れませんでした（PDFは保存します。人数・時間などは手入力してください）\n' + an.analysisError);
        const r = await registerUnit(an); res[r.kind]++; if (r.kind !== 'skipped') last = r.sc;
      } catch (e) { logSoft('handleScenarioDrop', e); res.failed++; toast('⚠️ 「' + units[i].name + '」を登録できませんでした：' + (e && e.message || e)); }
    }
    populateScenarioDBSelect(); renderDBView();
    if (single) {
      const r = res.created ? '新しいシナリオを登録しました' : res.merged ? '既存シナリオに素材を追加しました' : '';
      if (last) { toast('✅ ' + r + '：「' + last.title + '」'); activateScenario(last.id); } else if (res.skipped) toast('追加しませんでした');
    } else {
      toast(`✅ ${res.created}件のシナリオを追加しました` + (res.merged ? `（既存 ${res.merged}件に素材を追加）` : '') + (res.skipped ? `／スキップ ${res.skipped}件` : '') + (res.failed ? `／失敗 ${res.failed}件` : ''));
    }
  } catch (e) { logSoft('handleScenarioDrop', e); toast('❌ 取り込み中にエラーが発生しました：' + (e && e.message || e)); }
  finally { importState.busy = false; document.body.classList.remove('import-busy'); }
}

// ===== 7. 画面全体へのドロップ（ホーム／投稿・編集画面）。既存の専用ドロップ欄が処理したものは対象外 =====
(function () {
  const hasFiles = e => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'));
  const modalOpen = () => [...document.querySelectorAll('.modal-overlay, .sm-overlay')].some(m => getComputedStyle(m).display !== 'none') || !!document.querySelector('.gx-overlay, .sd-overlay, .app-dialog-overlay');
  const targetPage = () => ['databaseTab', 'postTab'].includes(document.body.dataset.page);
  let hint = null, depth = 0;
  const hintEl = () => hint || (hint = Object.assign(document.createElement('div'), { id: 'dropHint', className: 'drop-hint', innerHTML: '<div class="drop-hint-box">📥 ここにドロップして登録<small>フォルダ・ZIP・PDF（複数可）。1件ならそのまま編集画面へ、複数件なら一括登録します</small></div>' }));
  const showHint = on => { const h = hintEl(); if (on && !h.isConnected) document.body.appendChild(h); if (!on && h.isConnected) h.remove(); };
  document.addEventListener('dragenter', e => { if (!hasFiles(e)) return; depth++; if (document.body.dataset.page === 'databaseTab' && !modalOpen()) showHint(true); });
  document.addEventListener('dragleave', e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) showHint(false); });
  document.addEventListener('dragover', e => { if (!hasFiles(e)) return; if (!e.defaultPrevented) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = (targetPage() && !modalOpen()) ? 'copy' : 'none'; } });
  document.addEventListener('drop', e => {
    depth = 0; showHint(false);
    if (e.defaultPrevented || !hasFiles(e)) return;
    e.preventDefault();   // 専用のドロップ欄の外に落としても、ブラウザがファイルを開いてしまわないように
    if (!targetPage() || modalOpen()) return;
    handleScenarioDrop(snapshotDrop(e.dataTransfer));
  });
  document.addEventListener('dragend', () => { depth = 0; showHint(false); });
})();

// ===== 8. 登録PDFの一覧（シナリオ詳細・投稿/編集画面のギャラリー欄で共用）と、開く・削除 =====
function scenarioPdfsHtml(sc) {
  const pdfs = Array.isArray(sc.pdfs) ? sc.pdfs : [], e = escapeHTML;
  return `<div class="sd-docs" data-pdfbox="${e(sc.id)}"><div class="sd-docs-head">📄 登録PDF <small>${pdfs.length}件</small></div>${pdfs.length
    ? `<ul class="sd-pdf">${pdfs.map(p => `<li data-pid="${e(p.id)}" data-aid="${e(p.assetId)}"><span class="pdf-name" title="${e(p.name)}">📄 ${e(p.name)}</span>${p.role === 'main' ? '<span class="pdf-role">メイン</span>' : ''}<small>${e(fmtBytes(p.size))}</small><span class="pdf-miss" hidden>⚠️ この端末にファイルがありません</span><span class="pdf-btns"><button type="button" class="btn-sort" data-pdf-act="open" data-sid="${e(sc.id)}" data-pid="${e(p.id)}">開く</button><button type="button" class="btn-sort btn-danger" data-pdf-act="del" data-sid="${e(sc.id)}" data-pid="${e(p.id)}" title="このシナリオから外す">✕</button></span></li>`).join('')}</ul>`
    : '<div class="sd-muted">登録されたPDFはまだありません。フォルダ・ZIP・PDFをドロップすると追加されます。</div>'}</div>`;
}
function markMissingPdfs(root) {   // 他の端末のデータ（JSON・クラウド）などで、この端末にPDF本体が無いものに印を付ける
  if (!root || !window.assetStore) return;
  root.querySelectorAll('li[data-aid]').forEach(li => window.assetStore.get(li.dataset.aid).then(r => { if (!r) { li.classList.add('missing'); const m = li.querySelector('.pdf-miss'); if (m) m.hidden = false; const b = li.querySelector('[data-pdf-act="open"]'); if (b) b.disabled = true; } }).catch(() => {}));
}
function releasePdfAssets(sc) {   // シナリオを消すとき、ほかのシナリオが使っていないPDF本体を端末から外す
  (sc && Array.isArray(sc.pdfs) ? sc.pdfs : []).forEach(p => { if (!appState.scenarios.some(s => s !== sc && (s.pdfs || []).some(q => q.assetId === p.assetId))) window.assetStore.remove(p.assetId).catch(e => logSoft('releasePdfAssets', e)); });
}
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-pdf-act]'); if (!b) return;
  const sc = appState.scenarios.find(s => s.id === b.dataset.sid), p = sc && (sc.pdfs || []).find(x => x.id === b.dataset.pid); if (!p) return;
  if (b.dataset.pdfAct === 'open') {
    const rec = await window.assetStore.get(p.assetId); if (!rec) return toast('⚠️ このブラウザにはPDFのファイルがありません（他の端末のデータの可能性があります）');
    const url = URL.createObjectURL(new Blob([rec.blob], { type: 'application/pdf' })), a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 120000);
  } else if (b.dataset.pdfAct === 'del') {
    if (!(await appConfirm('PDF「' + p.name + '」をこのシナリオから外し、端末に保存したファイルも削除しますか？\nこの操作は元に戻せません。', { okText: '削除', danger: true }))) return;
    const i = sc.pdfs.indexOf(p); if (i < 0) return; sc.pdfs.splice(i, 1);
    if (!appState.scenarios.some(s => (s.pdfs || []).some(q => q.assetId === p.assetId))) window.assetStore.remove(p.assetId).catch(err => logSoft('pdf-del', err));
    saveState(); renderGalleryAll(); renderDBView();
  }
});

// ===== 9. 「選んで登録」ボタン（ホーム）：ドラッグ＆ドロップが使えない環境でも、同じ取り込みを行える =====
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-import-pick]'); if (!b) return;
  const files = await pickFilesViaInput(b.dataset.importPick === 'folder' ? { folder: true } : { accept: '.pdf,.zip,application/pdf,application/zip,image/*' });
  if (files.length) handleScenarioDrop(unitsFromFileList(files));
});
