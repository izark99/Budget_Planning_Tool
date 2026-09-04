/* Sắp xếp / lọc theo cột, trên đúng giao diện thật.

   Phần tính toán đã có test/unit/table-view.test.js canh. Ở đây canh những thứ
   chỉ trình duyệt mới trả lời được:
     · bấm tiêu đề có đổi thứ tự TRÊN MÀN mà KHÔNG đổi mảng gốc không;
     · lọc rồi phân trang thì nhãn "n dòng" đếm trên kết quả lọc hay trên gốc;
     · đang sắp xếp thì kéo thả có bị tắt không, gỡ ra có kéo lại được không. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { collectErrors, getState, goToView, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';

let server, browser, ctx, page, errs;

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
  ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  page = await loginToApp(ctx, server.base);
  errs = collectErrors(page);
  await importHeadcount(page);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
});

/** Bấm tiêu đề cột theo nhãn, trong panel đang xem. */
async function clickHead(label, modifiers) {
  await page.locator('.content .tvth', { hasText: label }).first()
    .locator('.tvlbl').click(modifiers ? { modifiers } : {});
  await page.waitForTimeout(350);
}
const colText = (i) => page.evaluate((n) =>
  [...document.querySelectorAll('.content .tw tbody tr')].map((tr) => tr.children[n]?.textContent), i);

describe('Định biên: sort chỉ là cách XEM', () => {
  beforeAll(async () => {
    await inPage(page, 'st.S.ui.pageSize = 0; return true;');
    await goToView(page, 'Định biên');
  });

  it('bấm tiêu đề đổi thứ tự trên màn, bấm nữa đảo chiều, bấm lần ba thì thôi', async () => {
    const before = await colText(1);
    await clickHead('Dept');
    const asc = await colText(1);
    expect(asc).toEqual(before.slice().sort((a, b) => a.localeCompare(b, 'vi')));

    await clickHead('Dept');
    const desc = await colText(1);
    expect(desc).toEqual(asc.slice().reverse());

    await clickHead('Dept');
    expect(await colText(1)).toEqual(before);
  });

  it('mảng gốc S.hc.rows KHÔNG bị viết lại', async () => {
    const before = (await getState(page)).hc.rows.map((r) => r.ID);
    await clickHead('Dept');
    expect((await getState(page)).hc.rows.map((r) => r.ID)).toEqual(before);
    await clickHead('Dept'); await clickHead('Dept');       /* trả về trạng thái không sắp */
  });

  it('Ctrl+bấm thêm khoá phụ, dải chip kể ra cả hai', async () => {
    await clickHead('Dept');
    await clickHead('Coefficient', ['Control']);
    const chips = await page.locator('.content .tvbar .chip').allTextContents();
    expect(chips).toHaveLength(2);
    expect(chips[0]).toContain('1. Dept');
    expect(chips[1]).toContain('2. Coefficient');

    /* Trong cùng một Dept, hệ số phải tăng dần. */
    const pairs = await page.evaluate(() =>
      [...document.querySelectorAll('.content .tw tbody tr')]
        .map((tr) => [tr.children[1].textContent, Number(tr.children[6].textContent)]));
    for (let i = 1; i < pairs.length; i++) {
      if (pairs[i][0] === pairs[i - 1][0]) expect(pairs[i][1]).toBeGreaterThanOrEqual(pairs[i - 1][1]);
    }
  });

  it('bấm chip là gỡ đúng khoá đó', async () => {
    await page.locator('.content .tvbar .chip').first().click();
    await page.waitForTimeout(300);
    expect(await page.locator('.content .tvbar .chip').allTextContents()).toHaveLength(1);
    await page.locator('.content .tvbar button', { hasText: 'Bỏ hết' }).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.content .tvbar').isVisible()).toBe(false);
  });

  it('lọc theo giá trị của một cột, số dòng đếm trên KẾT QUẢ LỌC', async () => {
    await inPage(page, 'st.S.ui.pageSize = 25; return true;');
    await goToView(page, 'Định biên');

    await page.locator('.content .tvth', { hasText: 'Dept' }).first().locator('.tvfx').click();
    await page.waitForSelector('.tvbox');
    await page.locator('.tvbox .tvvals label', { hasText: 'AC' }).first().locator('input').check();
    await page.waitForTimeout(400);
    await page.locator('.tvbox .tvfoot button', { hasText: 'Đóng' }).click();
    await page.waitForTimeout(300);

    const shown = await colText(1);
    expect(shown.length).toBeGreaterThan(0);
    expect([...new Set(shown)]).toEqual(['AC']);

    const info = await page.locator('.content .pager .muted').last().textContent();
    expect(info).toContain('/ ' + shown.length);

    await page.locator('.content .tvbar button', { hasText: 'Bỏ hết' }).click();
    await page.waitForTimeout(300);
  });
});

