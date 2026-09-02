/* ===========================================================
   MÀN 11 — DASHBOARD SOÁT SỐ
   Tách nguyên văn từ khối 07b-view-dashboard.js.
   =========================================================== */
import { M, MONTHS, RESULT, S, fmt, fmtShort, nkey, t, touch } from '../core/state.js';
import { ENGINE } from '../core/formula.js';
import { el, render } from '../ui/ui.js';
import { runBudget } from './result.js';

/* ==== 07b-view-dashboard.js ==== */
/* ===========================================================
   MÀN — DASHBOARD SOÁT SỐ
   Chiều chính: Cost Code / Formula Code × một cột phân loại
   Thêm ba bộ lọc đi sâu và các chỉ số thống kê trên dãy số
   =========================================================== */
var STAT_DEFS = [
  { k: 'min', t: 'Min' },
  { k: 'p25', t: 'P25' },
  { k: 'median', t: 'Median' },
  { k: 'mean', t: 'Mean' },
  { k: 'p75', t: 'P75' },
  { k: 'max', t: 'Max' }
];

function dashState() {
  var f = S.ui.dash = S.ui.dash || {};
  if (!f.extra || f.extra.length !== 3) f.extra = [{ col: '', val: '' }, { col: '', val: '' }, { col: '', val: '' }];
  if (!f.stats) f.stats = ['min', 'median', 'mean', 'max'];
  if (f.costCode === undefined) f.costCode = '';
  if (f.formulaCode === undefined) f.formulaCode = '';
  if (f.groupCol === undefined) f.groupCol = '';
  if (f.groupVal === undefined) f.groupVal = '';
  if (!f.sort) f.sort = 'total';
  return f;
}

/* ---------- thống kê trên một dãy số ---------- */
function pctile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  var idx = (sorted.length - 1) * p;
  var lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function seriesStats(xs) {
  var a = xs.filter(function (v) { return isFinite(v); }).slice().sort(function (x, y) { return x - y; });
  if (!a.length) return { min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0, n: 0, sum: 0 };
  var sum = a.reduce(function (s, v) { return s + v; }, 0);
  return {
    n: a.length, sum: sum, min: a[0], max: a[a.length - 1], mean: sum / a.length,
    median: pctile(a, 0.5), p25: pctile(a, 0.25), p75: pctile(a, 0.75)
  };
}

/* ---------- gom số theo bộ lọc ---------- */
function dashFilters(f) {
  var out = [];
  if (f.groupCol && f.groupVal !== '') out.push({ col: f.groupCol, val: f.groupVal });
  (f.extra || []).forEach(function (x) { if (x.col && x.val !== '') out.push({ col: x.col, val: x.val }); });
  return out;
}
function rowPasses(row, filters) {
  for (var i = 0; i < filters.length; i++) {
    var v = row[filters[i].col];
    if (String(v == null ? '' : v).trim() !== filters[i].val) return false;
  }
  return true;
}
/* giá trị còn chọn được của một ô lọc, sau khi đã áp các ô lọc khác */
function distinctUnder(rows, col, others) {
  var seen = {}, out = [];
  for (var i = 0; i < rows.length; i++) {
    if (!rowPasses(rows[i], others)) continue;
    var v = String(rows[i][col] == null ? '' : rows[i][col]).trim();
    if (v === '' || seen[v]) continue;
    seen[v] = 1; out.push(v);
  }
  return out.sort();
}

