/* Hai thứ đợt này: sinh sẵn không được bỏ sót combo, và mọi bảng dài phải chia
   trang với cỡ trang do người dùng chọn. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { clickButton, collectErrors, getState, goToView, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';

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

/* 40 × 40 = 1600 tổ hợp phân biệt trên hai cột khoá — vượt hẳn trần cứng 800 cũ. */
const BIG_HEADCOUNT = `
  const rows = [];
  for (let a = 0; a < 40; a++) {
    for (let b = 0; b < 40; b++) {
      rows.push({ ID: a * 40 + b, Dept: 'D' + a, Unit: 'U' + b,
        Coefficient: 1, __m: new Array(12).fill(1) });
    }
  }
  st.S.hc = { headers: ['ID', 'Dept', 'Unit', 'Coefficient'], rows, file: 'to.xlsx', at: '' };
  st.S.cols = [
    { src: 'ID', alias: 'ID', role: 'key', month: null, type: 'num' },
    { src: 'Dept', alias: 'Dept', role: 'attr', month: null, type: 'text' },
    { src: 'Unit', alias: 'Unit', role: 'attr', month: null, type: 'text' },
    { src: 'Coefficient', alias: 'Coefficient', role: 'attr', month: null, type: 'num' },
  ];
  st.S.classes = [{ id: 'cbig', name: 'NHOM_LON', type: 'text', keys: ['Dept', 'Unit'], rows: [], def: '' }];
  fm.ENGINE.invalidate(); st.setRESULT(null);
`;

describe('Sinh sẵn từ định biên với 2 cột khoá', () => {
  /* LỖI ĐÃ BÁO: classCombos() kết thúc bằng `return out.slice(0, 800)` — cắt cụt
     và không báo gì. Một cột khoá thì không chạm trần; từ hai cột trở lên tích
     chéo vượt 800 nên phần dư bị vứt, và màn hình hiện "xxx dòng định biên chưa
     khớp" mà người dùng không hiểu vì sao. */
  it('sinh đủ 1600 tổ hợp, không còn dòng nào chưa khớp', async () => {
    await inPage(page, BIG_HEADCOUNT + 'return true;');
    /* Để trống trần = không giới hạn (mặc định). */
    await inPage(page, 'st.S.ui.comboLimit = 0; return true;');
    await goToView(page, 'Phân loại nhóm');

    expect(await clickButton(page, '.content button', 'Sinh sẵn từ định biên')).toBe(true);
    await page.waitForTimeout(1200);

    const rows = (await getState(page)).classes[0].rows;
    expect(rows).toHaveLength(1600);

    /* Thước đo thật sự: không còn dòng định biên nào chưa khớp. */
    const miss = await inPage(page, `
      const cls = await import('/src/views/classes.js');
      return cls.classMissCount(st.S.classes[0]);
    `);
    expect(miss).toBe(0);
  });

  it('đặt trần thì dừng đúng ở trần VÀ báo cho người dùng biết', async () => {
    await inPage(page, BIG_HEADCOUNT + 'st.S.ui.comboLimit = 500; return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Phân loại nhóm');

    await clickButton(page, '.content button', 'Sinh sẵn từ định biên');
    await page.waitForTimeout(1200);

    expect((await getState(page)).classes[0].rows).toHaveLength(500);
    /* Cắt thì phải nói — im lặng chính là lỗi cũ. */
    const toastText = await page.evaluate(() =>
      [...document.querySelectorAll('.toast, .toasts *')].map((x) => x.textContent).join(' '));
    expect(toastText).toMatch(/trần|500/i);
  });
});

describe('Phân trang dùng chung', () => {
  it('cỡ trang quyết định số dòng dựng ra, và ‹ Trước / Sau › nhảy đúng lát', async () => {
    await inPage(page, BIG_HEADCOUNT + 'st.S.ui.pageSize = 25; return true;');
    await goToView(page, 'Định biên');

    const countRows = () => page.evaluate(() =>
      document.querySelectorAll('.panel .tw tbody tr').length);
    expect(await countRows()).toBe(25);

    /* Đổi cỡ trang qua đúng ô chọn trên giao diện. */
    await page.selectOption('.pager select', '100');
    await page.waitForTimeout(300);
    expect(await countRows()).toBe(100);

    const first = () => page.evaluate(() =>
      document.querySelector('.panel .tw tbody tr td').textContent);
    const p1 = await first();
    await clickButton(page, '.pager button', 'Sau');
    await page.waitForTimeout(300);
    const p2 = await first();
    expect(p2).not.toBe(p1);

    await clickButton(page, '.pager button', 'Trước');
    await page.waitForTimeout(300);
    expect(await first()).toBe(p1);
  });

  it('"Tất cả" dựng hết, và cỡ trang sống qua lần render lại', async () => {
    await inPage(page, BIG_HEADCOUNT + 'st.S.ui.pageSize = 0; return true;');
    await goToView(page, 'Định biên');
    expect(await page.evaluate(() => document.querySelectorAll('.panel .tw tbody tr').length)).toBe(1600);

    await goToView(page, 'Kết quả');
    await goToView(page, 'Định biên');
    expect(await inPage(page, 'return st.S.ui.pageSize;')).toBe(0);
  });

  it('lọc trước, phân trang sau — số trang tính trên kết quả lọc', async () => {
    await inPage(page, BIG_HEADCOUNT + 'st.S.ui.pageSize = 25; return true;');
    await goToView(page, 'Định biên');
    await page.fill('.panel header input[type=text]', 'U7');
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => document.querySelector('.pager .muted:last-child').textContent);
    /* Dept D0..D39 × Unit U7 = 40 dòng khớp; nhãn phải nói 40, không phải 1600. */
    expect(info).toContain('40');
    expect(info).not.toContain('1600');
  });
});

