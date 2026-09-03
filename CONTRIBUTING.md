# Góp mã vào dự án

```bash
npm ci             # cài công cụ; app không có dependency lúc chạy nào
npm run verify     # lint + typecheck + 3 cổng chất lượng + 125 phép kiểm
```

`npm run verify` là **đúng thứ CI chạy, đúng thứ tự đó**. Xanh ở máy thì xanh ở CI.

Đọc [`docs/architecture.md`](docs/architecture.md) trước khi đụng vào `public/src/` —
nó nói vì sao các mảnh xếp như vậy, và những cái bẫy đã thật sự làm hỏng production.

---

## Ba mốc không được phép đổi

Đây là thứ cho phép xáo trộn 5.000 dòng mà vẫn chứng minh được số liệu không đổi.

| Mốc | Tệp | Ý nghĩa |
|---|---|---|
| Chuỗi canonical của `ENGINE.run()` | `test/fixtures/golden-result.json` | tổng năm, 12 tổng tháng, mảng người×tháng, pivot, cảnh báo — trùng **từng ký tự** |
| File Excel xuất ra | `test/fixtures/golden-export.json` | 5 sheet, ~5.000 ô, khớp tất cả **trừ ô `BanKhaiBao!E2`** (giờ xuất) |
| Checklist bảo mật mục 11 của brief | `test/unit/auth.test.js`, `test/e2e/auth.test.js` | 10 mục |

### Khi golden lệch

**Golden lệch nghĩa là số liệu đã đổi.** Trước khi làm bất cứ điều gì khác, trả lời:
*mình có định đổi số không?*

- **Không định** → vừa gây ra hồi quy. Đọc diff, sửa mã, **đừng sinh lại golden**.
- **Có định** → `node tools/regen-golden.mjs`, rồi **soi diff trong pull request** và
  giải thích trong phần mô tả vì sao số đổi. Diff ở dạng JSON đọc được chính là để
  người review nhìn thấy điều đó.

Sinh lại golden là hành động **có chủ ý**, không phải cách làm cho CI xanh.

---

## Vùng cấm

**`public/vendor/**`** — SheetJS 0.18.5 và XLTABLE giữ **nguyên xi**. Nằm ngoài
lint / format / kiểm kiểu. Không format lại, không "dọn dẹp", không nâng cấp kèm theo
một thay đổi khác.

**40 chuỗi tiếng Việt trong mã** — không phải text giao diện mà là **giao thức**: tên
cột file `.xlsx` mẫu, danh sách nhận diện header khi nhập, giá trị mồi ghi vào `.json`
của người dùng. Dịch hay sửa là hỏng chức năng. `tools/check-hardcoded-vi.mjs` giữ danh
sách miễn trừ; thêm chuỗi mới vào đó **phải kèm lý do**.

**`functions/`** — Pages bắt buộc ở gốc repo, không chuyển vào `src/`.

**Bước build** — xem mục 5 của `docs/architecture.md`. Không đưa vào bất cứ thứ gì bắt
buộc phải biên dịch trước khi deploy.

---

## Quy ước mã

Lint sạch 100%, mọi luật ở mức `error`. `npm run lint:fix` sửa được phần lớn.

| | |
|---|---|
| `const` mặc định, `let` khi thật sự gán lại | không còn `var` nào |
| Callback dùng arrow | codebase không dùng `this` ở bất kỳ đâu |
| `_` mở đầu = **cố tình** không dùng | `guessRole(name, _values)` giữ chữ ký cho khớp `guessType()` |
| `catch {}` khi không cần đối tượng lỗi | |
| Chú thích nói **vì sao**, không nói **cái gì** | mã đã nói cái gì rồi |

Kiểu: JSDoc ở **ranh giới module** (hàm export) và các hình dữ liệu chính. Hình dùng
chung nhiều tệp thì khai trong `public/src/types.d.ts`.

**Không dùng `@ts-ignore`.** Chỗ nào chỉ im được bằng nó thì đó là dấu hiệu **khai kiểu
sai** — sửa khai kiểu. Và sửa **tại gốc**: chú thích nơi khai báo biến tích luỹ, đừng
rắc ép kiểu lên từng chỗ dùng.

---

## Thêm một màn hình

1. `public/src/views/<tên>.js`, export một hàm `view<Tên>()` trả về DOM.
2. Thêm một mục vào `VIEWS` trong `public/src/app.js` — `title`/`sub`/`t` là **khoá**
   nội dung, không phải chuỗi. Xem bẫy `t()` ở mục 4 của `docs/architecture.md`.
3. Thêm khoá vào `public/content.md`.
4. Không import màn hình khác. Cần dùng lại thì tách hàm thuần ra và import hàm đó.
5. `npm run verify`.

## Thêm một hàm cho máy công thức

`public/src/core/expression.js`: thêm vào bảng `FUNCS` hoặc `SIMPLE`. Rồi thêm mục vào
`FX_DOCS` trong `public/src/ui/fx-help.js` — nếu không thì phần trợ giúp và gợi ý khi
gõ sẽ không biết tới nó. Kèm phép kiểm trong `test/unit/expression.test.js`.

---

## Commit và pull request

Câu đầu ở thể mệnh lệnh, tiếng Việt, nói **kết quả** chứ không nói thao tác. Thân
commit giải thích **vì sao**, và nêu **bằng chứng** cho thay đổi chạm tới số liệu
("golden trùng từng ký tự", "125/125 phép kiểm pass").

CI chạy `lint → typecheck → checks → unit → e2e` trên mọi push và pull request.
