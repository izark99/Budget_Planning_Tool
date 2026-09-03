# content.md — toàn bộ text tiếng Việt hiển thị trên giao diện
#

# Định dạng: mỗi dòng là `khoá: giá trị`. Dòng trống và dòng bắt đầu bằng # bị bỏ qua.

# Chỉ tách tại dấu hai chấm ĐẦU TIÊN, nên giá trị chứa ":" thoải mái.

# `\n` trong giá trị thành ký tự xuống dòng. `{ten}` là chỗ điền, code truyền vào

# qua t('khoa', { ten: giaTri }).
#

# Sửa file này là đổi được chữ trên giao diện, KHÔNG cần deploy lại code.
#

# CẢNH BÁO: những chuỗi vừa là nhãn vừa là GIAO THỨC — tên cột file Excel mẫu,

# danh sách nhận diện header khi nhập, giá trị mồi ghi vào file dự án .json —

# KHÔNG nằm ở đây. Chúng ở lại trong code và có comment đánh dấu, vì đổi chúng

# là hỏng chức năng nhập file. Đừng chuyển chúng sang đây.

# Nhãn chung
app.brand: Lập ngân sách
app.brand_sub: từ bảng định biên
app.run: ▶  Chạy tính
app.title: Lập ngân sách từ bảng định biên
rail.local_note: Dữ liệu nằm trong trình duyệt của máy này.
rail.logout: ⏻  Đăng xuất
rail.open_project: ⤒  Mở file dự án
rail.reset: ↺  Xoá hết, làm lại
rail.save_project: ⤓  Lưu file dự án (.json)
rail.saved_at: ✓ Đã lưu file lúc {at}
rail.unsaved: ⚠ Chưa lưu ra file .json
rail.warn_on_close: Hỏi trước khi tắt tab
view.cal.sub: Ngày công chuẩn và ngày nghỉ có lương từng tháng
view.cal.tab: Ngày công
view.cal.title: Ngày công & ngày nghỉ
view.class.sub: Bảng tham chiếu sinh ra cột nhóm cho công thức
view.dash.sub: Lọc theo Cost Code và nhóm, tìm chỗ bất thường
view.dash.tab: Dashboard
view.dash.title: Dashboard soát số
view.exc.sub: Trường hợp duyệt riêng, đối chiếu với công thức
view.formula.sub: Formula Code — nhóm, công thức và tháng trích
view.hc.sub: Nguồn dữ liệu gốc — mỗi dòng một nhân sự
view.maps.sub: Cost Code · Cost Center · Budget Code · Account Code
view.maps.tab: Phân loại chi phí
view.policy.sub: Mức lương, thưởng, phụ cấp cho từng nhóm
view.raise.sub: Từ tháng nào, mức bao nhiêu, áp cho công thức nào
view.raise.tab: Tăng lương
view.result.sub: Chạy tính, đối chiếu và xuất Excel
view.result.tab: Kết quả
view.result.title: Kết quả ngân sách
view.setup.sub: Vai trò từng cột và tham số dùng chung
view.setup.tab: Thiết lập
view.accrual.tab: % trích
view.accrual.title: % trích theo phân loại
view.accrual.sub: Chọn cột phân loại cho từng Formula Code, khai % từng tháng

# Nút và hộp thoại dùng chung
btn.agree: Đồng ý
btn.cancel: Huỷ
btn.close: Đóng
btn.import: Nhập dữ liệu
confirm.logout.body: Dữ liệu vẫn nằm trong trình duyệt của máy này, nhưng bạn CHƯA lưu ra file .json. Xoá cache trình duyệt hoặc đổi máy là mất. Lưu một bản trước khi đi?
confirm.logout.justGo: Đăng xuất luôn
confirm.logout.saveFirst: Lưu file .json rồi đăng xuất
confirm.logout.title: Đăng xuất
confirm.reset_all: Xoá toàn bộ dữ liệu đang có và bắt đầu lại?
confirm.table.clear: Xoá sạch {n} dòng của bảng này?
err.bad_project_file: Không phải file dự án hợp lệ
modal.confirm.title: Xác nhận

# Toast
toast.autosave.fail: Không lưu tự động được. Hãy dùng “Lưu file dự án (.json)”.
toast.error: Lỗi: {e}
toast.fx.inserted: Đã chèn vào ô công thức
toast.import.rows: Đã nhập {n} dòng
toast.open_project: Đã mở file dự án
toast.reset_done: Đã làm mới
toast.save_project: Đã lưu file dự án
toast.table.added: Đã thêm {n} dòng
toast.table.comboTruncated: Đã chạm trần {n} dòng — còn tổ hợp chưa sinh. Nâng "Trần sinh" hoặc để trống để sinh hết.
toast.table.cleared: Đã xoá sạch bảng
toast.table.empty: Bảng đang trống
toast.table.noNewCombo: Không có tổ hợp mới
toast.export.empty: Chưa có dòng nào để xuất
toast.export.ok: Đã xuất {n} dòng
toast.template.fail: Không tạo được file mẫu: {e}
toast.template.ok: Đã tải file mẫu

# Số và đơn vị
num.suffix.billion: tỷ
num.suffix.million: tr

# Vai trò cột (ROLES trong state.js giữ KHOÁ, phân giải lúc render)
role.attr: Thuộc tính
role.key: Khoá nhân sự
role.position: Chức danh
role.unit: Đơn vị (→ Cost Center)
role.month: Cột tháng
role.skip: Bỏ qua

# Bảng dữ liệu
table.addRow: + Thêm dòng
table.clear: Xoá sạch
table.comboLimit: Trần sinh
table.comboLimit.hint: Số dòng tối đa mỗi lần bấm "Sinh sẵn từ định biên". Để trống nghĩa là không giới hạn — sinh đủ mọi tổ hợp có trong định biên.
table.comboLimit.none: không giới hạn
table.dragHint: Kéo để đổi thứ tự
table.downloadTemplate: ⤓ Tải mẫu Excel
table.exportData: ⤒ Xuất dữ liệu
table.empty: Chưa có dòng nào
table.filter.placeholder: Lọc…
table.importExcel: Nhập từ Excel
table.info.matched: · khớp {n}
table.info.rows: {n} dòng
table.info.showing: · hiện {n}
table.noData: Chưa có dữ liệu
table.noMatch: Không có dòng nào khớp “{kw}”
table.page.all: Tất cả
table.page.info: {from}–{to} / {n}
table.page.next: Sau ›
table.page.prev: ‹ Trước
table.page.size: Mỗi trang
table.prefill: Sinh sẵn từ định biên
table.showMore: Hiện thêm

