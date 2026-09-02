/* Đọc .xlsx thành { sheet: { ô: giá trị } } — không phụ thuộc thư viện nào.
   .xlsx là một tệp ZIP chứa XML, nên chỉ cần một bộ đọc ZIP tối giản
   (zlib có sẵn trong Node) và vài biểu thức chính quy trên XML.
   Dùng để so file Excel xuất ra với golden dạng JSON đọc được trong diff, thay
   vì so hai tệp nhị phân mà không ai biết lệch ở đâu. */
import zlib from 'node:zlib';

/* ---------- ZIP: đọc từ Central Directory ngược về, đúng chuẩn ---------- */
function unzip(buf) {
  const EOCD = 0x06054b50;
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== EOCD) end--;
  if (end < 0) throw new Error('không phải tệp ZIP hợp lệ');
  const nEntries = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);

  const files = new Map();
  for (let i = 0; i < nEntries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('hỏng central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + cmtLen;

    /* Kích thước phần đầu cục bộ khác phần trong central directory — phải đọc lại. */
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataOff = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataOff, dataOff + compSize);
    files.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
  }
  return files;
}

const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unesc = (s) => s.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (m, e) =>
  e[0] === '#' ? String.fromCharCode(+e.slice(1)) : XML_ENT[e]);

/** @returns {Record<string, Record<string,string>>} theo tên sheet, rồi theo địa chỉ ô */
export function readCells(buf) {
  const z = unzip(buf);
  const text = (n) => (z.has(n) ? z.get(n).toString('utf8') : '');

  const names = [...text('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]*)"/g)].map((m) => unesc(m[1]));

  /* sharedStrings: mỗi <si> có thể gồm nhiều <t> (chuỗi định dạng từng đoạn). */
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unesc(x[1])).join(''));

  const out = {};
  names.forEach((nm, i) => {
    const sheet = text(`xl/worksheets/sheet${i + 1}.xml`);
    if (!sheet) return;
    const cells = {};
    for (const m of sheet.matchAll(/<c\s([^>]*?)\/?>(?:([\s\S]*?)<\/c>)?/g)) {
      const attrs = m[1], body = m[2] || '';
      const ref = /r="([^"]+)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      if (type === 'inlineStr') {
        const t = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unesc(x[1])).join('');
        if (t !== '') cells[ref] = t;
        continue;
      }
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (v == null) continue;
      cells[ref] = type === 's' ? shared[+v] : unesc(v);
    }
    out[nm] = cells;
  });
  return out;
}

/** So hai bộ ô, bỏ qua những ô ĐƯỢC PHÉP khác (dấu thời gian lúc xuất). */
export function diffCells(a, b, expected = []) {
  const skip = new Set(expected.map(([s, r]) => s + '!' + r));
  const sheetsA = Object.keys(a).sort(), sheetsB = Object.keys(b).sort();
  if (String(sheetsA) !== String(sheetsB)) {
    return { total: 0, diffs: [`danh sách sheet lệch: ${sheetsA} vs ${sheetsB}`], skipped: [] };
  }
  let total = 0;
  const diffs = [], skipped = [];
  for (const nm of sheetsA) {
    for (const ref of new Set([...Object.keys(a[nm]), ...Object.keys(b[nm])])) {
      total++;
      if (a[nm][ref] === b[nm][ref]) continue;
      const line = `${nm}!${ref}: thực tế=${JSON.stringify(a[nm][ref])} golden=${JSON.stringify(b[nm][ref])}`;
      if (skip.has(nm + '!' + ref)) skipped.push(line); else diffs.push(line);
    }
  }
  return { total, diffs, skipped };
}
