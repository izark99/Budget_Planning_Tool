# Lập ngân sách định biên

Công cụ dựng ngân sách nhân sự từ bảng định biên, chạy trên Cloudflare Pages.

Toàn bộ **nghiệp vụ chạy trong trình duyệt** — engine công thức, tính ngân sách,
đọc/xuất Excel. Dữ liệu định biên **không bao giờ rời khỏi máy người dùng**.
Server chỉ làm đúng một việc: kiểm mật khẩu và cấp phiên.

---

## 1. Cấu trúc

```
functions/
  _middleware.js        chặn mọi request tĩnh nếu chưa có phiên hợp lệ
  api/login.js          kiểm mật khẩu, cấp cookie phiên ký HMAC-SHA256
  api/logout.js         xoá cookie
  api/session.js        heartbeat kiểm phiên còn hạn
public/
  login.html            trang đăng nhập — Pages phục vụ ở /login
  index.html            khung app
  styles.css            toàn bộ CSS
  src/
    app.js              điểm vào, dựng vỏ, giữ nhịp phiên
    core/
      content.js        t() / loadContent — text lấy từ content.md
      state.js          hằng số, trạng thái S/RESULT, lưu trữ
      expression.js     FX — máy biểu thức, không biết gì về ngân sách
      engine.js         ENGINE — nghiệp vụ tính ngân sách
    platform/
      io.js             đọc/ghi file, gọi /api/*
    ui/
      dom.js            el/esc/toast/modal/confirmBox/dải 12 tháng
      widgets.js        bảng, panel, tải mẫu .xlsx, trình nhập Excel
      formula-input.js  ô nhập công thức + hộp gợi ý chèn cột
      fx-help.js        danh mục hàm, thư viện tra cứu, gợi ý khi gõ
    views/              12 màn hình, MỖI MÀN MỘT FILE:
                        headcount · setup · classes · calendar · formula
                        exceptions · cost-map · raise · policy · accrual
                        result · dashboard
  vendor/
    xlsx.min.js         SheetJS 0.18.5 — nguyên xi, không sửa
    xltable.js          XLTABLE — nguyên xi, không sửa
  content.md            toàn bộ text tiếng Việt hiển thị
  settings.md           cấu hình không nhạy cảm
test/
  unit/                 thuần Node, không trình duyệt — golden master, FX, auth
  e2e/                  Chromium thật trên máy chủ mô phỏng Pages
  helpers/              pages-host, vỏ Playwright, bộ đọc .xlsx, canonical
  fixtures/             .xlsx mẫu + state + golden kết quả + golden file xuất
tools/
  check-content-keys.mjs   khoá t() và khoá nằm trong dữ liệu ↔ content.md
  check-undefined.mjs      tên dùng mà không import/khai báo
  check-hardcoded-vi.mjs   chuỗi tiếng Việt còn sót trong mã
  regen-golden.mjs         sinh lại fixtures (chạy có chủ ý)
.github/workflows/ci.yml
package.json              CHỈ để chạy bộ kiểm — app vẫn zero-build, xem mục 7
wrangler.toml
```

Đồ thị import **một chiều**, không có vòng:

```
core/content ← core/state ← core/expression ← core/engine
                    ↑                              ↑
              platform/io ─────────────────────────┘
                    ↑
      ui/dom ← ui/widgets ← ui/fx-help ← ui/formula-input
                                ↑
                            views/*  ←  app.js
```

`tools/check-undefined.mjs` canh chiều này: module nào quên import là lộ ra ngay.
Hai chỗ cố tình đi ngược đều qua móc gián tiếp thay vì import ngược —
`ui/dom.js: setRenderer()` (app.js cấp thân thật cho `render()`) và
`core/state.js: setNotifier()` (app.js cấp `toast`).

---

## 2. Deploy bằng Wrangler CLI

```bash
# 1. Cài Wrangler (một lần)
npm install -g wrangler

# 2. Đăng nhập Cloudflare (mở trình duyệt)
wrangler login

# 3. Tạo project Pages (chỉ lần đầu)
wrangler pages project create budget-tool --production-branch=main

# 4. Deploy — đọc pages_build_output_dir từ wrangler.toml
wrangler pages deploy
#    (dạng `wrangler pages deploy public --project-name=budget-tool` cũng chạy)

# 5. Khai secret — KHÔNG commit vào Git, KHÔNG nằm trong file nào của repo
wrangler pages secret put APP_PASSWORD --project-name=budget-tool
wrangler pages secret put JWT_SECRET   --project-name=budget-tool
```

