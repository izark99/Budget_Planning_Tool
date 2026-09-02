/* ===========================================================
   CONTENT — toàn bộ text tiếng Việt hiển thị, nạp từ public/content.md

   Tách khỏi state.js vì đây là mối quan tâm khác hẳn: state là DỮ LIỆU DỰ ÁN
   của người dùng, còn đây là NGÔN NGỮ của giao diện. Tách ra thì expression.js
   chỉ cần phụ thuộc vào đúng t() chứ không kéo theo cả cây state.

   LƯU Ý: content.md nạp BẤT ĐỒNG BỘ, sau khi các module đã chạy xong. Nên cấu
   trúc dữ liệu dựng lúc nạp module (ROLES, VIEWS, FX_DOCS…) phải giữ KHOÁ, rồi
   gọi t(khoá) lúc render — chứ không gọi t() ngay lúc khai báo.
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

export { STRINGS, parseContent, loadContent, t };
