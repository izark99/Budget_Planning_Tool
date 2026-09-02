/* Ba script trong tools/ chạy như phép kiểm, không phải chạy tay rồi quên.
   Cả ba đều đã bắt lỗi thật đi tới production:
     check-undefined     — render() đổi tên nhưng còn 4 chỗ gọi tên cũ
     check-content-keys  — 6 khoá role.* thiếu, giao diện hiện "role.attr"
     check-hardcoded-vi  — canh 40 chuỗi giao thức, không cho lẫn text giao diện */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, appSources, functionSources } from '../../tools/lib/sources.mjs';
import { check as checkKeys, parseContent } from '../../tools/check-content-keys.mjs';
import { check as checkUndef } from '../../tools/check-undefined.mjs';
import { check as checkVi } from '../../tools/check-hardcoded-vi.mjs';
import { loadEngine } from '../helpers/load-engine.mjs';

const SOURCES = [...appSources(), ...functionSources()];

describe('tên định danh', () => {
  it('mọi tên dùng trong mã đều có import hoặc khai báo', () => {
    const bad = checkUndef(SOURCES);
    expect(bad.map((b) => `${b.file}:${b.line} '${b.name}'`)).toEqual([]);
  });

  it('quét đủ mọi tệp nguồn, không bỏ sót tệp mới', () => {
    /* Nếu ai thêm màn hình mới mà quét vẫn ra đúng con số cũ thì lưới đã thủng. */
    expect(SOURCES.length).toBeGreaterThanOrEqual(17);
    expect(SOURCES.some((p) => p.includes('vendor'))).toBe(false);
  });
});

describe('content.md', () => {
  const r = checkKeys();

  it('không khoá nào mã dùng mà content.md thiếu', () => {
    expect(r.missing).toEqual([]);
  });

  it('không khoá trùng', () => {
    expect(r.dup.map((d) => `${d.key} (dòng ${d.line} và ${d.first})`)).toEqual([]);
  });

  it('không giá trị nào có khoảng trắng đầu/cuối bị trim() ăn mất', () => {
    expect(r.edgeSpace.map((e) => `dòng ${e.line} ${e.key}`)).toEqual([]);
  });

  /* Bộ đọc của tools/ và bộ đọc thật trong state.js phải hiểu content.md GIỐNG
     NHAU. Lệch một chút là mọi bảo đảm của script kiểm khoá thành vô nghĩa. */
  it('tools/ đọc content.md y hệt state.js đọc lúc chạy', async () => {
    const { content } = await loadEngine();
    const { keys } = parseContent(fs.readFileSync(path.join(ROOT, 'public/content.md'), 'utf8'));
    expect(Object.keys(content.STRINGS).sort()).toEqual([...keys.keys()].sort());
    for (const [k, v] of keys) {
      expect(content.t(k), k).toBe(v.value.replace(/\\n/g, '\n'));
    }
  });

  it('khoá thiếu thì t() trả về chính khoá, để lỗi lộ ra trên giao diện', async () => {
    const { content } = await loadEngine();
    expect(content.t('khoa.khong.he.ton.tai')).toBe('khoa.khong.he.ton.tai');
  });

  it('thay {placeholder} bằng giá trị truyền vào', async () => {
    const { content } = await loadEngine();
    expect(content.t('toast.import.rows', { n: 128 })).toContain('128');
  });
});

describe('chuỗi tiếng Việt trong mã', () => {
  const r = checkVi(SOURCES);

  it('không chuỗi giao diện nào còn nằm trong mã', () => {
    expect(r.unexpected.map((h) => `${h.file}:${h.line} ${JSON.stringify(h.value)}`)).toEqual([]);
  });

  it('danh sách miễn trừ không có mục lỗi thời', () => {
    expect(r.stale).toEqual([]);
  });
});
