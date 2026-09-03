/* ===========================================================
   WIDGETS — thành phần lớn dựng từ dom.js: bảng dữ liệu sửa tại chỗ, panel,
   panel gập, tải file mẫu .xlsx và trình nhập Excel ghép cột theo tên header.

   Vẫn KHÔNG biết màn hình nào cả — nó chỉ nhận cấu hình và trả về DOM.
   =========================================================== */
import { S, uid, nkey, numOf, fmtNum, touch } from '../core/state.js';
import { t } from '../core/content.js';
import { pickFile, readWorkbook, sheetAoa, dedupeHeaders } from '../platform/io.js';
import { confirmBox, el, modal, toast } from './dom.js';

/* SheetJS/XLTABLE nạp bằng thẻ <script> nên nằm trên window, không import được. */
const XLTABLE = window.XLTABLE;

/* ---------- Kéo thả sắp xếp dùng chung ----------
   Bấm ↑ ↓ từng nấc quá chậm khi danh sách dài. Dùng DnD gốc của HTML5 — cùng
   API mà ô thả file ở màn Định biên đã dùng, không thêm khái niệm mới.

   commit(kéo, đích, trước) nhận PHẦN TỬ chứ không nhận chỉ số: khi bảng đang
   lọc hoặc đang ở trang 2, chỉ số của DOM KHÔNG phải chỉ số của mảng gốc. Nơi
   gọi tự indexOf trong mảng thật — đúng mẹo mà nút xoá của dataTable đã dùng. */
/* Chọn nhiều dòng: Ctrl+bấm nhặt từng dòng, Shift+bấm lấy cả dải tính từ mốc
   neo. Giữ theo DANH TÍNH phần tử chứ không theo chỉ số — bảng dựng lại tbody
   mỗi lần gõ ô lọc và mỗi lần đổi trang, chỉ số không sống nổi qua đó. */
function selection() {
  let picked = [];        /* mảng chứ không phải Set: cần biết thứ tự để kéo khối */
  let anchor = null;

  const has = (it) => { return picked.indexOf(it) >= 0; };

  return {
    has, items() { return picked.slice(); },
    size() { return picked.length; },
    clear() { picked = []; anchor = null; },
    /** Trả về true nếu đã xử lý như một cú bấm CHỌN (gọi nơi dùng vẽ lại). */
    click(e, item, visible) {
      if (e.shiftKey && anchor != null && visible.indexOf(anchor) >= 0) {
        const a = visible.indexOf(anchor), b = visible.indexOf(item);
        if (b >= 0) {
          const lo = Math.min(a, b), hi = Math.max(a, b);
          picked = visible.slice(lo, hi + 1);
          return true;
        }
      }
      if (e.ctrlKey || e.metaKey) {
        picked = has(item) ? picked.filter((x) => { return x !== item; }) : picked.concat([item]);
        anchor = item;
        return true;
      }
      return false;
    },
    /* Kéo một dòng ĐANG được chọn thì kéo cả khối; kéo dòng ngoài thì bỏ chọn. */
    forDrag(item) {
      if (!has(item)) { picked = []; anchor = null; return [item]; }
      return picked.slice();
    }
  };
}

/* commit(danh sách kéo, đích, trước/sau) — LUÔN nhận một mảng phần tử, kể cả khi
   chỉ kéo một dòng. Nhận phần tử chứ không nhận chỉ số: khi bảng đang lọc hoặc
   đang ở trang 2, chỉ số của DOM KHÔNG phải chỉ số của mảng gốc. */
