/* ===========================================================
   MÀN 8 — TĂNG LƯƠNG
   Đợt tăng theo %, từ tháng nào, áp cho Formula Code hay công thức dùng chung.
   =========================================================== */
import { MONTHS, S, fmt, setRESULT, touch, uid } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { el } from '../ui/dom.js';
import { chipsPanel, fxField } from '../ui/formula-input.js';

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

export { viewRaise };
