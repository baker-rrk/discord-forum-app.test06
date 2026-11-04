/* app_test59_10_secret_ho.js — 秘匿HO（サブタブ・項目ブロック・DM風プレビュー）
 * 各HOは { name, tagline, blocks }。blocks は公開情報と同じ「項目ブロック」{ type:'item', keyName, val, decorStyle, subItems } と画像ブロック { type:'image', previewUrl }。
 * 出力の1行目は「# HO名：__tagline__」（tagline が空なら見出し行なし）。HOの内容はDiscordへは送信されません（DMへ手動で貼る下書き）。 */
let secretHOs = [], activeHO = -1;
const hoId = () => 'hb_' + Math.random().toString(36).slice(2, 9);
const newHOItem = () => ({ id: hoId(), type: 'item', keyName: '', val: '', decorStyle: 'default', subItems: [] });
const newHO = () => ({ name: 'HO' + (secretHOs.length + 1), tagline: '', blocks: [newHOItem()] });
const sanitizeSubs = list => (Array.isArray(list) ? list : []).filter(o => o && typeof o === 'object').map(o => ({ title: _s(o.title), val: _s(o.val), style: o.style === 'bold' ? 'bold' : 'plain' }));
const safeId = v => String(v == null ? '' : v).replace(/[^\w-]/g, '_') || hoId();   // 画面のHTML属性に入るので、英数字・_・- だけにする
const uniqIds = arr => { const seen = new Set(); arr.forEach(b => { while (seen.has(b.id)) b.id += '_' + Math.random().toString(36).slice(2, 5); seen.add(b.id); }); return arr; };
function sanitizeHOs(list) {   // 取り込み・同期・旧形式（テキストだけのブロック）のデータを、今の形に整える
  return (Array.isArray(list) ? list : []).filter(h => h && typeof h === 'object').map(h => ({ name: _s(h.name), tagline: _s(h.tagline), blocks: uniqIds((Array.isArray(h.blocks) ? h.blocks : []).filter(b => b && typeof b === 'object').map(b => b.type === 'image'
    ? { id: safeId(b.id), type: 'image', previewUrl: _s(b.previewUrl), collapsed: b.collapsed === true }
    : b.type === 'split' ? { id: safeId(b.id), type: 'split' }
    : { id: safeId(b.id), type: 'item', keyName: _s(b.keyName), val: _s(b.val), decorStyle: isDecorStyle(b.decorStyle) ? b.decorStyle : 'default', subItems: sanitizeSubs(b.subItems), collapsed: b.collapsed === true })) }));
}
const cloneHOs = () => sanitizeHOs(JSON.parse(JSON.stringify(secretHOs)));
const saveHoDraft = () => scheduleDraftSave();   // HOの下書きは、公開情報と同じ下書き（画像は参照）に含めて保存する
function setHOs(list) { secretHOs = sanitizeHOs(list); activeHO = -1; renderHoAll(); saveHoDraft(); }
function renderHoAll() { renderHoTabs(); renderHoPanel(); applyHoView(); }
function renderHoTabs() {
  const box = document.getElementById('hoTabs'); if (!box) return;
  const tab = (label, cls, act, i) => `<button type="button" role="tab" aria-selected="${cls.includes('active')}" class="ho-tab ${cls}" data-ho-act="${act}" data-hi="${i}"${i >= 0 ? ` draggable="true" data-hdrag="${i}" title="ドラッグで並べ替え"` : ''}>${label}</button>`;
  box.innerHTML = tab('🌐 フォーラム公開情報', activeHO < 0 ? 'active' : '', 'tab', -1) + secretHOs.map((h, i) => tab('🔒 ' + escapeHTML(h.name || 'HO'), activeHO === i ? 'active' : '', 'tab', i)).join('') + tab('＋ HO追加', 'add', 'add-ho', -1);
}
function applyHoView() {   // HOタブの間は、入力欄もプレビューもHO用に切り替える
  const on = activeHO >= 0 && secretHOs[activeHO];
  document.getElementById('postForm').style.display = on ? 'none' : '';
  document.getElementById('hoPanel').style.display = on ? '' : 'none';
  document.getElementById('pubPreviewBox').style.display = on ? 'none' : '';
  document.getElementById('hoPreviewBox').style.display = on ? '' : 'none';
  if (on) renderHoPreview();
}
const hoDecorSelect = b => `<select data-ho-in="decor" title="本文の装飾">${decorOptionsHtml(b.decorStyle)}</select>`;
function hoSubsHtml(b) {   // HO側：共通のサブ項目UIに、HO用の操作属性を渡す
  return subItemsEditorHtml(b.subItems, (k, i) => k === 'add' ? 'data-ho-act="sub-add"' : k === 'del' ? `data-ho-act="sub-del" data-si="${i}"` : `data-ho-in="sub-${k}"`);
}
const hoBadge = b => (b.val && b.val.trim()) || (b.subItems || []).length ? '<span class="type-badge has-val">🟢 入力あり</span>' : '';
function renderHoPanel() {
  const box = document.getElementById('hoPanel'), h = secretHOs[activeHO]; if (!box || !h) { if (box) box.innerHTML = ''; return; }
  const ctl = '<span class="sort-controls"><button type="button" class="btn-sort" data-ho-act="up" title="上へ移動">▲</button><button type="button" class="btn-sort" data-ho-act="down" title="下へ移動">▼</button><button type="button" class="btn-sort btn-danger" data-ho-act="del-block">✕ 削除</button></span>';
  const handle = '<span class="ho-handle drag-handle" draggable="true" data-ho-handle title="ドラッグで並べ替え">⠿</span>';
  const fmt = '<div class="fmt-toolbar"><button type="button" class="fmt-btn" data-ho-act="fmt" data-fb="**" data-fa="**"><b>B</b> 太字</button><button type="button" class="fmt-btn" data-ho-act="fmt" data-fb="||" data-fa="||">👁️ スポイラー</button><button type="button" class="fmt-btn" data-ho-act="fmt" data-fb="&gt; " data-fa="">💬 引用</button></div>';
  const blocks = h.blocks.map(b => {
    const col = b.collapsed === true, arrow = col ? '▶' : '▼';
    if (b.type === 'split') return `<div class="ho-block ho-splitblk" data-hb="${b.id}"><div class="ho-bar">${handle}<span style="flex:1">✂️ --- 投稿分割ポイント（ここから次のメッセージ） ---</span>${ctl}</div></div>`;
    if (b.type === 'image') return `<div class="ho-block" data-hb="${b.id}"><div class="ho-bar" data-ho-act="toggle">${handle}<span style="flex:1">${arrow} 🖼️ 画像${b.previewUrl ? ' <span class="type-badge has-val">🟢 設定済み</span>' : ''}</span>${ctl}</div><div class="block-body ${col ? 'collapsed' : ''}"><button type="button" class="btn-sort" data-ho-act="gallery" style="margin-bottom:6px;">🖼️ ギャラリーから選ぶ</button><div class="drop-zone" data-ho-act="pick" title="クリックで選択／ここへドラッグ＆ドロップ">🖼️ ここに画像をドラッグ＆ドロップ、またはクリックして選択（複数可）</div><input type="file" accept="image/*" multiple data-ho-in="file" style="display:none"><input type="text" data-ho-in="url" placeholder="画像URL（アップロードの代わりに入力も可）" value="${escapeHTML(/^(data|blob):/.test(b.previewUrl) ? '' : b.previewUrl)}" style="margin-top:6px">${b.previewUrl ? `<img class="ho-thumb" src="${escapeHTML(imgSrc(b.previewUrl))}" alt=""><button type="button" class="btn-sort btn-danger" data-ho-act="img-clear" style="margin-top:6px">🗑️ 画像を解除</button>` : ''}</div></div>`;
    return `<div class="ho-block" data-hb="${b.id}"><div class="ho-bar" data-ho-act="toggle">${handle}<span style="flex:1;display:flex;gap:6px;align-items:center;flex-wrap:wrap">${arrow} 📑 ${hoBadge(b)}<input type="text" data-ho-in="key" value="${escapeHTML(b.keyName)}" placeholder="項目名（空欄なら見出しなし）" style="max-width:200px;font-weight:bold">${hoDecorSelect(b)}</span>${ctl}</div><div class="block-body ${col ? 'collapsed' : ''}">${fmt}<textarea data-ho-in="text" placeholder="本文を入力">${escapeHTML(b.val)}</textarea>${hoSubsHtml(b)}</div></div>`;
  }).join('');
  box.innerHTML = `<div class="card"><div class="ho-head"><input type="text" data-ho-in="name" value="${escapeHTML(h.name)}" placeholder="HO名（例: HO2。タブ名に反映されます）" style="max-width:200px"><button type="button" class="btn-sort" data-ho-act="tab-left" title="タブを左へ">◀ 左へ</button><button type="button" class="btn-sort" data-ho-act="tab-right" title="タブを右へ">右へ ▶</button><button type="button" class="btn-sort btn-danger" data-ho-act="del-ho">🗑 このHOを削除</button></div><input type="text" data-ho-in="tagline" value="${escapeHTML(h.tagline)}" placeholder="導入の一文（1行目「# HO名：__ここ__」。空欄なら見出し行なし）" style="margin-bottom:12px"><div class="ho-imghint">🖼️ 画像は、下の「＋ 画像を追加」ボタンから追加できます。画像ファイルをこの入力欄へドラッグ＆ドロップしても追加できます（画像ブロックの枠に落とすと、そのブロックに入ります）。</div><div class="ho-add" style="margin-bottom:10px"><button type="button" class="btn btn-secondary" data-ho-act="expand-all">▼ すべて開く</button><button type="button" class="btn btn-secondary" data-ho-act="collapse-all">▲ すべて閉じる</button></div>${blocks}<div class="ho-add"><button type="button" class="btn btn-secondary" data-ho-act="add-item">＋ 項目ブロックを追加</button><button type="button" class="btn btn-secondary" data-ho-act="add-image">＋ 画像を追加（ドラッグ＆ドロップも可）</button><button type="button" class="btn btn-secondary" data-ho-act="add-split">✂️ 投稿分割</button><button type="button" class="btn btn-secondary" data-ho-act="auto-split">✂️ 自動分割</button></div></div>`;
}
const hoHeading = h => { const t = (h.tagline || '').trim(); return t ? `# ${(h.name || '').trim() || 'HO'}：__${t}__` : ''; };
function hoMessages(h) {   // DMに貼る単位。連続する項目ブロックは1つのメッセージにまとめ、画像・投稿分割ブロックのところで区切る（ブロック間は空行2つ）
  const cfg = appState.formatConfig || defaultFormatConfig, head = hoHeading(h), out = []; let buf = [], used = false;
  const flush = () => { if (!buf.length) return; out.push({ kind: 'text', text: (!used && head ? head + '\n\n\n' : '') + buf.join('\n\n\n'), id: 'g' + out.length }); used = true; buf = []; };
  h.blocks.forEach(b => {
    if (b.type === 'image') { flush(); if (b.previewUrl) out.push({ kind: 'image', url: b.previewUrl, id: b.id }); }
    else if (b.type === 'split') { flush(); if (out.length && out[out.length - 1].kind !== 'split') out.push({ kind: 'split', id: b.id }); }
    else { const t = formatItemSection(b.keyName, b.val, b.subItems, b.decorStyle, cfg); if (t) buf.push(t); }
  });
  flush(); while (out.length && out[out.length - 1].kind === 'split') out.pop();
  if (head && !used) out.unshift({ kind: 'text', text: head, id: 'head' });
  return out;
}
async function copyTextToClipboard(t) {
  try { await navigator.clipboard.writeText(t); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (x) { logSoft('copy', x); } ta.remove(); }
  toast('📋 コピーしました');
}
async function hoImageBlob(url) { const r = await fetchRetry(imgSrc(url), {}, 1, 20000); return r.blob(); }
async function hoImagePng(url) { const bmp = await createImageBitmap(await hoImageBlob(url)), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); return new Promise(r => c.toBlob(r, 'image/png')); }
function renderHoPreview() {   // そのHOのDM風プレビュー。コピー・ダウンロードのボタンは、ここ（メッセージごと）にだけ置く
  const box = document.getElementById('hoPreviewBox'), h = secretHOs[activeHO]; if (!box || !h) return;
  const bot = document.getElementById('botName').value || '概要投稿Bot', av = appState.botAvatarData || 'https://cdn.discordapp.com/embed/avatars/0.png', msgs = hoMessages(h);
  const frame = inner => `<div class="discord-msg"><img class="discord-avatar" src="${escapeHTML(av)}"><div style="flex:1"><div><span class="discord-username">${escapeHTML(bot)}</span></div>${inner}</div></div>`;
  const html = msgs.map((m, i) => m.kind === 'split' ? '<div class="ho-splitline">✂️ ここで投稿を分けます</div>' : m.kind === 'image'
    ? frame(`<img class="pv-img" src="${escapeHTML(imgSrc(m.url))}"><div class="ho-copybar"><button type="button" data-ho-copy="img" data-mi="${i}">🖼️ 画像をコピー</button>${/^https?:/.test(m.url) ? `<button type="button" data-ho-copy="imgurl" data-mi="${i}">🔗 画像URLをコピー</button>` : ''}<button type="button" data-ho-copy="dl" data-mi="${i}">⬇ ダウンロード</button></div>`)
    : frame(`<div class="discord-text">${mdToHtml(m.text)}</div><div class="ho-copybar"><button type="button" data-ho-copy="text" data-mi="${i}">📋 このテキストをコピー</button><span class="ho-count${m.text.length > 2000 ? ' over' : ''}">約${m.text.length}文字${m.text.length > 2000 ? '（2000字超：Discordの上限に注意）' : ''}</span></div>`)).join('');
  const texts = msgs.filter(m => m.kind === 'text').length;
  box.innerHTML = `<div class="discord-header"><span>💬 DMプレビュー — 🔒 ${escapeHTML(h.name || 'HO')}</span>${texts > 1 ? '<button type="button" class="ho-copyall" data-ho-copy="all">📋 テキストをまとめてコピー</button>' : ''}</div><div class="ho-hint">上から順にボタンを押して、DiscordのDMへ貼り付けてください（画像は間に挟まります）。この内容はフォーラムには投稿されません。</div>${html || '<div class="ho-hint">まだ内容がありません。左で項目ブロックや画像を追加してください。</div>'}`;
}
// ===== 操作（data-ho-* 属性で委譲） =====
(function () {
  const cur = () => secretHOs[activeHO], blk = el => { const w = el.closest('[data-hb]'); return w && cur() && cur().blocks.find(b => b.id === w.dataset.hb); };
  const changed = () => { renderHoPreview(); saveHoDraft(); scheduleDraftSave(); };
  const moveTab = (from, to) => { if (from === to || to < 0 || to >= secretHOs.length || from < 0) return; const act = secretHOs[activeHO], [m] = secretHOs.splice(from, 1); secretHOs.splice(to, 0, m); activeHO = act ? secretHOs.indexOf(act) : -1; renderHoAll(); saveHoDraft(); scheduleDraftSave(); };
  async function addImages(files, target) {   // 画像の追加（圧縮して保持）。対象の画像ブロックがあればそこへ、残りは後ろに新しいブロックとして追加
    const h = cur(); if (!h) return; const imgs = files.filter(f => f.type.startsWith('image/'));
    for (let i = 0; i < imgs.length; i++) { const url = await compressImage(imgs[i], 1280, 1280, 0.8); if (i === 0 && target) target.previewUrl = url; else h.blocks.splice(target ? h.blocks.indexOf(target) + i : h.blocks.length, 0, { id: hoId(), type: 'image', previewUrl: url, collapsed: false }); }
    renderHoPanel(); changed();
  }
  function autoSplit() {   // 各メッセージが1900文字以内になるよう、項目ブロックの境目に分割ポイントを自動挿入（手動の分割・画像は区切りとして尊重）
    const h = cur(), cfg = appState.formatConfig || defaultFormatConfig, LIM = 1900, out = []; let len = hoHeading(h) ? hoHeading(h).length + 3 : 0, has = false, n = 0;
    for (const b of h.blocks) {
      if (b.type === 'split' || b.type === 'image') { out.push(b); len = 0; has = false; continue; }
      const t = formatItemSection(b.keyName, b.val, b.subItems, b.decorStyle, cfg); if (!t) { out.push(b); continue; }
      const add = t.length + (has ? 3 : 0);
      if (has && len + add > LIM) { out.push({ id: hoId(), type: 'split' }); n++; len = t.length; } else len += add;
      has = true; out.push(b);
    }
    if (!n) return toast('自動分割は不要です（すべて' + LIM + '文字以内です）');
    h.blocks = out; renderHoPanel(); changed(); toast('✅ 分割ポイントを' + n + 'か所追加しました');
  }
  function fmtText(ta, before, after) { fmtSelection(ta, before, after); ta.dispatchEvent(new Event('input', { bubbles: true })); }
  let dragHb = null, dragTab = -1;
  document.addEventListener('click', async e => {
    const c = e.target.closest && e.target.closest('[data-ho-copy]');
    if (c && cur()) { const msgs = hoMessages(cur()), m = msgs[Number(c.dataset.mi)], k = c.dataset.hoCopy;
      try {
        if (k === 'all') await copyTextToClipboard(msgs.filter(x => x.kind === 'text').map(x => x.text).join('\n\n\n'));
        else if (!m) return;
        else if (k === 'text') await copyTextToClipboard(m.text);
        else if (k === 'imgurl') await copyTextToClipboard(m.url);
        else if (k === 'img') { await navigator.clipboard.write([new ClipboardItem({ 'image/png': hoImagePng(m.url) })]); toast('🖼️ 画像をコピーしました'); }
        else if (k === 'dl') { const blob = await hoImageBlob(m.url), u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = (cur().name || 'HO') + '_' + m.id + '.' + ((blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')); a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
      } catch (err) { logSoft('ho copy', err); toast('⚠️ コピー／保存に失敗しました。「⬇ ダウンロード」をお試しください'); }
      return; }
    const el = e.target.closest && e.target.closest('[data-ho-act]'); if (!el) return; const act = el.dataset.hoAct, h = cur(), b = blk(el);
    if (act === 'toggle') { const inner = e.target.closest('input,textarea,select,button,label,.sort-controls,.ho-handle'); if (inner && inner !== el) return; }
    if (act === 'tab') { activeHO = Number(el.dataset.hi); renderHoAll(); return; }
    if (act === 'add-ho') { secretHOs.push(newHO()); activeHO = secretHOs.length - 1; renderHoAll(); saveHoDraft(); scheduleDraftSave(); return; }
    if (!h) return;
    if (act === 'del-ho') { if (!(await appConfirm('このHO「' + (h.name || 'HO') + '」を削除しますか？', { okText: '削除', danger: true }))) return; secretHOs.splice(activeHO, 1); activeHO = -1; renderHoAll(); saveHoDraft(); scheduleDraftSave(); return; }
    if (act === 'tab-left') { moveTab(activeHO, activeHO - 1); return; } if (act === 'tab-right') { moveTab(activeHO, activeHO + 1); return; }
    if (act === 'pick') { const fi = el.closest('[data-hb]').querySelector('[data-ho-in="file"]'); if (fi && !(e.target.matches && e.target.matches('input'))) fi.click(); return; }
    if (act === 'fmt') { const ta = el.closest('[data-hb]').querySelector('[data-ho-in="text"]'); if (ta) fmtText(ta, el.dataset.fb, el.dataset.fa || ''); return; }
    if (act === 'auto-split') { autoSplit(); return; }
    if (act === 'add-item') h.blocks.push(newHOItem());
    else if (act === 'add-split') h.blocks.push({ id: hoId(), type: 'split' });
    else if (act === 'expand-all' || act === 'collapse-all') h.blocks.forEach(x => { if (x.type !== 'split') x.collapsed = act === 'collapse-all'; });
    else if (act === 'toggle' && b) b.collapsed = !(b.collapsed === true);
    else if (act === 'img-clear' && b) { confirmImageRemoval(b.previewUrl).then(ok => { if (ok) { b.previewUrl = ''; renderHoPanel(); changed(); } }); return; }
    else if (act === 'gallery' && b) { pickGalleryImage().then(url => { if (url) { b.previewUrl = url; renderHoPanel(); changed(); } }); return; }
    else if (act === 'add-image') h.blocks.push({ id: hoId(), type: 'image', previewUrl: '' });
    else if (act === 'sub-add' && b) b.subItems.push(newSub());
    else if (act === 'sub-del' && b) b.subItems.splice(Number(el.dataset.si), 1);
    else if (b) { const i = h.blocks.indexOf(b); if (act === 'del-block') h.blocks.splice(i, 1); else if (act === 'up') moveItem(h.blocks, i, -1); else if (act === 'down') moveItem(h.blocks, i, 1); }
    renderHoPanel(); changed();
  });
  document.addEventListener('input', e => {
    const el = e.target.closest && e.target.closest('[data-ho-in]'); if (!el || !cur()) return; const k = el.dataset.hoIn, b = blk(el), v = el.value, sub = () => { const w = el.closest('[data-si]'); return b && w && b.subItems[Number(w.dataset.si)]; };
    if (k === 'name') { cur().name = v; renderHoTabs(); }   // タブ名にすぐ反映
    else if (k === 'tagline') cur().tagline = v;
    else if (b && k === 'key') b.keyName = v; else if (b && k === 'text') b.val = v; else if (b && k === 'decor') b.decorStyle = v; else if (b && k === 'url') b.previewUrl = v.trim();
    else if (k.startsWith('sub-') && sub()) sub()[SUB_FIELD[k.slice(4)]] = v;
    changed();
  });
  document.addEventListener('change', async e => {
    const el = e.target.closest && e.target.closest('[data-ho-in="file"]'); if (!el || !cur() || !el.files[0]) return; const b = blk(el); if (!b) return;
    await addImages([...el.files], b);
  });
  document.addEventListener('dragstart', e => {
    const hd = e.target.closest && e.target.closest('[data-ho-handle]');
    if (hd) { const w = hd.closest('[data-hb]'); dragHb = w.dataset.hb; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'ho-block'); e.dataTransfer.setDragImage(w, 10, 10); w.classList.add('dragging'); return; }
    const tb = e.target.closest && e.target.closest('[data-hdrag]'); if (tb) { dragTab = Number(tb.dataset.hdrag); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'ho-tab'); }
  });
  const clearFileDrag = () => { const pn = document.getElementById('hoPanel'); if (pn) { pn.classList.remove('ho-filedrag'); pn.querySelectorAll('.drop-zone.dragover').forEach(x => x.classList.remove('dragover')); } };
  document.addEventListener('dragleave', e => { const pn = document.getElementById('hoPanel'); if (pn && !(e.relatedTarget && pn.contains(e.relatedTarget))) clearFileDrag(); });
  document.addEventListener('dragend', () => { clearFileDrag(); dragHb = null; dragTab = -1; document.querySelectorAll('.dragging,.ho-over').forEach(x => x.classList.remove('dragging', 'ho-over')); });
  document.addEventListener('dragover', e => {
    const w = e.target.closest && e.target.closest('[data-hb]'), tb = e.target.closest && e.target.closest('[data-hdrag]'), files = e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    document.querySelectorAll('.ho-over').forEach(x => { if (x !== w && x !== tb) x.classList.remove('ho-over'); });
    if (dragHb && w) { e.preventDefault(); w.classList.add('ho-over'); } else if (dragTab >= 0 && tb) { e.preventDefault(); tb.classList.add('ho-over'); } else if (files && e.target.closest && e.target.closest('#hoPanel')) { e.preventDefault(); const pn = document.getElementById('hoPanel'), z = e.target.closest('.drop-zone'); pn.classList.add('ho-filedrag'); pn.querySelectorAll('.drop-zone.dragover').forEach(x => { if (x !== z) x.classList.remove('dragover'); }); if (z) z.classList.add('dragover'); }
  });
  document.addEventListener('drop', async e => {   // ブロックの並べ替え／タブの並べ替え／画像ファイルのドロップ（画像ブロック上ならそのブロックへ、それ以外は末尾に追加）
    clearFileDrag();
    const h = cur(), w = e.target.closest && e.target.closest('[data-hb]'), tb = e.target.closest && e.target.closest('[data-hdrag]');
    if (dragHb && h && w) { e.preventDefault(); if (w.dataset.hb !== dragHb) { const r = w.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2, from = h.blocks.findIndex(x => x.id === dragHb), [m] = h.blocks.splice(from, 1), ti = h.blocks.findIndex(x => x.id === w.dataset.hb); h.blocks.splice(after ? ti + 1 : ti, 0, m); renderHoPanel(); changed(); } dragHb = null; return; }
    if (dragTab >= 0 && tb) { e.preventDefault(); moveTab(dragTab, Number(tb.dataset.hdrag)); dragTab = -1; return; }
    if (h && e.dataTransfer && e.dataTransfer.files.length && e.target.closest && e.target.closest('#hoPanel')) { e.preventDefault(); await addImages([...e.dataTransfer.files], w && h.blocks.find(x => x.id === w.dataset.hb && x.type === 'image')); }
  });
  renderHoAll();
})();
// プレビューの再描画に合わせて、HOタブ表示中はDMプレビューも更新する
(function () { const orig = renderPreviewNow; renderPreviewNow = function () { orig(); if (activeHO >= 0) renderHoPreview(); }; })();

// プレビューの拡大表示（公開情報・HOのDMプレビュー共通）。ボタンまたはEscで閉じる
function togglePreviewZoom(force) {
  const pa = document.querySelector('.preview-area'), btn = document.getElementById('previewZoomBtn'); if (!pa) return;
  const on = typeof force === 'boolean' ? force : !pa.classList.contains('zoomed');
  pa.classList.toggle('zoomed', on); if (btn) btn.textContent = on ? '✕ 拡大を閉じる' : '🔍 拡大表示';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.preview-area.zoomed') && !document.querySelector('[role="dialog"]')) togglePreviewZoom(false); });
