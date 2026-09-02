/* ===========================================================
   IO — đọc/ghi file, gọi API xác thực
   Nguyên thủy vào/ra thuần: không dựng DOM, không gọi toast.
   Lỗi được ném lên cho tầng UI bắt và hiển thị.
   =========================================================== */
import { M, MONTHS, S, RESULT, nkey, t } from '../core/state.js';
import { ENGINE } from '../core/formula.js';

/* Nạp bằng <script defer> cổ điển trong index.html, chạy trước mọi module. */
const XLSX = window.XLSX;

/* ---------- Chọn / đọc / tải file ---------- */
function pickFile(accept, cb) {
  var inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
  inp.addEventListener('change', function () { if (inp.files[0]) cb(inp.files[0]); inp.remove(); });
  document.body.appendChild(inp); inp.click();
}

function readWorkbook(file, cb) {
  var fr = new FileReader();
  fr.onload = function (e) {
    try { cb(null, XLSX.read(new Uint8Array(e.target.result), { type: 'array' })); }
    catch (err) { cb(err); }
  };
  fr.onerror = function () { cb(new Error(t('io.err.read'))); };
  fr.readAsArrayBuffer(file);
}

function sheetAoa(wb, name) { return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true, blankrows: false }); }

function downloadBlob(blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
}

function dedupeHeaders(arr) {
  var seen = {};
  return arr.map(function (x, i) {
    var nm = String(x).trim() || t('io.header.fallback', { i: i + 1 });
    if (seen[nm]) { var k = 2; while (seen[nm + '_' + k]) k++; nm = nm + '_' + k; }
    seen[nm] = 1; return nm;
  });
}

