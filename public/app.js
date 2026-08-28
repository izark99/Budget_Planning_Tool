/* ===========================================================
   APP — điểm vào: nạp content.md, dựng vỏ, giữ nhịp phiên
   Vỏ (VIEWS/badgeFor/shellRender/saveProject/openProject/resetAll)
   lấy nguyên văn từ khối SHELL của 08-view-result-boot.js.
   Phần xác thực thay hẳn cho AUTH_URL + localStorage cũ.
   =========================================================== */
import {
  S, RESULT, setS, setRESULT, defaultState,
  save, load, touch, installAutosave, setNotifier,
  loadContent, t, fmt, nkey
} from './modules/state.js';
import { ENGINE } from './modules/formula.js';
import { pickFile, downloadBlob, apiSession, apiLogout } from './modules/io.js';
import { el, toast, confirmBox, setRenderer } from './modules/ui.js';
import { viewHC, viewSetup } from './modules/views/hc-setup.js';
import { viewClasses, viewCalendar } from './modules/views/class-cal.js';
import { viewPolicies } from './modules/views/policy.js';
import { viewFormula, viewExc, viewMaps, viewRaise } from './modules/views/formula-maps.js';
import { viewResult, runBudget } from './modules/views/result.js';
import { viewDashboard } from './modules/views/dashboard.js';

var VIEWS = [
  { k: 'hc', n: '1', t: 'dash.kind_row', title: 'hc.bang_dinh_bien', sub: 'view.hc.sub', fn: viewHC },
  { k: 'setup', n: '2', t: 'view.setup.tab', title: 'view.setup.tab', sub: 'view.setup.sub', fn: viewSetup },
  { k: 'class', n: '3', t: 'cal.phan_loai_nhom', title: 'cal.phan_loai_nhom', sub: 'view.class.sub', fn: viewClasses },
  { k: 'policy', n: '4', t: 'pol.cai_dat_chinh_sach', title: 'pol.cai_dat_chinh_sach', sub: 'view.policy.sub', fn: viewPolicies },
  { k: 'cal', n: '5', t: 'view.cal.tab', title: 'view.cal.title', sub: 'view.cal.sub', fn: viewCalendar },
  { k: 'formula', n: '6', t: 'fm.cong_thuc_chi_phi', title: 'fm.cong_thuc_chi_phi', sub: 'view.formula.sub', fn: viewFormula },
  { k: 'exc', n: '7', t: 'fm.to_trinh_ngoai_le', title: 'fm.to_trinh_ngoai_le', sub: 'view.exc.sub', fn: viewExc },
  { k: 'maps', n: '8', t: 'view.maps.tab', title: 'view.maps.tab', sub: 'view.maps.sub', fn: viewMaps },
  { k: 'raise', n: '9', t: 'view.raise.tab', title: 'fm.du_kien_tang_luong', sub: 'view.raise.sub', fn: viewRaise },
  { k: 'result', n: '10', t: 'view.result.tab', title: 'view.result.title', sub: 'view.result.sub', fn: viewResult },
  { k: 'dash', n: '11', t: 'view.dash.tab', title: 'view.dash.title', sub: 'view.dash.sub', fn: viewDashboard }
];

function badgeFor(k) {
  switch (k) {
    case 'hc': return S.hc.rows.length ? { t: fmt(S.hc.rows.length) } : { t: '0', warn: true };
    case 'setup': {
      var n = S.cols.filter(function (c) { return c.role === 'month' && c.month; }).length;
      return S.cols.length ? (n === 12 ? null : { t: n + '/12', warn: true }) : null;
    }
    case 'class': return S.classes.length ? { t: String(S.classes.length) } : null;
    case 'policy': return (S.policies || []).length ? { t: String(S.policies.length) } : null;
    case 'dash': return RESULT ? null : { t: '–' };
    case 'formula': return { t: String(S.formulas.length) };
    case 'exc': return S.exceptions.length ? { t: String(S.exceptions.length) } : null;
    case 'maps': {
      var miss = S.formulas.filter(function (f) {
        return !(S.maps.costCode || []).some(function (x) { return nkey(x.formulaCode) === nkey(f.code) && x.costCode; });
      }).length;
      return miss ? { t: String(miss), warn: true } : null;
    }
  }
  return null;
}