`JWT_SECRET` nên là chuỗi ngẫu nhiên dài:

```bash
openssl rand -base64 32
```

`SESSION_MINUTES` là biến thường (không phải secret), đặt ở
**Cloudflare dashboard › Workers & Pages › budget-tool › Settings › Variables and Secrets**.
Không đặt thì mặc định 30 phút.

### Đổi mật khẩu về sau

```bash
wrangler pages secret put APP_PASSWORD --project-name=budget-tool
```

Có hiệu lực ngay, **không cần deploy lại**. Đổi `JWT_SECRET` thì mọi phiên đang
hoạt động bị vô hiệu lập tức — dùng khi cần "đăng xuất toàn bộ" khẩn cấp.

### Chạy thử tại máy

```bash
cp .dev.vars.example .dev.vars     # rồi sửa giá trị bên trong
npm run dev                        # = npx wrangler pages dev
```

`.dev.vars` nằm trong `.gitignore`.

Nếu `wrangler pages dev` không chạy được (workerd kén môi trường), dùng máy chủ
mô phỏng của bộ kiểm — nó nạp **chính** các tệp trong `functions/`:

```bash
npm run dev:host                   # http://127.0.0.1:8788
```

---

## 3. Cơ chế xác thực

| | |
|---|---|
| Mật khẩu thật | Biến môi trường `APP_PASSWORD` trên Cloudflare. Không bao giờ xuống trình duyệt. |
| Phiên | Cookie `session` chứa payload `{iat, exp}` ký HMAC-SHA256 bằng `JWT_SECRET`. |
| Cờ cookie | `HttpOnly` · `Secure` · `SameSite=Strict` · **không** `Max-Age` |
| Hết hạn | `SESSION_MINUTES` phút. `app.js` gọi `/api/session` mỗi 60 giây; gặp 401 thì tự chuyển về `/login`. |
| Chặn tĩnh | `_middleware.js` chặn **mọi** đường dẫn trừ `/login`, `/login.html` và `/api/login`. |
| Cache | Mọi phản hồi đã xác thực đều mang `Cache-Control: no-store`. |

Không `Max-Age` nghĩa là cookie chết khi đóng hẳn trình duyệt — **không có đường
lùi offline**, đúng mục tiêu của thiết kế.

---

## 4. Công thức dùng chung

Khai ở **Thiết lập › Công thức dùng chung**: đặt tên cho một biểu thức rồi gọi lại
ở nhiều công thức chi phí.

```
LUONG_CO_BAN   ROUND([Coefficient]*LUONG_CO_SO,-3)

FC_BHXH  =  LUONG_CO_BAN * TY_LE_BHXH_CTY%
FC_TET   =  LUONG_CO_BAN * 2
```

Gọi được bằng **tên gọi** (`LUONG_CO_BAN`) hoặc bằng **diễn giải trong ngoặc vuông**
(`[Lương cơ bản]`) — cả hai ra cùng một giá trị.

Khác `tham số` ở chỗ tham số là một con số cố định, còn đây là biểu thức tính theo
**từng dòng × từng tháng**. Gọi được cả cột định biên, tham số, biến tháng và công
thức dùng chung khác. Tham chiếu vòng tròn trả về `#CIRC!` chứ không treo máy.

**Không tự làm tròn** sau khi áp tăng lương — một biểu thức đặt tên có thể là hệ số
hay tỷ lệ chứ không riêng tiền. Cần tròn thì viết `ROUND()` trong công thức chi phí.

### Tăng lương áp cho công thức dùng chung

Ở **Tăng lương › Áp cho công thức dùng chung**: chọn đích danh một công thức dùng
chung thì **mọi công thức chi phí gọi tới nó đều ăn theo** — khai một chỗ, áp toàn bộ.

> ⚠️ Đừng chọn kèm cả công thức chi phí đang dùng nó, kẻo một đợt tăng bị tính hai
> lần. Danh sách để trống vẫn giữ nghĩa cũ là "mọi công thức chi phí" và **không**
> đụng tới công thức dùng chung, đúng như trước.

### % trích theo phân loại

