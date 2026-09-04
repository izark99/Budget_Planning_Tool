/* So sánh hai kịch bản ngân sách.

   Máy tính chỉ đọc S, nên chạy một bản khác = TRÁO STATE, CHẠY, RỒI TRẢ LẠI.
   Khối finally làm việc trả lại là phần quan trọng nhất của cả tính năng: mở
   một file để XEM mà mất bản đang làm thì hỏng nặng hơn mọi thứ tính năng này
   đem lại. Hai phép kiểm đầu tiên canh đúng chỗ đó — một lượt chạy trót lọt và
   một lượt máy tính ném lỗi giữa chừng.

   Phần còn lại canh PHÉP CỘNG, cùng thước đo đã dùng cho bảng pivot ở đợt
   trước: đổi chiều gộp thì tổng chênh lệch không được đổi. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LAUNCH, STATE_FIXTURE } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { collectErrors, getState, goToView, importHeadcount, inPage, loginToApp, setState } from '../helpers/browser.mjs';

const snapshot = JSON.parse(fs.readFileSync(STATE_FIXTURE, 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpt-cmp-'));
let server, browser, ctx, page, errs;

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
  ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  page = await loginToApp(ctx, server.base);
  errs = collectErrors(page);
  await importHeadcount(page);
  await setState(page, snapshot);
  await page.click('.topbar button.go');
  await page.waitForTimeout(2500);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Ghi một state ra file .json tạm, đúng hình dạng nút "Lưu file dự án" sinh ra. */
function writeProject(name, mutate) {
  const o = JSON.parse(JSON.stringify(snapshot));
  if (mutate) mutate(o);
  const p = path.join(tmp, name);
  fs.writeFileSync(p, JSON.stringify(o, null, 1));
  return p;
}

/** Mở file đối chiếu qua đúng giao diện thật (ô chọn file của trình duyệt). */
async function openCompareFile(file) {
  await goToView(page, 'So sánh');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.content button', { hasText: 'Mở file dự án .json để so' }).first().click()
  ]);
  await chooser.setFiles(file);
  await page.waitForTimeout(2000);
}

/** Chạy một state đối chiếu THẲNG qua compare.js và trả về mọi tổng cần đối
    chiếu — canh phép cộng ở độ chính xác gần như unit trước khi canh giao diện. */
const reconcile = (json) => inPage(page, `
  const c = await import('/src/views/compare.js');
  const before = JSON.stringify(st.S);
  const mark = st.RESULT;
  const B = c.runOther(st.projectFromJson(a), 'b.json');
  const A = c.summarise(st.RESULT, '');
  const r = (x) => Math.round(x);
  const dsum = (dim) => c.diffRows(A, B, dim).reduce((s, x) => s + x.d, 0);
  const sum = (o) => Object.keys(o).reduce((s, k) => s + o[k], 0);
  return {
    stateIntact: JSON.stringify(st.S) === before,
    resultKept: st.RESULT === mark,
    gA: r(A.grand), gB: r(B.grand), gap: r(B.grand - A.grand),
    byFc: r(dsum(c.DIM_FC)), byCc: r(dsum(c.DIM_CC)), byDept: r(dsum('Dept')),
    byMonth: r(B.months.reduce((s, v, i) => s + v - A.months[i], 0)),
    sumFcA: r(sum(A.byFc)), sumCcA: r(sum(A.byCc)), sumDeptA: r(sum(A.byCol.Dept)),
    warns: c.structDiff(A, B),
    nDiffRows: c.diffRows(A, B, c.DIM_FC).length
  };
`, json);

describe('bản đang làm không bị đụng vào', () => {
  it('chạy xong một bản đối chiếu thì S và RESULT vẫn y nguyên', async () => {
    const out = await reconcile(JSON.stringify(snapshot));
    expect(out.stateIntact).toBe(true);
    /* Cùng ĐÚNG một object, không phải một bản dựng lại trông giống. */
    expect(out.resultKept).toBe(true);
  });

  it('máy tính ném lỗi giữa chừng thì state vẫn được trả lại — đường finally', async () => {
    const broken = JSON.parse(JSON.stringify(snapshot));
    /* File dự án hỏng thật: có `hc` nên qua được cửa projectFromJson, nhưng
       `shared` bị sửa tay thành object thay vì mảng, nên máy tính vấp ngay lúc
       dựng bảng công thức dùng chung — nổ ở GIỮA lúc state của bản đối chiếu
       đang nằm trong S, đúng chỗ cần canh. */
    broken.shared = { LUONG_CO_BAN: 'ROUND([Coefficient]*LUONG_CO_SO,-3)' };

    const out = await inPage(page, `
      const c = await import('/src/views/compare.js');
      const before = JSON.stringify(st.S);
      const mark = st.RESULT;
      let threw = '';
      try { c.runOther(st.projectFromJson(a), 'hong.json'); }
      catch (e) { threw = String(e.message || e); }
      return {
        threw, stateIntact: JSON.stringify(st.S) === before, resultKept: st.RESULT === mark,
        rows: st.S.hc.rows.length
      };
    `, JSON.stringify(broken));

    expect(out.threw).not.toBe('');
    expect(out.stateIntact).toBe(true);
    expect(out.resultKept).toBe(true);
    expect(out.rows).toBe(snapshot.hc.rows.length);
  });
});

