/* FX — máy biểu thức kiểu Excel. Đây là phần KHÔNG biết gì về ngân sách; giai
   đoạn 2 sẽ tách nó ra core/expression.js. Bộ kiểm này khoá lại hành vi để việc
   tách chỉ còn là chuyện di chuyển tệp. */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadEngine } from '../helpers/load-engine.mjs';

let FX;
beforeAll(async () => { ({ formula: { FX } } = await loadEngine()); });

/* ctx tối thiểu: một dòng định biên, bảng tra tên cột, hằng số, biến tháng. */
const CTX = () => ({
  row: { Dept: 'AC', Coefficient: 3.5, 'Ngày công chuẩn': 26, Position: ' Trưởng phòng ' },
  fieldIndex: { dept: 'Dept', coefficient: 'Coefficient', 'ngày công chuẩn': 'Ngày công chuẩn', position: 'Position' },
  params: { LUONG_CO_SO: 2340000, TY_LE_BHXH_CTY: 21.5 },
  vars: { THANG: 3, DINH_BIEN: 1, SO_THANG: 12 },
  lookups: {},
  shared: {},
});

const ev = (src, ctx = CTX()) => FX.compile(src).eval(ctx);
const num = (src, ctx) => FX.toNum(ev(src, ctx));

describe('số học và thứ tự ưu tiên', () => {
  it.each([
    ['1+2*3', 7],
    ['(1+2)*3', 9],
    /* Hai dòng này bám theo Excel chứ không theo ký pháp toán học:
       Excel kết hợp ^ từ TRÁI (=2^3^2 ra 64, không phải 512), và dấu âm bám
       chặt hơn ^ (=-2^2 ra 4, không phải -4). Đổi thành "đúng toán học" là
       làm lệch khỏi công thức người dùng gõ trong Excel. */
    ['2^3^2', 64],
    ['-2^2', 4],
    ['10/4', 2.5],
    ['7-3-2', 2],
  ])('%s = %s', (src, want) => expect(num(src)).toBe(want));

  it('chia cho 0 ra #DIV/0! chứ không phải Infinity', () => {
    expect(FX.errText(ev('1/0'))).toBe('#DIV/0!');
  });
});

describe('tham chiếu cột định biên', () => {
  it('[Tên cột] lấy đúng giá trị của dòng', () => {
    expect(num('[Coefficient]')).toBe(3.5);
  });

  it('không phân biệt hoa thường và khoảng trắng thừa', () => {
    expect(num('[  coefficient  ]')).toBe(3.5);
  });

  it('tên cột có dấu tiếng Việt dùng được', () => {
    expect(num('[Ngày công chuẩn]')).toBe(26);
  });

  it('cột không tồn tại ra #REF!', () => {
    expect(FX.errText(ev('[KhongCoCotNay]'))).toBe('#REF!');
  });
});

describe('hằng số, biến tháng, cú pháp %', () => {
  it('hằng số toàn cục', () => expect(num('LUONG_CO_SO')).toBe(2340000));
  it('biến tháng THANG', () => expect(num('THANG')).toBe(3));
  it('DINH_BIEN và SO_THANG', () => expect(num('DINH_BIEN * SO_THANG')).toBe(12));
  it('hậu tố % chia 100', () => expect(num('TY_LE_BHXH_CTY%')).toBeCloseTo(0.215, 10));
  it('tên không có nguồn ra #NAME?', () => expect(FX.errText(ev('KHONG_CO_TEN_NAY'))).toBe('#NAME?'));
});

/* LỖI ĐÃ BÁO: ô nhập tên tham số và mã công thức dùng chung đều lọc [^A-Z0-9_],
   tức app CHO PHÉP đặt tên 13TH_LUONG. Nhưng tokenize() thử số TRƯỚC khi thử
   tên, còn isIdentStart không nhận chữ số — nên 13TH_LUONG tách thành số 13 rồi
   tên TH_LUONG. App hứa một đằng, máy đọc một nẻo. */