Màn **% trích**: mỗi Formula Code chọn **một cột phân loại** — bất kỳ cột nào dùng
được (cột gốc của bảng định biên, cột do Phân loại nhóm sinh ra, cột do Chính sách
sinh ra) — rồi khai % cho từng giá trị của cột đó × 12 tháng.

```
FC_LUONG_HESO   cột phân loại: Dept
                        T01  T02 ... T07  T08 ... T12
   AC                   100  100 ...  50   50 ...  50
   SL                   100  100 ... 100  100 ... 100
```

Vị trí trong chuỗi tính:

```
công thức gốc → tăng lương → tờ trình ngoại lệ → × % trích × hệ số định biên → vào ngân sách
```

Ô để trống, giá trị chưa khai, hay Formula Code chưa chọn cột — tất cả đều tính là
**100%**. Bỏ trống cả màn thì kết quả không đổi một đồng, và file dự án cũ mở lên
vẫn ra đúng số cũ.

Có **Tải mẫu Excel** / **Nhập từ Excel** để khai nhanh. Cột file mẫu:
`Formula Code · Cot Phan Loai · Gia Tri · T01…T12`. Dòng nào có Formula Code không
khớp mã đã khai sẽ bị bỏ qua và báo số lượng.

Bảng **Thử trên một dòng thật** có thêm hàng `% trích` để đối chiếu.

---

## 5. Sửa chữ trên giao diện

Sửa `public/content.md` rồi deploy lại. Định dạng `khoá: giá trị`, một dòng một
khoá, bỏ qua dòng trống và dòng bắt đầu bằng `#`. `{ten}` là chỗ điền.

> ⚠️ Một số chuỗi tiếng Việt **cố ý ở lại trong code**, không nằm trong `content.md`:
> tên cột của file Excel mẫu, danh sách nhận diện header khi nhập file, và giá trị
> mồi được ghi vào file dự án `.json`. Đổi chúng là hỏng chức năng nhập file.
> Mỗi chỗ như vậy đều có comment `CHUỖI GIAO THỨC` hoặc `GIÁ TRỊ MỒI` ngay bên cạnh.

---

## 6. Sai lệch có chủ đích so với brief

Một chỗ duy nhất, ở cuối `functions/_middleware.js`. Brief mục 2 viết:

```js
return new Response(response.body, { ...response, headers: newHeaders });
```

`Response` phơi `status`/`statusText` qua **getter trên prototype**, nên
`{ ...response }` cho ra object rỗng và mọi phản hồi tĩnh bị ép về `200` — kể cả
`404`. Bản này viết tường minh:

```js
return new Response(response.body, {
  status: response.status,
  statusText: response.statusText,
  headers: newHeaders,
});
```

Mọi phần còn lại của `functions/` bám đúng code mẫu trong brief.

---

## 7. Bộ kiểm

```bash
npm ci                 # cài công cụ (chỉ devDependencies — app không có dependency)

npm test               # 87 phép kiểm đơn vị, thuần Node, ~1 giây
npm run lint           # ESLint (bỏ qua public/vendor/**)
npm run typecheck      # tsc --noEmit với checkJs BẬT — đọc JSDoc, không sinh tệp nào
npm run checks         # ba cổng chất lượng trong tools/
npm run test:e2e       # 35 phép kiểm Chromium thật, ~70 giây
npm run verify         # tất cả những thứ trên, đúng thứ tự CI chạy
```

`npm test` **không cần trình duyệt**: `core/state.js` và `core/engine.js` chỉ chạm
`localStorage`/`window` bên trong thân hàm nên nạp thẳng vào Node được. Nhờ vậy
mốc quan trọng nhất — golden master — chạy trong mili-giây.

Kiểm kiểu **không thêm bước build**: `tsc --noEmit` chỉ đọc JSDoc cùng các hình dữ
liệu khai trong `public/src/types.d.ts` (`ProjectState`, `BudgetResult`, `FxCtx`,
`PreviewRow`…) rồi báo lỗi. Tệp `.d.ts` không được nạp, không được deploy. Nó đã tìm
ra một lỗi thật: mảng token trong `tokenize()` trùng tên với hàm dịch `t()`, khiến
mọi lỗi cú pháp công thức báo `"t is not a function"` thay vì câu tiếng Việt.

**Ba mốc không được phép đổi:**

