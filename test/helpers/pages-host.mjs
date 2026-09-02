/* Máy chủ thử nghiệm: nạp CHÍNH các file trong functions/ (không sửa một ký tự)
   và dựng lại đúng hợp đồng của Cloudflare Pages Functions:
     - functions/_middleware.js  -> onRequest({ request, env, next })
     - functions/api/<x>.js      -> onRequestGet / onRequestPost
     - next()                    -> phục vụ tệp tĩnh trong public/
   Node 22 có sẵn Request/Response/Headers/crypto.subtle/atob/btoa nên các
   Function chạy y như trên workerd ở mọi thứ mà checklist §11 kiểm.        */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.argv[2] || process.cwd();
const PORT = Number(process.argv[3] || 8788);
const PUBLIC = path.join(ROOT, 'public');

/* Nguồn biến môi trường, ưu tiên tăng dần:
     1. .dev.vars nếu có  — tiện khi chạy tay, nhưng file này nằm trong .gitignore
     2. biến môi trường   — cách bộ kiểm truyền vào, để không phụ thuộc file bí mật
   Bộ kiểm PHẢI chạy được trên máy vừa clone về, chưa có .dev.vars. */
const env = {};
const devVars = path.join(ROOT, '.dev.vars');
if (fs.existsSync(devVars)) {
  for (const line of fs.readFileSync(devVars, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i > 0) env[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  }
}
for (const k of ['APP_PASSWORD', 'JWT_SECRET', 'SESSION_MINUTES'])
  if (process.env[k]) env[k] = process.env[k];
if (!env.APP_PASSWORD || !env.JWT_SECRET) {
  console.error('thiếu APP_PASSWORD / JWT_SECRET — đặt bằng biến môi trường hoặc chép .dev.vars.example thành .dev.vars');
  process.exit(2);
}
console.log('env: SESSION_MINUTES=' + (env.SESSION_MINUTES || 30));

const bust = '?v=' + Date.now();
const mw = await import(pathToFileURL(path.join(ROOT, 'functions/_middleware.js')).href + bust);
const routes = {};
for (const f of fs.readdirSync(path.join(ROOT, 'functions/api'))) {
  if (!f.endsWith('.js')) continue;
  routes['/api/' + f.replace(/\.js$/, '')] =
    await import(pathToFileURL(path.join(ROOT, 'functions/api', f)).href + bust);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function serveStatic(url) {
  let p = decodeURIComponent(url.pathname);

  /* Pages mặc định html_handling = "auto-trailing-slash": file .html riêng lẻ được
     phục vụ ở URL KHÔNG có đuôi, còn /foo.html thì bị 308 về /foo. Bỏ qua hành vi
     này lúc kiểm thử là bỏ lọt cả một lớp lỗi vòng lặp chuyển hướng.
     https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/ */
  if (p.endsWith('.html') && !p.endsWith('/index.html')) {
    const clean = p.slice(0, -'.html'.length);
    return new Response(null, { status: 308, headers: { Location: clean } });
  }
  if (!p.endsWith('/') && !path.extname(p)) {
    const asHtml = path.join(PUBLIC, path.normalize(p + '.html'));
    if (asHtml.startsWith(PUBLIC) && fs.existsSync(asHtml) && fs.statSync(asHtml).isFile()) {
      return new Response(fs.readFileSync(asHtml), {
        status: 200, headers: { 'Content-Type': TYPES['.html'] },
      });
    }
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(PUBLIC, path.normalize(p));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response(fs.readFileSync(file), {
    status: 200,
    headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' },
  });
}

async function handle(request) {
  const url = new URL(request.url);
  const route = routes[url.pathname];
  const next = async () => {
    if (!route) return serveStatic(url);
    const fn = request.method === 'POST' ? route.onRequestPost
             : request.method === 'GET'  ? route.onRequestGet : null;
    if (!fn) return new Response('Method not allowed', { status: 405 });
    return fn({ request, env });
  };
  return mw.onRequest({ request, env, next });
}

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request('http://127.0.0.1:' + PORT + req.url, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    redirect: 'manual',
  });
  let out;
  try { out = await handle(request); }
  catch (e) { console.error('LỖI', req.url, e); out = new Response('error: ' + e.message, { status: 500 }); }
  const h = {};
  for (const [k, v] of out.headers) if (k.toLowerCase() !== 'set-cookie') h[k] = v;
  const sc = out.headers.getSetCookie ? out.headers.getSetCookie() : [];
  res.writeHead(out.status, sc.length ? { ...h, 'Set-Cookie': sc } : h);
  const buf = Buffer.from(await out.arrayBuffer());
  res.end(buf);
  console.log(`${req.method} ${req.url} -> ${out.status}`);
}).listen(PORT, '127.0.0.1', () => console.log('pages-host sẵn sàng trên http://127.0.0.1:' + PORT));
