/* ===========================================================
   MÀN 13 — SO SÁNH HAI KỊCH BẢN

   Người làm ngân sách luôn phải trả lời "bản này khác bản trước ở đâu, lệch bao
   nhiêu, do cái gì". Trước đợt này phải mở hai file Excel ra dò tay.

   Bản đối chiếu là MỘT FILE DỰ ÁN .json mở từ máy — đúng thứ nút "Lưu file dự
   án" vẫn sinh ra, nên không phải thêm chỗ lưu mới nào cả.

   Máy tính chỉ đọc S, nên chạy bản khác = TRÁO STATE, CHẠY, RỒI TRẢ LẠI. Xem
   runOther(): khối finally ở đó là phần quan trọng nhất của cả tính năng.
   =========================================================== */
import { M, MONTHS, RESULT, S, fmt, fmtNum, fmtShort, nkey, projectFromJson, setRESULT, setS, touch } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { pickFile } from '../platform/io.js';
import { el, render, toast } from '../ui/dom.js';
import { pager, tableView } from '../ui/widgets.js';
import { runBudget } from './result.js';

/* Hai chiều gộp không phải là cột của bảng định biên. Tiền tố __ để không bao
   giờ đụng một cột thật tên "Cost Code". */
const DIM_FC = '__fc', DIM_CC = '__cc';

/* Bản tóm tắt của bản đối chiếu, ở mức MODULE: render() xoá sạch document.body
   nên biến trong hàm dựng không sống nổi. Không để trong S.ui — nó không thuộc
   dự án, và mất khi tải lại trang là đúng. */
/** @type {CompareSummary|null} */
let other = null;

/** Mọi cột gộp được của state ĐANG được tráo vào: cột phân loại nhóm, cột chữ
    do chính sách sinh ra, rồi cột gốc của bảng định biên. */
function groupCols() {
  const out = [], seen = {};
  const add = (c) => { if (c && !seen[c]) { seen[c] = 1; out.push(c); } };
  ENGINE.classCols().forEach(add);
  (S.policies || []).forEach((p) => {
    (p.outs || []).forEach((o) => { if (o && o.name && o.type === 'text') add(o.name); });
  });
  ENGINE.attrCols().forEach((c) => { add(c.alias); });
  return out;
}

/** Rút một lượt tính thành bản tóm tắt NHỎ.
 *
 *  KHÔNG giữ RESULT của bản đối chiếu: mảng `data` của dự án lớn cỡ chục MB, mà
 *  so sánh chỉ cần các tổng. Rút ngay tại đây, lúc state của bản đó còn đang
 *  được tráo vào — nên ccOf, cột phân loại và cột định biên đều là CỦA CHÍNH
 *  BẢN ĐÓ, không phải của bản đang làm.
 *  @param {BudgetResult} R
 *  @param {string} file  tên file, chỉ để hiện lên màn hình
 *  @returns {CompareSummary} */
function summarise(R, file) {
  /** @type {Record<string, string>} */
  const ccOf = {};
  (S.maps.costCode || []).forEach((x) => { ccOf[nkey(x.formulaCode)] = x.costCode || t('engine.map.none'); });

  /** @type {Record<string, number>} */
  const byFc = {};
  /** @type {Record<string, number>} */
  const byCc = {};
  R.formulas.forEach((fc, i) => {
    const v = R.totalsByFc[i];
    if (!v) return;
    byFc[fc.code] = (byFc[fc.code] || 0) + v;
    const cc = ccOf[nkey(fc.code)] || t('engine.map.none');
    byCc[cc] = (byCc[cc] || 0) + v;
  });

  /* Gộp theo từng cột phân loại: một lượt duy nhất qua data, cộng tiền cả dòng
     rồi rót vào đúng ô của mọi cột. Vì mỗi dòng chỉ được cộng MỘT lần cho mỗi
     cột nên tổng của chiều nào cũng quay về đúng `grand`. */
  const cols = groupCols();
  /** @type {Record<string, Record<string, number>>} */
  const byCol = {};
  cols.forEach((c) => { byCol[c] = {}; });
  const nR = R.rows.length, nF = R.data.length;
  for (let r = 0; r < nR; r++) {
    const base = r * M;
    let sub = 0;
    for (let i = 0; i < nF; i++) {
      const arr = R.data[i];
      for (let m = 0; m < M; m++) sub += arr[base + m];
    }
    if (!sub) continue;
    const row = R.rows[r];
    for (let c = 0; c < cols.length; c++) {
      const map = byCol[cols[c]];
      const k = String(row[cols[c]] == null ? '' : row[cols[c]]).trim();
      map[k] = (map[k] || 0) + sub;
    }
  }

  return {
    name: S.meta.name || '', year: S.meta.year, file,
    grand: R.grand, raise: R.raiseTotal || 0,
    months: R.monthTotals.slice(), nRows: nR,
    byFc, byCc, byCol, cols,
    fcCodes: R.formulas.map((fc) => { return fc.code; }),
    attrCols: ENGINE.attrCols().map((c) => { return c.alias; })
  };
}

