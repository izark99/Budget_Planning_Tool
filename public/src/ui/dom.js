/* ===========================================================
   DOM — những viên gạch nhỏ nhất của giao diện: el/esc, toast, modal,
   confirmBox, dải 12 tháng, và cái móc vẽ lại khung app.

   Không biết gì về bảng, về Excel, về màn hình nào cả. Mọi thứ khác trong ui/
   dựng trên đây; đây không dựng trên gì trong ui/.
   =========================================================== */
import { M, MONTHS } from '../core/state.js';
import { t } from '../core/content.js';

/* Vẽ lại toàn bộ khung app. Thân thật do app.js cung cấp qua setRenderer();
   nhờ vậy các màn hình gọi render() mà không cần import ngược lên app.js —
   đồ thị phụ thuộc giữ được một chiều, không có vòng. */
let _render = function () { };
function setRenderer(fn) { _render = fn; }
function render() { return _render(); }

/* ---------- DOM ---------- */
function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] === true) e.setAttribute(k, '');
    else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach((c) => { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

let toastT = null;
function toast(msg, kind) {
  const old = document.querySelector('.toast'); if (old) old.remove();
  const t = el('div', { class: 'toast ' + (kind || ''), text: msg });
  document.body.appendChild(t);
  clearTimeout(toastT); toastT = setTimeout(() => { t.remove(); }, kind === 'bad' ? 6000 : 3200);
}
function modal(title, bodyNode, buttons) {
  const mask = el('div', { class: 'mask', onclick: function (e) { if (e.target === mask) close(); } });
  function close() { mask.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  const foot = el('footer', {}, (buttons || [{ label: t('btn.close') }]).map((b) => {
    return el('button', { class: 'btn ' + (b.cls || ''), text: b.label, onclick: function () { if (!b.onclick || b.onclick(close) !== false) close(); } });
  }));
  mask.appendChild(el('div', { class: 'modal' }, [el('header', {}, [el('h3', { text: title })]), el('div', { class: 'body' }, [bodyNode]), foot]));
  document.body.appendChild(mask); return close;
}
function confirmBox(msg, onYes) {
  modal(t('modal.confirm.title'), el('p', { text: msg, style: 'margin:0' }), [{ label: t('btn.cancel') }, { label: t('btn.agree'), cls: 'pri', onclick: onYes }]);
}

/* ---------- Dải 12 tháng ----------
   mode 'list'  : active là mảng số tháng [1,4,7]
   mode 'factor': active là mảng 12 hệ số [0,0,0,1,...]           */
function ribbon(active, opts) {
  opts = opts || {};
  const factor = opts.factor;
  const r = el('span', { class: 'ribbon' + (opts.pick ? ' pick' : '') + (opts.lg ? ' lg' : '') });
  for (let m = 1; m <= M; m++) {
    (function (m) {
      const val = factor ? (active ? active[m - 1] : 0) : null;
      const on = factor ? !!val : (active || []).indexOf(m) >= 0;
      const cls = on ? (factor && val > 0 && val < 1 ? 'half' : 'on') : '';
      const i = el('i', {
        class: cls, title: MONTHS[m - 1] + (factor ? ': ' + (val || 0) : ''),
        text: (opts.pick || opts.lg) ? String(m) : ''
      });
      if (opts.pick) i.addEventListener('click', () => { opts.pick(m, !on); });
      r.appendChild(i);
    })(m);
  }
  return r;
}

export { el, esc, toast, modal, confirmBox, ribbon, render, setRenderer };