describe('tên bắt đầu bằng chữ số', () => {
  const ctxNum = () => {
    const c = CTX();
    c.params = { '13TH_LUONG': 5000000, '3M_THUONG': 300, LUONG_CO_SO: 2340000 };
    return c;
  };

  it('là MỘT tên, không phải số rồi tên', () => {
    const info = FX.compile('13TH_LUONG').info;
    expect(info.names).toEqual(['13TH_LUONG']);
  });

  it('tính ra đúng giá trị của tham số', () => {
    expect(num('13TH_LUONG', ctxNum())).toBe(5000000);
    expect(num('3M_THUONG * 2', ctxNum())).toBe(600);
  });

  it('tên bắt đầu bằng số mà không khai ra #NAME?, không âm thầm ra số', () => {
    expect(FX.errText(ev('99KHONG_KHAI'))).toBe('#NAME?');
  });

  /* Ranh giới: những thứ ĐANG chạy đúng phải giữ nguyên là số. */
  it.each([
    ['2e3', 2000],
    ['1.5', 1.5],
    ['2*3', 6],
    ['10%', 0.1],
    ['.5+1', 1.5],
  ])('%s vẫn là số', (src, want) => expect(num(src)).toBeCloseTo(want, 10));
});

describe('hàm', () => {
  it.each([
    ['ROUND(1234.567, -3)', 1000],
    ['ROUND(2.5, 0)', 3],
    ['ROUNDUP(1.01, 0)', 2],
    ['ROUNDDOWN(1.99, 0)', 1],
    ['INT(-1.5)', -2],
    ['MOD(7, 3)', 1],
    ['ABS(-5)', 5],
    ['CEILING(7, 3)', 9],
    ['FLOOR(7, 3)', 6],
    ['SUM(1, 2, 3)', 6],
    ['AVERAGE(2, 4)', 3],
    ['MIN(3, 1, 2)', 1],
    ['MAX(3, 1, 2)', 3],
    ['LEN("abc")', 3],
  ])('%s = %s', (src, want) => expect(num(src)).toBe(want));

  it('IF chọn nhánh đúng', () => {
    expect(num('IF([Coefficient] > 3, 100, 200)')).toBe(100);
    expect(num('IF([Coefficient] > 9, 100, 200)')).toBe(200);
  });

  it('IFERROR nuốt lỗi', () => {
    expect(num('IFERROR(1/0, 42)')).toBe(42);
    expect(num('IFERROR(7, 42)')).toBe(7);
  });

  it('IFS và SWITCH', () => {
    expect(num('IFS([Coefficient] > 9, 1, [Coefficient] > 3, 2, TRUE, 3)')).toBe(2);
    expect(num('SWITCH([Dept], "SL", 1, "AC", 2, 99)')).toBe(2);
  });

  it('TRIM/UPPER/LEFT trên chuỗi', () => {
    expect(FX.toStr(ev('TRIM([Position])'))).toBe('Trưởng phòng');
    expect(FX.toStr(ev('UPPER("abc")'))).toBe('ABC');
    expect(FX.toStr(ev('LEFT("abcdef", 3)'))).toBe('abc');
  });

  it('AND/OR/NOT', () => {
    expect(FX.toBool(ev('AND(1=1, 2=2)'))).toBe(true);
    expect(FX.toBool(ev('OR(1=2, 2=2)'))).toBe(true);
    expect(FX.toBool(ev('NOT(1=1)'))).toBe(false);
  });

  it('gọi hàm không có ra #NAME?', () => {
    expect(FX.errText(ev('HAM_KHONG_CO(1)'))).toBe('#NAME?');
  });
});

describe('so sánh và nối chuỗi', () => {
  it.each([
    ['1 = 1', true], ['1 <> 2', true], ['1 < 2', true],
    ['2 >= 2', true], ['3 <= 2', false],
  ])('%s = %s', (src, want) => expect(FX.toBool(ev(src))).toBe(want));

  it('& nối chuỗi', () => expect(FX.toStr(ev('[Dept] & "-" & 1'))).toBe('AC-1'));
});

describe('analyze — thông tin biên dịch', () => {
  it('liệt kê cột và tên mà biểu thức dùng tới', () => {
    const info = FX.compile('[Coefficient] * LUONG_CO_SO + [Dept]').info;
    expect(info.fields.sort()).toEqual(['Coefficient', 'Dept']);
    expect(info.names).toContain('LUONG_CO_SO');
  });

  /* monthDependent quyết định ENGINE có được cache kết quả qua 12 tháng hay
     không. Nhận sai là số liệu sai âm thầm. */
  it('đánh dấu phụ thuộc tháng khi có biến tháng', () => {
    expect(FX.compile('THANG * 2').info.monthDependent).toBe(true);
    expect(FX.compile('[Coefficient] * 2').info.monthDependent).toBe(false);
  });
});

