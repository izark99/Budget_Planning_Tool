/* ===========================================================
   IO — đọc/ghi file, gọi API xác thực
   Nguyên thủy vào/ra thuần: không dựng DOM, không gọi toast.
   Lỗi được ném lên cho tầng UI bắt và hiển thị.
   =========================================================== */
import { CAL_FIELDS, M, MONTHS, S, RESULT, classDef, classOuts, nkey, numOf } from '../core/state.js';
import { buildWorkbook } from './xlsx-write.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';

/* Nạp bằng <script defer> cổ điển trong index.html, chạy trước mọi module. */
const XLSX = window.XLSX;

/* ---------- Chọn / đọc / tải file ---------- */
function pickFile(accept, cb) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
  inp.addEventListener('change', () => { if (inp.files[0]) cb(inp.files[0]); inp.remove(); });
  document.body.appendChild(inp); inp.click();
}

function readWorkbook(file, cb) {
  const fr = new FileReader();
  fr.onload = function (e) {
    try { cb(null, XLSX.read(new Uint8Array(/** @type {ArrayBuffer} */ (e.target.result)), { type: 'array' })); }
    catch (err) { cb(err); }
  };
  fr.onerror = function () { cb(new Error(t('io.err.read'))); };
  fr.readAsArrayBuffer(file);
}

function sheetAoa(wb, name) { return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true, blankrows: false }); }

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
}

function dedupeHeaders(arr) {
  const seen = {};
  return arr.map((x, i) => {
    let nm = String(x).trim() || t('io.header.fallback', { i: i + 1 });
    if (seen[nm]) { let k = 2; while (seen[nm + '_' + k]) k++; nm = nm + '_' + k; }
    seen[nm] = 1; return nm;
  });
}

function distinctVals(rows, col) {
  const seen = {}, out = [];
  rows.forEach((r) => { const k = String(r[col] == null ? '' : r[col]).trim(); if (k === '' || seen[k]) return; seen[k] = 1; out.push(k); });
  return out.sort();
}

/* ---------- Xác thực (thay cho AUTH_URL + localStorage cũ) ---------- */
async function apiSession() {
  return fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
}
async function apiLogout() {
  return fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
}

/* ---------- Xuất Excel ----------
   Thân hàm giữ nguyên từ doExport() của bản gốc; chỉ bỏ lớp toast/try-catch
   ra ngoài để io.js không phụ thuộc ui.js. Trả về tên file, ném lỗi khi hỏng. */
