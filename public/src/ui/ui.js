/* ===========================================================
   UI — bộ dựng DOM dùng chung: el/toast/modal/ribbon, bảng,
   panel, trình nhập Excel. Không biết gì về các màn hình cụ thể.
   Ghép từ phần DOM của 02-core.js và toàn bộ 04-ui.js.
   =========================================================== */
import {
  M, MONTHS, S, CAL_FIELDS, t,
  uid, nkey, numOf, fmtNum, touch
} from '../core/state.js';
import { ENGINE } from '../core/formula.js';
import { pickFile, readWorkbook, sheetAoa, dedupeHeaders } from '../platform/io.js';

const XLTABLE = window.XLTABLE;

/* Vẽ lại toàn bộ khung app. Thân thật do app.js cung cấp qua setRenderer();
   nhờ vậy các màn hình gọi render() mà không cần import ngược lên app.js —
   đồ thị phụ thuộc giữ được một chiều, không có vòng. */
var _render = function () { };
function setRenderer(fn) { _render = fn; }
function render() { return _render(); }

/* ---------- DOM ---------- */
function el(tag, attrs, kids) {
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] === true) e.setAttribute(k, '');
    else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

var toastT = null;
function toast(msg, kind) {
  var old = document.querySelector('.toast'); if (old) old.remove();
  var t = el('div', { class: 'toast ' + (kind || ''), text: msg });
  document.body.appendChild(t);
  clearTimeout(toastT); toastT = setTimeout(function () { t.remove(); }, kind === 'bad' ? 6000 : 3200);
}
function modal(title, bodyNode, buttons) {
  var mask = el('div', { class: 'mask', onclick: function (e) { if (e.target === mask) close(); } });
  function close() { mask.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  var foot = el('footer', {}, (buttons || [{ label: t('btn.close') }]).map(function (b) {
    return el('button', { class: 'btn ' + (b.cls || ''), text: b.label, onclick: function () { if (!b.onclick || b.onclick(close) !== false) close(); } });
  }));
  mask.appendChild(el('div', { class: 'modal' }, [el('header', {}, [el('h3', { text: title })]), el('div', { class: 'body' }, [bodyNode]), foot]));
  document.body.appendChild(mask); return close;
}
function confirmBox(msg, onYes) {
  modal(t('modal.confirm.title'), el('p', { text: msg, style: 'margin:0' }), [{ label: t('btn.cancel') }, { label: t('btn.agree'), cls: 'pri', onclick: onYes }]);
}

/* ---------- Dải 12 tháng ----------
   mode 'list'  : active là mảng số tháng [1,4,7]
   mode 'factor': active là mảng 12 hệ số [0,0,0,1,...]           */
function ribbon(active, opts) {
  opts = opts || {};
  var factor = opts.factor;
  var r = el('span', { class: 'ribbon' + (opts.pick ? ' pick' : '') + (opts.lg ? ' lg' : '') });
  for (var m = 1; m <= M; m++) {
    (function (m) {
      var val = factor ? (active ? active[m - 1] : 0) : null;
      var on = factor ? !!val : (active || []).indexOf(m) >= 0;
      var cls = on ? (factor && val > 0 && val < 1 ? 'half' : 'on') : '';
      var i = el('i', {
        class: cls, title: MONTHS[m - 1] + (factor ? ': ' + (val || 0) : ''),
        text: (opts.pick || opts.lg) ? String(m) : ''
      });
      if (opts.pick) i.addEventListener('click', function () { opts.pick(m, !on); });
      r.appendChild(i);
    })(m);
  }
  return r;
}

/* ---------- Tải file mẫu (Excel Table đặt tên) ---------- */
function downloadTemplate(spec) {
  try {
    XLTABLE.download({
      tableName: spec.tableName, sheetName: spec.sheetName || 'DuLieu',
      headers: spec.headers, rows: spec.rows || [],
      guide: [[t('template.guide.title', { title: spec.title || spec.tableName })]].concat(
        (spec.guide || []).map(function (g) { return [g]; })
      ).concat([[''], [t('template.guide.tableName', { name: XLTABLE.safeName(spec.tableName) })],
      [t('template.guide.append')]])
    }, spec.file || (spec.tableName + '.xlsx'));
    toast(t('toast.template.ok'), 'good');
  } catch (e) { toast(t('toast.template.fail', { e: e.message }), 'bad'); }
}

/* ---------- Import chung: ghép cột theo tên header ----------
   fields: [{k, label, required, guess:[...]}]                   */
function importMapped(file, title, fields, onDone) {
  readWorkbook(file, function (err, wb) {
    if (err) { toast(t('io.err.read'), 'bad'); return; }
    var sheetName = wb.SheetNames[0];
    var st = { sheet: sheetName, map: {} };
    var box = el('div');

    function build() {
      var aoa = sheetAoa(wb, st.sheet);
      var headers = dedupeHeaders(aoa[0] || []);
      fields.forEach(function (f) {
        if (st.map[f.k] !== undefined) return;
        var g = (f.guess || []).concat([f.label]);
        st.map[f.k] = -1;
        for (var i = 0; i < headers.length; i++) {
          if (g.some(function (x) { return String(x).toLowerCase().trim() === headers[i].toLowerCase().trim(); })) { st.map[f.k] = i; break; }
        }
      });
      box.innerHTML = '';
      box.appendChild(el('div', { class: 'row', style: 'margin-bottom:10px' }, [
        el('div', { style: 'flex:1' }, [el('label', { class: 'f', text: t('import.sheet') }),
        el('select', { onchange: function (e) { st.sheet = e.target.value; st.map = {}; build(); } },
          wb.SheetNames.map(function (s) { return el('option', { value: s, selected: s === st.sheet, text: s }); }))]),
        el('div', { style: 'align-self:flex-end;color:var(--soft);font-size:12.5px' }, [document.createTextNode(t('import.rowCount', { n: aoa.length - 1 }))])
      ]));
      box.appendChild(el('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr' }, fields.map(function (f) {
        return el('div', {}, [
          el('label', { class: 'f', text: f.label + (f.required ? ' *' : '') }),
          el('select', { onchange: function (e) { st.map[f.k] = +e.target.value; } },
            [el('option', { value: -1, text: t('import.noColumn') })].concat(headers.map(function (h, i) {
              return el('option', { value: i, selected: st.map[f.k] === i, text: h });
            })))
        ]);
      })));
      box._data = function () { return { aoa: aoa, headers: headers }; };
    }
    build();

    modal(title + ' — ' + file.name, box, [
      { label: t('btn.cancel') },
      {
        label: t('btn.import'), cls: 'pri', onclick: function () {
          var d = box._data();
          var miss = fields.filter(function (f) { return f.required && st.map[f.k] < 0; });
          if (miss.length) { toast(t('import.err.missingCols', { cols: miss.map(function (f) { return f.label; }).join(', ') }), 'bad'); return false; }
          var out = [];
          for (var i = 1; i < d.aoa.length; i++) {
            var r = d.aoa[i];
            if (!r || r.every(function (x) { return x === '' || x == null; })) continue;
            var o = {};
            fields.forEach(function (f) { o[f.k] = st.map[f.k] >= 0 ? r[st.map[f.k]] : ''; });
            out.push(o);
          }
          onDone(out);
        }
      }
    ]);
  });
}

