# Nhật ký thay đổi

Gộp theo đợt việc, mới nhất ở trên. Dự án chưa đánh số phiên bản.

---

## Đợt 8 — Chế độ tối, sắp/lọc mọi bảng, Division · 2026-09-04

Tám việc. Hai việc chạm vào mô hình dữ liệu (phân loại nhóm nhiều cột, khoá Budget Code),
một việc cắt ngang mọi bảng trong app (sắp xếp / lọc theo cột).

**Đây là lần đầu golden được phép đổi.** Từ trước tới nay `golden-result.json` và
`golden-export.json` là "không đổi một ký tự". Đợt này hình dạng dòng pivot đổi và thứ tự
cột trong sheet khai báo đổi, nên golden phải sinh lại — và phải chứng minh được rằng chỉ
*hình dạng* đổi còn *con số* thì không. Xem mục "Golden" bên dưới.

### Thanh cuộn
App có chín khung cuộn, tất cả đang dùng thanh mặc định của trình duyệt. Nay có một khối
dùng chung (`scrollbar-width: thin` + `::-webkit-scrollbar`), và cột trái — vốn là một mặt
tối — có bản trắng mờ riêng. Phần bung ra của `<select>` gốc thì **không sửa được**: trình
duyệt vẽ nó trong một lớp riêng, CSS của trang không với tới. Ghi thẳng giới hạn đó vào
chú thích để lần sau khỏi thử lại.

### Chế độ sáng / tối
Ba lựa chọn: theo hệ thống (mặc định), sáng, tối. Lưu ở `localStorage` chứ **không** ở
`S.ui` — `S.ui` đi vào file dự án `.json`, gửi file cho đồng nghiệp là gửi luôn chế độ màu
của mình. Một đoạn nội tuyến trong `<head>` đóng dấu `data-theme` **trước lần vẽ đầu tiên**
nên không loé sáng; nhờ vậy CSS chỉ cần **một** khối tối, không phải viết lại lần nữa dưới
`@media (prefers-color-scheme: dark)`. Màn đăng nhập có CSS riêng (middleware chặn file
tĩnh khi chưa đăng nhập) nên có bản chép rút gọn.

46 màu viết cứng ngoài `:root` được gom về biến. Sáu nơi trong JS chép tay
`color:#fff` cho chip đang chọn — đúng chỗ chế độ tối hở ra — gom về lớp `.chip.on`.

### Phân loại nhóm: nhiều cột giá trị
Một bảng chia được nhiều phân loại cùng lúc, đúng hình dạng của bảng chính sách:
`cl.outs = [{name, type}]` + `cl.def[]`. **Không có bước chuyển đổi dữ liệu**: `classOuts()`
đọc được cả hình dạng cũ (`name` + `type` + `def` một giá trị), nên mọi file `.json` đang
lưu chạy nguyên. Chỉ khi người dùng chạm vào khối khai cột thì bảng mới được ghi sang hình
dạng mới.

Chỗ dễ lỡ tay nhất: `applyClasses` nay giống `applyPolicies` về arity nhưng **giữ ngữ nghĩa
cũ** — ô để trống ra rỗng, chỉ khi không khớp dòng nào mới rơi về mặc định. Bảng chính sách
rơi về mặc định cả khi ô trống; chép sang là lặng lẽ đổi số liệu của mọi dự án đang chạy.

### Sắp xếp / lọc theo cột — mọi bảng
`tableView()` dùng chung cho cả bảng sửa tại chỗ lẫn bảng dựng tay (Định biên, Tờ trình, ba
bảng màn Kết quả). Bấm tiêu đề để sắp, Ctrl/Shift+bấm để thêm khoá phụ, nút phễu để lọc
theo giá trị. Hai giao kèo:

- **Sort chỉ là cách XEM.** `apply()` trả mảng mới, không bao giờ đụng vào mảng nguồn —
  thứ tự thật là thứ tự cột trong file Excel xuất ra, chỉ đổi khi kéo thả.
- **Đang sắp thì tắt kéo thả.** Thả vào giữa một danh sách đã sắp lại thì vị trí thả chẳng
  nói được gì về mảng gốc. Đang *lọc* thì vẫn kéo được — `moveBeside` nhận phần tử.

