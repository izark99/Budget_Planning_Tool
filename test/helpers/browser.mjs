/* Vỏ bọc Playwright: mở trình duyệt, đăng nhập, nạp file định biên mẫu.
   Ba việc mà gần như tệp kiểm e2e nào cũng phải làm. */
import { chromium } from 'playwright';
import { FIXTURE_XLSX, LAUNCH, TEST_ENV } from './env.mjs';

export async function launch() {
  return chromium.launch(LAUNCH);
}

/** Bắt mọi lỗi JS của trang — console sạch là một phần của phép kiểm. */
export function collectErrors(page) {
  const errs = [];
  const noise = (u) => (u || '').includes('favicon');
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !noise(m.location()?.url)) errs.push(m.text()); });
  page.on('requestfailed', (r) => { if (!noise(r.url())) errs.push('requestfailed ' + r.url()); });
  return errs;
}

/** Đăng nhập rồi chờ app dựng xong. */
export async function login(ctx, base, password = TEST_ENV.APP_PASSWORD) {
  const page = await ctx.newPage();
  await page.goto(base + '/login');
  await page.fill('#pass', password);
  await page.click('#btn');
  return page;
}

export async function loginToApp(ctx, base) {
  const page = await login(ctx, base);
  await page.waitForURL(base + '/', { timeout: 15000 });
  await page.waitForSelector('.shell .rail', { timeout: 15000 });
  return page;
}

/** Nạp file định biên mẫu qua đúng giao diện thật (ô kéo-thả + modal xác nhận). */
export async function importHeadcount(page, file = FIXTURE_XLSX) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.drop')]);
  await chooser.setFiles(file);
  await page.waitForSelector('.modal', { timeout: 15000 });
  await page.click('.modal footer button.pri');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 });
  await page.waitForTimeout(400);
}

/** Bấm một tab trên thanh điều hướng trái theo nhãn. */
export async function goToView(page, label) {
  for (const btn of await page.$$('.rail .nav button')) {
    if (((await btn.textContent()) || '').includes(label)) {
      await btn.click();
      await page.waitForTimeout(550);
      return true;
    }
  }
  return false;
}

/** Bấm nút trong vùng nội dung theo nhãn; trả về false nếu không có. */
export async function clickButton(page, selector, label) {
  for (const b of await page.$$(selector)) {
    if (((await b.textContent()) || '').includes(label)) { await b.click(); return true; }
  }
  return false;
}

/* Chạy tính rồi xuất Excel qua đúng luồng giao diện; trả về nội dung tệp tải về.
   Bộ chọn sheet để nguyên mặc định của modal — đổi là golden lệch. */
export async function runCalc(page) {
  await page.click('.topbar button.go');
  await page.waitForTimeout(1500);
}

export async function exportWorkbook(page, dir) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  await runCalc(page);
  if (!(await clickButton(page, '.content button', 'Xuất Excel'))) {
    throw new Error('không thấy nút "Xuất Excel" trên màn Kết quả');
  }
  await page.waitForSelector('.modal', { timeout: 10000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('.modal footer button.pri'),
  ]);
  const out = path.join(dir, dl.suggestedFilename());
  await dl.saveAs(out);
  return fs.readFileSync(out);
}

/* ---------------------------------------------------------------------------
   Chạy mã BÊN TRONG trang.

   Không viết thẳng hàm mũi tên vào page.evaluate được: Vite biến đổi mọi
   import() trong tệp kiểm thành __vite_ssr_dynamic_import__, mà Playwright thì
   gửi hàm sang trình duyệt bằng chính mã nguồn của nó — sang tới nơi là
   ReferenceError. Giữ đoạn mã ở dạng CHUỖI thì không bộ đóng gói nào đụng vào.

   Mọi đoạn đều có sẵn `st` (state.js) và `fm` (formula.js), và một tham số `a`. */
export function pageFn(body) {
  return `async (a) => {
    const st = await import('/src/core/state.js');
    const fm = await import('/src/core/formula.js');
    ${body}
  }`;
}

/** page.evaluate với đoạn mã dựng bằng pageFn.
    Playwright coi chuỗi truyền vào evaluate là một BIỂU THỨC chứ không phải hàm
    để gọi kèm tham số — nên dựng luôn cả lời gọi thành một biểu thức. */
export const inPage = (page, body, arg = null) =>
  page.evaluate(`(${pageFn(body)})(${JSON.stringify(arg === undefined ? null : arg)})`);

/** Lấy nguyên state đang chạy trong trang. */
export const getState = (page) => inPage(page, 'return JSON.stringify(st.S);').then(JSON.parse);

/** Đặt state rồi chạy tính lại từ đầu. */
export const setState = (page, s) =>
  inPage(page, 'st.setS(JSON.parse(a)); fm.ENGINE.invalidate(); st.setRESULT(null); return true;', JSON.stringify(s));