# Nhập / xuất file
export.audit.all: TẤT CẢ
export.audit.appliesTo: Áp cho
export.audit.calcMode: Cách tính
export.audit.calendar: LỊCH NGÀY CÔNG
export.audit.classes: PHÂN LOẠI NHÓM
export.audit.colGenerated: Cột sinh ra
export.audit.cond: Điều kiện
export.audit.condDefault: (mặc định)
export.audit.default: Mặc định
export.audit.exportedAt: Xuất lúc
export.audit.formula: Công thức
export.audit.formulas: CÔNG THỨC
export.audit.fromMonth: Từ tháng
export.audit.group: Nhóm
export.audit.hcSource: Nguồn định biên
export.audit.key: Khoá
export.audit.month: Tháng
export.audit.monthsPicked: Tháng trích
export.audit.name: Tên
export.audit.note: Ghi chú
export.audit.otherDays: Thực tế / Lễ / Phép / Khác / Ngừng việc
export.audit.params: THAM SỐ
export.audit.pct: Mức %
export.audit.period: Kỳ ngân sách
export.audit.raiseAmount: Tien Tang Them
export.audit.raiseName: Tên đợt
export.audit.raises: TĂNG LƯƠNG
export.audit.rowCount: Số dòng
export.audit.rows: {n} dòng
export.audit.scope: Phạm vi
export.audit.spread: PHÂN BỔ
export.audit.stdDays: Ngày công chuẩn
export.audit.value: Giá trị
export.mode.monthly: Số tiền/tháng
export.mode.spread: Tổng năm chia đều
export.total: TỔNG
import.err.missingCols: Thiếu cột bắt buộc: {cols}
import.noColumn: — không có —
import.rowCount: {n} dòng dữ liệu
import.sheet: Sheet
io.err.read: Không đọc được file
io.header.fallback: Cột{i}
template.guide.append: Gõ thêm dòng ngay dưới bảng, Excel tự mở rộng vùng.
template.guide.exported: Đây là {n} dòng bạn đang khai trong app. Sửa xong, nạp lại bằng nút "Nhập từ Excel" — dữ liệu cũ sẽ được thay thế.
template.guide.tableName: Bảng tên "{name}" — tham chiếu được bằng ={name}[Tên cột]
template.guide.title: HƯỚNG DẪN — {title}

# Máy công thức
fx.args.ABS: số
fx.args.AND: đk_1|đk_2|…
fx.args.AVERAGE: số_1|số_2|…
fx.args.CEILING: số|bội_số
fx.args.COUNT: giá_trị_1|…
fx.args.EXACT: chuỗi_1|chuỗi_2
fx.args.FIND: cần_tìm|trong_chuỗi
fx.args.FLOOR: số|bội_số
fx.args.IF: điều_kiện|giá_trị_nếu_đúng|giá_trị_nếu_sai
fx.args.IFERROR: biểu_thức|giá_trị_khi_lỗi
fx.args.IFS: đk_1|giá_trị_1|đk_2|giá_trị_2|…
fx.args.INT: số
fx.args.ISBLANK: giá_trị
fx.args.ISNUMBER: giá_trị
fx.args.LEFT: chuỗi|số_ký_tự
fx.args.LEN: chuỗi
fx.args.LOWER: chuỗi
fx.args.MAX: số_1|số_2|…
fx.args.MID: chuỗi|bắt_đầu|số_ký_tự
fx.args.MIN: số_1|số_2|…
fx.args.MOD: số|số_chia
fx.args.NOT: điều_kiện
fx.args.OR: đk_1|đk_2|…
fx.args.RIGHT: chuỗi|số_ký_tự
fx.args.ROUND: số|số_chữ_số
fx.args.ROUNDDOWN: số|số_chữ_số
fx.args.ROUNDUP: số|số_chữ_số
fx.args.SEARCH: cần_tìm|trong_chuỗi
fx.args.SUM: số_1|số_2|…
fx.args.SWITCH: giá_trị_xét|khớp_1|kết_quả_1|…|mặc_định
fx.args.TRIM: chuỗi
fx.args.UPPER: chuỗi
fx.args.VALUE: chuỗi
fx.cat.arith: Số học
fx.cat.check: Kiểm tra
fx.cat.cond: Điều kiện
fx.cat.params: Tham số
fx.cat.round: Làm tròn
fx.cat.text: Văn bản
fx.cat.usableCols: Cột dùng được
fx.col.desc: Giá trị của cột này ở dòng đang tính
fx.desc.ABS: Giá trị tuyệt đối.
fx.desc.AND: Đúng khi mọi điều kiện đều đúng.
fx.desc.AVERAGE: Trung bình cộng.
fx.desc.CEILING: Làm tròn lên theo bội số.
fx.desc.COUNT: Đếm số phần tử là số.
fx.desc.EXACT: Đúng khi hai chuỗi giống hệt, kể cả hoa thường.
fx.desc.FIND: Vị trí xuất hiện, phân biệt hoa thường. Không thấy thì lỗi.
fx.desc.FLOOR: Làm tròn xuống theo bội số.
fx.desc.IF: Rẽ nhánh theo một điều kiện.
fx.desc.IFERROR: Trả về giá trị thay thế nếu biểu thức lỗi.
fx.desc.IFS: Xét lần lượt, lấy nhánh đầu tiên đúng. Cặp cuối dùng TRUE làm mặc định.
fx.desc.INT: Lấy phần nguyên.
fx.desc.ISBLANK: Đúng khi ô rỗng.
fx.desc.ISNUMBER: Đúng khi là số.
fx.desc.LEFT: Lấy ký tự từ bên trái.
fx.desc.LEN: Đếm số ký tự.
fx.desc.LOWER: Chuyển thành chữ thường.
fx.desc.MAX: Số lớn nhất — hay dùng để chặn sàn.
fx.desc.MID: Lấy đoạn giữa, đếm từ 1.
fx.desc.MIN: Số nhỏ nhất — hay dùng để chặn trần.
fx.desc.MOD: Phần dư của phép chia.
fx.desc.NOT: Đảo ngược đúng/sai.
fx.desc.OR: Đúng khi có ít nhất một điều kiện đúng.
fx.desc.RIGHT: Lấy ký tự từ bên phải.
fx.desc.ROUND: Làm tròn. Số âm là làm tròn về hàng nghìn, chục nghìn…
fx.desc.ROUNDDOWN: Luôn làm tròn xuống.
fx.desc.ROUNDUP: Luôn làm tròn lên.
fx.desc.SEARCH: Như FIND nhưng không phân biệt hoa thường.
fx.desc.SUM: Cộng các số.
fx.desc.SWITCH: So một giá trị với nhiều khả năng.
fx.desc.TRIM: Bỏ khoảng trắng thừa.
fx.desc.UPPER: Chuyển thành chữ hoa.
fx.desc.VALUE: Đổi chuỗi thành số.
fx.err.badchar: Ký tự không hợp lệ: "{ch}"
fx.err.badexpr: Biểu thức không hợp lệ tại vị trí {pos}
fx.err.bracket.unclosed: Thiếu dấu ] đóng tên cột
fx.err.expected: Thiếu "{tok}"
fx.err.string.unclosed: Thiếu dấu " đóng chuỗi
fx.err.trailing: Thừa ký tự sau biểu thức
fx.hint.col: cột
fx.hint.param: tham số = {v}
fx.insert: Chèn
fx.library.chip: ƒ Thư viện
fx.library.chip.title: Tra cứu hàm và công thức đã khai
fx.library.title: Thư viện công thức
fx.op.0.desc: Bốn phép tính cơ bản.
fx.op.1.desc: Luỹ thừa, tính từ trái sang như Excel.
fx.op.2.desc: Phần trăm đặt sau số hoặc sau tên tham số.
fx.op.3.desc: Nối chuỗi.
fx.op.4.desc: So sánh. So chuỗi không phân biệt hoa thường.
fx.own.defaultGroup: Nhóm mặc định
fx.own.empty: Chưa có công thức nào được khai
fx.param.current: Hiện là {v}
fx.search.placeholder: Tìm hàm hoặc công thức đã khai…
fx.sysvar: Biến hệ thống
fx.tab.fn: Hàm có sẵn
fx.tab.op: Toán tử
fx.tab.own: Công thức đã khai
fx.tab.var: Cột & biến
fx.valid: Hợp lệ
fx.valid.cols: · cột: {cols}
fx.valid.vars: · biến: {vars}
fx.var.DINH_BIEN: Hệ số định biên của tháng đó
fx.var.SO_THANG: Số tháng trích của công thức này
fx.var.THANG: Tháng đang tính, 1 đến 12
fx.var.THANG_BAT_DAU: Tháng đầu tiên dòng này có định biên, 0 nếu cả năm trống
fx.var.TONG_THANG: Số tháng dòng này có định biên, không phụ thuộc tháng đang tính
fx.var.calField: {label} của tháng đang tính
fx.chips.title: Gợi ý chèn
fx.chips.target: Chèn vào: {name}
fx.chips.target.any: Chèn vào ô đang chọn
fx.chips.target.none: Bấm vào một ô công thức để chèn
fx.chips.no_target: Bấm vào ô công thức cần chèn trước đã
fx.chips.shared: Công thức dùng chung

