// 第三方函式庫延遲載入
// Chart.js、Leaflet、SheetJS 只有特定分頁用得到（分析圖表、地圖、匯出報表），
// 原本三支都寫在 <head> 一律下載，手機端首屏白等。改成真的要用時才載，
// 同一支只會載入一次，重複呼叫會共用同一個 Promise。

const LIB_SOURCES = {
    chart: {
        src: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
        integrity: 'sha256-DiMmxoaAcr7BWSdgxnKQQ8ruopYKK0bO5qIZKqxqv/A='
    },
    leaflet: {
        src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
        integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
    },
    xlsx: {
        src: 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
        integrity: 'sha256-NqQvQJ/puLjk0RLw7cgmiD5A7Yjq4HGYekJ6A4mwbAM='
    }
};

// 已經有全域物件就不用再載（例如頁面自己用 <script> 掛過）
const LIB_GLOBALS = {
    chart: () => typeof Chart !== 'undefined',
    leaflet: () => typeof L !== 'undefined',
    xlsx: () => typeof XLSX !== 'undefined'
};

const _libPromises = {};

/**
 * 確保指定的函式庫已載入。
 * @param {'chart'|'leaflet'|'xlsx'} name
 * @returns {Promise<void>}
 */
function ensureLib(name) {
    const lib = LIB_SOURCES[name];
    if (!lib) return Promise.reject(new Error(`未知的函式庫: ${name}`));
    if (LIB_GLOBALS[name]()) return Promise.resolve();
    if (_libPromises[name]) return _libPromises[name];
    
    const src = lib.src;
    _libPromises[name] = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        if (lib.integrity) {
            script.integrity = lib.integrity;
            script.crossOrigin = 'anonymous';
        }
        script.onload = () => resolve();
        script.onerror = () => {
            delete _libPromises[name]; // 讓下次還能重試
            reject(new Error(`載入失敗: ${src}`));
        };
        document.head.appendChild(script);
    });
    
    return _libPromises[name];
}

// ==================== 分頁模組延遲載入 ====================
// 薪資、加班、請假、費用、工作日誌、管理員分析這些只有切到那個分頁才用得到，
// 原本主頁一開就全部下載、解析（約 30 萬字元），一般員工多半用不到。
// 改成切到分頁（或管理員子分頁）時才載入；同一支只載一次，依順序載入。
// 開頁就會用到的（打卡、補打卡、公告、基本資料、QR、地點選擇）仍在 index.html 直接載入。

const MODULE_SCRIPTS = {
    'monthly-view': ['reports.js'],
    'overtime-view': ['attachments.js', 'overtime.js'],
    'leave-view': ['attachments.js', 'leave.js'],
    'salary-view': ['payslip.js', 'salary.js'],
    'worklog-view': ['worklog.js'],
    'expense-view': ['attachments.js', 'expense.js'],
    // 管理員頁子分頁（script.js ADMIN_GROUP_LOADERS）
    'admin:today': ['attendance-dashboard.js'],
    'admin:review': ['attachments.js', 'overtime.js', 'leave.js', 'worklog.js', 'expense.js'],
    'admin:reports': ['analytics.js', 'audit-log.js', 'reports.js', 'worklog.js']
};

const _scriptPromises = {};

function loadScriptOnce(src) {
    if (_scriptPromises[src]) return _scriptPromises[src];
    // 頁面本身已經用 <script src> 載入（例如 salary.html 直接載 salary.js），再載一次會重複宣告
    if (document.querySelector(`script[src="${src}"]`)) return (_scriptPromises[src] = Promise.resolve());
    _scriptPromises[src] = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => {
            delete _scriptPromises[src];   // 網路恢復後還能重試
            reject(new Error(`載入失敗: ${src}`));
        };
        document.body.appendChild(script);
    });
    return _scriptPromises[src];
}

/**
 * 載入某個分頁需要的模組。沒有登記的分頁直接完成。
 * 載入失敗會顯示連線錯誤，並把錯誤往外丟，呼叫端就不會去叫還沒定義的函式。
 */
async function loadModules(key) {
    try {
        for (const src of MODULE_SCRIPTS[key] || []) await loadScriptOnce(src);
    } catch (error) {
        if (typeof showNotification === 'function') showNotification(t('CONNECTION_FAILED'), 'error');
        throw error;
    }
}
