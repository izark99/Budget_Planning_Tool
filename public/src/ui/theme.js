/* ===========================================================
   CHẾ ĐỘ SÁNG / TỐI
   Ba lựa chọn: theo hệ thống (mặc định), sáng, tối.

   Lưu ở localStorage chứ KHÔNG ở S.ui: S.ui đi thẳng vào file dự án .json, gửi
   file cho đồng nghiệp là gửi luôn chế độ màu của mình — không ai muốn thế.

   CSS chỉ có MỘT khối tối ([data-theme="dark"]) chứ không lặp lại dưới
   @media (prefers-color-scheme: dark), vì chỗ này quy "auto" về một trong hai
   rồi mới đóng dấu lên <html>. Đoạn tương đương nằm nội tuyến trong <head> của
   index.html để đóng dấu TRƯỚC lần vẽ đầu tiên — không chớp sáng rồi mới tối.
   =========================================================== */
import { t } from '../core/content.js';
import { el } from './dom.js';

const KEY = 'bp_theme';
const MODES = ['auto', 'light', 'dark'];

/** Lựa chọn đang lưu. Trình duyệt chặn localStorage thì coi như 'auto'. */
function themeMode() {
  try {
    const v = localStorage.getItem(KEY);
    return MODES.indexOf(v) >= 0 ? v : 'auto';
  } catch { return 'auto'; }
}

function prefersDark() {
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/** Quy lựa chọn về đúng một trong hai rồi đóng dấu lên <html>. */
function applyTheme() {
  const mode = themeMode();
  const dark = mode === 'dark' || (mode === 'auto' && prefersDark());
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

function setThemeMode(mode) {
  try { localStorage.setItem(KEY, MODES.indexOf(mode) >= 0 ? mode : 'auto'); } catch { /* chặn ghi thì thôi */ }
  applyTheme();
}

/* Chế độ "theo hệ thống" phải đổi NGAY khi hệ thống đổi, không đợi tải lại trang. */
function initTheme() {
  applyTheme();
  const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (!mq) return;
  const onChange = () => { if (themeMode() === 'auto') applyTheme(); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);          /* Safari cũ */
}

/** Ô chọn cho chân cột trái. */
function themeSelect() {
  const cur = themeMode();
  return el('label', { class: 'themepick' }, [
    el('span', { text: t('rail.theme') }),
    el('select', {
      onchange: function (e) { setThemeMode(e.target.value); }
    }, [
      el('option', { value: 'auto', selected: cur === 'auto', text: t('rail.theme_auto') }),
      el('option', { value: 'light', selected: cur === 'light', text: t('rail.theme_light') }),
      el('option', { value: 'dark', selected: cur === 'dark', text: t('rail.theme_dark') })
    ])
  ]);
}

export { initTheme, themeMode, setThemeMode, themeSelect };
