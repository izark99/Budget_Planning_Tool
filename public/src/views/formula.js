/* ===========================================================
   MÀN 5 — CÔNG THỨC CHI PHÍ (Formula Code)
   Soạn quy tắc theo nhóm, thử trên một dòng, và bảng đối chiếu mọi thông
   tin mà công thức dùng tới.
   =========================================================== */
import { MONTHS, S, allMonths, fmt, fmtNum, nkey, setRESULT, touch, uid } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { distinctVals } from '../platform/io.js';
import { confirmBox, el, esc, modal, render, ribbon, toast } from '../ui/dom.js';
import { dragList, moveBeside, panel, selection } from '../ui/widgets.js';
import { chipsPanel, fxField } from '../ui/formula-input.js';

/* Bấm một công thức gọi render(), dựng lại cả thân trang — nên danh sách bị
   cuộn về đỉnh và phải cuộn xuống tìm lại chỗ cũ. Giữ vị trí ở biến mức module
   vì render() xoá sạch document.body, không có chỗ nào khác sống sót. */
let listScroll = 0;
/* Tập công thức đang chọn để kéo một lượt. Cũng phải ở mức module: render() xoá
   sạch document.body nên không có chỗ nào khác sống sót qua một lần vẽ lại. */
const fcSel = selection();

function currentFC() {
  const f = S.formulas.filter((x) => { return x.id === S.ui.fSel; })[0];
  return f || S.formulas[0] || null;
}

