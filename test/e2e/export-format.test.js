/* File ngân sách xuất ra phải VỪA đúng số VỪA dễ nhìn.
   Bộ ghi tự viết thay cho SheetJS ở đường này, nên phải chứng minh cả hai:
   file mở được bằng thư viện khác, và có đủ định dạng mà bản cộng đồng của
   SheetJS không ghi nổi (tô đậm, tô nền, đóng băng dòng). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { collectErrors, exportWorkbook, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';

let server, browser, ctx, page, errs, tmp, file, parts;

/* Bộ giải nén tối giản, đọc từ Central Directory — .xlsx là một tệp ZIP. */
function unzip(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  const n = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map();
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + cmtLen;
    const dOff = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(dOff, dOff + compSize);
    out.set(name, (method === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf8'));
  }
  return out;
}

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
  ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  page = await loginToApp(ctx, server.base);
  errs = collectErrors(page);
  await importHeadcount(page);
  await inPage(page, 'return (await import("/src/views/result.js")).runBudget().then(() => true);');
  await page.waitForTimeout(1500);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-'));
  /* exportWorkbook trả về NỘI DUNG file, không phải đường dẫn. */
  file = await exportWorkbook(page, tmp);
  parts = unzip(file);
}, 120000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
});

describe('file mở được', () => {
  it('đúng cấu trúc một .xlsx: có workbook, styles và đủ sheet', () => {
    expect(parts.has('[Content_Types].xml')).toBe(true);
    expect(parts.has('xl/workbook.xml')).toBe(true);
    expect(parts.has('xl/styles.xml')).toBe(true);
    expect(parts.has('xl/worksheets/sheet1.xml')).toBe(true);
    const names = [...parts.get('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]*)"/g)].map((m) => m[1]);
    expect(names).toContain('NganSach_TheoNguoi');
    expect(names).toContain('BanKhaiBao');
  });

  it('SheetJS đọc lại được — đây là thư viện độc lập với bộ ghi', async () => {
    /* Đọc bằng chính SheetJS trong trang: nếu file hỏng thì nó ném ngay. */
    const b64 = file.toString('base64');
    const r = await page.evaluate((data) => {
      const bin = atob(data);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      /* cellStyles để nó chịu đọc cả phần định dạng, không chỉ giá trị. */
      const wb = window.XLSX.read(arr, { type: 'array', cellStyles: true });
      const ws = wb.Sheets.TongHop_FormulaCode;
      const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
      return { sheets: wb.SheetNames, a1: ws.A1 && ws.A1.v, nRow: aoa.length, last: aoa[aoa.length - 1][0] };
    }, b64);
    expect(r.sheets).toContain('TongHop_FormulaCode');
    expect(r.a1).toBe('FormulaCode');
    /* Đọc ra đủ dòng, và dòng cuối đúng là dòng tổng. */
    expect(r.nRow).toBeGreaterThan(2);
    expect(r.last).toBe('TỔNG');
  });
});

describe('định dạng — thứ bản cộng đồng của SheetJS không ghi được', () => {
  const s1 = () => parts.get('xl/worksheets/sheet1.xml');

  it('đóng băng dòng tiêu đề', () => {
    expect(s1()).toContain('<pane ySplit="1"');
    expect(s1()).toContain('state="frozen"');
  });

  it('có độ rộng cột đặt tay, không để mặc định', () => {
    expect(s1()).toMatch(/<col min="1" max="1" width="[\d.]+" customWidth="1"\/>/);
  });

  it('dòng tiêu đề dùng kiểu riêng (đậm, nền, gạch chân)', () => {
    /* Ô A1 phải trỏ tới kiểu tiêu đề, không phải kiểu thường. */
    expect(s1()).toMatch(/<c r="A1" s="4"/);
    const st = parts.get('xl/styles.xml');
    expect(st).toContain('<b/>');
    expect(st).toContain('patternType="solid"');
    expect(st).toContain('<bottom style="thin">');
  });

  it('có lọc tự động trên dòng tiêu đề', () => {
    expect(s1()).toMatch(/<autoFilter ref="A1:[A-Z]+\d+"\/>/);
  });

  it('cột tiền có định dạng phân cách nghìn, cột tháng là số nguyên', () => {
    const st = parts.get('xl/styles.xml');
    expect(st).toContain('formatCode="#,##0;(#,##0)"');
    /* Sheet theo người: cột "Thang" là số nguyên (kiểu 3), cột tiền là kiểu 1. */
    const sh = s1();
    const thang = /<c r="([A-Z]+)2" s="3"/.exec(sh);
    expect(thang).not.toBeNull();
    expect(sh).toMatch(/<c r="[A-Z]+2" s="1"/);
  });

  it('dòng TỔNG CỘNG in đậm', () => {
    /* Sheet TongHop_FormulaCode có dòng tổng ở cuối. */
    const idx = [...parts.get('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]*)"/g)]
      .map((m) => m[1]).indexOf('TongHop_FormulaCode');
    const sh = parts.get('xl/worksheets/sheet' + (idx + 1) + '.xml');
    const rows = [...sh.matchAll(/<row r="(\d+)"/g)].map((m) => +m[1]);
    const last = Math.max(...rows);
    /* Kiểu 5-8 là bộ ĐẬM. */
    expect(sh).toMatch(new RegExp('<c r="[A-Z]+' + last + '" s="[5-8]"'));
  });
});

describe('toàn bộ luồng', () => {
  it('không một lỗi JavaScript nào', () => {
    expect(errs, JSON.stringify(errs)).toEqual([]);
  });
});
