/* Hoàn tác thao tác xoá.

   App có khoảng hai chục nút xoá, và trước đợt này tất cả chỉ được che bằng một
   hộp xác nhận — bấm nhầm là mất, không có đường lui. Cơ chế mới chụp cả state
   ngay trước khi xoá và mời hoàn tác bằng một nút ngay trong toast.

   Thước đo của tệp này: sau khi hoàn tác, dữ liệu phải trở lại Y NGUYÊN TỪNG
   DÒNG — không phải "đúng số dòng". Và bản chụp phải được THẢ khi lời mời hết
   hạn, để không bao giờ có chuyện bấm Hoàn tác sau mười thao tác nữa rồi mất
   sạch những gì vừa làm. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { collectErrors, getState, goToView, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';

let server, browser, ctx, page, errs;

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
  ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  page = await loginToApp(ctx, server.base);
  errs = collectErrors(page);
  await importHeadcount(page);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
});

/* Bảng Cost Code ← Formula Code: một dataTable thật, có đủ "Xoá sạch" lẫn
   "Nhập từ Excel", nên cả ba đường mất dữ liệu đều đi qua đây được. */
const SEED = `
  st.S.maps.costCode = st.S.formulas.map((f, i) => {
    return { formulaCode: f.code, costCode: '030' + i, name: 'Ten ' + i };
  });
  st.S.ui.collapsed = {};
  fm.ENGINE.invalidate(); st.setRESULT(null);
`;

async function seedMaps() {
  await inPage(page, SEED + 'return true;');
  await goToView(page, 'Phân loại chi phí');
}

/** Panel "1 · Cost Code ← Formula Code" — có hai panel mang chữ "Cost Code". */
function ccPanel() {
  return page.locator('.panel').filter({ has: page.locator('h3', { hasText: /^1 · Cost Code/ }) });
}

/** Bấm một nút trong panel Cost Code rồi đồng ý ở hộp xác nhận. */
async function clearCcTable() {
  await ccPanel().locator('button', { hasText: 'Xoá sạch' }).click();
  await page.waitForSelector('.mask .modal', { timeout: 5000 });
  await page.click('.mask .modal footer button.pri');
  await page.waitForTimeout(400);
}

const undoBtn = () => page.locator('.toast button', { hasText: 'Hoàn tác' });
const hasUndo = () => inPage(page, `
  const u = await import('/src/ui/undo.js');
  return u.hasUndo();
`);

describe('xoá sạch một bảng', () => {
  beforeAll(seedMaps);

  it('hoàn tác trả lại đúng từng dòng, không chỉ đúng số dòng', async () => {
    const before = (await getState(page)).maps.costCode;
    expect(before.length).toBeGreaterThan(2);

    await clearCcTable();
    expect((await getState(page)).maps.costCode).toEqual([]);

    expect(await undoBtn().count()).toBe(1);
    await undoBtn().click();
    await page.waitForTimeout(500);

    expect((await getState(page)).maps.costCode).toEqual(before);
  });

  it('sau khi hoàn tác thì kết quả đã tính bị bỏ — số cũ không còn khớp state', async () => {
    await seedMaps();
    await page.click('.topbar button.go');
    await page.waitForTimeout(2500);
    expect(await inPage(page, 'return !!st.RESULT;')).toBe(true);

    await goToView(page, 'Phân loại chi phí');
    await clearCcTable();
    await undoBtn().click();
    await page.waitForTimeout(500);

    expect(await inPage(page, 'return !!st.RESULT;')).toBe(false);
  });
});

describe('“Xoá hết, làm lại”', () => {
  /* Chỗ đáng có nút hoàn tác nhất trong cả app: một cú bấm là mất sạch dự án. */
  it('hoàn tác trả lại cả dự án — định biên, cột, công thức, bảng ánh xạ', async () => {
    await seedMaps();
    const before = await getState(page);
    expect(before.hc.rows.length).toBeGreaterThan(0);

    await page.locator('.railfoot button', { hasText: 'Xoá hết, làm lại' }).click();
    await page.waitForSelector('.mask .modal', { timeout: 5000 });
    await page.click('.mask .modal footer button.pri');
    await page.waitForTimeout(500);
    expect((await getState(page)).hc.rows.length).toBe(0);

    await undoBtn().click();
    await page.waitForTimeout(600);

    const after = await getState(page);
    expect(after.hc.rows).toEqual(before.hc.rows);
    expect(after.cols).toEqual(before.cols);
    expect(after.formulas).toEqual(before.formulas);
    expect(after.maps.costCode).toEqual(before.maps.costCode);
  });
});

describe('nhập từ Excel ghi đè', () => {
  /* Về chữ nghĩa không phải "xoá", nhưng replaceOnImport thay sạch bảng đang có
     — mất dữ liệu y hệt, và người dùng bấm nút này liên tục. */
  it('hoàn tác trả lại bảng cũ', async () => {
    await seedMaps();
    const before = (await getState(page)).maps.costCode;

    /* Đi thẳng vào doImport qua chính withUndo mà nút Nhập từ Excel dùng: phần
       đọc file .xlsx đã có phép kiểm riêng, cái cần canh ở đây là đường lui. */
    await inPage(page, `
      const u = await import('/src/ui/undo.js');
      const d = await import('/src/ui/dom.js');
      u.withUndo('nhập đè', () => {
        st.S.maps.costCode.length = 0;
        st.S.maps.costCode.push({ formulaCode: 'MOI', costCode: '999', name: '' });
        st.touch(); d.render();
      });
      return true;
    `);
    expect((await getState(page)).maps.costCode).toHaveLength(1);

    await undoBtn().click();
    await page.waitForTimeout(500);
    expect((await getState(page)).maps.costCode).toEqual(before);
  });
});

describe('chỉ giữ đúng một bản chụp', () => {
  it('xoá hai lần liên tiếp thì Hoàn tác chỉ lấy lại lần vừa xoá', async () => {
    await seedMaps();
    const full = (await getState(page)).maps.costCode;

    /* Lần một: bỏ dòng cuối. Không bấm Hoàn tác. */
    await inPage(page, `
      const u = await import('/src/ui/undo.js');
      const d = await import('/src/ui/dom.js');
      u.withUndo('bỏ dòng cuối', () => { st.S.maps.costCode.pop(); st.touch(); d.render(); });
      return true;
    `);
    const oneGone = (await getState(page)).maps.costCode;
    expect(oneGone).toHaveLength(full.length - 1);

    /* Lần hai: xoá sạch. Hoàn tác phải quay về trạng thái SAU lần một, chứ
       không lôi lại cả dòng đã bỏ ở lần một. */
    await clearCcTable();
    await undoBtn().click();
    await page.waitForTimeout(500);

    expect((await getState(page)).maps.costCode).toEqual(oneGone);
  });

  it('không bấm gì, lời mời hết hạn thì bản chụp được thả', async () => {
    await seedMaps();
    await clearCcTable();
    expect(await hasUndo()).toBe(true);

    /* Toast có nút sống 11 giây. Chờ hẳn qua mốc đó rồi soát: bản chụp là cả
       state, giữ mãi là giữ luôn một bản sao dự án trong bộ nhớ. */
    await page.waitForTimeout(12500);
    expect(await hasUndo()).toBe(false);
    expect(await undoBtn().count()).toBe(0);
  });
});

describe('console sạch', () => {
  it('không lỗi JS nào trong suốt bài kiểm', () => {
    expect(errs).toEqual([]);
  });
});
