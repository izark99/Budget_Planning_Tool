# Kiến trúc

Tài liệu này nói những thứ **không suy ra được từ mã**: vì sao các mảnh xếp như vậy,
và những cái bẫy đã thật sự làm hỏng production.

Đọc mã để biết *cái gì*; đọc đây để biết *tại sao*.

---

## 1. Toàn cảnh

Đây là app **chạy hoàn toàn trong trình duyệt**. Máy chủ chỉ làm đúng một việc: kiểm
mật khẩu và cấp phiên. Bảng định biên — dữ liệu nhân sự nhạy cảm nhất của công ty —
**không bao giờ rời khỏi máy người dùng**: đọc `.xlsx` bằng SheetJS ngay trong tab,
tính bằng JS ngay trong tab, xuất `.xlsx` ngay trong tab.

```
Trình duyệt                              Cloudflare
┌──────────────────────────────┐        ┌────────────────────────┐
│ public/src/**  toàn bộ nghiệp │        │ functions/_middleware  │
│ vụ: đọc Excel, tính ngân sách │◄──────►│ chặn mọi request tĩnh  │
│ xuất Excel, lưu .json         │ cookie │ nếu chưa có phiên      │
│                               │        │ functions/api/login    │
│ localStorage: bản nháp đang   │        │ ký cookie HMAC-SHA256  │
│ làm dở (không gửi đi đâu)     │        └────────────────────────┘
└──────────────────────────────┘
```

Hệ quả kiến trúc: **không có API dữ liệu**. Không có endpoint nào nhận hay trả số liệu
ngân sách. Thêm một cái là phá vỡ tính chất trên — cân nhắc rất kỹ.

---

## 2. Đồ thị module — một chiều, không vòng

```
core/content ─────► core/state ─────► core/expression ─────► core/engine
                         │                    core/external ──────►▲
                         └──────────► platform/io ────────────────┘
                                            │
        ui/dom ─────► ui/widgets            │
           │              │                 │
           └──► ui/fx-help ──► ui/formula-input
                                    │
                                 views/*  ◄──── app.js
```

Mũi tên là "được import bởi". Quy tắc: **tầng dưới không bao giờ biết tầng trên**.

- `core/` không biết gì về DOM. Nạp được thẳng vào Node — nhờ đó golden master chạy
  trong mili-giây, không cần trình duyệt.
- `core/expression.js` (FX) không biết gì về ngân sách. Nó nhận một biểu thức và một
  `ctx` rồi trả ra giá trị. Phụ thuộc duy nhất là `t()` để dịch thông báo lỗi.
- `ui/` không biết màn hình nào cả — chỉ nhận cấu hình và trả về DOM.
- `views/` mỗi màn hình một tệp. Không màn nào import màn khác, trừ hai chỗ dùng lại
  hàm thuần: `setup.js` dùng `guessRole()` của `headcount.js`, `policy.js` dùng
  `classMissCount()` của `classes.js`.

`tools/check-undefined.mjs` canh đồ thị này: module nào quên import là lộ ra ngay.
Nó đã bắt lỗi thật — `render()` đổi tên thành `shellRender()` nhưng còn 4 chỗ gọi tên
cũ, mọi nút điều hướng đều ném `ReferenceError`.

### Hai chỗ cố ý đi ngược — bằng móc, không bằng import

Màn hình cần gọi `render()` để vẽ lại vỏ app, và `state.js` cần hiện toast khi tự lưu
hỏng. Cả hai đều là chiều "dưới gọi lên". Nếu import ngược thì đồ thị có vòng. Cách
làm: **tầng dưới công bố một móc, `app.js` cắm thân thật vào lúc khởi động**.

```js
// ui/dom.js — thân rỗng, ai cũng gọi được
let _render = () => {};
function setRenderer(fn) { _render = fn; }
function render() { return _render(); }

// app.js — lúc khởi động
setRenderer(shellRender);
setNotifier(toast);        // core/state.js
```

Thêm một chỗ "dưới cần gọi lên" nữa thì dùng lại đúng khuôn này, đừng import ngược.

---

## 3. Chuỗi tính ngân sách

`ENGINE.run()` là chỗ nặng nhất trong app. Thứ tự các bước **có ý nghĩa** — đổi chỗ là
đổi số:

