/* ===========================================================
   FORMULA-INPUT — ô nhập công thức và hộp gợi ý chèn cột.

   fxField    ô <textarea> có kiểm cú pháp tại chỗ + gợi ý khi gõ
   chipsPanel hộp gợi ý dùng chung: dính theo màn hình, cuộn nội bộ, và tự
              chèn vào ô công thức ĐANG được chọn (activeFx)
   colChips   dải chip cột cho một ô cụ thể

   Dựng trên fx-help.js (fxAssist, fxLibrary); fx-help.js không biết gì về nơi
   này — một chiều, không vòng.
   =========================================================== */
import { CAL_FIELDS, S, SYS_VARS } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { FX } from '../core/expression.js';
import { el, toast } from './dom.js';
import { fxAssist, fxLibrary } from './fx-help.js';

/* Ô công thức đang được chọn — hộp gợi ý chèn vào đúng ô này. */
let activeFx = null;

/* Chốt chặn: ô đang chọn có thể đã bị một lần dựng lại vứt khỏi DOM. Ghi vào ô
   ma đó thì onChange vẫn sửa dữ liệu nhưng màn hình không đổi — đúng lỗi
   "nhấn vài lần mới hiện, hiện bằng số lần nhấn" đã báo. */
function liveFx() {
  if (activeFx && !document.contains(activeFx)) activeFx = null;
  return activeFx;
}

/* Chip không được cướp con trỏ khỏi ô công thức: chuỗi sự kiện thật là
   mousedown -> blur -> mouseup -> click, và có ô lấy chính việc blur làm cớ dựng
   lại cả khối (drawShared ở màn Thiết lập). Chặn ngay từ mousedown thì không có
   blur, ô đang chọn còn sống, chèn vào đúng chỗ đang nhìn. Bảng gợi ý khi gõ ở
   fx-help.js đã làm đúng như vậy từ đầu. */
function keepFocus(e) { e.preventDefault(); }

/* 'fx.args.IF' -> ['điều_kiện', 'giá_trị_nếu_đúng', 'giá_trị_nếu_sai'] */


/* Ô nhập công thức có kiểm tra cú pháp tại chỗ */
function fxField(value, onChange, placeholder, onBlur) {
  const box = el('div', { class: 'fx-wrap' });
  const ta = el('textarea', { class: 'fx', rows: 2, placeholder: placeholder || '' });
  ta.value = value || '';
  const msg = el('div', { class: 'fxok' });
  function check() {
    const v = ta.value.trim();
    if (!v) { msg.className = 'fxok'; msg.textContent = ''; return; }
    const r = FX.tryCompile(v);
    if (r.ok) {
      msg.className = 'fxok';
      const f = r.fn.info.fields, n = r.fn.info.names;
      msg.textContent = t('fx.valid') + (f.length ? ' ' + t('fx.valid.cols', { cols: f.join(', ') }) : '') + (n.length ? ' ' + t('fx.valid.vars', { vars: n.join(', ') }) : '');
    } else { msg.className = 'fxerr'; msg.textContent = '✕ ' + r.error; }
  }
  /* Ô cao lên theo nội dung: công thức nhiều dòng mà ô cứ hai dòng thì phải
     cuộn trong một khung tí xíu. Có trần để một công thức dài không đẩy hết mọi
     thứ khác ra khỏi màn hình. */
  function grow() {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, 420) + 'px';
  }

  ta.addEventListener('focus', () => { activeFx = box; if (box._onFocus) box._onFocus(); });
  ta.addEventListener('input', () => { onChange(ta.value); check(); grow(); });
  if (onBlur) ta.addEventListener('blur', onBlur);
  check();
  const assist = fxAssist(ta, onChange, check);

  /* Nút in lại cho dễ đọc. Chỉ hiện khi công thức đọc được VÀ in ra khác bản
     đang có — không thì nó là cái nút bấm vào chẳng xảy ra gì. */
  const fmtBtn = el('button', {
    class: 'btn sm dim fxfmt', text: t('fx.format'), title: t('fx.format.title'),
    /* Đừng để mất con trỏ khỏi ô đang soạn, y như chip chèn. */
    onmousedown: keepFocus,
    onclick: function () {
      const out = FX.fxFormat(ta.value);
      if (out === ta.value) return;
      ta.value = out; onChange(out); check(); grow(); syncFmt();
    }
  });
  function syncFmt() {
    const v = ta.value.trim();
    fmtBtn.style.display = (v && FX.fxFormat(ta.value) !== ta.value) ? '' : 'none';
  }
  ta.addEventListener('input', syncFmt);
  syncFmt();

  box.appendChild(ta); box.appendChild(assist);
  box.appendChild(el('div', { class: 'fxfoot' }, [msg, el('div', { class: 'sp' }), fmtBtn]));
  box._insert = function (txt) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + txt + ta.value.slice(e);
    ta.focus(); ta.selectionStart = ta.selectionEnd = s + txt.length;
    onChange(ta.value); check(); grow(); syncFmt();
  };
  /* Chiều cao ban đầu phải tính sau khi đã gắn vào trang mới có scrollHeight. */
  box._grow = grow;
  return box;
}

