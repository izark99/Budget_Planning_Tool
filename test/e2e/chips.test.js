/* Hộp gợi ý chèn: chia theo TAB theo nguồn.

   Một danh sách phẳng thì nhìn [Nhóm lương] không biết nó từ đâu ra — bảng
   phân loại nhóm, bảng chính sách, hay cột gốc của file định biên. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { collectErrors, goToView, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';

let server, browser, ctx, page, errs;

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
  ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  page = await loginToApp(ctx, server.base);
  errs = collectErrors(page);
  await importHeadcount(page);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
});

/* Mỗi nguồn một mẫu, để tab nào cũng có cái mà đếm. */
const SEED = `
  st.S.classes = [{ id: 'c1', name: 'Bảng nhóm', keys: ['Dept'],
    outs: [{ name: 'NHOM_LUONG', type: 'text' }], rows: [], def: [''] }];
  st.S.policies = [{ id: 'p1', name: 'Chính sách', keys: ['Dept'],
    outs: [{ name: 'MUC_TIEN', type: 'num' }], rows: [], def: [0] }];
  st.S.shared = [{ id: 's1', code: 'LUONG_CO_BAN', name: 'Lương cơ bản', formula: '1' }];
  st.S.ui.collapsed = {}; fm.ENGINE.invalidate(); st.setRESULT(null);
`;

const tabNames = () => page.locator('.chipbox .chiptabs .chip').allTextContents();
const itemsNow = () => page.locator('.chipbox .chipbody .chip').allTextContents();
async function openTab(label) {
  await page.locator('.chipbox .chiptabs .chip', { hasText: label }).first().click();
  await page.waitForTimeout(200);
}

describe('chia tab theo nguồn', () => {
  beforeAll(async () => {
    await inPage(page, SEED + 'return true;');
    await goToView(page, 'Công thức chi phí');
  });

  it('có đủ sáu tab, đúng thứ tự người dùng gặp trên thanh điều hướng', async () => {
    expect(await tabNames()).toEqual(
      ['Định biên', 'Phân loại', 'Chính sách', 'CT chung', 'Tham số', 'Biến hệ thống']);
  });

  it('mỗi tab chỉ hiện gợi ý của ĐÚNG nguồn đó', async () => {
    await openTab('Phân loại');
    expect(await itemsNow()).toEqual(['[NHOM_LUONG]']);

    await openTab('Chính sách');
    expect(await itemsNow()).toEqual(['[MUC_TIEN]']);

    await openTab('CT chung');
    expect(await itemsNow()).toEqual(['LUONG_CO_BAN']);

    await openTab('Định biên');
    const hc = await itemsNow();
    expect(hc).toContain('[Dept]');
    /* Cột phân loại và cột chính sách KHÔNG được lẫn vào tab định biên — đó
       chính là thứ mà danh sách phẳng cũ không phân biệt được. */
    expect(hc).not.toContain('[NHOM_LUONG]');
    expect(hc).not.toContain('[MUC_TIEN]');
  });

  it('mỗi tab có một dòng nói gợi ý đó từ đâu ra', async () => {
    await openTab('Biến hệ thống');
    expect(await page.locator('.chipbox .chipnote').textContent()).toMatch(/Máy tự cấp/);
    const sys = await itemsNow();
    expect(sys).toContain('THANG');
    expect(sys).toContain('NGAY_NGHI_NGUNG_VIEC');
  });

  it('tab rỗng thì KHÔNG hiện — chưa khai chính sách nào thì không có tab đó', async () => {
    await inPage(page, 'st.S.policies = []; st.S.classes = []; fm.ENGINE.invalidate(); st.setRESULT(null); return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Công thức chi phí');
    const tabs = await tabNames();
    expect(tabs).not.toContain('Chính sách');
    expect(tabs).not.toContain('Phân loại');
    expect(tabs).toContain('Định biên');
  });

  it('nút Thư viện hàm đứng riêng, không nằm trong tab nào', async () => {
    const head = await page.locator('.chipbox .chiphead > .chip.ink').textContent();
    expect(head).toMatch(/Thư viện/);
    /* Và nó không bị đếm vào danh sách gợi ý của tab đang mở. */
    expect(await itemsNow()).not.toContain(head);
  });
});

describe('chèn vẫn hoạt động qua tab', () => {
  beforeAll(async () => {
    await inPage(page, SEED + 'return true;');
    await goToView(page, 'Công thức chi phí');
  });

  it('đổi tab rồi bấm chip: chèn đúng một lần vào ô đang soạn', async () => {
    const ta = page.locator('.split .fx-wrap textarea').first();
    await ta.click();
    await ta.fill('');
    await page.waitForTimeout(200);

    await openTab('CT chung');
    await page.locator('.chipbox .chipbody .chip', { hasText: 'LUONG_CO_BAN' }).click();
    await page.waitForTimeout(300);
    expect(await ta.inputValue()).toBe('LUONG_CO_BAN');

    /* Bấm TAB cũng không được cướp con trỏ khỏi ô đang soạn: chèn tiếp phải
       vào đúng ô đó, ngay sau chỗ vừa chèn. */
    await openTab('Định biên');
    await page.locator('.chipbox .chipbody .chip', { hasText: '[Dept]' }).click();
    await page.waitForTimeout(300);
    expect(await ta.inputValue()).toBe('LUONG_CO_BAN[Dept]');
  });

  it('tab đang mở sống qua một lần dựng lại màn hình', async () => {
    await openTab('Tham số');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Công thức chi phí');
    const on = await page.locator('.chipbox .chiptabs .chip.on').textContent();
    expect(on).toBe('Tham số');
  });
});

describe('toàn bộ luồng', () => {
  it('không một lỗi JavaScript nào', () => {
    expect(errs, JSON.stringify(errs, null, 1)).toEqual([]);
  });
});
