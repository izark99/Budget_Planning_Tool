/* ===========================================================
   MÀN 3 — PHÂN LOẠI NHÓM
   Mỗi bảng: N cột khoá + 1 cột kết quả, thành một cột dẫn xuất mới.
   Bảng sau dùng được kết quả của bảng trước.
   =========================================================== */
import { S, classDef, classOuts, ensureClassOuts, fmt, fmtNum, nkey, numOf, setRESULT, touch, uid } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { confirmBox, el, render, renderSoon } from '../ui/dom.js';
import { withUndo } from '../ui/undo.js';
import { comboLimit, dataTable, foldPanel, panel } from '../ui/widgets.js';

/* SheetJS/XLTABLE nạp bằng thẻ <script> nên nằm trên window, không import được. */
const XLTABLE = window.XLTABLE;

function availableKeys(beforeIdx) {
  const out = ENGINE.attrCols().map((c) => { return c.alias; });
  /* Bảng trước có thể sinh NHIỀU cột — bảng sau dùng được hết. */
  (S.classes || []).forEach((c, i) => {
    if (i < beforeIdx) classOuts(c).forEach((o) => { out.push(o.name); });
  });
  return out;
}

function classCombos(cl) {
  const rows = ENGINE.previewRows();
  const cap = comboLimit();
  /** @type {ComboRows} */
  const out = [];
  const seen = {};
  let hit = false;
  rows.forEach((r) => {
    const vals = (cl.keys || []).map((k) => { return r[k] == null ? '' : String(r[k]).trim(); });
    const k = vals.map(nkey).join('|');
    if (seen[k]) return; seen[k] = 1;
    if (cap && out.length >= cap) { hit = true; return; }
    const o = {};
    (cl.keys || []).forEach((kc, j) => { o['k' + j] = vals[j]; });
    classOuts(cl).forEach((oc, j) => { o['v' + j] = ''; });
    out.push(o);
  });
  if (hit) out.truncated = cap;
  return out;
}

function classMissCount(cl) {
  if (!cl.name || !(cl.keys || []).length) return null;
  const keys = cl.keys, rows = ENGINE.previewRows(), idx = {};
  (cl.rows || []).forEach((r) => {
    const star = keys.some((_, j) => { return String(r[j]).trim() === '*'; });
    idx[keys.map((_, j) => { return nkey(r[j]); }).join('|')] = 1;
    if (star) idx.__star = 1;
  });
  let miss = 0;
  rows.forEach((r) => {
    const vals = keys.map((k) => { return nkey(r[k]); });
    if (idx[vals.join('|')]) return;
    if (idx.__star) {
      for (let b = 1; b < (1 << keys.length); b++) {
        const probe = vals.map((x, j) => { return (b >> j) & 1 ? '*' : x; });
        if (idx[probe.join('|')]) return;
      }
    }
    miss++;
  });
  return miss;
}

