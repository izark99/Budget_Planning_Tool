/* ===========================================================
   MÀN 1 — ĐỊNH BIÊN
   Nạp bảng định biên .xlsx, tự đoán vai trò từng cột, xem lại dữ liệu.
   =========================================================== */
import { M, S, fmt, setRESULT, touch } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { dedupeHeaders, pickFile, readWorkbook, sheetAoa } from '../platform/io.js';
import { el, modal, render, ribbon, toast } from '../ui/dom.js';
import { downloadTemplate, panel, readTable } from '../ui/widgets.js';

function guessRole(name, values) {
  var s = String(name).toLowerCase().trim();
  var m = /^(t|th|tháng|thang|m|month)?\s*0?([1-9]|1[0-2])$/.exec(s);
  if (m) return { role: 'month', month: +m[2] };
  /* CHUỖI GIAO THỨC — đừng đưa sang content.md.
     Ba danh sách dưới đây so khớp với TÊN CỘT có thật trong file Excel định biên
     người dùng tải lên. Dịch hay sửa chúng là hỏng chức năng tự nhận diện cột. */
  if (['id', 'mã nv', 'manv', 'mã nhân viên', 'employee id', 'mã số'].indexOf(s) >= 0) return { role: 'key' };
  if (['position', 'chức danh', 'chuc danh', 'vị trí', 'job title'].indexOf(s) >= 0) return { role: 'position' };
  if (['unit', 'bộ phận', 'đơn vị', 'don vi'].indexOf(s) >= 0) return { role: 'unit' };
  return { role: 'attr' };
}
function guessType(values) {
  var n = 0, t = 0;
  values.slice(0, 60).forEach(function (v) {
    if (v === '' || v == null) return;
    t++; if (typeof v === 'number' || /^-?[\d.,]+$/.test(String(v).trim())) n++;
  });
  return t && n === t ? 'num' : 'text';
}

function importHeadcount(file) {
  readWorkbook(file, function (err, wb) {
    if (err) { toast(t('hc.err_read', { e: err.message }), 'bad'); return; }
    var st = { sheet: wb.SheetNames[0], hr: 1 };
    var box = el('div');
    function build() {
      var aoa = sheetAoa(wb, st.sheet);
      var hr = Math.max(1, Math.min(st.hr, aoa.length || 1));
      var headers = dedupeHeaders(aoa[hr - 1] || []);
      var nMonth = headers.filter(function (h) { return guessRole(h).role === 'month'; }).length;
      box.innerHTML = '';
      box.appendChild(el('div', { class: 'row', style: 'margin-bottom:10px' }, [
        el('div', { style: 'flex:1' }, [el('label', { class: 'f', text: 'Sheet' }),
        el('select', { onchange: function (e) { st.sheet = e.target.value; build(); } },
          wb.SheetNames.map(function (s) { return el('option', { value: s, selected: s === st.sheet, text: s }); }))]),
        el('div', { style: 'width:140px' }, [el('label', { class: 'f', text: t('hc.dong_tieu_de') }),
        el('input', { type: 'number', min: 1, value: hr, onchange: function (e) { st.hr = +e.target.value || 1; build(); } })])
      ]));
      box.appendChild(el('p', {
        class: 'hint', html: nMonth === 12
          ? t('hc.months_ok')
          : t('hc.months_partial', { n: nMonth })
      }));
      box.appendChild(readTable(headers.slice(0, 22), aoa.slice(hr, hr + 4).map(function (r) {
        return headers.slice(0, 22).map(function (h, i) { return r[i]; });
      }), { maxH: '230px' }));
      box.appendChild(el('p', { class: 'hint', style: 'margin-top:8px', text: t('hc.rows_cols', { rows: Math.max(0, aoa.length - hr), cols: headers.length }) }));
      box._data = function () { return { aoa: aoa, hr: hr, headers: headers }; };
    }
    build();

    modal(t('hc.import_title', { file: file.name }), box, [
      { label: t('btn.cancel') },
      {
        label: t('btn.import'), cls: 'pri', onclick: function () {
          var d = box._data();
          var rows = [];
          for (var i = d.hr; i < d.aoa.length; i++) {
            var raw = d.aoa[i];
            if (!raw || raw.every(function (x) { return x === '' || x == null; })) continue;
            var o = {};
            d.headers.forEach(function (h, j) { o[h] = raw[j]; });
            rows.push(o);
          }
          var prev = {};
          (S.cols || []).forEach(function (c) { prev[c.src] = c; });
          S.hc = { headers: d.headers, rows: rows, file: file.name, at: new Date().toLocaleString('vi-VN') };
          S.cols = d.headers.map(function (h) {
            if (prev[h]) return prev[h];
            var vals = rows.slice(0, 60).map(function (r) { return r[h]; });
            var g = guessRole(h, vals);
            return { src: h, alias: h, role: g.role, month: g.month || null, type: g.role === 'month' ? 'num' : guessType(vals) };
          });
          ENGINE.invalidate(); setRESULT(null); touch(); render();
          toast(t('hc.imported_rows', { n: rows.length }), 'good');
        }
      }
    ]);
  });
}

