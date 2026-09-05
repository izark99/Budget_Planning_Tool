#!/usr/bin/env node
/* Sinh lại hai tệp mốc của bộ kiểm:
     test/fixtures/state.json         — state dự án đầy đủ, dựng bằng CHÍNH giao
                                        diện thật (nạp .xlsx qua SheetJS trong
                                        trình duyệt), rồi cài một kịch bản chạm
                                        tới công thức dùng chung, tăng lương và
                                        % trích.
     test/fixtures/golden-result.json — chuỗi canonical của ENGINE.run() trên
                                        state đó.
     test/fixtures/golden-export.json — từng ô của file Excel app xuất ra, dạng
                                        JSON đọc được trong diff thay vì một tệp
                                        nhị phân không ai soi được.
     test/fixtures/state-external.json — CÙNG state đó, cộng thêm ngân sách
                                        ngoài định biên.
     test/fixtures/golden-external.json — chuỗi canonical của phần ngoài định
                                        biên và của các con số cộng chung. Cần
                                        mốc riêng vì canon() cố ý không đọc
                                        phần này — xem canonExt().

   Vì sao tách hai bước: state.json cần trình duyệt (SheetJS đọc .xlsx), nhưng
   một khi đã có nó thì phép kiểm golden chạy thuần Node trong mili-giây, không
   cần Playwright. Đó là cái lưới chạy được ở mọi nơi.

   Chạy lại là một hành động CÓ CHỦ Ý: golden đổi thì phải soi diff trong PR và
   giải thích được vì sao số liệu đổi.

   XUẤT XỨ CỦA GOLDEN: chuỗi canonical này bắt nguồn từ phép so bản tách module
   với bản một-file gốc (lap-ngan-sach-dinh-bien.html, 1,1 MB) trên CÙNG một
   state — hai bên trùng nhau TỪNG KÝ TỰ, và file Excel xuất ra khớp mọi ô trừ
   ô dấu thời gian. Bản gốc cố ý KHÔNG nằm trong repo (1,1 MB cho một phép kiểm
   là quá đắt), nên tệp golden chính là thứ giữ lại bằng chứng đó. Sinh lại
   golden là chấp nhận bỏ mốc so với bản gốc — chỉ làm khi biết rõ vì sao.

   Cách chạy:  node tools/regen-golden.mjs         sinh lại TẤT CẢ (cần trình duyệt)
               node tools/regen-golden.mjs --ext   chỉ sinh lại mốc ngoài định
                                                   biên, đọc state.json đang có
                                                   — không cần trình duyệt, và
                                                   không đụng vào ba tệp kia.

   Dùng --ext khi chỉ sửa phần ngoài định biên: chạy toàn bộ sẽ ghi lại cả dấu
   thời gian và uid ngẫu nhiên trong state.json, đẻ ra một diff toàn tiếng ồn.
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { FIXTURE_XLSX, GOLDEN, GOLDEN_EXPORT, GOLDEN_EXT, LAUNCH, STATE_EXT, STATE_FIXTURE } from '../test/helpers/env.mjs';
import { startServer } from '../test/helpers/server.mjs';
import { exportWorkbook, inPage, loginToApp, importHeadcount } from '../test/helpers/browser.mjs';
import { canon, canonExt } from '../test/helpers/canon.mjs';
import { loadEngine, runOn } from '../test/helpers/load-engine.mjs';
import { readCells } from '../test/helpers/xlsx-cells.mjs';

/* Kịch bản: cố ý chạm tới mọi cơ chế mới thêm, để golden thật sự canh được chúng. */
async function applyScenario(page) {
  return inPage(page, `
    st.S.shared = [{
      id: 'sh-luong', code: 'LUONG_CO_BAN', name: 'Lương cơ bản',
      formula: 'ROUND([Coefficient]*LUONG_CO_SO,-3)',
    }];

    /* Công thức chi phí gọi CT dùng chung theo cả hai cách: bằng tên gọi và
       bằng [Diễn giải]. Hai cách phải cho cùng một con số. */
    st.S.formulas[0].rules[0].formula =
      'LUONG_CO_BAN * DINH_BIEN * NGAY_CONG_THUC_TE / NGAY_CONG_CHUAN';
    st.S.formulas[1].rules[0].formula = '[Lương cơ bản] * TY_LE_BHXH_CTY% * DINH_BIEN';

    /* Tăng lương khai đích danh CT dùng chung -> mọi công thức gọi tới đều ăn theo. */
    st.S.raises = [{
      id: 'r-shared', name: 'Tăng lương định kỳ', fromMonth: 7, pct: 10,
      cond: '', formulas: ['LUONG_CO_BAN'], active: true,
    }];

    /* % trích theo phân loại × tháng; Dept không khai để trống = 100%. */
    st.S.accruals = [{
      id: 'ac-1', code: st.S.formulas[0].code, col: 'Dept', rows: [
        { key: 'AC', m: [100, 100, 100, 100, 100, 100, 50, 50, 50, 50, 50, 50] },
        { key: 'SL', m: [80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80] },
        { key: 'PR', m: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 0] },
      ],
    }];

    st.touch();
    return JSON.stringify(st.S);
  `);
}

