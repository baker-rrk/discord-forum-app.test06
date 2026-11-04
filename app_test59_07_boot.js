/* app_test59_07_boot.js — 起動処理
 * 読み込み順は 01→07（HTMLの<script>の並び）。全ファイルが同じグローバルスコープを共有します。
 * 各ファイルは、前のファイルで定義された関数・変数を使えます。 */
  // ===== 投稿作成タブ：検索してシナリオを呼び出す（↑↓で選択・Enterで呼出・Escで閉じる） =====
  (function () {
    const inp = document.getElementById('scenarioQuickSearch'), box = document.getElementById('scenarioQuickResults'); if (!inp || !box) return;
    let items = [], active = -1;
    const close = () => { box.style.display = 'none'; active = -1; inp.setAttribute('aria-expanded', 'false'); };
    const pick = i => { const sc = items[i]; if (!sc) return; close(); inp.value = ''; const sel = document.getElementById('dbScenarioSelect'); if (sel) sel.value = sc.id; activateScenario(sc.id); };   // 未保存の作業内容があれば確認してから呼び出す
    const paint = () => { box.querySelectorAll('.qs-item').forEach((e, i) => { e.classList.toggle('active', i === active); e.setAttribute('aria-selected', String(i === active)); }); const a = box.querySelector('.qs-item.active'); if (a) a.scrollIntoView({ block: 'nearest' }); };
    const render = () => {
      const terms = parseQuery(inp.value), titleHit = sc => terms.every(t => normSearch(sc.title).includes(t)) ? 0 : 1;
      let list = appState.scenarios.filter(sc => matchQuery(sc, terms));
      const favD = (a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
      if (terms.length) list.sort((a, b) => (titleHit(a) - titleHit(b)) || favD(a, b)); else list = list.slice().reverse().sort(favD);
      items = list.slice(0, 30);   // 候補は30件まで表示（一覧はスクロール） active = items.length ? 0 : -1;
      box.innerHTML = (terms.length ? '' : '<div class="qs-head">★お気に入り → 新しい順</div>')
        + (items.map((sc, i) => `<div class="qs-item" role="option" id="qs_${i}" data-i="${i}"><span class="qs-title">${sc.favorite ? '<span style="color:#f0b232;">★</span> ' : ''}${escapeHTML(sc.title)}</span><span class="qs-meta">${escapeHTML([sc.system, sc.playerCount, sc.playTime].filter(Boolean).join(' / '))}</span>${(sc.postedChannels || []).length ? `<span class="badge badge-posted">✓ ${sc.postedChannels.length}</span>` : ''}</div>`).join('') || '<div class="qs-empty">該当するシナリオがありません</div>')
        + (list.length > items.length ? `<div class="qs-head">ほか ${list.length - items.length} 件（キーワードを足して絞り込めます）</div>` : '');
      box.style.display = 'block'; inp.setAttribute('aria-expanded', 'true'); paint();
    };
    inp.addEventListener('input', render); inp.addEventListener('focus', render);
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (box.style.display !== 'block') render(); else if (items.length) { active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); } }
      else if (e.key === 'Enter') { if (box.style.display === 'block' && active >= 0) { e.preventDefault(); pick(active); } }
      else if (e.key === 'Escape') { if (box.style.display === 'block') { e.stopPropagation(); close(); } }
    });
    box.addEventListener('mousedown', e => { const it = e.target.closest('.qs-item'); if (it) { e.preventDefault(); pick(Number(it.dataset.i)); } });
    document.addEventListener('mousedown', e => { if (!box.contains(e.target) && e.target !== inp) close(); });
  })();
  try { const fc = document.getElementById('dbFavFirst'); if (fc) fc.checked = localStorage.getItem('discord_forum_tool_db_favfirst') !== '0'; } catch (e) { logSoft('misc', e); }