function dataTable(cfg) {
  var wrap = el('div');
  var tb = el('tbody');
  var info = el('span', { class: 'tag' });

  /* Trên 25 lựa chọn thì dùng input + datalist dùng chung, thay vì mỗi ô dựng lại
     cả danh sách option — đó là chỗ làm treo màn hình khi có vài trăm Cost Center. */
  var DL_MAX = 25;
  var tid = uid();
  var dlBox = el('div');
  var optCache = {};

  function optionsOf(col) {
    if (optCache[col.k]) return optCache[col.k];
    var raw = (typeof col.options === 'function' ? col.options() : col.options) || [];
    optCache[col.k] = raw.map(function (o) {
      return typeof o === 'string' ? { v: o, t: o } : { v: o.v, t: o.t };
    });
    return optCache[col.k];
  }
  var dlSig = '';
  function buildDatalists() {
    var sig = cfg.columns.map(function (col) {
      if (col.type !== 'select') return '';
      var o = optionsOf(col);
      return col.k + ':' + o.length + ':' + (o[0] ? o[0].v : '') + ':' + (o[o.length - 1] ? o[o.length - 1].v : '');
    }).join('|');
    if (sig === dlSig && dlBox.childNodes.length) return;
    dlSig = sig;
    dlBox.innerHTML = '';
    cfg.columns.forEach(function (col) {
      if (col.type !== 'select') return;
      var opts = optionsOf(col);
      if (opts.length <= DL_MAX) return;
      dlBox.appendChild(el('datalist', { id: 'dl_' + tid + '_' + col.k }, opts.map(function (o) {
        return el('option', { value: o.v, label: o.t !== o.v ? o.t : null });
      })));
    });
  }

  function cell(row, col) {
    if (col.type === 'select') {
      var opts = optionsOf(col);
      if (opts.length <= DL_MAX) {
        return el('select', {
          onchange: function (e) { row[col.k] = e.target.value; cfg.onChange && cfg.onChange(); }
        }, [el('option', { value: '', text: '—' })].concat(opts.map(function (o) {
          return el('option', { value: o.v, selected: String(row[col.k]) === String(o.v), text: o.t });
        })));
      }
      var known = {};
      opts.forEach(function (o) { known[nkey(o.v)] = 1; });
      var inp = el('input', {
        type: 'text', class: 'fx', list: 'dl_' + tid + '_' + col.k,
        value: row[col.k] == null ? '' : row[col.k],
        oninput: function (e) {
          row[col.k] = e.target.value;
          e.target.style.borderColor = (e.target.value && !known[nkey(e.target.value)]) ? 'var(--ochre)' : '';
          cfg.onChange && cfg.onChange();
        }
      });
      if (row[col.k] && !known[nkey(row[col.k])]) inp.style.borderColor = 'var(--ochre)';
      return inp;
    }
    if (col.type === 'num') {
      var ni = el('input', { type: 'text', class: 'fx', style: 'text-align:right' });
      var raw = function () { return (row[col.k] === '' || row[col.k] == null) ? '' : String(row[col.k]); };
      ni.value = fmtNum(row[col.k]);
      ni.addEventListener('focus', function () { ni.value = raw(); ni.select(); });
      ni.addEventListener('blur', function () { ni.value = fmtNum(row[col.k]); });
      ni.addEventListener('input', function () {
        row[col.k] = ni.value.trim() === '' ? '' : numOf(ni.value);
        cfg.onChange && cfg.onChange();
      });
      return ni;
    }
    return el('input', {
      type: 'text',
      value: row[col.k] == null ? '' : row[col.k],
      oninput: function (e) { row[col.k] = e.target.value; cfg.onChange && cfg.onChange(); }
    });
  }

  var shown = cfg.maxShow || 150;
  var filter = '';
  function draw() {
    optCache = {}; buildDatalists();
    tb.innerHTML = '';
    var rows = cfg.rows();
    var kw = filter.trim().toLowerCase();
    var keys = cfg.columns.map(function (c) { return c.k; });
    var frag = document.createDocumentFragment();
    var n = 0, matched = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (kw) {
        var hit = false;
        for (var q = 0; q < keys.length; q++) {
          if (String(row[keys[q]] == null ? '' : row[keys[q]]).toLowerCase().indexOf(kw) >= 0) { hit = true; break; }
        }
        if (!hit) continue;
      }
      matched++;
      if (n >= shown) continue;
      n++;
      (function (row) {
        var tds = cfg.columns.map(function (col) {
          return el('td', { style: col.w ? 'width:' + col.w + 'px' : '' }, [cell(row, col)]);
        });
        tds.push(el('td', { style: 'width:32px' }, [el('button', {
          class: 'btn sm del', text: '✕',
          onclick: function () {
            var all = cfg.rows(), j = all.indexOf(row);
            if (j >= 0) all.splice(j, 1);
            cfg.onChange && cfg.onChange(); draw();
          }
        })]));
        frag.appendChild(el('tr', {}, tds));
      })(row);
    }
    tb.appendChild(frag);
    if (!rows.length) tb.appendChild(el('tr', {}, [el('td', { colspan: cfg.columns.length + 1, class: 'empty', text: cfg.emptyText || t('table.empty') })]));
    else if (!matched) tb.appendChild(el('tr', {}, [el('td', { colspan: cfg.columns.length + 1, class: 'empty', text: t('table.noMatch', { kw: filter }) })]));
    info.textContent = t('table.info.rows', { n: rows.length }) + (kw ? ' ' + t('table.info.matched', { n: matched }) : '') + (matched > n ? ' ' + t('table.info.showing', { n: n }) : '');
    more.style.display = matched > n ? '' : 'none';
  }
  var more = el('button', {
    class: 'btn sm', text: t('table.showMore'), style: 'display:none',
    onclick: function () { shown += 300; draw(); }
  });
  var search = el('input', {
    type: 'text', placeholder: t('table.filter.placeholder'), style: 'width:130px',
    oninput: function (e) { filter = e.target.value; shown = cfg.maxShow || 150; draw(); }
  });

  function template() {
    var pre = cfg.prefill ? cfg.prefill() : [];
    downloadTemplate({
      tableName: cfg.tableName, title: cfg.title,
      sheetName: (cfg.sheetName || 'DuLieu'),
      headers: cfg.columns.map(function (c) { return c.label; }),
      rows: pre.map(function (r) { return cfg.columns.map(function (c) { return r[c.k] == null ? '' : r[c.k]; }); }),
      guide: cfg.guide || [],
      file: cfg.tableName + '.xlsx'
    });
  }

  function doImport(file) {
    importMapped(file, cfg.title || t('btn.import'),
      cfg.columns.map(function (c) { return { k: c.k, label: c.label, required: !!c.required }; }),
      function (out) {
        var rows = cfg.rows();
        if (cfg.replaceOnImport !== false) rows.length = 0;
        out.forEach(function (o) {
          var r = cfg.blank ? cfg.blank() : {};
          cfg.columns.forEach(function (c) { r[c.k] = c.type === 'num' ? numOf(o[c.k]) : (o[c.k] == null ? '' : String(o[c.k]).trim()); });
          rows.push(r);
        });
        cfg.onChange && cfg.onChange(); draw();
        cfg.onImported && cfg.onImported();
        toast(t('toast.import.rows', { n: out.length }), 'good');
      });
  }

  function clearAll() {
    var rows = cfg.rows();
    if (!rows.length) { toast(t('toast.table.empty')); return; }
    confirmBox(t('confirm.table.clear', { n: rows.length }), function () {
      rows.length = 0;
      cfg.onChange && cfg.onChange(); draw();
      cfg.onImported && cfg.onImported();
      toast(t('toast.table.cleared'));
    });
  }

  draw();
  wrap.appendChild(dlBox);
  wrap.appendChild(el('div', { class: 'row', style: 'margin-bottom:8px' }, [
    info, more, el('div', { class: 'sp', style: 'flex:1' }), search,
    el('button', { class: 'btn sm', text: t('table.addRow'), onclick: function () { cfg.rows().push(cfg.blank ? cfg.blank() : {}); cfg.onChange && cfg.onChange(); draw(); } }),
    cfg.prefill ? el('button', { class: 'btn sm', text: t('table.prefill'), onclick: function () {
      var rows = cfg.rows(), have = {};
      rows.forEach(function (r) { have[cfg.columns.filter(function (c) { return c.key; }).map(function (c) { return nkey(r[c.k]); }).join('|')] = 1; });
      var add = 0;
      cfg.prefill().forEach(function (p) {
        var k = cfg.columns.filter(function (c) { return c.key; }).map(function (c) { return nkey(p[c.k]); }).join('|');
        if (have[k]) return; have[k] = 1; rows.push(p); add++;
      });
      cfg.onChange && cfg.onChange(); draw();
      toast(add ? t('toast.table.added', { n: add }) : t('toast.table.noNewCombo'));
    } }) : null,
    el('button', { class: 'btn sm del', text: t('table.clear'), onclick: clearAll }),
    el('button', { class: 'btn sm', text: t('table.downloadTemplate'), onclick: template }),
    el('button', { class: 'btn sm pri', text: t('table.importExcel'), onclick: function () { pickFile('.xlsx,.xls,.csv', doImport); } })
  ]));
  wrap.appendChild(el('div', { class: 'tw' }, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, cfg.columns.map(function (c) { return el('th', { text: c.label }); }).concat([el('th', { text: '' })]))]),
      tb
    ])
  ]));
  wrap._redraw = draw;
  return wrap;
}

