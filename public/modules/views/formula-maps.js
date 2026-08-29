/* ===========================================================
   MÀN 6, 7, 8, 9 — CÔNG THỨC CHI PHÍ · TỜ TRÌNH NGOẠI LỆ ·
   PHÂN LOẠI CHI PHÍ · DỰ KIẾN TĂNG LƯƠNG
   Tách nguyên văn từ khối 07-view-formula-maps.js.
   =========================================================== */
import { MONTHS, S, allMonths, fmt, nkey, numOf, setRESULT, t, touch, uid } from '../state.js';
import { ENGINE } from '../formula.js';
import { distinctVals, pickFile } from '../io.js';
import { confirmBox, dataTable, downloadTemplate, el, esc, foldPanel, importMapped, modal, panel, render, ribbon, toast } from '../ui.js';
import { chipsPanel, fxField } from './fxhelp.js';

/* ==== 07-view-formula-maps.js ==== */
/* ===========================================================
   MÀN 5 — CÔNG THỨC CHI PHÍ (Formula Code)
   =========================================================== */
function currentFC() {
  var f = S.formulas.filter(function (x) { return x.id === S.ui.fSel; })[0];
  return f || S.formulas[0] || null;
}

function viewFormula() {
  var wrap = el('div');
  if (!S.cols.length) {
    wrap.appendChild(panel(t('fm.cong_thuc_chi_phi'), [], el('div', { class: 'empty' }, [
      el('strong', { text: t('msg.no_hc') }), el('span', { text: t('fm.cong_thuc_can_biet_tham_chieu_cot') })
    ])));
    return wrap;
  }
  var fc = currentFC();
  var split = el('div', { class: 'split' });

  /* --- danh sách --- */
  var list = el('div', { class: 'panel', style: 'margin:0' });
  list.appendChild(el('header', {}, [
    el('h3', { text: 'Formula Code' }), el('div', { class: 'sp' }),
    el('button', {
      class: 'btn sm', text: t('hc.them'), onclick: function () {
       
        /* GIÁ TRỊ MỒI (dữ liệu): ghi thẳng vào S, đi vào file dự án .json — giữ trong code. */
        var n = { id: uid(), code: 'FC_MOI_' + (S.formulas.length + 1), name: 'Công thức mới', mode: 'monthly', months: allMonths(), rules: [{ id: uid(), name: 'Tất cả', cond: '', formula: '0' }] };
        S.formulas.push(n); S.ui.fSel = n.id; setRESULT(null); touch(); render();
      }
    })
  ]));
  var ul = el('div', { class: 'body tight' });
  var ccOf = {};
  (S.maps.costCode || []).forEach(function (x) { ccOf[nkey(x.formulaCode)] = x.costCode; });
  S.formulas.forEach(function (f) {
    var on = fc && f.id === fc.id;
    ul.appendChild(el('div', {
      style: 'padding:9px 12px;border-bottom:1px solid var(--rule-2);cursor:pointer;' + (on ? 'background:var(--mineral-2);border-left:3px solid var(--mineral)' : 'border-left:3px solid transparent'),
      onclick: function () { S.ui.fSel = f.id; touch(); render(); }
    }, [
      el('div', { style: 'font:600 12px var(--mono)', text: f.code }),
      el('div', { style: 'font-size:12.5px;color:var(--soft)', text: f.name || '' }),
      el('div', { style: 'margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, [
        ribbon(f.months),
        el('span', { class: 'tag' + (f.mode === 'spread' ? ' o' : ''), text: f.mode === 'spread' ? t('fm.mode_spread_short') : t('fm.mode_monthly_short') }),
        el('span', { class: 'tag', text: t('fm.n_groups', { n: (f.rules || []).length }) }),
        ccOf[nkey(f.code)] ? el('span', { class: 'tag g', text: '→ ' + ccOf[nkey(f.code)] }) : el('span', { class: 'tag o', text: t('fm.chua_map') })
      ])
    ]));
  });
  list.appendChild(ul);
  /* Cột trái: danh sách Formula Code, rồi tới hộp gợi ý ở khoảng trống bên dưới. */
  var colLeft = el('div', { class: 'col-left' }, [list]);
  split.appendChild(colLeft);

  if (!fc) { split.appendChild(el('div', { class: 'panel' }, [el('div', { class: 'empty', text: t('fm.them_mot_formula_code') })])); wrap.appendChild(split); return wrap; }

  var right = el('div');

  /* --- định nghĩa + phân bổ --- */
  right.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('fm.dinh_nghia_phan_bo') }), el('div', { class: 'sp' }),
      el('button', {
        class: 'btn sm del', text: t('fm.xoa'), onclick: function () {
          confirmBox(t('fm.confirm_delete_fc', { code: fc.code }), function () {
            S.formulas = S.formulas.filter(function (x) { return x.id !== fc.id; });
            S.ui.fSel = null; setRESULT(null); touch(); render();
          });
        }
      })
    ]),
    el('div', { class: 'body' }, [
      el('div', { class: 'row' }, [
        el('div', { style: 'width:200px' }, [el('label', { class: 'f', text: 'Formula Code' }),
        el('input', { type: 'text', class: 'fx', value: fc.code, oninput: function (e) { fc.code = e.target.value; setRESULT(null); touch(); } })]),
        el('div', { style: 'flex:1;min-width:200px' }, [el('label', { class: 'f', text: t('export.audit.name') }),
        el('input', { type: 'text', value: fc.name || '', oninput: function (e) { fc.name = e.target.value; touch(); } })]),
        el('div', { style: 'width:230px' }, [el('label', { class: 'f', text: t('fm.ket_qua_cong_thuc_la') }),
        el('select', { onchange: function (e) { fc.mode = e.target.value; setRESULT(null); touch(); render(); } }, [
          el('option', { value: 'monthly', selected: fc.mode !== 'spread', text: t('fm.so_tien_cua_mot_thang') }),
          el('option', { value: 'spread', selected: fc.mode === 'spread', text: t('fm.tong_ca_nam_chia_deu') })
        ])])
      ]),
      el('div', { style: 'margin-top:14px' }, [
        el('label', { class: 'f', text: t('fm.thang_trich_bam_de_bat_tat') }),
        el('div', { class: 'row' }, [
          ribbon(fc.months, {
            lg: true, pick: function (m, on) {
              fc.months = on ? (fc.months || []).concat([m]).sort(function (a, b) { return a - b; }) : (fc.months || []).filter(function (x) { return x !== m; });
              setRESULT(null); touch(); render();
            }
          }),
          el('span', { class: 'tag', text: t('fm.n_months', { n: (fc.months || []).length }) }),
          el('button', { class: 'btn sm', text: t('fm.full_year'), onclick: function () { fc.months = allMonths(); setRESULT(null); touch(); render(); } }),
          el('button', { class: 'btn sm', text: t('fm.bo_het'), onclick: function () { fc.months = []; setRESULT(null); touch(); render(); } })
        ]),
        el('p', {
          class: 'hint', style: 'margin:8px 0 0',
          html: fc.mode === 'spread'
            ? t('fm.mode_spread_help', { n: (fc.months || []).length || 0 })
            : t('fm.mode_monthly_help')
        })
      ])
    ])
  ]));

  /* --- nhóm & công thức --- */
  var rulesBox = el('div');
  var chips = chipsPanel(null);
  function drawRules() {
    rulesBox.innerHTML = '';
    (fc.rules || []).forEach(function (r, i) {
      var mc = ENGINE.countMatch(r.cond);
      var condBox = fxField(r.cond, function (v) { r.cond = v; setRESULT(null); touch(); }, t('fm.cond_placeholder'), drawRules);
      var fxBox = fxField(r.formula, function (v) { r.formula = v; setRESULT(null); touch(); }, '0');
      var gname = r.name || (t('fm.nhom_thu') + ' ' + (i + 1));
      condBox._label = gname + ' · ' + t('fm.dieu_kien_nhom');
      fxBox._label = gname + ' · ' + t('fm.cong_thuc_tinh_tien');
      condBox._onFocus = fxBox._onFocus = function () { if (chips._refreshTarget) chips._refreshTarget(); };
      rulesBox.appendChild(el('div', { class: 'rule' }, [
        el('div', { class: 'h' }, [
          el('span', { class: 'idx', text: String(i + 1).padStart(2, '0') }),
          el('input', { class: 'nm', value: r.name || '', placeholder: t('fm.ten_nhom'), oninput: function (e) { r.name = e.target.value; touch(); } }),
          mc.error ? el('span', { class: 'tag r', text: t('fm.dieu_kien_loi') })
            : el('span', { class: 'tag' + (mc.all ? '' : ' g'), text: mc.all ? t('fm.all_rows') : t('fm.n_rows_match', { n: fmt(mc.n) }) }),
          el('div', { class: 'sp' }),
          el('button', { class: 'btn sm', text: '↑', onclick: function () { if (i > 0) { var t = fc.rules[i - 1]; fc.rules[i - 1] = r; fc.rules[i] = t; setRESULT(null); touch(); drawRules(); } } }),
          el('button', { class: 'btn sm', text: '↓', onclick: function () { if (i < fc.rules.length - 1) { var t = fc.rules[i + 1]; fc.rules[i + 1] = r; fc.rules[i] = t; setRESULT(null); touch(); drawRules(); } } }),
          el('button', { class: 'btn sm del', text: '✕', onclick: function () { fc.rules.splice(i, 1); setRESULT(null); touch(); drawRules(); } })
        ]),
        el('div', { class: 'b' }, [
          el('div', {}, [el('label', { class: 'f', text: t('fm.dieu_kien_nhom') }), condBox]),
          el('div', {}, [el('label', { class: 'f', text: t('fm.cong_thuc_tinh_tien') }), fxBox])
        ])
      ]));
    });
    if (!fc.rules.length) rulesBox.appendChild(el('div', { class: 'empty', text: t('fm.chua_co_nhom_nao') }));
  }
  drawRules();

  right.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('fm.nhom_cong_thuc') }), el('div', { class: 'sp' }),
      el('button', { class: 'btn sm', text: t('fm.tao_nhom_theo_cot'), onclick: function () { autoGroup(fc); } }),
      /* GIÁ TRỊ MỒI (dữ liệu): ghi thẳng vào S, đi vào file dự án .json — giữ trong code. */
      el('button', { class: 'btn sm', text: t('fm.them_nhom'), onclick: function () { fc.rules.push({ id: uid(), name: 'Nhóm ' + (fc.rules.length + 1), cond: '', formula: '0' }); setRESULT(null); touch(); drawRules(); } })
    ]),
    el('div', { class: 'body' }, [
      el('p', { class: 'hint', html: t('fm.rules_help') }),
      rulesBox
    ])
  ]));

  colLeft.appendChild(chips);
  split.appendChild(right);
  wrap.appendChild(split);
  wrap.appendChild(previewPanel(fc));
  return wrap;
}