describe('đệm của thanh phân trang', () => {
  /* LỖI ĐÃ BÁO: pg.node bị nhét thẳng vào `.body.tight` (padding 0) nên thanh
     phân trang dính sát góc và cạnh panel. Bảng Phân loại nhóm đặt đúng ngay từ
     đầu — nó là mốc, mọi bảng khác phải khớp với nó. */

  /* Thanh phân trang tự ẩn khi danh sách ngắn (≤ 25 dòng), nên phải bơm dữ liệu
     cho từng bảng thì mới có cái để đo. */
  const SEED = BIG_HEADCOUNT + `
    const many = (n, f) => { const a = []; for (let i = 0; i < n; i++) a.push(f(i)); return a; };
    st.S.classes[0].rows = many(40, (i) => { return ['D' + i, 'U' + i, 'G' + i]; });
    st.S.exceptions = many(40, (i) => {
      return { id2: 'x' + i, no: 'TT-' + i, id: i, position: '', formulaCode: '',
        amount: 1000, months: [], rule: 'MAX', note: '', active: true };
    });
    st.S.maps.costCode = many(40, (i) => {
      return { formulaCode: 'FC_' + i, costCode: 'CC_' + i, name: 'CC ' + i };
    });
    st.S.ui.pageSize = 25;
  `;

  /** Đệm trái và đệm dưới của thanh phân trang ĐANG HIỆN so với mép panel. */
  const padOf = () => page.evaluate(() => {
    /* Panel gập lại có display:none nên rect toàn số 0 — phải lấy thanh phân
       trang đang hiện, không lấy cái đầu tiên gặp trong DOM. */
    const p = [...document.querySelectorAll('.pager')]
      .find((x) => x.getBoundingClientRect().width > 0);
    if (!p) return null;
    const pb = p.getBoundingClientRect(), nb = p.closest('.panel').getBoundingClientRect();
    return { left: Math.round(pb.left - nb.left), bottom: Math.round(nb.bottom - pb.bottom) };
  });

  const measure = async (view) => {
    await inPage(page, SEED + 'return true;');
    await goToView(page, view);
    return padOf();
  };

  it('mọi màn lùi vào bằng đúng bảng Phân loại nhóm', async () => {
    const ref = await measure('Phân loại nhóm');
    expect(ref).not.toBeNull();
    /* Đệm trái phải bằng đệm dưới — dính một cạnh cũng là dính. */
    expect(ref.left).toBe(ref.bottom);
    expect(ref.left).toBeGreaterThan(8);

    for (const view of ['Định biên', 'Tờ trình ngoại lệ', 'Phân loại chi phí']) {
      const pad = await measure(view);
      expect(pad, view).not.toBeNull();
      expect(pad, view).toEqual(ref);
    }
  });
});

describe('toàn bộ luồng', () => {
  it('không một lỗi JavaScript nào', () => {
    expect(errs).toEqual([]);
  });
});

describe('thanh phân trang ẩn/hiện theo SỐ TRANG', () => {
  /* LỖI: apply() so số dòng với hằng PAGE_SIZES[0] (25) chứ không so với cỡ
     trang đang dùng. Cỡ 100 mà có 30 dòng thì chỉ một trang, vẫn hiện thanh
     điều hướng vô nghĩa. Với các cỡ chọn được trên giao diện hai điều kiện
     thường trùng nhau nên không ai gặp — nhưng nó vẫn sai. */
  const seed = (n, size) => inPage(page, `
    const rows = [];
    for (let a = 0; a < ${n}; a++) rows.push({ ID: a, Dept: 'D' + a, Unit: 'U' + a, Coefficient: 1, __m: new Array(12).fill(1) });
    st.S.hc = { headers: ['ID', 'Dept', 'Unit', 'Coefficient'], rows, file: 'to.xlsx', at: '' };
    st.S.cols = [
      { src: 'ID', alias: 'ID', role: 'key', month: null, type: 'num' },
      { src: 'Dept', alias: 'Dept', role: 'attr', month: null, type: 'text' },
      { src: 'Unit', alias: 'Unit', role: 'attr', month: null, type: 'text' },
      { src: 'Coefficient', alias: 'Coefficient', role: 'attr', month: null, type: 'num' },
    ];
    st.S.ui.pageSize = ${size};
    fm.ENGINE.invalidate(); st.setRESULT(null);
    return true;
  `);

  const shown = () => page.evaluate(() => {
    const p = [...document.querySelectorAll('.pager')].find((x) => x.closest('.panel'));
    return p ? getComputedStyle(p).display !== 'none' : null;
  });

  it('cỡ trang 100, 30 dòng — MỘT trang thì ẩn', async () => {
    await seed(30, 100);
    await goToView(page, 'Định biên');
    expect(await shown()).toBe(false);
  });

  it('cỡ trang 25, 30 dòng — hai trang thì hiện', async () => {
    await seed(30, 25);
    await goToView(page, 'Định biên');
    expect(await shown()).toBe(true);
  });

  it('cỡ trang 25, đúng 25 dòng — một trang thì ẩn', async () => {
    await seed(25, 25);
    await goToView(page, 'Định biên');
    expect(await shown()).toBe(false);
  });

  it('"Tất cả" với danh sách dài vẫn HIỆN — ô chọn cỡ trang nằm trong đó', async () => {
    await seed(200, 0);
    await goToView(page, 'Định biên');
    expect(await shown()).toBe(true);
  });
});