function dashAggregate(R, f) {
  var nR = R.rows.length;
  var ccOf = {};
  (S.maps.costCode || []).forEach(function (x) { ccOf[nkey(x.formulaCode)] = x.costCode || t('engine.map.none'); });

  var fcIdx = [];
  R.formulas.forEach(function (fc, i) {
    var cc = ccOf[nkey(fc.code)] || t('engine.map.none');
    if (f.costCode && cc !== f.costCode) return;
    if (f.formulaCode && fc.code !== f.formulaCode) return;
    fcIdx.push({ i: i, fc: fc, cc: cc });
  });

  var filters = dashFilters(f);
  var months = new Array(M).fill(0), total = 0;
  var byFc = {}, byCc = {}, byGroup = {}, matrix = {}, ccSet = {};
  var personMonths = 0, zeroRows = 0, nRow = 0;
  var rowTotals = [];

  for (var r = 0; r < nR; r++) {
    var row = R.rows[r];
    if (!rowPasses(row, filters)) continue;
    nRow++;
    var hcSum = 0;
    for (var m = 0; m < M; m++) hcSum += (row.__m[m] || 0);
    personMonths += hcSum;

    var gv = f.groupCol ? String(row[f.groupCol] == null ? '' : row[f.groupCol]).trim() : t('dash.all_groups');
    if (!byGroup[gv]) byGroup[gv] = { total: 0, pm: 0, n: 0 };
    byGroup[gv].pm += hcSum; byGroup[gv].n++;

    var rowTotal = 0;
    for (var k = 0; k < fcIdx.length; k++) {
      var it = fcIdx[k], arr = R.data[it.i], base = r * M, sub = 0;
      for (var m2 = 0; m2 < M; m2++) { var v2 = arr[base + m2]; if (v2) { months[m2] += v2; sub += v2; } }
      if (!sub) continue;
      rowTotal += sub;
      byFc[it.fc.code] = (byFc[it.fc.code] || 0) + sub;
      byCc[it.cc] = (byCc[it.cc] || 0) + sub;
      ccSet[it.cc] = 1;
      var key = gv + '\u0001' + it.cc;
      matrix[key] = (matrix[key] || 0) + sub;
    }
    byGroup[gv].total += rowTotal;
    total += rowTotal;
    if (hcSum > 0) rowTotals.push(rowTotal / hcSum);
    if (!rowTotal && hcSum > 0) zeroRows++;
  }

  return {
    months: months, total: total, nRow: nRow, personMonths: personMonths,
    byFc: byFc, byCc: byCc, byGroup: byGroup, matrix: matrix, rowTotals: rowTotals,
    costCodes: Object.keys(ccSet).sort(), fcIdx: fcIdx, zeroRows: zeroRows, ccOf: ccOf, filters: filters
  };
}

/* ---------- biểu đồ 12 tháng có đường tham chiếu ---------- */
function barsMonthly(months, stats, picked) {
  var mx = Math.max.apply(null, months.concat([1]));
  var plot = el('div', { class: 'plot' });
  (picked || []).forEach(function (k) {
    var v = stats[k];
    if (!isFinite(v) || v <= 0) return;
    var def = STAT_DEFS.filter(function (s) { return s.k === k; })[0] || { t: k };
    plot.appendChild(el('div', { class: 'refline', style: 'bottom:' + (v / mx * 100) + '%' },
      [el('span', { text: def.t + ' ' + fmtShort(v) })]));
  });
  plot.appendChild(el('div', { class: 'bars' }, months.map(function (v, i) {
    var h = v / mx * 100;
    return el('div', { class: 'col', title: MONTHS[i] + ': ' + fmt(v) }, [
      el('div', { class: 'bval', style: 'bottom:' + h + '%', text: v ? fmtShort(v) : '' }),
      el('div', { class: 'bar', style: 'height:' + h + '%' })
    ]);
  })));
  return el('div', { class: 'chart' }, [
    plot,
    el('div', { class: 'xaxis' }, MONTHS.map(function (m) { return el('div', { text: m }); }))
  ]);
}

function hbar(v, mx) {
  return el('div', { class: 'hbar' }, [el('i', { style: 'width:' + (mx ? Math.round(v / mx * 100) : 0) + '%' })]);
}

