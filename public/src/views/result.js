/* ===========================================================
   MÀN 10 — KẾT QUẢ NGÂN SÁCH
   Tách nguyên văn từ khối 08-view-result-boot.js (phần kết quả).
   =========================================================== */
import { M, MONTHS, RESULT, S, fmt, fmtNum, fmtShort, nkey, setRESULT, touch } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { exportBudget } from '../platform/io.js';
import { el, modal, progressBox, render, ribbon, toast } from '../ui/dom.js';
import { pager, tableView } from '../ui/widgets.js';

/* ==== 08-view-result-boot.js ==== */
/* ===========================================================
   MÀN 9 — KẾT QUẢ NGÂN SÁCH
   =========================================================== */
/* Bất đồng bộ để thanh tiến trình vẽ được: máy tính nhường lại cho trình duyệt
   giữa các bước. `silent` bỏ cả lớp phủ lẫn lời báo — dùng cho đường chạy ngầm.
   LỚP PHỦ PHẢI ĐÓNG TRƯỚC khi nơi gọi render(): render() xoá sạch document.body
   mà lớp phủ là con trực tiếp của body. */
async function runBudget(silent) {
  if (!S.hc.rows.length) { if (!silent) toast(t('msg.no_hc'), 'bad'); return null; }
  const box = silent ? null : progressBox(t('res.running'));
  try {
    setRESULT(await ENGINE.runAsync(box ? (p, label) => { box.set(p, label); } : null));
    if (box) box.close();
    if (!silent) toast(t('res.done', { ms: RESULT.ms }), 'good');
  } catch (e) {
    if (box) box.close();
    setRESULT(null); toast(t('res.error', { e: e.message }), 'bad');
  }
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
        onclick: function () { runBudget().then(render); }
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
  /* Sắp xếp / lọc theo cột. Bảng chỉ đọc nên không có kéo thả để mà tắt: ở đây
     sort thuần tuý là cách xem, mảng R.* không bao giờ bị viết lại. */
  const fcCols = [
    { k: 'code', label: 'Formula Code', type: 'text', get: (x) => { return x.fc.code; } },
    { k: 'name', label: t('export.audit.name'), type: 'text', get: (x) => { return x.fc.name || ''; } },
    { k: 'total', label: t('fm.full_year'), type: 'num', get: (x) => { return x.total; } }
  ].concat(MONTHS.map((m, i) => {
    return { k: 'm' + i, label: m, type: 'num', get: (x) => { return x.mt[i]; } };
  }));
  const tvFc = tableView(fcCols, () => { drawFc(); });
  const fcTb = el('tbody');
  function drawFc() {
    fcTb.innerHTML = '';
    tvFc.apply(byFc).forEach((x) => {
      fcTb.appendChild(el('tr', {}, [el('td', { class: 'mono', text: x.fc.code }), el('td', { text: x.fc.name || '' }), el('td', {}, [ribbon(x.fc.months)])]
        .concat(x.mt.map((v) => { return el('td', { class: 'num' + (v ? '' : ' zero'), text: v ? fmt(v) : '–' }); }))
        .concat([el('td', { class: 'num', text: fmt(x.total) })])));
    });
    /* Hàng tổng luôn ở cuối, không tham gia sắp xếp — nó không phải một dòng dữ liệu. */
    fcTb.appendChild(el('tr', { class: 'tot' }, [el('td', { colspan: 3, text: t('res.tong_cong') })]
      .concat(R.monthTotals.map((v) => { return el('td', { class: 'num', text: fmt(v) }); }))
      .concat([el('td', { class: 'num', text: fmt(R.grand) })])));
  }
  drawFc();

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: 'Theo Formula Code' }), el('div', { class: 'sp' }),
      el('button', { class: 'btn sm go', text: t('dash.chay_lai'), onclick: function () { runBudget().then(render); } }),
      el('button', { class: 'btn sm pri', text: t('res.xuat_excel'), onclick: exportDialog })
    ]),
    el('div', { class: 'body' }, [tvFc.bar]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [el('thead', {}, [el('tr', {}, [
        tvFc.th(fcCols[0], () => { return byFc; }),
        tvFc.th(fcCols[1], () => { return byFc; }),
        el('th', { text: t('export.audit.monthsPicked') })]
        .concat(MONTHS.map((m, i) => { return tvFc.th(fcCols[3 + i], () => { return byFc; }); }))
        .concat([tvFc.th(fcCols[2], () => { return byFc; })]))]), fcTb])
    ])])
  ]));

  /* ---------- ảnh hưởng của tăng lương ----------
     So với chính bộ khai báo này nhưng bỏ hết mọi đợt tăng. Không khai đợt nào
     thì không dựng panel — người không dùng tăng lương không phải nhìn thấy gì. */
  if (R.raiseImpact && R.raiseImpact.length) {
    const share = (v) => { return R.grand ? (v / R.grand * 100) : 0; };
    const before = R.grand - R.raiseTotal;

    const rows = R.raiseImpact.map((x) => {
      return el('tr', {}, [
        el('td', { text: x.name || t('cal.unnamed') }),
        el('td', { class: 'num', text: MONTHS[x.fromMonth - 1] }),
        el('td', { class: 'num', text: fmtNum(x.pct) + '%' }),
        el('td', { class: 'num', text: fmt(x.nRows) }),
        el('td', { class: 'num money', text: fmt(x.total) }),
        el('td', { class: 'num', text: fmtNum(Math.round(share(x.total) * 100) / 100) + '%' })
      ]);
    });
    /* Hàng tổng phải khớp đúng thẻ "do tăng lương" — cộng dồn theo thứ tự khai
       báo nên các phần cộng lại bằng tổng, không xê một đồng. */
    rows.push(el('tr', { class: 'tot' }, [
      el('td', { colspan: 4, text: t('res.tong_cong') }),
      el('td', { class: 'num', text: fmt(R.raiseTotal) }),
      el('td', { class: 'num', text: fmtNum(Math.round(share(R.raiseTotal) * 100) / 100) + '%' })
    ]));

    /* Tách theo cách người dùng chọn — không chỉ theo Formula Code.
       Ảnh hưởng TỔNG của từng dòng là data − dataNoRaise, đã có sẵn, nên gộp
       theo bất kỳ cột nào cũng chỉ là một vòng lặp; không phải bắt máy tính lại. */
    const ccOf = {};
    (S.maps.costCode || []).forEach((x) => { ccOf[nkey(x.formulaCode)] = x.costCode || t('engine.map.none'); });
    const GRP_FC = 'Formula Code', GRP_CC = 'Cost Code';
    const grpCols = [GRP_FC, GRP_CC]
      .concat(ENGINE.classCols())
      .concat(ENGINE.attrCols().map((c) => { return c.alias; }));
    if (grpCols.indexOf(S.ui.raiseBy) < 0) S.ui.raiseBy = GRP_FC;

    function raiseBreakdown(by) {
      /** @type {Record<string, number>} */
      const acc = {};
      if (by === GRP_FC || by === GRP_CC) {
        R.raiseImpact.forEach((x) => {
          Object.keys(x.byFc).forEach((code) => {
            const k = by === GRP_FC ? code : (ccOf[nkey(code)] || t('engine.map.none'));
            acc[k] = (acc[k] || 0) + x.byFc[code];
          });
        });
        return acc;
      }
      /* Theo một cột của dòng định biên: cộng chênh lệch từng dòng. */
      for (let c = 0; c < R.data.length; c++) {
        const a = R.data[c], a0 = R.dataNoRaise[c];
        for (let i = 0; i < R.rows.length; i++) {
          let d = 0;
          for (let m = 0; m < M; m++) d += a[i * M + m] - a0[i * M + m];
          if (!d) continue;
          const v = R.rows[i][by];
          const k = String(v == null || v === '' ? t('engine.map.none') : v).trim();
          acc[k] = (acc[k] || 0) + d;
        }
      }
      return acc;
    }

    const byGrp = raiseBreakdown(S.ui.raiseBy);
    const fcRows = Object.keys(byGrp).sort((a, b) => { return byGrp[b] - byGrp[a]; }).map((k) => {
      return el('tr', {}, [
        el('td', { class: S.ui.raiseBy === GRP_FC || S.ui.raiseBy === GRP_CC ? 'mono' : '', text: k }),
        el('td', { class: 'num money', text: fmt(byGrp[k]) }),
        el('td', { class: 'num', text: fmtNum(Math.round(share(byGrp[k]) * 100) / 100) + '%' })
      ]);
    });
    /* Hàng tổng: gộp theo cách nào thì tổng vẫn phải bằng raiseTotal. */
    fcRows.push(el('tr', { class: 'tot' }, [
      el('td', { text: t('res.tong_cong') }),
      el('td', { class: 'num', text: fmt(Object.keys(byGrp).reduce((a, k) => { return a + byGrp[k]; }, 0)) }),
      el('td', { class: 'num', text: fmtNum(Math.round(share(R.raiseTotal) * 100) / 100) + '%' })
    ]));

    const grpSel = el('select', {
      style: 'width:auto',
      onchange: function (e) { S.ui.raiseBy = e.target.value; touch(); render(); }
    }, grpCols.map((c) => { return el('option', { value: c, selected: S.ui.raiseBy === c, text: c }); }));

    wrap.appendChild(el('div', { class: 'panel' }, [
      el('header', {}, [
        el('h3', { text: t('res.raise_title') }),
        el('span', { class: 'tag o', text: fmtShort(R.raiseTotal) })
      ]),
      el('div', { class: 'body' }, [el('p', { class: 'hint', html: t('res.raise_hint') })]),
      el('div', { class: 'stats', style: 'margin:0 14px 14px' }, [
        el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('res.raise_before') }), el('div', { class: 'v', text: fmtShort(before) })]),
        el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('res.raise_title') }), el('div', { class: 'v money', text: fmtShort(R.raiseTotal) }), el('div', { class: 'u', text: t('dash.currency', { n: fmt(R.raiseTotal) }) })]),
        el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('res.total_budget', { y: S.meta.year }) }), el('div', { class: 'v', text: fmtShort(R.grand) })])
      ]),
      el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [
            el('th', { text: t('res.raise_th_round') }), el('th', { class: 'num', text: t('res.raise_th_from') }),
            el('th', { class: 'num', text: t('res.raise_th_pct') }), el('th', { class: 'num', text: t('res.raise_th_rows') }),
            el('th', { class: 'num', text: t('res.raise_th_amount') }), el('th', { class: 'num', text: t('res.raise_th_share') })
          ])]),
          el('tbody', {}, rows)
        ])
      ])]),
      el('div', { class: 'body' }, [el('div', { class: 'row', style: 'align-items:center;gap:10px' }, [
        el('h4', { class: 'sec', style: 'margin:0', text: t('res.raise_by') }), grpSel
      ])]),
      el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [
            el('th', { text: S.ui.raiseBy }),
            el('th', { class: 'num', text: t('res.raise_th_amount') }),
            el('th', { class: 'num', text: t('res.raise_th_share') })
          ])]),
          el('tbody', {}, fcRows)
        ])
      ])])
    ]));
  }

  /* pivot 5 tầng — bảng này dài theo số tổ hợp mã, trước đây dựng hết một lúc.
     Thứ tự cột: Division / Budget Code / Cost Center / Cost Code / Account. */
  const pivotTb = el('tbody');
  const pgPivot = pager(() => { drawPivot(); });
  /* Sắp xếp / lọc theo cột. Mặc định đã sắp sẵn theo Division → Budget Code →
     Cost Center → Cost Code ở máy tính; ở đây người dùng xem lại theo ý mình mà
     R.pivot không bị viết lại. */
  const pvCols = [
    { k: 'division', label: 'Division', type: 'text' },
    { k: 'budgetCode', label: 'Budget Code', type: 'text' },
    { k: 'costCenter', label: 'Cost Center', type: 'text' },
    { k: 'costCode', label: 'Cost Code', type: 'text' },
    { k: 'accountCode', label: 'Account Code', type: 'text' },
    { k: 'formulaCode', label: 'Formula Code', type: 'text' }
  ].concat(MONTHS.map((m, i) => {
    return { k: 'pm' + i, label: m, type: 'num', get: (p) => { return p.m[i]; } };
  })).concat([{ k: 'total', label: t('fm.full_year'), type: 'num' }]);
  const tvPivot = tableView(pvCols, () => { pgPivot.reset(); drawPivot(); });
  function drawPivot() {
    pivotTb.innerHTML = '';
    pgPivot.apply(tvPivot.apply(R.pivot)).forEach((p) => {
      pivotTb.appendChild(el('tr', {}, [
        el('td', { class: 'mono', text: p.division }), el('td', { class: 'mono', text: p.budgetCode }),
        el('td', { class: 'mono', text: p.costCenter }), el('td', { class: 'mono', text: p.costCode }),
        el('td', { class: 'mono', text: p.accountCode }), el('td', { class: 'mono', text: p.formulaCode })
      ].concat(p.m.map((v) => { return el('td', { class: 'num' + (v ? '' : ' zero'), text: v ? fmt(v) : '–' }); }))
        .concat([el('td', { class: 'num', text: fmt(p.total) })])));
    });
    if (!R.pivot.length) pivotTb.appendChild(el('tr', {}, [el('td', { colspan: 19, class: 'empty', text: t('res.chua_co_so_lieu') })]));
  }
  drawPivot();
  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('res.pivot_title') }), el('span', { class: 'tag', text: t('table.info.rows', { n: R.pivot.length }) })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [el('thead', {}, [el('tr', {},
        pvCols.map((c) => { return tvPivot.th(c, () => { return R.pivot; }); }))]),
      pivotTb])
    ])]),
    el('div', { class: 'body' }, [tvPivot.bar, pgPivot.node])
  ]));

  /* đối chiếu — trước đây cắt cụt ở 500 dòng mà không báo gì. */
  const diffTb = el('tbody');
  const pgDiff = pager(() => { drawDiffs(); });
  const dfCols = [
    { k: 'no', label: t('exc.th_no'), type: 'text' },
    { k: 'id', label: 'ID', type: 'text' },
    { k: 'position', label: t('exc.th_position'), type: 'text' },
    { k: 'formulaCode', label: 'Formula Code', type: 'text' },
    { k: 'month', label: t('export.audit.month'), type: 'num' },
    { k: 'formula', label: t('export.audit.formula'), type: 'num' },
    { k: 'exception', label: t('dash.kind_exc'), type: 'num' },
    { k: 'rule', label: t('exc.th_rule'), type: 'text' },
    { k: 'final', label: t('res.th_applied'), type: 'num' },
    { k: 'won', label: t('res.th_winner'), type: 'text', get: (c) => { return c.won ? t('dash.kind_exc') : t('export.audit.formula'); } }
  ];
  const tvDiff = tableView(dfCols, () => { pgDiff.reset(); drawDiffs(); });
  function drawDiffs() {
    diffTb.innerHTML = '';
    pgDiff.apply(tvDiff.apply(diffs)).forEach((c) => {
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
          el('thead', {}, [el('tr', {},
            dfCols.map((c) => { return tvDiff.th(c, () => { return diffs; }); }))]),
          diffTb])
      ]) : el('div', { class: 'empty', text: t('res.khong_co_chenh_lech_nao') })
    ]),
    diffs.length ? el('div', { class: 'body' }, [tvDiff.bar, pgDiff.node]) : null
  ]));

  return wrap;
}

/* ===========================================================
   XUẤT EXCEL
   =========================================================== */
/* Bất đồng bộ vì runBudget() nay là bất đồng bộ: chưa có kết quả thì phải CHỜ
   tính xong mới dựng hộp thoại, chứ không dựng trên RESULT rỗng. */
async function exportDialog() {
  if (!RESULT) { await runBudget(); if (!RESULT) return; }
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