function exportBudget(opt) {
  const R = RESULT;
  {
    /* Mỗi sheet: { name, aoa, fmt, totalRows } — fmt là kiểu định dạng THEO CỘT
       nên tiền ra tiền, hệ số ra hệ số, tháng ra số nguyên. */
    const sheets = [];
    const money = (n) => { return new Array(n).fill('money'); };
    const text = (n) => { return new Array(n).fill('text'); };
    const acols = ENGINE.attrCols().map((c) => { return c.alias; })
      .concat(ENGINE.classCols());
    const fcs = R.formulas;

    if (opt.person) {
      const head = acols.concat(['Thang', 'HeSoDinhBien']).concat(fcs.map((f) => { return f.code; })).concat(['TongThang']);
      const a = [head];
      for (let i = 0; i < R.rows.length; i++) {
        const r = R.rows[i], base = acols.map((c) => { return r[c]; });
        for (let m = 0; m < M; m++) {
          const line = base.concat([m + 1, r.__m[m] || 0]); let tot = 0;
          for (let c2 = 0; c2 < fcs.length; c2++) { const v = R.data[c2][i * M + m]; tot += v; line.push(v); }
          line.push(tot); a.push(line);
        }
      }
      sheets.push({
        name: 'NganSach_TheoNguoi', aoa: a,
        fmt: text(acols.length).concat(['int', 'num'], money(fcs.length + 1))
      });
    }

    if (opt.pivot) {
      /* Thứ tự cột khớp đúng bảng trên màn Kết quả: Division / Budget Code /
         Cost Center / Cost Code / Account. text(7) = sáu cột mã + tên công thức. */
      const a2 = [['Division', 'BudgetCode', 'CostCenter', 'CostCode', 'AccountCode', 'FormulaCode', 'TenCongThuc'].concat(MONTHS).concat(['CaNam'])];
      R.pivot.forEach((p) => {
        a2.push(/** @type {any[]} */ ([p.division, p.budgetCode, p.costCenter, p.costCode, p.accountCode, p.formulaCode, p.formulaName]).concat(p.m).concat([p.total]));
      });
      sheets.push({ name: 'TongHop_PhanLoai', aoa: a2, fmt: text(7).concat(money(M + 1)) });
    }

    if (opt.fc) {
      /** Bảng tổng hợp theo Formula Code: ô là chuỗi lẫn số. @type {any[][]} */
      const a3 = [['FormulaCode', 'Ten', 'CachTinh', 'ThangTrich'].concat(MONTHS).concat(['CaNam'])];
      fcs.forEach((fc, c) => {
        const mt = new Array(M).fill(0), arr = R.data[c];
        for (let i2 = 0; i2 < R.rows.length; i2++) for (let m2 = 0; m2 < M; m2++) mt[m2] += arr[i2 * M + m2];
        a3.push(/** @type {any[]} */ ([fc.code, fc.name || '', fc.mode === 'spread' ? t('export.mode.spread') : t('export.mode.monthly'),
        (fc.months || []).map((x) => { return 'T' + String(x).padStart(2, '0'); }).join(' ')]).concat(mt).concat([R.totalsByFc[c]]));
      });
      a3.push(/** @type {any[]} */ ([t('export.total'), '', '', '']).concat(R.monthTotals).concat([R.grand]));
      sheets.push({
        name: 'TongHop_FormulaCode', aoa: a3,
        fmt: text(4).concat(money(M + 1)), totalRows: [a3.length - 1]
      });
    }

    if (opt.conflict) {
      const a4 = [['SoToTrinh', 'ID', 'ChucDanh', 'DonVi', 'FormulaCode', 'CostCode', 'Thang', 'TheoCongThuc', 'TheoToTrinh', 'QuyTac', 'ApDung', 'CoLech', 'BenThang']];
      R.conflicts.forEach((c) => {
        a4.push([c.no, c.id, c.position, c.unit, c.formulaCode, c.costCode, c.month, c.formula, c.exception, c.rule, c.final, c.diff ? 'CO' : '', c.won ? 'To trinh' : 'Cong thuc']);
      });
      sheets.push({
        name: 'DoiChieu_ToTrinh', aoa: a4,
        fmt: text(6).concat(['int', 'money', 'money', 'text', 'money', 'text', 'text'])
      });
    }

    if (opt.audit) {
      /** Bảng thuyết minh: ô là chuỗi lẫn số lẫn rỗng. @type {any[][]} */
      const a5 = [['MUC', 'KHOA', 'GIA TRI 1', 'GIA TRI 2', 'GIA TRI 3']];
      a5.push([t('export.audit.period'), S.meta.name, S.meta.year, t('export.audit.exportedAt'), new Date().toLocaleString('vi-VN')]);
      a5.push([t('export.audit.hcSource'), S.hc.file, S.hc.at, t('export.audit.rows', { n: S.hc.rows.length }), '']);
      a5.push([]); a5.push([t('export.audit.params'), t('export.audit.name'), t('export.audit.value'), t('export.audit.note'), '']);
      S.params.forEach((p) => { a5.push(['', p.name, p.value, p.note || '', '']); });
      a5.push([]); a5.push([t('export.audit.classes'), t('export.audit.colGenerated'), t('export.audit.key'), t('export.audit.rowCount'), t('export.audit.default')]);
      /* Một bảng sinh nhiều cột: mỗi cột một dòng khai báo, để bản kiểm tra kể
         đủ chứ không chỉ kể cột đầu. */
      S.classes.forEach((c) => {
        classOuts(c).forEach((o, j) => {
          a5.push(['', o.name, (c.keys || []).join(' + '), (c.rows || []).length, classDef(c, j) || '']);
        });
      });
      a5.push([]); a5.push([t('export.audit.calendar'), t('export.audit.scope'), t('export.audit.month'), t('export.audit.stdDays'), t('export.audit.otherDays')]);
      (S.calendar.tables || []).forEach((t) => {
        t.m.forEach((rec, k) => {
          a5.push(['', t.scope || '*', MONTHS[k], rec.std, CAL_FIELDS.slice(1).map((f) => { return numOf(rec[f.k]); }).join(' / ')]);
        });
      });
      a5.push([]); a5.push([t('export.audit.formulas'), 'Formula Code', t('export.audit.group'), t('export.audit.cond'), t('export.audit.formula')]);
      S.formulas.forEach((f) => {
        (f.rules || []).forEach((r) => { a5.push(['', f.code, r.name || '', r.cond || t('export.audit.condDefault'), r.formula || '']); });
      });
      a5.push([]); a5.push([t('export.audit.spread'), 'Formula Code', t('export.audit.calcMode'), t('export.audit.monthsPicked'), '']);
      S.formulas.forEach((f) => {
        a5.push(['', f.code, f.mode === 'spread' ? t('export.mode.spread') : t('export.mode.monthly'),
        (f.months || []).map((x) => { return 'T' + String(x).padStart(2, '0'); }).join(' '), '']);
      });
      a5.push([]); a5.push([t('export.audit.raises'), t('export.audit.raiseName'), t('export.audit.fromMonth'), t('export.audit.pct'), t('export.audit.appliesTo'), t('export.audit.raiseAmount')]);
      /* Kèm luôn tiền mà mỗi đợt cộng thêm, để file khớp đúng màn Kết quả. Khớp
         theo id vì tên đợt có thể trùng nhau. */
      const impact = {};
      ((RESULT && RESULT.raiseImpact) || []).forEach((x) => { impact[x.id] = x.total; });
      S.raises.forEach((r) => {
        a5.push(['', r.name, 'T' + String(r.fromMonth).padStart(2, '0'), r.pct,
          (r.formulas || []).join(' ') || t('export.audit.all'),
          impact[r.id] == null ? '' : Math.round(impact[r.id])]);
      });
      sheets.push({ name: 'BanKhaiBao', aoa: a5, fmt: text(6) });
    }

    if (opt.long) {
      const idC = R.idCol, posC = R.posCol, unC = R.unitCol;
      /* BẢN SAO THỨ HAI của các khoá ánh xạ (bản gốc ở ENGINE.buildMaps). Đổi
         khoá Budget Code ở một bên mà quên bên kia thì sheet dài và bảng pivot
         nói hai số khác nhau, mà không có gì báo. */
      const cenOf = {}; (S.maps.costCenter || []).forEach((x) => { cenOf[nkey(x.unit)] = x.costCenter; });
      const divOf = {}; (S.maps.division || []).forEach((x) => { divOf[nkey(x.unit)] = x.division; });
      const ccOf = {}; (S.maps.costCode || []).forEach((x) => { ccOf[nkey(x.formulaCode)] = x.costCode; });
      const budOf = {}; (S.maps.budgetCode || []).forEach((x) => { budOf[nkey(x.costCode) + '|' + nkey(x.unit)] = x.budgetCode; });
      const accOf = {}; (S.maps.accountCode || []).forEach((x) => { accOf[nkey(x.costCode) + '|' + nkey(x.costCenter) + '|' + nkey(x.budgetCode)] = x.accountCode; });
      const a6 = [['ID', 'ChucDanh', 'DonVi', 'Division', 'CostCenter', 'FormulaCode', 'CostCode', 'BudgetCode', 'AccountCode', 'Thang', 'SoTien']];
      for (let i3 = 0; i3 < R.rows.length; i3++) {
        const rr = R.rows[i3];
        const un = unC ? rr[unC] : '';
        const cen = cenOf[nkey(un)] || '';
        const dv = divOf[nkey(un)] || '';
        for (let c3 = 0; c3 < fcs.length; c3++) {
          const cc = ccOf[nkey(fcs[c3].code)] || '';
          const bud = budOf[nkey(cc) + '|' + nkey(un)] || '';
          const acc = accOf[nkey(cc) + '|' + nkey(cen) + '|' + nkey(bud)] || '';
          for (let m3 = 0; m3 < M; m3++) {
            const v3 = R.data[c3][i3 * M + m3];
            if (!v3) continue;
            a6.push([idC ? rr[idC] : '', posC ? rr[posC] : '', un, dv, cen, fcs[c3].code, cc, bud, acc, m3 + 1, v3]);
          }
        }
      }
      sheets.push({ name: 'ChiTiet_Dong', aoa: a6, fmt: text(9).concat(['int', 'money']) });
    }

    const fn = 'NganSach_' + (S.meta.year || '') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    /* Uint8Array -> BlobPart: cắt đúng vùng đang dùng của bộ đệm. */
    const bytes = buildWorkbook(sheets);
    downloadBlob(new Blob([bytes.slice().buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }), fn);
    return fn;
  }
}

export {
  pickFile, readWorkbook, sheetAoa, downloadBlob,
  dedupeHeaders, distinctVals,
  apiSession, apiLogout,
  exportBudget
};