/** Chạy một state KHÁC rồi trả bản tóm tắt của nó.
 *
 *  Khối finally là phần quan trọng nhất của cả tính năng: file đối chiếu có thể
 *  mang công thức hỏng và làm máy tính ném lỗi giữa chừng. Không trả state lại
 *  thì người dùng mất luôn bản đang làm — mở một file để XEM mà mất bản của
 *  mình là hỏng nặng hơn mọi thứ tính năng này đem lại.
 *
 *  Cả hàm CỐ Ý đồng bộ, không có await nào: tự lưu chạy bằng setTimeout, mà một
 *  hẹn giờ chỉ nổ được giữa hai lượt. Đồng bộ tức là không có lượt nào khác
 *  chen vào lúc state của bản đối chiếu đang nằm trong S, nên không đời nào ghi
 *  đè bản đang làm xuống localStorage. */
function runOther(next, file) {
  const keep = S, keepR = RESULT;
  try {
    setS(next); ENGINE.invalidate();
    return summarise(ENGINE.run(), file);
  } finally {
    setS(keep); ENGINE.invalidate(); setRESULT(keepR);
  }
}

/** Những chỗ hai bản khác nhau về CẤU TRÚC. Phần dễ bị bỏ qua nhất: so hai dự
 *  án khác cấu trúc mà không nói gì thì con số chênh lệch đọc ra nghĩa sai. */
function structDiff(A, B) {
  const out = [];
  const only = (x, y) => { return x.filter((c) => { return y.indexOf(c) < 0; }); };
  if (String(A.year) !== String(B.year)) out.push(t('cmp.warn.year', { a: A.year, b: B.year }));
  if (A.nRows !== B.nRows) out.push(t('cmp.warn.rows', { a: fmt(A.nRows), b: fmt(B.nRows) }));
  const fcA = only(A.fcCodes, B.fcCodes), fcB = only(B.fcCodes, A.fcCodes);
  if (fcA.length) out.push(t('cmp.warn.fc_a', { list: fcA.join(', ') }));
  if (fcB.length) out.push(t('cmp.warn.fc_b', { list: fcB.join(', ') }));
  const cA = only(A.attrCols, B.attrCols), cB = only(B.attrCols, A.attrCols);
  if (cA.length) out.push(t('cmp.warn.col_a', { list: cA.join(', ') }));
  if (cB.length) out.push(t('cmp.warn.col_b', { list: cB.join(', ') }));
  return out;
}

/** Bảng tiền theo một chiều gộp. Chiều không có ở bản này thì trả bảng rỗng —
    mọi dòng của bên kia sẽ hiện với 0, chứ không bị bỏ lặng lẽ. */
function mapFor(sum, dim) {
  if (!sum) return {};
  if (dim === DIM_FC) return sum.byFc;
  if (dim === DIM_CC) return sum.byCc;
  return sum.byCol[dim] || {};
}

/** Hợp hai bảng thành danh sách chênh lệch. Khoá chỉ có ở MỘT bên vẫn ra dòng,
    bên kia tính là 0 — đó thường là chỗ đáng nhìn nhất. */
function diffRows(A, B, dim) {
  const ma = mapFor(A, dim), mb = mapFor(B, dim);
  const keys = Object.keys(ma);
  Object.keys(mb).forEach((k) => { if (!Object.prototype.hasOwnProperty.call(ma, k)) keys.push(k); });
  return keys.map((k) => {
    const a = ma[k] || 0, b = mb[k] || 0, d = b - a;
    return { k, label: k === '' ? t('table.filter.blank') : k, a, b, d, ad: Math.abs(d), p: a ? d / a * 100 : '' };
  });
}

/** Ô phần trăm: gốc bằng 0 thì không có phần trăm nào để nói, chỉ có "mới". */
function pctCell(x) {
  if (x.p === '') return el('td', { class: 'num' }, [x.b ? el('span', { class: 'tag o', text: t('cmp.new_row') }) : el('span', { text: '–' })]);
  return el('td', { class: 'num' + (x.d ? '' : ' zero'), text: (x.p > 0 ? '+' : '') + fmtNum(Math.round(x.p * 10) / 10) + '%' });
}

/** Ô chênh lệch, có dấu và có màu. */
function diffCell(v) {
  if (!v) return el('td', { class: 'num zero', text: '–' });
  return el('td', { class: 'num' }, [el('span', { class: 'tag ' + (v > 0 ? 'o' : 'g'), text: (v > 0 ? '+' : '−') + fmt(Math.abs(v)) })]);
}

