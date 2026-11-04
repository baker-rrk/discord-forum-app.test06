/* app_test59_23_ccfolia.js — STEP 3：「♟️ ココフォリア準備」画面
 *  ・上：対象シナリオ（検索つきのサジェスト）＋「選択解除」。シナリオ未選択でも作業でき、後から別のシナリオへ移動・複製できる
 *  ・左：PDFビューア（22_pdf_viewer.js）。選んだ範囲の文字は、21_pdf_extract.js の座標ベースの整形を通して右の「抽出テキスト」へ
 *  ・右：抽出テキストの編集と登録（任意で関連する駒も同時に作成）／シナリオテキスト・NPC・駒の一覧
 * データは軽量なJSON：シナリオ選択中は sc.ccfolia、未選択のときは appState.ccfolia（{ texts, npcs, pieces }）。どちらもクラウド同期・JSONバックアップの対象。 */
const cc = { scenarioId: null, tab: 'texts', last: null, prev: null, dirty: false, editingTextId: null, form: null, regIcon: null, sel: new Set(), local: [], docs: new Map(), ui: null, built: false };
const ccEl = id => document.getElementById(id), ccChk = id => !!(ccEl(id) && ccEl(id).checked);
const ccScenario = () => cc.scenarioId ? appState.scenarios.find(s => s.id === cc.scenarioId) || null : null;
function ccBucket() {
  const sc = ccScenario();
  if (sc) { if (!sc.ccfolia) sc.ccfolia = emptyCcfolia(); return sc.ccfolia; }
  if (!appState.ccfolia) appState.ccfolia = emptyCcfolia(); return appState.ccfolia;
}
const ccSave = () => { if (ccScenario()) saveState(); else saveState(true); };   // シナリオのデータ → シナリオごと保存。未選択の作業領域 → 設定側の保存
const CC_KIND = { character: 'キャラクター駒', object: 'オブジェクト駒' };

// ===== 画面の骨組み =====
function ccBuild() {
  const root = ccEl('ccfoliaTab'); if (!root || cc.built) return; cc.built = true;
  root.innerHTML = `
  <div class="card cc-top">
    <div class="cc-top-row">
      <label class="cc-label" for="ccScenarioInput">♟️ 対象シナリオ</label>
      <div class="cc-combo"><input type="text" id="ccScenarioInput" role="combobox" aria-expanded="false" aria-controls="ccScenarioList" aria-autocomplete="list" placeholder="🔎 シナリオ名・システム・タグで検索して選択（未選択でも作業できます）" autocomplete="off"><ul id="ccScenarioList" class="cc-suggest" role="listbox" hidden></ul></div>
      <button type="button" class="btn btn-secondary" id="ccClearBtn" title="シナリオの選択を解除して、未選択の状態に戻す">✕ 選択解除</button>
    </div>
    <div class="cc-note" id="ccNote"></div>
  </div>
  <div class="cc-split">
    <section class="cc-left" aria-label="PDFビューア"><div id="ccViewerHost" class="cc-viewer"></div></section>
    <section class="cc-right">
      <div class="card cc-extract">
        <div class="card-title">✂️ 抽出テキスト <small id="ccInfo"></small></div>
        <div class="cc-opts"><label><input type="checkbox" id="ccOptRuby" checked> ルビを除外</label><label><input type="checkbox" id="ccOptCols" checked> 2段組を自動整列</label><label><input type="checkbox" id="ccOptTitle" checked> 1行目をタイトルに</label></div>
        <label class="cc-lbl" for="ccTitle">タイトル</label><input type="text" id="ccTitle" placeholder="タイトル（1行目から自動入力。自由に編集できます）">
        <label class="cc-lbl" for="ccBody">本文</label><textarea id="ccBody" rows="8" placeholder="PDFで範囲を選ぶと、ここに入ります。直接の入力・編集もできます。"></textarea>
        <div class="cc-tools">
          <button type="button" class="btn-sort" data-cc="compact" title="文の途中の改行や、余分な空白を取り除く">🧹 不要な改行・空白を除去</button>
          <span class="cc-inline"><select id="ccZen" aria-label="英数字の統一"><option value="half">英数字を半角に</option><option value="full">英数字を全角に</option></select><button type="button" class="btn-sort" data-cc="zen">統一</button></span>
          <span class="cc-inline"><input type="text" id="ccVarWords" placeholder="変数にする語（空白・カンマ区切り 例: HO1 HO2）" aria-label="変数にする語"><button type="button" class="btn-sort" data-cc="var" title="指定した語を {語} にする">{ } 変数化</button></span>
          <button type="button" class="btn-sort" data-cc="undo" id="ccUndo" disabled>↩ 直前に戻す</button>
          <button type="button" class="btn-sort" data-cc="npc" title="いまの文字から、NPC駒（ステータス・技能・チャットパレット）を作る">👤 NPC駒を錬成</button>
        </div>
        <div class="cc-pieceopt"><label class="cc-check"><input type="checkbox" id="ccMakePiece"> 👤＋ このテキストに関連するキャラクター駒 / オブジェクト駒を同時に作成する</label>
          <div class="cc-piece-fields" id="ccPieceFields" hidden>
            <select id="ccPieceKind" aria-label="駒の種類"><option value="character">キャラクター駒</option><option value="object">オブジェクト駒</option></select>
            <input type="text" id="ccPieceName" placeholder="駒の名前（空ならタイトル）">
            <button type="button" class="btn-sort" data-cc="pick-icon-reg">🖼️ アイコンを選ぶ</button><span class="cc-icon" id="ccRegIcon"></span><button type="button" class="btn-sort" data-cc="clear-icon-reg">なし</button>
          </div></div>
        <div class="cc-actions"><button type="button" class="btn" id="ccRegister" data-cc="register">💾 シナリオテキストとして登録</button><button type="button" class="btn btn-secondary" data-cc="reset">クリア</button></div>
      </div>
      <div class="card cc-data">
        <div class="cc-sysrow"><label for="ccSystem">🎲 ゲームシステム</label><select id="ccSystem">${NP.SYSTEMS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><small>（NPCの作成時の既定。NPCごとにも選べます）</small></div>
        <div class="cc-tabs" role="tablist"><button type="button" role="tab" data-cctab="texts">📜 シナリオテキスト <span id="ccN_texts"></span></button><button type="button" role="tab" data-cctab="npcs">👥 NPC <span id="ccN_npcs"></span></button><button type="button" role="tab" data-cctab="pieces">♟️ 駒 <span id="ccN_pieces"></span></button></div>
        <div class="cc-listtools"><input type="search" id="ccFilter" placeholder="🔍 キーワードで絞り込み（例: HO1）" aria-label="キーワードで絞り込み"><select id="ccSort" aria-label="並び順"><option value="manual">並び：手動（ドラッグで並べ替え）</option><option value="name">名前順</option><option value="new">新しい順</option><option value="old">古い順</option></select><label class="cc-check"><input type="checkbox" id="ccSelAll"> 表示中を全選択</label></div>
        <div id="ccForm"></div><div id="ccList" class="cc-list"></div>
        <div class="cc-bulk"><span>選択 <b id="ccSelN">0</b> 件を</span><select id="ccTarget" aria-label="移動・複製の先"></select><button type="button" class="btn-sort" data-cc="move">➡ 移動（紐づけ）</button><button type="button" class="btn-sort" data-cc="copy">⧉ 複製</button></div>
        <div class="cc-bulk"><button type="button" class="btn-sort btn-danger" data-cc="bulk-del">🗑 選択を削除</button><span id="ccDummyBox" class="cc-inline"><select id="ccDummyKind" aria-label="ダミー駒の種類"><option value="character">キャラクター駒</option><option value="object">オブジェクト駒</option></select><button type="button" class="btn-sort" data-cc="dummy" title="選んだテキストを、それぞれ独立したダミー駒にする（メモ＝原文、チャパレ＝改行なしの1行）">🧩 選択テキストを個別のダミー駒に</button></span><button type="button" class="btn-sort" data-cc="zip" title="選んだ項目を、ココフォリア用のZIPに出力">📦 駒ZIPを出力</button></div>
      </div>
    </section>
  </div>`;
  ccInitCombo(); ccBindEvents(); ccBindListEvents();
}

