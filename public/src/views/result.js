/* ===========================================================
   MÀN 10 — KẾT QUẢ NGÂN SÁCH
   Tách nguyên văn từ khối 08-view-result-boot.js (phần kết quả).
   =========================================================== */
import { M, MONTHS, RESULT, S, fmt, fmtShort, setRESULT } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { exportBudget } from '../platform/io.js';
import { el, modal, render, ribbon, toast } from '../ui/dom.js';
import { pager } from '../ui/widgets.js';

/* ==== 08-view-result-boot.js ==== */
/* ===========================================================
   MÀN 9 — KẾT QUẢ NGÂN SÁCH
   =========================================================== */
function runBudget(silent) {
  if (!S.hc.rows.length) { if (!silent) toast(t('msg.no_hc'), 'bad'); return null; }
  try {
    setRESULT(ENGINE.run());
    if (!silent) toast(t('res.done', { ms: RESULT.ms }), 'good');
  } catch (e) { setRESULT(null); toast(t('res.error', { e: e.message }), 'bad'); }
  return RESULT;
}

function viewResult() {
  const wrap = el('div');
  const R = RESULT;
  if (!R) {
    wrap.appendChild(el('div', { class: 'panel' }, [el('div', { class: 'empty' }, [
      el('strong', { text: S.hc.rows.length ? t('dash.not_run') : t('msg.no_hc') }),
      el('span', { text: S.hc.rows.length ? t('res.not_run_hint') : t('dash.no_hc_hint') }),
      S.hc.rows.length ? el('div', { style: 'margin-top:14px' }, [el('button', {
        class: 'btn go', style: 'padding:8px 18px', text: t('dash.chay_tinh_ngay'),
        onclick: function () { runBudget(); render(); }
      })]) : null
    ])]));
    return wrap;
  }

  const applied = {};
  R.conflicts.forEach((c) => { applied[c.no + '|' + c.id + '|' + c.formulaCode] = 1; });
  const diffs = R.conflicts.filter((c) => { return c.diff; });

  wrap.appendChild(el('div', { class: 'stats' }, [
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('res.total_budget', { y: S.meta.year }) }), el('div', { class: 'v money', text: fmtShort(R.grand) }), el('div', { class: 'u', text: t('dash.currency', { n: fmt(R.grand) }) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('dash.binh_quan_thang') }), el('div', { class: 'v', text: fmtShort(R.grand / 12) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.dong_dinh_bien') }), el('div', { class: 'v', text: fmt(R.rows.length) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('res.luot_to_trinh_ap_dung') }), el('div', { class: 'v', text: fmt(Object.keys(applied).length) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('res.luot_lech_phai_theo_doi') }), el('div', { class: 'v ' + (diffs.length ? 'warn' : ''), text: fmt(diffs.length) })])
  ]));

  if (R.formulaErrors.length) {
    wrap.appendChild(el('div', { class: 'errbox' }, [
      el('strong', { text: t('res.formula_errors', { n: R.formulaErrors.length }) }),
      el('ul', {}, R.formulaErrors.slice(0, 8).map((e) => { return el('li', { text: e.where + ' — ' + e.msg }); }))
    ]));
  }
  if (R.warnings.length) {
    wrap.appendChild(el('div', { class: 'warnbox' }, [
      el('strong', { text: t('res.warnings', { n: R.warnings.length }) }),
      el('ul', {}, R.warnings.slice(0, 10).map((w) => { return el('li', { text: w.msg }); })),
      R.warnings.length > 10 ? el('div', { style: 'margin-top:5px', text: t('res.more_warnings', { n: R.warnings.length - 10 }) }) : null
    ]));
  }

  /* theo Formula Code */
  const byFc = R.formulas.map((fc, c) => {
    const mt = new Array(M).fill(0), arr = R.data[c];
    for (let i = 0; i < R.rows.length; i++) for (let m = 0; m < M; m++) mt[m] += arr[i * M + m];
    return { fc, mt, total: R.totalsByFc[c] };
  });
  const rowsEl = byFc.map((x) => {
    return el('tr', {}, [el('td', { class: 'mono', text: x.fc.code }), el('td', { text: x.fc.name || '' }), el('td', {}, [ribbon(x.fc.months)])]
      .concat(x.mt.map((v) => { return el('td', { class: 'num' + (v ? '' : ' zero'), text: v ? fmt(v) : '–' }); }))
      .concat([el('td', { class: 'num', text: fmt(x.total) })]));
  });
  rowsEl.push(el('tr', { class: 'tot' }, [el('td', { colspan: 3, text: t('res.tong_cong') })]
    .concat(R.monthTotals.map((v) => { return el('td', { class: 'num', text: fmt(v) }); }))
    .concat([el('td', { class: 'num', text: fmt(R.grand) })])));

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: 'Theo Formula Code' }), el('div', { class: 'sp' }),
      el('button', { class: 'btn sm go', text: t('dash.chay_lai'), onclick: function () { runBudget(); render(); } }),
      el('button', { class: 'btn sm pri', text: t('res.xuat_excel'), onclick: exportDialog })
    ]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: 'Formula Code' }), el('th', { text: t('export.audit.name') }), el('th', { text: t('export.audit.monthsPicked') })]
        .concat(MONTHS.map((m) => { return el('th', { class: 'num', text: m }); }))
        .concat([el('th', { class: 'num', text: t('fm.full_year') })]))]), el('tbody', {}, rowsEl)])
    ])])
  ]));

  /* pivot 4 tầng — bảng này dài theo số tổ hợp mã, trước đây dựng hết một lúc. */
  const pivotTb = el('tbody');
  const pgPivot = pager(() => { drawPivot(); });
  function drawPivot() {
    pivotTb.innerHTML = '';
    pgPivot.apply(R.pivot).forEach((p) => {
      pivotTb.appendChild(el('tr', {}, [
        el('td', { class: 'mono', text: p.accountCode }), el('td', { class: 'mono', text: p.budgetCode }),
        el('td', { class: 'mono', text: p.costCode }), el('td', { class: 'mono', text: p.costCenter }),
        el('td', { class: 'mono', text: p.formulaCode })
      ].concat(p.m.map((v) => { return el('td', { class: 'num' + (v ? '' : ' zero'), text: v ? fmt(v) : '–' }); }))
        .concat([el('td', { class: 'num', text: fmt(p.total) })])));
    });
    if (!R.pivot.length) pivotTb.appendChild(el('tr', {}, [el('td', { colspan: 18, class: 'empty', text: t('res.chua_co_so_lieu') })]));
  }
  drawPivot();
  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('res.pivot_title') }), el('span', { class: 'tag', text: t('table.info.rows', { n: R.pivot.length }) })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [el('thead', {}, [el('tr', {}, ['Account Code', 'Budget Code', 'Cost Code', 'Cost Center', 'Formula Code']
        .map((h) => { return el('th', { text: h }); })
        .concat(MONTHS.map((m) => { return el('th', { class: 'num', text: m }); }))
        .concat([el('th', { class: 'num', text: t('fm.full_year') })]))]),
      pivotTb])
    ])]),
    el('div', { class: 'body' }, [pgPivot.node])
  ]));

  /* đối chiếu — trước đây cắt cụt ở 500 dòng mà không báo gì. */
  const diffTb = el('tbody');
  const pgDiff = pager(() => { drawDiffs(); });
  function drawDiffs() {
    diffTb.innerHTML = '';
    pgDiff.apply(diffs).forEach((c) => {
      diffTb.appendChild(el('tr', {}, [
        el('td', { class: 'mono', text: c.no }), el('td', { class: 'mono', text: String(c.id == null ? '' : c.id) }),
        el('td', { text: String(c.position == null ? '' : c.position) }), el('td', { class: 'mono', text: c.formulaCode }),
        el('td', { class: 'num', text: MONTHS[c.month - 1] }), el('td', { class: 'num', text: fmt(c.formula) }),
        el('td', { class: 'num', text: fmt(c.exception) }), el('td', {}, [el('span', { class: 'tag', text: c.rule })]),
        el('td', { class: 'num', text: fmt(c.final) }),
        el('td', {}, [el('span', { class: 'tag ' + (c.won ? 'o' : 'g'), text: c.won ? t('dash.kind_exc') : t('export.audit.formula') })])
      ]));
    });
  }
  drawDiffs();

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('res.doi_chieu_to_trinh_cong_thuc') }), el('span', { class: 'tag' + (diffs.length ? ' o' : ''), text: t('res.n_diffs', { n: diffs.length }) })]),
    el('div', { class: 'body tight' }, [
      diffs.length ? el('div', { class: 'tw' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [t('exc.th_no'), 'ID', t('exc.th_position'), 'Formula Code', t('export.audit.month'), t('export.audit.formula'), t('dash.kind_exc'), t('exc.th_rule'), t('res.th_applied'), t('res.th_winner')]
            .map((h, i) => { return el('th', { class: (i >= 5 && i <= 8) ? 'num' : '', text: h }); }))]),
          diffTb])
      ]) : el('div', { class: 'empty', text: t('res.khong_co_chenh_lech_nao') })
    ]),
    diffs.length ? el('div', { class: 'body' }, [pgDiff.node]) : null
  ]));

  return wrap;
}