Ô rỗng luôn xuống cuối, kể cả khi sắp giảm dần: "chưa khai" không phải là "lớn nhất". Phép
kiểm bắt đúng lỗi này ở bản đầu.

### Sắp thứ tự ở màn Thiết lập
Công thức dùng chung và tham số dùng chung dùng lại nguyên bộ của Formula Code. Thứ tự
không ảnh hưởng phép tính — `buildShared()` dựng sổ đăng ký theo mã rồi lan truyền phụ
thuộc qua đồ thị tham chiếu — nên chỉ `touch()`, không bỏ kết quả đã tính.

### Ngày công: đổi chỗ hai cột
"Ngày nghỉ ngừng việc" lên trước "Ngày nghỉ có lương khác". Bất biến thật của `CAL_FIELDS`
chỉ là *`std` ở chỉ số 0* (mọi phép cộng đều `slice(1)`, mà cộng thì giao hoán), không phải
"cột mới đứng cuối" như chú thích cũ nói. Nhập lại file `.xlsx` tải về từ trước vẫn đúng:
`importMapped` khớp cột theo **tên tiêu đề**, không theo vị trí.

### Phân loại chi phí: Budget Code đổi khoá, thêm Division
Budget Code từ `Cost Center + Cost Code + Đơn vị` còn `Cost Code + Đơn vị`. Khoá này được
dựng ở **ba nơi** — `ENGINE.buildMaps()`, `views/cost-map.js`, và sheet `ChiTiet_Dong` của
`platform/io.js`. Lệch một chỗ là bảng pivot và sheet dài nói hai số khác nhau mà không có
gì báo, nên có phép kiểm e2e canh riêng chỗ thứ ba.

Dòng khai theo khoá cũ bị **xoá sạch** lúc nạp (nhận ra bằng khoá `costCenter` còn nằm
trong object) và có toast chỉ đường khai lại — giữ lại là để hai loại khoá lẫn lộn trong
một bảng. Cờ `meta.budKeyV` chặn xoá lần hai.

Division suy từ Đơn vị y hệt Cost Center. Bảng pivot đổi thứ tự cột thành
**Division / Budget Code / Cost Center / Cost Code / Account**.

### Golden: đổi có kiểm soát
Sinh lại từ **chính `state.json` đang có** (không dựng lại state, để diff không lẫn id ngẫu
nhiên). Kết quả soi được:

- `golden-result.json`: `grand`, `monthTotals`, `totalsByFc`, `nRows`, `data`,
  `formulaErrors`, `conflicts` **trùng từng ký tự**. `pivot` vẫn 4 dòng, mỗi dòng thêm một
  ô Division và năm ô mã đảo chỗ — **13 con số của mỗi dòng không đổi**. `warnings` chỉ
  thêm 4 dòng "chưa map Division", không mất dòng nào.
- `golden-export.json`: ba sheet `NganSach_TheoNguoi`, `TongHop_FormulaCode`,
  `DoiChieu_ToTrinh` **không đổi một ô**. `TongHop_PhanLoai`: 65 ô từ cột G trở đi dịch
  đúng một cột, 30 ô mã rơi đúng vị trí hoán vị, 5 ô mới là cột Division — cộng lại đúng
  100 ô. `BanKhaiBao`: đúng 13 ô cột E (nhãn + 12 tháng) do đổi thứ tự cột ngày công.

Vì `state.json` để **rỗng cả năm bảng ánh xạ**, việc đổi khoá Budget Code không thể làm
dịch một con số nào — đó chính là điều biến golden thành bằng chứng đọc được cho đợt này.

---

## Đợt 7 — Thao tác nhanh, xuất Excel có định dạng · 2026-09-03

Tám việc nữa. Ba việc chạm vào phần lõi: thanh tiến trình phải cắt được vòng tính, bộ xuất
Excel viết lại từ đầu, và cột ngày công mới chạm vào bộ nhớ đệm eval.