function dragList(commit, sel) {
  let dragged = null;     /* mảng phần tử đang kéo */
  const lit = [];         /* mọi hàng đang sáng, để dragend gỡ hết */

  function clear(node) { node.classList.remove('drop-before', 'drop-after'); }
  function unlit() { while (lit.length) lit.pop().classList.remove('dragging'); }

  return {
    /** node = hàng; item = phần tử dữ liệu nó đại diện; grip = nơi bấm để kéo. */
    attach(node, item, grip) {
      (grip || node).setAttribute('draggable', 'true');
      node._dragItem = item;
      node.addEventListener('dragstart', (e) => {
        dragged = sel ? sel.forDrag(item) : [item];
        /* Firefox không phát dragover nếu dataTransfer trống. */
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); }
        /* Làm mờ MỌI hàng đang kéo, không riêng hàng khởi kéo. */
        const box = node.parentElement || node;
        [...box.children].forEach((ch) => {
          if (dragged.indexOf(ch._dragItem) >= 0) { ch.classList.add('dragging'); lit.push(ch); }
        });
      });
      node.addEventListener('dragend', () => { dragged = null; unlit(); clear(node); });
      node.addEventListener('dragover', (e) => {
        if (!dragged || dragged.indexOf(item) >= 0) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        /* Trên hay dưới đường giữa hàng quyết định thả trước hay sau. */
        const b = node.getBoundingClientRect();
        clear(node);
        node.classList.add(e.clientY < b.top + b.height / 2 ? 'drop-before' : 'drop-after');
      });
      node.addEventListener('dragleave', () => { clear(node); });
      node.addEventListener('drop', (e) => {
        e.preventDefault();
        const before = node.classList.contains('drop-before');
        clear(node);
        if (!dragged || dragged.indexOf(item) >= 0) return;
        const from = dragged; dragged = null; unlit();
        commit(from, item, before);
      });
    }
  };
}

/** Chuyển cả KHỐI `items` tới cạnh `to` trong chính mảng `arr`, giữ nguyên thứ
    tự tương đối trong khối. Trả về false nếu không đổi gì — nơi gọi khỏi phải vẽ
    lại và khỏi bỏ kết quả đã tính vô ích. */
function moveBeside(arr, items, to, before) {
  const block = (Array.isArray(items) ? items : [items])
    .filter((x) => { return arr.indexOf(x) >= 0; });
  /* Thả lên chính một dòng đang kéo thì không có nghĩa gì. dragList đã chặn từ
     dragover, chặn thêm ở đây để hàm này tự nó có một giao kèo rõ ràng. */
  if (!block.length || block.indexOf(to) >= 0) return false;
  /* Sắp theo đúng thứ tự ĐANG CÓ trong mảng gốc, không theo thứ tự người dùng bấm. */
  block.sort((a, b) => { return arr.indexOf(a) - arr.indexOf(b); });
  const was = arr.slice();
  block.forEach((x) => { arr.splice(arr.indexOf(x), 1); });
  let j = arr.indexOf(to);
  if (j < 0) { was.forEach((x, i) => { arr[i] = x; }); arr.length = was.length; return false; }
  if (!before) j++;
  arr.splice.apply(arr, [j, 0].concat(block));
  /* Không đổi gì thì nói không đổi gì. */
  return arr.some((x, i) => { return x !== was[i]; });
}

/* Sắp mảng theo thứ tự một danh sách khoá cho trước, ỔN ĐỊNH: khoá không có
   trong danh sách xuống cuối và giữ nguyên thứ tự tương đối giữa chúng. Không
   vứt dòng nào — bảng ánh xạ mất một dòng là mất một dòng ngân sách. */
function sortByKeys(arr, keys, keyOf) {
  const rank = {};
  keys.forEach((k, i) => { if (rank[k] === undefined) rank[k] = i; });
  const at = arr.map((r, i) => { return { r, i, k: rank[keyOf(r)] }; });
  at.sort((a, b) => {
    const ka = a.k === undefined ? keys.length : a.k, kb = b.k === undefined ? keys.length : b.k;
    return ka - kb || a.i - b.i;
  });
  at.forEach((x, i) => { arr[i] = x.r; });
  return arr;
}

/* ---------- Thanh phân trang dùng chung ----------
   Mọi bảng dài trong app đi qua đây, nên cỡ trang chọn một lần là áp cho tất cả
   và sống qua lần mở sau (lưu ở S.ui.pageSize).

   apply(list) trả về lát cắt của trang hiện tại và tự cập nhật nhãn + nút. Nó
   cũng KẸP số trang khi danh sách co lại (xoá dòng, lọc bớt) để không bao giờ
   đứng ở một trang trống. */
const PAGE_SIZES = [25, 50, 100, 200, 500];

