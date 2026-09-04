/* Năm tầng phân loại chi phí sau khi đổi khoá.

     Budget Code : Cost Center + Cost Code + Đơn vị  ->  Cost Code + Đơn vị
     Division    : mới, suy từ Đơn vị y hệt Cost Center
     Thứ tự pivot: Division / Budget Code / Cost Center / Cost Code / Account

   Khoá Budget Code được dựng ở BA nơi (engine.buildMaps, views/cost-map.js,
   platform/io.js sheet ChiTiet_Dong). Phép kiểm này canh nơi thứ nhất — nơi
   quyết định con số — còn hai nơi kia đi bằng e2e và bằng golden. */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { STATE_FIXTURE } from '../helpers/env.mjs';
import { loadEngine, runOn } from '../helpers/load-engine.mjs';

const snapshot = JSON.parse(fs.readFileSync(STATE_FIXTURE, 'utf8'));
let state, formula;

beforeAll(async () => { ({ state, formula } = await loadEngine()); });

/** State fixture + các bảng ánh xạ tự khai. */
function withMaps(maps) {
  const s = JSON.parse(JSON.stringify(snapshot));
  s.maps = Object.assign({ costCode: [], costCenter: [], division: [], budgetCode: [], accountCode: [] }, maps);
  return s;
}

describe('chuyển đổi lúc nạp', () => {
  it('dự án cũ thiếu hẳn bảng Division thì được điền vào — nút "xoá sạch" khỏi nổ', () => {
    const s = JSON.parse(JSON.stringify(snapshot));
    s.maps = { costCode: [], costCenter: [], budgetCode: [], accountCode: [] };
    state.setS(s);
    expect(Array.isArray(state.S.maps.division)).toBe(true);
    expect(state.S.maps.division).toHaveLength(0);
  });

  it('dòng Budget Code khai theo khoá CŨ bị xoá sạch, và có cờ để báo', () => {
    const s = withMaps({
      budgetCode: [{ costCenter: 'CC1', costCode: '0304', unit: 'AC', budgetCode: 'B1', name: '' }]
    });
    delete s.meta.budKeyV;
    state.setS(s);
    expect(state.S.maps.budgetCode).toHaveLength(0);
    expect(state.S.meta.budKeyReset).toBe(true);
    expect(state.S.meta.budKeyV).toBe(2);
  });

  it('nạp lần hai không xoá thêm gì — cờ phiên bản chặn lại', () => {
    const s = withMaps({
      budgetCode: [{ costCenter: 'CC1', costCode: '0304', unit: 'AC', budgetCode: 'B1', name: '' }]
    });
    delete s.meta.budKeyV;
    state.setS(s);
    /* Người dùng khai lại bằng khoá mới rồi mở lại dự án. */
    state.S.maps.budgetCode.push({ costCode: '0304', unit: 'AC', budgetCode: 'B9', name: '' });
    const again = JSON.parse(JSON.stringify(state.S));
    state.setS(again);
    expect(state.S.maps.budgetCode).toHaveLength(1);
    expect(state.S.maps.budgetCode[0].budgetCode).toBe('B9');
  });

  it('dòng khai theo khoá MỚI không bị đụng tới', () => {
    const s = withMaps({ budgetCode: [{ costCode: '0304', unit: 'AC', budgetCode: 'B1', name: '' }] });
    delete s.meta.budKeyV;
    state.setS(s);
    expect(state.S.maps.budgetCode).toHaveLength(1);
    expect(state.S.meta.budKeyReset).toBeUndefined();
  });
});

/* Fixture có bốn đơn vị: AC, HR, PR-F1, SL-HN. */
const FULL = () => ({
  costCode: [{ formulaCode: 'FC_LUONG_HESO', costCode: '0304', name: '' }],
  /* HAI Cost Center khác nhau cho hai đơn vị — chỗ khoá cũ và khoá mới rẽ đôi. */
  costCenter: [
    { unit: 'AC', costCenter: 'CC_AC', name: '' },
    { unit: 'HR', costCenter: 'CC_HR', name: '' }
  ],
  division: [
    { unit: 'AC', division: 'DIV_BAC', name: '' },
    { unit: 'HR', division: 'DIV_BAC', name: '' },
    { unit: 'PR-F1', division: 'DIV_NAM', name: '' },
    { unit: 'SL-HN', division: 'DIV_NAM', name: '' }
  ],
  budgetCode: [
    { costCode: '0304', unit: 'AC', budgetCode: 'BUD_AC', name: '' },
    { costCode: '0304', unit: 'HR', budgetCode: 'BUD_HR', name: '' }
  ],
  accountCode: [
    { costCode: '0304', costCenter: 'CC_AC', budgetCode: 'BUD_AC', accountCode: 'ACC_1', name: '' }
  ]
});

