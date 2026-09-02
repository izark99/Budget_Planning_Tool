/* ===========================================================
   MÀN 3 & 5 — PHÂN LOẠI NHÓM và NGÀY CÔNG
   Tách nguyên văn từ khối 06-view-class-cal.js.
   =========================================================== */
import { CAL_FIELDS, M, MONTHS, S, blankCalTable, fmt, fmtNum, nkey, numOf, setRESULT, t, touch, uid } from '../core/state.js';
import { ENGINE } from '../core/formula.js';
import { pickFile } from '../platform/io.js';
import { confirmBox, dataTable, downloadTemplate, el, esc, foldPanel, importMapped, panel, render, toast } from '../ui/ui.js';

/* Thư viện gốc nạp bằng <script defer> cổ điển. Trỏ tường minh vào window
   thay vì dựa vào chuỗi scope — để công cụ tĩnh thấy được nguồn gốc. */
const XLTABLE = window.XLTABLE;

/* ==== 06-view-class-cal.js ==== */
/* ===========================================================
   MÀN 3 — PHÂN LOẠI NHÓM
   Mỗi bảng: N cột khoá + 1 cột kết quả (thành cột dẫn xuất mới)
   Bảng sau dùng được kết quả của bảng trước.
   =========================================================== */
function availableKeys(beforeIdx) {
  var out = ENGINE.attrCols().map(function (c) { return c.alias; });
  (S.classes || []).forEach(function (c, i) { if (i < beforeIdx && c.name) out.push(c.name); });
  return out;
}

function classCombos(cl) {
  var rows = ENGINE.previewRows();
  var seen = {}, out = [];
  rows.forEach(function (r) {
    var vals = (cl.keys || []).map(function (k) { return r[k] == null ? '' : String(r[k]).trim(); });
    var k = vals.map(nkey).join('|');
    if (seen[k]) return; seen[k] = 1;
    var o = {}; (cl.keys || []).forEach(function (kc, j) { o['k' + j] = vals[j]; });
    o.res = ''; out.push(o);
  });
  return out.slice(0, 800);
}

function classMissCount(cl) {
  if (!cl.name || !(cl.keys || []).length) return null;
  var keys = cl.keys, rows = ENGINE.previewRows(), idx = {};
  (cl.rows || []).forEach(function (r) {
    var star = keys.some(function (_, j) { return String(r[j]).trim() === '*'; });
    idx[keys.map(function (_, j) { return nkey(r[j]); }).join('|')] = 1;
    if (star) idx.__star = 1;
  });
  var miss = 0;
  rows.forEach(function (r) {
    var vals = keys.map(function (k) { return nkey(r[k]); });
    if (idx[vals.join('|')]) return;
    if (idx.__star) {
      for (var b = 1; b < (1 << keys.length); b++) {
        var probe = vals.map(function (x, j) { return (b >> j) & 1 ? '*' : x; });
        if (idx[probe.join('|')]) return;
      }
    }
    miss++;
  });
  return miss;
}

