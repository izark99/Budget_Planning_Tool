/* MỐC SỐ 1 — Golden master.
   Cùng một state, ENGINE.run() phải cho ra chuỗi canonical trùng TỪNG KÝ TỰ
   với tệp đã ghi. Đây là thứ cho phép xáo 5.260 dòng mã ở giai đoạn 2-3 mà vẫn
   chứng minh được số liệu không đổi.
   Golden lệch => hoặc phép tính đã đổi (phải giải thích được), hoặc vừa gây ra
   một hồi quy. Chạy `node tools/regen-golden.mjs` để sinh lại — có chủ ý. */
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import { GOLDEN, STATE_FIXTURE } from '../helpers/env.mjs';
import { canon, explainDiff } from '../helpers/canon.mjs';
import { loadEngine, runOn } from '../helpers/load-engine.mjs';

const snapshot = JSON.parse(fs.readFileSync(STATE_FIXTURE, 'utf8'));
const golden = fs.readFileSync(GOLDEN, 'utf8').trim();

describe('golden master', () => {
  let state, formula, R, text;

  beforeAll(async () => {
    ({ state, formula } = await loadEngine());
    R = runOn(state, formula, snapshot);
    text = canon(R);
  });

  it('chuỗi canonical trùng khớp từng ký tự', () => {
    if (text !== golden) throw new Error('kết quả lệch golden:\n' + explainDiff(text, golden));
    expect(text).toBe(golden);
  });

  it('chạy lại cho kết quả y hệt (không phụ thuộc trạng thái còn sót)', () => {
    expect(canon(runOn(state, formula, snapshot))).toBe(golden);
  });

  it('không có lỗi công thức nào trên state mẫu', () => {
    expect(R.formulaErrors).toEqual([]);
  });

  it('state mẫu có chạm tới CT dùng chung, tăng lương và % trích', () => {
    /* Nếu ai đó rút gọn fixture, golden vẫn "pass" nhưng hết canh được gì.
       Ba dòng này giữ cho fixture không âm thầm mất giá trị. */
    expect(snapshot.shared.length).toBeGreaterThan(0);
    expect(snapshot.raises.some((r) => r.active)).toBe(true);
    expect(snapshot.accruals.length).toBeGreaterThan(0);
    expect(snapshot.hc.rows.length).toBe(24);
  });
});

