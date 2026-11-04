/* app_test59_06_post.js — Discordへの投稿処理
 * 読み込み順は 01→07（HTMLの<script>の並び）。全ファイルが同じグローバルスコープを共有します。
 * 各ファイルは、前のファイルで定義された関数・変数を使えます。 */
  // 投稿処理は、段階ごとの小さな関数に分けてある（validateBeforePost → resolvePostTarget → syncWebhookAvatars → sendToSelectedChannels → showPostResult）
  async function validateBeforePost(title) {   // 入力内容の検証。問題があればお知らせして false（中止）
    if (!title) return toast("タイトルを入力してください");
    if (title.length > 100) return toast("スレッドタイトルは100文字以内にしてください（現在 " + title.length + " 文字）");
    { const pc = buildPostData(); const over = pc.findIndex(c => finalText(c).length > 2000);
      if (over !== -1) return toast((over + 1) + "通目が2000文字を超えています。「✂️ 投稿分割」で分けてください。");
      if (pc.some(c => c.images.length > 10)) return toast("1通あたりの添付は10枚までです。「✂️ 投稿分割」で分けてください。");
      if (pc.some(c => c.images.some(i => !i.file && String(i.url).startsWith("@img:")))) { pc.forEach(c => requestRefsIn(c.images)); return toast("画像をクラウドから取得中です。少し待ってからもう一度お試しください。"); } }
    if (selectedChannelCols.size === 0) return toast("送信先チャンネルを1つ以上選択してください");
    { const pc = buildPostData();
      const empty = pc.findIndex(c => !finalText(c).trim() && c.images.length === 0);
      if (empty !== -1) return toast("⚠️ " + (empty + 1) + "通目の内容が空です。「✂️ 投稿分割」の位置か入力内容を確認してください。");
      const est = i => i.file ? (i.file.size <= maxAttachBytes() ? i.file.size : String(i.url).length * 0.75) : (String(i.url).startsWith('data:') ? String(i.url).length * 0.75 : 0);
      const bigIdx = pc.map(c => c.images.reduce((sum, i) => sum + est(i), 0)).findIndex(n => n > maxAttachBytes());
      if (bigIdx !== -1 && !(await appConfirm(`${bigIdx + 1}通目の添付が合計 約${Math.round(pc[bigIdx].images.reduce((sum, i) => sum + est(i), 0) / 1048576)}MB あります。\nDiscordの上限（サーバーにより約10MB）を超えると送信に失敗することがあります。\n続けますか？`, { okText: '投稿する' }))) return;
      const issues = [];
      for (const ch of selectedChannels()) { channelIssues(ch, activeTagNames).forEach(m => issues.push(`【${ch.name}】${m}`)); }
      if (issues.length) return toast('⚠️ 設定を確認してください\n' + issues.join('\n'));
      const missing = [];
      for (const ch of selectedChannels()) {
        activeTagNames.forEach(tn => { const t = (ch.tags || []).find(x => x.name === tn); if (!t || !String(t.id || '').trim()) missing.push(`${ch.name}: ${tn}`); });
        if ((ch.tags || []).filter(t => activeTagNames.has(t.name) && t.id).length > 5) return toast(`⚠️ 【${ch.name}】Discordのフォーラムタグは1スレッド5個までです`);
      }
      if (missing.length && !(await appConfirm(`次のタグはIDが未設定（またはそのチャンネルに存在しない）ため付与されません:\n${missing.join('\n')}\n\nこのまま投稿しますか？`, { okText: '投稿する' }))) return;
    }

    return true;
  }
  async function resolvePostTarget(title) {   // 同名シナリオの確認と重複投稿の確認。中止なら null、続行なら保存オプションを返す
    const saveOpts = await resolveSaveOpts(title);   // 同名シナリオの上書き確認は、投稿前に済ませておく
    { const dsc = saveOpts.forceNew ? null : findScenario(title);
      const dupNames = (dsc && dsc.postedChannels) ? selectedChannels().filter(c => dsc.postedChannels.includes(c.id)).map(c => c.name) : [];
      if (dupNames.length && !(await appConfirm(`「${title}」は次のチャンネルに投稿済みです:\n${dupNames.join('、')}\n\nもう一度投稿すると重複スレッドになります。続けますか？`, { okText: '重複して投稿する', danger: true }))) return null; }

    return saveOpts;
  }
  async function syncWebhookAvatars() {   // 選択中の各Webhookのアイコンを、設定どおりに更新（または解除）する
    { const av0 = appState.botAvatarData || ''; if (av0 && !/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(av0)) { toast('⚠️ Botアイコンのデータが不正なため、アイコンの更新は行いません（初期設定で選び直してください）。投稿は続行します。'); return; } }   // Webhookのアイコン更新に使えるのは画像データのみ（不正な値を送ると400エラーになる）
    for (const ch of selectedChannels()) {
      const avKey = 'discord_avatar_patched_' + hashStr(ch.webhookUrl || ''), avSig = hashStr(appState.botAvatarData || '');
      const wasPatched = localStorage.getItem(avKey);
      if (!ch.webhookUrl || (appState.botAvatarData ? wasPatched === avSig : !wasPatched)) continue;   // アイコン解除時は、以前に設定したWebhookのアイコンも外す
      try {
        const r = await fetchRetry(ch.webhookUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar: appState.botAvatarData || null }) });
        if (r.ok) { try { if (appState.botAvatarData) localStorage.setItem(avKey, avSig); else localStorage.removeItem(avKey); } catch (e) { logSoft('syncWebhookAvatars', e); } }
        else toast(`⚠️ 「${ch.name}」のアイコン更新に失敗しました（HTTP ${r.status}）。投稿は続行します。`);
      } catch (err) { console.error("Webhook PATCH failed:", err); }
    }

  }
  async function sendToSelectedChannels(title, botName, snap) {   // 選択中の全チャンネルへ送信し、結果をまとめて返す
    const postChunks = snap ? snap.chunks : buildPostData();   // 確認を済ませた時点の内容で送る（送信中に入力を変えても、検証済みの内容とずれない）
    const autoReply = snap ? snap.autoReply : document.getElementById('autoReplyText').value;
    const verticalImages = snap ? snap.vertical : !!document.getElementById('verticalImageMode')?.checked;
    const okIds = [], okNames = [], failIds = [], failNames = [], partialNames = [], replyFailed = [], uncertain = [], threadMap = {}, threadLinks = {};

    await Promise.all(selectedChannels().map(c => ensureGuildId(c)));
    for (const ch of selectedChannels()) {
      let r;
      try { r = await sendToChannel(ch, title, postChunks, { botName, autoReply, verticalImages, tagNames: snap && snap.tagNames }); }
      catch (err) { console.error(err); r = { threadId: null, failedAt: 1, replyFailed: false, unsure: true }; }   // 想定外の例外でも他のチャンネルの投稿は続ける
      if (r.threadId) {
        okIds.push(ch.id); okNames.push(ch.name); threadMap[ch.name] = r.threadId;
        if (ch.guildId) threadLinks[ch.name] = `https://discord.com/channels/${ch.guildId}/${r.threadId}`;
        if (r.failedAt) partialNames.push(`${ch.name}（${r.failedAt}通目で失敗）`);
        if (r.replyFailed) replyFailed.push(ch.name);
      } else { failIds.push(ch.id); failNames.push(ch.name); if (r.unsure) uncertain.push(ch.name); }
    }

    return { okIds, okNames, failIds, failNames, partialNames, replyFailed, uncertain, threadMap, threadLinks };
  }
  function showPostResult(title, res, saveOpts) {   // 履歴・DBへの保存、失敗チャンネルの再選択、結果のポップアップ
    const { okIds, okNames, failIds, failNames, partialNames, replyFailed, uncertain, threadMap, threadLinks } = res;
    if (okIds.length > 0) {
      const resultText = `✅ ${okIds.length}件のチャンネルに投稿成功` + (failNames.length ? ` ／ ⚠️ 失敗: ${failNames.join(', ')}（失敗したチャンネルだけ選択したままにしています）` : '')
        + (partialNames.length ? `\n⚠️ 途中で失敗（スレッドは作成済み）: ${partialNames.join(', ')}\n残りはDiscord上で手動追記してください。同じ内容を再投稿すると重複スレッドになります。` : '')
        + (uncertain.length ? `\n⚠️ 応答がなかったため、スレッドが作成済みの可能性があります: ${uncertain.join(', ')}\nDiscordを確認してから再投稿してください。` : '')
        + (replyFailed.length ? `\n⚠️ 自動追記返信に失敗: ${replyFailed.join(', ')}` : '');
      appState.history.push({ date: new Date().toISOString(), title, channels: okNames.join(', '), channelIds: okIds, tags: Array.from(activeTagNames).join(', '), threads: threadMap, threadLinks });
      saveState(); renderHistoryTable();   // 履歴を先に確定させてから、DBの更新（上書き確認あり）に進む
      autoSyncToDBOnPost(title, okIds, saveOpts);
      if (failIds.length) {   // 失敗したチャンネルだけ選択を残す（そのまま再投稿できる）
        selectedChannelCols = new Set(failIds);
        renderChannelCheckboxes(); updateTagCheckboxes(); checkDuplicateStatus(); renderPreview();
      }
      { const hasWarn = failNames.length || partialNames.length || uncertain.length || replyFailed.length;   // 結果はポップアップでも知らせる（下のバーが画面外でも気づけるように）
        appAlert(`「${title}」\n${resultText}\n\n投稿先: ${okNames.join('、')}`, { title: hasWarn ? '⚠️ 投稿完了（要確認あり）' : '✅ 投稿が完了しました', okText: '閉じる' }); }
    } else {
      const resultText = `❌ 投稿に失敗しました。Webhook URLなどを確認してください。` + (uncertain.length ? `\n⚠️ 応答がなかったチャンネル（${uncertain.join(', ')}）は、スレッドが作成されていないかDiscordで確認してから再投稿してください。` : '');
      appAlert(resultText, { title: '❌ 投稿に失敗しました', okText: '閉じる' });
    }
  }
  async function handlePostInner(e) {
    e.preventDefault();
    const title = document.getElementById('title').value;
    if (!(await validateBeforePost(title))) return;
    const saveOpts = await resolvePostTarget(title);
    if (saveOpts === null) return;

    const snap = { chunks: buildPostData(), autoReply: document.getElementById('autoReplyText').value, vertical: !!document.getElementById('verticalImageMode')?.checked, tagNames: new Set(activeTagNames) };   // 検証・確認が済んだ内容を固定する
    const btn = document.getElementById('submitBtn');
    const statusMsg = document.getElementById('statusMsg');
    btn.disabled = true;
    btn.innerText = "⏳ 投稿中...";
    statusMsg.style.display = "none";

    const botName = document.getElementById('botName').value || "概要投稿Bot";

    await syncWebhookAvatars();
    const res = await sendToSelectedChannels(title, botName, snap);

    btn.disabled = false;
    btn.innerText = "🚀 Discordフォーラムに投稿する";

    showPostResult(title, res, saveOpts);
  }

  // 1チャンネル分の送信（スレッド作成 → 2通目以降 → 自動返信）。成功/失敗の結果だけを返す
  async function ensureGuildId(ch) {   // 履歴からスレッドを開くためのサーバーIDを、未取得なら投稿前に1回だけ取得する
    if (!ch || ch.guildId || !ch.webhookUrl) return;
    try {
      const r = await fetchRetry(ch.webhookUrl.trim(), { method: 'GET' }, 1, 10000);
      if (r.ok) { const j = await r.json().catch(() => ({})); if (j.guild_id) { ch.guildId = j.guild_id; saveState(); renderHistoryTable(); } }
    } catch (e) { logSoft('ensureGuildId', e); }
  }
  async function sendToChannel(ch, title, chunks, o) {
    const res = { threadId: null, failedAt: 0, replyFailed: false, unsure: false };
    if (!ch.webhookUrl) return res;
    if (chunks.some(c => c.images.some(i => !i.file && String(i.url || '').startsWith('@img:')))) { res.failedAt = 1; return res; }   // クラウドから未取得の画像参照があるときは、何も送らずに中止（「@img:…」という文字を投稿しない）
    const base = ch.webhookUrl, sep = base.includes('?') ? '&' : '?';
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i], isFirst = (i === 0);
      try {
        const formData = new FormData(), payload = { username: o.botName, content: chunk.text };
        if (isFirst) {
          payload.thread_name = title;
          const tagIds = (ch.tags || []).filter(t => (o.tagNames || activeTagNames).has(t.name) && t.id).map(t => t.id);
          if (tagIds.length > 0) payload.applied_tags = tagIds;
        }
        if (o.verticalImages && chunk.images.length > 0) payload.embeds = [];
        for (const [imgIdx, img] of chunk.images.entries()) {
          if (img.file && img.file.size <= maxAttachBytes()) {   // 大きすぎる元画像は、圧縮済みのプレビュー画像で代用
            const ext = (/\.(jpe?g|png|gif|webp|avif|bmp)$/i.exec(img.file.name || '') || [null, 'jpg'])[1].toLowerCase();
            const filename = `image_${imgIdx}.${ext}`;
            formData.append(`files[${imgIdx}]`, img.file, filename);
            if (o.verticalImages) payload.embeds.push({ image: { url: `attachment://${filename}` } });
          } else if (img.url && (img.url.startsWith('data:') || img.url.startsWith('blob:'))) {
            const blob = img.url.startsWith('blob:') ? await (await fetchRetry(img.url, {}, 1, 30000)).blob() : dataURLtoBlob(img.url);
            const filename = `image_${imgIdx}.jpg`;
            formData.append(`files[${imgIdx}]`, blob, filename);
            if (o.verticalImages) payload.embeds.push({ image: { url: `attachment://${filename}` } });
          } else if (img.url) {
            if (o.verticalImages) payload.embeds.push({ image: { url: img.url } }); else payload.content = (payload.content ? payload.content + '\n' : '') + img.url;
          }
        }
        formData.append('payload_json', JSON.stringify(payload));
        const url = base + sep + (isFirst ? 'wait=true' : `thread_id=${res.threadId}&wait=true`);
        const r = await fetchRetry(url, { method: 'POST', body: formData });
        if (!r.ok) throw new Error(`HTTP Error ${r.status}`);
        if (isFirst) {
          const d = await r.json().catch(() => null);
          if (d && d.channel_id) res.threadId = d.channel_id;
          else { res.failedAt = 1; res.unsure = true; break; }   // 送信は通ったがスレッドIDが取れない（作成済みの可能性）
        }
      } catch (err) {
        console.error(err); res.failedAt = i + 1;
        if (isFirst && !String(err && err.message).startsWith('HTTP Error')) res.unsure = true;   // 通信断・タイムアウトは作成済みの可能性がある
        break;   // 失敗したら以降は送らない（順序が崩れる／スレッド外に投稿されるのを防ぐ）
      }
    }
    if (res.threadId && !res.failedAt && o.autoReply.trim()) {
      try {
        const r = await fetchRetry(base + sep + `thread_id=${res.threadId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: o.botName, content: o.autoReply }) });
        if (!r.ok) res.replyFailed = true;
      } catch (e) { res.replyFailed = true; }
    }
    return res;
  }

