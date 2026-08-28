/* ===========================================================
   MÀN 1 & 2 — BẢNG ĐỊNH BIÊN và THIẾT LẬP
   Tách nguyên văn từ khối 05-view-hc-setup.js.
   =========================================================== */
import { M, MONTHS, ROLES, S, fmt, nkey, setRESULT, t, touch, uid } from '../state.js';
import { ENGINE, FX } from '../formula.js';
import { dedupeHeaders, distinctVals, pickFile, readWorkbook, sheetAoa } from '../io.js';
import { downloadTemplate, el, modal, panel, readTable, render, ribbon, toast } from '../ui.js';
import { chipsPanel, fxField } from './fxhelp.js';

/* ==== 05-view-hc-setup.js ==== */
/* ===========================================================
   MÀN 1 — ĐỊNH BIÊN
   =========================================================== */
function guessRole(name, values) {
  var s = String(name).toLowerCase().trim();
  var m = /^(t|th|tháng|thang|m|month)?\s*0?([1-9]|1[0-2])$/.exec(s);
  if (m) return { role: 'month', month: +m[2] };
  /* CHUỖI GIAO THỨC — đừng đưa sang content.md.
     Ba danh sách dưới đây so khớp với TÊN CỘT có thật trong file Excel định biên
     người dùng tải lên. Dịch hay sửa chúng là hỏng chức năng tự nhận diện cột. */
  if (['id', 'mã nv', 'manv', 'mã nhân viên', 'employee id', 'mã số'].indexOf(s) >= 0) return { role: 'key' };
  if (['position', 'chức danh', 'chuc danh', 'vị trí', 'job title'].indexOf(s) >= 0) return { role: 'position' };
  if (['unit', 'bộ phận', 'đơn vị', 'don vi'].indexOf(s) >= 0) return { role: 'unit' };
  return { role: 'attr' };
}
function guessType(values) {
  var n = 0, t = 0;
  values.slice(0, 60).forEach(function (v) {
    if (v === '' || v == null) return;
    t++; if (typeof v === 'number' || /^-?[\d.,]+$/.test(String(v).trim())) n++;
  });
  return t && n === t ? 'num' : 'text';
}

function importHeadcount(file) {
  readWorkbook(file, function (err, wb) {
    if (err) { toast(t('hc.err_read', { e: err.message }), 'bad'); return; }
    var st = { sheet: wb.SheetNames[0], hr: 1 };
    var box = el('div');
    function build() {
      var aoa = sheetAoa(wb, st.sheet);
      var hr = Math.max(1, Math.min(st.hr, aoa.length || 1));
      var headers = dedupeHeaders(aoa[hr - 1] || []);
      var nMonth = headers.filter(function (h) { return guessRole(h).role === 'month'; }).length;
      box.innerHTML = '';
      box.appendChild(el('div', { class: 'row', style: 'margin-bottom:10px' }, [
        el('div', { style: 'flex:1' }, [el('label', { class: 'f', text: 'Sheet' }),
        el('select', { onchange: function (e) { st.sheet = e.target.value; build(); } },
          wb.SheetNames.map(function (s) { return el('option', { value: s, selected: s === st.sheet, text: s }); }))]),
        el('div', { style: 'width:140px' }, [el('label', { class: 'f', text: t('hc.dong_tieu_de') }),
        el('input', { type: 'number', min: 1, value: hr, onchange: function (e) { st.hr = +e.target.value || 1; build(); } })])
      ]));
      box.appendChild(el('p', {
        class: 'hint', html: nMonth === 12
          ? t('hc.months_ok')
          : t('hc.months_partial', { n: nMonth })
      }));
      box.appendChild(readTable(headers.slice(0, 22), aoa.slice(hr, hr + 4).map(function (r) {
        return headers.slice(0, 22).map(function (h, i) { return r[i]; });
      }), { maxH: '230px' }));
      box.appendChild(el('p', { class: 'hint', style: 'margin-top:8px', text: t('hc.rows_cols', { rows: Math.max(0, aoa.length - hr), cols: headers.length }) }));
      box._data = function () { return { aoa: aoa, hr: hr, headers: headers }; };
    }
    build();

    modal(t('hc.import_title', { file: file.name }), box, [
      { label: t('btn.cancel') },
      {
        label: t('btn.import'), cls: 'pri', onclick: function () {
          var d = box._data();
          var rows = [];
          for (var i = d.hr; i < d.aoa.length; i++) {
            var raw = d.aoa[i];
            if (!raw || raw.every(function (x) { return x === '' || x == null; })) continue;
            var o = {};
            d.headers.forEach(function (h, j) { o[h] = raw[j]; });
            rows.push(o);
          }
          var prev = {};
          (S.cols || []).forEach(function (c) { prev[c.src] = c; });
          S.hc = { headers: d.headers, rows: rows, file: file.name, at: new Date().toLocaleString('vi-VN') };
          S.cols = d.headers.map(function (h) {
            if (prev[h]) return prev[h];
            var vals = rows.slice(0, 60).map(function (r) { return r[h]; });
            var g = guessRole(h, vals);
            return { src: h, alias: h, role: g.role, month: g.month || null, type: g.role === 'month' ? 'num' : guessType(vals) };
          });
          ENGINE.invalidate(); setRESULT(null); touch(); render();
          toast(t('hc.imported_rows', { n: rows.length }), 'good');
        }
      }
    ]);
  });
}

