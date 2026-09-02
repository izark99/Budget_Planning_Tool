/* CHECKLIST MỤC 5 — hết hạn phiên khi tab VẪN ĐANG MỞ.
   Tách riêng tệp vì đây là phép kiểm chậm nhất bộ: nhịp tim của app là 60 giây
   (SESSION_CHECK_INTERVAL_MS trong app.js) nên không có cách nào rút ngắn mà
   vẫn chứng minh được đúng thứ cần chứng minh. Rút ngắn bằng cách giả lập thì
   chỉ còn kiểm chính mã giả lập.
   Phần "token hết hạn thì middleware từ chối" đã có ở test/unit/auth.test.js và
   chạy trong mili-giây; ở đây là phần còn lại: tab tự phát hiện và tự thoát. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { loginToApp } from '../helpers/browser.mjs';

let server, browser;
beforeAll(async () => {
  server = await startServer({ SESSION_MINUTES: '1' });   // hết hạn lúc +60s
  browser = await chromium.launch(LAUNCH);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
});

describe('[5] hết hạn SESSION_MINUTES', () => {
  it('nhịp tim tự phát hiện và đá tab về /login', async () => {
    const ctx = await browser.newContext();
    const page = await loginToApp(ctx, server.base);
    const t0 = Date.now();

    /* Nhịp tim chạy mỗi 60s, phiên hết hạn ở +60s => phát hiện chậm nhất ở +120s. */
    await page.waitForURL((u) => u.pathname === '/login', { timeout: 150000 });
    const at = Math.round((Date.now() - t0) / 1000);
    expect(at).toBeGreaterThanOrEqual(55);
    expect(at).toBeLessThanOrEqual(150);
    await ctx.close();
  }, 170000);

  it('sau khi hết hạn, gọi thẳng /api/session ra 401', async () => {
    const ctx = await browser.newContext();
    const r = await ctx.request.get(server.base + '/api/session', { maxRedirects: 0 });
    expect(r.status()).toBe(401);
    await ctx.close();
  });
});
