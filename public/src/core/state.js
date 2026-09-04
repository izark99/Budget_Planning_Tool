/* ===========================================================
   STATE — hằng số, trạng thái, lưu trữ, tiện ích số học
   Tách từ khối 02-core.js của lap-ngan-sach-dinh-bien.html.
   Logic giữ nguyên; chỉ thêm setS/setRESULT — ESM không cho gán lại một binding
   đã import, nên chỗ GHI phải đi qua hai hàm này; chỗ ĐỌC vẫn viết S.hc.rows
   như cũ nhờ live binding.
   =========================================================== */
import { t } from './content.js';

/* Báo cho tầng UI (app.js gắn toast vào đây) — tránh state.js phải import ui.js */
/** @type {(msg: string, kind?: string) => void} */
let notify = function () { };
function setNotifier(fn) { notify = fn; }

/* ---------- Hằng số ---------- */
const LS_KEY = 'dhg_budget_state_v2';
const M = 12;
const MONTHS = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12'];

/* `v` là định danh được ghi vào S.cols[].role — KHÔNG đổi.
   `t` là khoá tra trong content.md, phân giải lúc render (t(r.t)). */
const ROLES = [
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
/* Biến hệ thống dùng được trong công thức. Trước đây bộ ba đầu chép tay ở BỐN
   chỗ (fx-help hai lần, formula-input hai lần) — thêm biến mới là sót một chỗ.
   THANG và DINH_BIEN đổi theo tháng; TONG_THANG và THANG_BAT_DAU là hằng của
   từng DÒNG, không đổi theo tháng, nên tuyệt đối không thêm vào MONTH_VARS của
   expression.js — nhét vào đó là giết bộ nhớ đệm eval của mọi công thức dùng chúng. */
const SYS_VARS = ['THANG', 'DINH_BIEN', 'SO_THANG', 'TONG_THANG', 'THANG_BAT_DAU'];

const CAL_FIELDS = [
  { k: 'std', label: 'Ngày công chuẩn', varName: 'NGAY_CONG_CHUAN', def: 26 },
  { k: 'act', label: 'Ngày công làm việc thực tế', varName: 'NGAY_CONG_THUC_TE', def: 22 },
  { k: 'hol', label: 'Ngày nghỉ lễ', varName: 'NGAY_NGHI_LE', def: 1 },
  { k: 'leave', label: 'Ngày nghỉ phép có lương', varName: 'NGAY_NGHI_PHEP', def: 1 },
  /* Tách khỏi "ngày nghỉ có lương khác" để nhìn ra ngay, và đứng NGAY TRƯỚC nó:
     hai loại nghỉ này hay bị khai lẫn nhau, để cạnh nhau thì thấy ngay. Mồi 0 chứ
     không bớt của cột cũ — không đoán được trong đống "khác" cũ có bao nhiêu ngày
     ngừng việc.
     BẤT BIẾN DUY NHẤT của mảng này: `std` phải ở chỉ số 0. Ô đối chiếu và cảnh báo
     của máy tính đều cộng CAL_FIELDS.slice(1) rồi so với std; phép cộng thì giao
     hoán nên thứ tự của năm cột còn lại chỉ là thứ tự HIỂN THỊ. Đổi thứ tự ở đây
     là đổi thứ tự cột trên lưới Ngày công, trong file mẫu, trong bản xuất, và
     trong cột ghép chuỗi của sheet BanKhaiBao (nhãn export.audit.otherDays phải
     đổi theo). Nhập lại file cũ vẫn đúng: importMapped khớp cột theo TÊN tiêu đề
     chứ không theo vị trí. */
  { k: 'stop', label: 'Ngày nghỉ ngừng việc', varName: 'NGAY_NGHI_NGUNG_VIEC', def: 0 },
  { k: 'other', label: 'Ngày nghỉ có lương khác', varName: 'NGAY_NGHI_KHAC', def: 2 }
];

function uid() { return Math.random().toString(36).slice(2, 9); }
function allMonths() { return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; }

/* ---------- Cột giá trị của một bảng phân loại nhóm ----------
   Bảng phân loại nhóm nay sinh ra NHIỀU cột giá trị, đúng hình dạng của bảng
   chính sách: cl.outs = [{name, type}] và cl.def là mảng khớp chỉ số.

   Bảng khai từ trước chỉ có một cột, mô tả bằng cl.name + cl.type + cl.def (một
   giá trị). Hai hàm dưới đây đọc cả hai hình dạng ra cùng một thứ, nên KHÔNG
   phải chuyển đổi dữ liệu: mọi file dự án .json cũ, mọi state trong
   localStorage, và mọi bộ kiểm dựng state bằng tay đều chạy nguyên.

   Đặt ở đây chứ không ở views/classes.js vì máy tính (core/engine.js) cũng cần,
   mà core không được import từ views — đồ thị import phải không có chu trình. */
function classOuts(cl) {
  const outs = (cl.outs || []).filter((o) => { return o && o.name; });
  if (outs.length) return outs;
  return cl.name ? [{ name: cl.name, type: cl.type === 'num' ? 'num' : 'text' }] : [];
}

/** Mặc định của cột giá trị thứ i, đọc được cả hình dạng cũ (một giá trị). */
function classDef(cl, i) {
  return Array.isArray(cl.def) ? cl.def[i] : (i === 0 ? cl.def : '');
}

/** Ghi hẳn hình dạng mới vào bảng cũ — gọi ngay TRƯỚC khi người dùng sửa cột
    giá trị, để từ đó cl.name chỉ còn là tên bảng. Không gọi lúc nạp: dự án chưa
    đụng tới thì giữ nguyên như cũ. */
function ensureClassOuts(cl) {
  if ((cl.outs || []).filter((o) => { return o && o.name; }).length) return cl;
  cl.outs = classOuts(cl).map((o) => { return { name: o.name, type: o.type }; });
  cl.def = [cl.def === undefined || cl.def === null ? '' : cl.def];
  return cl;
}

/* Lịch từ localStorage hay .json cũ thiếu hẳn khoá của cột mới thêm: load() và
   openProject() đều Object.assign NÔNG nên S.calendar bị thay nguyên khối. Đọc
   thì an toàn (numOf(undefined) = 0) nhưng ô nhập hiện undefined và ô đối chiếu
   báo lệch oan. Điền khoá thiếu bằng giá trị mồi, KHÔNG đụng số đã khai. */
function normaliseCalendar(cal) {
  if (!cal || !cal.tables) return cal;
  cal.tables.forEach((tbl) => {
    (tbl.m || []).forEach((rec) => {
      CAL_FIELDS.forEach((f) => { if (rec[f.k] === undefined) rec[f.k] = f.def; });
    });
  });
  return cal;
}

function blankCalTable(scope) {
  return {
    id: uid(), scope: scope || '*',
    m: MONTHS.map(() => {
      const o = {}; CAL_FIELDS.forEach((f) => { o[f.k] = f.def; }); return o;
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
    /* % trích theo phân loại: mỗi Formula Code chọn MỘT cột phân loại, rồi khai
       % cho từng giá trị của cột đó × 12 tháng. Chưa khai = 100% (không đổi). */
    accruals: [],
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
    maps: { costCode: [], costCenter: [], division: [], budgetCode: [], accountCode: [] },
    exceptions: [],
    raises: [{ id: uid(), name: 'Tăng lương định kỳ', fromMonth: 4, pct: 8, cond: '', formulas: ['FC_LUONG_HESO', 'FC_BHXH'], active: true }],
    ui: { view: 'hc', fSel: null, collapsed: {} }
  };
}

/** @type {ProjectState} */
let S = defaultState();
/** @type {BudgetResult|null} */
let RESULT = null;
let dirty = false;

/* ESM: binding đã import là bất biến ở phía import, nên mọi chỗ gán lại
   S/RESULT ở module khác phải đi qua hai hàm này. Chỗ ĐỌC vẫn viết
   `S.hc.rows` / `RESULT` như cũ nhờ live binding. */
/** @param {ProjectState} next */
/* Mọi đường thay nguyên khối state đều đi qua đây — mở file dự án, nạp lại từ
   localStorage, đặt state trong bộ kiểm. Chuẩn hoá lịch ở đúng một chỗ này thay
   vì rải ra từng nơi gọi, nếu không thì state cũ và mới lệch nhau đúng cái khoá
   vừa thêm. */
/* Năm bảng ánh xạ chi phí. Dự án lưu từ trước thiếu hẳn bảng mới thêm, mà
   Object.assign của load()/openProject() chỉ chép NÔNG nên khoá thiếu vẫn thiếu
   — nút "xoá sạch mọi bảng" gặp undefined là nổ ngay.

   Đồng thời chuyển đổi Budget Code: khoá cũ là Cost Center + Cost Code + Đơn vị,
   khoá mới bỏ Cost Center. Dòng cũ nhận ra bằng chính khoá costCenter còn nằm
   trong object. Giữ lại là để hai loại khoá lẫn lộn trong một bảng, nên xoá sạch
   và để người dùng bấm "Sinh sẵn" khai lại — có báo, không xoá lặng lẽ. */
const MAP_TABLES = ['costCode', 'costCenter', 'division', 'budgetCode', 'accountCode'];

function normaliseMaps(s) {
  const mp = s.maps || (s.maps = {});
  MAP_TABLES.forEach((k) => { if (!Array.isArray(mp[k])) mp[k] = []; });
  s.meta = s.meta || {};
  if (s.meta.budKeyV !== 2) {
    const legacy = mp.budgetCode.some((r) => { return r && Object.prototype.hasOwnProperty.call(r, 'costCenter'); });
    if (legacy) { mp.budgetCode.length = 0; s.meta.budKeyReset = true; }
    s.meta.budKeyV = 2;
  }
  return s;
}

function setS(next) { S = next; normaliseCalendar(S.calendar); normaliseMaps(S); }
/** @param {BudgetResult|null} next */
function setRESULT(next) { RESULT = next; }

function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); dirty = false; return true; } catch { return false; } }
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY); if (!raw) return false;
    const o = JSON.parse(raw); if (!o || o.v !== 2) return false;
    /* Đi qua setS(): lịch thiếu khoá và bảng ánh xạ thiếu bảng đều được điền ở
       ĐÚNG MỘT chỗ, thay vì mỗi đường nạp state lại chép lại một lần. */
    setS(Object.assign(defaultState(), o));
    S.ui = S.ui || { view: 'hc' };
    S.ui.collapsed = S.ui.collapsed || {};
    S.shared = S.shared || [];
    S.accruals = S.accruals || [];
    return true;
  } catch { return false; }
}
let saveT = null, quotaWarned = false;
function touch() {
  /* Đếm SỐ LẦN sửa chứ không ghi mốc thời gian: hai thao tác trong cùng một
     mili-giây với lần lưu sẽ lọt qua phép so mốc, còn bộ đếm thì không. */
  dirty = true; S.meta.changeSeq = (S.meta.changeSeq || 0) + 1; clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (!save() && !quotaWarned) { quotaWarned = true; notify(t('toast.autosave.fail'), 'bad'); }
  }, 700);
}

