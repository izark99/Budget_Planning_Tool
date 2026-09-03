/* Những gì chỉ trình duyệt mới trả lời được: bố cục, kiểu chữ, thanh cuộn.
   Đây là các yêu cầu giao diện đã chốt qua hai đợt cập nhật; giữ lại để giai
   đoạn 2 xáo tệp mà không âm thầm làm hỏng lại. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { LAUNCH } from '../helpers/env.mjs';
import { startServer } from '../helpers/server.mjs';
import { clickButton, collectErrors, goToView, importHeadcount, inPage, loginToApp } from '../helpers/browser.mjs';

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
      [...document.querySelectorAll('.panel > header h3, h4.sec')].map((h) => {
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
      const bodyCs = getComputedStyle(c.querySelector('.chipbody'));
      const list = document.querySelector('.col-left > .panel');
      return {
        inLeft: !!c.closest('.col-left'),
        belowList: list ? c.getBoundingClientRect().top >= list.getBoundingClientRect().bottom - 2 : false,
        position: cs.position, maxHeight: bodyCs.maxHeight, overflow: bodyCs.overflow,
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
    /* Thân cuộn trần 260px, cộng thanh tiêu đề của panel. */
    expect(cb.height).toBeLessThanOrEqual(320);
    /* Trước đây mỗi nhóm quy tắc lặp lại một dải chip riêng — nay chỉ còn một hộp. */
    expect(cb.dupChipRows).toBe(0);
  });

  it.each(['Thiết lập', 'Tăng lương'])('ở màn %s: cỡ vừa, có thanh trượt', async (view) => {
    await goToView(page, view);
    const cb = await page.evaluate(() => {
      const c = document.querySelector('.chipbox');
      if (!c) return null;
      const cs = getComputedStyle(c.querySelector('.chipbody'));
      return { maxHeight: cs.maxHeight, overflow: cs.overflow, height: c.getBoundingClientRect().height };
    });
    expect(cb).not.toBeNull();
    expect(cb.maxHeight).toBe('260px');
    expect(cb.overflow).toBe('auto');
    expect(cb.height).toBeLessThanOrEqual(320);
  });

  it('màn Tăng lương liệt kê công thức dùng chung để chọn', async () => {
    await goToView(page, 'Tăng lương');
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll('.content .chips .chip')].map((x) => x.textContent.trim()));
    expect(chips).toContain('LUONG_CO_BAN');
  });
});

describe('hộp gợi ý: vỏ panel giống danh sách Formula Code', () => {
  /* Bản trước tiêu đề nằm TRONG vùng cuộn nên phải dính bằng position:sticky +
     lề âm. Nay hộp là .panel thật: thanh tiêu đề nằm NGOÀI phần cuộn, đúng hình
     của danh sách Formula Code — không cần mẹo nào, và không thể trôi. */
  it('tiêu đề nằm ngoài phần cuộn, cuộn thân xuống nó không nhúc nhích', async () => {
    await goToView(page, 'Công thức chi phí');
    const r = await page.evaluate(async () => {
      const box = document.querySelector('.chipbox');
      const head = box && box.querySelector(':scope > header');
      const body = box && box.querySelector('.chipbody');
      if (!head || !body) return null;
      /* Bóp trần chiều cao để chắc chắn có gì đó để cuộn — số chip phụ thuộc file
         định biên nên không thể trông chờ nó tự tràn. */
      const keep = body.style.maxHeight;
      body.style.maxHeight = '70px';
      const before = head.getBoundingClientRect().top;
      body.scrollTop = body.scrollHeight;
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const out = {
        isPanel: box.classList.contains('panel'),
        headOutsideScroller: !body.contains(head),
        scrolled: body.scrollTop > 0,
        moved: Math.round(head.getBoundingClientRect().top - before),
      };
      body.style.maxHeight = keep;
      return out;
    });
    expect(r).not.toBeNull();
    expect(r.isPanel).toBe(true);
    expect(r.headOutsideScroller).toBe(true);
    expect(r.scrolled).toBe(true);
    expect(r.moved).toBe(0);
  });

  it('tiêu đề dùng đúng thanh header của panel, như Formula Code', async () => {
    await goToView(page, 'Công thức chi phí');
    const same = await page.evaluate(() => {
      const spec = (h) => {
        const c = getComputedStyle(h);
        return `${c.fontWeight} ${c.fontSize} ${c.letterSpacing} ${c.textTransform}`;
      };
      const chipHead = document.querySelector('.chipbox > header h3');
      const fcHead = [...document.querySelectorAll('.col-left > .panel > header h3')]
        .find((h) => h.textContent.includes('Formula Code'));
      return chipHead && fcHead ? { a: spec(chipHead), b: spec(fcHead) } : null;
    });
    expect(same).not.toBeNull();
    expect(same.a).toBe(same.b);
  });
});