describe('bảng sửa tại chỗ: đang sắp thì tắt kéo thả', () => {
  const SEED = `
    st.S.maps.costCode = ['C', 'A', 'B'].map((c, i) => {
      return { formulaCode: 'FC_' + c, costCode: '030' + i, name: 'Tên ' + c };
    });
    st.S.ui.pageSize = 25; st.S.ui.collapsed = {};
    fm.ENGINE.invalidate(); st.setRESULT(null);
  `;
  const order = () => inPage(page, 'return st.S.maps.costCode.map((x) => x.formulaCode);');

  beforeAll(async () => {
    await inPage(page, SEED + 'return true;');
    await goToView(page, 'Phân loại chi phí');
  });

  it('chưa sắp: kéo được, và kéo đổi ĐÚNG mảng gốc', async () => {
    const panel = page.locator('.panel').filter({ has: page.locator('h3', { hasText: /^1 · Cost Code/ }) });
    expect(await panel.locator('.nodrag').count()).toBe(0);

    const rows = panel.locator('tbody tr');
    await rows.nth(2).locator('td.grip').dragTo(rows.nth(0), { targetPosition: { x: 10, y: 2 } });
    await page.waitForTimeout(500);
    expect(await order()).toEqual(['FC_B', 'FC_C', 'FC_A']);
  });

  it('đang sắp: tay nắm tắt hẳn, kéo không đổi gì', async () => {
    await inPage(page, SEED + 'return true;');
    await goToView(page, 'Phân loại chi phí');
    const panel = page.locator('.panel').filter({ has: page.locator('h3', { hasText: /^1 · Cost Code/ }) });

    await panel.locator('.tvth', { hasText: 'Formula Code' }).locator('.tvlbl').click();
    await page.waitForTimeout(400);
    /* Trên màn đã sắp lại. Đọc qua cột Cost Code (ô nhập chữ thường) chứ không
       qua cột Formula Code: cột đó là <select>, mà FC_A/FC_B/FC_C của hạt giống
       không nằm trong danh sách công thức thật nên value luôn rỗng. */
    const shown = await panel.locator('tbody tr td:nth-child(3) input')
      .evaluateAll((els) => els.map((e) => e.value));
    expect(shown).toEqual(['0301', '0302', '0300']);
    /* …mà mảng gốc thì không. */
    expect(await order()).toEqual(['FC_C', 'FC_A', 'FC_B']);

    expect(await panel.locator('.nodrag').count()).toBeGreaterThan(0);
    const rows = panel.locator('tbody tr');
    await rows.nth(2).locator('td.grip').dragTo(rows.nth(0), { targetPosition: { x: 10, y: 2 } });
    await page.waitForTimeout(500);
    expect(await order()).toEqual(['FC_C', 'FC_A', 'FC_B']);
  });

  it('gỡ sắp xếp thì kéo lại được ngay', async () => {
    const panel = page.locator('.panel').filter({ has: page.locator('h3', { hasText: /^1 · Cost Code/ }) });
    await panel.locator('.tvbar button', { hasText: 'Bỏ hết' }).click();
    await page.waitForTimeout(400);
    expect(await panel.locator('.nodrag').count()).toBe(0);

    const rows = panel.locator('tbody tr');
    await rows.nth(2).locator('td.grip').dragTo(rows.nth(0), { targetPosition: { x: 10, y: 2 } });
    await page.waitForTimeout(500);
    expect(await order()).toEqual(['FC_B', 'FC_C', 'FC_A']);
  });
});

describe('màn Kết quả: ba bảng đều sắp/lọc được', () => {
  beforeAll(async () => {
    await inPage(page, 'st.S.ui.pageSize = 0; return true;');
    await page.click('.topbar button.go');
    await page.waitForTimeout(2500);
    await goToView(page, 'Kết quả');
  });

  it('bảng Theo Formula Code sắp được theo tiền cả năm, hàng TỔNG vẫn ở cuối', async () => {
    const panel = page.locator('.panel').filter({ has: page.locator('h3', { hasText: 'Theo Formula Code' }) });
    await panel.locator('.tvth', { hasText: 'Cả năm' }).locator('.tvlbl').click();
    await page.waitForTimeout(400);

    const last = await panel.locator('tbody tr').last().textContent();
    expect(last).toContain('TỔNG');

    const vals = await panel.locator('tbody tr:not(.tot) td:last-child').allTextContents();
    const nums = vals.map((v) => Number(v.replace(/\D/g, '')));
    expect(nums).toEqual(nums.slice().sort((a, b) => a - b));
  });

  it('bảng pivot sắp được, và R.pivot gốc không đổi', async () => {
    const before = await inPage(page, 'return st.RESULT.pivot.map((p) => p.formulaCode);');
    const panel = page.locator('.panel').filter({ has: page.locator('h3', { hasText: 'Theo Division' }) });
    await panel.locator('.tvth', { hasText: 'Formula Code' }).locator('.tvlbl').click();
    await page.waitForTimeout(400);
    expect(await inPage(page, 'return st.RESULT.pivot.map((p) => p.formulaCode);')).toEqual(before);
    const shown = await panel.locator('tbody tr td:nth-child(6)').allTextContents();
    expect(shown).toEqual(shown.slice().sort((a, b) => a.localeCompare(b, 'vi')));
  });
});

describe('toàn bộ luồng', () => {
  it('không một lỗi JavaScript nào', () => {
    expect(errs, JSON.stringify(errs, null, 1)).toEqual([]);
  });
});
