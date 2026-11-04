/* app_test59_19_scenario_guess.js — STEP 2：シナリオ名・スペックの「推測」だけを担う関数群（画面・DOM・pdf.js に依存しない純粋な関数）
 * フォルダ名／ファイル名／PDFの文字から、タイトル・人数・時間・推奨技能・ロスト率・あらすじなどを推測する。
 * 画面側（取り込み・登録）は 20_scenario_import.js。ここだけを単体でテストできるようにしてある。 */
const SG = (() => {
  const NFKC = s => String(s == null ? '' : s).normalize('NFKC');
  const CJK_NUM = '一二三四五六七八九十';

  // ---------- 1. シナリオ名のクレンジング（規則の順序：a 拡張子 → b 先頭の頭文字 → c 人数の括弧 → d システム名・素材種別の括弧／サフィックス／ID） ----------
  const PLAYER_PATTERNS = [
    /^(?:推奨|参加|プレイ)?\s*\d+\s*(?:人|名|pl|pc|p)\s*(?:[~〜–-]\s*\d*\s*(?:人|名|pl|pc|p)?)?\s*(?:以上|程度|前後|推奨|用|まで)?$/i,
    /^\d+\s*[~〜–-]\s*\d*\s*(?:人|名|pl|pc|p)?$/i,
    /^(?:タイマン|ソロ|ペア|1on1|サシ|GMレス|KPレス|KPC(?:有|無|あり|なし)?)$/i,
    new RegExp('^[' + CJK_NUM + ']+\\s*(?:人|名)(?:[~〜–-][' + CJK_NUM + ']*\\s*(?:人|名)?)?(?:以上|程度|用)?$')
  ];
  // 人数表記を含む括弧は、中に他の語（システム名など）があっても、まるごと外す（全角の数字・括弧にも対応）
  const PLAYER_BRACKET_RE = /[（(【\[［〔][^）)】\]］〕]*(?:[0-9０-９]+\s*(?:PL|pl|人|名|PC|pc)|タイマン|ソロ|ペア)[^）)】\]］〕]*[）)】\]］〕]/g;
  const SYSTEM_WORD_RE = /(?:CoC|クトゥルフ|Cthulhu|SW\s*2|ソード\s*[・･]?\s*ワールド|インセイン|エモクロア|シノビガミ|ダブルクロス|DX\s*3|ガープス|GURPS|アリアンロッド|ナイトウィザード|ブレイド\s*[・･]?\s*オブ|マギカロギア|サタスペ|フィアースコ|DoD|ドラゴンアームズ|オリジナルシステム|システムフリー|TRPG|システム)/i;
  const SYSTEM_RE = SYSTEM_WORD_RE;   // 互換（括弧の中身にシステム名が含まれていれば、システム名の括弧とみなす）
  const TAG_WORD = '(?:本編|本文|素材|完全版|配布用|配布版|最新版|改訂版|完成版|データ|資料|リプレイ|KP用|GM用|PDF|ZIP|シナリオ|scenario|main|text|material|ver\\.?\\s*[\\d.]+|v\\s*[\\d.]+|第?\\s*\\d+\\s*版)';
  const TAG_RE = new RegExp('^(?:' + TAG_WORD + '[\\s・_,，、-]*)+$', 'i');
  const SUFFIX_RE = new RegExp('(?:[\\s_\\-]+' + TAG_WORD + ')+$', 'i');
  const SPLL_PREFIX_RE = /^(?:SPLL|[A-Za-z]{2,6})[_\- ]*[A-Za-z]?\d{3,}[_\- ]+/;   // 「SPLL_E103007_」のような配布IDの頭
  const SPLL_SUFFIX_RE = /[_\- ]+SPLL(?:[_\- ]*[A-Za-z]?\d+)?$/i;
  const LEAD_RE = /^(?:[ぁ-んァ-ヶ][\s _\-＿－]+|[0-9０-９]{1,3}[\s _\-＿－]+)/;   // 先頭の「五十音ソート用の頭文字（ひらがな・カタカナ1文字／数字1〜3桁）＋区切り」。英字（A / I / My / In など）は、すべてそのまま残す
  const EXT_RE = /\.(?:zip|pdf|rar|7z|txt|docx?|png|jpe?g|gif|webp|md|html?|json)$/i;
  const BOILER_RE = /利用規約|規約|ライセンス|目次|もくじ|はじめに|まえがき|ご利用|注意事項|ネタバレ|contents|table\s*of\s*contents|call\s*of\s*cthulhu|copyright|all\s*rights/i;
  const GENERIC_TITLE_RE = /^(?:本編|本文|シナリオ|scenario|main|新規|無題|untitled|document|doc\d*|scan\d*|目次|もくじ|はじめに|index|contents|表紙|タイトル|title|素材|資料|データ)$/i;
  // 「クトゥルフ神話TRPG」「Call of Cthulhu」「目次」「利用規約」など、シナリオ名ではない定型句か？
  function isBoilerplate(t) {
    const n = NFKC(t).trim(); if (!n) return true; if (GENERIC_TITLE_RE.test(n)) return true;
    if (n.length <= 30 && BOILER_RE.test(n)) return true;
    const rest = n.replace(new RegExp(SYSTEM_WORD_RE.source, 'gi'), '').replace(/第?\s*[1-7]\s*版|神話|の呼び声|新|\bscenario\b|シナリオ|[\s・:：\-_/／()（）\[\]【】]/gi, '');
    return rest === '';   // システム名だけでできている
  }

  // 人数表記 → 「2〜4人」「4人〜」「タイマン」。括弧の中に別の語が混じっていても、人数の部分だけを読む
  function parsePlayers(raw) {
    const t = NFKC(raw).trim();
    if (/タイマン|1on1|サシ/i.test(t)) return 'タイマン';
    if (/ソロ/.test(t) && !/\d/.test(t)) return 'ソロ';
    if (/ペア/.test(t) && !/\d/.test(t)) return 'ペア';
    let m = /(\d+)\s*(?:人|名|pl|pc|p)?\s*[~〜–-]\s*(\d+)\s*(?:人|名|pl|pc|p)/i.exec(t); if (m) return `${m[1]}〜${m[2]}人`;
    m = /(\d+)\s*(?:人|名|pl|pc|p)\s*([~〜–-])?/i.exec(t); if (m) return m[2] ? `${m[1]}人〜` : `${m[1]}人`;
    m = /(\d+)\s*([~〜–-])\s*(\d+)/.exec(t); if (m) return `${m[1]}〜${m[3]}人`;
    return '';
  }

  // フォルダ名・ファイル名のノイズを外す。人数・システムの括弧は、見つかれば別に返す（PDFから取れなかったときの補助）
  function analyzeName(raw) {
    const stem = String(raw == null ? '' : raw).replace(EXT_RE, '').trim();
    let s = stem, system = '', players = '';
    for (let k = 0; k < 2; k++) { const n = s.replace(LEAD_RE, '').trim(); if (n && n !== s && /\p{L}/u.test(n)) s = n; else break; }   // b：先頭の頭文字（外したあとに文字が残らないときは外さない）
    s = s.replace(PLAYER_BRACKET_RE, m => { const p = parsePlayers(m.slice(1, -1)); if (p && !players) players = p; const sm = SYSTEM_WORD_RE.exec(NFKC(m)); if (sm && !system) system = sm[0]; return ' '; });   // c：人数の括弧
    s = s.replace(/[(（\[［【〔{｛<＜]([^)）\]］】〕}｝>＞]*)[)）\]］】〕}｝>＞]/g, (m, inner) => {   // d：システム名・素材種別の括弧
      const t = NFKC(inner).trim();
      if (PLAYER_PATTERNS.some(r => r.test(t))) { const p = parsePlayers(t); if (p && !players) players = p; return ' '; }
      if (t && SYSTEM_WORD_RE.test(t) && t.length <= 30) { if (!system) system = t; return ' '; }
      if (TAG_RE.test(t)) return ' ';
      return m;
    });
    s = s.replace(SPLL_PREFIX_RE, '').replace(SPLL_SUFFIX_RE, '');
    s = s.replace(/[_＿]+/g, ' ');
    for (let k = 0; k < 3; k++) { const n = s.replace(SUFFIX_RE, '').replace(/[\s\u3000]*[-_ ]?(?:ver|v)\.?\s*\d+(?:\.\d+)*\s*$/i, '').trim(); if (n && n !== s.trim()) s = n; else break; }   // _本文・_素材・ver表記などの末尾
    s = s.replace(/[\s\u3000]+/g, ' ').trim();
    const s2 = s.replace(/[\s_-]*(?:本編|本文|素材|完全版|配布版|配布用|完成版)$/, '').trim(); if (s2.length >= 2) s = s2;
    s = s.replace(/^[\s\-–—_・.]+|[\s\-–—_・.]+$/g, '');
    return { title: s || stem.replace(LEAD_RE, '').trim() || stem, system, players };
  }
  const cleanScenarioName = raw => analyzeName(raw).title;

  // ---------- 2. メインPDFの判別 ----------
  const SUB_PDF_RE = /(?<![A-Za-z])KP(?![a-z])|ＫＰ|真相|データ|(?<![A-Za-z])HO(?![a-z])|ＨＯ|規約|ライセンス|おまけ|オマケ|ハンドアウト|handout|キャラシ|キャラクターシート|README/i;
  const MAIN_HINT_RE = /本編|本文/;
  const normKey = s => NFKC(s).toLowerCase().replace(/[\s\u3000_\-–—・.,，、。()（）\[\]【】「」『』~〜!！?？:：]/g, '');
  function dice(a, b) {   // 2文字ずつの一致度（0〜1）
    a = normKey(a); b = normKey(b); if (!a || !b) return 0; if (a === b) return 1;
    const bg = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
    if (a.length < 2 || b.length < 2) return a.includes(b) || b.includes(a) ? 0.5 : 0;
    const A = bg(a), B = bg(b); let hit = 0; A.forEach((n, k) => { hit += Math.min(n, B.get(k) || 0); });
    return (2 * hit) / (a.length - 1 + b.length - 1);
  }
  // pdfs: [{ name, size }]。戻り値：{ main, subs }（main は pdfs の要素 or null）
  function classifyPdfs(pdfs, folderName) {
    const list = (pdfs || []).filter(p => p && p.name);
    if (!list.length) return { main: null, subs: [] };
    const isSub = p => SUB_PDF_RE.test(NFKC(p.name));
    let cand = list.filter(p => !isSub(p)); if (!cand.length) cand = list.slice();
    const hinted = cand.filter(p => MAIN_HINT_RE.test(p.name)); if (hinted.length) cand = hinted;
    const ref = cleanScenarioName(folderName || '');
    const score = p => ref ? dice(cleanScenarioName(p.name), ref) : 0;
    cand.sort((x, y) => (score(y) - score(x)) || ((y.size || 0) - (x.size || 0)) || String(x.name).localeCompare(String(y.name), 'ja'));
    const main = cand[0];
    return { main, subs: list.filter(p => p !== main) };
  }

  // ---------- 3. タイトルの決定（PDFの最大フォント文字列 ＞ クレンジング済みのフォルダ名・ファイル名） ----------
  function cleanPdfTitle(t) {   // PDFの表題候補にも、同じクレンジングを通す。定型句（システム名・目次・規約など）しか取れなければ「無し」
    const c = cleanScenarioName(String(t == null ? '' : t).replace(/[\s\u3000]+/g, ' ').trim());
    if (c.length < 2 || c.length > 60 || /^[\d\s.\-/]+$/.test(NFKC(c)) || isBoilerplate(c)) return '';
    return c;
  }
  // ref = { folder, mainName, pdfTitle } → { title, source }
  function decideTitle({ folder, mainName, pdfTitle }) {
    const base = cleanScenarioName(folder || mainName || ''), pt = cleanPdfTitle(pdfTitle || '');
    const baseOk = base && !isBoilerplate(base);
    if (pt) return { title: pt, source: baseOk && normKey(pt) !== normKey(base) ? 'pdf' : 'pdf=name' };   // PDFの表題が取れたら、それをタイトルにする
    return { title: base || '無題のシナリオ', source: 'name' };   // 取れなかったとき（定型句だけ・文字なし）は、クレンジング済みの名前を維持
  }

  // ---------- 4. PDFの文字（pdf.js の getTextContent().items）の整形 ----------
  const itemSize = it => { const t = (it && it.transform) || []; return Math.hypot(t[2] || 0, t[3] || 0) || (it && it.height) || 0; };   // transform から文字の高さ（フォントサイズ）を求める
  function itemsToText(items) {
    let out = '', lastY = null, lastH = 0;
    for (const it of items || []) {
      if (!it || typeof it.str !== 'string') continue;
      const y = it.transform ? it.transform[5] : 0, h = itemSize(it);
      if (lastY !== null && Math.abs(y - lastY) > Math.max(h, lastH) * 0.6 && !out.endsWith('\n')) out += '\n';
      out += it.str; if (it.hasEOL && !out.endsWith('\n')) out += '\n';
      lastY = y; lastH = h;
    }
    return out;
  }
  // 1〜2ページ目の文字のうち、最大フォントサイズのものをつなげて「表題の候補」にする。pages: [{ page, items }]
  function wMedian(pairs) { const a = pairs.filter(p => p[0] > 0 && p[1] > 0).sort((x, y) => x[0] - y[0]), total = a.reduce((t, p) => t + p[1], 0); let acc = 0; for (const [v, w] of a) { acc += w; if (acc >= total / 2) return v; } return 0; }   // 文字数で重みを付けた中央値
  function biggestText(pages) {
    const cands = [];
    (pages || []).forEach(({ page, items }) => (items || []).forEach((it, i) => {
      if (!it || typeof it.str !== 'string') return; const str = it.str.trim(); if (!str || /^[\d\s.\-–—/・]+$/.test(str)) return;
      cands.push({ str, size: itemSize(it), page, i, y: it.transform ? it.transform[5] : 0 });
    }));
    if (!cands.length) return '';
    const max = Math.max(...cands.map(c => c.size)); if (!(max > 0)) return '';
    const med = wMedian(cands.map(c => [c.size, c.str.length])); if (max < med * 1.3) return '';   // 周りより明らかに大きい文字（表題らしいもの）が無ければ、表題なし
    const top = cands.filter(c => c.size >= max * 0.97);
    const firstPage = Math.min(...top.map(c => c.page)), use = top.filter(c => c.page === firstPage);   // 最大サイズが複数ページにあれば、先のページ
    use.sort((a, b) => a.i - b.i);
    return use.map(c => c.str).join('').replace(/[\s\u3000]+/g, ' ').trim();
  }

  // ---------- 5. スペックの抽出（PDF序盤のテキスト → 項目） ----------
  const SEP = '(?:^|[\\s/／|｜,，、・■□◆◇●○▼▽▲△\\[【(（「『])';
  function toLines(text) {
    const raw = String(text == null ? '' : text).split(/\r?\n/).map(l => l.replace(/[ \t\u3000]+/g, ' ').trim());
    return { raw, nl: raw.map(NFKC) };
  }
  function findLabeled(nl, labelSrc, { colon = false, max = 80, cont = true } = {}) {
    const re = new RegExp(SEP + '(?:' + labelSrc + ')[】\\])）]?' + (colon ? '\\s*[:：]\\s*' : '(?:\\s*[:：]\\s*|(?=\\s)|$)') + '(.*)$', 'i');
    for (let i = 0; i < nl.length; i++) {
      const m = re.exec(nl[i]); if (!m) continue;
      let v = m[1].trim().replace(/\s+\S{1,8}[:：].*$/, '').trim();   // 同じ行に別の項目が続くときは、そこまで
      if (!v && nl[i + 1] && nl[i + 1].length <= 40 && !/[:：]/.test(nl[i + 1])) v = nl[i + 1].trim();   // 表の「項目名 / 値」が行を分けて出るとき
      if (cont) { let k = i + 1, n = 0; while (/[、,，/／・]$/.test(v) && nl[k] && n < 2 && !/[:：]/.test(nl[k])) { v += nl[k].trim(); k++; n++; } }
      v = v.replace(/[\s、,，]+$/, '');
      if (v) return v.slice(0, max);
    }
    return '';
  }
  function parseTime(v) {
    const t = NFKC(v), m = /(約)?\s*(\d+(?:\.\d+)?)\s*(?:([~〜–-])\s*(\d+(?:\.\d+)?))?\s*(?:時間|h(?![a-z])|hrs?)/i.exec(t);
    if (m) return `${m[1] || ''}${m[2]}${m[3] && m[4] ? '〜' + m[4] : (m[3] ? '〜' : '')}時間`;
    const mm = /(\d+)\s*分/.exec(t); if (mm) return `${mm[1]}分`;
    return t.slice(0, 30);
  }
  const HEAD_LABELS = ['あらすじ', 'シナリオ概要', '概要', 'トレーラー', 'ストーリー', 'イントロダクション', '導入', 'シナリオ紹介'];
  const OPEN_SYM = '■□◆◇●○▼▽▲△【\\[<＜';
  const SPEC_LINE_RE = /^[\s■□◆◇●○▼▽▲△【\[(（]*(?:プレイ人数|参加人数|推奨人数|人数|プレイ時間|所要時間|想定時間|必須技能|推奨技能|準推奨技能|ロスト率|後遺症|使用システム|対応システム|システム)\s*[】\])）]?\s*[:：]/;
  function findSynopsis(raw, nl) {
    for (const label of HEAD_LABELS) {
      const re = new RegExp('^[\\s' + OPEN_SYM + '(（「『]*' + label + '(?=[\\s\\]】)）>＞」』:：]|$)[\\s\\]】)）>＞」』]*[:：]?\\s*(.*)$');
      for (let i = 0; i < nl.length; i++) {
        const m = re.exec(nl[i]); if (!m) continue;
        const parts = [];
        const first = raw[i].slice(raw[i].length - m[1].length).trim(); if (first.length >= 8) parts.push(first);
        for (let k = i + 1, n = 0; k < nl.length && n < 14; k++, n++) {
          const l = nl[k]; if (!l) continue;
          if (/^(?:p\.?\s*)?\d{1,3}$/i.test(l)) continue;                                   // ページ番号
          if (SPEC_LINE_RE.test(l)) break;                                                    // 次の項目
          if (new RegExp('^[\\s]*[' + OPEN_SYM + ']').test(l) && l.length <= 30) break;       // ■見出し・【見出し】
          parts.push(raw[k]); if (parts.join('\n').length >= 700) break;
        }
        const text = parts.join('\n').trim();
        if (text.length >= 15) return text.slice(0, 800);
      }
    }
    return '';
  }
  // text：PDF序盤のテキスト（改行区切り）。戻り値：見つかった項目だけを持つオブジェクト
  function extractSpecs(text) {
    const { raw, nl } = toLines(text), out = {};
    const pc = findLabeled(nl, 'プレイ人数|参加人数|推奨人数|PL人数|人数', { max: 30 }); if (pc) { const p = parsePlayers(pc); if (p) out.playerCount = p; }
    const pt = findLabeled(nl, 'プレイ時間|所要時間|想定時間|プレイ目安') || findLabeled(nl, '時間', { colon: true, max: 40 }); if (pt) out.playTime = parseTime(pt);
    const rec = findLabeled(nl, '(?<!準)推奨技能|オススメ技能|おすすめ技能', { max: 120 }); if (rec) out.recSkills = rec;
    const semi = findLabeled(nl, '準推奨技能|準オススメ技能', { max: 120 }); if (semi) out.semiRecSkills = semi;
    const req = findLabeled(nl, '必須技能|必要技能', { max: 120 }); if (req) out.reqSkills = req;
    const lost = findLabeled(nl, 'ロスト率|ロスト危険度|ロスト可能性|ロスト', { max: 20 }); if (lost) out.lostRate = lost;
    const aft = findLabeled(nl, '後遺症', { max: 30 }); if (aft) out.aftereffect = aft;
    const sys = findLabeled(nl, '使用システム|対応システム|システム|ルール', { colon: true, max: 40 }); if (sys) out.system = sys;
    const syn = findSynopsis(raw, nl); if (syn) out.trailer = syn;
    return out;
  }

  // ---------- 6. トレーラー画像の選び方 ----------
  const STRONG_IMG = ['trailer', 'トレーラー', 'title', 'タイトル', 'サムネ', 'thumb', 'cover', '表紙'];
  // names: [{ name, root }]（root: フォルダ直下なら true）。戻り値：選んだ要素 or null
  function pickTrailerImage(files) {
    const list = (files || []).filter(f => f && f.name); if (!list.length) return null;
    const stem = f => NFKC(String(f.name).replace(/\.[^.]+$/, '')).toLowerCase();
    const rank = f => { const s = stem(f); for (let i = 0; i < STRONG_IMG.length; i++) if (s.includes(STRONG_IMG[i])) return i; return /(?:^|[^0-9])0?1(?:[^0-9]|$)/.test(s) ? STRONG_IMG.length : -1; };
    const scored = list.map(f => ({ f, r: rank(f) })).filter(x => x.r >= 0);
    if (!scored.length) return null;
    scored.sort((a, b) => (a.r - b.r) || ((b.f.root ? 1 : 0) - (a.f.root ? 1 : 0)) || String(a.f.name).localeCompare(String(b.f.name), 'ja', { numeric: true }));
    return scored[0].f;
  }

  return { analyzeName, cleanScenarioName, isBoilerplate, parsePlayers, classifyPdfs, decideTitle, cleanPdfTitle, itemsToText, biggestText, extractSpecs, pickTrailerImage, dice, itemSize };
})();
