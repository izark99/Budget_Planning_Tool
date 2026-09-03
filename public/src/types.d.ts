/* Hình dạng dữ liệu dùng chung, khai bằng TypeScript nhưng KHÔNG hề ảnh hưởng
   lúc chạy: tệp .d.ts chỉ có kiểu, không có mã, không được nạp, không được
   deploy. `tsc --noEmit` đọc nó rồi kiểm JSDoc trong .js — vẫn zero-build.

   Ở đây chỉ để những hình dạng đi QUA RANH GIỚI MODULE, tức thứ mà nhiều tệp
   cùng phải hiểu giống nhau. Kiểu cục bộ trong một tệp thì viết JSDoc tại chỗ. */

/* SheetJS và XLTABLE nạp bằng thẻ <script> trong index.html nên nằm trên
   window chứ không import được. Khai ở đây để checkJs biết chúng có thật. */
interface Window {
  XLSX: any;
  XLTABLE: any;
}

/** Một dòng định biên: cột nào cũng được, tên cột do file .xlsx quyết định. */
type HcRow = Record<string, any> & {
  /** Hệ số định biên 12 tháng, ENGINE gắn thêm lúc chạy. */
  __m?: number[];
};

/** Một cột của bảng định biên sau khi người dùng gán vai trò ở màn Thiết lập. */
interface ColDef {
  /** Tên cột gốc trong file .xlsx. */
  src: string;
  /** Tên dùng trong công thức, mặc định bằng src. */
  alias: string;
  /** 'key' | 'pos' | 'unit' | 'attr' | 'month' | 'skip' */
  role: string;
  /** 1-12, chỉ có nghĩa khi role === 'month'. */
  month?: number;
  type?: string;
}

/** Biểu thức đặt tên, gọi được từ mọi công thức chi phí. */
interface SharedFormula {
  id: string;
  /** Tên gọi trong công thức, ví dụ LUONG_CO_BAN. */
  code: string;
  /** Diễn giải; cũng gọi được bằng cú pháp [Diễn giải]. */
  name: string;
  formula: string;
}

/** Một quy tắc trong Formula Code: điều kiện nào thì dùng công thức nào. */
interface FormulaRule {
  id: string;
  name: string;
  /** Biểu thức lọc dòng; rỗng = áp cho mọi dòng. */
  cond: string;
  formula: string;
}

interface FormulaCode {
  id: string;
  code: string;
  name: string;
  /** false = tắt hẳn Formula Code này; thiếu = đang bật. */
  active?: boolean;
  /** 'monthly' = mỗi tháng một lần; 'spread' = chia đều cho các tháng đã chọn. */
  mode: string;
  /** Các tháng 1-12 mà Formula Code này phát sinh. */
  months: number[];
  rules: FormulaRule[];
}

/** Đợt tăng lương: nhân thêm % từ một tháng nào đó. */
interface Raise {
  id: string;
  name: string;
  /** 1-12; đến từ ô nhập nên có thể là chuỗi, mã dùng `+r.fromMonth`. */
  fromMonth: number | string;
  /** Đến từ ô nhập nên có thể là chuỗi, mã dùng `parseFloat(String(...))`. */
  pct: number | string;
  cond: string;
  /** Mã Formula Code hoặc mã công thức dùng chung được áp; rỗng = mọi công thức chi phí. */
  formulas: string[];
  active: boolean;
}

/** % trích của MỘT Formula Code, theo giá trị của một cột phân loại × 12 tháng. */
interface Accrual {
  id: string;
  /** Formula Code được nhân %. */
  code: string;
  /** Tên cột phân loại; mỗi Formula Code chọn đúng một cột. */
  col: string;
  rows: Array<{
    /** Một giá trị của cột phân loại. */
    key: string;
    /** 12 phần trăm; ô rỗng = chưa khai = 100%. */
    m: Array<number | string>;
  }>;
}

/** Các tổ hợp do "Sinh sẵn từ định biên" dựng ra.
    `truncated` mang chính con số trần khi bị cắt — nơi gọi dựa vào đó để cảnh
    báo, thay vì cắt trong im lặng như bản cũ. */
type ComboRows = Array<Record<string, any>> & { truncated?: number };

