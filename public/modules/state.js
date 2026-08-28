/* ===========================================================
   STATE — hằng số, trạng thái, lưu trữ, tiện ích số học
   Tách từ khối 02-core.js của lap-ngan-sach-dinh-bien.html.
   Logic giữ nguyên; chỉ thêm setS/setRESULT (ESM không cho gán
   lại binding đã import) và bộ nạp text t()/loadContent().
   =========================================================== */

/* ---------- Text tách ngoài (content.md) ---------- */
var STRINGS = {};

function parseContent(txt) {
  var out = {};
  String(txt).split(/\r?\n/).forEach(function (line) {
    var s = line.trim();
    if (!s || s.charAt(0) === '#') return;
    var i = s.indexOf(':');
    if (i < 0) return;
    var k = s.slice(0, i).trim();
    if (!k) return;
    out[k] = s.slice(i + 1).trim().replace(/\\n/g, '\n');
  });
  return out;
}

async function loadContent(url) {
  var res = await fetch(url || '/content.md', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error('content.md HTTP ' + res.status);
  STRINGS = parseContent(await res.text());
  return STRINGS;
}

/* t('toast.import.rows', { n: 128 }) — thiếu khoá thì trả về chính khoá
   để lỗi lộ ra ngay trên giao diện thay vì im lặng hiện rỗng. */
function t(key, vars) {
  var v = STRINGS[key];
  if (v == null) return key;
  if (vars) v = v.replace(/\{(\w+)\}/g, function (m, n) { return vars[n] != null ? vars[n] : m; });
  return v;
}

/* Báo cho tầng UI (app.js gắn toast vào đây) — tránh state.js phải import ui.js */
var notify = function () { };
function setNotifier(fn) { notify = fn; }

/* ---------- Hằng số ---------- */
var LS_KEY = 'dhg_budget_state_v2';
var M = 12;
var MONTHS = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12'];

/* `v` là định danh được ghi vào S.cols[].role — KHÔNG đổi.
   `t` là khoá tra trong content.md, phân giải lúc render (t(r.t)). */
var ROLES = [
  { v: 'attr', t: 'role.attr' },
  { v: 'key', t: 'role.key' },
  { v: 'position', t: 'role.position' },
  { v: 'unit', t: 'role.unit' },
  { v: 'month', t: 'role.month' },
  { v: 'skip', t: 'role.skip' }
];

/* CHUỖI GIAO THỨC — đừng đưa `label` sang content.md.
   `label` vừa là header ghi ra file mẫu .xlsx (calTemplate) vừa là khoá
   khớp cột khi nhập lại file đó (calImport). Đổi text = file mẫu đã tải
   về trước đây không nhập lại được nữa. `varName` là tên biến dùng trong
   công thức của người dùng — càng không được đổi. */
var CAL_FIELDS = [
  { k: 'std', label: 'Ngày công chuẩn', varName: 'NGAY_CONG_CHUAN', def: 26 },
  { k: 'act', label: 'Ngày công làm việc thực tế', varName: 'NGAY_CONG_THUC_TE', def: 22 },
  { k: 'hol', label: 'Ngày nghỉ lễ', varName: 'NGAY_NGHI_LE', def: 1 },
  { k: 'leave', label: 'Ngày nghỉ phép có lương', varName: 'NGAY_NGHI_PHEP', def: 1 },
  { k: 'other', label: 'Ngày nghỉ có lương khác', varName: 'NGAY_NGHI_KHAC', def: 2 }
];

function uid() { return Math.random().toString(36).slice(2, 9); }
function allMonths() { return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; }

function blankCalTable(scope) {
  return {
    id: uid(), scope: scope || '*',
    m: MONTHS.map(function () {
      var o = {}; CAL_FIELDS.forEach(function (f) { o[f.k] = f.def; }); return o;
    })
  };
}

/* GIÁ TRỊ MỒI — là DỮ LIỆU, không phải nhãn giao diện.
   Chúng được JSON.stringify vào localStorage, vào file dự án .json và in ra
   sheet "BanKhaiBao" khi xuất Excel. Người dùng sửa trực tiếp trong app.
   Vì vậy giữ nguyên trong code, không đưa sang content.md. */
function defaultState() {
  return {
    v: 2,
    meta: { name: 'Ngân sách nhân sự', year: new Date().getFullYear() + 1 },
    hc: { headers: [], rows: [], file: '', at: '' },
    cols: [],
    params: [
      { name: 'LUONG_CO_SO', value: 2340000, note: 'Mức lương cơ sở nhân với hệ số' },
      { name: 'DON_GIA_AN_CA', value: 35000, note: 'Đơn giá một suất ăn ca' },
      { name: 'TY_LE_BHXH_CTY', value: 21.5, note: '% công ty đóng — dùng dạng TY_LE_BHXH_CTY%' }
    ],
    classes: [],
    policies: [],
    /* Công thức dùng chung: biểu thức đặt tên, tính lúc chạy theo từng dòng × tháng.
       Gọi được bằng `code` (LUONG_CO_BAN) hoặc bằng `[name]` ([Lương cơ bản]). */
    shared: [],
    calendar: { groupCol: '', tables: [blankCalTable('*')] },
    formulas: [
      {
        id: uid(), code: 'FC_LUONG_HESO', name: 'Lương theo hệ số', mode: 'monthly', months: allMonths(),
        rules: [{ id: uid(), name: 'Tất cả', cond: '', formula: 'ROUND([Coefficient]*LUONG_CO_SO,-3)' }]
      },
      {
        id: uid(), code: 'FC_BHXH', name: 'BHXH-BHYT-BHTN phần công ty', mode: 'monthly', months: allMonths(),
        rules: [{ id: uid(), name: 'Tất cả', cond: '', formula: 'ROUND([Coefficient]*LUONG_CO_SO*TY_LE_BHXH_CTY%,-3)' }]
      },
      {
        id: uid(), code: 'FC_DIENTHOAI', name: 'Phụ cấp điện thoại', mode: 'monthly', months: allMonths(),
        rules: [{ id: uid(), name: 'Mặc định', cond: '', formula: '300000' }]
      },
      {
        id: uid(), code: 'FC_DULICH', name: 'Du lịch nghỉ mát', mode: 'spread', months: [7, 9],
        rules: [{ id: uid(), name: 'Tất cả', cond: '', formula: '6000000' }]
      }
    ],
    maps: { costCode: [], costCenter: [], budgetCode: [], accountCode: [] },
    exceptions: [],
    raises: [{ id: uid(), name: 'Tăng lương định kỳ', fromMonth: 4, pct: 8, cond: '', formulas: ['FC_LUONG_HESO', 'FC_BHXH'], active: true }],
    ui: { view: 'hc', fSel: null, collapsed: {} }
  };
}

var S = defaultState();
var RESULT = null;
var dirty = false;

/* ESM: binding đã import là bất biến ở phía import, nên mọi chỗ gán lại
   S/RESULT ở module khác phải đi qua hai hàm này. Chỗ ĐỌC vẫn viết
   `S.hc.rows` / `RESULT` như cũ nhờ live binding. */
function setS(next) { S = next; }
function setRESULT(next) { RESULT = next; }

function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); dirty = false; return true; } catch (e) { return false; } }
function load() {
  try {
    var raw = localStorage.getItem(LS_KEY); if (!raw) return false;
    var o = JSON.parse(raw); if (!o || o.v !== 2) return false;
    S = Object.assign(defaultState(), o);
    S.ui = S.ui || { view: 'hc' };
    S.ui.collapsed = S.ui.collapsed || {};
    S.maps = Object.assign({ costCode: [], costCenter: [], budgetCode: [], accountCode: [] }, S.maps || {});
    S.shared = S.shared || [];
    return true;
  } catch (e) { return false; }
}
var saveT = null, quotaWarned = false;
function touch() {
  dirty = true; clearTimeout(saveT);
  saveT = setTimeout(function () {
    if (!save() && !quotaWarned) { quotaWarned = true; notify(t('toast.autosave.fail'), 'bad'); }
  }, 700);
}

