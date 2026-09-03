/* Vòng khép kín của mọi nút "⤒ Xuất dữ liệu":
   khai dữ liệu → Xuất → xoá sạch state → Nhập từ Excel → phải ra y hệt.

   Đây mới là thứ chứng minh tính năng dùng được thật: xuất ra một file mà nhập
   lại không được thì nút đó vô nghĩa. Phủ cả ba đường dẫn tới nút xuất:
     · dataTable      — Phân loại chi phí (đại diện; Phân loại nhóm và Cài đặt
                        chính sách dùng CHUNG mã đó)
     · mã riêng       — Ngày công, Tờ trình ngoại lệ
     · Định biên      — cột động theo file người dùng nạp lên
   (% trích có tệp riêng: test/e2e/accrual.test.js) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { clickButton, collectErrors, getState, goToView, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';

let server, browser, ctx, page, errs;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpt-export-'));

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

/** Bấm nút xuất trong vùng nội dung, trả về đường dẫn tệp tải về. */
async function exportTo(label, selector = '.content button') {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    clickButton(page, selector, label),
  ]);
  const out = path.join(tmp, Date.now() + '-' + dl.suggestedFilename());
  await dl.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(1000);
  return out;
}

/** Nạp một tệp qua nút "Nhập từ Excel" rồi xác nhận trong modal ghép cột. */
async function importFrom(file, label = 'Nhập từ Excel', selector = '.content button') {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    clickButton(page, selector, label),
  ]);
  await chooser.setFiles(file);
  await page.waitForSelector('.modal', { timeout: 15000 });
  await page.click('.modal footer button.pri');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 });
  await page.waitForTimeout(600);
}

describe('Phân loại chi phí — đường dùng chung của dataTable', () => {
  it('xuất rồi nhập lại ra đúng bảng ánh xạ đã khai', async () => {
    await inPage(page, `
      st.S.maps.costCode = [
        { formulaCode: st.S.formulas[0].code, costCode: 'CC_LUONG', name: 'Chi phí lương' },
        { formulaCode: st.S.formulas[1].code, costCode: 'CC_BHXH', name: 'Bảo hiểm' },
      ];
      return true;
    `);
    await goToView(page, 'Phân loại chi phí');
    const before = (await getState(page)).maps.costCode;
    expect(before).toHaveLength(2);

    const file = await exportTo('Xuất dữ liệu');

    await inPage(page, 'st.S.maps.costCode.length = 0; return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Phân loại chi phí');
    expect((await getState(page)).maps.costCode).toHaveLength(0);

    await importFrom(file);
    const after = (await getState(page)).maps.costCode;
    expect(after.map((r) => [r.formulaCode, r.costCode, r.name]))
      .toEqual(before.map((r) => [r.formulaCode, r.costCode, r.name]));
  });
});

describe('Ngày công', () => {
  it('xuất rồi nhập lại ra đúng lịch ngày công đã khai', async () => {
    await inPage(page, `
      const tbl = st.S.calendar.tables[0];
      for (let k = 0; k < 12; k++) {
        tbl.m[k].std = 26 - (k % 3);
        tbl.m[k].act = 21.5;           /* số lẻ: bắt luôn lỗi làm tròn nếu có */
      }
      return true;
    `);
    await goToView(page, 'Ngày công');
    const before = JSON.stringify((await getState(page)).calendar.tables);

    const file = await exportTo('Xuất dữ liệu');

    await inPage(page, `
      st.S.calendar.tables.forEach((tb) => { for (let k = 0; k < 12; k++) { tb.m[k].std = 0; tb.m[k].act = 0; } });
      return true;
    `);
    await goToView(page, 'Kết quả');
    await goToView(page, 'Ngày công');

    await importFrom(file);
    const after = (await getState(page)).calendar.tables;
    expect(after.map((tb) => tb.m.map((x) => [x.std, x.act])))
      .toEqual(JSON.parse(before).map((tb) => tb.m.map((x) => [x.std, x.act])));
    /* 21,5 phải sống sót qua vòng xuất-nhập, không bị làm tròn thành 22. */
    expect(after[0].m[0].act).toBe(21.5);
  });

  it('nút "Tải mẫu" cho ra mẫu TRỐNG, không kèm dữ liệu đang khai', async () => {
    await goToView(page, 'Ngày công');
    const file = await exportTo('Tải mẫu Excel');
    const { readCells } = await import('../helpers/xlsx-cells.mjs');
    const values = Object.values(readCells(fs.readFileSync(file)))
      .flatMap((sheet) => { return Object.values(sheet); });
    expect(values).not.toContain('21.5');
    expect(values).not.toContain('26');
  });
});

