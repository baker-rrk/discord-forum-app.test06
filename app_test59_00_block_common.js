/* app_test59_00_block_common.js — 公開情報とHOで共通のブロック編集の部品
 * 以前は公開情報側（04・08）とHO側（10）に同じ処理が2つずつあったものを、ここ1か所にまとめてある。
 * 片方だけ直して動きが食い違う、という事故を防ぐため、サブ項目・並べ替え・書式の処理は必ずここを通す。 */

// ----- サブ項目（サブタイトル＋本文のペア） -----
const SUB_FIELD = { title: 'title', text: 'val', style: 'style' };   // 画面側の種類名 → データの項目名
const newSub = () => ({ title: '', val: '', style: 'plain' });
// サブ項目の編集UI。attrs(kind, i) が、各画面の操作用の属性文字列を返す（kind: title / text / style / del / add）
function subItemsEditorHtml(subs, attrs) {
  const rows = (subs || []).map((s, i) => `<div class="sub-item" data-si="${i}"><div class="sub-item-head"><input type="text" ${attrs('title', i)} value="${escapeHTML(s.title)}" placeholder="サブタイトル（小見出し）"><select ${attrs('style', i)} title="サブタイトルの表記（引用の外に出ます）"><option value="plain" ${s.style === 'bold' ? '' : 'selected'}>通常文字</option><option value="bold" ${s.style === 'bold' ? 'selected' : ''}>太字</option></select><button type="button" class="btn-sort btn-danger" ${attrs('del', i)}>✕ 削除</button></div><textarea ${attrs('text', i)} placeholder="サブ項目の本文">${escapeHTML(s.val)}</textarea></div>`).join('');
  return rows + `<button type="button" class="btn btn-secondary btn-sm sub-add" ${attrs('add', -1)}>＋ サブ項目を追加</button>`;
}

// ----- 並べ替え -----
const moveItem = (arr, i, dir) => { const j = i + dir; if (i < 0 || j < 0 || j >= arr.length) return false; const [m] = arr.splice(i, 1); arr.splice(j, 0, m); return true; };   // 動かしたら true

// ----- 書式ボタン（太字・スポイラー・引用） -----
// 選択範囲を before/after で囲む。after が空のときは「選択した各行の先頭」に before を付ける（引用など）。値の更新だけ行い、再描画は呼び出し側
function fmtSelection(ta, before, after) {
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e);
  const rep = after ? before + sel + after : sel.split('\n').map(l => before + l).join('\n');
  ta.value = v.slice(0, s) + rep + v.slice(e); ta.focus(); ta.setSelectionRange(s + rep.length, s + rep.length);
}