### Phân trang ẩn theo SỐ TRANG
`apply()` so số dòng với hằng 25 chứ không so với cỡ trang đang dùng — cỡ 100 mà có 30 dòng
thì chỉ một trang, vẫn hiện thanh điều hướng vô nghĩa. Nhánh "Tất cả" giữ nguyên ngưỡng cũ:
ô chọn cỡ trang nằm bên trong chính thanh này, ẩn đi là khoá luôn đường quay lại.

### Bảng biến hệ thống · cột "Ngày nghỉ ngừng việc"
Bảng tra biến chỉ đọc ở màn Thiết lập, lấy đúng cặp tên–diễn giải mà thư viện công thức đã
dựng. Cột ngày công thứ 6 tách khỏi "ngày nghỉ có lương khác"; bảng ngày công lặp theo
`CAL_FIELDS` nên màn đó **không phải sửa dòng nào**. Chỗ nguy hiểm là `MONTH_VARS` của máy
biểu thức: thiếu tên biến mới ở đó thì công thức dùng nó bị đệm qua 12 tháng và trả giá trị
tháng 1 cho cả năm — sai số liệu mà không lỗi nào nổ ra.

### Chọn nhiều dòng để kéo một lượt
Ctrl+bấm nhặt từng dòng, Shift+bấm lấy cả dải. Giữ theo **danh tính phần tử** chứ không theo
chỉ số — bảng dựng lại `tbody` mỗi lần gõ ô lọc và mỗi lần đổi trang. Ở bảng Cost Code gần
như mọi ô đều là ô nhập nên **chính ô tay nắm** là chỗ chọn, cũng là chỗ để kéo.

### Định dạng công thức
`FX.fxFormat()` in lại từ **cây**, không chắp nối chuỗi. Chốt an toàn: đọc lại bản vừa in,
cây phải trùng cây cũ, không trùng thì trả nguyên chuỗi gốc. 18 công thức phủ mọi loại nút
được kiểm hai lần — cây không đổi, và **tính ra cùng một số**.

### Thanh tiến trình khi chạy tính
`ENGINE.runAsync()` nhường lại cho trình duyệt ở hai mốc tự nhiên đã có sẵn. `run()` đồng bộ
giữ nguyên — vẫn là đường mà bộ kiểm và golden đi qua. Có phép kiểm chứng minh hai bản cho
ra **trùng từng con số**.

### Xuất Excel có định dạng
Bản SheetJS trong repo là bản cộng đồng: ghi được độ rộng cột và định dạng số nhưng **không
ghi được tô đậm, tô nền, viền hay đóng băng dòng** — id phông/nền/viền bị ghi cứng bằng 0.
Đã thử trên chính file trong repo để chắc, chứ không đoán.

Nhưng `vendor/xltable.js` đã tự viết đủ những thứ đó từ lâu, chỉ vướng chuyện nó chuyên cho
một sheet. `platform/xlsx-write.js` đi đúng cách đó, mở cho nhiều sheet: tiêu đề đậm có nền
và gạch chân, đóng băng dòng 1, độ rộng cột theo nội dung, định dạng số theo từng cột, dòng
TỔNG in đậm, lọc tự động. Không thêm thư viện, không đụng vào `vendor/`.

`golden-result.json` **không đổi một ký tự**. Trong file xuất ra, **không một ô có giá trị
nào đổi** — chỉ 37 ô RỖNG nay không ghi nữa, đúng chuẩn .xlsx và cho file gọn hơn.

---

## Đợt 6 — Kéo thả, hai lỗi thật, và ảnh hưởng tăng lương · 2026-09-03

Mười góp ý nữa sau khi mang app vào việc thật. Hai trong số đó là **lỗi thật đã tìm ra
nguyên nhân**, một là **khoảng trống nghiệp vụ** giấu suốt từ đầu.

### Hai lỗi thật `d5d797f`
- **Chip chèn ghi vào ô đã bị vứt.** Ô công thức dùng chung lấy `drawShared` làm `onBlur`.
  Bấm chip là một `mousedown` nên textarea **blur trước** → cả khối dựng lại → `activeFx`
  trỏ vào ô đã rời DOM. Tới lượt `click` thì `_insert()` ghi vào ô ma đó, mà `onChange`
  vẫn ghi thẳng vào dữ liệu. Bấm N lần thì tới lần dựng lại sau, cả N đoạn hiện ra một
  lượt — đúng như người dùng báo. Sửa: chip chặn ngay `mousedown`, đúng cách mà bảng gợi
  ý khi gõ đã làm từ đầu.