describe('khoảng cách giữa khối soạn và "thử trên một dòng"', () => {
  it('không dính sát nhau', async () => {
    await goToView(page, 'Công thức chi phí');
    const gap = await page.evaluate(() => {
      const split = document.querySelector('.split');
      const next = split && split.nextElementSibling;
      if (!split || !next) return null;
      return Math.round(next.getBoundingClientRect().top - split.getBoundingClientRect().bottom);
    });
    expect(gap).not.toBeNull();
    expect(gap).toBeGreaterThan(0);
  });
});

describe('danh sách Formula Code', () => {
  /* Trước đây không có trần chiều cao: nhiều công thức là cột trái dài ra vô tận,
     đẩy hộp gợi ý bên dưới ra khỏi tầm nhìn. */
  it('tự cuộn trong khung thay vì kéo dài mãi', async () => {
    /* Các phép kiểm trong tệp này dùng chung một trang: phải trả lại S.formulas
       nguyên trạng, nếu không phép kiểm sau sẽ thấy công thức giả của phép kiểm này. */
    const saved = await inPage(page, 'return JSON.stringify({ f: st.S.formulas, sel: st.S.ui.fSel });');
    await inPage(page, `
      st.S.formulas = [];
      for (let i = 0; i < 40; i++) {
        st.S.formulas.push({ id: 'f' + i, code: 'FC_' + i, name: 'Công thức ' + i,
          mode: 'monthly', months: [1,2,3,4,5,6,7,8,9,10,11,12],
          rules: [{ id: 'r' + i, name: 'Tất cả', cond: '', formula: '1' }] });
      }
      st.S.ui.fSel = 'f0'; fm.ENGINE.invalidate(); st.setRESULT(null);
      return true;
    `);
    await goToView(page, 'Công thức chi phí');
    const box = await page.evaluate(() => {
      const n = document.querySelector('.fclist');
      if (!n) return null;
      const cs = getComputedStyle(n);
      return { overflow: cs.overflowY, h: n.getBoundingClientRect().height,
        scrolls: n.scrollHeight > n.clientHeight, vh: window.innerHeight };
    });
    expect(box).not.toBeNull();
    expect(box.overflow).toBe('auto');
    expect(box.scrolls).toBe(true);
    expect(box.h).toBeLessThanOrEqual(box.vh * 0.5);

    await inPage(page, `
      const old = JSON.parse(a);
      st.S.formulas = old.f; st.S.ui.fSel = old.sel;
      fm.ENGINE.invalidate(); st.setRESULT(null);
      return true;
    `, saved);
  });

  /* Thứ tự Formula Code là thứ tự cột ở màn Kết quả và trong file Excel xuất ra,
     nên phải sửa được — giống hệt cách bảng Phân loại nhóm cho đổi thứ tự. */
  describe('đổi thứ tự bằng ↑ ↓', () => {
    const codes = () => page.evaluate(() =>
      [...document.querySelectorAll('.fclist .fcrow .fcmain > div:first-child')]
        .map((x) => x.textContent));

    /* Bấm nút thứ n (0 = ↑, 1 = ↓) của dòng thứ `row`. */
    const move = async (row, n) => {
      await page.evaluate(([r, i]) => {
        document.querySelectorAll('.fclist .fcrow')[r].querySelectorAll('.fcmove button')[i].click();
      }, [row, n]);
      await page.waitForTimeout(350);
    };

    let saved;
    beforeAll(async () => {
      saved = await inPage(page, 'return JSON.stringify({ f: st.S.formulas, sel: st.S.ui.fSel });');
      await inPage(page, `
        st.S.formulas = ['A', 'B', 'C'].map((c, i) => {
          return { id: 'f' + c, code: 'FC_' + c, name: 'Công thức ' + c, mode: 'monthly',
            months: [1,2,3,4,5,6,7,8,9,10,11,12],
            rules: [{ id: 'r' + i, name: 'Tất cả', cond: '', formula: '1' }] };
        });
        st.S.ui.fSel = 'fB'; fm.ENGINE.invalidate(); st.setRESULT(null);
        return true;
      `);
      await goToView(page, 'Công thức chi phí');
    });
    afterAll(async () => {
      await inPage(page, `
        const old = JSON.parse(a);
        st.S.formulas = old.f; st.S.ui.fSel = old.sel;
        fm.ENGINE.invalidate(); st.setRESULT(null);
        return true;
      `, saved);
    });

    it('↓ đẩy xuống, ↑ kéo lên, và S.formulas đổi theo', async () => {
      expect(await codes()).toEqual(['FC_A', 'FC_B', 'FC_C']);

      await move(0, 1);                                  /* A đi xuống */
      expect(await codes()).toEqual(['FC_B', 'FC_A', 'FC_C']);

      await move(2, 0);                                  /* C đi lên */
      expect(await codes()).toEqual(['FC_B', 'FC_C', 'FC_A']);

      /* Thứ tự trên màn hình phải là thứ tự thật trong state, không phải trò của DOM. */
      const inState = await inPage(page, 'return st.S.formulas.map((f) => f.code);');
      expect(inState).toEqual(['FC_B', 'FC_C', 'FC_A']);
    });

    it('đổi thứ tự KHÔNG làm nhảy sang Formula Code khác', async () => {
      const before = await inPage(page, 'return st.S.ui.fSel;');
      await move(0, 1);
      expect(await inPage(page, 'return st.S.ui.fSel;')).toBe(before);
    });

    it('bỏ kết quả đã tính, vì thứ tự cột trong file xuất ra đã khác', async () => {
      await inPage(page, 'st.setRESULT({ fake: 1 }); return true;');
      await move(0, 1);
      expect(await inPage(page, 'return st.RESULT;')).toBeNull();
    });

    it('công thức thêm mới chèn ngay SAU cái đang chọn, không dồn xuống cuối', async () => {
      await inPage(page, "st.S.ui.fSel = st.S.formulas[0].id; return true;");
      await goToView(page, 'Kết quả');
      await goToView(page, 'Công thức chi phí');
      const before = await inPage(page, 'return st.S.formulas.map((f) => f.code);');

      await clickButton(page, '.col-left > .panel > header button', 'Thêm');
      await page.waitForTimeout(400);

      const after = await inPage(page, 'return st.S.formulas.map((f) => f.code);');
      expect(after).toHaveLength(before.length + 1);
      /* Ở vị trí thứ 2, ngay sau cái đang chọn — không phải cuối danh sách. */
      expect(after[0]).toBe(before[0]);
      expect(after[2]).toBe(before[1]);
      expect(after[after.length - 1]).toBe(before[before.length - 1]);
      /* Và cái vừa thêm thành cái đang chọn. */
      expect(await inPage(page, 'return st.S.formulas[1].id === st.S.ui.fSel;')).toBe(true);

      await inPage(page, 'st.S.formulas.splice(1, 1); st.S.ui.fSel = st.S.formulas[0].id; return true;');
    });

    it('dòng đầu không có ↑, dòng cuối không có ↓ để bấm', async () => {
      const ends = await page.evaluate(() => {
        const rs = [...document.querySelectorAll('.fclist .fcrow')];
        const btn = (r, i) => r.querySelectorAll('.fcmove button')[i].disabled;
        return { firstUp: btn(rs[0], 0), firstDown: btn(rs[0], 1),
          lastUp: btn(rs[rs.length - 1], 0), lastDown: btn(rs[rs.length - 1], 1) };
      });
      expect(ends).toEqual({ firstUp: true, firstDown: false, lastUp: false, lastDown: true });
    });
  });
});

