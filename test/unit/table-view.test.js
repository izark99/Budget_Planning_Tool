/* Sắp xếp và lọc theo cột — phần TÍNH TOÁN của tableView.

   Giao kèo quan trọng nhất: SORT CHỈ LÀ CÁCH XEM. Cả hai hàm phải trả mảng MỚI
   và không được đụng một sợi tóc nào của mảng nguồn — thứ tự thật của dữ liệu
   là thứ tự cột trong file Excel xuất ra và thứ tự áp bảng phân loại, chỉ đổi
   khi người dùng kéo thả.

   widgets.js là mã trình duyệt (window.XLTABLE ở cấp module), nên cắt đúng ba
   hàm thuần ra mà chạy — cùng cách test/unit/move-block.test.js đang làm. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../helpers/env.mjs';

const src = fs.readFileSync(path.join(ROOT, 'public/src/ui/widgets.js'), 'utf8');
const body = src.slice(src.indexOf('function viewValue'), src.indexOf('function tableView'));
/* numOf là hàm của state.js; tiêm vào thay vì chép lại, để bộ kiểm không tự
   định nghĩa một phép đổi số khác với phép của app. */
const numOf = (v) => { const n = parseFloat(String(v).replace(/[,\s]/g, '')); return isNaN(n) ? 0 : n; };
const { viewValue, viewFilter, viewSort } =
  new Function('numOf', body + '; return { viewValue, viewFilter, viewSort };')(numOf);

const COLS = [
  { k: 'dept', label: 'Dept', type: 'text' },
  { k: 'amt', label: 'Số tiền', type: 'num' },
  { k: 'note', label: 'Ghi chú', type: 'text' },
  { k: 'calc', label: 'Tính ra', type: 'num', get: (r) => r.amt * 2 }
];
const ROWS = [
  { dept: 'SL', amt: 30, note: 'b' },
  { dept: 'AC', amt: 200, note: 'a' },
  { dept: 'AC', amt: 9, note: 'c' },
  { dept: '', amt: 1000, note: '' },
  { dept: 'HR', amt: '', note: 'a' }
];
const names = (list) => list.map((r) => r.dept + ':' + r.amt);

describe('viewValue', () => {
  it('đọc theo khoá, hoặc theo get() nếu cột có', () => {
    expect(viewValue(COLS[0], ROWS[0])).toBe('SL');
    expect(viewValue(COLS[3], ROWS[0])).toBe(60);
  });
  it('null và undefined quy về chuỗi rỗng', () => {
    expect(viewValue(COLS[0], {})).toBe('');
    expect(viewValue(COLS[0], { dept: null })).toBe('');
  });
});

