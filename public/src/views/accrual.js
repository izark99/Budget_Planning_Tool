/* ===========================================================
   MÀN 10 — % TRÍCH THEO PHÂN LOẠI
   Mỗi Formula Code chọn MỘT cột phân loại (bất kỳ cột nào dùng được:
   cột gốc của bảng định biên, cột do Phân loại nhóm sinh ra, hay cột do
   Chính sách sinh ra), rồi khai % cho từng giá trị của cột đó × 12 tháng.
   % nhân vào ở bước cuối, cùng chỗ với hệ số định biên.
   Chưa khai = 100%, nên màn này để trống thì kết quả không đổi.
   =========================================================== */
import { M, MONTHS, S, nkey, numOf, setRESULT, touch, uid } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { distinctVals, pickFile } from '../platform/io.js';
import { confirmBox, el, render, toast } from '../ui/dom.js';
import { downloadData, downloadTemplate, foldPanel, importMapped, panel } from '../ui/widgets.js';

/* CHUỖI GIAO THỨC — tên cột của file mẫu .xlsx, đồng thời là khoá khớp khi
   nhập lại. Đổi là hỏng chức năng nhập file. Để ASCII không dấu cho chắc. */
const IMP_CODE = 'Formula Code';
const IMP_COL = 'Cot Phan Loai';
const IMP_KEY = 'Gia Tri';
function impMonth(m) { return 'T' + String(m).padStart(2, '0'); }

/* Chỉ ĐỌC — không tạo gì. Mở tab mà tự sinh bản ghi rỗng cho mọi Formula Code
   thì state bị bẩn và file dự án phình ra dù người dùng chưa khai gì. */
function findEntry(code) {
  return (S.accruals || []).filter((a) => { return nkey(a.code) === nkey(code); })[0] || null;
}
/* Tạo khi người dùng thật sự bắt đầu khai. */
function ensureEntry(code) {
  const found = findEntry(code);
  if (found) return found;
  const made = { id: uid(), code, col: '', rows: [] };
  S.accruals = (S.accruals || []).concat([made]);
  return made;
}
function blankMonths() { return new Array(M).fill(100); }

/* Giá trị đang có thật trong dữ liệu của cột đã chọn. */
function valuesOf(col) {
  if (!col) return [];
  return distinctVals(ENGINE.previewRows(), col);
}

/* Bổ sung những giá trị có trong dữ liệu mà chưa khai. Không đụng dòng đã khai. */
function syncRows(a) {
  const have = {};
  (a.rows || []).forEach((r) => { have[nkey(r.key)] = 1; });
  let added = 0;
  valuesOf(a.col).forEach((v) => {
    if (have[nkey(v)]) return;
    a.rows.push({ key: v, m: blankMonths() });
    added++;
  });
  return added;
}

function declaredCount(a) {
  let n = 0;
  (a.rows || []).forEach((r) => {
    (r.m || []).forEach((x) => { if (x !== '' && x !== null && x !== undefined && numOf(x) !== 100) n++; });
  });
  return n;
}

function viewAccrual() {
  const wrap = el('div');
  const cols = ENGINE.usableCols();

  wrap.appendChild(panel(t('acc.title'), [
    el('button', { class: 'btn sm', text: t('table.downloadTemplate'), onclick: accTemplate }),
    el('button', { class: 'btn sm', text: t('table.exportData'), onclick: accExport }),
    el('button', { class: 'btn sm pri', text: t('table.importExcel'), onclick: function () { pickFile('.xlsx,.xls,.csv', accImport); } })
  ], el('p', { class: 'hint', style: 'margin:0', html: t('acc.help') })));

  if (!S.hc.rows.length) {
    wrap.appendChild(el('div', { class: 'panel' }, [el('div', { class: 'empty' }, [
      el('strong', { text: t('msg.no_hc') }), el('span', { text: t('cal.nhap_dinh_bien_roi_quay_lai_day') })
    ])]));
    return wrap;
  }

  S.formulas.forEach((fc) => {
    const body = el('div');

    function draw() {
      body.innerHTML = '';
      const a = findEntry(fc.code) || { code: fc.code, col: '', rows: [] };

      const sel = el('select', { style: 'max-width:280px' }, [el('option', { value: '', text: t('acc.pick_col') })]
        .concat(cols.map((c) => { return el('option', { value: c, selected: a.col === c, text: c }); })));
      sel.addEventListener('change', (e) => {
        const live = ensureEntry(fc.code);          /* tới đây mới thực sự tạo bản ghi */
        live.col = e.target.value;
        live.rows = [];
        if (live.col) syncRows(live);
        setRESULT(null); touch(); draw();
      });

      body.appendChild(el('div', { class: 'row', style: 'margin-bottom:10px' }, [
        el('div', {}, [el('label', { class: 'f', text: t('acc.col_label') }), sel]),
        el('div', { class: 'sp', style: 'flex:1' }),
        a.col ? el('button', {
          class: 'btn sm', text: t('acc.sync'), onclick: function () {
            const n = syncRows(a);
            setRESULT(null); touch(); draw();
            toast(n ? t('acc.synced', { n }) : t('acc.sync_none'));
          }
        }) : null,
        a.col ? el('button', {
          class: 'btn sm', text: t('acc.all100'), onclick: function () {
            (a.rows || []).forEach((r) => { r.m = blankMonths(); });
            setRESULT(null); touch(); draw(); toast(t('acc.all100_done'));
          }
        }) : null,
        (a.rows || []).length ? el('button', {
          class: 'btn sm del', text: t('table.clear'), onclick: function () {
            confirmBox(t('acc.confirm_clear', { code: fc.code }), () => {
              a.rows = []; setRESULT(null); touch(); draw();
            });
          }
        }) : null
      ]));

      if (!a.col) {
        body.appendChild(el('div', { class: 'empty', text: t('acc.no_col') }));
        return;
      }

      const tb = el('tbody');
      (a.rows || []).forEach((r, ri) => {
        const tds = [el('td', { class: 'nowrap', text: String(r.key == null ? '' : r.key) })];
        for (let m = 0; m < M; m++) {
          (function (m) {
            tds.push(el('td', { style: 'width:78px' }, [el('input', {
              type: 'text', class: 'fx', style: 'text-align:right',
              value: (r.m && r.m[m] !== undefined && r.m[m] !== null) ? r.m[m] : '',
              placeholder: '100',
              oninput: function (e) {
                r.m = r.m || blankMonths();
                const raw = e.target.value.trim();
                r.m[m] = raw === '' ? '' : numOf(raw);
                setRESULT(null); touch();
              }
            })]));
          })(m);
        }
        tds.push(el('td', { style: 'width:32px' }, [el('button', {
          class: 'btn sm del', text: '✕',
          onclick: function () { a.rows.splice(ri, 1); setRESULT(null); touch(); draw(); }
        })]));
        tb.appendChild(el('tr', {}, tds));
      });
      if (!(a.rows || []).length) {
        tb.appendChild(el('tr', {}, [el('td', { colspan: M + 2, class: 'empty', text: t('acc.no_rows') })]));
      }

      body.appendChild(el('div', { class: 'tw', style: 'max-height:none' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [el('th', { class: 'nowrap', text: t('acc.th_value') })]
            .concat(MONTHS.map((mn) => { return el('th', { class: 'num', text: mn }); }))
            .concat([el('th', { text: '' })]))]),
          tb
        ])
      ]));
    }
    draw();

    const cur = findEntry(fc.code);
    const n = cur ? declaredCount(cur) : 0;
    wrap.appendChild(foldPanel('acc_' + fc.code, fc.code + ' · ' + (fc.name || ''),
      [(cur && cur.col) ? el('span', { class: 'tag g', text: cur.col }) : el('span', { class: 'tag', text: t('acc.no_col_badge') }),
       n ? el('span', { class: 'tag o', text: t('acc.n_declared', { n }) }) : null],
      [], body, null));
  });

  return wrap;
}

