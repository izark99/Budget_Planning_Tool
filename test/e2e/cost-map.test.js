/* Màn Phân loại chi phí sau khi đổi khoá Budget Code và thêm Division.

   Khoá Budget Code được dựng ở BA nơi. Đây là nơi thứ hai (đếm tổ hợp còn
   thiếu + nút "Sinh sẵn"); nơi thứ nhất đi bằng unit, nơi thứ ba — sheet
   ChiTiet_Dong — đi bằng chính phép kiểm cuối tệp này. */
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpt-maps-'));

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

/** Khai đủ Cost Code cho mọi Formula Code, và Cost Center cho hai đơn vị. */
const SEED = `
  st.S.maps.costCode = st.S.formulas.map((f, i) => {
    return { formulaCode: f.code, costCode: '030' + i, name: '' };
  });
  st.S.maps.costCenter = [{ unit: 'AC', costCenter: 'CC_AC', name: '' },
                          { unit: 'HR', costCenter: 'CC_HR', name: '' }];
  st.S.maps.division = [];
  st.S.maps.budgetCode = [];
  st.S.maps.accountCode = [];
  st.S.ui.collapsed = {};
  fm.ENGINE.invalidate(); st.setRESULT(null);
`;

describe('bảng Division', () => {
  beforeAll(async () => {
    await inPage(page, SEED + 'return true;');
    await goToView(page, 'Phân loại chi phí');
  });

  it('có panel riêng, "Sinh sẵn" đổ ra đúng danh sách đơn vị', async () => {
    const titles = await page.evaluate(() =>
      [...document.querySelectorAll('.content .panel > header h3')].map((x) => x.textContent));
    expect(titles.some((x) => x.includes('Division'))).toBe(true);

    const panel = page.locator('.panel').filter({ has: page.locator('h3', { hasText: 'Division' }) });
    await panel.locator('button', { hasText: 'Sinh sẵn từ định biên' }).click();
    await page.waitForTimeout(700);

    const units = (await getState(page)).maps.division.map((x) => x.unit).sort();
    expect(units).toEqual(['AC', 'HR', 'PR-F1', 'SL-HN']);
  });

  it('khai xong thì cảnh báo "chưa map Division" biến mất khỏi màn Kết quả', async () => {
    const before = await inPage(page, `
      return fm.ENGINE.run().warnings.filter((w) => w.type === 'div').length;
    `);
    expect(before).toBe(4);

    await inPage(page, `
      st.S.maps.division = st.S.maps.division.map((x) => {
        return { unit: x.unit, division: x.unit === 'AC' || x.unit === 'HR' ? 'DIV_BAC' : 'DIV_NAM', name: '' };
      });
      fm.ENGINE.invalidate(); st.setRESULT(null);
      return fm.ENGINE.run().warnings.filter((w) => w.type === 'div').length;
    `).then((n) => { expect(n).toBe(0); });
  });
});

describe('khoá Budget Code: Cost Code + Đơn vị', () => {
  it('"Sinh sẵn" đổ ra tổ hợp KHÔNG có Cost Center, kể cả đơn vị chưa map Cost Center', async () => {
    await inPage(page, SEED + 'return true;');
    await goToView(page, 'Phân loại chi phí');

    /* "Budget Code" cũng nằm trong tiêu đề panel Account Code — neo vào số thứ tự. */
    const panel = page.locator('.panel').filter({ has: page.locator('h3', { hasText: /^4 · Budget Code/ }) });
    await panel.locator('button', { hasText: 'Sinh sẵn từ định biên' }).click();
    await page.waitForTimeout(800);

    const rows = (await getState(page)).maps.budgetCode;
    /* 4 Formula Code × 4 đơn vị = 16 tổ hợp, không nhân thêm Cost Center. */
    expect(rows).toHaveLength(16);
    expect(rows.every((r) => !('costCenter' in r))).toBe(true);
    /* PR-F1 và SL-HN chưa có Cost Center nhưng vẫn phải có dòng Budget Code. */
    expect(rows.filter((r) => r.unit === 'PR-F1')).toHaveLength(4);
  });

  it('bảng trên màn hình không còn cột Cost Center', async () => {
    /* Tiêu đề cột nay có nút lọc kèm bên trong — lấy đúng nhãn. */
    const heads = await page.locator('.panel')
      .filter({ has: page.locator('h3', { hasText: /^4 · Budget Code/ }) })
      .locator('thead th').evaluateAll((els) => els.map((x) => (x.querySelector('.tvlbl') || x).textContent));
    expect(heads).toContain('Cost Code');
    expect(heads).toContain('Unit');
    expect(heads).not.toContain('Cost Center');
  });
});

