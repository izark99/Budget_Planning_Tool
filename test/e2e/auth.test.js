/* CHECKLIST MỤC 11 CỦA BRIEF — phần chỉ chứng minh được bằng trình duyệt thật.
   Phần logic thuần (chữ ký, hết hạn, đổi mật khẩu) nằm ở test/unit/auth.test.js
   và chạy nhanh hơn nhiều; ở đây là những thứ cần một trình duyệt: cờ cookie do
   trình duyệt ghi nhận, đóng hẳn tiến trình rồi mở lại, giao thức file://,
   tắt mạng, và vòng lặp chuyển hướng. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LAUNCH, TEST_ENV } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { login, loginToApp } from '../helpers/browser.mjs';

let server, browser;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpt-e2e-'));

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('[1] chưa đăng nhập thì không lấy được gì', () => {
  it('mọi tệp tĩnh bị đá 302 về /login', async () => {
    const ctx = await browser.newContext();
    for (const p of ['/', '/index.html', '/app.js', '/content.md', '/styles.css',
      '/settings.md', '/modules/state.js', '/vendor/xlsx.min.js']) {
      const r = await ctx.request.get(server.base + p, { maxRedirects: 0 });
      expect(r.status(), p).toBe(302);
      expect(new URL(r.headers().location).pathname, p).toBe('/login');
    }
    await ctx.close();
  });

  it('/api/* trả 401 JSON, không chuyển hướng', async () => {
    const ctx = await browser.newContext();
    const r = await ctx.request.get(server.base + '/api/session', { maxRedirects: 0 });
    expect(r.status()).toBe(401);
    await ctx.close();
  });

  it('[1b] trang đăng nhập mở được và KHÔNG lộ mã app', async () => {
    const ctx = await browser.newContext();
    const body = await (await ctx.request.get(server.base + '/login')).text();
    expect(body).toContain('/api/login');
    expect(body).not.toContain('ENGINE');
    expect(body).not.toContain('defaultState');
    await ctx.close();
  });

  /* Đây là lỗi ĐÃ NỔ TRÊN PRODUCTION: Pages đặt html_handling
     "auto-trailing-slash" nên /login.html bị 308 về /login; hồi đó PUBLIC_PATHS
     chỉ có /login.html, thành / -> /login.html -> 308 /login -> / ...
     Safari báo "Too many redirects". Bản mô phỏng cũ không tái hiện được vì nó
     không bắt chước html_handling — nên phép kiểm này đi bằng TRÌNH DUYỆT THẬT,
     bám theo chuyển hướng tới cùng. */
  it('[1c] không có vòng lặp chuyển hướng', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let hops = 0;
    page.on('response', (r) => { if (r.status() >= 300 && r.status() < 400) hops++; });
    await page.goto(server.base + '/', { timeout: 20000 });
    expect(new URL(page.url()).pathname).toBe('/login');
    expect(hops).toBeLessThanOrEqual(2);
    await ctx.close();
  });

  it('/login.html bị 308 về /login đúng như Pages làm', async () => {
    const ctx = await browser.newContext();
    const r = await ctx.request.get(server.base + '/login.html', { maxRedirects: 0 });
    expect(r.status()).toBe(308);
    expect(r.headers().location).toBe('/login');
    await ctx.close();
  });
});

describe('[2] sai mật khẩu', () => {
  it('ba lần sai: báo lỗi, tuyệt đối không cấp cookie', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(server.base + '/login');
    for (let i = 1; i <= 3; i++) {
      await page.fill('#pass', 'sai-mat-khau-' + i);
      await page.click('#btn');
      await page.waitForFunction(
        () => document.getElementById('msg').textContent.trim() !== 'Đang kiểm tra...',
        null, { timeout: 8000 },
      );
      expect(await page.textContent('#msg')).toBe('Mật khẩu không đúng.');
    }
    expect(await ctx.cookies()).toEqual([]);
    /* Soi qua CDP để chắc chắn không có cookie nào ở bất kỳ origin nào. */
    const cdp = await ctx.newCDPSession(page);
    const all = (await cdp.send('Network.getAllCookies')).cookies;
    expect(all.filter((c) => c.name === 'session')).toEqual([]);
    await ctx.close();
  });
});

