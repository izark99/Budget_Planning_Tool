/* Ngân sách ngoài định biên: từ ô nhập tới tổng cuối cùng.

   Nguyên tắc chi phối của cả tính năng, và cũng là thước đo của tệp này: dòng
   ngoài định biên là TIỀN KHÔNG CÓ DÒNG ĐỊNH BIÊN. Ở đâu app cắt theo thứ chúng
   có (tháng, Cost Code, Division, Budget Code, Cost Center, Account Code) thì
   chúng tham gia bình thường; ở đâu app cắt theo thứ chúng không có (cột phân
   loại nhân sự, Formula Code, bình quân đầu người) thì chúng rơi vào một ô
   "(ngoài định biên)" hiện rõ, chứ KHÔNG biến mất. Nhờ vế sau, gộp chiều nào
   tổng cũng vẫn cộng đúng — đó là thứ hầu hết phép kiểm dưới đây canh. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LAUNCH, STATE_EXT } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { clickButton, collectErrors, getState, goToView, importHeadcount, inPage, loginToApp, setState } from '../helpers/browser.mjs';
import { readCells } from '../helpers/xlsx-cells.mjs';

const snapshot = JSON.parse(fs.readFileSync(STATE_EXT, 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpt-ext-'));
let server, browser, ctx, page, errs;

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
  ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  page = await loginToApp(ctx, server.base);
  errs = collectErrors(page);
  await importHeadcount(page);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Nạp fixture có ngân sách ngoài định biên rồi chạy tính qua đúng nút trên giao diện. */
async function runFixture(tweak) {
  await setState(page, snapshot);
  if (tweak) await inPage(page, tweak + ' return true;');
  await page.click('.topbar button.go');
  await page.waitForTimeout(2600);
}

async function exportTo(label) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    clickButton(page, '.content button', label),
  ]);
  const out = path.join(tmp, Date.now() + '-' + dl.suggestedFilename());
  await dl.saveAs(out);
  return out;
}

async function importFrom(file) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    clickButton(page, '.content button', 'Nhập từ Excel'),
  ]);
  await chooser.setFiles(file);
  await page.waitForSelector('.modal', { timeout: 15000 });
  await page.click('.modal footer button.pri');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 });
  await page.waitForTimeout(600);
}

/* Mọi con số cần đối soát, lấy thẳng từ trang. */
const numbers = () => inPage(page, `
  const x = await import('/src/core/external.js');
  const R = st.RESULT;
  const r = (v) => Math.round(v);
  return {
    grand: r(R.grand), ext: r(R.external.grand), n: R.external.n,
    all: r(x.grandAll(R)),
    sumMonths: r(x.monthTotalsAll(R).reduce((a, b) => a + b, 0)),
    sumPivot: r(x.pivotAll(R).reduce((a, p) => a + p.total, 0)),
    nPivot: x.pivotAll(R).length, nBase: R.pivot.length,
    mark: x.extMark()
  };
`);

describe('thanh điều hướng', () => {
  it('tab Ngoài định biên đứng thứ 11, ngay trước Kết quả', async () => {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.rail .nav button')].map((b) => b.textContent.trim()));
    const idx = labels.findIndex((x) => x.includes('Ngoài định biên'));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(labels[idx]).toMatch(/^11/);
    expect(labels[idx + 1]).toMatch(/^12.*Kết quả/);
    expect(labels[idx + 2]).toMatch(/^13.*Dashboard/);
    expect(labels[idx + 3]).toMatch(/^14.*So sánh/);
  });
});

