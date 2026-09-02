#!/usr/bin/env node
/* Quét chuỗi tiếng Việt còn nằm trong mã. Mọi chuỗi hiển thị PHẢI đi qua
   t(key) và sống ở public/content.md — trừ đúng những chuỗi trong danh sách
   miễn trừ dưới đây, là CHUỖI GIAO THỨC hoặc GIÁ TRỊ MỒI, không phải văn bản
   giao diện. Dịch hay sửa chúng là hỏng chức năng.

   Danh sách khoá theo GIÁ TRỊ chứ không theo file:dòng, để còn đúng sau khi
   giai đoạn 2 xáo lại cây thư mục. Script cũng báo mục đã lỗi thời (có trong
   danh sách nhưng không còn trong mã) để danh sách không phình ra vô tội vạ. */
import { parse } from 'acorn';
import fs from 'node:fs';
import { appSources, functionSources, rel } from './lib/sources.mjs';

const VN = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;

export const ALLOWED = new Map([
  /* --- Chuỗi dựng lúc khởi động, KHÔNG dùng t() được vì content.md chưa nạp --- */
  ['Không tải được content.md. Hãy tải lại trang. (', 'thông báo dự phòng khi chính content.md hỏng'],

  /* --- CAL_FIELDS: tên dòng của bảng ngày công, đồng thời là tên cột file .xlsx --- */
  ['Ngày công chuẩn', 'CAL_FIELDS — tên cột file Excel ngày công'],
  ['Ngày công làm việc thực tế', 'CAL_FIELDS — tên cột file Excel ngày công'],
  ['Ngày nghỉ lễ', 'CAL_FIELDS — tên cột file Excel ngày công'],
  ['Ngày nghỉ phép có lương', 'CAL_FIELDS — tên cột file Excel ngày công'],
  ['Ngày nghỉ có lương khác', 'CAL_FIELDS — tên cột file Excel ngày công'],

  /* --- Giá trị mồi của defaultState(): ghi thẳng vào .json dự án của người dùng.
         Đổi ở đây thì file dự án cũ và mới không còn khớp nhau. --- */
  ['Ngân sách nhân sự', 'defaultState — tên dự án mồi'],
  ['Mức lương cơ sở nhân với hệ số', 'defaultState — diễn giải hằng số mồi'],
  ['Đơn giá một suất ăn ca', 'defaultState — diễn giải hằng số mồi'],
  ['% công ty đóng — dùng dạng TY_LE_BHXH_CTY%', 'defaultState — diễn giải hằng số mồi'],
  ['Lương theo hệ số', 'defaultState — tên Formula Code mồi'],
  ['BHXH-BHYT-BHTN phần công ty', 'defaultState — tên Formula Code mồi'],
  ['Phụ cấp điện thoại', 'defaultState — tên Formula Code mồi'],
  ['Du lịch nghỉ mát', 'defaultState — tên Formula Code mồi'],
  ['Tăng lương định kỳ', 'defaultState — tên đợt tăng lương mồi'],
  ['Tất cả', 'giá trị mồi — tên nhóm mặc định trong quy tắc'],
  ['Mặc định', 'giá trị mồi — tên nhóm mặc định trong quy tắc'],

  /* --- Giá trị mồi khi người dùng bấm "thêm" trên giao diện: ghi vào state --- */
  ['Nhóm mới', 'giá trị mồi khi thêm nhóm phân loại'],
  ['Công thức mới', 'giá trị mồi khi thêm Formula Code'],
  ['Chính sách mới', 'giá trị mồi khi thêm chính sách'],
  ['Nhóm ', 'tiền tố sinh tên nhóm mới (Nhóm 1, Nhóm 2…) — ghi vào state'],
  ['Nhóm', 'tiền tố sinh tên nhóm mới — ghi vào state'],
  ['Đợt tăng ', 'tiền tố sinh tên đợt tăng lương — ghi vào state'],
  ['Cột ', 'tiền tố sinh tên cột phân loại — ghi vào state'],
  ['Còn lại', 'tên quy tắc mặc định cuối danh sách — ghi vào state'],

  /* --- Tên cột của file .xlsx mẫu, đồng thời là khoá khớp khi nhập lại --- */
  ['Tên Cost Code', 'tên cột file Excel bảng ánh xạ'],
  ['Tên Cost Center', 'tên cột file Excel bảng ánh xạ'],
  ['Diễn giải', 'tên cột file Excel bảng ánh xạ'],
  ['Mức tiền', 'tên cột file Excel bảng chính sách'],

  /* --- Danh sách nhận diện tên cột khi nhập file định biên của người dùng --- */
  ['mã nv', 'nhận diện cột khoá trong file định biên'],
  ['mã nhân viên', 'nhận diện cột khoá trong file định biên'],
  ['mã số', 'nhận diện cột khoá trong file định biên'],
  ['chức danh', 'nhận diện cột chức danh trong file định biên'],
  ['vị trí', 'nhận diện cột chức danh trong file định biên'],
  ['bộ phận', 'nhận diện cột đơn vị trong file định biên'],
  ['đơn vị', 'nhận diện cột đơn vị trong file định biên'],
]);

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => walkAst(n, visit));
  visit(node);
  for (const k in node) if (k !== 'loc' && k !== 'range') walkAst(node[k], visit);
}

export function check(files) {
  const hits = [];
  for (const p of files) {
    const ast = parse(fs.readFileSync(p, 'utf8'), {
      ecmaVersion: 2022, sourceType: 'module', locations: true,
    });
    walkAst(ast, (n) => {
      if (n.type === 'Literal' && typeof n.value === 'string' && VN.test(n.value)) {
        hits.push({ file: rel(p), line: n.loc.start.line, value: n.value });
      } else if (n.type === 'TemplateLiteral') {
        for (const q of n.quasis) {
          if (VN.test(q.value.raw)) hits.push({ file: rel(p), line: q.loc.start.line, value: q.value.raw });
        }
      }
    });
  }
  const seen = new Set(hits.map((h) => h.value));
  return {
    hits,
    unexpected: hits.filter((h) => !ALLOWED.has(h.value)),
    stale: [...ALLOWED.keys()].filter((v) => !seen.has(v)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = [...appSources(), ...functionSources()];
  const r = check(files);
  for (const h of r.unexpected) {
    console.log(`   ✗ ${h.file}:${h.line}  ${JSON.stringify(h.value).slice(0, 90)}`);
    console.log('     -> đưa sang public/content.md và gọi qua t(key), hoặc thêm vào ALLOWED kèm lý do');
  }
  for (const v of r.stale) console.log(`   ! miễn trừ đã lỗi thời (không còn trong mã): ${JSON.stringify(v)}`);
  const bad = r.unexpected.length + r.stale.length;
  console.log(bad
    ? `\n${bad} vấn đề`
    : `\n${r.hits.length} chuỗi tiếng Việt trong mã, tất cả đều là chuỗi giao thức / giá trị mồi đã đăng ký.`);
  process.exit(bad ? 1 : 0);
}