function viewDashboard() {
  var wrap = el('div');
  var R = RESULT;
  if (!R) {
    wrap.appendChild(el('div', { class: 'panel' }, [el('div', { class: 'empty' }, [
      el('strong', { text: S.hc.rows.length ? t('dash.not_run') : t('msg.no_hc') }),
      el('span', { text: S.hc.rows.length ? t('dash.not_run_hint') : t('dash.no_hc_hint') }),
      S.hc.rows.length ? el('div', { style: 'margin-top:14px' }, [el('button', {
        class: 'btn go', style: 'padding:8px 18px', text: t('dash.chay_tinh_ngay'),
        onclick: function () { runBudget(); render(); }
      })]) : null
    ])]));
    return wrap;
  }

  var f = dashState();
  var groupCols = (S.classes || []).map(function (c) { return c.name; }).filter(Boolean)
    .concat((S.policies || []).reduce(function (acc, p) {
      (p.outs || []).forEach(function (o) { if (o && o.name && o.type === 'text') acc.push(o.name); });
      return acc;
    }, []))
    .concat(ENGINE.attrCols().map(function (c) { return c.alias; }));
  if (f.groupCol && groupCols.indexOf(f.groupCol) < 0) f.groupCol = '';
  if (!f.groupCol) f.groupCol = groupCols[0] || '';
  (f.extra || []).forEach(function (x) { if (x.col && groupCols.indexOf(x.col) < 0) { x.col = ''; x.val = ''; } });

  var A = dashAggregate(R, f);
  var nActive = A.filters.length + (f.costCode ? 1 : 0) + (f.formulaCode ? 1 : 0);

  /* ---------- bộ lọc ---------- */
  var allCc = {};
  (S.maps.costCode || []).forEach(function (x) { if (x.costCode) allCc[x.costCode] = 1; });

  function selBox(label, val, opts, onchange, w) {
    return el('div', { style: 'width:' + (w || 178) + 'px' }, [
      el('label', { class: 'f', text: label }),
      el('select', { onchange: onchange }, [el('option', { value: '', text: t('dash.all_option') })]
        .concat(opts.map(function (o) { return el('option', { value: o, selected: String(val) === String(o), text: o }); })))
    ]);
  }

  var extraBoxes = (f.extra || []).map(function (x, i) {
    var others = dashFilters(f).filter(function (ff) { return !(x.col && ff.col === x.col && ff.val === x.val); });
    var vals = x.col ? distinctUnder(R.rows, x.col, others) : [];
    return el('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, [
      el('div', { style: 'width:168px' }, [
        el('label', { class: 'f', text: t('dash.filter_col', { i: i + 1 }) }),
        el('select', {
          onchange: function (e) { x.col = e.target.value; x.val = ''; touch(); render(); }
        }, [el('option', { value: '', text: t('dash.khong_loc') })].concat(groupCols.map(function (c) {
          return el('option', { value: c, selected: x.col === c, text: c });
        })))
      ]),
      el('div', { style: 'width:168px' }, [
        el('label', { class: 'f', text: t('dash.gia_tri') }),
        el('select', {
          disabled: !x.col,
          onchange: function (e) { x.val = e.target.value; touch(); render(); }
        }, [el('option', { value: '', text: x.col ? t('dash.all_option') : '—' })].concat(vals.map(function (v) {
          return el('option', { value: v, selected: x.val === v, text: v });
        })))
      ])
    ]);
  });

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('dash.bo_loc') }),
      el('span', { class: 'tag' + (nActive ? ' g' : ''), text: nActive ? t('dash.n_conditions', { n: nActive }) : t('dash.all_data') }),
      el('div', { class: 'sp' }),
      el('button', {
        class: 'btn sm', text: t('dash.bo_loc_2'), onclick: function () {
          S.ui.dash = { groupCol: f.groupCol, sort: f.sort, stats: f.stats };
          touch(); render();
        }
      }),
      el('button', { class: 'btn sm go', text: t('dash.chay_lai'), onclick: function () { runBudget(); render(); } })
    ]),
    el('div', { class: 'body' }, [
      el('div', { class: 'row', style: 'margin-bottom:12px' }, [
        selBox('Cost Code', f.costCode, Object.keys(allCc).sort(), function (e) { f.costCode = e.target.value; f.formulaCode = ''; touch(); render(); }),
        selBox('Formula Code', f.formulaCode, R.formulas.filter(function (fc) {
          return !f.costCode || (A.ccOf[nkey(fc.code)] || t('engine.map.none')) === f.costCode;
        }).map(function (fc) { return fc.code; }), function (e) { f.formulaCode = e.target.value; touch(); render(); }),
        el('div', { style: 'width:178px' }, [
          el('label', { class: 'f', text: t('dash.phan_loai_theo') }),
          el('select', { onchange: function (e) { f.groupCol = e.target.value; f.groupVal = ''; touch(); render(); } },
            groupCols.map(function (c) { return el('option', { value: c, selected: f.groupCol === c, text: c }); }))
        ]),
        selBox(t('dash.group_value'), f.groupVal,
          f.groupCol ? distinctUnder(R.rows, f.groupCol, (f.extra || []).filter(function (x) { return x.col && x.val !== ''; })) : [],
          function (e) { f.groupVal = e.target.value; touch(); render(); })
      ]),
      el('div', { class: 'row', style: 'align-items:flex-start;gap:16px' }, extraBoxes)
    ])
  ]));

  /* ---------- tổng quan ---------- */
  var perHead = A.personMonths ? A.total / A.personMonths : 0;
  wrap.appendChild(el('div', { class: 'stats' }, [
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('dash.ngan_sach_trong_bo_loc') }), el('div', { class: 'v money', text: fmtShort(A.total) }), el('div', { class: 'u', text: t('dash.currency', { n: fmt(A.total) }) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('dash.binh_quan_thang') }), el('div', { class: 'v', text: fmtShort(A.total / 12) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('dash.binh_quan_dau_nguoi_thang') }), el('div', { class: 'v', text: fmtShort(perHead) }), el('div', { class: 'u', text: t('dash.person_months', { n: fmt(A.personMonths) }) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.dong_dinh_bien') }), el('div', { class: 'v', text: fmt(A.nRow) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('dash.dinh_bien_binh_quan') }), el('div', { class: 'v', text: fmt(A.personMonths / 12) })])
  ]));

  /* ---------- điểm cần soát ---------- */
  var flags = [];
  for (var m3 = 1; m3 < M; m3++) {
    var a1 = A.months[m3 - 1], b1 = A.months[m3];
    if (a1 > 0 && Math.abs(b1 - a1) / a1 > 0.15) {
      flags.push({ k: 'month', t: t('dash.flag_month', { m: MONTHS[m3], pct: (b1 > a1 ? '+' : '') + Math.round((b1 - a1) / a1 * 100), prev: MONTHS[m3 - 1] }), v: fmtShort(b1) });
    }
  }
  var gEntries = Object.keys(A.byGroup).map(function (g) {
    var x = A.byGroup[g];
    return { g: g, total: x.total, pm: x.pm, n: x.n, per: x.pm ? x.total / x.pm : 0 };
  }).filter(function (x) { return x.total > 0; });
  var baseline = perHead;
  function ratioOf(x) { return baseline ? x.per / baseline : 1; }
  var gFlags = [];
  gEntries.forEach(function (x) {
    if (!baseline || x.pm < 3) return;
    var rt = ratioOf(x);
    if (rt < 1.5 && rt > 0.6) return;
    var impact = (x.per - baseline) * x.pm;
    gFlags.push({
      k: 'group', impact: Math.abs(impact),
      t: t('dash.flag_group', {
        g: x.g,
        cmp: rt >= 1.5 ? t('dash.flag_group_high', { r: rt.toFixed(1) }) : t('dash.flag_group_low', { r: rt.toFixed(2) }),
        pm: fmt(x.pm),
        gap: (impact >= 0 ? '+' : '−') + fmtShort(Math.abs(impact))
      }),
      v: fmtShort(x.per)
    });
  });
  gFlags.sort(function (p, q) { return q.impact - p.impact; });
  gFlags.slice(0, 8).forEach(function (x) { flags.push(x); });
  R.formulas.forEach(function (fc, i) {
    if (!A.fcIdx.some(function (it) { return it.i === i; })) return;
    if (!A.byFc[fc.code]) flags.push({ k: 'fc', t: t('dash.flag_fc_zero', { code: fc.code }), v: '0' });
  });
  if (A.zeroRows) flags.push({ k: 'row', t: t('dash.flag_zero_rows', { n: A.zeroRows }), v: '' });
  var diffs = R.conflicts.filter(function (c) { return c.diff; });
  var excGap = 0;
  diffs.forEach(function (c) { excGap += (c.final - c.formula); });
  if (diffs.length) flags.push({ k: 'exc', t: t('dash.flag_exc', { n: diffs.length, dir: excGap >= 0 ? t('dash.dir_up') : t('dash.dir_down'), amt: fmtShort(Math.abs(excGap)) }), v: '' });
  (R.warnings || []).slice(0, 6).forEach(function (w) { flags.push({ k: 'warn', t: w.msg, v: '' }); });

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('dash.diem_can_soat') }),
      el('span', { class: 'tag' + (flags.length ? ' o' : ' g'), text: flags.length ? t('dash.n_points', { n: flags.length }) : t('dash.no_anomaly') })
    ]),
    el('div', { class: 'body tight' }, [
      flags.length ? el('div', { class: 'tw', style: 'max-height:290px' }, [
        el('table', {}, [el('tbody', {}, flags.map(function (x) {
          return el('tr', {}, [
            el('td', { style: 'width:110px' }, [el('span', { class: 'tag ' + (x.k === 'warn' ? '' : 'o'), text: ({ month: t('dash.kind_month'), group: t('dash.kind_group'), fc: t('export.audit.formula'), row: t('dash.kind_row'), exc: t('dash.kind_exc'), warn: t('dash.kind_warn') })[x.k] })]),
            el('td', { text: x.t }),
            el('td', { class: 'num', style: 'width:110px', text: x.v })
          ]);
        }))])
      ]) : el('div', { class: 'empty', text: t('dash.khong_phat_hien_diem_bat_thuong') })
    ])
  ]));

  /* ---------- chỉ số thống kê ---------- */
  var series = [
    { t: t('dash.series_months'), u: t('dash.series_months_unit'), xs: A.months },
    { t: t('dash.series_group', { col: f.groupCol }), u: t('fm.n_groups', { n: gEntries.length }), xs: gEntries.map(function (x) { return x.per; }) },
    { t: t('dash.series_rows'), u: t('table.info.rows', { n: A.rowTotals.length }), xs: A.rowTotals },
    { t: t('dash.series_fc'), u: t('dash.n_formulas', { n: Object.keys(A.byFc).length }), xs: Object.keys(A.byFc).map(function (c) { return A.byFc[c]; }) }
  ];
  var picked = STAT_DEFS.filter(function (s) { return f.stats.indexOf(s.k) >= 0; });
  var monthStats = seriesStats(A.months);

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('dash.chi_so_thong_ke') }), el('div', { class: 'sp' }),
      el('div', { class: 'chips' }, STAT_DEFS.map(function (s) {
        var on = f.stats.indexOf(s.k) >= 0;
        return el('span', {
          class: 'chip', style: on ? 'background:var(--mineral);color:#fff;border-color:var(--mineral)' : '',
          text: s.t, onclick: function () {
            f.stats = on ? f.stats.filter(function (x) { return x !== s.k; }) : f.stats.concat([s.k]);
            touch(); render();
          }
        });
      }))
    ]),
    el('div', { class: 'body' }, [el('p', {
      class: 'hint',
      html: t('dash.stats_help')
    })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw', style: 'max-height:none' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', { text: t('dash.day_so') }), el('th', { class: 'num', text: t('dash.so_phan_tu') })]
          .concat(picked.map(function (s) { return el('th', { class: 'num', text: s.t }); })))]),
        el('tbody', {}, series.map(function (se) {
          var st = seriesStats(se.xs);
          return el('tr', {}, [el('td', {}, [el('div', { text: se.t }), el('div', { class: 'fxok', text: se.u })]),
          el('td', { class: 'num', text: fmt(st.n) })]
            .concat(picked.map(function (s) { return el('td', { class: 'num', text: st.n ? fmt(st[s.k]) : '–' }); })));
        }))
      ])
    ])])
  ]));

  /* ---------- diễn biến 12 tháng ---------- */
  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('dash.dien_bien_12_thang') }), el('div', { class: 'sp' }),
    el('span', { class: 'tag', text: t('dash.spread', { n: fmtShort(monthStats.max - monthStats.min) }) })]),
    el('div', { class: 'body' }, [barsMonthly(A.months, monthStats, f.stats)])
  ]));

  /* ---------- cơ cấu theo Cost Code ---------- */
  var ccRows = Object.keys(A.byCc).map(function (c) { return { c: c, v: A.byCc[c] }; })
    .sort(function (p, q) { return q.v - p.v; });
  var ccMax = ccRows.length ? ccRows[0].v : 0;
  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('dash.co_cau_theo_cost_code') }), el('span', { class: 'tag', text: t('dash.n_codes', { n: ccRows.length }) })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Cost Code' }), el('th', { style: 'width:36%', text: t('dash.ty_trong') }), el('th', { class: 'num', text: t('fm.full_year') }), el('th', { class: 'num', text: '%' })])]),
        el('tbody', {}, ccRows.map(function (x) {
          return el('tr', {
            style: 'cursor:pointer', title: t('dash.bam_de_loc_theo_ma_nay'),
            onclick: function () { f.costCode = f.costCode === x.c ? '' : x.c; f.formulaCode = ''; touch(); render(); }
          }, [
            el('td', { class: 'mono', text: x.c }),
            el('td', {}, [hbar(x.v, ccMax)]),
            el('td', { class: 'num', text: fmt(x.v) }),
            el('td', { class: 'num', text: A.total ? (x.v / A.total * 100).toFixed(1) + '%' : '' })
          ]);
        }))
      ])
    ])])
  ]));

  /* ---------- chi tiết Formula Code ---------- */
  var fcRows = Object.keys(A.byFc).map(function (c) { return { c: c, v: A.byFc[c] }; })
    .sort(function (p, q) { return q.v - p.v; });
  var fcMax = fcRows.length ? fcRows[0].v : 0;
  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('dash.chi_tiet_theo_formula_code') }), el('span', { class: 'tag', text: t('dash.n_formulas', { n: fcRows.length }) })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Formula Code' }), el('th', { text: 'Cost Code' }), el('th', { style: 'width:28%', text: t('dash.ty_trong') }), el('th', { class: 'num', text: t('fm.full_year') }), el('th', { class: 'num', text: '%' })])]),
        el('tbody', {}, fcRows.map(function (x) {
          return el('tr', {
            style: 'cursor:pointer', onclick: function () { f.formulaCode = f.formulaCode === x.c ? '' : x.c; touch(); render(); }
          }, [
            el('td', { class: 'mono', text: x.c }),
            el('td', { class: 'mono', text: A.ccOf[nkey(x.c)] || t('engine.map.none') }),
            el('td', {}, [hbar(x.v, fcMax)]),
            el('td', { class: 'num', text: fmt(x.v) }),
            el('td', { class: 'num', text: A.total ? (x.v / A.total * 100).toFixed(1) + '%' : '' })
          ]);
        }))
      ])
    ])])
  ]));

  /* ---------- ma trận nhóm × Cost Code ---------- */
  if (f.groupCol) {
    var gs = gEntries.slice().sort(function (p, q) {
      return f.sort === 'per' ? q.per - p.per : q.total - p.total;
    });
    var ccs = A.costCodes;
    var head = [el('th', { text: f.groupCol }), el('th', { class: 'num', text: t('dash.nguoi_thang') })]
      .concat(ccs.map(function (c) { return el('th', { class: 'num', text: c }); }))
      .concat([el('th', { class: 'num', text: t('fm.full_year') }), el('th', { class: 'num', text: t('dash.bq_dau_nguoi_thang') })]);

    var body = gs.map(function (x) {
      var rt = ratioOf(x);
      var cls = (baseline && x.pm >= 3 && rt >= 1.5) ? 'o' : ((baseline && x.pm >= 3 && rt <= 0.6) ? 'g' : '');
      return el('tr', {
        style: 'cursor:pointer', onclick: function () { f.groupVal = f.groupVal === x.g ? '' : x.g; touch(); render(); }
      }, [
        el('td', { text: x.g }),
        el('td', { class: 'num', text: fmt(x.pm) })
      ].concat(ccs.map(function (c) {
        var v = A.matrix[x.g + '\u0001' + c] || 0;
        return el('td', { class: 'num' + (v ? '' : ' zero'), text: v ? fmt(v) : '–' });
      })).concat([
        el('td', { class: 'num', text: fmt(x.total) }),
        el('td', { class: 'num' }, [cls ? el('span', { class: 'tag ' + cls, text: fmtShort(x.per) }) : el('span', { text: fmtShort(x.per) })])
      ]));
    });

    /* dòng chỉ số thống kê trên cột bình quân đầu người */
    var perStats = seriesStats(gEntries.map(function (x) { return x.per; }));
    picked.forEach(function (s) {
      body.push(el('tr', { class: 'statrow' },
        [el('td', {}, [el('span', { class: 'tag', text: s.t })]), el('td', {})]
          .concat(ccs.map(function () { return el('td', {}); }))
          .concat([el('td', {}), el('td', { class: 'num', text: fmt(perStats[s.k]) })])));
    });
    var totRow = [el('td', { text: t('export.total') }), el('td', { class: 'num', text: fmt(A.personMonths) })]
      .concat(ccs.map(function (c) { return el('td', { class: 'num', text: fmt(A.byCc[c] || 0) }); }))
      .concat([el('td', { class: 'num', text: fmt(A.total) }), el('td', { class: 'num', text: fmtShort(perHead) })]);
    body.push(el('tr', { class: 'tot' }, totRow));

    wrap.appendChild(el('div', { class: 'panel' }, [
      el('header', {}, [
        el('h3', { text: t('dash.matrix_title', { col: f.groupCol }) }),
        el('span', { class: 'tag', text: t('fm.n_groups', { n: gs.length }) }),
        el('div', { class: 'sp' }),
        el('button', {
          class: 'btn sm', text: f.sort === 'per' ? t('dash.sort_per') : t('dash.sort_total'),
          onclick: function () { f.sort = f.sort === 'per' ? 'total' : 'per'; touch(); render(); }
        })
      ]),
      el('div', { class: 'body' }, [el('p', {
        class: 'hint',
        html: t('dash.matrix_help', { base: fmt(Math.round(baseline)) })
      })]),
      el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
        el('table', {}, [el('thead', {}, [el('tr', {}, head)]), el('tbody', {}, body)])
      ])])
    ]));
  }

  return wrap;
}



export { STAT_DEFS, dashState, pctile, seriesStats, dashFilters, rowPasses, distinctUnder, dashAggregate, barsMonthly, hbar, viewDashboard };
