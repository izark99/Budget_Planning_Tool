/* ===========================================================
   FX-HELP — tra cứu và gợi ý cho máy biểu thức: danh mục hàm, chữ ký, modal
   thư viện, bảng gợi ý khi gõ.

   FX_DOCS/FX_OPS dựng lúc NẠP MODULE — trước khi content.md kịp về — nên chúng
   chỉ giữ KHOÁ nội dung; t() gọi lúc render.
   =========================================================== */
import { CAL_FIELDS, S, SYS_VARS, fmtNum } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { el, modal, toast } from './dom.js';

/* Chữ ký hàm dựng từ FX_DOCS, tra lúc chạy nên t() đã sẵn sàng. */
function fxArgs(doc) { return t(doc.a).split('|'); }

/* ===========================================================
   FX HELP — thư viện hàm + gợi ý khi gõ công thức
   =========================================================== */
const FX_DOCS = [
  { c: 'fx.cat.cond', n: 'IF', a: 'fx.args.IF', d: 'fx.desc.IF', e: 'IF([Grade]="5A.12", 500000, 300000)' },
  { c: 'fx.cat.cond', n: 'IFS', a: 'fx.args.IFS', d: 'fx.desc.IFS', e: 'IFS([Grade]="6A.01",900000, [Grade]="5A.12",500000, TRUE,300000)' },
  { c: 'fx.cat.cond', n: 'SWITCH', a: 'fx.args.SWITCH', d: 'fx.desc.SWITCH', e: 'SWITCH([Dept], "AC",100000, "SL",200000, 0)' },
  { c: 'fx.cat.cond', n: 'AND', a: 'fx.args.AND', d: 'fx.desc.AND', e: 'AND([Gender]="Male", [Coefficient]>1)' },
  { c: 'fx.cat.cond', n: 'OR', a: 'fx.args.OR', d: 'fx.desc.OR', e: 'OR([Dept]="AC", [Dept]="SL")' },
  { c: 'fx.cat.cond', n: 'NOT', a: 'fx.args.NOT', d: 'fx.desc.NOT', e: 'NOT([Status]="02. New Hire")' },
  { c: 'fx.cat.cond', n: 'IFERROR', a: 'fx.args.IFERROR', d: 'fx.desc.IFERROR', e: 'IFERROR([Coefficient]/0, 0)' },

  { c: 'fx.cat.arith', n: 'SUM', a: 'fx.args.SUM', d: 'fx.desc.SUM', e: 'SUM(300000, 200000)' },
  { c: 'fx.cat.arith', n: 'AVERAGE', a: 'fx.args.AVERAGE', d: 'fx.desc.AVERAGE', e: 'AVERAGE(1000000, 1400000)' },
  { c: 'fx.cat.arith', n: 'MIN', a: 'fx.args.MIN', d: 'fx.desc.MIN', e: 'MIN([Coefficient]*LUONG_CO_SO, 20000000)' },
  { c: 'fx.cat.arith', n: 'MAX', a: 'fx.args.MAX', d: 'fx.desc.MAX', e: 'MAX([Coefficient]*LUONG_CO_SO, 5000000)' },
  { c: 'fx.cat.arith', n: 'COUNT', a: 'fx.args.COUNT', d: 'fx.desc.COUNT', e: 'COUNT(1, 2, 3)' },
  { c: 'fx.cat.arith', n: 'ABS', a: 'fx.args.ABS', d: 'fx.desc.ABS', e: 'ABS(-500000)' },
  { c: 'fx.cat.arith', n: 'MOD', a: 'fx.args.MOD', d: 'fx.desc.MOD', e: 'MOD(THANG, 3)' },

  { c: 'fx.cat.round', n: 'ROUND', a: 'fx.args.ROUND', d: 'fx.desc.ROUND', e: 'ROUND([Coefficient]*LUONG_CO_SO, -3)' },
  { c: 'fx.cat.round', n: 'ROUNDUP', a: 'fx.args.ROUNDUP', d: 'fx.desc.ROUNDUP', e: 'ROUNDUP(1234567, -3)' },
  { c: 'fx.cat.round', n: 'ROUNDDOWN', a: 'fx.args.ROUNDDOWN', d: 'fx.desc.ROUNDDOWN', e: 'ROUNDDOWN(1234567, -3)' },
  { c: 'fx.cat.round', n: 'INT', a: 'fx.args.INT', d: 'fx.desc.INT', e: 'INT([Coefficient])' },
  { c: 'fx.cat.round', n: 'CEILING', a: 'fx.args.CEILING', d: 'fx.desc.CEILING', e: 'CEILING(1234567, 1000)' },
  { c: 'fx.cat.round', n: 'FLOOR', a: 'fx.args.FLOOR', d: 'fx.desc.FLOOR', e: 'FLOOR(1234567, 1000)' },

  { c: 'fx.cat.text', n: 'LEFT', a: 'fx.args.LEFT', d: 'fx.desc.LEFT', e: 'LEFT([Grade], 2)' },
  { c: 'fx.cat.text', n: 'RIGHT', a: 'fx.args.RIGHT', d: 'fx.desc.RIGHT', e: 'RIGHT([Position], 3)' },
  { c: 'fx.cat.text', n: 'MID', a: 'fx.args.MID', d: 'fx.desc.MID', e: 'MID([Grade], 2, 1)' },
  { c: 'fx.cat.text', n: 'LEN', a: 'fx.args.LEN', d: 'fx.desc.LEN', e: 'LEN([Position])' },
  { c: 'fx.cat.text', n: 'TRIM', a: 'fx.args.TRIM', d: 'fx.desc.TRIM', e: 'TRIM([Unit])' },
  { c: 'fx.cat.text', n: 'UPPER', a: 'fx.args.UPPER', d: 'fx.desc.UPPER', e: 'UPPER([Dept])' },
  { c: 'fx.cat.text', n: 'LOWER', a: 'fx.args.LOWER', d: 'fx.desc.LOWER', e: 'LOWER([Dept])' },
  { c: 'fx.cat.text', n: 'VALUE', a: 'fx.args.VALUE', d: 'fx.desc.VALUE', e: 'VALUE([Grade])' },
  { c: 'fx.cat.text', n: 'FIND', a: 'fx.args.FIND', d: 'fx.desc.FIND', e: 'FIND("_", [Position])' },
  { c: 'fx.cat.text', n: 'SEARCH', a: 'fx.args.SEARCH', d: 'fx.desc.SEARCH', e: 'SEARCH("ac", [Unit])' },
  { c: 'fx.cat.text', n: 'EXACT', a: 'fx.args.EXACT', d: 'fx.desc.EXACT', e: 'EXACT([Dept], "AC")' },

  { c: 'fx.cat.check', n: 'ISBLANK', a: 'fx.args.ISBLANK', d: 'fx.desc.ISBLANK', e: 'IF(ISBLANK([Grade]), 0, 500000)' },
  { c: 'fx.cat.check', n: 'ISNUMBER', a: 'fx.args.ISNUMBER', d: 'fx.desc.ISNUMBER', e: 'ISNUMBER([Coefficient])' }
];