function hcTemplate() {
  downloadTemplate({
    tableName: 'tblDinhBien', title: t('hc.bang_dinh_bien'), sheetName: 'DinhBien',
    headers: ['Status', 'Dept', 'Unit', 'Position', 'Workplace Location', 'Grade', 'Coefficient', 'Gender', 'ID',
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    rows: [
      ['01. Current Headcount', 'AC', 'AC', 'AC_001', 'DHG', '5A.12', 1.276, 'Male', 1401, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
      ['01. Current Headcount', 'SL', 'SL-CT', 'SL_101', 'DHG-CT', '4B.03', 0.98, 'Female', 1402, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    ],
    guide: [
      t('hc.guide_1'),
      t('hc.guide_2'),
      t('hc.guide_3'),
      t('hc.guide_4')
    ],
    file: 'mau-dinh-bien.xlsx'
  });
}

function viewHC() {
  var wrap = el('div');
  if (!S.hc.rows.length) {
    wrap.appendChild(panel(t('hc.nhap_bang_dinh_bien'), [
      el('button', { class: 'btn sm', text: t('table.downloadTemplate'), onclick: hcTemplate })
    ], el('div', {
      class: 'drop', onclick: function () { pickFile('.xlsx,.xls,.csv', importHeadcount); },
      ondragover: function (e) { e.preventDefault(); e.currentTarget.classList.add('over'); },
      ondragleave: function (e) { e.currentTarget.classList.remove('over'); },
      ondrop: function (e) { e.preventDefault(); e.currentTarget.classList.remove('over'); if (e.dataTransfer.files[0]) importHeadcount(e.dataTransfer.files[0]); }
    }, [
      el('strong', { text: t('hc.chon_file_dinh_bien_xlsx') }),
      el('span', { text: t('hc.hoac_keo_tha_vao_day_moi_dong_mot') })
    ])));
    return wrap;
  }

  var rows = ENGINE.previewRows();
  var per = new Array(M).fill(0);
  rows.forEach(function (r) { for (var m = 0; m < M; m++) per[m] += (r.__m[m] || 0); });
  var sum = per.reduce(function (a, b) { return a + b; }, 0);

  wrap.appendChild(el('div', { class: 'stats' }, [
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.dong_dinh_bien') }), el('div', { class: 'v', text: fmt(rows.length) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.dinh_bien_t01') }), el('div', { class: 'v', text: fmt(per[0]) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.dinh_bien_t12') }), el('div', { class: 'v', text: fmt(per[11]) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.binh_quan_nam') }), el('div', { class: 'v', text: fmt(sum / 12) })]),
    el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('hc.nguon') }), el('div', { class: 'v', style: 'font-size:13px;line-height:1.3', text: S.hc.file || '—' }), el('div', { class: 'u', text: S.hc.at })])
  ]));

  var cols = ENGINE.attrCols();
  var q = { t: '', lim: 100 };
  var tb = el('tbody');
  function fill() {
    tb.innerHTML = '';
    var kw = q.t.trim().toLowerCase(), n = 0;
    for (var i = 0; i < rows.length && n < q.lim; i++) {
      var r = rows[i];
      if (kw && !cols.some(function (c) { return String(r[c.alias]).toLowerCase().indexOf(kw) >= 0; })) continue;
      n++;
      var tr = el('tr', {}, cols.map(function (c) { return el('td', { text: String(r[c.alias] == null ? '' : r[c.alias]) }); }));
      tr.appendChild(el('td', {}, [ribbon(r.__m, { factor: true })]));
      tb.appendChild(tr);
    }
    if (!n) tb.appendChild(el('tr', {}, [el('td', { colspan: cols.length + 1, class: 'empty', text: t('hc.khong_co_dong_nao_khop') })]));
  }
  fill();

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('hc.du_lieu_dinh_bien') }), el('div', { class: 'sp' }),
      el('input', { type: 'text', placeholder: t('hc.tim_trong_bang'), style: 'width:190px', oninput: function (e) { q.t = e.target.value; fill(); } }),
      el('button', { class: 'btn sm', text: t('hc.hien_them_500'), onclick: function () { q.lim += 500; fill(); } }),
      el('button', { class: 'btn sm', text: t('hc.mau'), onclick: hcTemplate }),
      el('button', { class: 'btn sm', text: t('hc.nhap_lai'), onclick: function () { pickFile('.xlsx,.xls,.csv', importHeadcount); } })
    ]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
      el('table', {}, [el('thead', {}, [el('tr', {}, cols.map(function (c) { return el('th', { text: c.alias }); })
        .concat([el('th', { text: t('hc.dinh_bien_t01_t12') })]))]), tb])
    ])])
  ]));
  return wrap;
}

