/* ===========================================================
   XLSX-WRITE — ghi .xlsx NHIỀU SHEET có định dạng.

   Vì sao tự viết: bản SheetJS trong repo là bản cộng đồng, ghi được độ rộng cột
   và định dạng số nhưng KHÔNG ghi được tô đậm, tô nền, viền hay đóng băng dòng
   (id phông/nền/viền bị ghi cứng bằng 0 trong bộ ghi của nó). Còn vendor/xltable.js
   đã tự viết đủ những thứ đó từ lâu — chỉ vướng mỗi chuyện nó chuyên cho MỘT
   sheet có một Table. Module này đi đúng cách đó, mở cho nhiều sheet.

   Không đụng vào vendor/, không thêm thư viện nào.

   GIỮ NGUYÊN ĐỊA CHỈ VÀ GIÁ TRỊ Ô: file xuất ra được so với golden tới từng ô.
   Định dạng nằm ở styles.xml và thuộc tính s= nên golden không thấy — đúng ý:
   nó vẫn là bằng chứng rằng số liệu không đổi.
   =========================================================== */

/* ---- CRC32 ---- */
const CRC = (function () {
  const tb = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    tb[n] = c;
  }
  return tb;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function utf8(str) { return new TextEncoder().encode(str); }

/* ---- ZIP, method STORE: không cần thư viện nén ---- */
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  files.forEach((f) => {
    const name = utf8(f.name), data = f.data, crc = crc32(data);
    const lh = new Uint8Array(30 + name.length), dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
    dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
    lh.set(name, 30);
    parts.push(lh, data);

    const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);
    offset += lh.length + data.length;
  });
  const cdSize = central.reduce((s, c) => { return s + c.length; }, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = parts.concat(central, [end]);
  const total = all.reduce((s, a) => { return s + a.length; }, 0);
  const out = new Uint8Array(total);
  let p = 0;
  all.forEach((a) => { out.set(a, p); p += a.length; });
  return out;
}

