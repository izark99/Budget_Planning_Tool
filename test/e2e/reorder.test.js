/* Kéo thả sắp xếp: danh sách Formula Code và bảng Cost Code.
   Chỗ dễ sai nhất KHÔNG phải chuyện kéo, mà là chỉ số: khi bảng đang lọc hoặc
   đang ở trang 2 thì chỉ số của DOM không phải chỉ số của mảng gốc. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { collectErrors, goToView, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';

let server, browser, ctx, page, errs;

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
  ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  page = await loginToApp(ctx, server.base);
  errs = collectErrors(page);
  await importHeadcount(page);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
});

/** Sáu Formula Code để có chỗ mà kéo qua kéo lại. */
const SIX_FC = `
  st.S.formulas = ['A', 'B', 'C', 'D', 'E', 'F'].map((c, i) => {
    return { id: 'f' + c, code: 'FC_' + c, name: 'Công thức ' + c, mode: 'monthly',
      months: [1,2,3,4,5,6,7,8,9,10,11,12],
      rules: [{ id: 'r' + i, name: 'Tất cả', cond: '', formula: '1' }] };
  });
  st.S.ui.fSel = 'fA'; fm.ENGINE.invalidate(); st.setRESULT(null);
`;

/** Bốn thôi — vừa khít trần 46vh của .fclist nên danh sách không tự cuộn. */
const FOUR_FC = `
  st.S.formulas = ['A', 'B', 'C', 'D'].map((c, i) => {
    return { id: 'f' + c, code: 'FC_' + c, name: 'Công thức ' + c, mode: 'monthly',
      months: [1,2,3,4,5,6,7,8,9,10,11,12],
      rules: [{ id: 'r' + i, name: 'Tất cả', cond: '', formula: '1' }] };
  });
  st.S.ui.fSel = 'fA'; fm.ENGINE.invalidate(); st.setRESULT(null);
`;

describe('kéo thả danh sách Formula Code', () => {
  const codes = () => page.evaluate(() =>
    [...document.querySelectorAll('.fclist .fcrow .fcmain > div:first-child')].map((x) => x.textContent));

  beforeAll(async () => {
    await inPage(page, SIX_FC + 'return true;');
    await goToView(page, 'Công thức chi phí');
  });

  it('kéo dòng thứ 3 lên đầu — thứ tự đổi đúng cả trên màn lẫn trong state', async () => {
    expect(await codes()).toEqual(['FC_A', 'FC_B', 'FC_C', 'FC_D', 'FC_E', 'FC_F']);

    const rows = page.locator('.fclist .fcrow');
    await rows.nth(2).locator('.fcgrip').dragTo(rows.nth(0), {
      targetPosition: { x: 20, y: 2 }      /* nửa trên = thả TRƯỚC */
    });
    await page.waitForTimeout(400);

    expect(await codes()).toEqual(['FC_C', 'FC_A', 'FC_B', 'FC_D', 'FC_E', 'FC_F']);
    expect(await inPage(page, 'return st.S.formulas.map((f) => f.code);'))
      .toEqual(['FC_C', 'FC_A', 'FC_B', 'FC_D', 'FC_E', 'FC_F']);
  });

  it('thả vào NỬA DƯỚI của hàng thì nằm sau hàng đó', async () => {
    /* Bốn công thức chứ không phải sáu: .fclist có trần 46vh nên sáu dòng là
       danh sách tự cuộn, và đích kéo trôi khỏi tầm nhìn giữa chừng — hỏng phép
       kiểm chứ không phải hỏng mã. Bốn dòng thì vừa khít, không cuộn. */
    await inPage(page, FOUR_FC + 'return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Công thức chi phí');
    expect(await page.evaluate(() => {
      const l = document.querySelector('.fclist');
      return l.scrollHeight > l.clientHeight;
    })).toBe(false);

    const rows = page.locator('.fclist .fcrow');
    const h = (await rows.nth(2).boundingBox()).height;
    await rows.nth(0).locator('.fcgrip').dragTo(rows.nth(2), {
      targetPosition: { x: 20, y: Math.round(h * 0.8) }  /* nửa dưới = thả SAU */
    });
    await page.waitForTimeout(400);
    expect(await codes()).toEqual(['FC_B', 'FC_C', 'FC_A', 'FC_D']);
  });

  it('kéo xong thì bỏ kết quả đã tính — thứ tự cột trong file xuất ra đã khác', async () => {
    await inPage(page, SIX_FC + 'return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Công thức chi phí');
    /* Đặt vật đánh dấu SAU khi đã rời màn Kết quả: viewResult đọc thẳng
       R.conflicts nên một RESULT giả mà ghé qua đó là ném lỗi ngay. */
    await inPage(page, "st.setRESULT({ fake: 1 }); return true;");

    const rows = page.locator('.fclist .fcrow');
    await rows.nth(1).locator('.fcgrip').dragTo(rows.nth(0), { targetPosition: { x: 20, y: 2 } });
    await page.waitForTimeout(400);
    expect(await inPage(page, 'return st.RESULT;')).toBeNull();
  });

  it('kéo thả không làm nhảy sang soạn Formula Code khác', async () => {
    await inPage(page, SIX_FC + 'return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Công thức chi phí');
    const before = await inPage(page, 'return st.S.ui.fSel;');

    const rows = page.locator('.fclist .fcrow');
    await rows.nth(3).locator('.fcgrip').dragTo(rows.nth(1), { targetPosition: { x: 20, y: 2 } });
    await page.waitForTimeout(400);
    expect(await inPage(page, 'return st.S.ui.fSel;')).toBe(before);
  });
});