// ===== 対象シナリオ：検索つきサジェスト＋選択解除 =====
function ccInitCombo() {
  const inp = ccEl('ccScenarioInput'), list = ccEl('ccScenarioList'); let items = [], act = -1, typing = false;
  const label = () => { const sc = ccScenario(); return sc ? (sc.title || '無題') : ''; };
  const paint = () => { list.querySelectorAll('li[data-i]').forEach((li, i) => { li.classList.toggle('active', i === act); li.setAttribute('aria-selected', String(i === act)); }); const a = list.querySelector('li.active'); if (a) { a.scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', a.id); } else inp.removeAttribute('aria-activedescendant'); };
  const close = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); act = -1; typing = false; inp.value = label(); };
  const render = () => {
    const terms = typing ? parseQuery(inp.value) : [], fav = (a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0), hit = sc => terms.length && terms.every(t => normSearch(sc.title).includes(t)) ? 0 : 1;
    let arr = appState.scenarios.filter(sc => matchQuery(sc, terms)); arr = terms.length ? arr.sort((a, b) => (hit(a) - hit(b)) || fav(a, b)) : arr.slice().reverse().sort(fav);
    items = arr.slice(0, 100);
    list.innerHTML = items.map((sc, i) => `<li role="option" id="ccopt_${i}" data-i="${i}">${sc.favorite ? '<span class="cc-fav">★</span> ' : ''}<span class="cc-opt-title">${escapeHTML(sc.title || '無題')}</span><small>${escapeHTML([sc.system, sc.playerCount, sc.playTime].filter(Boolean).join(' / '))}</small></li>`).join('') || '<li class="cc-empty" aria-disabled="true">該当するシナリオがありません</li>';
    list.hidden = false; inp.setAttribute('aria-expanded', 'true'); act = items.length ? Math.max(0, items.findIndex(sc => sc.id === cc.scenarioId)) : -1; paint();
  };
  const pick = i => { const sc = items[i]; if (!sc) return; ccPickScenario(sc.id); close(); inp.blur(); };
  inp.addEventListener('focus', () => { typing = false; inp.select(); render(); });
  inp.addEventListener('input', () => { typing = true; render(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (list.hidden) render(); else if (items.length) { act = (act + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); } }
    else if (e.key === 'Enter') { if (!list.hidden && act >= 0) { e.preventDefault(); pick(act); } }
    else if (e.key === 'Escape') { if (!list.hidden) { e.stopPropagation(); close(); } }
  });
  list.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(Number(li.dataset.i)); } });
  inp.addEventListener('blur', () => setTimeout(close, 120));
  ccEl('ccClearBtn').addEventListener('click', () => { ccPickScenario(null); close(); });
}
function ccPickScenario(id) {
  const sc = id ? appState.scenarios.find(s => s.id === id) : null; cc.scenarioId = sc ? sc.id : null; cc.sel.clear(); cc.form = null; cc.regIcon = null; ccRenderIconPrev('ccRegIcon', null);
  const inp = ccEl('ccScenarioInput'); if (inp) inp.value = sc ? (sc.title || '無題') : '';
  ccRenderAll(); if (cc.ui) { const key = cc.ui.refreshList(); cc.ui.open(key); }
  if (typeof pvPopup !== 'undefined' && pvPopup && pvPopup.win && !pvPopup.win.closed) { const k = pvPopup.ui.refreshList(); pvPopup.ui.open(k); }
}

