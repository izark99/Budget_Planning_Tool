/* ===========================================================
   MÀN 2 — THIẾT LẬP
   Vai trò từng cột, hằng số toàn cục, và công thức dùng chung.
   =========================================================== */
import { MONTHS, ROLES, S, fmt, nkey, setRESULT, touch, uid } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { FX } from '../core/expression.js';
import { distinctVals } from '../platform/io.js';
import { el, render } from '../ui/dom.js';
import { foldPanel, panel } from '../ui/widgets.js';
import { chipsPanel, fxField } from '../ui/formula-input.js';
import { guessRole } from './headcount.js';

function viewSetup() {
  const wrap = el('div');

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
    const rows = S.hc.rows;
    const tb = el('tbody');
    function draw() {
      tb.innerHTML = '';
      const monthUsed = {};
      S.cols.forEach((c) => { if (c.role === 'month' && c.month) monthUsed[c.month] = (monthUsed[c.month] || 0) + 1; });
      S.cols.forEach((c) => {
        const dv = distinctVals(rows, c.src);
        const dup = c.role === 'month' && c.month && monthUsed[c.month] > 1;
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
          }, ROLES.map((r) => { return el('option', { value: r.v, selected: c.role === r.v, text: t(r.t) }); }))]),
          el('td', { style: 'width:90px' }, [c.role === 'month' ? el('select', {
            style: dup ? 'border-color:var(--danger)' : '',
            onchange: function (e) { c.month = +e.target.value || null; ENGINE.invalidate(); setRESULT(null); touch(); draw(); }
          }, [el('option', { value: '', text: '—' })].concat(MONTHS.map((mm, k) => {
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

    const nMonth = S.cols.filter((c) => { return c.role === 'month' && c.month; }).length;
    /* foldPanel như mọi bảng khác: file định biên nhiều cột thì gấp lại được,
       trạng thái gấp/mở tự lưu ở S.ui.collapsed. */
    wrap.appendChild(foldPanel('setup_cols',
      t('hc.cot_cua_bang_dinh_bien'),
      [el('span', { class: 'tag' + (nMonth === 12 ? ' g' : ' o'), text: t('hc.month_cols_badge', { n: nMonth }) })],
      [el('button', { class: 'btn sm', text: t('hc.doan_lai_vai_tro'), onclick: function () {
        S.cols.forEach((c) => {
          const g = guessRole(c.src, rows.slice(0, 60).map((r) => { return r[c.src]; }));
          c.role = g.role; c.month = g.month || null;
        });
        ENGINE.invalidate(); setRESULT(null); touch(); render();
      } })],
      el('div', { class: 'tw' }, [
        el('table', {}, [el('thead', {}, [el('tr', {}, [t('setup.th_file_col'), t('setup.th_formula_name'), t('setup.th_role'), t('export.audit.month'), t('setup.th_type'), t('setup.th_distinct'), t('setup.th_sample')]
          .map((h, i) => { return el('th', { class: i === 5 ? 'num' : '', text: h }); }))]), tb])
      ]),
      t('setup.cols_help')));
  }

  /* --- tham số --- */
  const pb = el('tbody');
  function fillP() {
    pb.innerHTML = '';
    S.params.forEach((p, i) => {
      pb.appendChild(el('tr', {}, [
        el('td', {}, [el('input', {
          type: 'text', class: 'fx', value: p.name || '',
          oninput: function (e) { p.name = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'); e.target.value = p.name; setRESULT(null); touch(); }
        })]),
        el('td', { style: 'width:170px' }, [el('input', {
          type: 'text', class: 'fx', style: 'text-align:right', value: p.value,
          oninput: function (e) { const n = parseFloat(e.target.value.replace(/[,\s]/g, '')); p.value = isNaN(n) ? e.target.value : n; setRESULT(null); touch(); }
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
  const shBox = el('div');
  function drawShared() {
    shBox.innerHTML = '';
    const seen = {};
    (S.shared || []).forEach((sh, i) => {
      const code = nkey(sh.code);
      const dup = code && seen[code];
      seen[code] = 1;
      const fx = fxField(sh.formula, (v) => { sh.formula = v; setRESULT(null); touch(); }, '0', drawShared);
      fx._label = sh.code || t('setup.shared.untitled');
      const chk = FX.tryCompile(String(sh.formula || '').trim() || '0');
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

export { viewSetup };