describe('khoá Budget Code mới', () => {
  it('KHÔNG còn phụ thuộc Cost Center: cùng Cost Code + Đơn vị là cùng Budget Code', () => {
    const m = FULL();
    /* Đổi Cost Center của AC mà không đụng bảng Budget Code. */
    m.costCenter[0].costCenter = 'CC_KHAC';
    const R = runOn(state, formula, withMaps(m));
    /* Chỉ FC_LUONG_HESO có Cost Code, ba công thức còn lại chưa map nên không
       có Budget Code — lọc đúng những dòng thật sự đi qua khoá này. */
    const ac = R.pivot.filter((p) => p.costCenter === 'CC_KHAC' && p.costCode === '0304');
    expect(ac.length).toBeGreaterThan(0);
    expect(ac.every((p) => p.budgetCode === 'BUD_AC')).toBe(true);
  });

  it('đơn vị chưa map Cost Center vẫn suy ra được Budget Code', () => {
    const m = FULL();
    m.budgetCode.push({ costCode: '0304', unit: 'PR-F1', budgetCode: 'BUD_PR', name: '' });
    const R = runOn(state, formula, withMaps(m));
    const pr = R.pivot.filter((p) => p.budgetCode === 'BUD_PR');
    expect(pr.length).toBeGreaterThan(0);
    /* PR-F1 không có trong bảng Cost Center — vẫn ra Budget Code, chỉ thiếu Cost Center. */
    expect(pr[0].costCenter).toBe('(chưa map)');
  });
});

describe('Division', () => {
  it('suy từ Đơn vị và đi thẳng vào bảng pivot', () => {
    const R = runOn(state, formula, withMaps(FULL()));
    const divs = [...new Set(R.pivot.map((p) => p.division))].sort();
    expect(divs).toEqual(['DIV_BAC', 'DIV_NAM']);
  });

  it('đơn vị chưa map thì có cảnh báo riêng, khai đủ thì hết', () => {
    const bare = runOn(state, formula, withMaps({}));
    expect(bare.warnings.filter((w) => w.type === 'div')).toHaveLength(4);

    const full = runOn(state, formula, withMaps(FULL()));
    expect(full.warnings.filter((w) => w.type === 'div')).toHaveLength(0);
  });

  it('hai đơn vị cùng Division thì gộp chung một dòng pivot', () => {
    const m = FULL();
    /* Bỏ hết mã khác đi, chỉ còn Division phân biệt. */
    m.costCenter = []; m.budgetCode = []; m.accountCode = [];
    const R = runOn(state, formula, withMaps(m));
    const perDiv = {};
    R.pivot.forEach((p) => { perDiv[p.division] = (perDiv[p.division] || 0) + 1; });
    /* Bốn Formula Code × hai Division = tám dòng, không phải bốn đơn vị × bốn. */
    expect(Object.keys(perDiv).sort()).toEqual(['DIV_BAC', 'DIV_NAM']);
    expect(R.pivot).toHaveLength(8);
  });
});

describe('thứ tự cột pivot', () => {
  it('sắp theo Division → Budget Code → Cost Center → Cost Code', () => {
    const R = runOn(state, formula, withMaps(FULL()));
    const keys = R.pivot.map((p) => p.division + p.budgetCode + p.costCenter + p.costCode);
    expect(keys.slice().sort()).toEqual(keys);
  });

  it('tổng theo pivot vẫn bằng tổng ngân sách — gộp lại không mất đồng nào', () => {
    const R = runOn(state, formula, withMaps(FULL()));
    const sum = R.pivot.reduce((a, p) => a + p.total, 0);
    expect(Math.round(sum)).toBe(Math.round(R.grand));
  });
});