describe('vòng đời Excel', () => {
  it('xuất dữ liệu rồi nhập lại ra đúng từng dòng, từng ô tháng', async () => {
    await setState(page, snapshot);
    await goToView(page, 'Ngoài định biên');
    const before = (await getState(page)).external;
    expect(before.length).toBeGreaterThanOrEqual(3);

    const file = await exportTo('Xuất dữ liệu');

    await inPage(page, 'st.S.external.length = 0; return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Ngoài định biên');
    expect((await getState(page)).external).toHaveLength(0);

    await importFrom(file);
    const after = (await getState(page)).external;
    const shape = (r) => [r.division, r.budgetCode, r.costCenter, r.costCode, r.accountCode, r.name]
      .concat(Array.from({ length: 12 }, (_, i) => Number(r['m' + (i + 1)]) || 0));
    expect(after.map(shape)).toEqual(before.map(shape));
  });

  it('“Tải mẫu Excel” cho ra mẫu TRỐNG, không kèm dữ liệu đang khai', async () => {
    await setState(page, snapshot);
    await goToView(page, 'Ngoài định biên');
    const file = await exportTo('Tải mẫu Excel');
    const cells = readCells(fs.readFileSync(file));
    const sheet = cells.NgoaiDinhBien;
    expect(sheet).toBeTruthy();
    /* Chỉ có dòng tiêu đề — không một mã nào của dự án lọt vào file mẫu. */
    const rows = Object.keys(sheet).map((ref) => +/\d+/.exec(ref)[0]);
    expect(Math.max(...rows)).toBe(1);
    expect(Object.values(sheet)).toContain('Division');
    expect(Object.values(sheet)).toContain('T12');
  });
});

describe('gộp vào kết quả cuối cùng', () => {
  beforeAll(async () => { await runFixture(); });

  it('mọi đường cộng đều quay về đúng một con số', async () => {
    const s = await numbers();
    expect(s.n).toBeGreaterThan(0);
    expect(s.ext).toBeGreaterThan(0);
    expect(s.all).toBe(s.grand + s.ext);
    /* Ba đường gộp khác nhau — theo tháng, theo bảng pivot, cộng thẳng — cùng
       một tổng. Lệch nghĩa là một trong ba đang bỏ sót. */
    expect(s.sumMonths).toBe(s.all);
    expect(s.sumPivot).toBe(s.all);
    expect(s.nPivot).toBe(s.nBase + s.n);
  });

  it('màn Kết quả: thẻ tổng, chân bảng và bảng pivot khớp nhau', async () => {
    await goToView(page, 'Kết quả');
    const s = await numbers();
    const vnd = (n) => new Intl.NumberFormat('vi-VN').format(n);

    /* Thẻ "Ngoài định biên" đứng riêng — con số không hoà tan vào tổng. */
    const card = await page.evaluate(() => {
      const st2 = [...document.querySelectorAll('.content .stat')]
        .find((x) => x.querySelector('.k') && x.querySelector('.k').textContent.includes('ngoài định biên'));
      return st2 ? st2.querySelector('.u').textContent : null;
    });
    expect(card).toContain(vnd(s.ext));

    /* Chân bảng "Theo Formula Code" có đủ ba dòng và cộng đúng. */
    const tots = await page.evaluate(() =>
      [...document.querySelectorAll('.content tr.tot')].map((tr) => tr.textContent));
    expect(tots.some((x) => x.includes('TỔNG CỘNG (kể cả ngoài định biên)'))).toBe(true);
    expect(tots.some((x) => x.includes(vnd(s.all)))).toBe(true);
    expect(tots.some((x) => x.includes(vnd(s.grand)))).toBe(true);
  });

  it('dòng ngoài định biên trong bảng pivot mang dấu và được đánh dấu', async () => {
    await goToView(page, 'Kết quả');
    const marked = await page.evaluate(() =>
      [...document.querySelectorAll('.content tr.ext')].length);
    expect(marked).toBeGreaterThan(0);
    const s = await numbers();
    const texts = await page.evaluate(() =>
      [...document.querySelectorAll('.content tbody tr')].map((tr) => tr.textContent));
    expect(texts.filter((x) => x.includes(s.mark)).length).toBeGreaterThan(0);
  });
});

