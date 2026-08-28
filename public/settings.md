# settings.md — cấu hình KHÔNG nhạy cảm, đọc được từ trình duyệt
#
# Mật khẩu và khoá ký KHÔNG nằm ở đây. Chúng là secret trên Cloudflare,
# khai báo bằng `wrangler pages secret put` — xem README.
#
# Cùng định dạng với content.md: `khoá: giá trị`, bỏ dòng trống và dòng #.

app.name: Lập ngân sách định biên
app.owner: Phòng Nhân sự

# Số phút hết hạn phiên, chỉ để HIỂN THỊ cho người dùng biết.
# Giá trị có hiệu lực thật là biến môi trường SESSION_MINUTES trên Cloudflare.
session.minutes.display: 30