function viewFormula() {
  const wrap = el('div');
  if (!S.cols.length) {
    wrap.appendChild(panel(t('fm.cong_thuc_chi_phi'), [], el('div', { class: 'empty' }, [
      el('strong', { text: t('msg.no_hc') }), el('span', { text: t('fm.cong_thuc_can_biet_tham_chieu_cot') })
    ])));
    return wrap;
  }
  const fc = currentFC();
  const split = el('div', { class: 'split' });

  /* --- danh sách --- */
  const list = el('div', { class: 'panel', style: 'margin:0' });
  list.appendChild(el('header', {}, [
    el('h3', { text: 'Formula Code' }),
    fcSel.size() ? el('span', { class: 'tag g', text: t('table.info.picked', { n: fcSel.size() }) }) : null,
    el('div', { class: 'sp' }),
    el('button', {
      class: 'btn sm', text: t('hc.them'), onclick: function () {
       
        /* GIÁ TRỊ MỒI (dữ liệu): ghi thẳng vào S, đi vào file dự án .json — giữ trong code. */
        const n = { id: uid(), code: 'FC_MOI_' + (S.formulas.length + 1), name: 'Công thức mới', mode: 'monthly', months: allMonths(), rules: [{ id: uid(), name: 'Tất cả', cond: '', formula: '0' }] };
        /* Chèn ngay SAU công thức đang chọn, không dồn xuống cuối: người dùng
           thường thêm một công thức họ hàng với cái đang mở. Chưa chọn gì thì
           vào cuối như cũ. */
        const at = S.formulas.findIndex((x) => { return x.id === S.ui.fSel; });
        S.formulas.splice(at < 0 ? S.formulas.length : at + 1, 0, n);
        S.ui.fSel = n.id; setRESULT(null); touch(); render();
      }
    })
  ]));
  const ul = el('div', { class: 'body tight fclist' });
  const ccOf = {};
  (S.maps.costCode || []).forEach((x) => { ccOf[nkey(x.formulaCode)] = x.costCode; });
  /* Kéo thả để sắp xếp — bấm ↑ ↓ từng nấc quá chậm khi có nhiều công thức.
     Cùng cơ chế bỏ kết quả đã tính như move(): thứ tự này là thứ tự cột ở màn
     Kết quả và trong file Excel xuất ra. */
  const drag = dragList((items, to, before) => {
    if (moveBeside(S.formulas, items, to, before)) { fcSel.clear(); setRESULT(null); touch(); render(); }
  }, fcSel);
  S.formulas.forEach((f, idx) => {
    const on = fc && f.id === fc.id;
    /* ↑ ↓ đổi chỗ hai Formula Code trong S.formulas — giống hệt bảng Phân loại nhóm.
       Thứ tự này chính là thứ tự cột ở màn Kết quả và trong file Excel xuất ra, nên đổi
       xong phải bỏ kết quả đã tính. Không chạm tới định nghĩa của công thức nào nên
       không cần ENGINE.invalidate() — bộ nhớ đệm của ENGINE không dính tới S.formulas. */
    function move(to) {
      if (to < 0 || to >= S.formulas.length) return;
      const other = S.formulas[to];
      S.formulas[to] = f; S.formulas[idx] = other;
      setRESULT(null); touch(); render();
    }
    /* Tay nắm riêng: kéo từ đây, còn bấm vào phần còn lại vẫn là chọn công thức.
       Không có tay nắm thì mỗi lần muốn chọn lại thành một cú kéo hụt. */
    const grip = el('div', { class: 'fcgrip', title: t('fm.drag_hint'), text: '⠿' });
    const row = el('div', {
      class: 'fcrow' + (on ? ' on' : '') + (fcSel.has(f) ? ' picked' : ''),
      /* Bấm ↑/↓ hay tay nắm thì không nhảy sang soạn Formula Code khác.
         Ctrl/Shift+bấm là CHỌN để kéo một lượt, không phải mở công thức đó. */
      onclick: function (e) {
        if (e.target.closest('button, .fcgrip')) return;
        if (fcSel.click(e, f, S.formulas)) { e.preventDefault(); render(); return; }
        S.ui.fSel = f.id; touch(); render();
      }
    }, [
      grip,
      el('div', { class: 'fcmain' }, [
        el('div', { style: 'font:600 12px var(--mono)', text: f.code }),
        el('div', { style: 'font-size:12.5px;color:var(--soft)', text: f.name || '' }),
        el('div', { style: 'margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, [
          ribbon(f.months),
          el('span', { class: 'tag' + (f.mode === 'spread' ? ' o' : ''), text: f.mode === 'spread' ? t('fm.mode_spread_short') : t('fm.mode_monthly_short') }),
          el('span', { class: 'tag', text: t('fm.n_groups', { n: (f.rules || []).length }) }),
          ccOf[nkey(f.code)] ? el('span', { class: 'tag g', text: '→ ' + ccOf[nkey(f.code)] }) : el('span', { class: 'tag o', text: t('fm.chua_map') })
        ])
      ]),
      el('div', { class: 'fcmove' }, [
        el('button', { class: 'btn sm', text: '↑', disabled: idx === 0, onclick: function () { move(idx - 1); } }),
        el('button', { class: 'btn sm', text: '↓', disabled: idx === S.formulas.length - 1, onclick: function () { move(idx + 1); } })
      ])
    ]);
    /* Giữ cả ↑ ↓: kéo là đường nhanh, nút là đường chắc khi danh sách đang cuộn
       hoặc khi dùng bàn phím. */
    drag.attach(row, f, grip);
    ul.appendChild(row);
  });
  ul.addEventListener('scroll', () => { listScroll = ul.scrollTop; });
  /* Đặt lại sau khi trình duyệt đã dựng xong và biết chiều cao thật. */
  requestAnimationFrame(() => { ul.scrollTop = listScroll; });
  list.appendChild(ul);
  /* Cột trái: danh sách Formula Code, rồi tới hộp gợi ý ở khoảng trống bên dưới. */
  const colLeft = el('div', { class: 'col-left' }, [list]);
  split.appendChild(colLeft);

  if (!fc) { split.appendChild(el('div', { class: 'panel' }, [el('div', { class: 'empty', text: t('fm.them_mot_formula_code') })])); wrap.appendChild(split); return wrap; }

  const right = el('div');

  /* --- định nghĩa + phân bổ --- */
  right.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('fm.dinh_nghia_phan_bo') }), el('div', { class: 'sp' }),
      el('button', {
        class: 'btn sm del', text: t('fm.xoa'), onclick: function () {
          confirmBox(t('fm.confirm_delete_fc', { code: fc.code }), () => {
            S.formulas = S.formulas.filter((x) => { return x.id !== fc.id; });
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
              fc.months = on ? (fc.months || []).concat([m]).sort((a, b) => { return a - b; }) : (fc.months || []).filter((x) => { return x !== m; });
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
  const rulesBox = el('div');
  const chips = chipsPanel(null);
  function drawRules() {
    rulesBox.innerHTML = '';
    (fc.rules || []).forEach((r, i) => {
      const mc = ENGINE.countMatch(r.cond);
      const condBox = fxField(r.cond, (v) => { r.cond = v; setRESULT(null); touch(); }, t('fm.cond_placeholder'), drawRules);
      const fxBox = fxField(r.formula, (v) => { r.formula = v; setRESULT(null); touch(); }, '0');
      const gname = r.name || (t('fm.nhom_thu') + ' ' + (i + 1));
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
          el('button', { class: 'btn sm', text: '↑', onclick: function () { if (i > 0) { const t = fc.rules[i - 1]; fc.rules[i - 1] = r; fc.rules[i] = t; setRESULT(null); touch(); drawRules(); } } }),
          el('button', { class: 'btn sm', text: '↓', onclick: function () { if (i < fc.rules.length - 1) { const t = fc.rules[i + 1]; fc.rules[i + 1] = r; fc.rules[i] = t; setRESULT(null); touch(); drawRules(); } } }),
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
  const avail = ENGINE.usableCols();
  const sel = el('select', {}, avail.map((c) => { return el('option', { value: c, text: c }); }));
  const info = el('p', { class: 'hint' });
  const keep = el('input', { type: 'checkbox' });
  function upd() {
    const rows = ENGINE.previewRows();
    const vals = distinctVals(rows, sel.value);
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
        const col = sel.value, vals = info._vals || [];
        if (vals.length > 200) { toast(t('fm.too_many_values', { n: vals.length }), 'bad'); return false; }
        const base = keep.checked ? fc.rules.slice() : [];
        vals.forEach((v) => {
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

const REF_KIND = {
  field: 'fm.kind.field', param: 'fm.kind.param',
  monthvar: 'fm.kind.monthvar', shared: 'fm.kind.shared', unknown: 'fm.kind.unknown'
};

/* Hiển thị giá trị thô: số thì phân cách nghìn, chuỗi giữ nguyên, lỗi thì ghi mã lỗi. */
function refVal(v) {
  if (v && typeof v === 'object' && v.err) return v.err;
  if (v === '' || v === null || v === undefined) return '—';
  /* fmtNum chứ KHÔNG phải fmt: bảng này liệt kê ĐẦU VÀO của công thức — hệ số
     1,276 · ngày công 21,5 · tỷ lệ 0,215 — chứ không phải tiền đồng. fmt() làm
     tròn nên 1,5 từng hiện thành 2, ngay ở bảng người dùng mở ra để đối chiếu. */
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

function refsTable(refs) {
  const box = el('div', { style: 'margin-top:14px' });
  box.appendChild(el('h4', { class: 'sec', text: t('fm.refs.title') }));
  if (!refs.length) {
    box.appendChild(el('p', { class: 'hint', style: 'margin:0', text: t('fm.refs.empty') }));
    return box;
  }

  const fixed = refs.filter((r) => { return r.constant; });
  const vary = refs.filter((r) => { return !r.constant; });

  if (fixed.length) {
    box.appendChild(el('div', { class: 'tw', style: 'max-height:none' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: t('fm.refs.name') }), el('th', { text: t('fm.refs.kind') }),
          el('th', { text: t('fm.refs.value') })
        ])]),
        el('tbody', {}, fixed.map((r) => {
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
          .concat(MONTHS.map((m) => { return el('th', { class: 'num', text: m }); })))]),
        el('tbody', {}, vary.map((r) => {
          return el('tr', {}, [
            el('td', { class: 'mono', text: r.key }),
            el('td', { text: t(REF_KIND[r.kind] || 'fm.kind.unknown') })
          ].concat(r.values.map((v) => {
            return el('td', { class: 'num', text: refVal(v) });
          })));
        }))
      ])
    ]));
  }
  return box;
}

function previewPanel(fc) {
  const st = { idx: 0 };
  const out = el('div');
  const rows = ENGINE.previewRows();
  const idCol = ENGINE.roleCol('key');
  const cols = ENGINE.attrCols().slice(0, 4).map((c) => { return c.alias; });
  const search = el('input', { type: 'text', placeholder: idCol ? t('fm.search_by', { col: idCol }) : t('fm.search'), style: 'width:200px' });
  const picker = el('select', { style: 'max-width:100%' });

  function label(r) {
    const head = idCol ? String(r[idCol]) : '';
    const rest = cols.filter((c) => { return c !== idCol; }).slice(0, 3).map((c) => { return r[c]; }).join(' · ');
    return head ? head + ' — ' + rest : rest;
  }
  function fillPicker() {
    const kw = search.value.trim().toLowerCase();
    picker.innerHTML = ''; let n = 0; const frag = document.createDocumentFragment();
    for (let i = 0; i < rows.length && n < 300; i++) {
      const lb = label(rows[i]);
      if (kw && lb.toLowerCase().indexOf(kw) < 0) continue;
      n++; frag.appendChild(el('option', { value: i, selected: i === st.idx, text: lb }));
    }
    if (!n) frag.appendChild(el('option', { text: t('fm.khong_tim_thay') }));
    picker.appendChild(frag);
  }

  function draw() {
    const res = ENGINE.previewRow(fc, st.idx);
    out.innerHTML = '';
    if (res.error && !res.months) {
      out.appendChild(el('div', { class: 'errbox', html: t('fm.preview_error', { e: esc(res.error) }) + (res.group ? ' ' + t('fm.preview_error_group', { g: esc(res.group) }) : '') }));
      return;
    }
    /* Sau thẻ ID là mọi cột thuộc tính của chính dòng đang thử — Grade, Gender,
       nơi làm việc... — để đối chiếu ngay tại chỗ, khỏi mở lại màn Định biên.
       Đọc từ cột THẬT của file chứ không viết cứng tên cột: mỗi nơi một file. */
    const rowInfo = ENGINE.attrCols()
      .filter((c) => { return c.alias !== idCol; })
      .map((c) => {
        const v = res.row ? res.row[c.alias] : '';
        return el('div', { class: 'stat sm' }, [
          el('div', { class: 'k', text: c.alias }),
          el('div', { class: 'v', text: v == null || v === '' ? '—' : String(v) })
        ]);
      });

    const tiles = [
      idCol ? el('div', { class: 'stat' }, [el('div', { class: 'k', text: idCol }), el('div', { class: 'v', style: 'font-size:17px', text: String(res.id == null ? '' : res.id) })]) : null,
    ].concat(rowInfo).concat([
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('fm.nhom_khop') }), el('div', { class: 'v', style: 'font-size:15px', text: res.group || t('fm.no_match') })]),
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('fm.ca_nam_dong_nay') }), el('div', { class: 'v money', text: fmt(res.total) })]),
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: t('export.audit.monthsPicked') }), el('div', { class: 'v', style: 'font-size:15px', text: res.nSel + '/12' }),
        el('div', { class: 'u', text: fc.mode === 'spread' ? t('fm.mode_spread_short') : t('fm.mode_monthly_long') })])
    ]).filter(Boolean);

    /* Chia hàng cho ĐỀU. Lưới auto-fit mặc định nhét được bao nhiêu thì nhét, nên
       12 thẻ ra 7+5 lệch. Số thẻ = số cột thuộc tính + 3, đổi theo từng file định
       biên, nên không viết cứng 6 cột: chia số thẻ cho số hàng cần thiết.
       12 -> 6+6 · 10 -> 5+5 · 9 -> 5+4 */
    const nT = tiles.length, per = Math.min(6, nT) || 1;
    const cols = Math.ceil(nT / Math.ceil(nT / per));
    out.appendChild(el('div', {
      class: 'stats even', style: 'margin:0 0 12px;--cols:' + cols
    }, tiles));
    if (res.error) out.appendChild(el('div', { class: 'errbox', text: res.error }));

    const lines = [
      { k: 'raw', t: t('fm.line_raw'), always: true },
      { k: 'raised', t: t('fm.line_raised'), when: res.hasRaise },
      { k: 'afterExc', t: t('fm.line_afterExc'), when: res.hasExc },
      { k: 'accrual', t: t('fm.line_accrual'), when: res.hasAccrual, pct: true },
      { k: 'amount', t: t('fm.line_amount'), always: true, strong: true }
    ].filter((l) => { return l.always || l.when; });

    const head = [el('th', { text: '' })].concat(MONTHS.map((m, i) => {
      return el('th', { class: 'num', style: res.months[i] && res.months[i].on ? '' : 'color:var(--faint)', text: m });
    })).concat([el('th', { class: 'num', text: t('fm.full_year') })]);

    const body = lines.map((l) => {
      let sum = 0;
      const tds = res.months.map((rec) => {
        const v = rec[l.k];
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
      .concat(res.months.map((rec) => {
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
  picker.addEventListener('change', () => { st.idx = +picker.value; draw(); });

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

export { currentFC, viewFormula, autoGroup, previewPanel };
