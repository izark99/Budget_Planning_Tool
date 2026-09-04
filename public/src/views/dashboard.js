/* ===========================================================
   MÀN 11 — DASHBOARD SOÁT SỐ
   Tách nguyên văn từ khối 07b-view-dashboard.js.
   =========================================================== */
import { M, MONTHS, RESULT, S, fmt, fmtNum, fmtShort, nkey, touch } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { el, render, renderSoon } from '../ui/dom.js';
import { pager } from '../ui/widgets.js';
import { runBudget } from './result.js';

/* ==== 07b-view-dashboard.js ==== */
/* ===========================================================
   MÀN — DASHBOARD SOÁT SỐ
   Chiều chính: Cost Code / Formula Code × một cột phân loại
   Thêm ba bộ lọc đi sâu và các chỉ số thống kê trên dãy số
   =========================================================== */
/* Ba chiều cột "ngang" của bảng pivot, không phải cột của bảng định biên. Tiền
   tố __ để không bao giờ đụng một cột thật tên "Tháng". */
const PV_CC = '__cc', PV_FC = '__fc', PV_MONTH = '__month';
/* Khoá của cột gộp phần vượt trần. */
const PV_OTHER = '__other';

/** Trần số cột của bảng pivot. Chọn một cột như Position/ID thì có thể ra hàng
    trăm cột; phần vượt trần được GỘP vào một cột "Khác" chứ không cắt bỏ, để
    cột Tổng luôn cộng đúng. */
const PV_MAX_COLS = 40;

