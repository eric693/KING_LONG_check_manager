// pwa.js
//
// 註冊 Service Worker（sw.js）並處理「安裝到主畫面」的提示。
// 只在 https 或 localhost 下會生效，GitHub Pages 兩者都符合。

let _deferredInstallPrompt = null;

/**
 * 註冊 Service Worker。
 * 路徑用相對的 './sw.js'，這樣放在 /KING_LONG_check_manager/ 子目錄或根目錄都能用。
 */
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log(' Service Worker 已註冊:', reg.scope))
            .catch(err => console.warn('Service Worker 註冊失敗:', err));
    });
}

/**
 * 安裝提示：瀏覽器判定可安裝時才顯示按鈕，安裝完或不支援就一直藏著
 */
function initInstallPrompt() {
    const btn = document.getElementById('install-app-btn');

    window.addEventListener('beforeinstallprompt', (e) => {
        // 擋掉瀏覽器預設的迷你提示列，改由我們自己的按鈕觸發
        e.preventDefault();
        _deferredInstallPrompt = e;
        if (btn) btn.style.display = 'inline-flex';
    });

    btn?.addEventListener('click', async () => {
        if (!_deferredInstallPrompt) return;

        _deferredInstallPrompt.prompt();
        const { outcome } = await _deferredInstallPrompt.userChoice;
        console.log(' 安裝結果:', outcome);

        // prompt() 只能用一次，用完就丟掉
        _deferredInstallPrompt = null;
        if (btn) btn.style.display = 'none';
    });

    window.addEventListener('appinstalled', () => {
        _deferredInstallPrompt = null;
        if (btn) btn.style.display = 'none';
        if (typeof showNotification === 'function') {
            showNotification(t('PWA_INSTALLED'), 'success');
        }
    });
}

registerServiceWorker();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInstallPrompt);
} else {
    initInstallPrompt();
}
