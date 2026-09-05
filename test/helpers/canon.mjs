/* Chuỗi canonical của một lần ENGINE.run(). Đây là thứ chốt lại "số liệu không
   đổi": tổng năm, 12 tổng tháng, tổng theo Formula Code, TOÀN BỘ mảng
   người×tháng, bảng pivot 5 tầng, cảnh báo và lỗi công thức.
   Chính hàm này đã dùng để chứng minh bản tách module cho ra kết quả trùng
   TỪNG KÝ TỰ với bản một-file gốc. Đổi hình dạng ở đây là làm mất giá trị so
   sánh với mọi golden đã ghi — muốn đổi thì phải sinh lại golden và soi diff. */
export function canon(R) {
  return JSON.stringify({
    grand: R.grand,
    monthTotals: Array.from(R.monthTotals || []),
    totalsByFc: Array.from(R.totalsByFc || []),
    nRows: R.rows.length,
    data: (R.data || []).map((a) => Array.from(a)),
    pivot: (R.pivot || []).map((p) => [
      p.division, p.budgetCode, p.costCenter, p.costCode, p.accountCode,
      p.formulaCode, p.formulaName, ...Array.from(p.m), p.total,
    ]),
    warnings: (R.warnings || []).map((w) => w.type + '|' + w.msg).sort(),
    formulaErrors: (R.formulaErrors || []).map((e) => e.where + '|' + e.msg).sort(),
    conflicts: (R.conflicts || []).length,
  });
}

/* Bản nguồn để tiêm vào trang bằng page.evaluate — trình duyệt không import
   được module của bộ kiểm. */
export const canonSource = canon.toString();

/** Chỉ ra chỗ lệch đầu tiên giữa hai chuỗi canonical, để lỗi đọc được. */
export function explainDiff(a, b) {
  if (a === b) return '';
  const A = JSON.parse(a), B = JSON.parse(b);
  const out = [];
  for (const k of Object.keys(A)) {
    const x = JSON.stringify(A[k]), y = JSON.stringify(B[k]);
    if (x === y) continue;
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    out.push(`  "${k}" lệch từ vị trí ${i}:\n    thực tế: …${x.slice(Math.max(0, i - 40), i + 60)}\n    golden : …${y.slice(Math.max(0, i - 40), i + 60)}`);
  }
  return out.join('\n');
}

/* Chuỗi canonical của PHẦN NGOÀI ĐỊNH BIÊN — và của những con số cộng chung.

   VÌ SAO PHẢI CÓ HÀM THỨ HAI: canon() ở trên đọc đúng năm trường mà thiết kế
   ngoài định biên cố ý KHÔNG đụng tới (grand, monthTotals, totalsByFc, data,
   pivot). Đó là điều làm cho golden cũ chứng minh được "không đụng vào phép
   tính" — nhưng cũng có nghĩa là golden cũ VĨNH VIỄN mù với một hồi quy của
   phần ngoài định biên. Đây là cái lưới bù vào đúng chỗ đó.

   canon() ở trên KHÔNG được đổi: nó là mốc so với bản một-file gốc. */
export function canonExt(R, ext) {
  const line = (p) => [
    p.division, p.budgetCode, p.costCenter, p.costCode, p.accountCode,
    p.formulaCode, p.formulaName, ...Array.from(p.m), p.total,
  ];
  return JSON.stringify({
    n: R.external.n,
    extGrand: R.external.grand,
    extMonths: Array.from(R.external.months),
    extRows: R.external.rows.map(line),
    /* Ba hàm cộng chung — mọi con số "tổng cuối cùng" trong app đi qua chúng. */
    grandAll: ext.grandAll(R),
    monthTotalsAll: ext.monthTotalsAll(R),
    pivotAll: ext.pivotAll(R).map(line),
    /* Chốt luôn hai bất biến mà cả thiết kế dựa vào. */
    baseGrandUntouched: R.grand,
    baseMonthTotals: Array.from(R.monthTotals),
  });
}