describe('màn Kết quả và file Excel', () => {
  it('bảng pivot đặt Division ở cột ĐẦU, theo đúng thứ tự đã chốt', async () => {
    await inPage(page, SEED + `
      st.S.maps.division = [{ unit: 'AC', division: 'DIV_BAC', name: '' },
                            { unit: 'HR', division: 'DIV_BAC', name: '' },
                            { unit: 'PR-F1', division: 'DIV_NAM', name: '' },
                            { unit: 'SL-HN', division: 'DIV_NAM', name: '' }];
      return true;
    `);
    await page.click('.topbar button.go');
    await page.waitForTimeout(2500);
    await goToView(page, 'Kết quả');

    const panel = page.locator('.panel').filter({ has: page.locator('h3', { hasText: 'Theo Division' }) });
    const heads = await panel.locator('thead th')
      .evaluateAll((els) => els.map((x) => (x.querySelector('.tvlbl') || x).textContent));
    expect(heads.slice(0, 6)).toEqual(
      ['Division', 'Budget Code', 'Cost Center', 'Cost Code', 'Account Code', 'Formula Code']);

    const first = await panel.locator('tbody tr').first().locator('td').allTextContents();
    expect(first[0]).toMatch(/^DIV_/);
  });

  it('sheet ChiTiet_Dong dùng CÙNG khoá Budget Code với bảng pivot', async () => {
    /* Đây là bản sao thứ ba của khoá. Khai Budget Code cho đúng một tổ hợp rồi
       soi xem sheet dài có ghi đúng mã đó ở mọi dòng của tổ hợp ấy không. */
    await inPage(page, SEED + `
      st.S.maps.budgetCode = [{ costCode: '0300', unit: 'AC', budgetCode: 'BUD_X', name: '' }];
      return true;
    `);
    await page.click('.topbar button.go');
    await page.waitForTimeout(2500);
    await goToView(page, 'Kết quả');
    await clickButton(page, '.content button', 'Xuất Excel');
    await page.waitForSelector('.modal');
    /* Bật sheet ChiTiet_Dong (mặc định tắt vì rất dài). */
    await page.locator('.modal label', { hasText: 'Chi tiết' }).locator('input').check();
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('.modal footer button.pri')
    ]);
    const out = path.join(tmp, dl.suggestedFilename());
    await dl.saveAs(out);

    const cells = readCells(fs.readFileSync(out));
    const long = cells.ChiTiet_Dong;
    expect(long).toBeTruthy();
    const head = ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1', 'I1', 'J1', 'K1'].map((k) => long[k]);
    expect(head).toEqual(['ID', 'ChucDanh', 'DonVi', 'Division', 'CostCenter',
      'FormulaCode', 'CostCode', 'BudgetCode', 'AccountCode', 'Thang', 'SoTien']);

    /* Mọi dòng của (đơn vị AC × Cost Code 0300) phải mang BUD_X; không dòng nào khác mang nó. */
    let n = 0, wrong = 0;
    for (const k of Object.keys(long)) {
      const m = k.match(/^C(\d+)$/); if (!m || m[1] === '1') continue;
      const r = m[1];
      const isTarget = long['C' + r] === 'AC' && long['G' + r] === '0300';
      if (isTarget) { n++; if (long['H' + r] !== 'BUD_X') wrong++; }
      else if (long['H' + r] === 'BUD_X') wrong++;
    }
    expect(n).toBeGreaterThan(0);
    expect(wrong).toBe(0);
  });
});

describe('toàn bộ luồng', () => {
  it('không một lỗi JavaScript nào', () => {
    expect(errs, JSON.stringify(errs, null, 1)).toEqual([]);
  });
});
