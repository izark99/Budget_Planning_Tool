/* Dashboard: phần do tăng lương ở mọi chiều, và bảng pivot tuỳ chỉnh.

   Số liệu của cả ba việc đều bắt nguồn từ một chỗ: RESULT.dataNoRaise là bản
   tính lại với mọi đợt tăng bị bỏ, cùng hình dạng với RESULT.data, nên phần
   tăng của BẤT KỲ lát cắt nào chỉ là `data − dataNoRaise` cộng trên đúng lát
   đó. Vì vậy thước đo chính của tệp này là PHÉP CỘNG PHẢI KHỚP: gộp theo chiều
   nào, cắt theo lát nào, tổng cũng phải quay về đúng một con số.

   Gọi thẳng dashAggregate() qua inPage với state tự dựng — đúng cách
   paging.test.js gọi cls.classMissCount — để canh phép cộng ở độ chính xác gần
   như unit, rồi mới canh phần dựng hình. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import fs from 'node:fs';
import { LAUNCH, STATE_FIXTURE } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { collectErrors, goToView, importHeadcount, inPage, loginToApp, setState } from '../helpers/browser.mjs';

const snapshot = JSON.parse(fs.readFileSync(STATE_FIXTURE, 'utf8'));
let server, browser, ctx, page, errs;

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
  ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  page = await loginToApp(ctx, server.base);
  errs = collectErrors(page);
  await importHeadcount(page);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
});

/** Nạp fixture rồi chạy tính, qua đúng nút trên giao diện. */
async function runFixture(tweak) {
  await setState(page, snapshot);
  if (tweak) await inPage(page, tweak + ' return true;');
  await page.click('.topbar button.go');
  await page.waitForTimeout(2500);
}

/** Gom số theo một cấu hình pivot, trả về mọi tổng cần đối chiếu. */
const sums = (rows, col) => inPage(page, `
  const d = await import('/src/views/dashboard.js');
  const f = d.dashState();
  f.pivotRows = ${JSON.stringify(rows)}; f.pivotCol = ${JSON.stringify(col)};
  const A = d.dashAggregate(st.RESULT, f);
  const r = (x) => Math.round(x);
  let cell = 0, row = 0, rowUp = 0;
  Object.keys(A.pivot).forEach((k) => {
    const p = A.pivot[k];
    row += p.total; rowUp += p.raise;
    Object.keys(p.cells).forEach((c) => { cell += p.cells[c].v; });
  });
  let colV = 0, colUp = 0;
  Object.keys(A.pvColTot).forEach((c) => { colV += A.pvColTot[c].v; colUp += A.pvColTot[c].up; });
  const add = (o) => Object.keys(o).reduce((a, k) => a + o[k], 0);
  return {
    total: r(A.total), raise: A.raise === null ? null : r(A.raise),
    cell: r(cell), row: r(row), rowUp: r(rowUp), colV: r(colV), colUp: r(colUp),
    monthsRaise: r(A.monthsRaise.reduce((a, b) => a + b, 0)),
    byCcRaise: r(add(A.byCcRaise)), byFcRaise: r(add(A.byFcRaise)),
    nRows: Object.keys(A.pivot).length, nCols: Object.keys(A.pvColTot).length
  };
`);

describe('phép cộng phần do tăng lương', () => {
  beforeAll(async () => { await runFixture(); });

  it('mọi bản cộng song song đều quay về đúng một con số', async () => {
    const s = await sums(['Dept'], '__cc');
    expect(s.raise).toBeGreaterThan(0);
    /* Theo tháng, theo Cost Code, theo Formula Code — ba đường gộp khác nhau,
       cùng một tổng. Lệch nghĩa là một trong ba đang cộng nhầm lát. */
    expect(s.monthsRaise).toBe(s.raise);
    expect(s.byCcRaise).toBe(s.raise);
    expect(s.byFcRaise).toBe(s.raise);
  });

  it('chưa khai đợt tăng nào thì không có phần tăng, không phải là 0 giả', async () => {
    await runFixture('st.S.raises = [];');
    const s = await sums(['Dept'], '__cc');
    expect(s.raise).toBeNull();
    expect(s.total).toBeGreaterThan(0);
    await runFixture();
  });
});