function distinctVals(rows, col) {
  var seen = {}, out = [];
  rows.forEach(function (r) { var k = String(r[col] == null ? '' : r[col]).trim(); if (k === '' || seen[k]) return; seen[k] = 1; out.push(k); });
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
  var R = RESULT;
  {
    var wb = XLSX.utils.book_new();
    var acols = ENGINE.attrCols().map(function (c) { return c.alias; })
      .concat((S.classes || []).map(function (c) { return c.name; }).filter(Boolean));
    var fcs = R.formulas;

    if (opt.person) {
      var head = acols.concat(['Thang', 'HeSoDinhBien']).concat(fcs.map(function (f) { return f.code; })).concat(['TongThang']);
      var a = [head];
      for (var i = 0; i < R.rows.length; i++) {
        var r = R.rows[i], base = acols.map(function (c) { return r[c]; });
        for (var m = 0; m < M; m++) {
          var line = base.concat([m + 1, r.__m[m] || 0]), tot = 0;
          for (var c2 = 0; c2 < fcs.length; c2++) { var v = R.data[c2][i * M + m]; tot += v; line.push(v); }
          line.push(tot); a.push(line);
        }
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), 'NganSach_TheoNguoi');
    }

    if (opt.pivot) {
      var a2 = [['AccountCode', 'BudgetCode', 'CostCode', 'CostCenter', 'FormulaCode', 'TenCongThuc'].concat(MONTHS).concat(['CaNam'])];
      R.pivot.forEach(function (p) {
        a2.push([p.accountCode, p.budgetCode, p.costCode, p.costCenter, p.formulaCode, p.formulaName].concat(p.m).concat([p.total]));
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a2), 'TongHop_PhanLoai');
    }

    if (opt.fc) {
      var a3 = [['FormulaCode', 'Ten', 'CachTinh', 'ThangTrich'].concat(MONTHS).concat(['CaNam'])];
      fcs.forEach(function (fc, c) {
        var mt = new Array(M).fill(0), arr = R.data[c];
        for (var i2 = 0; i2 < R.rows.length; i2++) for (var m2 = 0; m2 < M; m2++) mt[m2] += arr[i2 * M + m2];
        a3.push([fc.code, fc.name || '', fc.mode === 'spread' ? t('export.mode.spread') : t('export.mode.monthly'),
        (fc.months || []).map(function (x) { return 'T' + String(x).padStart(2, '0'); }).join(' ')].concat(mt).concat([R.totalsByFc[c]]));
      });
      a3.push([t('export.total'), '', '', ''].concat(R.monthTotals).concat([R.grand]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a3), 'TongHop_FormulaCode');
    }

    if (opt.conflict) {
      var a4 = [['SoToTrinh', 'ID', 'ChucDanh', 'DonVi', 'FormulaCode', 'CostCode', 'Thang', 'TheoCongThuc', 'TheoToTrinh', 'QuyTac', 'ApDung', 'CoLech', 'BenThang']];
      R.conflicts.forEach(function (c) {
        a4.push([c.no, c.id, c.position, c.unit, c.formulaCode, c.costCode, c.month, c.formula, c.exception, c.rule, c.final, c.diff ? 'CO' : '', c.won ? 'To trinh' : 'Cong thuc']);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a4), 'DoiChieu_ToTrinh');
    }

    if (opt.audit) {
      var a5 = [['MUC', 'KHOA', 'GIA TRI 1', 'GIA TRI 2', 'GIA TRI 3']];
      a5.push([t('export.audit.period'), S.meta.name, S.meta.year, t('export.audit.exportedAt'), new Date().toLocaleString('vi-VN')]);
      a5.push([t('export.audit.hcSource'), S.hc.file, S.hc.at, t('export.audit.rows', { n: S.hc.rows.length }), '']);
      a5.push([]); a5.push([t('export.audit.params'), t('export.audit.name'), t('export.audit.value'), t('export.audit.note'), '']);
      S.params.forEach(function (p) { a5.push(['', p.name, p.value, p.note || '', '']); });
      a5.push([]); a5.push([t('export.audit.classes'), t('export.audit.colGenerated'), t('export.audit.key'), t('export.audit.rowCount'), t('export.audit.default')]);
      S.classes.forEach(function (c) { a5.push(['', c.name, (c.keys || []).join(' + '), (c.rows || []).length, c.def || '']); });
      a5.push([]); a5.push([t('export.audit.calendar'), t('export.audit.scope'), t('export.audit.month'), t('export.audit.stdDays'), t('export.audit.otherDays')]);
      (S.calendar.tables || []).forEach(function (t) {
        t.m.forEach(function (rec, k) {
          a5.push(['', t.scope || '*', MONTHS[k], rec.std, [rec.act, rec.hol, rec.leave, rec.other].join(' / ')]);
        });
      });
      a5.push([]); a5.push([t('export.audit.formulas'), 'Formula Code', t('export.audit.group'), t('export.audit.cond'), t('export.audit.formula')]);
      S.formulas.forEach(function (f) {
        (f.rules || []).forEach(function (r) { a5.push(['', f.code, r.name || '', r.cond || t('export.audit.condDefault'), r.formula || '']); });
      });
      a5.push([]); a5.push([t('export.audit.spread'), 'Formula Code', t('export.audit.calcMode'), t('export.audit.monthsPicked'), '']);
      S.formulas.forEach(function (f) {
        a5.push(['', f.code, f.mode === 'spread' ? t('export.mode.spread') : t('export.mode.monthly'),
        (f.months || []).map(function (x) { return 'T' + String(x).padStart(2, '0'); }).join(' '), '']);
      });
      a5.push([]); a5.push([t('export.audit.raises'), t('export.audit.raiseName'), t('export.audit.fromMonth'), t('export.audit.pct'), t('export.audit.appliesTo')]);
      S.raises.forEach(function (r) { a5.push(['', r.name, 'T' + String(r.fromMonth).padStart(2, '0'), r.pct, (r.formulas || []).join(' ') || t('export.audit.all')]); });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a5), 'BanKhaiBao');
    }

    if (opt.long) {
      var idC = R.idCol, posC = R.posCol, unC = R.unitCol;
      var cenOf = {}; (S.maps.costCenter || []).forEach(function (x) { cenOf[nkey(x.unit)] = x.costCenter; });
      var ccOf = {}; (S.maps.costCode || []).forEach(function (x) { ccOf[nkey(x.formulaCode)] = x.costCode; });
      var budOf = {}; (S.maps.budgetCode || []).forEach(function (x) { budOf[nkey(x.costCenter) + '|' + nkey(x.costCode) + '|' + nkey(x.unit)] = x.budgetCode; });
      var accOf = {}; (S.maps.accountCode || []).forEach(function (x) { accOf[nkey(x.costCode) + '|' + nkey(x.costCenter) + '|' + nkey(x.budgetCode)] = x.accountCode; });
      var a6 = [['ID', 'ChucDanh', 'DonVi', 'CostCenter', 'FormulaCode', 'CostCode', 'BudgetCode', 'AccountCode', 'Thang', 'SoTien']];
      for (var i3 = 0; i3 < R.rows.length; i3++) {
        var rr = R.rows[i3];
        var un = unC ? rr[unC] : '';
        var cen = cenOf[nkey(un)] || '';
        for (var c3 = 0; c3 < fcs.length; c3++) {
          var cc = ccOf[nkey(fcs[c3].code)] || '';
          var bud = budOf[nkey(cen) + '|' + nkey(cc) + '|' + nkey(un)] || '';
          var acc = accOf[nkey(cc) + '|' + nkey(cen) + '|' + nkey(bud)] || '';
          for (var m3 = 0; m3 < M; m3++) {
            var v3 = R.data[c3][i3 * M + m3];
            if (!v3) continue;
            a6.push([idC ? rr[idC] : '', posC ? rr[posC] : '', un, cen, fcs[c3].code, cc, bud, acc, m3 + 1, v3]);
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a6), 'ChiTiet_Dong');
    }

    var fn = 'NganSach_' + (S.meta.year || '') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    XLSX.writeFile(wb, fn, { compression: true });
    return fn;
  }
}

export {
  pickFile, readWorkbook, sheetAoa, downloadBlob,
  dedupeHeaders, distinctVals,
  apiSession, apiLogout,
  exportBudget
};