/* Ký tự nối khoá dòng nhiều cấp — cùng ký tự applyClasses dùng. */
const SEP = '\u0001';

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
  /* Bảng pivot: dòng chọn được NHIỀU cột, cột chọn đúng một chiều. Dự án cũ
     chưa có hai trường này — điền mặc định để mở lên vẫn ra đúng bảng như
     trước (dòng = cột phân loại đang chọn, cột = Cost Code). */
  /* null = CHƯA cấu hình (điền mặc định ở nơi dựng, khi đã biết cột phân loại);
     [] = người dùng đã cố ý bỏ hết. Phân biệt hai thứ đó, nếu không thì bỏ hết
     chip xong lần vẽ sau lại tự điền lại. */
  if (f.pivotRows === undefined) f.pivotRows = null;
  if (f.pivotRows !== null && !Array.isArray(f.pivotRows)) f.pivotRows = null;
  if (!f.pivotCol) f.pivotCol = PV_CC;
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
  /* Bản cộng SONG SONG cho phần do tăng lương, ở mọi chiều mà màn hình vẽ ra.
     Tất cả nằm trong CHÍNH vòng lặp đã lọc bên dưới, nên chúng tôn trọng đủ mọi
     bộ lọc đang bật — không phải con số toàn cục dán vào. */
  const monthsRaise = new Array(M).fill(0);
  const byFc = {}, byCc = {}, byGroup = {};
  const byFcRaise = {}, byCcRaise = {};
  let personMonths = 0, zeroRows = 0, nRow = 0;
  const noR = R.dataNoRaise;
  let totalNoRaise = 0;
  const rowTotals = [];

  /* --- bảng pivot do người dùng cấu hình --- */
  const pvRows = (f.pivotRows || []).filter(Boolean);
  const pvCol = f.pivotCol || PV_CC;
  /* pivot[khoá dòng] = { vals, total, raise, pm, n, cells: { khoá cột: {v, up} } } */
  const pivot = {};
  const pvColTot = {};

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

    /* Khoá dòng pivot: bộ giá trị của các cột đã chọn, nối bằng U+0001 — cùng
       ký tự nối mà applyClasses dùng, không bao giờ xuất hiện trong dữ liệu. */
    const pvVals = pvRows.map((c) => { return String(row[c] == null ? '' : row[c]).trim(); });
    const pvKey = pvVals.join(SEP);
    let pv = pivot[pvKey];
    if (!pv) pv = pivot[pvKey] = { vals: pvVals, total: 0, raise: 0, pm: 0, n: 0, cells: {} };
    pv.pm += hcSum; pv.n++;
    /* Chiều cột lấy theo DÒNG thì cả dòng rơi vào đúng một cột — tính sẵn ở đây. */
    const colOfRow = (pvCol === PV_CC || pvCol === PV_FC || pvCol === PV_MONTH)
      ? null : String(row[pvCol] == null ? '' : row[pvCol]).trim();

    let rowTotal = 0, rowNoRaise = 0;
    for (let k = 0; k < fcIdx.length; k++) {
      const it = fcIdx[k], arr = R.data[it.i], a0 = noR ? noR[it.i] : null, base = r * M;
      let sub = 0, sub0 = 0;
      for (let m2 = 0; m2 < M; m2++) {
        const v2 = arr[base + m2];
        const u2 = a0 ? v2 - a0[base + m2] : 0;
        if (a0) { sub0 += a0[base + m2]; if (u2) monthsRaise[m2] += u2; }
        if (v2) { months[m2] += v2; sub += v2; }
        /* Cột theo THÁNG là chiều duy nhất phải cộng ở mức tháng. */
        if (pvCol === PV_MONTH && (v2 || u2)) addCell(pv, pvColTot, String(m2), v2, u2);
      }
      rowNoRaise += sub0;
      const up = a0 ? sub - sub0 : 0;
      if (pvCol !== PV_MONTH && (sub || up)) {
        addCell(pv, pvColTot, colOfRow === null ? (pvCol === PV_CC ? it.cc : it.fc.code) : colOfRow, sub, up);
      }
      if (!sub) continue;
      rowTotal += sub;
      byFc[it.fc.code] = (byFc[it.fc.code] || 0) + sub;
      byCc[it.cc] = (byCc[it.cc] || 0) + sub;
      if (a0) {
        byFcRaise[it.fc.code] = (byFcRaise[it.fc.code] || 0) + up;
        byCcRaise[it.cc] = (byCcRaise[it.cc] || 0) + up;
      }
    }
    byGroup[gv].total += rowTotal;
    byGroup[gv].noRaise += rowNoRaise;
    pv.total += rowTotal;
    if (noR) pv.raise += rowTotal - rowNoRaise;
    total += rowTotal; totalNoRaise += rowNoRaise;
    if (hcSum > 0) rowTotals.push(rowTotal / hcSum);
    if (!rowTotal && hcSum > 0) zeroRows++;
  }

  return {
    months, monthsRaise, total, nRow, personMonths,
    /* raise = phần do tăng lương, trong đúng bộ lọc đang bật. */
    raise: noR ? total - totalNoRaise : null,
    byFc, byCc, byFcRaise, byCcRaise, byGroup, rowTotals,
    pivot, pvColTot, pvRows, pvCol,
    fcIdx, zeroRows, ccOf, filters
  };
}

/** Cộng một lượng vào đúng ô (dòng, cột) của pivot và vào tổng của cột đó. */
function addCell(pv, colTot, colKey, v, up) {
  let c = pv.cells[colKey];
  if (!c) c = pv.cells[colKey] = { v: 0, up: 0 };
  c.v += v; c.up += up;
  let ct = colTot[colKey];
  if (!ct) ct = colTot[colKey] = { v: 0, up: 0 };
  ct.v += v; ct.up += up;
}

/* ---------- biểu đồ 12 tháng có đường tham chiếu ----------
   Cột CHỒNG: phần gốc ở dưới, phần do tăng lương chồng lên trên. Chiều cao của
   .bar vẫn là TỔNG nên đường tham chiếu và nhãn .bval không phải đổi gì; phần
   tăng là một <i class="up"> nằm ở đầu .bar (flex-direction: column nên con đầu
   ở trên). `raise` rỗng = chưa khai đợt tăng nào → không dựng đoạn nào cả. */
