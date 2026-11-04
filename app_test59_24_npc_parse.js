/* app_test59_24_npc_parse.js — STEP 4：NPCの自動抽出・全PDF横断の一括検出・マルチシステムのチャットパレット生成（画面・DOM・pdf.js に依存しない純粋な関数）
 *  ・parseNpc(text)        … 名前／ステータス（HP・MP・SAN・装甲・幸運・生命力・共鳴 …）／パラメータ（STR〜EDU・DB …）／技能 を正規表現で取り出す
 *      技能：「目星:50%」「《言いくるめ》(85)」「図書館 70%」と、ダイスコマンドの逆引き（CCB<=70 【こぶし(パンチ)】／CC<=60 目星／2D6>=5 【調査】／2DM<=4 〈洞察〉）
 *  ・detectBlocks(text)    … ステータス・技能が密集しているブロック（NPC候補）を探す
 *  ・buildPalette(npc)     … CoC6版／CoC7版／エモクロア／インセイン・シノビガミ(2D6)／SW2.5／DX3rd／カスタム のチャットパレット */
const NP = (() => {
  const NFKC = s => String(s == null ? '' : s).normalize('NFKC');
  const SYSTEMS = [['coc6', 'CoC6版'], ['coc7', 'CoC7版'], ['emoklore', 'エモクロア'], ['insane', 'インセイン・シノビガミ(2D6)'], ['sw25', 'SW2.5'], ['dx3', 'DX3rd'], ['custom', 'カスタム']];
  const SYS_IDS = SYSTEMS.map(s => s[0]);

  // ---------- 辞書 ----------
  const STATUS_MAP = { 'SAN値': 'SAN', 'SAN': 'SAN', '正気度': 'SAN', 'HP': 'HP', '耐久力': 'HP', 'MP': 'MP', 'SP': 'SP', '装甲': '装甲', 'アーマー': '装甲', '幸運': '幸運', 'LUCK': '幸運', 'LUK': '幸運', '生命力': '生命力', '共鳴': '共鳴' };
  const PARAM_MAP = { 'STR': 'STR', 'CON': 'CON', 'POW': 'POW', 'DEX': 'DEX', 'APP': 'APP', 'SIZ': 'SIZ', 'INT': 'INT', 'EDU': 'EDU', '筋力': 'STR', '体力': 'CON', '精神力': 'POW', '敏捷性': 'DEX', '素早さ': 'DEX', '外見': 'APP', '体格': 'SIZ', '知性': 'INT', '教育': 'EDU' };
  const ALL_LABELS = { ...STATUS_MAP, ...PARAM_MAP, 'DB': 'DB', 'ダメージボーナス': 'DB', 'ダメボ': 'DB' };
  const alt = keys => keys.slice().sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const STAT_ALT = alt(Object.keys(STATUS_MAP)), PARAM_ALT = alt(Object.keys(PARAM_MAP));
  const NUM = '([+\\-]?\\d{1,4})(?:\\s*[/／]\\s*(\\d{1,4}))?';
  const reStat = () => new RegExp('(?<![A-Za-z0-9])(' + STAT_ALT + ')\\s*[:：=]?\\s*' + NUM + '(?![A-Za-z])', 'g');
  const reParam = () => new RegExp('(?<![A-Za-z0-9])(' + PARAM_ALT + ')\\s*[:：=]?\\s*' + NUM + '(?![A-Za-z])', 'g');
  const reDB = () => /(?<![A-Za-z])(?:DB|ダメージボーナス|ダメボ)\s*[:：=]?\s*(なし|[+\-]?\s*\d*\s*[Dd]\s*\d+|[+\-]?\s*\d+)/g;
  const isLabel = n => Object.prototype.hasOwnProperty.call(ALL_LABELS, n) || Object.prototype.hasOwnProperty.call(ALL_LABELS, String(n).toUpperCase());
  const CMD_RE = /^\s*(s?)(CCB|CC|CBRB|CBR|\d*DM|\d*D\d+|\d*D6)(?:\((-?\d+)\))?\s*(<=|>=|<|>|=)\s*(\d+)\s*(?:[【〈《\[「『](.+?)[】〉》\]」』]|(\S.*?))?\s*$/i;   // ダイスコマンド 1行

  // ---------- 技能の抽出 ----------
  function extractSkills(nl) {
    const out = [], seen = new Set();
    const add = (name, value, extra) => {
      name = String(name).trim().replace(/^[■□◆◇●○▼▽・\-\s]+/, '').replace(/[\s:：、,，]+$/, ''); const v = Number(value);
      if (!name || name.length > 24 || !(v >= 0) || v > 999 || /^\d+$/.test(name) || isLabel(name) || /^(?:HP|MP|SAN|DB|SP|LUK)/i.test(name) || /^(?:ダメージ|ダイス|判定|成功|失敗|クリティカル|ファンブル)/.test(name)) return;
      if (seen.has(name)) return; seen.add(name); out.push({ name, value: v, ...(extra || {}) });
    };
    for (const line of nl) {
      const cm = CMD_RE.exec(line);   // ① ダイスコマンド形式（逆引き）。名前の中の丸括弧は残す
      if (cm) { const kind = cm[2].toUpperCase(), name = (cm[6] || cm[7] || '').trim(); if (name && !/^(CBRB|CBR)$/.test(kind)) { const dm = /^(\d*)D([MD6]|\d+)/i.exec(kind), dice = dm && dm[1] ? Number(dm[1]) : undefined; add(name, cm[5], { op: cm[4], cmd: kind, ...(dice ? { dice } : {}) }); } continue; }
      const found = []; let m;   // 同じ行の中は、左から右の順に並べる
      const rBr = /[《〈【\[「『]([^》〉】\]」』]+)[》〉】\]」』]\s*[:：=]?\s*[(（]?\s*(\d{1,3})\s*[%％)）]?/g;   // ② 《言いくるめ》(85)／【目星】50%
      while ((m = rBr.exec(line))) found.push([m.index, m[1], m[2]]);
      const rCo = /(?<![\d\w])([^\s、,，/／:：()（）《》〈〉【】\[\]「」『』%％\d=][^\s、,，/／:：《》〈〉【】\[\]「」『』%％=]*?)\s*[:：]\s*(\d{1,3})\s*[%％]?(?![\d])/g;   // ③ 目星:50%
      while ((m = rCo.exec(line))) found.push([m.index, m[1], m[2]]);
      const rPct = /([^\s、,，/／()（）《》〈〉【】\[\]「」『』\d%％][^\s、,，/／()（）《》〈〉【】\[\]「」『』%％]{0,11})\s+(\d{1,3})\s*[%％]/g;   // ④ 目星 50%
      while ((m = rPct.exec(line))) found.push([m.index, m[1], m[2]]);
      const rPar = /([ぁ-んァ-ヶ一-龠ー・A-Za-z]{1,12})\s*[（(]\s*(\d{1,3})\s*[%％]?\s*[）)]/g;   // ⑤ 図書館(70)
      while ((m = rPar.exec(line))) found.push([m.index, m[1], m[2]]);
      found.sort((a, b) => a[0] - b[0]).forEach(([, n, v]) => add(n, v));
    }
    return out;
  }

  // ---------- 名前 ----------
  function guessName(lines, nl, firstIdx) {
    for (let i = 0; i < nl.length; i++) { const m = /(?:^|[\s■□◆◇●○▼▽【\[])(?:名前|氏名|ネーム|NAME)\s*[:：]\s*(.{1,30}?)(?=\s{2,}|\s+(?:性別|年齢|職業|ＰＬ|PL)|[】\]]|$)/i.exec(nl[i]); if (m) return lines[i].slice(lines[i].length - nl[i].length + nl[i].indexOf(m[1]), lines[i].length - nl[i].length + nl[i].indexOf(m[1]) + m[1].length).trim() || m[1].trim(); }
    const clean = l => l.replace(/^[\s■□◆◇●○▼▽【\[「『・\-]+/, '').replace(/[\s】\]」』]+$/, '').trim();
    const ok = c => c && c.length >= 1 && c.length <= 24 && !/[:：]/.test(c) && !(reStat().test(c) || reParam().test(c)) && !CMD_RE.test(c) && !/^[\d\s.%％]+$/.test(c) && !/^(?:技能|ステータス|能力値|パラメータ|データ|NPC)$/i.test(c);
    const start = firstIdx > 0 ? firstIdx - 1 : -1;
    for (let i = start, n = 0; i >= 0 && n < 4; i--) { if (!nl[i].trim()) continue; n++; const c = clean(lines[i]); if (ok(c)) return c; }
    for (let i = 0; i < Math.min(lines.length, 4); i++) { const c = clean(lines[i]); if (c && ok(c) && (firstIdx < 0 || i < firstIdx)) return c; }
    return '';
  }

  // ---------- NPCの解析 ----------
  function parseNpc(text) {
    const lines = String(text == null ? '' : text).replace(/\r/g, '').split('\n').map(l => l.replace(/[ \t\u3000]+/g, ' ').trim()), nl = lines.map(NFKC);
    const status = [], params = [], seenS = new Set(), seenP = new Set(); let firstIdx = -1;
    const addS = (label, v, mx) => { const k = STATUS_MAP[label] || STATUS_MAP[label.toUpperCase()]; if (!k || seenS.has(k)) return; seenS.add(k); status.push({ label: k, value: Number(v), max: mx != null && mx !== '' ? Number(mx) : Number(v) }); };
    const addP = (label, v) => { const k = PARAM_MAP[label] || PARAM_MAP[label.toUpperCase()]; if (!k || seenP.has(k)) return; seenP.add(k); params.push({ label: k, value: String(Number(v)) }); };
    nl.forEach((l, i) => {
      let m, hit = false; const rs = reStat(), rp = reParam();
      while ((m = rs.exec(l))) { addS(m[1], m[2], m[3]); hit = true; }
      while ((m = rp.exec(l))) { addP(m[1], m[2]); hit = true; }
      const rd = reDB(); while ((m = rd.exec(l))) { if (!seenP.has('DB')) { seenP.add('DB'); params.push({ label: 'DB', value: m[1].replace(/\s+/g, '').replace(/^なし$/, '0') }); } hit = true; }
      if (hit && firstIdx < 0) firstIdx = i;
    });
    // 表形式（見出しの行に項目名、次の行に数字が並ぶ）
    for (let i = 0; i + 1 < nl.length; i++) {
      const heads = nl[i].split(/[\s/／|｜]+/).filter(Boolean), nums = nl[i + 1].split(/[\s/／|｜]+/).filter(Boolean);
      if (heads.length >= 3 && heads.length === nums.length && heads.every(h => isLabel(h)) && nums.every(n => /^[+\-]?\d{1,4}$/.test(n))) {
        heads.forEach((h, k) => { if (STATUS_MAP[h] || STATUS_MAP[h.toUpperCase()]) addS(h, nums[k]); else if (PARAM_MAP[h] || PARAM_MAP[h.toUpperCase()]) addP(h, nums[k]); });
        if (firstIdx < 0) firstIdx = i;
      }
    }
    const skills = extractSkills(nl);
    const cmds = skills.map(s => s.cmd).filter(Boolean);
    let system = '';
    if (cmds.some(c => c === 'CCB')) system = 'coc6'; else if (cmds.some(c => c === 'CC')) system = 'coc7'; else if (cmds.some(c => /DM$/.test(c))) system = 'emoklore'; else if (cmds.some(c => /^\d*D6$/.test(c))) system = 'insane';
    else if (status.some(s => s.label === '生命力' || s.label === '共鳴')) system = 'emoklore'; else if (params.some(p => ['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU'].includes(p.label)) || status.some(s => s.label === 'SAN')) system = '';
    return { name: guessName(lines, nl, firstIdx), status, params, skills, system, memo: lines.join('\n').trim() };
  }

  // ---------- 一括検出（ページの文字 → NPC候補） ----------
  const statCount = l => { let n = 0, m; const rs = reStat(), rp = reParam(); while ((m = rs.exec(l))) n++; while ((m = rp.exec(l))) n++; if (reDB().test(l)) n++; return n; };
  const skillCount = l => extractSkills([l]).length;
  function detectBlocks(text, meta) {
    const lines = String(text == null ? '' : text).replace(/\r/g, '').split('\n'), nl = lines.map(NFKC), N = lines.length, out = [];
    const anchors = []; nl.forEach((l, i) => { if (statCount(l) >= 1) anchors.push(i); });
    const groups = []; anchors.forEach(i => {
      const g = groups[groups.length - 1]; let merge = !!g && i - g.end <= 4;
      if (merge) for (let k = g.end + 1; k < i; k++) if (/^\s*[■□◆◇●○▼▽【\[]/.test(nl[k])) { merge = false; break; }   // 間に「■名前」のような見出しがあれば、別のNPC
      if (merge) g.end = i; else groups.push({ start: i, end: i });
    });
    // 表形式の見出し行（項目名だけが並ぶ行）も、ブロックの核にする
    for (let i = 0; i + 1 < N; i++) { const heads = nl[i].split(/[\s/／|｜]+/).filter(Boolean); if (heads.length >= 3 && heads.every(h => isLabel(h)) && !groups.some(g => i >= g.start - 1 && i <= g.end + 1)) groups.push({ start: i, end: i + 1 }); }
    groups.sort((a, b) => a.start - b.start);
    const topOf = g => {   // ブロックの先頭：名前の行（■…）を含める。前のNPCの技能の行まで巻き込まないよう、ステータス・技能の行で止める
      let st = g.start; for (let k = g.start - 1; k >= 0 && k >= g.start - 3; k--) { if (!nl[k].trim()) continue; if (statCount(nl[k]) > 0 || skillCount(nl[k]) > 0) break; st = k; if (/^\s*[■□◆◇●○▼▽【\[]/.test(nl[k])) break; }
      return st;
    };
    let lastEnd = -1;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi], next = groups[gi + 1], limit = next ? Math.max(g.end, topOf(next) - 1) : N - 1;   // 次のNPCの名前の行までは、延ばさない
      let s = Math.max(lastEnd + 1, topOf(g)), e = g.end, gap = 0;
      for (let i = g.end + 1; i < N && i <= limit && i < g.end + 40; i++) { if (skillCount(nl[i]) > 0 || statCount(nl[i]) > 0) { e = i; gap = 0; } else if (nl[i].trim() && ++gap > 2) break; else if (!nl[i].trim() && ++gap > 2) break; }
      if (e >= N) e = N - 1;
      const blockLines = lines.slice(s, e + 1); lastEnd = e;
      const npc = parseNpc(blockLines.join('\n')), core = npc.status.length + npc.params.length, density = core + npc.skills.length;
      if (!((core >= 2 && density >= 5) || (npc.skills.length >= 4 && core >= 1))) continue;
      out.push({ ...npc, score: density, page: meta && meta.page, pdf: meta && meta.pdf, text: blockLines.join('\n').trim() });
    }
    return out;
  }

  // ---------- チャットパレット ----------
  const FIREARM_RE = /拳銃|ハンドガン|リボルバー|ライフル|ショットガン|散弾銃|サブマシンガン|マシンガン|機関銃|アサルト|銃|ピストル|ボウ|弓/;
  const MARTIAL_RE = /^(?:マーシャルアーツ|武道)/, STRIKE_RE = /^(?:こぶし|パンチ|キック|頭突き|ヘッドバット)/;
  const DEFAULT_OPTS = { secret: false, hideStatus: false, burst: false, cbrb: true, cbrbPairs: [], resist: true, hard: false, bonus: false, lv: 2, target: 5, dxDice: 4, template: 'CCB<={value} 【{name}】' };
  function buildPalette(npc) {
    const o = { ...DEFAULT_OPTS, ...(npc.opts || {}) }, sys = SYS_IDS.includes(npc.system) ? npc.system : 'coc6', skills = (npc.skills || []).filter(s => s && s.name && s.use !== false), sec = o.secret ? 's' : '', L = [];
    const find = n => skills.find(s => s.name === n);
    if (sys === 'coc6') {
      skills.forEach(s => { L.push(`${sec}CCB<=${s.value} 【${s.name}】`); if (o.burst && FIREARM_RE.test(s.name)) L.push(`${sec}x2 CCB<=${s.value} 【${s.name}】`); });   // 連撃：1発用と併記（x2 / sx2）
      const marts = skills.filter(s => MARTIAL_RE.test(s.name)), strikes = skills.filter(s => STRIKE_RE.test(s.name));
      if (o.cbrb) marts.forEach(a => strikes.forEach(b => L.push(`${sec}CBRB(${a.value},${b.value}) 【${a.name}＋${b.name}】`)));   // 「マーシャルアーツ／武道」と「こぶし／キック等」が両方あれば自動で併記
      (o.cbrbPairs || []).forEach(p => { const a = find(p.a), b = find(p.b); if (a && b && a !== b) L.push(`${sec}CBRB(${a.value},${b.value}) 【${a.name}＋${b.name}】`); });   // 任意の2技能
      if (o.resist) ['STR', 'CON', 'POW', 'DEX'].forEach(k => { if ((npc.params || []).some(p => p.label === k)) L.push(`${sec}RESB({${k}}, ) ${k}対抗`); });   // 対抗ロール（相手の数値は空欄）
    } else if (sys === 'coc7') {
      skills.forEach(s => {
        L.push(`${sec}CC<=${s.value} 【${s.name}】`);
        if (o.hard) { L.push(`${sec}CC<=${Math.floor(s.value / 2)} 【${s.name}（ハード）】`); L.push(`${sec}CC<=${Math.floor(s.value / 5)} 【${s.name}（イクストリーム）】`); }
        if (o.bonus) { L.push(`${sec}CC(1)<=${s.value} 【${s.name}（ボーナス）】`); L.push(`${sec}CC(-1)<=${s.value} 【${s.name}（ペナルティ）】`); }
      });
    } else if (sys === 'emoklore') {
      skills.forEach(s => L.push(`${sec}${s.dice || o.lv || 2}DM<=${s.value} 〈${s.name}〉`));
    } else if (sys === 'insane') {
      skills.forEach(s => L.push(`${sec}2D6>=${s.op === '>=' ? s.value : (o.target || 5)} 【${s.name}】`));
    } else if (sys === 'sw25') {
      skills.forEach(s => L.push(`${sec}2D6+${s.value} 【${s.name}】`));
      (npc.status || []).forEach(st => { if (/抵抗/.test(st.label)) L.push(`${sec}2D6+${st.value} 【${st.label}判定】`); });
    } else if (sys === 'dx3') {
      skills.forEach(s => L.push(`${sec}${s.dice || o.dxDice || 4}DX+${s.value}@10 【${s.name}】`));
    } else {
      const tpl = String(o.template || DEFAULT_OPTS.template);
      skills.forEach(s => { const line = tpl.replace(/\{name\}/g, s.name).replace(/\{value\}/g, String(s.value)).replace(/\{half\}/g, String(Math.floor(s.value / 2))).replace(/\{fifth\}/g, String(Math.floor(s.value / 5))); L.push(sec && !/^s/i.test(line) ? sec + line : line); });
    }
    return L.join('\n');
  }
  const oneLine = text => String(text == null ? '' : text).replace(/\s*\r?\n\s*/g, '').trim();   // 改行を消した1行（ダミー駒のチャパレ用）
  return { SYSTEMS, SYS_IDS, STATUS_MAP, PARAM_MAP, parseNpc, extractSkills, detectBlocks, buildPalette, oneLine, DEFAULT_OPTS, statCount };
})();
