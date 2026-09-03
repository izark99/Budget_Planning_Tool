/* Tab % trích — vòng khép kín qua file Excel:
   khai % -> tải mẫu -> xoá sạch -> nhập lại -> phải ra y hệt.
   Chính phép kiểm này đã bắt lỗi entryFor() tạo bản ghi rỗng cho MỌI Formula
   Code ngay khi mở tab, làm bẩn state và phình file dự án. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { clickButton, collectErrors, getState, goToView, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';
import { readCells } from '../helpers/xlsx-cells.mjs';

let server, browser, ctx, page, errs;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpt-acc-'));

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
  ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  page = await loginToApp(ctx, server.base);
  errs = collectErrors(page);
  await importHeadcount(page);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* So sánh bỏ qua id sinh ngẫu nhiên và thứ tự dòng — hai thứ không mang nghĩa. */
const norm = (accruals) => accruals.map((a) => ({
  code: a.code, col: a.col,
  rows: a.rows.map((r) => ({ key: r.key, m: r.m.map((x) => (x === '' ? '' : Number(x))) }))
    .sort((x, y) => (x.key < y.key ? -1 : 1)),
}));

describe('tab % trích', () => {
  it('mở tab KHÔNG tự sinh bản ghi rỗng cho mọi Formula Code', async () => {
    const before = (await getState(page)).accruals;
    await goToView(page, '% trích');
    const after = (await getState(page)).accruals;
    /* Lỗi cũ: mở tab một cái là state có ngay 4 bản ghi rỗng, dirty=true,
       file dự án phình ra vì những thứ người dùng chưa hề khai. */
    expect(after).toEqual(before);
  });

  it('xuất dữ liệu rồi nhập lại ra đúng dữ liệu đã khai', async () => {
    const declared = await inPage(page, `
      st.S.accruals = [{ id: 'a1', code: st.S.formulas[0].code, col: 'Dept', rows: [
        { key: 'AC', m: [100,100,100,100,100,100,50,50,50,50,50,50] },
        { key: 'SL', m: [80,80,80,80,80,80,80,80,80,80,80,80] },
        { key: 'PR', m: [100,100,100,100,100,100,100,100,100,100,100,0] },
      ] }];
      return JSON.stringify(st.S.accruals);
    `).then(JSON.parse);

    await goToView(page, '% trích');
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      clickButton(page, '.content button', 'Xuất dữ liệu'),
    ]);
    const file = path.join(tmp, dl.suggestedFilename());
    await dl.saveAs(file);
    expect(fs.statSync(file).size).toBeGreaterThan(1000);

    /* Xoá sạch rồi mới nhập lại — nếu không thì không phân biệt được "nhập
       đúng" với "vốn đã đúng sẵn". */
    await inPage(page, 'st.S.accruals = []; return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, '% trích');

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      clickButton(page, '.content button', 'Nhập từ Excel'),
    ]);
    await chooser.setFiles(file);
    await page.waitForSelector('.modal', { timeout: 15000 });
    await page.click('.modal footer button.pri');
    await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 });
    await page.waitForTimeout(600);

    const reimported = (await getState(page)).accruals;
    expect(norm(reimported)).toEqual(norm(declared));
  });

  /* Trước đây "Tải mẫu Excel" âm thầm tải về dữ liệu thật — hai nút làm cùng một
     việc. Nay tách bạch: mẫu là mẫu, xuất là xuất. */
  it('nút "Tải mẫu" cho ra mẫu TRỐNG, không kèm dữ liệu đang khai', async () => {
    await inPage(page, `
      st.S.accruals = [{ id: 'a9', code: st.S.formulas[0].code, col: 'Dept',
        rows: [{ key: 'KHONG_DUOC_CO_TRONG_MAU', m: [7,7,7,7,7,7,7,7,7,7,7,7] }] }];
      return true;
    `);
    await goToView(page, 'Kết quả');
    await goToView(page, '% trích');
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      clickButton(page, '.content button', 'Tải mẫu Excel'),
    ]);
    const file = path.join(tmp, 'mau-' + dl.suggestedFilename());
    await dl.saveAs(file);
    const cells = readCells(fs.readFileSync(file));
    const values = Object.values(cells).flatMap((sheet) => { return Object.values(sheet); });
    expect(values).not.toContain('KHONG_DUOC_CO_TRONG_MAU');
  });

  it('không một lỗi JavaScript nào', () => {
    expect(errs).toEqual([]);
  });
});