/* DỮ LIỆU KHÔNG MẤT KHI TẮT TAB — có tự lưu vào localStorage cộng một lượt xả ở
   beforeunload, và đăng xuất cũng không xoá. Cái thật sự thiếu là BẢN SAO RA
   FILE .json: localStorage gắn với đúng một trình duyệt trên đúng một máy, xoá
   cache là hết. Hai hàm dưới đây theo dõi đúng khoảng cách đó, không phải
   khoảng cách "đã lưu localStorage hay chưa". */
function markExported() {
  S.meta.exportedSeq = S.meta.changeSeq || 0;
  S.meta.exportedAt = Date.now();                   /* chỉ để hiện "Đã lưu lúc …" */
  save();
}
function needsExport() {
  if (!S.hc.rows.length) return false;              /* chưa có gì để mà lưu */
  return (S.meta.changeSeq || 0) > (S.meta.exportedSeq || 0);
}

/* Trước đây đăng ký ngay ở cấp cao nhất của script; giờ app.js gọi tường minh. */
function installAutosave() {
  window.addEventListener('beforeunload', (e) => {
    if (dirty) save();
    /* Trình duyệt không cho đổi chữ trong hộp thoại này, chỉ cho bật/tắt. Nó
       hiện ở MỌI lần đóng khi còn thay đổi chưa lưu ra file, nên phải tắt được
       — công tắc nằm ở thanh bên. */
    if (S.ui.warnOnClose !== false && needsExport()) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* ---------- Số ---------- */
const NF = new Intl.NumberFormat('vi-VN');
function fmt(n) { if (n == null || n === '' || isNaN(n)) return ''; return NF.format(Math.round(n)); }
function fmtShort(n) {
  n = Math.round(n || 0); const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2).replace('.', ',') + ' ' + t('num.suffix.billion');
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace('.', ',') + ' ' + t('num.suffix.million');
  return NF.format(n);
}
function nkey(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function numOf(v) { const n = parseFloat(String(v).replace(/[,\s]/g, '')); return isNaN(n) ? 0 : n; }

/* Hiển thị số có phân cách nghìn nhưng không cắt phần thập phân */
const NF_NUM = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 });
function fmtNum(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,\s]/g, ''));
  return isNaN(n) ? String(v) : NF_NUM.format(n);
}

export {
  setNotifier,
  LS_KEY, M, MONTHS, ROLES, CAL_FIELDS, SYS_VARS, MAP_TABLES,
  uid, allMonths, blankCalTable, normaliseCalendar, defaultState,
  classOuts, classDef, ensureClassOuts,
  S, RESULT, dirty, setS, setRESULT,
  save, load, touch, installAutosave, markExported, needsExport,
  NF, fmt, fmtShort, nkey, numOf, NF_NUM, fmtNum
};
