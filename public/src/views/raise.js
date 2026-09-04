/* ===========================================================
   MÀN 8 — TĂNG LƯƠNG
   Đợt tăng theo %, từ tháng nào, áp cho Formula Code hay công thức dùng chung.
   =========================================================== */
import { MONTHS, S, fmt, setRESULT, touch, uid } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { el, esc, modal, render, toast } from '../ui/dom.js';
import { withUndo } from '../ui/undo.js';
import { distinctVals } from '../platform/io.js';
import { chipsPanel, fxField } from '../ui/formula-input.js';

function viewRaise() {
  const wrap = el('div');
  const box = el('div');
  function draw() {
    box.innerHTML = '';
    S.raises.forEach((r, i) => {
      const condBox = fxField(r.cond, (v) => { r.cond = v; setRESULT(null); touch(); }, t('raise.cond_placeholder'), draw);
      const mc = ENGINE.countMatch(r.cond);
      const picker = el('div');
      function pickGroup(title, items, code, note) {
        if (!items.length) return;
        const line = el('div', { class: 'chips' });
        items.forEach((f) => {
          const c = code(f);
          const on = (r.formulas || []).indexOf(c) >= 0;
          line.appendChild(el('span', {
            class: 'chip' + (on ? ' on' : ''),
            text: c, title: f.name || '', onclick: function () {
              r.formulas = on ? r.formulas.filter((x) => { return x !== c; }) : (r.formulas || []).concat([c]);
              setRESULT(null); touch(); draw();
            }
          }));
        });
        picker.appendChild(el('label', { class: 'f', style: 'margin-top:7px', text: title }));
        picker.appendChild(line);
        if (note) picker.appendChild(el('div', { class: 'fxok', text: note }));
      }
      pickGroup(t('fm.raise.cost_group'), S.formulas, (f) => { return f.code; }, null);
      pickGroup(t('fm.raise.shared_group'),
        (S.shared || []).filter((x) => { return x && x.code; }),
        (f) => { return f.code; }, t('fm.raise.shared_note'));
      if (!(r.formulas || []).length) picker.appendChild(el('div', { class: 'fxok', text: t('fm.chua_chon_ap_cho_tat_ca_cong_thuc') }));

      box.appendChild(el('div', { class: 'rule' }, [
        el('div', { class: 'h' }, [
          el('input', { type: 'checkbox', checked: r.active !== false, onchange: function (e) { r.active = e.target.checked; setRESULT(null); touch(); } }),
          el('input', { class: 'nm', value: r.name || '', placeholder: t('fm.ten_dot_tang'), oninput: function (e) { r.name = e.target.value; touch(); } }),
          mc.error ? el('span', { class: 'tag r', text: t('fm.dieu_kien_loi') }) : el('span', { class: 'tag g', text: t('raise.n_rows', { n: fmt(mc.n) }) }),
          el('div', { class: 'sp' }),
          el('button', { class: 'btn sm del', text: '✕', onclick: function () { withUndo(t('raise.da_xoa_dot'), () => { S.raises.splice(i, 1); setRESULT(null); touch(); draw(); }); } })
        ]),
        el('div', { class: 'b', style: 'grid-template-columns:150px 130px 1fr' }, [
          el('div', {}, [el('label', { class: 'f', text: t('fm.ap_dung_tu_thang') }),
          el('select', { onchange: function (e) { r.fromMonth = +e.target.value; setRESULT(null); touch(); } },
            MONTHS.map((m, j) => { return el('option', { value: j + 1, selected: (+r.fromMonth || 1) === j + 1, text: m }); }))]),
          el('div', {}, [el('label', { class: 'f', text: t('fm.muc_tang') }),
          el('input', { type: 'number', step: '0.1', class: 'fx', style: 'text-align:right', value: r.pct, oninput: function (e) { r.pct = parseFloat(e.target.value) || 0; setRESULT(null); touch(); } })]),
          el('div', {}, [el('label', { class: 'f', text: t('fm.ap_cho_cong_thuc_nao') }), picker])
        ]),
        el('div', { style: 'padding:0 10px 10px' }, [
          el('div', { class: 'row', style: 'margin-bottom:6px;align-items:center' }, [
            el('label', { class: 'f', style: 'margin:0', text: t('fm.gioi_han_pham_vi_tuy_chon') }),
            el('div', { class: 'sp', style: 'flex:1' }),
            el('button', { class: 'btn sm', text: t('raise.scope_by_col'), onclick: function () { scopeByCol(r, draw); } }),
            r.cond ? el('button', {
              class: 'btn sm dim', text: t('raise.scope_clear'),
              onclick: function () { r.cond = ''; setRESULT(null); touch(); draw(); }
            }) : null
          ]),
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

/* Chọn phạm vi theo CỘT thay vì gõ công thức — giống hệt "Tạo nhóm theo cột" ở
   màn Công thức chi phí, và cũng chỉ sinh ra một CHUỖI FX như bên đó. Nhờ vậy
   máy tính không phải sửa một dòng nào: cả bốn chỗ biên dịch r.cond vẫn nhận
   một chuỗi như cũ, và file dự án cũ vẫn chạy đúng. */
function scopeByCol(r, redraw) {
  const avail = ENGINE.usableCols();
  const sel = el('select', {}, avail.map((c) => { return el('option', { value: c, text: c }); }));
  const list = el('div', { class: 'chips', style: 'max-height:220px;overflow:auto' });
  const info = el('p', { class: 'hint' });
  let picked = {};

  function upd() {
    picked = {};
    list.innerHTML = '';
    const vals = distinctVals(ENGINE.previewRows(), sel.value);
    info.textContent = t('raise.scope_info', { col: sel.value, n: vals.length });
    if (vals.length > 300) { info.textContent = t('fm.too_many_values', { n: vals.length }); return; }
    vals.forEach((v) => {
      const chip = el('span', { class: 'chip', text: v, onclick: function () {
        picked[v] = !picked[v];
        chip.classList.toggle('on', !!picked[v]);
      } });
      list.appendChild(chip);
    });
  }
  sel.addEventListener('change', upd); upd();

  modal(t('raise.scope_title'), el('div', {}, [
    el('p', { class: 'hint', html: t('raise.scope_help') }),
    el('label', { class: 'f', text: t('fm.chon_cot') }), sel, info, list
  ]), [
    { label: t('btn.cancel') },
    {
      label: t('raise.scope_apply'), cls: 'pri', onclick: function () {
        const col = sel.value;
        const vals = Object.keys(picked).filter((k) => { return picked[k]; });
        if (!vals.length) { toast(t('raise.scope_none'), 'bad'); return false; }
        /* Nhân đôi dấu " để thoát, đúng cách autoGroup() bên màn công thức làm.
           OR ở máy này là HÀM chứ không phải toán tử trung tố (giống Excel), nên
           nhiều giá trị phải gói vào OR(...); một giá trị thì để trần cho gọn. */
        const parts = vals.map((v) => {
          return '[' + col + ']="' + String(v).replace(/"/g, '""') + '"';
        });
        r.cond = parts.length === 1 ? parts[0] : 'OR(' + parts.join(', ') + ')';
        setRESULT(null); touch(); redraw ? redraw() : render();
        toast(t('raise.scope_done', { n: vals.length, col: esc(col) }), 'good');
      }
    }
  ]);
}

export { viewRaise };
