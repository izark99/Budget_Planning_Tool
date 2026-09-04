/* ===========================================================
   MÀN 11 — DASHBOARD SOÁT SỐ
   Tách nguyên văn từ khối 07b-view-dashboard.js.
   =========================================================== */
import { M, MONTHS, RESULT, S, fmt, fmtNum, fmtShort, nkey, touch } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { el, render } from '../ui/dom.js';
import { pager } from '../ui/widgets.js';
import { runBudget } from './result.js';

/* ==== 07b-view-dashboard.js ==== */
/* ===========================================================
   MÀN — DASHBOARD SOÁT SỐ
   Chiều chính: Cost Code / Formula Code × một cột phân loại
   Thêm ba bộ lọc đi sâu và các chỉ số thống kê trên dãy số
   =========================================================== */
const STAT_DEFS = [
  { k: 'min', t: 'Min' },
  { k: 'p25', t: 'P25' },
  { k: 'median', t: 'Median' },
  { k: 'mean', t: 'Mean' },
  { k: 'p75', t: 'P75' },
  { k: 'max', t: 'Max' }
];

/** Bộ lọc của màn Bảng điều khiển, tạo sẵn giá trị mặc định nếu chưa có.
 *  @returns {DashFilters} */
function dashState() {
  const f = /** @type {DashFilters} */ (S.ui.dash = S.ui.dash || {});
  /* Từ đây trở xuống mọi trường đều được điền, nên f đúng là DashFilters đủ bộ. */
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
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function seriesStats(xs) {
  const a = xs.filter((v) => { return isFinite(v); }).slice().sort((x, y) => { return x - y; });
  if (!a.length) return { min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0, n: 0, sum: 0 };
  const sum = a.reduce((s, v) => { return s + v; }, 0);
  return {
    n: a.length, sum, min: a[0], max: a[a.length - 1], mean: sum / a.length,
    median: pctile(a, 0.5), p25: pctile(a, 0.25), p75: pctile(a, 0.75)
  };
}

/* ---------- gom số theo bộ lọc ---------- */
function dashFilters(f) {
  const out = [];
  if (f.groupCol && f.groupVal !== '') out.push({ col: f.groupCol, val: f.groupVal });
  (f.extra || []).forEach((x) => { if (x.col && x.val !== '') out.push({ col: x.col, val: x.val }); });
  return out;
}
function rowPasses(row, filters) {
  for (let i = 0; i < filters.length; i++) {
    const v = row[filters[i].col];
    if (String(v == null ? '' : v).trim() !== filters[i].val) return false;
  }
  return true;
}
/* giá trị còn chọn được của một ô lọc, sau khi đã áp các ô lọc khác */
function distinctUnder(rows, col, others) {
  const seen = {}, out = [];
  for (let i = 0; i < rows.length; i++) {
    if (!rowPasses(rows[i], others)) continue;
    const v = String(rows[i][col] == null ? '' : rows[i][col]).trim();
    if (v === '' || seen[v]) continue;
    seen[v] = 1; out.push(v);
  }
  return out.sort();
}

function dashAggregate(R, f) {
  const nR = R.rows.length;
  const ccOf = {};
  (S.maps.costCode || []).forEach((x) => { ccOf[nkey(x.formulaCode)] = x.costCode || t('engine.map.none'); });

  const fcIdx = [];
  R.formulas.forEach((fc, i) => {
    const cc = ccOf[nkey(fc.code)] || t('engine.map.none');
    if (f.costCode && cc !== f.costCode) return;
    if (f.formulaCode && fc.code !== f.formulaCode) return;
    fcIdx.push({ i, fc, cc });
  });

  const filters = dashFilters(f);
  const months = new Array(M).fill(0); let total = 0;
  const byFc = {}, byCc = {}, byGroup = {}, matrix = {}, ccSet = {};
  let personMonths = 0, zeroRows = 0, nRow = 0;
  /* Ảnh hưởng tăng lương gộp trong CHÍNH vòng lặp này, nên nó tôn trọng đủ mọi
     bộ lọc đang bật — không phải con số toàn cục dán vào. */
  const noR = R.dataNoRaise;
  let totalNoRaise = 0;
  const rowTotals = [];

  for (let r = 0; r < nR; r++) {
    const row = R.rows[r];
    if (!rowPasses(row, filters)) continue;
    nRow++;
    let hcSum = 0;
    for (let m = 0; m < M; m++) hcSum += (row.__m[m] || 0);
    personMonths += hcSum;

    const gv = f.groupCol ? String(row[f.groupCol] == null ? '' : row[f.groupCol]).trim() : t('dash.all_groups');
    if (!byGroup[gv]) byGroup[gv] = { total: 0, pm: 0, n: 0, noRaise: 0 };
    byGroup[gv].pm += hcSum; byGroup[gv].n++;

    let rowTotal = 0, rowNoRaise = 0;
    for (let k = 0; k < fcIdx.length; k++) {
      const it = fcIdx[k], arr = R.data[it.i], base = r * M; let sub = 0;
      for (let m2 = 0; m2 < M; m2++) { const v2 = arr[base + m2]; if (v2) { months[m2] += v2; sub += v2; } }
      if (noR) { const a0 = noR[it.i]; for (let m3 = 0; m3 < M; m3++) rowNoRaise += a0[base + m3]; }
      if (!sub) continue;
      rowTotal += sub;
      byFc[it.fc.code] = (byFc[it.fc.code] || 0) + sub;
      byCc[it.cc] = (byCc[it.cc] || 0) + sub;
      ccSet[it.cc] = 1;
      const key = gv + '\u0001' + it.cc;
      matrix[key] = (matrix[key] || 0) + sub;
    }
    byGroup[gv].total += rowTotal;
    byGroup[gv].noRaise += rowNoRaise;
    total += rowTotal; totalNoRaise += rowNoRaise;
    if (hcSum > 0) rowTotals.push(rowTotal / hcSum);
    if (!rowTotal && hcSum > 0) zeroRows++;
  }

  return {
    months, total, nRow, personMonths,
    /* raise = phần do tăng lương, trong đúng bộ lọc đang bật. */
    raise: noR ? total - totalNoRaise : null,
    byFc, byCc, byGroup, matrix, rowTotals,
    costCodes: Object.keys(ccSet).sort(), fcIdx, zeroRows, ccOf, filters
  };
}

/* ---------- biểu đồ 12 tháng có đường tham chiếu ---------- */
function barsMonthly(months, stats, picked) {
  const mx = Math.max.apply(null, months.concat([1]));
  const plot = el('div', { class: 'plot' });
  (picked || []).forEach((k) => {
    const v = stats[k];
    if (!isFinite(v) || v <= 0) return;
    const def = STAT_DEFS.filter((s) => { return s.k === k; })[0] || { t: k };
    plot.appendChild(el('div', { class: 'refline', style: 'bottom:' + (v / mx * 100) + '%' },
      [el('span', { text: def.t + ' ' + fmtShort(v) })]));
  });
  plot.appendChild(el('div', { class: 'bars' }, months.map((v, i) => {
    const h = v / mx * 100;
    return el('div', { class: 'col', title: MONTHS[i] + ': ' + fmt(v) }, [
      el('div', { class: 'bval', style: 'bottom:' + h + '%', text: v ? fmtShort(v) : '' }),
      el('div', { class: 'bar', style: 'height:' + h + '%' })
    ]);
  })));
  return el('div', { class: 'chart' }, [
    plot,
    el('div', { class: 'xaxis' }, MONTHS.map((m) => { return el('div', { text: m }); }))
  ]);
}

function hbar(v, mx) {
  return el('div', { class: 'hbar' }, [el('i', { style: 'width:' + (mx ? Math.round(v / mx * 100) : 0) + '%' })]);
}

function viewDashboard() {
  const wrap = el('div');
  const R = RESULT;
  if (!R) {
    wrap.appendChild(el('div', { class: 'panel' }, [el('div', { class: 'empty' }, [
      el('strong', { text: S.hc.rows.length ? t('dash.not_run') : t('msg.no_hc') }),
      el('span', { text: S.hc.rows.length ? t('dash.not_run_hint') : t('dash.no_hc_hint') }),
      S.hc.rows.length ? el('div', { style: 'margin-top:14px' }, [el('button', {
        class: 'btn go', style: 'padding:8px 18px', text: t('dash.chay_tinh_ngay'),
        onclick: function () { runBudget().then(render); }
      })]) : null
    ])]));
    return wrap;
  }

  const f = dashState();
  const groupCols = ENGINE.classCols()
    .concat((S.policies || []).reduce((acc, p) => {
      (p.outs || []).forEach((o) => { if (o && o.name && o.type === 'text') acc.push(o.name); });
      return acc;
    }, []))
    .concat(ENGINE.attrCols().map((c) => { return c.alias; }));
  if (f.groupCol && groupCols.indexOf(f.groupCol) < 0) f.groupCol = '';
  if (!f.groupCol) f.groupCol = groupCols[0] || '';
  (f.extra || []).forEach((x) => { if (x.col && groupCols.indexOf(x.col) < 0) { x.col = ''; x.val = ''; } });

  const A = dashAggregate(R, f);
  const nActive = A.filters.length + (f.costCode ? 1 : 0) + (f.formulaCode ? 1 : 0);

  /* ---------- bộ lọc ---------- */
  const allCc = {};
  (S.maps.costCode || []).forEach((x) => { if (x.costCode) allCc[x.costCode] = 1; });

  function selBox(label, val, opts, onchange, w) {
    return el('div', { style: 'width:' + (w || 178) + 'px' }, [
      el('label', { class: 'f', text: label }),
      el('select', { onchange }, [el('option', { value: '', text: t('dash.all_option') })]
        .concat(opts.map((o) => { return el('option', { value: o, selected: String(val) === String(o), text: o }); })))
    ]);
  }

  const extraBoxes = (f.extra || []).map((x, i) => {
    const others = dashFilters(f).filter((ff) => { return !(x.col && ff.col === x.col && ff.val === x.val); });
    const vals = x.col ? distinctUnder(R.rows, x.col, others) : [];
    return el('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, [
      el('div', { style: 'width:168px' }, [
        el('label', { class: 'f', text: t('dash.filter_col', { i: i + 1 }) }),
        el('select', {
          onchange: function (e) { x.col = e.target.value; x.val = ''; touch(); render(); }
        }, [el('option', { value: '', text: t('dash.khong_loc') })].concat(groupCols.map((c) => {
          return el('option', { value: c, selected: x.col === c, text: c });
        })))
      ]),
      el('div', { style: 'width:168px' }, [
        el('label', { class: 'f', text: t('dash.gia_tri') }),
        el('select', {
          disabled: !x.col,
          onchange: function (e) { x.val = e.target.value; touch(); render(); }
        }, [el('option', { value: '', text: x.col ? t('dash.all_option') : '—' })].concat(vals.map((v) => {
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
      el('button', { class: 'btn sm go', text: t('dash.chay_lai'), onclick: function () { runBudget().then(render); } })
    ]),
    el('div', { class: 'body' }, [
      el('div', { class: 'row', style: 'margin-bottom:12px' }, [
        selBox('Cost Code', f.costCode, Object.keys(allCc).sort(), (e) => { f.costCode = e.target.value; f.formulaCode = ''; touch(); render(); }),
        selBox('Formula Code', f.formulaCode, R.formulas.filter((fc) => {
          return !f.costCode || (A.ccOf[nkey(fc.code)] || t('engine.map.none')) === f.costCode;
        }).map((fc) => { return fc.code; }), (e) => { f.formulaCode = e.target.value; touch(); render(); }),
        el('div', { style: 'width:178px' }, [
          el('label', { class: 'f', text: t('dash.phan_loai_theo') }),
          el('select', { onchange: function (e) { f.groupCol = e.target.value; f.groupVal = ''; touch(); render(); } },
            groupCols.map((c) => { return el('option', { value: c, selected: f.groupCol === c, text: c }); }))
        ]),
        selBox(t('dash.group_value'), f.groupVal,
          f.groupCol ? distinctUnder(R.rows, f.groupCol, (f.extra || []).filter((x) => { return x.col && x.val !== ''; })) : [],
          (e) => { f.groupVal = e.target.value; touch(); render(); })
      ]),
      el('div', { class: 'row', style: 'align-items:flex-start;gap:16px' }, extraBoxes)
    ])
  ]));

  /* ---------- tổng quan ---------- */
  const perHead = A.personMonths ? A.total / A.personMonths : 0;
  wrap.appendChild(el('div', { class: 'stats' }, [
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('dash.ngan_sach_trong_bo_loc') }), el('div', { class: 'v money', text: fmtShort(A.total) }), el('div', { class: 'u', text: t('dash.currency', { n: fmt(A.total) }) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('dash.binh_quan_thang') }), el('div', { class: 'v', text: fmtShort(A.total / 12) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('dash.binh_quan_dau_nguoi_thang') }), el('div', { class: 'v', text: fmtShort(perHead) }), el('div', { class: 'u', text: t('dash.person_months', { n: fmt(A.personMonths) }) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.dong_dinh_bien') }), el('div', { class: 'v', text: fmt(A.nRow) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('dash.dinh_bien_binh_quan') }), el('div', { class: 'v', text: fmt(A.personMonths / 12) })]),
    /* Chỉ hiện khi có khai đợt tăng lương — không thì thêm một ô rỗng vô nghĩa. */
    A.raise === null ? null : el('div', { class: 'stat' }, [
      el('div', { class: 'k', text: t('dash.do_tang_luong') }),
      el('div', { class: 'v money', text: fmtShort(A.raise) }),
      /* Con số CHÍNH XÁC ở dòng phụ, như mọi thẻ tiền khác — .v chỉ là bản rút gọn. */
      el('div', { class: 'u', text: t('dash.raise_share', {
        n: fmt(A.raise), p: fmtNum(A.total ? Math.round(A.raise / A.total * 1000) / 10 : 0)
      }) })
    ])
  ].filter(Boolean)));

  /* ---------- điểm cần soát ---------- */
  const flags = [];
  for (let m3 = 1; m3 < M; m3++) {
    const a1 = A.months[m3 - 1], b1 = A.months[m3];
    if (a1 > 0 && Math.abs(b1 - a1) / a1 > 0.15) {
      flags.push({ k: 'month', t: t('dash.flag_month', { m: MONTHS[m3], pct: (b1 > a1 ? '+' : '') + Math.round((b1 - a1) / a1 * 100), prev: MONTHS[m3 - 1] }), v: fmtShort(b1) });
    }
  }
  const gEntries = Object.keys(A.byGroup).map((g) => {
    const x = A.byGroup[g];
    return { g, total: x.total, pm: x.pm, n: x.n, per: x.pm ? x.total / x.pm : 0 };
  }).filter((x) => { return x.total > 0; });
  const baseline = perHead;
  function ratioOf(x) { return baseline ? x.per / baseline : 1; }
  const gFlags = [];
  gEntries.forEach((x) => {
    if (!baseline || x.pm < 3) return;
    const rt = ratioOf(x);
    if (rt < 1.5 && rt > 0.6) return;
    const impact = (x.per - baseline) * x.pm;
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
  gFlags.sort((p, q) => { return q.impact - p.impact; });
  gFlags.slice(0, 8).forEach((x) => { flags.push(x); });
  R.formulas.forEach((fc, i) => {
    if (!A.fcIdx.some((it) => { return it.i === i; })) return;
    if (!A.byFc[fc.code]) flags.push({ k: 'fc', t: t('dash.flag_fc_zero', { code: fc.code }), v: '0' });
  });
  if (A.zeroRows) flags.push({ k: 'row', t: t('dash.flag_zero_rows', { n: A.zeroRows }), v: '' });
  const diffs = R.conflicts.filter((c) => { return c.diff; });
  let excGap = 0;
  diffs.forEach((c) => { excGap += (c.final - c.formula); });
  if (diffs.length) flags.push({ k: 'exc', t: t('dash.flag_exc', { n: diffs.length, dir: excGap >= 0 ? t('dash.dir_up') : t('dash.dir_down'), amt: fmtShort(Math.abs(excGap)) }), v: '' });
  (R.warnings || []).slice(0, 6).forEach((w) => { flags.push({ k: 'warn', t: w.msg, v: '' }); });

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('dash.diem_can_soat') }),
      el('span', { class: 'tag' + (flags.length ? ' o' : ' g'), text: flags.length ? t('dash.n_points', { n: flags.length }) : t('dash.no_anomaly') })
    ]),
    el('div', { class: 'body tight' }, [
      flags.length ? el('div', { class: 'tw', style: 'max-height:290px' }, [
        el('table', {}, [el('tbody', {}, flags.map((x) => {
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
  const series = [
    { t: t('dash.series_months'), u: t('dash.series_months_unit'), xs: A.months },
    { t: t('dash.series_group', { col: f.groupCol }), u: t('fm.n_groups', { n: gEntries.length }), xs: gEntries.map((x) => { return x.per; }) },
    { t: t('dash.series_rows'), u: t('table.info.rows', { n: A.rowTotals.length }), xs: A.rowTotals },
    { t: t('dash.series_fc'), u: t('dash.n_formulas', { n: Object.keys(A.byFc).length }), xs: Object.keys(A.byFc).map((c) => { return A.byFc[c]; }) }
  ];
  const picked = STAT_DEFS.filter((s) => { return f.stats.indexOf(s.k) >= 0; });
  const monthStats = seriesStats(A.months);

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('dash.chi_so_thong_ke') }), el('div', { class: 'sp' }),
      el('div', { class: 'chips' }, STAT_DEFS.map((s) => {
        const on = f.stats.indexOf(s.k) >= 0;
        return el('span', {
          class: 'chip' + (on ? ' on' : ''),
          text: s.t, onclick: function () {
            f.stats = on ? f.stats.filter((x) => { return x !== s.k; }) : f.stats.concat([s.k]);
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
          .concat(picked.map((s) => { return el('th', { class: 'num', text: s.t }); })))]),
        el('tbody', {}, series.map((se) => {
          const st = seriesStats(se.xs);
          return el('tr', {}, [el('td', {}, [el('div', { text: se.t }), el('div', { class: 'fxok', text: se.u })]),
          el('td', { class: 'num', text: fmt(st.n) })]
            .concat(picked.map((s) => { return el('td', { class: 'num', text: st.n ? fmt(st[s.k]) : '–' }); })));
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
  const ccRows = Object.keys(A.byCc).map((c) => { return { c, v: A.byCc[c] }; })
    .sort((p, q) => { return q.v - p.v; });
  const ccMax = ccRows.length ? ccRows[0].v : 0;
  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('dash.co_cau_theo_cost_code') }), el('span', { class: 'tag', text: t('dash.n_codes', { n: ccRows.length }) })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Cost Code' }), el('th', { style: 'width:36%', text: t('dash.ty_trong') }), el('th', { class: 'num', text: t('fm.full_year') }), el('th', { class: 'num', text: '%' })])]),
        el('tbody', {}, ccRows.map((x) => {
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
  const fcRows = Object.keys(A.byFc).map((c) => { return { c, v: A.byFc[c] }; })
    .sort((p, q) => { return q.v - p.v; });
  const fcMax = fcRows.length ? fcRows[0].v : 0;
  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('dash.chi_tiet_theo_formula_code') }), el('span', { class: 'tag', text: t('dash.n_formulas', { n: fcRows.length }) })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Formula Code' }), el('th', { text: 'Cost Code' }), el('th', { style: 'width:28%', text: t('dash.ty_trong') }), el('th', { class: 'num', text: t('fm.full_year') }), el('th', { class: 'num', text: '%' })])]),
        el('tbody', {}, fcRows.map((x) => {
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
    const gs = gEntries.slice().sort((p, q) => {
      return f.sort === 'per' ? q.per - p.per : q.total - p.total;
    });
    const ccs = A.costCodes;
    const showRaise = A.raise !== null;
    const head = [el('th', { text: f.groupCol }), el('th', { class: 'num', text: t('dash.nguoi_thang') })]
      .concat(ccs.map((c) => { return el('th', { class: 'num', text: c }); }))
      .concat([el('th', { class: 'num', text: t('fm.full_year') })])
      .concat(showRaise ? [el('th', { class: 'num', text: t('dash.do_tang_luong') })] : [])
      .concat([el('th', { class: 'num', text: t('dash.bq_dau_nguoi_thang') })]);

    /* Chỉ PHÂN TRANG các dòng nhóm; hàng thống kê và hàng tổng luôn nằm cuối
       bảng, không bao giờ bị đẩy sang trang khác. */
    const pgDash = pager(() => { drawGroups(); });
    const groupTb = el('tbody');
    const mkRow = (x) => {
      const rt = ratioOf(x);
      const cls = (baseline && x.pm >= 3 && rt >= 1.5) ? 'o' : ((baseline && x.pm >= 3 && rt <= 0.6) ? 'g' : '');
      return el('tr', {
        style: 'cursor:pointer', onclick: function () { f.groupVal = f.groupVal === x.g ? '' : x.g; touch(); render(); }
      }, [
        el('td', { text: x.g }),
        el('td', { class: 'num', text: fmt(x.pm) })
      ].concat(ccs.map((c) => {
        const v = A.matrix[x.g + '\u0001' + c] || 0;
        return el('td', { class: 'num' + (v ? '' : ' zero'), text: v ? fmt(v) : '–' });
      })).concat([
        el('td', { class: 'num', text: fmt(x.total) })
      ]).concat(showRaise ? [(function () {
        const up = x.total - x.noRaise;
        return el('td', { class: 'num' + (up ? '' : ' zero'), text: up ? fmt(up) : '–' });
      })()] : []).concat([
        el('td', { class: 'num' }, [cls ? el('span', { class: 'tag ' + cls, text: fmtShort(x.per) }) : el('span', { text: fmtShort(x.per) })])
      ]));
    };

    /* dòng chỉ số thống kê trên cột bình quân đầu người */
    const perStats = seriesStats(gEntries.map((x) => { return x.per; }));
    function drawGroups() {
      groupTb.innerHTML = '';
      pgDash.apply(gs).forEach((x) => { groupTb.appendChild(mkRow(x)); });
      picked.forEach((sd) => {
        groupTb.appendChild(el('tr', { class: 'statrow' },
          [el('td', {}, [el('span', { class: 'tag', text: sd.t })]), el('td', {})]
            .concat(ccs.map(() => { return el('td', {}); }))
            .concat([el('td', {})])
            .concat(showRaise ? [el('td', {})] : [])
            .concat([el('td', { class: 'num', text: fmt(perStats[sd.k]) })])));
      });
      groupTb.appendChild(el('tr', { class: 'tot' },
        [el('td', { text: t('export.total') }), el('td', { class: 'num', text: fmt(A.personMonths) })]
          .concat(ccs.map((c) => { return el('td', { class: 'num', text: fmt(A.byCc[c] || 0) }); }))
          .concat([el('td', { class: 'num', text: fmt(A.total) })])
          .concat(showRaise ? [el('td', { class: 'num', text: fmt(A.raise) })] : [])
          .concat([el('td', { class: 'num', text: fmtShort(perHead) })])));
    }
    drawGroups();

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
        el('table', {}, [el('thead', {}, [el('tr', {}, head)]), groupTb])
      ])]),
      el('div', { class: 'body' }, [pgDash.node])
    ]));
  }

  return wrap;
}



export { STAT_DEFS, dashState, pctile, seriesStats, dashFilters, rowPasses, distinctUnder, dashAggregate, barsMonthly, hbar, viewDashboard };
