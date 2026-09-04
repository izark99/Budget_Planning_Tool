/* Phân loại nhóm sinh nhiều cột giá trị — đi qua đúng giao diện thật.

   Bảng khai từ trước chỉ có một cột và KHÔNG được chuyển đổi lúc nạp, nên phép
   kiểm này đi cả hai đường: bảng cũ dựng bằng tay trong state, và bảng mới tạo
   bằng nút trên màn hình. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { clickButton, collectErrors, getState, goToView, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';

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

/* Bảng KIỂU CŨ: không có outs, không có def[] — đúng thứ nằm trong file .json
   của người dùng hôm nay. */
/* Tiêu đề cột nay có thêm dấu phễu (nút lọc) và mũi tên sắp xếp — lấy đúng
   nhãn chứ không lấy textContent của cả <th>. */
const headLabels = () => page.evaluate(() =>
  [...document.querySelectorAll('.content table thead th')]
    .map((x) => (x.querySelector('.tvlbl') || x).textContent));

const LEGACY = `
  st.S.classes = [{ id: 'cold', name: 'NHOM_CU', type: 'text', keys: ['Dept'],
    rows: [['AC', 'X']], def: 'ZZ' }];
  st.S.ui.collapsed = {}; fm.ENGINE.invalidate(); st.setRESULT(null);
`;

describe('bảng khai từ trước vẫn chạy nguyên', () => {
  beforeAll(async () => {
    await inPage(page, LEGACY + 'return true;');
    await goToView(page, 'Phân loại nhóm');
  });

  it('hiện đúng một cột giá trị, mang tên cũ và kiểu cũ', async () => {
    const outs = await page.evaluate(() =>
      [...document.querySelectorAll('.content .row input.fx')].map((x) => x.value));
    expect(outs).toContain('NHOM_CU');
    /* Bảng dữ liệu vẫn có đúng một cột giá trị sau các cột khoá. */
    const heads = await headLabels();
    expect(heads).toContain('Dept');
    expect(heads).toContain('NHOM_CU');
  });

  it('máy tính vẫn thấy cột đó', async () => {
    expect(await inPage(page, 'return fm.ENGINE.classCols();')).toEqual(['NHOM_CU']);
  });

  it('state KHÔNG bị viết lại sau lưng khi chỉ mở màn ra xem', async () => {
    const cl = (await getState(page)).classes[0];
    expect(cl.outs).toBeUndefined();
    expect(cl.def).toBe('ZZ');
  });
});

