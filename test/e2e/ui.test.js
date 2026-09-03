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

describe('hộp gợi ý: tiêu đề dính khi cuộn', () => {
  /* Tiêu đề nằm TRONG vùng cuộn của .chipbox, nên nếu không dính thì cuộn xuống
     là mất tiêu đề, không còn biết đang xem hộp gì. */
  it('tiêu đề vẫn nằm trong khung nhìn sau khi cuộn hộp xuống', async () => {
    await goToView(page, 'Công thức chi phí');
    const r = await page.evaluate(async () => {
      const box = document.querySelector('.chipbox');
      const h = box && box.querySelector('h4');
      if (!h) return null;
      const sticky = getComputedStyle(h).position;
      /* Bóp trần chiều cao để chắc chắn có gì đó để cuộn — số chip phụ thuộc file
         định biên nên không thể trông chờ nó tự tràn. */
      const keep = box.style.maxHeight;
      box.style.maxHeight = '70px';
      box.scrollTop = box.scrollHeight;
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const hb = h.getBoundingClientRect(), bb = box.getBoundingClientRect();
      const out = {
        sticky, scrolled: box.scrollTop > 0,
        /* Tiêu đề còn nằm trọn trong khung nhìn của hộp hay đã trôi lên trên? */
        visible: hb.top >= bb.top - 1 && hb.bottom <= bb.bottom + 1,
        topGap: Math.round(hb.top - bb.top),
      };
      box.style.maxHeight = keep;
      return out;
    });
    expect(r).not.toBeNull();
    expect(r.sticky).toBe('sticky');
    expect(r.scrolled).toBe(true);
    /* Đã cuộn tới đáy mà tiêu đề vẫn hiện trọn trong hộp = nó dính thật.
       Không dính thì nó trôi lên trên, topGap âm mạnh. */
    expect(r.visible, `topGap=${r.topGap}`).toBe(true);
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

describe('bảng "Cột của bảng định biên"', () => {
  it('gấp lại được, và trạng thái gấp sống qua lần render lại', async () => {
    await goToView(page, 'Thiết lập');
    const findHead = () => page.evaluate(() => {
      const h = [...document.querySelectorAll('.panel > header.fold')]
        .find((x) => x.textContent.includes('Cột của bảng định biên'));
      return h ? { hasCaret: !!h.querySelector('.caret'), open: h.nextElementSibling.style.display !== 'none' } : null;
    });
    expect(await findHead()).toEqual({ hasCaret: true, open: true });

    await page.evaluate(() => {
      [...document.querySelectorAll('.panel > header.fold')]
        .find((x) => x.textContent.includes('Cột của bảng định biên')).click();
    });
    await page.waitForTimeout(200);
    expect((await findHead()).open).toBe(false);

    await goToView(page, 'Kết quả');
    await goToView(page, 'Thiết lập');
    expect((await findHead()).open).toBe(false);

    /* trả lại trạng thái mở cho các phép kiểm sau */
    await page.evaluate(() => {
      [...document.querySelectorAll('.panel > header.fold')]
        .find((x) => x.textContent.includes('Cột của bảng định biên')).click();
    });
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
