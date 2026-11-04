/* app_test59_25_ccfolia_export.js — STEP 4：ココフォリア用の「駒ZIP」をブラウザ上で作る（外部ライブラリなし）
 *  ・ZIPは無圧縮（store）で自前に書き出す（画像は圧縮済みのため）。ファイル名はUTF-8。
 *  ・中身：__data.json（ルームデータ形式：entities.characters ＋ resources）＋ 立ち絵・アイコン画像
 *  ・クリップボード形式（{"kind":"character","data":{…}}）のJSONも作れる（ココフォリアの画面へ貼り付け用）
 * ⚠️ ココフォリアの取り込み形式は公式の仕様書が無いため、広く知られている構造に合わせた「最善の推測」です。
 *    形式に関わる定数・組み立ては、このファイルの toCharacter() と buildDataJson() の2か所にまとめてあります。 */
const CCZ = (() => {
  // ---------- ZIP（無圧縮） ----------
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  const enc = new TextEncoder();
  function dosDateTime(d) { return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }
  // files: [{ name, data: Uint8Array }] → Blob
  function makeZip(files, when) {
    const dt = dosDateTime(when || new Date()), parts = [], central = []; let offset = 0;
    for (const f of files) {
      const name = enc.encode(String(f.name)), data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dt.time, true); lh.setUint16(12, dt.date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh, name, data);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dt.time, true); ch.setUint16(14, dt.date, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(ch, name); offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + (p.byteLength !== undefined ? p.byteLength : p.length), 0);
    const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  // ---------- ココフォリアのデータ ----------
  const rid = (n = 20) => { const a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map(x => a[x % a.length]).join(''); };
  const safeName = s => String(s || 'piece').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 60) || 'piece';
  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/avif': 'avif' };
  // 駒1つ（アプリ内の形）→ ココフォリアの character。item: { name, memo, status, params, commands, hideStatus, secret, kind }
  function toCharacter(item, iconUrl, index, now) {
    const i = index || 0;
    return {
      name: String(item.name || '名前なし'), memo: String(item.memo || ''), initiative: 0, externalUrl: '',
      status: (item.status || []).map(s => ({ label: String(s.label), value: Number(s.value) || 0, max: Number(s.max != null ? s.max : s.value) || 0 })),
      params: (item.params || []).map(p => ({ label: String(p.label), value: String(p.value) })),
      iconUrl: iconUrl || '', faces: [], x: (i % 8) * 96, y: Math.floor(i / 8) * 96, z: 0, angle: 0, width: 4, height: 4,
      active: true, secret: false, invisible: false, hideStatus: !!item.hideStatus, color: '#888888', commands: String(item.commands || ''),
      createdAt: now || Date.now(), updatedAt: now || Date.now()
    };
  }
  function buildDataJson(characters, resources, title) {   // characters: { id: character }、resources: { key: { type, url } }
    return { meta: { version: '1.0.0' }, entities: { room: { name: title || 'シナリオ駒（生成）' }, items: {}, decks: {}, characters, effects: {}, scenes: {}, savedatas: {}, memos: {} }, resources };
  }
  const clipboardJson = (item, iconUrl) => JSON.stringify({ kind: 'character', data: toCharacter(item, iconUrl, 0) });   // ココフォリアの画面へ貼り付ける形式

  const sniffMime = b => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xFF && b[1] === 0xD8 ? 'image/jpeg' : b[0] === 0x47 && b[1] === 0x49 ? 'image/gif' : b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 ? 'image/webp' : b[0] === 0x42 && b[1] === 0x4D ? 'image/bmp' : '');   // 画像の種類を、先頭のバイトから判定
  // items: 駒の配列。resolveIcon(icon) → Promise<{ blob, mime } | { url } | null>
  async function build(items, resolveIcon, { title } = {}) {
    const files = [], characters = {}, resources = {}, warnings = [], cache = new Map(), now = Date.now();
    for (let k = 0; k < items.length; k++) {
      const it = items[k]; let iconUrl = '';
      if (it.icon && it.icon.url) {
        const key = it.icon.url;
        if (!cache.has(key)) {
          let r = null; try { r = resolveIcon ? await resolveIcon(it.icon) : null; } catch (e) { r = null; }
          if (r && r.blob) { const bytes = new Uint8Array(await r.blob.arrayBuffer()), mime = sniffMime(bytes) || r.mime || r.blob.type || 'image/png', fname = 'img_' + rid(10) + '.' + (EXT[mime] || 'png'); files.push({ name: fname, data: bytes }); resources[fname] = { type: mime, url: fname }; cache.set(key, fname); }
          else if (r && r.url) cache.set(key, r.url);
          else { cache.set(key, ''); warnings.push(`「${it.name || '名前なし'}」の画像を取得できませんでした`); }
        }
        iconUrl = cache.get(key);
      }
      characters[rid()] = toCharacter(it, iconUrl, k, now);
    }
    files.unshift({ name: '__data.json', data: enc.encode(JSON.stringify(buildDataJson(characters, resources, title))) });
    const d = new Date(), pad = n => String(n).padStart(2, '0'), stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    const filename = items.length === 1 ? `ccfolia_${safeName(items[0].name)}.zip` : `ccfolia_pieces_${stamp}.zip`;
    return { blob: makeZip(files, d), filename, warnings, count: items.length, files: files.map(f => f.name) };
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return { makeZip, crc32, toCharacter, buildDataJson, clipboardJson, build, download, safeName };
})();
