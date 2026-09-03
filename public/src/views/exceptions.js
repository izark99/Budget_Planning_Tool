/* ===========================================================
   MÀN 6 — NGOẠI LỆ (TỜ TRÌNH)
   Ghi đè số tiền cho từng người, từng tháng.
   =========================================================== */
import { S, allMonths, numOf, setRESULT, touch, uid } from '../core/state.js';
import { t } from '../core/content.js';
import { pickFile } from '../platform/io.js';
import { el, render, ribbon, toast } from '../ui/dom.js';
import { downloadData, downloadTemplate, importMapped, pager } from '../ui/widgets.js';

function viewExc() {
  const wrap = el('div');
  const codes = S.formulas.map((f) => { return f.code; });

  const tb = el('tbody');
  const pg = pager(() => { draw(); });
  function draw() {
    tb.innerHTML = '';
    /* Nút xoá phải tìm lại vị trí thật trong S.exceptions bằng indexOf — chỉ số
       của trang hiện tại KHÔNG phải chỉ số trong mảng gốc. */
    pg.apply(S.exceptions).forEach((e) => {
      const mCell = el('td');
      mCell.appendChild(ribbon(e.months && e.months.length ? e.months : allMonths(), {
        pick: function (m, on) {
          if (!e.months || !e.months.length) e.months = allMonths();
          e.months = on ? e.months.concat([m]).sort((a, b) => { return a - b; }) : e.months.filter((x) => { return x !== m; });
          setRESULT(null); touch(); draw();
        }
      }));
      if (!e.months || !e.months.length) mCell.appendChild(el('div', { class: 'fxok', text: t('fm.ca_ky') }));
      tb.appendChild(el('tr', { style: e.active === false ? 'opacity:.45' : '' }, [
        el('td', { style: 'width:28px' }, [el('input', { type: 'checkbox', checked: e.active !== false, onchange: function (ev) { e.active = ev.target.checked; setRESULT(null); touch(); } })]),
        el('td', { style: 'width:110px' }, [el('input', { type: 'text', value: e.no || '', oninput: function (ev) { e.no = ev.target.value; touch(); } })]),
        el('td', { style: 'width:95px' }, [el('input', { type: 'text', class: 'fx', value: e.id == null ? '' : e.id, oninput: function (ev) { e.id = ev.target.value; setRESULT(null); touch(); } })]),
        el('td', { style: 'width:120px' }, [el('input', { type: 'text', value: e.position || '', oninput: function (ev) { e.position = ev.target.value; setRESULT(null); touch(); } })]),
        el('td', { style: 'width:160px' }, [el('select', { onchange: function (ev) { e.formulaCode = ev.target.value; setRESULT(null); touch(); } },
          [el('option', { value: '', text: '—' })].concat(codes.map((c) => { return el('option', { value: c, selected: c === e.formulaCode, text: c }); })))]),
        el('td', { style: 'width:115px' }, [el('input', { type: 'text', class: 'fx', style: 'text-align:right', value: e.amount, oninput: function (ev) { e.amount = numOf(ev.target.value); setRESULT(null); touch(); } })]),
        mCell,
        el('td', { style: 'width:115px' }, [el('select', { onchange: function (ev) { e.rule = ev.target.value; setRESULT(null); touch(); } }, [
          el('option', { value: 'MAX', selected: e.rule !== 'OVERRIDE' && e.rule !== 'ADD', text: t('fm.lay_cao_nhat') }),
          el('option', { value: 'OVERRIDE', selected: e.rule === 'OVERRIDE', text: t('fm.ghi_de') }),
          el('option', { value: 'ADD', selected: e.rule === 'ADD', text: t('fm.cong_them') })
        ])]),
        el('td', {}, [el('input', { type: 'text', value: e.note || '', oninput: function (ev) { e.note = ev.target.value; touch(); } })]),
        el('td', { style: 'width:32px' }, [el('button', { class: 'btn sm del', text: '✕', onclick: function () { const j = S.exceptions.indexOf(e); if (j >= 0) S.exceptions.splice(j, 1); setRESULT(null); touch(); draw(); } })])
      ]));
    });
    if (!S.exceptions.length) tb.appendChild(el('tr', {}, [el('td', { colspan: 10, class: 'empty', text: t('fm.chua_co_to_trinh_nao') })]));
  }
  draw();

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('fm.to_trinh_ngoai_le') }), el('span', { class: 'tag', text: t('table.info.rows', { n: S.exceptions.length }) }), el('div', { class: 'sp' }),
      el('button', { class: 'btn sm', text: t('table.addRow'), onclick: function () { S.exceptions.push({ id2: uid(), no: '', id: '', position: '', formulaCode: codes[0] || '', amount: 0, months: [], rule: 'MAX', note: '', active: true }); setRESULT(null); touch(); draw(); } }),
      el('button', { class: 'btn sm', text: t('table.downloadTemplate'), onclick: excTemplate }),
      el('button', { class: 'btn sm', text: t('table.exportData'), onclick: excExport }),
      el('button', { class: 'btn sm pri', text: t('table.importExcel'), onclick: function () { pickFile('.xlsx,.xls,.csv', excImport); } })
    ]),
    el('div', { class: 'body' }, [el('p', {
      class: 'hint',
      html: t('exc.help')
    })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [el('thead', {}, [el('tr', {}, ['', t('exc.th_no'), 'ID', t('exc.th_position'), 'Formula Code', t('exc.th_amount'), t('exc.th_months'), t('exc.th_rule'), t('export.audit.note'), ''].map((h) => { return el('th', { text: h }); }))]), tb])
    ])]),
    el('div', { class: 'body' }, [pg.node])
  ]));
  return wrap;
}

