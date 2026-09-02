/* Gọi thẳng các Pages Function trong Node. Node 20+ có sẵn Request/Response/
   Headers/crypto.subtle/atob/btoa — đúng những API mà functions/ dùng — nên
   chạy được không cần workerd, không cần trình duyệt.
   Phần checklist §11 cần trình duyệt thật (cờ cookie, đóng-mở trình duyệt,
   file://) nằm ở test/e2e/auth.test.js. */
import { describe, expect, it } from 'vitest';
import { onRequest } from '../../functions/_middleware.js';
import { onRequestPost as login } from '../../functions/api/login.js';
import { onRequestPost as logout } from '../../functions/api/logout.js';
import { TEST_ENV } from '../helpers/env.mjs';

const ENV = { ...TEST_ENV };
const ORIGIN = 'https://vi-du.pages.dev';
const req = (p, init) => new Request(ORIGIN + p, init);
const post = (p, body) => req(p, { method: 'POST', body: JSON.stringify(body) });

async function tokenFor(env = ENV) {
  const r = await login({ request: post('/api/login', { password: env.APP_PASSWORD }), env });
  return r.headers.get('Set-Cookie').match(/session=([^;]+)/)[1];
}

/* next() giả: middleware chỉ cần một Response để bọc lại. */
const nextOk = () => new Response('nội dung', { status: 200, headers: { 'Content-Type': 'text/html' } });

describe('/api/login', () => {
  it('mật khẩu đúng: cấp cookie phiên đủ cờ, KHÔNG có Max-Age/Expires', async () => {
    const r = await login({ request: post('/api/login', { password: ENV.APP_PASSWORD }), env: ENV });
    expect(r.status).toBe(200);
    const c = r.headers.get('Set-Cookie');
    expect(c).toMatch(/^session=/);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Strict');
    /* Thiếu Max-Age/Expires chính là điều làm cookie chết khi đóng trình duyệt —
       yêu cầu của brief. Thêm vào là hỏng mục 4 của checklist. */
    expect(c).not.toMatch(/Max-Age|Expires/i);
  });

  it('mật khẩu sai: 401, không cấp cookie', async () => {
    const r = await login({ request: post('/api/login', { password: 'sai' }), env: ENV });
    expect(r.status).toBe(401);
    expect(r.headers.get('Set-Cookie')).toBeNull();
    expect(await r.json()).toEqual({ ok: false, reason: 'wrong' });
  });

  it('APP_PASSWORD chưa đặt: từ chối tất, kể cả mật khẩu rỗng', async () => {
    for (const pw of ['', 'bất kỳ']) {
      const r = await login({ request: post('/api/login', { password: pw }), env: { ...ENV, APP_PASSWORD: '' } });
      expect(r.status).toBe(401);
    }
  });

  it('thân request không phải JSON: 400', async () => {
    const r = await login({ request: req('/api/login', { method: 'POST', body: 'không-phải-json' }), env: ENV });
    expect(r.status).toBe(400);
  });
});

