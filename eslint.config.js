import js from '@eslint/js';
import globals from 'globals';

/* Thư viện gốc giữ nguyên xi theo yêu cầu của brief — không lint, không format,
   không kiểm kiểu. Đụng vào là mất tính "nguyên bản" đã cam kết. */
const VENDOR = ['public/vendor/**'];

/* Cú pháp. Đã chạy `npm run lint:fix` một lượt ở giai đoạn 3 rồi khoá lại ở
   'error' để không trôi ngược. Sửa bằng bộ fix của ESLint chứ không thay chuỗi:
   nó hiểu phạm vi biến nên tự từ chối khi không an toàn (var khai lại, dùng
   trước gán, đóng gói trong vòng lặp). */
const MODERNISE = {
  'no-var': 'error',
  'prefer-const': 'error',
  'prefer-arrow-callback': 'error',
  'object-shorthand': ['error', 'properties'],
};

/* Mã chết. Đã dọn tay ở giai đoạn 3 (ESLint không tự xoá vì không biết việc xoá
   có an toàn không) và khoá ở 'error'.
   `^_` là quy ước "nhận nhưng cố tình không dùng" — ví dụ guessRole(name, _values)
   giữ chữ ký cho khớp với guessType(). */
const DEAD_CODE = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
};

/* Luật bắt lỗi thật — 'error' ngay từ giai đoạn 1, CI phải xanh.
   Cùng với js.configs.recommended (no-undef, no-dupe-keys, no-fallthrough...)
   đây là phần lint có giá trị ngay lập tức. */
const CORRECTNESS = {
  eqeqeq: ['error', 'smart'],
};

export default [
  { ignores: [...VENDOR, 'node_modules/**', '.wrangler/**', 'test-artifacts/**'] },

  /* ---- Mã chạy trong trình duyệt ---- */
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, XLSX: 'readonly', XLTABLE: 'readonly' },
    },
    rules: { ...js.configs.recommended.rules, ...MODERNISE, ...DEAD_CODE, ...CORRECTNESS },
  },

  /* ---- Cloudflare Pages Functions (chạy trên workerd) ---- */
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.worker, atob: 'readonly', btoa: 'readonly' },
    },
    rules: { ...js.configs.recommended.rules, ...MODERNISE, ...DEAD_CODE, ...CORRECTNESS },
  },

  /* ---- Công cụ và test chạy bằng Node ---- */
  {
    files: ['tools/**/*.{js,mjs}', 'test/**/*.{js,mjs}', 'eslint.config.js', 'vitest.workspace.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules, ...MODERNISE, ...DEAD_CODE, ...CORRECTNESS },
  },

  /* ---- Phép kiểm e2e: chạy trong Node NHƯNG có những hàm gửi sang trình duyệt ----
     Hàm truyền cho page.evaluate() được Playwright chuyển sang trang và chạy ở
     đó, nên document/window/getComputedStyle trong thân chúng là hợp lệ. ESLint
     không phân biệt được hai thế giới trong cùng một tệp, nên mở cả hai bộ
     toàn cục cho riêng thư mục này. */
  {
    files: ['test/e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