function autoGroup(fc) {
  var avail = ENGINE.usableCols();
  var sel = el('select', {}, avail.map(function (c) { return el('option', { value: c, text: c }); }));
  var info = el('p', { class: 'hint' });
  var keep = el('input', { type: 'checkbox' });
  function upd() {
    var rows = ENGINE.previewRows();
    var vals = distinctVals(rows, sel.value);
    info.innerHTML = t('fm.autogroup_info', { col: esc(sel.value), n: vals.length, vals: esc(vals.slice(0, 15).join(' · ')) }) + (vals.length > 15 ? ' …' : '');
    info._vals = vals;
  }
  sel.addEventListener('change', upd); upd();
  modal(t('fm.tao_nhom_theo_cot_2'), el('div', {}, [
    el('p', { class: 'hint', text: t('fm.moi_gia_tri_thanh_mot_nhom_cong') }),
    el('label', { class: 'f', text: t('fm.chon_cot') }), sel, info,
    el('label', { style: 'display:flex;gap:8px;align-items:center;font-size:13px' }, [keep, el('span', { text: t('fm.giu_lai_cac_nhom_hien_co') })])
  ]), [
    { label: t('btn.cancel') },
    {
      label: t('fm.create_groups'), cls: 'pri', onclick: function () {
        var col = sel.value, vals = info._vals || [];
        if (vals.length > 200) { toast(t('fm.too_many_values', { n: vals.length }), 'bad'); return false; }
        var base = keep.checked ? fc.rules.slice() : [];
        vals.forEach(function (v) {
          base.push({ id: uid(), name: col + ' = ' + v, cond: '[' + col + ']="' + String(v).replace(/"/g, '""') + '"', formula: '0' });
        });
        /* GIÁ TRỊ MỒI (dữ liệu): ghi thẳng vào S, đi vào file dự án .json — giữ trong code. */
        base.push({ id: uid(), name: 'Còn lại', cond: '', formula: '0' });
        fc.rules = base; setRESULT(null); touch(); render();
        toast(t('fm.created_groups', { n: vals.length }), 'good');
      }
    }
  ]);
}

var REF_KIND = {
  field: 'fm.kind.field', param: 'fm.kind.param',
  monthvar: 'fm.kind.monthvar', shared: 'fm.kind.shared', unknown: 'fm.kind.unknown'
};

/* Hiển thị giá trị thô: số thì phân cách nghìn, chuỗi giữ nguyên, lỗi thì ghi mã lỗi. */
function refVal(v) {
  if (v && typeof v === 'object' && v.err) return v.err;
  if (v === '' || v === null || v === undefined) return '—';
  if (typeof v === 'number') return fmt(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

function refsTable(refs) {
  var box = el('div', { style: 'margin-top:14px' });
  box.appendChild(el('h4', { class: 'sec', text: t('fm.refs.title') }));
  if (!refs.length) {
    box.appendChild(el('p', { class: 'hint', style: 'margin:0', text: t('fm.refs.empty') }));
    return box;
  }

  var fixed = refs.filter(function (r) { return r.constant; });
  var vary = refs.filter(function (r) { return !r.constant; });

  if (fixed.length) {
    box.appendChild(el('div', { class: 'tw', style: 'max-height:none' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: t('fm.refs.name') }), el('th', { text: t('fm.refs.kind') }),
          el('th', { text: t('fm.refs.value') })
        ])]),
        el('tbody', {}, fixed.map(function (r) {
          return el('tr', {}, [
            el('td', { class: 'mono', text: r.key }),
            el('td', { text: t(REF_KIND[r.kind] || 'fm.kind.unknown') }),
            el('td', { class: r.error ? 'mono' : 'num', text: r.error ? ('✕ ' + r.error) : refVal(r.value) })
          ]);
        }))
      ])
    ]));
  }

  if (vary.length) {
    box.appendChild(el('p', { class: 'hint', style: 'margin:10px 0 4px', text: t('fm.refs.varying') }));
    box.appendChild(el('div', { class: 'tw', style: 'max-height:none' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', { text: t('fm.refs.name') }), el('th', { text: t('fm.refs.kind') })]
          .concat(MONTHS.map(function (m) { return el('th', { class: 'num', text: m }); })))]),
        el('tbody', {}, vary.map(function (r) {
          return el('tr', {}, [
            el('td', { class: 'mono', text: r.key }),
            el('td', { text: t(REF_KIND[r.kind] || 'fm.kind.unknown') })
          ].concat(r.values.map(function (v) {
            return el('td', { class: 'num', text: refVal(v) });
          })));
        }))
      ])
    ]));
  }
  return box;
}