# Máy tính ngân sách
engine.err.code: Lỗi {e}
engine.err.code.at: Lỗi {e} ở {m}
engine.err.cond: Điều kiện: {e}
engine.err.formula: Công thức: {e}
engine.err.norows: Chưa có dòng định biên nào
engine.group.unnamed: (không tên)
engine.map.none: (chưa map)
engine.map.undeclared: (chưa khai báo)
engine.rule.unnamed: nhóm
engine.value.empty: (rỗng)
engine.warn.ac.missing: Chưa có Account Code cho {k}
engine.warn.bc.missing: Chưa có Budget Code cho {k}
engine.warn.cal: Ngày công {scope} · {m}: tổng các cột {w} {n} ngày so với ngày công chuẩn
engine.warn.cc.unmapped: Formula Code "{k}" chưa map Cost Code
engine.warn.cen.unmapped: Đơn vị "{u}" chưa map Cost Center
engine.warn.class.miss: Phân loại "{name}": {n} dòng không khớp bảng, dùng giá trị mặc định "{def}"
engine.warn.keycol: Chưa chọn cột Khoá nhân sự — tờ trình chỉ ghép được theo chức danh
engine.warn.month: Chưa gán đủ 12 cột tháng — mọi dòng đang tính là có mặt cả 12 tháng
engine.warn.nogroup: {code}: {n} dòng không khớp nhóm nào (tính = 0)
engine.warn.policy.miss: Chính sách "{name}": {n} dòng không khớp bảng, dùng giá trị mặc định
engine.warn.unitcol: Chưa chọn cột Đơn vị — không suy ra được Cost Center
engine.where.raise: Tăng lương "{name}"
engine.where.row: {code} › {name} (dòng {i})
engine.where.shared: Công thức dùng chung "{code}"

