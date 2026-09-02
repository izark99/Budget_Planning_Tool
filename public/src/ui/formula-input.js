/* ===========================================================
   FORMULA-INPUT — ô nhập công thức và hộp gợi ý chèn cột.

   fxField    ô <textarea> có kiểm cú pháp tại chỗ + gợi ý khi gõ
   chipsPanel hộp gợi ý dùng chung: dính theo màn hình, cuộn nội bộ, và tự
              chèn vào ô công thức ĐANG được chọn (activeFx)
   colChips   dải chip cột cho một ô cụ thể

   Dựng trên fx-help.js (fxAssist, fxLibrary); fx-help.js không biết gì về nơi
   này — một chiều, không vòng.
   =========================================================== */
import { CAL_FIELDS, S } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { FX } from '../core/expression.js';
import { el, toast } from './dom.js';
import { fxAssist, fxLibrary } from './fx-help.js';

/* Ô công thức đang được chọn — hộp gợi ý chèn vào đúng ô này. */
let activeFx = null;

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
  ta.addEventListener('focus', () => { activeFx = box; if (box._onFocus) box._onFocus(); });
  ta.addEventListener('input', () => { onChange(ta.value); check(); });
  if (onBlur) ta.addEventListener('blur', onBlur);
  check();
  const assist = fxAssist(ta, onChange, check);
  box.appendChild(ta); box.appendChild(assist); box.appendChild(msg);
  box._insert = function (txt) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + txt + ta.value.slice(e);
    ta.focus(); ta.selectionStart = ta.selectionEnd = s + txt.length;
    onChange(ta.value); check();
  };
  return box;
}

/* Chip chèn nhanh tên cột / tham số / biến hệ thống */
/* Hộp gợi ý dùng chung cho cả màn hình: dính theo màn hình khi cuộn, tự cuộn
   bên trong khi danh sách dài. Chèn vào ô công thức được bấm gần nhất; chưa bấm
   ô nào thì chèn vào `fallback`. */
function chipsPanel(fallback) {
  const box = el('div', { class: 'chipbox' });
  const where = el('span', { class: 'target' });
  const chips = el('div', { class: 'chips' });

  function pick() { return activeFx || fallback; }
  function refreshTarget() {
    const tgt = pick();
    where.textContent = tgt ? (tgt._label ? t('fx.chips.target', { name: tgt._label }) : t('fx.chips.target.any'))
                            : t('fx.chips.target.none');
  }
  function add(text, title, ins) {
    chips.appendChild(el('span', {
      class: 'chip', text, title: title || '',
      onclick: function () {
        const tgt = pick();
        if (!tgt) { toast(t('fx.chips.no_target'), 'bad'); return; }
        tgt._insert(ins); refreshTarget();
      }
    }));
  }

  box.appendChild(el('h4', { text: t('fx.chips.title') }));
  box.appendChild(where);
  chips.appendChild(el('span', {
    class: 'chip', style: 'background:var(--ink);color:#fff;border-color:var(--ink)',
    text: t('fx.library.chip'), title: t('fx.library.chip.title'),
    onclick: function () { fxLibrary(pick()); }
  }));
  (S.shared || []).forEach((sh) => {
    if (!sh.code) return;
    add(sh.code, sh.name || t('fx.chips.shared'), sh.code);
  });
  ENGINE.usableCols().forEach((col) => { add('[' + col + ']', '', '[' + col + ']'); });
  (S.params || []).forEach((p) => { if (p.name) add(p.name, t('fx.cat.params'), p.name); });
  ['THANG', 'DINH_BIEN', 'SO_THANG'].concat(CAL_FIELDS.map((f) => { return f.varName; }))
    .forEach((v) => { add(v, t('fx.sysvar'), v); });

  box.appendChild(chips);
  refreshTarget();
  box._refreshTarget = refreshTarget;
  return box;
}

function colChips(target) {
  const c = el('div', { class: 'chips' });
  c.appendChild(el('span', {
    class: 'chip', style: 'background:var(--ink);color:#fff;border-color:var(--ink)',
    text: t('fx.library.chip'), title: t('fx.library.chip.title'),
    onclick: function () { fxLibrary(target); }
  }));
  ENGINE.usableCols().forEach((col) => {
    c.appendChild(el('span', { class: 'chip', text: '[' + col + ']', onclick: function () { target._insert('[' + col + ']'); } }));
  });
  (S.params || []).forEach((p) => {
    if (p.name) c.appendChild(el('span', { class: 'chip', text: p.name, onclick: function () { target._insert(p.name); } }));
  });
  ['THANG', 'DINH_BIEN', 'SO_THANG'].concat(CAL_FIELDS.map((f) => { return f.varName; }))
    .forEach((v) => {
      c.appendChild(el('span', { class: 'chip', title: t('fx.sysvar'), text: v, onclick: function () { target._insert(v); } }));
    });
  return c;
}

export { fxField, chipsPanel, colChips };
