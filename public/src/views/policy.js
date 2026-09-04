/* ===========================================================
   MÀN 4 — CÀI ĐẶT CHÍNH SÁCH
   Tách nguyên văn từ khối 06b-view-policy.js.
   =========================================================== */
import { S, fmt, nkey, numOf, setRESULT, touch, uid } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { confirmBox, el, render, renderSoon } from '../ui/dom.js';
import { comboLimit, dataTable, foldPanel, panel } from '../ui/widgets.js';
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
  const out = ENGINE.attrCols().map((c) => { return c.alias; })
    .concat(ENGINE.classCols());
  (S.policies || []).forEach((p, i) => {
    if (i < beforeIdx) (p.outs || []).forEach((o) => { if (o && o.name) out.push(o.name); });
  });
  return out;
}

function policyCombos(po) {
  const rows = ENGINE.previewRows();
  /** @type {ComboRows} */
  const out = [];
  const seen = {};
  const cap = comboLimit();
  let hit = false;
  rows.forEach((r) => {
    const vals = (po.keys || []).map((k) => { return r[k] == null ? '' : String(r[k]).trim(); });
    const k = vals.map(nkey).join('|');
    if (seen[k]) return; seen[k] = 1;
    if (cap && out.length >= cap) { hit = true; return; }
    const o = {};
    (po.keys || []).forEach((kc, j) => { o['k' + j] = vals[j]; });
    (po.outs || []).forEach((oc, j) => { o['v' + j] = ''; });
    out.push(o);
  });
  if (hit) out.truncated = cap;
  return out;
}

function viewPolicies() {
  const wrap = el('div');

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

  (S.policies || []).forEach((po, idx) => {
    const keys = po.keys || [];
    const outs = (po.outs || []).filter((o) => { return o && o.name; });
    const avail = policyAvailableKeys(idx);

    /* rows lưu dạng mảng: [...khoá, ...giá trị] */
    const shape = keys.join('|') + '»' + outs.map((o) => { return o.name; }).join('|');
    function asObjs() {
      if (!po._objs || po._shape !== shape) {
        po._objs = (po.rows || []).map((r) => {
          const o = {};
          keys.forEach((_, j) => { o['k' + j] = r[j] == null ? '' : r[j]; });
          outs.forEach((_, j) => { o['v' + j] = r[keys.length + j] == null ? '' : r[keys.length + j]; });
          return o;
        });
        po._shape = shape;
      }
      return po._objs;
    }
    const stat = el('span', { class: 'tag' });
    function updateStat() {
      if (!keys.length || !outs.length) { stat.className = 'tag'; stat.textContent = t('cal.not_declared'); return; }
      const miss = classMissCount({ name: po.name, keys, rows: po.rows });
      stat.className = 'tag ' + (miss ? 'o' : 'g');
      stat.textContent = miss ? t('cal.rows_unmatched', { n: fmt(miss) }) : t('cal.rows_all_matched', { n: fmt(ENGINE.previewRows().length) });
    }
    let statT = null;
    function syncBack() {
      po.rows = asObjs().map((o) => {
        return keys.map((_, j) => { return o['k' + j]; })
          .concat(outs.map((_, j) => { return o['v' + j]; }));
      });
      ENGINE.invalidate(); setRESULT(null); touch();
      clearTimeout(statT); statT = setTimeout(updateStat, 250);
    }
    updateStat();

    const editor = (keys.length && outs.length) ? dataTable({
      columns: keys.map((k, j) => { return { k: 'k' + j, label: k, key: true, type: 'text' }; })
        .concat(outs.map((o, j) => { return { k: 'v' + j, label: o.name, type: o.type === 'text' ? 'text' : 'num', w: 150 }; })),
      rows: asObjs,
      blank: function () {
        const o = {};
        keys.forEach((_, j) => { o['k' + j] = ''; });
        outs.forEach((_, j) => { o['v' + j] = ''; });
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
    const outBox = el('div');
    function drawOuts() {
      outBox.innerHTML = '';
      (po.outs || []).forEach((o, j) => {
        outBox.appendChild(el('div', { class: 'row', style: 'margin-bottom:6px' }, [
          el('input', {
            type: 'text', class: 'fx', style: 'width:230px', value: o.name || '', placeholder: t('pol.ten_cot_gia_tri'),
            onchange: function (e) { o.name = e.target.value; po._objs = null; ENGINE.invalidate(); setRESULT(null); touch(); renderSoon(); }
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

    const head = el('div', {}, [
      el('div', { class: 'row', style: 'margin-bottom:10px' }, [
        el('div', { style: 'width:230px' }, [el('label', { class: 'f', text: t('pol.ten_bang_chinh_sach') }),
        el('input', {
          type: 'text', class: 'fx', value: po.name || '',
          onchange: function (e) { po.name = e.target.value; touch(); renderSoon(); }
        })])
      ]),
      el('div', { style: 'margin-bottom:12px' }, [
        el('label', { class: 'f', text: t('cal.cot_khoa_bam_de_chon') }),
        el('div', { class: 'chips' }, avail.map((a) => {
          const on = keys.indexOf(a) >= 0;
          return el('span', {
            class: 'chip' + (on ? ' on' : ''),
            text: a, onclick: function () {
              po.keys = on ? keys.filter((x) => { return x !== a; }) : keys.concat([a]);
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
        el('button', { class: 'btn sm', text: '↑', onclick: function () { if (idx > 0) { const t = S.policies[idx - 1]; S.policies[idx - 1] = po; S.policies[idx] = t; ENGINE.invalidate(); setRESULT(null); touch(); render(); } } }),
        el('button', { class: 'btn sm', text: '↓', onclick: function () { if (idx < S.policies.length - 1) { const t = S.policies[idx + 1]; S.policies[idx + 1] = po; S.policies[idx] = t; ENGINE.invalidate(); setRESULT(null); touch(); render(); } } }),
        el('button', { class: 'btn sm del', text: t('cal.xoa_bang'), onclick: function () { confirmBox(t('pol.confirm_delete', { name: po.name || '' }), () => { S.policies.splice(idx, 1); ENGINE.invalidate(); setRESULT(null); touch(); render(); }); } })
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
