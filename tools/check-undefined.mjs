#!/usr/bin/env node
/* Bắt cả lớp lỗi "dùng tên chưa import / chưa khai báo" — thứ `node --check`
   không thấy vì cú pháp vẫn đúng, chỉ nổ lúc chạy.
   Đã bắt lỗi thật: đổi tên render() -> shellRender() trong app.js nhưng còn 4
   chỗ gọi tên cũ; mọi nút điều hướng đều ném ReferenceError.
   Cũng chính là thứ canh đồ thị import một chiều core <- ui <- views <- app:
   một module quên import thì lộ ra ở đây. */
import { parse } from 'acorn';
import detect from 'acorn-globals';
import fs from 'node:fs';
import { appSources, functionSources, rel } from './lib/sources.mjs';

/* Toàn cục có thật lúc chạy. XLSX/XLTABLE do public/vendor/** đặt lên window. */
const BROWSER = new Set([
  'window', 'document', 'console', 'location', 'navigator', 'fetch', 'Response', 'Request',
  'Headers', 'URL', 'URLSearchParams', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'localStorage', 'sessionStorage', 'Blob', 'File', 'FileReader', 'Intl',
  'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error',
  'TypeError', 'RangeError', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol',
  'Uint8Array', 'Int32Array', 'Float64Array', 'DataView', 'ArrayBuffer', 'isNaN', 'isFinite',
  'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'unescape', 'escape',
  'atob', 'btoa', 'crypto', 'TextEncoder', 'TextDecoder', 'structuredClone', 'queueMicrotask',
  'globalThis', 'undefined', 'NaN', 'Infinity', 'requestAnimationFrame', 'alert', 'confirm',
  'prompt', 'getComputedStyle', 'MutationObserver', 'ResizeObserver', 'CustomEvent', 'Event',
]);

export function check(files) {
  const bad = [];
  for (const p of files) {
    const ast = parse(fs.readFileSync(p, 'utf8'), {
      ecmaVersion: 2022, sourceType: 'module', locations: true,
    });
    const imported = new Set();
    for (const n of ast.body) {
      if (n.type === 'ImportDeclaration') for (const s of n.specifiers) imported.add(s.local.name);
    }
    for (const g of detect(ast)) {
      if (BROWSER.has(g.name) || imported.has(g.name)) continue;
      bad.push({ file: rel(p), name: g.name, line: g.nodes[0]?.loc?.start.line });
    }
  }
  return bad;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = [...appSources(), ...functionSources()];
  const bad = check(files);
  for (const b of bad) console.log(`   ✗ ${b.file}:${b.line}  '${b.name}' — không khai báo, không import`);
  console.log(bad.length
    ? `\n${bad.length} tên chưa phân giải trên ${files.length} file`
    : `\n${files.length} file, mọi định danh đều có nguồn.`);
  process.exit(bad.length ? 1 : 0);
}