describe('viewSort', () => {
  it('cột số sắp theo GIÁ TRỊ, không theo chuỗi', () => {
    const out = viewSort(ROWS, COLS, [{ k: 'amt', dir: 'asc' }]);
    /* Sắp theo chuỗi thì 1000 đứng trước 200 và 30 — đây chính là bẫy. */
    expect(out.filter((r) => r.amt !== '').map((r) => r.amt)).toEqual([9, 30, 200, 1000]);
  });

  it('ô RỖNG xuống cuối, kể cả khi sắp GIẢM DẦN', () => {
    const asc = viewSort(ROWS, COLS, [{ k: 'amt', dir: 'asc' }]);
    const desc = viewSort(ROWS, COLS, [{ k: 'amt', dir: 'desc' }]);
    expect(asc[asc.length - 1].dept).toBe('HR');
    expect(desc[desc.length - 1].dept).toBe('HR');
  });

  it('nhiều khoá: khoá phụ chỉ quyết định khi khoá chính bằng nhau', () => {
    const out = viewSort(ROWS, COLS, [{ k: 'dept', dir: 'asc' }, { k: 'amt', dir: 'desc' }]);
    /* Hai dòng AC: khoá phụ giảm dần nên 200 trước 9. Dept rỗng xuống cuối. */
    expect(names(out)).toEqual(['AC:200', 'AC:9', 'HR:', 'SL:30', ':1000']);
  });

  it('ỔN ĐỊNH: hai dòng bằng nhau ở mọi khoá thì giữ nguyên thứ tự gốc', () => {
    const same = [{ dept: 'X', amt: 1, note: 'đầu' }, { dept: 'X', amt: 1, note: 'giữa' }, { dept: 'X', amt: 1, note: 'cuối' }];
    const out = viewSort(same, COLS, [{ k: 'dept', dir: 'asc' }]);
    expect(out.map((r) => r.note)).toEqual(['đầu', 'giữa', 'cuối']);
    /* Đảo chiều cũng vẫn ổn định, không lật ngược nhóm bằng nhau. */
    expect(viewSort(same, COLS, [{ k: 'dept', dir: 'desc' }]).map((r) => r.note))
      .toEqual(['đầu', 'giữa', 'cuối']);
  });

  it('sắp được theo cột có get()', () => {
    const out = viewSort(ROWS, COLS, [{ k: 'calc', dir: 'desc' }]);
    expect(out[0].amt).toBe(1000);
  });

  it('khoá lạ thì bỏ qua, không nổ', () => {
    expect(names(viewSort(ROWS, COLS, [{ k: 'khong_co', dir: 'asc' }]))).toEqual(names(ROWS));
  });

  /* GIAO KÈO: sort là cách XEM. */
  it('KHÔNG đụng vào mảng nguồn', () => {
    const before = names(ROWS);
    const out = viewSort(ROWS, COLS, [{ k: 'amt', dir: 'desc' }]);
    expect(names(ROWS)).toEqual(before);
    expect(out).not.toBe(ROWS);
  });

  it('không sắp gì thì vẫn trả MẢNG MỚI, đúng thứ tự cũ', () => {
    const out = viewSort(ROWS, COLS, []);
    expect(out).not.toBe(ROWS);
    expect(names(out)).toEqual(names(ROWS));
  });
});

describe('viewFilter', () => {
  it('lọc "chứa chữ", không phân biệt hoa thường', () => {
    expect(names(viewFilter(ROWS, COLS, { dept: { q: 'a', vals: [] } })))
      .toEqual(['AC:200', 'AC:9']);
  });

  it('lọc theo danh sách giá trị đã tích', () => {
    expect(names(viewFilter(ROWS, COLS, { dept: { q: '', vals: ['SL', 'HR'] } })))
      .toEqual(['SL:30', 'HR:']);
  });

  it('ô rỗng chọn được như một giá trị', () => {
    expect(names(viewFilter(ROWS, COLS, { dept: { q: '', vals: [''] } }))).toEqual([':1000']);
  });

  it('LỌC NHIỀU CỘT thì giao nhau', () => {
    const out = viewFilter(ROWS, COLS, {
      dept: { q: '', vals: ['AC'] },
      note: { q: 'c', vals: [] }
    });
    expect(names(out)).toEqual(['AC:9']);
  });

  it('trong một cột, "chứa chữ" và "danh sách" cũng phải cùng đúng', () => {
    const out = viewFilter(ROWS, COLS, { dept: { q: 'A', vals: ['SL'] } });
    expect(out).toHaveLength(0);
  });

  it('bộ lọc rỗng thì trả mảng MỚI, đủ dòng', () => {
    const out = viewFilter(ROWS, COLS, { dept: { q: '  ', vals: [] } });
    expect(out).not.toBe(ROWS);
    expect(names(out)).toEqual(names(ROWS));
  });

  it('KHÔNG đụng vào mảng nguồn', () => {
    const before = names(ROWS);
    viewFilter(ROWS, COLS, { dept: { q: 'a', vals: [] } });
    expect(names(ROWS)).toEqual(before);
  });
});

describe('lọc rồi sắp — đúng thứ tự đường ống của tableView.apply', () => {
  it('số trang tính trên kết quả LỌC, và thứ tự là của bản đã lọc', () => {
    const out = viewSort(
      viewFilter(ROWS, COLS, { dept: { q: '', vals: ['AC', 'SL'] } }),
      COLS, [{ k: 'amt', dir: 'asc' }]
    );
    expect(names(out)).toEqual(['AC:9', 'SL:30', 'AC:200']);
  });
});