# Màn 1-2 · Định biên & Thiết lập
hc.bang_dinh_bien: Bảng định biên
hc.binh_quan_nam: Bình quân năm
hc.chon_file_dinh_bien_xlsx: Chọn file định biên (.xlsx)
hc.chu: Chữ
hc.chua_co_cot_nao: Chưa có cột nào
hc.chua_co_hang_so_nao: Chưa có hằng số nào
hc.cot_cua_bang_dinh_bien: Cột của bảng định biên
hc.dinh_bien_t01: Định biên T01
hc.dinh_bien_t01_t12: Định biên T01 → T12
hc.dinh_bien_t12: Định biên T12
hc.doan_lai_vai_tro: Đoán lại vai trò
hc.dong_dinh_bien: Dòng định biên
hc.dong_tieu_de: Dòng tiêu đề
hc.du_lieu_dinh_bien: Dữ liệu định biên
hc.err_read: Không đọc được file: {e}
hc.guide_1: Mỗi dòng là MỘT nhân sự.
hc.guide_2: Chín cột đầu là thuộc tính, dùng được trong công thức bằng cú pháp [Tên cột].
hc.guide_3: Mười hai cột 1..12 là hệ số định biên từng tháng: 1 = có mặt cả tháng, 0 = không, 0.5 = nửa tháng.
hc.guide_4: Ví dụ dòng đầu: chỉ làm việc từ T04 đến T09.
hc.export_guide: Giữ nguyên tên các cột. Nạp lại file này thì thiết lập vai trò cột ở màn Thiết lập vẫn được giữ.
hc.hien_them_500: Hiện thêm 500
hc.hoac_keo_tha_vao_day_moi_dong_mot: Hoặc kéo thả vào đây. Mỗi dòng một nhân sự, mười hai cột tháng là hệ số định biên.
hc.import_title: Nhập bảng định biên — {file}
hc.imported_rows: Đã nhập {n} dòng định biên
hc.khong_co_dong_nao_khop: Không có dòng nào khớp
hc.mau: ⤓ Mẫu
hc.month_cols_badge: {n}/12 cột tháng
hc.months_ok: Nhận diện được <strong>12 cột tháng</strong>. Vai trò từng cột chỉnh lại được ở màn hình Thiết lập.
hc.months_partial: <strong>Mới thấy {n} cột tháng.</strong> Vẫn nhập được, sang màn hình Thiết lập gán vai trò cho đủ 12 cột.
hc.nam: Năm
hc.nguon: Nguồn
hc.nhap_bang_dinh_bien: Nhập bảng định biên
hc.nhap_bang_dinh_bien_truoc: Nhập bảng định biên trước.
hc.nhap_lai: Nhập lại
hc.rows_cols: {rows} dòng dữ liệu · {cols} cột
hc.so: Số
hc.ten_ky: Tên kỳ
hc.tham_so_dung_chung: Tham số dùng chung
hc.them: + Thêm
hc.tim_trong_bang: Tìm trong bảng…
setup.cols_help: Tên trong cột <strong>Dùng trong công thức</strong> chính là thứ gõ giữa hai ngoặc vuông: <code>[Grade]</code>, <code>[Workplace Location]</code>. Vai trò <strong>Khoá nhân sự</strong> dùng để ghép tờ trình, <strong>Đơn vị</strong> để suy Cost Center, <strong>Cột tháng</strong> để lấy hệ số định biên. Cột đặt <strong>Bỏ qua</strong> sẽ biến mất khỏi mọi màn hình sau.
setup.params_help: Gọi thẳng tên trong công thức: <code>[Coefficient]*LUONG_CO_SO</code>. Muốn dùng như phần trăm thì viết <code>TY_LE_BHXH_CTY%</code>.
setup.sysvars.help: Gõ thẳng tên này vào công thức, không cần khai gì thêm. Khác tham số ở chỗ tham số là số bạn tự đặt, còn đây là số app tự biết theo từng dòng và từng tháng.
setup.sysvars.th_desc: Dùng để làm gì
setup.sysvars.th_var: Tên biến
setup.sysvars.title: Biến hệ thống
setup.th_distinct: Số giá trị
setup.th_file_col: Cột trong file
setup.th_formula_name: Dùng trong công thức
setup.th_role: Vai trò
setup.th_sample: Giá trị mẫu
setup.th_type: Kiểu
setup.shared.title: Công thức dùng chung
setup.shared.add: + Thêm công thức
setup.shared.name: Diễn giải
setup.shared.formula: Biểu thức
setup.shared.empty: Chưa khai công thức dùng chung nào
setup.shared.dup: Trùng tên gọi
setup.shared.bad: Sai cú pháp
setup.shared.untitled: (chưa đặt tên)
setup.shared.help: Đặt tên cho một biểu thức rồi gọi lại ở nhiều công thức chi phí: viết <code>LUONG_CO_BAN</code> hoặc <code>[Lương cơ bản]</code>. Khác <strong>tham số</strong> ở chỗ tham số là một con số cố định, còn đây là biểu thức tính theo từng dòng và từng tháng. Sửa một chỗ thì mọi công thức gọi tới đều đổi theo. Chỗ này <strong>không tự làm tròn</strong> — cần thì viết <code>ROUND()</code> trong công thức chi phí.