function previewPanel(fc) {
  var st = { idx: 0 };
  var out = el('div');
  var rows = ENGINE.previewRows();
  var idCol = ENGINE.roleCol('key');
  var cols = ENGINE.attrCols().slice(0, 4).map(function (c) { return c.alias; });
  var search = el('input', { type: 'text', placeholder: idCol ? t('fm.search_by', { col: idCol }) : t('fm.search'), style: 'width:200px' });
  var picker = el('select', { style: 'max-width:100%' });

  function label(r) {
    var head = idCol ? String(r[idCol]) : '';
    var rest = cols.filter(function (c) { return c !== idCol; }).slice(0, 3).map(function (c) { return r[c]; }).join(' · ');
    return head ? head + ' — ' + rest : rest;
  }
  function fillPicker() {
    var kw = search.value.trim().toLowerCase();
    picker.innerHTML = ''; var n = 0, frag = document.createDocumentFragment();
    for (var i = 0; i < rows.length && n < 300; i++) {
      var lb = label(rows[i]);
      if (kw && lb.toLowerCase().indexOf(kw) < 0) continue;
      n++; frag.appendChild(el('option', { value: i, selected: i === st.idx, text: lb }));
    }
    if (!n) frag.appendChild(el('option', { text: t('fm.khong_tim_thay') }));
    picker.appendChild(frag);
  }

  function draw() {
    var res = ENGINE.previewRow(fc, st.idx);
    out.innerHTML = '';
    if (res.error && !res.months) {
      out.appendChild(el('div', { class: 'errbox', html: t('fm.preview_error', { e: esc(res.error) }) + (res.group ? ' ' + t('fm.preview_error_group', { g: esc(res.group) }) : '') }));
      return;
    }
    var r = res.row || {};
    out.appendChild(el('div', { class: 'stats', style: 'margin:0 0 12px' }, [
      idCol ? el('div', { class: 'stat' }, [el('div', { class: 'k', text: idCol }), el('div', { class: 'v', style: 'font-size:17px', text: String(res.id == null ? '' : res.id) })]) : null,
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('fm.nhom_khop') }), el('div', { class: 'v', style: 'font-size:15px', text: res.group || t('fm.no_match') })]),
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('fm.ca_nam_dong_nay') }), el('div', { class: 'v money', text: fmt(res.total) })]),
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('export.audit.monthsPicked') }), el('div', { class: 'v', style: 'font-size:15px', text: res.nSel + '/12' }),
        el('div', { class: 'u', text: fc.mode === 'spread' ? t('fm.mode_spread_short') : t('fm.mode_monthly_long') })])
    ]));
    if (res.error) out.appendChild(el('div', { class: 'errbox', text: res.error }));

    var lines = [
      { k: 'raw', t: t('fm.line_raw'), always: true },
      { k: 'raised', t: t('fm.line_raised'), when: res.hasRaise },
      { k: 'afterExc', t: t('fm.line_afterExc'), when: res.hasExc },
      { k: 'accrual', t: t('fm.line_accrual'), when: res.hasAccrual, pct: true },
      { k: 'amount', t: t('fm.line_amount'), always: true, strong: true }
    ].filter(function (l) { return l.always || l.when; });

    var head = [el('th', { text: '' })].concat(MONTHS.map(function (m, i) {
      return el('th', { class: 'num', style: res.months[i] && res.months[i].on ? '' : 'color:#B7C0BB', text: m });
    })).concat([el('th', { class: 'num', text: t('fm.full_year') })]);

    var body = lines.map(function (l) {
      var sum = 0;
      var tds = res.months.map(function (rec) {
        var v = rec[l.k];
        /* Hàng % trích là tỷ lệ chứ không phải tiền — không cộng dồn, hiện kèm dấu %. */
        if (l.pct) {
          return el('td', {
            class: 'num' + (rec.on ? '' : ' zero'),
            text: rec.on ? (v == null ? '100%' : (Math.round(v * 100) / 100) + '%') : '–'
          });
        }
        if (l.k === 'amount') sum += v; else if (rec.on) sum += v;
        return el('td', {
          class: 'num' + (rec.on && v ? '' : ' zero'),
          style: (l.k === 'afterExc' && rec.exc) ? 'color:var(--ochre);font-weight:600' : '',
          text: rec.on ? (v ? fmt(v) : '0') : '–'
        });
      });
      return el('tr', { class: l.strong ? 'tot' : '' },
        [el('td', { text: l.t })].concat(tds)
          .concat([el('td', { class: 'num' + (l.pct ? ' zero' : ''), text: l.pct ? '' : fmt(sum) })]));
    });

    body.push(el('tr', {}, [el('td', { text: t('fm.he_so_dinh_bien') })]
      .concat(res.months.map(function (rec) {
        return el('td', { class: 'num' + (rec.hcf ? '' : ' zero'), text: String(rec.hcf) });
      })).concat([el('td', { class: 'num zero', text: '' })])));

    out.appendChild(el('div', { class: 'tw', style: 'max-height:none' }, [
      el('table', {}, [el('thead', {}, [el('tr', {}, head)]), el('tbody', {}, body)])
    ]));
    out.appendChild(el('p', { class: 'hint', style: 'margin:8px 0 0', text: t('fm.cot_mo_la_thang_khong_trich_so') }));

    /* Mọi thông tin công thức tham chiếu, kèm giá trị của chính dòng này —
       để đối chiếu mà không phải mở lại bảng định biên. */
    out.appendChild(refsTable(res.refs || []));
  }

  fillPicker(); draw();
  search.addEventListener('input', fillPicker);
  picker.addEventListener('change', function () { st.idx = +picker.value; draw(); });

  return el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: t('fm.thu_tren_mot_dong_that') })]),
    el('div', { class: 'body' }, [
      el('div', { class: 'row', style: 'margin-bottom:12px' }, [
        search, el('div', { style: 'flex:1;min-width:200px' }, [picker])
      ]),
      out
    ])
  ]);
}

