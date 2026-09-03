/* In lại công thức cho dễ đọc. Đi thẳng từ CÂY nên không thể lệch nghĩa, và có
   chốt an toàn: đọc lại bản vừa in, cây phải trùng cây cũ.
   Phép kiểm quan trọng nhất ở cuối — định dạng xong TÍNH RA CÙNG MỘT SỐ. */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadEngine } from '../helpers/load-engine.mjs';

let FX;
beforeAll(async () => { ({ formula: { FX } } = await loadEngine()); });

const CTX = () => ({
  row: { Dept: 'AC', Coefficient: 3.5, 'Ngày công chuẩn': 26, Position: 'Trưởng phòng' },
  fieldIndex: { dept: 'Dept', coefficient: 'Coefficient', 'ngày công chuẩn': 'Ngày công chuẩn', position: 'Position' },
  params: { LUONG_CO_SO: 2340000, TY_LE_BHXH_CTY: 21.5 },
  vars: { THANG: 3, DINH_BIEN: 1, SO_THANG: 12 },
  lookups: {}, shared: {},
});

const val = (src) => FX.toNum(FX.compile(src).eval(CTX()));

describe('giữ nguyên nghĩa', () => {
  /* Bộ này bao mọi loại nút của cây: số, chuỗi, cột, tên, âm, %, mọi bậc toán
     tử, hàm lồng hàm. */
  const CASES = [
    '1+2*3',
    '(1+2)*3',
    '2^3^2',
    '-2^2',
    '7-3-2',
    '10/4/5',
    '1-(2-3)',
    '[Coefficient] * LUONG_CO_SO',
    'TY_LE_BHXH_CTY%',
    '-[Coefficient]',
    '"a" & "b" & "c"',
    'IF([Dept]="AC", 1, 2)',
    'IF([Dept]="AC", IF([Coefficient]>3, 100, 200), IF([Coefficient]>2, 300, 400))',
    'ROUND([Coefficient]*LUONG_CO_SO, -3)',
    'MAX(1, 2, MIN(3, 4, 5))',
    'IF(AND([Dept]="AC", [Coefficient]>=3), ROUND([Coefficient]*LUONG_CO_SO*1.15, -3), ROUND(LUONG_CO_SO, -3))',
    '[Ngày công chuẩn] / 26 * 100%',
    'IF([Position]="Trưởng phòng", "có", "không")',
  ];

  it.each(CASES)('%s — định dạng xong vẫn ra đúng cây cũ', (src) => {
    const out = FX.fxFormat(src);
    expect(JSON.stringify(FX.parse(out))).toBe(JSON.stringify(FX.parse(src)));
  });

  it.each(CASES)('%s — và tính ra đúng cùng một số', (src) => {
    const a = FX.compile(src).eval(CTX());
    const b = FX.compile(FX.fxFormat(src)).eval(CTX());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('chuỗi có dấu nháy kép được thoát lại đúng', () => {
    const src = 'IF([Dept]="A""B", 1, 2)';
    expect(FX.fxFormat(src)).toContain('"A""B"');
    expect(val(FX.fxFormat(src))).toBe(val(src));
  });
});

describe('bẻ dòng cho dễ nhìn', () => {
  it('IF lồng nhiều tầng thì xuống dòng và thụt lề', () => {
    const src = 'IF([Dept]="AC", IF([Coefficient]>3, 100, 200), IF([Coefficient]>2, 300, 400))';
    const out = FX.fxFormat(src);
    expect(out.split('\n').length).toBeGreaterThan(3);
    /* Tầng trong thụt sâu hơn tầng ngoài. */
    const lines = out.split('\n');
    const indent = (l) => l.length - l.replace(/^ +/, '').length;
    expect(Math.max(...lines.map(indent))).toBeGreaterThan(0);
  });

  it('công thức ngắn thì để nguyên một dòng, đừng bẻ vô cớ', () => {
    expect(FX.fxFormat('1+2*3')).toBe('1 + 2 * 3');
    expect(FX.fxFormat('IF(1, 2, 3)')).toBe('IF(1, 2, 3)');
  });

  it('định dạng hai lần ra cùng một kết quả', () => {
    const src = 'IF(AND([Dept]="AC", [Coefficient]>=3), ROUND([Coefficient]*LUONG_CO_SO*1.15, -3), 0)';
    const once = FX.fxFormat(src);
    expect(FX.fxFormat(once)).toBe(once);
  });
});

describe('không đọc được thì không đụng vào', () => {
  it.each(['IF(', '1 +', ')(', '"chưa đóng', '[chưa đóng'])('%s — trả nguyên chuỗi', (src) => {
    expect(FX.fxFormat(src)).toBe(src);
  });

  it('chuỗi rỗng và khoảng trắng giữ nguyên', () => {
    expect(FX.fxFormat('')).toBe('');
    expect(FX.fxFormat('   ')).toBe('   ');
  });
});
