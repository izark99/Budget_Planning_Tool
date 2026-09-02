#!/usr/bin/env node
/* Đối chiếu MỌI khoá nội dung mà mã nguồn dùng với public/content.md.
   Đã bắt được lỗi thật: 6 khoá role.* nằm trong mảng ROLES, thiếu hẳn trong
   content.md, khiến giao diện hiện "role.attr" thay vì "Thuộc tính" trên
   production. Lỗi đó lọt vì khoá KHÔNG đi qua lời gọi t('...') tĩnh — nên
   script quét cả hai đường. */
import { parse } from 'acorn';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, appSources, rel } from './lib/sources.mjs';

/* Đọc content.md đúng như state.js đọc lúc chạy: tách ở dấu ':' ĐẦU TIÊN,
   rồi .trim() cả khoá lẫn giá trị. `raw` giữ nguyên phần sau dấu ':' của DÒNG
   GỐC (chưa trim) để soi được khoảng trắng mà trim() sẽ ăn mất. */
export function parseContent(txt) {
  const out = new Map();
  const dup = [];
  txt.split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s[0] === '#') return;
    const j = s.indexOf(':');
    if (j < 0) return;
    const k = s.slice(0, j).trim();
    if (!k) return;
    if (out.has(k)) dup.push({ key: k, line: i + 1, first: out.get(k).line });
    const g = line.indexOf(':');
    out.set(k, { value: s.slice(j + 1).trim(), line: i + 1, raw: line.slice(g + 1) });
  });
  return { keys: out, dup };
}

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => walkAst(n, visit));
  visit(node);
  for (const k in node) if (k !== 'loc' && k !== 'range') walkAst(node[k], visit);
}

export function scan(files) {
  const staticKeys = new Set();
  const dataStrings = new Set();
  const dynamic = [];
  for (const p of files) {
    const ast = parse(fs.readFileSync(p, 'utf8'), {
      ecmaVersion: 2022, sourceType: 'module', locations: true,
    });
    walkAst(ast, (n) => {
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 't') {
        const a = n.arguments[0];
        if (a && a.type === 'Literal' && typeof a.value === 'string') staticKeys.add(a.value);
        else dynamic.push(`${rel(p)}:${n.loc.start.line}`);
      }
      if (n.type === 'Literal' && typeof n.value === 'string') dataStrings.add(n.value);
    });
  }
  return { staticKeys, dataStrings, dynamic };
}

/* Khoá nằm TRONG DỮ LIỆU (ROLES, VIEWS, FX_DOCS, STAT_DEFS…) không đi qua
   t('...') tĩnh. Nhận diện bằng hình dạng khoá + tiền tố đã có trong content.md. */
const KEYLIKE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

export function check() {
  const md = fs.readFileSync(path.join(ROOT, 'public/content.md'), 'utf8');
  const { keys, dup } = parseContent(md);
  const { staticKeys, dataStrings, dynamic } = scan(appSources());

  const prefixes = new Set([...keys.keys()].map((k) => k.split('.')[0]));
  const dataKeys = new Set(
    [...dataStrings].filter((s) => KEYLIKE.test(s) && prefixes.has(s.split('.')[0])),
  );

  const used = new Set([...staticKeys, ...dataKeys]);
  const missing = [...used].filter((k) => !keys.has(k)).sort();

  /* Định dạng là `khoá: giá trị`, tức MỘT dấu cách ngăn cách. Nếu sau khi bỏ
     đúng một dấu cách đó mà vẫn còn khoảng trắng ở đầu hoặc cuối thì người viết
     đang cố ý đặt khoảng trắng vào giá trị — nhưng .trim() của state.js sẽ ăn
     mất, và chuỗi hiện ra thiếu dấu cách mà không ai báo lỗi. Đã dính 5 chỗ;
     cách sửa đúng là đưa dấu cách vào mã, giữ content.md sạch. */
  const edgeSpace = [...keys.entries()]
    .filter(([, v]) => {
      const body = v.raw.startsWith(' ') ? v.raw.slice(1) : v.raw;
      return body.trim() !== '' && body !== body.trim();
    })
    .map(([k, v]) => ({ key: k, line: v.line, raw: v.raw }));

  const unused = [...keys.keys()].filter((k) => !used.has(k)).sort();
  return { total: keys.size, missing, dup, edgeSpace, unused, dynamic, nStatic: staticKeys.size, nData: dataKeys.size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = check();
  console.log(`content.md: ${r.total} khoá · code dùng ${r.nStatic} khoá tĩnh + ${r.nData} khoá trong dữ liệu + ${r.dynamic.length} lời gọi khoá động`);
  for (const k of r.missing) console.log(`   ✗ THIẾU trong content.md: ${k}`);
  for (const d of r.dup) console.log(`   ✗ TRÙNG khoá "${d.key}" ở dòng ${d.line} (đã khai ở dòng ${d.first})`);
  for (const e of r.edgeSpace) console.log(`   ✗ dòng ${e.line} "${e.key}": giá trị có khoảng trắng đầu/cuối, sẽ bị trim() ăn mất`);
  const bad = r.missing.length + r.dup.length + r.edgeSpace.length;
  console.log(bad ? `\n${bad} vấn đề` : `\nMọi khoá đều có nguồn (${r.unused.length} khoá trong content.md chưa thấy dùng — phần lớn là khoá động fx.*/view.*)`);
  process.exit(bad ? 1 : 0);
}