/* ===========================================================
   MÀN 6 — TỜ TRÌNH NGOẠI LỆ
   =========================================================== */
function viewExc() {
  var wrap = el('div');
  var codes = S.formulas.map(function (f) { return f.code; });

  var tb = el('tbody');
  function draw() {
    tb.innerHTML = '';
    S.exceptions.forEach(function (e, i) {
      var mCell = el('td');
      mCell.appendChild(ribbon(e.months && e.months.length ? e.months : allMonths(), {
        pick: function (m, on) {
          if (!e.months || !e.months.length) e.months = allMonths();
          e.months = on ? e.months.concat([m]).sort(function (a, b) { return a - b; }) : e.months.filter(function (x) { return x !== m; });
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
          [el('option', { value: '', text: '—' })].concat(codes.map(function (c) { return el('option', { value: c, selected: c === e.formulaCode, text: c }); })))]),
        el('td', { style: 'width:115px' }, [el('input', { type: 'text', class: 'fx', style: 'text-align:right', value: e.amount, oninput: function (ev) { e.amount = numOf(ev.target.value); setRESULT(null); touch(); } })]),
        mCell,
        el('td', { style: 'width:115px' }, [el('select', { onchange: function (ev) { e.rule = ev.target.value; setRESULT(null); touch(); } }, [
          el('option', { value: 'MAX', selected: e.rule !== 'OVERRIDE' && e.rule !== 'ADD', text: t('fm.lay_cao_nhat') }),
          el('option', { value: 'OVERRIDE', selected: e.rule === 'OVERRIDE', text: t('fm.ghi_de') }),
          el('option', { value: 'ADD', selected: e.rule === 'ADD', text: t('fm.cong_them') })
        ])]),
        el('td', {}, [el('input', { type: 'text', value: e.note || '', oninput: function (ev) { e.note = ev.target.value; touch(); } })]),
        el('td', { style: 'width:32px' }, [el('button', { class: 'btn sm del', text: '✕', onclick: function () { S.exceptions.splice(i, 1); setRESULT(null); touch(); draw(); } })])
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
      el('button', { class: 'btn sm pri', text: t('table.importExcel'), onclick: function () { pickFile('.xlsx,.xls,.csv', excImport); } })
    ]),
    el('div', { class: 'body' }, [el('p', {
      class: 'hint',
      html: t('exc.help')
    })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [el('thead', {}, [el('tr', {}, ['', t('exc.th_no'), 'ID', t('exc.th_position'), 'Formula Code', t('exc.th_amount'), t('exc.th_months'), t('exc.th_rule'), t('export.audit.note'), ''].map(function (h) { return el('th', { text: h }); }))]), tb])
    ])])
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