/** Bộ lọc và tuỳ chọn của màn Bảng điều khiển, lưu trong S.ui.dash. */
interface DashFilters {
  extra: Array<{ col: string; val: string }>;
  stats: string[];
  costCode: string;
  formulaCode: string;
  groupCol: string;
  groupVal: string;
  sort: string;
  [k: string]: any;
}

/** Trạng thái dự án — thứ được ghi vào localStorage và vào file .json. */
interface ProjectState {
  /** Số hiệu định dạng; load() từ chối tệp có v khác. */
  v: number;
  meta: {
    name: string;
    year: number;
    /** Số lần sửa, và giá trị của nó tại lần lưu ra file .json gần nhất. Chênh
     *  nhau nghĩa là có thay đổi chưa có bản sao mang đi được. Dùng bộ đếm chứ
     *  không dùng mốc thời gian để không lọt thao tác trong cùng một mili-giây. */
    changeSeq?: number;
    exportedSeq?: number;
    /** Mốc lần lưu ra file gần nhất — chỉ để hiện "Đã lưu lúc …". */
    exportedAt?: number;
  };
  hc: { headers: string[]; rows: HcRow[]; file: string; at: string };
  cols: ColDef[];
  params: Array<{ name: string; value: number; note: string }>;
  classes: any[];
  policies: any[];
  shared: SharedFormula[];
  accruals: Accrual[];
  calendar: { groupCol: string; tables: any[] };
  formulas: FormulaCode[];
  maps: {
    costCode: any[];
    costCenter: any[];
    budgetCode: any[];
    accountCode: any[];
  };
  exceptions: any[];
  raises: Raise[];
  ui: {
    view: string;
    fSel?: any;
    collapsed?: Record<string, boolean>;
    /** Có thể thiếu trường: dashState() là nơi chuẩn hoá thành đủ bộ. */
    dash?: Partial<DashFilters>;
    /** Số dòng mỗi trang, dùng chung cho mọi bảng dài. 0 = xem tất cả. */
    pageSize?: number;
    /** Trần cho "Sinh sẵn từ định biên". 0 hoặc thiếu = không giới hạn. */
    comboLimit?: number;
    /** Hỏi trước khi tắt tab khi còn thay đổi chưa lưu ra file. Mặc định bật. */
    warnOnClose?: boolean;
    [k: string]: any;
  };
}

/** Một dòng của bảng pivot 4 tầng. */
interface PivotRow {
  accountCode: string;
  budgetCode: string;
  costCode: string;
  costCenter: string;
  formulaCode: string;
  formulaName: string;
  /** 12 tháng. */
  m: number[];
  total: number;
}

/** Kết quả một lần ENGINE.run(). */
interface BudgetResult {
  formulas: FormulaCode[];
  rows: HcRow[];
  /** data[chỉ số Formula Code][chỉ số dòng * 12 + tháng] — mảng phẳng cho nhanh. */
  data: Float64Array[];
  groupOf: any[];
  totalsByFc: number[];
  monthTotals: number[];
  grand: number;
  pivot: PivotRow[];
  conflicts: any[];
  warnings: Array<{ type: string; msg: string }>;
  formulaErrors: Array<{ where: string; msg: string }>;
  /** Cùng hình dạng với `data`, nhưng là số tiền khi BỎ HẾT mọi đợt tăng lương.
   *  null khi không có đợt tăng nào đang bật — khi đó không cấp phát gì cả. */
  dataNoRaise: Float64Array[] | null;
  /** Phần tiền mỗi đợt tăng lương cộng thêm, tính cộng dồn theo thứ tự khai báo
   *  nên tổng các phần đúng bằng `raiseTotal`. null khi không có đợt nào. */
  raiseImpact: RaiseImpact[] | null;
  /** Tổng ảnh hưởng của tăng lương = tổng `data` trừ tổng `dataNoRaise`. */
  raiseTotal: number;
  idCol: string;
  posCol: string;
  unitCol: string;
  /** Thời gian tính, mili-giây. */
  ms: number;
}