function barsMonthly(months, stats, picked, raise) {
  const mx = Math.max.apply(null, months.concat([1]));
  const up = raise || null;
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
    const u = up ? (up[i] || 0) : 0;
    return el('div', {
      class: 'col',
      title: MONTHS[i] + ': ' + fmt(v) + (u ? '\n' + t('dash.do_tang_luong') + ': ' + fmt(u) : '')
    }, [
      el('div', { class: 'bval', style: 'bottom:' + h + '%', text: v ? fmtShort(v) : '' }),
      el('div', { class: 'bar', style: 'height:' + h + '%' },
        /* Tỉ lệ tính TRÊN CHÍNH CỘT, không trên mx: .up là con của .bar. */
        [u > 0 && v > 0 ? el('i', { class: 'up', style: 'height:' + Math.min(100, u / v * 100) + '%' }) : null])
    ]);
  })));
  const out = [plot, el('div', { class: 'xaxis' }, MONTHS.map((m) => { return el('div', { text: m }); }))];
  /* Chú giải chỉ có nghĩa khi thật sự có hai phần để phân biệt. */
  if (up && up.some((x) => { return x > 0; })) {
    out.push(el('div', { class: 'legend' }, [
      el('span', {}, [el('i', { class: 'sw base' }), document.createTextNode(t('dash.legend_base'))]),
      el('span', {}, [el('i', { class: 'sw up' }), document.createTextNode(t('dash.do_tang_luong'))])
    ]));
  }
  return el('div', { class: 'chart' }, out);
}