describe('tryCompile — lỗi cú pháp', () => {
  it('biểu thức hỏng trả về lỗi thay vì ném', () => {
    const r = FX.tryCompile('1 + + )');
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });

  /* Mảng token trong tokenize() từng được đặt tên `t`, che mất hàm dịch t()
     import ở đầu tệp — nên MỌI lỗi cú pháp báo ra "t is not a function" thay vì
     câu tiếng Việt. checkJs tìm ra; phép kiểm này khoá lại. */
  it.each([
    ['"chuoi chua dong', 'Thiếu dấu " đóng chuỗi'],
    ['[Cot chua dong', 'Thiếu dấu ] đóng tên cột'],
    ['1 + \u00A7', 'Ký tự không hợp lệ: "\u00A7"'],
  ])('%s báo đúng câu tiếng Việt, không phải lỗi nội bộ', (src, want) => {
    const r = FX.tryCompile(src);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(want);
    expect(r.error).not.toMatch(/is not a function/);
  });

  it('biểu thức đúng trả về hàm dùng được', () => {
    const r = FX.tryCompile('1 + 1');
    expect(r.ok).toBe(true);
    expect(FX.toNum(r.fn.eval(CTX()))).toBe(2);
  });
});

describe('công thức dùng chung trong ctx', () => {
  /* Sổ đăng ký giống hệt thứ ENGINE.buildShared() dựng ra: bản ghi mang hàm ĐÃ
     BIÊN DỊCH, và được đăng ký dưới CẢ tên gọi lẫn diễn giải, đều viết hoa. */
  const rec = (code, name, src) => ({ code, name, fn: FX.compile(src), raises: [] });
  const register = (reg, r) => {
    reg[r.code.toUpperCase()] = r;
    if (r.name) reg[r.name.toUpperCase()] = r;
    return reg;
  };
  const withShared = () => ({
    ...CTX(),
    shared: register({}, rec('LUONG_CO_BAN', 'Lương cơ bản', 'ROUND([Coefficient]*LUONG_CO_SO,-3)')),
  });

  it('gọi được bằng tên gọi', () => {
    expect(num('LUONG_CO_BAN', withShared())).toBe(8190000);
  });

  it('gọi bằng [Diễn giải] ra cùng giá trị', () => {
    expect(num('[Lương cơ bản]', withShared())).toBe(num('LUONG_CO_BAN', withShared()));
  });

  it('biểu thức dùng chung hỏng cú pháp ra #NAME?', () => {
    const reg = { A: { code: 'A', name: 'A', fn: null, raises: [] } };
    expect(FX.errText(ev('A', { ...CTX(), shared: reg }))).toBe('#NAME?');
  });

  it('đợt tăng lương khai cho CT dùng chung nhân vào từ đúng tháng', () => {
    const r = rec('LUONG_CO_BAN', 'Lương cơ bản', '1000');
    r.raises = [{ from: 7, pct: 10, condFn: null }];
    const reg = register({}, r);
    expect(num('LUONG_CO_BAN', { ...CTX(), shared: reg, vars: { THANG: 6 } })).toBe(1000);
    expect(num('LUONG_CO_BAN', { ...CTX(), shared: reg, vars: { THANG: 7 } })).toBeCloseTo(1100, 6);
  });

  it('tham chiếu vòng ra #CIRC! chứ không tràn ngăn xếp', () => {
    const reg = {};
    register(reg, rec('A', '', 'B+1'));
    register(reg, rec('B', '', 'A+1'));
    expect(FX.errText(ev('A', { ...CTX(), shared: reg }))).toBe('#CIRC!');
  });
});

describe('FUNC_LIST', () => {
  it('công bố đủ danh sách hàm cho phần trợ giúp', () => {
    for (const f of ['IF', 'ROUND', 'SUM', 'VLOOKUP', 'IFERROR', 'SWITCH']) {
      expect(FX.FUNC_LIST).toContain(f);
    }
  });
});
