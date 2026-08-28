/* ==== 00b-xltable.js ==== */
/* ===========================================================
   XLTABLE — ghi file .xlsx có Table thật (ListObject) đặt tên được
   Tự viết ZIP (method STORE) nên không cần thư viện nén ngoài.
   Dùng cho các file mẫu import: người dùng gõ =TenBang[Cột] tham chiếu được.
   =========================================================== */
var XLTABLE = (function () {
  'use strict';

  /* ---- CRC32 ---- */
  var CRC = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  function crc32(buf) {
    var c = -1;
    for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }
  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var b = unescape(encodeURIComponent(str)), a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }

  /* ---- ZIP (stored) ---- */
  function zip(files) {
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data;
      var crc = crc32(data);
      var lh = new Uint8Array(30 + name.length);
      var dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
      lh.set(name, 30);
      parts.push(lh, data);

      var ch = new Uint8Array(46 + name.length);
      var cv = new DataView(ch.buffer);
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
    var cdSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    var all = parts.concat(central, [end]);
    var total = all.reduce(function (s, a) { return s + a.length; }, 0);
    var out = new Uint8Array(total), p = 0;
    all.forEach(function (a) { out.set(a, p); p += a.length; });
    return out;
  }

  /* ---- helpers ---- */
  function xs(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }
  function colName(n) {
    var s = '';
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }
  function safeName(s) {
    var n = String(s || 'Bang').replace(/[^A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
    if (!/^[A-Za-z_\u00C0-\u024F\u1E00-\u1EFF]/.test(n)) n = 'B_' + n;
    return n.slice(0, 60);
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function sheetXml(aoa, opts) {
    opts = opts || {};
    var nRow = aoa.length, nCol = 0;
    aoa.forEach(function (r) { nCol = Math.max(nCol, r.length); });
    nCol = Math.max(nCol, 1); nRow = Math.max(nRow, 1);
    var rows = aoa.map(function (r, i) {
      var cells = [];
      for (var j = 0; j < nCol; j++) {
        var v = r[j];
        if (v === undefined || v === null || v === '') continue;
        var ref = colName(j + 1) + (i + 1);
        var style = (i === 0 && opts.headerStyle) ? ' s="1"' : '';
        if (isNum(v)) cells.push('<c r="' + ref + '"' + style + '><v>' + v + '</v></c>');
        else cells.push('<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + xs(v) + '</t></is></c>');
      }
      return '<row r="' + (i + 1) + '">' + cells.join('') + '</row>';
    }).join('');
    var cols = '';
    if (opts.widths) {
      cols = '<cols>' + opts.widths.map(function (w, j) {
        return '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w + '" customWidth="1"/>';
      }).join('') + '</cols>';
    }
    var freeze = opts.freezeHeader
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<dimension ref="A1:' + colName(nCol) + nRow + '"/>' + freeze +
      '<sheetFormatPr defaultRowHeight="15"/>' + cols +
      '<sheetData>' + rows + '</sheetData>' +
      '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
      (opts.tableId ? '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>' : '') +
      '</worksheet>';
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /**
   * build({ tableName, headers, rows, widths, guide: [[...], ...], sheetName })
   * Trả về Uint8Array của file .xlsx
   */
  function build(spec) {
    var tname = safeName(spec.tableName || 'Bang');
    var headers = spec.headers || [];
    var rows = spec.rows && spec.rows.length ? spec.rows : [headers.map(function () { return ''; })];
    var aoa = [headers].concat(rows);
    var nCol = headers.length;
    var nRow = aoa.length;
    var ref = 'A1:' + colName(nCol) + nRow;
    var sheets = [{ name: spec.sheetName || 'DuLieu', aoa: aoa, tableId: 1 }];
    if (spec.guide && spec.guide.length) sheets.push({ name: 'HuongDan', aoa: spec.guide });

    var files = [];
    var ctOver = sheets.map(function (s, i) {
      return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }).join('');
    files.push({
      name: '[Content_Types].xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        ctOver +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>' +
        '</Types>')
    });
    files.push({
      name: '_rels/.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>')
    });
    files.push({
      name: 'xl/workbook.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + xs(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
        '</sheets></workbook>')
    });
    files.push({
      name: 'xl/_rels/workbook.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>')
    });
    files.push({ name: 'xl/styles.xml', data: utf8(STYLES) });
    sheets.forEach(function (s, i) {
      files.push({
        name: 'xl/worksheets/sheet' + (i + 1) + '.xml',
        data: utf8(sheetXml(s.aoa, {
          widths: i === 0 ? (spec.widths || headers.map(function (h) { return Math.max(12, Math.min(40, String(h).length + 6)); })) : [70],
          freezeHeader: i === 0, tableId: s.tableId, headerStyle: i !== 0
        }))
      });
    });
    files.push({
      name: 'xl/worksheets/_rels/sheet1.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/>' +
        '</Relationships>')
    });
    files.push({
      name: 'xl/tables/table1.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="' + tname + '" displayName="' + tname + '" ref="' + ref + '" totalsRowShown="0">' +
        '<autoFilter ref="' + ref + '"/>' +
        '<tableColumns count="' + nCol + '">' +
        headers.map(function (h, j) { return '<tableColumn id="' + (j + 1) + '" name="' + xs(h) + '"/>'; }).join('') +
        '</tableColumns>' +
        '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>' +
        '</table>')
    });
    return zip(files);
  }

  function download(spec, filename) {
    var data = build(spec);
    var blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  return { build: build, download: download, safeName: safeName };
})();



