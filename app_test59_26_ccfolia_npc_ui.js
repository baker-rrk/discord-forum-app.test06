/* app_test59_26_ccfolia_npc_ui.js — STEP 4：NPC駒の錬成モーダル／PDFからのNPC一括検出／駒ZIP・JSONの書き出し
 * 純粋なロジックは 24_npc_parse.js（NP）と 25_ccfolia_export.js（CCZ）。ここは画面とアプリのデータ（ccBucket など）をつなぐ部分。 */
const ccOverlayOpen = () => document.getElementById('ccNpcOverlay') || document.getElementById('ccScanOverlay');
const ccSysLabel = id => (NP.SYSTEMS.find(s => s[0] === id) || [id, id])[1];

// ===== 立ち絵・アイコン（IndexedDB の画像）を Blob に =====
async function ccResolveIcon(icon) {
  const u = String(icon && icon.url || ''); if (!u) return null;
  const fromHash = async h => { await ensureLocalUrl(h); const blob = await idbGet('images', h); if (blob) return { blob, mime: blob.type }; requestImage(h); return null; };
  if (u.startsWith('@img:')) return fromHash(u.slice(5));
  if (u.startsWith('blob:')) { const h = imgUrlToHash.get(u); if (h) { const r = await fromHash(h); if (r) return r; } const res = await fetch(u); return { blob: await res.blob() }; }
  if (u.startsWith('data:image/')) return { blob: dataURLtoBlob(u) };
  if (/^https?:\/\//i.test(u)) return { url: u };
  return null;
}

// ===== 書き出し（ココフォリア用の駒ZIP／貼り付け用JSON） =====
function ccToExportItem(tab, it) {
  if (tab === 'npcs') return { name: it.name, memo: it.memo, status: it.status || [], params: it.params || [], commands: it.commands || '', hideStatus: !!it.hideStatus, icon: it.icon, kind: 'character' };
  if (tab === 'pieces') return { name: it.name, memo: it.memo, status: [], params: [], commands: it.commands || '', icon: it.icon, kind: it.kind };
  return { name: it.title || '無題', memo: it.body || '', status: [], params: [], commands: NP.oneLine(it.body), icon: null, kind: 'character' };   // シナリオテキスト → ダミー駒（メモ＝原文、チャパレ＝改行なしの1行）
}
async function ccExportZip(tab, ids) {
  const b = ccBucket(); return ccExportItems(ids.map(id => (b[tab] || []).find(x => x.id === id)).filter(Boolean).map(it => ccToExportItem(tab, it)));
}
async function ccExportItems(items) {   // items：ccToExportItem() の形
  if (!items.length) return toast('出力する項目にチェックを入れてください');
  try {
    toast('📦 駒ZIPを作っています…', 'info');
    const sc = ccScenario(), r = await CCZ.build(items, ccResolveIcon, { title: sc ? sc.title : '' });
    CCZ.download(r.blob, r.filename);
    toast(`✅ ${r.count}件の駒ZIPを出力しました（${r.filename}）` + (r.warnings.length ? '\n⚠️ ' + r.warnings.join('／') : ''));
  } catch (e) { logSoft('ccExportZip', e); toast('❌ ZIPを作れませんでした：' + (e && e.message || e)); }
}
async function ccCopyJson(tab, id) {
  const it = ((ccBucket()[tab]) || []).find(x => x.id === id); if (!it) return;
  const json = CCZ.clipboardJson(ccToExportItem(tab, it), (it.icon && /^https?:/i.test(it.icon.url)) ? it.icon.url : '');
  try { await navigator.clipboard.writeText(json); toast('📋 ココフォリア貼り付け用のJSONをコピーしました（画像は含まれません。ルームの画面で Ctrl+V）'); } catch (e) { logSoft('ccCopyJson', e); toast('⚠️ コピーできませんでした'); }
}

// ===== 共通：オーバーレイ =====
function ccMakeOverlay(id, title, bodyHtml, footHtml) {
  const ov = document.createElement('div'); ov.id = id; ov.className = 'cc-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', title);
  ov.innerHTML = `<div class="cc-modal"><div class="cc-modal-head"><b>${title}</b><button type="button" class="btn-sort" data-ccm="close">✕ 閉じる</button></div><div class="cc-modal-body" id="${id}Body">${bodyHtml}</div><div class="cc-modal-foot" id="${id}Foot">${footHtml || ''}</div></div>`;
  document.body.appendChild(ov); return ov;
}
function ccCloseOverlays() { ['ccNpcOverlay', 'ccScanOverlay'].forEach(id => { const o = document.getElementById(id); if (o) o.remove(); }); npcDraft = null; scanCancel = true; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ccOverlayOpen() && !document.querySelector('.app-dialog-overlay, .gx-overlay')) { e.stopImmediatePropagation(); ccCloseOverlays(); } }, true);
document.addEventListener('mousedown', e => { if (e.target && e.target.classList && e.target.classList.contains('cc-overlay') && e.target.id === 'ccScanOverlay') ccCloseOverlays(); });

