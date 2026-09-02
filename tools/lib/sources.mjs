/* Nguồn duy nhất cho biết "mã nguồn của dự án gồm những file nào".
   Ba script kiểm tra dùng chung để không script nào bỏ sót file mới. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/* public/vendor/** là SheetJS + XLTABLE giữ nguyên xi — không quét, không sửa. */
const SKIP_DIRS = new Set(['vendor', 'node_modules']);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (e.name.endsWith('.js')) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/** Mã chạy trong trình duyệt: public/**\/*.js trừ vendor. */
export function appSources() {
  return walk(path.join(ROOT, 'public'), []).sort();
}

/** Mã chạy trên Cloudflare Pages Functions. */
export function functionSources() {
  return walk(path.join(ROOT, 'functions'), []).sort();
}

export const rel = (p) => path.relative(ROOT, p);
