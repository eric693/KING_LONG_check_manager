// 共用小工具：本地日期、HTML 跳脫、正式版的 log 控制
// 這支要在其他腳本之前載入。

// ===== 除錯輸出 =====
// 正式環境把 console.log/debug/info 關掉：原本會印出 token 前綴、部門、
// 薪資欄位等資訊。warn 與 error 保留，出事時仍看得到。
const DEBUG_MODE = (() => {
    try {
        if (localStorage.getItem('debug') === '1') return true;
    } catch {}
    return ['localhost', '127.0.0.1'].includes(location.hostname);
})();

if (!DEBUG_MODE) {
    console.log = () => {};
    console.debug = () => {};
    console.info = () => {};
}

// ===== 本地日期 =====
// toISOString() 是 UTC，台灣時間 00:00-08:00 之間切出來的日期會變成前一天，
// 早班與大夜班的「今日排班」「今天」因此全部抓錯，所以一律走這兩個函式。

/**
 * 依使用者所在時區把 Date 轉成 YYYY-MM-DD
 */
function toLocalDateStr(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 今天（本地時區）的 YYYY-MM-DD
 */
function todayStr() {
    return toLocalDateStr(new Date());
}

// ===== HTML 跳脫 =====
// 公告內容、請假／加班原因、姓名等都是使用者填的，直接內插進 innerHTML
// 會變成儲存型 XSS——員工在原因欄放 <img onerror> 就能在管理員的瀏覽器執行。

/**
 * 跳脫 HTML 特殊字元，用於內插進 innerHTML 的文字
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

/**
 * 要放進 onclick="fn('...')" 這種行內事件的字串。
 * 屬性值會先被 HTML 解碼再交給 JS 解析，所以要先做 JS 字串跳脫再做 HTML 跳脫，
 * 否則姓名裡的單引號就能跳出字串執行任意程式碼。
 */
function escapeJsAttr(value) {
    const js = String(value === null || value === undefined ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, '\\n');
    return escapeHtml(js);
}

/**
 * 按鈕的處理中／閒置狀態切換。
 * 原本 overtime.js 與 script.js 各有一份，而 script.js 裡那份宣告在
 * DOMContentLoaded 內，檔案層級的 doPunch()、匯出函式其實是用到 overtime.js 的版本，
 * 也就是 salary.html（沒載 overtime.js）一按就會 ReferenceError。統一放這裡。
 */
function generalButtonState(button, state, loadingText) {
    if (!button) return;
    const loadingClasses = 'opacity-50 cursor-not-allowed';
    const text = loadingText || (typeof t === 'function' ? t('NOTIF_PROCESSING') : '處理中...');

    if (state === 'processing') {
        button.dataset.originalText = button.textContent;
        button.dataset.loadingClasses = loadingClasses;
        button.disabled = true;
        button.textContent = text;
        button.classList.add(...loadingClasses.split(' '));
    } else {
        if (button.dataset.loadingClasses) {
            button.classList.remove(...button.dataset.loadingClasses.split(' '));
        }
        button.disabled = false;
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

// ===== DOM 小幫手 =====
// script.js 同時被 index.html 與 salary.html 載入，但登入相關的元素只有 index.html 有。
// 直接 document.getElementById(...).textContent = ... 會在 salary.html 丟 TypeError，
// 而且是在 DOMContentLoaded 裡面丟，後面的初始化會整段中止。

/** 設定元素文字；元素不存在就跳過 */
function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
    return el;
}

/** 設定元素的 style.display；元素不存在就跳過 */
function setElementDisplay(id, display) {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
    return el;
}

/** 設定圖片來源；元素不存在就跳過 */
function setElementSrc(id, src) {
    const el = document.getElementById(id);
    if (el) el.src = src;
    return el;
}

// ===== 數字欄位不吃滾輪 =====
// 數字欄位還在游標焦點時滾動滑鼠，瀏覽器會直接把數值加減，
// 管理員填完全勤獎金 1000 往下捲，就悄悄變成 998。
// 滾輪一動就讓欄位失焦：數值不變，頁面照常捲動。
document.addEventListener('wheel', (e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement && el.type === 'number' && el === document.activeElement) {
        el.blur();
    }
}, { passive: true, capture: true });