describe('kéo thả bảng Cost Code', () => {
  /* 200 dòng, cỡ trang 25 (cỡ nhỏ nhất người dùng chọn được): lọc còn 67 dòng
     nằm rải rác trong mảng gốc, chia làm 3 trang. Đủ để trang 2 tồn tại THẬT
     qua giao diện, không phải bằng cách nhét cỡ trang thẳng vào state. */
  const SEED = `
    st.S.maps.costCode = [];
    for (let i = 0; i < 200; i++) {
      st.S.maps.costCode.push({ formulaCode: 'FC_' + String(i).padStart(3, '0'),
        costCode: (i % 3 === 0 ? 'CC_LOC_' : 'CC_') + i, name: 'n' + i });
    }
    st.S.ui.pageSize = 25;
  `;

  /** Mã Formula Code của bảng Cost Code, theo đúng thứ tự trong state. */
  const inState = () => inPage(page, 'return st.S.maps.costCode.map((x) => x.formulaCode);');

  /** Bảng Cost Code là panel đầu tiên ở màn Phân loại chi phí. */
  const table = () => page.locator('.panel', { hasText: 'Cost Code ← Formula Code' }).first();
  /* Nhận dạng dòng bằng ô Cost Code (ô chữ, luôn có giá trị) chứ không bằng ô
     Formula Code: ô đó là <select> lấy option từ S.formulas, mà mã seed ở đây
     không nằm trong S.formulas nên value rỗng. */
  const shownCC = () => table().locator('tbody tr td:nth-child(3) input')
    .evaluateAll((els) => els.map((e) => e.value));
  const ccOrder = () => inPage(page, 'return st.S.maps.costCode.map((x) => x.costCode);');

  const reseed = async () => {
    await inPage(page, SEED + 'return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Phân loại chi phí');
  };

  beforeAll(reseed);

  it('có tay nắm kéo trên từng dòng', async () => {
    expect(await table().locator('tbody tr td.grip').count()).toBe(25);
  });

  it('kéo trong trang 1 đổi đúng mảng gốc', async () => {
    await reseed();
    const rows = table().locator('tbody tr');
    await rows.nth(2).locator('td.grip').dragTo(rows.nth(0), { targetPosition: { x: 10, y: 2 } });
    await page.waitForTimeout(400);

    const st = await inState();
    expect(st.slice(0, 4)).toEqual(['FC_002', 'FC_000', 'FC_001', 'FC_003']);
    expect(st).toHaveLength(200);
  });

  /* ĐÂY là chỗ chỉ số DOM khác chỉ số mảng: đang lọc VÀ đang ở trang 2. */
  it('đang lọc và đang ở trang 2 vẫn thả đúng chỗ trong mảng gốc', async () => {
    await reseed();
    await table().locator("input[placeholder^='Lọc']").fill('CC_LOC_');
    await page.waitForTimeout(400);
    await table().locator('.pager button', { hasText: 'Sau' }).first().click();
    await page.waitForTimeout(400);

    const shown = await shownCC();
    expect(shown).toHaveLength(25);
    /* Trang 2 của tập đã lọc — không phải đầu mảng gốc. */
    expect(shown[0]).toBe('CC_LOC_75');

    const before = await ccOrder();
    const rows = table().locator('tbody tr');
    /* Kéo dòng thứ 3 đang hiện lên trước dòng đầu đang hiện. */
    const moved = shown[2], target = shown[0];
    await rows.nth(2).locator('td.grip').dragTo(rows.nth(0), { targetPosition: { x: 10, y: 2 } });
    await page.waitForTimeout(400);

    const after = await ccOrder();
    expect(after).toHaveLength(200);
    /* Trong MẢNG GỐC, dòng được kéo phải nằm ngay trước dòng đích — không phải
       ở đầu mảng, và không phải ở vị trí thứ 3 của trang. */
    expect(after.indexOf(moved)).toBe(after.indexOf(target) - 1);
    /* Mọi dòng khác giữ nguyên thứ tự tương đối, không mất dòng nào. */
    expect(after.filter((c) => c !== moved)).toEqual(before.filter((c) => c !== moved));
    expect((await inState())).toHaveLength(200);
  });
});

