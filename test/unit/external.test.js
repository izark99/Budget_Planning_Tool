/* MỐC SỐ 2 — ngân sách ngoài định biên.

   golden-result.json canh năm trường mà thiết kế này CỐ Ý không đụng tới
   (grand, monthTotals, totalsByFc, data, pivot). Nhờ vậy nó chứng minh được
   "không đụng vào phép tính" — nhưng cũng vì vậy nó vĩnh viễn mù với một hồi
   quy của chính phần ngoài định biên. Tệp này là cái lưới bù vào đúng chỗ đó,
   cộng với những bất biến mà cả thiết kế dựa vào. */
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import { GOLDEN, GOLDEN_EXT, STATE_EXT, STATE_FIXTURE } from '../helpers/env.mjs';
import { canon, canonExt, explainDiff } from '../helpers/canon.mjs';
import { loadEngine, runOn } from '../helpers/load-engine.mjs';

const snapshot = JSON.parse(fs.readFileSync(STATE_FIXTURE, 'utf8'));
const extSnapshot = JSON.parse(fs.readFileSync(STATE_EXT, 'utf8'));
const golden = fs.readFileSync(GOLDEN, 'utf8').trim();
const goldenExt = fs.readFileSync(GOLDEN_EXT, 'utf8').trim();

let state, formula, ext;
beforeAll(async () => {
  ({ state, formula } = await loadEngine());
  ext = await import('../../public/src/core/external.js');
});

describe('golden ngoài định biên', () => {
  it('chuỗi canonical trùng khớp từng ký tự', () => {
    const text = canonExt(runOn(state, formula, extSnapshot), ext);
    if (text !== goldenExt) throw new Error('phần ngoài định biên lệch golden:\n' + explainDiff(text, goldenExt));
    expect(text).toBe(goldenExt);
  });

  it('fixture ngoài định biên chạm đủ các trường hợp cần canh', () => {
    /* Nếu ai đó rút gọn fixture thì golden vẫn "pass" mà hết canh được gì. */
    const rows = extSnapshot.external;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.some((r) => !r.costCenter || !r.accountCode)).toBe(true);   /* mã để trống */
    expect(rows.some((r) => r.m1 === '')).toBe(true);                        /* tháng để trống */
    const cc = rows.map((r) => r.costCode);
    expect(new Set(cc).size).toBeLessThan(cc.length);                        /* trùng Cost Code */
  });

  it('fixture GỐC không có dòng ngoài định biên nào', () => {
    /* Chính điều này làm cho golden cũ trùng khớp bằng CẤU TRÚC chứ không phải
       nhờ may mắn. Fixture gốc mọc thêm external là lý lẽ đó hết hiệu lực. */
    expect(snapshot.external === undefined || snapshot.external.length === 0).toBe(true);
  });
});

describe('không đụng vào phép tính', () => {
  it('thêm ngân sách ngoài định biên KHÔNG làm lệch golden cũ một ký tự', () => {
    /* Bất biến quan trọng nhất của cả đợt này. canon() đọc grand, monthTotals,
       totalsByFc, toàn bộ mảng data và bảng pivot — nếu phần ngoài định biên rò
       vào bất kỳ trường nào trong số đó thì dòng này đỏ. */
    const text = canon(runOn(state, formula, extSnapshot));
    if (text !== golden) throw new Error('phần ngoài định biên đã rò vào phép tính:\n' + explainDiff(text, golden));
    expect(text).toBe(golden);
  });

  it('state rỗng thì phần ngoài định biên là số 0, không phải null', () => {
    const R = runOn(state, formula, snapshot);
    expect(R.external).toEqual({ rows: [], months: new Array(12).fill(0), grand: 0, n: 0 });
    /* Nơi gọi không bao giờ phải kiểm null — ba hàm cộng chung vẫn chạy. */
    expect(ext.grandAll(R)).toBe(R.grand);
    expect(ext.monthTotalsAll(R)).toEqual(R.monthTotals);
    expect(ext.pivotAll(R)).toBe(R.pivot);
  });
});