function pageSize() {
  const v = parseInt(String(S.ui.pageSize), 10);
  if (v === 0) return 0;                     /* 0 = xem tất cả */
  return isNaN(v) || v < 0 ? 100 : v;
}

function pager(onChange) {
  let page = 0;
  const info = el('span', { class: 'muted' });
  const prev = el('button', { class: 'btn sm', text: t('table.page.prev') });
  const next = el('button', { class: 'btn sm', text: t('table.page.next') });
  const sel = el('select', {
    style: 'width:auto',
    onchange: function (e) {
      S.ui.pageSize = parseInt(e.target.value, 10);
      page = 0; touch(); onChange && onChange();
    }
  }, PAGE_SIZES.map((n) => {
    return el('option', { value: String(n), selected: pageSize() === n, text: String(n) });
  }).concat([el('option', { value: '0', selected: pageSize() === 0, text: t('table.page.all') })]));

  prev.addEventListener('click', () => { if (page > 0) { page--; onChange && onChange(); } });
  next.addEventListener('click', () => { page++; onChange && onChange(); });

  const node = el('div', { class: 'pager' }, [
    el('span', { class: 'muted', text: t('table.page.size') }), sel, prev, next, info,
  ]);

  return {
    node,
    apply(list) {
      const size = pageSize();
      if (!size) {
        page = 0;
        /* Chế độ "Tất cả" chỉ có một trang, nhưng vẫn phải hiện thanh khi danh
           sách dài: ô CHỌN CỠ TRANG nằm trong chính thanh này, ẩn đi là khoá
           luôn đường quay lại chế độ chia trang. */
        node.style.display = list.length > PAGE_SIZES[0] ? '' : 'none';
        info.textContent = t('table.page.info', { from: list.length ? 1 : 0, to: list.length, n: list.length });
        prev.disabled = next.disabled = true;
        return list;
      }
      const pages = Math.max(1, Math.ceil(list.length / size));
      if (page > pages - 1) page = pages - 1;    /* danh sách co lại: kẹp về trang cuối */
      if (page < 0) page = 0;
      const from = page * size;
      const slice = list.slice(from, from + size);
      /* Ẩn/hiện theo SỐ TRANG chứ không so với hằng PAGE_SIZES[0]: cỡ trang 100
         mà có 30 dòng thì chỉ một trang, thanh điều hướng chẳng để làm gì. */
      node.style.display = pages > 1 ? '' : 'none';
      info.textContent = t('table.page.info', { from: list.length ? from + 1 : 0, to: from + slice.length, n: list.length });
      prev.disabled = page === 0;
      next.disabled = page >= pages - 1;
      return slice;
    },
    reset() { page = 0; },
  };
}

/* ---------- Trần sinh combo ----------
   "Sinh sẵn từ định biên" dựng một dòng cho MỖI tổ hợp giá trị phân biệt của các
   cột khoá. Một cột khoá thì ít; từ hai cột trở lên tích chéo bung rất nhanh.
   Trước đây mã cắt cứng ở 800 dòng và KHÔNG BÁO GÌ — người dùng thấy "xxx dòng
   định biên chưa khớp" mà không hiểu vì sao. Nay trần do người dùng đặt, để
   trống hoặc 0 nghĩa là KHÔNG GIỚI HẠN, và chạm trần thì có cảnh báo. */
function comboLimit() {
  const v = parseInt(String(S.ui.comboLimit), 10);
  return isNaN(v) || v <= 0 ? 0 : v;
}

function comboLimitBox(onChange) {
  return el('label', { class: 'lim', title: t('table.comboLimit.hint') }, [
    el('span', { text: t('table.comboLimit') }),
    el('input', {
      type: 'number', min: 0, step: 100, style: 'width:86px',
      placeholder: t('table.comboLimit.none'),
      value: comboLimit() || '',
      onchange: function (e) {
        const v = parseInt(e.target.value, 10);
        S.ui.comboLimit = isNaN(v) || v <= 0 ? 0 : v;
        e.target.value = S.ui.comboLimit || '';
        touch();
        onChange && onChange();
      }
    })
  ]);
}