const FX_OPS = [
  { n: '+  -  *  /', d: 'fx.op.0.desc', e: '[Coefficient]*LUONG_CO_SO' },
  { n: '^', d: 'fx.op.1.desc', e: '2^3' },
  { n: '%', d: 'fx.op.2.desc', e: 'TY_LE_BHXH_CTY% * 10000000' },
  { n: '&', d: 'fx.op.3.desc', e: '"CC-" & [Unit]' },
  { n: '=  <>  <  >  <=  >=', d: 'fx.op.4.desc', e: '[Grade]="5A.12"' }
];

function fxDocByName(n) {
  n = String(n).toUpperCase();
  for (let i = 0; i < FX_DOCS.length; i++) if (FX_DOCS[i].n === n) return FX_DOCS[i];
  return null;
}
function fxSignature(doc, argIdx) {
  const parts = fxArgs(doc).map((a, i) => {
    return (i === argIdx) ? '\u2039' + a + '\u203A' : a;
  });
  return doc.n + '(' + parts.join('; ') + ')';
}

/* ---------- Thư viện: modal tra cứu ---------- */
function fxLibrary(target) {
  const q = el('input', { type: 'text', placeholder: t('fx.search.placeholder'), style: 'margin-bottom:12px' });
  const body = el('div', { style: 'max-height:52vh;overflow:auto' });
  let tab = 'fn';
  const tabs = el('div', { class: 'chips', style: 'margin-bottom:10px' });

  function ownFormulas() {
    const out = [];
    (S.formulas || []).forEach((f) => {
      (f.rules || []).forEach((r) => {
        if (!r.formula || !String(r.formula).trim()) return;
        out.push({ code: f.code, group: r.name || '', cond: r.cond || '', formula: r.formula });
      });
    });
    return out;
  }

  function draw() {
    const kw = q.value.trim().toLowerCase();
    body.innerHTML = '';
    tabs.innerHTML = '';
    [['fn', 'fx.tab.fn'], ['op', 'fx.tab.op'], ['var', 'fx.tab.var'], ['own', 'fx.tab.own']].forEach((tabDef) => {
      tabs.appendChild(el('span', {
        class: 'chip', style: tab === tabDef[0] ? 'background:var(--mineral);color:#fff;border-color:var(--mineral)' : '',
        text: t(tabDef[1]), onclick: function () { tab = tabDef[0]; draw(); }
      }));
    });

    function item(title, desc, ex, insert) {
      return el('div', { class: 'fx-item' }, [
        el('div', { class: 'fx-item-h' }, [
          el('code', { text: title }),
          target ? el('button', { class: 'btn sm', text: t('fx.insert'), onclick: function () { target._insert(insert); toast(t('toast.fx.inserted')); } }) : null
        ]),
        desc ? el('div', { class: 'fx-item-d', text: desc }) : null,
        ex ? el('div', { class: 'fx-item-e', text: ex }) : null
      ]);
    }

    if (tab === 'fn') {
      let cat = '';
      FX_DOCS.filter((f) => {
        return !kw || f.n.toLowerCase().indexOf(kw) >= 0 || t(f.d).toLowerCase().indexOf(kw) >= 0;
      }).forEach((f) => {
        if (f.c !== cat) { cat = f.c; body.appendChild(el('div', { class: 'fx-cat', text: t(cat) })); }
        body.appendChild(item(f.n + '(' + fxArgs(f).join('; ') + ')', t(f.d), f.e, f.n + '('));
      });
    } else if (tab === 'op') {
      FX_OPS.filter((o) => { return !kw || o.n.indexOf(kw) >= 0 || t(o.d).toLowerCase().indexOf(kw) >= 0; })
        .forEach((o) => { body.appendChild(item(o.n, t(o.d), o.e, '')); });
    } else if (tab === 'var') {
      body.appendChild(el('div', { class: 'fx-cat', text: t('fx.cat.usableCols') }));
      ENGINE.usableCols().filter((c) => { return !kw || c.toLowerCase().indexOf(kw) >= 0; })
        .forEach((c) => { body.appendChild(item('[' + c + ']', t('fx.col.desc'), '', '[' + c + ']')); });
      body.appendChild(el('div', { class: 'fx-cat', text: t('fx.cat.params') }));
      (S.params || []).filter((p) => { return p.name && (!kw || p.name.toLowerCase().indexOf(kw) >= 0); })
        .forEach((p) => { body.appendChild(item(p.name, p.note || '', t('fx.param.current', { v: fmtNum(p.value) }), p.name)); });
      body.appendChild(el('div', { class: 'fx-cat', text: t('fx.sysvar') }));
      SYS_VARS.map((v) => { return [v, t('fx.var.' + v)]; })
        .concat(CAL_FIELDS.map((f) => { return [f.varName, t('fx.var.calField', { label: f.label })]; }))
        .filter((v) => { return !kw || v[0].toLowerCase().indexOf(kw) >= 0; })
        .forEach((v) => { body.appendChild(item(v[0], v[1], '', v[0])); });
    } else {
      const list = ownFormulas().filter((o) => {
        return !kw || (o.code + ' ' + o.group + ' ' + o.formula).toLowerCase().indexOf(kw) >= 0;
      });
      if (!list.length) body.appendChild(el('div', { class: 'empty', text: t('fx.own.empty') }));
      list.forEach((o) => {
        body.appendChild(item(o.code + ' › ' + o.group, o.cond ? t('engine.err.cond', { e: o.cond }) : t('fx.own.defaultGroup'), o.formula, o.formula));
      });
    }
  }
  q.addEventListener('input', draw);
  draw();
  modal(t('fx.library.title'), el('div', {}, [q, tabs, body]), [{ label: t('btn.close') }]);
  setTimeout(() => { q.focus(); }, 60);
}