function shellRender() {
  var cur = VIEWS.filter(function (v) { return v.k === S.ui.view; })[0] || VIEWS[0];
  var rail = el('aside', { class: 'rail' }, [
    el('div', { class: 'brand' }, [el('h1', { text: t('app.brand') }), el('p', { text: t('app.brand_sub') })]),
    el('nav', { class: 'nav' }, VIEWS.map(function (v) {
      var b = badgeFor(v.k);
      return el('button', {
        class: v.k === cur.k ? 'on' : '',
        onclick: function () { S.ui.view = v.k; save(); shellRender(); window.scrollTo(0, 0); }
      }, [el('span', { class: 'n', text: v.n }), el('span', { class: 't', text: t(v.t) }),
      b ? el('span', { class: 'badge' + (b.warn ? ' warn' : ''), text: b.t }) : null]);
    })),
    el('div', { class: 'railfoot' }, [
      el('button', { text: t('rail.save_project'), onclick: saveProject }),
      el('button', { text: t('rail.open_project'), onclick: openProject }),
      el('button', { text: t('rail.reset'), onclick: resetAll }),
      el('button', { text: t('rail.logout'), onclick: logout }),
      el('div', { style: 'margin-top:8px', text: t('rail.local_note') })
    ])
  ]);

  var main = el('main', { class: 'main' }, [
    el('div', { class: 'topbar' }, [
      el('div', { class: 'ttl' }, [el('h2', { text: t(cur.title) }), el('div', { class: 'sub', text: t(cur.sub) })]),
      el('span', { class: 'tag', text: (S.meta.name || '') + ' · ' + S.meta.year }),
      el('button', { class: 'btn go', text: t('app.run'), onclick: function () { runBudget(); S.ui.view = 'result'; touch(); shellRender(); window.scrollTo(0, 0); } })
    ]),
    el('div', { class: 'content' }, [cur.fn()])
  ]);

  document.body.innerHTML = '';
  document.body.appendChild(el('div', { class: 'shell' }, [rail, main]));
}

function saveProject() {
  downloadBlob(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }),
    'ngansach_' + (S.meta.year || '') + '_' + new Date().toISOString().slice(0, 10) + '.json');
  toast(t('toast.save_project'), 'good');
}
function openProject() {
  pickFile('.json', function (f) {
    var fr = new FileReader();
    fr.onload = function (e) {
      try {
        var o = JSON.parse(e.target.result);
        if (!o || !o.hc) throw new Error(t('err.bad_project_file'));
        /* ESM không cho gán lại binding đã import: dựng object mới rồi setS().
           Các bước gán bên trong giữ nguyên thứ tự như bản gốc. */
        var next = Object.assign(defaultState(), o);
        next.maps = Object.assign({ costCode: [], costCenter: [], budgetCode: [], accountCode: [] }, next.maps || {});
        next.policies = next.policies || [];
        next.shared = next.shared || [];
        next.ui = next.ui || { view: 'hc' };
        setS(next);
        ENGINE.invalidate(); setRESULT(null); save(); shellRender();
        toast(t('toast.open_project'), 'good');
      } catch (err) { toast(t('toast.error', { e: err.message }), 'bad'); }
    };
    fr.readAsText(f);
  });
}
function resetAll() {
  confirmBox(t('confirm.reset_all'), function () {
    setS(defaultState()); ENGINE.invalidate(); setRESULT(null); save(); shellRender(); toast(t('toast.reset_done'));
  });
}


/* ===========================================================
   PHIÊN LÀM VIỆC — mục 7 của brief
   =========================================================== */
const SESSION_CHECK_INTERVAL_MS = 60 * 1000; // kiểm tra mỗi 60s

async function checkSessionAlive() {
  try {
    const res = await apiSession();
    if (res.status === 401) {
      location.href = '/login';
    }
  } catch {
    // lỗi mạng tạm thời, không tự đăng xuất, để lần kiểm tra sau thử lại
  }
}

async function logout() {
  await apiLogout();
  location.href = '/login';
}

/* ===========================================================
   KHỞI ĐỘNG
   Script type="module" mặc định defer nên chạy SAU DOMContentLoaded —
   bản gốc bọc trong addEventListener('DOMContentLoaded') sẽ không bao
   giờ nổ. Gọi thẳng, chỉ chờ khi tài liệu còn đang phân tích.
   =========================================================== */
function fatal(html) {
  document.body.innerHTML = '<div style="padding:40px;font:15px system-ui">' + html + '</div>';
}

async function boot() {
  if (!window.XLSX || !window.XLTABLE) { fatal(t('boot.no_xlsx')); return; }

  try {
    await loadContent();
  } catch (e) {
    /* Chuỗi duy nhất buộc phải cứng trong code: content.md hỏng thì t() vô dụng. */
    fatal('Không tải được content.md. Hãy tải lại trang. (' + e.message + ')');
    return;
  }

  document.title = t('app.title');
  setNotifier(toast);
  setRenderer(shellRender);
  installAutosave();

  load();
  shellRender();

  /* Dò xem trình duyệt có cho ghi localStorage không — giữ nguyên cảnh báo bản gốc */
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); }
  catch (e) {
    var b = el('div', { class: 'warnbox', style: 'margin:0 24px 12px', html: t('boot.no_localstorage') });
    var c = document.querySelector('.content'); if (c) c.parentNode.insertBefore(b, c);
  }

  setInterval(checkSessionAlive, SESSION_CHECK_INTERVAL_MS);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
