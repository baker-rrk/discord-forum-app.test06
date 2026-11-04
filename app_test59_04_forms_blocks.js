/* app_test59_04_forms_blocks.js — モーダル・入力フォーム・ブロック編集・プレビュー
 * 読み込み順は 01→07（HTMLの<script>の並び）。全ファイルが同じグローバルスコープを共有します。
 * 各ファイルは、前のファイルで定義された関数・変数を使えます。 */
  function openPostStatusDialog(scId) {
    const sc = appState.scenarios.find(s => s.id === scId); if (!sc) return;
    normalizePosted(sc);
    const posted = new Set(sc.postedChannels), tags = new Set(sc.tags || []);
    const chItems = appState.channels.map(c => [c.id, c.name]);
    sc.postedChannels.forEach(id => { if (!chById(id)) chItems.push([id, `${postedLabel(sc, id)}（削除済み）`]); });
    const tagNames = []; appState.channels.forEach(c => (c.tags || []).forEach(t => { if (t.name && !tagNames.includes(t.name)) tagNames.push(t.name); }));
    (sc.tags || []).forEach(n => { if (!tagNames.includes(n)) tagNames.push(n); });
    const ov = document.createElement('div'); ov.className = 'app-dialog-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    const box = document.createElement('div'); box.className = 'app-dialog'; box.style.maxHeight = '85vh'; box.style.overflowY = 'auto'; ov.appendChild(box);
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const btn = (cls, text, fn) => { const b = mk('button', 'app-dialog-btn ' + cls, text); b.type = 'button'; b.onclick = fn; return b; };
    const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    const chips = (label, items, set) => {
      const l = mk('div', 'app-dialog-msg', label); l.style.marginTop = '12px'; box.appendChild(l);
      const wrap = mk('div', 'tag-chips'); box.appendChild(wrap);
      if (!items.length) wrap.appendChild(mk('span', '', '（なし）'));
      items.forEach(([key, text]) => {
        const c = mk('div', 'chip' + (set.has(key) ? ' selected' : ''), text); c.tabIndex = 0; c.setAttribute('role', 'checkbox'); c.setAttribute('aria-checked', set.has(key));
        c.onclick = () => { if (set.has(key)) set.delete(key); else set.add(key); c.classList.toggle('selected', set.has(key)); }; wrap.appendChild(c);
      });
    };
    const render = () => {
      box.textContent = ''; box.appendChild(mk('div', 'app-dialog-title', `投稿状態を変更：${sc.title}`));
      chips('投稿済みにするチャンネル（選択中＝投稿済み）', chItems, posted);
      const bulk = mk('div', 'app-dialog-actions'); bulk.style.justifyContent = 'flex-start'; bulk.style.marginTop = '8px';
      bulk.append(btn('', 'すべて未投稿', () => { posted.clear(); render(); }), btn('', 'すべて投稿済み', () => { chItems.forEach(([k]) => posted.add(k)); render(); })); box.appendChild(bulk);
      chips('このシナリオに保存するタグ名', tagNames.map(n => [n, n]), tags);
      const act = mk('div', 'app-dialog-actions');
      act.append(btn('', 'キャンセル', close), btn('primary', '保存', () => {
        const tagList = [...tags];
        chItems.forEach(([id]) => {
          const was = sc.postedChannels.includes(id), now = posted.has(id);
          if (now && !was) { const c = chById(id); setPosted(sc, id, true, tagList.filter(n => c && (c.tags || []).some(t => t.name === n))); }
          else if (!now && was) setPosted(sc, id, false);
        });
        sc.tags = tagList; close(); saveState(); renderDBView(); populateScenarioDBSelect(); checkDuplicateStatus(); toast('✅ 投稿状態を更新しました');
      })); box.appendChild(act);
    };
    render(); document.body.appendChild(ov); document.addEventListener('keydown', onKey, true);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    const first = box.querySelector('.chip'); if (first) first.focus();
  }

  // シナリオ追加/編集フォームの項目（フォームのID接頭辞 e / m ＋ キー名 ⇔ シナリオのプロパティ）
  const SCENARIO_FIELDS = { Title: 'title', System: 'system', ShopUrl: 'shopUrl', PlayerCount: 'playerCount', PlayTime: 'playTime', ReqSkills: 'reqSkills', RecSkills: 'recSkills', SemiRecSkills: 'semiRecSkills', LostRate: 'lostRate', Aftereffect: 'aftereffect', ImageUrl: 'imageUrl', Trailer: 'trailer', Notes: 'notes' };
  const DROP_DEFAULT = '📷 画像ファイルをここにドロップ または クリックして選択';
  function fillScenarioForm(p, sc) { Object.entries(SCENARIO_FIELDS).forEach(([k, f]) => { document.getElementById(p + k).value = (sc && sc[f]) || ''; }); }
  function readScenarioForm(p) { const o = {}; Object.entries(SCENARIO_FIELDS).forEach(([k, f]) => { const v = document.getElementById(p + k).value; o[f] = (f === 'shopUrl' || f === 'imageUrl') ? v.trim() : v; }); return o; }
  async function setScenarioImage(p, f) { if (!f || !f.type.startsWith('image/')) return; document.getElementById(p + 'ImageUrl').value = await compressImage(f); document.getElementById(p + 'DropText').innerText = `📁 ${f.name}`; }
  function showModal(id) { const m = document.getElementById(id); delete m.dataset.dirty; m.style.display = 'flex'; }

  function openEditScenarioModal(idx) {
    const sc = appState.scenarios[idx]; document.getElementById('editIndex').value = idx; fillScenarioForm('e', sc);
    document.getElementById('eDropText').innerText = sc.imageUrl ? '📁 画像設定済み (変更する場合はドロップ)' : DROP_DEFAULT; showModal('editScenarioModal');
  }
  function closeEditScenarioModal() { document.getElementById('editScenarioModal').style.display = 'none'; }
  function clearEditScenarioImage() { document.getElementById('eImageUrl').value = ""; document.getElementById('eDropText').innerText = DROP_DEFAULT; }
  function handleEditScenarioSubmit(e) {
    e.preventDefault(); const idx = document.getElementById('editIndex').value; if (idx === "") return;
    appState.scenarios[idx] = { ...appState.scenarios[idx], ...readScenarioForm('e') };
    applyFlatToBlocks(appState.scenarios[idx]); saveState(); renderDBView(); populateScenarioDBSelect(); closeEditScenarioModal(); toast("✅ シナリオ情報を更新しました！");
  }
  function openAddScenarioModal() { fillScenarioForm('m', null); document.getElementById('mDropText').innerText = DROP_DEFAULT; showModal('addScenarioModal'); }
  function closeAddScenarioModal() { document.getElementById('addScenarioModal').style.display = 'none'; }
  function handleManualAddScenario(e) {
    e.preventDefault();
    { const ns = { id: uid(), ...readScenarioForm('m'), postedChannels: [], postedInfo: {}, tags: [] }; applyFlatToBlocks(ns); appState.scenarios.push(ns); }
    saveState(); populateScenarioDBSelect(); renderDBView(); closeAddScenarioModal(); toast("新規シナリオをデータベースに追加しました！");
  }
  async function handleEditImageDrop(e) { e.preventDefault(); e.currentTarget.classList.remove('dragover'); await setScenarioImage('e', e.dataTransfer.files[0]); }
  async function handleEditImageSelect(e) { await setScenarioImage('e', e.target.files[0]); }
  async function handleManualImageDrop(e) { e.preventDefault(); e.currentTarget.classList.remove('dragover'); await setScenarioImage('m', e.dataTransfer.files[0]); }
  async function handleManualImageSelect(e) { await setScenarioImage('m', e.target.files[0]); }

  async function handleBotAvatarDrop(e) { e.preventDefault(); e.currentTarget.classList.remove('dragover'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) { await setBotAvatar(f); } }
  async function handleBotAvatarSelect(e) { const f = e.target.files[0]; if (f) { await setBotAvatar(f); } }
  async function setBotAvatar(file) {
    const dataUrl = await compressImage(file, 256, 256, 0.9);
    appState.botAvatarData = dataUrl;
    document.getElementById('botAvatarDropText').style.display = 'none';
    const pv = document.getElementById('botAvatarPreview');
    pv.src = dataUrl; pv.style.display = 'inline-block';
    document.getElementById('botAvatarClearBtn').style.display = 'inline-block';
    saveState(); renderPreview();
  }
  function clearBotAvatar() {
    appState.botAvatarData = "";
    document.getElementById('botAvatarDropText').style.display = 'inline-block';
    const pv = document.getElementById('botAvatarPreview');
    pv.src = ""; pv.style.display = 'none';
    document.getElementById('botAvatarClearBtn').style.display = 'none';
    saveState(); renderPreview();
  }
  function loadBotAvatarToUI() {
    if (appState.botAvatarData) {
      document.getElementById('botAvatarDropText').style.display = 'none';
      const pv = document.getElementById('botAvatarPreview');
      pv.src = appState.botAvatarData; pv.style.display = 'inline-block';
      document.getElementById('botAvatarClearBtn').style.display = 'inline-block';
    }
  }

  function addSplitBlock() { blockOrder.push({ id: '__SPLIT_' + Date.now(), type: 'split', label: '✂️ --- 投稿分割ポイント (ここから2通目のメッセージ) ---', sectionType: 'split', collapsed: false, isCustom: true }); renderBlockUI(); renderPreview(); }
  function addImageBlock() { blockOrder.push({ id: 'img_' + Date.now(), type: 'image', label: '画像添付 (ドロップ または URL入力)', file: null, previewUrl: '', sectionType: 'image', collapsed: false, isCustom: true }); renderBlockUI(); renderPreview(); }
  function addCustomBlock() { blockOrder.push({ id: 'custom_' + Date.now(), type: 'textarea', label: '自由セクション', keyName: '自由項目', val: '', sectionType: 'standalone', collapsed: false, isCustom: true, decorStyle: 'default' }); renderBlockUI(); renderPreview(); }
  function autoSplitBlocks() {   // 各通が1900文字以内になるよう、項目ブロックの境目に分割ポイントを自動挿入（手動の分割は尊重）
    const LIMIT = 1900, orig = blockOrder, out = []; let has = false, n = 0;
    try {
      for (const b of orig) {
        if (b.type === 'split') { out.push(b); has = false; continue; }
        blockOrder = [...out, b];
        const chunks = buildPostData(), last = chunks[chunks.length - 1];
        if (has && finalText(last).length > LIMIT) { out.push({ id: '__SPLIT_' + Date.now() + '_' + n, type: 'split', label: '✂️ --- 投稿分割ポイント (ここから次のメッセージ) ---', sectionType: 'split', collapsed: false, isCustom: true }); n++; has = false; }
        out.push(b); if (b.type !== 'image') has = true;
      }
    } finally { blockOrder = orig; }
    if (!n) return toast('自動分割は不要です（すべて' + LIMIT + '文字以内です）');
    blockOrder = out; renderBlockUI(); renderPreview(); toast(`✅ 分割ポイントを${n}か所追加しました。内容を確認してください`);
  }
  function toggleAllBlocks(col) { blockOrder.forEach(b => b.collapsed = col); renderBlockUI(); }

  function renderChannelCheckboxes() {
    const container = document.getElementById('channelCheckboxContainer'); container.innerHTML = "";
    const valid = new Set(); selectedChannelCols.forEach(id => { if (chById(id)) valid.add(id); }); selectedChannelCols = valid;
    appState.channels.forEach((ch, idx) => {
      const chip = document.createElement('div'); chip.className = "chip"; chip.innerText = ch.name; chip.tabIndex = 0; chip.setAttribute('role', 'checkbox'); chip.setAttribute('aria-checked', selectedChannelCols.has(ch.id));
      if (selectedChannelCols.has(ch.id)) chip.classList.add('selected');
      chip.onclick = () => { if (selectedChannelCols.has(ch.id)) { selectedChannelCols.delete(ch.id); chip.classList.remove('selected'); } else { selectedChannelCols.add(ch.id); chip.classList.add('selected'); } updateTagCheckboxes(); checkDuplicateStatus(); renderPreview(); };
      container.appendChild(chip);
    });
  }

  function updateTagCheckboxes() {
    const container = document.getElementById('tagContainer'); container.innerHTML = "";
    let tags = [];
    selectedChannels().forEach(ch => { ch.tags?.forEach(t => { if(t.name && !tags.some(x=>x.name===t.name)) tags.push(t); }); });
    if (tags.length === 0) return container.innerHTML = '<span style="font-size:0.8rem; color:var(--dc-text-muted);">チャンネルを選択すると対応するタグが表示されます</span>';
    tags.forEach(t => {
      const chip = document.createElement('div'); chip.className = "chip"; if (activeTagNames.has(t.name)) chip.classList.add('selected'); chip.innerText = t.name; chip.tabIndex = 0; chip.setAttribute('role', 'checkbox'); chip.setAttribute('aria-checked', activeTagNames.has(t.name));
      chip.onclick = () => { if (activeTagNames.has(t.name)) { activeTagNames.delete(t.name); chip.classList.remove('selected'); } else { activeTagNames.add(t.name); chip.classList.add('selected'); } renderPreview(); };
      container.appendChild(chip);
    });
  }

  function populateScenarioDBSelect() {
    const sel = document.getElementById('dbScenarioSelect'), cur = sel.value;   // 選択中の項目は、並べ直しても保つ
    sel.innerHTML = '<option value="">-- 保存済みシナリオを選択して自動入力 --</option>';
    const label = s => `${(s.favorite ? '★ ' : '')}${s.title} (${s.system || '未指定'} / ${s.playerCount || '未指定'})`;
    const favs = appState.scenarios.filter(s => s.favorite), rest = appState.scenarios.filter(s => !s.favorite);
    const group = (title, list) => { if (!list.length) return; const g = document.createElement('optgroup'); g.label = title; list.forEach(s => g.appendChild(new Option(label(s), s.id))); sel.appendChild(g); };
    if (favs.length) { group(`★ お気に入り（${favs.length}）`, favs); group('その他のシナリオ', rest); }   // お気に入りを先頭にまとめる
    else rest.forEach(s => sel.appendChild(new Option(label(s), s.id)));
    if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  }

  function loadScenarioFromDB(idx) {
    if (idx === "") return; const _k = String(idx); let _i = appState.scenarios.findIndex(s => s.id === _k); if (_i < 0 && /^\d+$/.test(_k)) _i = Number(_k); const sc = appState.scenarios[_i]; if (!sc) return; ensureScenarioBlocks(sc); currentScenarioId = sc.id || null; setHOs(sc.secretHOs || []); setTimeout(() => requestRefsIn(blockOrder), 0); 
    document.getElementById('title').value = sc.title || "";
    document.getElementById('topShopUrl').value = sc.shopUrl || "";
    document.getElementById('topTrailer').value = sc.trailer || "";
    if (document.getElementById('topTrailerDecor')) {
      document.getElementById('topTrailerDecor').value = sc.trailerDecor || 'default';
    }
    
    blockOrder = sanitizeBlocks(JSON.parse(JSON.stringify(ensureScenarioBlocks(sc))));   // 旧データ用の分岐は不要（ensureScenarioBlocks が先にブロックを用意する）
    blockOrder = blockOrder.filter(b => b.id !== 'shopUrl' && b.id !== 'trailer');
    if (!blockOrder.length) blockOrder = createDefaultBlocks();
    blockOrder.forEach(b => { if (!b.decorStyle) b.decorStyle = 'default'; });
    activeTagNames = new Set(Array.isArray(sc.tags) ? sc.tags : []);
    { const ar = document.getElementById('autoReplyText'); if (ar) ar.value = sc.autoReply || ''; const ni = document.getElementById('noImageMode'); if (ni) ni.checked = false; }   // シナリオに保存したタグを復元
    updateTagCheckboxes(); renderBlockUI(); checkDuplicateStatus(); renderPreview();
  }

  function getBlockVal(id) { const item = blockOrder.find(b => b.id === id); return item ? item.val : ""; }

  async function resolveSaveOpts(title) {   // 戻り値: {} = 今の判断どおり／{forceNew:true} = 必ず新規
    const cur = currentScenarioId ? appState.scenarios.find(s => s.id === currentScenarioId) : null;
    const byId = !!cur && titlesSame(cur.title, title);   // 直前のシナリオと完全に同じタイトルなら、そのシナリオを更新
    if (!byId && appState.scenarios.some(s => titlesSame(s.title, title))) {   // 別のシナリオに同名がある（完全一致）ときだけ確認
      const ow = await appConfirm(`「${title}」という同名のシナリオが既にDBにあります。\n既存のシナリオを上書きしますか？\n「別に保存」を選ぶと新しいシナリオとして追加します。`, { okText: '上書きする', cancelText: '別に保存', strict: true });
      if (!ow) return { forceNew: true };
    }
    return {};
  }
  async function saveCurrentToDB() {
    const t = document.getElementById('title').value; if (!t) return toast("シナリオタイトルを入力してください");
    autoSyncToDBOnPost(t, [], await resolveSaveOpts(t)); toast(`「${t}」をデータベースに保存/更新しました！`);
  }

  async function resetInputs() {   // 入力中の「投稿内容」だけをクリア（ブロックの並び・構成、チャンネル選択、各種モードは変えない）
    if (!(await appConfirm('入力中の投稿内容（本文・画像・タグ・選択中のシナリオ）をクリアしますか？\nブロックの並び順やチャンネルの選択はそのままです。', { okText: 'クリア', danger: true }))) return;
    currentScenarioId = null;
    ['title', 'autoReplyText', 'topShopUrl', 'topTrailer'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const sel = document.getElementById('dbScenarioSelect'); if (sel) sel.value = '';
    blockOrder.forEach(b => {
      if (b.type === 'summary_container') { (b.items || []).forEach(it => { it.val = ''; }); b.freeText = ''; }
      else if (b.type === 'image') { b.file = null; b.previewUrl = ''; }
      else if (b.type !== 'split') b.val = '';
    });
    setHOs([]); activeTagNames.clear(); updateTagCheckboxes(); renderBlockUI(); checkDuplicateStatus(); renderPreview();
  }
  async function resetForm() {
    if (!(await appConfirm('入力中のフォームをクリアしますか？', { okText: 'クリア', danger: true }))) return; currentScenarioId = null; setHOs([]);
    document.getElementById('title').value = ""; document.getElementById('autoReplyText').value = ""; document.getElementById('dbScenarioSelect').value = "";
    document.getElementById('topShopUrl').value = ""; document.getElementById('topTrailer').value = "";
    if (document.getElementById('topTrailerDecor')) document.getElementById('topTrailerDecor').value = "default";
    document.getElementById('verticalImageMode').checked = true; document.getElementById('noImageMode').checked = false;
    blockOrder = createDefaultBlocks();
    selectedChannelCols.clear(); activeTagNames.clear(); renderChannelCheckboxes(); updateTagCheckboxes(); renderBlockUI(); checkDuplicateStatus(); renderPreview();
  }

  function checkDuplicateStatus() {
    const t = document.getElementById('title').value, w = document.getElementById('duplicateWarning');
    if (!t || selectedChannelCols.size === 0) return w.style.display = "none";
    const sc = findScenario(t), ids = selectedChannelIds();
    w.style.display = (sc && sc.postedChannels && ids.some(id => sc.postedChannels.includes(id))) ? "block" : "none";
  }

  function getDecorSelectHtml(idx, decorStyle) {
    return `<select style="background:var(--dc-bg-primary); border:1px solid var(--dc-border); color:var(--dc-text-normal); padding:4px; font-size:0.8rem; border-radius:3px; outline:none;" data-bc="decor" data-bid="${idx}">${decorOptionsHtml(decorStyle)}</select>`;
  }

  function subItemsHtml(b) {   // 公開情報側：共通のサブ項目UI（subItemsEditorHtml）に、公開情報用の操作属性を渡す
    return subItemsEditorHtml(b.subItems, (k, i) => k === 'add' ? `data-ba="sub-add" data-bid="${b.id}"` : k === 'del' ? `data-ba="sub-del" data-bid="${b.id}" data-i="${i}"` : `data-bi="sub-${k}" data-bid="${b.id}" data-i="${i}"`);
  }
  function renderBlockUI() {
    blockOrder = blockOrder.filter(b => b && typeof b === 'object'); blockOrder.forEach(b => sanitizeBlock(b)); tagSummaryFields(blockOrder);
    blockOrder.forEach(b => { b.id = String(b.id || '').replace(/[^\w-]/g, '_') || ('b_' + uid()); });
    { const seen = new Set(); blockOrder.forEach(b => { while (seen.has(b.id)) b.id += '_' + Math.random().toString(36).slice(2, 5); seen.add(b.id); }); }   // IDは必ず一意に   // 取り込んだデータのIDがHTML属性を壊さないように
    const container = document.getElementById('sortableBlockContainer'); container.innerHTML = "";
    blockOrder.forEach((b, idx) => {
      const item = document.createElement('div');
      item.className = `sortable-item ${b.type==='split'?'split-item':''} ${b.type==='image'?'image-item':''}${b.type==='summary_container'?'summary-block':''}`;
      if (b.type === 'split') {
        item.innerHTML = `<div class="sortable-header" style="background:transparent;"><strong style="color:var(--dc-yellow-fg);">${escapeHTML(b.label)}</strong><div class="sort-controls"><button type="button" class="btn-sort" data-ba="up" data-bid="${b.id}" aria-label="上へ移動" title="上へ移動">▲</button><button type="button" class="btn-sort" data-ba="down" data-bid="${b.id}" aria-label="下へ移動" title="下へ移動">▼</button><button type="button" class="btn-sort btn-danger" data-ba="del" data-bid="${b.id}">✕ 削除</button></div></div>`;
      } 
      else if (b.type === 'summary_container') {
        const isCollapsed = b.collapsed !== false; const hasVal = b.items.some(i => i.val && i.val.trim()) || (b.freeText && b.freeText.trim());
        item.innerHTML = `
          <div class="sortable-header" data-ba="toggle" data-bid="${b.id}">
            <div class="sortable-title">
              <span>${isCollapsed ? '▶' : '▼'}</span><span class="type-badge summary">📦 概要まとめ</span>${hasVal ? `<span class="type-badge has-val">🟢 入力あり</span>` : ''}
              <span style="display:inline-flex; align-items:center; gap:4px; background:rgba(255,255,255,0.05); padding:4px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); margin-left:12px;">
                <input type="text" value="${escapeHTML(b.keyName)}" placeholder="項目名(空欄可)" title="空欄にすると見出しをつけません" style="padding:4px 6px; font-weight:bold; width:130px; background:var(--dc-bg-primary); border:1px solid var(--dc-border); color:var(--dc-text-normal); font-size:0.8rem;" data-bi="key" data-bid="${b.id}">
                ${getDecorSelectHtml(b.id, b.decorStyle)}
              </span>
            </div>
            <div class="sort-controls"><button type="button" class="btn-sort" data-ba="up" data-bid="${b.id}" aria-label="上へ移動" title="上へ移動">▲</button><button type="button" class="btn-sort" data-ba="down" data-bid="${b.id}" aria-label="下へ移動" title="下へ移動">▼</button></div>
          </div>
          <div class="block-body ${isCollapsed ? 'collapsed' : ''}">
            <div id="summaryItemsContainer">${b.items.map((it, itemIdx) => `
              <div style="display:flex; gap:8px; margin-bottom:8px; align-items:flex-start;">
                <input type="text" value="${escapeHTML(it.keyName)}" placeholder="項目名(空欄可)" title="空欄にすると見出しをつけません" style="width:120px; font-weight:bold; margin-top:2px;" data-bi="item-key" data-bid="${b.id}" data-i="${itemIdx}">
                <textarea placeholder="内容" class="short-input" style="flex:1; padding:8px; line-height:1.4;" data-bi="item-val" data-bid="${b.id}" data-i="${itemIdx}">${escapeHTML(it.val)}</textarea>
                <button type="button" class="btn-sort btn-danger" style="margin-top:2px;" data-ba="item-del" data-bid="${b.id}" data-i="${itemIdx}">✕</button>
              </div>`).join('')}
            </div>
            <button type="button" class="btn btn-secondary" style="margin-bottom:12px;" data-ba="item-add" data-bid="${b.id}">＋ 概要項目を追加</button>
            <div style="border-top:1px dashed var(--dc-border); padding-top:10px;">
              <label style="font-size:0.75rem;">📝 自由記述 (項目名なしでそのまま概要枠内に挿入 ※他の項目と1行間が開きます)</label>
              <textarea placeholder="補足やキャッチコピーなどを自由に入力..." data-bi="free" data-bid="${b.id}">${escapeHTML(b.freeText || '')}</textarea>
            </div>
          </div>`;
      }
      else if (b.type === 'image') {
        const isCollapsed = b.collapsed !== false; const hasVal = b.file || (b.previewUrl && b.previewUrl.trim());
        item.innerHTML = `
          <div class="sortable-header" data-ba="toggle" data-bid="${b.id}">
            <div class="sortable-title">
              <span>${isCollapsed ? '▶' : '▼'}</span><span class="type-badge image">🖼️ 画像添付</span>${hasVal ? `<span class="type-badge has-val">🟢 画像あり</span>` : ''}<strong>${escapeHTML(b.label)}</strong>
            </div>
            <div class="sort-controls"><button type="button" class="btn-sort" data-ba="up" data-bid="${b.id}" aria-label="上へ移動" title="上へ移動">▲</button><button type="button" class="btn-sort" data-ba="down" data-bid="${b.id}" aria-label="下へ移動" title="下へ移動">▼</button>${b.isCustom ? `<button type="button" class="btn-sort btn-danger" data-ba="del" data-bid="${b.id}">✕ 削除</button>` : ''}</div>
          </div>
          <div class="block-body ${isCollapsed ? 'collapsed' : ''}">
            <div style="margin-bottom:6px;"><button type="button" class="btn-sort" data-ba="gallery" data-bid="${b.id}">🖼️ ギャラリーから選ぶ</button></div>
            <div class="drop-zone" data-ba="pick" data-bid="${b.id}">
              <span>${b.file ? `📁 ${escapeHTML(b.file.name)}` : '📷 画像ファイルをここにドラッグ＆ドロップ (複数可)<br>またはクリックして選択'}</span>
              <input type="file" id="fileInput_${b.id}" accept="image/*" multiple style="display:none;" data-bc="file" data-bid="${b.id}">
              ${b.previewUrl ? `<br><img ${imgAttr(b.previewUrl)} class="image-preview-thumb">` : ''}
            </div>
            <div style="margin-top:10px;"><label style="font-size:0.75rem;">🔗 または 画像URLを直接入力</label><input type="url" value="${b.previewUrl && !b.file && /^https?:\/\//i.test(b.previewUrl) ? escapeHTML(b.previewUrl) : ''}" placeholder="https://..." style="padding:6px; font-size:0.85rem;" data-bi="img-url" data-bid="${b.id}"></div>
            ${b.file || b.previewUrl ? `<button type="button" class="btn btn-secondary btn-danger" style="margin-top:8px;" data-ba="img-clear" data-bid="${b.id}">🗑️ 画像を解除</button>` : ''}
          </div>`;
      }
      else {
        const isCollapsed = b.collapsed !== false; const hasVal = b.val && b.val.trim() !== '';
        let badge = b.sectionType === 'standalone' ? `<span class="type-badge standalone">📑 独立</span>` : `<span class="type-badge header">🔗 基本情報</span>`;
        let valBadge = hasVal ? `<span class="type-badge has-val">🟢 入力あり</span>` : '';
        let inp = b.type === 'textarea' ? `<div class="fmt-toolbar"><button type="button" class="fmt-btn" data-ba="fmt" data-fb="**" data-fa="**" data-bid="${b.id}"><b>B</b> 太字</button><button type="button" class="fmt-btn" data-ba="fmt" data-fb="||" data-fa="||" data-bid="${b.id}">👁️ スポイラー</button><button type="button" class="fmt-btn" data-ba="fmt" data-fb="&gt; " data-fa="" data-bid="${b.id}">💬 引用</button></div><textarea id="${b.id}" data-bi="val" data-bid="${b.id}">${escapeHTML(b.val)}</textarea>` : `<input type="${b.type}" id="${b.id}" value="${escapeHTML(b.val)}" data-bi="val" data-bid="${b.id}" placeholder="${escapeHTML(b.label)}">`;
        if (b.type === 'textarea') inp += subItemsHtml(b);
        item.innerHTML = `
          <div class="sortable-header" data-ba="toggle" data-bid="${b.id}">
            <div class="sortable-title">
              <span>${isCollapsed ? '▶' : '▼'}</span>${badge}${valBadge}
              <span style="display:inline-flex; align-items:center; gap:4px; background:rgba(255,255,255,0.05); padding:4px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); margin-left:12px;">
                <input type="text" value="${escapeHTML(b.keyName)}" placeholder="項目名(空欄可)" title="空欄にすると見出しをつけません" style="padding:4px 6px; font-weight:bold; width:130px; background:var(--dc-bg-primary); border:1px solid var(--dc-border); color:var(--dc-text-normal); font-size:0.8rem;" data-bi="key" data-bid="${b.id}">
                ${getDecorSelectHtml(b.id, b.decorStyle)}
              </span>
            </div>
            <div class="sort-controls"><button type="button" class="btn-sort" data-ba="up" data-bid="${b.id}" aria-label="上へ移動" title="上へ移動">▲</button><button type="button" class="btn-sort" data-ba="down" data-bid="${b.id}" aria-label="下へ移動" title="下へ移動">▼</button>${b.isCustom ? `<button type="button" class="btn-sort btn-danger" data-ba="del" data-bid="${b.id}">✕ 削除</button>` : ''}</div>
          </div>
          <div class="block-body ${isCollapsed ? 'collapsed' : ''}">${inp}</div>`;
      }
      container.appendChild(item);
    });
    enhanceSortable(container);
  }

  // ブロックはIDで特定する：クリック時点の並び順(インデックス)をその都度引くので、並び替え・削除・非同期処理の後でもずれない
  const blockIdx = id => blockOrder.findIndex(b => b.id === id);
  function addSummaryItem(i) { blockOrder[i].items.push({ keyName: '新規項目', val: '' }); renderBlockUI(); renderPreview(); }
  function deleteSummaryItem(bi, ii) { blockOrder[bi].items.splice(ii, 1); renderBlockUI(); renderPreview(); }
  const dz = e => (e.target.closest && e.target.closest('[data-ba="pick"]')) || e.currentTarget;   // 委譲されたイベントでも、対象のドロップゾーンを取る
  function handleDragOver(e) { e.preventDefault(); e.stopPropagation(); dz(e).classList.add('dragover'); }
  function handleDragLeave(e) { e.preventDefault(); e.stopPropagation(); dz(e).classList.remove('dragover'); }
  function handleContainerDragOver(e) { if (dragFrom !== null) return; e.preventDefault(); e.currentTarget.classList.add('sortable-container-drop-active'); }
  function handleContainerDragLeave(e) { e.currentTarget.classList.remove('sortable-container-drop-active'); }
  function handleContainerDrop(e) { if (dragFrom !== null) return; if (e.target.closest && e.target.closest('[data-ba="pick"]')) return;   // 画像ブロック上のドロップは、その画像ブロック側で処理済み
    e.preventDefault(); e.currentTarget.classList.remove('sortable-container-drop-active'); if (e.dataTransfer.files) processMultipleImageFiles(e.dataTransfer.files, -1); }

  async function processMultipleImageFiles(files, tIdx = -1) {
    const tId = (tIdx >= 0 && blockOrder[tIdx]) ? blockOrder[tIdx].id : null;   // 対象ブロックはIDで保持
    if (!files || files.length === 0) return; const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/')); if (imageFiles.length === 0) return;
    for (let i = 0; i < imageFiles.length; i++) {
      const url = await compressImage(imageFiles[i], 1280, 1280, 0.8);
      const tb = tId ? blockOrder.find(x => x.id === tId) : null;
      if (i === 0 && tb && tb.type === 'image') { tb.file = imageFiles[i]; tb.previewUrl = url; }
      else blockOrder.push({ id: 'img_' + Date.now() + i, type: 'image', label: '画像添付', file: imageFiles[i], previewUrl: url, sectionType: 'image', collapsed: false, isCustom: true });
    }
    renderBlockUI(); renderPreview();
  }
  function handleFileDrop(e, idx) { e.preventDefault(); e.stopPropagation(); dz(e).classList.remove('dragover'); if (e.dataTransfer.files) processMultipleImageFiles(e.dataTransfer.files, idx); }
  function handleFileSelect(e, idx) { if (e.target.files) processMultipleImageFiles(e.target.files, idx); }
  function handleImageUrlInput(idx, url) { blockOrder[idx].file = null; blockOrder[idx].previewUrl = url.trim(); renderPreview(); }
  function clearImageFile(idx) { revokeFileUrl(blockOrder[idx].file); blockOrder[idx].file = null; blockOrder[idx].previewUrl = ''; renderBlockUI(); renderPreview(); }
  function toggleBlockCollapse(idx) { blockOrder[idx].collapsed = !blockOrder[idx].collapsed; renderBlockUI(); }
  function updateBlockValue(idx, val) { blockOrder[idx].val = val; renderPreview(); }
  function moveBlock(idx, dir) { if (!moveItem(blockOrder, idx, dir)) return; renderBlockUI(); renderPreview(); }
  function deleteCustomBlock(idx) { revokeFileUrl(blockOrder[idx] && blockOrder[idx].file); blockOrder.splice(idx, 1); renderBlockUI(); renderPreview(); }
  function insertFmt(id, b, a = '') { const el = document.getElementById(id); if (!el) return; fmtSelection(el, b, a); const idx = blockOrder.findIndex(x => x.id === id); if (idx !== -1) blockOrder[idx].val = el.value; renderPreview(); }

  // 項目ブロック1つ分の出力：見出し → 本文（装飾スタイルに沿う）→ サブ項目（サブタイトル行は引用の外／通常文字か太字、本文は引用）
  // ----- 装飾（見出し・本文の各行）。組み込みの5種類と、設定で作った自分のフォーマットを、ここで一括して扱う -----
  const customFormat = style => ((typeof appState !== 'undefined' && appState.formats) || []).find(f => f.id === style) || null;
  function decorHead(t, style, cfg) {
    if (!t) return '';
    const cf = customFormat(style); if (cf) return cf.headPre + t + cf.headPost;
    return style === 'simple' ? cfg.simpleH1 + t : style === 'fancy' ? cfg.fancyH1 + t + cfg.fancyH1 : cfg.h1 + t;
  }
  function decorBody(lines, style, cfg) {
    const cf = customFormat(style);
    if (cf) { const s = lines.map(l => l ? cf.linePre + l : (cf.linePre.trim() ? cf.linePre + '\u200B' : '')).join('\n'); return cf.wrap === 'code' ? '```\n' + s + '\n```' : s; }
    if (style === 'codeblock') return '```\n' + lines.join('\n') + '\n```';
    if (style === 'simple') return lines.map(l => l ? cfg.simpleList + l : cfg.simpleList).join('\n');
    if (style === 'fancy') return lines.map(l => l ? cfg.fancyList + l : cfg.fancyList).join('\n');
    if (style === 'none') return lines.join('\n');
    return lines.map(l => l ? cfg.quote + l : cfg.quote + '\u200B').join('\n');   // 空行は見えない文字を入れて引用を途切れさせない
  }
  function formatItemSection(title, val, subs, style, cfg) {
    const t = (title || '').trim(); style = style || 'default';
    const mainLines = (val && val.trim()) ? val.split('\n') : [];
    const subList = (subs || []).filter(s => (s.title && s.title.trim()) || (s.val && s.val.trim()));
    if (!mainLines.length && !subList.length) return '';
    const body = lines => decorBody(lines, style, cfg), head = decorHead(t, style, cfg);
    const parts = [];
    if (mainLines.length) parts.push(body(mainLines));
    subList.forEach(s => { const st = (s.title || '').trim(), line = st ? (s.style === 'bold' ? `**${st}**` : st) : '', sb = (s.val && s.val.trim()) ? body(s.val.split('\n')) : ''; parts.push([line, sb].filter(Boolean).join('\n')); });
    return (head ? head + '\n' : '') + parts.join('\n\n');
  }
  function buildPostData() {
    const noImage = document.getElementById('noImageMode')?.checked;
    const cfg = appState.formatConfig || defaultFormatConfig;

    let chunks = [{ textParts: [], images: [] }];
    let chunkIdx = 0;

    let topTextParts = [];
    const topShopUrl = document.getElementById('topShopUrl').value;
    if (topShopUrl.trim()) {
      topTextParts.push(`:link: ${topShopUrl}`);
    }

    const topTrailer = document.getElementById('topTrailer').value;
    if (topTrailer.trim()) {
      let trailerLines = topTrailer.split('\n');
      let style = document.getElementById('topTrailerDecor') ? document.getElementById('topTrailerDecor').value : 'default';
      let sec = "";
      if (style === 'codeblock') {
        sec = `\`\`\`\n${trailerLines.join('\n')}\n\`\`\``;
      } else if (style === 'simple') {
        sec = trailerLines.map(l => l ? `${cfg.simpleList}${l}` : `${cfg.simpleList}`).join('\n');
      } else if (style === 'fancy') {
        sec = trailerLines.map(l => l ? `${cfg.fancyList}${l}` : `${cfg.fancyList}`).join('\n');
      } else if (style === 'none') {
        sec = trailerLines.join('\n');
      } else {
        sec = trailerLines.map(l => l ? `${cfg.quote}${l}` : `${cfg.quote}\u200B`).join('\n'); // 空行は見えない文字(ゼロ幅スペース)を入れて引用を途切れさせない
      }
      topTextParts.push(sec);
    }
    
    if (topTextParts.length > 0) {
      chunks[0].textParts.push(topTextParts.join('\n\n\n'));
    }

    blockOrder.forEach(b => {
      if (b.type === 'split') {
        chunkIdx++; chunks[chunkIdx] = { textParts: [], images: [] }; return;
      }
      
      let blockTitle = ((b.keyName !== undefined && b.keyName !== null) ? b.keyName : (b.label || '')).trim();
      const hasTitle = blockTitle !== '';   // 空欄なら見出し記号をつけない
      let contentLines = [];

      if (b.type === 'summary_container') {
        b.items.forEach(it => {
          if (it.val && it.val.trim()) {
            let lines = it.val.split('\n');
            contentLines.push((it.keyName || '').trim() ? `${cfg.subPre}${it.keyName}${cfg.subPost}${lines[0]}` : lines[0]);
            for (let i = 1; i < lines.length; i++) {
              contentLines.push(lines[i]);
            }
          }
        });
        if (b.freeText && b.freeText.trim()) {
          if (contentLines.length > 0) contentLines.push("");
          b.freeText.split('\n').forEach(l => contentLines.push(l));
        }
      } else if (b.type === 'image') {
        if (!noImage && (b.file || (b.previewUrl && b.previewUrl.trim()))) {
          chunks[chunkIdx].images.push({ file: b.file, url: b.previewUrl });
        }
        return; 
      } else {
        const sec2 = formatItemSection(blockTitle, b.val, b.subItems, b.decorStyle, cfg); if (sec2) chunks[chunkIdx].textParts.push(sec2); return;
      }

      if (contentLines.length > 0) {
        const style = b.decorStyle || 'default';
        const sec = (hasTitle ? decorHead(blockTitle, style, cfg) + '\n' : '') + decorBody(contentLines, style, cfg);
        chunks[chunkIdx].textParts.push(sec);
      }
    });

    return chunks.map(c => ({ text: c.textParts.join('\n\n\n').trim(), images: c.images }));
  }

  let _rp = null;
  function renderPreview() { scheduleDraftSave(); if (_rp) return; _rp = requestAnimationFrame(() => { _rp = null; renderPreviewNow(); }); }
  function renderPreviewNow() {
    const title = document.getElementById('title').value || "スレッドタイトル";
    const botName = document.getElementById('botName').value || "概要投稿Bot";
    const botAvatarSrc = appState.botAvatarData || "https://cdn.discordapp.com/embed/avatars/0.png";

    document.getElementById('pvThreadTitle').innerText = title; 
    document.getElementById('pvUsername').innerText = botName;
    document.getElementById('pvAvatar').src = botAvatarSrc; 
    document.getElementById('pvUsernameReply').innerText = botName;
    document.getElementById('pvAvatarReply').src = botAvatarSrc;

    const pvTags = document.getElementById('pvTags'); pvTags.innerHTML = "";
    activeTagNames.forEach(tn => { const s = document.createElement('span'); s.className = "discord-tag"; s.innerText = tn; pvTags.appendChild(s); });

    const container = document.getElementById('pvContent'); container.innerHTML = "";
    const postChunks = buildPostData();
    let counterTexts = [];
    let isWarning = false;

    postChunks.forEach((chunk, index) => {
      let len = finalText(chunk).length;
      counterTexts.push(`${index + 1}通目: 約 ${len} 文字`);
      if (len > 1900) isWarning = true;

      if (index > 0) { const d = document.createElement('div'); d.className = "split-divider"; d.innerHTML = `<span>✂️ ここから ${index + 1} 通目のメッセージ</span>`; container.appendChild(d); }
      const p = document.createElement('div'); 
      
      // ▼ FIX: プレビュー上のみ :link: を絵文字として表示する
      p.innerHTML = mdToHtml(chunk.text);
      
      chunk.images.forEach(img => {
        const iEl = document.createElement('img'); iEl.className = "pv-img";
        if (img.url) iEl.src = imgSrc(img.url); else if (img.file) iEl.src = fileUrl(img.file);
        p.appendChild(iEl);
      });
      container.appendChild(p);
    });

    const replyText = document.getElementById('autoReplyText').value; const replySec = document.getElementById('pvReplySection');
    if (replyText.trim()) { replySec.style.display = "block"; document.getElementById('pvReplyContent').innerText = replyText; } else replySec.style.display = "none";
    
    const counter = document.getElementById('charCounter'); 
    counter.innerText = `文字数推定: ${counterTexts.join(' / ')} (※Discord制限目安: 1投稿2000字)`; 
    counter.className = isWarning ? "char-counter warning" : "char-counter";
  }

  function saveFormatConfig() {
    ['h1','subPre','subPost','simpleH1','simpleList','fancyH1','fancyList'].forEach(k => {
      appState.formatConfig[k] = document.getElementById('cfg' + k.charAt(0).toUpperCase() + k.slice(1)).value;
    });
    appState.formatConfig.quote = defaultFormatConfig.quote; // 固定（設定画面からは編集不可）
    saveState();
  }
  function loadFormatConfigToUI() {
    const c = appState.formatConfig || {};
    ['h1','subPre','subPost','simpleH1','simpleList','fancyH1','fancyList'].forEach(k => {
      document.getElementById('cfg' + k.charAt(0).toUpperCase() + k.slice(1)).value = c[k] !== undefined ? c[k] : defaultFormatConfig[k];
    });
    appState.formatConfig.quote = defaultFormatConfig.quote; // 固定
    if (typeof renderFormatList === 'function') renderFormatList();   // 自分のフォーマットの一覧
  }
  function loadSettingsToUI() { document.getElementById('botName').value = appState.botName || "概要投稿Bot"; renderChannelConfigList(); }

  const chAccOpen = new Set();   // 開いているチャンネルのアコーディオン（IDで記憶。描き直しても開いたまま）
  document.addEventListener('toggle', e => { const d = e.target; if (d && d.classList && d.classList.contains('ch-acc')) { if (d.open) chAccOpen.add(d.dataset.chid); else chAccOpen.delete(d.dataset.chid); } }, true);
  function openChannelAcc(id) { chAccOpen.add(id); }
  function renderChannelConfigList() {
    const list = document.getElementById('channelConfigList'); list.innerHTML = "";
    appState.channels.forEach((ch, cI) => {
      const div = document.createElement('details'); div.className = "sortable-item ch-acc"; div.dataset.chid = String(ch.id); if (chAccOpen.has(String(ch.id))) div.open = true;
      const nTag = (ch.tags || []).length, hasWh = !!String(ch.webhookUrl || '').trim();
      div.innerHTML = `<summary class="ch-acc-sum"><span class="ch-acc-name">${escapeHTML(ch.name || '（名称未設定）')}</span><span class="ch-acc-meta"><span class="ch-acc-wh ${hasWh ? 'ok' : 'ng'}">${hasWh ? 'Webhook設定済み' : 'Webhook未設定'}</span><span class="ch-acc-tags">タグ ${nTag} 個</span></span></summary>
        <div class="block-body" style="border:none;">
          <div class="grid-2" style="margin-bottom:8px;"><input type="text" value="${escapeHTML(ch.name)}" placeholder="チャンネル表示名" data-on-input="ch-rename" data-ci="${cI}"><input type="text" class="wh-mask" autocomplete="off" spellcheck="false" value="${escapeHTML(ch.webhookUrl)}" placeholder="Webhook URL（入力中のみ表示）" data-on-input="ch-webhook" data-ci="${cI}"></div>
          <div style="font-size:0.8rem; font-weight:bold; margin-bottom:4px; color:var(--dc-text-muted);">フォーラムタグ設定 (タグ名 / タグID)</div>
          <div>${(ch.tags || []).map((t, tI) => `<div style="display:flex; gap:8px; margin-bottom:4px;"><input type="text" value="${escapeHTML(t.name)}" placeholder="タグ名" style="width:40%; padding:6px;" data-on-input="tag-name" data-ci="${cI}" data-ti="${tI}"><input type="text" value="${escapeHTML(t.id)}" placeholder="例：123456789012345678" style="flex:1; padding:6px;" data-on-input="tag-id" data-ci="${cI}" data-ti="${tI}"><button type="button" class="btn-sort btn-danger" data-on-click="tag-del" data-ci="${cI}" data-ti="${tI}">✕</button></div>`).join('')}</div>
          <div style="display:flex; justify-content:space-between; margin-top:10px;"><span style="display:flex; gap:8px; flex-wrap:wrap;"><button type="button" class="btn btn-secondary" data-on-click="tag-add" data-ci="${cI}">＋ タグ追加</button><button type="button" class="btn btn-secondary" data-on-click="ch-test" data-ci="${cI}">🔌 接続テスト</button></span><button type="button" class="btn btn-secondary btn-danger" data-on-click="ch-del" data-ci="${cI}">🗑️ このチャンネルを削除</button></div>
        </div>`;
      list.appendChild(div);
    });
  }