/* Trước đây đăng ký ngay ở cấp cao nhất của script; giờ app.js gọi tường minh. */
function installAutosave() {
  window.addEventListener('beforeunload', function () { if (dirty) save(); });
}

/* ---------- Số ---------- */
var NF = new Intl.NumberFormat('vi-VN');
function fmt(n) { if (n == null || n === '' || isNaN(n)) return ''; return NF.format(Math.round(n)); }
function fmtShort(n) {
  n = Math.round(n || 0); var a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2).replace('.', ',') + ' ' + t('num.suffix.billion');
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace('.', ',') + ' ' + t('num.suffix.million');
  return NF.format(n);
}
function nkey(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function numOf(v) { var n = parseFloat(String(v).replace(/[,\s]/g, '')); return isNaN(n) ? 0 : n; }

/* Hiển thị số có phân cách nghìn nhưng không cắt phần thập phân */
var NF_NUM = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 });
function fmtNum(v) {
  if (v === '' || v === null || v === undefined) return '';
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,\s]/g, ''));
  return isNaN(n) ? String(v) : NF_NUM.format(n);
}

export {
  STRINGS, loadContent, t, setNotifier,
  LS_KEY, M, MONTHS, ROLES, CAL_FIELDS,
  uid, allMonths, blankCalTable, defaultState,
  S, RESULT, dirty, setS, setRESULT,
  save, load, touch, installAutosave,
  NF, fmt, fmtShort, nkey, numOf, NF_NUM, fmtNum
};