function excImport(file) {
  importMapped(file, t('exc.import_title'), [
    { k: 'no', label: 'So To Trinh' }, { k: 'id', label: 'ID' }, { k: 'position', label: 'Chuc Danh' },
    { k: 'formulaCode', label: 'Formula Code', required: true }, { k: 'amount', label: 'So Tien', required: true },
    { k: 'from', label: 'Tu Thang' }, { k: 'to', label: 'Den Thang' }, { k: 'rule', label: 'Quy Tac' }, { k: 'note', label: 'Ghi Chu' }
  ], function (out) {
    out.forEach(function (o) {
      var a = parseInt(o.from, 10), b = parseInt(o.to, 10), months = [];
      if (!isNaN(a)) { var s = Math.max(1, a), e2 = isNaN(b) ? s : Math.min(12, b); for (var m = s; m <= e2; m++) months.push(m); }
      var rule = String(o.rule || 'MAX').toUpperCase().trim();
      if (['MAX', 'OVERRIDE', 'ADD'].indexOf(rule) < 0) rule = 'MAX';
      S.exceptions.push({
        id2: uid(), no: String(o.no || ''), id: o.id, position: o.position,
        formulaCode: String(o.formulaCode || '').trim(), amount: numOf(o.amount),
        months: months, rule: rule, note: String(o.note || ''), active: true
      });
    });
    setRESULT(null); touch(); render();
    toast(t('exc.imported', { n: out.length }), 'good');
  });
}

/* ===========================================================
   MÀN 7 — PHÂN LOẠI CHI PHÍ (4 tầng)
   =========================================================== */
