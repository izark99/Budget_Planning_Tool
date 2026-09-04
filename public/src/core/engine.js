/* ===========================================================
   ENGINE v2 — máy tính ngân sách

   định biên → cột nhóm dẫn xuất → công thức theo nhóm → tăng lương
   → tờ trình → phân bổ tháng → hệ số định biên → % trích
   → Cost Code / Cost Center / Division / Budget Code / Account Code

   Tầng NGHIỆP VỤ: biết định biên là gì, Formula Code là gì. Gọi xuống
   expression.js để tính biểu thức; expression.js không biết gì về nơi này.
   =========================================================== */
import { CAL_FIELDS, classDef, classOuts, fmt, MONTHS, nkey, numOf, S } from './state.js';
import { t } from './content.js';
import { FX } from './expression.js';

const ENGINE = (function () {
  'use strict';
  const M = 12;

  /* Làm tròn lên theo bội số, hướng ra xa 0 giống ROUNDUP của Excel */
  function roundUpTo(x, step) {
    if (!isFinite(x) || !step) return x;
    const sign = x < 0 ? -1 : 1;
    return sign * Math.ceil(Math.abs(x) / step - 1e-9) * step;
  }

  function roleCol(role) {
    const c = (S.cols || []).filter((x) => { return x.role === role; })[0];
    return c ? c.alias : '';
  }
  function monthCols() {
    return (S.cols || []).filter((x) => { return x.role === 'month' && x.month >= 1 && x.month <= M; })
      .sort((a, b) => { return a.month - b.month; });
  }
  /* Hai biến hệ thống của TỪNG DÒNG, đọc từ mảng định biên 12 tháng:
       TONG_THANG    số tháng có định biên > 0
       THANG_BAT_DAU tháng đầu tiên có định biên > 0 (0 nếu dòng trống)
     Hằng theo tháng — tính một lần mỗi dòng, và KHÔNG nằm trong MONTH_VARS của
     expression.js, nếu không mọi công thức dùng chúng đều mất bộ nhớ đệm eval. */
  function rowVars(hcArr) {
    const a = hcArr || []; let n = 0, first = 0;
    for (let m = 0; m < M; m++) {
      if (!a[m]) continue;
      n++; if (!first) first = m + 1;
    }
    return { TONG_THANG: n, THANG_BAT_DAU: first };
  }

  function attrCols() {
    return (S.cols || []).filter((x) => { return x.role !== 'skip' && x.role !== 'month'; });
  }
  /* Mọi tên cột dùng được trong công thức: cột định biên + cột nhóm dẫn xuất */
  function usableCols() {
    return attrCols().map((c) => { return c.alias; })
      .concat(classCols())
      .concat(policyCols());
  }
  /* Mọi cột do bảng phân loại nhóm sinh ra — một bảng có thể sinh nhiều cột. */
  function classCols() {
    const out = [];
    (S.classes || []).forEach((c) => {
      classOuts(c).forEach((o) => { out.push(o.name); });
    });
    return out;
  }
  function policyCols() {
    const out = [];
    (S.policies || []).forEach((p) => {
      (p.outs || []).forEach((o) => { if (o && o.name) out.push(o.name); });
    });
    return out;
  }

  /* Dựng sổ đăng ký công thức dùng chung.
     Trả về { reg, monthDep, errors }:
       reg      — tra theo code VÀ theo name (đều viết hoa), cùng trỏ về một định nghĩa
       monthDep — code nào phụ thuộc tháng (trực tiếp, qua raise, hay qua công thức
                  dùng chung khác). Thiếu bước lan truyền này thì công thức chi phí
                  gọi tới nó sẽ bị cache nhầm giữa các tháng.
     Tăng lương chỉ áp cho công thức dùng chung khi được LIỆT KÊ ĐÍCH DANH.
     Danh sách rỗng vẫn giữ nghĩa cũ là "mọi công thức chi phí", nếu cho nó áp luôn
     cho công thức dùng chung thì một đợt tăng sẽ bị tính hai lần. */
  function buildShared(raiseList) {
    const defs = (S.shared || []).filter((x) => { return x && nkey(x.code); });
    /** @type {Record<string, SharedRecord>} */
    const reg = {};
    /** @type {Record<string, SharedRecord>} */
    const byCode = {};
    const errors = [];

    defs.forEach((d) => {
      const code = nkey(d.code);
      const c = FX.tryCompile(String(d.formula == null ? '' : d.formula).trim() || '0');
      const rec = { code, name: d.name || '', fn: c.ok ? c.fn : null, err: c.ok ? null : c.error, raises: [] };
      if (!c.ok) errors.push({ where: code, msg: c.error });
      byCode[code] = rec;
      reg[code] = rec;
      if (nkey(d.name)) reg[nkey(d.name)] = rec;
    });

    (raiseList || S.raises || []).forEach((r) => {
      if (r.active === false) return;
      const list = (r.formulas || []).map(nkey);
      if (!list.length) return;                       /* rỗng = chỉ áp cho công thức chi phí */
      let cf = null;
      if (r.cond && String(r.cond).trim()) { const cc = FX.tryCompile(r.cond); if (cc.ok) cf = cc.fn; }
      list.forEach((code) => {
        if (byCode[code]) byCode[code].raises.push({ from: +r.fromMonth || 1, pct: parseFloat(String(r.pct)) || 0, condFn: cf });
      });
    });

    /* lan truyền phụ thuộc tháng qua đồ thị tham chiếu */
    const monthDep = {}, seen = {};
    function dep(code) {
      if (Object.prototype.hasOwnProperty.call(monthDep, code)) return monthDep[code];
      const rec = byCode[code];
      if (!rec || !rec.fn) return (monthDep[code] = false);
      if (seen[code]) return false;                   /* vòng tròn: chặn đệ quy vô hạn */
      seen[code] = 1;
      let d = rec.fn.info.monthDependent || rec.raises.length > 0;
      if (!d) {
        const refs = rec.fn.info.names.concat(rec.fn.info.fields.map(nkey));
        for (let i = 0; i < refs.length && !d; i++) {
          const target = reg[nkey(refs[i])];
          if (target && target.code !== code) d = dep(target.code);
        }
      }
      delete seen[code];
      return (monthDep[code] = d);
    }
    Object.keys(byCode).forEach(dep);
    return { reg, monthDep, errors };
  }

  /* Công thức có phụ thuộc tháng không — tính cả qua công thức dùng chung nó gọi. */
  function fnMonthDep(fn, sh) {
    if (!fn) return false;
    if (fn.info.monthDependent) return true;
    if (!sh) return false;
    const refs = fn.info.names.concat(fn.info.fields.map(nkey));
    for (let i = 0; i < refs.length; i++) {
      const rec = sh.reg[nkey(refs[i])];
      if (rec && sh.monthDep[rec.code]) return true;
    }
    return false;
  }

  /* % trích theo phân loại — tra theo Formula Code, giá trị cột phân loại, và tháng.
     Trả về HỆ SỐ (1 = 100%). Không khai, khai thiếu tháng, hay ô để trống đều ra 1,
     nên thêm tính năng này mà chưa khai gì thì kết quả không đổi một đồng. */
  function buildAccruals() {
    const by = {};
    (S.accruals || []).forEach((a) => {
      if (!a || !nkey(a.code) || !a.col) return;
      const map = {};
      (a.rows || []).forEach((r) => { if (r) map[nkey(r.key)] = r.m || []; });
      by[nkey(a.code)] = { col: a.col, map };
    });
    return by;
  }
  function accrualFactor(acc, code, row, m) {
    const a = acc && acc[nkey(code)];
    if (!a) return 1;
    const arr = a.map[nkey(row[a.col])];
    if (!arr) return 1;
    const raw = arr[m - 1];
    if (raw === '' || raw === null || raw === undefined) return 1;
    const n = numOf(raw);
    return isNaN(n) ? 1 : n / 100;
  }

  function buildParams() {
    /** @type {Record<string, any>} */
    const p = {};
    (S.params || []).forEach((x) => {
      if (!x.name) return;
      const n = typeof x.value === 'number' ? x.value : parseFloat(String(x.value).replace(/[,\s]/g, ''));
      p[nkey(x.name)] = (isNaN(n) || String(x.value).trim() === '') ? x.value : n;
    });
    return p;
  }

  /* ---- Dựng dòng làm việc: giá trị theo alias + __m ---- */
  function buildRows() {
    const acols = attrCols(), mcols = monthCols();
    const hasMonths = mcols.length === M;
    return (S.hc.rows || []).map((raw) => {
      const o = {};
      acols.forEach((c) => { o[c.alias] = c.type === 'num' ? numOf(raw[c.src]) : raw[c.src]; });
      const m = new Array(M).fill(1);
      if (hasMonths) mcols.forEach((c, k) => { m[k] = numOf(raw[c.src]); });
      o.__m = m;
      return o;
    });
  }

  /* ---- Áp bảng phân loại theo thứ tự ----
     Một bảng sinh ra NHIỀU cột giá trị (classOuts đọc được cả bảng khai kiểu cũ
     chỉ có một cột), nên idx giữ CẢ DÒNG chứ không giữ riêng ô kết quả. */
  function applyClasses(rows, warn) {
    (S.classes || []).forEach((cl) => {
      const outs = classOuts(cl);
      if (!outs.length) return;
      const keys = cl.keys || [];
      const idx = {};
      (cl.rows || []).forEach((r) => {
        const k = keys.map((_, j) => { return nkey(r[j]); }).join('\u0001');
        if (idx[k] === undefined) idx[k] = r;
      });
      const hasStar = (cl.rows || []).some((r) => { return keys.some((_, j) => { return String(r[j]).trim() === '*'; }); });
      let miss = 0;
      rows.forEach((row) => {
        const vals = keys.map((kc) => { return nkey(row[kc]); });
        let rec = idx[vals.join('\u0001')];
        if (rec === undefined && hasStar) {
          // thử thay dần từng khoá bằng *
          for (let b = 1; b < (1 << keys.length) && rec === undefined; b++) {
            const probe = vals.map((x, j) => { return (b >> j) & 1 ? '*' : x; });
            rec = idx[probe.join('\u0001')];
          }
        }
        if (rec === undefined) miss++;
        outs.forEach((o, oi) => {
          /* GIỮ ĐÚNG NẾP CŨ: chỉ khi KHÔNG khớp dòng nào mới rơi về mặc định.
             Ô để trống trong bảng vẫn ra chuỗi rỗng (số thì ra 0) — bảng chính
             sách thì rơi về mặc định cả khi ô trống, hai chỗ khác nhau thật.
             Đổi chỗ này là đổi số liệu của mọi dự án đang chạy. */
          const v = rec === undefined ? classDef(cl, oi) : rec[keys.length + oi];
          row[o.name] = (o.type === 'num') ? numOf(v) : (v == null ? '' : String(v));
        });
      });
      if (miss && warn) {
        const d = classDef(cl, 0);
        warn.push({ type: 'class', msg: t('engine.warn.class.miss', { name: cl.name, n: miss, def: d || t('engine.value.empty') }) });
      }
    });
    return rows;
  }

  /* Bảng chính sách: cùng cơ chế khoá như phân loại nhóm, nhưng sinh ra
     nhiều cột giá trị (mức lương, mức phụ cấp, hệ số thưởng…) một lúc. */
  function applyPolicies(rows, warn) {
    (S.policies || []).forEach((po) => {
      const keys = po.keys || [], outs = (po.outs || []).filter((o) => { return o && o.name; });
      if (!outs.length) return;
      const idx = {};
      (po.rows || []).forEach((r) => {
        const k = keys.map((_, j) => { return nkey(r[j]); }).join('\u0001');
        if (idx[k] === undefined) idx[k] = r;
      });
      const hasStar = (po.rows || []).some((r) => { return keys.some((_, j) => { return String(r[j]).trim() === '*'; }); });
      let miss = 0;
      rows.forEach((row) => {
        const vals = keys.map((kc) => { return nkey(row[kc]); });
        let rec = idx[vals.join('\u0001')];
        if (rec === undefined && hasStar) {
          for (let b = 1; b < (1 << keys.length) && rec === undefined; b++) {
            const probe = vals.map((x, j) => { return (b >> j) & 1 ? '*' : x; });
            rec = idx[probe.join('\u0001')];
          }
        }
        if (rec === undefined) miss++;
        outs.forEach((o, oi) => {
          let v = rec ? rec[keys.length + oi] : ((po.def || [])[oi]);
          if (v === undefined || v === null || v === '') v = (po.def || [])[oi];
          row[o.name] = (o.type === 'text') ? (v == null ? '' : String(v)) : numOf(v);
        });
      });
      if (miss && warn) warn.push({ type: 'policy', msg: t('engine.warn.policy.miss', { name: po.name || '', n: miss }) });
    });
    return rows;
  }

  /* ---- Lịch ngày công theo nhóm ---- */
  function buildCalendar() {
    const cal = S.calendar || { groupCol: '', tables: [] };
    const byScope = {}; let def = null;
    (cal.tables || []).forEach((t) => {
      if (nkey(t.scope) === '*' || t.scope === '') def = t; else byScope[nkey(t.scope)] = t;
    });
    if (!def && cal.tables && cal.tables.length) def = cal.tables[0];
    return {
      groupCol: cal.groupCol || '',
      pick: function (row) {
        if (cal.groupCol) { const t = byScope[nkey(row[cal.groupCol])]; if (t) return t; }
        return def;
      }
    };
  }
  function calVars(tbl, m) {
    const o = {};
    const src = tbl && tbl.m && tbl.m[m - 1] ? tbl.m[m - 1] : {};
    CAL_FIELDS.forEach((f) => { o[f.varName] = numOf(src[f.k]); });
    return o;
  }

  function compileRules(rules, where, errs) {
    return (rules || []).map((r) => {
      const out = { name: r.name, condFn: null, valFn: null, err: null };
      if (r.cond && String(r.cond).trim()) {
        const c = FX.tryCompile(r.cond);
        if (c.ok) out.condFn = c.fn; else out.err = t('engine.err.cond', { e: c.error });
      }
      const f = FX.tryCompile(r.formula || '0');
      if (f.ok) out.valFn = f.fn; else out.err = (out.err ? out.err + ' · ' : '') + t('engine.err.formula', { e: f.error });
      if (out.err && errs) errs.push({ where: where + ' › ' + (r.name || t('engine.rule.unnamed')), msg: out.err });
      return out;
    });
  }

  /* ---- Năm tầng phân loại chi phí ----
     Division suy từ Đơn vị, y hệt Cost Center. Budget Code KHÔNG còn khoá theo
     Cost Center: chỉ Cost Code + Đơn vị. Khoá này còn được dựng lại ở hai nơi
     nữa — views/cost-map.js (đếm tổ hợp còn thiếu) và platform/io.js (sheet
     ChiTiet_Dong). Lệch một chỗ là bảng pivot và sheet dài nói hai số khác nhau
     mà không ai báo. */
  function buildMaps() {
    const mp = S.maps || /** @type {ProjectState['maps']} */ ({});
    /** @type {Record<string, any>} */ const cc = {};
    /** @type {Record<string, any>} */ const cen = {};
    /** @type {Record<string, any>} */ const div = {};
    /** @type {Record<string, any>} */ const bud = {};
    /** @type {Record<string, any>} */ const acc = {};
    (mp.costCode || []).forEach((x) => { cc[nkey(x.formulaCode)] = x; });
    (mp.costCenter || []).forEach((x) => { cen[nkey(x.unit)] = x; });
    (mp.division || []).forEach((x) => { div[nkey(x.unit)] = x; });
    (mp.budgetCode || []).forEach((x) => { bud[nkey(x.costCode) + '|' + nkey(x.unit)] = x; });
    (mp.accountCode || []).forEach((x) => { acc[nkey(x.costCode) + '|' + nkey(x.costCenter) + '|' + nkey(x.budgetCode)] = x; });
    return { cc, cen, div, bud, acc };
  }

  /* ---------- CHẠY ---------- */
  /**
   * Tính toàn bộ ngân sách trên trạng thái S hiện tại.
   * Nặng nhất trong app — gọi khi người dùng bấm "Chạy tính", không gọi lúc render.
   * @returns {BudgetResult}
   */
  /* Một lượt tính với đúng danh sách đợt tăng được đưa vào. run() gọi nó với cả
     danh sách; phần đo ảnh hưởng tăng lương gọi lại với danh sách cắt bớt. */
  function runCore(raiseList, onStep) {
    const t0 = Date.now();
    let warnings = []; const formulaErrors = [];
    const rows = applyPolicies(applyClasses(buildRows(), warnings), warnings);
    const nR = rows.length;
    const params = buildParams();
    const sh = buildShared(raiseList);
    const acc = buildAccruals();
    sh.errors.forEach((e) => {
      formulaErrors.push({ where: t('engine.where.shared', { code: e.where }), msg: e.msg });
    });
    /** @type {Record<string, string>} */
    const fieldIndex = {};
    usableCols().forEach((c) => { fieldIndex[String(c).toLowerCase().trim()] = c; });
    const cal = buildCalendar();
    const maps = buildMaps();
    const idCol = roleCol('key'), posCol = roleCol('position'), unitCol = roleCol('unit');
    const fcs = (S.formulas || []).filter((f) => { return f.active !== false; });
    const nF = fcs.length;

    /* Ô đối chiếu ở màn Ngày công chỉ báo tại chỗ; ai không mở màn đó thì không
       biết. Nêu luôn ở đây để nó nổi lên màn Kết quả cùng các cảnh báo khác. */
    (S.calendar && S.calendar.tables || []).forEach((tbl) => {
      (tbl.m || []).forEach((rec, k) => {
        const used = CAL_FIELDS.slice(1).reduce((a, f) => { return a + numOf(rec[f.k]); }, 0);
        const gap = numOf(rec.std) - used;
        if (gap) {
          warnings.push({
            type: 'cal',
            msg: t('engine.warn.cal', { scope: tbl.scope || '*', m: MONTHS[k], n: fmt(Math.abs(gap)), w: gap > 0 ? t('cal.gap_word_short') : t('cal.gap_word_over') })
          });
        }
      });
    });

    if (monthCols().length !== M) warnings.push({ type: 'month', msg: t('engine.warn.month') });
    if (!unitCol) warnings.push({ type: 'role', msg: t('engine.warn.unitcol') });
    if (!idCol) warnings.push({ type: 'role', msg: t('engine.warn.keycol') });

    /* tăng lương */
    const raises = (raiseList || S.raises || []).filter((r) => { return r.active !== false; }).map((r) => {
      let condFn = null;
      if (r.cond && String(r.cond).trim()) {
        const c = FX.tryCompile(r.cond);
        if (c.ok) condFn = c.fn; else formulaErrors.push({ where: t('engine.where.raise', { name: r.name || '' }), msg: c.error });
      }
      return { from: +r.fromMonth || 1, pct: parseFloat(String(r.pct)) || 0, condFn, codes: (r.formulas || []).map(nkey) };
    });

    /* tờ trình theo Formula Code */
    const excByFc = {};
    (S.exceptions || []).filter((e) => { return e.active !== false; }).forEach((e) => {
      (excByFc[nkey(e.formulaCode)] = excByFc[nkey(e.formulaCode)] || []).push(e);
    });

    /* ngữ cảnh từng dòng */
    const ctxRow = rows.map((r) => {
      const unitV = unitCol ? r[unitCol] : '';
      const cen = maps.cen[nkey(unitV)];
      const div = maps.div[nkey(unitV)];
      return {
        row: r, id: idCol ? nkey(r[idCol]) : '', pos: posCol ? nkey(r[posCol]) : '',
        unit: unitV, cen: cen ? cen.costCenter : '', div: div ? div.division : '',
        cal: cal.pick(r), m: r.__m, rv: rowVars(r.__m)
      };
    });
    if (unitCol) {
      const missU = {}, missD = {};
      ctxRow.forEach((c) => {
        if (!nkey(c.unit)) return;
        if (!c.cen) missU[c.unit] = 1;
        if (!c.div) missD[c.unit] = 1;
      });
      Object.keys(missU).slice(0, 30).forEach((u) => { warnings.push({ type: 'cen', msg: t('engine.warn.cen.unmapped', { u }) }); });
      Object.keys(missD).slice(0, 30).forEach((u) => { warnings.push({ type: 'div', msg: t('engine.warn.div.unmapped', { u }) }); });
    }

    const data = [], groupOf = [], conflicts = [], totalsByFc = new Array(nF).fill(0), monthTotals = new Array(M).fill(0);
    const pivot = {}, missBC = {}, missAC = {}, missCC = {};

    for (let c = 0; c < nF; c++) {
      const fc = fcs[c];
      const rules = compileRules(fc.rules, fc.code, formulaErrors);
      const msel = new Array(M + 1).fill(false); let nSel = 0;
      (fc.months || []).forEach((m) => { m = +m; if (m >= 1 && m <= M && !msel[m]) { msel[m] = true; nSel++; } });
      const alloc = (fc.mode === 'spread') ? (nSel ? 1 / nSel : 0) : 1;
      const arr = new Float64Array(nR * M), gs = new Array(nR);

      const exList = excByFc[nkey(fc.code)] || [];
      const exById = {}, exByPos = {};
      exList.forEach((e) => {
        if (nkey(e.id)) (exById[nkey(e.id)] = exById[nkey(e.id)] || []).push(e);
        else if (nkey(e.position)) (exByPos[nkey(e.position)] = exByPos[nkey(e.position)] || []).push(e);
      });
      const myRaises = raises.filter((rz) => { return !rz.codes.length || rz.codes.indexOf(nkey(fc.code)) >= 0; });

      const ccRec = maps.cc[nkey(fc.code)];
      const costCode = ccRec ? ccRec.costCode : '';
      if (!costCode) missCC[fc.code] = 1;

      for (let i = 0; i < nR; i++) {
        const rc = ctxRow[i];
        const ctx = { row: rc.row, fieldIndex, params, lookups: {}, shared: sh.reg, vars: Object.assign({ THANG: 0, DINH_BIEN: 0, SO_THANG: nSel }, rc.rv) };
        let chosen = null;
        for (let g = 0; g < rules.length; g++) {
          const ru = rules[g]; if (ru.err) continue;
          if (!ru.condFn) { chosen = ru; break; }
          const okv = ru.condFn.eval(ctx);
          if (!FX.isErr(okv) && FX.toBool(okv) === true) { chosen = ru; break; }
        }
        gs[i] = chosen ? (chosen.name || t('engine.group.unnamed')) : null;
        if (!chosen || !chosen.valFn) continue;

        const monthDep = fnMonthDep(chosen.valFn, sh);
        let cache = null;
        const exs = (exById[rc.id] || []).concat(exByPos[rc.pos] || []);

        for (let m = 1; m <= M; m++) {
          if (!msel[m]) continue;
          const hcf = rc.m[m - 1]; if (!hcf) continue;
          ctx.vars = Object.assign({ THANG: m, DINH_BIEN: hcf, SO_THANG: nSel }, rc.rv, calVars(rc.cal, m));
          let base;
          if (monthDep) base = chosen.valFn.eval(ctx);
          else { if (cache === null) cache = chosen.valFn.eval(ctx); base = cache; }
          if (FX.isErr(base)) {
            if (formulaErrors.length < 200) formulaErrors.push({ where: t('engine.where.row', { code: fc.code, name: chosen.name || '', i: i + 1 }), msg: t('engine.err.code', { e: base.__err }) });
            continue;
          }
          base = FX.toNum(base); if (FX.isErr(base)) continue;

          let f = 1;
          for (let k = 0; k < myRaises.length; k++) {
            const rz = myRaises[k];
            if (m < rz.from) continue;
            if (rz.condFn) { const cv = rz.condFn.eval(ctx); if (FX.isErr(cv) || FX.toBool(cv) !== true) continue; }
            f *= (1 + rz.pct / 100);
          }
          /* Sau khi áp tăng lương thì làm tròn lên hàng nghìn */
          let val = (f === 1) ? base : roundUpTo(base * f, 1000);

          for (let k2 = 0; k2 < exs.length; k2++) {
            const e = exs[k2];
            if (e.months && e.months.length && e.months.indexOf(m) < 0) continue;
            const amt = numOf(e.amount), rule = (e.rule || 'MAX').toUpperCase(), before = val;
            if (rule === 'OVERRIDE') val = amt;
            else if (rule === 'ADD') val = val + amt;
            else val = Math.max(val, amt);
            if (conflicts.length < 20000) {
              conflicts.push({
                no: e.no || '', id: idCol ? rc.row[idCol] : '', position: posCol ? rc.row[posCol] : '', unit: rc.unit,
                formulaCode: fc.code, costCode, month: m,
                formula: Math.round(before), exception: Math.round(amt), rule, final: Math.round(val),
                diff: Math.abs(before - amt) > 0.5, won: Math.abs(val - amt) < 0.5 && Math.abs(before - amt) > 0.5
              });
            }
          }

          const amount = Math.round(val * alloc * hcf * accrualFactor(acc, fc.code, rc.row, m));
          if (!isFinite(amount) || !amount) continue;
          arr[i * M + (m - 1)] = amount;
          totalsByFc[c] += amount; monthTotals[m - 1] += amount;

          const cen = rc.cen;
          const bRec = maps.bud[nkey(costCode) + '|' + nkey(rc.unit)];
          const budgetCode = bRec ? bRec.budgetCode : '';
          if (!budgetCode && costCode) missBC[[costCode, rc.unit].join(' × ')] = 1;
          const aRec = maps.acc[nkey(costCode) + '|' + nkey(cen) + '|' + nkey(budgetCode)];
          const accountCode = aRec ? aRec.accountCode : '';
          if (!accountCode && budgetCode) missAC[[costCode, cen, budgetCode].join(' × ')] = 1;

          /* Thứ tự khoá = thứ tự cột trên màn Kết quả và trong file xuất:
             Division / Budget Code / Cost Center / Cost Code / Account. Đổi ở
             đây thì phải đổi cả bộ so sánh sắp xếp bên dưới, result.js, io.js
             và test/helpers/canon.mjs. */
          const pk = [rc.div, budgetCode, cen, costCode, accountCode, fc.code].join('|');
          let pv = pivot[pk];
          if (!pv) pv = pivot[pk] = {
            division: rc.div || t('engine.map.undeclared'), budgetCode: budgetCode || t('engine.map.undeclared'),
            costCenter: cen || t('engine.map.none'), costCode: costCode || t('engine.map.undeclared'),
            accountCode: accountCode || t('engine.map.undeclared'),
            formulaCode: fc.code, formulaName: fc.name || '',
            m: new Array(M).fill(0), total: 0
          };
          pv.m[m - 1] += amount; pv.total += amount;
        }
      }
      data.push(arr); groupOf.push(gs);
      if (onStep) onStep(c + 1, nF, fc.code);

      let noGroup = 0;
      for (let q = 0; q < nR; q++) if (gs[q] === null) noGroup++;
      if (noGroup) warnings.push({ type: 'nogroup', msg: t('engine.warn.nogroup', { code: fc.code, n: noGroup }) });
    }

    Object.keys(missCC).slice(0, 30).forEach((k) => { warnings.push({ type: 'map', msg: t('engine.warn.cc.unmapped', { k }) }); });
    Object.keys(missBC).slice(0, 30).forEach((k) => { warnings.push({ type: 'map', msg: t('engine.warn.bc.missing', { k }) }); });
    Object.keys(missAC).slice(0, 30).forEach((k) => { warnings.push({ type: 'map', msg: t('engine.warn.ac.missing', { k }) }); });

    const seen = {}; warnings = warnings.filter((w) => { const k = w.type + w.msg; if (seen[k]) return false; seen[k] = 1; return true; });
    let grand = 0; totalsByFc.forEach((x) => { grand += x; });

    return {
      formulas: fcs, rows, data, groupOf,
      totalsByFc, monthTotals, grand,
      pivot: Object.keys(pivot).map((k) => { return pivot[k]; }).sort((a, b) => {
        const ka = a.division + a.budgetCode + a.costCenter + a.costCode;
        const kb = b.division + b.budgetCode + b.costCenter + b.costCode;
        return ka < kb ? -1 : 1;
      }),
      conflicts, warnings, formulaErrors,
      dataNoRaise: null, raiseImpact: null, raiseTotal: 0,
      idCol, posCol, unitCol, ms: Date.now() - t0
    };
  }

  /* ẢNH HƯỞNG CỦA TĂNG LƯƠNG, tách theo từng đợt.

     Đo bằng cách CHẠY LẠI cả lượt tính với danh sách đợt tăng cắt dần:
       A₀ = không đợt nào     Aₖ = đợt 1..k     đóng góp đợt k = Aₖ − Aₖ₋₁
     Cộng dồn theo thứ tự nên các phần cộng lại ĐÚNG BẰNG tổng; bỏ-một-đợt-ra thì
     không, vì các đợt nhân chồng lên nhau.

     Vì sao chạy lại cả lượt chứ không nhân chia tại chỗ cho rẻ: đợt tăng có HAI
     đường vào số liệu — liệt kê đích danh một công thức DÙNG CHUNG thì nó được
     áp bên trong chính công thức đó (buildShared), còn lại thì áp ở vòng tính của
     công thức chi phí. Đo tại chỗ ở vòng ngoài sẽ bỏ sót hẳn đường thứ nhất —
     đúng trường hợp của file mẫu. Chạy lại cả lượt thì không có đường nào lọt.

     Giá: thêm N+1 lượt khi có N đợt. Không khai đợt nào thì không chạy lượt nào. */
  /* Bản bất đồng bộ của run(): nhường lại cho trình duyệt giữa các bước để thanh
     tiến trình vẽ được. KHÔNG đụng vào một phép tính nào — run() đồng bộ ở dưới
     vẫn là đường mà bộ kiểm và golden đi qua.

     Hai mốc nhường có sẵn: hết mỗi Formula Code trong runCore, và hết mỗi lượt
     trong run (N đợt tăng lương thì N+1 lượt). */
  function yieldFrame() {
    return new Promise((res) => { setTimeout(res, 0); });
  }

  async function runAsync(onProgress) {
    const active = (S.raises || []).filter((r) => { return r.active !== false; });
    /* Tổng số bước để quy ra phần trăm: mỗi lượt tính là một bước lớn. */
    const passes = active.length ? active.length + 1 : 1;
    let done = 0;
    const tell = (label) => {
      if (onProgress) onProgress(Math.min(99, Math.round(done / passes * 100)), label);
    };

    let stepInPass = 0;
    const perFc = (c, n, code) => {
      stepInPass = c / n;
      if (onProgress) {
        onProgress(Math.min(99, Math.round((done + stepInPass) / passes * 100)), code);
      }
    };

    tell(t('engine.step.main'));
    await yieldFrame();
    const full = runCore(null, perFc);
    done++;

    if (!active.length) { if (onProgress) onProgress(100, ''); return full; }

    tell(t('engine.step.noRaise'));
    await yieldFrame();
    const none = runCore([], perFc);
    done++;
    full.dataNoRaise = none.data;
    full.raiseTotal = full.grand - none.grand;

    let prev = none;
    const impact = [];
    for (let k = 0; k < active.length; k++) {
      const r = active[k];
      tell(t('engine.step.raise', { name: r.name || '' }));
      await yieldFrame();
      const cur = (k === active.length - 1) ? full : runCore(active.slice(0, k + 1), perFc);
      done++;
      impact.push(raiseSlice(r, cur, prev));
      prev = cur;
    }
    full.raiseImpact = impact;
    if (onProgress) onProgress(100, '');
    return full;
  }

  /* Phần tiền mà riêng đợt `r` cộng thêm, so lượt `cur` với lượt `prev`. Dùng
     chung cho cả run() lẫn runAsync() — một cách tính, không hai bản. */
  function raiseSlice(r, cur, prev) {
    /** @type {Record<string, number>} */
    const byFc = {};
    cur.formulas.forEach((fc, c) => {
      const d = cur.totalsByFc[c] - prev.totalsByFc[c];
      if (d) byFc[fc.code] = d;
    });
    const byMonth = cur.monthTotals.map((v, m) => { return v - prev.monthTotals[m]; });
    /* Số lượt dòng × Formula Code mà đợt này thật sự làm đổi tiền. */
    let nRows = 0;
    cur.data.forEach((arr, c) => {
      const before = prev.data[c];
      for (let i = 0; i < cur.rows.length; i++) {
        for (let m = 0; m < M; m++) {
          if (arr[i * M + m] !== before[i * M + m]) { nRows++; break; }
        }
      }
    });
    return {
      id: r.id, name: r.name || '', fromMonth: +r.fromMonth || 1,
      pct: parseFloat(String(r.pct)) || 0,
      total: cur.grand - prev.grand, byMonth, byFc, nRows
    };
  }

  function run() {
    const full = runCore(null);
    const active = (S.raises || []).filter((r) => { return r.active !== false; });
    if (!active.length) return full;

    const t1 = Date.now();
    const none = runCore([]);
    full.dataNoRaise = none.data;
    full.raiseTotal = full.grand - none.grand;

    let prev = none;
    full.raiseImpact = active.map((r, k) => {
      const cur = (k === active.length - 1) ? full : runCore(active.slice(0, k + 1));
      const out = raiseSlice(r, cur, prev);
      prev = cur;
      return out;
    });
    full.ms += Date.now() - t1;
    return full;
  }

  /* ---------- Tiện ích cho UI ---------- */
  let cacheRows = null, cacheKey = '';
  function previewRows() {
    /* Khoá nhớ phải theo NỘI DUNG. Trước đây lấy JSON.stringify(...).length — tức
       ĐỘ DÀI chuỗi — nên hai cấu hình khác nhau mà cùng độ dài (đổi cột khoá
       Dept -> Unit, đổi giá trị AC -> SL...) cho cùng một khoá và trả về bảng cũ
       với cột dẫn xuất SAI. classCombos và classMissCount đều đọc qua đây. */
    const key = JSON.stringify([S.cols, S.classes]) + '|' + (S.hc.rows || []).length;
    if (cacheRows && cacheKey === key) return cacheRows;
    cacheKey = key; cacheRows = applyPolicies(applyClasses(buildRows(), null), null);
    return cacheRows;
  }
  /** Bỏ kết quả đã nhớ. PHẢI gọi sau mọi thay đổi chạm tới số liệu. */
  function invalidate() { cacheRows = null; }

  function ctxFor(row, month, nSel) {
    /** @type {Record<string, string>} */
    const fieldIndex = {};
    usableCols().forEach((c) => { fieldIndex[String(c).toLowerCase().trim()] = c; });
    const cal = buildCalendar();
    return {
      row, fieldIndex, params: buildParams(), lookups: {}, shared: buildShared().reg,
      vars: Object.assign({ THANG: month || 1, DINH_BIEN: (row.__m || [])[(month || 1) - 1] || 0, SO_THANG: nSel || 12 }, rowVars(row.__m),
        calVars(cal.pick(row), month || 1))
    };
  }

  function countMatch(cond) {
    const rows = previewRows();
    if (!cond || !String(cond).trim()) return { n: rows.length, all: true };
    const c = FX.tryCompile(cond);
    if (!c.ok) return { error: c.error };
    const ctx = ctxFor(rows[0] || {}, 1, 12); let n = 0;
    for (let i = 0; i < rows.length; i++) {
      ctx.row = rows[i];
      const v = c.fn.eval(ctx);
      if (!FX.isErr(v) && FX.toBool(v) === true) n++;
    }
    return { n };
  }

  /* Thử một dòng cho cả 12 tháng, có cả tăng lương và tờ trình */
  /**
   * Thử một Formula Code trên MỘT dòng định biên: ra 12 tháng, nhóm quy tắc nào
   * khớp, và mọi thông tin mà công thức dùng tới (bảng đối chiếu).
   * @param {FormulaCode} fc
   * @param {number} rowIdx chỉ số dòng trong S.hc.rows
   * @returns {PreviewRow}
   */
  function previewRow(fc, rowIdx) {
    const rows = previewRows();
    const row = rows[rowIdx];
    if (!row) return { error: t('engine.err.norows') };

    const msel = new Array(M + 1).fill(false); let nSel = 0;
    (fc.months || []).forEach((m) => { m = +m; if (m >= 1 && m <= M && !msel[m]) { msel[m] = true; nSel++; } });
    const alloc = (fc.mode === 'spread') ? (nSel ? 1 / nSel : 0) : 1;

    const rules = compileRules(fc.rules, fc.code, null);
    const ctx = ctxFor(row, 1, nSel);
    let chosen = null;
    for (let g = 0; g < rules.length; g++) {
      const ru = rules[g];
      if (ru.err) return { error: ru.err, group: ru.name, row };
      if (!ru.condFn) { chosen = ru; break; }
      const okv = ru.condFn.eval(ctx);
      if (!FX.isErr(okv) && FX.toBool(okv) === true) { chosen = ru; break; }
    }
    if (!chosen) return { group: null, row, months: [], total: 0 };

    const idCol = roleCol('key'), posCol = roleCol('position');
    const myRaises = (S.raises || []).filter((r) => {
      return r.active !== false && (!(r.formulas || []).length || (r.formulas || []).map(nkey).indexOf(nkey(fc.code)) >= 0);
    }).map((r) => {
      let cf = null;
      if (r.cond && String(r.cond).trim()) { const c = FX.tryCompile(r.cond); if (c.ok) cf = c.fn; }
      return { from: +r.fromMonth || 1, pct: parseFloat(String(r.pct)) || 0, condFn: cf, name: r.name };
    });
    const exs = (S.exceptions || []).filter((e) => {
      if (e.active === false || nkey(e.formulaCode) !== nkey(fc.code)) return false;
      if (nkey(e.id)) return idCol && nkey(row[idCol]) === nkey(e.id);
      if (nkey(e.position)) return posCol && nkey(row[posCol]) === nkey(e.position);
      return false;
    });

    const cal = buildCalendar();
    const accP = buildAccruals();
    const hasAccrual = !!accP[nkey(fc.code)];
    const out = []; let total = 0, err = null;
    for (let m = 1; m <= M; m++) {
      const hcf = (row.__m || [])[m - 1] || 0;
      const rec = { m, on: msel[m], hcf, raw: 0, raised: 0, afterExc: 0, amount: 0, exc: false };
      if (!msel[m]) { out.push(rec); continue; }
      ctx.vars = Object.assign({ THANG: m, DINH_BIEN: hcf, SO_THANG: nSel }, rowVars(row.__m), calVars(cal.pick(row), m));
      const v = chosen.valFn.eval(ctx);
      if (FX.isErr(v)) { err = t('engine.err.code.at', { e: v.__err, m: MONTHS[m - 1] }); out.push(rec); continue; }
      rec.raw = FX.toNum(v);
      let f = 1;
      myRaises.forEach((rz) => {
        if (m < rz.from) return;
        if (rz.condFn) { const cv = rz.condFn.eval(ctx); if (FX.isErr(cv) || FX.toBool(cv) !== true) return; }
        f *= (1 + rz.pct / 100);
      });
      rec.raised = (f === 1) ? rec.raw : roundUpTo(rec.raw * f, 1000);
      let val = rec.raised;
      exs.forEach((e) => {
        if (e.months && e.months.length && e.months.indexOf(m) < 0) return;
        const amt = numOf(e.amount), rule = (e.rule || 'MAX').toUpperCase();
        if (rule === 'OVERRIDE') val = amt;
        else if (rule === 'ADD') val = val + amt;
        else val = Math.max(val, amt);
        rec.exc = true;
      });
      rec.afterExc = val;
      rec.accrual = accrualFactor(accP, fc.code, row, m) * 100;
      rec.amount = Math.round(val * alloc * hcf * (rec.accrual / 100));
      total += rec.amount;
      out.push(rec);
    }
    return {
      group: chosen.name || t('engine.group.unnamed'), row, months: out, total,
      nSel, alloc, error: err,
      id: idCol ? row[idCol] : '', hasRaise: myRaises.length > 0, hasExc: exs.length > 0,
      hasAccrual,
      refs: collectRefs([chosen.condFn, chosen.valFn], ctx, row, nSel, cal)
    };
  }

  /* Mọi thông tin công thức thực sự dùng tới, kèm giá trị của dòng đang thử.
     Mỗi tên được biên dịch lại thành một biểu thức con rồi eval, nên đi đúng
     cùng đường phân giải với công thức thật: cột -> tham số -> biến tháng ->
     công thức dùng chung. Nhờ vậy không có chuyện bảng đối chiếu hiển thị một
     đằng còn máy tính lại lấy một nẻo. */
  function collectRefs(fns, ctx, row, nSel, cal) {
    const order = [], seen = {};
    fns.forEach((f) => {
      if (!f) return;
      f.info.fields.forEach((x) => {
        const k = '[' + x + ']'; if (!seen[k]) { seen[k] = 1; order.push({ key: k, raw: x, field: true }); }
      });
      f.info.names.forEach((x) => {
        if (!seen[x]) { seen[x] = 1; order.push({ key: x, raw: x, field: false }); }
      });
    });

    function kindOf(r) {
      const up = nkey(r.raw);
      if (!r.field) {
        if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, up)) return 'monthvar';
        if (ctx.params && Object.prototype.hasOwnProperty.call(ctx.params, up)) return 'param';
      }
      if (ctx.shared && ctx.shared[up]) return 'shared';
      return r.field ? 'field' : 'unknown';
    }

    const hcf0 = row.__m || [];
    return order.map((r) => {
      const c = FX.tryCompile(r.key);
      const vals = [], kind = kindOf(r);
      if (!c.ok) return { key: r.key, kind, error: c.error, constant: true, values: [] };
      for (let m = 1; m <= M; m++) {
        ctx.vars = Object.assign({ THANG: m, DINH_BIEN: hcf0[m - 1] || 0, SO_THANG: nSel }, rowVars(hcf0), calVars(cal.pick(row), m));
        const v = c.fn.eval(ctx);
        vals.push(FX.isErr(v) ? { err: v.__err } : v);
      }
      const first = JSON.stringify(vals[0]);
      const constant = vals.every((v) => { return JSON.stringify(v) === first; });
      return { key: r.key, kind, constant, values: vals, value: vals[0] };
    });
  }

  function preview(fc, rowIdx, month) {
    const rows = previewRows();
    const row = rows[rowIdx];
    if (!row) return { error: t('engine.err.norows') };
    const nSel = (fc.months || []).length;
    const ctx = ctxFor(row, month, nSel);
    const rules = compileRules(fc.rules, fc.code, null);
    for (let g = 0; g < rules.length; g++) {
      const ru = rules[g];
      if (ru.err) return { error: ru.err, group: ru.name };
      let ok = true;
      if (ru.condFn) { const v = ru.condFn.eval(ctx); ok = !FX.isErr(v) && FX.toBool(v) === true; }
      if (ok) {
        const val = ru.valFn.eval(ctx);
        if (FX.isErr(val)) return { error: t('engine.err.code', { e: val.__err }), group: ru.name };
        return { group: ru.name, value: FX.toNum(val), row };
      }
    }
    return { group: null, value: 0, row };
  }

  return {
    run, preview, classCols, policyCols, previewRow, countMatch, previewRows, invalidate,
    runAsync,
    usableCols, attrCols, monthCols, roleCol, M
  };
})();

export { ENGINE };