// ===== PDFビューアとの連携 =====
const ccHost = {
  entries() {
    const sc = ccScenario(), a = sc && Array.isArray(sc.pdfs) ? sc.pdfs.map(p => ({ key: 'a:' + p.assetId, name: p.name, role: p.role })) : [];
    return [...a, ...cc.local.map(l => ({ key: l.key, name: '（一時）' + l.name, role: 'sub' }))];
  },
  load(key) {
    if (!cc.docs.has(key)) {
      const p = (async () => {
        let blob; if (key.startsWith('l:')) { const l = cc.local.find(x => x.key === key); blob = l && l.file; }
        else { const rec = await window.assetStore.get(key.slice(2)); blob = rec && rec.blob; }
        if (!blob) throw new Error('このブラウザにはPDFのファイルがありません（他の端末のデータの可能性があります）');
        return openPdfDocument(blob);
      })();
      p.catch(() => cc.docs.delete(key)); cc.docs.set(key, p);
    }
    return cc.docs.get(key).catch(e => { toast('⚠️ PDFを開けませんでした：' + (e && e.message || e)); return null; });
  },
  async addLocal(file) { if (!isPdfName(file.name)) { toast('⚠️ PDFファイルを選んでください'); return null; } const key = 'l:' + Date.now().toString(36) + cc.local.length; cc.local.push({ key, name: file.name, file }); return key; },
  onSelect: (items, meta) => ccOnSelect(items, meta),
  onPopout: () => ccPopout(),
  onScanNpc: () => ccScanNpcs()
};
function ccPopout() {
  const p = pvOpenPopup(ccHost); if (!p) return toast('⚠️ 別ウィンドウを開けませんでした。ブラウザのポップアップのブロックを許可してください');
  const key = p.ui.refreshList(cc.ui ? cc.ui.root.querySelector('.pv-pdf-select').value : ''); p.ui.open(key);
}
async function ccOnShow() {
  ccBuild(); if (cc.scenarioId && !ccScenario()) { cc.scenarioId = null; const i = ccEl('ccScenarioInput'); if (i) i.value = ''; }
  ccRenderAll();
  if (!cc.ui) { cc.ui = pvBuildUI(document, ccEl('ccViewerHost'), { modes: ['scroll'], host: ccHost }); const key = cc.ui.refreshList(); await cc.ui.open(key); if (cc.ui.viewer.pdf) cc.ui.viewer.fitWidth(); }
  else { const key = cc.ui.refreshList(); if (!cc.ui.viewer.pdf && key) cc.ui.open(key); }
}

