/* ===========================================================
   MÀN 3 — PHÂN LOẠI NHÓM
   Mỗi bảng: N cột khoá + 1 cột kết quả, thành một cột dẫn xuất mới.
   Bảng sau dùng được kết quả của bảng trước.
   =========================================================== */
import { S, fmt, fmtNum, nkey, numOf, setRESULT, touch, uid } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { confirmBox, el, render, toast } from '../ui/dom.js';
import { dataTable, foldPanel, panel } from '../ui/widgets.js';

/* SheetJS/XLTABLE nạp bằng thẻ <script> nên nằm trên window, không import được. */
const XLTABLE = window.XLTABLE;

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

export { availableKeys, classCombos, classMissCount, viewClasses };
