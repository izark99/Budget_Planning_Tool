/* CHECKLIST MỤC 10 — cả vòng đời qua đúng giao diện thật:
   nạp .xlsx -> chạy tính -> xuất Excel -> lưu .json -> mở lại .json.
   Kèm hai điều then chốt cho các giai đoạn tái cấu trúc sau:
     · trình duyệt và Node cho ra CÙNG một chuỗi canonical (golden của bộ kiểm
       unit thật sự đại diện cho thứ chạy trong trình duyệt);
     · file Excel xuất ra khớp golden tới từng ô, trừ ô dấu thời gian. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FIXTURE_XLSX, GOLDEN, GOLDEN_EXPORT, LAUNCH, STATE_FIXTURE } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { clickButton, collectErrors, exportWorkbook, getState, importHeadcount, inPage, loginToApp, runCalc } from '../helpers/browser.mjs';
import { canonSource, explainDiff } from '../helpers/canon.mjs';
import { diffCells, readCells } from '../helpers/xlsx-cells.mjs';

/* Ô DUY NHẤT được phép khác mỗi lần xuất: BanKhaiBao!E2 = "Xuất lúc", lấy
   new Date() ngay lúc bấm. Ô C3 ("Nguồn định biên ... lúc") trông cũng như dấu
   thời gian nhưng thật ra là S.hc.at nằm trong state.json — dữ liệu, không phải
   đồng hồ — nên nó PHẢI khớp golden. */
const TIMESTAMP_CELLS = [['BanKhaiBao', 'E2']];

const snapshot = JSON.parse(fs.readFileSync(STATE_FIXTURE, 'utf8'));
const golden = fs.readFileSync(GOLDEN, 'utf8').trim();
const goldenExport = JSON.parse(fs.readFileSync(GOLDEN_EXPORT, 'utf8'));

let server, browser, ctx, page, errs;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpt-flow-'));

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
  ctx = await browser.newContext({ acceptDownloads: true });
  page = await loginToApp(ctx, server.base);
  errs = collectErrors(page);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('[10] vòng đời đầy đủ qua giao diện', () => {
  it('[10a] nạp file định biên .xlsx đọc ra 24 dòng', async () => {
    await importHeadcount(page, FIXTURE_XLSX);
    expect(await inPage(page, 'return st.S.hc.rows.length;')).toBe(24);
  });

  it('[10b] chạy tính ra tổng dương, không lỗi công thức', async () => {
    await runCalc(page);
    const r = await inPage(page, 'return { grand: st.RESULT.grand, errs: st.RESULT.formulaErrors.length };');
    expect(r.grand).toBeGreaterThan(0);
    expect(r.errs).toBe(0);
  });

  /* Đây là mắt xích nối bộ kiểm unit với thực tế: nếu trình duyệt và Node lệch
     nhau thì golden chạy trong Node không còn chứng minh được gì về app thật. */
  it('trình duyệt cho ra chuỗi canonical y hệt Node trên cùng một state', async () => {
    const fromBrowser = await inPage(page, `
      st.setS(JSON.parse(a.state));
      fm.ENGINE.invalidate();
      st.setRESULT(null);
      return (0, eval)('(' + a.src + ')')(fm.ENGINE.run());
    `, { state: JSON.stringify(snapshot), src: canonSource });

    if (fromBrowser !== golden) throw new Error('trình duyệt lệch golden:\n' + explainDiff(fromBrowser, golden));
    expect(fromBrowser).toBe(golden);
  });

  it('[10c] xuất Excel: khớp golden tới từng ô, trừ ô dấu thời gian', async () => {
    const cells = readCells(await exportWorkbook(page, tmp));
    const d = diffCells(cells, goldenExport, TIMESTAMP_CELLS);
    expect(d.diffs).toEqual([]);
    expect(d.total).toBeGreaterThan(4900);
    /* Ô dấu thời gian PHẢI khác — nếu trùng thì hoặc app thôi ghi giờ xuất,
       hoặc bộ kiểm đang so nhầm chính tệp golden với chính nó. */
    expect(d.skipped.length).toBe(1);
  });

  it('[10d] lưu file dự án .json khớp từng byte với state đang chạy', async () => {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      clickButton(page, '.railfoot button', 'Lưu file dự án'),
    ]);
    const out = path.join(tmp, dl.suggestedFilename());
    await dl.saveAs(out);
    expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toEqual(await getState(page));
  });

  it('[10e] mở lại file dự án .json ra đúng state cũ', async () => {
    const before = await getState(page);
    const saved = path.join(tmp, 'du-an.json');
    fs.writeFileSync(saved, JSON.stringify(before));

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      clickButton(page, '.railfoot button', 'Mở file dự án'),
    ]);
    await chooser.setFiles(saved);
    await page.waitForTimeout(1200);

    const after = await getState(page);
    expect(after.hc.rows.length).toBe(24);
    expect(after).toEqual(before);
  });

  it('[10f] không một lỗi JavaScript nào trong cả luồng', () => {
    expect(errs).toEqual([]);
  });
});