describe('_middleware — cổng chặn', () => {
  it('đường công khai đi thẳng, không cần cookie', async () => {
    for (const p of ['/login', '/login.html', '/api/login']) {
      const r = await onRequest({ request: req(p), env: ENV, next: nextOk });
      expect(r.status, p).toBe(200);
    }
  });

  /* Pages đặt html_handling="auto-trailing-slash": /login.html bị 308 về /login.
     Nếu PUBLIC_PATHS chỉ có một trong hai thì thành vòng lặp vô hạn — đúng lỗi
     đã nổ trên production ("Too many redirects"). Giữ CẢ HAI. */
  it('cả /login lẫn /login.html đều công khai (chống vòng lặp chuyển hướng)', async () => {
    const a = await onRequest({ request: req('/login'), env: ENV, next: nextOk });
    const b = await onRequest({ request: req('/login.html'), env: ENV, next: nextOk });
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it('không cookie: tệp tĩnh bị đá 302 về /login', async () => {
    for (const p of ['/', '/index.html', '/src/app.js', '/content.md', '/src/core/state.js', '/vendor/xlsx.min.js']) {
      const r = await onRequest({ request: req(p), env: ENV, next: nextOk });
      expect(r.status, p).toBe(302);
      expect(new URL(r.headers.get('Location')).pathname, p).toBe('/login');
    }
  });

  it('không cookie: /api/* trả 401 JSON, KHÔNG chuyển hướng', async () => {
    const r = await onRequest({ request: req('/api/session'), env: ENV, next: nextOk });
    expect(r.status).toBe(401);
    expect(r.headers.get('Content-Type')).toContain('application/json');
    expect(await r.json()).toEqual({ ok: false, reason: 'unauthorized' });
  });

  it('cookie hợp lệ: cho qua và đóng dấu Cache-Control: no-store', async () => {
    const r = await onRequest({
      request: req('/', { headers: { Cookie: `session=${await tokenFor()}` } }),
      env: ENV, next: nextOk,
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.text()).toBe('nội dung');
  });

  /* Sai lệch có chủ ý so với mã mẫu của brief: mẫu viết `{ ...response, headers }`
     nhưng Response phơi status qua getter trên prototype nên spread cho ra object
     rỗng, ép MỌI phản hồi tĩnh về 200 — kể cả 404. Phép kiểm này khoá lại điều đó. */
  it('giữ nguyên mã trạng thái của phản hồi tĩnh (404 không bị hoá thành 200)', async () => {
    const r = await onRequest({
      request: req('/khong-ton-tai', { headers: { Cookie: `session=${await tokenFor()}` } }),
      env: ENV,
      next: () => new Response('Not found', { status: 404, statusText: 'Not Found' }),
    });
    expect(r.status).toBe(404);
  });

  it('chữ ký sai / token vá lại: bị từ chối', async () => {
    const token = await tokenFor();
    const [payload, sig] = token.split('.');
    const forged = [
      token.slice(0, -3) + 'AAA',                                   // vặn chữ ký
      payload + '.' + sig.slice(0, -1),                             // cắt chữ ký
      btoa(JSON.stringify({ iat: Date.now(), exp: Date.now() + 1e9 })) + '.' + sig,  // vá payload
      'khong-phai-token',
      payload,                                                      // thiếu hẳn chữ ký
    ];
    for (const t of forged) {
      const r = await onRequest({ request: req('/', { headers: { Cookie: `session=${t}` } }), env: ENV, next: nextOk });
      expect(r.status, t.slice(0, 24)).toBe(302);
    }
  });

  it('đổi JWT_SECRET: mọi token cũ hết hiệu lực ngay', async () => {
    const old = await tokenFor();
    const r = await onRequest({
      request: req('/', { headers: { Cookie: `session=${old}` } }),
      env: { ...ENV, JWT_SECRET: 'bi-mat-khac-hoan-toan' }, next: nextOk,
    });
    expect(r.status).toBe(302);
  });

  it('đổi APP_PASSWORD: mật khẩu cũ bị từ chối ngay, không cần deploy lại', async () => {
    const env2 = { ...ENV, APP_PASSWORD: 'mat-khau-moi-hoan-toan' };
    const cu = await login({ request: post('/api/login', { password: ENV.APP_PASSWORD }), env: env2 });
    const moi = await login({ request: post('/api/login', { password: env2.APP_PASSWORD }), env: env2 });
    expect(cu.status).toBe(401);
    expect(moi.status).toBe(200);
  });

  it('token hết hạn: bị từ chối', async () => {
    /* SESSION_MINUTES âm => exp nằm trong quá khứ ngay lúc cấp. */
    const r0 = await login({ request: post('/api/login', { password: ENV.APP_PASSWORD }), env: { ...ENV, SESSION_MINUTES: '-1' } });
    const expired = r0.headers.get('Set-Cookie').match(/session=([^;]+)/)[1];
    const r = await onRequest({ request: req('/', { headers: { Cookie: `session=${expired}` } }), env: ENV, next: nextOk });
    expect(r.status).toBe(302);
  });

  it('SESSION_MINUTES quyết định hạn dùng của token', async () => {
    const r = await login({ request: post('/api/login', { password: ENV.APP_PASSWORD }), env: { ...ENV, SESSION_MINUTES: '45' } });
    expect((await r.json()).expiresInMinutes).toBe(45);
    const token = r.headers.get('Set-Cookie').match(/session=([^;]+)/)[1];
    const payload = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
    expect(Math.round((payload.exp - payload.iat) / 60000)).toBe(45);
  });
});

describe('/api/logout', () => {
  it('xoá cookie bằng Max-Age=0', async () => {
    const c = (await logout()).headers.get('Set-Cookie');
    expect(c).toContain('session=;');
    expect(c).toContain('Max-Age=0');
    expect(c).toContain('HttpOnly');
  });
});
