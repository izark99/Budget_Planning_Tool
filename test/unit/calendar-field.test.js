/* Cột ngày công thứ 6: "Ngày nghỉ ngừng việc", tách khỏi "ngày nghỉ có lương khác".

   Bảng ngày công lặp theo CAL_FIELDS nên thêm một mục là xong phần giao diện.
   Nguy hiểm nằm ở ba chỗ VIẾT CỨNG: MONTH_VARS của máy biểu thức, sheet khai báo
   khi xuất, và dữ liệu cũ thiếu khoá. Bộ kiểm này canh cả ba. */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { STATE_FIXTURE } from '../helpers/env.mjs';
import { loadEngine, runOn } from '../helpers/load-engine.mjs';

const snapshot = JSON.parse(fs.readFileSync(STATE_FIXTURE, 'utf8'));
let state, formula;

beforeAll(async () => { ({ state, formula } = await loadEngine()); });

const field = () => state.CAL_FIELDS.filter((f) => f.k === 'stop')[0];

describe('khai báo cột mới', () => {
  it('có mặt trong CAL_FIELDS, đứng NGAY TRƯỚC "nghỉ có lương khác"', () => {
    const f = field();
    expect(f).toBeTruthy();
    expect(f.label).toBe('Ngày nghỉ ngừng việc');
    expect(f.varName).toBe('NGAY_NGHI_NGUNG_VIEC');
    const ks = state.CAL_FIELDS.map((x) => x.k);
    /* Bất biến DUY NHẤT: std ở chỉ số 0 — ô đối chiếu cộng CAL_FIELDS.slice(1)
       rồi so với std, chèn std vào giữa là hỏng phép cộng. Thứ tự năm cột còn
       lại chỉ là thứ tự HIỂN THỊ (phép cộng giao hoán), và người dùng muốn hai
       loại nghỉ hay bị khai lẫn nhau nằm cạnh nhau. */
    expect(ks[0]).toBe('std');
    expect(ks.indexOf('stop')).toBe(ks.indexOf('other') - 1);
  });

  it('đổi thứ tự KHÔNG đổi tổng: slice(1) vẫn cộng đủ năm cột', () => {
    const rec = state.blankCalTable('*').m[0];
    const used = state.CAL_FIELDS.slice(1).reduce((a, f) => a + state.numOf(rec[f.k]), 0);
    expect(state.CAL_FIELDS).toHaveLength(6);
    expect(used).toBe(22 + 1 + 1 + 0 + 2);
    expect(state.numOf(rec.std)).toBe(used);
  });

  it('mặc định 0 — không tự bớt của cột cũ, vì không đoán được bớt bao nhiêu', () => {
    expect(field().def).toBe(0);
    const tbl = state.blankCalTable('*');
    expect(tbl.m[0].stop).toBe(0);
    expect(tbl.m[0].other).toBe(2);
  });
});

describe('biến công thức', () => {
  /* Đây là chỗ chết người: thiếu tên trong MONTH_VARS thì công thức dùng nó bị
     đệm lại qua 12 tháng và trả giá trị tháng 1 cho cả năm — sai số liệu, im
     lặng, không lỗi nào nổ ra. */
  it('NGAY_NGHI_NGUNG_VIEC là biến ĐỔI THEO THÁNG', () => {
    expect(formula.FX.MONTH_VARS).toContain('NGAY_NGHI_NGUNG_VIEC');
    expect(formula.FX.tryCompile('NGAY_NGHI_NGUNG_VIEC').fn.info.monthDependent).toBe(true);
  });

  it('đọc ra đúng số đã khai của từng tháng, không bị đệm lẫn nhau', () => {
    const s = JSON.parse(JSON.stringify(snapshot));
    s.calendar.tables[0].m.forEach((rec, k) => { rec.stop = k + 1; });
    s.formulas[0].rules = [{ id: 'r', name: 'Tất cả', cond: '', formula: 'NGAY_NGHI_NGUNG_VIEC' }];
    state.setS(s); formula.ENGINE.invalidate(); state.setRESULT(null);
    const p = formula.ENGINE.previewRow(s.formulas[0], 0);
    expect(p.months.map((x) => x.raw)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('dữ liệu cũ thiếu khoá', () => {
  /* load() và openProject() đều Object.assign NÔNG, nên lịch trong .json cũ giữ
     nguyên và thiếu hẳn khoá mới: ô nhập hiện undefined, ô đối chiếu báo lệch oan. */
  it('nạp lịch cũ thì mọi bản ghi tháng được điền đủ khoá', () => {
    const old = JSON.parse(JSON.stringify(snapshot));
    old.calendar.tables[0].m.forEach((rec) => { delete rec.stop; });
    const fixed = state.normaliseCalendar(old.calendar);
    fixed.tables.forEach((tbl) => {
      tbl.m.forEach((rec) => {
        state.CAL_FIELDS.forEach((f) => { expect(rec[f.k]).not.toBeUndefined(); });
      });
    });
    expect(fixed.tables[0].m[0].stop).toBe(0);
    /* Không được đụng vào số đã khai. */
    expect(fixed.tables[0].m[0].std).toBe(old.calendar.tables[0].m[0].std);
  });
});

describe('cảnh báo khi tổng lệch ngày công chuẩn', () => {
  it('lịch khớp thì KHÔNG có cảnh báo nào về ngày công', () => {
    const R = runOn(state, formula, snapshot);
    expect(R.warnings.filter((w) => w.type === 'cal')).toEqual([]);
  });

  it('bớt một ngày ở một tháng thì có cảnh báo, nêu đúng tháng', () => {
    const s = JSON.parse(JSON.stringify(snapshot));
    s.calendar.tables[0].m[4].act = s.calendar.tables[0].m[4].act - 3;
    const R = runOn(state, formula, s);
    const w = R.warnings.filter((x) => x.type === 'cal');
    expect(w).toHaveLength(1);
    expect(w[0].msg).toContain('T05');
  });

  it('cột mới được TÍNH VÀO tổng — chuyển 3 ngày từ "khác" sang "ngừng việc" thì vẫn khớp', () => {
    const s = JSON.parse(JSON.stringify(snapshot));
    s.calendar.tables[0].m.forEach((rec) => { rec.other = rec.other - 1; rec.stop = 1; });
    const R = runOn(state, formula, s);
    expect(R.warnings.filter((x) => x.type === 'cal')).toEqual([]);
  });
});