function hcTemplate() {
  downloadTemplate({
    tableName: 'tblDinhBien', title: t('hc.bang_dinh_bien'), sheetName: 'DinhBien',
    headers: ['Status', 'Dept', 'Unit', 'Position', 'Workplace Location', 'Grade', 'Coefficient', 'Gender', 'ID',
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    rows: [
      ['01. Current Headcount', 'AC', 'AC', 'AC_001', 'DHG', '5A.12', 1.276, 'Male', 1401, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
      ['01. Current Headcount', 'SL', 'SL-CT', 'SL_101', 'DHG-CT', '4B.03', 0.98, 'Female', 1402, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    ],
    guide: [
      t('hc.guide_1'),
      t('hc.guide_2'),
      t('hc.guide_3'),
      t('hc.guide_4')
    ],
    file: 'mau-dinh-bien.xlsx'
  });
}

function viewHC() {
  var wrap = el('div');
  if (!S.hc.rows.length) {
    wrap.appendChild(panel(t('hc.nhap_bang_dinh_bien'), [
      el('button', { class: 'btn sm', text: t('table.downloadTemplate'), onclick: hcTemplate })
    ], el('div', {
      class: 'drop', onclick: function () { pickFile('.xlsx,.xls,.csv', importHeadcount); },
      ondragover: function (e) { e.preventDefault(); e.currentTarget.classList.add('over'); },
      ondragleave: function (e) { e.currentTarget.classList.remove('over'); },
      ondrop: function (e) { e.preventDefault(); e.currentTarget.classList.remove('over'); if (e.dataTransfer.files[0]) importHeadcount(e.dataTransfer.files[0]); }
    }, [
      el('strong', { text: t('hc.chon_file_dinh_bien_xlsx') }),
      el('span', { text: t('hc.hoac_keo_tha_vao_day_moi_dong_mot') })
    ])));
    return wrap;
  }

  var rows = ENGINE.previewRows();
  var per = new Array(M).fill(0);
  rows.forEach(function (r) { for (var m = 0; m < M; m++) per[m] += (r.__m[m] || 0); });
  var sum = per.reduce(function (a, b) { return a + b; }, 0);

  wrap.appendChild(el('div', { class: 'stats' }, [
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.dong_dinh_bien') }), el('div', { class: 'v', text: fmt(rows.length) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.dinh_bien_t01') }), el('div', { class: 'v', text: fmt(per[0]) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.dinh_bien_t12') }), el('div', { class: 'v', text: fmt(per[11]) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.binh_quan_nam') }), el('div', { class: 'v', text: fmt(sum / 12) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.nguon') }), el('div', { class: 'v', style: 'font-size:13px;line-height:1.3', text: S.hc.file || '—' }), el('div', { class: 'u', text: S.hc.at })])
  ]));

  var cols = ENGINE.attrCols();
  var q = { t: '', lim: 100 };
  var tb = el('tbody');
  function fill() {
    tb.innerHTML = '';
    var kw = q.t.trim().toLowerCase(), n = 0;
    for (var i = 0; i < rows.length && n < q.lim; i++) {
      var r = rows[i];
      if (kw && !cols.some(function (c) { return String(r[c.alias]).toLowerCase().indexOf(kw) >= 0; })) continue;
      n++;
      var tr = el('tr', {}, cols.map(function (c) { return el('td', { text: String(r[c.alias] == null ? '' : r[c.alias]) }); }));
      tr.appendChild(el('td', {}, [ribbon(r.__m, { factor: true })]));
      tb.appendChild(tr);
    }
    if (!n) tb.appendChild(el('tr', {}, [el('td', { colspan: cols.length + 1, class: 'empty', text: t('hc.khong_co_dong_nao_khop') })]));
  }
  fill();

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('hc.du_lieu_dinh_bien') }), el('div', { class: 'sp' }),
      el('input', { type: 'text', placeholder: t('hc.tim_trong_bang'), style: 'width:190px', oninput: function (e) { q.t = e.target.value; fill(); } }),
      el('button', { class: 'btn sm', text: t('hc.hien_them_500'), onclick: function () { q.lim += 500; fill(); } }),
      el('button', { class: 'btn sm', text: t('hc.mau'), onclick: hcTemplate }),
      el('button', { class: 'btn sm', text: t('hc.nhap_lai'), onclick: function () { pickFile('.xlsx,.xls,.csv', importHeadcount); } })
    ]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [el('thead', {}, [el('tr', {}, cols.map(function (c) { return el('th', { text: c.alias }); })
        .concat([el('th', { text: t('hc.dinh_bien_t01_t12') })]))]), tb])
    ])])
  ]));
  return wrap;
}

export { guessRole, guessType, importHeadcount, hcTemplate, viewHC };