describe('file Excel', () => {
  let cells, s;
  beforeAll(async () => {
    await runFixture();
    s = await numbers();
    await goToView(page, 'Kết quả');
    await clickButton(page, '.content button', 'Xuất Excel');
    await page.waitForSelector('.modal', { timeout: 10000 });
    /* Bật hết mọi sheet, kể cả ChiTiet_Dong (mặc định tắt vì rất dài). */
    for (const cb of await page.$$('.modal input[type=checkbox]')) {
      if (!(await cb.isChecked())) await cb.check();
    }
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('.modal footer button.pri'),
    ]);
    const f = path.join(tmp, 'ket-qua.xlsx');
    await dl.saveAs(f);
    cells = readCells(fs.readFileSync(f));
  });

  const colOf = (sheet, name) => {
    for (const [ref, v] of Object.entries(cells[sheet])) {
      const m = /^([A-Z]+)1$/.exec(ref);
      if (m && v === name) return m[1];
    }
    return null;
  };
  const sumCol = (sheet, col, from) => {
    let out = 0;
    for (const [ref, v] of Object.entries(cells[sheet])) {
      const m = /^([A-Z]+)(\d+)$/.exec(ref);
      if (m && m[1] === col && +m[2] >= from && v !== '' && isFinite(Number(v))) out += Number(v);
    }
    return out;
  };

  it('không thêm sheet mới nào — chỉ thêm dòng vào sheet đang có', () => {
    expect(Object.keys(cells)).toEqual([
      'NganSach_TheoNguoi', 'TongHop_PhanLoai', 'TongHop_FormulaCode',
      'DoiChieu_ToTrinh', 'BanKhaiBao', 'ChiTiet_Dong'
    ]);
  });

  it('hai sheet tổng hợp cộng ra CÙNG một con số', () => {
    /* Trước đợt này chúng đã bằng nhau; thêm ngân sách ngoài định biên mà chỉ
       vào một sheet thì người đọc file phát hiện ra ngay. */
    const pv = sumCol('TongHop_PhanLoai', colOf('TongHop_PhanLoai', 'CaNam'), 2);
    const rows = Object.keys(cells.TongHop_FormulaCode).map((r) => +/\d+/.exec(r)[0]);
    const last = Math.max(...rows);
    const fcTotal = Number(cells.TongHop_FormulaCode[colOf('TongHop_FormulaCode', 'CaNam') + last]);
    expect(Math.round(pv)).toBe(s.all);
    expect(Math.round(fcTotal)).toBe(s.all);
  });

  it('ChiTiet_Dong CHỈ có phần định biên — và điều đó được khai ra', () => {
    /* Sheet này đi theo TỪNG DÒNG NHÂN SỰ nên không chở được khoản ngoài định
       biên. Chốt con số lại ở đây để nó là điều đã biết, không phải một lệch
       phát hiện sau. */
    const sum = sumCol('ChiTiet_Dong', colOf('ChiTiet_Dong', 'SoTien'), 2);
    expect(Math.round(sum)).toBe(s.grand);
    expect(Math.round(sum)).not.toBe(s.all);
    /* Và bản khai báo nói thẳng ra chuyện đó. */
    const audit = Object.values(cells.BanKhaiBao).map(String).join(' | ');
    expect(audit).toContain('NGOAI DINH BIEN');
    expect(audit).toContain('ChiTiet_Dong');
  });

  it('sheet theo người KHÔNG dính một đồng ngoài định biên nào', () => {
    const txt = Object.values(cells.NganSach_TheoNguoi).map(String).join(' | ');
    expect(txt).not.toContain(s.mark);
  });
});

