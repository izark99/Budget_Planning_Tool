#!/usr/bin/env node
/* Dựng file định biên .xlsx mẫu bằng CHÍNH XLTABLE của dự án — không kéo thêm
   phụ thuộc nào, và bảo đảm file mẫu đúng thứ định dạng mà app đọc được.
   Chạy: node test/helpers/make-fixture.mjs test/fixtures/dinh-bien-mau.xlsx
   File sinh ra đã commit sẵn; chỉ chạy lại khi cần đổi dữ liệu mẫu. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './env.mjs';

const ctx = {
  console, Uint8Array, Int32Array, DataView, Math, String, Array, Number,
  unescape, encodeURIComponent, isFinite, parseInt,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/vendor/xltable.js'), 'utf8'), ctx);

const HEAD = ['Status', 'Dept', 'Unit', 'Position', 'Workplace Location', 'Grade', 'Coefficient',
  'Gender', 'ID', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const DEPTS = ['AC', 'SL', 'PR', 'HR'];
const UNITS = { AC: ['AC'], SL: ['SL-CT', 'SL-HN'], PR: ['PR-F1'], HR: ['HR'] };
const GRADES = ['5A.12', '4B.03', '6A.01', '3C.07'];

export function buildFixture() {
  const rows = [];
  for (let i = 0; i < 24; i++) {
    const d = DEPTS[i % DEPTS.length];
    const u = UNITS[d][i % UNITS[d].length];
    const months = [];
    const start = i % 5;                       // vài người vào giữa năm
    for (let m = 0; m < 12; m++) months.push(m < start ? 0 : (i % 7 === 3 && m === 6 ? 0.5 : 1));
    rows.push(['01. Current Headcount', d, u, d + '_' + String(100 + i), i % 3 ? 'DHG' : 'DHG-CT',
      GRADES[i % GRADES.length], Number((0.9 + (i % 11) * 0.07).toFixed(3)),
      i % 2 ? 'Male' : 'Female', 1400 + i, ...months]);
  }
  return { data: ctx.XLTABLE.build({ tableName: 'tblDinhBien', sheetName: 'DinhBien', headers: HEAD, rows }), rows, HEAD };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || path.join(ROOT, 'test/fixtures/dinh-bien-mau.xlsx');
  const { data, rows, HEAD } = buildFixture();
  fs.writeFileSync(out, Buffer.from(data));
  console.log(`đã ghi ${out} — ${rows.length} dòng × ${HEAD.length} cột, ${data.length} byte`);
}