/* LỖI ĐÃ BÁO: "nhấn vào tự điền, nhấn vài lần mới xuất hiện, số lần xuất hiện =
   số lần nhấn".
   Nguyên nhân: ô công thức dùng chung lấy drawShared làm onBlur. Bấm chip là một
   mousedown trên <span> nên textarea BLUR TRƯỚC -> drawShared() dựng lại cả khối
   -> activeFx (mức module) trỏ vào ô đã rời DOM. Tới lượt click của chip thì
   _insert() ghi vào ô ma đó, mà onChange vẫn ghi thẳng vào S.shared[i].formula.
   Màn hình không đổi vì nó dựng xong từ trước; bấm N lần thì tới lần dựng lại
   sau, cả N đoạn hiện ra một lượt. */
describe('chip chèn ở công thức dùng chung', () => {
  beforeAll(async () => {
    await inPage(page, `
      st.S.shared = [{ id: 'sh1', code: 'CT_THU', name: '', formula: '0' }];
      st.setRESULT(null);
      return true;
    `);
    await goToView(page, 'Thiết lập');
  });

  /* Bấm bằng CHUỘT THẬT, không phải el.click(): chuỗi sự kiện thật là
     mousedown -> blur -> mouseup -> click, mà chính cái blur mới gây ra lỗi.
     el.click() chỉ bắn mỗi sự kiện click nên không tái hiện được gì. */
  const clickOneChip = async () => {
    const chip = page.locator('.chipbox .chip').filter({ hasText: /^\[/ }).first();
    const label = (await chip.textContent()).trim();
    await chip.click();
    return label;
  };

  it('một lần bấm ra đúng một lần chèn, hiện ngay trên ô đang soạn', async () => {
    /* Bấm vào ô để nó thành ô đang chọn — đúng thao tác thật của người dùng. */
    await page.click('.panel .fx-wrap textarea');
    await page.waitForTimeout(150);

    const chip = await clickOneChip();
    await page.waitForTimeout(300);

    const inState = await inPage(page, 'return st.S.shared[0].formula;');
    const onScreen = await page.evaluate(() =>
      document.querySelector('.panel .fx-wrap textarea').value);

    const name = chip.slice(1, -1);
    /* Đúng MỘT lần, và thứ nhìn thấy khớp thứ đã lưu. */
    expect(inState.split(name).length - 1).toBe(1);
    expect(onScreen).toBe(inState);
  });

  it('bấm ba lần ra đúng ba lần chèn, không dồn lại', async () => {
    await inPage(page, "st.S.shared[0].formula = '0'; return true;");
    await goToView(page, 'Kết quả');
    await goToView(page, 'Thiết lập');
    await page.click('.panel .fx-wrap textarea');
    await page.waitForTimeout(150);

    let chip = '';
    for (let i = 0; i < 3; i++) { chip = await clickOneChip(); await page.waitForTimeout(120); }
    await page.waitForTimeout(250);

    const inState = await inPage(page, 'return st.S.shared[0].formula;');
    expect(inState.split(chip.slice(1, -1)).length - 1).toBe(3);
    expect(await page.evaluate(() =>
      document.querySelector('.panel .fx-wrap textarea').value)).toBe(inState);
  });
});

describe('dải thẻ "thử trên một dòng" chia hàng đều', () => {
  /* Lưới auto-fit nhét được bao nhiêu thì nhét, nên 12 thẻ ra 7+5 lệch. Đo bằng
     TOẠ ĐỘ thật (gom thẻ theo offsetTop) chứ không đọc CSS — cái phải đúng là
     hình người dùng nhìn thấy. */
  it('mọi hàng có cùng số thẻ, chênh nhau nhiều nhất một ô', async () => {
    await goToView(page, 'Công thức chi phí');
    const rows = await page.evaluate(() => {
      const strip = document.querySelector('.content .stats');
      if (!strip) return null;
      const by = {};
      [...strip.children].forEach((c) => {
        const top = Math.round(c.getBoundingClientRect().top);
        by[top] = (by[top] || 0) + 1;
      });
      return { counts: Object.values(by), total: strip.children.length };
    });
    expect(rows).not.toBeNull();
    expect(rows.total).toBeGreaterThan(6);
    /* Chia đều: hàng dài nhất và hàng ngắn nhất chênh nhau tối đa một ô. */
    expect(Math.max(...rows.counts) - Math.min(...rows.counts)).toBeLessThanOrEqual(1);
    /* Và không hàng nào quá 6 ô. */
    expect(Math.max(...rows.counts)).toBeLessThanOrEqual(6);
  });

  it('12 thẻ chia đúng 6 + 6', async () => {
    await goToView(page, 'Công thức chi phí');
    const r = await page.evaluate(() => {
      const strip = document.querySelector('.content .stats');
      if (!strip || strip.children.length !== 12) return { n: strip ? strip.children.length : 0 };
      const by = {};
      [...strip.children].forEach((c) => {
        const top = Math.round(c.getBoundingClientRect().top);
        by[top] = (by[top] || 0) + 1;
      });
      return { n: 12, counts: Object.values(by) };
    });
    /* File định biên mẫu cho đúng 12 thẻ (9 cột thuộc tính + 3 thẻ tổng kết). */
    expect(r.n).toBe(12);
    expect(r.counts).toEqual([6, 6]);
  });
});

describe('các bảng ở màn Thiết lập gấp lại được', () => {
  /* `title` là biến phía Node — phải TRUYỀN sang trang, thân hàm của evaluate()
     chạy trong trình duyệt nên không thấy được biến ngoài. */
  it.each([
    'Cột của bảng định biên',
    'Công thức dùng chung',
    'Tham số dùng chung',
  ])('%s: gấp lại được, và trạng thái gấp sống qua lần render lại', async (title) => {
    await goToView(page, 'Thiết lập');
    const findHead = () => page.evaluate((tt) => {
      const h = [...document.querySelectorAll('.panel > header.fold')]
        .find((x) => x.textContent.includes(tt));
      return h ? { hasCaret: !!h.querySelector('.caret'), open: h.nextElementSibling.style.display !== 'none' } : null;
    }, title);
    const toggle = () => page.evaluate((tt) => {
      [...document.querySelectorAll('.panel > header.fold')]
        .find((x) => x.textContent.includes(tt)).click();
    }, title);

    expect(await findHead()).toEqual({ hasCaret: true, open: true });

    await toggle();
    await page.waitForTimeout(200);
    expect((await findHead()).open).toBe(false);

    await goToView(page, 'Kết quả');
    await goToView(page, 'Thiết lập');
    expect((await findHead()).open).toBe(false);

    /* trả lại trạng thái mở cho các phép kiểm sau */
    await toggle();
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

  /* Người dùng cần biết dòng đang thử là AI — Grade nào, Gender gì, làm ở đâu —
     mà không phải mở lại màn Định biên. Lấy theo CỘT THẬT của file, không viết
     cứng tên cột, nên file nào cũng đủ thông tin. */
  it('dải thẻ liệt kê đủ mọi cột thuộc tính của dòng, ID đứng trước', async () => {
    await goToView(page, 'Công thức chi phí');
    const r = await page.evaluate(() => {
      const stats = document.querySelector('.content .stats');
      if (!stats) return null;
      return [...stats.querySelectorAll('.stat')].map((s) => ({
        k: s.querySelector('.k').textContent.trim(),
        v: s.querySelector('.v').textContent.trim(),
        sm: s.classList.contains('sm'),
      }));
    });
    expect(r).not.toBeNull();

    const attrCols = await inPage(page, 'return fm.ENGINE.attrCols().map((c) => c.alias);');
    const idCol = await inPage(page, "return fm.ENGINE.roleCol('key');");
    const keys = r.map((x) => x.k);

    /* đủ mọi cột thuộc tính */
    for (const c of attrCols) expect(keys, c).toContain(c);

    /* ID đứng trước các thẻ vừa thêm */
    expect(keys[0]).toBe(idCol);
    expect(r[1].sm).toBe(true);

    /* và giá trị đúng của chính dòng đang thử */
    const row = await inPage(page, `
      const res = fm.ENGINE.previewRow(st.S.formulas.find((f) => f.id === st.S.ui.fSel) || st.S.formulas[0], 0);
      return JSON.stringify(res.row);
    `).then(JSON.parse);
    const grade = r.find((x) => x.k === 'Grade');
    if (grade) expect(grade.v).toBe(String(row.Grade));
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

describe('ảnh hưởng của tăng lương', () => {
  /* File mẫu có một đợt tăng khai đích danh công thức DÙNG CHUNG — đường mà bản
     đo đầu tiên bỏ sót và báo 0 đồng. Giữ nguyên đợt của file mẫu ở đây. */
  beforeAll(async () => {
    await goToView(page, 'Kết quả');
    await clickButton(page, '.content button', 'Chạy');
    await page.waitForTimeout(1200);
  });

  it('màn Kết quả có panel, và hàng TỔNG khớp đúng raiseTotal', async () => {
    const r = await page.evaluate(() => {
      const p = [...document.querySelectorAll('.panel')]
        .find((x) => x.textContent.includes('Ảnh hưởng của tăng lương'));
      if (!p) return null;
      /* Panel có HAI bảng: bảng từng đợt, rồi bảng tách theo Formula Code.
         Chỉ đo bảng đầu. */
      const tb = p.querySelector('tbody');
      const tot = tb.querySelector('tr.tot');
      const cells = [...tot.querySelectorAll('td')].map((c) => c.textContent.trim());
      const body = [...tb.querySelectorAll('tr:not(.tot)')].map((tr) =>
        [...tr.querySelectorAll('td')].map((c) => c.textContent.trim()));
      return { totalText: cells[1], nRounds: body.length, firstRow: body[0] };
    });
    expect(r).not.toBeNull();

    const state = await inPage(page, 'return { total: st.RESULT.raiseTotal, n: st.RESULT.raiseImpact.length };');
    expect(r.nRounds).toBe(state.n);
    expect(r.totalText.replace(/\D/g, '')).toBe(String(state.total));
    /* Tiền phải khác 0 — báo 0 chính là lỗi của bản đo đầu tiên. */
    expect(state.total).toBeGreaterThan(0);
    /* Dòng đầu: tên đợt, từ tháng, mức %, lượt chạm, tiền, % tổng. */
    expect(r.firstRow).toHaveLength(6);
    expect(r.firstRow[0]).toBe('Tăng lương định kỳ');
  });

  it('các phần của từng đợt cộng lại đúng bằng tổng', async () => {
    const ok = await inPage(page, `
      const R = st.RESULT;
      const parts = R.raiseImpact.reduce((a, x) => a + x.total, 0);
      return parts === R.raiseTotal;
    `);
    expect(ok).toBe(true);
  });

  it('Dashboard có thẻ "Do tăng lương", khớp đúng con số của màn Kết quả', async () => {
    await goToView(page, 'Dashboard');
    const tile = await page.evaluate(() => {
      const s = [...document.querySelectorAll('.stat')]
        .find((x) => x.querySelector('.k') && x.querySelector('.k').textContent.includes('Do tăng lương'));
      return s ? s.querySelector('.u').textContent : null;
    });
    expect(tile).not.toBeNull();
    /* Dashboard chưa lọc gì thì bằng đúng tổng toàn cục. Dòng phụ có cả tiền
       chính xác lẫn %, nên so bằng chuỗi tiền đã định dạng. */
    const total = await inPage(page, 'return st.RESULT.raiseTotal;');
    expect(tile).toContain(new Intl.NumberFormat('vi-VN').format(total));
  });

  it('không khai đợt tăng nào thì KHÔNG dựng panel, không thêm thẻ', async () => {
    const saved = await inPage(page, 'return JSON.stringify(st.S.raises);');
    await inPage(page, 'st.S.raises = []; fm.ENGINE.invalidate(); st.setRESULT(null); return true;');
    await goToView(page, 'Kết quả');
    await clickButton(page, '.content button', 'Chạy');
    await page.waitForTimeout(1200);

    expect(await page.evaluate(() =>
      [...document.querySelectorAll('.panel')].some((x) => x.textContent.includes('Ảnh hưởng của tăng lương')))).toBe(false);

    await goToView(page, 'Dashboard');
    expect(await page.evaluate(() =>
      [...document.querySelectorAll('.stat .k')].some((x) => x.textContent.includes('Do tăng lương')))).toBe(false);

    await inPage(page, 'st.S.raises = JSON.parse(a); fm.ENGINE.invalidate(); st.setRESULT(null); return true;', saved);
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
