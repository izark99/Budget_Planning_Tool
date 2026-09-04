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
let _soon = null;       /* hẹn giờ của lần dựng đang chờ */
let _pending = false;   /* có ai đó đã xin dựng lại */
let _busy = false;      /* đang có một cú bấm chuột dở dang */

function setRenderer(fn) { _render = fn; }
function render() {
  _pending = false;
  if (_soon) { clearTimeout(_soon); _soon = null; }
  return _render();
}

/* Vẽ lại SAU KHI cú bấm đang diễn ra kết thúc HẲN.

   LỖI ĐÃ BÁO (hai lần, cùng một gốc):
     · "Nhấn Thêm cột giá trị xong phải click cái nữa mới thêm được."
     · "Gõ xong click ô khác phải click 2 lần con trỏ mới sang."

   Chuỗi sự kiện thật của một cú bấm là mousedown → blur (ô đang gõ mất tiêu
   điểm) → mouseup → click. Bộ nghe `change` của ô nhập nổ ở bước blur; nếu nó
   gọi thẳng render() thì document.body bị xoá sạch NGAY GIỮA cú bấm, mouseup
   rơi vào một cây DOM khác và `click` KHÔNG BAO GIỜ nổ.

   Lần vá trước hoãn đúng một nhịp setTimeout(0). Chưa đủ: một nhịp RƠI ĐƯỢC
   vào khoảng giữa mousedown và mouseup, nên vẫn thua cuộc đua — chỉ là thua ít
   hơn. Nay đợi hẳn cú bấm kết thúc rồi mới dựng: mousedown bật cờ, mouseup hạ
   cờ qua một nhịp (nhịp đó rơi SAU khi `click` đã phát xong, vì click được phát
   đồng bộ ngay sau mouseup trong cùng một lượt). Nghe ở `window` chứ không ở
   `document` để cú bấm thả ra ngoài trang vẫn hạ được cờ. */
function renderSoon() {
  _pending = true;
  if (_busy || _soon) return;
  _soon = setTimeout(flushRender, 0);
}

function flushRender() {
  if (_soon) { clearTimeout(_soon); _soon = null; }
  if (!_pending) return;
  _pending = false;
  _render();
}

window.addEventListener('mousedown', () => { _busy = true; }, true);
window.addEventListener('mouseup', () => {
  setTimeout(() => { _busy = false; flushRender(); }, 0);
}, true);

/* ---------- Giữ con trỏ qua một lần dựng lại ----------
   Chỉ hoãn thôi vẫn chưa đủ: cú bấm đáp đúng ô B, nhưng ngay sau đó render()
   xoá sạch document.body và B biến mất mang theo con trỏ — người dùng lại phải
   bấm lần nữa. Nên trước khi xoá thì ghi nhớ ô đang gõ, dựng xong thì trả con
   trỏ về đúng ô ấy, đúng vị trí ký tự.

   Nhớ theo THỨ TỰ trong danh sách ô nhập chữ, không theo một khoá riêng: lần
   dựng lại do đổi tên giữ nguyên hình dạng form nên thứ tự N vẫn là đúng ô đó.
   Khi hình dạng CÓ đổi (thêm/bớt cột) thì thứ đang được focus là một cái NÚT,
   không phải ô chữ, nên bước khôi phục tự bỏ qua. Chính điều kiện "chỉ ô nhập
   chữ" đó cũng ngăn việc cướp con trỏ khi người dùng bấm tab điều hướng.

   Cùng một ý với listScroll ở views/formula.js, chỉ khác là cho con trỏ. */
const TEXT_TYPES = ['text', 'number', 'password', 'search', 'tel', 'url', 'email'];

/* Ô NHẬP: ô chữ, vùng văn bản, và ô chọn. CỐ Ý không tính nút bấm — bấm một
   nút (thêm cột, hay tab điều hướng) là chuyển việc, trả con trỏ về "cái nút
   thứ N" của màn mới thì vô nghĩa và còn cướp con trỏ của người dùng.

   Lọc bằng JS chứ không bằng bộ chọn CSS: <input> không ghi type vẫn là ô chữ,
   mà input[type=text] thì không khớp nó.
   @param {any} n */
function isField(n) {
  if (!n || !n.tagName) return false;
  if (n.tagName === 'TEXTAREA' || n.tagName === 'SELECT') return true;
  if (n.tagName !== 'INPUT') return false;
  return TEXT_TYPES.indexOf((n.getAttribute('type') || 'text').toLowerCase()) >= 0;
}

function fields() {
  return [...document.querySelectorAll('input, textarea, select')].filter(isField);
}

/** Chạy fn (thường là dựng lại cả trang) mà giữ nguyên ô đang gõ và vị trí con trỏ.
    @param {() => void} fn */
function keepCaret(fn) {
  const a = /** @type {any} */ (document.activeElement);
  let mark = null;
  if (isField(a)) {
    const at = fields().indexOf(a);
    if (at >= 0) {
      let from = null, to = null;
      /* Ô chọn và ô type=number không có vùng chọn — không có thì thôi, vẫn
         focus lại được. */
      try { from = a.selectionStart; to = a.selectionEnd; } catch { /* bỏ qua */ }
      mark = { at, from, to };
    }
  }
  fn();
  if (!mark) return;
  const back = /** @type {any} */ (fields()[mark.at]);
  if (!isField(back)) return;
  /* preventScroll: ô này vốn đang trong tầm nhìn, đừng để focus() giật trang. */
  back.focus({ preventScroll: true });
  if (mark.from == null) return;
  try { back.setSelectionRange(mark.from, mark.to); } catch { /* bỏ qua */ }
}

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
/* Lớp phủ báo tiến trình. Không dùng được toast (chỉ một chỗ, tự xoá sau 3 giây)
   cũng không dùng được modal (bấm ra ngoài hay Escape là đóng, mà đang tính thì
   không cho đóng). Trả về { set, close } — nơi gọi PHẢI đóng trước khi render()
   dựng lại trang, vì lớp phủ là con trực tiếp của body. */
function progressBox(title) {
  const bar = el('i');
  const pct = el('span', { class: 'pct', text: '0%' });
  const step = el('div', { class: 'step' });
  const mask = el('div', { class: 'mask progmask' }, [
    el('div', { class: 'progbox' }, [
      el('h3', { text: title }),
      el('div', { class: 'progbar' }, [bar]),
      el('div', { class: 'progfoot' }, [step, el('div', { class: 'sp' }), pct])
    ])
  ]);
  document.body.appendChild(mask);
  return {
    set(p, label) {
      bar.style.width = Math.max(0, Math.min(100, p)) + '%';
      pct.textContent = Math.round(p) + '%';
      if (label != null) step.textContent = label;
    },
    close() { mask.remove(); }
  };
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

export { el, esc, toast, modal, progressBox, confirmBox, ribbon, keepCaret, render, renderSoon, setRenderer };