/* ---------- Tải .xlsx (Excel Table đặt tên) ----------
   Hai lối ra dùng chung một ruột, chỉ khác ý nghĩa với người dùng:

     downloadTemplate  MẪU TRỐNG — cấu trúc cột + vài dòng ví dụ, để bắt đầu từ số 0
     downloadData      DỮ LIỆU THẬT — đang có gì xuất nấy, để sửa ngoài Excel rồi nạp lại

   Điều làm vòng "xuất → sửa → nhập" khép kín là CẢ HAI dùng chung đúng một bộ
   tiêu đề cột với trình nhập. Đổi tiêu đề ở một bên là hỏng chức năng nhập. */
function writeSheet(spec, tail, okMsg) {
  try {
    XLTABLE.download({
      tableName: spec.tableName, sheetName: spec.sheetName || 'DuLieu',
      headers: spec.headers, rows: spec.rows || [],
      guide: [[t('template.guide.title', { title: spec.title || spec.tableName })]].concat(
        (spec.guide || []).map((g) => { return [g]; })
      ).concat(tail.map((x) => { return [x]; }))
    }, spec.file || (spec.tableName + '.xlsx'));
    toast(okMsg, 'good');
  } catch (e) { toast(t('toast.template.fail', { e: e.message }), 'bad'); }
}

function downloadTemplate(spec) {
  writeSheet(spec, [
    '', t('template.guide.tableName', { name: XLTABLE.safeName(spec.tableName) }),
    t('template.guide.append'),
  ], t('toast.template.ok'));
}

/** Xuất dữ liệu đang có. Không dòng nào thì báo chứ đừng tải về một file rỗng. */
function downloadData(spec) {
  const rows = spec.rows || [];
  if (!rows.length) { toast(t('toast.export.empty'), 'warn'); return; }
  writeSheet(spec, [
    '', t('template.guide.exported', { n: rows.length }),
    t('template.guide.append'),
  ], t('toast.export.ok', { n: rows.length }));
}

/* ---------- Import chung: ghép cột theo tên header ----------
   fields: [{k, label, required, guess:[...]}]                   */
function importMapped(file, title, fields, onDone) {
  readWorkbook(file, (err, wb) => {
    if (err) { toast(t('io.err.read'), 'bad'); return; }
    const sheetName = wb.SheetNames[0];
    const st = { sheet: sheetName, map: {} };
    const box = el('div');

    function build() {
      const aoa = sheetAoa(wb, st.sheet);
      const headers = dedupeHeaders(aoa[0] || []);
      fields.forEach((f) => {
        if (st.map[f.k] !== undefined) return;
        const g = (f.guess || []).concat([f.label]);
        st.map[f.k] = -1;
        for (let i = 0; i < headers.length; i++) {
          if (g.some((x) => { return String(x).toLowerCase().trim() === headers[i].toLowerCase().trim(); })) { st.map[f.k] = i; break; }
        }
      });
      box.innerHTML = '';
      box.appendChild(el('div', { class: 'row', style: 'margin-bottom:10px' }, [
        el('div', { style: 'flex:1' }, [el('label', { class: 'f', text: t('import.sheet') }),
        el('select', { onchange: function (e) { st.sheet = e.target.value; st.map = {}; build(); } },
          wb.SheetNames.map((s) => { return el('option', { value: s, selected: s === st.sheet, text: s }); }))]),
        el('div', { style: 'align-self:flex-end;color:var(--soft);font-size:12.5px' }, [document.createTextNode(t('import.rowCount', { n: aoa.length - 1 }))])
      ]));
      box.appendChild(el('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr' }, fields.map((f) => {
        return el('div', {}, [
          el('label', { class: 'f', text: f.label + (f.required ? ' *' : '') }),
          el('select', { onchange: function (e) { st.map[f.k] = +e.target.value; } },
            [el('option', { value: -1, text: t('import.noColumn') })].concat(headers.map((h, i) => {
              return el('option', { value: i, selected: st.map[f.k] === i, text: h });
            })))
        ]);
      })));
      box._data = function () { return { aoa, headers }; };
    }
    build();

    modal(title + ' — ' + file.name, box, [
      { label: t('btn.cancel') },
      {
        label: t('btn.import'), cls: 'pri', onclick: function () {
          const d = box._data();
          const miss = fields.filter((f) => { return f.required && st.map[f.k] < 0; });
          if (miss.length) { toast(t('import.err.missingCols', { cols: miss.map((f) => { return f.label; }).join(', ') }), 'bad'); return false; }
          const out = [];
          for (let i = 1; i < d.aoa.length; i++) {
            const r = d.aoa[i];
            if (!r || r.every((x) => { return x === '' || x == null; })) continue;
            const o = {};
            fields.forEach((f) => { o[f.k] = st.map[f.k] >= 0 ? r[st.map[f.k]] : ''; });
            out.push(o);
          }
          onDone(out);
        }
      }
    ]);
  });
}