// ===== NPC駒の錬成モーダル =====
let npcDraft = null;
const npcOptsHtml = d => {
  const o = d.opts, e = escapeHTML, cb = (k, label, on) => `<label class="npc-chk"><input type="checkbox" data-npc-opt="${k}" ${on ? 'checked' : ''}> ${label}</label>`;
  const common = cb('secret', '🕶️ シークレットダイス（先頭に s）', o.secret) + `<label class="npc-chk"><input type="checkbox" data-npc-hide ${d.hideStatus ? 'checked' : ''}> 🙈 ステータスを非公開（hideStatus）</label>`;
  let sys = '';
  if (d.system === 'coc6') {
    const names = d.skills.filter(s => s.use !== false).map(s => s.name);
    sys = cb('burst', '🔫 拳銃など：連撃コマンド（x2 / sx2）も併記', o.burst) + cb('cbrb', '🥋 マーシャルアーツ/武道 × こぶし/キック等の CBRB を自動併記', o.cbrb) + cb('resist', '⚖️ 対抗ロール RESB（STR/CON/POW/DEX）', o.resist)
      + `<div class="npc-pair"><span>CBRB を追加：</span><select id="npcPairA">${names.map(n => `<option>${e(n)}</option>`).join('')}</select> ＋ <select id="npcPairB">${names.map(n => `<option>${e(n)}</option>`).join('')}</select><button type="button" class="btn-sort" data-npc="addpair">追加</button>${o.cbrbPairs.map((p, i) => `<span class="npc-tag">${e(p.a)}＋${e(p.b)} <button type="button" data-npc="delpair" data-i="${i}" aria-label="削除">✕</button></span>`).join('')}</div>`;
  } else if (d.system === 'coc7') sys = cb('hard', 'ハード／イクストリームも併記', o.hard) + cb('bonus', 'ボーナス／ペナルティダイスも併記', o.bonus);
  else if (d.system === 'emoklore') sys = `<label class="npc-num">既定の Lv（ダイス数） <input type="number" data-npc-num="lv" min="1" max="20" value="${o.lv}"></label>`;
  else if (d.system === 'insane') sys = `<label class="npc-num">目標値（既定） <input type="number" data-npc-num="target" min="0" max="99" value="${o.target}"></label>`;
  else if (d.system === 'dx3') sys = `<label class="npc-num">ダイス数（既定） <input type="number" data-npc-num="dxDice" min="1" max="30" value="${o.dxDice}"></label>`;
  else if (d.system === 'custom') sys = `<label class="npc-num npc-wide">テンプレート（{name} {value} {half} {fifth}） <input type="text" data-npc-tpl value="${e(o.template)}"></label>`;
  return `<div class="npc-opts">${common}${sys}</div>`;
};
function ccNpcRender() {
  const d = npcDraft, ov = document.getElementById('ccNpcOverlay'); if (!d || !ov) return; const e = escapeHTML;
  const rows = (kind, arr, fields) => arr.map((r, i) => `<div class="npc-row" data-row="${kind}">${fields(r, i)}<button type="button" class="btn-sort btn-danger" data-npc="del${kind}" data-i="${i}" aria-label="削除">✕</button></div>`).join('');
  const inp = (kind, i, f, v, ph, w) => `<input type="text" data-npc-row="${kind}" data-i="${i}" data-f="${f}" value="${e(v == null ? '' : v)}" placeholder="${ph}" ${w ? `style="width:${w}"` : ''}>`;
  ov.querySelector('.cc-modal-body').innerHTML = `
    <div class="npc-top"><div class="npc-face"><span class="cc-icon cc-icon-xl" id="npcIcon">${d.icon ? `<img ${imgAttr(d.icon.url)} alt="立ち絵">` : '👤'}</span><button type="button" class="btn-sort" data-npc="pick">🖼️ 立ち絵を選ぶ</button><button type="button" class="btn-sort" data-npc="clearicon">なし</button></div>
      <div class="npc-basic"><label class="cc-lbl" for="npcName">名前</label><input type="text" id="npcName" value="${e(d.name)}" placeholder="NPCの名前">
        <label class="cc-lbl" for="npcSystem">🎲 ゲームシステム</label><select id="npcSystem">${NP.SYSTEMS.map(([v, l]) => `<option value="${v}" ${d.system === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="npc-grid">
      <section><h4>ステータス <button type="button" class="btn-sort" data-npc="addstatus">＋</button></h4>${rows('status', d.status, (r, i) => inp('status', i, 'label', r.label, 'HP', '6em') + inp('status', i, 'value', r.value, '現在', '5em') + '/' + inp('status', i, 'max', r.max, '最大', '5em'))}</section>
      <section><h4>パラメータ <button type="button" class="btn-sort" data-npc="addparams">＋</button></h4>${rows('params', d.params, (r, i) => inp('params', i, 'label', r.label, 'STR', '6em') + inp('params', i, 'value', r.value, '値', '6em'))}</section>
      <section class="npc-skills"><h4>技能 <button type="button" class="btn-sort" data-npc="addskills">＋</button></h4>${d.skills.map((s, i) => `<div class="npc-row" data-row="skills"><input type="checkbox" data-npc-row="skills" data-i="${i}" data-f="use" ${s.use === false ? '' : 'checked'} aria-label="パレットに含める">${inp('skills', i, 'name', s.name, '技能名', '11em')}${inp('skills', i, 'value', s.value, '値', '4.5em')}<input type="text" data-npc-row="skills" data-i="${i}" data-f="dice" value="${e(s.dice || '')}" placeholder="Lv" title="ダイス数（エモクロア・DX3rd）" style="width:3.5em"><button type="button" class="btn-sort btn-danger" data-npc="delskills" data-i="${i}" aria-label="削除">✕</button></div>`).join('')}</section>
    </div>
    <section class="npc-pal"><h4>🎲 チャットパレット <small>${e(ccSysLabel(d.system))}</small> <button type="button" class="btn-sort" data-npc="regen" title="上の内容と下のオプションから作り直す（手で直した内容は置き換わります）">🔄 再生成</button></h4>${npcOptsHtml(d)}<textarea id="npcPalette" rows="8" spellcheck="false" placeholder="チャットパレット（直接編集もできます）">${e(d.commands)}</textarea></section>
    <label class="cc-lbl" for="npcMemo">メモ</label><textarea id="npcMemo" rows="3">${e(d.memo)}</textarea>`;
  ov.querySelector('.cc-modal-foot').innerHTML = `<button type="button" class="btn" data-npc="save">${d.id ? '💾 更新' : '💾 NPCとして登録'}</button><button type="button" class="btn btn-secondary" data-npc="zip" title="このNPCだけをZIPに出力">📦 このNPCをZIP出力</button><button type="button" class="btn btn-secondary" data-ccm="close">キャンセル</button>`;
}
function npcSync() {   // 画面の入力を npcDraft へ取り込む
  const ov = document.getElementById('ccNpcOverlay'), d = npcDraft; if (!ov || !d) return;
  const v = id => { const el = ov.querySelector('#' + id); return el ? el.value : undefined; };
  if (v('npcName') !== undefined) d.name = v('npcName'); if (v('npcMemo') !== undefined) d.memo = v('npcMemo'); if (v('npcPalette') !== undefined) d.commands = v('npcPalette');
  ov.querySelectorAll('[data-npc-row]').forEach(el => {
    const kind = el.dataset.npcRow, i = Number(el.dataset.i), f = el.dataset.f, row = d[kind] && d[kind][i]; if (!row) return;
    if (f === 'use') row.use = el.checked; else if (f === 'value' && kind === 'skills') row.value = Number(el.value) || 0; else if ((f === 'value' || f === 'max') && kind === 'status') row[f] = Number(el.value) || 0;
    else if (f === 'dice') { const n = Number(el.value); if (n > 0) row.dice = n; else delete row.dice; } else row[f] = el.value;
  });
  ov.querySelectorAll('[data-npc-opt]').forEach(el => { d.opts[el.dataset.npcOpt] = el.checked; });
  ov.querySelectorAll('[data-npc-num]').forEach(el => { d.opts[el.dataset.npcNum] = Number(el.value) || 0; });
  const hide = ov.querySelector('[data-npc-hide]'); if (hide) d.hideStatus = hide.checked; const tpl = ov.querySelector('[data-npc-tpl]'); if (tpl) d.opts.template = tpl.value;
}
function npcRegen() { npcSync(); npcDraft.commands = NP.buildPalette({ system: npcDraft.system, skills: npcDraft.skills, params: npcDraft.params, status: npcDraft.status, opts: { ...npcDraft.opts, secret: !!npcDraft.opts.secret } }); npcDraft.edited = false; }
function ccOpenNpcModal(npc, seed) {
  if (document.getElementById('ccNpcOverlay')) return; const b = ccBucket();
  if (npc) npcDraft = JSON.parse(JSON.stringify(npc));
  else { const p = seed && seed.text ? NP.parseNpc(seed.text) : { name: '', status: [], params: [], skills: [], system: '' }; npcDraft = { id: null, name: p.name || (seed && seed.title) || '', memo: ((seed && seed.text) || '').slice(0, 5000), icon: null, system: p.system || b.system || 'coc6', status: p.status, params: p.params, skills: p.skills.map(s => ({ ...s, use: true })), opts: sanitizeCcOpts(null), commands: '', hideStatus: false }; }
  npcDraft.opts = sanitizeCcOpts(npcDraft.opts); npcDraft.status = npcDraft.status || []; npcDraft.params = npcDraft.params || []; npcDraft.skills = npcDraft.skills || []; npcDraft.hideStatus = !!npcDraft.hideStatus;
  ccMakeOverlay('ccNpcOverlay', '👤 NPC駒を錬成', '', ''); if (!npc || !npcDraft.commands) npcRegen(); ccNpcRender();
  const n = document.getElementById('npcName'); if (n) n.focus();
}
async function ccNpcSave() {
  npcSync(); const d = npcDraft; if (!d.name.trim()) return toast('⚠️ 名前を入力してください');
  const b = ccBucket(), rec = sanitizeCcfolia({ npcs: [{ ...d, id: d.id || ccNewId('npc'), createdAt: d.createdAt || Date.now(), name: d.name.trim(), skills: d.skills.filter(s => String(s.name).trim()) }] }).npcs[0];
  const idx = d.id ? b.npcs.findIndex(x => x.id === d.id) : -1;
  if (idx >= 0) b.npcs[idx] = rec; else { if (b.npcs.length >= CC_LIMIT) return toast('⚠️ NPCは ' + CC_LIMIT + ' 件までです'); b.npcs.push(rec); }
  ccSave(); const wasEdit = idx >= 0; ccCloseOverlays(); cc.tab = 'npcs'; ccRenderAll(); toast(`✅ NPC「${rec.name}」を${wasEdit ? '更新' : '登録'}しました（技能 ${rec.skills.length}・保存先：${ccScenario() ? ccScenario().title : '未選択の作業領域'}）`);
}
document.addEventListener('click', async e => {
  const ov = document.getElementById('ccNpcOverlay'); if (!ov || !ov.contains(e.target)) return;
  if (e.target.closest('[data-ccm="close"]')) return ccCloseOverlays();
  const b = e.target.closest('[data-npc]'); if (!b || !npcDraft) return; const k = b.dataset.npc, d = npcDraft, i = Number(b.dataset.i);
  if (k === 'save') return ccNpcSave();
  npcSync();
  if (k === 'zip') return ccExportItems([ccToExportItem('npcs', sanitizeCcfolia({ npcs: [{ ...d, id: 'tmp', name: d.name || 'NPC' }] }).npcs[0])]);
  if (k === 'pick') { const ic = await ccPickIcon(); if (ic) { d.icon = ic; ccNpcRender(); } return; }
  if (k === 'clearicon') d.icon = null;
  else if (k === 'addstatus') d.status.push({ label: '', value: 0, max: 0 }); else if (k === 'addparams') d.params.push({ label: '', value: '' }); else if (k === 'addskills') d.skills.push({ name: '', value: 50, use: true });
  else if (k === 'delstatus') d.status.splice(i, 1); else if (k === 'delparams') d.params.splice(i, 1); else if (k === 'delskills') d.skills.splice(i, 1);
  else if (k === 'regen') { npcRegen(); }
  else if (k === 'addpair') { const a = ov.querySelector('#npcPairA'), c = ov.querySelector('#npcPairB'); if (a && c && a.value && c.value && a.value !== c.value) d.opts.cbrbPairs.push({ a: a.value, b: c.value }); else return toast('異なる2つの技能を選んでください'); }
  else if (k === 'delpair') d.opts.cbrbPairs.splice(i, 1);
  if (['clearicon', 'addstatus', 'addparams', 'addskills', 'delstatus', 'delparams', 'delskills', 'addpair', 'delpair'].includes(k) && !d.edited) { const keep = d.commands; npcRegen(); if (d.edited) d.commands = keep; }
  ccNpcRender();
});
document.addEventListener('change', e => {
  const ov = document.getElementById('ccNpcOverlay'); if (!ov || !ov.contains(e.target) || !npcDraft) return;
  if (e.target.id === 'npcSystem') { npcSync(); npcDraft.system = e.target.value; npcRegen(); ccNpcRender(); }
  else if (e.target.matches('[data-npc-opt], [data-npc-num], [data-npc-hide], [data-npc-tpl], [data-npc-row]')) { npcSync(); if (!npcDraft.edited && !e.target.matches('[data-npc-hide]')) { npcRegen(); const p = ov.querySelector('#npcPalette'); if (p) p.value = npcDraft.commands; } if (e.target.matches('[data-npc-opt="burst"], [data-npc-opt="cbrb"]')) { /* 再描画は不要 */ } }
});
document.addEventListener('input', e => { const ov = document.getElementById('ccNpcOverlay'); if (ov && e.target.id === 'npcPalette' && npcDraft) npcDraft.edited = true; });
// ===== PDFからNPCを一括検出 =====
let scanCancel = false, scanCands = [];
const ccSleep = ms => new Promise(r => setTimeout(r, ms));
async function ccPageText(pdf, n) {
  const page = await pdf.getPage(n), tc = await page.getTextContent();
  const items = tc.items.filter(i => i && typeof i.str === 'string' && i.transform).map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.hypot(i.transform[2], i.transform[3]) || i.height || 0, page: n }));
  try { page.cleanup(); } catch (e) { logSoft('ccPageText', e); }
  return PX.extract(items, { ruby: true, twoColumn: true, autoTitle: false }).text;
}
async function ccScanNpcs() {
  if (document.getElementById('ccScanOverlay')) return; const entries = ccHost.entries();
  if (!entries.length) return toast('⚠️ 走査できるPDFがありません（シナリオを選ぶか、PDFを開いてください）');
  scanCancel = false; scanCands = []; ccMakeOverlay('ccScanOverlay', '🔍 PDFからNPCを一括検出', '<div class="scan-prog" id="scanProg">準備中…</div><div class="scan-bar"><div id="scanBar"></div></div>', '<button type="button" class="btn btn-secondary" data-ccm="close">中止して閉じる</button>');
  const prog = () => document.getElementById('scanProg'), bar = () => document.getElementById('scanBar'); let done = 0, total = 0, pdfs = [];
  for (const en of entries) { const pdf = await ccHost.load(en.key); if (pdf) { pdfs.push({ en, pdf }); total += pdf.numPages; } }
  for (const { en, pdf } of pdfs) {
    for (let n = 1; n <= pdf.numPages; n++) {
      if (scanCancel || !prog()) return; done++;
      try { const text = await ccPageText(pdf, n); NP.detectBlocks(text, { page: n, pdf: en.name }).forEach(c => scanCands.push(c)); } catch (err) { logSoft('ccScanNpcs', err); }
      if (prog()) { prog().textContent = `「${en.name}」p.${n} / ${pdf.numPages} を走査中…（検出 ${scanCands.length} 件・全体 ${done}/${total}）`; bar().style.width = Math.round(done / Math.max(1, total) * 100) + '%'; }
      if (done % 3 === 0) await ccSleep(0);
    }
  }
  if (!prog()) return;
  const seen = new Set(); scanCands = scanCands.filter(c => { const k = NFKC_(c.name) + '|' + c.status.length + c.params.length + c.skills.length; if (seen.has(k)) return false; seen.add(k); return true; });
  ccScanRender();
}
const NFKC_ = s => String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
function ccScanRender() {
  const body = document.getElementById('ccScanOverlayBody'), foot = document.getElementById('ccScanOverlayFoot'); if (!body) return; const e = escapeHTML;
  if (!scanCands.length) { body.innerHTML = '<div class="cc-empty-list">NPC（ステータス・技能が密集したブロック）は見つかりませんでした。範囲を選んで「👤 NPC駒を錬成」もお試しください。</div>'; foot.innerHTML = '<button type="button" class="btn btn-secondary" data-ccm="close">閉じる</button>'; return; }
  body.innerHTML = `<div class="scan-head">${scanCands.length} 件の候補が見つかりました。登録するものにチェックを入れてください（名前は直せます）。 <button type="button" class="btn-sort" data-scan="all">全選択／解除</button></div>` + scanCands.map((c, i) => `<div class="scan-item"><label class="cc-sel"><input type="checkbox" data-scan-i="${i}" checked aria-label="登録する"></label><div class="scan-main"><input type="text" data-scan-name="${i}" value="${e(c.name || '名無しのNPC')}" aria-label="名前"><small>${e(c.pdf || '')} p.${c.page} ／ ${c.status.map(s => s.label + s.value).join(' ')} ${c.params.slice(0, 9).map(p => p.label + p.value).join(' ')} ／ 技能 ${c.skills.length}${c.system ? ' ／ ' + e(ccSysLabel(c.system)) : ''}</small><details><summary>抽出した文字</summary><pre>${e(c.text.slice(0, 1200))}</pre></details></div></div>`).join('');
  foot.innerHTML = '<button type="button" class="btn" data-scan="register">💾 チェックしたNPCを登録</button><button type="button" class="btn btn-secondary" data-ccm="close">閉じる</button>';
}
document.addEventListener('click', e => {
  const ov = document.getElementById('ccScanOverlay'); if (!ov || !ov.contains(e.target)) return;
  if (e.target.closest('[data-ccm="close"]')) return ccCloseOverlays();
  const b = e.target.closest('[data-scan]'); if (!b) return;
  if (b.dataset.scan === 'all') { const boxes = [...ov.querySelectorAll('[data-scan-i]')], all = boxes.every(x => x.checked); boxes.forEach(x => { x.checked = !all; }); return; }
  if (b.dataset.scan === 'register') {
    const bucket = ccBucket(); let n = 0;
    ov.querySelectorAll('[data-scan-i]').forEach(x => {
      if (!x.checked || bucket.npcs.length >= CC_LIMIT) return; const c = scanCands[Number(x.dataset.scanI)], nm = ov.querySelector(`[data-scan-name="${x.dataset.scanI}"]`);
      const rec = { name: (nm && nm.value.trim()) || c.name || '名無しのNPC', memo: c.text.slice(0, 5000), status: c.status, params: c.params, skills: c.skills, system: c.system || bucket.system, opts: sanitizeCcOpts(null), hideStatus: false, icon: null };
      rec.commands = NP.buildPalette(rec); bucket.npcs.push({ ...sanitizeCcfolia({ npcs: [{ ...rec, id: ccNewId('npc'), createdAt: Date.now() }] }).npcs[0] }); n++;
    });
    ccSave(); ccCloseOverlays(); cc.tab = 'npcs'; ccRenderAll(); toast(`✅ ${n}件のNPCを登録しました（保存先：${ccScenario() ? ccScenario().title : '未選択の作業領域'}）`);
  }
});