describe('phép cộng chênh lệch', () => {
  it('so với chính mình: mọi chênh lệch bằng 0, không cảnh báo lệch cấu trúc', async () => {
    const out = await reconcile(JSON.stringify(snapshot));
    expect(out.gA).toBeGreaterThan(0);
    expect(out.gB).toBe(out.gA);
    expect(out.gap).toBe(0);
    expect(out.byFc).toBe(0);
    expect(out.byCc).toBe(0);
    expect(out.byDept).toBe(0);
    expect(out.warns).toEqual([]);
  });

  it('mọi chiều gộp đều cộng về đúng tổng của bản đang làm', async () => {
    const out = await reconcile(JSON.stringify(snapshot));
    /* Ba đường gộp khác nhau — Formula Code, Cost Code, cột Dept — cùng một
       tổng. Lệch nghĩa là một trong ba đang bỏ sót dòng. */
    expect(out.sumFcA).toBe(out.gA);
    expect(out.sumCcA).toBe(out.gA);
    expect(out.sumDeptA).toBe(out.gA);
  });

  it('một công thức nhân đôi: chênh lệch gộp chiều nào cũng ra đúng một con số', async () => {
    const doubled = JSON.parse(JSON.stringify(snapshot));
    const fc = doubled.formulas.filter((f) => { return f.code === 'FC_BHXH'; })[0];
    fc.rules[0].formula = '(' + fc.rules[0].formula + ') * 2';

    const out = await reconcile(JSON.stringify(doubled));
    expect(out.gap).toBeGreaterThan(0);
    expect(out.byFc).toBe(out.gap);
    expect(out.byCc).toBe(out.gap);
    expect(out.byDept).toBe(out.gap);
    expect(out.byMonth).toBe(out.gap);
    /* Cấu trúc không đổi — chỉ có con số đổi. */
    expect(out.warns).toEqual([]);
  });

  it('dòng chỉ có ở một bên vẫn hiện, coi bên kia là 0', async () => {
    const less = JSON.parse(JSON.stringify(snapshot));
    const gone = less.formulas.pop();

    const out = await inPage(page, `
      const c = await import('/src/views/compare.js');
      const B = c.runOther(st.projectFromJson(a), 'b.json');
      const A = c.summarise(st.RESULT, '');
      const rows = c.diffRows(A, B, c.DIM_FC);
      const one = rows.filter((x) => x.k === ${JSON.stringify(gone.code)})[0];
      return { has: !!one, a: one ? Math.round(one.a) : 0, b: one ? one.b : -1 };
    `, JSON.stringify(less));

    expect(out.has).toBe(true);
    expect(out.a).toBeGreaterThan(0);
    expect(out.b).toBe(0);
  });
});

describe('lệch cấu trúc được nói ra', () => {
  it('thiếu Formula Code, khác số dòng định biên, khác năm — cảnh báo đủ ba', async () => {
    const odd = JSON.parse(JSON.stringify(snapshot));
    const gone = odd.formulas.pop().code;
    odd.hc.rows = odd.hc.rows.slice(0, 10);
    odd.meta.year = odd.meta.year + 1;

    const out = await reconcile(JSON.stringify(odd));
    const all = out.warns.join(' | ');
    expect(all).toContain(String(snapshot.meta.year));
    expect(all).toContain(String(odd.meta.year));
    expect(all).toContain(gone);
    expect(all).toContain('10');
    expect(out.warns.length).toBeGreaterThanOrEqual(3);
  });
});

describe('qua giao diện thật', () => {
  it('mở file đối chiếu rồi vẽ ra bảng chênh lệch, state vẫn nguyên', async () => {
    /* So phần DỰ ÁN, bỏ S.ui: chuyển sang tab So sánh và ghi nhớ chiều gộp đang
       xem là thao tác của người dùng, không phải dữ liệu bị đụng vào. */
    const strip = (x) => { const o = JSON.parse(JSON.stringify(x)); delete o.ui; return o; };
    const before = strip(await getState(page));
    await openCompareFile(writeProject('same.json'));

    const seen = await page.evaluate(() =>
      [...document.querySelectorAll('.content .panel > header h3')].map((x) => x.textContent).join(' | '));
    expect(seen).toContain('12 tháng');
    /* Ô chọn chiều gộp có mặt = bảng chênh lệch đã dựng. */
    expect(await page.locator('select.cmpdim').count()).toBe(1);

    expect(strip(await getState(page))).toEqual(before);
  });

  it('đổi chiều gộp thì bảng vẽ lại, không nổ', async () => {
    await page.selectOption('select.cmpdim', '__cc');
    await page.waitForTimeout(600);
    expect(await page.locator('select.cmpdim').count()).toBe(1);

    await page.selectOption('select.cmpdim', 'Dept');
    await page.waitForTimeout(600);
    const head = await page.evaluate(() =>
      [...document.querySelectorAll('.cmptbl thead .tvlbl')].map((x) => x.textContent));
    expect(head).toContain('Dept');
  });

  it('file rác thì báo lỗi và không đụng vào state', async () => {
    const strip = (x) => { const o = JSON.parse(JSON.stringify(x)); delete o.ui; return o; };
    const before = strip(await getState(page));
    const junk = path.join(tmp, 'rac.json');
    fs.writeFileSync(junk, '{"khong":"phai du an"}');

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('.content button', { hasText: 'Mở file dự án .json để so' }).first().click()
    ]);
    await chooser.setFiles(junk);
    await page.waitForTimeout(1200);

    expect(await page.locator('.toast.bad').count()).toBe(1);
    expect(strip(await getState(page))).toEqual(before);
    /* Bản đối chiếu cũ bị bỏ, màn hình quay về khối rỗng. */
    expect(await page.locator('select.cmpdim').count()).toBe(0);
  });
});

describe('console sạch', () => {
  it('không lỗi JS nào trong suốt bài kiểm', () => {
    expect(errs).toEqual([]);
  });
});
