/* ===========================================================
   MÀN 7 — ÁNH XẠ COST CODE / COST CENTER / BUDGET / ACCOUNT
   Bốn bảng ánh xạ, quyết định dòng ngân sách rơi vào mã nào.
   =========================================================== */
import { S, fmt, nkey, setRESULT, touch } from '../core/state.js';
import { t } from '../core/content.js';
import { ENGINE } from '../core/engine.js';
import { distinctVals } from '../platform/io.js';
import { confirmBox, el, render, toast } from '../ui/dom.js';
import { dataTable, foldPanel } from '../ui/widgets.js';

function neededCombos() {
  const rows = ENGINE.previewRows();
  const unitCol = ENGINE.roleCol('unit');
  const mp = S.maps;
  const cenOf = {}; (mp.costCenter || []).forEach((x) => { if (x.costCenter) cenOf[nkey(x.unit)] = x.costCenter; });
  const ccOf = {}; (mp.costCode || []).forEach((x) => { if (x.costCode) ccOf[nkey(x.formulaCode)] = x.costCode; });
  const budOf = {}; (mp.budgetCode || []).forEach((x) => { if (x.budgetCode) budOf[nkey(x.costCenter) + '|' + nkey(x.costCode) + '|' + nkey(x.unit)] = x.budgetCode; });
  const accOf = {}; (mp.accountCode || []).forEach((x) => { if (x.accountCode) accOf[nkey(x.costCode) + '|' + nkey(x.costCenter) + '|' + nkey(x.budgetCode)] = 1; });

  const units = unitCol ? distinctVals(rows, unitCol) : [];
  const fcs = S.formulas.map((f) => { return f.code; });

  const missFc = fcs.filter((c) => { return !ccOf[nkey(c)]; });
  const missUnit = units.filter((u) => { return !cenOf[nkey(u)]; });

  const budSeen = {}, budNeed = []; let budMiss = 0;
  const accSeen = {}, accNeed = []; let accMiss = 0;
  units.forEach((u) => {
    const cen = cenOf[nkey(u)] || '';
    fcs.forEach((fcCode) => {
      const cc = ccOf[nkey(fcCode)] || '';
      if (!cc || !cen) return;
      const bk = nkey(cen) + '|' + nkey(cc) + '|' + nkey(u);
      if (!budSeen[bk]) {
        budSeen[bk] = 1;
        const bud = budOf[bk] || '';
        budNeed.push({ costCenter: cen, costCode: cc, unit: u, budgetCode: '', name: '' });
        if (!bud) budMiss++;
      }
      const bud2 = budOf[bk] || '';
      if (!bud2) return;
      const ak = nkey(cc) + '|' + nkey(cen) + '|' + nkey(bud2);
      if (!accSeen[ak]) {
        accSeen[ak] = 1;
        accNeed.push({ costCode: cc, costCenter: cen, budgetCode: bud2, accountCode: '', name: '' });
        if (!accOf[ak]) accMiss++;
      }
    });
  });
  return {
    units, fcs, missFc, missUnit,
    budNeed, budMiss, budTotal: budNeed.length,
    accNeed, accMiss, accTotal: accNeed.length,
    unitCol
  };
}