function viewClasses() {
  var wrap = el('div');

  if (!S.cols.length) {
    wrap.appendChild(panel(t('cal.phan_loai_nhom'), [], el('div', { class: 'empty' }, [
      el('strong', { text: t('msg.no_hc') }), el('span', { text: t('cal.nhap_dinh_bien_roi_quay_lai_day') })
    ])));
    return wrap;
  }

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('cal.cac_bang_phan_loai') }),
      el('span', { class: 'tag', text: t('cal.n_tables', { n: S.classes.length }) }),
      el('div', { class: 'sp' }),
      el('button', {
        class: 'btn sm del', text: t('cal.xoa_sach_du_lieu_moi_bang'), onclick: function () {
          confirmBox(t('cal.xoa_sach_dong_du_lieu_cua_tat_ca'), function () {
            S.classes.forEach(function (c) { c.rows = []; c._objs = null; });
            ENGINE.invalidate(); setRESULT(null); touch(); render(); toast(t('cal.da_xoa_sach_du_lieu'));
          });
        }
      }),
      el('button', {
        class: 'btn sm pri', text: t('cal.them_bang_phan_loai'), onclick: function () {
          /* GIÁ TRỊ MỒI (dữ liệu): ghi thẳng vào S, đi vào file dự án .json — giữ trong code. */
          S.classes.push({ id: uid(), name: 'Nhóm mới', keys: [], rows: [], def: '', type: 'text' });
          ENGINE.invalidate(); setRESULT(null); touch(); render();
        }
      })
    ]),
    el('div', { class: 'body' }, [el('p', {
      class: 'hint',
      html: t('cal.classes_help')
    })])
  ]));

  S.classes.forEach(function (cl, idx) {
    var keys = cl.keys || [];
    var avail = availableKeys(idx);

    function asObjs() {
      if (!cl._objs || cl._dirtyKeys !== keys.join('|')) {
        cl._objs = (cl.rows || []).map(function (r) {
          var o = {}; keys.forEach(function (_, j) { o['k' + j] = r[j] == null ? '' : r[j]; });
          o.res = r[keys.length] == null ? '' : r[keys.length];
          return o;
        });
        cl._dirtyKeys = keys.join('|');
      }
      return cl._objs;
    }

    var stat = el('span', { class: 'tag' });
    function updateStat() {
      var miss = classMissCount(cl);
      if (miss === null) { stat.className = 'tag'; stat.textContent = t('cal.not_declared'); return; }
      stat.className = 'tag ' + (miss ? 'o' : 'g');
      stat.textContent = miss ? t('cal.rows_unmatched', { n: fmt(miss) }) : t('cal.rows_all_matched', { n: fmt(ENGINE.previewRows().length) });
    }

    var statT = null;
    function syncBack() {
      cl.rows = asObjs().map(function (o) {
        return keys.map(function (_, j) { return o['k' + j]; }).concat([o.res]);
      });
      ENGINE.invalidate(); setRESULT(null); touch();
      clearTimeout(statT); statT = setTimeout(updateStat, 250);
    }
    updateStat();

    var editor = keys.length ? dataTable({
      columns: keys.map(function (k, j) { return { k: 'k' + j, label: k, key: true, type: 'text' }; })
        .concat([/* CHUỖI GIAO THỨC: label thành header file mẫu .xlsx và là khoá khớp khi nhập lại */
        { k: 'res', label: cl.name || 'Nhóm', type: cl.type === 'num' ? 'num' : 'text', w: cl.type === 'num' ? 160 : null }]),
      rows: asObjs,
      blank: function () { var o = {}; keys.forEach(function (_, j) { o['k' + j] = ''; }); o.res = ''; return o; },
      onChange: syncBack,
      onImported: function () { syncBack(); updateStat(); },
      tableName: 'tbl' + XLTABLE.safeName(cl.name || 'PhanLoai'),
      sheetName: 'PhanLoai',
      title: t('cal.class_table_title', { name: cl.name || '' }),
      prefill: function () { return classCombos(cl); },
      guide: [
        t('cal.class_guide_1'),
        t('cal.class_guide_2'),
        t('cal.class_guide_3'),
        t('cal.class_guide_4')
      ],
      emptyText: t('cal.chua_co_dong_nao_bam_sinh_san_tu')
    }) : el('div', { class: 'empty', text: t('cal.chon_it_nhat_mot_cot_khoa') });

    var head = el('div', {}, [
      el('div', { class: 'row', style: 'margin-bottom:10px' }, [
        el('div', { style: 'width:230px' }, [el('label', { class: 'f', text: t('cal.ten_cot_nhom_sinh_ra') }),
        el('input', {
          type: 'text', class: 'fx', value: cl.name || '',
          onchange: function (e) { cl.name = e.target.value; ENGINE.invalidate(); setRESULT(null); touch(); render(); }
        })]),
        el('div', { style: 'width:110px' }, [el('label', { class: 'f', text: t('setup.th_type') }),
        el('select', {
          onchange: function (e) { cl.type = e.target.value; ENGINE.invalidate(); setRESULT(null); touch(); render(); }
        }, [
          el('option', { value: 'text', selected: cl.type !== 'num', text: t('hc.chu') }),
          el('option', { value: 'num', selected: cl.type === 'num', text: t('hc.so') })
        ])]),
        el('div', { style: 'width:190px' }, [el('label', { class: 'f', text: t('cal.mac_dinh_khi_khong_khop') }),
        el('input', {
          type: 'text', class: 'fx', style: cl.type === 'num' ? 'text-align:right' : '',
          value: cl.type === 'num' ? fmtNum(cl.def) : (cl.def || ''),
          onfocus: function (e) { if (cl.type === 'num') e.target.value = (cl.def === '' || cl.def == null) ? '' : String(cl.def); },
          onblur: function (e) { if (cl.type === 'num') e.target.value = fmtNum(cl.def); },
          oninput: function (e) {
            cl.def = cl.type === 'num' ? (e.target.value.trim() === '' ? '' : numOf(e.target.value)) : e.target.value;
            ENGINE.invalidate(); setRESULT(null); touch();
          }
        })])
      ]),
      el('div', { style: 'margin-bottom:12px' }, [
        el('label', { class: 'f', text: t('cal.cot_khoa_bam_de_chon') }),
        el('div', { class: 'chips' }, avail.map(function (a) {
          var on = keys.indexOf(a) >= 0;
          return el('span', {
            class: 'chip', style: on ? 'background:var(--mineral);color:#fff;border-color:var(--mineral)' : '',
            text: a, onclick: function () {
              cl.keys = on ? keys.filter(function (x) { return x !== a; }) : keys.concat([a]);
              cl._objs = null; cl.rows = []; ENGINE.invalidate(); setRESULT(null); touch(); render();
            }
          });
        }))
      ])
    ]);

    wrap.appendChild(foldPanel('class_' + cl.id,
      String(idx + 1).padStart(2, '0') + ' · ' + (cl.name || t('cal.unnamed')),
      [stat],
      [
        el('button', { class: 'btn sm', text: '↑', onclick: function () { if (idx > 0) { var t = S.classes[idx - 1]; S.classes[idx - 1] = cl; S.classes[idx] = t; ENGINE.invalidate(); setRESULT(null); touch(); render(); } } }),
        el('button', { class: 'btn sm', text: '↓', onclick: function () { if (idx < S.classes.length - 1) { var t = S.classes[idx + 1]; S.classes[idx + 1] = cl; S.classes[idx] = t; ENGINE.invalidate(); setRESULT(null); touch(); render(); } } }),
        el('button', { class: 'btn sm del', text: t('cal.xoa_bang'), onclick: function () { confirmBox(t('cal.confirm_delete_class', { name: cl.name || '' }), function () { S.classes.splice(idx, 1); ENGINE.invalidate(); setRESULT(null); touch(); render(); }); } })
      ],
      el('div', {}, [head, editor])));
  });

  if (!S.classes.length) {
    wrap.appendChild(el('div', { class: 'panel' }, [el('div', { class: 'empty' }, [
      el('strong', { text: t('cal.chua_co_bang_phan_loai_nao') }),
      el('span', { text: t('cal.vi_du_bang_dau_lay_khoa_unit_sinh') })
    ])]));
  }
  return wrap;
}