# Màn 3-5 · Phân loại nhóm & Ngày công
cal.ap_cho_tat_ca: áp cho tất cả
cal.cac_bang_phan_loai: Các bảng phân loại
cal.chon_it_nhat_mot_cot_khoa: Chọn ít nhất một cột khoá
cal.chua_co_bang_phan_loai_nao: Chưa có bảng phân loại nào
cal.chua_co_dong_nao_bam_sinh_san_tu: Chưa có dòng nào — bấm “Sinh sẵn từ định biên” để lấy các tổ hợp đang có
cal.class_guide_1: Cột cuối là nhóm kết quả — tự đặt mã tuỳ ý.
cal.class_guide_2: Các cột trước là khoá, phải khớp đúng giá trị trong bảng định biên.
cal.class_guide_3: Ghi * ở ô khoá để khớp mọi giá trị.
cal.class_guide_4: Dòng nào định biên không khớp sẽ nhận giá trị mặc định khai ở màn hình.
cal.class_table_title: Bảng phân loại {name}
cal.classes_help: Mỗi bảng lấy một hoặc nhiều cột làm khoá rồi sinh ra <strong>một cột nhóm mới</strong>. Cột đó dùng được ngay trong công thức: <code>[Nhóm lương]="NL1"</code>, và làm khoá cho bảng phía dưới. Chạy theo đúng thứ tự từ trên xuống. Ô khoá ghi <code>*</code> nghĩa là khớp mọi giá trị. Bấm vào tiêu đề để thu gọn bảng.
cal.confirm_delete_class: Xoá bảng phân loại "{name}"?
cal.cot_khoa_bam_de_chon: Cột khoá — bấm để chọn
cal.da_xoa_sach_du_lieu: Đã xoá sạch dữ liệu
cal.dien_deu_12_thang: Điền đều 12 tháng
cal.doi_chieu: Đối chiếu
cal.gap_over: thừa {n} ngày
cal.gap_short: thiếu {n} ngày
cal.gap_word_over: thừa
cal.gap_word_short: thiếu
cal.guide_1: Cột Nhom: giá trị của cột đã chọn để phân lịch. Ghi * cho lịch dùng chung.
cal.guide_2: Cột Thang: số từ 1 đến 12.
cal.guide_3: Ngày công chuẩn nên bằng tổng của các cột còn lại.
cal.export_guide: Giữ nguyên hai cột Nhom và Thang. Nạp lại file này sẽ thay thế toàn bộ lịch ngày công đang có.
cal.import_title: Nhập lịch ngày công
cal.imported: Đã nhập {n} lịch
cal.khong_doc_duoc_dong_hop_le_nao: Không đọc được dòng hợp lệ nào
cal.khop: khớp
cal.lich_ap_cho_ai: Lịch áp cho ai
cal.lich_ngay_cong: Lịch ngày công
cal.mac_dinh_khi_khong_khop: Mặc định khi không khớp
cal.n_tables: {n} bảng
cal.ngay_cong_chuan_tung_thang: Ngày công chuẩn từng tháng
cal.nhap_dinh_bien_roi_quay_lai_day: Nhập định biên rồi quay lại đây.
cal.not_declared: chưa đủ khai báo
cal.one_calendar_for_all: — một lịch chung cho tất cả —
cal.per_group_help: Mỗi giá trị của <strong>{col}</strong> dùng lịch riêng. Bảng có phạm vi <code>*</code> là lịch mặc định cho giá trị chưa khai.
cal.phan_lich_theo_cot: Phân lịch theo cột
cal.phan_loai_nhom: Phân loại nhóm
cal.rows_all_matched: khớp hết {n} dòng
cal.rows_unmatched: {n} dòng định biên chưa khớp
cal.scope_title: Giá trị của {col}, hoặc * cho mặc định
cal.shared_help: Mọi nhân sự dùng chung một lịch. Chọn một cột ở trên nếu khối sản xuất và khối văn phòng khác ngày công.
cal.ten_cot_nhom_sinh_ra: Tên cột nhóm sinh ra
cal.them_bang_phan_loai: + Thêm bảng phân loại
cal.them_lich_cho_mot_nhom: + Thêm lịch cho một nhóm
cal.unnamed: Chưa đặt tên
cal.vars_help: Dùng trong công thức bằng các biến: {vars}. Giá trị tự đổi theo tháng đang tính. Cột cuối kiểm tra ngày công chuẩn có bằng tổng các cột còn lại không.
cal.vi_du_bang_dau_lay_khoa_unit_sinh: Ví dụ: bảng đầu lấy khoá Unit sinh ra cột “Nhóm lương”; bảng thứ hai lấy khoá Nhóm lương + Position sinh ra “Nhóm thưởng”.
cal.xoa_bang: Xoá bảng
cal.xoa_lich: Xoá lịch
cal.xoa_sach_dong_du_lieu_cua_tat_ca: Xoá sạch dòng dữ liệu của tất cả bảng phân loại? Khai báo tên và cột khoá vẫn giữ.
cal.xoa_sach_du_lieu_moi_bang: Xoá sạch dữ liệu mọi bảng

# Màn 4 · Chính sách
pol.bo_cot_nay: Bỏ cột này
pol.cac_bang_chinh_sach: Các bảng chính sách
pol.cai_dat_chinh_sach: Cài đặt chính sách
pol.can_it_nhat_mot_cot_khoa_va_mot: Cần ít nhất một cột khoá và một cột giá trị
pol.chua_co_bang_chinh_sach_nao: Chưa có bảng chính sách nào
pol.chua_co_dong_nao_bam_sinh_san_tu: Chưa có dòng nào — bấm “Sinh sẵn từ định biên” để lấy các nhóm đang có
pol.confirm_delete: Xoá bảng chính sách "{name}"?
pol.cot_gia_tri_sinh_ra_ten_kieu_mac: Cột giá trị sinh ra — tên · kiểu · mặc định khi không khớp
pol.guide_1: Các cột đầu là khoá, phải khớp đúng giá trị nhóm hoặc cột định biên.
pol.guide_2: Các cột sau là mức chính sách, dùng thẳng trong công thức bằng [Tên cột].
pol.help: Bảng chính sách tra theo nhóm rồi trả về <strong>mức tiền cụ thể</strong>. Ví dụ khoá <code>[Nhóm lương]</code> trả về hai cột <code>Mức phụ cấp điện thoại</code> và <code>Số tháng thưởng</code>; công thức chi phí gọi thẳng <code>[Mức phụ cấp điện thoại]</code> thay vì viết IF dài. Ô khoá ghi <code>*</code> khớp mọi giá trị.
pol.nhap_dinh_bien_va_khai_phan_loai: Nhập định biên và khai phân loại nhóm trước.
pol.table_title: Bảng chính sách {name}
pol.ten_bang_chinh_sach: Tên bảng chính sách
pol.ten_cot_gia_tri: Tên cột giá trị
pol.them_bang_chinh_sach: + Thêm bảng chính sách
pol.them_cot_gia_tri: + Thêm cột giá trị
pol.vi_du_khoa_theo_nhom_luong_sinh: Ví dụ: khoá theo Nhóm lương, sinh ra ba cột Mức lương cơ bản, Mức phụ cấp điện thoại, Số tháng thưởng. Sau đó công thức chỉ cần viết [Mức phụ cấp điện thoại].

