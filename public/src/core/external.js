/* ===========================================================
   NGÂN SÁCH NGOÀI ĐỊNH BIÊN

   Một bản ngân sách thật luôn có những khoản TÍNH SẴN Ở NGOÀI — thuê ngoài
   trọn gói, đào tạo do phòng khác chốt, dự phòng ban giám đốc giao xuống. Chúng
   không truy được về một dòng nhân sự nào, nên máy tính không dựng ra được; nơi
   này là đường đưa chúng vào.

   Mỗi dòng tự mang đủ NĂM TẦNG phân loại mà bảng pivot dùng, nên không phải tra
   bảng ánh xạ nào cả — người dùng gõ thẳng mã cuối cùng.

   VÌ SAO SỐ NÀY NẰM NGOÀI grand/monthTotals/totalsByFc/data/pivot của máy tính:
     · Hai bất biến `grand === Σ totalsByFc` và `monthTotals[m] === Σ data` là
       thứ tám nơi trong app đang dựa vào. Ví dụ chân bảng "Theo Formula Code"
       lấy monthTotals trong khi thân bảng cộng từ data — gộp vào là chân lệch
       thân ngay, không có gì báo.
     · views/result.js chia tỷ lệ ảnh hưởng tăng lương cho `grand`. Gộp vào đó
       là MỌI phần trăm tăng lương co lại trong im lặng.
     · Dashboard chia cho `personMonths`; khoản ngoài định biên không có
       người-tháng nào để mà chia.

   Đổi lại, số cộng chung phải lấy qua grandAll / monthTotalsAll / pivotAll —
   KHÔNG nơi nào tự viết `R.grand + R.external.grand`. Có tên gọi thì
   `grep -rn grandAll public/src` liệt kê được đủ mọi chỗ cộng chung; cộng tay
   thì không.

   Cái giá còn lại phải trả ở chỗ khác: canon() của bộ kiểm đọc đúng năm trường
   mà nơi này cố ý không đụng, nên golden cũ vĩnh viễn mù với phần ngoài định
   biên. Bù bằng golden thứ hai — xem test/helpers/canon.mjs canonExt().
   =========================================================== */
import { M, S, numOf } from './state.js';
import { t } from './content.js';

/* content.md nạp BẤT ĐỒNG BỘ sau khi module chạy xong, nên đây phải là HÀM.
   Một `const EXT_MARK = t('ext.marker')` sẽ đóng băng nguyên chuỗi khoá. */

/** Chữ đứng ở cột Formula Code của dòng ngoài định biên — vừa là dấu trên màn
    hình vừa là dấu trong file Excel, nên không phải thêm cột nào. */
function extMark() { return t('ext.marker'); }

/** Ô gộp dùng khi phải cắt theo một chiều mà dòng ngoài định biên KHÔNG có
    (cột phân loại nhân sự, Formula Code). Rơi vào đây chứ không biến mất — nhờ
    vậy gộp chiều nào tổng cũng vẫn cộng đúng. */
function extBucket() { return t('ext.bucket'); }

/** Danh sách dòng ngoài định biên của một state (mặc định là state đang chạy). */
function extRows(state) { return ((state || S).external) || []; }

/** Tiền 12 tháng của một dòng, đã qua numOf: ô để trống của dataTable là chuỗi
    rỗng chứ không phải 0, mà `+''` ra 0 còn `+' '` ra NaN — đi qua numOf thì
    trường hợp nào cũng ra số. */
function lineMonths(r) {
  const out = new Array(M);
  for (let i = 0; i < M; i++) out[i] = numOf(r['m' + (i + 1)]);
  return out;
}

/** Một dòng ngoài định biên → đúng hình dạng PivotRow, để nó rơi thẳng vào
 *  result.js / io.js / compare.js mà không nơi nào phải biết thêm hình dạng mới.
 *  Ô trống dùng ĐÚNG chữ mà engine.js dùng, nếu không thì cùng một bảng pivot
 *  có hai cách viết "chưa khai".
 *  @returns {PivotRow} */
function extLine(r) {
  const m = lineMonths(r);
  let total = 0;
  for (let i = 0; i < M; i++) total += m[i];
  const un = t('engine.map.undeclared');
  return {
    division: String(r.division || '').trim() || un,
    budgetCode: String(r.budgetCode || '').trim() || un,
    costCenter: String(r.costCenter || '').trim() || t('engine.map.none'),
    costCode: String(r.costCode || '').trim() || un,
    accountCode: String(r.accountCode || '').trim() || un,
    formulaCode: extMark(),
    formulaName: String(r.name || '').trim(),
    m, total
  };
}

/** Phần ngoài định biên của một lượt tính. LUÔN trả object — nơi gọi không phải
 *  kiểm null ở đâu cả.
 *  @returns {ExternalPart} */
function extSummary(state) {
  const rows = extRows(state).map(extLine);
  const months = new Array(M).fill(0);
  let grand = 0;
  rows.forEach((p) => {
    for (let i = 0; i < M; i++) months[i] += p.m[i];
    grand += p.total;
  });
  return { rows, months, grand, n: rows.length };
}

/* ---------- Ba hàm cộng chung ----------
   Mọi con số "tổng cuối cùng" trong app đi qua đúng ba hàm này. */

/** @param {BudgetResult} R */
function grandAll(R) { return R.grand + (R.external ? R.external.grand : 0); }

/** @param {BudgetResult} R */
function monthTotalsAll(R) {
  const ex = R.external ? R.external.months : null;
  return R.monthTotals.map((v, i) => { return v + (ex ? ex[i] : 0); });
}

/** Bảng pivot đầy đủ: phần định biên trước, phần ngoài định biên nối vào cuối.
 *  KHÔNG sắp lại — bộ so sánh của máy tính chỉ nhìn bốn mã đầu và không bao giờ
 *  trả 0, trộn vào giữa là xáo cả thứ tự đang có.
 *  @param {BudgetResult} R @returns {PivotRow[]} */
function pivotAll(R) { return R.external && R.external.n ? R.pivot.concat(R.external.rows) : R.pivot; }

/** Có khoản ngoài định biên nào không — cửa chung cho mọi chỗ chỉ dựng thêm
    giao diện / thêm dòng vào file khi thật sự có số. */
function hasExt(R) { return !!(R && R.external && R.external.n); }

export {
  extMark, extBucket, extRows, extLine, lineMonths, extSummary,
  grandAll, monthTotalsAll, pivotAll, hasExt
};