function dataTable(cfg) {
  const wrap = el('div');
  const tb = el('tbody');
  const info = el('span', { class: 'tag' });

  /* Trên 25 lựa chọn thì dùng input + datalist dùng chung, thay vì mỗi ô dựng lại
     cả danh sách option — đó là chỗ làm treo màn hình khi có vài trăm Cost Center. */
  const DL_MAX = 25;
  const tid = uid();
  const dlBox = el('div');
  let optCache = {};

  function optionsOf(col) {
    if (optCache[col.k]) return optCache[col.k];
    const raw = (typeof col.options === 'function' ? col.options() : col.options) || [];
    optCache[col.k] = raw.map((o) => {
      return typeof o === 'string' ? { v: o, t: o } : { v: o.v, t: o.t };
    });
    return optCache[col.k];
  }
  let dlSig = '';
  function buildDatalists() {
    const sig = cfg.columns.map((col) => {
      if (col.type !== 'select') return '';
      const o = optionsOf(col);
      return col.k + ':' + o.length + ':' + (o[0] ? o[0].v : '') + ':' + (o[o.length - 1] ? o[o.length - 1].v : '');
    }).join('|');
    if (sig === dlSig && dlBox.childNodes.length) return;
    dlSig = sig;
    dlBox.innerHTML = '';
    cfg.columns.forEach((col) => {
      if (col.type !== 'select') return;
      const opts = optionsOf(col);
      if (opts.length <= DL_MAX) return;
      dlBox.appendChild(el('datalist', { id: 'dl_' + tid + '_' + col.k }, opts.map((o) => {
        return el('option', { value: o.v, label: o.t !== o.v ? o.t : null });
      })));
    });
  }

  function cell(row, col) {
    if (col.type === 'select') {
      const opts = optionsOf(col);
      if (opts.length <= DL_MAX) {
        return el('select', {
          onchange: function (e) { row[col.k] = e.target.value; cfg.onChange && cfg.onChange(); }
        }, [el('option', { value: '', text: '—' })].concat(opts.map((o) => {
          return el('option', { value: o.v, selected: String(row[col.k]) === String(o.v), text: o.t });
        })));
      }
      const known = {};
      opts.forEach((o) => { known[nkey(o.v)] = 1; });
      const inp = el('input', {
        type: 'text', class: 'fx', list: 'dl_' + tid + '_' + col.k,
        value: row[col.k] == null ? '' : row[col.k],
        oninput: function (e) {
          row[col.k] = e.target.value;
          e.target.style.borderColor = (e.target.value && !known[nkey(e.target.value)]) ? 'var(--ochre)' : '';
          cfg.onChange && cfg.onChange();
        }
      });
      if (row[col.k] && !known[nkey(row[col.k])]) inp.style.borderColor = 'var(--ochre)';
      return inp;
    }
    if (col.type === 'num') {
      const ni = el('input', { type: 'text', class: 'fx', style: 'text-align:right' });
      const raw = function () { return (row[col.k] === '' || row[col.k] == null) ? '' : String(row[col.k]); };
      ni.value = fmtNum(row[col.k]);
      ni.addEventListener('focus', () => { ni.value = raw(); ni.select(); });
      ni.addEventListener('blur', () => { ni.value = fmtNum(row[col.k]); });
      ni.addEventListener('input', () => {
        row[col.k] = ni.value.trim() === '' ? '' : numOf(ni.value);
        cfg.onChange && cfg.onChange();
      });
      return ni;
    }
    return el('input', {
      type: 'text',
      value: row[col.k] == null ? '' : row[col.k],
      oninput: function (e) { row[col.k] = e.target.value; cfg.onChange && cfg.onChange(); }
    });
  }

  let filter = '';
  let shownNow = [];
  const pg = pager(() => { draw(); });
  /* Kéo thả sắp xếp, chỉ khi bảng bật cfg.reorder. commit nhận PHẦN TỬ nên
     moveBeside tự indexOf trong mảng gốc — nhờ vậy đang lọc hay đang ở trang 2
     vẫn thả đúng chỗ, chỉ số DOM không dính dáng gì. */
  /* Khoá nhận dạng một dòng: ghép các cột đánh dấu key — đúng khoá mà nút Sinh
     sẵn dùng để khử trùng, nên cfg.orderKeys() chỉ việc trả về cùng dạng chuỗi. */
  const keyOfRow = (r) => {
    return cfg.columns.filter((c) => { return c.key; }).map((c) => { return nkey(r[c.k]); }).join('|');
  };
  const sel = cfg.reorder ? selection() : null;
  const drag = cfg.reorder ? dragList((items, to, before) => {
    if (moveBeside(cfg.rows(), items, to, before)) { sel.clear(); cfg.onChange && cfg.onChange(); draw(); }
  }, sel) : null;
  function draw() {
    optCache = {}; buildDatalists();
    tb.innerHTML = '';
    const rows = cfg.rows();
    const kw = filter.trim().toLowerCase();
    const keys = cfg.columns.map((c) => { return c.k; });
    const frag = document.createDocumentFragment();
    /* Lọc TRƯỚC, phân trang SAU — số trang phải tính trên kết quả lọc. */
    const matchedRows = !kw ? rows : rows.filter((row) => {
      for (let q = 0; q < keys.length; q++) {
        if (String(row[keys[q]] == null ? '' : row[keys[q]]).toLowerCase().indexOf(kw) >= 0) return true;
      }
      return false;
    });
    const matched = matchedRows.length;
    const shownRows = pg.apply(matchedRows);
    /* Shift+bấm lấy dải trong danh sách ĐANG HIỆN (đã lọc, đúng trang). */
    shownNow = shownRows;
    for (let i = 0; i < shownRows.length; i++) {
      const row = shownRows[i];
      (function (row) {
        const grip = drag ? el('td', { class: 'grip', style: 'width:24px', title: t('table.dragMulti'), text: '⠿' }) : null;
        const tds = (grip ? [grip] : []).concat(cfg.columns.map((col) => {
          return el('td', { style: col.w ? 'width:' + col.w + 'px' : '' }, [cell(row, col)]);
        }));
        tds.push(el('td', { style: 'width:32px' }, [el('button', {
          class: 'btn sm del', text: '✕',
          onclick: function () {
            const all = cfg.rows(), j = all.indexOf(row);
            if (j >= 0) all.splice(j, 1);
            cfg.onChange && cfg.onChange(); draw();
          }
        })]));
        const tr = el('tr', { class: sel && sel.has(row) ? 'picked' : '' }, tds);
        if (drag) {
          drag.attach(tr, row, grip);
          /* Ctrl/Shift+bấm để chọn nhiều dòng rồi kéo một lượt.
             Bảng này gần như toàn ô nhập, bấm chỗ nào cũng rơi vào một ô — nên
             CHÍNH Ô TAY NẮM là chỗ chọn. Nó cũng là chỗ để kéo, nên hai việc
             nằm cùng một nơi. Phần còn lại của hàng vẫn nhận nếu bấm trúng chỗ
             trống, còn bấm vào ô nhập thì thôi: người ta đang sửa dữ liệu. */
          const pick = (e) => {
            if (sel.click(e, row, shownNow)) { e.preventDefault(); draw(); }
          };
          grip.addEventListener('click', pick);
          tr.addEventListener('click', (e) => {
            if (e.target.closest('input, select, textarea, button, td.grip')) return;
            pick(e);
          });
        }
        frag.appendChild(tr);
      })(row);
    }
    tb.appendChild(frag);
    const span = cfg.columns.length + (drag ? 2 : 1);
    if (!rows.length) tb.appendChild(el('tr', {}, [el('td', { colspan: span, class: 'empty', text: cfg.emptyText || t('table.empty') })]));
    else if (!matched) tb.appendChild(el('tr', {}, [el('td', { colspan: span, class: 'empty', text: t('table.noMatch', { kw: filter }) })]));
    info.textContent = t('table.info.rows', { n: rows.length }) + (kw ? ' ' + t('table.info.matched', { n: matched }) : '')
      + (sel && sel.size() ? ' · ' + t('table.info.picked', { n: sel.size() }) : '');
  }
  const search = el('input', {
    type: 'text', placeholder: t('table.filter.placeholder'), style: 'width:130px',
    oninput: function (e) { filter = e.target.value; pg.reset(); draw(); }
  });

  function template() {
    const pre = cfg.prefill ? cfg.prefill() : [];
    downloadTemplate({
      tableName: cfg.tableName, title: cfg.title,
      sheetName: (cfg.sheetName || 'DuLieu'),
      headers: cfg.columns.map((c) => { return c.label; }),
      rows: pre.map((r) => { return cfg.columns.map((c) => { return r[c.k] == null ? '' : r[c.k]; }); }),
      guide: cfg.guide || [],
      file: cfg.tableName + '.xlsx'
    });
  }

  /* Xuất TOÀN BỘ dòng, không lọc theo ô tìm kiếm: người dùng xuất ra là để sửa
     trọn bảng ngoài Excel rồi nạp đè lại. Cột lấy đúng cfg.columns mà doImport()
     dùng để khớp — nhờ vậy nạp lại không lệch cột nào. */
  function exportRows() {
    downloadData({
      tableName: cfg.tableName, title: cfg.title,
      sheetName: (cfg.sheetName || 'DuLieu'),
      headers: cfg.columns.map((c) => { return c.label; }),
      rows: cfg.rows().map((r) => { return cfg.columns.map((c) => { return r[c.k] == null ? '' : r[c.k]; }); }),
      file: 'xuat-' + cfg.tableName + '.xlsx'
    });
  }

  function doImport(file) {
    importMapped(file, cfg.title || t('btn.import'),
      cfg.columns.map((c) => { return { k: c.k, label: c.label, required: !!c.required }; }),
      (out) => {
        const rows = cfg.rows();
        if (cfg.replaceOnImport !== false) rows.length = 0;
        out.forEach((o) => {
          const r = cfg.blank ? cfg.blank() : {};
          cfg.columns.forEach((c) => { r[c.k] = c.type === 'num' ? numOf(o[c.k]) : (o[c.k] == null ? '' : String(o[c.k]).trim()); });
          rows.push(r);
        });
        cfg.onChange && cfg.onChange(); draw();
        cfg.onImported && cfg.onImported();
        toast(t('toast.import.rows', { n: out.length }), 'good');
      });
  }

  function clearAll() {
    const rows = cfg.rows();
    if (!rows.length) { toast(t('toast.table.empty')); return; }
    confirmBox(t('confirm.table.clear', { n: rows.length }), () => {
      rows.length = 0;
      cfg.onChange && cfg.onChange(); draw();
      cfg.onImported && cfg.onImported();
      toast(t('toast.table.cleared'));
    });
  }

  draw();
  wrap.appendChild(dlBox);
  wrap.appendChild(el('div', { class: 'row', style: 'margin-bottom:8px' }, [
    info, el('div', { class: 'sp', style: 'flex:1' }), search,
    el('button', { class: 'btn sm', text: t('table.addRow'), onclick: function () { cfg.rows().push(cfg.blank ? cfg.blank() : {}); cfg.onChange && cfg.onChange(); draw(); } }),
    cfg.prefill ? el('button', { class: 'btn sm', text: t('table.prefill'), onclick: function () {
      const rows = cfg.rows(), have = {};
      rows.forEach((r) => { have[keyOfRow(r)] = 1; });
      let add = 0;
      const gen = cfg.prefill();
      gen.forEach((p) => {
        const k = keyOfRow(p);
        if (have[k]) return; have[k] = 1; rows.push(p); add++;
      });
      /* Sinh sẵn xong thì sắp lại cả bảng theo thứ tự nguồn (bảng Cost Code lấy
         đúng thứ tự Formula Code). Sắp ỔN ĐỊNH: dòng có khoá lạ — không còn
         trong nguồn nữa — xuống cuối mà vẫn giữ thứ tự tương đối, không mất dòng. */
      if (cfg.orderKeys) sortByKeys(rows, cfg.orderKeys(), keyOfRow);
      cfg.onChange && cfg.onChange(); draw();
      /* Chạm trần thì nói thẳng — cắt trong im lặng chính là lỗi cũ. */
      if (gen.truncated) toast(t('toast.table.comboTruncated', { n: gen.truncated }), 'bad');
      else toast(add ? t('toast.table.added', { n: add }) : t('toast.table.noNewCombo'));
    } }) : null,
    cfg.prefill ? comboLimitBox() : null,
    el('button', { class: 'btn sm del', text: t('table.clear'), onclick: clearAll }),
    el('button', { class: 'btn sm', text: t('table.downloadTemplate'), onclick: template }),
    el('button', { class: 'btn sm', text: t('table.exportData'), onclick: exportRows }),
    el('button', { class: 'btn sm pri', text: t('table.importExcel'), onclick: function () { pickFile('.xlsx,.xls,.csv', doImport); } })
  ]));
  wrap.appendChild(el('div', { class: 'tw' }, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, (drag ? [el('th', { text: '' })] : [])
        .concat(cfg.columns.map((c) => { return el('th', { text: c.label }); }))
        .concat([el('th', { text: '' })]))]),
      tb
    ])
  ]));
  wrap.appendChild(pg.node);
  wrap._redraw = draw;
  return wrap;
}