describe('thêm cột giá trị thứ hai', () => {
  it('bấm "Thêm cột giá trị" thì bảng cũ được ghi sang hình dạng mới', async () => {
    await inPage(page, LEGACY + 'return true;');
    await goToView(page, 'Phân loại nhóm');

    expect(await clickButton(page, '.content button', 'Thêm cột giá trị')).toBe(true);
    await page.waitForTimeout(500);

    const cl = (await getState(page)).classes[0];
    expect(cl.outs.map((o) => o.name)).toEqual(['NHOM_CU', 'Cột 2']);
    expect(cl.def).toEqual(['ZZ', '']);
    /* Dòng dữ liệu phải dài thêm đúng một ô, ở ĐÚNG chỗ — không thì các cột sau lệch. */
    expect(cl.rows).toEqual([['AC', 'X', '']]);
  });

  it('đổi tên và kiểu cột thứ hai, khai giá trị, rồi dùng CẢ HAI trong một công thức', async () => {
    await inPage(page, `
      st.S.classes = [{ id: 'cnew', name: 'Bảng nhiều cột', keys: ['Dept'],
        outs: [{ name: 'NHOM', type: 'text' }, { name: 'HE_SO', type: 'num' }],
        rows: [['AC', 'X', 3]], def: ['ZZ', 9] }];
      st.S.formulas = [{ id: 'f1', code: 'FC_T', name: 'Thử', mode: 'monthly',
        months: [1,2,3,4,5,6,7,8,9,10,11,12],
        rules: [{ id: 'r1', name: 'Tất cả', cond: '', formula: 'IF([NHOM]="X", [HE_SO] * 1000, 0)' }] }];
      st.S.ui.collapsed = {}; fm.ENGINE.invalidate(); st.setRESULT(null);
      return true;
    `);
    await goToView(page, 'Phân loại nhóm');

    /* Hai cột giá trị hiện ra, và bảng dữ liệu có đủ hai cột. */
    const heads = await headLabels();
    expect(heads).toContain('NHOM');
    expect(heads).toContain('HE_SO');

    /* Công thức gọi được cả hai — dòng AC ra 3000, dòng khác ra 0. */
    const got = await inPage(page, `
      const rows = fm.ENGINE.previewRows();
      const i = rows.findIndex((r) => r.Dept === 'AC');
      const j = rows.findIndex((r) => r.Dept !== 'AC');
      return [fm.ENGINE.previewRow(st.S.formulas[0], i).months[0].raw,
              fm.ENGINE.previewRow(st.S.formulas[0], j).months[0].raw];
    `);
    expect(got).toEqual([3000, 0]);
  });

  /* LỖI ĐÃ BÁO: "Nhấn Thêm cột giá trị xong phải click cái nữa mới thêm được."
     Chuỗi sự kiện thật là mousedown → blur → mouseup → click. Bộ nghe `change`
     của ô tên cột nổ ở bước blur; gọi thẳng render() ở đó là xoá sạch
     document.body NGAY GIỮA cú bấm, mouseup rơi vào cây DOM khác và `click`
     không bao giờ nổ. Phải bấm bằng CHUỘT THẬT mới tái hiện được — el.click()
     chỉ bắn mỗi sự kiện click. */
  it('gõ tên cột rồi bấm "Thêm cột giá trị" MỘT lần: vừa đổi tên vừa thêm cột', async () => {
    await inPage(page, LEGACY + 'return true;');
    await goToView(page, 'Phân loại nhóm');

    /* Bảng cũ có tên bảng TRÙNG tên cột, nên phải neo vào đúng dòng khai cột:
       chỉ dòng đó mới có ô chọn kiểu bên cạnh. */
    await page.locator('.content .row', { has: page.locator('select') })
      .locator('input[value="NHOM_CU"]').fill('DOI_TEN');
    await page.locator('.content button', { hasText: 'Thêm cột giá trị' }).click();
    await page.waitForTimeout(500);

    const cl = (await getState(page)).classes[0];
    expect(cl.outs.map((o) => o.name)).toEqual(['DOI_TEN', 'Cột 2']);
  });

  /* Cùng cái bẫy, ở một nút khác: đổi tên cột A1 rồi bấm ✕ của cột A2. */
  it('gõ tên cột rồi bấm ✕ của cột khác cũng ăn ngay lần đầu', async () => {
    await inPage(page, `
      st.S.classes = [{ id: 'c2', name: 'B', keys: ['Dept'],
        outs: [{ name: 'A1', type: 'text' }, { name: 'A2', type: 'text' }],
        rows: [['AC', 'p', 'q']], def: ['', ''] }];
      st.S.ui.collapsed = {}; fm.ENGINE.invalidate(); st.setRESULT(null);
      return true;
    `);
    await goToView(page, 'Phân loại nhóm');

    await page.locator('.content .row', { has: page.locator('input[value="A1"]') })
      .locator('input[value="A1"]').fill('DOI_TEN');
    await page.locator('.content .row', { has: page.locator('input[value="A2"]') })
      .locator('button.del').click();
    await page.waitForTimeout(500);

    /* Một cú bấm phải làm CẢ HAI: ghi tên mới và bỏ cột kia. */
    const cl = (await getState(page)).classes[0];
    expect(cl.outs.map((o) => o.name)).toEqual(['DOI_TEN']);
    expect(cl.rows).toEqual([['AC', 'p']]);
  });

  it('bỏ một cột giá trị thì bỏ đúng ô đó ở mọi dòng', async () => {
    await inPage(page, `
      st.S.classes = [{ id: 'cdel', name: 'B', keys: ['Dept'],
        outs: [{ name: 'A1', type: 'text' }, { name: 'A2', type: 'text' }, { name: 'A3', type: 'text' }],
        rows: [['AC', 'p', 'q', 'r'], ['HR', 's', 't', 'u']], def: ['', '', ''] }];
      st.S.ui.collapsed = {}; fm.ENGINE.invalidate(); st.setRESULT(null);
      return true;
    `);
    await goToView(page, 'Phân loại nhóm');

    /* Nút ✕ của cột giữa — nút xoá cột giá trị nằm trong khối khai cột, không
       phải nút xoá dòng của bảng dữ liệu. */
    await page.locator('.content .row', { has: page.locator('input[value="A2"]') })
      .locator('button.del').click();
    await page.waitForTimeout(500);

    const cl = (await getState(page)).classes[0];
    expect(cl.outs.map((o) => o.name)).toEqual(['A1', 'A3']);
    expect(cl.rows).toEqual([['AC', 'p', 'r'], ['HR', 's', 'u']]);
  });

  it('bảng mới tạo bằng nút trên màn hình đã mang hình dạng nhiều cột', async () => {
    await inPage(page, 'st.S.classes = []; fm.ENGINE.invalidate(); st.setRESULT(null); return true;');
    await goToView(page, 'Phân loại nhóm');
    expect(await clickButton(page, '.content .panel header button.pri', 'Thêm bảng phân loại')).toBe(true);
    await page.waitForTimeout(500);
    const cl = (await getState(page)).classes[0];
    expect(cl.outs).toHaveLength(1);
    expect(cl.def).toEqual(['']);
  });
});

describe('toàn bộ luồng', () => {
  it('không một lỗi JavaScript nào', () => {
    expect(errs, JSON.stringify(errs, null, 1)).toEqual([]);
  });
});