describe('ba hàm cộng chung', () => {
  let R;
  beforeAll(() => { R = runOn(state, formula, extSnapshot); });

  it('grandAll = phần định biên + phần ngoài định biên', () => {
    expect(ext.grandAll(R)).toBe(R.grand + R.external.grand);
    expect(R.external.grand).toBeGreaterThan(0);
  });

  it('Σ 12 tháng cộng chung = grandAll', () => {
    const s = ext.monthTotalsAll(R).reduce((a, b) => a + b, 0);
    expect(Math.round(s)).toBe(Math.round(ext.grandAll(R)));
  });

  it('Σ bảng pivot đầy đủ = grandAll, và dài đúng bằng hai phần cộng lại', () => {
    const pv = ext.pivotAll(R);
    expect(pv.length).toBe(R.pivot.length + R.external.n);
    expect(Math.round(pv.reduce((a, p) => a + p.total, 0))).toBe(Math.round(ext.grandAll(R)));
    /* Phần định biên đứng TRƯỚC, nguyên thứ tự máy tính đã sắp. */
    expect(pv.slice(0, R.pivot.length)).toEqual(R.pivot);
  });
});

describe('đọc một dòng ngoài định biên', () => {
  const line = (o) => {
    const r = { division: '', budgetCode: '', costCenter: '', costCode: '', accountCode: '', name: '' };
    for (let i = 1; i <= 12; i++) r['m' + i] = '';
    return ext.extLine(Object.assign(r, o));
  };

  it('12 trường phẳng thành mảng m[12] đúng thứ tự, total bằng tổng', () => {
    const p = line({ m1: 10, m7: 700, m12: 1200 });
    expect(p.m).toEqual([10, 0, 0, 0, 0, 0, 700, 0, 0, 0, 0, 1200]);
    expect(p.total).toBe(1910);
  });

  it('ô tháng để trống hay chỉ có dấu cách thành 0, không thành NaN', () => {
    /* Ô type:num của dataTable ghi chuỗi rỗng khi người dùng xoá trắng, mà
       Number(' ') ra NaN — một NaN là đầu độc mọi tổng phía sau. */
    const p = line({ m1: '', m2: '   ', m3: null, m4: undefined, m5: '1 000' });
    /* numOf bỏ dấu phẩy và khoảng trắng, còn dấu chấm vẫn là dấu thập phân —
       đúng như mọi ô số khác trong app, không phải luật riêng của màn này. */
    expect(p.m.slice(0, 5)).toEqual([0, 0, 0, 0, 1000]);
    expect(p.total).toBe(1000);
    expect(isNaN(p.total)).toBe(false);
  });

  it('mã để trống dùng ĐÚNG chữ mà máy tính dùng, không phải chữ thứ hai', () => {
    /* Hai cách viết "chưa khai" trong cùng một bảng pivot là lỗi người đọc file
       phát hiện ra trước tiên. */
    const R = runOn(state, formula, extSnapshot);
    const blank = line({ costCode: 'X' });
    const fromEngine = R.pivot[0];
    expect(blank.division).toBe(fromEngine.division);
    expect(blank.costCenter).toBe(fromEngine.costCenter);
  });

  it('Diễn giải đứng ở cột TenCongThuc, dấu đứng ở cột Formula Code', () => {
    const p = line({ name: 'Thuê ngoài', costCode: 'X' });
    expect(p.formulaName).toBe('Thuê ngoài');
    expect(p.formulaCode).toBe(ext.extMark());
    expect(p.formulaCode).not.toBe('ext.marker');   /* t() đã nạp, không phải khoá thô */
  });
});

describe('chạy được khi CHƯA có bảng định biên', () => {
  it('chỉ có ngân sách ngoài định biên: không ném lỗi, tổng vẫn ra', () => {
    /* Bản "chỉ có khoản tính sẵn ở ngoài" là một kịch bản thật, và nó là lý do
       cửa chặn ở runBudget() được nới. */
    const only = JSON.parse(JSON.stringify(extSnapshot));
    only.hc = { headers: [], rows: [], file: '', at: '' };
    const R = runOn(state, formula, only);
    expect(R.grand).toBe(0);
    expect(R.rows.length).toBe(0);
    expect(R.pivot).toEqual([]);
    expect(R.external.grand).toBeGreaterThan(0);
    expect(ext.grandAll(R)).toBe(R.external.grand);
    expect(ext.pivotAll(R).length).toBe(R.external.n);
  });
});