describe('Tờ trình ngoại lệ', () => {
  it('xuất rồi nhập lại ra đúng tờ trình đã khai, kể cả tháng ngắt quãng', async () => {
    await inPage(page, `
      st.S.exceptions = [
        { id2: 'e1', no: 'TT-01', id: 1401, position: '', formulaCode: st.S.formulas[0].code,
          amount: 500000, months: [1,2,3], rule: 'MAX', note: 'lien mach', active: true },
        { id2: 'e2', no: 'TT-02', id: 1402, position: '', formulaCode: st.S.formulas[0].code,
          amount: 400000, months: [1,3,5], rule: 'ADD', note: 'ngat quang', active: true },
      ];
      return true;
    `);
    await goToView(page, 'Tờ trình ngoại lệ');
    const before = (await getState(page)).exceptions;

    /* Tờ trình tháng ngắt quãng tách thành nhiều dòng: e1 -> 1 dòng, e2 -> 3 dòng. */
    const file = await exportTo('Xuất dữ liệu');

    /* CỐ Ý KHÔNG xoá trước khi nhập: nếu trình nhập nối thêm thay vì thay thế thì
       số dòng sau sẽ là 2 + 4 = 6, và vòng "sửa rồi nạp lại" nhân đôi tờ trình. */
    await importFrom(file);
    const after = (await getState(page)).exceptions;

    /* Tờ trình tháng ngắt quãng bị tách thành nhiều dòng khi xuất (giao thức chỉ
       có Tu Thang/Den Thang), nên so theo TẬP THÁNG gộp lại của từng tờ trình. */
    const gom = (list) => {
      const by = {};
      list.forEach((e) => {
        const k = e.no + '|' + e.formulaCode + '|' + e.amount + '|' + e.rule;
        by[k] = [...new Set((by[k] || []).concat(e.months))].sort((a, b) => a - b);
      });
      return by;
    };
    expect(gom(after)).toEqual(gom(before));
    expect(after).toHaveLength(4);   /* thay thế: đúng 4 dòng đã xuất, không phải 2 + 4 */
  });
});

describe('Định biên', () => {
  it('xuất rồi nhập lại giữ nguyên dòng và cả thiết lập vai trò cột', async () => {
    await goToView(page, 'Định biên');
    const before = await getState(page);
    expect(before.hc.rows).toHaveLength(24);

    /* Đổi bí danh một cột ở màn Thiết lập để kiểm thiết lập có sống sót không. */
    await inPage(page, `
      const c = st.S.cols.find((x) => x.src === 'Coefficient');
      c.alias = 'HE_SO_RIENG';
      return true;
    `);

    const file = await exportTo('Xuất dữ liệu', '.panel header button');

    await inPage(page, 'st.S.hc.rows.length = 0; return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Định biên');

    /* Xoá hết dòng thì màn Định biên quay về trạng thái rỗng: không còn nút
       "Nhập lại", chỉ còn ô kéo-thả. importHeadcount() đi đúng đường đó. */
    await importHeadcount(page, file);

    const after = await getState(page);
    expect(after.hc.rows).toHaveLength(24);
    expect(after.hc.headers).toEqual(before.hc.headers);
    expect(after.hc.rows.map((r) => r.ID)).toEqual(before.hc.rows.map((r) => r.ID));
    /* prev[c.src] trong importHeadcount giữ lại cấu hình cột cũ theo TÊN GỐC. */
    expect(after.cols.find((c) => c.src === 'Coefficient').alias).toBe('HE_SO_RIENG');
  });
});

describe('toàn bộ luồng', () => {
  it('không một lỗi JavaScript nào', () => {
    expect(errs).toEqual([]);
  });
});
