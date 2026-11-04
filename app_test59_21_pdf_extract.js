/* app_test59_21_pdf_extract.js — STEP 3：PDFの文字を「座標」で整える純粋な関数群（画面・DOM・pdf.js に依存しない）
 * 入力の文字（item）は { str, x, y, w, h, page }。x,y はPDFの座標（yは上ほど大きい）、w は幅、h は文字の高さ（フォントサイズ）。
 *  ・ルビ除外：選択範囲の本文サイズ（文字数で重みを付けた中央値）の70%未満の小さな文字を除く
 *  ・2段組：X座標の分布に「中央の縦の隙間」があれば、左段（上→下）→右段（上→下）の順に並べる
 *  ・1行目のタイトル化：1行目が短い見出し行（30文字以下／【▼■◆● などで始まる）なら、タイトルと本文に分ける
 *  ・整形ツール：不要な改行・空白の除去／英数字の半角⇄全角／指定語の {} 変数化 */
const PX = (() => {
  const isAsciiWord = c => /[A-Za-z0-9]/.test(c || '');
  const MARK_RE = /^[【▼■◆●□▽◇〔〈《]/;

  function weightedMedian(pairs) {   // pairs: [[値, 重み]]
    const a = pairs.filter(p => p[0] > 0 && p[1] > 0).sort((x, y) => x[0] - y[0]); if (!a.length) return 0;
    const total = a.reduce((s, p) => s + p[1], 0); let acc = 0;
    for (const [v, w] of a) { acc += w; if (acc >= total / 2) return v; }
    return a[a.length - 1][0];
  }

  // 左右2段組か？ → 境界のX座標（なければ null）
  function detectColumnSplit(items, size) {
    if (items.length < 8 || !(size > 0)) return null;
    const x0 = Math.min(...items.map(i => i.x)), x1 = Math.max(...items.map(i => i.x + i.w)), span = x1 - x0;
    if (span < size * 12) return null;   // 幅が狭すぎて2段にはならない
    const iv = items.map(i => [i.x, i.x + i.w]).sort((a, b) => a[0] - b[0]), gaps = []; let end = iv[0][1];
    for (let k = 1; k < iv.length; k++) { if (iv[k][0] > end) gaps.push([end, iv[k][0]]); end = Math.max(end, iv[k][1]); }
    const minGap = Math.max(size * 1.5, span * 0.03), lo = x0 + span * 0.3, hi = x0 + span * 0.7;
    const cand = gaps.filter(g => g[1] - g[0] >= minGap && (g[0] + g[1]) / 2 >= lo && (g[0] + g[1]) / 2 <= hi).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
    if (!cand) return null;
    const mid = (cand[0] + cand[1]) / 2, L = items.filter(i => i.x + i.w / 2 < mid), R = items.filter(i => i.x + i.w / 2 >= mid), need = Math.max(3, items.length * 0.2);
    if (L.length < need || R.length < need) return null;
    const yr = a => [Math.min(...a.map(i => i.y)), Math.max(...a.map(i => i.y + i.h))], [l0, l1] = yr(L), [r0, r1] = yr(R);
    const overlap = Math.min(l1, r1) - Math.max(l0, r0); if (overlap < Math.min(l1 - l0, r1 - r0) * 0.5) return null;   // 上下の範囲が重ならなければ、2段ではない
    if (items.filter(i => i.x < mid && i.x + i.w > mid).length > items.length * 0.2) return null;   // 隙間をまたぐ文字が多いときは、2段ではない
    return mid;
  }

  function itemsToLines(items, size) {   // 1つの段（または全体）の文字 → 行（上→下、行の中は左→右）
    const sorted = items.slice().sort((a, b) => (b.y - a.y) || (a.x - b.x)), lines = [];
    for (const it of sorted) {
      const ln = lines[lines.length - 1];
      if (ln && Math.abs(ln.y - it.y) <= Math.max(size, it.h) * 0.5) ln.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    return lines.map(ln => {
      const its = ln.items.sort((a, b) => a.x - b.x); let s = '';
      its.forEach((it, k) => {
        if (k) { const p = its[k - 1], gap = it.x - (p.x + p.w), a = s.slice(-1), b = it.str.charAt(0); if ((gap > size * 0.25 && isAsciiWord(a) && isAsciiWord(b)) || gap > size * 1.2) s += ' '; }
        s += it.str;
      });
      return s.replace(/[ \t]+$/g, '');
    });
  }

  function cleanTitle(line) {
    let t = String(line).trim().replace(/^[▼■◆●□▽◇\s]+/, '');
    const m = /^【(.+)】$/.exec(t); if (m) t = m[1];
    return t.trim();
  }

  // 戻り値：{ text, title, body, stats: { bodySize, rubyRemoved, columns } }
  function extract(items, { ruby = true, twoColumn = true, autoTitle = true } = {}) {
    let its = (items || []).filter(i => i && typeof i.str === 'string' && i.str.trim() !== '' && isFinite(i.x) && isFinite(i.y));
    const bodySize = weightedMedian(its.map(i => [i.h || 0, i.str.length]));
    let rubyRemoved = 0;
    if (ruby && bodySize > 0) { const keep = its.filter(i => !(i.h > 0 && i.h < bodySize * 0.7)); rubyRemoved = its.length - keep.length; its = keep; }
    const pages = [...new Set(its.map(i => i.page || 0))].sort((a, b) => a - b); let columns = 1; const out = [];
    for (const pg of pages) {
      const pi = its.filter(i => (i.page || 0) === pg), mid = twoColumn ? detectColumnSplit(pi, bodySize) : null;
      if (mid !== null) { columns = 2; out.push(...itemsToLines(pi.filter(i => i.x + i.w / 2 < mid), bodySize), ...itemsToLines(pi.filter(i => i.x + i.w / 2 >= mid), bodySize)); }   // 左段（上→下）→ 右段（上→下）
      else out.push(...itemsToLines(pi, bodySize));
    }
    const lines = out.filter((l, k) => l.trim() !== '' || (k > 0 && k < out.length - 1)), text = lines.join('\n').trim();
    let title = '', body = text;
    if (autoTitle && lines.length >= 2) {
      const first = lines[0].trim();
      if (first && (Array.from(first).length <= 30 || MARK_RE.test(first))) { title = cleanTitle(first); body = lines.slice(1).join('\n').replace(/^\n+/, '').trim(); }
    }
    return { text, title, body, stats: { bodySize, rubyRemoved, columns } };
  }

  // ---------- 整形ツール ----------
  // 不要な改行・空白の一括除去：文の途中で折り返された改行をつなぎ、全角・半角の余分な空白を詰める（段落や見出しの区切りは残す）
  function compact(text) {
    const lines = String(text == null ? '' : text).replace(/\r/g, '').split('\n').map(l => l.replace(/[ \t\u3000]+/g, ' ').trim());
    let out = '';
    lines.forEach((l, k) => {
      if (k === 0) { out = l; return; }
      const prev = lines[k - 1];
      if (!l) { if (prev) out += '\n'; return; }   // 空行は段落の区切りとして1つだけ残す
      if (!prev) { out += '\n' + l; return; }
      const endsSentence = /[。．！？!?」』）)】〉》]$/.test(prev) || (/^[■▼◆●【▽□◇〔〈《]/.test(prev) && prev.length <= 30),   // 文末、または短い見出し行のあとは改行を残す
         startsMark = /^[■▼◆●・【「『▽□◇〔〈《\-*]/.test(l) || /^\d+[.)．）]/.test(l);
      if (endsSentence || startsMark) out += '\n' + l;
      else out += (isAsciiWord(prev.slice(-1)) && isAsciiWord(l.charAt(0)) ? ' ' : '') + l;
    });
    return out.replace(/([\u3000-\u9fff\uff00-\uffef]) +(?=[\u3000-\u9fff\uff00-\uffef])/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
  }
  function zenHan(text, to) {   // 英数字だけを、半角（to='half'）または全角（to='full'）に統一する
    const s = String(text == null ? '' : text);
    return to === 'full' ? s.replace(/[A-Za-z0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0)) : s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  }
  function parseWords(input) { return [...new Set(String(input == null ? '' : input).split(/[\s,、，;；]+/).map(w => w.trim()).filter(Boolean))]; }
  function varize(text, words) {   // 指定した語を、{語} に（すでに {} で囲まれているものは二重にしない）
    let s = String(text == null ? '' : text); const ws = parseWords(Array.isArray(words) ? words.join(' ') : words).sort((a, b) => b.length - a.length);
    if (!ws.length) return s;
    const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), re = new RegExp('(\\{[^{}]*\\})|(' + ws.map(esc).join('|') + ')', 'g');
    return s.replace(re, (m, braced, word) => braced ? braced : '{' + word + '}');
  }
  return { extract, detectColumnSplit, weightedMedian, compact, zenHan, varize, parseWords, cleanTitle };
})();