/* Bảng chỉ đọc dựng nhanh từ mảng mảng */
function readTable(headers, rows, opts) {
  opts = opts || {};
  return el('div', { class: 'tw', style: opts.maxH ? 'max-height:' + opts.maxH : '' }, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, headers.map(function (h, i) { return el('th', { class: opts.num && opts.num.indexOf(i) >= 0 ? 'num' : '', text: h }); }))]),
      el('tbody', {}, rows.length ? rows.map(function (r) {
        return el('tr', { class: r.__cls || '' }, r.map(function (v, i) {
          return el('td', { class: (opts.num && opts.num.indexOf(i) >= 0 ? 'num ' : '') + (v === '' || v == null ? 'zero' : ''), text: v == null ? '' : String(v) });
        }));
      }) : [el('tr', {}, [el('td', { colspan: headers.length, class: 'empty', text: opts.empty || t('table.noData') })])])
    ])
  ]);
}

function panel(title, actions, body, note) {
  return el('div', { class: 'panel' }, [
    el('header', {}, [el('h3', { text: title }), el('div', { class: 'sp' })].concat(actions || [])),
    el('div', { class: 'body' }, [note ? el('p', { class: 'hint', html: note }) : null, body])
  ]);
}

/* Panel thu gọn được — trạng thái nhớ trong S.ui.collapsed */
function foldPanel(key, title, badges, actions, bodyNode, note) {
  var open = !S.ui.collapsed[key];
  var body = el('div', { class: 'body', style: open ? '' : 'display:none' },
    [note ? el('p', { class: 'hint', html: note }) : null, bodyNode]);
  var caret = el('span', { class: 'caret', text: open ? '▾' : '▸' });
  var head = el('header', { class: 'fold' }, [caret, el('h3', { text: title })]
    .concat(badges || []).concat([el('div', { class: 'sp' })]).concat(actions || []));
  head.addEventListener('click', function (e) {
    if (e.target.closest('button, input, select, textarea, .chips')) return;
    open = !open;
    S.ui.collapsed[key] = !open; touch();
    body.style.display = open ? '' : 'none';
    caret.textContent = open ? '▾' : '▸';
  });
  return el('div', { class: 'panel' }, [head, body]);
}




export {
  el, esc, toast, modal, confirmBox, ribbon,
  downloadTemplate, importMapped,
  dataTable, readTable, panel, foldPanel,
  render, setRenderer
};