describe('[3] đăng nhập đúng', () => {
  it('vào app; cookie HttpOnly + Secure + SameSite=Strict, JS không đọc được', async () => {
    const ctx = await browser.newContext();
    const page = await loginToApp(ctx, server.base);
    const c = (await ctx.cookies()).find((x) => x.name === 'session');
    expect(c).toBeTruthy();
    expect(c.httpOnly).toBe(true);
    expect(c.secure).toBe(true);
    expect(c.sameSite).toBe('Strict');
    /* expires === -1 nghĩa là cookie PHIÊN: trình duyệt xoá khi đóng hẳn. */
    expect(c.expires).toBe(-1);
    expect(await page.evaluate(() => document.cookie)).not.toContain('session');
    await ctx.close();
  });

  it('[8] mọi phản hồi tĩnh mang Cache-Control: no-store', async () => {
    const ctx = await browser.newContext();
    const page = await loginToApp(ctx, server.base);
    const seen = [];
    page.on('response', (r) => seen.push([new URL(r.url()).pathname, r.headers()['cache-control']]));
    await page.reload({ waitUntil: 'networkidle' });
    expect(seen.length).toBeGreaterThan(5);
    expect(seen.filter(([, cc]) => cc !== 'no-store')).toEqual([]);
    await ctx.close();
  });
});

describe('[4] đóng hẳn trình duyệt rồi mở lại', () => {
  it('phiên mất, bị đá về login', async () => {
    const b2 = await chromium.launch(LAUNCH);
    const ctx2 = await b2.newContext();
    await loginToApp(ctx2, server.base);
    await b2.close();                                    // đóng HẲN tiến trình

    const b3 = await chromium.launch(LAUNCH);
    const page = await (await b3.newContext()).newPage();
    await page.goto(server.base + '/');
    expect(new URL(page.url()).pathname).toBe('/login');
    await b3.close();
  });
});

describe('[7] lưu trang ra .html rồi mở bằng file://', () => {
  it('không nạp được mã, không có dữ liệu, không gọi được API', async () => {
    /* Lưu DOM ĐÃ DỰNG lúc đang đăng nhập — bản đầy đủ nhất kẻ tấn công có được. */
    const ctx = await browser.newContext();
    const page = await loginToApp(ctx, server.base);
    const saved = path.join(tmp, 'saved-page.html');
    fs.writeFileSync(saved, await page.content());
    await ctx.close();

    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto('file://' + saved);
    await p2.waitForTimeout(1200);

    /* Khung HTML vẫn hiện vì đây là DOM đã dựng — nhưng nó là cái xác. */
    expect(await p2.evaluate(() => typeof window.XLSX)).toBe('undefined');
    expect(await p2.evaluate(() => {
      try { return !!window.localStorage.getItem('dhg_budget_state_v2'); } catch { return false; }
    })).toBe(false);
    const api = await p2.evaluate(async (base) => {
      try { return 'HTTP ' + (await fetch(base + '/api/session', { credentials: 'include' })).status; }
      catch (e) { return 'ném lỗi: ' + e.message; }
    }, server.base);
    expect(api).not.toBe('HTTP 200');
    const clickable = await p2.evaluate(() => {
      const b = document.querySelector('.rail .nav button');
      if (!b) return 'không có nút';
      const before = document.querySelectorAll('.rail .nav button.on')[0]?.textContent;
      b.click();
      return before === document.querySelectorAll('.rail .nav button.on')[0]?.textContent ? 'chết' : 'còn sống';
    });
    expect(clickable).toBe('chết');
    await ctx2.close();
  });
});

describe('[9] tắt mạng hoàn toàn', () => {
  it('đã đăng nhập vẫn không vào được', async () => {
    const ctx = await browser.newContext();
    await loginToApp(ctx, server.base);
    await ctx.setOffline(true);
    const page = await ctx.newPage();
    await expect(page.goto(server.base + '/', { timeout: 10000 })).rejects.toThrow();
    await ctx.close();
  });
});

describe('[6] đổi APP_PASSWORD', () => {
  it('mật khẩu cũ bị từ chối ngay trên tiến trình mới', async () => {
    const other = await startServer({ APP_PASSWORD: 'mat-khau-moi-hoan-toan-9981' });
    try {
      const tryLogin = async (base, pw) => {
        const ctx = await browser.newContext();
        const page = await login(ctx, base, pw);
        await Promise.race([
          page.waitForURL((u) => u.pathname === '/', { timeout: 10000 }),
          page.waitForFunction(() => {
            const el = document.getElementById('msg');
            const s = el && el.textContent.trim();
            return s && s !== 'Đang kiểm tra...';
          }, null, { timeout: 10000 }),
        ]).catch(() => {});
        const has = (await ctx.cookies()).some((c) => c.name === 'session');
        await ctx.close();
        return has;
      };
      expect(await tryLogin(server.base, TEST_ENV.APP_PASSWORD)).toBe(true);
      expect(await tryLogin(other.base, TEST_ENV.APP_PASSWORD)).toBe(false);
      expect(await tryLogin(other.base, 'mat-khau-moi-hoan-toan-9981')).toBe(true);
    } finally {
      await other.stop();
    }
    /* LƯU Ý: đây là đổi biến môi trường rồi khởi động lại tiến trình cục bộ.
       Tính chất "có hiệu lực ngay KHÔNG cần deploy lại" chỉ chứng minh được
       trên project Cloudflare thật bằng `wrangler pages secret put`. */
  });
});