- **Tên bắt đầu bằng chữ số.** Ô nhập tên tham số lọc `[^A-Z0-9_]`, tức app **cho phép**
  đặt `13TH_LUONG`. Nhưng `tokenize()` thử số trước khi thử tên nên nó tách thành số `13`
  rồi tên `TH_LUONG`, người dùng nhận "Thừa ký tự sau biểu thức". App hứa một đằng, máy
  đọc một nẻo — sửa ở máy vì chính app đã hứa.

### Hai biến hệ thống mới `d5d797f`
`TONG_THANG` (số tháng dòng đó có định biên) và `THANG_BAT_DAU` (tháng đầu tiên có định
biên). Cả hai là hằng của từng **dòng** nên **không** nằm trong `MONTH_VARS` — nhét vào đó
là ép mọi công thức dùng chúng eval lại 12 lần. Bộ ba biến cũ đang chép tay ở bốn chỗ, gom
về hằng `SYS_VARS`.

### Giao diện `2333576`
- Hộp gợi ý chèn thành `.panel` thật, đúng hình danh sách Formula Code — tiêu đề nằm ngoài
  vùng cuộn nên xoá hẳn được mẹo `sticky` + lề âm của đợt trước.
- Dải thẻ "thử trên một dòng" chia hàng đều: 12 thẻ ra **6 + 6** thay vì 7 + 5.
- Công thức thêm mới chèn ngay **sau** cái đang chọn.
- "Công thức dùng chung" và "Tham số dùng chung" gấp lại được.

### Kéo thả sắp xếp `d648dab`
Bấm ↑ ↓ từng nấc quá chậm. Dùng DnD gốc HTML5 qua ba hàm dùng chung (`dragList`,
`moveBeside`, `sortByKeys`). **Then chốt:** `commit` nhận **phần tử** chứ không nhận chỉ
số — khi bảng đang lọc hoặc đang ở trang 2, chỉ số DOM không phải chỉ số mảng. Nút "Sinh
sẵn" của bảng Cost Code nay sắp lại cho khớp thứ tự công thức chi phí.

### Ảnh hưởng của tăng lương `e50bf4b`
App áp tăng lương vào số rồi **vứt luôn giá trị gốc**, nên không màn nào nói được nó làm
ngân sách đội lên bao nhiêu. Nay đo bằng cách chạy lại lượt tính với danh sách đợt tăng
cắt dần: đóng góp đợt k = Aₖ − Aₖ₋₁, cộng dồn theo thứ tự nên **các phần cộng lại đúng
bằng tổng**.

**Vì sao chạy lại cả lượt chứ không nhân chia tại chỗ cho rẻ:** đợt tăng có **hai** đường
vào số liệu — liệt kê đích danh một công thức *dùng chung* thì nó được áp bên trong chính
công thức đó, còn lại thì áp ở vòng tính. Bản đầu đo ở vòng ngoài nên bỏ sót hẳn đường thứ
nhất, và chính file mẫu dùng đúng đường đó: báo **0 đồng** thay vì 35.426.659.

Màn Kết quả có panel từng đợt, Dashboard có thẻ và cột "Do tăng lương", sheet "Bản khai
báo" có thêm cột tiền. `golden-result.json` **không đổi một ký tự**; `golden-export.json`
chỉ đổi đúng hai ô mới.

### Nhắc lưu file .json
Nói cho đúng trước: dữ liệu **không** mất khi tắt tab hay đăng xuất — có tự lưu
`localStorage` cộng một lượt xả ở `beforeunload`. Cái thật sự thiếu là **bản sao ra file**:
`localStorage` gắn với đúng một trình duyệt trên đúng một máy. Nay thanh bên nói thẳng
"chưa lưu ra file", đăng xuất thì hỏi lại, và tắt tab thì trình duyệt hỏi — có công tắc
tắt được vì hộp thoại đó hiện ở mọi lần đóng. Dùng **bộ đếm số lần sửa** chứ không dùng
mốc thời gian: hai thao tác trong cùng một mili-giây với lần lưu sẽ lọt qua phép so mốc.