describe('Dashboard', () => {
  beforeAll(async () => { await runFixture(); });

  it('chưa lọc gì: gộp vào tổng, vào biểu đồ và vào cơ cấu Cost Code', async () => {
    await goToView(page, 'Dashboard');
    const s = await numbers();
    const vnd = (n) => new Intl.NumberFormat('vi-VN').format(n);

    const cards = await page.evaluate(() => [...document.querySelectorAll('.content .stat')]
      .map((x) => ({ k: x.querySelector('.k')?.textContent || '', u: x.querySelector('.u')?.textContent || '' })));
    const ext = cards.find((c) => c.k.includes('ngoài định biên'));
    expect(ext).toBeTruthy();
    expect(ext.u).toContain(vnd(s.ext));
    /* Thẻ đầu là tổng cuối cùng, phần định biên nằm ở dòng phụ. */
    expect(cards[0].u).toContain(vnd(s.grand));

    /* Biểu đồ 12 tháng có đoạn thứ ba và chú giải ba phần. */
    expect(await page.locator('.bars .bar > .ext').count()).toBeGreaterThan(0);
    expect(await page.locator('.legend .sw.ext').count()).toBe(1);
  });

  it('bảng pivot cộng đúng ở CẢ BỐN chiều cột', async () => {
    const recon = (col) => inPage(page, `
      const d = await import('/src/views/dashboard.js');
      const f = d.dashState();
      f.pivotRows = ['Dept']; f.pivotCol = ${JSON.stringify('__PLACEHOLDER__')};
      f.groupVal = ''; f.formulaCode = ''; f.costCode = '';
      (f.extra || []).forEach((x) => { x.col = ''; x.val = ''; });
      const A = d.dashAggregate(st.RESULT, f);
      const EX = d.extDash(st.RESULT, f);
      d.mergeExtPivot(A, EX, st.RESULT, f.pivotCol);
      const r = (x) => Math.round(x);
      let cell = 0, row = 0, colV = 0;
      Object.keys(A.pivot).forEach((k) => {
        const p = A.pivot[k]; row += p.total;
        Object.keys(p.cells).forEach((c) => { cell += p.cells[c].v; });
      });
      Object.keys(A.pvColTot).forEach((c) => { colV += A.pvColTot[c].v; });
      return { want: r(A.total + EX.total), cell: r(cell), row: r(row), col: r(colV) };
    `.replace('"__PLACEHOLDER__"', JSON.stringify(col)));

    for (const col of ['__cc', '__fc', '__month', 'Unit']) {
      const x = await recon(col);
      expect(x.cell, col).toBe(x.want);
      expect(x.row, col).toBe(x.want);
      expect(x.col, col).toBe(x.want);
    }
  });

  it('bật lọc theo cột định biên: giữ lại phần ngoài định biên VÀ nói ra', async () => {
    /* Những khoản này không có cột phân loại nào để mà lọc, nên cộng vào là
       nói dối. Bỏ đi trong im lặng cũng là nói dối — phải báo. */
    const before = await inPage(page, `
      const d = await import('/src/views/dashboard.js');
      const f = d.dashState(); f.groupCol = 'Dept'; f.groupVal = '';
      return Math.round(d.dashAggregate(st.RESULT, f).total);
    `);
    await inPage(page, `
      const d = await import('/src/views/dashboard.js');
      const f = d.dashState(); f.groupCol = 'Dept'; f.groupVal = 'AC'; return true;
    `);
    await goToView(page, 'Dashboard');

    const held = await inPage(page, `
      const d = await import('/src/views/dashboard.js');
      const EX = d.extDash(st.RESULT, d.dashState());
      return { held: EX.held, total: EX.total, amount: Math.round(EX.heldAmount) };
    `);
    expect(held.held).toBe(true);
    expect(held.total).toBe(0);
    expect(held.amount).toBeGreaterThan(0);

    /* Con số bị giữ lại phải hiện ra ở "Điểm cần soát", không im lặng biến mất. */
    const flags = await page.evaluate(() =>
      [...document.querySelectorAll('.content .panel')].map((p) => p.textContent).join(' '));
    expect(flags).toContain('KHÔNG nằm trong các con số');

    /* Và phần định biên KHÔNG bị phần ngoài định biên làm lệch. */
    await inPage(page, `
      const d = await import('/src/views/dashboard.js');
      const f = d.dashState(); f.groupVal = ''; return true;
    `);
    const after = await inPage(page, `
      const d = await import('/src/views/dashboard.js');
      return Math.round(d.dashAggregate(st.RESULT, d.dashState()).total);
    `);
    expect(after).toBe(before);
  });
});