/* Các tổ hợp THỰC SỰ phát sinh từ định biên — dùng cho cả badge lẫn nút sinh sẵn */
function neededCombos() {
  var rows = ENGINE.previewRows();
  var unitCol = ENGINE.roleCol('unit');
  var mp = S.maps;
  var cenOf = {}; (mp.costCenter || []).forEach(function (x) { if (x.costCenter) cenOf[nkey(x.unit)] = x.costCenter; });
  var ccOf = {}; (mp.costCode || []).forEach(function (x) { if (x.costCode) ccOf[nkey(x.formulaCode)] = x.costCode; });
  var budOf = {}; (mp.budgetCode || []).forEach(function (x) { if (x.budgetCode) budOf[nkey(x.costCenter) + '|' + nkey(x.costCode) + '|' + nkey(x.unit)] = x.budgetCode; });
  var accOf = {}; (mp.accountCode || []).forEach(function (x) { if (x.accountCode) accOf[nkey(x.costCode) + '|' + nkey(x.costCenter) + '|' + nkey(x.budgetCode)] = 1; });

  var units = unitCol ? distinctVals(rows, unitCol) : [];
  var fcs = S.formulas.map(function (f) { return f.code; });

  var missFc = fcs.filter(function (c) { return !ccOf[nkey(c)]; });
  var missUnit = units.filter(function (u) { return !cenOf[nkey(u)]; });

  var budSeen = {}, budNeed = [], budMiss = 0;
  var accSeen = {}, accNeed = [], accMiss = 0;
  units.forEach(function (u) {
    var cen = cenOf[nkey(u)] || '';
    fcs.forEach(function (fcCode) {
      var cc = ccOf[nkey(fcCode)] || '';
      if (!cc || !cen) return;
      var bk = nkey(cen) + '|' + nkey(cc) + '|' + nkey(u);
      if (!budSeen[bk]) {
        budSeen[bk] = 1;
        var bud = budOf[bk] || '';
        budNeed.push({ costCenter: cen, costCode: cc, unit: u, budgetCode: '', name: '' });
        if (!bud) budMiss++;
      }
      var bud2 = budOf[bk] || '';
      if (!bud2) return;
      var ak = nkey(cc) + '|' + nkey(cen) + '|' + nkey(bud2);
      if (!accSeen[ak]) {
        accSeen[ak] = 1;
        accNeed.push({ costCode: cc, costCenter: cen, budgetCode: bud2, accountCode: '', name: '' });
        if (!accOf[ak]) accMiss++;
      }
    });
  });
  return {
    units: units, fcs: fcs, missFc: missFc, missUnit: missUnit,
    budNeed: budNeed, budMiss: budMiss, budTotal: budNeed.length,
    accNeed: accNeed, accMiss: accMiss, accTotal: accNeed.length,
    unitCol: unitCol
  };
}

