/* Dựng pages-host trên một cổng tự do, chờ tới lúc nó thật sự trả lời,
   và dọn sạch tiến trình con khi xong. Mỗi tệp kiểm gọi một lần. */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { ROOT, TEST_ENV } from './env.mjs';

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** @param {Record<string,string>} [envOverride] ví dụ { SESSION_MINUTES: '1' } */
export async function startServer(envOverride = {}) {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [path.join(ROOT, 'test/helpers/pages-host.mjs'), ROOT, String(port)],
    { env: { ...process.env, ...TEST_ENV, ...envOverride }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`pages-host thoát sớm (${child.exitCode}):\n${log.join('')}`);
    try {
      /* /login là đường công khai: trả 200 khi máy chủ đã sẵn sàng. */
      const r = await fetch(base + '/login', { redirect: 'manual' });
      if (r.status === 200) break;
    } catch { /* chưa lên, thử lại */ }
    if (Date.now() > deadline) throw new Error(`pages-host không lên sau 15s:\n${log.join('')}`);
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    base,
    port,
    log: () => log.join(''),
    async stop() {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await new Promise((r) => { child.once('exit', r); setTimeout(r, 3000); });
      }
    },
  };
}
