/* ===========================================================
   MÀN 4 — NGÀY CÔNG & NGÀY NGHỈ
   Bảng ngày công theo tháng, dùng làm biến trong công thức chi phí.
   =========================================================== */
import { CAL_FIELDS, M, MONTHS, S, blankCalTable, numOf, setRESULT, touch } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { pickFile } from '../platform/io.js';
import { el, esc, render, renderSoon, toast } from '../ui/dom.js';
import { downloadData, downloadTemplate, importMapped, panel } from '../ui/widgets.js';

function viewCalendar() {
  const wrap = el('div');
  const cal = S.calendar;

  const groupOpts = [''].concat(ENGINE.usableCols());
  wrap.appendChild(panel(t('cal.lich_ap_cho_ai'), [], el('div', { class: 'row' }, [
    el('div', { style: 'width:280px' }, [
      el('label', { class: 'f', text: t('cal.phan_lich_theo_cot') }),
      el('select', {
        onchange: function (e) { cal.groupCol = e.target.value; setRESULT(null); touch(); renderSoon(); }
      }, groupOpts.map((c) => {
        return el('option', { value: c, selected: cal.groupCol === c, text: c || t('cal.one_calendar_for_all') });
      }))
    ]),
    el('div', { style: 'flex:1' }, [el('p', {
      class: 'hint', style: 'margin:18px 0 0',
      html: cal.groupCol
        ? t('cal.per_group_help', { col: esc(cal.groupCol) })
        : t('cal.shared_help')
    })])
  ])));

  (cal.tables || []).forEach((tbl, idx) => {
    const tb = el('tbody');
    function draw() {
      tb.innerHTML = '';
      MONTHS.forEach((mn, k) => {
        const rec = tbl.m[k];
        const used = CAL_FIELDS.slice(1).reduce((s, f) => { return s + numOf(rec[f.k]); }, 0);
        const gap = numOf(rec.std) - used;
        tb.appendChild(el('tr', {}, [el('td', { class: 'mono', style: 'width:60px', text: mn })]
          .concat(CAL_FIELDS.map((f) => {
            return el('td', { style: 'width:150px' }, [el('input', {
              type: 'text', class: 'fx', style: 'text-align:right', value: rec[f.k],
              oninput: function (e) { rec[f.k] = numOf(e.target.value); setRESULT(null); touch(); draw2(); }
            })]);
          }))
          .concat([el('td', {}, [gap === 0
            ? el('span', { class: 'tag g', text: t('cal.khop') })
            : el('span', { class: 'tag o', text: (gap > 0 ? t('cal.gap_short', { n: Math.abs(gap) }) : t('cal.gap_over', { n: Math.abs(gap) })) })])])));
      });
    }
    let t2 = null;
    function draw2() { clearTimeout(t2); t2 = setTimeout(draw, 500); }
    draw();

    wrap.appendChild(el('div', { class: 'panel' }, [
      el('header', {}, [
        el('h3', { text: t('cal.lich_ngay_cong') }),
        cal.groupCol
          ? el('input', {
            type: 'text', class: 'fx', style: 'width:170px', value: tbl.scope || '*', title: t('cal.scope_title', { col: cal.groupCol }),
            oninput: function (e) { tbl.scope = e.target.value; setRESULT(null); touch(); }
          })
          : el('span', { class: 'tag g', text: t('cal.ap_cho_tat_ca') }),
        el('div', { class: 'sp' }),
        el('button', { class: 'btn sm', text: t('cal.dien_deu_12_thang'), onclick: function () {
          const first = tbl.m[0];
          for (let k = 1; k < M; k++) CAL_FIELDS.forEach((f) => { tbl.m[k][f.k] = first[f.k]; });
          setRESULT(null); touch(); render();
        } }),
        cal.tables.length > 1 ? el('button', { class: 'btn sm del', text: t('cal.xoa_lich'), onclick: function () { cal.tables.splice(idx, 1); setRESULT(null); touch(); render(); } }) : null
      ]),
      el('div', { class: 'body' }, [el('p', {
        class: 'hint',
        html: t('cal.vars_help', { vars: CAL_FIELDS.map((f) => { return '<code>' + f.varName + '</code>'; }).join(' · ') })
      })]),
      el('div', { class: 'body tight' }, [el('div', { class: 'tw', style: 'max-height:none' }, [
        el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: t('export.audit.month') })]
          .concat(CAL_FIELDS.map((f) => { return el('th', { class: 'num', text: f.label }); }))
          .concat([el('th', { text: t('cal.doi_chieu') })]))]), tb])
      ])])
    ]));
  });

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('div', { class: 'body' }, [el('div', { class: 'row' }, [
      cal.groupCol ? el('button', {
        class: 'btn', text: t('cal.them_lich_cho_mot_nhom'), onclick: function () {
          cal.tables.push(blankCalTable('')); setRESULT(null); touch(); render();
        }
      }) : null,
      el('button', { class: 'btn', text: t('table.downloadTemplate'), onclick: calTemplate }),
      el('button', { class: 'btn', text: t('table.exportData'), onclick: calExport }),
      el('button', { class: 'btn pri', text: t('table.importExcel'), onclick: function () { pickFile('.xlsx,.xls,.csv', calImport); } })
    ])])
  ]));

  return wrap;
}