function viewMaps() {
  var wrap = el('div');
  var mp = S.maps;

  var badges = { cc: el('span', { class: 'tag' }), cen: el('span', { class: 'tag' }), bud: el('span', { class: 'tag' }), acc: el('span', { class: 'tag' }) };
  var nc = neededCombos();

  function setBadge(node, miss, total, unitWord) {
    if (!total) { node.className = 'tag'; node.textContent = t('maps.badge_none', { w: unitWord }); return; }
    node.className = 'tag ' + (miss ? 'o' : 'g');
    node.textContent = miss ? t('maps.badge_missing', { miss: fmt(miss), total: fmt(total), w: unitWord }) : t('maps.badge_ok', { total: fmt(total), w: unitWord });
  }
  var refT = null;
  function refresh(now) {
    clearTimeout(refT);
    var go = function () {
      nc = neededCombos();
      setBadge(badges.cc, nc.missFc.length, nc.fcs.length, 'Formula Code');
      setBadge(badges.cen, nc.missUnit.length, nc.units.length, t('maps.word_unit'));
      setBadge(badges.bud, nc.budMiss, nc.budTotal, t('maps.word_combo'));
      setBadge(badges.acc, nc.accMiss, nc.accTotal, t('maps.word_combo'));
    };
    if (now) go(); else refT = setTimeout(go, 250);
  }
  function chg() { setRESULT(null); touch(); refresh(); }
  function chgNow() { setRESULT(null); touch(); refresh(true); }
  refresh(true);

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('fm.bon_tang_phan_loai') }), el('div', { class: 'sp' }),
      el('button', {
        class: 'btn sm del', text: t('fm.xoa_sach_ca_bon_bang'), onclick: function () {
          confirmBox(t('fm.xoa_sach_du_lieu_cua_ca_bon_bang'), function () {
            mp.costCode.length = 0; mp.costCenter.length = 0; mp.budgetCode.length = 0; mp.accountCode.length = 0;
            setRESULT(null); touch(); render(); toast(t('fm.da_xoa_sach'));
          });
        }
      })
    ]),
    el('div', { class: 'body' }, [el('p', {
      class: 'hint',
      html: t('maps.help')
    })])
  ]));

  /* 1. Formula Code → Cost Code */
  wrap.appendChild(foldPanel('map_cc', '1 · Cost Code ← Formula Code', [badges.cc], [], dataTable({
    columns: [
      { k: 'formulaCode', label: 'Formula Code', key: true, type: 'select', options: function () { return S.formulas.map(function (f) { return f.code; }); }, required: true, w: 190 },
      { k: 'costCode', label: 'Cost Code', type: 'text', required: true, w: 160 },
      /* CHUỖI GIAO THỨC: label là header file mẫu .xlsx và khoá khớp khi nhập lại */
      { k: 'name', label: 'Tên Cost Code', type: 'text' }
    ],
    rows: function () { return mp.costCode; },
    blank: function () { return { formulaCode: '', costCode: '', name: '' }; },
    onChange: chg, onImported: chgNow,
    tableName: 'tblMapCostCode', sheetName: 'CostCode', title: 'Cost Code theo Formula Code',
    prefill: function () { return S.formulas.map(function (f) { return { formulaCode: f.code, costCode: '', name: f.name || '' }; }); },
    guide: [t('maps.cc_guide')]
  }), t('maps.cc_note')));

  /* 2. Unit → Cost Center */
  wrap.appendChild(foldPanel('map_cen', t('maps.panel_cen') + (nc.unitCol ? ' (' + nc.unitCol + ')' : ''), [badges.cen], [], dataTable({
    columns: [
      { k: 'unit', label: 'Unit', key: true, type: 'text', required: true, w: 170 },
      { k: 'costCenter', label: 'Cost Center', type: 'text', required: true, w: 160 },
      /* CHUỖI GIAO THỨC (như trên) */
      { k: 'name', label: 'Tên Cost Center', type: 'text' }
    ],
    rows: function () { return mp.costCenter; },
    blank: function () { return { unit: '', costCenter: '', name: '' }; },
    onChange: chg, onImported: chgNow,
    tableName: 'tblMapCostCenter', sheetName: 'CostCenter', title: t('fm.cost_center_theo_don_vi'),
    prefill: function () { return neededCombos().units.map(function (u) { return { unit: u, costCenter: '', name: '' }; }); },
    guide: [t('maps.cen_guide')]
  }), nc.unitCol ? '' : t('maps.cen_no_unitcol')));

  function ccList() { var s2 = {}; mp.costCode.forEach(function (x) { if (x.costCode) s2[x.costCode] = 1; }); return Object.keys(s2).sort(); }
  function cenList() { var s2 = {}; mp.costCenter.forEach(function (x) { if (x.costCenter) s2[x.costCenter] = 1; }); return Object.keys(s2).sort(); }
  function unitList() { return neededCombos().units; }
  function budList() { var s2 = {}; mp.budgetCode.forEach(function (x) { if (x.budgetCode) s2[x.budgetCode] = 1; }); return Object.keys(s2).sort(); }

  /* 3. (Cost Center, Cost Code, Unit) → Budget Code */
  wrap.appendChild(foldPanel('map_bud', t('maps.panel_bud'), [badges.bud], [], dataTable({
    columns: [
      { k: 'costCenter', label: 'Cost Center', key: true, type: 'select', options: cenList, required: true, w: 150 },
      { k: 'costCode', label: 'Cost Code', key: true, type: 'select', options: ccList, required: true, w: 140 },
      { k: 'unit', label: 'Unit', key: true, type: 'select', options: unitList, required: true, w: 140 },
      { k: 'budgetCode', label: 'Budget Code', type: 'text', required: true, w: 150 },
      /* CHUỖI GIAO THỨC (như trên) */
      { k: 'name', label: 'Diễn giải', type: 'text' }
    ],
    rows: function () { return mp.budgetCode; },
    blank: function () { return { costCenter: '', costCode: '', unit: '', budgetCode: '', name: '' }; },
    onChange: chg, onImported: chgNow,
    tableName: 'tblMapBudgetCode', sheetName: 'BudgetCode', title: 'Budget Code',
    prefill: function () { return neededCombos().budNeed; },
    guide: [
      t('maps.bud_guide_1'),
      t('maps.bud_guide_2'),
      t('maps.bud_guide_3')
    ]
  })));

  /* 4. (Cost Code, Cost Center, Budget Code) → Account Code */
  wrap.appendChild(foldPanel('map_acc', '4 · Account Code ← Cost Code + Cost Center + Budget Code', [badges.acc], [], dataTable({
    columns: [
      { k: 'costCode', label: 'Cost Code', key: true, type: 'select', options: ccList, required: true, w: 150 },
      { k: 'costCenter', label: 'Cost Center', key: true, type: 'select', options: cenList, required: true, w: 150 },
      { k: 'budgetCode', label: 'Budget Code', key: true, type: 'select', options: budList, required: true, w: 150 },
      { k: 'accountCode', label: 'Account Code', type: 'text', required: true, w: 150 },
      /* CHUỖI GIAO THỨC (như trên) */
      { k: 'name', label: 'Diễn giải', type: 'text' }
    ],
    rows: function () { return mp.accountCode; },
    blank: function () { return { costCode: '', costCenter: '', budgetCode: '', accountCode: '', name: '' }; },
    onChange: chg, onImported: chgNow,
    tableName: 'tblMapAccountCode', sheetName: 'AccountCode', title: 'Account Code',
    prefill: function () { return neededCombos().accNeed; },
    guide: [t('maps.acc_guide')]
  }), t('maps.acc_note')));

  return wrap;
}

