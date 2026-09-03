/* ===========================================================
   EXPRESSION — máy biểu thức FX, cú pháp tương đương Excel 365 (tập con)
     - Tham chiếu cột định biên:  [Dept], [Coefficient]
     - Hằng số toàn cục:          LUONG_CO_SO
     - Biến hệ thống:             THANG, DINH_BIEN, SO_THANG, TONG_THANG, THANG_BAT_DAU

   Tầng CORE thấp nhất: KHÔNG biết gì về ngân sách, định biên hay Formula Code.
   Nó nhận một biểu thức cùng một `ctx` rồi trả ra giá trị. Toàn bộ nghiệp vụ
   nằm ở engine.js — engine gọi xuống đây, không có chiều ngược lại.
   Phụ thuộc duy nhất là t(), chỉ để dịch thông báo lỗi cú pháp.

   Hình dạng của ctx (engine.js dựng ra):
     row        {}   một dòng định biên
     fieldIndex {}   tên cột viết thường -> tên cột thật, cho cú pháp [Cột]
     params     {}   hằng số toàn cục: LUONG_CO_SO, DON_GIA_AN_CA, ...
     vars       {}   biến hệ thống: THANG, DINH_BIEN, SO_THANG, ngày công (đổi theo
                     tháng) và TONG_THANG, THANG_BAT_DAU (hằng của từng dòng)
     shared     {}   công thức dùng chung đã biên dịch, tra theo tên viết hoa
     lookups    {}   bảng tra cho VLOOKUP
   =========================================================== */
import { t } from './content.js';

