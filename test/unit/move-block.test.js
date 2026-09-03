/* moveBeside chuyển cả KHỐI. Nó là chỗ dễ sai nhất của việc kéo nhiều dòng:
   rút nhiều phần tử ra rồi chèn lại thì mọi chỉ số đều dịch. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../helpers/env.mjs';

/* widgets.js là mã trình duyệt (import dom.js, state.js…), nên lấy đúng hai hàm
   thuần tính toán ra mà chạy thay vì nạp cả module. */
const src = fs.readFileSync(path.join(ROOT, 'public/src/ui/widgets.js'), 'utf8');
const body = src.slice(src.indexOf('function moveBeside'), src.indexOf('function sortByKeys'));
const moveBeside = new Function(body + '; return moveBeside;')();

const A = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('kéo một dòng', () => {
  it('lên trước dòng khác', () => {
    const x = A.slice();
    expect(moveBeside(x, ['c'], 'a', true)).toBe(true);
    expect(x).toEqual(['c', 'a', 'b', 'd', 'e', 'f']);
  });
  it('xuống sau dòng khác', () => {
    const x = A.slice();
    expect(moveBeside(x, ['a'], 'd', false)).toBe(true);
    expect(x).toEqual(['b', 'c', 'd', 'a', 'e', 'f']);
  });
  it('nhận cả phần tử trần, không chỉ mảng', () => {
    const x = A.slice();
    expect(moveBeside(x, 'c', 'a', true)).toBe(true);
    expect(x[0]).toBe('c');
  });
});

describe('kéo cả khối', () => {
  it('khối rời rạc gom lại tại đích, GIỮ thứ tự trong mảng gốc', () => {
    const x = A.slice();
    /* Bấm chọn theo thứ tự e, b, d — thứ tự bấm KHÔNG quyết định. */
    expect(moveBeside(x, ['e', 'b', 'd'], 'a', true)).toBe(true);
    expect(x).toEqual(['b', 'd', 'e', 'a', 'c', 'f']);
  });

  it('khối liền nhau kéo xuống cuối', () => {
    const x = A.slice();
    expect(moveBeside(x, ['a', 'b'], 'f', false)).toBe(true);
    expect(x).toEqual(['c', 'd', 'e', 'f', 'a', 'b']);
  });

  it('không mất phần tử nào, không nhân bản phần tử nào', () => {
    const x = A.slice();
    moveBeside(x, ['c', 'a', 'f'], 'd', true);
    expect(x.slice().sort()).toEqual(A.slice().sort());
    expect(x).toHaveLength(A.length);
  });
});

describe('không đổi gì thì nói không đổi gì', () => {
  it('thả lên chính dòng đang kéo', () => {
    const x = A.slice();
    expect(moveBeside(x, ['c'], 'c', true)).toBe(false);
    expect(x).toEqual(A);
  });
  it('thả vào giữa chính khối đang chọn', () => {
    const x = A.slice();
    expect(moveBeside(x, ['a', 'b', 'c'], 'b', true)).toBe(false);
    expect(x).toEqual(A);
  });
  it('kéo dòng ngay trước đích, thả "trước đích" — vị trí không đổi', () => {
    const x = A.slice();
    expect(moveBeside(x, ['a'], 'b', true)).toBe(false);
    expect(x).toEqual(A);
  });
  it('đích không có trong mảng thì trả lại nguyên trạng', () => {
    const x = A.slice();
    expect(moveBeside(x, ['a'], 'khong-co', true)).toBe(false);
    expect(x).toEqual(A);
  });
  it('phần tử kéo không có trong mảng', () => {
    const x = A.slice();
    expect(moveBeside(x, ['zz'], 'c', true)).toBe(false);
    expect(x).toEqual(A);
  });
});
