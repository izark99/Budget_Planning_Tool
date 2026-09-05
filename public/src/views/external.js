/* ===========================================================
   MÀN 11 — NGÂN SÁCH NGOÀI ĐỊNH BIÊN

   Khoản tính sẵn ở ngoài: thuê ngoài trọn gói, đào tạo do phòng khác chốt, dự
   phòng ban giám đốc giao xuống. Không truy được về dòng nhân sự nào nên máy
   tính không dựng ra được — nhập thẳng vào đây, theo đúng NĂM TẦNG phân loại mà
   bảng pivot dùng, cộng 12 cột tháng.

   Gần như cả màn hình là một dataTable: nhờ vậy tải mẫu Excel, xuất dữ liệu ra
   và nhập ngược vào (có modal khớp cột) đều có sẵn, không phải chép tay.
   =========================================================== */
import { M, MONTHS, S, fmt, fmtShort, nkey, setRESULT, touch, uid } from '../core/state.js';
import { t } from '../core/content.js';
import { extMark, extSummary } from '../core/external.js';
import { el, renderSoon } from '../ui/dom.js';
import { dataTable } from '../ui/widgets.js';

/* Năm cột mã, theo đúng thứ tự của bảng pivot. `label` là CHUỖI GIAO THỨC:
   header của file .xlsx mẫu, đồng thời là khoá khớp cột khi nhập lại. */
const CODE_COLS = [
  { k: 'division', label: 'Division', map: 'division', pick: 'division' },
  { k: 'budgetCode', label: 'Budget Code', map: 'budgetCode', pick: 'budgetCode' },
  { k: 'costCenter', label: 'Cost Center', map: 'costCenter', pick: 'costCenter' },
  { k: 'costCode', label: 'Cost Code', map: 'costCode', pick: 'costCode' },
  { k: 'accountCode', label: 'Account Code', map: 'accountCode', pick: 'accountCode' }
];

/** Mã nào đã được khai ở màn Phân loại chi phí. Chỉ để NHẮC — khoản ngoài định
    biên được phép dùng mã chưa khai ở đâu, nên đây không bao giờ là điều kiện
    chặn. */
function declared(col) {
  const out = {};
  ((S.maps || {})[col.map] || []).forEach((x) => {
    const v = x && x[col.pick];
    if (v) out[nkey(v)] = 1;
  });
  return out;
}

/** Đếm mã lạ theo từng cột. */
function unmapped() {
  const rows = S.external || [];
  const out = [];
  CODE_COLS.forEach((c) => {
    const have = declared(c), seen = {}, bad = [];
    rows.forEach((r) => {
      const v = String(r[c.k] == null ? '' : r[c.k]).trim();
      if (!v || have[nkey(v)] || seen[nkey(v)]) return;
      seen[nkey(v)] = 1; bad.push(v);
    });
    if (bad.length) out.push({ label: c.label, list: bad });
  });
  return out;
}

function blankLine() {
  const r = { id: uid(), name: '' };
  CODE_COLS.forEach((c) => { r[c.k] = ''; });
  for (let i = 1; i <= M; i++) r['m' + i] = '';
  return r;
}

function viewExternal() {
  const wrap = el('div');
  const A = extSummary();

  /* ---------- dải tổng ---------- */
  if (A.n) {
    let peak = 0;
    for (let i = 1; i < M; i++) if (A.months[i] > A.months[peak]) peak = i;
    wrap.appendChild(el('div', { class: 'stats' }, [
      el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: t('ext.card_grand') }),
        el('div', { class: 'v money', text: fmtShort(A.grand) }),
        el('div', { class: 'u', text: t('dash.currency', { n: fmt(A.grand) }) })
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: t('ext.card_lines') }),
        el('div', { class: 'v', text: fmt(A.n) })
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: t('ext.card_peak') }),
        el('div', { class: 'v', text: A.grand ? MONTHS[peak] : '–' }),
        el('div', { class: 'u', text: A.grand ? fmtShort(A.months[peak]) : '' })
      ])
    ]));
  }

  /* ---------- bảng ----------
     Năm cột mã CỐ Ý là type:'text', không phải type:'select'. dataTable dựng
     <select> cứng khi danh sách ≤ 25 lựa chọn, tức là KHÔNG gõ được mã mới — mà
     ngân sách ngoài định biên rất hay dùng mã chưa khai ở đâu, và một giá trị
     ngoài danh sách còn bị <select> hiện thành trắng trong khi state vẫn giữ số
     thật. Nhắc bằng hộp cảnh báo bên trên, không chặn bằng ô chọn. */
  /** @type {Array<{k: string, label: string, type: string, key?: boolean, w: number}>} */
  const cols = [];
  CODE_COLS.forEach((c) => { cols.push({ k: c.k, label: c.label, type: 'text', key: true, w: 132 }); });
  /* CHUỖI GIAO THỨC: label là header file mẫu .xlsx và khoá khớp khi nhập lại */
  cols.push({ k: 'name', label: 'Diễn giải', type: 'text', w: 200 });
  MONTHS.forEach((mn, i) => { cols.push({ k: 'm' + (i + 1), label: mn, type: 'num', w: 92 }); });

  function chg() { setRESULT(null); touch(); }
  function chgNow() { setRESULT(null); touch(); renderSoon(); }

  /* Mã chưa khai ở màn Phân loại chi phí là chuyện BÌNH THƯỜNG ở đây, không
     phải lỗi — khoản ngoài định biên vốn được phép dùng mã riêng. Nên nó là một
     cái nhãn xám và một dòng chữ nhạt, không phải hộp cảnh báo màu: một cảnh
     báo lúc nào cũng bật thì chỉ còn là tiếng ồn. */
  const bad = unmapped();
  const nBad = bad.reduce((a, x) => { return a + x.list.length; }, 0);

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('ext.table_title') }),
      el('span', { class: 'tag' + (A.n ? ' g' : ''), text: A.n ? t('table.info.rows', { n: fmt(A.n) }) : t('ext.no_lines') }),
      nBad ? el('span', { class: 'tag', text: t('ext.unmapped_some', { n: nBad }) }) : null
    ]),
    el('div', { class: 'body' }, [
      el('p', { class: 'hint', style: 'margin:0', text: t('ext.help', { mark: extMark() }) }),
      nBad ? el('p', { class: 'hint', style: 'margin:8px 0 0' }, [
        el('span', { text: t('ext.unmapped_note') + ' ' }),
        el('span', { class: 'muted', text: bad.map((x) => {
          return x.label + ': ' + x.list.slice(0, 8).join(', ') + (x.list.length > 8 ? ' …' : '');
        }).join(' · ') })
      ]) : null
    ]),
    el('div', { class: 'body tight' }, [dataTable({
      columns: cols,
      rows: function () { return S.external; },
      blank: blankLine,
      onChange: chg,
      /* Nhập / xoá sạch đổi cả dải tổng lẫn danh sách mã lạ ở trên, nên dựng lại
         cả màn — gõ từng phím thì KHÔNG, kẻo mất con trỏ. */
      onImported: chgNow,
      tableName: 'tblNgoaiDinhBien', sheetName: 'NgoaiDinhBien',
      title: t('ext.table_title'),
      guide: [t('ext.guide')]
    })])
  ]));

  return wrap;
}

export { CODE_COLS, blankLine, unmapped, viewExternal };