# Màn 6 · Công thức chi phí
fm.all_rows: mọi dòng
fm.ap_cho_cong_thuc_nao: Áp cho công thức nào
fm.ap_dung_tu_thang: Áp dụng từ tháng
fm.autogroup_info: Cột <strong>{col}</strong> có <strong>{n}</strong> giá trị: {vals}
fm.bo_het: Bỏ hết
fm.bon_tang_phan_loai: Bốn tầng phân loại
fm.ca_ky: cả kỳ
fm.ca_nam_dong_nay: Cả năm dòng này
fm.chon_cot: Chọn cột
fm.chua_chon_ap_cho_tat_ca_cong_thuc: Chưa chọn → áp cho TẤT CẢ công thức
fm.chua_co_nhom_nao: Chưa có nhóm nào
fm.chua_co_to_trinh_nao: Chưa có tờ trình nào
fm.chua_khai_bao_dot_tang_luong_nao: Chưa khai báo đợt tăng lương nào
fm.chua_map: chưa map
fm.cond_placeholder: Bỏ trống = mọi dòng còn lại
fm.confirm_delete_fc: Xoá "{code}" và toàn bộ nhóm của nó?
fm.cong_them: Cộng thêm
fm.cong_thuc_can_biet_tham_chieu_cot: Công thức cần biết tham chiếu cột nào.
fm.cong_thuc_chi_phi: Công thức chi phí
fm.cong_thuc_tinh_tien: Công thức tính tiền
fm.cost_center_theo_don_vi: Cost Center theo đơn vị
fm.cot_mo_la_thang_khong_trich_so: Cột mờ là tháng không trích. Số màu cam là tháng có tờ trình can thiệp.
fm.create_groups: Tạo nhóm
fm.created_groups: Đã tạo {n} nhóm
fm.da_xoa_sach: Đã xoá sạch
fm.dieu_kien_loi: điều kiện lỗi
fm.dieu_kien_nhom: Điều kiện nhóm
fm.drag_hint: Kéo để đổi thứ tự
fm.dinh_nghia_phan_bo: Định nghĩa & phân bổ
fm.du_kien_tang_luong: Dự kiến tăng lương
fm.full_year: Cả năm
fm.ghi_de: Ghi đè
fm.gioi_han_pham_vi_tuy_chon: Giới hạn phạm vi (tuỳ chọn)
fm.giu_lai_cac_nhom_hien_co: Giữ lại các nhóm hiện có
fm.he_so_dinh_bien: Hệ số định biên
fm.ket_qua_cong_thuc_la: Kết quả công thức là
fm.khong_tim_thay: Không tìm thấy
fm.lay_cao_nhat: Lấy cao nhất
fm.line_afterExc: Sau tờ trình
fm.line_amount: Vào ngân sách
fm.line_raised: Sau tăng lương
fm.line_raw: Công thức trả về
fm.mode_monthly_help: Công thức trả về <strong>số tiền một tháng</strong>, áp cho từng tháng đã bật.
fm.mode_monthly_long: số tiền mỗi tháng
fm.mode_monthly_short: /tháng
fm.mode_spread_help: Công thức trả về <strong>tổng cả năm</strong>, chia đều cho {n} tháng đã bật.
fm.mode_spread_short: chia đều
fm.moi_gia_tri_thanh_mot_nhom_cong: Mỗi giá trị thành một nhóm, công thức để 0 cho bạn điền sau.
fm.muc_tang: Mức tăng (%)
fm.n_groups: {n} nhóm
fm.n_months: {n}/12 tháng
fm.n_rows_match: {n} dòng khớp
fm.nhom_cong_thuc: Nhóm & công thức
fm.nhom_khop: Nhóm khớp
fm.no_match: — không khớp —
fm.preview_error: <strong>Lỗi:</strong> {e}
fm.preview_error_group: (nhóm "{g}")
fm.rules_help: Xét từ trên xuống, <strong>nhóm đầu tiên khớp sẽ được dùng</strong> — như IFS. Nhóm cuối nên để trống điều kiện làm mặc định.
fm.search: Tìm…
fm.search_by: Tìm theo {col} hoặc tên…
fm.so_tien_cua_mot_thang: Số tiền của một tháng
fm.tao_nhom_theo_cot: Tạo nhóm theo cột…
fm.tao_nhom_theo_cot_2: Tạo nhóm theo cột
fm.ten_dot_tang: Tên đợt tăng
fm.ten_nhom: Tên nhóm
fm.thang_trich_bam_de_bat_tat: Tháng trích — bấm để bật tắt
fm.them_dot: + Thêm đợt
fm.them_mot_formula_code: Thêm một Formula Code
fm.them_nhom: + Thêm nhóm
fm.thu_tren_mot_dong_that: Thử trên một dòng thật
fm.to_trinh_ngoai_le: Tờ trình ngoại lệ
fm.tong_ca_nam_chia_deu: Tổng cả năm, chia đều
fm.too_many_values: Cột này có quá nhiều giá trị ({n})
fm.tu_thang_da_chon_tro_di_ket_qua: Từ tháng đã chọn trở đi, kết quả của các công thức được chọn nhân với (1 + %). Nhiều đợt cùng khớp thì nhân dồn.
fm.xoa: Xoá
fm.xoa_sach_ca_bon_bang: Xoá sạch cả bốn bảng
fm.xoa_sach_du_lieu_cua_ca_bon_bang: Xoá sạch dữ liệu của cả bốn bảng phân loại chi phí?
fm.nhom_thu: Nhóm
fm.refs.title: Thông tin dùng trong công thức
fm.refs.name: Tên
fm.refs.kind: Loại
fm.refs.value: Giá trị
fm.refs.varying: Đổi theo tháng
fm.refs.empty: Công thức này không tham chiếu cột hay biến nào
fm.kind.field: Cột định biên
fm.kind.param: Tham số
fm.kind.monthvar: Biến theo tháng
fm.kind.shared: Công thức dùng chung
fm.kind.unknown: Không nhận ra
fm.line_accrual: % trích

# Màn 7 · Tờ trình ngoại lệ
exc.guide_1: Có ID thì ghép theo ID; bỏ trống ID và điền Chuc Danh thì áp cho mọi người giữ chức danh đó.
exc.guide_2: Quy Tac nhận: MAX (lấy cao nhất) · OVERRIDE (ghi đè) · ADD (cộng thêm).
exc.guide_3: Bỏ trống Tu Thang / Den Thang nghĩa là áp cho mọi tháng trích của Formula Code.
exc.guide_4: Formula Code phải trùng mã đã khai ở màn hình Công thức chi phí.
exc.export_guide: Một tờ trình chọn nhiều tháng không liền nhau sẽ tách thành nhiều dòng — nạp lại vẫn ra đúng các tháng đó. Nạp lại file này sẽ thay thế toàn bộ tờ trình đang có.
exc.help: Ghép theo <strong>ID</strong> nếu có, không thì theo <strong>Chức danh</strong>. Quy tắc <strong>Lấy cao nhất</strong> so công thức với tờ trình rồi lấy số lớn hơn; mọi trường hợp lệch đều vào bảng đối chiếu ở màn hình Kết quả. Bỏ trống tháng nghĩa là áp cho mọi tháng trích của Formula Code đó.
exc.import_title: Nhập tờ trình ngoại lệ
exc.imported: Đã nhập {n} tờ trình
exc.sample_note_1: Duyệt riêng
exc.sample_note_2: Áp theo chức danh
exc.th_amount: Số tiền
exc.th_months: Tháng áp dụng
exc.th_no: Số tờ trình
exc.th_position: Chức danh
exc.th_rule: Quy tắc

