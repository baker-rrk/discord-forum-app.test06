/* app_test59_01_state_model.js — 設定・定数、検索、ブロックのデータモデル、アプリ全体の状態
 * 読み込み順は 01→07（HTMLの<script>の並び）。全ファイルが同じグローバルスコープを共有します。
 * 各ファイルは、前のファイルで定義された関数・変数を使えます。 */
/* Discord フォーラム概要自動投稿ツール — メインスクリプト（discord_forum_app_test24.html から読み込み）
 * 同じフォルダに HTML と一緒に置いてください。Firebase連携は HTML 内の <script type="module"> にあり、
 * このファイルとは window.* の関数（getAppStateForSync / applyMergedState / cloudScheduleSave など）で連携します。
 */
// 添付ファイル1件・1通あたりの上限（設定で変更可。サーバーのブースト状況でDiscordの上限が違うため）
const maxAttachBytes = () => (Number(appState.maxAttachMB) > 0 ? Number(appState.maxAttachMB) : 9.5) * 1024 * 1024;
function saveMaxAttach(v) { appState.maxAttachMB = Math.min(500, Math.max(1, Number(v) || 9.5)); saveState(true); }
const APP_VERSION = 'test59';
console.info('Discord forum tool', APP_VERSION);

// ===== 予期しないエラーの見える化（黙って壊れないように。連続表示は3秒に1回まで） =====
(function () {
  let last = 0;
  const report = (label, e) => {
    const msg = (e instanceof Error ? e.message : (e && e.message)) || String(e);
    if (/^Script error\.?$|ResizeObserver/.test(msg)) return;   // 外部スクリプト由来・無害な通知は無視
    console.error('[' + label + ']', e);
    const now = Date.now(); if (now - last < 3000) return; last = now;
    try { toast('❌ 予期しないエラー: ' + msg + '\n入力中の下書きは自動保存されています。続く場合はJSONバックアップを取って再読み込みしてください'); } catch (x) { logSoft('saveMaxAttach', x); }
  };
  window.addEventListener('error', ev => report('error', ev.error || ev.message));
  window.addEventListener('unhandledrejection', ev => report('promise', ev.reason));
})();

  const defaultFormatConfig = { 
    h1: "## ❚ ", quote: "> ", subPre: "【", subPost: "】", // quoteは固定値(記号+半角スペース)。設定画面からは編集不可
    simpleH1: "◆ ", simpleList: "・ ", fancyH1: "━━━━━ ", fancyList: "✧ " 
  };

  // ===== データモデルの要点 =====
  // channels[]: { id(固定), name, webhookUrl, tags:[{name,id}], guildId? }   ※名前を変えても投稿済み情報は壊れない
  // scenarios[]: { id, title, ..., postedChannels:[チャンネルID], postedInfo:{チャンネルID:{name,tags,date}}, tags:[タグ名] }
  const chById = id => appState.channels.find(c => c.id === id);
  const chByName = n => appState.channels.find(c => c.name === n);
  const selectedChannels = () => appState.channels.filter(c => selectedChannelCols.has(c.id));   // 選択中チャンネル（IDで管理。順序はチャンネル設定の並び）
  const selectedChannelIds = () => selectedChannels().map(c => c.id);
  // タイトルが同じか：全角半角・大文字小文字・空白の違いは無視。完全に同じときだけ「同じシナリオ」とし、部分一致を含むそれ以外は別シナリオとして扱う
  const logSoft = (where, e) => console.warn('[soft-fail] ' + where, e);   // 無視してよい失敗も、原因を追えるようコンソールに残す
  const _normTitle = t => String(t == null ? '' : t).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const titlesSame = (a, b) => { const x = _normTitle(a); return !!x && x === _normTitle(b); };
  const findScenario = title => (currentScenarioId && appState.scenarios.find(s => s.id === currentScenarioId && titlesSame(s.title, title))) || appState.scenarios.find(s => titlesSame(s.title, title));
  function postedLabel(sc, id) { const c = chById(id); return c ? c.name : ((sc.postedInfo && sc.postedInfo[id] && sc.postedInfo[id].name) || String(id)); }
  function ensureChannelIds() {   // 旧データ用：名前から決まるIDを付ける（端末ごとに同じIDになる）
    const used = new Set();
    appState.channels.forEach((c, i) => { if (!c.id || used.has(c.id)) { let id = 'ch_' + hashStr(c.name || ''); if (used.has(id)) id += '_' + i; c.id = id; } used.add(c.id); });
  }
  function normalizePosted(sc) {   // 旧形式（チャンネル名）や別環境のIDを、いまのチャンネルIDへ引き直す
    const info = (sc.postedInfo && typeof sc.postedInfo === 'object') ? sc.postedInfo : {}, out = [];
    (Array.isArray(sc.postedChannels) ? sc.postedChannels : []).forEach(e => {
      let id = chById(e) ? e : null;
      if (!id) { const c = chByName((info[e] && info[e].name) || e); if (c) id = c.id; }
      const key = id || e; if (!out.includes(key)) out.push(key);
      if (key !== e && info[e] && !info[key]) info[key] = info[e];
    });
    Object.keys(info).forEach(k => { if (!out.includes(k)) delete info[k]; });
    out.forEach(k => { const c = chById(k), cur = info[k] || {}; info[k] = Object.assign({}, cur, { name: c ? c.name : (cur.name || k), tags: Array.isArray(cur.tags) ? cur.tags : [] }); });
    sc.postedChannels = out; sc.postedInfo = info; if (!Array.isArray(sc.tags)) sc.tags = [];
  }
  function setPosted(sc, chId, on, tags) {
    if (!Array.isArray(sc.postedChannels)) sc.postedChannels = []; if (!sc.postedInfo) sc.postedInfo = {};
    if (on) {
      if (!sc.postedChannels.includes(chId)) sc.postedChannels.push(chId);
      const c = chById(chId), prev = sc.postedInfo[chId] || {};
      sc.postedInfo[chId] = { name: c ? c.name : (prev.name || chId), tags: tags ? [...tags] : (prev.tags || []), date: new Date().toISOString() };
    } else { sc.postedChannels = sc.postedChannels.filter(x => x !== chId); delete sc.postedInfo[chId]; }
  }
  function tagsForChannel(ch) { return (ch.tags || []).filter(t => activeTagNames.has(t.name)).map(t => t.name); }
  // ===== 検索（全角/半角・大文字小文字・ひらがな/カタカナを区別しない。スペース区切りはAND） =====
  const normSearch = s => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const parseQuery = s => normSearch(s).split(/\s+/).filter(Boolean);
  function scenarioHaystack(sc) {
    const inf = sc.postedInfo || {};
    return normSearch([sc.title, sc.system, sc.playerCount, sc.playTime, sc.reqSkills, sc.recSkills, sc.semiRecSkills, sc.lostRate, sc.aftereffect, sc.trailer, sc.notes, sc.shopUrl,
      ...(sc.tags || []), ...(sc.postedChannels || []).map(id => postedLabel(sc, id)), ...Object.values(inf).flatMap(i => (i && i.tags) || [])].join('\n'));
  }
  function matchQuery(sc, terms) { if (!terms.length) return true; const h = scenarioHaystack(sc); return terms.every(t => h.includes(t)); }
  function renderDBChannelFilter() {   // チャンネル別「投稿済み/未投稿」絞り込みの選択肢（チャンネル設定が変わったときだけ作り直す）
    const sel = document.getElementById('dbFilterChannel'); if (!sel) return;
    const sig = appState.channels.map(c => c.id + ':' + c.name).join('|'); if (sel.dataset.sig === sig) return;
    const cur = sel.value; sel.dataset.sig = sig; sel.innerHTML = '';
    sel.appendChild(new Option('すべてのチャンネル', ''));
    appState.channels.forEach(c => sel.appendChild(new Option(`✓ ${c.name} に投稿済み`, 'y:' + c.id)));
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
  }
  function threadLinksHtml(h) {
    const links = Object.assign({}, h.threadLinks || {}); Object.entries(h.threads || {}).forEach(([n, tid]) => { if (!links[n]) { const c = chByName(n); if (c && c.guildId) links[n] = `https://discord.com/channels/${c.guildId}/${tid}`; } });
    const a = Object.entries(links).filter(([n, u]) => safeUrl(u)).map(([n, u]) => `<a href="${escapeHTML(safeUrl(u))}" target="_blank" rel="noopener noreferrer" style="color:var(--dc-link);">${escapeHTML(n)}</a>`);
    return a.length ? a.join(' / ') : '-';
  }
  // ===== 取り込みデータ（バックアップ／クラウド／下書き）の検証・正規化 =====
  const BLOCK_TYPES = new Set(['text', 'textarea', 'url', 'split', 'image', 'summary_container']);
  const DECOR_STYLES = ['default', 'simple', 'fancy', 'codeblock', 'none'];
  const _s = v => (v == null ? '' : String(v));
  function sanitizeBlock(b) {
    if (!b || typeof b !== 'object') return null;
    if (!BLOCK_TYPES.has(b.type)) b.type = 'text';   // <input type="..."> に未検証の値が入らないようにする
    b.id = _s(b.id); b.label = _s(b.label);
    if (b.keyName != null) b.keyName = _s(b.keyName);
    if (b.decorStyle && !isDecorStyle(b.decorStyle)) b.decorStyle = 'default';
    if (b.file && !(b.file instanceof Blob)) b.file = null;
    if (b.type === 'summary_container') {
      b.items = (Array.isArray(b.items) ? b.items : []).filter(i => i && typeof i === 'object').map(i => ({ keyName: _s(i.keyName), val: _s(i.val), ...(FLAT_FIELDS.includes(i.field) ? { field: i.field } : {}) }));
      b.freeText = _s(b.freeText);
    } else if (b.type === 'image') { b.previewUrl = _s(b.previewUrl); }
    else if (b.type !== 'split') { b.val = _s(b.val); if (Array.isArray(b.subItems)) b.subItems = b.subItems.filter(o => o && typeof o === 'object').map(o => ({ title: _s(o.title), val: _s(o.val), style: o.style === 'bold' ? 'bold' : 'plain' })); }
    return b;
  }
  const sanitizeBlocks = arr => (Array.isArray(arr) ? arr : []).map(sanitizeBlock).filter(Boolean);
  // 起動時に読み込んだ保存データの形を整える（旧バージョン・手編集・同期の不具合などで壊れた項目があっても、起動が止まらないように）
  function repairLoadedState(s) {
    if (!s || typeof s !== 'object') return s;
    const objs = a => (Array.isArray(a) ? a : []).filter(x => x && typeof x === 'object' && !Array.isArray(x));
    s.scenarios = objs(s.scenarios); s.channels = objs(s.channels); s.history = objs(s.history);
    return sanitizeImported(s) || s;
  }
  function sanitizeImported(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.scenarios) || !Array.isArray(o.channels)) return null;
    o.channels = o.channels.filter(c => c && typeof c === 'object').map(c => ({ ...c, id: _s(c.id), name: _s(c.name), webhookUrl: _s(c.webhookUrl).trim(),
      tags: (Array.isArray(c.tags) ? c.tags : []).filter(t => t && typeof t === 'object').map(t => ({ name: _s(t.name), id: _s(t.id).trim() })) }));
    o.scenarios = o.scenarios.filter(x => x && typeof x === 'object').map(x => {
      const out = { ...x };
      ['id', 'title', 'system', 'playerCount', 'playTime', 'shopUrl', 'imageUrl', 'reqSkills', 'recSkills', 'semiRecSkills', 'lostRate', 'aftereffect', 'trailer', 'notes', 'autoReply']
        .forEach(k => { if (k === 'title' || k in out) out[k] = _s(out[k]); });
      out.postedInfo = (x.postedInfo && typeof x.postedInfo === 'object' && !Array.isArray(x.postedInfo)) ? x.postedInfo : {};
      out.tags = (Array.isArray(x.tags) ? x.tags : []).map(_s); if (Array.isArray(x.secretHOs)) out.secretHOs = sanitizeHOs(x.secretHOs);
      out.postedChannels = (Array.isArray(x.postedChannels) ? x.postedChannels : []).map(_s);
      out.imageCategories = sanitizeCats(x.imageCategories, DEFAULT_SCENARIO_CATS); out.images = sanitizeAssets(x.images, out.imageCategories); out.docs = sanitizeDocs(x.docs); out.pdfs = sanitizePdfs(x.pdfs); if (x.ccfolia) out.ccfolia = sanitizeCcfolia(x.ccfolia);
      if (Array.isArray(x.fullBlockData)) out.fullBlockData = sanitizeBlocks(x.fullBlockData);
      return out;
    });
    o.history = (Array.isArray(o.history) ? o.history : []).filter(h => h && typeof h === 'object');
    o.formats = sanitizeFormats(o.formats); o.ccfolia = sanitizeCcfolia(o.ccfolia);
    o.imageCategories = sanitizeCats(o.imageCategories, DEFAULT_COMMON_CATS); o.imageAssets = sanitizeAssets(o.imageAssets, o.imageCategories);
    return o;
  }
  function createDefaultBlocks() {
    return [
    { 
      id: 'summary_container', type: 'summary_container', label: 'シナリオ概要 (まとめブロック)', keyName: 'シナリオ概要', sectionType: 'summary_container', collapsed: true, isCustom: false, decorStyle: 'default',
      items: [
        { keyName: 'システム', val: '', field: 'system' }, { keyName: '人数', val: '', field: 'playerCount' }, { keyName: 'プレイ時間', val: '', field: 'playTime' },
        { keyName: '必須技能', val: '', field: 'reqSkills' }, { keyName: '推奨技能', val: '', field: 'recSkills' }, { keyName: '準推奨技能', val: '', field: 'semiRecSkills' },
        { keyName: 'ロスト率', val: '', field: 'lostRate' }, { keyName: '後遺症', val: '', field: 'aftereffect' }
      ],
      freeText: ''
    },
    { id: 'intro', type: 'textarea', label: 'イントロダクション', keyName: 'イントロダクション', val: '', sectionType: 'standalone', collapsed: true, isCustom: true, decorStyle: 'default' },
    { id: 'notes', type: 'textarea', label: '注意事項・備考', keyName: '注意事項・備考', val: '', sectionType: 'standalone', collapsed: true, isCustom: false, decorStyle: 'default' }
  ];
  }
  let blockOrder = createDefaultBlocks();
  const FLAT_MAP = { 'システム':'system','人数':'playerCount','プレイ時間':'playTime','必須技能':'reqSkills','推奨技能':'recSkills','準推奨技能':'semiRecSkills','ロスト率':'lostRate','後遺症':'aftereffect' };   // 概要ブロックの項目名 ⇔ シナリオの項目名

  // ===== シナリオのデータ構造：fullBlockData（ブロック）を正とし、system/playerCount/notes/imageUrl などのフラット項目は =====
  // ===== 検索・一覧表示用の派生値（deriveFlat で作り直す）。title/shopUrl/trailer/tags/autoReply はブロック外の本体データ。 =====
  const FLAT_FIELDS = Object.values(FLAT_MAP);
  const FIELD_LABEL = Object.fromEntries(Object.entries(FLAT_MAP).map(([k, f]) => [f, k]));
  const findSummaryItem = (sum, f) => sum && sum.items.find(i => i && i.field === f);
  function tagSummaryFields(blocks) {   // 概要項目に、項目名の変更に影響されない固定キー(field)を付ける
    (blocks || []).forEach(b => {
      if (!b || b.type !== 'summary_container' || !Array.isArray(b.items)) return;
      const used = new Set(b.items.map(i => i && i.field).filter(Boolean));
      b.items.forEach(it => { const f = it && FLAT_MAP[it.keyName]; if (it && !it.field && f && !used.has(f)) { it.field = f; used.add(f); } });
    });
  }
  function writeFlatToBlocks(sc, create) {   // フラット項目の値をブロックへ反映（create=true なら無い概要項目は追加）
    const blocks = sc.fullBlockData, sum = blocks.find(b => b.type === 'summary_container');
    if (sum) FLAT_FIELDS.forEach(f => {
      const v = _s(sc[f]), it = findSummaryItem(sum, f);
      if (it) it.val = v; else if (create && v.trim()) sum.items.push({ keyName: FIELD_LABEL[f], val: v, field: f });
    });
    const notes = blocks.find(b => b.id === 'notes'); if (notes) notes.val = _s(sc.notes);
    const img = blocks.find(b => b.type === 'image');
    if (img) { img.previewUrl = _s(sc.imageUrl); img.file = null; }
    else if (sc.imageUrl) blocks.push({ id: 'img_' + Date.now(), type: 'image', label: '画像添付', file: null, previewUrl: sc.imageUrl, sectionType: 'image', collapsed: true, isCustom: true });
  }
  function ensureScenarioBlocks(sc) {   // ブロックが無い旧データ・手動追加データは、フラット項目からブロックを作る
    if (Array.isArray(sc.fullBlockData) && sc.fullBlockData.length) { tagSummaryFields(sc.fullBlockData); return sc.fullBlockData; }
    sc.fullBlockData = createDefaultBlocks(); tagSummaryFields(sc.fullBlockData); writeFlatToBlocks(sc, true);
    return sc.fullBlockData;
  }
  function deriveFlat(sc) {   // ブロック → フラット項目（保存のたびにここだけで作る）
    const blocks = ensureScenarioBlocks(sc), sum = blocks.find(b => b.type === 'summary_container');
    FLAT_FIELDS.forEach(f => { const it = findSummaryItem(sum, f); sc[f] = it ? _s(it.val) : ''; });
    const notes = blocks.find(b => b.id === 'notes'); sc.notes = notes ? _s(notes.val) : '';
    const img = blocks.find(b => b.type === 'image' && b.previewUrl); sc.imageUrl = img ? img.previewUrl : '';
    return sc;
  }
  function applyFlatToBlocks(sc) { ensureScenarioBlocks(sc); writeFlatToBlocks(sc, true); deriveFlat(sc); }   // 編集モーダル・手動追加の入力をブロックへ
  function migrateScenarioBlocks(sc) {   // 旧データの一度きりの移行（それまで最後に編集されたフラット項目を優先し、既存項目だけ更新）
    if (Array.isArray(sc.fullBlockData) && sc.fullBlockData.length) { sc.fullBlockData = sanitizeBlocks(sc.fullBlockData); ensureScenarioBlocks(sc); writeFlatToBlocks(sc, false); }
    else ensureScenarioBlocks(sc);
    deriveFlat(sc);
  }

  let sampleScenarios = [
    {
      title: "サンプルシナリオA", system: "サンプルシステム", playerCount: "4人", playTime: "3〜4時間",
      shopUrl: "https://example.com/", imageUrl: "", reqSkills: "必須技能1、必須技能2", recSkills: "推奨技能1、推奨技能2", semiRecSkills: "準推奨技能1、準推奨技能2",
      lostRate: "低", aftereffect: "なし",
      trailer: "これは架空のサンプルシナリオです。\nここにシナリオのあらすじやトレーラー文を入力します。",
      trailerDecor: "default",
      notes: "ここに注意事項や特記事項を入力します。",
      postedChannels: []
    }
  ];

  let appState = {
    botName: "概要投稿Bot", botAvatarData: "",
    formatConfig: { ...defaultFormatConfig },
    channels: [{ name: "サンプル", webhookUrl: "", tags: [{ name: "タグA", id: "" }, { name: "タグB", id: "" }] }],
    scenarios: sampleScenarios, history: [], ccfolia: { texts: [], npcs: [], pieces: [] },   // ココフォリア準備：シナリオ未選択の作業領域（シナリオごとのデータは sc.ccfolia）
    
    imageCategories: ['未分類', '背景', 'パネル'], imageAssets: []   // 共通ギャラリー（各シナリオ専用の素材は、シナリオの images / imageCategories）
  };

  let selectedChannelCols = new Set();
  let activeTagNames = new Set();
  let dbViewMode = 'card', dbLimit = 60, dbSig = '';
  let currentScenarioId = null;

  
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : ''; }
  function fmtDate(v) { const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString(); }
  const _fu = new WeakMap();
  function revokeFileUrl(f) { if (f && _fu.has(f)) { try { URL.revokeObjectURL(_fu.get(f)); } catch (e) { logSoft('revokeFileUrl', e); } _fu.delete(f); } }
  function fileUrl(f) { if (!_fu.has(f)) _fu.set(f, URL.createObjectURL(f)); return _fu.get(f); }
  async function fetchRetry(url, opts, tries = 3, timeoutMs = 60000) {
    for (let t = 0; ; t++) {
      const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;   // 応答が返らないまま固まるのを防ぐ
      let res;
      try { res = await fetch(url, ctl ? { ...opts, signal: ctl.signal } : opts); }
      finally { if (timer) clearTimeout(timer); }
      if (res.status === 429 && t < tries) {
        let wait = 2000;
        try { const j = await res.clone().json(); wait = Math.ceil((j.retry_after || 2) * 1000) + 200; } catch (e) { logSoft('fetchRetry', e); }
        await new Promise(r => setTimeout(r, wait)); continue;
      }
      return res;
    }
  }
  function renameChannel(i, v) { appState.channels[i].name = v; }   // 投稿済み情報はIDで紐づくので、名前を変えても壊れない
  let draftTimer = null;
  function scheduleDraftSave() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 800); }
  function saveDraft() {
    try {
      const g = id => { const e = document.getElementById(id); return e ? e.value : ''; };
      const d = { title: g('title'), shop: g('topShopUrl'), trailer: g('topTrailer'), decor: g('topTrailerDecor'), reply: g('autoReplyText'),
        vertical: document.getElementById('verticalImageMode').checked, noImage: document.getElementById('noImageMode').checked,
        blocks: blockOrder.map(b => ({ ...b, file: null })),
        channelIds: selectedChannelIds(),
        tags: [...activeTagNames], scenarioId: currentScenarioId, secretHOs: typeof secretHOs !== 'undefined' ? secretHOs : [] };
      window.idbSetRaw('draft', serializeState(d)).catch(e => logSoft('async', e));
    } catch (e) { logSoft('saveDraft', e); }
  }
  async function restoreDraft() {
    try {
      const raw = await window.idbGetRaw('draft'); if (!raw) return;
      const d = JSON.parse(raw); await hydrateRefs(d); const set = (id, v) => { const e = document.getElementById(id); if (e && v !== undefined) e.value = v; };
      set('title', d.title); set('topShopUrl', d.shop); set('topTrailer', d.trailer); set('topTrailerDecor', d.decor || 'default'); set('autoReplyText', d.reply);
      document.getElementById('verticalImageMode').checked = d.vertical !== false; document.getElementById('noImageMode').checked = !!d.noImage;
      if (Array.isArray(d.blocks) && d.blocks.length) { const nb = sanitizeBlocks(d.blocks); if (nb.length) blockOrder = nb; }
      selectedChannelCols = new Set(appState.channels.filter(c => d.channelIds ? d.channelIds.includes(c.id) : (d.channels || []).includes(c.name)).map(c => c.id));
      activeTagNames = new Set(d.tags || []); currentScenarioId = d.scenarioId || null;
      if (Array.isArray(d.secretHOs) && d.secretHOs.length) { secretHOs = sanitizeHOs(d.secretHOs); renderHoAll(); }   // 作業中のHO
    } catch (e) { console.error(e); }
  }

  // ================= 画像ストア（画像は別テーブルにBlobで保存。状態JSONには @img:ID だけ入る） =================