// ----- 装飾スタイル（組み込み＋自分で作ったフォーマット） -----
const BUILTIN_DECOR = [['default', '通常'], ['simple', 'シンプル'], ['fancy', 'ファンシー'], ['codeblock', 'コードブロック'], ['none', '装飾なし']];
const isDecorStyle = v => ['default', 'simple', 'fancy', 'codeblock', 'none'].includes(v) || /^fmt_[\w-]+$/.test(String(v));   // 自分のフォーマットのIDは fmt_ で始まる
const decorOptions = () => [...BUILTIN_DECOR, ...((typeof appState !== 'undefined' && Array.isArray(appState.formats)) ? appState.formats : []).map(f => [f.id, '🎨 ' + (f.name || '無題')])];
const decorOptionsHtml = cur => decorOptions().map(([v, l]) => `<option value="${escapeHTML(v)}" ${cur === v ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('');
const sanitizeFormats = list => (Array.isArray(list) ? list : []).filter(f => f && typeof f === 'object').map(f => ({ id: String(f.id == null ? '' : f.id).replace(/[^\w-]/g, '_'), name: _s(f.name), headPre: _s(f.headPre), headPost: _s(f.headPost), linePre: _s(f.linePre), wrap: f.wrap === 'code' ? 'code' : 'none' })).filter(f => /^fmt_[\w-]+$/.test(f.id));

// ----- JSONバックアップの「統合」：今のデータをベースに、ファイルの内容を追加・更新する（純粋関数。引数は書き換えない） -----
function mergeBackupInto(base, inc) {
  const S = { imgAdded: 0, imgUpdated: 0, scenAdded: 0, scenUpdated: 0, scenSame: 0, scenKeptNewer: 0, chAdded: 0, chUpdated: 0, fmtAdded: 0, fmtUpdated: 0, histAdded: 0 };
  const clone = x => JSON.parse(JSON.stringify(x));
  const b = clone(base || {}), n = clone(inc || {});
  const posted = (w, o) => ({ ...w, postedChannels: [...new Set([...(w.postedChannels || []), ...(o.postedChannels || [])])], postedInfo: { ...(o.postedInfo || {}), ...(w.postedInfo || {}) } });   // 投稿済みの記録は両方を合算
  const upsert = (list, items, add, upd, rule, norm = x => x) => {
    const out = [...list], pos = new Map(out.map((x, i) => [x.id, i]));
    (items || []).forEach(it => {
      if (!it || it.id == null) return;
      if (!pos.has(it.id)) { out.push(it); pos.set(it.id, out.length - 1); S[add]++; return; }
      const cur = out[pos.get(it.id)], next = rule(cur, it);
      if (next === null) return;
      if (JSON.stringify(next) === JSON.stringify(norm(cur))) { if (S.scenSame !== undefined && add === 'scenAdded') S.scenSame++; return; }
      out[pos.get(it.id)] = next; S[upd]++;
    });
    return out;
  };
  const scenarios = upsert((b.scenarios || []).filter(x => x && x.id != null), n.scenarios, 'scenAdded', 'scenUpdated', (cur, it) => {
    if (it.updatedAt !== undefined && cur.updatedAt !== undefined && Number(it.updatedAt) < Number(cur.updatedAt)) { S.scenKeptNewer++; return null; }   // 今のデータのほうが新しければ、更新しない
    return posted({ ...cur, ...it }, cur);
  }, x => posted(x, x));   // 「変更なし」の判定は、投稿済みの記録の形をそろえてから比べる
  const channels = upsert((b.channels || []).filter(x => x && x.id != null), n.channels, 'chAdded', 'chUpdated', (cur, it) => ({ ...cur, ...it }));
  const formats = upsert((b.formats || []).filter(x => x && x.id != null), n.formats, 'fmtAdded', 'fmtUpdated', (cur, it) => ({ ...cur, ...it }));
  const imageAssets = upsert((b.imageAssets || []).filter(x => x && x.id != null), n.imageAssets, 'imgAdded', 'imgUpdated', (cur, it) => ({ ...cur, ...it }));
  const imageCategories = [...new Set([...(b.imageCategories || []), ...(n.imageCategories || [])])];   // 共通ギャラリーのカテゴリ：追加のみ
  const key = h => h.date + '|' + h.title + '|' + h.channels, hm = new Map((b.history || []).filter(Boolean).map(h => [key(h), h]));
  const clearedIso = b.historyClearedAt ? new Date(b.historyClearedAt).toISOString() : '';
  (n.history || []).forEach(h => { if (h && !hm.has(key(h)) && !(clearedIso && String(h.date) <= clearedIso)) { hm.set(key(h), h); S.histAdded++; } });
  const history = [...hm.values()].sort((x, y) => String(x.date).localeCompare(String(y.date))).slice(-500);
  const dsc = { ...(b.deletedScenarios || {}) }, dch = { ...(b.deletedChannels || {}) };
  (n.scenarios || []).forEach(s => { if (s) delete dsc[s.id]; }); (n.channels || []).forEach(c => { if (c) delete dch[c.id]; });   // ファイルに含まれるものは、削除済みの記録を外して戻す
  return { merged: { ...b, scenarios, channels, formats, imageAssets, imageCategories, history, ccfolia: mergeCcfolia(b.ccfolia, n.ccfolia), deletedScenarios: dsc, deletedChannels: dch }, summary: S };
}
const mergeSummaryText = S => `シナリオ：追加 ${S.scenAdded}件・更新 ${S.scenUpdated}件・変更なし ${S.scenSame}件` + (S.scenKeptNewer ? `・今のデータのほうが新しいため更新しない ${S.scenKeptNewer}件` : '') + `\nチャンネル：追加 ${S.chAdded}件・更新 ${S.chUpdated}件\nフォーマット：追加 ${S.fmtAdded}件・更新 ${S.fmtUpdated}件\n投稿履歴：追加 ${S.histAdded}件` + (S.imgAdded + S.imgUpdated ? `\nギャラリー画像：追加 ${S.imgAdded}件・更新 ${S.imgUpdated}件` : '');

// ----- ギャラリー（画像素材）・資料ファイルのデータ -----
const DEFAULT_COMMON_CATS = ['未分類', '背景', 'パネル'], DEFAULT_SCENARIO_CATS = ['トレーラー', 'NPC', 'マップ'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const galId = () => 'img_' + Math.random().toString(36).slice(2, 10);
const safeGalId = v => String(v == null ? '' : v).replace(/[^\w-]/g, '_') || galId();
const sanitizeCats = (list, def) => { const out = [...new Set((Array.isArray(list) ? list : []).map(_s).map(s => s.trim()).filter(Boolean))]; return out.length ? out : [...def]; };
const DANGEROUS_EXTS = ['exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'msp', 'sh', 'command', 'app', 'jar', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'ps1', 'lnk', 'reg', 'dll', 'pif', 'cpl', 'hta', 'apk', 'dmg', 'pkg', 'deb', 'rpm', 'appimage'];
const isDangerousName = n => DANGEROUS_EXTS.includes(String(n).split('.').pop().toLowerCase());   // 開くと「起動」してしまう種類のファイル（資料としては登録しない・開かない）
const isAbsPath = p => /^\//.test(p) || /^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p);
const validRel = r => !!r && !r.startsWith('/') && !/(^|\/)\.\.(\/|$)/.test(r) && !/^[A-Za-z]:/.test(r);
const sanitizeAssets = (list, cats) => (Array.isArray(list) ? list : []).filter(a => a && typeof a === 'object').map(a => ({ a, u: String(a.dataUrl || ''), rel: _s(a.rel).replace(/\\/g, '/') }))
  .filter(({ u, rel }) => /^(data:image\/|blob:|@img:)/.test(u) || /^zipview:\/\/.+\.zip\/.+/i.test(u) || (/^file:\/\//i.test(u) && validRel(rel)))   // 画像のデータ・ZIP内の画像(zipview://)・アプリのフォルダ内にコピーした画像(file://＋相対パス)だけを許可
  .map(({ a, u, rel }) => ({ id: safeGalId(a.id), name: _s(a.name), dataUrl: u, ...(rel && validRel(rel) ? { rel } : {}), category: cats && cats.includes(_s(a.category)) ? _s(a.category) : (cats ? cats[0] : _s(a.category)) }));
const DOC_KINDS = ['pdf', 'audio', 'other'];
const sanitizeDocs = list => (Array.isArray(list) ? list : []).filter(x => x && typeof x === 'object').map(x => ({ id: safeGalId(x.id), name: _s(x.name), kind: DOC_KINDS.includes(x.kind) ? x.kind : 'other', path: _s(x.path), rel: _s(x.rel).replace(/\\/g, '/') }))
  .filter(x => x.name && (x.path ? isAbsPath(x.path) && !x.path.includes('\0') && !isDangerousName(x.path) : validRel(x.rel) && !isDangerousName(x.rel)))   // 絶対パス（実行ファイルの類は除く）。旧形式の相対パスは、アプリ内のフォルダのみ
  .map(x => { const o = { id: x.id, name: x.name, kind: x.kind }; if (x.path) o.path = x.path; else o.rel = x.rel; return o; });
const PDF_ASSET_RE = /^ast_[a-z0-9]{8,24}$/;   // IndexedDB の assets ストアの参照キー（16_asset_store.js）
const sanitizePdfs = list => { const seen = new Set(); return (Array.isArray(list) ? list : []).filter(x => x && typeof x === 'object' && PDF_ASSET_RE.test(String(x.assetId || '')))
  .map(x => ({ id: safeGalId(x.id), name: _s(x.name).slice(0, 200), size: Math.max(0, Number(x.size) || 0), assetId: String(x.assetId), role: x.role === 'main' ? 'main' : 'sub', addedAt: Number(x.addedAt) || 0 }))
  .filter(x => x.name && !seen.has(x.id) && seen.add(x.id)); };   // シナリオの登録PDF（本体は端末内のIndexedDB。ここには参照キーだけ）
const addCategory = (cats, name) => { const n = String(name).trim(); if (n && !cats.includes(n)) cats.push(n); return n; };
const uniqueCategory = (cats, base) => { let n = base, i = 2; while (cats.includes(n)) n = base + ' ' + i++; return n; };

// ----- ♟️ ココフォリア準備のデータ（STEP 3）：軽量なJSON。シナリオごと（sc.ccfolia）と、シナリオ未選択の作業領域（appState.ccfolia） -----
const CC_ICON_RE = /^(?:data:image\/|blob:|@img:|https?:\/\/)/i, CC_LIMIT = 500;
const ccStr = (v, n) => _s(v).slice(0, n);
const ccNewId = p => (p || 'cc') + '_' + Math.random().toString(36).slice(2, 10);
const ccId = (v, p) => String(v == null ? '' : v).replace(/[^\w-]/g, '_').slice(0, 40) || ccNewId(p);
const emptyCcfolia = () => ({ system: 'coc6', texts: [], npcs: [], pieces: [] });
function sanitizeCcIcon(i) { const url = typeof i === 'string' ? i : (i && i.url); return typeof url === 'string' && CC_ICON_RE.test(url) ? { url, name: ccStr(i && i.name, 100) } : null; }
const CC_SYSTEMS = ['coc6', 'coc7', 'emoklore', 'insane', 'sw25', 'dx3', 'custom'];
const ccNum = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
function sanitizeCcOpts(o) {   // チャットパレットの生成オプション
  const s = o && typeof o === 'object' ? o : {}, b = v => v === true;
  return { secret: b(s.secret), hideStatus: b(s.hideStatus), burst: b(s.burst), cbrb: s.cbrb !== false, resist: s.resist !== false, hard: b(s.hard), bonus: b(s.bonus), lv: ccNum(s.lv, 1, 20, 2), target: ccNum(s.target, 0, 99, 5), dxDice: ccNum(s.dxDice, 1, 30, 4),
    template: ccStr(s.template, 200) || 'CCB<={value} 【{name}】', cbrbPairs: (Array.isArray(s.cbrbPairs) ? s.cbrbPairs : []).filter(p => p && typeof p === 'object' && p.a && p.b).slice(0, 10).map(p => ({ a: ccStr(p.a, 60), b: ccStr(p.b, 60) })) };
}
function sanitizeCcfolia(o) {
  const src = o && typeof o === 'object' && !Array.isArray(o) ? o : {}, arr = a => (Array.isArray(a) ? a : []).filter(x => x && typeof x === 'object' && !Array.isArray(x)).slice(0, CC_LIMIT);
  const uniq = list => { const s = new Set(); return list.filter(x => !s.has(x.id) && s.add(x.id)); }, at = x => Number(x.createdAt) || 0, lst = (a, n) => (Array.isArray(a) ? a : []).filter(x => x && typeof x === 'object').slice(0, n);
  return {
    system: CC_SYSTEMS.includes(src.system) ? src.system : 'coc6',   // このシナリオ（または未選択領域）の既定のゲームシステム
    texts: uniq(arr(src.texts).map(x => ({ id: ccId(x.id, 'txt'), title: ccStr(x.title, 200), body: ccStr(x.body, 50000), createdAt: at(x), src: { pdf: ccStr(x.src && x.src.pdf, 200), pages: ccStr(x.src && x.src.pages, 40) } }))),
    npcs: uniq(arr(src.npcs).map(x => ({ id: ccId(x.id, 'npc'), name: ccStr(x.name, 100), memo: ccStr(x.memo, 5000), icon: sanitizeCcIcon(x.icon), createdAt: at(x),
      system: CC_SYSTEMS.includes(x.system) ? x.system : '', hideStatus: x.hideStatus === true, commands: ccStr(x.commands, 20000), opts: sanitizeCcOpts(x.opts),
      status: lst(x.status, 40).map(t => ({ label: ccStr(t.label, 30), value: ccNum(t.value, -99999, 99999, 0), max: ccNum(t.max != null ? t.max : t.value, -99999, 99999, 0) })).filter(t => t.label),
      params: lst(x.params, 60).map(t => ({ label: ccStr(t.label, 30), value: ccStr(t.value, 30) })).filter(t => t.label),
      skills: lst(x.skills, 200).map(t => ({ name: ccStr(t.name, 60), value: ccNum(t.value, -9999, 9999, 0), ...(t.dice ? { dice: ccNum(t.dice, 1, 30, 2) } : {}), ...(t.op === '>=' || t.op === '<=' ? { op: t.op } : {}), ...(t.use === false ? { use: false } : {}) })).filter(t => t.name) }))),
    pieces: uniq(arr(src.pieces).map(x => ({ id: ccId(x.id, 'pc'), kind: x.kind === 'object' ? 'object' : 'character', name: ccStr(x.name, 100), memo: ccStr(x.memo, 20000), icon: sanitizeCcIcon(x.icon), textId: x.textId ? ccId(x.textId, 'txt') : '', createdAt: at(x), commands: ccStr(x.commands, 20000), dummy: x.dummy === true })))
  };
}
function mergeCcfolia(a, b) {   // 同じidは今のほう（a）を残し、無いものだけ足す（削除は伝わらないが、データが消えることもない）
  const A = sanitizeCcfolia(a), B = sanitizeCcfolia(b); if (!(a && CC_SYSTEMS.includes(a.system)) && b && CC_SYSTEMS.includes(b.system)) A.system = B.system;
  ['texts', 'npcs', 'pieces'].forEach(k => B[k].forEach(x => { if (!A[k].some(y => y.id === x.id) && A[k].length < CC_LIMIT) A[k].push(x); }));
  return A;
}
window.mergeCcfolia = mergeCcfolia;   // クラウドとの統合（index.html のモジュール）からも使う