/* Tiêu đề cột dùng chung cho mẫu trống, bản xuất và trình nhập. */
function accHeaders() {
  return [IMP_CODE, IMP_COL, IMP_KEY].concat(MONTHS.map((_, i) => { return impMonth(i + 1); }));
}

/** Mẫu TRỐNG: một dòng ví dụ để thấy cấu trúc. */
function accTemplate() {
  const rows = [];
  if (S.formulas.length) {
    rows.push([S.formulas[0].code, ENGINE.usableCols()[0] || '', ''].concat(blankMonths()));
  }
  downloadTemplate({
    tableName: 'tblPhanTramTrich', title: t('acc.title'), sheetName: 'PhanTramTrich',
    headers: accHeaders(), rows,
    guide: [t('acc.guide_1'), t('acc.guide_2'), t('acc.guide_3'), t('acc.guide_4')],
    file: 'mau-phan-tram-trich.xlsx'
  });
}

/** Xuất DỮ LIỆU đang khai, để sửa ngoài Excel rồi nạp đè lại. */
function accExport() {
  const rows = [];
  (S.accruals || []).forEach((a) => {
    if (!a.col) return;
    (a.rows || []).forEach((r) => {
      rows.push(/** @type {any[]} */ ([a.code, a.col, r.key]).concat((r.m || blankMonths()).map((x) => { return x === '' ? '' : numOf(x); })));
    });
  });
  downloadData({
    tableName: 'tblPhanTramTrich', title: t('acc.title'), sheetName: 'PhanTramTrich',
    headers: accHeaders(), rows,
    guide: [t('acc.export_guide')],
    file: 'xuat-phan-tram-trich.xlsx'
  });
}

function accImport(file) {
  const fields = [
    { k: 'code', label: IMP_CODE, required: true },
    { k: 'col', label: IMP_COL, required: true },
    { k: 'key', label: IMP_KEY }
  ].concat(MONTHS.map((_, i) => { return { k: 'm' + (i + 1), label: impMonth(i + 1) }; }));

  importMapped(file, t('acc.import_title'), fields, (out) => {
    const known = {};
    S.formulas.forEach((f) => { known[nkey(f.code)] = f.code; });
    const byCode = {}; let skipped = 0, n = 0;
    out.forEach((o) => {
      const code = known[nkey(o.code)];
      if (!code) { skipped++; return; }
      if (!byCode[code]) byCode[code] = { col: String(o.col || '').trim(), rows: [] };
      const m = [];
      for (let i = 1; i <= M; i++) {
        const raw = o['m' + i];
        m.push(raw === '' || raw === null || raw === undefined ? '' : numOf(raw));
      }
      byCode[code].rows.push({ key: String(o.key == null ? '' : o.key).trim(), m });
      n++;
    });

    Object.keys(byCode).forEach((code) => {
      const a = ensureEntry(code);
      a.col = byCode[code].col || a.col;
      a.rows = byCode[code].rows;
    });
    setRESULT(null); touch(); render();
    toast(skipped ? t('acc.imported_skip', { n, s: skipped }) : t('acc.imported', { n }),
      skipped ? 'bad' : 'good');
  });
}

export { viewAccrual, accTemplate, accExport, accImport };