/** Thanh ngang, có thể chồng phần do tăng lương lên phần gốc. */
function hbar(v, mx, up) {
  const w = mx ? Math.round(v / mx * 100) : 0;
  const uw = (up && v) ? Math.min(100, up / v * 100) : 0;
  return el('div', { class: 'hbar' }, [
    el('i', { style: 'width:' + w + '%' }, [uw > 0 ? el('b', { style: 'width:' + uw + '%' }) : null])
  ]);
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
  /* Bảng pivot: chưa cấu hình thì mở ra đúng như bản ma trận cũ — dòng là cột
     phân loại đang chọn, cột là Cost Code. Cột đã biến mất khỏi dự án thì bỏ. */
  if (f.pivotRows === null) f.pivotRows = f.groupCol ? [f.groupCol] : [];
  f.pivotRows = f.pivotRows.filter((c) => { return groupCols.indexOf(c) >= 0 && c !== f.pivotCol; });
  if (f.pivotCol !== PV_CC && f.pivotCol !== PV_FC && f.pivotCol !== PV_MONTH
      && groupCols.indexOf(f.pivotCol) < 0) f.pivotCol = PV_CC;

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
          onchange: function (e) { x.col = e.target.value; x.val = ''; touch(); renderSoon(); }
        }, [el('option', { value: '', text: t('dash.khong_loc') })].concat(groupCols.map((c) => {
          return el('option', { value: c, selected: x.col === c, text: c });
        })))
      ]),
      el('div', { style: 'width:168px' }, [
        el('label', { class: 'f', text: t('dash.gia_tri') }),
        el('select', {
          disabled: !x.col,
          onchange: function (e) { x.val = e.target.value; touch(); renderSoon(); }
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
          el('select', { onchange: function (e) { f.groupCol = e.target.value; f.groupVal = ''; touch(); renderSoon(); } },
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
    el('div', { class: 'body' }, [barsMonthly(A.months, monthStats, f.stats, A.monthsRaise)])
  ]));

  /* ---------- cơ cấu theo Cost Code ---------- */
  /* Cột "Do tăng lương" chỉ dựng khi có khai đợt tăng — không thì là một cột
     toàn dấu gạch, vô nghĩa với người không dùng tăng lương. */
  const showRaise = A.raise !== null;
  const ccRows = Object.keys(A.byCc).map((c) => { return { c, v: A.byCc[c], up: A.byCcRaise[c] || 0 }; })
    .sort((p, q) => { return q.v - p.v; });
  const ccMax = ccRows.length ? ccRows[0].v : 0;
  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('dash.co_cau_theo_cost_code') }), el('span', { class: 'tag', text: t('dash.n_codes', { n: ccRows.length }) })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Cost Code' }), el('th', { style: 'width:36%', text: t('dash.ty_trong') }), el('th', { class: 'num', text: t('fm.full_year') })]
          .concat(showRaise ? [el('th', { class: 'num', text: t('dash.do_tang_luong') })] : [])
          .concat([el('th', { class: 'num', text: '%' })]))]),
        el('tbody', {}, ccRows.map((x) => {
          return el('tr', {
            style: 'cursor:pointer', title: t('dash.bam_de_loc_theo_ma_nay'),
            onclick: function () { f.costCode = f.costCode === x.c ? '' : x.c; f.formulaCode = ''; touch(); render(); }
          }, [
            el('td', { class: 'mono', text: x.c }),
            el('td', {}, [hbar(x.v, ccMax, x.up)]),
            el('td', { class: 'num', text: fmt(x.v) })
          ].concat(showRaise ? [el('td', { class: 'num' + (x.up ? '' : ' zero'), text: x.up ? fmt(x.up) : '–' })] : [])
            .concat([el('td', { class: 'num', text: A.total ? (x.v / A.total * 100).toFixed(1) + '%' : '' })]));
        }))
      ])
    ])])
  ]));

  /* ---------- chi tiết Formula Code ---------- */
  const fcRows = Object.keys(A.byFc).map((c) => { return { c, v: A.byFc[c], up: A.byFcRaise[c] || 0 }; })
    .sort((p, q) => { return q.v - p.v; });
  const fcMax = fcRows.length ? fcRows[0].v : 0;
  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('dash.chi_tiet_theo_formula_code') }), el('span', { class: 'tag', text: t('dash.n_formulas', { n: fcRows.length }) })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Formula Code' }), el('th', { text: 'Cost Code' }), el('th', { style: 'width:28%', text: t('dash.ty_trong') }), el('th', { class: 'num', text: t('fm.full_year') })]
          .concat(showRaise ? [el('th', { class: 'num', text: t('dash.do_tang_luong') })] : [])
          .concat([el('th', { class: 'num', text: '%' })]))]),
        el('tbody', {}, fcRows.map((x) => {
          return el('tr', {
            style: 'cursor:pointer', onclick: function () { f.formulaCode = f.formulaCode === x.c ? '' : x.c; touch(); render(); }
          }, [
            el('td', { class: 'mono', text: x.c }),
            el('td', { class: 'mono', text: A.ccOf[nkey(x.c)] || t('engine.map.none') }),
            el('td', {}, [hbar(x.v, fcMax, x.up)]),
            el('td', { class: 'num', text: fmt(x.v) })
          ].concat(showRaise ? [el('td', { class: 'num' + (x.up ? '' : ' zero'), text: x.up ? fmt(x.up) : '–' })] : [])
            .concat([el('td', { class: 'num', text: A.total ? (x.v / A.total * 100).toFixed(1) + '%' : '' })]));
        }))
      ])
    ])])
  ]));

  /* ---------- bảng pivot do người dùng cấu hình ----------
     Thay hẳn ma trận "nhóm × Cost Code" cứng của bản trước: dòng chọn được
     NHIỀU cột một lúc, cột chọn được cả chiều công thức (Cost Code / Formula
     Code), chiều thời gian (12 tháng) lẫn bất kỳ cột phân loại nào. */
  const pvRowOpts = groupCols.filter((c) => { return c !== f.pivotCol; });
  const pvColOpts = [
    { v: PV_CC, t: 'Cost Code' },
    { v: PV_FC, t: 'Formula Code' },
    { v: PV_MONTH, t: t('export.audit.month') }
  ].concat(groupCols.map((c) => { return { v: c, t: c }; }));
  const pvColLabel = (pvColOpts.filter((o) => { return o.v === f.pivotCol; })[0] || pvColOpts[0]).t;

  /* Cột theo tháng có sẵn thứ tự tự nhiên; các chiều khác sắp theo tổng giảm
     dần rồi cắt trần, phần dư GỘP vào một cột "Khác" — gộp chứ không bỏ, để cột
     Tổng luôn cộng đúng. */
  const colKeys = Object.keys(A.pvColTot);
  /** @type {Array<{k: string, t: string, over?: string[]}>} */
  let pvCols;
  let pvOver = 0;
  if (f.pivotCol === PV_MONTH) {
    pvCols = colKeys.slice().sort((a, b) => { return +a - +b; }).map((k) => { return { k, t: MONTHS[+k] }; });
  } else {
    const sorted = colKeys.slice().sort((a, b) => { return A.pvColTot[b].v - A.pvColTot[a].v; });
    pvOver = Math.max(0, sorted.length - PV_MAX_COLS);
    pvCols = sorted.slice(0, PV_MAX_COLS).map((k) => { return { k, t: k === '' ? t('table.filter.blank') : k }; });
    if (pvOver) pvCols.push({ k: PV_OTHER, t: t('dash.other_cols', { n: pvOver }), over: sorted.slice(PV_MAX_COLS) });
  }
  /* Ô của cột "Khác" = tổng mọi cột bị gộp vào nó. */
  const cellOf = (pr, col) => {
    if (!col.over) return pr.cells[col.k] || null;
    let v = 0, up = 0;
    col.over.forEach((k) => { const c = pr.cells[k]; if (c) { v += c.v; up += c.up; } });
    return v || up ? { v, up } : null;
  };
  const colTotOf = (col) => {
    if (!col.over) return A.pvColTot[col.k] || { v: 0, up: 0 };
    let v = 0, up = 0;
    col.over.forEach((k) => { const c = A.pvColTot[k]; if (c) { v += c.v; up += c.up; } });
    return { v, up };
  };

  const pvKeys = Object.keys(A.pivot);
  const pvList = pvKeys.map((k) => {
    const x = A.pivot[k];
    return { key: k, vals: x.vals, cells: x.cells, total: x.total, up: x.raise, pm: x.pm, per: x.pm ? x.total / x.pm : 0 };
  }).filter((x) => { return x.total > 0 || x.up; })
    .sort((p, q) => { return f.sort === 'per' ? q.per - p.per : q.total - p.total; });

  /* Bấm dòng để lọc chỉ có nghĩa khi dòng là MỘT cột: nhiều cột thì một dòng là
     một bộ giá trị, không phải một giá trị của groupVal — bấm sẽ lọc sai. */
  const canFilter = A.pvRows.length === 1 && A.pvRows[0] === f.groupCol;

  const pgDash = pager(() => { drawPivot(); });
  const pivotTb = el('tbody');
  const perStats = seriesStats(gEntries.map((x) => { return x.per; }));
  /* Số ô đứng trước khối cột giá trị: các cột dòng (ít nhất một) + cột người-tháng. */
  const nLead = Math.max(1, A.pvRows.length) + 1;

  function drawPivot() {
    pivotTb.innerHTML = '';
    pgDash.apply(pvList).forEach((x) => {
      const rt = baseline ? x.per / baseline : 1;
      const cls = (baseline && x.pm >= 3 && rt >= 1.5) ? 'o' : ((baseline && x.pm >= 3 && rt <= 0.6) ? 'g' : '');
      const tr = el('tr', canFilter ? {
        style: 'cursor:pointer',
        onclick: function () { f.groupVal = f.groupVal === x.vals[0] ? '' : x.vals[0]; touch(); render(); }
      } : {}, (x.vals.length ? x.vals : [t('dash.all_groups')]).map((v) => {
        return el('td', { text: v === '' ? t('table.filter.blank') : v });
      }).concat([el('td', { class: 'num', text: fmt(x.pm) })])
        .concat(pvCols.map((c) => {
          const cell = cellOf(x, c);
          return el('td', { class: 'num' + (cell && cell.v ? '' : ' zero'), text: cell && cell.v ? fmt(cell.v) : '–' });
        }))
        .concat([el('td', { class: 'num', text: fmt(x.total) })])
        .concat(showRaise ? [el('td', { class: 'num' + (x.up ? '' : ' zero'), text: x.up ? fmt(x.up) : '–' })] : [])
        .concat([el('td', { class: 'num' }, [cls
          ? el('span', { class: 'tag ' + cls, text: fmtShort(x.per) })
          : el('span', { text: fmtShort(x.per) })])]));
      pivotTb.appendChild(tr);
    });
    picked.forEach((sd) => {
      pivotTb.appendChild(el('tr', { class: 'statrow' },
        [el('td', {}, [el('span', { class: 'tag', text: sd.t })])]
          .concat(new Array(nLead - 1).fill(0).map(() => { return el('td', {}); }))
          .concat(pvCols.map(() => { return el('td', {}); }))
          .concat([el('td', {})])
          .concat(showRaise ? [el('td', {})] : [])
          .concat([el('td', { class: 'num', text: fmt(perStats[sd.k]) })])));
    });
    pivotTb.appendChild(el('tr', { class: 'tot' },
      [el('td', { text: t('export.total') })]
        .concat(new Array(Math.max(0, A.pvRows.length - 1)).fill(0).map(() => { return el('td', {}); }))
        .concat([el('td', { class: 'num', text: fmt(A.personMonths) })])
        .concat(pvCols.map((c) => { return el('td', { class: 'num', text: fmt(colTotOf(c).v) }); }))
        .concat([el('td', { class: 'num', text: fmt(A.total) })])
        .concat(showRaise ? [el('td', { class: 'num', text: fmt(A.raise) })] : [])
        .concat([el('td', { class: 'num', text: fmtShort(perHead) })])));
  }
  drawPivot();

  const head = (A.pvRows.length ? A.pvRows : [t('dash.all_groups')]).map((c) => { return el('th', { text: c }); })
    .concat([el('th', { class: 'num', text: t('dash.nguoi_thang') })])
    .concat(pvCols.map((c) => { return el('th', { class: 'num', text: c.t }); }))
    .concat([el('th', { class: 'num', text: t('fm.full_year') })])
    .concat(showRaise ? [el('th', { class: 'num', text: t('dash.do_tang_luong') })] : [])
    .concat([el('th', { class: 'num', text: t('dash.bq_dau_nguoi_thang') })]);

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('dash.pivot_title') }),
      el('span', { class: 'tag', text: t('fm.n_groups', { n: pvList.length }) }),
      pvOver ? el('span', { class: 'tag o', text: t('dash.pivot_capped', { n: PV_MAX_COLS }) }) : null,
      el('div', { class: 'sp' }),
      el('button', {
        class: 'btn sm', text: f.sort === 'per' ? t('dash.sort_per') : t('dash.sort_total'),
        onclick: function () { f.sort = f.sort === 'per' ? 'total' : 'per'; touch(); render(); }
      })
    ]),
    el('div', { class: 'body' }, [
      el('div', { class: 'row', style: 'margin-bottom:10px' }, [
        el('div', { style: 'width:200px' }, [
          el('label', { class: 'f', text: t('dash.pivot_col') }),
          el('select', {
            class: 'pvcol',
            onchange: function (e) {
              f.pivotCol = e.target.value;
              /* Cùng một cột ở cả hai chiều chỉ cho ra một đường chéo — gỡ nó khỏi dòng. */
              f.pivotRows = (f.pivotRows || []).filter((c) => { return c !== f.pivotCol; });
              touch(); renderSoon();
            }
          }, pvColOpts.map((o) => { return el('option', { value: o.v, selected: f.pivotCol === o.v, text: o.t }); }))
        ])
      ]),
      el('div', {}, [
        el('label', { class: 'f', text: t('dash.pivot_rows') }),
        el('div', { class: 'chips' }, pvRowOpts.map((c) => {
          const on = (f.pivotRows || []).indexOf(c) >= 0;
          return el('span', {
            class: 'chip' + (on ? ' on' : ''),
            text: c, onclick: function () {
              f.pivotRows = on ? f.pivotRows.filter((x) => { return x !== c; }) : (f.pivotRows || []).concat([c]);
              touch(); render();
            }
          });
        }))
      ]),
      el('p', { class: 'hint', style: 'margin:10px 0 0', html: t('dash.pivot_help', { base: fmt(Math.round(baseline)), col: pvColLabel }) })
    ]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [el('thead', {}, [el('tr', {}, head)]), pivotTb])
    ])]),
    el('div', { class: 'body' }, [pgDash.node])
  ]));

  return wrap;
}



export { STAT_DEFS, dashState, pctile, seriesStats, dashFilters, rowPasses, distinctUnder, dashAggregate, barsMonthly, hbar, viewDashboard };
