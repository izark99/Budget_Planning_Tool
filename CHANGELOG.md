# Nhật ký thay đổi

Gộp theo đợt việc, mới nhất ở trên. Dự án chưa đánh số phiên bản.

---

## Đợt 4 — Kiến trúc và hạ tầng kỹ thuật · 2026-09-02 → 09-03

App vốn đã chạy đúng, nhưng hạ tầng thì trống: 0 test trong repo, không CI, không lint,
không `package.json`. Bộ kiểm của các phiên trước nằm ở `/tmp` và **đã bị xoá theo
container hai lần** — người khác clone repo về không có cách nào chạy lại được bất cứ
bảo đảm nào. Đợt này lấp khoảng cách đó.

### Lưới an toàn `94d1170`
- **125 phép kiểm** vào repo. 90 phép kiểm **thuần Node**, chạy ~1 giây, không cần
  trình duyệt: golden master, máy biểu thức FX, các Pages Function. 35 phép kiểm e2e
  chạy Chromium thật trên máy chủ mô phỏng Pages.
- **Golden master** thay cho phép so với bản gốc 1,1 MB: `golden-result.json` (chuỗi
  canonical của `ENGINE.run()`) và `golden-export.json` (từng ô của file Excel xuất ra,
  dạng JSON đọc được trong diff).
- **Ba cổng chất lượng** trong `tools/` vào `npm test` — cả ba đều đã bắt lỗi thật:
  `check-undefined` bắt `render is not defined`; `check-content-keys` bắt 6 khoá
  `role.*` thiếu khiến giao diện hiện `role.attr` thay vì "Thuộc tính";
  `check-hardcoded-vi` canh 40 chuỗi giao thức.
- `pages-host.mjs` vào repo: nó tái hiện `html_handling = auto-trailing-slash` —
  chính hành vi đã gây vòng lặp chuyển hướng trên production.
- `package.json` · `eslint.config.js` · `.editorconfig` · `jsconfig.json` ·
  CI GitHub Actions chạy `lint → typecheck → checks → unit → e2e`.

### Tách module `578fef3` `cf385fd`
- Mã nguồn sang `public/src/` theo tầng: `core/` → `platform/` → `ui/` → `views/`.
- `formula.js` (1.115 dòng) tách đôi ở đúng chỗ nó vốn là hai thứ khác nhau:
  `core/expression.js` (FX — máy biểu thức, không biết gì về ngân sách) và
  `core/engine.js` (ENGINE — nghiệp vụ).
- `t()`/`loadContent` tách khỏi `state.js` thành `core/content.js`: state là **dữ liệu
  dự án** của người dùng, content là **ngôn ngữ** giao diện.
- `ui.js` → `dom.js` + `widgets.js`; `fx-help.js` → `formula-input.js` + `fx-help.js`.
- **Mỗi màn hình một tệp**, đúng 12 tệp trong `views/`.
- Khối import của từng tệp mới **tính lại từ chính các tên nó dùng** bằng
  `acorn-globals` chứ không chép tay — nhờ vậy 4 import chết tự rụng và hai tham chiếu
  chéo duy nhất lộ ra ngay.
- 13 tệp → 22. Golden trùng từng ký tự.

### Hiện đại hoá cú pháp `d0c46e3`
- 871 `var` → **0** (714 `const` + 147 `let`); 455 callback → arrow; 130 thuộc tính →
  object shorthand; 12 chỗ mã chết dọn sạch. 1437 cảnh báo lint → **0**.
- Làm bằng `eslint --fix`, không bằng thay thế chuỗi. ESLint từ chối đúng 45 chỗ; cả 45
  xem tay từng cái.
- Mọi luật nay ở mức `error`, không trôi ngược được.

### Kiểm kiểu `b4e30c1`
- `checkJs: true` + `tsc --noEmit` vào CI. Không thêm bước build: `.d.ts` và JSDoc chỉ
  là chú thích, không nạp, không deploy.
