/* app_test59_05_channels_save_sync.js — チャンネル設定・Webhookテスト・保存・クラウド連携の受け口・シナリオ操作
 * 読み込み順は 01→07（HTMLの<script>の並び）。全ファイルが同じグローバルスコープを共有します。
 * 各ファイルは、前のファイルで定義された関数・変数を使えます。 */
  function addChannelConfig() { const nc = { id: uid(), name: "新しいチャンネル", webhookUrl: "", tags: [] }; appState.channels.push(nc); openChannelAcc(String(nc.id)); renderChannelConfigList(); saveState(); }
  async function deleteChannelConfig(idx) { if (await appConfirm('このチャンネル設定を削除しますか？', { okText: '削除', danger: true })) { { const _d = appState.channels[idx]; if (_d) (appState.deletedChannels = appState.deletedChannels || {})[_d.id] = nowTs(); }
    appState.channels.splice(idx, 1);  saveState(); renderChannelConfigList(); renderChannelCheckboxes(); updateTagCheckboxes(); } }
  function addTagConfig(cI) { if (!appState.channels[cI].tags) appState.channels[cI].tags = []; appState.channels[cI].tags.push({ name: "", id: "" }); renderChannelConfigList(); saveState(); }
  function deleteTagConfig(cI, tI) { appState.channels[cI].tags.splice(tI, 1); renderChannelConfigList(); saveState(); }

  const WH_RE = /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+\/?(?:\?.*)?$/i;
  function channelIssues(ch, only) {
    const out = [], url = String(ch.webhookUrl || '').trim();
    if (!url) out.push('Webhook URLが未設定です'); else if (!WH_RE.test(url)) out.push('Webhook URLの形式が正しくありません');
    (ch.tags || []).filter(t => !only || only.has(t.name)).forEach(t => { if (t.id && !/^\d{15,25}$/.test(String(t.id).trim())) out.push(`タグ「${t.name}」のIDは数字のみで入力してください`); });
    return out;
  }
  async function testWebhook(i) {
    const ch = appState.channels[i], iss = channelIssues(ch, new Set());
    if (iss.length) return toast('⚠️ ' + iss.join('\n'));
    try {
      const r = await fetchRetry(ch.webhookUrl.trim(), { method: 'GET' }, 1, 10000);
      if (!r.ok) return toast(`❌ 接続に失敗しました（HTTP ${r.status}）。URLが削除・変更されていないか確認してください`);
      const j = await r.json().catch(() => ({})); if (j.guild_id && ch.guildId !== j.guild_id) { ch.guildId = j.guild_id; saveState(); }   // 履歴からスレッドを開くために保存
      toast(`✅ 接続OK（Webhook名: ${j.name || '不明'}）`);
    } catch (e) { toast('❌ 接続できませんでした。通信状況を確認してください'); }
  }
  function saveSettings() {
    appState.botName = document.getElementById('botName').value; appState.channels.forEach(ch => { ch.webhookUrl = String(ch.webhookUrl || '').trim(); });
    appState.scenarios.forEach(normalizePosted); saveState(); renderChannelCheckboxes(); renderPreview(); renderDBView();
    const names = appState.channels.map(c => c.name), dup = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))], msgs = [];
    if (dup.length) msgs.push(`同名のチャンネルがあります（${dup.join('、')}）。見分けにくいため名前を分けることをおすすめします`);
    appState.channels.forEach(ch => channelIssues(ch).forEach(m => msgs.push(`【${ch.name}】${m}`)));
    if (msgs.length) toast('⚠️ 設定は保存しましたが、確認が必要です\n' + msgs.join('\n')); else toast("✅ 設定を保存しました。");
  }
  // ---- 端末内の保存先：IndexedDB（localStorageの約5MB制限を超えて画像を保存できる） ----
  let _idbP = null;
  function idbOpen() {
    return _idbP || (_idbP = new Promise((resolve, reject) => {
      const req = indexedDB.open('discord_forum_tool', 3);
      req.onupgradeneeded = () => { const d = req.result; ['kv', 'images', 'thumbs', 'assets'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); };
      req.onsuccess = () => { const d = req.result; d.onversionchange = () => { d.close(); _idbP = null; }; resolve(d); };   // 別タブが新しい版へ更新するときは、こちらの接続を閉じて邪魔しない
      req.onblocked = () => { if (typeof toast === 'function') toast('⚠️ 古い画面が開いたままです。他のタブを閉じてから、このページを再読み込みしてください。'); };
      req.onerror = () => { _idbP = null; reject(req.error); };
    }));
  }
  function idbGet(store, key) { return idbOpen().then(db => new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); }
  function idbPut(store, key, val) { return idbOpen().then(db => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error); })); }
  window.idbGetRaw = async function (key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  };
  window.idbSetRaw = async function (key, value) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  let localSaveWarned = false;
  let saveStateTimer = null;
  let scJsonCache = null;   // シナリオ部分のシリアライズ結果。設定だけの変更(saveState(true))では再計算しない（通常のsaveState()は必ず破棄）
  function saveState(settingsOnly) { if (!settingsOnly) scJsonCache = null; clearTimeout(saveStateTimer); saveStateTimer = setTimeout(() => { saveStateTimer = null; saveStateNow(); }, 300); }
  window.addEventListener('pagehide', () => { if (saveStateTimer) { clearTimeout(saveStateTimer); saveStateTimer = null; saveStateNow(); } });
  function saveStateNow() {
    if (appState.history && appState.history.length > 500) appState.history = appState.history.slice(-500);
    (() => { const rest = serializeState({ ...appState, scenarios: [] }); if (scJsonCache === null) { stampScenarios(); scJsonCache = serializeState(appState.scenarios); } const json = rest.replace('"scenarios":[]', () => '"scenarios":' + scJsonCache); return persistChain.then(() => window.idbSetRaw('state', json)); })()
      .then(() => { try { localStorage.removeItem('discord_forum_tool_data_v1'); } catch (e) { logSoft('saveStateNow', e); } }) // 旧保存先を整理
      .catch((e) => {
        console.error(e);
        if (!localSaveWarned) { localSaveWarned = true; toast("⚠️ この端末への保存に失敗しました。ブラウザの空き容量を確認し、「エクスポート」でバックアップを取ってください。"); }
      });
    try { localStorage.setItem('discord_forum_tool_dirty', '1'); } catch (e) { logSoft('saveStateNow', e); } // クラウド未反映の目印
    if (window.cloudScheduleSave) window.cloudScheduleSave();
  }
  window.getAppStateForSync = () => JSON.parse(serializeState(appState));
  // シナリオの内容が変わったときだけ updatedAt を更新する（別端末との統合で「新しい方」を決めるため）
  let clockOffset = Number(localStorage.getItem('cloud_clock_offset') || 0) || 0;   // サーバー時刻との差(ms)。端末の時計がずれていても「新しい方」を取り違えない
  const nowTs = () => Date.now() + clockOffset;
  window.setClockOffset = ms => { clockOffset = ms; try { localStorage.setItem('cloud_clock_offset', String(ms)); } catch (e) { logSoft('saveStateNow', e); } };
  const scSigs = new Map();
  const sigOf = sc => JSON.stringify(sc, (k, v) => k === 'updatedAt' ? undefined : (typeof v === 'string' ? (v.startsWith('blob:') ? '@img:' + (imgUrlToHash.get(v) || v) : v.startsWith('data:image/') ? 'data:' + v.length + v.slice(-24) : v) : v));
  function primeScenarioSigs() { scSigs.clear(); appState.scenarios.forEach(sc => { if (sc && sc.id) scSigs.set(sc.id, sigOf(sc)); }); }
  function stampScenarios() { appState.scenarios.forEach(sc => { if (!sc || !sc.id) return; const g = sigOf(sc); if (scSigs.get(sc.id) !== g) { scSigs.set(sc.id, g); sc.updatedAt = nowTs(); } }); }
  window.applyMergedState = async (m) => {   // クラウドとの統合結果を、画面を再読み込みせずに反映する
    // クラウドから来たデータは、画面のHTMLに入る前に、必ず形を整える（細工された値による属性注入などを防ぐ）
    m = sanitizeImported({ ...m, scenarios: Array.isArray(m.scenarios) ? m.scenarios : [], channels: Array.isArray(m.channels) ? m.channels : [], history: Array.isArray(m.history) ? m.history : [], formats: m.formats !== undefined ? m.formats : appState.formats, imageCategories: m.imageCategories !== undefined ? m.imageCategories : appState.imageCategories, imageAssets: m.imageAssets !== undefined ? m.imageAssets : appState.imageAssets, ccfolia: m.ccfolia !== undefined ? m.ccfolia : appState.ccfolia }) || m;
    appState.scenarios = m.scenarios; appState.channels = m.channels; appState.history = m.history; appState.deletedScenarios = m.deletedScenarios; appState.deletedChannels = m.deletedChannels || appState.deletedChannels; appState.historyClearedAt = m.historyClearedAt || appState.historyClearedAt; appState.formats = m.formats || appState.formats; appState.imageCategories = m.imageCategories || appState.imageCategories; appState.imageAssets = m.imageAssets || appState.imageAssets; appState.ccfolia = m.ccfolia || appState.ccfolia; if (typeof renderFormatList === 'function') renderFormatList();
    ensureChannelIds(); appState.scenarios.forEach(x => { if (!x.id) x.id = uid(); }); appState.scenarios.forEach(normalizePosted);
    await hydrateRefs(appState); primeScenarioSigs();
    saveState(); populateScenarioDBSelect(); renderDBView(); renderHistoryTable(); renderChannelConfigList(); renderChannelCheckboxes(); updateTagCheckboxes();
  };
  async function exportData() {
    const o = JSON.parse(serializeState(appState)); await persistChain;
    let json = JSON.stringify(o); const map = new Map();
    for (const m of json.matchAll(/@img:([a-z0-9]+)/g)) if (!map.has(m[1])) map.set(m[1], await window.idbImageDataUrl(m[1]));
    json = json.replace(/@img:([a-z0-9]+)/g, (m, h) => map.get(h) || m);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = "discord_forum_tool_backup.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function exportPreV3Backup() {   // v3移行の直前に退避した元データを、通常のバックアップ(JSON)として書き出す
    let raw = await window.idbGetRaw('state_backup_pre_v3') || await window.idbGetRaw('state_backup_corrupt');
    if (!raw) return toast('移行前のバックアップはありません（この端末では移行が行われていません）');
    let json = typeof raw === 'string' ? raw : JSON.stringify(raw); const map = new Map();
    for (const m of json.matchAll(/@img:([a-z0-9]+)/g)) if (!map.has(m[1])) map.set(m[1], await window.idbImageDataUrl(m[1]));
    json = json.replace(/@img:([a-z0-9]+)/g, (m, h) => map.get(h) || m);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'discord_forum_tool_backup_pre_v3.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => { (async () => {
      let parsed; try { parsed = sanitizeImported(JSON.parse(evt.target.result)); } catch (err) { e.target.value = ''; return toast('❌ エラー: 読み込めませんでした'); }
      e.target.value = ''; if (!parsed) return toast('❌ ファイルの形式が異なります。');
      const base = window.getAppStateForSync(), { merged, summary: S } = mergeBackupInto(base, parsed);
      const choice = await appChoice('「' + file.name + '」の読み込み方を選んでください。\n\n【統合（追加・更新）】今のデータはそのままに、ファイルの内容を追加・更新します。\n' + mergeSummaryText(S).replace(/^/gm, '　') + '\n※設定（Bot名・アイコン・記号など）は今のままです。\n\n【置き換える】今のデータをファイルの内容で置き換えます。\n（どちらも、今のデータはバックアップとして残ります）',
        [{ label: '統合（追加・更新）', value: 'merge', kind: 'primary' }, { label: '置き換える', value: 'replace', kind: 'danger' }, { label: 'キャンセル', value: null }], { title: 'JSONの読み込み' });
      if (!choice) return;
      const old = await window.idbGetRaw('state'); if (old) await window.idbSetRaw('state_backup', old);
      if (choice === 'merge') {
        await window.applyMergedState({ scenarios: merged.scenarios, channels: merged.channels, history: merged.history, deletedScenarios: merged.deletedScenarios, deletedChannels: merged.deletedChannels, historyClearedAt: base.historyClearedAt, formats: merged.formats });
        return toast('✅ 統合しました（シナリオ 追加' + S.scenAdded + '・更新' + S.scenUpdated + '／チャンネル 追加' + S.chAdded + '・更新' + S.chUpdated + '）');
      }
      await window.idbSetRaw('state', JSON.stringify(parsed)); try { localStorage.setItem('discord_forum_tool_dirty', '1'); } catch (x) { logSoft('importData', x); }
      toast('✅ 設定データを復元しました。'); setTimeout(() => location.reload(), 1200);
    })(); };
    reader.readAsText(file);
  }

  function renderDBView() {
    const filter = document.getElementById('dbFilterStatus').value; const sortOrder = document.getElementById('dbSortOrder').value;
    renderDBChannelFilter();
    const terms = parseQuery(document.getElementById('dbSearchInput').value), chf = (document.getElementById('dbFilterChannel') || {}).value || '';
    let filtered = appState.scenarios.map((sc, index) => ({ ...sc, index })).filter(sc => {
      const isP = sc.postedChannels && sc.postedChannels.length > 0;
      if (filter === 'unposted' && isP) return false; if (filter === 'posted' && !isP) return false; if (filter === 'fav' && !sc.favorite) return false;
      if (chf && !(sc.postedChannels || []).includes(chf.slice(2))) return false;
      if (typeof dbTagSel !== 'undefined' && dbTagSel.size && !(sc.tags || []).some(t => dbTagSel.has(t))) return false;   // サイドバーの絞り込みタグ
      return matchQuery(sc, terms);
    });
    { const rc = document.getElementById('dbResultCount'); if (rc) rc.textContent = (terms.length || chf || filter !== 'all' || (typeof dbTagSel !== 'undefined' && dbTagSel.size)) ? `${filtered.length} / ${appState.scenarios.length} 件` : ''; }

    if (sortOrder === 'unposted_first') filtered.sort((a, b) => { const aP = a.postedChannels && a.postedChannels.length > 0, bP = b.postedChannels && b.postedChannels.length > 0; if (aP === bP) return b.index - a.index; return aP ? 1 : -1; });
    else if (sortOrder === 'title') filtered.sort((a, b) => (a.title || "").localeCompare(b.title || "", 'ja')); else filtered.sort((a, b) => b.index - a.index);

    if ((document.getElementById('dbFavFirst') || { checked: true }).checked) filtered.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));   // お気に入りを先頭へ（各グループ内は選んだ並び順のまま）
    const _sig = [filter, sortOrder, chf, terms.join(' ')].join('|'); if (_sig !== dbSig) { dbSig = _sig; dbLimit = 60; }
    const shown = filtered.slice(0, dbLimit);
    { const mw = document.getElementById('dbMoreWrap'); if (mw) { mw.innerHTML = ''; if (filtered.length > shown.length) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-secondary'; b.textContent = `さらに表示（${shown.length} / ${filtered.length}件）`; b.onclick = () => { dbLimit += 60; renderDBView(); }; mw.appendChild(b); } } }
    const total = appState.scenarios.length; const posted = appState.scenarios.filter(s => s.postedChannels && s.postedChannels.length > 0).length;
    document.getElementById('totalScenarioCount').innerText = total; document.getElementById('postedScenarioCount').innerText = posted; document.getElementById('unpostedScenarioCount').innerText = total - posted;

    if (dbViewMode === 'card') {
      document.getElementById('dbTableContainer').style.display = 'none'; const container = document.getElementById('dbCardContainer'); container.style.display = 'grid'; container.innerHTML = "";
      shown.forEach(sc => {
        const isP = sc.postedChannels && sc.postedChannels.length > 0;
        const card = document.createElement('div'); card.className = "scenario-db-card";
        card.innerHTML = `<div class="scenario-card-thumb-wrap">${sc.imageUrl ? `<img ${imgAttr(sc.imageUrl)} class="scenario-card-thumb" loading="lazy">` : `<div class="scenario-card-thumb-placeholder">📁</div>`}</div>
          <div class="scenario-card-body"><div>
            <div class="scenario-card-tags">${sc.system ? `<span class="scenario-badge system">${escapeHTML(sc.system)}</span>` : ''}${sc.playerCount ? `<span class="scenario-badge">${escapeHTML(sc.playerCount)}</span>` : ''}${sc.playTime ? `<span class="scenario-badge time">🕒 ${escapeHTML(sc.playTime)}</span>` : ''}</div>
            <div class="scenario-card-title"><span class="fav-star${sc.favorite ? ' on' : ''}" data-act="fav" data-id="${escapeHTML(sc.id)}" role="button" tabindex="0" aria-pressed="${!!sc.favorite}" title="${sc.favorite ? 'お気に入りを解除' : 'お気に入りに追加'}">${sc.favorite ? '★' : '☆'}</span>${escapeHTML(sc.title)}</div>${safeUrl(sc.shopUrl) ? `<a href="${escapeHTML(safeUrl(sc.shopUrl))}" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem; color:var(--dc-link);">🔗 ショップを開く</a>` : ''}
          </div>
          <div class="scenario-card-footer">${isP ? `<span class="badge badge-posted badge-click" data-act="status" data-id="${escapeHTML(sc.id)}" title="クリックで投稿状態を変更">✓ 投稿済 (${sc.postedChannels.length}) ✎</span>` : `<span class="badge badge-unposted badge-click" data-act="status" data-id="${escapeHTML(sc.id)}" title="クリックで投稿状態を変更">未投稿 ✎</span>`}
            <div style="display:flex; gap:4px;"><button class="btn-sort" data-act="load" data-id="${escapeHTML(sc.id)}" style="padding:4px 8px; font-weight:bold;" title="Discord投稿・編集画面で開く">📝 編集</button><button class="btn-sort" data-act="edit" data-id="${escapeHTML(sc.id)}" style="padding:4px 8px;" title="シナリオの内容を、ウィンドウで編集">✏️ 簡易編集</button><button class="btn-sort" data-act="gallery" data-id="${escapeHTML(sc.id)}" style="padding:4px 8px;" title="このシナリオのギャラリーを拡大表示（画像の整理）">🖼️</button><button class="btn-sort btn-danger" data-act="del" data-id="${escapeHTML(sc.id)}" style="padding:4px 8px;">🗑️</button></div>
          </div></div>`;
        card.dataset.sid = sc.id; container.appendChild(card);
      });
    } else {
      document.getElementById('dbCardContainer').style.display = 'none'; const tbody = document.getElementById('dbTableBody'); document.getElementById('dbTableContainer').style.display = 'block'; tbody.innerHTML = ""; const rows = [];
      shown.forEach(sc => {
        const isP = sc.postedChannels && sc.postedChannels.length > 0;
        const pTags = isP ? sc.postedChannels.map((id, ci) => {
          const inf = (sc.postedInfo || {})[id] || {}, tg = inf.tags || [], nm = postedLabel(sc, id);
          return `<span class="badge" title="${escapeHTML(nm + (tg.length ? ' / タグ: ' + tg.join(', ') : ''))}" style="background:#4e5058; display:inline-flex; align-items:center;">${escapeHTML(nm)}${tg.length ? `<span class="status-tags">#${escapeHTML(tg.join(' #'))}</span>` : ''}<span style="margin-left:6px; cursor:pointer; color:var(--dc-red-fg);" data-act="unpost" data-id="${escapeHTML(sc.id)}" data-ci="${ci}" title="未投稿にする">✕</span></span>`;
        }).join('') : '';
        const sid = escapeHTML(sc.id);
        rows.push(`<tr data-sid="${sid}"><td>${sc.imageUrl ? `<img ${imgAttr(sc.imageUrl)} class="db-thumb" loading="lazy">` : `<div class="db-thumb-placeholder">📁</div>`}</td>
          <td class="db-title"><span class="fav-star${sc.favorite ? ' on' : ''}" data-act="fav" data-id="${escapeHTML(sc.id)}" role="button" tabindex="0" aria-pressed="${!!sc.favorite}" title="${sc.favorite ? 'お気に入りを解除' : 'お気に入りに追加'}">${sc.favorite ? '★' : '☆'}</span>${escapeHTML(sc.title)}${safeUrl(sc.shopUrl) ? `<br><a href="${escapeHTML(safeUrl(sc.shopUrl))}" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem; color:var(--dc-link); font-weight:normal;">🔗 ショップ</a>` : ''}</td>
          <td>${escapeHTML(sc.system || '-')}</td><td>${escapeHTML(sc.playerCount || '-')} / ${escapeHTML(sc.playTime || '-')}</td>
          <td>${isP ? `<span class="badge badge-posted badge-click" data-act="status" data-id="${sid}" title="クリックで投稿状態を変更">✓ 投稿済 ✎</span>` : `<span class="badge badge-unposted badge-click" data-act="status" data-id="${sid}" title="クリックで投稿状態を変更">未投稿 ✎</span>`}</td>
          <td><div class="db-ch-list">${pTags || '-'}</div></td>
          <td><div class="db-actions"><button class="btn-sort" data-act="load" data-id="${sid}" title="Discord投稿・編集画面で開く">📝 編集</button><button class="btn-sort" data-act="edit" data-id="${sid}" title="シナリオの内容を、ウィンドウで編集">✏️ 簡易編集</button><button class="btn-sort" data-act="gallery" data-id="${sid}" title="このシナリオのギャラリーを拡大表示（画像の整理）">🖼️ 画像</button><button class="btn-sort" data-act="status" data-id="${sid}">📌 状態</button><button class="btn-sort btn-danger" data-act="del" data-id="${sid}">🗑️ 削除</button></div></td></tr>`);
      });
      tbody.innerHTML = rows.join('');
    }
  }

  async function deleteScenarioDB(idx) { const _id = (appState.scenarios[idx] || {}).id; if (await appConfirm('このシナリオをデータベースから完全に削除しますか？', { okText: '削除', danger: true })) { const i2 = appState.scenarios.findIndex(s => s.id === _id); if (i2 < 0) return; const _rm = appState.scenarios.splice(i2, 1)[0]; if (_rm && typeof releasePdfAssets === 'function') releasePdfAssets(_rm); (appState.deletedScenarios = appState.deletedScenarios || {})[_id] = nowTs(); saveState(); populateScenarioDBSelect(); renderDBView(); } }

  let histLimit = 100, histSig = '';   // 履歴は100件ずつ表示（「もっと見る」で追加）
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-hmore]')) { histLimit += 100; renderHistoryTable(); } });
  function renderHistoryTable() {
    const el = document.getElementById('historySearchInput'), terms = parseQuery(el ? el.value : '');
    const all = [...appState.history].reverse();
    const list = terms.length ? all.filter(h => { const hay = normSearch([fmtDate(h.date), h.title, h.channels, h.tags, Object.keys(h.threadLinks || {}).join(' ')].join('\n')); return terms.every(t => hay.includes(t)); }) : all;
    { const sig = terms.join(' '); if (sig !== histSig) { histSig = sig; histLimit = 100; } }
    const shownH = list.slice(0, histLimit), moreRow = list.length > shownH.length ? `<tr><td colspan="5" style="text-align:center;"><button type="button" class="btn btn-secondary btn-sm" data-hmore="1">もっと見る（残り ${list.length - shownH.length} 件）</button></td></tr>` : '';
    document.getElementById('historyTableBody').innerHTML = shownH.map(h => `<tr><td>${escapeHTML(fmtDate(h.date))}</td><td>${escapeHTML(h.title)}</td><td>${escapeHTML(h.channels)}</td><td>${escapeHTML(h.tags || '-')}</td><td>${threadLinksHtml(h)}</td></tr>`).join('') + moreRow
      || `<tr><td colspan="5" style="text-align:center; color:var(--dc-text-muted);">${all.length ? '該当する履歴がありません' : '履歴はまだありません'}</td></tr>`;
    const rc = document.getElementById('historyResultCount'); if (rc) rc.textContent = terms.length ? `${list.length} / ${all.length} 件` : `${all.length} 件`;
  }
  async function clearHistory() { if (await appConfirm('投稿履歴をすべて消去しますか？', { okText: '消去', danger: true })) { appState.history = []; appState.historyClearedAt = nowTs(); saveState(); renderHistoryTable(); } }

  let _posting = false;   // 確認ダイアログ中の連打などによる二重投稿を防ぐ
  async function handlePost(e) {
    if (_posting) { if (e && e.preventDefault) e.preventDefault(); return; }
    _posting = true;
    try { await handlePostGuarded(e); } finally { _posting = false; }
  }
  async function handlePostGuarded(e) {
    try { await handlePostInner(e); }
    catch (err) {
      console.error(err);
      const b = document.getElementById('submitBtn'); if (b) { b.disabled = false; b.innerText = "🚀 Discordフォーラムに投稿する"; }
      toast('❌ 投稿中にエラーが発生しました: ' + (err && err.message || err));
    }
  }