const extOnly = process.argv.includes('--ext');

let snapshot, cells, tmp;
if (extOnly) {
  snapshot = JSON.parse(fs.readFileSync(STATE_FIXTURE, 'utf8'));
} else {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpt-golden-'));
  const server = await startServer();
  const browser = await chromium.launch(LAUNCH);
  try {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await loginToApp(ctx, server.base);
    await importHeadcount(page, FIXTURE_XLSX);
    snapshot = JSON.parse(await applyScenario(page));
    cells = readCells(await exportWorkbook(page, tmp));
    await ctx.close();
  } finally {
    await browser.close();
    await server.stop();
  }

  fs.writeFileSync(STATE_FIXTURE, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`state.json  : ${snapshot.hc.rows.length} dòng định biên, ${snapshot.cols.length} cột, ` +
    `${snapshot.formulas.length} Formula Code, ${snapshot.shared.length} CT dùng chung, ` +
    `${snapshot.raises.length} đợt tăng, ${snapshot.accruals.length} khai % trích`);
}

const { state, formula } = await loadEngine();
if (!extOnly) {
  const R = runOn(state, formula, snapshot);
  const text = canon(R);
  fs.writeFileSync(GOLDEN, text + '\n');
  console.log(`golden      : ${text.length} ký tự · tổng ngân sách ${Number(R.grand).toLocaleString('vi-VN')} · ` +
    `${R.warnings.length} cảnh báo · ${R.formulaErrors.length} lỗi công thức`);
}

/* --- Mốc thứ hai: ngân sách ngoài định biên ---
   Dựng TỪ chính snapshot ở trên nên hai mốc luôn nói về cùng một dự án; khác
   nhau đúng một thứ là mảng external. Số liệu cố ý chạm đủ các trường hợp: đủ
   năm mã, thiếu Cost Center và Account Code (rơi vào chữ "chưa khai"), tháng để
   trống, và hai dòng trùng Cost Code để phép gộp có việc mà làm. */
const extSnapshot = JSON.parse(JSON.stringify(snapshot));
extSnapshot.external = [
  {
    id: 'ex-thue-ngoai', division: 'DIV_HO', budgetCode: 'BC_THUE_NGOAI',
    costCenter: 'CC_AC', costCode: '0301', accountCode: 'AC_6427',
    name: 'Thuê ngoài bảo vệ trọn gói',
    m1: 120000000, m2: 120000000, m3: 120000000, m4: 120000000, m5: 120000000, m6: 120000000,
    m7: 120000000, m8: 120000000, m9: 120000000, m10: 120000000, m11: 120000000, m12: 120000000,
  },
  {
    id: 'ex-dao-tao', division: 'DIV_HO', budgetCode: 'BC_DAO_TAO',
    costCenter: 'CC_HR', costCode: '0301', accountCode: 'AC_6428',
    name: 'Đào tạo do phòng Đào tạo chốt',
    m1: 0, m2: 0, m3: 250000000, m4: 0, m5: 0, m6: 0,
    m7: 0, m8: 0, m9: 400000000, m10: 0, m11: 0, m12: 0,
  },
  {
    id: 'ex-du-phong', division: 'DIV_NM', budgetCode: '',
    costCenter: '', costCode: '0303', accountCode: '',
    name: 'Dự phòng ban giám đốc',
    m1: '', m2: '', m3: '', m4: '', m5: '', m6: '',
    m7: '', m8: '', m9: '', m10: '', m11: '', m12: 500000000,
  },
];
fs.writeFileSync(STATE_EXT, JSON.stringify(extSnapshot, null, 2) + '\n');
const external = await import('../public/src/core/external.js');
const RX = runOn(state, formula, extSnapshot);
const textExt = canonExt(RX, external);
fs.writeFileSync(GOLDEN_EXT, textExt + '\n');
console.log(`golden-ext  : ${RX.external.n} dòng ngoài định biên · ` +
  `${Number(RX.external.grand).toLocaleString('vi-VN')} · tổng cộng ` +
  `${Number(external.grandAll(RX)).toLocaleString('vi-VN')}`);

if (!extOnly) {
  fs.writeFileSync(GOLDEN_EXPORT, JSON.stringify(cells, null, 1) + '\n');
  const nCells = Object.values(cells).reduce((n, c) => n + Object.keys(c).length, 0);
  console.log(`golden-export: ${Object.keys(cells).length} sheet · ${nCells} ô · ${Object.keys(cells).join(', ')}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}