// ===== 選んだ範囲 → 抽出テキスト =====
function ccRunExtract() {
  const last = cc.last; if (!last) return;
  const r = PX.extract(last.items, { ruby: ccChk('ccOptRuby'), twoColumn: ccChk('ccOptCols'), autoTitle: ccChk('ccOptTitle') });
  cc.prev = { title: ccEl('ccTitle').value, body: ccEl('ccBody').value }; ccEl('ccUndo').disabled = false;
  ccEl('ccTitle').value = r.title; ccEl('ccBody').value = r.body; cc.dirty = false;
  const pages = [...new Set(last.items.map(i => i.page))].sort((a, b) => a - b);
  ccEl('ccInfo').textContent = `${last.meta && last.meta.source === 'rect' ? '矩形' : 'ドラッグ'}選択 ／ p.${pages.join(',')} ／ ${r.stats.columns === 2 ? '2段組' : '1段組'}` + (r.stats.rubyRemoved ? ` ／ ルビ除外 ${r.stats.rubyRemoved}` : '') + ` ／ ${r.text.length}文字`;
  return r;
}
function ccOnSelect(items, meta) {
  if (!items || !items.length) return; cc.last = { items, meta: meta || {} };
  const r = ccRunExtract(); if (r) toast(`📋 ${r.text.length}文字を抽出しました` + (meta && meta.from === 'popup' ? '（別ウィンドウから）' : ''), 'info');
}
function ccPdfName() { const s = cc.ui && cc.ui.root.querySelector('.pv-pdf-select'); return s && s.selectedOptions[0] ? s.selectedOptions[0].textContent.replace(/^★ /, '').replace(/^（一時）/, '') : ''; }
function ccPatchBody(fn) { const b = ccEl('ccBody'); cc.prev = { title: ccEl('ccTitle').value, body: b.value }; ccEl('ccUndo').disabled = false; b.value = fn(b.value); cc.dirty = true; }
function ccRenderIconPrev(id, icon) { const el = ccEl(id); if (el) el.innerHTML = icon && icon.url ? `<img ${imgAttr(icon.url)} alt="アイコン">` : ''; }
async function ccPickIcon() {
  const sc = ccScenario(); if (!sc) { toast('⚠️ シナリオを選択すると、そのシナリオの専用ギャラリーから画像を選べます'); return null; }
  if (!(sc.images || []).length) { toast('このシナリオのギャラリーには、まだ画像がありません'); return null; }
  galScOverride = sc; try { const url = await pickGalleryImage(); return url ? { url, name: '' } : null; } finally { galScOverride = null; }
}
function ccResetPanel() { ['ccTitle', 'ccBody'].forEach(id => { ccEl(id).value = ''; }); ccEl('ccInfo').textContent = ''; cc.dirty = false; cc.editingTextId = null; cc.last = null; ccEl('ccRegister').textContent = '💾 シナリオテキストとして登録'; ccEl('ccPieceName').value = ''; cc.regIcon = null; ccRenderIconPrev('ccRegIcon', null); }
async function ccRegister() {
  const title = ccEl('ccTitle').value.trim(), body = ccEl('ccBody').value.replace(/\s+$/, ''); if (!body.trim() && !title) return toast('⚠️ テキストが空です');
  const b = ccBucket(); let item = cc.editingTextId ? b.texts.find(t => t.id === cc.editingTextId) : null;
  if (!item) { if (b.texts.length >= CC_LIMIT) return toast('⚠️ テキストは ' + CC_LIMIT + ' 件までです'); item = { id: ccNewId('txt'), createdAt: Date.now() }; b.texts.push(item); }
  const last = cc.last, pages = last ? [...new Set(last.items.map(i => i.page))].sort((a, c) => a - c) : [];
  Object.assign(item, { title: (title || Array.from(body.split('\n')[0]).slice(0, 30).join('') || '無題').slice(0, 200), body, src: { pdf: last ? ccPdfName() : (item.src && item.src.pdf) || '', pages: last ? pages.join(',') : (item.src && item.src.pages) || '' } });
  let made = '';
  if (ccChk('ccMakePiece') && !cc.editingTextId) {
    if (b.pieces.length >= CC_LIMIT) toast('⚠️ 駒は ' + CC_LIMIT + ' 件までです（駒は作成しませんでした）');
    else { const kind = ccEl('ccPieceKind').value === 'object' ? 'object' : 'character', name = ccEl('ccPieceName').value.trim() || item.title; b.pieces.push({ id: ccNewId('pc'), kind, name: name.slice(0, 100), memo: '', icon: cc.regIcon, textId: item.id, createdAt: Date.now() }); made = `／${CC_KIND[kind]}「${name}」も作成`; }
  }
  const wasEdit = !!cc.editingTextId; ccSave(); ccResetPanel(); ccRenderAll();
  toast(`✅ ${wasEdit ? 'テキストを更新しました' : 'シナリオテキストを登録しました'}${made}（保存先：${ccScenario() ? ccScenario().title : '未選択の作業領域'}）`);
}