- `public/src/types.d.ts` khai các hình đi qua ranh giới module: `ProjectState` (S),
  `BudgetResult` (RESULT), `FxCtx`, `FxCompiled`, `SharedRecord`, `FxRef`, `PreviewRow`.
- **Sửa lỗi:** mảng token trong `tokenize()` đặt tên `t`, che mất hàm dịch `t()` import
  ở đầu tệp — nên **mọi** lỗi cú pháp công thức báo ra `"t is not a function"` thay vì
  câu tiếng Việt. Người dùng gõ thiếu một dấu ngoặc là gặp. `checkJs` tìm ra.
- 84 lỗi kiểu ban đầu về 0, không một `@ts-ignore` nào.

### Tài liệu
`docs/architecture.md` · `CONTRIBUTING.md` · `CHANGELOG.md`.

---

## Đợt 3 — Tab % trích, thống nhất giao diện · `9029c92` · 2026-08-29

- **Tab mới "% trích"**: mỗi Formula Code chọn một cột phân loại, khai % cho từng giá
  trị của cột đó × 12 tháng. % nhân vào ở bước cuối, cùng chỗ với hệ số định biên.
  Chưa khai = 100%, nên để trống thì kết quả không đổi. Có tải mẫu và nhập từ Excel.
- Tiêu đề bảng dùng chung một font, một cỡ, một kiểu.
- Hộp gợi ý chèn cột: cỡ vừa (trần 260px) + thanh trượt nội bộ ở mọi màn; ở màn Công
  thức chi phí dời sang cột trái, dưới danh sách Formula Code.

## Đợt 2 — Công thức dùng chung · `ac5a069` · 2026-08-28

- **Công thức dùng chung**: biểu thức đặt tên, gọi được bằng tên gọi `LUONG_CO_BAN`
  hoặc bằng diễn giải `[Lương cơ bản]`. Tham chiếu vòng ra `#CIRC!` chứ không treo.
- **Tăng lương áp được cho công thức dùng chung** — mọi công thức gọi tới nó đều ăn theo.
- Bảng **đối chiếu "Thông tin dùng trong công thức"** ở màn thử một dòng: liệt kê đủ 4
  loại tham chiếu (cột, tham số, biến tháng, công thức dùng chung).
- Bảng nhiều cột **cuộn ngang** thay vì bẻ chữ; hộp gợi ý dính theo màn hình.

## Đợt 1 — Dựng lại trên Cloudflare Pages · 2026-08-28

- `c96f261` **Backend xác thực thật**: cookie phiên ký HMAC-SHA256 bằng WebCrypto,
  `HttpOnly; Secure; SameSite=Strict`, không `Max-Age` (mất khi đóng trình duyệt).
  `_middleware.js` chặn mọi request tĩnh khi chưa có phiên.
- `3675c50` **Bỏ hẳn cơ chế cũ**: app vốn tải mật khẩu từ một file công khai trên GitHub
  rồi so khớp ngay trong trình duyệt, và nhớ hash trong `localStorage` để vào offline
  vĩnh viễn.

  > ⚠️ File `pass` cũ vẫn nằm trong lịch sử Git công khai. `git rm` không xoá được khỏi
  > lịch sử — coi mật khẩu cũ là **đã lộ** và đặt `APP_PASSWORD` **mới**.

- `36cf477` **Tách một-file thành module ESM**: 4.775 dòng HTML/CSS/JS trong một tệp
  1,1 MB → `index.html` + `styles.css` + module. Không đổi một bước tính nào.
- `cdd7662` **560 chuỗi tiếng Việt** sang `content.md`, gọi qua `t(key)`.
- `b41cce5` **Sửa vòng lặp chuyển hướng vô hạn**: Pages đặt
  `html_handling = "auto-trailing-slash"` nên `/login.html` bị 308 về `/login`;
  `PUBLIC_PATHS` phải mở **cả hai** dạng. Safari báo "Too many redirects".
- `1bd4f71` SheetJS 0.18.5 + XLTABLE vào `public/vendor/`, nguyên xi.
- `d243178` README: cấu trúc, hướng dẫn deploy Wrangler, sai lệch có chủ ý so với brief.
