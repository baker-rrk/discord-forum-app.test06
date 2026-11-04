/* app_test59_11_custom_formats.js — 自分で追加・設定できるフォーマット
 * 設定画面で、名前・見出しの前後・本文の各行の先頭・コードブロックで囲むか、を自由に決められる。作ったフォーマットは appState.formats に保存され、
 * 公開情報・HOの両方のブロックの「装飾」プルダウンに「🎨 名前」として出る（出力は decorHead / decorBody が組み立てる）。 */
const newFormatId = () => 'fmt_' + Math.random().toString(36).slice(2, 8);
const fmtSampleText = f => formatItemSection('項目名', 'サンプル本文1行目\nサンプル本文2行目', [], f.id, appState.formatConfig || defaultFormatConfig);
function renderFormatList() {
  const box = document.getElementById('customFormatList'); if (!box) return; const list = appState.formats || [];
  box.innerHTML = list.length ? list.map(f => `<div class="fmt-row" data-fid="${f.id}"><div class="fmt-row-head"><input type="text" data-fmt-in="name" value="${escapeHTML(f.name)}" placeholder="フォーマット名（例: キャラ紹介）"><span><button type="button" class="btn-sort" data-fmt-act="dup">複製</button><button type="button" class="btn-sort btn-danger" data-fmt-act="del">✕ 削除</button></span></div><div class="fmt-grid"><div><label>見出しの前</label><input type="text" data-fmt-in="headPre" value="${escapeHTML(f.headPre)}"></div><div><label>見出しの後</label><input type="text" data-fmt-in="headPost" value="${escapeHTML(f.headPost)}"></div><div><label>本文の行頭</label><input type="text" data-fmt-in="linePre" value="${escapeHTML(f.linePre)}"></div><label class="fmt-check"><input type="checkbox" data-fmt-in="wrap" ${f.wrap === 'code' ? 'checked' : ''}> コードブロックで囲む</label></div><pre class="fmt-sample">${escapeHTML(fmtSampleText(f))}</pre></div>`).join('')
    : '<div class="fmt-empty">まだありません。「＋ フォーマットを追加」から作れます（例：見出しの前「### 」、本文の行頭「- 」）。</div>';
}
(function () {
  const fl = () => (appState.formats = Array.isArray(appState.formats) ? appState.formats : []), byId = id => fl().find(f => f.id === id);
  let t = null;
  const changed = () => { saveState(true); renderPreview(); clearTimeout(t); t = setTimeout(() => { renderBlockUI(); renderHoAll(); renderPreview(); }, 300); };   // 装飾プルダウンの名前も更新
  document.addEventListener('click', async e => {
    const el = e.target.closest && e.target.closest('[data-fmt-act]'); if (!el) return; const act = el.dataset.fmtAct, row = el.closest('[data-fid]'), f = row && byId(row.dataset.fid);
    if (act === 'add') fl().push({ id: newFormatId(), name: '新しいフォーマット', headPre: '## ', headPost: '', linePre: '> ', wrap: 'none' });
    else if (act === 'dup' && f) fl().push({ ...f, id: newFormatId(), name: f.name + ' のコピー' });
    else if (act === 'del' && f) { if (!(await appConfirm('フォーマット「' + (f.name || '無題') + '」を削除しますか？\nこのフォーマットを使っているブロックは「通常」の表示になります。', { okText: '削除', danger: true }))) return; appState.formats = fl().filter(x => x !== f); }
    else return;
    renderFormatList(); changed();
  });
  document.addEventListener('input', e => {
    const el = e.target.closest && e.target.closest('[data-fmt-in]'); if (!el) return; const row = el.closest('[data-fid]'), f = row && byId(row.dataset.fid); if (!f) return;
    const k = el.dataset.fmtIn; if (k === 'wrap') f.wrap = el.checked ? 'code' : 'none'; else f[k] = el.value;
    const pre = row.querySelector('.fmt-sample'); if (pre) pre.textContent = fmtSampleText(f); changed();
  });
})();