describe('màn So sánh', () => {
  it('gộp chiều nào tổng cũng vẫn đúng, kể cả khi có ngoài định biên', async () => {
    await runFixture();
    const out = await inPage(page, `
      const c = await import('/src/views/compare.js');
      const A = c.summarise(st.RESULT, '');
      const sum = (o) => Object.keys(o).reduce((s, k) => s + o[k], 0);
      const r = (x) => Math.round(x);
      return {
        grand: r(A.grand), ext: r(A.ext), extN: A.extN,
        byFc: r(sum(A.byFc)), byCc: r(sum(A.byCc)),
        byDept: r(sum(A.byCol.Dept)),
        months: r(A.months.reduce((a, b) => a + b, 0))
      };
    `);
    expect(out.extN).toBeGreaterThan(0);
    expect(out.ext).toBeGreaterThan(0);
    /* Cùng thước đo compare.test.js đang dùng, nay canh cả phần ngoài định biên:
       theo Formula Code, theo Cost Code, theo một cột phân loại — cùng một tổng. */
    expect(out.byFc).toBe(out.grand);
    expect(out.byCc).toBe(out.grand);
    expect(out.byDept).toBe(out.grand);
    expect(out.months).toBe(out.grand);
  });

  it('một bên có ngoài định biên, bên kia không → có cảnh báo lệch cấu trúc', async () => {
    const warns = await inPage(page, `
      const c = await import('/src/views/compare.js');
      const A = c.summarise(st.RESULT, '');
      const B = JSON.parse(JSON.stringify(A));
      B.ext = 0; B.extN = 0;
      return c.structDiff(A, B);
    `);
    expect(warns.join(' | ')).toContain('ngoài định biên');
  });
});

describe('chưa có bảng định biên', () => {
  it('chỉ khai ngoài định biên thì VẪN chạy tính được', async () => {
    await setState(page, snapshot);
    await inPage(page, 'st.S.hc = { headers: [], rows: [], file: "", at: "" }; return true;');
    await page.click('.topbar button.go');
    await page.waitForTimeout(2200);
    const s = await numbers();
    expect(s.grand).toBe(0);
    expect(s.ext).toBeGreaterThan(0);
    expect(s.all).toBe(s.ext);
  });

  it('không có gì cả thì vẫn từ chối chạy, không dựng lớp phủ', async () => {
    await inPage(page, 'st.S.hc = { headers: [], rows: [], file: "", at: "" }; st.S.external = []; st.setRESULT(null); return true;');
    await page.click('.topbar button.go');
    await page.waitForTimeout(700);
    expect(await page.locator('.progmask').count()).toBe(0);
    expect(await inPage(page, 'return !!st.RESULT;')).toBe(false);
  });
});

describe('hoàn tác', () => {
  it('xoá một dòng rồi Hoàn tác thì dòng trở lại y nguyên', async () => {
    await setState(page, snapshot);
    await goToView(page, 'Ngoài định biên');
    const before = (await getState(page)).external;

    await page.locator('.content tbody tr').first().locator('button.del').click();
    await page.waitForTimeout(400);
    expect((await getState(page)).external).toHaveLength(before.length - 1);

    await page.locator('.toast button', { hasText: 'Hoàn tác' }).click();
    await page.waitForTimeout(500);
    expect((await getState(page)).external).toEqual(before);
  });
});

describe('console sạch', () => {
  it('không lỗi JS nào trong suốt bài kiểm', () => {
    expect(errs).toEqual([]);
  });
});