describe('cơ chế nghiệp vụ mà golden đang canh', () => {
  let state, formula;
  beforeAll(async () => { ({ state, formula } = await loadEngine()); });

  const monthly = (R, c) => {
    const out = new Array(12).fill(0);
    for (let i = 0; i < R.rows.length; i++) for (let m = 0; m < 12; m++) out[m] += R.data[c][i * 12 + m];
    return out;
  };

  it('tăng lương khai cho CT dùng chung lan tới mọi công thức gọi tới nó', () => {
    const base = JSON.parse(JSON.stringify(snapshot));
    base.raises = [];
    base.accruals = [];                       // tách riêng một hiệu ứng để đo
    const before = runOn(state, formula, base);

    const after = runOn(state, formula, {
      ...base,
      raises: [{ id: 'r1', name: 'x', fromMonth: 7, pct: 10, cond: '', formulas: ['LUONG_CO_BAN'], active: true }],
    });

    for (const col of [0, 1]) {
      const b = monthly(before, col), a = monthly(after, col);
      for (let m = 0; m < 6; m++) expect(a[m] / b[m]).toBeCloseTo(1, 3);
      for (let m = 6; m < 12; m++) expect(a[m] / b[m]).toBeCloseTo(1.1, 3);
    }
  });

  it('% trích nhân đúng theo phân loại × tháng, chưa khai thì giữ 100%', () => {
    const base = JSON.parse(JSON.stringify(snapshot));
    base.raises = [];
    base.accruals = [];
    const before = runOn(state, formula, base);
    const after = runOn(state, formula, {
      ...base,
      accruals: [{
        id: 'a1', code: base.formulas[0].code, col: 'Dept', rows: [
          { key: 'AC', m: [100, 100, 100, 100, 100, 100, 50, 50, 50, 50, 50, 50] },
          { key: 'SL', m: ['', '', '', '', '', '', '', '', '', '', '', ''] },
        ],
      }],
    });

    const dept = base.hc.rows.map((r) => r.Dept);
    const sumBy = (R, col, want) => {
      const out = new Array(12).fill(0);
      for (let i = 0; i < R.rows.length; i++) {
        if (dept[i] !== want) continue;
        for (let m = 0; m < 12; m++) out[m] += R.data[col][i * 12 + m];
      }
      return out;
    };

    const acB = sumBy(before, 0, 'AC'), acA = sumBy(after, 0, 'AC');
    for (let m = 0; m < 6; m++) expect(acA[m] / acB[m]).toBeCloseTo(1, 3);
    for (let m = 6; m < 12; m++) expect(acA[m] / acB[m]).toBeCloseTo(0.5, 3);

    /* SL khai toàn ô rỗng => không đổi. Đây là điều kiện "màn này để trống thì
       kết quả không đổi" mà tab % trích cam kết. */
    const slB = sumBy(before, 0, 'SL'), slA = sumBy(after, 0, 'SL');
    expect(slA).toEqual(slB);

    /* Formula Code khác không khai % trích thì tuyệt đối không bị đụng tới. */
    expect(monthly(after, 1)).toEqual(monthly(before, 1));
  });

  it('gọi CT dùng chung bằng tên gọi và bằng [Diễn giải] ra cùng một giá trị', () => {
    const s = JSON.parse(JSON.stringify(snapshot));
    s.formulas[0].rules[0].formula = 'LUONG_CO_BAN';
    s.formulas[1].rules[0].formula = '[Lương cơ bản]';
    state.setS(s);
    formula.ENGINE.invalidate();
    formula.ENGINE.run();

    const a = formula.ENGINE.previewRow(s.formulas[0], 0).refs.find((r) => r.key === 'LUONG_CO_BAN');
    const b = formula.ENGINE.previewRow(s.formulas[1], 0).refs.find((r) => r.key === '[Lương cơ bản]');
    expect(a.kind).toBe('shared');
    expect(b.kind).toBe('shared');
    expect(a.values).toEqual(b.values);
  });

  it('CT dùng chung tham chiếu vòng thì báo #CIRC! chứ không treo', () => {
    const s = JSON.parse(JSON.stringify(snapshot));
    s.shared = [
      { id: 'x', code: 'A', name: 'A', formula: 'B + 1' },
      { id: 'y', code: 'B', name: 'B', formula: 'A + 1' },
    ];
    s.formulas[0].rules[0].formula = 'A';
    const R = runOn(state, formula, s);
    expect(R.formulaErrors.some((e) => /#CIRC!/.test(e.msg))).toBe(true);
  });

  /* previewRows() nhớ kết quả để khỏi dựng lại bảng dẫn xuất mỗi lần. Khoá nhớ
     từng lấy ĐỘ DÀI chuỗi JSON của [S.cols, S.classes] — nên hai cấu hình khác
     nhau mà cùng độ dài dùng chung một khoá, và hàm trả về cột dẫn xuất SAI.
     Hai bảng phân loại dưới đây khác nội dung nhưng JSON dài BẰNG NHAU. */
  it('previewRows() phân biệt hai cấu hình cùng độ dài chuỗi JSON', () => {
    const base = JSON.parse(JSON.stringify(snapshot));
    const mkClass = (def) => [{
      id: 'c1', name: 'NHOM', type: 'text', keys: ['Dept'],
      /* Phủ đủ mọi Dept có trong fixture, để không dòng nào rơi về giá trị mặc định. */
      rows: [['AC', def], ['SL', def], ['PR', def], ['HR', def]], def: '',
    }];

    const a = { ...base, classes: mkClass('XX') };
    const b = { ...base, classes: mkClass('YY') };
    /* Điều kiện của phép kiểm: cùng độ dài, khác nội dung. */
    const la = JSON.stringify([a.cols, a.classes]).length;
    const lb = JSON.stringify([b.cols, b.classes]).length;
    expect(la).toBe(lb);
    expect(JSON.stringify(a.classes)).not.toBe(JSON.stringify(b.classes));

    state.setS(a);
    formula.ENGINE.invalidate();
    const rowsA = formula.ENGINE.previewRows().map((r) => r.NHOM);

    /* KHÔNG gọi invalidate() — đây đúng là chỗ khoá nhớ phải tự phân biệt. */
    state.setS(b);
    const rowsB = formula.ENGINE.previewRows().map((r) => r.NHOM);

    expect(rowsA.every((v) => v === 'XX')).toBe(true);
    expect(rowsB.every((v) => v === 'YY')).toBe(true);
  });

  it('bảng đối chiếu previewRow liệt kê đủ 4 loại tham chiếu', () => {
    const s = JSON.parse(JSON.stringify(snapshot));
    s.formulas[0].rules[0].cond = '[Coefficient] > 0';
    s.formulas[0].rules[0].formula =
      'LUONG_CO_BAN * DINH_BIEN * NGAY_CONG_THUC_TE / NGAY_CONG_CHUAN + DON_GIA_AN_CA * 22';
    state.setS(s);
    formula.ENGINE.invalidate();
    const kinds = new Set(formula.ENGINE.previewRow(s.formulas[0], 0).refs.map((r) => r.kind));
    for (const k of ['field', 'param', 'monthvar', 'shared']) expect(kinds).toContain(k);
  });
});