```
1. Định biên          S.hc.rows — mỗi người một dòng, 12 cột hệ số tháng
2. Cột nhóm dẫn xuất  S.classes sinh cột mới từ tổ hợp giá trị các cột có sẵn;
                      bảng sau dùng được kết quả của bảng trước
3. Chính sách         S.policies sinh thêm cột giá trị theo phân loại
4. Công thức theo nhóm mỗi Formula Code có N quy tắc; quy tắc ĐẦU TIÊN có điều
                      kiện khớp sẽ thắng — thứ tự quy tắc là ngữ nghĩa
5. Tăng lương         nhân (1 + pct/100) từ tháng `fromMonth`; áp cho Formula Code
                      HOẶC cho công thức dùng chung (khi đó mọi công thức gọi tới
                      nó đều ăn theo)
6. Tờ trình ngoại lệ  ghi đè số tiền cho từng người / từng tháng
7. Phân bổ tháng      mode 'spread' chia đều cho các tháng đã chọn; 'monthly' giữ
                      nguyên mỗi tháng
8. Hệ số định biên    nhân với hệ số tháng của người đó (0 = chưa vào làm, 0.5 =
                      nửa tháng)
9. % trích            nhân tiếp hệ số của tab % trích, theo phân loại × tháng
10. Làm tròn          Math.round MỘT LẦN, ở bước cuối cùng
11. Năm tầng mã       Formula Code → Cost Code · Đơn vị → Cost Center · Đơn vị → Division
                      · (Cost Code + Đơn vị) → Budget Code
                      · (Cost Code + Cost Center + Budget Code) → Account Code
12. Ngoài định biên   S.external — tiền tính sẵn ở ngoài, tự mang đủ năm mã và 12
                      tháng. KHÔNG đi qua mười một bước trên; chỉ được gắn kèm kết
                      quả ở `RESULT.external`
```

### Ngân sách ngoài định biên đứng NGOÀI năm trường số của máy tính

`RESULT.external` cố ý **không** cộng vào `grand`, `monthTotals`, `totalsByFc`, `data`,
`pivot`. Ba lý do, theo thứ tự quan trọng:

1. Hai bất biến `grand === Σ totalsByFc` và `monthTotals[m] === Σ data[..][..*12+m]` là
   thứ tám nơi trong app đang dựa vào. Chân bảng "Theo Formula Code" ở `views/result.js`
   lấy `monthTotals` trong khi thân bảng cộng từ `data` — gộp vào là chân lệch thân ngay,
   không có gì báo.
2. `views/result.js` chia tỷ lệ ảnh hưởng tăng lương cho `grand`; Dashboard chia cho
   `personMonths`. Gộp vào mẫu số là mọi phần trăm co lại trong im lặng.
3. `raiseSlice()` so `cur.grand - prev.grand` giữa các lượt tính.

Đổi lại, số cộng chung **chỉ được lấy qua ba hàm** của `core/external.js` —
`grandAll()`, `monthTotalsAll()`, `pivotAll()`. Không nơi nào tự viết
`R.grand + R.external.grand`: có tên gọi thì `grep -rn grandAll public/src` liệt kê được
đủ mọi chỗ cộng chung, cộng tay thì không.

Cái giá phải trả nằm ở bộ kiểm: `canon()` đọc đúng năm trường bị chừa ra, nên golden cũ
**vĩnh viễn mù** với một hồi quy của phần ngoài định biên. Bù bằng mốc thứ hai —
`canonExt()` + `state-external.json` + `golden-external.json`, sinh lại bằng
`node tools/regen-golden.mjs --ext`.

Nguyên tắc gộp ở mọi màn hình, một câu: **ở đâu app cắt theo thứ những dòng này CÓ**
(tháng, Cost Code, Division, Budget Code, Cost Center, Account Code) **thì chúng tham gia
bình thường; ở đâu app cắt theo thứ chúng KHÔNG có** (cột phân loại nhân sự, Formula Code,
bình quân đầu người) **thì chúng rơi vào một ô "(ngoài định biên)" hiện rõ, chứ không biến
mất.** Nhờ vế sau, gộp chiều nào tổng cũng vẫn cộng đúng.

Hai điểm dễ sai:

