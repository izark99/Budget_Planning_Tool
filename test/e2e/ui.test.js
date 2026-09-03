/* Những gì chỉ trình duyệt mới trả lời được: bố cục, kiểu chữ, thanh cuộn.
   Đây là các yêu cầu giao diện đã chốt qua hai đợt cập nhật; giữ lại để giai
   đoạn 2 xáo tệp mà không âm thầm làm hỏng lại. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { collectErrors, goToView, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';

let server, browser, ctx, page, errs;

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch(LAUNCH);
  ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  page = await loginToApp(ctx, server.base);
  errs = collectErrors(page);
  await importHeadcount(page);
  /* Cần một công thức dùng chung để hộp gợi ý có đủ nhóm chip. */
  await inPage(page, `
    st.S.shared = [{ id: 's1', code: 'LUONG_CO_BAN', name: 'Lương cơ bản',
                     formula: 'ROUND([Coefficient]*LUONG_CO_SO,-3)' }];
    return true;
  `);
});
afterAll(async () => {
  await browser?.close();
  await server?.stop();
});

describe('bảng nhiều cột', () => {
  it('tiêu đề cột không bị bẻ từng ký tự xuống dòng', async () => {
    await goToView(page, 'Định biên');
    const t = await page.evaluate(() => {
      const th = document.querySelector('.tw th');
      return th && { whiteSpace: getComputedStyle(th).whiteSpace, height: th.getBoundingClientRect().height };
    });
    expect(t).not.toBeNull();
    /* Lỗi cũ: th đặt overflow-wrap:anywhere nên bẻ MỖI DÒNG MỘT CHỮ CÁI,
       tiêu đề cao vài trăm px. */
    expect(t.whiteSpace).toBe('nowrap');
    expect(t.height).toBeLessThan(80);
  });

  /* Bóp cửa sổ hẹp lại để bảng chắc chắn rộng hơn khung. Kiểm bằng cơ chế chứ
     không bằng một con số pixel phụ thuộc kích thước màn hình:
       · khung .tw phải TỰ cuộn ngang;
       · và trang thì KHÔNG được cuộn ngang theo (lỗi cũ: các ô lưới mặc định
         min-width:auto nên đẩy tràn cả trang). */
  it('khung bảng tự cuộn ngang, trang không bị đẩy tràn', async () => {
    await page.setViewportSize({ width: 700, height: 900 });
    await goToView(page, 'Định biên');
    const r = await page.evaluate(() => {
      const tw = document.querySelector('.tw');
      const doc = document.documentElement;
      return {
        overflowX: getComputedStyle(tw).overflowX,
        scrolls: tw.scrollWidth > tw.clientWidth,
        pageOverflow: doc.scrollWidth - doc.clientWidth,
      };
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    expect(r.overflowX).toBe('auto');
    expect(r.scrolls).toBe(true);
    expect(r.pageOverflow).toBeLessThanOrEqual(1);
  });
});

describe('tiêu đề bảng', () => {
  it('mọi tiêu đề dùng chung một font, một cỡ, một kiểu', async () => {
    await goToView(page, 'Công thức chi phí');
    const specs = await page.evaluate(() =>
      [...document.querySelectorAll('.panel > header h3, .chipbox > h4, h4.sec')].map((h) => {
        const c = getComputedStyle(h);
        return `${c.fontWeight} ${c.fontSize} ${c.fontFamily.split(',')[0]} ls=${c.letterSpacing} tt=${c.textTransform}`;
      }));
    expect(specs.length).toBeGreaterThan(2);
    expect([...new Set(specs)]).toHaveLength(1);
  });
});

describe('tiêu đề cột của bảng', () => {
  /* Lỗi cũ: styles.css gộp `td.num, th.num` nên MỌI tiêu đề cột số ăn luôn font
     mono 12,5px, lệch hẳn khỏi font hiển thị 11px của các tiêu đề còn lại — thấy
     rõ nhất ở "SỐ GIÁ TRỊ" (Thiết lập) và cả hàng tiêu đề màn Ngày công. */
  it.each(['Thiết lập', 'Ngày công', 'Định biên', 'Phân loại chi phí'])(
    'màn %s: mọi th dùng chung một font, một cỡ', async (view) => {
      await goToView(page, view);
      const specs = await page.evaluate(() =>
        [...document.querySelectorAll('th')].map((h) => {
          const c = getComputedStyle(h);
          return `${c.fontWeight} ${c.fontSize} ${c.fontFamily.split(',')[0]}`;
        }));
      expect(specs.length).toBeGreaterThan(2);
      expect([...new Set(specs)]).toHaveLength(1);
    });

  it('tiêu đề cột số vẫn căn phải để thẳng cột với con số bên dưới', async () => {
    await goToView(page, 'Ngày công');
    const align = await page.evaluate(() => {
      const h = document.querySelector('th.num');
      return h && getComputedStyle(h).textAlign;
    });
    expect(align).toBe('right');
  });
});

describe('hộp gợi ý chèn cột', () => {
  it('ở màn Công thức chi phí: cột trái, dưới danh sách FC, dính và cuộn nội bộ', async () => {
    await goToView(page, 'Công thức chi phí');
    const cb = await page.evaluate(() => {
      const c = document.querySelector('.chipbox');
      if (!c) return null;
      const cs = getComputedStyle(c);
      const list = document.querySelector('.col-left .panel');
      return {
        inLeft: !!c.closest('.col-left'),
        belowList: list ? c.getBoundingClientRect().top >= list.getBoundingClientRect().bottom - 2 : false,
        position: cs.position, maxHeight: cs.maxHeight, overflow: cs.overflow,
        height: c.getBoundingClientRect().height,
        dupChipRows: document.querySelectorAll('.rule .chips').length,
      };
    });
    expect(cb).not.toBeNull();
    expect(cb.inLeft).toBe(true);
    expect(cb.belowList).toBe(true);
    expect(cb.position).toBe('sticky');
    expect(cb.maxHeight).toBe('260px');
    expect(cb.overflow).toBe('auto');
    expect(cb.height).toBeLessThanOrEqual(260);
    /* Trước đây mỗi nhóm quy tắc lặp lại một dải chip riêng — nay chỉ còn một hộp. */
    expect(cb.dupChipRows).toBe(0);
  });

  it.each(['Thiết lập', 'Tăng lương'])('ở màn %s: cỡ vừa, có thanh trượt', async (view) => {
    await goToView(page, view);
    const cb = await page.evaluate(() => {
      const c = document.querySelector('.chipbox');
      if (!c) return null;
      const cs = getComputedStyle(c);
      return { maxHeight: cs.maxHeight, overflow: cs.overflow, height: c.getBoundingClientRect().height };
    });
    expect(cb).not.toBeNull();
    expect(cb.maxHeight).toBe('260px');
    expect(cb.overflow).toBe('auto');
    expect(cb.height).toBeLessThanOrEqual(260);
  });

  it('màn Tăng lương liệt kê công thức dùng chung để chọn', async () => {
    await goToView(page, 'Tăng lương');
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll('.content .chips .chip')].map((x) => x.textContent.trim()));
    expect(chips).toContain('LUONG_CO_BAN');
  });
});

