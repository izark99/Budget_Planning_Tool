/* ===========================================================
   MÀN 4 — CÀI ĐẶT CHÍNH SÁCH
   Tách nguyên văn từ khối 06b-view-policy.js.
   =========================================================== */
import { S, fmt, nkey, numOf, setRESULT, touch, uid } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { confirmBox, el, render } from '../ui/dom.js';
import { dataTable, foldPanel, panel } from '../ui/widgets.js';
import { classMissCount } from './classes.js';

/* Thư viện gốc nạp bằng <script defer> cổ điển. Trỏ tường minh vào window
   thay vì dựa vào chuỗi scope — để công cụ tĩnh thấy được nguồn gốc. */
const XLTABLE = window.XLTABLE;

/* ==== 06b-view-policy.js ==== */
/* ===========================================================
   MÀN — CÀI ĐẶT CHÍNH SÁCH
   Cùng cơ chế khoá như Phân loại nhóm, nhưng một bảng sinh ra
   nhiều cột giá trị: mức lương, mức phụ cấp, hệ số thưởng…
   =========================================================== */
function policyAvailableKeys(beforeIdx) {
  var out = ENGINE.attrCols().map(function (c) { return c.alias; })
    .concat((S.classes || []).map(function (c) { return c.name; }).filter(Boolean));
  (S.policies || []).forEach(function (p, i) {
    if (i < beforeIdx) (p.outs || []).forEach(function (o) { if (o && o.name) out.push(o.name); });
  });
  return out;
}

function policyCombos(po) {
  var rows = ENGINE.previewRows(), seen = {}, out = [];
  rows.forEach(function (r) {
    var vals = (po.keys || []).map(function (k) { return r[k] == null ? '' : String(r[k]).trim(); });
    var k = vals.map(nkey).join('|');
    if (seen[k]) return; seen[k] = 1;
    var o = {};
    (po.keys || []).forEach(function (kc, j) { o['k' + j] = vals[j]; });
    (po.outs || []).forEach(function (oc, j) { o['v' + j] = ''; });
    out.push(o);
  });
  return out.slice(0, 800);
}