const FX = (function () {
  'use strict';

  const ERR = function (code) { return { __err: code }; };
  const isErr = function (v) { return v && typeof v === 'object' && v.__err; };

  /* ---------- Tokenizer ---------- */
  /* Không có toán tử ba ký tự nào — tokenizer thử OPS2 rồi tới OPS1. */
  const OPS2 = ['<=', '>=', '<>'];
  const OPS1 = ['+', '-', '*', '/', '^', '&', '=', '<', '>', '(', ')', ',', ';'];

  function isIdentStart(ch) { return /[A-Za-z_\u00C0-\u024F\u1E00-\u1EFF]/.test(ch); }
  function isIdentChar(ch) { return /[A-Za-z0-9_.\u00C0-\u024F\u1E00-\u1EFF]/.test(ch); }

  function tokenize(src) {
    /* LƯU Ý: mảng token PHẢI KHÔNG được đặt tên `t` — trùng với hàm dịch t()
       import ở đầu tệp. Trước đây trùng thật, nên MỌI thông báo lỗi cú pháp
       trong hàm này nổ thành "t is not a function" thay vì hiện câu tiếng Việt.
       checkJs bắt được; đã có phép kiểm khoá lại. */
    /** @type {Array<{ t: string, v: any }>} */
    const toks = []; let i = 0; const n = src.length;
    while (i < n) {
      const ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
      if (ch === '"') {
        let j = i + 1, buf = '';
        while (j < n) {
          if (src[j] === '"') {
            if (src[j + 1] === '"') { buf += '"'; j += 2; continue; }
            break;
          }
          buf += src[j]; j++;
        }
        if (j >= n) throw new Error(t('fx.err.string.unclosed'));
        toks.push({ t: 'str', v: buf }); i = j + 1; continue;
      }
      if (ch === '[') {
        const k = src.indexOf(']', i + 1);
        if (k < 0) throw new Error(t('fx.err.bracket.unclosed'));
        let nm = src.slice(i + 1, k).trim();
        if (nm[0] === '@') nm = nm.slice(1).trim();
        toks.push({ t: 'field', v: nm }); i = k + 1; continue;
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        const m = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(src.slice(i));
        /* Ngay sau con số mà còn ký tự tên thì cả cụm là TÊN, không phải số:
           ô nhập tên tham số và mã công thức dùng chung đều lọc [^A-Z0-9_], tức
           app CHO PHÉP đặt 13TH_LUONG. Không có nhánh này thì nó tách thành số
           13 rồi tên TH_LUONG, và người dùng nhận "Thừa ký tự sau biểu thức".
           2e3 khớp trọn quy tắc số nên không rơi vào đây; 100% cũng không, vì %
           không phải ký tự tên. */
        if (isIdentChar(src[i + m[0].length] || '')) {
          let j3 = i;
          while (j3 < n && isIdentChar(src[j3])) j3++;
          toks.push({ t: 'id', v: src.slice(i, j3) }); i = j3; continue;
        }
        toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if (isIdentStart(ch)) {
        let j2 = i;
        while (j2 < n && isIdentChar(src[j2])) j2++;
        toks.push({ t: 'id', v: src.slice(i, j2) }); i = j2; continue;
      }
      if (ch === '%') { toks.push({ t: 'op', v: '%' }); i++; continue; }
      const two = src.substr(i, 2);
      if (OPS2.indexOf(two) >= 0) { toks.push({ t: 'op', v: two }); i += 2; continue; }
      if (OPS1.indexOf(ch) >= 0) { toks.push({ t: 'op', v: ch }); i++; continue; }
      throw new Error(t('fx.err.badchar', { ch }));
    }
    toks.push({ t: 'eof', v: null });
    return toks;
  }

  /* ---------- Parser (recursive descent, Excel precedence) ---------- */
  function parse(src) {
    let s = String(src == null ? '' : src).trim();
    if (s[0] === '=') s = s.slice(1);
    if (!s) return { k: 'num', v: 0 };
    const toks = tokenize(s); let p = 0;

    function peek() { return toks[p]; }
    function eat(v) {
      const tk = toks[p];
      if (tk.t === 'op' && tk.v === v) { p++; return true; }
      return false;
    }
    function expect(v) { if (!eat(v)) throw new Error(t('fx.err.expected', { tok: v })); }

    function parseCompare() {
      let left = parseConcat();
      while (peek().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].indexOf(peek().v) >= 0) {
        const op = toks[p++].v;
        left = { k: 'bin', op, a: left, b: parseConcat() };
      }
      return left;
    }
    function parseConcat() {
      let left = parseAdd();
      while (peek().t === 'op' && peek().v === '&') { p++; left = { k: 'bin', op: '&', a: left, b: parseAdd() }; }
      return left;
    }
    function parseAdd() {
      let left = parseMul();
      while (peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        const op = toks[p++].v;
        left = { k: 'bin', op, a: left, b: parseMul() };
      }
      return left;
    }
    function parseMul() {
      let left = parsePow();
      while (peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
        const op = toks[p++].v;
        left = { k: 'bin', op, a: left, b: parsePow() };
      }
      return left;
    }
    function parsePow() {
      // Excel tính luỹ thừa từ trái sang phải: 2^3^2 = 64
      let left = parseUnary();
      while (peek().t === 'op' && peek().v === '^') { p++; left = { k: 'bin', op: '^', a: left, b: parseUnary() }; }
      return left;
    }
    function parseUnary() {
      if (peek().t === 'op' && (peek().v === '-' || peek().v === '+')) {
        const op = toks[p++].v;
        const e = parseUnary();
        return op === '-' ? { k: 'neg', a: e } : e;
      }
      return parsePostfix();
    }
    function parsePostfix() {
      let e = parsePrimary();
      while (peek().t === 'op' && peek().v === '%') { p++; e = { k: 'pct', a: e }; }
      return e;
    }
    function parsePrimary() {
      const tk = peek();
      if (tk.t === 'num') { p++; return { k: 'num', v: tk.v }; }
      if (tk.t === 'str') { p++; return { k: 'str', v: tk.v }; }
      if (tk.t === 'field') { p++; return { k: 'field', v: tk.v }; }
      if (tk.t === 'id') {
        p++;
        const name = tk.v;
        if (peek().t === 'op' && peek().v === '(') {
          p++;
          const args = [];
          if (!(peek().t === 'op' && peek().v === ')')) {
            args.push(parseCompare());
            while (eat(',') || eat(';')) args.push(parseCompare());
          }
          expect(')');
          return { k: 'call', name: name.toUpperCase(), args };
        }
        const up = name.toUpperCase();
        if (up === 'TRUE') return { k: 'bool', v: true };
        if (up === 'FALSE') return { k: 'bool', v: false };
        return { k: 'name', v: name };
      }
      if (tk.t === 'op' && tk.v === '(') { p++; const e = parseCompare(); expect(')'); return e; }
      throw new Error(t('fx.err.badexpr', { pos: p + 1 }));
    }

    const ast = parseCompare();
    if (peek().t !== 'eof') throw new Error(t('fx.err.trailing'));
    return ast;
  }

  /* ---------- Coercion ---------- */
  function toNum(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : ERR('#NUM!');
    if (typeof v === 'boolean') return v ? 1 : 0;
    const s = String(v).trim().replace(/,/g, '');
    if (s === '') return 0;
    if (/%$/.test(s)) { const b = parseFloat(s); return isNaN(b) ? ERR('#VALUE!') : b / 100; }
    const x = parseFloat(s);
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
    const s = String(v).trim().toUpperCase();
    if (s === 'TRUE') return true;
    if (s === 'FALSE') return false;
    const n = toNum(v);
    return isErr(n) ? n : n !== 0;
  }
  function cmpVals(a, b) {
    const na = (typeof a === 'number'), nb = (typeof b === 'number');
    if (na && nb) return a < b ? -1 : a > b ? 1 : 0;
    if (typeof a === 'boolean' || typeof b === 'boolean') {
      const x = toBool(a) ? 1 : 0, y = toBool(b) ? 1 : 0;
      return x < y ? -1 : x > y ? 1 : 0;
    }
    const sa = String(a == null ? '' : a).toUpperCase(), sb = String(b == null ? '' : b).toUpperCase();
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  /* ---------- Built-in functions ---------- */
  function flat(args) {
    let out = [];
    args.forEach((a) => { if (Array.isArray(a)) out = out.concat(flat(a)); else out.push(a); });
    return out;
  }
  function nums(args) {
    const xs = []; let e = null;
    flat(args).forEach((a) => {
      if (e) return;
      if (isErr(a)) { e = a; return; }
      if (a === null || a === undefined || a === '') return;
      const n = toNum(a);
      if (isErr(n)) { e = n; return; }
      xs.push(n);
    });
    return e || xs;
  }
  function roundTo(x, d) {
    const f = Math.pow(10, d);
    return Math.round((x * f + (x >= 0 ? 1e-9 : -1e-9))) / f;
  }

  const FUNCS = {
    IF: function (a, ctx, ev) {
      if (a.length < 2) return ERR('#N/A');
      const c = toBool(ev(a[0], ctx));
      if (isErr(c)) return c;
      if (c) return ev(a[1], ctx);
      return a.length > 2 ? ev(a[2], ctx) : false;
    },
    IFS: function (a, ctx, ev) {
      for (let i = 0; i + 1 < a.length; i += 2) {
        const c = toBool(ev(a[i], ctx));
        if (isErr(c)) return c;
        if (c) return ev(a[i + 1], ctx);
      }
      return ERR('#N/A');
    },
    IFERROR: function (a, ctx, ev) {
      let v;
      try { v = ev(a[0], ctx); } catch { return ev(a[1], ctx); }
      return isErr(v) ? ev(a[1], ctx) : v;
    },
    SWITCH: function (a, ctx, ev) {
      const target = ev(a[0], ctx);
      if (isErr(target)) return target;
      let i = 1;
      for (; i + 1 < a.length; i += 2) {
        const k = ev(a[i], ctx);
        if (isErr(k)) return k;
        if (cmpVals(target, k) === 0) return ev(a[i + 1], ctx);
      }
      return i < a.length ? ev(a[i], ctx) : ERR('#N/A');
    },
    AND: function (a, ctx, ev) {
      for (let i = 0; i < a.length; i++) { const c = toBool(ev(a[i], ctx)); if (isErr(c)) return c; if (!c) return false; }
      return true;
    },
    OR: function (a, ctx, ev) {
      for (let i = 0; i < a.length; i++) { const c = toBool(ev(a[i], ctx)); if (isErr(c)) return c; if (c) return true; }
      return false;
    },
    NOT: function (a, ctx, ev) { const c = toBool(ev(a[0], ctx)); return isErr(c) ? c : !c; }
  };

  // Các hàm "đơn giản": nhận mảng giá trị đã evaluate
  const SIMPLE = {
    SUM: function (v) { const x = nums(v); return isErr(x) ? x : x.reduce((s, y) => { return s + y; }, 0); },
    AVERAGE: function (v) { const x = nums(v); if (isErr(x)) return x; return x.length ? x.reduce((s, y) => { return s + y; }, 0) / x.length : ERR('#DIV/0!'); },
    MIN: function (v) { const x = nums(v); if (isErr(x)) return x; return x.length ? Math.min.apply(null, x) : 0; },
    MAX: function (v) { const x = nums(v); if (isErr(x)) return x; return x.length ? Math.max.apply(null, x) : 0; },
    COUNT: function (v) { const x = nums(v); return isErr(x) ? x : x.length; },
    ROUND: function (v) { const a = toNum(v[0]), b = toNum(v.length > 1 ? v[1] : 0); if (isErr(a)) return a; if (isErr(b)) return b; return roundTo(a, b); },
    ROUNDUP: function (v) { const a = toNum(v[0]), b = toNum(v.length > 1 ? v[1] : 0); if (isErr(a)) return a; const f = Math.pow(10, b); return (a >= 0 ? Math.ceil(a * f - 1e-9) : Math.floor(a * f + 1e-9)) / f; },
    ROUNDDOWN: function (v) { const a = toNum(v[0]), b = toNum(v.length > 1 ? v[1] : 0); if (isErr(a)) return a; const f = Math.pow(10, b); return (a >= 0 ? Math.floor(a * f + 1e-9) : Math.ceil(a * f - 1e-9)) / f; },
    INT: function (v) { const a = toNum(v[0]); return isErr(a) ? a : Math.floor(a); },
    ABS: function (v) { const a = toNum(v[0]); return isErr(a) ? a : Math.abs(a); },
    MOD: function (v) { const a = toNum(v[0]), b = toNum(v[1]); if (isErr(a)) return a; if (isErr(b)) return b; if (b === 0) return ERR('#DIV/0!'); return a - b * Math.floor(a / b); },
    CEILING: function (v) { const a = toNum(v[0]), b = toNum(v.length > 1 ? v[1] : 1); if (isErr(a)) return a; if (isErr(b)) return b; if (b === 0) return 0; return Math.ceil(a / b) * b; },
    FLOOR: function (v) { const a = toNum(v[0]), b = toNum(v.length > 1 ? v[1] : 1); if (isErr(a)) return a; if (isErr(b)) return b; if (b === 0) return 0; return Math.floor(a / b) * b; },
    LEFT: function (v) { const s = toStr(v[0]); if (isErr(s)) return s; const n = v.length > 1 ? toNum(v[1]) : 1; return s.slice(0, n); },
    RIGHT: function (v) { const s = toStr(v[0]); if (isErr(s)) return s; const n = v.length > 1 ? toNum(v[1]) : 1; return n <= 0 ? '' : s.slice(-n); },
    MID: function (v) { const s = toStr(v[0]); if (isErr(s)) return s; const a = toNum(v[1]), b = toNum(v[2]); return s.substr(a - 1, b); },
    LEN: function (v) { const s = toStr(v[0]); return isErr(s) ? s : s.length; },
    TRIM: function (v) { const s = toStr(v[0]); return isErr(s) ? s : s.trim().replace(/\s+/g, ' '); },
    UPPER: function (v) { const s = toStr(v[0]); return isErr(s) ? s : s.toUpperCase(); },
    LOWER: function (v) { const s = toStr(v[0]); return isErr(s) ? s : s.toLowerCase(); },
    VALUE: function (v) { return toNum(v[0]); },
    TEXT: function (v) { const s = toStr(v[0]); return s; },
    EXACT: function (v) { return String(v[0]) === String(v[1]); },
    ISBLANK: function (v) { return v[0] === null || v[0] === undefined || v[0] === ''; },
    ISNUMBER: function (v) { return typeof v[0] === 'number'; },
    FIND: function (v) { const a = toStr(v[0]), b = toStr(v[1]); const i = b.indexOf(a); return i < 0 ? ERR('#VALUE!') : i + 1; },
    SEARCH: function (v) { const a = toStr(v[0]).toUpperCase(), b = toStr(v[1]).toUpperCase(); const i = b.indexOf(a); return i < 0 ? ERR('#VALUE!') : i + 1; }
  };

  /* ---------- Evaluator ---------- */
  function fieldValue(ctx, name) {
    const row = ctx.row || {};
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    const lk = ctx.fieldIndex && ctx.fieldIndex[String(name).toLowerCase().trim()];
    if (lk !== undefined && Object.prototype.hasOwnProperty.call(row, lk)) return row[lk];
    const sh = sharedValue(ctx, name);          /* [Lương cơ bản] cũng gọi được */
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
    const reg = ctx.shared;
    if (!reg) return undefined;
    const d = reg[String(rawKey == null ? '' : rawKey).toUpperCase().trim()];
    if (!d) return undefined;
    if (!d.fn) return ERR('#NAME?');

    const stack = ctx.__shStack || (ctx.__shStack = {});
    if (stack[d.code]) return ERR('#CIRC!');   /* tự tham chiếu vòng tròn */
    stack[d.code] = 1;
    let v;
    try { v = d.fn.eval(ctx); } finally { delete stack[d.code]; }
    if (isErr(v)) return v;

    if (d.raises && d.raises.length) {
      const m = (ctx.vars && ctx.vars.THANG) || 1; let f = 1;
      for (let i = 0; i < d.raises.length; i++) {
        const rz = d.raises[i];
        if (m < rz.from) continue;
        if (rz.condFn) { const cv = rz.condFn.eval(ctx); if (isErr(cv) || toBool(cv) !== true) continue; }
        f *= (1 + rz.pct / 100);
      }
      if (f !== 1) { const n = toNum(v); if (isErr(n)) return n; v = n * f; }
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
        const up = node.v.toUpperCase();
        if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, up)) return ctx.vars[up];
        if (ctx.params && Object.prototype.hasOwnProperty.call(ctx.params, up)) return ctx.params[up];
        const sh = sharedValue(ctx, up);
        if (sh !== undefined) return sh;
        return ERR('#NAME?');
      }
      case 'neg': { const a = toNum(evalNode(node.a, ctx)); return isErr(a) ? a : -a; }
      case 'pct': { const b = toNum(evalNode(node.a, ctx)); return isErr(b) ? b : b / 100; }
      case 'bin': {
        const op = node.op;
        const x = evalNode(node.a, ctx); if (isErr(x)) return x;
        const y = evalNode(node.b, ctx); if (isErr(y)) return y;
        if (op === '&') { const sx = toStr(x), sy = toStr(y); return isErr(sx) ? sx : isErr(sy) ? sy : sx + sy; }
        if (['=', '<>', '<', '>', '<=', '>='].indexOf(op) >= 0) {
          const c = cmpVals(x, y);
          switch (op) {
            case '=': return c === 0; case '<>': return c !== 0;
            case '<': return c < 0; case '>': return c > 0;
            case '<=': return c <= 0; default: return c >= 0;
          }
        }
        const nx = toNum(x); if (isErr(nx)) return nx;
        const ny = toNum(y); if (isErr(ny)) return ny;
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
        const name = node.name;
        if (FUNCS[name]) return FUNCS[name](node.args, ctx, evalNode);
        if (name === 'VLOOKUP' || name === 'TRA') {
          const key = evalNode(node.args[0], ctx); if (isErr(key)) return key;
          const tname = evalNode(node.args[1], ctx); if (isErr(tname)) return tname;
          const col = node.args.length > 2 ? toNum(evalNode(node.args[2], ctx)) : 2;
          if (isErr(col)) return col;
          return lookup(ctx, String(tname), key, col);
        }
        const vals = [];
        for (let i = 0; i < node.args.length; i++) {
          const v = evalNode(node.args[i], ctx);
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
    const tbl = ctx.lookups && ctx.lookups[String(tableName).toLowerCase().trim()];
    if (!tbl) return ERR('#REF!');
    const k = String(key == null ? '' : key).trim().toUpperCase();
    const hit = tbl.map[k];
    if (hit === undefined) return ERR('#N/A');
    const v = hit[colIndex - 1];
    return v === undefined ? ERR('#N/A') : v;
  }

  /* ---------- Static analysis ---------- */
  function walk(node, fn) {
    if (!node) return;
    fn(node);
    if (node.a) walk(node.a, fn);
    if (node.b) walk(node.b, fn);
    if (node.args) node.args.forEach((x) => { walk(x, fn); });
  }
  const MONTH_VARS = ['THANG', 'DINH_BIEN', 'SO_THANG', 'NGAY_CONG_CHUAN', 'NGAY_CONG_THUC_TE', 'NGAY_NGHI_LE', 'NGAY_NGHI_PHEP', 'NGAY_NGHI_KHAC'];
  function analyze(ast) {
    const fields = {}, names = {}; let monthDep = false;
    walk(ast, (n) => {
      if (n.k === 'field') fields[n.v] = 1;
      if (n.k === 'name') {
        names[n.v.toUpperCase()] = 1;
        if (MONTH_VARS.indexOf(n.v.toUpperCase()) >= 0) monthDep = true;
      }
    });
    return { fields: Object.keys(fields), names: Object.keys(names), monthDependent: monthDep };
  }

  /* ---------- Public ---------- */
  /**
   * Biên dịch một biểu thức. Ném Error nếu sai cú pháp — dùng tryCompile() khi
   * chuỗi đến từ người dùng.
   * @param {string} src
   * @returns {FxCompiled}
   */
  function compile(src) {
    const ast = parse(src);
    const info = analyze(ast);
    return {
      ast, info, src,
      eval: function (ctx) { return evalNode(ast, ctx); }
    };
  }
  /**
   * Bản không ném của compile(): lỗi cú pháp trả về dạng dữ liệu.
   * @param {string} src
   * @returns {{ ok: boolean, fn?: FxCompiled, error?: string }}
   */
  function tryCompile(src) {
    try { return { ok: true, fn: compile(src) }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  function errText(v) { return isErr(v) ? v.__err : null; }

  const FUNC_LIST = Object.keys(FUNCS).concat(Object.keys(SIMPLE)).concat(['VLOOKUP']).sort();

  return {
    compile, tryCompile, parse, analyze,
    isErr, errText, toNum, toStr, toBool,
    FUNC_LIST, MONTH_VARS
  };
})();

export { FX };