describe('bảng pivot cộng đúng theo mọi chiều', () => {
  beforeAll(async () => { await runFixture(); });

  /* Đổi chiều cột thì cách gộp khoá đổi hẳn, nhưng tổng thì không được đổi —
     đây là phép kiểm bắt được lỗi gộp sai khoá. */
  for (const col of ['__cc', '__fc', '__month', 'Dept']) {
    it('chiều cột ' + col + ': tổng ô = tổng dòng = tổng cột = tổng chung', async () => {
      const s = await sums(['Dept'], col);
      expect(s.cell).toBe(s.total);
      expect(s.row).toBe(s.total);
      expect(s.colV).toBe(s.total);
      /* Và phần tăng cũng khớp trên cả hai chiều. */
      expect(s.rowUp).toBe(s.raise);
      expect(s.colUp).toBe(s.raise);
    });
  }

  it('đổi chiều cột KHÔNG làm đổi tổng hay phần tăng', async () => {
    const a = await sums(['Dept'], '__cc');
    const b = await sums(['Dept'], '__month');
    const c = await sums(['Dept'], 'Unit');
    expect([b.total, c.total]).toEqual([a.total, a.total]);
    expect([b.raise, c.raise]).toEqual([a.raise, a.raise]);
    /* Số cột thì phải khác — nếu không thì chiều cột chưa thực sự đổi. */
    expect(b.nCols).toBe(12);
    expect(b.nCols).not.toBe(a.nCols);
  });

  it('dòng NHIỀU CẤP: phần tăng vẫn chạy cho từng dòng, cộng lại bằng tổng', async () => {
    const one = await sums(['Dept'], '__cc');
    const two = await sums(['Dept', 'Unit'], '__cc');
    /* Thêm một cấp thì số dòng chỉ có thể tăng hoặc giữ nguyên. */
    expect(two.nRows).toBeGreaterThanOrEqual(one.nRows);
    expect(two.total).toBe(one.total);
    /* Yêu cầu chính của việc này: cột "Do tăng lương" của TỪNG dòng, cộng lại
       vẫn bằng đúng tổng phần tăng. */
    expect(two.rowUp).toBe(two.raise);

    const three = await sums(['Dept', 'Unit', 'Status'], '__month');
    expect(three.total).toBe(one.total);
    expect(three.rowUp).toBe(one.raise);
  });

  it('số dòng đúng bằng số bộ giá trị phân biệt của các cột đã chọn', async () => {
    const got = await inPage(page, `
      const d = await import('/src/views/dashboard.js');
      const f = d.dashState();
      f.pivotRows = ['Dept', 'Unit']; f.pivotCol = '__cc';
      const A = d.dashAggregate(st.RESULT, f);
      const seen = {};
      st.RESULT.rows.forEach((r) => { seen[String(r.Dept) + '|' + String(r.Unit)] = 1; });
      return { pivot: Object.keys(A.pivot).length, distinct: Object.keys(seen).length };
    `);
    expect(got.pivot).toBe(got.distinct);
  });
});

describe('trần số cột', () => {
  /* 60 giá trị Dept phân biệt để chắc chắn vượt trần 40. */
  const MANY = `
    const rows = [];
    for (let i = 0; i < 60; i++) {
      rows.push({ ID: i, Dept: 'D' + String(i).padStart(2, '0'), Unit: 'U', Position: 'P',
        Coefficient: 1, 1:1, 2:1, 3:1, 4:1, 5:1, 6:1, 7:1, 8:1, 9:1, 10:1, 11:1, 12:1 });
    }
    st.S.hc = { headers: ['ID','Dept','Unit','Position','Coefficient','1','2','3','4','5','6','7','8','9','10','11','12'], rows, file: 'to.xlsx', at: '' };
    st.S.cols = [
      { src: 'ID', alias: 'ID', role: 'key', month: null, type: 'num' },
      { src: 'Dept', alias: 'Dept', role: 'attr', month: null, type: 'text' },
      { src: 'Unit', alias: 'Unit', role: 'unit', month: null, type: 'text' },
      { src: 'Position', alias: 'Position', role: 'position', month: null, type: 'text' },
      { src: 'Coefficient', alias: 'Coefficient', role: 'attr', month: null, type: 'num' }
    ].concat([1,2,3,4,5,6,7,8,9,10,11,12].map((m) => {
      return { src: String(m), alias: String(m), role: 'month', month: m, type: 'num' };
    }));
    st.S.classes = []; st.S.policies = []; st.S.accruals = [];
    fm.ENGINE.invalidate(); st.setRESULT(null);
  `;

  beforeAll(async () => { await runFixture(MANY); });
  afterAll(async () => { await runFixture(); });

  it('gộp phần vượt trần vào một cột "Khác" — gộp chứ KHÔNG cắt', async () => {
    await inPage(page, `
      const d = await import('/src/views/dashboard.js');
      const f = d.dashState();
      f.pivotRows = ['Position']; f.pivotCol = 'Dept'; st.touch();
      return true;
    `);
    await goToView(page, 'Kết quả');
    await goToView(page, 'Dashboard');

    const panel = page.locator('.panel').filter({ has: page.locator('h3', { hasText: 'Bảng pivot' }) });
    /* 40 cột giá trị + "Khác" + (cột dòng, người-tháng, Cả năm, Do tăng lương, BQ). */
    const heads = await panel.locator('thead th').allTextContents();
    expect(heads.filter((h) => /^D\d\d$/.test(h))).toHaveLength(40);
    expect(heads.some((h) => h.startsWith('Khác'))).toBe(true);
    expect(await panel.locator('.tag.o').count()).toBeGreaterThan(0);

    /* Và tổng vẫn khớp: hàng TỔNG cộng các ô giá trị phải bằng ô "Cả năm". */
    const tot = await panel.locator('tbody tr.tot td').allTextContents();
    const num = (s2) => Number(String(s2).replace(/[^\d-]/g, '') || 0);
    const cells = tot.slice(2, 2 + 41).map(num).reduce((a, b) => a + b, 0);
    expect(cells).toBe(num(tot[2 + 41]));
  });
});

