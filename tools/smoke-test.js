// 冒煙測試：用 jsdom 載入頁面與所有腳本，攔截 fetch 餵假資料，
// 然後點過每個分頁與主要按鈕，記錄任何未捕捉的錯誤。
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

// 用法：npm i jsdom && node tools/smoke-test.js [index.html|salary.html|shift.html]
// 會把頁面與所有本地腳本載進 jsdom、攔截 fetch 餵假資料，
// 然後點過每個分頁與按鈕，列出任何未捕捉的錯誤。console.error 多半來自假資料。
const ROOT = path.join(__dirname, '..');
const page = process.argv[2] || 'index.html';

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.stack || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ').slice(0, 300)));

const raw = fs.readFileSync(path.join(ROOT, page), 'utf8');
// 移除外部 CDN 標籤（測試環境不連網），本地腳本改成內嵌，
// 這樣它們才是真正的 <script>，頂層 const/let 會共用同一個全域語彙環境
const scripts = [...raw.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(s => !s.startsWith('http'));
let html = raw.replace(/<script[^>]*src="https?:[^"]*"[^>]*>\s*<\/script>/g, '');
for (const s of scripts) {
  const code = fs.readFileSync(path.join(ROOT, s), 'utf8');
  // 用 replacer 函式，否則程式碼裡的 $' 之類會被當成替換樣式
  html = html.replace(`<script src="${s}"></script>`, () => `<script data-file="${s}">\n${code}\n</script>`);
}

const i18n = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n/zh-TW.json'), 'utf8'));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  beforeParse(window) { installStubs(window); },
  url: 'https://example.com/' + page,
  virtualConsole: vc,
  pretendToBeVisual: true
});
function installStubs(window) {
// 假的後端：所有 action 都回一個「成功但空」的結果
window.fetch = async (url) => {
  const u = String(url);
  // 語系檔直接讀真實檔案（順便驗證 help.js 的路徑對不對）
  const m = u.match(/i18n\/(help\/)?([\w-]+)\.json/);
  if (m) {
    const file = path.join(ROOT, 'i18n', m[1] ? 'help' : '', m[2] + '.json');
    if (fs.existsSync(file)) {
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  }
  const body = {
    ok: true, success: true, data: [], records: [], locations: [], users: [],
    holidays: ['2026-01-01'], user: { userId: 'U1', name: '測試', dept: '管理員' },
    announcements: [], requests: []
  };
  // 跟真的 Response 一樣有 json() 和 text()（api.js 先讀文字，才能在回錯誤頁時說出原因）
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};
window.tailwind = { config: {} }; // 測試環境沒有載入 tailwind CDN
window.alert = () => {};
window.confirm = () => true;
window.print = () => {};
window.open = () => null;
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){} }));
window.navigator.geolocation = { getCurrentPosition: (ok) => ok({ coords: { latitude: 25, longitude: 121 } }) };
window.localStorage.setItem('sessionUserId', 'U1');
window.localStorage.setItem('sessionToken', 'T1');
window.localStorage.setItem('lang', 'zh-TW');

window.addEventListener('error', e => errors.push('window.error: ' + (e.error && e.error.stack || e.message)));
window.addEventListener('unhandledrejection', e => errors.push('unhandledRejection: ' + (e.reason && e.reason.stack || e.reason)));
}

const { window } = dom;
console.log('載入腳本:', scripts.join(', '));

(async () => {
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  await new Promise(r => setTimeout(r, 500));

  // 點過所有分頁按鈕與可見按鈕
  const clickAll = (selector) => {
    for (const el of window.document.querySelectorAll(selector)) {
      try { el.click(); } catch (e) { errors.push(`點擊 ${el.id || el.className} 失敗: ${e.message}`); }
    }
  };
  clickAll('[id^="tab-"][id$="-btn"]');
  await new Promise(r => setTimeout(r, 300));
  clickAll('.shift-tab, .tab-btn');
  await new Promise(r => setTimeout(r, 300));

  // 幾個關鍵函式直接呼叫
  const common = ['todayStr', 'toLocalDateStr', 'escapeHtml', 'escapeJsAttr', 'generalButtonState',
                  't', 'renderTranslations', 'loadTranslations', 'ensureLib'];
  const perPage = {
    'index.html': ['checkBiometricSupport', 'setPickerLocation', 'renderCharts',
                   'exportAllEmployeesReport', 'buildPayslipHtml', 'printPayslip', 'clearMonthDataCache'],
    'salary.html': ['buildPayslipHtml', 'printPayslip', 'displaySalaryCalculation', 'saveSalaryRecord'],
    'shift.html': ['isFullDayOvertime'].filter(() => false)
  };
  // 只檢查這一頁真的有載入的工具檔提供的函式；
  // 像 manual.html 只需要 i18n，沒載 utils.js / libs.js 是正常的
  const providedBy = {
    todayStr: 'utils.js', toLocalDateStr: 'utils.js', escapeHtml: 'utils.js',
    escapeJsAttr: 'utils.js', generalButtonState: 'utils.js',
    ensureLib: 'libs.js',
    t: 'i18n.js', renderTranslations: 'i18n.js', loadTranslations: 'i18n.js'
  };
  const probes = common
    .filter(fn => !providedBy[fn] || scripts.includes(providedBy[fn]))
    .concat(perPage[page] || []);
  for (const fn of probes) {
    if (typeof window[fn] !== 'function') errors.push(`缺少全域函式: ${fn}`);
  }
  await new Promise(r => setTimeout(r, 500));

  // 薪資明細表：用假資料實際組一次 HTML
  if (typeof window.buildPayslipHtml === 'function') {
    try {
      const sample = { employeeId: 'U1', employeeName: '王小明', yearMonth: '2026-08', salaryType: '月薪',
                       baseSalary: 36000, mealAllowance: 2400, weekdayOvertimePay: 1500,
                       laborFee: 800, healthFee: 600, incomeTax: 0, bankAccount: '1234567890',
                       totalWorkHours: 176, totalOvertimeHours: 6, grossSalary: 39900, netSalary: 38500 };
      const out = window.buildPayslipHtml(sample);
      const checks = ['薪資明細表', '王小明', '2026-08', 'NT$ 38,500', 'NT$ 39,900', '****7890'];
      const miss = checks.filter(c => !out.includes(c));
      console.log('薪資明細表:', miss.length ? '缺少 ' + miss.join(', ') : 'OK（' + out.length + ' 字元）');
      if (miss.length) errors.push('薪資明細表缺少: ' + miss.join(', '));
    } catch (e) {
      errors.push('薪資明細表產生失敗: ' + e.message);
    }
  }

  const helpBoxes = window.document.querySelectorAll('.help-box').length;
  console.log(`操作說明區塊: ${helpBoxes}`);
  console.log(`錯誤數: ${errors.length}`);
  errors.slice(0, 25).forEach((e, i) => console.log(`  ${i + 1}. ${e.slice(0, 260)}`));
  process.exit(errors.length ? 1 : 0);
})();