**Làm tròn đúng một lần, ở cuối.** `Math.round(val * alloc * hcf * accrualFactor(...))`.
Cộng các số đã tròn rồi so với tròn của tổng sẽ lệch — nên khi so sánh trong phép kiểm,
so **giá trị thô từng dòng**, đừng so tổng.

**Nhớ kết quả qua 12 tháng.** Nếu biểu thức không phụ thuộc tháng thì ENGINE tính một
lần rồi dùng lại cho cả 12 tháng. `FX.compile().info.monthDependent` quyết định điều
này, và `buildShared()` phải **lan truyền** nó qua đồ thị tham chiếu: công thức dùng
chung A gọi B, B phụ thuộc tháng ⇒ A cũng phụ thuộc tháng. Bỏ bước lan truyền là số
liệu sai âm thầm — đúng, sai *âm thầm*, không lỗi, không cảnh báo.

### Công thức dùng chung

Biểu thức đặt tên, gọi được từ mọi công thức chi phí theo **hai cách tương đương**:
bằng tên gọi `LUONG_CO_BAN`, hoặc bằng diễn giải `[Lương cơ bản]`. Sổ đăng ký ghi cả
hai khoá trỏ về **cùng một bản ghi**, nên hai cách luôn ra cùng con số.

Tham chiếu vòng (A gọi B, B gọi A) trả về `#CIRC!` chứ không tràn ngăn xếp — chặn bằng
một ngăn xếp tên trong `ctx.__shStack`.

---

## 4. Cơ chế `t()` — và cái bẫy của nó

Toàn bộ text tiếng Việt sống ở `public/content.md`, dạng `khoá: giá trị`, tách ở dấu
`:` **đầu tiên**. Mã gọi `t('toast.import.rows', { n: 128 })`.

Thiếu khoá thì `t()` trả về **chính khoá** — để lỗi hiện ngay trên giao diện thay vì im
lặng hiện rỗng.

> ### ⚠️ Bẫy: `content.md` nạp BẤT ĐỒNG BỘ, sau khi module đã chạy xong
>
> Cấu trúc dữ liệu dựng **lúc nạp module** — `ROLES`, `VIEWS`, `FX_DOCS`, `STAT_DEFS` —
> chạy TRƯỚC khi `content.md` về. Gọi `t()` ngay lúc khai báo thì được chuỗi rỗng.
>
> **Cách đúng:** giữ **khoá** trong dữ liệu, gọi `t(khoá)` lúc **render**.
>
> ```js
> const ROLES = [{ v: 'attr', t: 'role.attr' }];   // giữ khoá
> el('option', { text: t(r.t) })                    // dịch lúc render
> ```
>
> Đã dính thật: giao diện production hiện `role.attr` thay vì "Thuộc tính".
> `tools/check-content-keys.mjs` nay quét cả khoá **nằm trong dữ liệu**, không chỉ khoá
> trong lời gọi `t('...')` tĩnh.

Hai cái bẫy nhỏ hơn, đều đã có cổng chặn:

- **Khoảng trắng đầu/cuối giá trị** bị `.trim()` ăn mất. Cần dấu cách thì đưa vào mã,
  giữ `content.md` sạch.
- **Đặt tên biến trùng `t`** che mất hàm dịch. Đã dính: mảng token trong `tokenize()`
  tên là `t`, khiến mọi lỗi cú pháp báo `"t is not a function"`. `checkJs` tìm ra.

### 40 chuỗi tiếng Việt CỐ Ý nằm trong mã

Không phải text giao diện mà là **giao thức**, dịch là hỏng chức năng:

| Nhóm | Ví dụ | Vì sao phải giữ |
|---|---|---|
| Tên cột file `.xlsx` mẫu | `Tên Cost Code`, `Diễn giải` | Là khoá khớp khi nhập lại |
| Danh sách nhận diện header | `mã nv`, `bộ phận` | So khớp tên cột file người dùng tải lên |
| Giá trị mồi ghi vào state | `Nhóm mới`, `Tất cả` | Đi thẳng vào file `.json` của người dùng |
| Tên dòng bảng ngày công | `Ngày công chuẩn` | Vừa là nhãn vừa là tên cột Excel |

`tools/check-hardcoded-vi.mjs` giữ danh sách miễn trừ **theo giá trị chuỗi** (để còn
đúng sau khi đổi tên tệp) và báo cả mục **đã lỗi thời** — không cho danh sách phình ra.