function openCompare() {
  pickFile('.json', (f) => {
    const fr = new FileReader();
    fr.onload = function (e) {
      try {
        other = runOther(projectFromJson(/** @type {string} */ (e.target.result)), f.name);
        render();
        toast(t('cmp.loaded', { file: f.name }), 'good');
      } catch (err) {
        other = null;
        render();
        toast(t('toast.error', { e: err.message }), 'bad');
      }
    };
    fr.readAsText(f);
  });
}

/** Khối rỗng dùng chung, cùng khuôn với Kết quả và Dashboard. */
function emptyBox(title, hint, btn) {
  return el('div', { class: 'panel' }, [el('div', { class: 'empty' }, [
    el('strong', { text: title }),
    el('span', { text: hint }),
    btn ? el('div', { style: 'margin-top:14px' }, [btn]) : null
  ])]);
}

function viewCompare() {
  const wrap = el('div');

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('cmp.pick') }),
      el('span', {
        class: 'tag' + (other ? ' g' : ''),
        text: other ? (other.file || other.name || '?') : t('cmp.file_none')
      }),
      el('div', { class: 'sp' }),
      other ? el('button', {
        class: 'btn sm del', text: t('cmp.clear'),
        onclick: function () { other = null; render(); }
      }) : null,
      el('button', { class: 'btn sm pri', text: t('cmp.open'), onclick: openCompare })
    ]),
    el('div', { class: 'body' }, [el('p', { class: 'hint', style: 'margin:0', text: t('cmp.help') })])
  ]));

  const R = RESULT;
  if (!R) {
    wrap.appendChild(emptyBox(
      S.hc.rows.length ? t('cmp.chua_chay') : t('msg.no_hc'),
      S.hc.rows.length ? t('cmp.chua_chay_hint') : t('dash.no_hc_hint'),
      S.hc.rows.length ? el('button', {
        class: 'btn go', style: 'padding:8px 18px', text: t('cmp.run_now'),
        onclick: function () { runBudget().then(render); }
      }) : null));
    return wrap;
  }
  if (!other) {
    wrap.appendChild(emptyBox(t('cmp.no_file'), t('cmp.no_file_hint'),
      el('button', { class: 'btn pri', style: 'padding:8px 18px', text: t('cmp.open'), onclick: openCompare })));
    return wrap;
  }

  const A = summarise(R, ''), B = other;
  const gap = B.grand - A.grand;
  const gapPct = A.grand ? gap / A.grand * 100 : 0;

  /* ---------- ba thẻ đầu ---------- */
  const card = (k, v, u) => {
    return el('div', { class: 'stat' }, [
      el('div', { class: 'k', text: k }), el('div', { class: 'v money', text: fmtShort(v) }),
      el('div', { class: 'u', text: u })
    ]);
  };
  wrap.appendChild(el('div', { class: 'stats' }, [
    card(t('cmp.card_a'), A.grand, A.raise ? t('cmp.of_which_raise', { n: fmtShort(A.raise) }) : t('dash.currency', { n: fmt(A.grand) })),
    card(t('cmp.card_b'), B.grand, B.raise ? t('cmp.of_which_raise', { n: fmtShort(B.raise) }) : t('dash.currency', { n: fmt(B.grand) })),
    el('div', { class: 'stat' }, [
      el('div', { class: 'k', text: t('cmp.card_diff') }),
      el('div', { class: 'v money', text: (gap > 0 ? '+' : gap < 0 ? '−' : '') + fmtShort(Math.abs(gap)) }),
      el('div', { class: 'u', text: t('cmp.diff_pct', { p: (gap > 0 ? '+' : gap < 0 ? '−' : '') + fmtNum(Math.abs(Math.round(gapPct * 10) / 10)), n: fmt(Math.abs(gap)) }) })
    ])
  ]));

  /* ---------- lệch cấu trúc ---------- */
  const warns = structDiff(A, B);
  if (warns.length) {
    wrap.appendChild(el('div', { class: 'warnbox' }, [
      el('strong', { text: t('cmp.struct_title') }),
      el('ul', { style: 'margin:6px 0 4px 18px' }, warns.map((w) => { return el('li', { text: w }); })),
      el('div', { class: 'hint', style: 'margin:0', text: t('cmp.struct_hint') })
    ]));
  }

  /* ---------- 12 tháng ---------- */
  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('cmp.months') })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw', style: 'max-height:none' }, [
      el('table', { class: 'cmptbl' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: t('export.audit.month') }),
          el('th', { class: 'num', text: t('cmp.col_a') }),
          el('th', { class: 'num', text: t('cmp.col_b') }),
          el('th', { class: 'num', text: t('cmp.col_diff') }),
          el('th', { class: 'num', text: '%' })
        ])]),
        el('tbody', {}, MONTHS.map((mn, i) => {
          const a = A.months[i] || 0, b = B.months[i] || 0, d = b - a;
          const x = { a, b, d, p: a ? d / a * 100 : '' };
          return el('tr', {}, [
            el('td', { text: mn }),
            el('td', { class: 'num', text: fmt(a) }),
            el('td', { class: 'num', text: fmt(b) }),
            diffCell(d), pctCell(x)
          ]);
        }).concat([el('tr', { class: 'tot' }, [
          el('td', { text: t('export.total') }),
          el('td', { class: 'num', text: fmt(A.grand) }),
          el('td', { class: 'num', text: fmt(B.grand) }),
          diffCell(gap),
          pctCell({ a: A.grand, b: B.grand, d: gap, p: A.grand ? gapPct : '' })
        ])]))
      ])
    ])])
  ]));

  /* ---------- chênh lệch theo chiều chọn được ---------- */
  const dims = [{ v: DIM_FC, t: 'Formula Code' }, { v: DIM_CC, t: 'Cost Code' }];
  const seen = {};
  A.cols.concat(B.cols).forEach((c) => { if (!seen[c]) { seen[c] = 1; dims.push({ v: c, t: c }); } });
  const ui = /** @type {{dim?: string}} */ (S.ui.cmp = S.ui.cmp || {});
  if (!ui.dim || !dims.some((d) => { return d.v === ui.dim; })) ui.dim = DIM_FC;
  const dimLabel = (dims.filter((d) => { return d.v === ui.dim; })[0] || dims[0]).t;

  /* Sắp sẵn theo TRỊ TUYỆT ĐỐI của chênh lệch giảm dần, để thứ lệch nhiều nhất
     nổi lên đầu. Bấm tiêu đề cột thì tableView sắp lại theo ý người dùng. */
  const rows = diffRows(A, B, ui.dim).sort((p, q) => { return q.ad - p.ad; });
  const cols = [
    { k: 'label', label: dimLabel },
    { k: 'a', label: t('cmp.col_a'), type: 'num' },
    { k: 'b', label: t('cmp.col_b'), type: 'num' },
    { k: 'd', label: t('cmp.col_diff'), type: 'num' },
    { k: 'p', label: '%', type: 'num' }
  ];
  const tb = el('tbody');
  const tv = tableView(cols, () => { pg.reset(); draw(); });
  const pg = pager(() => { draw(); });

  function draw() {
    tb.innerHTML = '';
    const list = tv.apply(rows);
    let sa = 0, sb = 0;
    list.forEach((x) => { sa += x.a; sb += x.b; });
    pg.apply(list).forEach((x) => {
      tb.appendChild(el('tr', {}, [
        el('td', { text: x.label }),
        el('td', { class: 'num' + (x.a ? '' : ' zero'), text: x.a ? fmt(x.a) : '–' }),
        el('td', { class: 'num' + (x.b ? '' : ' zero'), text: x.b ? fmt(x.b) : '–' }),
        diffCell(x.d), pctCell(x)
      ]));
    });
    /* Tổng của DANH SÁCH ĐANG XEM, không phải của cả bảng: lọc bớt dòng mà tổng
       vẫn đứng yên thì con số đó nói dối. */
    tb.appendChild(el('tr', { class: 'tot' }, [
      el('td', { text: t('export.total') }),
      el('td', { class: 'num', text: fmt(sa) }),
      el('td', { class: 'num', text: fmt(sb) }),
      diffCell(sb - sa),
      pctCell({ a: sa, b: sb, d: sb - sa, p: sa ? (sb - sa) / sa * 100 : '' })
    ]));
  }
  draw();

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('cmp.by_dim') }),
      el('span', { class: 'tag', text: t('cmp.n_rows', { n: rows.length }) })
    ]),
    el('div', { class: 'body' }, [
      el('div', { style: 'width:220px' }, [
        el('label', { class: 'f', text: t('cmp.dim') }),
        el('select', {
          class: 'cmpdim',
          onchange: function (e) { ui.dim = e.target.value; touch(); render(); }
        }, dims.map((d) => { return el('option', { value: d.v, selected: ui.dim === d.v, text: d.t }); }))
      ])
    ]),
    tv.bar,
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', { class: 'cmptbl' }, [
        el('thead', {}, [el('tr', {}, cols.map((c) => { return tv.th(c, () => { return rows; }); }))]),
        tb
      ])
    ])]),
    el('div', { class: 'body' }, [pg.node])
  ]));

  return wrap;
}

export { DIM_CC, DIM_FC, summarise, runOther, structDiff, diffRows, mapFor, viewCompare };