describe('Sinh sẵn sắp lại theo thứ tự công thức chi phí', () => {
  it('thứ tự bảng Cost Code khớp S.formulas, dòng lạ xuống cuối, không mất dòng', async () => {
    await inPage(page, SIX_FC + `
      /* Xáo trộn sẵn, thêm hai dòng KHÔNG còn trong danh sách công thức nữa. */
      st.S.maps.costCode = [
        { formulaCode: 'FC_E', costCode: 'x', name: '' },
        { formulaCode: 'FC_CU_1', costCode: 'cũ1', name: '' },
        { formulaCode: 'FC_B', costCode: 'x', name: '' },
        { formulaCode: 'FC_CU_2', costCode: 'cũ2', name: '' }
      ];
      st.S.ui.pageSize = 25;
      return true;
    `);
    await goToView(page, 'Phân loại chi phí');

    const panel = page.locator('.panel', { hasText: 'Cost Code ← Formula Code' }).first();
    await panel.getByRole('button', { name: 'Sinh sẵn' }).click();
    await page.waitForTimeout(600);

    const st = await inPage(page, 'return st.S.maps.costCode.map((x) => x.formulaCode);');
    /* Sáu công thức đúng thứ tự khai báo, rồi tới hai dòng lạ giữ thứ tự cũ. */
    expect(st).toEqual(['FC_A', 'FC_B', 'FC_C', 'FC_D', 'FC_E', 'FC_F', 'FC_CU_1', 'FC_CU_2']);

    /* Giá trị đã khai của dòng cũ không được mất khi sắp lại. */
    const keep = await inPage(page,
      "return st.S.maps.costCode.filter((x) => x.costCode).map((x) => x.formulaCode + '=' + x.costCode);");
    expect(keep).toEqual(['FC_B=x', 'FC_E=x', 'FC_CU_1=cũ1', 'FC_CU_2=cũ2']);
  });
});