describe('giao diện', () => {
  beforeAll(async () => {
    await runFixture();
    await goToView(page, 'Dashboard');
  });

  it('cột chồng: tháng có phần tăng thì có đoạn tăng, tháng không có thì không', async () => {
    const got = await page.evaluate(() => {
      const cols = [...document.querySelectorAll('.bars .col')];
      return cols.map((c) => {
        const bar = c.querySelector('.bar'), up = c.querySelector('.bar > .up');
        return { h: bar.style.height, up: up ? up.style.height : null };
      });
    });
    expect(got).toHaveLength(12);
    /* Fixture khai đợt tăng từ tháng 7 — sáu tháng đầu không có đoạn nào. */
    expect(got.slice(0, 6).every((x) => x.up === null)).toBe(true);
    expect(got.slice(6).some((x) => x.up !== null)).toBe(true);
    /* Đoạn tăng tính tỉ lệ TRÊN CHÍNH CỘT, nên luôn ≤ 100%. */
    got.forEach((x) => { if (x.up) expect(parseFloat(x.up)).toBeLessThanOrEqual(100); });
  });

  it('có chú giải hai phần; bỏ hết đợt tăng thì không còn chú giải lẫn đoạn tăng', async () => {
    expect(await page.locator('.legend').count()).toBe(1);

    await runFixture('st.S.raises = [];');
    await goToView(page, 'Dashboard');
    expect(await page.locator('.legend').count()).toBe(0);
    expect(await page.locator('.bars .bar > .up').count()).toBe(0);
    /* Và cột "Do tăng lương" cũng không dựng — không thì là một cột toàn gạch. */
    const heads = await page.locator('.content thead th').allTextContents();
    expect(heads.some((h) => h.includes('Do tăng lương'))).toBe(false);

    await runFixture();
    await goToView(page, 'Dashboard');
  });

  it('hai bảng cơ cấu: cột "Do tăng lương" cộng lại bằng đúng tổng phần tăng', async () => {
    const s = await sums(['Dept'], '__cc');
    for (const title of ['Cơ cấu theo Cost Code', 'Chi tiết theo Formula Code']) {
      const panel = page.locator('.panel').filter({ has: page.locator('h3', { hasText: title }) });
      const heads = await panel.locator('thead th').allTextContents();
      const at = heads.indexOf('Do tăng lương');
      expect([title, at >= 0]).toEqual([title, true]);
      const vals = await panel.locator('tbody tr').evaluateAll((trs, i) =>
        trs.map((tr) => Number(String(tr.children[i].textContent).replace(/[^\d-]/g, '') || 0)), at);
      expect([title, vals.reduce((a, b) => a + b, 0)]).toEqual([title, s.raise]);
    }
  });

  it('cột đang làm chiều ngang KHÔNG xuất hiện trong dải chip dòng', async () => {
    const panel = page.locator('.panel').filter({ has: page.locator('h3', { hasText: 'Bảng pivot' }) });
    await panel.locator('select.pvcol').selectOption('Dept');
    await page.waitForTimeout(500);
    const chips = await panel.locator('.chips .chip').allTextContents();
    expect(chips).not.toContain('Dept');
    expect(chips).toContain('Unit');
  });

  it('dự án cũ chưa có cấu hình pivot vẫn mở ra đúng bảng như trước', async () => {
    await inPage(page, 'delete st.S.ui.dash.pivotRows; delete st.S.ui.dash.pivotCol; return true;');
    await goToView(page, 'Kết quả');
    await goToView(page, 'Dashboard');
    const got = await inPage(page, `
      const d = await import('/src/views/dashboard.js');
      const f = d.dashState();
      return { rows: f.pivotRows, col: f.pivotCol, groupCol: f.groupCol };
    `);
    /* Dòng = cột phân loại đang chọn, cột = Cost Code — đúng hình ma trận cũ. */
    expect(got.rows).toEqual([got.groupCol]);
    expect(got.col).toBe('__cc');
  });
});

describe('toàn bộ luồng', () => {
  it('không một lỗi JavaScript nào', () => {
    expect(errs, JSON.stringify(errs, null, 1)).toEqual([]);
  });
});