/** Một đợt tăng lương và phần tiền nó cộng thêm vào ngân sách. */
interface RaiseImpact {
  id: string;
  name: string;
  fromMonth: number;
  pct: number;
  /** Tiền cộng thêm do riêng đợt này. */
  total: number;
  /** Tiền cộng thêm theo từng tháng; cộng lại đúng bằng `total`. */
  byMonth: number[];
  /** Tiền cộng thêm theo từng Formula Code; cộng lại đúng bằng `total`. */
  byFc: Record<string, number>;
  /** Số lượt dòng × Formula Code mà đợt này thật sự chạm tới. */
  nRows: number;
}

/** Giá trị lỗi kiểu Excel mà FX trả về, ví dụ { __err: '#DIV/0!' }. */
interface FxError {
  __err: string;
}

/** Một biểu thức đã biên dịch. */
interface FxCompiled {
  ast: any;
  src: string;
  info: {
    /** Các cột [Tên cột] mà biểu thức dùng tới. */
    fields: string[];
    /** Các tên trần: hằng số, biến tháng, công thức dùng chung. */
    names: string[];
    /** true thì KHÔNG được nhớ kết quả dùng lại qua 12 tháng. */
    monthDependent: boolean;
  };
  eval: (ctx: FxCtx) => any;
}

/** Một bản ghi công thức dùng chung đã biên dịch, nằm trong FxCtx.shared. */
interface SharedRecord {
  code: string;
  name: string;
  /** null khi biểu thức sai cú pháp — lúc đó trả #NAME?. */
  fn: FxCompiled | null;
  err?: string | null;
  raises: Array<{ from: number; pct: number; condFn: FxCompiled | null }>;
}

/** Ngữ cảnh tính một biểu thức. engine.js dựng ra, expression.js đọc. */
interface FxCtx {
  row: HcRow;
  /** Tên cột viết thường -> tên cột thật, để [Cột] không phân biệt hoa thường. */
  fieldIndex: Record<string, string>;
  /** Hằng số toàn cục: LUONG_CO_SO, DON_GIA_AN_CA... */
  params: Record<string, number>;
  /** THANG, DINH_BIEN, SO_THANG và các trường ngày công đổi theo tháng;
   *  TONG_THANG, THANG_BAT_DAU là hằng của từng dòng. */
  vars: Record<string, number>;
  /** Công thức dùng chung, tra bằng tên viết HOA (cả code lẫn name). */
  shared: Record<string, SharedRecord>;
  lookups: Record<string, any>;
  /** Ngăn xếp chống tham chiếu vòng, expression.js tự quản. */
  __shStack?: Record<string, number>;
}

/** Kết quả thử MỘT dòng định biên với MỘT Formula Code (ENGINE.previewRow).
    Mọi trường đều tuỳ chọn: khi không có dòng nào, hoặc quy tắc hỏng, hoặc không
    nhóm nào khớp, hàm trả về sớm với một phần nhỏ trong số này. */
interface PreviewRow {
  /** Dòng định biên được thử. */
  row?: HcRow;
  /** Tên nhóm quy tắc khớp; null = không nhóm nào khớp. */
  group?: string | null;
  /** 12 bản ghi tháng: raw, raised, afterExc, amount... */
  months?: any[];
  total?: number;
  /** Số tháng Formula Code này phát sinh. */
  nSel?: number;
  /** Hệ số phân bổ: 1/nSel với mode 'spread', 1 với 'monthly'. */
  alloc?: number;
  error?: string;
  /** Giá trị cột khoá của dòng, để đối chiếu. */
  id?: any;
  hasRaise?: boolean;
  hasExc?: boolean;
  hasAccrual?: boolean;
  /** Bảng đối chiếu: mọi thông tin công thức dùng tới. */
  refs?: FxRef[];
}

/** Một dòng của bảng "Thông tin dùng trong công thức" ở màn thử một dòng. */
interface FxRef {
  /** Tên như người dùng gõ: [Coefficient], LUONG_CO_SO, THANG... */
  key: string;
  /** 'field' | 'param' | 'monthvar' | 'shared' */
  kind: string;
  /** true = một giá trị cho cả năm; false = 12 giá trị theo tháng. */
  constant: boolean;
  /** 12 giá trị theo tháng (rỗng khi có lỗi). */
  values: any[];
  value?: any;
  error?: string;
}