---

## 5. Vì sao zero-build

Pages phục vụ thẳng `public/`. Không bundler, không transpile, không bước dựng.

Lý do rất cụ thể: lần deploy đầu **hỏng** vì project Pages có build command trong khi
repo thuần tĩnh — `npm error Could not read package.json`. Từ đó ràng buộc là: không
đưa vào bất cứ thứ gì bắt buộc phải biên dịch trước khi deploy.

Điều này định hình mọi lựa chọn công cụ:

| Muốn có | Cách làm ở đây | Vì sao không dùng cách thường gặp |
|---|---|---|
| Module hoá | ESM gốc của trình duyệt | bundler cần bước build |
| Kiểm kiểu | JSDoc + `tsc --noEmit` | TypeScript cần biên dịch |
| Kiểu dùng chung | `public/src/types.d.ts` | `.d.ts` chỉ có kiểu, không nạp lúc chạy |
| SheetJS / XLTABLE | thẻ `<script>`, đặt lên `window` | npm import cần bundler |

> ### ⚠️ `package.json` ở gốc repo
> Nó **chỉ để chạy bộ kiểm** — mọi thứ đều là `devDependencies`, app không có một
> dependency lúc chạy nào. Nhưng sự có mặt của nó có thể khiến Pages **tự đoán ra
> framework và đặt lại build command**. Sau mỗi lần đụng tới nó, kiểm lại
> **Settings › Build command vẫn để trống**.

### Ràng buộc riêng của ESM

ESM không cho gán lại một binding đã import. Nên `S` và `RESULT` — hai thứ *phải* thay
được — đi qua setter:

```js
import { S, setS } from './core/state.js';
S.hc.rows.push(x);        // ĐỌC và sửa sâu: viết thẳng, nhờ live binding
setS(stateMoi);           // GÁN LẠI: bắt buộc qua setter
```

---

## 6. Xác thực

Cookie phiên ký HMAC-SHA256 bằng WebCrypto. `HttpOnly; Secure; SameSite=Strict`, và
**không có `Max-Age`** — cookie phiên, tự mất khi đóng hẳn trình duyệt.

Hai chi tiết không hiển nhiên, cả hai đã trả giá bằng sự cố thật:

**`html_handling = "auto-trailing-slash"`.** Pages phục vụ `login.html` ở `/login`, và
**308 chuyển hướng** `/login.html` → `/login`. Nếu `PUBLIC_PATHS` chỉ mở `/login.html`
thì thành vòng lặp vô hạn: `/` →302→ `/login.html` →308→ `/login` →302→ … Safari báo
"Too many redirects". **Phải mở CẢ HAI dạng.** `test/helpers/pages-host.mjs` tái hiện
hành vi này — bản mô phỏng cũ không có nên phép kiểm xanh mà production hỏng.

**Không spread `Response`.** Mã mẫu của brief viết `{ ...response, headers }`, nhưng
`Response` phơi `status` qua getter trên prototype nên spread cho ra object rỗng, ép
**mọi** phản hồi tĩnh về 200 — kể cả 404. Phải dựng lại tường minh:

```js
return new Response(response.body, {
  status: response.status, statusText: response.statusText, headers: newHeaders,
});
```

---

## 7. Bộ kiểm — vì sao chia làm hai

| | `npm test` (unit) | `npm run test:e2e` |
|---|---|---|
| Cần gì | chỉ Node | Chromium + máy chủ mô phỏng Pages |
| Nhanh | ~1 giây | ~70 giây |
| Giữ gì | golden master, FX, Pages Functions, 3 cổng chất lượng | checklist §11, bố cục, vòng đời file |

Golden master chạy được **thuần Node** vì `core/` không chạm DOM ở cấp module. Đó là
lý do nó nhanh, và nhanh là lý do nó thật sự được chạy.

**Golden lệch nghĩa là số liệu đã đổi.** Nếu đó là chủ ý, chạy
`node tools/regen-golden.mjs` rồi soi diff trong pull request — diff ở dạng JSON đọc
được, không phải tệp nhị phân. Sinh lại golden là **chấp nhận bỏ mốc so với bản gốc**:
chuỗi canonical này bắt nguồn từ phép so bản tách module với bản một-file 1,1 MB ban
đầu, trùng nhau từng ký tự.