| Mốc | Ở đâu | Ý nghĩa |
|---|---|---|
| Chuỗi canonical của `ENGINE.run()` | `test/fixtures/golden-result.json` | tổng năm, 12 tổng tháng, mảng người×tháng, pivot, cảnh báo — trùng **từng ký tự** |
| File Excel xuất ra | `test/fixtures/golden-export.json` | 5 sheet, ~5.000 ô, khớp tất cả **trừ ô `BanKhaiBao!E2`** (giờ xuất) |
| Checklist mục 11 của brief | `test/unit/auth.test.js` + `test/e2e/auth.test.js` | 10 mục bảo mật |

Golden lệch nghĩa là **số liệu đã đổi**. Nếu đó là chủ ý, chạy
`node tools/regen-golden.mjs` rồi soi diff trong pull request — diff ở dạng JSON
đọc được, không phải tệp nhị phân.

`test/helpers/pages-host.mjs` dựng lại hợp đồng của Pages Functions bằng **chính
các tệp trong `functions/`, không sửa một ký tự** — kể cả
`html_handling = "auto-trailing-slash"`, thứ đã gây vòng lặp chuyển hướng thật
trên production (xem mục 8).

Ba script trong `tools/` không phải trang trí: `check-undefined` đã bắt lỗi
`render is not defined` sau một lần đổi tên hàm, `check-content-keys` đã bắt 6
khoá `role.*` thiếu khiến giao diện hiện `role.attr` thay vì "Thuộc tính".

---

## 8. Xử lý sự cố

### Build hỏng: `Could not read package.json`

```
Executing user command: npm run build
npm error enoent Could not read package.json
Failed: build command exited with code: 1
```

Project Pages đang có **build command** trong khi app này **không cần build**.
Vào **Settings › Build**, **để trống ô Build command**, rồi **Retry deployment**.
Bỏ build command không ảnh hưởng `functions/`: Pages biên dịch thư mục đó ở bước
riêng.

> ⚠️ **`package.json` ở gốc repo có thể khiến Pages tự đoán ra framework và đặt
> lại build command** — đúng lỗi trên. Tệp đó có mặt **chỉ để chạy bộ kiểm**
> (`vitest`, `eslint`, `playwright` đều là `devDependencies`); nó **không dựng ra
> thứ gì** và `wrangler.toml` vẫn trỏ thẳng `pages_build_output_dir = "public"`.
> Sau mỗi lần đụng tới `package.json`, mở lại **Settings › Build** và xác nhận ô
> **Build command vẫn để trống**.

### Mở trang báo "Too many redirects"

Pages đặt [`html_handling = "auto-trailing-slash"`](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/)
theo mặc định: `/login.html` **bị 308 về `/login`**. Nếu `PUBLIC_PATHS` trong
`_middleware.js` chỉ mở `/login.html` thì thành vòng lặp vô hạn:

```
/  →302→  /login.html  →308→  /login  →302→  /login.html  →308→ …
```

Vì vậy `PUBLIC_PATHS` phải mở **cả hai dạng**, và middleware chuyển hướng thẳng tới
`/login` cho khỏi tốn thêm một chặng:

```js
const PUBLIC_PATHS = ["/login", "/login.html", "/api/login"];
```

Quy tắc chung: mọi trang `.html` cần công khai đều phải khai **cả hai** dạng đường dẫn.

### Đăng nhập đúng mật khẩu nhưng vẫn quay về trang đăng nhập

Chưa khai `JWT_SECRET`, hoặc vừa đổi nó (đổi `JWT_SECRET` làm mọi phiên đang chạy
mất hiệu lực ngay). Kiểm ở **Settings › Variables and Secrets**.

### Không ai đăng nhập được, luôn báo sai mật khẩu

Chưa khai `APP_PASSWORD`. `login.js` so với chuỗi rỗng nên từ chối mọi mật khẩu.

---

## 9. Lịch sử

App vốn là một file HTML 1,1 MB dùng cơ chế xác thực giả: tải mật khẩu từ một
file công khai trên GitHub rồi so khớp ngay trong trình duyệt, và nhớ hash trong
`localStorage` để vào offline vĩnh viễn. Cơ chế đó đã bị **gỡ bỏ hoàn toàn**.

> ⚠️ File `pass` cũ đã nằm trong lịch sử Git công khai. `git rm` không xoá được
> khỏi lịch sử — hãy coi mật khẩu cũ là **đã lộ** và đặt `APP_PASSWORD` mới.