function xs(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    /* XML 1.0 cấm hẳn những ký tự điều khiển này — lọt vào là Excel từ chối mở
       cả file. Dữ liệu đến từ file .xlsx người dùng nạp lên nên phải phòng. */
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}
function colName(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

/* ---- Kiểu ô ----
   Bốn kiểu định dạng số, mỗi kiểu có bản thường và bản đậm (dòng tổng), cộng
   một kiểu riêng cho dòng tiêu đề. Chỉ số phải khớp đúng thứ tự trong cellXfs. */
const FMT = { text: 0, money: 1, num: 2, int: 3 };
const HEADER_XF = 4;
/** @param {number} f @param {boolean} bold */
function xf(f, bold) { return bold ? 5 + f : f; }

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  /* 164 tiền: dấu phân cách nghìn, âm trong ngoặc. 165 hệ số: tối đa 3 thập phân. */
  + '<numFmts count="2">'
  + '<numFmt numFmtId="164" formatCode="#,##0;(#,##0)"/>'
  + '<numFmt numFmtId="165" formatCode="#,##0.###"/>'
  + '</numFmts>'
  + '<fonts count="3">'
  + '<font><sz val="11"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><color rgb="FF1B3A2F"/><name val="Calibri"/></font>'
  + '</fonts>'
  + '<fills count="3">'
  + '<fill><patternFill patternType="none"/></fill>'
  + '<fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFE4EFE9"/><bgColor indexed="64"/></patternFill></fill>'
  + '</fills>'
  + '<borders count="2">'
  + '<border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left/><right/><top/><bottom style="thin"><color rgb="FF9FB5AA"/></bottom><diagonal/></border>'
  + '</borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="9">'
  /* 0-3: thường — chữ, tiền, hệ số, số nguyên */
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  /* 4: tiêu đề — đậm, nền xanh nhạt, gạch chân */
  + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
  /* 5-8: đậm, cùng bốn định dạng số — dùng cho dòng TỔNG */
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>'
  + '<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>'
  + '<xf numFmtId="1" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>'
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

function isNum(v) { return typeof v === 'number' && isFinite(v); }

/** Độ rộng cột: theo nội dung thật, có sàn và trần để không quá hẹp hay quá dài. */
function autoWidths(aoa, nCol) {
  const w = new Array(nCol).fill(9);
  const cap = Math.min(aoa.length, 400);   /* đo 400 dòng đầu là đủ đại diện */
  for (let i = 0; i < cap; i++) {
    const r = aoa[i] || [];
    for (let j = 0; j < nCol; j++) {
      const v = r[j];
      if (v == null || v === '') continue;
      const len = isNum(v) ? String(Math.round(v)).length + 4 : String(v).length + 2;
      if (len > w[j]) w[j] = len;
    }
  }
  return w.map((x) => { return Math.max(9, Math.min(38, x)); });
}

/**
 * Một sheet: { name, aoa, fmt?, header?, totalRows? }
 *   fmt        mảng kiểu định dạng theo cột ('text'|'money'|'num'|'int')
 *   header     có dòng tiêu đề ở hàng 1 không (mặc định có)
 *   totalRows  chỉ số các dòng cần in đậm (dòng TỔNG)
 */
function sheetXml(sh) {
  const aoa = sh.aoa;
  let nCol = 0;
  aoa.forEach((r) => { nCol = Math.max(nCol, r.length); });
  nCol = Math.max(nCol, 1);
  const nRow = Math.max(aoa.length, 1);
  const hasHead = sh.header !== false;
  const tot = {};
  (sh.totalRows || []).forEach((i) => { tot[i] = 1; });
  const fmt = sh.fmt || [];

  const rows = aoa.map((r, i) => {
    const cells = [];
    for (let j = 0; j < nCol; j++) {
      const v = r[j];
      if (v === undefined || v === null || v === '') continue;
      const ref = colName(j + 1) + (i + 1);
      const st = (hasHead && i === 0) ? HEADER_XF : xf(FMT[fmt[j]] || 0, !!tot[i]);
      const sAttr = st ? ' s="' + st + '"' : '';
      if (isNum(v)) cells.push('<c r="' + ref + '"' + sAttr + '><v>' + v + '</v></c>');
      else cells.push('<c r="' + ref + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' + xs(v) + '</t></is></c>');
    }
    return '<row r="' + (i + 1) + '">' + cells.join('') + '</row>';
  }).join('');

  const widths = sh.widths || autoWidths(aoa, nCol);
  const cols = '<cols>' + widths.slice(0, nCol).map((w, j) => {
    return '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w + '" customWidth="1"/>';
  }).join('') + '</cols>';

  /* Đóng băng dòng tiêu đề — cuộn xuống vẫn biết cột nào là cột nào. */
  const view = hasHead
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  /* Lọc ngay trên dòng tiêu đề. Bỏ dòng TỔNG ra khỏi vùng lọc. */
  const lastData = nRow - (sh.totalRows || []).length;
  const filter = hasHead && lastData > 1
    ? '<autoFilter ref="A1:' + colName(nCol) + lastData + '"/>' : '';

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<dimension ref="A1:' + colName(nCol) + nRow + '"/>' + view
    + '<sheetFormatPr defaultRowHeight="15"/>' + cols
    + '<sheetData>' + rows + '</sheetData>' + filter
    + '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
    + '</worksheet>';
}

/**
 * Dựng workbook nhiều sheet có định dạng.
 * @param {Array<{name: string, aoa: any[][], fmt?: string[], header?: boolean, totalRows?: number[], widths?: number[]}>} sheets
 * @returns {Uint8Array}
 */
function buildWorkbook(sheets) {
  const files = [];
  const over = sheets.map((s, i) => {
    return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
  }).join('');
  files.push({
    name: '[Content_Types].xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + over
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>')
  });
  files.push({
    name: '_rels/.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>')
  });
  files.push({
    name: 'xl/workbook.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
      + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + sheets.map((s, i) => { return '<sheet name="' + xs(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('')
      + '</sheets></workbook>')
  });
  files.push({
    name: 'xl/_rels/workbook.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((s, i) => { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('')
      + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>')
  });
  files.push({ name: 'xl/styles.xml', data: utf8(STYLES) });
  sheets.forEach((s, i) => {
    files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: utf8(sheetXml(s)) });
  });
  return zip(files);
}

export { buildWorkbook, colName };
