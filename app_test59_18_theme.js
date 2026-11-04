/* app_test59_18_theme.js — 🌙 ダーク / ☀️ ライト の切り替え
 * 色は CSS の変数（:root[data-theme="dark" | "light"]）で一元管理。選択は localStorage に保存（この端末の設定）。初回は「ダーク」。
 * 起動時のちらつきを防ぐため、最初の適用は index.html の <head> の小さなスクリプトで済ませている。 */
const THEME_KEY = 'discord_forum_tool_theme';
const currentTheme = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
function setTheme(t) {
  t = t === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { logSoft('setTheme', e); }
  syncThemeButtons();
}
function syncThemeButtons() {
  const cur = currentTheme();
  document.querySelectorAll('[data-theme-set]').forEach(b => { const on = b.dataset.themeSet === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-theme-set]'); if (b) setTheme(b.dataset.themeSet); });
window.addEventListener('storage', e => { if (e.key === THEME_KEY) { document.documentElement.setAttribute('data-theme', e.newValue === 'light' ? 'light' : 'dark'); syncThemeButtons(); } });   // 別タブで切り替えたら追従
syncThemeButtons();