/* Chip chèn nhanh tên cột / tham số / biến hệ thống */
/* Hộp gợi ý dùng chung cho cả màn hình: dính theo màn hình khi cuộn, tự cuộn
   bên trong khi danh sách dài. Chèn vào ô công thức được bấm gần nhất; chưa bấm
   ô nào thì chèn vào `fallback`. */
function chipsPanel(fallback) {
  /* Dựng đúng hình của danh sách Formula Code: .panel thật, thanh tiêu đề riêng,
     thân cuộn bên dưới. Nhờ tiêu đề nằm NGOÀI vùng cuộn nên không cần
     position:sticky + lề âm như bản trước. Giữ class .chipbox trên nút gốc để
     mọi luật bố cục cũ (dính theo màn hình, .fxlayout, .col-left) còn hiệu lực. */
  const box = el('div', { class: 'panel chipbox' });
  const where = el('span', { class: 'target' });
  const chips = el('div', { class: 'chips' });

  function pick() { return liveFx() || fallback; }
  function refreshTarget() {
    const tgt = pick();
    where.textContent = tgt ? (tgt._label ? t('fx.chips.target', { name: tgt._label }) : t('fx.chips.target.any'))
                            : t('fx.chips.target.none');
  }
  function add(text, title, ins) {
    chips.appendChild(el('span', {
      class: 'chip', text, title: title || '', onmousedown: keepFocus,
      onclick: function () {
        const tgt = pick();
        if (!tgt) { toast(t('fx.chips.no_target'), 'bad'); return; }
        tgt._insert(ins); refreshTarget();
      }
    }));
  }

  box.appendChild(el('header', {}, [
    el('h3', { text: t('fx.chips.title') }), el('div', { class: 'sp' }), where
  ]));
  chips.appendChild(el('span', {
    class: 'chip', style: 'background:var(--ink);color:#fff;border-color:var(--ink)',
    text: t('fx.library.chip'), title: t('fx.library.chip.title'), onmousedown: keepFocus,
    onclick: function () { fxLibrary(pick()); }
  }));
  (S.shared || []).forEach((sh) => {
    if (!sh.code) return;
    add(sh.code, sh.name || t('fx.chips.shared'), sh.code);
  });
  ENGINE.usableCols().forEach((col) => { add('[' + col + ']', '', '[' + col + ']'); });
  (S.params || []).forEach((p) => { if (p.name) add(p.name, t('fx.cat.params'), p.name); });
  SYS_VARS.concat(CAL_FIELDS.map((f) => { return f.varName; }))
    .forEach((v) => { add(v, t('fx.sysvar'), v); });

  box.appendChild(el('div', { class: 'body tight chipbody' }, [chips]));
  refreshTarget();
  box._refreshTarget = refreshTarget;
  return box;
}

function colChips(target) {
  const c = el('div', { class: 'chips' });
  c.appendChild(el('span', {
    class: 'chip', style: 'background:var(--ink);color:#fff;border-color:var(--ink)',
    text: t('fx.library.chip'), title: t('fx.library.chip.title'), onmousedown: keepFocus,
    onclick: function () { fxLibrary(target); }
  }));
  ENGINE.usableCols().forEach((col) => {
    c.appendChild(el('span', { class: 'chip', text: '[' + col + ']', onmousedown: keepFocus, onclick: function () { target._insert('[' + col + ']'); } }));
  });
  (S.params || []).forEach((p) => {
    if (p.name) c.appendChild(el('span', { class: 'chip', text: p.name, onmousedown: keepFocus, onclick: function () { target._insert(p.name); } }));
  });
  SYS_VARS.concat(CAL_FIELDS.map((f) => { return f.varName; }))
    .forEach((v) => {
      c.appendChild(el('span', { class: 'chip', title: t('fx.sysvar'), text: v, onmousedown: keepFocus, onclick: function () { target._insert(v); } }));
    });
  return c;
}

export { fxField, chipsPanel, colChips };