describe('chọn nhiều dòng rồi kéo một lượt', () => {
  const SIX = SIX_FC;

  const codes = () => page.evaluate(() =>
    [...document.querySelectorAll('.fclist .fcrow .fcmain > div:first-child')].map((x) => x.textContent));
  const picked = () => page.evaluate(() =>
    [...document.querySelectorAll('.fclist .fcrow.picked .fcmain > div:first-child')].map((x) => x.textContent));

  const clickRow = (i, mod) => page.locator('.fclist .fcrow').nth(i).locator('.fcmain').click({ modifiers: mod });

  it('Ctrl+bấm nhặt từng dòng, không mở công thức đó ra soạn', async () => {
    await inPage(page, SIX + 'return true;');
    await goToView(page, 'Công thức chi phí');
    const sel0 = await inPage(page, 'return st.S.ui.fSel;');

    await clickRow(1, ['Control']);
    await clickRow(3, ['Control']);
    await page.waitForTimeout(300);

    expect(await picked()).toEqual(['FC_B', 'FC_D']);
    /* Chọn để kéo, không phải mở ra soạn — công thức đang mở không đổi. */
    expect(await inPage(page, 'return st.S.ui.fSel;')).toBe(sel0);
  });

  it('Ctrl+bấm lần nữa thì bỏ chọn dòng đó', async () => {
    await clickRow(1, ['Control']);
    await page.waitForTimeout(300);
    expect(await picked()).toEqual(['FC_D']);
  });

  it('Shift+bấm lấy cả dải tính từ mốc neo', async () => {
    await inPage(page, SIX + 'return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Công thức chi phí');
    await clickRow(1, ['Control']);
    await clickRow(4, ['Shift']);
    await page.waitForTimeout(300);
    expect(await picked()).toEqual(['FC_B', 'FC_C', 'FC_D', 'FC_E']);
  });

  it('kéo một dòng trong khối thì cả khối đi theo, giữ thứ tự', async () => {
    await inPage(page, SIX + 'return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Công thức chi phí');
    /* Chọn B và D (rời nhau), kéo lên trước A. */
    await clickRow(1, ['Control']);
    await clickRow(3, ['Control']);
    await page.waitForTimeout(300);

    const rows = page.locator('.fclist .fcrow');
    await rows.nth(1).locator('.fcgrip').dragTo(rows.nth(0), { targetPosition: { x: 20, y: 2 } });
    await page.waitForTimeout(500);

    expect(await codes()).toEqual(['FC_B', 'FC_D', 'FC_A', 'FC_C', 'FC_E', 'FC_F']);
    expect(await inPage(page, 'return st.S.formulas.map((f) => f.code);'))
      .toEqual(['FC_B', 'FC_D', 'FC_A', 'FC_C', 'FC_E', 'FC_F']);
    /* Kéo xong thì bỏ chọn — khối đã về chỗ, giữ sáng nữa chỉ gây nhầm. */
    expect(await picked()).toEqual([]);
  });

  it('kéo một dòng NGOÀI khối thì chỉ dòng đó đi, và khối bị bỏ chọn', async () => {
    await inPage(page, SIX + 'return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Công thức chi phí');
    await clickRow(1, ['Control']);
    await clickRow(2, ['Control']);
    await page.waitForTimeout(300);

    const rows = page.locator('.fclist .fcrow');
    await rows.nth(4).locator('.fcgrip').dragTo(rows.nth(0), { targetPosition: { x: 20, y: 2 } });
    await page.waitForTimeout(500);
    expect(await codes()).toEqual(['FC_E', 'FC_A', 'FC_B', 'FC_C', 'FC_D', 'FC_F']);
  });
});

