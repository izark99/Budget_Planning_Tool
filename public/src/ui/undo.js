/* ===========================================================
   HOÀN TÁC THAO TÁC XOÁ

   App có khoảng hai chục nút xoá — Xoá sạch bảng, ✕ từng dòng, Xoá bảng phân
   loại, "Xoá hết, làm lại" — và trước đợt này tất cả chỉ được che bằng một hộp
   xác nhận. Bấm nhầm là mất, không có đường lui.

   VÌ SAO CHỤP CẢ STATE chứ không chụp riêng phần bị xoá: hai chục nơi gọi thì
   hai chục đoạn khôi phục riêng, mỗi đoạn một cách sai. Chụp cả state là MỘT
   đường duy nhất, không thể khôi phục thiếu. Giá đo được là ~1MB và ~30ms cho
   dự án 5000 dòng — rẻ, vì xoá là thao tác chủ ý và thưa, không phải mỗi lần
   gõ phím.

   CHỈ GIỮ ĐÚNG MỘT bản chụp, và thả nó khi toast tắt. Hoàn tác ngay hoặc thôi —
   đúng với tình huống "lỡ tay bấm xoá", và không bao giờ có chuyện bấm Hoàn tác
   sau mười thao tác nữa rồi mất sạch những gì vừa làm.
   =========================================================== */
import { S, setS, setRESULT, save } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { render, toast } from './dom.js';

/** Bản chụp đang được mời hoàn tác. Đúng một ô, thả khi toast tắt. */
let snap = null;

function undoTo(text) {
  if (text === null) return;
  snap = null;
  setS(JSON.parse(text));
  /* Số đã tính không còn khớp state nữa — bỏ hẳn, bắt chạy lại. */
  ENGINE.invalidate(); setRESULT(null); save(); render();
  toast(t('undo.done'), 'good');
}

/** Chạy một thao tác XOÁ và mời hoàn tác nó.
 *  Bản chụp lấy NGAY TRƯỚC khi chạy fn; toast dựng SAU fn vì fn thường gọi
 *  render(), mà render() xoá sạch document.body — toast là con của body.
 *  @param {string} msg  lời báo đã xoá gì
 *  @param {() => void} fn  chính thao tác xoá */
function withUndo(msg, fn) {
  const text = JSON.stringify(S);
  fn();
  snap = text;
  toast(msg, '', { label: t('undo.btn'), onclick: () => { undoTo(text); } },
    () => { if (snap === text) snap = null; });
}

/** Có bản chụp đang chờ hoàn tác không — dùng cho phép kiểm. */
function hasUndo() { return snap !== null; }

export { withUndo, hasUndo };