/* ===========================================================
   MÀN 4 — NGÀY CÔNG & NGÀY NGHỈ
   =========================================================== */
function viewCalendar() {
  var wrap = el('div');
  var cal = S.calendar;

  var groupOpts = [''].concat(ENGINE.usableCols());
  wrap.appendChild(panel(t('cal.lich_ap_cho_ai'), [], el('div', { class: 'row' }, [
    el('div', { style: 'width:280px' }, [
      el('label', { class: 'f', text: t('cal.phan_lich_theo_cot') }),
      el('select', {
        onchange: function (e) { cal.groupCol = e.target.value; setRESULT(null); touch(); render(); }
      }, groupOpts.map(function (c) {
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

  (cal.tables || []).forEach(function (tbl, idx) {
    var tb = el('tbody');
    function draw() {
      tb.innerHTML = '';
      MONTHS.forEach(function (mn, k) {
        var rec = tbl.m[k];
        var used = CAL_FIELDS.slice(1).reduce(function (s, f) { return s + numOf(rec[f.k]); }, 0);
        var gap = numOf(rec.std) - used;
        tb.appendChild(el('tr', {}, [el('td', { class: 'mono', style: 'width:60px', text: mn })]
          .concat(CAL_FIELDS.map(function (f) {
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
    var t2 = null;
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
          var first = tbl.m[0];
          for (var k = 1; k < M; k++) CAL_FIELDS.forEach(function (f) { tbl.m[k][f.k] = first[f.k]; });
          setRESULT(null); touch(); render();
        } }),
        cal.tables.length > 1 ? el('button', { class: 'btn sm del', text: t('cal.xoa_lich'), onclick: function () { cal.tables.splice(idx, 1); setRESULT(null); touch(); render(); } }) : null
      ]),
      el('div', { class: 'body' }, [el('p', {
        class: 'hint',
        html: t('cal.vars_help', { vars: CAL_FIELDS.map(function (f) { return '<code>' + f.varName + '</code>'; }).join(' · ') })
      })]),
      el('div', { class: 'body tight' }, [el('div', { class: 'tw', style: 'max-height:none' }, [
        el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: t('export.audit.month') })]
          .concat(CAL_FIELDS.map(function (f) { return el('th', { class: 'num', text: f.label }); }))
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
      el('button', { class: 'btn pri', text: t('table.importExcel'), onclick: function () { pickFile('.xlsx,.xls,.csv', calImport); } })
    ])])
  ]));

  return wrap;
}

function calTemplate() {
  var rows = [];
  (S.calendar.tables || []).forEach(function (tbl) {
    MONTHS.forEach(function (mn, k) {
      rows.push([tbl.scope || '*', k + 1].concat(CAL_FIELDS.map(function (f) { return numOf(tbl.m[k][f.k]); })));
    });
  });
  downloadTemplate({
    tableName: 'tblNgayCong', title: t('cal.ngay_cong_chuan_tung_thang'), sheetName: 'NgayCong',
    headers: ['Nhom', 'Thang'].concat(CAL_FIELDS.map(function (f) { return f.label; })),
    rows: rows,
    guide: [
      t('cal.guide_1'),
      t('cal.guide_2'),
      t('cal.guide_3')
    ],
    file: 'mau-ngay-cong.xlsx'
  });
}

function calImport(file) {
  var fields = [{ k: 'scope', label: 'Nhom' }, { k: 'month', label: 'Thang', required: true }]
    .concat(CAL_FIELDS.map(function (f) { return { k: f.k, label: f.label }; }));
  importMapped(file, t('cal.import_title'), fields, function (out) {
    var byScope = {};
    out.forEach(function (o) {
      var sc = String(o.scope == null || o.scope === '' ? '*' : o.scope).trim();
      var m = parseInt(o.month, 10);
      if (!(m >= 1 && m <= 12)) return;
      if (!byScope[sc]) byScope[sc] = blankCalTable(sc);
      CAL_FIELDS.forEach(function (f) { byScope[sc].m[m - 1][f.k] = numOf(o[f.k]); });
    });
    var keys = Object.keys(byScope);
    if (!keys.length) { toast(t('cal.khong_doc_duoc_dong_hop_le_nao'), 'bad'); return; }
    S.calendar.tables = keys.map(function (k) { return byScope[k]; });
    setRESULT(null); touch(); render();
    toast(t('cal.imported', { n: keys.length }), 'good');
  });
}



export { availableKeys, classCombos, classMissCount, viewClasses, viewCalendar, calTemplate, calImport };