describe('bảng Cost Code: chọn nhiều dòng rồi kéo', () => {
  const SEED = `
    st.S.maps.costCode = [];
    for (let i = 0; i < 200; i++) {
      st.S.maps.costCode.push({ formulaCode: 'FC_' + String(i).padStart(3, '0'),
        costCode: (i % 3 === 0 ? 'CC_LOC_' : 'CC_') + i, name: 'n' + i });
    }
    st.S.ui.pageSize = 25;
  `;
  const table = () => page.locator('.panel', { hasText: 'Cost Code ← Formula Code' }).first();
  const ccOrder = () => inPage(page, 'return st.S.maps.costCode.map((x) => x.costCode);');
  const shownCC = () => table().locator('tbody tr td:nth-child(3) input')
    .evaluateAll((els) => els.map((e) => e.value));

  it('Ctrl+bấm ba dòng rời nhau rồi kéo — ĐANG LỌC và ĐANG Ở TRANG 2', async () => {
    await inPage(page, SEED + 'return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Phân loại chi phí');
    await table().locator("input[placeholder^='Lọc']").fill('CC_LOC_');
    await page.waitForTimeout(400);
    await table().locator('.pager button', { hasText: 'Sau' }).first().click();
    await page.waitForTimeout(400);

    const shown = await shownCC();
    const before = await ccOrder();
    const rows = table().locator('tbody tr');
    /* Chọn dòng 2, 4, 6 đang hiện rồi kéo lên trước dòng 1 đang hiện. */
    for (const i of [1, 3, 5]) {
      await rows.nth(i).locator('td.grip').click({ modifiers: ['Control'] });
      await page.waitForTimeout(150);
    }
    expect(await table().locator('tbody tr.picked').count()).toBe(3);

    await rows.nth(1).locator('td.grip').dragTo(rows.nth(0), { targetPosition: { x: 10, y: 2 } });
    await page.waitForTimeout(500);

    const after = await ccOrder();
    expect(after).toHaveLength(200);
    /* Ba dòng nằm liền nhau ngay trước dòng đích, THEO ĐÚNG thứ tự mảng gốc. */
    const at = after.indexOf(shown[0]);
    expect(after.slice(at - 3, at)).toEqual([shown[1], shown[3], shown[5]]);
    /* Không mất dòng nào, không nhân bản dòng nào. */
    expect(after.slice().sort()).toEqual(before.slice().sort());
  });
});

/* Màn Thiết lập dùng lại đúng bộ máy đó cho hai danh sách nữa. Chỗ khác biệt
   đáng canh: cả hai vẽ lại TẠI CHỖ (drawShared/fillP) chứ không gọi render(),
   nên tập đang chọn phải sống qua lần vẽ lại mà không cần render().

   Ngữ cảnh riêng, khung nhìn CAO: mỗi khối .rule cao hơn 150px, bốn khối cộng
   với các panel khác là vượt 900px. Kéo thả gốc của HTML5 không sống nổi qua
   một cú cuộn giữa chừng — Playwright cuộn để với tới đích thì chuỗi sự kiện
   đứt, không có drop nào cả. Cho cả danh sách nằm gọn trong khung là hết. */
