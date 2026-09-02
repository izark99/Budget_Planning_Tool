/* Hằng số dùng chung cho bộ kiểm. Mật khẩu ở đây chỉ sống trong tiến trình
   pages-host cục bộ do chính bộ kiểm dựng lên — không liên quan gì tới
   APP_PASSWORD thật trên Cloudflare (đặt bằng `wrangler pages secret put`). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXTURE_XLSX = path.join(ROOT, 'test/fixtures/dinh-bien-mau.xlsx');
export const GOLDEN = path.join(ROOT, 'test/fixtures/golden-result.json');
export const GOLDEN_EXPORT = path.join(ROOT, 'test/fixtures/golden-export.json');
export const STATE_FIXTURE = path.join(ROOT, 'test/fixtures/state.json');

export const TEST_ENV = {
  APP_PASSWORD: 'matkhau-chi-dung-trong-bo-kiem',
  JWT_SECRET: 'bi-mat-chi-dung-trong-bo-kiem-khong-phai-cua-production',
  SESSION_MINUTES: '30',
};

/* Tìm Chromium theo thứ tự:
     1. CHROMIUM_PATH nếu người chạy chỉ định
     2. /opt/pw-browsers/chromium — bản cài sẵn của môi trường phát triển này;
        bản Playwright trong node_modules có thể trông chờ build số khác nên
        phải chỉ đường dẫn tuyệt đối, không để nó tự dò
     3. để trống -> Playwright tự dùng bản nó tải về (cách chạy trên CI)
   --no-sandbox vì cả CI lẫn container ở đây đều chạy bằng root. */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const preinstalled = '/opt/pw-browsers/chromium';
  return fs.existsSync(preinstalled) ? preinstalled : undefined;
}

export const CHROMIUM = findChromium();
export const LAUNCH = { ...(CHROMIUM ? { executablePath: CHROMIUM } : {}), args: ['--no-sandbox'] };
