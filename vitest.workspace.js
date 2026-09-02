/* Hai nhóm phép kiểm, tách ra vì chi phí rất khác nhau:

   unit — thuần Node, không trình duyệt, không máy chủ. Chạy trong mili-giây.
          Đây là nơi đặt golden master: nạp thẳng state.js + formula.js rồi so
          chuỗi canonical. Chạy được trên máy vừa clone về, không cần cài gì
          ngoài `npm ci`.

   e2e  — dựng pages-host (mô phỏng Cloudflare Pages Functions) rồi lái Chromium
          thật. Chậm hơn nhiều nên để riêng: `npm test` chỉ chạy unit,
          `npm run verify` chạy cả hai. Cần Chromium (biến CHROMIUM_PATH). */
/* Vite coi thư mục public/ là "tài sản tĩnh" và chặn import từ đó. Nhưng ở dự
   án này public/ CHÍNH LÀ mã nguồn, và chuỗi như import('/modules/state.js')
   trong page.evaluate là để trình duyệt chạy chứ không phải để Vite phân giải.
   Tắt hẳn quy ước đó đi. */
const publicDir = false;

export default [
  {
    publicDir,
    test: {
      name: 'unit',
      include: ['test/unit/**/*.test.js'],
      environment: 'node',
    },
  },
  {
    publicDir,
    test: {
      name: 'e2e',
      include: ['test/e2e/**/*.test.js'],
      environment: 'node',
      testTimeout: 120000,
      hookTimeout: 120000,
      /* Mỗi tệp dựng máy chủ + trình duyệt riêng; chạy song song thì tranh cổng
         và ngốn RAM. Tuần tự cho chắc. */
      fileParallelism: false,
    },
  },
];