# Màn 8 · Phân loại chi phí
maps.acc_guide: Ba cột đầu là khoá, phải khớp đúng giá trị đã khai ở ba bảng trên.
maps.acc_note: Không còn ràng buộc theo đơn vị — đơn vị đã nằm trong Budget Code ở tầng trên.
maps.badge_missing: {miss}/{total} {w} chưa khai
maps.badge_none: chưa có {w} nào để khai
maps.badge_ok: đủ {total} {w}
maps.bud_guide_1: Ba cột đầu là khoá: Cost Center, Cost Code và Đơn vị.
maps.bud_guide_2: Ví dụ: F1 × 0304 → HR0203; HR × 0304 → HR0204.
maps.bud_guide_3: Nút Sinh sẵn chỉ đổ ra tổ hợp thật sự phát sinh từ bảng định biên.
maps.cc_guide: Nhiều Formula Code có thể trỏ về cùng một Cost Code.
maps.cc_note: Một Cost Code gom nhiều công thức.
maps.cen_guide: Unit phải trùng đúng giá trị trong cột đơn vị của bảng định biên.
maps.cen_no_unitcol: <strong>Chưa chọn cột Đơn vị</strong> ở màn hình Thiết lập — không sinh sẵn được danh sách.
maps.help: Chuỗi suy ra: <strong>Formula Code → Cost Code</strong>, <strong>Đơn vị → Cost Center</strong>, <strong>Cost Center + Cost Code + Đơn vị → Budget Code</strong>, <strong>Cost Code + Cost Center + Budget Code → Account Code</strong>. Con số bên cạnh mỗi bảng đếm theo tổ hợp thật sự phát sinh từ định biên, cập nhật ngay khi sửa hoặc nhập file. Bấm tiêu đề để thu gọn.
maps.panel_bud: 3 · Budget Code ← Cost Center + Cost Code + Đơn vị
maps.panel_cen: 2 · Cost Center ← Đơn vị
maps.word_combo: tổ hợp
maps.word_unit: đơn vị

# Màn 9 · Tăng lương
raise.cond_placeholder: Bỏ trống = áp cho tất cả
raise.n_rows: {n} dòng áp dụng
fm.raise.cost_group: Áp cho công thức chi phí
fm.raise.shared_group: Áp cho công thức dùng chung
fm.raise.shared_note: Chọn ở đây thì mọi công thức chi phí gọi tới nó đều ăn theo. Đừng chọn kèm cả công thức chi phí đang dùng nó, kẻo một đợt tăng bị tính hai lần.
acc.title: % trích theo phân loại
acc.help: Mỗi Formula Code chọn <strong>một cột phân loại</strong> rồi khai % cho từng giá trị của cột đó × 12 tháng. % được nhân vào ở bước cuối, <strong>cùng chỗ với hệ số định biên</strong> — tức là sau tăng lương và sau tờ trình ngoại lệ. Ô để trống hoặc chưa khai đều tính là <strong>100%</strong>, nên màn này bỏ trống thì kết quả không đổi một đồng.
acc.col_label: Cột phân loại
acc.pick_col: — chưa chọn —
acc.no_col: Chọn một cột phân loại ở trên để bắt đầu khai %
acc.no_col_badge: chưa chọn cột
acc.no_rows: Chưa có giá trị nào — bấm "Sinh sẵn từ dữ liệu"
acc.th_value: Giá trị phân loại
acc.sync: Sinh sẵn từ dữ liệu
acc.synced: Đã thêm {n} giá trị
acc.sync_none: Không có giá trị mới
acc.all100: Đặt tất cả 100%
acc.all100_done: Đã đặt tất cả về 100%
acc.confirm_clear: Xoá toàn bộ % trích đã khai cho {code}?
acc.n_declared: {n} ô khác 100%
acc.import_title: Nhập % trích theo phân loại
acc.imported: Đã nhập {n} dòng % trích
acc.imported_skip: Đã nhập {n} dòng, bỏ qua {s} dòng có Formula Code không khai
acc.guide_1: Cột Formula Code phải trùng mã đã khai ở màn Công thức chi phí; dòng nào không trùng sẽ bị bỏ qua.
acc.guide_2: Cột Cot Phan Loai là tên cột dùng để phân loại, ví dụ Salary Group hoặc Dept.
acc.guide_3: Cột Gia Tri là một giá trị cụ thể của cột phân loại đó.
acc.guide_4: T01 đến T12 nhập số phần trăm: 100 nghĩa là trích đủ, 50 là trích một nửa, bỏ trống cũng là 100.
acc.export_guide: Giữ nguyên ba cột đầu. Nạp lại file này sẽ thay thế toàn bộ phần trăm trích đang khai.

