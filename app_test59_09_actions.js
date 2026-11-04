/* app_test59_09_actions.js — 画面の操作（クリック・入力など）の受け口
 * HTMLの data-on-◯◯ 属性に書いた名前をキーに、下の HANDLERS から処理を呼びます（旧インライン onclick の代わり）。
 * ・処理の中の this は、その属性を持つ要素。event.currentTarget も同じ要素になります。
 * ・チャンネル設定の行は data-ci（チャンネル番号）/ data-ti（タグ番号）で対象を渡します。 */
const HANDLERS = {
  /* resetForm() */ "resetForm": function (event) { resetForm()
  },
  /* resetInputs() */ "resetInputs": function (event) { resetInputs()
  },
  /* switchTab('postTab', event) */ "switchTab-postTab-event": function (event) { switchTab('postTab', event)
  },
  /* switchTab('databaseTab', event) */ "switchTab-databaseTab-event": function (event) { switchTab('databaseTab', event)
  },
  /* switchTab('historyTab', event) */ "switchTab-historyTab-event": function (event) { switchTab('historyTab', event)
  },
  /* switchTab('settingsTab', event) */ "switchTab-settingsTab-event": function (event) { switchTab('settingsTab', event)
  },
  /* loadScenarioFromDB(this.value) */ "loadScenarioFromDB-this-value": function (event) { loadScenarioFromDB(this.value)
  },
  /* saveCurrentToDB() */ "saveCurrentToDB": function (event) { saveCurrentToDB()
  },
  /* handlePost(event) */ "handlePost-event": function (event) { handlePost(event)
  },
  /* renderPreview() */ "renderPreview": function (event) { renderPreview()
  },
  /* checkDuplicateStatus(); renderPreview(); */ "checkDuplicateStatus-renderPreview": function (event) { checkDuplicateStatus(); renderPreview();
  },
  /* renderPreview(); */ "renderPreview-2": function (event) { renderPreview();
  },
  /* toggleAllBlocks(false) */ "toggleAllBlocks-false": function (event) { toggleAllBlocks(false)
  },
  /* toggleAllBlocks(true) */ "toggleAllBlocks-true": function (event) { toggleAllBlocks(true)
  },
  /* addSplitBlock() */ "addSplitBlock": function (event) { addSplitBlock()
  },
  /* autoSplitBlocks() */ "autoSplitBlocks": function (event) { autoSplitBlocks()
  },
  /* addImageBlock() */ "addImageBlock": function (event) { addImageBlock()
  },
  /* addCustomBlock() */ "addCustomBlock": function (event) { addCustomBlock()
  },
  /* handleContainerDragOver(event) */ "handleContainerDragOver-event": function (event) { handleContainerDragOver(event)
  },
  /* handleContainerDragLeave(event) */ "handleContainerDragLeave-event": function (event) { handleContainerDragLeave(event)
  },
  /* handleContainerDrop(event) */ "handleContainerDrop-event": function (event) { handleContainerDrop(event)
  },
  /* copyPostContent() */ "copyPostContent": function (event) { copyPostContent()
  },
  /* debouncedDB() */ "debouncedDB": function (event) { debouncedDB()
  },
  /* renderDBView() */ "renderDBView": function (event) { renderDBView()
  },
  /* try{localStorage.setItem('discord_forum_tool_db_favfirst', this.checked ? '1' : '0')}catch(e){logSoft('favfirst',e)} renderDBView() */ "try-localStorage-setItem-discord_forum_t": function (event) { try{localStorage.setItem('discord_forum_tool_db_favfirst', this.checked ? '1' : '0')}catch(e){logSoft('favfirst',e)} renderDBView()
  },
  /* setDBViewMode('card') */ "setDBViewMode-card": function (event) { setDBViewMode('card')
  },
  /* setDBViewMode('table') */ "setDBViewMode-table": function (event) { setDBViewMode('table')
  },
  /* openAddScenarioModal() */ "openAddScenarioModal": function (event) { openAddScenarioModal()
  },
  /* closeEditScenarioModal() */ "closeEditScenarioModal": function (event) { closeEditScenarioModal()
  },
  /* handleEditScenarioSubmit(event) */ "handleEditScenarioSubmit-event": function (event) { handleEditScenarioSubmit(event)
  },
  /* document.getElementById('eFileInput').click() */ "document-getElementById-eFileInput-click": function (event) { document.getElementById('eFileInput').click()
  },
  /* handleDragOver(event) */ "handleDragOver-event": function (event) { handleDragOver(event)
  },
  /* handleDragLeave(event) */ "handleDragLeave-event": function (event) { handleDragLeave(event)
  },
  /* handleEditImageDrop(event) */ "handleEditImageDrop-event": function (event) { handleEditImageDrop(event)
  },
  /* handleEditImageSelect(event) */ "handleEditImageSelect-event": function (event) { handleEditImageSelect(event)
  },
  /* clearEditScenarioImage() */ "clearEditScenarioImage": function (event) { clearEditScenarioImage()
  },
  /* closeAddScenarioModal() */ "closeAddScenarioModal": function (event) { closeAddScenarioModal()
  },
  /* handleManualAddScenario(event) */ "handleManualAddScenario-event": function (event) { handleManualAddScenario(event)
  },
  /* document.getElementById('mFileInput').click() */ "document-getElementById-mFileInput-click": function (event) { document.getElementById('mFileInput').click()
  },
  /* handleManualImageDrop(event) */ "handleManualImageDrop-event": function (event) { handleManualImageDrop(event)
  },
  /* handleManualImageSelect(event) */ "handleManualImageSelect-event": function (event) { handleManualImageSelect(event)
  },
  /* clearHistory() */ "clearHistory": function (event) { clearHistory()
  },
  /* renderHistoryTable() */ "renderHistoryTable": function (event) { renderHistoryTable()
  },
  /* document.getElementById('historySearchInput').value=''; renderHistoryTable(); */ "document-getElementById-historySearchInp": function (event) { document.getElementById('historySearchInput').value=''; renderHistoryTable();
  },
  /* appState.botName=this.value; saveState(true); renderPreview() */ "appState-botName-this-value-saveState-tr": function (event) { appState.botName=this.value; saveState(true); renderPreview()
  },
  /* document.getElementById('botAvatarInput').click() */ "document-getElementById-botAvatarInput-click": function (event) { document.getElementById('botAvatarInput').click()
  },
  /* handleBotAvatarDrop(event) */ "handleBotAvatarDrop-event": function (event) { handleBotAvatarDrop(event)
  },
  /* handleBotAvatarSelect(event) */ "handleBotAvatarSelect-event": function (event) { handleBotAvatarSelect(event)
  },
  /* clearBotAvatar() */ "clearBotAvatar": function (event) { clearBotAvatar()
  },
  /* saveFormatConfig(); renderPreview(); */ "saveFormatConfig-renderPreview": function (event) { saveFormatConfig(); renderPreview();
  },
  /* addChannelConfig() */ "addChannelConfig": function (event) { addChannelConfig()
  },
  /* saveSettings() */ "saveSettings": function (event) { saveSettings()
  },
  /* saveMaxAttach(this.value) */ "saveMaxAttach-this-value": function (event) { saveMaxAttach(this.value)
  },
  /* exportData() */ "exportData": function (event) { exportData()
  },
  /* document.getElementById('importFile').click() */ "document-getElementById-importFile-click": function (event) { document.getElementById('importFile').click()
  },
  /* importData(event) */ "importData-event": function (event) { importData(event)
  },
  /* exportPreV3Backup() */ "exportPreV3Backup": function (event) { exportPreV3Backup()
  }
};
Object.assign(HANDLERS, {
  'ch-rename': function () { const c = appState.channels[Number(this.dataset.ci)]; if (!c) return; renameChannel(Number(this.dataset.ci), this.value); const nm = this.closest('details') && this.closest('details').querySelector('.ch-acc-name'); if (nm) nm.textContent = this.value || '（名称未設定）'; saveState(true); },
  'ch-webhook': function () { const c = appState.channels[Number(this.dataset.ci)]; if (!c) return; c.webhookUrl = this.value.trim(); const w = this.closest('details') && this.closest('details').querySelector('.ch-acc-wh'); if (w) { w.className = 'ch-acc-wh ' + (c.webhookUrl ? 'ok' : 'ng'); w.textContent = c.webhookUrl ? 'Webhook設定済み' : 'Webhook未設定'; } saveState(true); },
  'tag-name': function () { const c = appState.channels[Number(this.dataset.ci)], t = c && c.tags[Number(this.dataset.ti)]; if (!t) return; t.name = this.value; saveState(true); },
  'tag-id': function () { const c = appState.channels[Number(this.dataset.ci)], t = c && c.tags[Number(this.dataset.ti)]; if (!t) return; t.id = this.value.trim(); saveState(true); },
  'tag-del': function () { deleteTagConfig(Number(this.dataset.ci), Number(this.dataset.ti)); },
  'tag-add': function () { addTagConfig(Number(this.dataset.ci)); },
  'open-settings': function () { openSettingsModal(); },
  'switchTab-ccfoliaTab-event': function (event) { switchTab('ccfoliaTab', event); },
  'close-settings': function () { closeSettingsModal(); },
  'ch-test': function () { testWebhook(Number(this.dataset.ci)); },
  'preview-zoom': function () { togglePreviewZoom(); },
  'open-history-modal': function () { openHistoryModal(); },
  'pick-bot-avatar': function () { pickBotAvatarFromGallery(); },
  'ch-del': function () { deleteChannelConfig(Number(this.dataset.ci)); }
});
(function () {
  const wrap = (e, el) => new Proxy(e, { get: (t, k) => k === 'currentTarget' ? el : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
  ['click', 'input', 'change', 'submit', 'dragover', 'dragleave', 'drop'].forEach(type => {
    const attr = 'data-on-' + type, sel = '[' + attr + ']';
    document.addEventListener(type, e => {   // 子→親の順に、該当する要素すべての処理を呼ぶ（stopPropagation されたらそこで止める）
      for (let el = e.target.closest && e.target.closest(sel); el; el = el.parentElement && el.parentElement.closest(sel)) {
        const key = el.getAttribute(attr), fn = HANDLERS[key];
        if (fn) fn.call(el, wrap(e, el)); else console.warn('未登録の操作:', key);
        if (e.cancelBubble) break;
      }
    });
  });
})();