function viewPolicies() {
  var wrap = el('div');

  if (!S.cols.length) {
    wrap.appendChild(panel(t('pol.cai_dat_chinh_sach'), [], el('div', { class: 'empty' }, [
      el('strong', { text: t('msg.no_hc') }), el('span', { text: t('pol.nhap_dinh_bien_va_khai_phan_loai') })
    ])));
    return wrap;
  }

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('pol.cac_bang_chinh_sach') }),
      el('span', { class: 'tag', text: t('cal.n_tables', { n: (S.policies || []).length }) }),
      el('div', { class: 'sp' }),
      el('button', {
        class: 'btn sm pri', text: t('pol.them_bang_chinh_sach'), onclick: function () {
          S.policies.push({
            id: uid(), name: 'Chính sách mới', keys: [],
            /* GIÁ TRỊ MỒI (dữ liệu): outs[].name trở thành tên cột gọi được trong
               công thức — [Mức tiền] — và được ghi vào file dự án. Giữ trong code. */
            outs: [{ name: 'Mức tiền', type: 'num' }], rows: [], def: [0]
          });
          ENGINE.invalidate(); setRESULT(null); touch(); render();
        }
      })
    ]),
    el('div', { class: 'body' }, [el('p', {
      class: 'hint',
      html: t('pol.help')
    })])
  ]));

  (S.policies || []).forEach(function (po, idx) {
    var keys = po.keys || [];
    var outs = (po.outs || []).filter(function (o) { return o && o.name; });
    var avail = policyAvailableKeys(idx);

    /* rows lưu dạng mảng: [...khoá, ...giá trị] */
    var shape = keys.join('|') + '»' + outs.map(function (o) { return o.name; }).join('|');
    function asObjs() {
      if (!po._objs || po._shape !== shape) {
        po._objs = (po.rows || []).map(function (r) {
          var o = {};
          keys.forEach(function (_, j) { o['k' + j] = r[j] == null ? '' : r[j]; });
          outs.forEach(function (_, j) { o['v' + j] = r[keys.length + j] == null ? '' : r[keys.length + j]; });
          return o;
        });
        po._shape = shape;
      }
      return po._objs;
    }
    var stat = el('span', { class: 'tag' });
    function updateStat() {
      if (!keys.length || !outs.length) { stat.className = 'tag'; stat.textContent = t('cal.not_declared'); return; }
      var miss = classMissCount({ name: po.name, keys: keys, rows: po.rows });
      stat.className = 'tag ' + (miss ? 'o' : 'g');
      stat.textContent = miss ? t('cal.rows_unmatched', { n: fmt(miss) }) : t('cal.rows_all_matched', { n: fmt(ENGINE.previewRows().length) });
    }
    var statT = null;
    function syncBack() {
      po.rows = asObjs().map(function (o) {
        return keys.map(function (_, j) { return o['k' + j]; })
          .concat(outs.map(function (_, j) { return o['v' + j]; }));
      });
      ENGINE.invalidate(); setRESULT(null); touch();
      clearTimeout(statT); statT = setTimeout(updateStat, 250);
    }
    updateStat();

    var editor = (keys.length && outs.length) ? dataTable({
      columns: keys.map(function (k, j) { return { k: 'k' + j, label: k, key: true, type: 'text' }; })
        .concat(outs.map(function (o, j) { return { k: 'v' + j, label: o.name, type: o.type === 'text' ? 'text' : 'num', w: 150 }; })),
      rows: asObjs,
      blank: function () {
        var o = {};
        keys.forEach(function (_, j) { o['k' + j] = ''; });
        outs.forEach(function (_, j) { o['v' + j] = ''; });
        return o;
      },
      onChange: syncBack,
      onImported: function () { syncBack(); updateStat(); },
      tableName: 'tbl' + XLTABLE.safeName(po.name || 'ChinhSach'),
      sheetName: 'ChinhSach',
      title: t('pol.table_title', { name: po.name || '' }),
      prefill: function () { return policyCombos(po); },
      guide: [
        t('pol.guide_1'),
        t('pol.guide_2'),
        t('cal.class_guide_3'),
        t('cal.class_guide_4')
      ],
      emptyText: t('pol.chua_co_dong_nao_bam_sinh_san_tu')
    }) : el('div', { class: 'empty', text: t('pol.can_it_nhat_mot_cot_khoa_va_mot') });

    /* --- khai báo cột giá trị --- */
    var outBox = el('div');
    function drawOuts() {
      outBox.innerHTML = '';
      (po.outs || []).forEach(function (o, j) {
        outBox.appendChild(el('div', { class: 'row', style: 'margin-bottom:6px' }, [
          el('input', {
            type: 'text', class: 'fx', style: 'width:230px', value: o.name || '', placeholder: t('pol.ten_cot_gia_tri'),
            onchange: function (e) { o.name = e.target.value; po._objs = null; ENGINE.invalidate(); setRESULT(null); touch(); render(); }
          }),
          el('select', {
            style: 'width:100px',
            onchange: function (e) { o.type = e.target.value; ENGINE.invalidate(); setRESULT(null); touch(); }
          }, [
            el('option', { value: 'num', selected: o.type !== 'text', text: t('hc.so') }),
            el('option', { value: 'text', selected: o.type === 'text', text: t('hc.chu') })
          ]),
          el('input', {
            type: 'text', class: 'fx', style: 'width:130px;text-align:right',
            value: (po.def || [])[j] == null ? '' : po.def[j], placeholder: t('export.audit.default'),
            oninput: function (e) {
              po.def = po.def || [];
              po.def[j] = o.type === 'text' ? e.target.value : numOf(e.target.value);
              ENGINE.invalidate(); setRESULT(null); touch();
            }
          }),
          el('button', {
            class: 'btn sm del', text: '✕', title: t('pol.bo_cot_nay'),
            onclick: function () {
              po.outs.splice(j, 1); (po.def || []).splice(j, 1);
              po._objs = null; ENGINE.invalidate(); setRESULT(null); touch(); render();
            }
          })
        ]));
      });
      outBox.appendChild(el('button', {
        class: 'btn sm', text: t('pol.them_cot_gia_tri'), onclick: function () {
          /* Tên cột sinh tự động là DỮ LIỆU: người dùng đổi được, ghi vào file dự án. */
          po.outs.push({ name: 'Cột ' + (po.outs.length + 1), type: 'num' });
          (po.def = po.def || []).push(0);
          po._objs = null; ENGINE.invalidate(); setRESULT(null); touch(); render();
        }
      }));
    }
    drawOuts();

    var head = el('div', {}, [
      el('div', { class: 'row', style: 'margin-bottom:10px' }, [
        el('div', { style: 'width:230px' }, [el('label', { class: 'f', text: t('pol.ten_bang_chinh_sach') }),
        el('input', {
          type: 'text', class: 'fx', value: po.name || '',
          onchange: function (e) { po.name = e.target.value; touch(); render(); }
        })])
      ]),
      el('div', { style: 'margin-bottom:12px' }, [
        el('label', { class: 'f', text: t('cal.cot_khoa_bam_de_chon') }),
        el('div', { class: 'chips' }, avail.map(function (a) {
          var on = keys.indexOf(a) >= 0;
          return el('span', {
            class: 'chip', style: on ? 'background:var(--mineral);color:#fff;border-color:var(--mineral)' : '',
            text: a, onclick: function () {
              po.keys = on ? keys.filter(function (x) { return x !== a; }) : keys.concat([a]);
              po._objs = null; po.rows = []; ENGINE.invalidate(); setRESULT(null); touch(); render();
            }
          });
        }))
      ]),
      el('div', { style: 'margin-bottom:12px' }, [
        el('label', { class: 'f', text: t('pol.cot_gia_tri_sinh_ra_ten_kieu_mac') }),
        outBox
      ])
    ]);

    wrap.appendChild(foldPanel('policy_' + po.id,
      String(idx + 1).padStart(2, '0') + ' · ' + (po.name || t('cal.unnamed')),
      [stat],
      [
        el('button', { class: 'btn sm', text: '↑', onclick: function () { if (idx > 0) { var t = S.policies[idx - 1]; S.policies[idx - 1] = po; S.policies[idx] = t; ENGINE.invalidate(); setRESULT(null); touch(); render(); } } }),
        el('button', { class: 'btn sm', text: '↓', onclick: function () { if (idx < S.policies.length - 1) { var t = S.policies[idx + 1]; S.policies[idx + 1] = po; S.policies[idx] = t; ENGINE.invalidate(); setRESULT(null); touch(); render(); } } }),
        el('button', { class: 'btn sm del', text: t('cal.xoa_bang'), onclick: function () { confirmBox(t('pol.confirm_delete', { name: po.name || '' }), function () { S.policies.splice(idx, 1); ENGINE.invalidate(); setRESULT(null); touch(); render(); }); } })
      ],
      el('div', {}, [head, editor])
    ));
  });

  if (!(S.policies || []).length) {
    wrap.appendChild(el('div', { class: 'panel' }, [el('div', { class: 'empty' }, [
      el('strong', { text: t('pol.chua_co_bang_chinh_sach_nao') }),
      el('span', { text: t('pol.vi_du_khoa_theo_nhom_luong_sinh') })
    ])]));
  }
  return wrap;
}



export { policyAvailableKeys, policyCombos, viewPolicies };