# Màn 10 · Kết quả
res.chua_co_so_lieu: Chưa có số liệu
res.doi_chieu_to_trinh_cong_thuc: Đối chiếu tờ trình ↔ công thức
res.done: Tính xong trong {ms} ms
res.error: Lỗi khi tính: {e}
res.export_btn: Xuất file
res.export_building: Đang tạo file Excel…
res.export_fail: Xuất file thất bại: {e}
res.export_ok: Đã xuất {fn}
res.formula_errors: {n} lỗi công thức — các dòng liên quan đang tính bằng 0:
res.khong_co_chenh_lech_nao: Không có chênh lệch nào
res.luot_lech_phai_theo_doi: Lượt lệch phải theo dõi
res.luot_to_trinh_ap_dung: Lượt tờ trình áp dụng
res.more_warnings: … và {n} cảnh báo khác
res.n_diffs: {n} lượt lệch
res.not_run_hint: Số liệu chỉ được tính khi bạn bấm nút bên dưới, để tránh chạy lại mỗi lần mở màn hình.
res.pivot_title: Theo Account / Budget / Cost Code / Cost Center
res.raise_before: Ngân sách nếu không tăng lương
res.raise_by_fc: Tách theo Formula Code
res.raise_hint: So với chính bộ khai báo này nhưng <strong>bỏ hết mọi đợt tăng</strong>. Các đợt nhân chồng lên nhau nên phần của từng đợt tính theo thứ tự khai báo — nhờ vậy cộng lại đúng bằng tổng.
res.raise_none: Chưa khai đợt tăng lương nào
res.raise_th_amount: Tiền tăng thêm
res.raise_th_from: Từ tháng
res.raise_th_pct: Mức tăng
res.raise_th_round: Đợt tăng
res.raise_th_rows: Lượt dòng chạm
res.raise_th_share: % tổng ngân sách
res.raise_title: Ảnh hưởng của tăng lương
res.sheet_audit: Bản khai báo
res.sheet_audit_note: Công thức, tham số, phân loại, lịch ngày công
res.sheet_conflict: Đối chiếu tờ trình
res.sheet_fc: Tổng hợp theo Formula Code
res.sheet_long: Chi tiết dạng dọc
res.sheet_long_note: Rất nặng: tới {n} dòng
res.sheet_person: Ngân sách theo người × tháng
res.sheet_person_note: Mỗi dòng định biên tách thành 12 dòng T01→T12 — {n} dòng
res.sheet_pivot: Tổng hợp 4 tầng phân loại
res.th_applied: Áp dụng
res.th_winner: Bên thắng
res.tong_cong: TỔNG CỘNG
res.total_budget: Tổng ngân sách {y}
res.warnings: Cảnh báo khai báo ({n})
res.xuat_excel: Xuất Excel
res.xuat_file_excel: Xuất file Excel

# Màn 11 · Dashboard
dash.all_data: toàn bộ
dash.all_groups: (tất cả)
dash.all_option: — tất cả —
dash.bam_de_loc_theo_ma_nay: Bấm để lọc theo mã này
dash.binh_quan_dau_nguoi_thang: Bình quân đầu người tháng
dash.binh_quan_thang: Bình quân tháng
dash.bo_loc: Bộ lọc
dash.bo_loc_2: Bỏ lọc
dash.bq_dau_nguoi_thang: BQ đầu người tháng
dash.chay_lai: Chạy lại
dash.chay_tinh_ngay: ▶  Chạy tính ngay
dash.chi_so_thong_ke: Chỉ số thống kê
dash.chi_tiet_theo_formula_code: Chi tiết theo Formula Code
dash.co_cau_theo_cost_code: Cơ cấu theo Cost Code
dash.currency: {n} đ
dash.day_so: Dãy số
dash.diem_can_soat: Điểm cần soát
dash.dien_bien_12_thang: Diễn biến 12 tháng
dash.dinh_bien_binh_quan: Định biên bình quân
dash.dir_down: giảm
dash.dir_up: tăng
dash.do_tang_luong: Do tăng lương
dash.filter_col: Lọc {i} — cột
dash.flag_exc: {n} lượt tờ trình lệch công thức, làm ngân sách {dir} {amt}
dash.flag_fc_zero: Formula Code "{code}" không sinh ra đồng nào
dash.flag_group: Nhóm "{g}" {cmp} mỗi người-tháng · {pm} người-tháng · lệch {gap}
dash.flag_group_high: tốn {r}× mặt bằng
dash.flag_group_low: chỉ bằng {r}× mặt bằng
dash.flag_month: {m} lệch {pct}% so với {prev}
dash.flag_zero_rows: {n} dòng định biên có mặt nhưng không phát sinh chi phí nào
dash.gia_tri: giá trị
dash.group_value: Giá trị nhóm
dash.khong_loc: — không lọc —
dash.khong_phat_hien_diem_bat_thuong: Không phát hiện điểm bất thường trong bộ lọc hiện tại
dash.kind_exc: Tờ trình
dash.kind_group: Theo nhóm
dash.kind_month: Theo tháng
dash.kind_row: Định biên
dash.kind_warn: Khai báo
dash.matrix_help: Bấm một dòng để lọc theo nhóm đó. Mặt bằng chung đang là <strong>{base} đ</strong> mỗi người-tháng. Ô <span class="tag o">cam</span> là nhóm tốn từ 1,5 lần mặt bằng trở lên, ô <span class="tag g">xanh</span> là nhóm chỉ bằng 0,6 lần trở xuống.
dash.matrix_title: Ma trận {col} × Cost Code
dash.n_codes: {n} mã
dash.n_conditions: {n} điều kiện
dash.n_formulas: {n} công thức
dash.n_points: {n} điểm
dash.ngan_sach_trong_bo_loc: Ngân sách trong bộ lọc
dash.nguoi_thang: Người-tháng
dash.no_anomaly: không thấy bất thường
dash.no_hc_hint: Nhập bảng định biên trước đã.
dash.not_run: Chưa chạy tính
dash.not_run_hint: Dashboard đọc từ kết quả đã tính. Bấm nút bên dưới để chạy.
dash.person_months: {n} người-tháng
dash.phan_loai_theo: Phân loại theo
dash.raise_share: {n} đ · {p}% ngân sách trong bộ lọc
dash.series_fc: Tổng cả năm theo Formula Code
dash.series_group: Chi phí mỗi người-tháng theo nhóm {col}
dash.series_months: Ngân sách theo tháng
dash.series_months_unit: 12 tháng
dash.series_rows: Chi phí mỗi người-tháng theo từng dòng định biên
dash.so_phan_tu: Số phần tử
dash.sort_per: Đang xếp theo BQ đầu người
dash.sort_total: Đang xếp theo tổng tiền
dash.spread: chênh cao thấp {n}
dash.stats_help: Chọn chỉ số cần xem — chúng áp cho mọi dãy số bên dưới, vẽ thành đường tham chiếu trên biểu đồ 12 tháng và thêm dòng vào cuối ma trận. P25 và P75 nội suy tuyến tính, giống <code>PERCENTILE.INC</code> của Excel.
dash.ty_trong: Tỷ trọng

# Khởi động
boot.no_localstorage: <strong>Trình duyệt không cho lưu tự động.</strong> Dữ liệu sẽ mất khi đóng tab — bấm “Lưu file dự án (.json)” trước khi thoát.
boot.no_xlsx: Không nạp được thư viện đọc Excel. Hãy tải lại trang.

# Thông báo dùng chung
msg.no_hc: Chưa có bảng định biên