/* Tiêu đề cột dùng chung cho cả mẫu trống lẫn bản xuất — cũng chính là bộ mà
   calImport() khớp cột. Một nguồn duy nhất, đổi là đổi cả ba. */
const CAL_HEADERS = ['Nhom', 'Thang'].concat(CAL_FIELDS.map((f) => { return f.label; }));

/** Mẫu TRỐNG: 12 dòng cho nhóm mặc định, để người dùng điền từ đầu. */
function calTemplate() {
  const rows = MONTHS.map((mn, k) => {
    return ['*', k + 1].concat(CAL_FIELDS.map(() => { return ''; }));
  });
  downloadTemplate({
    tableName: 'tblNgayCong', title: t('cal.ngay_cong_chuan_tung_thang'), sheetName: 'NgayCong',
    headers: CAL_HEADERS, rows,
    guide: [
      t('cal.guide_1'),
      t('cal.guide_2'),
      t('cal.guide_3')
    ],
    file: 'mau-ngay-cong.xlsx'
  });
}

/** Xuất DỮ LIỆU đang khai, để sửa ngoài Excel rồi nạp đè lại. */
function calExport() {
  const rows = [];
  (S.calendar.tables || []).forEach((tbl) => {
    MONTHS.forEach((mn, k) => {
      rows.push([tbl.scope || '*', k + 1].concat(CAL_FIELDS.map((f) => { return numOf(tbl.m[k][f.k]); })));
    });
  });
  downloadData({
    tableName: 'tblNgayCong', title: t('cal.ngay_cong_chuan_tung_thang'), sheetName: 'NgayCong',
    headers: CAL_HEADERS, rows,
    guide: [t('cal.export_guide')],
    file: 'xuat-ngay-cong.xlsx'
  });
}

function calImport(file) {
  const fields = [{ k: 'scope', label: 'Nhom' }, { k: 'month', label: 'Thang', required: true }]
    .concat(CAL_FIELDS.map((f) => { return { k: f.k, label: f.label }; }));
  importMapped(file, t('cal.import_title'), fields, (out) => {
    const byScope = {};
    out.forEach((o) => {
      const sc = String(o.scope == null || o.scope === '' ? '*' : o.scope).trim();
      const m = parseInt(o.month, 10);
      if (!(m >= 1 && m <= 12)) return;
      if (!byScope[sc]) byScope[sc] = blankCalTable(sc);
      CAL_FIELDS.forEach((f) => { byScope[sc].m[m - 1][f.k] = numOf(o[f.k]); });
    });
    const keys = Object.keys(byScope);
    if (!keys.length) { toast(t('cal.khong_doc_duoc_dong_hop_le_nao'), 'bad'); return; }
    S.calendar.tables = keys.map((k) => { return byScope[k]; });
    setRESULT(null); touch(); render();
    toast(t('cal.imported', { n: keys.length }), 'good');
  });
}

export { viewCalendar, calTemplate, calExport, calImport };