describe('thử trên một dòng', () => {
  it('có bảng đối chiếu liệt kê mọi thông tin công thức dùng tới', async () => {
    await goToView(page, 'Công thức chi phí');
    const rows = await page.evaluate(() => {
      const h = [...document.querySelectorAll('.content h4')]
        .find((x) => x.textContent.includes('Thông tin dùng trong công thức'));
      if (!h) return null;
      return [...h.parentElement.querySelectorAll('tbody tr')].length;
    });
    expect(rows).not.toBeNull();
    expect(rows).toBeGreaterThan(0);
  });

  /* LỖI ĐÃ BÁO: refVal() dùng fmt() — bộ định dạng cho TIỀN ĐỒNG, có Math.round —
     nên hệ số 1,5 hiện thành 2 và 0,215 hiện thành 0, ngay tại bảng người dùng mở
     ra để đối chiếu. Phải là fmtNum (tối đa 6 chữ số thập phân). */
  it('bảng đối chiếu giữ nguyên phần thập phân, KHÔNG làm tròn', async () => {
    await inPage(page, `
      st.S.hc.rows[0].Coefficient = 1.5;
      st.S.formulas[0].rules[0].cond = '';
      st.S.formulas[0].rules[0].formula = '[Coefficient] * NGAY_CONG_CHUAN';
      fm.ENGINE.invalidate(); st.setRESULT(null);
      return true;
    `);
    await goToView(page, 'Kết quả');
    await goToView(page, 'Công thức chi phí');

    const cells = await page.evaluate(() => {
      const h = [...document.querySelectorAll('.content h4')]
        .find((x) => x.textContent.includes('Thông tin dùng trong công thức'));
      if (!h) return null;
      return [...h.parentElement.querySelectorAll('tbody tr')].map((tr) =>
        [...tr.children].map((td) => td.textContent.trim()));
    });
    expect(cells).not.toBeNull();

    const coefRow = cells.find((r) => r[0] === '[Coefficient]');
    expect(coefRow, JSON.stringify(cells)).toBeTruthy();
    /* Trước khi sửa, ô này là "2". */
    expect(coefRow).toContain('1,5');
    expect(coefRow).not.toContain('2');
  });

  it('bảng đối chiếu hiện hàng "% trích" khi Formula Code có khai % trích', async () => {
    /* Hàng này chỉ hiện khi res.hasAccrual — không khai thì không có, đúng ý:
       màn % trích để trống thì mọi thứ y như cũ. */
    await inPage(page, `
      st.S.accruals = [{ id: 'a1', code: st.S.formulas[0].code, col: 'Dept',
        rows: [{ key: 'AC', m: [100,100,100,100,100,100,50,50,50,50,50,50] }] }];
      fm.ENGINE.invalidate();
      return true;
    `);
    await goToView(page, 'Kết quả');
    await goToView(page, 'Công thức chi phí');
    const has = await page.evaluate(() =>
      [...document.querySelectorAll('.panel tbody td')].some((x) => x.textContent.trim() === '% trích'));
    expect(has).toBe(true);
  });
});

describe('mọi màn hình', () => {
  it('mở được hết, không màn nào ném lỗi', async () => {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.rail .nav button')].map((b) => b.textContent.trim()));
    expect(labels.length).toBeGreaterThanOrEqual(12);
    for (const l of labels) {
      expect(await goToView(page, l), l).toBe(true);
      expect(await page.evaluate(() => !!document.querySelector('.content')?.children.length), l).toBe(true);
    }
  });

  it('không một lỗi JavaScript nào', () => {
    expect(errs).toEqual([]);
  });
});
