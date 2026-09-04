/* Bảng phân loại nhóm sinh NHIỀU cột giá trị.

   Hai thứ phải giữ cho bằng được:
     1. Bảng khai từ trước (cl.name + cl.type + cl.def, một cột) vẫn chạy y
        nguyên — không có bước chuyển đổi dữ liệu nào cả, nên nếu classOuts()
        đọc sai hình dạng cũ thì mọi file dự án đang lưu đều hỏng.
     2. NGỮ NGHĨA cũ của ô để trống. Bảng chính sách rơi về mặc định cả khi ô
        trống; bảng phân loại nhóm thì KHÔNG — chỉ khi không khớp dòng nào. Chép
        applyPolicies sang là lặng lẽ đổi số liệu của mọi dự án đang chạy. */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { STATE_FIXTURE } from '../helpers/env.mjs';
import { loadEngine } from '../helpers/load-engine.mjs';

const snapshot = JSON.parse(fs.readFileSync(STATE_FIXTURE, 'utf8'));
let state, formula;

beforeAll(async () => { ({ state, formula } = await loadEngine()); });

const LEGACY = () => ({ id: 'c1', name: 'NHOM', type: 'text', keys: ['Dept'], rows: [['AC', 'X']], def: 'ZZ' });
const MULTI = () => ({
  id: 'c2', name: 'Bảng nhiều cột', keys: ['Dept'],
  outs: [{ name: 'NHOM', type: 'text' }, { name: 'HE_SO', type: 'num' }],
  rows: [['AC', 'X', 3]], def: ['ZZ', 9]
});

describe('classOuts / classDef đọc được cả hai hình dạng', () => {
  it('bảng cũ: tên bảng chính là tên cột, kiểu và mặc định lấy từ trường cũ', () => {
    const cl = LEGACY();
    expect(state.classOuts(cl)).toEqual([{ name: 'NHOM', type: 'text' }]);
    expect(state.classDef(cl, 0)).toBe('ZZ');
    /* Cột thứ hai không tồn tại — hỏi tới thì trả rỗng, không nổ. */
    expect(state.classDef(cl, 1)).toBe('');
  });

  it('bảng mới: outs[] nguyên vẹn, def[] khớp chỉ số', () => {
    const cl = MULTI();
    expect(state.classOuts(cl).map((o) => o.name)).toEqual(['NHOM', 'HE_SO']);
    expect(state.classDef(cl, 1)).toBe(9);
  });

  it('bảng chưa đặt tên, chưa khai cột nào thì KHÔNG sinh cột — applyClasses bỏ qua', () => {
    expect(state.classOuts({ id: 'x', name: '', keys: [], rows: [] })).toEqual([]);
    /* outs có mà tên rỗng cũng không tính. */
    expect(state.classOuts({ id: 'x', name: '', outs: [{ name: '', type: 'text' }] })).toEqual([]);
  });

  it('ensureClassOuts ghi hẳn hình dạng mới, gọi lần hai không đổi gì', () => {
    const cl = LEGACY();
    state.ensureClassOuts(cl);
    expect(cl.outs).toEqual([{ name: 'NHOM', type: 'text' }]);
    expect(cl.def).toEqual(['ZZ']);
    cl.outs[0].name = 'DOI_TEN';
    state.ensureClassOuts(cl);
    expect(cl.outs[0].name).toBe('DOI_TEN');       /* không bị ghi đè lại từ cl.name */
  });
});

/** Chạy máy tính với một bảng phân loại, trả về dòng định biên đã áp phân loại. */
function rowsWith(cl) {
  const s = JSON.parse(JSON.stringify(snapshot));
  s.classes = [cl];
  state.setS(s);
  formula.ENGINE.invalidate(); state.setRESULT(null);
  return formula.ENGINE.previewRows();
}

describe('applyClasses ghi đủ mọi cột', () => {
  it('bảng một cột kiểu cũ: đúng một cột mang tên bảng', () => {
    const rows = rowsWith(LEGACY());
    const ac = rows.filter((r) => r.Dept === 'AC')[0];
    expect(ac.NHOM).toBe('X');
    /* Dòng không khớp rơi về mặc định — nếp cũ, giữ nguyên. */
    const other = rows.filter((r) => r.Dept !== 'AC')[0];
    expect(other.NHOM).toBe('ZZ');
  });

  it('bảng nhiều cột: mỗi cột một giá trị, đúng kiểu của nó', () => {
    const rows = rowsWith(MULTI());
    const ac = rows.filter((r) => r.Dept === 'AC')[0];
    expect(ac.NHOM).toBe('X');
    expect(ac.HE_SO).toBe(3);
    const other = rows.filter((r) => r.Dept !== 'AC')[0];
    expect(other.NHOM).toBe('ZZ');
    expect(other.HE_SO).toBe(9);
  });

  it('mọi cột đều gọi được trong công thức, không riêng cột đầu', () => {
    expect(formula.ENGINE.usableCols()).toContain('HE_SO');
    expect(formula.ENGINE.classCols()).toEqual(['NHOM', 'HE_SO']);
  });

  /* ĐÂY là chỗ dễ lỡ tay nhất: chép applyPolicies sang thì ô trống cũng rơi về
     mặc định, và số liệu của mọi dự án cũ đổi trong im lặng. */
  it('ô ĐỂ TRỐNG vẫn ra rỗng/0, KHÔNG rơi về mặc định', () => {
    const cl = MULTI();
    cl.rows = [['AC', '', '']];                    /* khớp dòng, nhưng hai ô đều trống */
    const ac = rowsWith(cl).filter((r) => r.Dept === 'AC')[0];
    expect(ac.NHOM).toBe('');
    expect(ac.HE_SO).toBe(0);
  });

  it('khoá * vẫn khớp, và khớp thì lấy CẢ DÒNG chứ không riêng ô đầu', () => {
    const cl = MULTI();
    cl.rows = [['*', 'MOI_NGUOI', 7]];
    const r = rowsWith(cl)[0];
    expect(r.NHOM).toBe('MOI_NGUOI');
    expect(r.HE_SO).toBe(7);
  });

  it('bảng nhiều cột dùng được làm khoá cho bảng sau — cả cột thứ hai', () => {
    const s = JSON.parse(JSON.stringify(snapshot));
    s.classes = [
      MULTI(),
      { id: 'c3', name: 'BAC', keys: ['HE_SO'], rows: [['3', 'BAC_BA'], ['9', 'BAC_CHIN']], def: '?' }
    ];
    state.setS(s);
    formula.ENGINE.invalidate(); state.setRESULT(null);
    const rows = formula.ENGINE.previewRows();
    expect(rows.filter((r) => r.Dept === 'AC')[0].BAC).toBe('BAC_BA');
    expect(rows.filter((r) => r.Dept !== 'AC')[0].BAC).toBe('BAC_CHIN');
  });
});
