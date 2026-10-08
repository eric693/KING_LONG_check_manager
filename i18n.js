// 共用語系模組：script.js 與 shift.js 原本各有一份 t()/loadTranslations()/
// renderTranslations()，兩份已經開始分歧（shift.js 少了 data-i18n-key 那段），
// 這裡抽成單一份，兩支腳本都靠它。
//
// 語系檔優先讀同網域的 i18n/<lang>.json，讀不到才退回原本寫死的 GitHub Pages。
// 頁面標題的翻譯鍵預設是 APP_TITLE，個別頁面可設 window.I18N_TITLE_KEY 覆寫。

var translations = {};
var currentLang = localStorage.getItem('lang');

var I18N_SUPPORTED = ['zh-TW', 'en-US', 'ja', 'ko', 'vi', 'th', 'id'];
var I18N_REMOTE_BASE = 'https://eric693.github.io/KING_LONG_check_manager/i18n/';

/**
 * 依瀏覽器語言挑一個支援的語系（localStorage 已有紀錄時優先用紀錄）
 */
function detectLang() {
    const saved = localStorage.getItem('lang');
    if (I18N_SUPPORTED.includes(saved)) return saved;
    
    const browserLang = navigator.language || navigator.userLanguage || '';
    if (browserLang.startsWith('zh')) return 'zh-TW';
    if (browserLang.startsWith('ja')) return 'ja';
    if (browserLang.startsWith('vi')) return 'vi';
    if (browserLang.startsWith('id')) return 'id';
    if (browserLang.startsWith('ko')) return 'ko';
    if (browserLang.startsWith('th')) return 'th';
    return 'en-US';
}

/**
 * 翻譯函式：找不到鍵就原樣回傳，參數值本身也會先試著翻譯一次
 */
function t(code, params = {}) {
    let text = translations[code] || code;
    
    for (const key in params) {
        let paramValue = params[key];
        if (paramValue in translations) {
            paramValue = translations[paramValue];
        }
        // 用 split/join：參數裡的 $ 不會被當成 replace 的特殊符號，同一佔位符出現多次也都換掉
        text = text.split(`{${key}}`).join(String(paramValue));
    }
    return text;
}

// 同一個語系不重複抓；原本 script.js 初始化時會連抓兩次
let _i18nLoading = null;
let _i18nLoaded = null;

async function loadTranslations(lang) {
    const target = I18N_SUPPORTED.includes(lang) ? lang : detectLang();
    
    if (_i18nLoaded === target) {
        renderTranslations();
        return translations;
    }
    if (_i18nLoading) await _i18nLoading.catch(() => {});
    
    _i18nLoading = (async () => {
        for (const url of [`i18n/${target}.json`, I18N_REMOTE_BASE + target + '.json']) {
            try {
                const res = await fetch(url);
                if (!res.ok) continue;
                translations = await res.json();
                currentLang = target;
                _i18nLoaded = target;
                localStorage.setItem('lang', target);
                renderTranslations();
                return translations;
            } catch (err) {
                console.warn('載入語系失敗:', url, err);
            }
        }
        console.error('載入語系失敗，維持原本畫面文字:', target);
        return translations;
    })();
    
    try { return await _i18nLoading; } finally { _i18nLoading = null; }
}

/**
 * 套用翻譯；可指定容器，動態插入的區塊自行呼叫一次即可
 */
function renderTranslations(container = document) {
    if (container === document) {
        const titleKey = window.I18N_TITLE_KEY || 'APP_TITLE';
        const title = t(titleKey);
        if (title !== titleKey) document.title = title;
    }

    // 靜態內容：[data-i18n]
    container.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translatedText = t(key);
        if (translatedText === key) return;
        
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            element.placeholder = translatedText;
        } else {
            element.textContent = translatedText;
        }
    });

    // 動態內容：[data-i18n-key]
    container.querySelectorAll('[data-i18n-key]').forEach(element => {
        const key = element.getAttribute('data-i18n-key');
        if (!key) return;
        const translatedText = t(key);
        if (translatedText !== key) element.textContent = translatedText;
    });

    // 下拉選單的 option
    container.querySelectorAll('select').forEach(select => {
        select.querySelectorAll('option[data-i18n-option]').forEach(option => {
            const key = option.getAttribute('data-i18n-option');
            if (!key) return;
            const translatedText = t(key);
            if (translatedText !== key) option.textContent = translatedText;
        });
    });
}
