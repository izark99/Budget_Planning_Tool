/* Ảnh hưởng của tăng lương, tách theo từng đợt.
   Điều phải đúng trước hết: các PHẦN cộng lại ĐÚNG BẰNG cái TỔNG. Đó là lý do
   dùng cộng dồn theo thứ tự khai báo chứ không phải bỏ-một-đợt-ra: các đợt nhân
   chồng lên nhau nên bỏ-một-đợt-ra không cộng ra tổng. */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { STATE_FIXTURE } from '../helpers/env.mjs';
import { loadEngine, runOn } from '../helpers/load-engine.mjs';

const snapshot = JSON.parse(fs.readFileSync(STATE_FIXTURE, 'utf8'));
let state, formula;

beforeAll(async () => { ({ state, formula } = await loadEngine()); });

/** Chạy tính với danh sách đợt tăng cho trước. */
function withRaises(raises, tweak) {
  const s = JSON.parse(JSON.stringify(snapshot));
  s.raises = raises;
  if (tweak) tweak(s);
  return runOn(state, formula, s);
}

const sum = (arrs) => {
  let n = 0;
  arrs.forEach((a) => { for (let i = 0; i < a.length; i++) n += a[i]; });
  return n;
};

const TWO = [
  { id: 'r1', name: 'Đợt 1', fromMonth: 4, pct: 10, cond: '', formulas: [], active: true },
  { id: 'r2', name: 'Đợt 2', fromMonth: 7, pct: 5, cond: '', formulas: [], active: true },
];

describe('hai đợt tăng chồng nhau', () => {
  let R;
  beforeAll(() => { R = withRaises(TWO); });

  it('các phần cộng lại đúng bằng tổng', () => {
    const parts = R.raiseImpact.reduce((a, x) => { return a + x.total; }, 0);
    expect(parts).toBe(R.raiseTotal);
  });

  it('tổng = ngân sách đang tính trừ ngân sách khi bỏ hết đợt tăng', () => {
    expect(sum(R.data) - sum(R.dataNoRaise)).toBe(R.raiseTotal);
  });

  it('trùng đúng với một lần chạy KHÔNG khai đợt tăng nào', () => {
    /* Thước đo độc lập: chạy lại từ đầu với S.raises rỗng phải ra đúng con số
       mà nhánh song song đã dựng. */
    const R0 = withRaises([]);
    expect(sum(R.dataNoRaise)).toBe(sum(R0.data));
    expect(R.grand - R0.grand).toBe(R.raiseTotal);
  });

  it('tăng lương chỉ làm ngân sách tăng lên, không âm', () => {
    expect(R.raiseTotal).toBeGreaterThan(0);
    R.raiseImpact.forEach((x) => { expect(x.total).toBeGreaterThan(0); });
  });

  it('mỗi đợt chỉ chạm từ tháng đã khai trở đi', () => {
    R.raiseImpact.forEach((x) => {
      for (let m = 0; m < x.fromMonth - 1; m++) expect(x.byMonth[m]).toBe(0);
    });
    /* Và đợt bắt đầu muộn hơn thì có ít tháng chạm hơn. */
    const n = (x) => x.byMonth.filter((v) => v !== 0).length;
    expect(n(R.raiseImpact[1])).toBeLessThan(n(R.raiseImpact[0]));
  });

  it('byMonth và byFc của mỗi đợt cộng lại đúng bằng total của đợt đó', () => {
    R.raiseImpact.forEach((x) => {
      expect(x.byMonth.reduce((a, b) => a + b, 0)).toBe(x.total);
      expect(Object.keys(x.byFc).reduce((a, k) => a + x.byFc[k], 0)).toBe(x.total);
    });
  });

  it('giữ tên và tham số của đợt để màn hình hiện lại được', () => {
    expect(R.raiseImpact.map((x) => x.name)).toEqual(['Đợt 1', 'Đợt 2']);
    expect(R.raiseImpact.map((x) => x.pct)).toEqual([10, 5]);
    expect(R.raiseImpact.map((x) => x.fromMonth)).toEqual([4, 7]);
  });
});

describe('đợt tăng khai đích danh một CÔNG THỨC DÙNG CHUNG', () => {
  /* Đợt tăng có HAI đường vào số liệu: liệt kê đích danh một công thức dùng
     chung thì nó được áp BÊN TRONG chính công thức đó (buildShared), còn lại thì
     áp ở vòng tính của công thức chi phí. File mẫu dùng đúng đường thứ nhất.
     Bản đầu tôi đo tại chỗ ở vòng ngoài nên bỏ sót hẳn đường này và báo 0 đồng —
     đó là lý do phần đo phải chạy lại cả lượt tính. */
  it('vẫn đo ra tiền, không báo 0', () => {
    const R = runOn(state, formula, snapshot);
    expect(snapshot.raises[0].formulas).toEqual(['LUONG_CO_BAN']);
    expect(R.raiseTotal).toBeGreaterThan(0);
    expect(R.raiseImpact[0].total).toBe(R.raiseTotal);
  });

  it('khớp đúng hiệu của hai lượt chạy độc lập', () => {
    const R = runOn(state, formula, snapshot);
    const R0 = withRaises([]);
    expect(R.raiseTotal).toBe(R.grand - R0.grand);
  });
});

describe('không có đợt tăng nào', () => {
  it('raiseTotal = 0 và KHÔNG cấp phát mảng song song', () => {
    const R = withRaises([]);
    expect(R.raiseTotal).toBe(0);
    expect(R.raiseImpact).toBeNull();
    expect(R.dataNoRaise).toBeNull();
  });

  it('đợt tăng bị tắt cũng vậy — không tính, không cấp phát', () => {
    const R = withRaises([{ id: 'r1', name: 'Tắt', fromMonth: 1, pct: 50, cond: '', formulas: [], active: false }]);
    expect(R.raiseTotal).toBe(0);
    expect(R.dataNoRaise).toBeNull();
  });
});

describe('đợt tăng có điều kiện', () => {
  it('chỉ chạm những dòng khớp điều kiện', () => {
    const cond = '[Dept] = "AC"';
    const R = withRaises([{ id: 'r1', name: 'Chỉ AC', fromMonth: 1, pct: 20, cond, formulas: [], active: true }]);
    const nMatch = formula.ENGINE.countMatch(cond).n;

    expect(nMatch).toBeGreaterThan(0);
    expect(nMatch).toBeLessThan(R.rows.length);
    /* Số dòng chạm không vượt quá số dòng khớp điều kiện. */
    expect(R.raiseImpact[0].nRows).toBeGreaterThan(0);
    expect(R.raiseImpact[0].nRows).toBeLessThanOrEqual(nMatch * R.formulas.length);

    /* Và dòng KHÔNG khớp thì phần "không tăng lương" trùng đúng phần đang tính. */
    const idx = R.rows.findIndex((r) => { return r.Dept !== 'AC'; });
    expect(idx).toBeGreaterThanOrEqual(0);
    for (let c = 0; c < R.data.length; c++) {
      for (let m = 0; m < 12; m++) {
        expect(R.dataNoRaise[c][idx * 12 + m]).toBe(R.data[c][idx * 12 + m]);
      }
    }
  });

  it('đợt tăng khai riêng cho một Formula Code chỉ chạm đúng mã đó', () => {
    const code = snapshot.formulas[0].code;
    const R = withRaises([{ id: 'r1', name: 'Riêng', fromMonth: 1, pct: 30, cond: '', formulas: [code], active: true }]);
    expect(Object.keys(R.raiseImpact[0].byFc)).toEqual([code]);
  });
});