/* ===========================================================
   XUẤT EXCEL
   =========================================================== */
function exportDialog() {
  if (!RESULT) { runBudget(); if (!RESULT) return; }
  const R = RESULT;
  const opt = { person: true, pivot: true, fc: true, conflict: true, audit: true, long: false };
  function cb(k, label, note) {
    return el('label', { style: 'display:flex;gap:8px;align-items:flex-start;margin-bottom:9px' }, [
      el('input', { type: 'checkbox', checked: opt[k], onchange: function (e) { opt[k] = e.target.checked; } }),
      el('span', {}, [el('strong', { text: label }), note ? el('div', { class: 'fxok', text: note }) : null])
    ]);
  }
  modal(t('res.xuat_file_excel'), el('div', {}, [
    cb('person', t('res.sheet_person'), t('res.sheet_person_note', { n: fmt(R.rows.length * M) })),
    cb('pivot', t('res.sheet_pivot'), t('table.info.rows', { n: fmt(R.pivot.length) })),
    cb('fc', t('res.sheet_fc'), ''),
    cb('conflict', t('res.sheet_conflict'), t('table.info.rows', { n: fmt(R.conflicts.length) })),
    cb('audit', t('res.sheet_audit'), t('res.sheet_audit_note')),
    cb('long', t('res.sheet_long'), t('res.sheet_long_note', { n: fmt(R.rows.length * M * R.formulas.length) }))
  ]), [{ label: t('btn.cancel') }, { label: t('res.export_btn'), cls: 'pri', onclick: function () { setTimeout(() => { doExport(opt); }, 60); } }]);
}

/* Vỏ mỏng quanh io.exportBudget(): io.js chỉ dựng workbook và ném lỗi,
   phần báo cho người dùng nằm ở đây. Hành vi y hệt doExport() bản gốc. */
function doExport(opt) {
  toast(t('res.export_building'));
  try {
    toast(t('res.export_ok', { fn: exportBudget(opt) }), 'good');
  } catch (e) { toast(t('res.export_fail', { e: e.message }), 'bad'); }
}

export { runBudget, viewResult, exportDialog, doExport };