function viewMaps() {
  const wrap = el('div');
  const mp = S.maps;

  const badges = { cc: el('span', { class: 'tag' }), cen: el('span', { class: 'tag' }), bud: el('span', { class: 'tag' }), acc: el('span', { class: 'tag' }) };
  let nc = neededCombos();

  function setBadge(node, miss, total, unitWord) {
    if (!total) { node.className = 'tag'; node.textContent = t('maps.badge_none', { w: unitWord }); return; }
    node.className = 'tag ' + (miss ? 'o' : 'g');
    node.textContent = miss ? t('maps.badge_missing', { miss: fmt(miss), total: fmt(total), w: unitWord }) : t('maps.badge_ok', { total: fmt(total), w: unitWord });
  }
  let refT = null;
  function refresh(now) {
    clearTimeout(refT);
    const go = function () {
      nc = neededCombos();
      setBadge(badges.cc, nc.missFc.length, nc.fcs.length, 'Formula Code');
      setBadge(badges.cen, nc.missUnit.length, nc.units.length, t('maps.word_unit'));
      setBadge(badges.bud, nc.budMiss, nc.budTotal, t('maps.word_combo'));
      setBadge(badges.acc, nc.accMiss, nc.accTotal, t('maps.word_combo'));
    };
    if (now) go(); else refT = setTimeout(go, 250);
  }
  function chg() { setRESULT(null); touch(); refresh(); }
  function chgNow() { setRESULT(null); touch(); refresh(true); }
  refresh(true);

  wrap.appendChild(el('div', { class: 'panel' }, [
    el('header', {}, [
      el('h3', { text: t('fm.bon_tang_phan_loai') }), el('div', { class: 'sp' }),
      el('button', {
        class: 'btn sm del', text: t('fm.xoa_sach_ca_bon_bang'), onclick: function () {
          confirmBox(t('fm.xoa_sach_du_lieu_cua_ca_bon_bang'), () => {
            mp.costCode.length = 0; mp.costCenter.length = 0; mp.budgetCode.length = 0; mp.accountCode.length = 0;
            setRESULT(null); touch(); render(); toast(t('fm.da_xoa_sach'));
          });
        }
      })
    ]),
    el('div', { class: 'body' }, [el('p', {
      class: 'hint',
      html: t('maps.help')
    })])
  ]));

  /* 1. Formula Code → Cost Code */
  wrap.appendChild(foldPanel('map_cc', '1 · Cost Code ← Formula Code', [badges.cc], [], dataTable({
    columns: [
      { k: 'formulaCode', label: 'Formula Code', key: true, type: 'select', options: function () { return S.formulas.map((f) => { return f.code; }); }, required: true, w: 190 },
      { k: 'costCode', label: 'Cost Code', type: 'text', required: true, w: 160 },
      /* CHUỖI GIAO THỨC: label là header file mẫu .xlsx và khoá khớp khi nhập lại */
      { k: 'name', label: 'Tên Cost Code', type: 'text' }
    ],
    rows: function () { return mp.costCode; },
    blank: function () { return { formulaCode: '', costCode: '', name: '' }; },
    onChange: chg, onImported: chgNow,
    tableName: 'tblMapCostCode', sheetName: 'CostCode', title: 'Cost Code theo Formula Code',
    prefill: function () { return S.formulas.map((f) => { return { formulaCode: f.code, costCode: '', name: f.name || '' }; }); },
    /* Bảng này khoá theo Formula Code nên thứ tự của nó có nghĩa: kéo thả để tự
       sắp, và nút Sinh sẵn sắp lại cho khớp đúng thứ tự công thức chi phí. Ba
       bảng ánh xạ còn lại không khoá theo thứ tự công thức nên không bật. */
    reorder: true,
    orderKeys: function () { return S.formulas.map((f) => { return nkey(f.code); }); },
    guide: [t('maps.cc_guide')]
  }), t('maps.cc_note')));

  /* 2. Unit → Cost Center */
  wrap.appendChild(foldPanel('map_cen', t('maps.panel_cen') + (nc.unitCol ? ' (' + nc.unitCol + ')' : ''), [badges.cen], [], dataTable({
    columns: [
      { k: 'unit', label: 'Unit', key: true, type: 'text', required: true, w: 170 },
      { k: 'costCenter', label: 'Cost Center', type: 'text', required: true, w: 160 },
      /* CHUỖI GIAO THỨC (như trên) */
      { k: 'name', label: 'Tên Cost Center', type: 'text' }
    ],
    rows: function () { return mp.costCenter; },
    blank: function () { return { unit: '', costCenter: '', name: '' }; },
    onChange: chg, onImported: chgNow,
    tableName: 'tblMapCostCenter', sheetName: 'CostCenter', title: t('fm.cost_center_theo_don_vi'),
    prefill: function () { return neededCombos().units.map((u) => { return { unit: u, costCenter: '', name: '' }; }); },
    guide: [t('maps.cen_guide')]
  }), nc.unitCol ? '' : t('maps.cen_no_unitcol')));

  function ccList() { const s2 = {}; mp.costCode.forEach((x) => { if (x.costCode) s2[x.costCode] = 1; }); return Object.keys(s2).sort(); }
  function cenList() { const s2 = {}; mp.costCenter.forEach((x) => { if (x.costCenter) s2[x.costCenter] = 1; }); return Object.keys(s2).sort(); }
  function unitList() { return neededCombos().units; }
  function budList() { const s2 = {}; mp.budgetCode.forEach((x) => { if (x.budgetCode) s2[x.budgetCode] = 1; }); return Object.keys(s2).sort(); }

  /* 3. (Cost Center, Cost Code, Unit) → Budget Code */
  wrap.appendChild(foldPanel('map_bud', t('maps.panel_bud'), [badges.bud], [], dataTable({
    columns: [
      { k: 'costCenter', label: 'Cost Center', key: true, type: 'select', options: cenList, required: true, w: 150 },
      { k: 'costCode', label: 'Cost Code', key: true, type: 'select', options: ccList, required: true, w: 140 },
      { k: 'unit', label: 'Unit', key: true, type: 'select', options: unitList, required: true, w: 140 },
      { k: 'budgetCode', label: 'Budget Code', type: 'text', required: true, w: 150 },
      /* CHUỖI GIAO THỨC (như trên) */
      { k: 'name', label: 'Diễn giải', type: 'text' }
    ],
    rows: function () { return mp.budgetCode; },
    blank: function () { return { costCenter: '', costCode: '', unit: '', budgetCode: '', name: '' }; },
    onChange: chg, onImported: chgNow,
    tableName: 'tblMapBudgetCode', sheetName: 'BudgetCode', title: 'Budget Code',
    prefill: function () { return neededCombos().budNeed; },
    guide: [
      t('maps.bud_guide_1'),
      t('maps.bud_guide_2'),
      t('maps.bud_guide_3')
    ]
  })));

  /* 4. (Cost Code, Cost Center, Budget Code) → Account Code */
  wrap.appendChild(foldPanel('map_acc', '4 · Account Code ← Cost Code + Cost Center + Budget Code', [badges.acc], [], dataTable({
    columns: [
      { k: 'costCode', label: 'Cost Code', key: true, type: 'select', options: ccList, required: true, w: 150 },
      { k: 'costCenter', label: 'Cost Center', key: true, type: 'select', options: cenList, required: true, w: 150 },
      { k: 'budgetCode', label: 'Budget Code', key: true, type: 'select', options: budList, required: true, w: 150 },
      { k: 'accountCode', label: 'Account Code', type: 'text', required: true, w: 150 },
      /* CHUỖI GIAO THỨC (như trên) */
      { k: 'name', label: 'Diễn giải', type: 'text' }
    ],
    rows: function () { return mp.accountCode; },
    blank: function () { return { costCode: '', costCenter: '', budgetCode: '', accountCode: '', name: '' }; },
    onChange: chg, onImported: chgNow,
    tableName: 'tblMapAccountCode', sheetName: 'AccountCode', title: 'Account Code',
    prefill: function () { return neededCombos().accNeed; },
    guide: [t('maps.acc_guide')]
  }), t('maps.acc_note')));

  return wrap;
}

export { neededCombos, viewMaps };