/* ===========================================================
   MÀN 2 — THIẾT LẬP (mọi cột + tham số)
   =========================================================== */
function viewSetup() {
  var wrap = el('div');

  wrap.appendChild(panel(t('export.audit.period'), [], el('div', { class: 'row' }, [
    el('div', { style: 'flex:1;min-width:220px' }, [el('label', { class: 'f', text: t('hc.ten_ky') }),
    el('input', { type: 'text', value: S.meta.name, oninput: function (e) { S.meta.name = e.target.value; touch(); } })]),
    el('div', { style: 'width:130px' }, [el('label', { class: 'f', text: t('hc.nam') }),
    el('input', { type: 'number', value: S.meta.year, oninput: function (e) { S.meta.year = +e.target.value; touch(); } })])
  ])));

  if (!S.cols.length) {
    wrap.appendChild(panel(t('hc.cot_cua_bang_dinh_bien'), [], el('div', { class: 'empty' }, [
      el('strong', { text: t('hc.chua_co_cot_nao') }), el('span', { text: t('hc.nhap_bang_dinh_bien_truoc') })
    ])));
  } else {
    var rows = S.hc.rows;
    var tb = el('tbody');
    function draw() {
      tb.innerHTML = '';
      var monthUsed = {};
      S.cols.forEach(function (c) { if (c.role === 'month' && c.month) monthUsed[c.month] = (monthUsed[c.month] || 0) + 1; });
      S.cols.forEach(function (c, i) {
        var vals = rows.slice(0, 40).map(function (r) { return r[c.src]; });
        var dv = distinctVals(rows, c.src);
        var dup = c.role === 'month' && c.month && monthUsed[c.month] > 1;
        tb.appendChild(el('tr', { style: c.role === 'skip' ? 'opacity:.5' : '' }, [
          el('td', { class: 'mono', style: 'width:150px', text: c.src }),
          el('td', { style: 'width:160px' }, [el('input', {
            type: 'text', class: 'fx', value: c.alias,
            oninput: function (e) { c.alias = e.target.value; ENGINE.invalidate(); setRESULT(null); touch(); }
          })]),
          el('td', { style: 'width:170px' }, [el('select', {
            onchange: function (e) {
              c.role = e.target.value;
              if (c.role === 'month' && !c.month) c.month = null;
              ENGINE.invalidate(); setRESULT(null); touch(); draw();
            }
          }, ROLES.map(function (r) { return el('option', { value: r.v, selected: c.role === r.v, text: t(r.t) }); }))]),
          el('td', { style: 'width:90px' }, [c.role === 'month' ? el('select', {
            style: dup ? 'border-color:var(--danger)' : '',
            onchange: function (e) { c.month = +e.target.value || null; ENGINE.invalidate(); setRESULT(null); touch(); draw(); }
          }, [el('option', { value: '', text: '—' })].concat(MONTHS.map(function (mm, k) {
            return el('option', { value: k + 1, selected: c.month === k + 1, text: mm });
          }))) : el('span', { class: 'fxok', text: '' })]),
          el('td', { style: 'width:90px' }, [el('select', {
            onchange: function (e) { c.type = e.target.value; ENGINE.invalidate(); setRESULT(null); touch(); }
          }, [el('option', { value: 'text', selected: c.type !== 'num', text: t('hc.chu') }), el('option', { value: 'num', selected: c.type === 'num', text: t('hc.so') })])]),
          el('td', { class: 'num', style: 'width:70px', text: fmt(dv.length) }),
          el('td', { class: 'mono', style: 'color:var(--soft)', text: dv.slice(0, 6).join(' · ') })
        ]));
      });
    }
    draw();

    var nMonth = S.cols.filter(function (c) { return c.role === 'month' && c.month; }).length;
    wrap.appendChild(el('div', { class: 'panel' }, [
      el('header', {}, [
        el('h3', { text: t('hc.cot_cua_bang_dinh_bien') }),
        el('span', { class: 'tag' + (nMonth === 12 ? ' g' : ' o'), text: t('hc.month_cols_badge', { n: nMonth }) }),
        el('div', { class: 'sp' }),
        el('button', { class: 'btn sm', text: t('hc.doan_lai_vai_tro'), onclick: function () {
          S.cols.forEach(function (c) {
            var g = guessRole(c.src, rows.slice(0, 60).map(function (r) { return r[c.src]; }));
            c.role = g.role; c.month = g.month || null;
          });
          ENGINE.invalidate(); setRESULT(null); touch(); render();
        } })
      ]),
      el('div', { class: 'body' }, [el('p', {
        class: 'hint',
        html: t('setup.cols_help')
      })]),
      el('div', { class: 'body tight' }, [el('div', { class: 'tw' }, [
        el('table', {}, [el('thead', {}, [el('tr', {}, [t('setup.th_file_col'), t('setup.th_formula_name'), t('setup.th_role'), t('export.audit.month'), t('setup.th_type'), t('setup.th_distinct'), t('setup.th_sample')]
          .map(function (h, i) { return el('th', { class: i === 5 ? 'num' : '', text: h }); }))]), tb])
      ])])
    ]));
  }

  /* --- tham số --- */
  var pb = el('tbody');
  function fillP() {
    pb.innerHTML = '';
    S.params.forEach(function (p, i) {
      pb.appendChild(el('tr', {}, [
        el('td', {}, [el('input', {
          type: 'text', class: 'fx', value: p.name || '',
          oninput: function (e) { p.name = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'); e.target.value = p.name; setRESULT(null); touch(); }
        })]),
        el('td', { style: 'width:170px' }, [el('input', {
          type: 'text', class: 'fx', style: 'text-align:right', value: p.value,
          oninput: function (e) { var n = parseFloat(e.target.value.replace(/[,\s]/g, '')); p.value = isNaN(n) ? e.target.value : n; setRESULT(null); touch(); }
        })]),
        el('td', {}, [el('input', { type: 'text', value: p.note || '', oninput: function (e) { p.note = e.target.value; touch(); } })]),
        el('td', { style: 'width:32px' }, [el('button', { class: 'btn sm del', text: '✕', onclick: function () { S.params.splice(i, 1); setRESULT(null); touch(); fillP(); } })])
      ]));
    });
    if (!S.params.length) pb.appendChild(el('tr', {}, [el('td', { colspan: 4, class: 'empty', text: t('hc.chua_co_hang_so_nao') })]));
  }
  fillP();

  /* ---------- Công thức dùng chung ----------
     Biểu thức đặt tên, tính lúc chạy theo từng dòng × tháng. Công thức chi phí
     gọi được bằng tên gọi (LUONG_CO_BAN) hoặc bằng diễn giải ([Lương cơ bản]).
     Khác tham số ở chỗ tham số là một con số cố định, còn cái này là biểu thức. */
  var shBox = el('div');
  function drawShared() {
    shBox.innerHTML = '';
    var seen = {};
    (S.shared || []).forEach(function (sh, i) {
      var code = nkey(sh.code);
      var dup = code && seen[code];
      seen[code] = 1;
      var fx = fxField(sh.formula, function (v) { sh.formula = v; setRESULT(null); touch(); }, '0', drawShared);
      fx._label = sh.code || t('setup.shared.untitled');
      var chk = FX.tryCompile(String(sh.formula || '').trim() || '0');
      shBox.appendChild(el('div', { class: 'rule' }, [
        el('div', { class: 'h' }, [
          el('span', { class: 'idx', text: String(i + 1).padStart(2, '0') }),
          el('input', {
            class: 'nm', value: sh.code || '', placeholder: 'TEN_GOI', style: 'width:180px;font-family:var(--mono)',
            oninput: function (e) {
              sh.code = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
              e.target.value = sh.code; setRESULT(null); touch();
            },
            onblur: drawShared
          }),
          el('input', {
            class: 'nm', value: sh.name || '', placeholder: t('setup.shared.name'), style: 'width:200px;font-weight:400',
            oninput: function (e) { sh.name = e.target.value; setRESULT(null); touch(); }, onblur: drawShared
          }),
          dup ? el('span', { class: 'tag r', text: t('setup.shared.dup') })
              : (chk.ok ? el('span', { class: 'tag g', text: t('fx.valid') })
                        : el('span', { class: 'tag r', text: t('setup.shared.bad') })),
          el('div', { class: 'sp' }),
          el('button', {
            class: 'btn sm del', text: '✕',
            onclick: function () { S.shared.splice(i, 1); setRESULT(null); touch(); drawShared(); }
          })
        ]),
        el('div', { class: 'b', style: 'grid-template-columns:1fr' }, [
          el('div', {}, [el('label', { class: 'f', text: t('setup.shared.formula') }), fx])
        ])
      ]));
    });
    if (!(S.shared || []).length) shBox.appendChild(el('div', { class: 'empty', text: t('setup.shared.empty') }));
  }
  drawShared();

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('setup.shared.title') }), el('div', { class: 'sp' }),
      el('button', {
        class: 'btn sm', text: t('setup.shared.add'),
        onclick: function () {
          S.shared = S.shared || [];
          S.shared.push({ id: uid(), code: 'CT_MOI_' + (S.shared.length + 1), name: '', formula: '0' });
          setRESULT(null); touch(); drawShared();
        }
      })
    ]),
    el('div', { class: 'body' }, [el('p', { class: 'hint', html: t('setup.shared.help') })]),
    el('div', { class: 'body' }, [
      el('div', { class: 'fxlayout' }, [shBox, chipsPanel(null)])
    ])
  ]));

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('hc.tham_so_dung_chung') }), el('div', { class: 'sp' }),
      el('button', { class: 'btn sm', text: t('hc.them'), onclick: function () { S.params.push({ name: 'THAM_SO_MOI', value: 0, note: '' }); touch(); fillP(); } })
    ]),
    el('div', { class: 'body' }, [el('p', { class: 'hint', html: t('setup.params_help') })]),
    el('div', { class: 'body tight' }, [el('div', { class: 'tw', style: 'max-height:none' }, [
      el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: t('export.audit.name') }), el('th', { text: t('export.audit.value') }), el('th', { text: t('export.audit.note') }), el('th', { text: '' })])]), pb])
    ])])
  ]));

  return wrap;
}



export { guessRole, guessType, importHeadcount, hcTemplate, viewHC, viewSetup };
