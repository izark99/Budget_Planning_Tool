/* Nạp máy tính ngân sách vào Node để chạy được KHÔNG CẦN trình duyệt.
   Làm được vì state.js và formula.js chỉ chạm localStorage/window bên trong
   thân hàm, không ở cấp module — nên chỉ cần một cái nẹp cho fetch của
   loadContent(). Nhờ vậy phép kiểm golden chạy trong mili-giây. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';

export async function loadEngine() {
  /* loadContent() gọi fetch('/content.md'); trong Node thì đọc thẳng từ đĩa. */
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const p = path.join(ROOT, 'public', String(url).replace(/^\//, ''));
    return new Response(fs.readFileSync(p, 'utf8'), { status: 200 });
  };
  const state = await import('../../public/src/core/state.js');
  const formula = await import('../../public/src/core/formula.js');
  await state.loadContent('/content.md');
  globalThis.fetch = real;
  return { state, formula };
}

/** Nạp một state đã ghi sẵn rồi chạy tính. */
export function runOn(state, formula, snapshot) {
  state.setS(JSON.parse(JSON.stringify(snapshot)));
  formula.ENGINE.invalidate();
  state.setRESULT(null);
  return formula.ENGINE.run();
}