---

## Đợt 5 — Dùng thật rồi báo lại · 2026-09-03

Bốn đợt góp ý từ người dùng sau khi mang app vào việc thật. Phần lớn là giao diện,
nhưng lần nào cũng lôi ra một lỗi thật ở dưới.

### Số hiện sai và bảng lệch font `0ddb0ee`
- **Sửa lỗi:** bảng "Thông tin dùng trong công thức" dùng `fmt()` — bộ định dạng cho
  **tiền đồng**, có `Math.round`. Nhưng bảng đó liệt kê **đầu vào** của công thức: hệ số
  1,5 hiện thành "2"; tỷ lệ 0,215 hiện thành "0". Đúng cái bảng người ta mở ra để đối
  chiếu. Đổi sang `fmtNum()`; quét thêm thì cùng lỗi có ở thư viện FX và bảng gợi ý.
- `td.num, th.num` gộp chung nên mọi tiêu đề cột số ăn luôn font mono, rơi khỏi cỡ chữ
  của các tiêu đề khác. Tách rule: `th.num` chỉ còn căn lề.
- Nút **"⤒ Xuất dữ liệu"** cho cả 7 màn có nhập Excel — có nhập thì phải có xuất để tải
  lại mà sửa. `downloadData()` dùng chung đường ghi file với `downloadTemplate()`.

### Sinh sẵn bỏ sót và phân trang `88f5389`
- **Sửa lỗi:** `classCombos()` kết thúc bằng `return out.slice(0, 800)` — cắt cụt và
  **không báo gì**. Một cột khoá thì không chạm trần; từ hai cột trở lên tích chéo vượt
  800 nên phần dư bị vứt, màn hình hiện "xxx dòng định biên chưa khớp" mà không ai hiểu
  vì sao. Trần cứng thay bằng **ô nhập của người dùng** (để trống = không giới hạn), và
  cắt thì phải nói.
- **Sửa lỗi:** khoá bộ nhớ đệm của `previewRows()` dùng `JSON.stringify(...).length` —
  hai cấu hình khác nhau mà chuỗi bằng độ dài thì đụng khoá. Dùng thẳng chuỗi.
- **Sửa lỗi:** `excImport` **nối thêm** thay vì thay thế, khác mọi màn còn lại; và tháng
  ngắt quãng bị mất khi xuất (chỉ ghi được một khoảng liền). Sửa cả hai.
- **Phân trang dùng chung** cho mọi bảng dài, cỡ trang do người dùng chọn và sống qua
  lần mở sau. Lọc trước, phân trang sau.

### Bốn điểm chạm giao diện `1bc0985`
- Tiêu đề hộp gợi ý chèn `position: sticky` — cuộn xuống vẫn biết đang xem hộp gì.
- "Thử trên một dòng" thêm một thẻ cho **mỗi cột thuộc tính** của dòng đang thử, đặt
  ngay sau thẻ ID. Đọc từ cột thật của file chứ không viết cứng tên cột.
- **Sửa lỗi:** `pg.node` bị nhét thẳng vào `.body.tight` (đệm 0) ở năm màn nên thanh
  phân trang dính sát góc panel. Đưa ra một `.body` riêng, khớp đúng bảng Phân loại nhóm.

### Đổi thứ tự Formula Code
- Danh sách Formula Code có **↑ ↓** trên từng dòng, giống bảng Phân loại nhóm. Thứ tự
  này là thứ tự cột ở màn Kết quả và trong file Excel xuất ra, nên đổi xong bỏ kết quả
  đã tính. Bấm ↑/↓ không nhảy sang soạn công thức khác.
- Đổi tên biến tạm `t` trong hai nút đổi thứ tự của Phân loại nhóm — nó che hàm dịch
  `t()`, đúng cái bẫy đã một lần làm mọi lỗi cú pháp công thức báo ra
  `"t is not a function"`.

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