describe('sắp thứ tự ở màn Thiết lập', () => {
  let sctx, spage, serrs;

  const SEED = `
    st.S.shared = ['A', 'B', 'C', 'D'].map((c, i) => {
      return { id: 's' + c, code: 'CT_' + c, name: '', formula: String(i + 1) };
    });
    st.S.params = ['P', 'Q', 'R', 'S'].map((c, i) => {
      return { name: 'TS_' + c, value: i + 1, note: '' };
    });
    st.S.ui.collapsed = { setup_cols: true, setup_sysvars: true };
    st.setRESULT(null);
  `;
  const shCodes = () => spage.evaluate(() =>
    [...document.querySelectorAll('.rule .h input.nm')].filter((_, i) => i % 2 === 0).map((x) => x.value));
  const shOrder = () => inPage(spage, 'return st.S.shared.map((x) => x.code);');
  const pNames = () => inPage(spage, 'return st.S.params.map((p) => p.name);');

  /** Nạp lại hạt giống rồi dựng lại màn — tập đang chọn cũng được xoá theo. */
  async function reseed(collapseParams) {
    await inPage(spage, SEED + 'st.S.ui.collapsed.setup_params = ' + (collapseParams ? 'true' : 'false') + '; return true;');
    await goToView(spage, 'Kết quả');
    await goToView(spage, 'Thiết lập');
  }

  beforeAll(async () => {
    sctx = await browser.newContext({ viewport: { width: 1400, height: 1300 } });
    spage = await loginToApp(sctx, server.base);
    serrs = collectErrors(spage);
    await importHeadcount(spage);
    await reseed(true);
  });
  afterAll(async () => { await sctx?.close(); });

  it('công thức dùng chung: kéo dòng 3 lên đầu', async () => {
    expect(await shCodes()).toEqual(['CT_A', 'CT_B', 'CT_C', 'CT_D']);
    const rules = spage.locator('.rule');
    await rules.nth(2).locator('.fcgrip').dragTo(rules.nth(0), { targetPosition: { x: 20, y: 2 } });
    await spage.waitForTimeout(400);
    expect(await shCodes()).toEqual(['CT_C', 'CT_A', 'CT_B', 'CT_D']);
    expect(await shOrder()).toEqual(['CT_C', 'CT_A', 'CT_B', 'CT_D']);
  });

  it('công thức dùng chung: Ctrl+bấm hai dòng rời nhau rồi kéo một lượt', async () => {
    await reseed(true);
    const rules = spage.locator('.rule');
    for (const i of [0, 2]) {
      await rules.nth(i).locator('.fcgrip').click({ modifiers: ['Control'] });
      await spage.waitForTimeout(150);
    }
    expect(await spage.locator('.rule.picked').count()).toBe(2);

    /* Thả xuống NỬA DƯỚI của dòng cuối. Khối .rule cao hơn hẳn một hàng bảng
       nên phải đo thật, đoán một con số là trúng vào ô nhập ở thanh tiêu đề. */
    const last = rules.nth(3);
    const bb = await last.boundingBox();
    await rules.nth(0).locator('.fcgrip').dragTo(last, { targetPosition: { x: 20, y: bb.height - 6 } });
    await spage.waitForTimeout(400);
    /* Khối giữ nguyên thứ tự tương đối A rồi C, không phải theo thứ tự bấm. */
    expect(await shOrder()).toEqual(['CT_B', 'CT_D', 'CT_A', 'CT_C']);
    /* Kéo xong thì bỏ chọn — nếu không, cú kéo sau lại lôi theo cả khối cũ. */
    expect(await spage.locator('.rule.picked').count()).toBe(0);
  });

  it('công thức dùng chung: nút ↑ ↓ vẫn là đường chắc', async () => {
    await reseed(true);
    await spage.locator('.rule').nth(0).locator('.h button', { hasText: '↓' }).click();
    await spage.waitForTimeout(300);
    expect(await shOrder()).toEqual(['CT_B', 'CT_A', 'CT_C', 'CT_D']);
  });

  it('tham số dùng chung: kéo và bấm ↑ ↓ đều đổi đúng thứ tự', async () => {
    /* Mở bảng tham số, gập danh sách công thức để cả bảng nằm trong khung. */
    await inPage(spage, SEED + 'st.S.ui.collapsed.setup_shared = true; return true;');
    await goToView(spage, 'Kết quả');
    await goToView(spage, 'Thiết lập');
    expect(await pNames()).toEqual(['TS_P', 'TS_Q', 'TS_R', 'TS_S']);

    /* Bảng tham số là bảng duy nhất ở màn này có ô tay nắm. */
    const rows = spage.locator('table tbody tr').filter({ has: spage.locator('td.grip') });
    await rows.nth(3).locator('td.grip').dragTo(rows.nth(0), { targetPosition: { x: 10, y: 2 } });
    await spage.waitForTimeout(400);
    expect(await pNames()).toEqual(['TS_S', 'TS_P', 'TS_Q', 'TS_R']);

    await rows.nth(0).locator('button', { hasText: '↓' }).click();
    await spage.waitForTimeout(300);
    expect(await pNames()).toEqual(['TS_P', 'TS_S', 'TS_Q', 'TS_R']);
  });

  it('không một lỗi JavaScript nào ở màn Thiết lập', () => {
    expect(serrs, JSON.stringify(serrs, null, 1)).toEqual([]);
  });
});

describe('toàn bộ luồng', () => {
  it('không một lỗi JavaScript nào', () => {
    expect(errs, JSON.stringify(errs, null, 1)).toEqual([]);
  });
});