// ===== 一覧・フォーム =====
const ccNote = () => { const sc = ccScenario(); ccEl('ccNote').innerHTML = sc ? `保存先：シナリオ「<b>${escapeHTML(sc.title || '無題')}</b>」。このシナリオのPDF（${(sc.pdfs || []).length}件）をビューアで開けます。` : '保存先：<b>未選択の作業領域</b>（どのシナリオにも属しません）。作ったデータは、下の「移動（紐づけ）」「複製」で、後から任意のシナリオへ入れられます。'; };
function ccRenderAll() {
  if (!cc.built) return; ccNote(); const b = ccBucket();
  ['texts', 'npcs', 'pieces'].forEach(k => { ccEl('ccN_' + k).textContent = '(' + b[k].length + ')'; }); ccEl('ccSystem').value = b.system || 'coc6';
  document.querySelectorAll('#ccfoliaTab [data-cctab]').forEach(t => { const on = t.dataset.cctab === cc.tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
  ccRenderForm(); ccRenderList(); ccRenderTargets();
}
function ccRenderTargets() {
  const t = ccEl('ccTarget'), cur = t.value; t.innerHTML = (ccScenario() ? '<option value="">（未選択の作業領域）</option>' : '') + appState.scenarios.filter(s => s.id !== cc.scenarioId).map(s => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.title || '無題')}</option>`).join('');
  if ([...t.options].some(o => o.value === cur)) t.value = cur;
}
function ccRenderForm() {
  const box = ccEl('ccForm'); if (cc.tab === 'texts') { box.innerHTML = ''; return; }
  if (cc.tab === 'npcs') { box.innerHTML = '<div class="cc-form-row"><button type="button" class="btn btn-sm" data-cc="new-npc">＋ NPCを作成（ステータス・技能・チャパレット）</button><button type="button" class="btn btn-secondary btn-sm" data-cc="scan">🔍 PDFからNPCを一括検出</button></div>'; return; }
  const f = cc.form || { tab: cc.tab, id: null, name: '', memo: '', kind: 'character', icon: null }; if (!cc.form) cc.form = f;
  box.innerHTML = `<div class="cc-form"><div class="cc-form-row"><input type="text" id="ccFName" placeholder="駒の名前" value="${escapeHTML(f.name)}"><select id="ccFKind" aria-label="駒の種類"><option value="character" ${f.kind === 'character' ? 'selected' : ''}>キャラクター駒</option><option value="object" ${f.kind === 'object' ? 'selected' : ''}>オブジェクト駒</option></select></div>
    <textarea id="ccFMemo" rows="2" placeholder="メモ">${escapeHTML(f.memo)}</textarea>
    <div class="cc-form-row"><button type="button" class="btn-sort" data-cc="pick-icon-form">🖼️ アイコンを選ぶ</button><span class="cc-icon" id="ccFIcon"></span><button type="button" class="btn-sort" data-cc="clear-icon-form">なし</button><span class="cc-grow"></span><button type="button" class="btn btn-sm" data-cc="form-save">${f.id ? '💾 更新' : '＋ 追加'}</button>${f.id ? '<button type="button" class="btn btn-secondary btn-sm" data-cc="form-cancel">キャンセル</button>' : ''}</div></div>`;
  ccRenderIconPrev('ccFIcon', f.icon);
}
const ccHay = it => cc.tab === 'texts' ? (it.title || '') + '\n' + (it.body || '') : cc.tab === 'npcs' ? [it.name, it.memo, (it.skills || []).map(s => s.name).join(' '), (it.status || []).map(s => s.label).join(' '), it.commands].join('\n') : [it.name, it.memo, it.commands].join('\n');
function ccVisible() {   // キーワードで絞り込み → 並び順（手動 / 名前 / 新しい順 / 古い順）
  const arr = ccBucket()[cc.tab], terms = parseQuery(ccEl('ccFilter').value || ''), sort = ccEl('ccSort').value, nm = it => it.title || it.name || '';
  let list = terms.length ? arr.filter(it => { const h = normSearch(ccHay(it)); return terms.every(t => h.includes(t)); }) : arr.slice();
  if (sort === 'name') list.sort((a, b) => nm(a).localeCompare(nm(b), 'ja', { numeric: true })); else if (sort === 'new') list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); else if (sort === 'old') list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return list;
}
function ccRenderList() {
  const b = ccBucket(), all = b[cc.tab], list = ccVisible(), box = ccEl('ccList'), e = escapeHTML, texts = b.texts, manual = ccEl('ccSort').value === 'manual';
  ccEl('ccDummyBox').hidden = cc.tab !== 'texts';
  if (!all.length) { box.innerHTML = `<div class="cc-empty-list">${cc.tab === 'texts' ? 'まだシナリオテキストがありません。PDFで範囲を選んで「登録」するか、本文を直接入力して登録できます。' : cc.tab === 'npcs' ? 'まだNPCがありません。「＋ NPCを作成」か、PDFで選んだ文字から「👤 NPC駒を錬成」、または「🔍 PDFからNPCを一括検出」で作れます。' : 'まだありません。上のフォームから追加できます。'}</div>`; ccUpdateSel(); return; }
  if (!list.length) { box.innerHTML = '<div class="cc-empty-list">該当する項目がありません。</div>'; ccUpdateSel(); return; }
  const grip = manual ? '<span class="cc-grip" title="ドラッグで並べ替え" aria-hidden="true">⠿</span>' : '', icon = it => `<span class="cc-icon cc-icon-lg">${it.icon ? `<img ${imgAttr(it.icon.url)} alt="">` : '👤'}</span>`;
  box.innerHTML = list.map(it => {
    const id = e(it.id), chk = `<label class="cc-sel"><input type="checkbox" data-cc-sel="${id}" ${cc.sel.has(it.id) ? 'checked' : ''} aria-label="選択"></label>`, open = `<div class="cc-item" data-id="${id}" ${manual ? 'draggable="true"' : ''}>${grip}${chk}`;
    const btn = (act, label, title, cls) => `<button type="button" class="btn-sort ${cls || ''}" data-cc-act="${act}" data-id="${id}" title="${title}">${label}</button>`;
    if (cc.tab === 'texts') return `${open}<div class="cc-item-main"><b>${e(it.title || '無題')}</b><div class="cc-prev">${e(it.body.slice(0, 140))}${it.body.length > 140 ? '…' : ''}</div>${it.src && it.src.pdf ? `<small>📄 ${e(it.src.pdf)}${it.src.pages ? ' p.' + e(it.src.pages) : ''}</small>` : ''}</div><div class="cc-item-btns">${btn('edit', '✏️', '編集')}${btn('copytext', '📋', 'コピー')}${btn('zip1', '📦', 'ダミー駒としてZIP出力')}${btn('del', '✕', '削除', 'btn-danger')}</div></div>`;
    if (cc.tab === 'npcs') return `${open}${icon(it)}<div class="cc-item-main"><b>${e(it.name || '名前なし')}</b><span class="cc-kind">${e(ccSysLabel(it.system || b.system))}</span><div class="cc-prev">${e((it.status || []).map(s => s.label + s.value).join(' '))} ${e((it.params || []).slice(0, 10).map(p => p.label + p.value).join(' '))}</div><small>技能 ${(it.skills || []).length}${it.commands ? ' ／ チャパレ ' + it.commands.split('\n').length + '行' : ''}</small></div><div class="cc-item-btns">${btn('edit', '✏️', '編集')}${btn('zip1', '📦', 'この駒をZIP出力')}${btn('json1', '{ }', 'ココフォリア貼り付け用JSONをコピー')}${btn('del', '✕', '削除', 'btn-danger')}</div></div>`;
    const rel = it.textId ? texts.find(t => t.id === it.textId) : null;
    return `${open}${icon(it)}<div class="cc-item-main"><b>${e(it.name || '名前なし')}</b><span class="cc-kind">${CC_KIND[it.kind] || ''}</span>${it.dummy ? '<span class="cc-kind">ダミー</span>' : ''}${it.memo ? `<div class="cc-prev">${e(it.memo.slice(0, 100))}</div>` : ''}${rel ? `<small>📜 ${e(rel.title)}</small>` : ''}</div><div class="cc-item-btns">${btn('edit', '✏️', '編集')}${btn('zip1', '📦', 'この駒をZIP出力')}${btn('json1', '{ }', 'ココフォリア貼り付け用JSONをコピー')}${btn('del', '✕', '削除', 'btn-danger')}</div></div>`;
  }).join(''); ccUpdateSel();
}
function ccReorder(id, targetId, after) {   // 手動の並べ替え（絞り込み中でも、元の配列の中で動かす）
  const arr = ccBucket()[cc.tab], i = arr.findIndex(x => x.id === id); if (i < 0) return; const [m] = arr.splice(i, 1), j = arr.findIndex(x => x.id === targetId); arr.splice(j < 0 ? arr.length : (after ? j + 1 : j), 0, m); ccSave();
}
async function ccMakeDummies() {
  const b = ccBucket(), texts = b.texts.filter(t => cc.sel.has(t.id)); if (!texts.length) return toast('ダミー駒にするテキストにチェックを入れてください');
  if (b.pieces.length + texts.length > CC_LIMIT) return toast('⚠️ 駒は ' + CC_LIMIT + ' 件までです');
  const kind = ccEl('ccDummyKind').value === 'object' ? 'object' : 'character';
  if (!(await appConfirm(`選んだ ${texts.length} 件のテキストを、それぞれ独立したダミー駒として作成しますか？\n（メモ欄＝改行を保った原文／チャットパレット＝改行を消した1行）`, { okText: '作成する' }))) return;
  texts.forEach(t => b.pieces.push({ id: ccNewId('pc'), kind, name: (t.title || '無題').slice(0, 100), memo: t.body.slice(0, 20000), commands: NP.oneLine(t.body).slice(0, 20000), dummy: true, textId: t.id, icon: null, createdAt: Date.now() }));
  cc.sel.clear(); ccSave(); cc.tab = 'pieces'; ccRenderAll(); toast(`✅ ${texts.length}件のダミー駒を作成しました`);
}
function ccUpdateSel() { const n = ccEl('ccSelN'); if (n) n.textContent = String(cc.sel.size); }
async function ccTransfer(mode) {
  const ids = [...cc.sel]; if (!ids.length) return toast('移す項目にチェックを入れてください');
  const target = ccEl('ccTarget').value, src = ccBucket(), tsc = target ? appState.scenarios.find(s => s.id === target) : null;
  if (target && !tsc) return toast('⚠️ 移動先のシナリオが見つかりません');
  const tgt = tsc ? (tsc.ccfolia || (tsc.ccfolia = emptyCcfolia())) : (appState.ccfolia || (appState.ccfolia = emptyCcfolia())); if (tgt === src) return toast('移動先が今と同じです');
  const tab = cc.tab, label = tsc ? `「${tsc.title || '無題'}」` : '未選択の作業領域';
  if (mode === 'move' && !(await appConfirm(`選んだ ${ids.length} 件を ${label} へ移動しますか？（今の場所からは無くなります）`, { okText: '移動する' }))) return;
  let n = 0;
  for (const id of ids) {
    const it = src[tab].find(x => x.id === id); if (!it) continue; if (tgt[tab].length >= CC_LIMIT) { toast('⚠️ 移動先がいっぱいです（' + CC_LIMIT + '件まで）'); break; }
    const c = JSON.parse(JSON.stringify(it)); if (mode === 'copy' || tgt[tab].some(x => x.id === c.id)) c.id = ccNewId(tab === 'texts' ? 'txt' : tab === 'npcs' ? 'npc' : 'pc');
    if (tab === 'pieces' && c.textId && !tgt.texts.some(t => t.id === c.textId)) c.textId = '';   // 関連テキストが移動先に無ければ、関連づけは外す
    tgt[tab].push(c); n++; if (mode === 'move') src[tab].splice(src[tab].indexOf(it), 1);
  }
  cc.sel.clear(); saveState(); ccRenderAll(); toast(`✅ ${n}件を${label}へ${mode === 'move' ? '移動' : '複製'}しました`);
}

// ===== 操作 =====
function ccBindEvents() {
  const root = ccEl('ccfoliaTab');
  ['ccTitle', 'ccBody'].forEach(id => ccEl(id).addEventListener('input', () => { cc.dirty = true; }));
  ccEl('ccMakePiece').addEventListener('change', e => { ccEl('ccPieceFields').hidden = !e.target.checked; });
  ['ccOptRuby', 'ccOptCols', 'ccOptTitle'].forEach(id => ccEl(id).addEventListener('change', async e => {
    if (!cc.last) return;
    if (cc.dirty && !(await appConfirm('編集した内容は、選び直した結果で置き換わります。続けますか？', { okText: '置き換える' }))) { e.target.checked = !e.target.checked; return; }
    ccRunExtract();
  }));
  root.addEventListener('click', async e => {
    const t = e.target.closest('[data-cctab]'); if (t) { cc.tab = t.dataset.cctab; cc.sel.clear(); cc.form = null; ccRenderAll(); return; }
    const a = e.target.closest('[data-cc]'), act = a && a.dataset.cc;
    if (act) {
      if (act === 'compact') ccPatchBody(PX.compact); else if (act === 'zen') ccPatchBody(v => PX.zenHan(v, ccEl('ccZen').value));
      else if (act === 'var') { const w = PX.parseWords(ccEl('ccVarWords').value); if (!w.length) return toast('変数にする語を入力してください'); ccPatchBody(v => PX.varize(v, w)); }
      else if (act === 'undo') { if (cc.prev) { const cur = { title: ccEl('ccTitle').value, body: ccEl('ccBody').value }; ccEl('ccTitle').value = cc.prev.title; ccEl('ccBody').value = cc.prev.body; cc.prev = cur; } }
      else if (act === 'register') await ccRegister();
      else if (act === 'reset') ccResetPanel();
      else if (act === 'pick-icon-reg') { const ic = await ccPickIcon(); if (ic) { cc.regIcon = ic; ccRenderIconPrev('ccRegIcon', ic); } }
      else if (act === 'clear-icon-reg') { cc.regIcon = null; ccRenderIconPrev('ccRegIcon', null); }
      else if (act === 'pick-icon-form') { const ic = await ccPickIcon(); if (ic && cc.form) { cc.form.icon = ic; ccRenderIconPrev('ccFIcon', ic); } }
      else if (act === 'clear-icon-form') { if (cc.form) cc.form.icon = null; ccRenderIconPrev('ccFIcon', null); }
      else if (act === 'form-cancel') { cc.form = null; ccRenderForm(); }
      else if (act === 'form-save') ccSaveForm();
      else if (act === 'move' || act === 'copy') await ccTransfer(act);
      return;
    }
    const ia = e.target.closest('[data-cc-act]'); if (!ia) return; const b = ccBucket(), id = ia.dataset.id, it = b[cc.tab].find(x => x.id === id); if (!it) return;
    if (ia.dataset.ccAct === 'del') { if (!(await appConfirm('「' + (it.title || it.name || '無題') + '」を削除しますか？', { okText: '削除', danger: true }))) return; b[cc.tab].splice(b[cc.tab].indexOf(it), 1); cc.sel.delete(id); ccSave(); ccRenderAll(); }
    else if (ia.dataset.ccAct === 'edit') {
      if (cc.tab === 'texts') { ccEl('ccTitle').value = it.title; ccEl('ccBody').value = it.body; cc.editingTextId = id; cc.dirty = false; ccEl('ccRegister').textContent = '💾 テキストを更新'; ccEl('ccBody').focus(); }
      else if (cc.tab === 'npcs') ccOpenNpcModal(it);
      else { cc.form = { tab: cc.tab, id, name: it.name, memo: it.memo, kind: it.kind || 'character', icon: it.icon }; ccRenderForm(); }
    }
    else if (ia.dataset.ccAct === 'copytext') { try { await navigator.clipboard.writeText((it.title ? it.title + '\n' : '') + it.body); toast('📋 コピーしました'); } catch (err) { logSoft('copytext', err); toast('⚠️ コピーできませんでした'); } }
  });
  root.addEventListener('change', e => { const c = e.target.closest('[data-cc-sel]'); if (!c) return; if (c.checked) cc.sel.add(c.dataset.ccSel); else cc.sel.delete(c.dataset.ccSel); ccUpdateSel(); });
  // PDFをこの画面へドロップ → 一時的にビューアで開く（登録はしない）
  root.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  root.addEventListener('drop', async e => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault();
    const f = [...e.dataTransfer.files].find(x => isPdfName(x.name)); if (!f) return toast('PDFファイルをドロップしてください');
    const key = await ccHost.addLocal(f); if (key && cc.ui) { cc.ui.refreshList(key); cc.ui.open(key); }
  });
}
function ccBindListEvents() {
  const root = ccEl('ccfoliaTab'), list = ccEl('ccList');
  ccEl('ccFilter').addEventListener('input', () => { ccRenderList(); });
  ccEl('ccSort').addEventListener('change', () => { ccRenderList(); });
  ccEl('ccSystem').addEventListener('change', e => { ccBucket().system = e.target.value; ccSave(); });
  ccEl('ccSelAll').addEventListener('change', e => { ccVisible().forEach(it => { if (e.target.checked) cc.sel.add(it.id); else cc.sel.delete(it.id); }); ccRenderList(); });
  root.addEventListener('click', async e => {
    const a = e.target.closest('[data-cc]'), act = a && a.dataset.cc;
    if (act === 'npc') { const t = ccEl('ccTitle').value.trim(), body = ccEl('ccBody').value; if (!t && !body.trim()) return toast('NPCにする文字を、PDFから選ぶか入力してください'); ccOpenNpcModal(null, { title: t, text: (t ? t + '\n' : '') + body }); }
    else if (act === 'new-npc') ccOpenNpcModal(null, null);
    else if (act === 'scan') ccScanNpcs();
    else if (act === 'bulk-del') {
      const ids = [...cc.sel]; if (!ids.length) return toast('削除する項目にチェックを入れてください');
      if (!(await appConfirm(`選んだ ${ids.length} 件を削除しますか？\nこの操作は元に戻せません。`, { okText: '削除', danger: true }))) return;
      const arr = ccBucket()[cc.tab]; ccBucket()[cc.tab] = arr.filter(x => !cc.sel.has(x.id)); cc.sel.clear(); ccSave(); ccRenderAll(); toast(`🗑 ${ids.length}件を削除しました`);
    }
    else if (act === 'dummy') await ccMakeDummies();
    else if (act === 'zip') { if (!cc.sel.size) return toast('出力する項目にチェックを入れてください'); await ccExportZip(cc.tab, [...cc.sel]); }
    const ia = e.target.closest('[data-cc-act]'); if (!ia) return;
    if (ia.dataset.ccAct === 'zip1') await ccExportZip(cc.tab, [ia.dataset.id]); else if (ia.dataset.ccAct === 'json1') await ccCopyJson(cc.tab, ia.dataset.id);
  });
  // ドラッグ＆ドロップの並べ替え（並び順が「手動」のとき）
  const clear = () => list.querySelectorAll('.drop-before,.drop-after,.dragging').forEach(x => x.classList.remove('drop-before', 'drop-after', 'dragging'));
  list.addEventListener('dragstart', e => { const it = e.target.closest && e.target.closest('.cc-item'); if (!it || ccEl('ccSort').value !== 'manual') return; cc.dragId = it.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'cc-item'); it.classList.add('dragging'); });
  list.addEventListener('dragover', e => { if (!cc.dragId) return; const it = e.target.closest('.cc-item'); if (!it) return; e.preventDefault(); e.stopPropagation(); const r = it.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2; list.querySelectorAll('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after')); if (it.dataset.id !== cc.dragId) it.classList.add(after ? 'drop-after' : 'drop-before'); });
  list.addEventListener('drop', e => { if (!cc.dragId) return; e.preventDefault(); e.stopPropagation(); const it = e.target.closest('.cc-item'), id = cc.dragId; cc.dragId = null; if (it && it.dataset.id !== id) { const r = it.getBoundingClientRect(); ccReorder(id, it.dataset.id, e.clientY > r.top + r.height / 2); } clear(); ccRenderList(); });
  list.addEventListener('dragend', () => { cc.dragId = null; clear(); });
}
function ccSaveForm() {
  const f = cc.form; if (!f) return; const name = ccEl('ccFName').value.trim(), memo = ccEl('ccFMemo').value; if (!name) return toast('⚠️ 名前を入力してください');
  const b = ccBucket(), list = b[cc.tab], kind = cc.tab === 'pieces' && ccEl('ccFKind') ? (ccEl('ccFKind').value === 'object' ? 'object' : 'character') : undefined;
  let it = f.id ? list.find(x => x.id === f.id) : null;
  if (!it) { if (list.length >= CC_LIMIT) return toast('⚠️ ' + CC_LIMIT + '件までです'); it = { id: ccNewId(cc.tab === 'npcs' ? 'npc' : 'pc'), createdAt: Date.now() }; if (cc.tab === 'pieces') it.textId = ''; list.push(it); }
  Object.assign(it, { name: name.slice(0, 100), memo: memo.slice(0, 5000), icon: f.icon }); if (kind) it.kind = kind;
  cc.form = null; ccSave(); ccRenderAll(); toast('✅ ' + (f.id ? '更新しました' : '追加しました'));
}

// ===== 画面切り替え・ほかの画面からの入口 =====
(function () {
  const st = switchTab; switchTab = function (tabId, evt) { st(tabId, evt); if (tabId === 'ccfoliaTab') ccOnShow(); };
  if (typeof SD_EXTRA_ACTIONS !== 'undefined') SD_EXTRA_ACTIONS.push({ id: 'ccfolia', label: '♟️ ココフォリア準備で開く', title: 'このシナリオを選んで、ココフォリア準備画面を開く', run: sc => { closeScenarioDetail(); switchTab('ccfoliaTab'); ccPickScenario(sc.id); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ccBuild); else ccBuild();
})();