function viewClasses() {
  const wrap = el('div');

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
          confirmBox(t('cal.xoa_sach_dong_du_lieu_cua_tat_ca'), () => {
            withUndo(t('cal.da_xoa_sach_du_lieu'), () => {
              S.classes.forEach((c) => { c.rows = []; c._objs = null; });
              ENGINE.invalidate(); setRESULT(null); touch(); render();
            });
          });
        }
      }),
      el('button', {
        class: 'btn sm pri', text: t('cal.them_bang_phan_loai'), onclick: function () {
          /* GIÁ TRỊ MỒI (dữ liệu): ghi thẳng vào S, đi vào file dự án .json — giữ trong code.
             Bảng mới dùng luôn hình dạng nhiều cột: outs[] + def[] khớp chỉ số,
             y hệt bảng chính sách. Bảng cũ vẫn đọc được nhờ classOuts(). */
          S.classes.push({
            id: uid(), name: 'Nhóm mới', keys: [],
            outs: [{ name: 'Nhóm ' + (S.classes.length + 1), type: 'text' }],
            rows: [], def: ['']
          });
          ENGINE.invalidate(); setRESULT(null); touch(); render();
        }
      })
    ]),
    el('div', { class: 'body' }, [el('p', {
      class: 'hint',
      html: t('cal.classes_help')
    })])
  ]));

  S.classes.forEach((cl, idx) => {
    const keys = cl.keys || [];
    const outs = classOuts(cl);
    const avail = availableKeys(idx);

    /* Bộ đệm phải hết hạn khi ĐỔI TÊN hay ĐỔI KIỂU cột giá trị nữa, không chỉ
       khi đổi cột khoá — nếu không, đổi tên cột xong bảng vẫn dựng theo tên cũ.
       Đúng cách bảng chính sách đã làm (po._shape). */
    const shape = keys.join('|') + '»' + outs.map((o) => { return o.name + ':' + o.type; }).join('|');
    function asObjs() {
      if (!cl._objs || cl._shape !== shape) {
        cl._objs = (cl.rows || []).map((r) => {
          const o = {};
          keys.forEach((_, j) => { o['k' + j] = r[j] == null ? '' : r[j]; });
          outs.forEach((_, j) => { o['v' + j] = r[keys.length + j] == null ? '' : r[keys.length + j]; });
          return o;
        });
        cl._shape = shape;
      }
      return cl._objs;
    }

    const stat = el('span', { class: 'tag' });
    function updateStat() {
      const miss = classMissCount(cl);
      if (miss === null) { stat.className = 'tag'; stat.textContent = t('cal.not_declared'); return; }
      stat.className = 'tag ' + (miss ? 'o' : 'g');
      stat.textContent = miss ? t('cal.rows_unmatched', { n: fmt(miss) }) : t('cal.rows_all_matched', { n: fmt(ENGINE.previewRows().length) });
    }

    let statT = null;
    function syncBack() {
      cl.rows = asObjs().map((o) => {
        return keys.map((_, j) => { return o['k' + j]; })
          .concat(outs.map((_, j) => { return o['v' + j]; }));
      });
      ENGINE.invalidate(); setRESULT(null); touch();
      clearTimeout(statT); statT = setTimeout(updateStat, 250);
    }
    updateStat();

    const editor = (keys.length && outs.length) ? dataTable({
      columns: keys.map((k, j) => { return { k: 'k' + j, label: k, key: true, type: 'text' }; })
        /* CHUỖI GIAO THỨC: label thành header file mẫu .xlsx và là khoá khớp khi nhập lại */
        .concat(outs.map((o, j) => { return { k: 'v' + j, label: o.name, type: o.type === 'num' ? 'num' : 'text', w: o.type === 'num' ? 160 : null }; })),
      rows: asObjs,
      blank: function () {
        const o = {};
        keys.forEach((_, j) => { o['k' + j] = ''; });
        outs.forEach((_, j) => { o['v' + j] = ''; });
        return o;
      },
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

    /* --- khai cột giá trị --- (đúng khuôn drawOuts() của màn Cài đặt chính sách)
       Bảng cũ chỉ có một cột, mô tả bằng cl.name/cl.type/cl.def. Chạm vào bất kỳ
       ô nào ở đây là ghi hẳn hình dạng mới (ensureClassOuts) — từ đó cl.name chỉ
       còn là TÊN BẢNG, tên cột nằm ở outs[i].name. Dự án chưa đụng tới thì giữ
       nguyên hình dạng cũ, không bị viết lại sau lưng. */
    const outBox = el('div');
    function drawOuts() {
      outBox.innerHTML = '';
      classOuts(cl).forEach((o, j) => {
        outBox.appendChild(el('div', { class: 'row', style: 'margin-bottom:6px' }, [
          el('input', {
            type: 'text', class: 'fx', style: 'width:230px', value: o.name || '', placeholder: t('pol.ten_cot_gia_tri'),
            onchange: function (e) {
              ensureClassOuts(cl).outs[j].name = e.target.value;
              cl._objs = null; ENGINE.invalidate(); setRESULT(null); touch(); renderSoon();
            }
          }),
          el('select', {
            style: 'width:100px',
            onchange: function (e) {
              ensureClassOuts(cl).outs[j].type = e.target.value;
              cl._objs = null; ENGINE.invalidate(); setRESULT(null); touch(); renderSoon();
            }
          }, [
            el('option', { value: 'text', selected: o.type !== 'num', text: t('hc.chu') }),
            el('option', { value: 'num', selected: o.type === 'num', text: t('hc.so') })
          ]),
          el('input', {
            type: 'text', class: 'fx', style: 'width:150px' + (o.type === 'num' ? ';text-align:right' : ''),
            value: o.type === 'num' ? fmtNum(classDef(cl, j)) : (classDef(cl, j) || ''),
            /* Hint NGẮN, đúng khoá mà màn Cài đặt chính sách dùng: câu dài
               "Mặc định khi không khớp" cần 180px trong khung 150px chữ đơn
               cách nên bị cắt ngang giữa từ. Câu đầy đủ chuyển sang title, và
               nhãn của cả khối vốn đã ghi "(tên · kiểu · mặc định khi không
               khớp)" nên không mất nghĩa. */
            placeholder: t('export.audit.default'), title: t('cal.mac_dinh_khi_khong_khop'),
            onfocus: function (e) {
              if (o.type !== 'num') return;
              const d = classDef(cl, j);
              e.target.value = (d === '' || d == null) ? '' : String(d);
            },
            onblur: function (e) { if (o.type === 'num') e.target.value = fmtNum(classDef(cl, j)); },
            oninput: function (e) {
              const c2 = ensureClassOuts(cl);
              c2.def[j] = o.type === 'num' ? (e.target.value.trim() === '' ? '' : numOf(e.target.value)) : e.target.value;
              ENGINE.invalidate(); setRESULT(null); touch();
            }
          }),
          classOuts(cl).length > 1 ? el('button', {
            class: 'btn sm del', text: '✕', title: t('pol.bo_cot_nay'),
            onclick: function () {
              withUndo(t('cal.da_bo_cot_gia_tri'), () => {
                const c2 = ensureClassOuts(cl);
                c2.outs.splice(j, 1); (c2.def || []).splice(j, 1);
                /* Dòng dữ liệu là [...khoá, ...giá trị] nên bỏ một cột phải bỏ
                   đúng ô đó ở mọi dòng, không thì các cột sau lệch hết. */
                cl.rows = (cl.rows || []).map((r) => {
                  const r2 = r.slice(); r2.splice(keys.length + j, 1); return r2;
                });
                cl._objs = null; ENGINE.invalidate(); setRESULT(null); touch(); render();
              });
            }
          }) : null
        ]));
      });
      outBox.appendChild(el('button', {
        class: 'btn sm', text: t('pol.them_cot_gia_tri'), onclick: function () {
          const c2 = ensureClassOuts(cl);
          /* Tên cột sinh tự động là DỮ LIỆU: người dùng đổi được, ghi vào file dự án. */
          c2.outs.push({ name: 'Cột ' + (c2.outs.length + 1), type: 'text' });
          c2.def.push('');
          cl.rows = (cl.rows || []).map((r) => {
            const r2 = r.slice(); r2.splice(keys.length + c2.outs.length - 1, 0, ''); return r2;
          });
          cl._objs = null; ENGINE.invalidate(); setRESULT(null); touch(); render();
        }
      }));
    }
    drawOuts();

    const head = el('div', {}, [
      el('div', { class: 'row', style: 'margin-bottom:10px' }, [
        el('div', { style: 'width:230px' }, [el('label', { class: 'f', text: t('cal.ten_bang_phan_loai') }),
        el('input', {
          type: 'text', class: 'fx', value: cl.name || '',
          onchange: function (e) { cl.name = e.target.value; ENGINE.invalidate(); setRESULT(null); touch(); renderSoon(); }
        })])
      ]),
      el('div', { style: 'margin-bottom:12px' }, [
        el('label', { class: 'f', text: t('cal.cot_khoa_bam_de_chon') }),
        el('div', { class: 'chips' }, avail.map((a) => {
          const on = keys.indexOf(a) >= 0;
          return el('span', {
            class: 'chip' + (on ? ' on' : ''),
            text: a, onclick: function () {
              cl.keys = on ? keys.filter((x) => { return x !== a; }) : keys.concat([a]);
              cl._objs = null; cl.rows = []; ENGINE.invalidate(); setRESULT(null); touch(); render();
            }
          });
        }))
      ]),
      el('div', { style: 'margin-bottom:12px' }, [
        el('label', { class: 'f', text: t('cal.cot_gia_tri_sinh_ra') }),
        outBox
      ])
    ]);

    wrap.appendChild(foldPanel('class_' + cl.id,
      String(idx + 1).padStart(2, '0') + ' · ' + (cl.name || t('cal.unnamed')),
      [stat],
      [
        el('button', { class: 'btn sm', text: '↑', onclick: function () { if (idx > 0) { const other = S.classes[idx - 1]; S.classes[idx - 1] = cl; S.classes[idx] = other; ENGINE.invalidate(); setRESULT(null); touch(); render(); } } }),
        el('button', { class: 'btn sm', text: '↓', onclick: function () { if (idx < S.classes.length - 1) { const other = S.classes[idx + 1]; S.classes[idx + 1] = cl; S.classes[idx] = other; ENGINE.invalidate(); setRESULT(null); touch(); render(); } } }),
        el('button', { class: 'btn sm del', text: t('cal.xoa_bang'), onclick: function () { confirmBox(t('cal.confirm_delete_class', { name: cl.name || '' }), () => { withUndo(t('cal.da_xoa_bang'), () => { S.classes.splice(idx, 1); ENGINE.invalidate(); setRESULT(null); touch(); render(); }); }); } })
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