/* ===========================================================
   MÀN 8 — TĂNG LƯƠNG
   =========================================================== */
function viewRaise() {
  var wrap = el('div');
  var box = el('div');
  function draw() {
    box.innerHTML = '';
    S.raises.forEach(function (r, i) {
      var condBox = fxField(r.cond, function (v) { r.cond = v; setRESULT(null); touch(); }, t('raise.cond_placeholder'), draw);
      var mc = ENGINE.countMatch(r.cond);
      var picker = el('div');
      function pickGroup(title, items, code, note) {
        if (!items.length) return;
        var line = el('div', { class: 'chips' });
        items.forEach(function (f) {
          var c = code(f);
          var on = (r.formulas || []).indexOf(c) >= 0;
          line.appendChild(el('span', {
            class: 'chip', style: on ? 'background:var(--mineral);color:#fff;border-color:var(--mineral)' : '',
            text: c, title: f.name || '', onclick: function () {
              r.formulas = on ? r.formulas.filter(function (x) { return x !== c; }) : (r.formulas || []).concat([c]);
              setRESULT(null); touch(); draw();
            }
          }));
        });
        picker.appendChild(el('label', { class: 'f', style: 'margin-top:7px', text: title }));
        picker.appendChild(line);
        if (note) picker.appendChild(el('div', { class: 'fxok', text: note }));
      }
      pickGroup(t('fm.raise.cost_group'), S.formulas, function (f) { return f.code; }, null);
      pickGroup(t('fm.raise.shared_group'),
        (S.shared || []).filter(function (x) { return x && x.code; }),
        function (f) { return f.code; }, t('fm.raise.shared_note'));
      if (!(r.formulas || []).length) picker.appendChild(el('div', { class: 'fxok', text: t('fm.chua_chon_ap_cho_tat_ca_cong_thuc') }));

      box.appendChild(el('div', { class: 'rule' }, [
        el('div', { class: 'h' }, [
          el('input', { type: 'checkbox', checked: r.active !== false, onchange: function (e) { r.active = e.target.checked; setRESULT(null); touch(); } }),
          el('input', { class: 'nm', value: r.name || '', placeholder: t('fm.ten_dot_tang'), oninput: function (e) { r.name = e.target.value; touch(); } }),
          mc.error ? el('span', { class: 'tag r', text: t('fm.dieu_kien_loi') }) : el('span', { class: 'tag g', text: t('raise.n_rows', { n: fmt(mc.n) }) }),
          el('div', { class: 'sp' }),
          el('button', { class: 'btn sm del', text: '✕', onclick: function () { S.raises.splice(i, 1); setRESULT(null); touch(); draw(); } })
        ]),
        el('div', { class: 'b', style: 'grid-template-columns:150px 130px 1fr' }, [
          el('div', {}, [el('label', { class: 'f', text: t('fm.ap_dung_tu_thang') }),
          el('select', { onchange: function (e) { r.fromMonth = +e.target.value; setRESULT(null); touch(); } },
            MONTHS.map(function (m, j) { return el('option', { value: j + 1, selected: (+r.fromMonth || 1) === j + 1, text: m }); }))]),
          el('div', {}, [el('label', { class: 'f', text: t('fm.muc_tang') }),
          el('input', { type: 'number', step: '0.1', class: 'fx', style: 'text-align:right', value: r.pct, oninput: function (e) { r.pct = parseFloat(e.target.value) || 0; setRESULT(null); touch(); } })]),
          el('div', {}, [el('label', { class: 'f', text: t('fm.ap_cho_cong_thuc_nao') }), picker])
        ]),
        el('div', { style: 'padding:0 10px 10px' }, [
          el('label', { class: 'f', text: t('fm.gioi_han_pham_vi_tuy_chon') }),
          el('div', { class: 'fxlayout' }, [condBox, chipsPanel(condBox)])
        ])
      ]));
    });
    if (!S.raises.length) box.appendChild(el('div', { class: 'empty', text: t('fm.chua_khai_bao_dot_tang_luong_nao') }));
  }
  draw();

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('fm.du_kien_tang_luong') }), el('div', { class: 'sp' }),
      /* GIÁ TRỊ MỒI (dữ liệu): ghi thẳng vào S, đi vào file dự án .json — giữ trong code. */
      el('button', { class: 'btn sm', text: t('fm.them_dot'), onclick: function () { S.raises.push({ id: uid(), name: 'Đợt tăng ' + (S.raises.length + 1), fromMonth: 1, pct: 0, cond: '', formulas: [], active: true }); setRESULT(null); touch(); draw(); } })
    ]),
    el('div', { class: 'body' }, [
      el('p', { class: 'hint', text: t('fm.tu_thang_da_chon_tro_di_ket_qua') }),
      box
    ])
  ]));
  return wrap;
}



export { currentFC, viewFormula, autoGroup, previewPanel, viewExc, excTemplate, excImport, neededCombos, viewMaps, viewRaise };