/* Bảng chỉ đọc dựng nhanh từ mảng mảng */
function readTable(headers, rows, opts) {
  opts = opts || {};
  return el('div', { class: 'tw', style: opts.maxH ? 'max-height:' + opts.maxH : '' }, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, headers.map((h, i) => { return el('th', { class: opts.num && opts.num.indexOf(i) >= 0 ? 'num' : '', text: h }); }))]),
      el('tbody', {}, rows.length ? rows.map((r) => {
        return el('tr', { class: r.__cls || '' }, r.map((v, i) => {
          /* opts.mono: cột nào là tên máy (biến, mã) thì cho chữ đơn cách, đọc
             mới ra dấu gạch dưới và phân biệt được I với l. */
          const cls = (opts.num && opts.num.indexOf(i) >= 0 ? 'num ' : '')
            + (opts.mono && opts.mono.indexOf(i) >= 0 ? 'mono ' : '')
            + (v === '' || v == null ? 'zero' : '');
          return el('td', { class: cls, text: v == null ? '' : String(v) });
        }));
      }) : [el('tr', {}, [el('td', { colspan: headers.length, class: 'empty', text: opts.empty || t('table.noData') })])])
    ])
  ]);
}

function panel(title, actions, body, note) {
  return el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: title }), el('div', { class: 'sp' })].concat(actions || [])),
    el('div', { class: 'body' }, [note ? el('p', { class: 'hint', html: note }) : null, body])
  ]);
}

/* Panel thu gọn được — trạng thái nhớ trong S.ui.collapsed */
function foldPanel(key, title, badges, actions, bodyNode, note) {
  let open = !S.ui.collapsed[key];
  const body = el('div', { class: 'body', style: open ? '' : 'display:none' },
    [note ? el('p', { class: 'hint', html: note }) : null, bodyNode]);
  const caret = el('span', { class: 'caret', text: open ? '▾' : '▸' });
  const head = el('header', { class: 'fold' }, [caret, el('h3', { text: title })]
    .concat(badges || []).concat([el('div', { class: 'sp' })]).concat(actions || []));
  head.addEventListener('click', (e) => {
    if (e.target.closest('button, input, select, textarea, .chips')) return;
    open = !open;
    S.ui.collapsed[key] = !open; touch();
    body.style.display = open ? '' : 'none';
    caret.textContent = open ? '▾' : '▸';
  });
  return el('div', { class: 'panel' }, [head, body]);
}

export { comboLimit, dragList, moveBeside, selection, pager, downloadTemplate, downloadData, importMapped, dataTable, readTable, panel, foldPanel };
