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

  let shown = cfg.maxShow || 150;
  let filter = '';
  function draw() {
    optCache = {}; buildDatalists();
    tb.innerHTML = '';
    const rows = cfg.rows();
    const kw = filter.trim().toLowerCase();
    const keys = cfg.columns.map((c) => { return c.k; });
    const frag = document.createDocumentFragment();
    let n = 0, matched = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (kw) {
        let hit = false;
        for (let q = 0; q < keys.length; q++) {
          if (String(row[keys[q]] == null ? '' : row[keys[q]]).toLowerCase().indexOf(kw) >= 0) { hit = true; break; }
        }
        if (!hit) continue;
      }
      matched++;
      if (n >= shown) continue;
      n++;
      (function (row) {
        const tds = cfg.columns.map((col) => {
          return el('td', { style: col.w ? 'width:' + col.w + 'px' : '' }, [cell(row, col)]);
        });
        tds.push(el('td', { style: 'width:32px' }, [el('button', {
          class: 'btn sm del', text: '✕',
          onclick: function () {
            const all = cfg.rows(), j = all.indexOf(row);
            if (j >= 0) all.splice(j, 1);
            cfg.onChange && cfg.onChange(); draw();
          }
        })]));
        frag.appendChild(el('tr', {}, tds));
      })(row);
    }
    tb.appendChild(frag);
    if (!rows.length) tb.appendChild(el('tr', {}, [el('td', { colspan: cfg.columns.length + 1, class: 'empty', text: cfg.emptyText || t('table.empty') })]));
    else if (!matched) tb.appendChild(el('tr', {}, [el('td', { colspan: cfg.columns.length + 1, class: 'empty', text: t('table.noMatch', { kw: filter }) })]));
    info.textContent = t('table.info.rows', { n: rows.length }) + (kw ? ' ' + t('table.info.matched', { n: matched }) : '') + (matched > n ? ' ' + t('table.info.showing', { n }) : '');
    more.style.display = matched > n ? '' : 'none';
  }
  const more = el('button', {
    class: 'btn sm', text: t('table.showMore'), style: 'display:none',
    onclick: function () { shown += 300; draw(); }
  });
  const search = el('input', {
    type: 'text', placeholder: t('table.filter.placeholder'), style: 'width:130px',
    oninput: function (e) { filter = e.target.value; shown = cfg.maxShow || 150; draw(); }
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
    info, more, el('div', { class: 'sp', style: 'flex:1' }), search,
    el('button', { class: 'btn sm', text: t('table.addRow'), onclick: function () { cfg.rows().push(cfg.blank ? cfg.blank() : {}); cfg.onChange && cfg.onChange(); draw(); } }),
    cfg.prefill ? el('button', { class: 'btn sm', text: t('table.prefill'), onclick: function () {
      const rows = cfg.rows(), have = {};
      rows.forEach((r) => { have[cfg.columns.filter((c) => { return c.key; }).map((c) => { return nkey(r[c.k]); }).join('|')] = 1; });
      let add = 0;
      cfg.prefill().forEach((p) => {
        const k = cfg.columns.filter((c) => { return c.key; }).map((c) => { return nkey(p[c.k]); }).join('|');
        if (have[k]) return; have[k] = 1; rows.push(p); add++;
      });
      cfg.onChange && cfg.onChange(); draw();
      toast(add ? t('toast.table.added', { n: add }) : t('toast.table.noNewCombo'));
    } }) : null,
    el('button', { class: 'btn sm del', text: t('table.clear'), onclick: clearAll }),
    el('button', { class: 'btn sm', text: t('table.downloadTemplate'), onclick: template }),
    el('button', { class: 'btn sm', text: t('table.exportData'), onclick: exportRows }),
    el('button', { class: 'btn sm pri', text: t('table.importExcel'), onclick: function () { pickFile('.xlsx,.xls,.csv', doImport); } })
  ]));
  wrap.appendChild(el('div', { class: 'tw' }, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, cfg.columns.map((c) => { return el('th', { text: c.label }); }).concat([el('th', { text: '' })]))]),
      tb
    ])
  ]));
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
          return el('td', { class: (opts.num && opts.num.indexOf(i) >= 0 ? 'num ' : '') + (v === '' || v == null ? 'zero' : ''), text: v == null ? '' : String(v) });
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

export { downloadTemplate, downloadData, importMapped, dataTable, readTable, panel, foldPanel };
