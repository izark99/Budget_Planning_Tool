/* ===========================================================
   FORMULA — máy công thức FX + máy tính ngân sách ENGINE
   Tách nguyên văn từ khối 01-formula.js và 03-engine.js.
   Không đổi một bước tính nào; chỉ đưa thông báo tiếng Việt
   ra content.md qua t().
   =========================================================== */
import { CAL_FIELDS, M, MONTHS, S, nkey, numOf, t } from './state.js';

/* ==== 01-formula.js ==== */
/* ===========================================================
   FX — Excel-style formula engine
   Cú pháp tương đương Excel 365 (tập con)
   - Tham chiếu cột định biên:  [Dept], [Coefficient]
   - Hằng số toàn cục:          LUONG_CO_SO
   - Biến hệ thống:             THANG, DINH_BIEN, SO_THANG
   =========================================================== */
var FX = (function () {
  'use strict';

  var ERR = function (code) { return { __err: code }; };
  var isErr = function (v) { return v && typeof v === 'object' && v.__err; };

  /* ---------- Tokenizer ---------- */
  var OPS3 = [];
  var OPS2 = ['<=', '>=', '<>'];
  var OPS1 = ['+', '-', '*', '/', '^', '&', '=', '<', '>', '(', ')', ',', ';'];

  function isIdentStart(ch) { return /[A-Za-z_\u00C0-\u024F\u1E00-\u1EFF]/.test(ch); }
  function isIdentChar(ch) { return /[A-Za-z0-9_.\u00C0-\u024F\u1E00-\u1EFF]/.test(ch); }

  function tokenize(src) {
    var t = [], i = 0, n = src.length;
    while (i < n) {
      var ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
      if (ch === '"') {
        var j = i + 1, buf = '';
        while (j < n) {
          if (src[j] === '"') {
            if (src[j + 1] === '"') { buf += '"'; j += 2; continue; }
            break;
          }
          buf += src[j]; j++;
        }
        if (j >= n) throw new Error(t('fx.err.string.unclosed'));
        t.push({ t: 'str', v: buf }); i = j + 1; continue;
      }
      if (ch === '[') {
        var k = src.indexOf(']', i + 1);
        if (k < 0) throw new Error(t('fx.err.bracket.unclosed'));
        var nm = src.slice(i + 1, k).trim();
        if (nm[0] === '@') nm = nm.slice(1).trim();
        t.push({ t: 'field', v: nm }); i = k + 1; continue;
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        var m = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(src.slice(i));
        t.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if (isIdentStart(ch)) {
        var j2 = i;
        while (j2 < n && isIdentChar(src[j2])) j2++;
        t.push({ t: 'id', v: src.slice(i, j2) }); i = j2; continue;
      }
      if (ch === '%') { t.push({ t: 'op', v: '%' }); i++; continue; }
      var two = src.substr(i, 2);
      if (OPS2.indexOf(two) >= 0) { t.push({ t: 'op', v: two }); i += 2; continue; }
      if (OPS1.indexOf(ch) >= 0) { t.push({ t: 'op', v: ch }); i++; continue; }
      throw new Error(t('fx.err.badchar', { ch: ch }));
    }
    t.push({ t: 'eof' });
    return t;
  }

  /* ---------- Parser (recursive descent, Excel precedence) ---------- */
  function parse(src) {
    var s = String(src == null ? '' : src).trim();
    if (s[0] === '=') s = s.slice(1);
    if (!s) return { k: 'num', v: 0 };
    var toks = tokenize(s), p = 0;

    function peek() { return toks[p]; }
    function eat(v) {
      var tk = toks[p];
      if (tk.t === 'op' && tk.v === v) { p++; return true; }
      return false;
    }
    function expect(v) { if (!eat(v)) throw new Error(t('fx.err.expected', { tok: v })); }

    function parseCompare() {
      var left = parseConcat();
      while (peek().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].indexOf(peek().v) >= 0) {
        var op = toks[p++].v;
        left = { k: 'bin', op: op, a: left, b: parseConcat() };
      }
      return left;
    }
    function parseConcat() {
      var left = parseAdd();
      while (peek().t === 'op' && peek().v === '&') { p++; left = { k: 'bin', op: '&', a: left, b: parseAdd() }; }
      return left;
    }
    function parseAdd() {
      var left = parseMul();
      while (peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        var op = toks[p++].v;
        left = { k: 'bin', op: op, a: left, b: parseMul() };
      }
      return left;
    }
    function parseMul() {
      var left = parsePow();
      while (peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
        var op = toks[p++].v;
        left = { k: 'bin', op: op, a: left, b: parsePow() };
      }
      return left;
    }
    function parsePow() {
      // Excel tính luỹ thừa từ trái sang phải: 2^3^2 = 64
      var left = parseUnary();
      while (peek().t === 'op' && peek().v === '^') { p++; left = { k: 'bin', op: '^', a: left, b: parseUnary() }; }
      return left;
    }
    function parseUnary() {
      if (peek().t === 'op' && (peek().v === '-' || peek().v === '+')) {
        var op = toks[p++].v;
        var e = parseUnary();
        return op === '-' ? { k: 'neg', a: e } : e;
      }
      return parsePostfix();
    }
    function parsePostfix() {
      var e = parsePrimary();
      while (peek().t === 'op' && peek().v === '%') { p++; e = { k: 'pct', a: e }; }
      return e;
    }
    function parsePrimary() {
      var tk = peek();
      if (tk.t === 'num') { p++; return { k: 'num', v: tk.v }; }
      if (tk.t === 'str') { p++; return { k: 'str', v: tk.v }; }
      if (tk.t === 'field') { p++; return { k: 'field', v: tk.v }; }
      if (tk.t === 'id') {
        p++;
        var name = tk.v;
        if (peek().t === 'op' && peek().v === '(') {
          p++;
          var args = [];
          if (!(peek().t === 'op' && peek().v === ')')) {
            args.push(parseCompare());
            while (eat(',') || eat(';')) args.push(parseCompare());
          }
          expect(')');
          return { k: 'call', name: name.toUpperCase(), args: args };
        }
        var up = name.toUpperCase();
        if (up === 'TRUE') return { k: 'bool', v: true };
        if (up === 'FALSE') return { k: 'bool', v: false };
        return { k: 'name', v: name };
      }
      if (tk.t === 'op' && tk.v === '(') { p++; var e = parseCompare(); expect(')'); return e; }
      throw new Error(t('fx.err.badexpr', { pos: p + 1 }));
    }

    var ast = parseCompare();
    if (peek().t !== 'eof') throw new Error(t('fx.err.trailing'));
    return ast;
  }

  /* ---------- Coercion ---------- */
  function toNum(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : ERR('#NUM!');
    if (typeof v === 'boolean') return v ? 1 : 0;
    var s = String(v).trim().replace(/,/g, '');
    if (s === '') return 0;
    if (/%$/.test(s)) { var b = parseFloat(s); return isNaN(b) ? ERR('#VALUE!') : b / 100; }
    var x = parseFloat(s);
    return (isNaN(x) || !/^-?[0-9.]+([eE][+-]?[0-9]+)?$/.test(s)) ? ERR('#VALUE!') : x;
  }
  function toStr(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }
  function toBool(v) {
    if (isErr(v)) return v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (v === null || v === undefined || v === '') return false;
    var s = String(v).trim().toUpperCase();
    if (s === 'TRUE') return true;
    if (s === 'FALSE') return false;
    var n = toNum(v);
    return isErr(n) ? n : n !== 0;
  }
  function cmpVals(a, b) {
    var na = (typeof a === 'number'), nb = (typeof b === 'number');
    if (na && nb) return a < b ? -1 : a > b ? 1 : 0;
    if (typeof a === 'boolean' || typeof b === 'boolean') {
      var x = toBool(a) ? 1 : 0, y = toBool(b) ? 1 : 0;
      return x < y ? -1 : x > y ? 1 : 0;
    }
    var sa = String(a == null ? '' : a).toUpperCase(), sb = String(b == null ? '' : b).toUpperCase();
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  /* ---------- Built-in functions ---------- */
  function flat(args) {
    var out = [];
    args.forEach(function (a) { if (Array.isArray(a)) out = out.concat(flat(a)); else out.push(a); });
    return out;
  }
  function nums(args) {
    var xs = [], e = null;
    flat(args).forEach(function (a) {
      if (e) return;
      if (isErr(a)) { e = a; return; }
      if (a === null || a === undefined || a === '') return;
      var n = toNum(a);
      if (isErr(n)) { e = n; return; }
      xs.push(n);
    });
    return e || xs;
  }
  function roundTo(x, d) {
    var f = Math.pow(10, d);
    return Math.round((x * f + (x >= 0 ? 1e-9 : -1e-9))) / f;
  }

  var FUNCS = {
    IF: function (a, ctx, ev) {
      if (a.length < 2) return ERR('#N/A');
      var c = toBool(ev(a[0], ctx));
      if (isErr(c)) return c;
      if (c) return ev(a[1], ctx);
      return a.length > 2 ? ev(a[2], ctx) : false;
    },
    IFS: function (a, ctx, ev) {
      for (var i = 0; i + 1 < a.length; i += 2) {
        var c = toBool(ev(a[i], ctx));
        if (isErr(c)) return c;
        if (c) return ev(a[i + 1], ctx);
      }
      return ERR('#N/A');
    },
    IFERROR: function (a, ctx, ev) {
      var v;
      try { v = ev(a[0], ctx); } catch (e) { return ev(a[1], ctx); }
      return isErr(v) ? ev(a[1], ctx) : v;
    },
    SWITCH: function (a, ctx, ev) {
      var target = ev(a[0], ctx);
      if (isErr(target)) return target;
      var i = 1;
      for (; i + 1 < a.length; i += 2) {
        var k = ev(a[i], ctx);
        if (isErr(k)) return k;
        if (cmpVals(target, k) === 0) return ev(a[i + 1], ctx);
      }
      return i < a.length ? ev(a[i], ctx) : ERR('#N/A');
    },
    AND: function (a, ctx, ev) {
      for (var i = 0; i < a.length; i++) { var c = toBool(ev(a[i], ctx)); if (isErr(c)) return c; if (!c) return false; }
      return true;
    },
    OR: function (a, ctx, ev) {
      for (var i = 0; i < a.length; i++) { var c = toBool(ev(a[i], ctx)); if (isErr(c)) return c; if (c) return true; }
      return false;
    },
    NOT: function (a, ctx, ev) { var c = toBool(ev(a[0], ctx)); return isErr(c) ? c : !c; }
  };

  // Các hàm "đơn giản": nhận mảng giá trị đã evaluate
  var SIMPLE = {
    SUM: function (v) { var x = nums(v); return isErr(x) ? x : x.reduce(function (s, y) { return s + y; }, 0); },
    AVERAGE: function (v) { var x = nums(v); if (isErr(x)) return x; return x.length ? x.reduce(function (s, y) { return s + y; }, 0) / x.length : ERR('#DIV/0!'); },
    MIN: function (v) { var x = nums(v); if (isErr(x)) return x; return x.length ? Math.min.apply(null, x) : 0; },
    MAX: function (v) { var x = nums(v); if (isErr(x)) return x; return x.length ? Math.max.apply(null, x) : 0; },
    COUNT: function (v) { var x = nums(v); return isErr(x) ? x : x.length; },
    ROUND: function (v) { var a = toNum(v[0]), b = toNum(v.length > 1 ? v[1] : 0); if (isErr(a)) return a; if (isErr(b)) return b; return roundTo(a, b); },
    ROUNDUP: function (v) { var a = toNum(v[0]), b = toNum(v.length > 1 ? v[1] : 0); if (isErr(a)) return a; var f = Math.pow(10, b); return (a >= 0 ? Math.ceil(a * f - 1e-9) : Math.floor(a * f + 1e-9)) / f; },
    ROUNDDOWN: function (v) { var a = toNum(v[0]), b = toNum(v.length > 1 ? v[1] : 0); if (isErr(a)) return a; var f = Math.pow(10, b); return (a >= 0 ? Math.floor(a * f + 1e-9) : Math.ceil(a * f - 1e-9)) / f; },
    INT: function (v) { var a = toNum(v[0]); return isErr(a) ? a : Math.floor(a); },
    ABS: function (v) { var a = toNum(v[0]); return isErr(a) ? a : Math.abs(a); },
    MOD: function (v) { var a = toNum(v[0]), b = toNum(v[1]); if (isErr(a)) return a; if (isErr(b)) return b; if (b === 0) return ERR('#DIV/0!'); return a - b * Math.floor(a / b); },
    CEILING: function (v) { var a = toNum(v[0]), b = toNum(v.length > 1 ? v[1] : 1); if (isErr(a)) return a; if (isErr(b)) return b; if (b === 0) return 0; return Math.ceil(a / b) * b; },
    FLOOR: function (v) { var a = toNum(v[0]), b = toNum(v.length > 1 ? v[1] : 1); if (isErr(a)) return a; if (isErr(b)) return b; if (b === 0) return 0; return Math.floor(a / b) * b; },
    LEFT: function (v) { var s = toStr(v[0]); if (isErr(s)) return s; var n = v.length > 1 ? toNum(v[1]) : 1; return s.slice(0, n); },
    RIGHT: function (v) { var s = toStr(v[0]); if (isErr(s)) return s; var n = v.length > 1 ? toNum(v[1]) : 1; return n <= 0 ? '' : s.slice(-n); },
    MID: function (v) { var s = toStr(v[0]); if (isErr(s)) return s; var a = toNum(v[1]), b = toNum(v[2]); return s.substr(a - 1, b); },
    LEN: function (v) { var s = toStr(v[0]); return isErr(s) ? s : s.length; },
    TRIM: function (v) { var s = toStr(v[0]); return isErr(s) ? s : s.trim().replace(/\s+/g, ' '); },
    UPPER: function (v) { var s = toStr(v[0]); return isErr(s) ? s : s.toUpperCase(); },
    LOWER: function (v) { var s = toStr(v[0]); return isErr(s) ? s : s.toLowerCase(); },
    VALUE: function (v) { return toNum(v[0]); },
    TEXT: function (v) { var s = toStr(v[0]); return s; },
    EXACT: function (v) { return String(v[0]) === String(v[1]); },
    ISBLANK: function (v) { return v[0] === null || v[0] === undefined || v[0] === ''; },
    ISNUMBER: function (v) { return typeof v[0] === 'number'; },
    FIND: function (v) { var a = toStr(v[0]), b = toStr(v[1]); var i = b.indexOf(a); return i < 0 ? ERR('#VALUE!') : i + 1; },
    SEARCH: function (v) { var a = toStr(v[0]).toUpperCase(), b = toStr(v[1]).toUpperCase(); var i = b.indexOf(a); return i < 0 ? ERR('#VALUE!') : i + 1; }
  };

  /* ---------- Evaluator ---------- */
  function fieldValue(ctx, name) {
    var row = ctx.row || {};
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    var lk = ctx.fieldIndex && ctx.fieldIndex[String(name).toLowerCase().trim()];
    if (lk !== undefined && Object.prototype.hasOwnProperty.call(row, lk)) return row[lk];
    var sh = sharedValue(ctx, name);          /* [Lương cơ bản] cũng gọi được */
    if (sh !== undefined) return sh;
    return ERR('#REF!');
  }

  /* Công thức dùng chung — biểu thức đặt tên, tính lúc chạy.
     Trả về undefined nếu tên không phải công thức dùng chung, để nơi gọi
     còn báo #NAME? / #REF! như cũ.
     Không làm tròn sau khi áp tăng lương: một biểu thức đặt tên có thể là hệ số
     hay tỷ lệ chứ không riêng tiền lương. Cần tròn thì viết ROUND() trong công
     thức chi phí. */
  function sharedValue(ctx, rawKey) {
    var reg = ctx.shared;
    if (!reg) return undefined;
    var d = reg[String(rawKey == null ? '' : rawKey).toUpperCase().trim()];
    if (!d) return undefined;
    if (!d.fn) return ERR('#NAME?');

    var stack = ctx.__shStack || (ctx.__shStack = {});
    if (stack[d.code]) return ERR('#CIRC!');   /* tự tham chiếu vòng tròn */
    stack[d.code] = 1;
    var v;
    try { v = d.fn.eval(ctx); } finally { delete stack[d.code]; }
    if (isErr(v)) return v;

    if (d.raises && d.raises.length) {
      var m = (ctx.vars && ctx.vars.THANG) || 1, f = 1;
      for (var i = 0; i < d.raises.length; i++) {
        var rz = d.raises[i];
        if (m < rz.from) continue;
        if (rz.condFn) { var cv = rz.condFn.eval(ctx); if (isErr(cv) || toBool(cv) !== true) continue; }
        f *= (1 + rz.pct / 100);
      }
      if (f !== 1) { var n = toNum(v); if (isErr(n)) return n; v = n * f; }
    }
    return v;
  }

  function evalNode(node, ctx) {
    switch (node.k) {
      case 'num': return node.v;
      case 'str': return node.v;
      case 'bool': return node.v;
      case 'field': return fieldValue(ctx, node.v);
      case 'name': {
        var up = node.v.toUpperCase();
        if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, up)) return ctx.vars[up];
        if (ctx.params && Object.prototype.hasOwnProperty.call(ctx.params, up)) return ctx.params[up];
        var sh = sharedValue(ctx, up);
        if (sh !== undefined) return sh;
        return ERR('#NAME?');
      }
      case 'neg': { var a = toNum(evalNode(node.a, ctx)); return isErr(a) ? a : -a; }
      case 'pct': { var b = toNum(evalNode(node.a, ctx)); return isErr(b) ? b : b / 100; }
      case 'bin': {
        var op = node.op;
        var x = evalNode(node.a, ctx); if (isErr(x)) return x;
        var y = evalNode(node.b, ctx); if (isErr(y)) return y;
        if (op === '&') { var sx = toStr(x), sy = toStr(y); return isErr(sx) ? sx : isErr(sy) ? sy : sx + sy; }
        if (['=', '<>', '<', '>', '<=', '>='].indexOf(op) >= 0) {
          var c = cmpVals(x, y);
          switch (op) {
            case '=': return c === 0; case '<>': return c !== 0;
            case '<': return c < 0; case '>': return c > 0;
            case '<=': return c <= 0; default: return c >= 0;
          }
        }
        var nx = toNum(x); if (isErr(nx)) return nx;
        var ny = toNum(y); if (isErr(ny)) return ny;
        switch (op) {
          case '+': return nx + ny;
          case '-': return nx - ny;
          case '*': return nx * ny;
          case '/': return ny === 0 ? ERR('#DIV/0!') : nx / ny;
          case '^': return Math.pow(nx, ny);
        }
        return ERR('#VALUE!');
      }
      case 'call': {
        var name = node.name;
        if (FUNCS[name]) return FUNCS[name](node.args, ctx, evalNode);
        if (name === 'VLOOKUP' || name === 'TRA') {
          var key = evalNode(node.args[0], ctx); if (isErr(key)) return key;
          var tname = evalNode(node.args[1], ctx); if (isErr(tname)) return tname;
          var col = node.args.length > 2 ? toNum(evalNode(node.args[2], ctx)) : 2;
          if (isErr(col)) return col;
          return lookup(ctx, String(tname), key, col);
        }
        var vals = [];
        for (var i = 0; i < node.args.length; i++) {
          var v = evalNode(node.args[i], ctx);
          if (isErr(v)) return v;
          vals.push(v);
        }
        if (SIMPLE[name]) return SIMPLE[name](vals, ctx);
        return ERR('#NAME?');
      }
    }
    return ERR('#VALUE!');
  }

  function lookup(ctx, tableName, key, colIndex) {
    var tbl = ctx.lookups && ctx.lookups[String(tableName).toLowerCase().trim()];
    if (!tbl) return ERR('#REF!');
    var k = String(key == null ? '' : key).trim().toUpperCase();
    var hit = tbl.map[k];
    if (hit === undefined) return ERR('#N/A');
    var v = hit[colIndex - 1];
    return v === undefined ? ERR('#N/A') : v;
  }

  /* ---------- Static analysis ---------- */
  function walk(node, fn) {
    if (!node) return;
    fn(node);
    if (node.a) walk(node.a, fn);
    if (node.b) walk(node.b, fn);
    if (node.args) node.args.forEach(function (x) { walk(x, fn); });
  }
  var MONTH_VARS = ['THANG', 'DINH_BIEN', 'SO_THANG', 'NGAY_CONG_CHUAN', 'NGAY_CONG_THUC_TE', 'NGAY_NGHI_LE', 'NGAY_NGHI_PHEP', 'NGAY_NGHI_KHAC'];
  function analyze(ast) {
    var fields = {}, names = {}, monthDep = false;
    walk(ast, function (n) {
      if (n.k === 'field') fields[n.v] = 1;
      if (n.k === 'name') {
        names[n.v.toUpperCase()] = 1;
        if (MONTH_VARS.indexOf(n.v.toUpperCase()) >= 0) monthDep = true;
      }
    });
    return { fields: Object.keys(fields), names: Object.keys(names), monthDependent: monthDep };
  }

  /* ---------- Public ---------- */
  function compile(src) {
    var ast = parse(src);
    var info = analyze(ast);
    return {
      ast: ast, info: info, src: src,
      eval: function (ctx) { return evalNode(ast, ctx); }
    };
  }
  function tryCompile(src) {
    try { return { ok: true, fn: compile(src) }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  function errText(v) { return isErr(v) ? v.__err : null; }

  var FUNC_LIST = Object.keys(FUNCS).concat(Object.keys(SIMPLE)).concat(['VLOOKUP']).sort();

  return {
    compile: compile, tryCompile: tryCompile, parse: parse, analyze: analyze,
    isErr: isErr, errText: errText, toNum: toNum, toStr: toStr, toBool: toBool,
    FUNC_LIST: FUNC_LIST, MONTH_VARS: MONTH_VARS
  };
})();




/* ==== 03-engine.js ==== */
/* ===========================================================
   ENGINE v2
   định biên → cột nhóm dẫn xuất → công thức theo nhóm
   → tăng lương → tờ trình → phân bổ tháng → hệ số định biên
   → Cost Code / Cost Center / Budget Code / Account Code
   =========================================================== */
var ENGINE = (function () {
  'use strict';
  var M = 12;

  /* Làm tròn lên theo bội số, hướng ra xa 0 giống ROUNDUP của Excel */
  function roundUpTo(x, step) {
    if (!isFinite(x) || !step) return x;
    var sign = x < 0 ? -1 : 1;
    return sign * Math.ceil(Math.abs(x) / step - 1e-9) * step;
  }

  function roleCol(role) {
    var c = (S.cols || []).filter(function (x) { return x.role === role; })[0];
    return c ? c.alias : '';
  }
  function monthCols() {
    return (S.cols || []).filter(function (x) { return x.role === 'month' && x.month >= 1 && x.month <= M; })
      .sort(function (a, b) { return a.month - b.month; });
  }
  function attrCols() {
    return (S.cols || []).filter(function (x) { return x.role !== 'skip' && x.role !== 'month'; });
  }
  /* Mọi tên cột dùng được trong công thức: cột định biên + cột nhóm dẫn xuất */
  function usableCols() {
    return attrCols().map(function (c) { return c.alias; })
      .concat((S.classes || []).map(function (c) { return c.name; }).filter(Boolean))
      .concat(policyCols());
  }
  function policyCols() {
    var out = [];
    (S.policies || []).forEach(function (p) {
      (p.outs || []).forEach(function (o) { if (o && o.name) out.push(o.name); });
    });
    return out;
  }

  /* Dựng sổ đăng ký công thức dùng chung.
     Trả về { reg, monthDep, errors }:
       reg      — tra theo code VÀ theo name (đều viết hoa), cùng trỏ về một định nghĩa
       monthDep — code nào phụ thuộc tháng (trực tiếp, qua raise, hay qua công thức
                  dùng chung khác). Thiếu bước lan truyền này thì công thức chi phí
                  gọi tới nó sẽ bị cache nhầm giữa các tháng.
     Tăng lương chỉ áp cho công thức dùng chung khi được LIỆT KÊ ĐÍCH DANH.
     Danh sách rỗng vẫn giữ nghĩa cũ là "mọi công thức chi phí", nếu cho nó áp luôn
     cho công thức dùng chung thì một đợt tăng sẽ bị tính hai lần. */
  function buildShared() {
    var defs = (S.shared || []).filter(function (x) { return x && nkey(x.code); });
    var reg = {}, byCode = {}, errors = [];

    defs.forEach(function (d) {
      var code = nkey(d.code);
      var c = FX.tryCompile(String(d.formula == null ? '' : d.formula).trim() || '0');
      var rec = { code: code, name: d.name || '', fn: c.ok ? c.fn : null, err: c.ok ? null : c.error, raises: [] };
      if (!c.ok) errors.push({ where: code, msg: c.error });
      byCode[code] = rec;
      reg[code] = rec;
      if (nkey(d.name)) reg[nkey(d.name)] = rec;
    });

    (S.raises || []).forEach(function (r) {
      if (r.active === false) return;
      var list = (r.formulas || []).map(nkey);
      if (!list.length) return;                       /* rỗng = chỉ áp cho công thức chi phí */
      var cf = null;
      if (r.cond && String(r.cond).trim()) { var cc = FX.tryCompile(r.cond); if (cc.ok) cf = cc.fn; }
      list.forEach(function (code) {
        if (byCode[code]) byCode[code].raises.push({ from: +r.fromMonth || 1, pct: parseFloat(r.pct) || 0, condFn: cf });
      });
    });

    /* lan truyền phụ thuộc tháng qua đồ thị tham chiếu */
    var monthDep = {}, seen = {};
    function dep(code) {
      if (Object.prototype.hasOwnProperty.call(monthDep, code)) return monthDep[code];
      var rec = byCode[code];
      if (!rec || !rec.fn) return (monthDep[code] = false);
      if (seen[code]) return false;                   /* vòng tròn: chặn đệ quy vô hạn */
      seen[code] = 1;
      var d = rec.fn.info.monthDependent || rec.raises.length > 0;
      if (!d) {
        var refs = rec.fn.info.names.concat(rec.fn.info.fields.map(nkey));
        for (var i = 0; i < refs.length && !d; i++) {
          var target = reg[nkey(refs[i])];
          if (target && target.code !== code) d = dep(target.code);
        }
      }
      delete seen[code];
      return (monthDep[code] = d);
    }
    Object.keys(byCode).forEach(dep);
    return { reg: reg, monthDep: monthDep, errors: errors };
  }

  /* Công thức có phụ thuộc tháng không — tính cả qua công thức dùng chung nó gọi. */
  function fnMonthDep(fn, sh) {
    if (!fn) return false;
    if (fn.info.monthDependent) return true;
    if (!sh) return false;
    var refs = fn.info.names.concat(fn.info.fields.map(nkey));
    for (var i = 0; i < refs.length; i++) {
      var rec = sh.reg[nkey(refs[i])];
      if (rec && sh.monthDep[rec.code]) return true;
    }
    return false;
  }

  /* % trích theo phân loại — tra theo Formula Code, giá trị cột phân loại, và tháng.
     Trả về HỆ SỐ (1 = 100%). Không khai, khai thiếu tháng, hay ô để trống đều ra 1,
     nên thêm tính năng này mà chưa khai gì thì kết quả không đổi một đồng. */
  function buildAccruals() {
    var by = {};
    (S.accruals || []).forEach(function (a) {
      if (!a || !nkey(a.code) || !a.col) return;
      var map = {};
      (a.rows || []).forEach(function (r) { if (r) map[nkey(r.key)] = r.m || []; });
      by[nkey(a.code)] = { col: a.col, map: map };
    });
    return by;
  }
  function accrualFactor(acc, code, row, m) {
    var a = acc && acc[nkey(code)];
    if (!a) return 1;
    var arr = a.map[nkey(row[a.col])];
    if (!arr) return 1;
    var raw = arr[m - 1];
    if (raw === '' || raw === null || raw === undefined) return 1;
    var n = numOf(raw);
    return isNaN(n) ? 1 : n / 100;
  }

  function buildParams() {
    var p = {};
    (S.params || []).forEach(function (x) {
      if (!x.name) return;
      var n = typeof x.value === 'number' ? x.value : parseFloat(String(x.value).replace(/[,\s]/g, ''));
      p[nkey(x.name)] = (isNaN(n) || String(x.value).trim() === '') ? x.value : n;
    });
    return p;
  }

  /* ---- Dựng dòng làm việc: giá trị theo alias + __m ---- */
  function buildRows() {
    var acols = attrCols(), mcols = monthCols();
    var hasMonths = mcols.length === M;
    return (S.hc.rows || []).map(function (raw) {
      var o = {};
      acols.forEach(function (c) { o[c.alias] = c.type === 'num' ? numOf(raw[c.src]) : raw[c.src]; });
      var m = new Array(M).fill(1);
      if (hasMonths) mcols.forEach(function (c, k) { m[k] = numOf(raw[c.src]); });
      o.__m = m;
      return o;
    });
  }

  /* ---- Áp bảng phân loại theo thứ tự ---- */
  function applyClasses(rows, warn) {
    (S.classes || []).forEach(function (cl) {
      if (!cl.name) return;
      var keys = cl.keys || [];
      var idx = {};
      (cl.rows || []).forEach(function (r) {
        var k = keys.map(function (_, j) { return nkey(r[j]); }).join('\u0001');
        if (idx[k] === undefined) idx[k] = r[keys.length];
      });
      var hasStar = (cl.rows || []).some(function (r) { return keys.some(function (_, j) { return String(r[j]).trim() === '*'; }); });
      var miss = 0;
      rows.forEach(function (row) {
        var vals = keys.map(function (kc) { return nkey(row[kc]); });
        var v = idx[vals.join('\u0001')];
        if (v === undefined && hasStar) {
          // thử thay dần từng khoá bằng *
          for (var b = 1; b < (1 << keys.length) && v === undefined; b++) {
            var probe = vals.map(function (x, j) { return (b >> j) & 1 ? '*' : x; });
            v = idx[probe.join('\u0001')];
          }
        }
        if (v === undefined) { v = cl.def || ''; miss++; }
        row[cl.name] = (cl.type === 'num') ? numOf(v) : (v == null ? '' : String(v));
      });
      if (miss && warn) warn.push({ type: 'class', msg: t('engine.warn.class.miss', { name: cl.name, n: miss, def: cl.def || t('engine.value.empty') }) });
    });
    return rows;
  }

  /* Bảng chính sách: cùng cơ chế khoá như phân loại nhóm, nhưng sinh ra
     nhiều cột giá trị (mức lương, mức phụ cấp, hệ số thưởng…) một lúc. */
  function applyPolicies(rows, warn) {
    (S.policies || []).forEach(function (po) {
      var keys = po.keys || [], outs = (po.outs || []).filter(function (o) { return o && o.name; });
      if (!outs.length) return;
      var idx = {};
      (po.rows || []).forEach(function (r) {
        var k = keys.map(function (_, j) { return nkey(r[j]); }).join('\u0001');
        if (idx[k] === undefined) idx[k] = r;
      });
      var hasStar = (po.rows || []).some(function (r) { return keys.some(function (_, j) { return String(r[j]).trim() === '*'; }); });
      var miss = 0;
      rows.forEach(function (row) {
        var vals = keys.map(function (kc) { return nkey(row[kc]); });
        var rec = idx[vals.join('\u0001')];
        if (rec === undefined && hasStar) {
          for (var b = 1; b < (1 << keys.length) && rec === undefined; b++) {
            var probe = vals.map(function (x, j) { return (b >> j) & 1 ? '*' : x; });
            rec = idx[probe.join('\u0001')];
          }
        }
        if (rec === undefined) miss++;
        outs.forEach(function (o, oi) {
          var v = rec ? rec[keys.length + oi] : ((po.def || [])[oi]);
          if (v === undefined || v === null || v === '') v = (po.def || [])[oi];
          row[o.name] = (o.type === 'text') ? (v == null ? '' : String(v)) : numOf(v);
        });
      });
      if (miss && warn) warn.push({ type: 'policy', msg: t('engine.warn.policy.miss', { name: po.name || '', n: miss }) });
    });
    return rows;
  }

  /* ---- Lịch ngày công theo nhóm ---- */
  function buildCalendar() {
    var cal = S.calendar || { groupCol: '', tables: [] };
    var byScope = {}, def = null;
    (cal.tables || []).forEach(function (t) {
      if (nkey(t.scope) === '*' || t.scope === '') def = t; else byScope[nkey(t.scope)] = t;
    });
    if (!def && cal.tables && cal.tables.length) def = cal.tables[0];
    return {
      groupCol: cal.groupCol || '',
      pick: function (row) {
        if (cal.groupCol) { var t = byScope[nkey(row[cal.groupCol])]; if (t) return t; }
        return def;
      }
    };
  }
  function calVars(tbl, m) {
    var o = {};
    var src = tbl && tbl.m && tbl.m[m - 1] ? tbl.m[m - 1] : {};
    CAL_FIELDS.forEach(function (f) { o[f.varName] = numOf(src[f.k]); });
    return o;
  }

  function compileRules(rules, where, errs) {
    return (rules || []).map(function (r) {
      var out = { name: r.name, condFn: null, valFn: null, err: null };
      if (r.cond && String(r.cond).trim()) {
        var c = FX.tryCompile(r.cond);
        if (c.ok) out.condFn = c.fn; else out.err = t('engine.err.cond', { e: c.error });
      }
      var f = FX.tryCompile(r.formula || '0');
      if (f.ok) out.valFn = f.fn; else out.err = (out.err ? out.err + ' · ' : '') + t('engine.err.formula', { e: f.error });
      if (out.err && errs) errs.push({ where: where + ' › ' + (r.name || t('engine.rule.unnamed')), msg: out.err });
      return out;
    });
  }

  /* ---- Bốn tầng phân loại chi phí ---- */
  function buildMaps() {
    var mp = S.maps || {};
    var cc = {}, cen = {}, bud = {}, acc = {};
    (mp.costCode || []).forEach(function (x) { cc[nkey(x.formulaCode)] = x; });
    (mp.costCenter || []).forEach(function (x) { cen[nkey(x.unit)] = x; });
    (mp.budgetCode || []).forEach(function (x) { bud[nkey(x.costCenter) + '|' + nkey(x.costCode) + '|' + nkey(x.unit)] = x; });
    (mp.accountCode || []).forEach(function (x) { acc[nkey(x.costCode) + '|' + nkey(x.costCenter) + '|' + nkey(x.budgetCode)] = x; });
    return { cc: cc, cen: cen, bud: bud, acc: acc };
  }

  /* ---------- CHẠY ---------- */
  function run() {
    var t0 = Date.now();
    var warnings = [], formulaErrors = [];
    var rows = applyPolicies(applyClasses(buildRows(), warnings), warnings);
    var nR = rows.length;
    var params = buildParams();
    var sh = buildShared();
    var acc = buildAccruals();
    sh.errors.forEach(function (e) {
      formulaErrors.push({ where: t('engine.where.shared', { code: e.where }), msg: e.msg });
    });
    var fieldIndex = {};
    usableCols().forEach(function (c) { fieldIndex[String(c).toLowerCase().trim()] = c; });
    var cal = buildCalendar();
    var maps = buildMaps();
    var idCol = roleCol('key'), posCol = roleCol('position'), unitCol = roleCol('unit');
    var fcs = (S.formulas || []).filter(function (f) { return f.active !== false; });
    var nF = fcs.length;

    if (monthCols().length !== M) warnings.push({ type: 'month', msg: t('engine.warn.month') });
    if (!unitCol) warnings.push({ type: 'role', msg: t('engine.warn.unitcol') });
    if (!idCol) warnings.push({ type: 'role', msg: t('engine.warn.keycol') });

    /* tăng lương */
    var raises = (S.raises || []).filter(function (r) { return r.active !== false; }).map(function (r) {
      var condFn = null;
      if (r.cond && String(r.cond).trim()) {
        var c = FX.tryCompile(r.cond);
        if (c.ok) condFn = c.fn; else formulaErrors.push({ where: t('engine.where.raise', { name: r.name || '' }), msg: c.error });
      }
      return { from: +r.fromMonth || 1, pct: parseFloat(r.pct) || 0, condFn: condFn, codes: (r.formulas || []).map(nkey) };
    });

    /* tờ trình theo Formula Code */
    var excByFc = {};
    (S.exceptions || []).filter(function (e) { return e.active !== false; }).forEach(function (e) {
      (excByFc[nkey(e.formulaCode)] = excByFc[nkey(e.formulaCode)] || []).push(e);
    });

    /* ngữ cảnh từng dòng */
    var ctxRow = rows.map(function (r) {
      var unitV = unitCol ? r[unitCol] : '';
      var cen = maps.cen[nkey(unitV)];
      return {
        row: r, id: idCol ? nkey(r[idCol]) : '', pos: posCol ? nkey(r[posCol]) : '',
        unit: unitV, cen: cen ? cen.costCenter : '', cal: cal.pick(r), m: r.__m
      };
    });
    if (unitCol) {
      var missU = {};
      ctxRow.forEach(function (c) { if (!c.cen && nkey(c.unit)) missU[c.unit] = 1; });
      Object.keys(missU).slice(0, 30).forEach(function (u) { warnings.push({ type: 'cen', msg: t('engine.warn.cen.unmapped', { u: u }) }); });
    }

    var data = [], groupOf = [], conflicts = [], totalsByFc = new Array(nF).fill(0), monthTotals = new Array(M).fill(0);
    var pivot = {}, missBC = {}, missAC = {}, missCC = {};

    for (var c = 0; c < nF; c++) {
      var fc = fcs[c];
      var rules = compileRules(fc.rules, fc.code, formulaErrors);
      var msel = new Array(M + 1).fill(false), nSel = 0;
      (fc.months || []).forEach(function (m) { m = +m; if (m >= 1 && m <= M && !msel[m]) { msel[m] = true; nSel++; } });
      var alloc = (fc.mode === 'spread') ? (nSel ? 1 / nSel : 0) : 1;
      var arr = new Float64Array(nR * M), gs = new Array(nR);

      var exList = excByFc[nkey(fc.code)] || [];
      var exById = {}, exByPos = {};
      exList.forEach(function (e) {
        if (nkey(e.id)) (exById[nkey(e.id)] = exById[nkey(e.id)] || []).push(e);
        else if (nkey(e.position)) (exByPos[nkey(e.position)] = exByPos[nkey(e.position)] || []).push(e);
      });
      var myRaises = raises.filter(function (rz) { return !rz.codes.length || rz.codes.indexOf(nkey(fc.code)) >= 0; });

      var ccRec = maps.cc[nkey(fc.code)];
      var costCode = ccRec ? ccRec.costCode : '';
      if (!costCode) missCC[fc.code] = 1;

      for (var i = 0; i < nR; i++) {
        var rc = ctxRow[i];
        var ctx = { row: rc.row, fieldIndex: fieldIndex, params: params, lookups: {}, shared: sh.reg, vars: { THANG: 0, DINH_BIEN: 0, SO_THANG: nSel } };
        var chosen = null;
        for (var g = 0; g < rules.length; g++) {
          var ru = rules[g]; if (ru.err) continue;
          if (!ru.condFn) { chosen = ru; break; }
          var okv = ru.condFn.eval(ctx);
          if (!FX.isErr(okv) && FX.toBool(okv) === true) { chosen = ru; break; }
        }
        gs[i] = chosen ? (chosen.name || t('engine.group.unnamed')) : null;
        if (!chosen || !chosen.valFn) continue;

        var monthDep = fnMonthDep(chosen.valFn, sh);
        var cache = null;
        var exs = (exById[rc.id] || []).concat(exByPos[rc.pos] || []);

        for (var m = 1; m <= M; m++) {
          if (!msel[m]) continue;
          var hcf = rc.m[m - 1]; if (!hcf) continue;
          ctx.vars = Object.assign({ THANG: m, DINH_BIEN: hcf, SO_THANG: nSel }, calVars(rc.cal, m));
          var base;
          if (monthDep) base = chosen.valFn.eval(ctx);
          else { if (cache === null) cache = chosen.valFn.eval(ctx); base = cache; }
          if (FX.isErr(base)) {
            if (formulaErrors.length < 200) formulaErrors.push({ where: t('engine.where.row', { code: fc.code, name: chosen.name || '', i: i + 1 }), msg: t('engine.err.code', { e: base.__err }) });
            continue;
          }
          base = FX.toNum(base); if (FX.isErr(base)) continue;

          var f = 1;
          for (var k = 0; k < myRaises.length; k++) {
            var rz = myRaises[k];
            if (m < rz.from) continue;
            if (rz.condFn) { var cv = rz.condFn.eval(ctx); if (FX.isErr(cv) || FX.toBool(cv) !== true) continue; }
            f *= (1 + rz.pct / 100);
          }
          /* Sau khi áp tăng lương thì làm tròn lên hàng nghìn */
          var val = (f === 1) ? base : roundUpTo(base * f, 1000);

          for (var k2 = 0; k2 < exs.length; k2++) {
            var e = exs[k2];
            if (e.months && e.months.length && e.months.indexOf(m) < 0) continue;
            var amt = numOf(e.amount), rule = (e.rule || 'MAX').toUpperCase(), before = val;
            if (rule === 'OVERRIDE') val = amt;
            else if (rule === 'ADD') val = val + amt;
            else val = Math.max(val, amt);
            if (conflicts.length < 20000) {
              conflicts.push({
                no: e.no || '', id: idCol ? rc.row[idCol] : '', position: posCol ? rc.row[posCol] : '', unit: rc.unit,
                formulaCode: fc.code, costCode: costCode, month: m,
                formula: Math.round(before), exception: Math.round(amt), rule: rule, final: Math.round(val),
                diff: Math.abs(before - amt) > 0.5, won: Math.abs(val - amt) < 0.5 && Math.abs(before - amt) > 0.5
              });
            }
          }

          var amount = Math.round(val * alloc * hcf * accrualFactor(acc, fc.code, rc.row, m));
          if (!isFinite(amount) || !amount) continue;
          arr[i * M + (m - 1)] = amount;
          totalsByFc[c] += amount; monthTotals[m - 1] += amount;

          var cen = rc.cen;
          var bRec = maps.bud[nkey(cen) + '|' + nkey(costCode) + '|' + nkey(rc.unit)];
          var budgetCode = bRec ? bRec.budgetCode : '';
          if (!budgetCode && costCode) missBC[[cen || t('engine.map.none'), costCode, rc.unit].join(' × ')] = 1;
          var aRec = maps.acc[nkey(costCode) + '|' + nkey(cen) + '|' + nkey(budgetCode)];
          var accountCode = aRec ? aRec.accountCode : '';
          if (!accountCode && budgetCode) missAC[[costCode, cen, budgetCode].join(' × ')] = 1;

          var pk = [accountCode, budgetCode, costCode, cen, fc.code].join('|');
          var pv = pivot[pk];
          if (!pv) pv = pivot[pk] = {
            accountCode: accountCode || t('engine.map.undeclared'), budgetCode: budgetCode || t('engine.map.undeclared'),
            costCode: costCode || t('engine.map.undeclared'), costCenter: cen || t('engine.map.none'),
            formulaCode: fc.code, formulaName: fc.name || '',
            m: new Array(M).fill(0), total: 0
          };
          pv.m[m - 1] += amount; pv.total += amount;
        }
      }
      data.push(arr); groupOf.push(gs);

      var noGroup = 0;
      for (var q = 0; q < nR; q++) if (gs[q] === null) noGroup++;
      if (noGroup) warnings.push({ type: 'nogroup', msg: t('engine.warn.nogroup', { code: fc.code, n: noGroup }) });
    }

    Object.keys(missCC).slice(0, 30).forEach(function (k) { warnings.push({ type: 'map', msg: t('engine.warn.cc.unmapped', { k: k }) }); });
    Object.keys(missBC).slice(0, 30).forEach(function (k) { warnings.push({ type: 'map', msg: t('engine.warn.bc.missing', { k: k }) }); });
    Object.keys(missAC).slice(0, 30).forEach(function (k) { warnings.push({ type: 'map', msg: t('engine.warn.ac.missing', { k: k }) }); });

    var seen = {}; warnings = warnings.filter(function (w) { var k = w.type + w.msg; if (seen[k]) return false; seen[k] = 1; return true; });
    var grand = 0; totalsByFc.forEach(function (x) { grand += x; });

    return {
      formulas: fcs, rows: rows, data: data, groupOf: groupOf,
      totalsByFc: totalsByFc, monthTotals: monthTotals, grand: grand,
      pivot: Object.keys(pivot).map(function (k) { return pivot[k]; }).sort(function (a, b) {
        return (a.accountCode + a.budgetCode + a.costCode) < (b.accountCode + b.budgetCode + b.costCode) ? -1 : 1;
      }),
      conflicts: conflicts, warnings: warnings, formulaErrors: formulaErrors,
      idCol: idCol, posCol: posCol, unitCol: unitCol, ms: Date.now() - t0
    };
  }

  /* ---------- Tiện ích cho UI ---------- */
  var cacheRows = null, cacheKey = '';
  function previewRows() {
    var key = JSON.stringify([S.cols, S.classes]).length + '|' + (S.hc.rows || []).length + '|' + (S.classes || []).length;
    if (cacheRows && cacheKey === key) return cacheRows;
    cacheKey = key; cacheRows = applyPolicies(applyClasses(buildRows(), null), null);
    return cacheRows;
  }
  function invalidate() { cacheRows = null; }

  function ctxFor(row, month, nSel) {
    var fieldIndex = {};
    usableCols().forEach(function (c) { fieldIndex[String(c).toLowerCase().trim()] = c; });
    var cal = buildCalendar();
    return {
      row: row, fieldIndex: fieldIndex, params: buildParams(), lookups: {}, shared: buildShared().reg,
      vars: Object.assign({ THANG: month || 1, DINH_BIEN: (row.__m || [])[(month || 1) - 1] || 0, SO_THANG: nSel || 12 },
        calVars(cal.pick(row), month || 1))
    };
  }

  function countMatch(cond) {
    var rows = previewRows();
    if (!cond || !String(cond).trim()) return { n: rows.length, all: true };
    var c = FX.tryCompile(cond);
    if (!c.ok) return { error: c.error };
    var ctx = ctxFor(rows[0] || {}, 1, 12), n = 0;
    for (var i = 0; i < rows.length; i++) {
      ctx.row = rows[i];
      var v = c.fn.eval(ctx);
      if (!FX.isErr(v) && FX.toBool(v) === true) n++;
    }
    return { n: n };
  }

  /* Thử một dòng cho cả 12 tháng, có cả tăng lương và tờ trình */
  function previewRow(fc, rowIdx) {
    var rows = previewRows();
    var row = rows[rowIdx];
    if (!row) return { error: t('engine.err.norows') };

    var msel = new Array(M + 1).fill(false), nSel = 0;
    (fc.months || []).forEach(function (m) { m = +m; if (m >= 1 && m <= M && !msel[m]) { msel[m] = true; nSel++; } });
    var alloc = (fc.mode === 'spread') ? (nSel ? 1 / nSel : 0) : 1;

    var rules = compileRules(fc.rules, fc.code, null);
    var ctx = ctxFor(row, 1, nSel);
    var chosen = null;
    for (var g = 0; g < rules.length; g++) {
      var ru = rules[g];
      if (ru.err) return { error: ru.err, group: ru.name, row: row };
      if (!ru.condFn) { chosen = ru; break; }
      var okv = ru.condFn.eval(ctx);
      if (!FX.isErr(okv) && FX.toBool(okv) === true) { chosen = ru; break; }
    }
    if (!chosen) return { group: null, row: row, months: [], total: 0 };

    var idCol = roleCol('key'), posCol = roleCol('position');
    var myRaises = (S.raises || []).filter(function (r) {
      return r.active !== false && (!(r.formulas || []).length || (r.formulas || []).map(nkey).indexOf(nkey(fc.code)) >= 0);
    }).map(function (r) {
      var cf = null;
      if (r.cond && String(r.cond).trim()) { var c = FX.tryCompile(r.cond); if (c.ok) cf = c.fn; }
      return { from: +r.fromMonth || 1, pct: parseFloat(r.pct) || 0, condFn: cf, name: r.name };
    });
    var exs = (S.exceptions || []).filter(function (e) {
      if (e.active === false || nkey(e.formulaCode) !== nkey(fc.code)) return false;
      if (nkey(e.id)) return idCol && nkey(row[idCol]) === nkey(e.id);
      if (nkey(e.position)) return posCol && nkey(row[posCol]) === nkey(e.position);
      return false;
    });

    var cal = buildCalendar();
    var accP = buildAccruals();
    var hasAccrual = !!accP[nkey(fc.code)];
    var out = [], total = 0, err = null;
    for (var m = 1; m <= M; m++) {
      var hcf = (row.__m || [])[m - 1] || 0;
      var rec = { m: m, on: msel[m], hcf: hcf, raw: 0, raised: 0, afterExc: 0, amount: 0, exc: false };
      if (!msel[m]) { out.push(rec); continue; }
      ctx.vars = Object.assign({ THANG: m, DINH_BIEN: hcf, SO_THANG: nSel }, calVars(cal.pick(row), m));
      var v = chosen.valFn.eval(ctx);
      if (FX.isErr(v)) { err = t('engine.err.code.at', { e: v.__err, m: MONTHS[m - 1] }); out.push(rec); continue; }
      rec.raw = FX.toNum(v);
      var f = 1;
      myRaises.forEach(function (rz) {
        if (m < rz.from) return;
        if (rz.condFn) { var cv = rz.condFn.eval(ctx); if (FX.isErr(cv) || FX.toBool(cv) !== true) return; }
        f *= (1 + rz.pct / 100);
      });
      rec.raised = (f === 1) ? rec.raw : roundUpTo(rec.raw * f, 1000);
      var val = rec.raised;
      exs.forEach(function (e) {
        if (e.months && e.months.length && e.months.indexOf(m) < 0) return;
        var amt = numOf(e.amount), rule = (e.rule || 'MAX').toUpperCase();
        if (rule === 'OVERRIDE') val = amt;
        else if (rule === 'ADD') val = val + amt;
        else val = Math.max(val, amt);
        rec.exc = true;
      });
      rec.afterExc = val;
      rec.accrual = accrualFactor(accP, fc.code, row, m) * 100;
      rec.amount = Math.round(val * alloc * hcf * (rec.accrual / 100));
      total += rec.amount;
      out.push(rec);
    }
    return {
      group: chosen.name || t('engine.group.unnamed'), row: row, months: out, total: total,
      nSel: nSel, alloc: alloc, error: err,
      id: idCol ? row[idCol] : '', hasRaise: myRaises.length > 0, hasExc: exs.length > 0,
      hasAccrual: hasAccrual,
      refs: collectRefs([chosen.condFn, chosen.valFn], ctx, row, nSel, cal)
    };
  }

  /* Mọi thông tin công thức thực sự dùng tới, kèm giá trị của dòng đang thử.
     Mỗi tên được biên dịch lại thành một biểu thức con rồi eval, nên đi đúng
     cùng đường phân giải với công thức thật: cột -> tham số -> biến tháng ->
     công thức dùng chung. Nhờ vậy không có chuyện bảng đối chiếu hiển thị một
     đằng còn máy tính lại lấy một nẻo. */
  function collectRefs(fns, ctx, row, nSel, cal) {
    var order = [], seen = {};
    fns.forEach(function (f) {
      if (!f) return;
      f.info.fields.forEach(function (x) {
        var k = '[' + x + ']'; if (!seen[k]) { seen[k] = 1; order.push({ key: k, raw: x, field: true }); }
      });
      f.info.names.forEach(function (x) {
        if (!seen[x]) { seen[x] = 1; order.push({ key: x, raw: x, field: false }); }
      });
    });

    function kindOf(r) {
      var up = nkey(r.raw);
      if (!r.field) {
        if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, up)) return 'monthvar';
        if (ctx.params && Object.prototype.hasOwnProperty.call(ctx.params, up)) return 'param';
      }
      if (ctx.shared && ctx.shared[up]) return 'shared';
      return r.field ? 'field' : 'unknown';
    }

    var hcf0 = row.__m || [];
    return order.map(function (r) {
      var c = FX.tryCompile(r.key);
      var vals = [], kind = kindOf(r);
      if (!c.ok) return { key: r.key, kind: kind, error: c.error, constant: true, values: [] };
      for (var m = 1; m <= M; m++) {
        ctx.vars = Object.assign({ THANG: m, DINH_BIEN: hcf0[m - 1] || 0, SO_THANG: nSel }, calVars(cal.pick(row), m));
        var v = c.fn.eval(ctx);
        vals.push(FX.isErr(v) ? { err: v.__err } : v);
      }
      var first = JSON.stringify(vals[0]);
      var constant = vals.every(function (v) { return JSON.stringify(v) === first; });
      return { key: r.key, kind: kind, constant: constant, values: vals, value: vals[0] };
    });
  }

  function preview(fc, rowIdx, month) {
    var rows = previewRows();
    var row = rows[rowIdx];
    if (!row) return { error: t('engine.err.norows') };
    var nSel = (fc.months || []).length;
    var ctx = ctxFor(row, month, nSel);
    var rules = compileRules(fc.rules, fc.code, null);
    for (var g = 0; g < rules.length; g++) {
      var ru = rules[g];
      if (ru.err) return { error: ru.err, group: ru.name };
      var ok = true;
      if (ru.condFn) { var v = ru.condFn.eval(ctx); ok = !FX.isErr(v) && FX.toBool(v) === true; }
      if (ok) {
        var val = ru.valFn.eval(ctx);
        if (FX.isErr(val)) return { error: t('engine.err.code', { e: val.__err }), group: ru.name };
        return { group: ru.name, value: FX.toNum(val), row: row };
      }
    }
    return { group: null, value: 0, row: row };
  }

  return {
    run: run, preview: preview, policyCols: policyCols, previewRow: previewRow, countMatch: countMatch, previewRows: previewRows, invalidate: invalidate,
    usableCols: usableCols, attrCols: attrCols, monthCols: monthCols, roleCol: roleCol, M: M
  };
})();



export { FX, ENGINE };
