/* Hai biến hệ thống của TỪNG DÒNG: TONG_THANG và THANG_BAT_DAU.
   Khác THANG/DINH_BIEN ở chỗ chúng KHÔNG đổi theo tháng — cùng một dòng thì cả
   12 tháng cho cùng một giá trị. Đó cũng là lý do chúng không được nằm trong
   MONTH_VARS: nhét vào đó là ép mọi công thức dùng chúng phải eval lại 12 lần. */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { STATE_FIXTURE } from '../helpers/env.mjs';
import { loadEngine } from '../helpers/load-engine.mjs';

const snapshot = JSON.parse(fs.readFileSync(STATE_FIXTURE, 'utf8'));
let state, formula;

beforeAll(async () => { ({ state, formula } = await loadEngine()); });

/** Đặt định biên 12 tháng cho dòng đầu rồi thử một công thức trên nó.
    Ghi vào ĐÚNG các cột tháng của file (cột '1'..'12'), vì buildRows() dựng __m
    từ cột tháng chứ không đọc thuộc tính __m nào gán sẵn. */
function onRow(months, src) {
  const s = JSON.parse(JSON.stringify(snapshot));
  months.forEach((v, k) => { s.hc.rows[0][String(k + 1)] = v; });
  s.formulas[0].rules = [{ id: 'r', name: 'Tất cả', cond: '', formula: src }];
  state.setS(s);
  formula.ENGINE.invalidate(); state.setRESULT(null);
  return formula.ENGINE.previewRow(s.formulas[0], 0);
}

const at = (p, m) => p.months[m - 1].raw;

describe('TONG_THANG', () => {
  it('T03→T12 cho 10, đúng ví dụ đã nêu', () => {
    const p = onRow([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'TONG_THANG');
    expect(at(p, 3)).toBe(10);
  });

  it('đếm cả tháng ngắt quãng, không phải khoảng liền', () => {
    const p = onRow([1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0], 'TONG_THANG');
    expect(at(p, 1)).toBe(3);
  });

  it('dòng cả năm trống cho 0', () => {
    const p = onRow([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'TONG_THANG');
    expect(at(p, 1)).toBe(12);
  });

  it('KHÔNG đổi theo tháng — cả 12 tháng cùng một giá trị', () => {
    const p = onRow([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'TONG_THANG');
    const vals = p.months.filter((x) => { return x.hcf; }).map((x) => { return x.raw; });
    expect([...new Set(vals)]).toEqual([10]);
  });
});

describe('THANG_BAT_DAU', () => {
  it('T03→T12 cho 3, đúng ví dụ đã nêu', () => {
    const p = onRow([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'THANG_BAT_DAU');
    expect(at(p, 3)).toBe(3);
  });

  it('lấy tháng có định biên ĐẦU TIÊN, kể cả khi sau đó đứt quãng', () => {
    const p = onRow([0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0], 'THANG_BAT_DAU');
    expect(at(p, 2)).toBe(2);
  });

  it('dùng chung được với biến tháng', () => {
    const p = onRow([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'THANG - THANG_BAT_DAU');
    expect(at(p, 3)).toBe(0);
    expect(at(p, 12)).toBe(9);
  });
});

describe('không phải biến tháng', () => {
  /* Nếu lỡ thêm vào MONTH_VARS thì công thức chỉ dùng hai biến này sẽ bị coi là
     phụ thuộc tháng, mất bộ nhớ đệm eval — chậm đi mà không được gì. */
  it('công thức chỉ dùng TONG_THANG không bị coi là phụ thuộc tháng', () => {
    const c = formula.FX.tryCompile('TONG_THANG * 2');
    expect(c.ok).toBe(true);
    expect(c.fn.info.monthDependent).toBe(false);
  });

  it('THANG_BAT_DAU cũng vậy; còn THANG thì có', () => {
    expect(formula.FX.tryCompile('THANG_BAT_DAU').fn.info.monthDependent).toBe(false);
    expect(formula.FX.tryCompile('THANG').fn.info.monthDependent).toBe(true);
  });
});