/* ---------- Gợi ý khi gõ ---------- */
function fxAssist(ta, onChange, check) {
  const hint = el('div', { class: 'fx-hint', style: 'display:none' });
  const list = el('div', { class: 'fx-ac', style: 'display:none' });
  let items = [], sel = -1;

  function tokenBefore() {
    const s = ta.value.slice(0, ta.selectionStart);
    const mCol = /\[([^\]]*)$/.exec(s);
    if (mCol) return { kind: 'col', text: mCol[1], start: ta.selectionStart - mCol[1].length };
    const mId = /([A-Za-z_\u00C0-\u024F\u1E00-\u1EFF][A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF]*)$/.exec(s);
    if (mId) return { kind: 'id', text: mId[1], start: ta.selectionStart - mId[1].length };
    return null;
  }

  /* Tìm hàm đang mở ngoặc gần nhất và vị trí đối số hiện tại */
  function activeCall() {
    const s = ta.value.slice(0, ta.selectionStart);
    let depth = 0, arg = 0, i = s.length - 1, inStr = false;
    for (; i >= 0; i--) {
      const ch = s[i];
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === ')') depth++;
      else if (ch === '(') {
        if (depth === 0) {
          const m = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(s.slice(0, i));
          if (!m) return null;
          return { name: m[1], arg };
        }
        depth--;
      } else if ((ch === ',' || ch === ';') && depth === 0) arg++;
    }
    return null;
  }

  function hideList() { list.style.display = 'none'; items = []; sel = -1; }

  function accept(i) {
    const tok = tokenBefore(); if (!tok || !items[i]) return;
    const ins = items[i].ins;
    const a = ta.value.slice(0, tok.start), b = ta.value.slice(ta.selectionStart);
    ta.value = a + ins + b;
    const caret = a.length + ins.length;
    ta.focus(); ta.selectionStart = ta.selectionEnd = caret;
    hideList(); onChange(ta.value); check(); update();
  }

  function drawList() {
    list.innerHTML = '';
    items.forEach((it, i) => {
      list.appendChild(el('div', {
        class: 'fx-ac-i' + (i === sel ? ' on' : ''),
        onmousedown: function (e) { e.preventDefault(); accept(i); }
      }, [el('code', { text: it.label }), it.hint ? el('span', { text: it.hint }) : null]));
    });
    list.style.display = items.length ? '' : 'none';
  }

  function update() {
    /* gợi ý đối số */
    const call = activeCall();
    const doc = call ? fxDocByName(call.name) : null;
    if (doc) {
      hint.style.display = '';
      hint.textContent = fxSignature(doc, Math.min(call.arg, fxArgs(doc).length - 1)) + ' — ' + t(doc.d);
    } else hint.style.display = 'none';

    /* danh sách hoàn tất */
    const tok = tokenBefore();
    if (!tok || tok.text.length < 1) { hideList(); return; }
    const kw = tok.text.toLowerCase();
    const out = [];
    if (tok.kind === 'col') {
      ENGINE.usableCols().forEach((c) => {
        if (c.toLowerCase().indexOf(kw) >= 0) out.push({ label: '[' + c + ']', hint: t('fx.hint.col'), ins: c + ']' });
      });
    } else {
      FX_DOCS.forEach((f) => {
        if (f.n.toLowerCase().indexOf(kw) === 0) out.push({ label: f.n + '(' + fxArgs(f).join('; ') + ')', hint: t(f.d), ins: f.n + '(' });
      });
      (S.params || []).forEach((p) => {
        if (p.name && p.name.toLowerCase().indexOf(kw) === 0) out.push({ label: p.name, hint: t('fx.hint.param', { v: fmtNum(p.value) }), ins: p.name });
      });
      SYS_VARS.concat(CAL_FIELDS.map((f) => { return f.varName; })).forEach((v) => {
        if (v.toLowerCase().indexOf(kw) === 0) out.push({ label: v, hint: t('fx.sysvar'), ins: v });
      });
      ENGINE.usableCols().forEach((c) => {
        if (c.toLowerCase().indexOf(kw) === 0) out.push({ label: '[' + c + ']', hint: t('fx.hint.col'), ins: '[' + c + ']' });
      });
    }
    items = out.slice(0, 8);
    sel = items.length ? 0 : -1;
    drawList();
  }

  ta.addEventListener('input', update);
  ta.addEventListener('click', update);
  ta.addEventListener('blur', () => { setTimeout(() => { hideList(); hint.style.display = 'none'; }, 120); });
  ta.addEventListener('keydown', (e) => {
    if (list.style.display === 'none' || !items.length) {
      if (e.key === 'Escape') hint.style.display = 'none';
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % items.length; drawList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; drawList(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); hideList(); }
  });

  return el('div', { class: 'fx-assist' }, [hint, list]);
}

export { FX_DOCS, FX_OPS, fxArgs, fxDocByName, fxSignature, fxLibrary, fxAssist };