function excTemplate() {
  downloadTemplate({
    tableName: 'tblToTrinh', title: t('fm.to_trinh_ngoai_le'), sheetName: 'ToTrinh',
    headers: ['So To Trinh', 'ID', 'Chuc Danh', 'Formula Code', 'So Tien', 'Tu Thang', 'Den Thang', 'Quy Tac', 'Ghi Chu'],
    rows: [
      ['TT-2027/001', 1401, '', S.formulas[0] ? S.formulas[0].code : 'FC_DIENTHOAI', 500000, 1, 12, 'MAX', t('exc.sample_note_1')],
      ['TT-2027/002', '', 'SL_101', S.formulas[0] ? S.formulas[0].code : 'FC_DIENTHOAI', 400000, 4, 12, 'MAX', t('exc.sample_note_2')]
    ],
    guide: [
      t('exc.guide_1'),
      t('exc.guide_2'),
      t('exc.guide_3'),
      t('exc.guide_4')
    ],
    file: 'mau-to-trinh-ngoai-le.xlsx'
  });
}

/* Giao thức nhập chỉ có "Tu Thang"/"Den Thang" — một khoảng liền mạch. Nhưng
   người dùng chọn tháng bằng dải 12 ô nên có thể chọn ngắt quãng (T1, T3, T5).
   Ghi min..max sẽ hoá thành T1..T5, tức là xuất ra rồi nạp lại là SAI. Vì vậy
   tách mỗi khoảng liền mạch thành một dòng — kết quả tính y hệt, và nạp lại
   đúng từng tháng đã chọn. */
function monthRuns(months) {
  const ms = (months || []).map(Number).filter((m) => { return m >= 1 && m <= 12; }).sort((a, b) => { return a - b; });
  if (!ms.length) return [['', '']];
  const runs = [];
  let from = ms[0], prev = ms[0];
  for (let i = 1; i < ms.length; i++) {
    if (ms[i] === prev + 1) { prev = ms[i]; continue; }
    runs.push([from, prev]); from = ms[i]; prev = ms[i];
  }
  runs.push([from, prev]);
  return runs;
}

function excExport() {
  const rows = [];
  (S.exceptions || []).forEach((e) => {
    monthRuns(e.months).forEach((r) => {
      rows.push([e.no || '', e.id == null ? '' : e.id, e.position || '', e.formulaCode || '',
        numOf(e.amount), r[0], r[1], e.rule || 'MAX', e.note || '']);
    });
  });
  downloadData({
    tableName: 'tblToTrinh', title: t('fm.to_trinh_ngoai_le'), sheetName: 'ToTrinh',
    headers: ['So To Trinh', 'ID', 'Chuc Danh', 'Formula Code', 'So Tien', 'Tu Thang', 'Den Thang', 'Quy Tac', 'Ghi Chu'],
    rows,
    guide: [t('exc.export_guide')],
    file: 'xuat-to-trinh-ngoai-le.xlsx'
  });
}

function excImport(file) {
  importMapped(file, t('exc.import_title'), [
    { k: 'no', label: 'So To Trinh' }, { k: 'id', label: 'ID' }, { k: 'position', label: 'Chuc Danh' },
    { k: 'formulaCode', label: 'Formula Code', required: true }, { k: 'amount', label: 'So Tien', required: true },
    { k: 'from', label: 'Tu Thang' }, { k: 'to', label: 'Den Thang' }, { k: 'rule', label: 'Quy Tac' }, { k: 'note', label: 'Ghi Chu' }
  ], (out) => {
    /* THAY THẾ chứ không nối thêm — giống mọi màn nhập khác trong app
       (dataTable, Ngày công, % trích, Định biên đều thay thế). Nếu nối thêm thì
       vòng "xuất ra, sửa, nạp lại" sẽ nhân đôi toàn bộ tờ trình. */
    S.exceptions.length = 0;
    out.forEach((o) => {
      const a = parseInt(o.from, 10), b = parseInt(o.to, 10), months = [];
      if (!isNaN(a)) { const s = Math.max(1, a), e2 = isNaN(b) ? s : Math.min(12, b); for (let m = s; m <= e2; m++) months.push(m); }
      let rule = String(o.rule || 'MAX').toUpperCase().trim();
      if (['MAX', 'OVERRIDE', 'ADD'].indexOf(rule) < 0) rule = 'MAX';
      S.exceptions.push({
        id2: uid(), no: String(o.no || ''), id: o.id, position: o.position,
        formulaCode: String(o.formulaCode || '').trim(), amount: numOf(o.amount),
        months, rule, note: String(o.note || ''), active: true
      });
    });
    setRESULT(null); touch(); render();
    toast(t('exc.imported', { n: out.length }), 'good');
  });
}

export { viewExc, excTemplate, excImport };
