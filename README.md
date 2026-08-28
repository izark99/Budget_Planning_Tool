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
  login.html            trang đăng nhập — đường dẫn công khai duy nhất
  index.html            khung app
  styles.css            toàn bộ CSS
  app.js                điểm vào, dựng vỏ, giữ nhịp phiên
  modules/
    state.js            hằng số, trạng thái S/RESULT, lưu trữ, t()
    formula.js          FX (máy công thức) + ENGINE (máy tính ngân sách)
    io.js               đọc/ghi file, gọi /api/*
    ui.js               el/toast/modal/bảng/panel — không biết màn hình cụ thể
    views/              11 màn hình, mỗi nhóm một file
  vendor/
    xlsx.min.js         SheetJS 0.18.5 — nguyên xi, không sửa
    xltable.js          XLTABLE — nguyên xi, không sửa
  content.md            toàn bộ text tiếng Việt hiển thị
  settings.md           cấu hình không nhạy cảm
wrangler.toml
```

Đồ thị import một chiều: `state ← formula ← io ← ui ← views/* ← app`.

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
npx wrangler pages dev
```

`.dev.vars` nằm trong `.gitignore`.

---

## 3. Cơ chế xác thực

| | |
|---|---|
| Mật khẩu thật | Biến môi trường `APP_PASSWORD` trên Cloudflare. Không bao giờ xuống trình duyệt. |
| Phiên | Cookie `session` chứa payload `{iat, exp}` ký HMAC-SHA256 bằng `JWT_SECRET`. |
| Cờ cookie | `HttpOnly` · `Secure` · `SameSite=Strict` · **không** `Max-Age` |
| Hết hạn | `SESSION_MINUTES` phút. `app.js` gọi `/api/session` mỗi 60 giây; gặp 401 thì tự chuyển về `/login.html`. |
| Chặn tĩnh | `_middleware.js` chặn **mọi** đường dẫn trừ `/login.html` và `/api/login`. |
| Cache | Mọi phản hồi đã xác thực đều mang `Cache-Control: no-store`. |

Không `Max-Age` nghĩa là cookie chết khi đóng hẳn trình duyệt — **không có đường
lùi offline**, đúng mục tiêu của thiết kế.

---

## 4. Sửa chữ trên giao diện

Sửa `public/content.md` rồi deploy lại. Định dạng `khoá: giá trị`, một dòng một
khoá, bỏ qua dòng trống và dòng bắt đầu bằng `#`. `{ten}` là chỗ điền.

> ⚠️ Một số chuỗi tiếng Việt **cố ý ở lại trong code**, không nằm trong `content.md`:
> tên cột của file Excel mẫu, danh sách nhận diện header khi nhập file, và giá trị
> mồi được ghi vào file dự án `.json`. Đổi chúng là hỏng chức năng nhập file.
> Mỗi chỗ như vậy đều có comment `CHUỖI GIAO THỨC` hoặc `GIÁ TRỊ MỒI` ngay bên cạnh.

---

## 5. Sai lệch có chủ đích so với brief

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

## 6. Lịch sử

App vốn là một file HTML 1,1 MB dùng cơ chế xác thực giả: tải mật khẩu từ một
file công khai trên GitHub rồi so khớp ngay trong trình duyệt, và nhớ hash trong
`localStorage` để vào offline vĩnh viễn. Cơ chế đó đã bị **gỡ bỏ hoàn toàn**.

> ⚠️ File `pass` cũ đã nằm trong lịch sử Git công khai. `git rm` không xoá được
> khỏi lịch sử — hãy coi mật khẩu cũ là **đã lộ** và đặt `APP_PASSWORD` mới.
