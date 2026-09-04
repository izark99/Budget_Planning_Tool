/* Chế độ sáng / tối.

   Ba đường vào: theo hệ thống (mặc định), ép sáng, ép tối. Phép kiểm này canh
   hai thứ hay hỏng nhất khi thêm chế độ tối:

     1. Dấu data-theme phải có NGAY từ lần vẽ đầu — nếu chỉ đặt trong app.js thì
        trang loé sáng rồi mới chuyển tối, và màn đăng nhập không có chế độ tối.
     2. Màu viết cứng còn sót lại. Trước đợt này có 46 màu nằm ngoài :root; sáu
        chỗ trong JS ghi thẳng color:#fff cho chip đang chọn. Trắng-trên-trắng
        không làm chương trình đổ, chỉ làm chữ biến mất — nên phải đo tương phản
        thật chứ không đọc mã nguồn. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { LAUNCH, TEST_ENV } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { collectErrors, goToView, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';

let server, browser;

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
});

/** Mở app với một chế độ hệ thống và (tuỳ chọn) một lựa chọn đã lưu sẵn. */
async function open(colorScheme, saved) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme });
  if (saved) await ctx.addInitScript((v) => { try { localStorage.setItem('bp_theme', v); } catch { /* chặn ghi */ } }, saved);
  const page = await loginToApp(ctx, server.base);
  return { ctx, page };
}

const themeOf = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

describe('chọn chế độ', () => {
  it('mặc định đi theo hệ thống — cả hai chiều', async () => {
    const a = await open('dark');
    expect(await themeOf(a.page)).toBe('dark');
    expect(await a.page.evaluate(() => document.querySelector('.themepick select').value)).toBe('auto');
    await a.ctx.close();

    const b = await open('light');
    expect(await themeOf(b.page)).toBe('light');
    await b.ctx.close();
  });

  it('lựa chọn đã lưu ĐÈ lên hệ thống, và có hiệu lực từ lần vẽ đầu', async () => {
    const a = await open('light', 'dark');
    expect(await themeOf(a.page)).toBe('dark');
    await a.ctx.close();

    const b = await open('dark', 'light');
    expect(await themeOf(b.page)).toBe('light');
    await b.ctx.close();
  });

  /* Màn đăng nhập dựng TRƯỚC khi app.js chạy xong — nếu dấu chỉ do app.js đặt
     thì màn này luôn sáng. */
  it('màn đăng nhập cũng theo chế độ đã chọn', async () => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(server.base + '/login');
    await page.waitForSelector('.login .card');
    expect(await themeOf(page)).toBe('dark');
    await ctx.close();
  });

  it('đổi ô chọn là đổi ngay, và nhớ qua lần mở sau', async () => {
    const { ctx, page } = await open('light');
    await page.selectOption('.themepick select', 'dark');
    await page.waitForTimeout(200);
    expect(await themeOf(page)).toBe('dark');
    expect(await page.evaluate(() => localStorage.getItem('bp_theme'))).toBe('dark');

    const page2 = await loginToApp(ctx, server.base);   /* cùng ngữ cảnh = cùng localStorage */
    expect(await themeOf(page2)).toBe('dark');
    await ctx.close();
  });
});

/* Độ sáng tương đối theo WCAG, đủ để trả lời "chữ có nổi trên nền không". */
function contrast(fg, bg) {
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((x) => {
      const v = Number(x) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('không còn màu viết cứng nào chọi nền tối', () => {
  it('nền trang và chữ đảo hẳn giữa hai chế độ', async () => {
    const d = await open('dark');
    const darkBg = await bodyBg(d.page);
    await d.ctx.close();
    const l = await open('light');
    const lightBg = await bodyBg(l.page);
    await l.ctx.close();
    expect(darkBg).not.toBe(lightBg);
    /* Nền tối phải THỰC SỰ tối, không phải chỉ khác đi. */
    const n = (c) => c.match(/\d+/g).slice(0, 3).reduce((a, x) => a + Number(x), 0);
    expect(n(darkBg)).toBeLessThan(n(lightBg));
  });

  /* Chip đang chọn là chỗ cũ ghi thẳng color:#fff trong sáu tệp JS. Nền của nó
     là var(--mineral) — ở chế độ tối màu này SÁNG lên, nên chữ trắng biến mất. */
  it('chip đang chọn vẫn đọc được ở chế độ tối', async () => {
    const { ctx, page } = await open('dark');
    await importHeadcount(page);
    await goToView(page, 'Phân loại nhóm');
    await page.click('.content .panel header button.pri');   /* Thêm bảng phân loại */
    await page.waitForTimeout(400);
    await page.click('.content .chips .chip');                /* chọn một cột khoá */
    await page.waitForTimeout(400);

    const got = await page.evaluate(() => {
      const c = document.querySelector('.content .chip.on');
      if (!c) return null;
      const s = getComputedStyle(c);
      return { fg: s.color, bg: s.backgroundColor };
    });
    expect(got).not.toBeNull();
    expect(contrast(got.fg, got.bg)).toBeGreaterThan(4.5);
    await ctx.close();
  });

  /* Mọi mặt "giấy" của app: panel, ô nhập, hộp gợi ý, modal. Một chỗ quên đổi
     là một mảng trắng chói giữa nền tối. */
  it('mặt panel và ô nhập đều là mặt TỐI ở chế độ tối', async () => {
    const { ctx, page } = await open('dark');
    await importHeadcount(page);
    const got = await page.evaluate(() => {
      const pick = (sel) => {
        const n = document.querySelector(sel);
        return n ? getComputedStyle(n).backgroundColor : null;
      };
      return { panel: pick('.panel'), input: pick('.content input[type=text]'), th: pick('.content th') };
    });
    const bright = (c) => c && c.match(/\d+/g).slice(0, 3).every((x) => Number(x) > 200);
    for (const k of Object.keys(got)) expect([k, bright(got[k])]).toEqual([k, false]);
    await ctx.close();
  });
});

/* LỖI ĐÃ BÁO: ở chế độ tối, chữ trong ô mật khẩu là chữ ĐEN trên nền tối, và
   nút hiện mật khẩu cũng chìm. Nguyên nhân: ô nhập không tự thừa kế màu chữ của
   trang — mặc định của trình duyệt là đen — và styles.css của app có dòng
   `input { color: inherit }` nhưng trang đăng nhập dùng CSS riêng (middleware
   chặn file tĩnh khi chưa có phiên) nên thiếu hẳn dòng đó. */
describe('màn đăng nhập ở chế độ tối', () => {
  /* Độ sáng tương đối theo WCAG — đo thật, không đọc mã nguồn. */
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((x) => {
      const v = Number(x) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (fg, bg) => {
    const a = lum(fg), b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  async function loginPage(colorScheme) {
    const c = await browser.newContext({ colorScheme });
    const p = await c.newPage();
    await p.goto(server.base + '/login');
    await p.waitForSelector('.login .card');
    return { c, p };
  }

  it('chữ đang gõ nổi hẳn trên nền ô, ở CẢ HAI chế độ', async () => {
    for (const scheme of ['dark', 'light']) {
      const { c, p } = await loginPage(scheme);
      await p.fill('#pass', 'thu-mat-khau');
      const got = await p.evaluate(() => {
        const cs = getComputedStyle(document.getElementById('pass'));
        return { fg: cs.color, bg: cs.backgroundColor };
      });
      expect([scheme, ratio(got.fg, got.bg) > 4.5]).toEqual([scheme, true]);
      await c.close();
    }
  });

  it('nút hiện mật khẩu đọc được, và bấm là hiện/giấu thật', async () => {
    const { c, p } = await loginPage('dark');
    await p.fill('#pass', 'thu-mat-khau');
    const got = await p.evaluate(() => ({
      eye: getComputedStyle(document.getElementById('eye')).color,
      bg: getComputedStyle(document.getElementById('pass')).backgroundColor,
    }));
    expect(ratio(got.eye, got.bg)).toBeGreaterThan(4.5);

    expect(await p.evaluate(() => document.getElementById('pass').type)).toBe('password');
    await p.click('#eye');
    expect(await p.evaluate(() => document.getElementById('pass').type)).toBe('text');
    /* Giá trị không được mất khi đổi kiểu ô. */
    expect(await p.inputValue('#pass')).toBe('thu-mat-khau');
    await p.click('#eye');
    expect(await p.evaluate(() => document.getElementById('pass').type)).toBe('password');
    await c.close();
  });

  it('vẫn đăng nhập được sau khi bật hiện mật khẩu', async () => {
    const { c, p } = await loginPage('dark');
    await p.fill('#pass', TEST_ENV.APP_PASSWORD);
    await p.click('#eye');
    await p.click('#btn');
    await p.waitForURL(server.base + '/', { timeout: 15000 });
    await p.waitForSelector('.shell .rail');
    await c.close();
  });
});

/* LỖI ĐÃ BÁO: "Nút trắng và nút đen đang bị lệch chiều cao."

   Đo ra thì HÌNH HỌC GIỐNG HỆT NHAU — cùng 32px, cùng top, không bóng, không
   outline, nên hai hộp không thể lệch. Cái lệch là ĐỘ TƯƠNG PHẢN CỦA ĐƯỜNG
   VIỀN: viền nút ghost chỉ đạt 1,51:1 so với chính nền nó (nút đặc đạt 13,85:1),
   mờ tới mức mắt đọc nó nhỏ hơn nút đặc ngay bên cạnh. Chuẩn WCAG cho đường bao
   một thành phần giao diện là 3:1.

   Vì vậy phép kiểm này canh HAI thứ: hộp phải bằng nhau (và không được xê dịch
   khi chỉnh màu), và đường bao phải đọc được. */
describe('nút và ô nhập: hộp bằng nhau, đường bao đọc được', () => {
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((x) => {
      const v = Number(x) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  it('nút viền và nút đặc cao BẰNG NHAU, cùng mép trên', async () => {
    const { ctx, page } = await open('dark');
    await importHeadcount(page);
    await goToView(page, 'Phân loại nhóm');
    const box = await page.evaluate(() =>
      [...document.querySelectorAll('.content .panel > header button.btn')]
        .map((b) => ({ cls: b.className, h: b.getBoundingClientRect().height, top: b.getBoundingClientRect().top })));
    expect(box.length).toBeGreaterThanOrEqual(2);
    expect(box.every((b) => b.h === box[0].h)).toBe(true);
    expect(box.every((b) => b.top === box[0].top)).toBe(true);
    await ctx.close();
  });

  it('đường bao nút ghost và ô nhập đạt 3:1 — ở CẢ HAI chế độ', async () => {
    for (const scheme of ['dark', 'light']) {
      const { ctx, page } = await open(scheme);
      await importHeadcount(page);
      /* Cần một bảng phân loại thì màn này mới có ô nhập để mà đo. */
      await inPage(page, `
        st.S.classes = [{ id: 'ce', name: 'B', keys: ['Dept'],
          outs: [{ name: 'A1', type: 'text' }], rows: [['AC', 'x']], def: [''] }];
        st.S.ui.collapsed = {}; fm.ENGINE.invalidate(); st.setRESULT(null); return true;
      `);
      await goToView(page, 'Phân loại nhóm');
      const got = await page.evaluate(() => {
        const panelBg = getComputedStyle(document.querySelector('.panel')).backgroundColor;
        const pick = (sel) => {
          const n = document.querySelector(sel);
          if (!n) return null;
          const cs = getComputedStyle(n);
          return { border: cs.borderTopColor, bg: cs.backgroundColor };
        };
        return { panelBg, btn: pick('.content .panel > header button.btn:not(.pri)'), inp: pick('.content input[type=text]') };
      });
      for (const key of ['btn', 'inp']) {
        expect([scheme, key, got[key] !== null]).toEqual([scheme, key, true]);
        /* So với nền của CHÍNH NÓ và với mặt panel phía sau — hở chỗ nào cũng là hở. */
        expect([scheme, key, 'nền riêng', ratio(got[key].border, got[key].bg) >= 3])
          .toEqual([scheme, key, 'nền riêng', true]);
        expect([scheme, key, 'mặt panel', ratio(got[key].border, got.panelBg) >= 3])
          .toEqual([scheme, key, 'mặt panel', true]);
      }
      await ctx.close();
    }
  });
});

describe('thanh cuộn', () => {
  it('khung cuộn của app dùng thanh mảnh của app, cột trái dùng bản cho nền tối', async () => {
    const { ctx, page } = await open('light');
    await importHeadcount(page);
    const got = await page.evaluate(() => ({
      nav: getComputedStyle(document.querySelector('.nav')).scrollbarColor,
      tw: getComputedStyle(document.querySelector('.tw')).scrollbarColor,
      width: getComputedStyle(document.querySelector('.tw')).scrollbarWidth,
    }));
    expect(got.width).toBe('thin');
    /* Cột trái là mặt tối nên con trượt phải là trắng mờ, khác hẳn phần thân. */
    expect(got.nav).toContain('255, 255, 255');
    expect(got.tw).not.toBe(got.nav);
    await ctx.close();
  });
});

describe('toàn bộ luồng', () => {
  it('không một lỗi JavaScript nào ở chế độ tối', async () => {
    const { ctx, page } = await open('dark');
    const errs = collectErrors(page);
    await importHeadcount(page);
    for (const v of ['Thiết lập', 'Phân loại nhóm', 'Ngày công', 'Công thức chi phí', 'Kết quả']) {
      await goToView(page, v);
    }
    expect(errs).toEqual([]);
    await ctx.close();
  });
});
