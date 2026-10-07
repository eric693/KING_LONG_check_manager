// qr-punch.js
//
// LINE Bot 網頁打卡與 QR Code 打卡。兩者都是用一次性 token 換打卡資格。
//
// 從 script.js 拆出來的：那支原本 4,000 多行，每個頁面都要整份載入。
// 這裡的函式仍然是全域的，載入順序沒有相依性。

/**
 * 後端的錯誤訊息只有中文（有些會附上距離等細節）。中文介面直接用，
 * 其他語言改用翻譯好的通用訊息，員工才看得懂。
 */
function punchServerMessage(res, fallbackKey) {
    const lang = (typeof currentLang !== 'undefined' && currentLang) || 'zh-TW';
    if (lang === 'zh-TW' && res && res.msg) return res.msg;
    return t(fallbackKey);
}

/** LINE 打卡頁關閉結果視窗：能回上一頁就回去，回不去（從 LINE 直接開的）就載入一般首頁 */
function leaveLinePunchPage(overlay) {
    overlay.remove();
    if (!window.__linePunchOnly) return;
    try { window.history.back(); } catch (e) { /* 沒有上一頁 */ }
    setTimeout(() => { window.location.replace(window.location.pathname); }, 400);
}

async function handleLinePunchFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('linePunchToken');
    if (!token) return;

    history.replaceState({}, '', window.location.pathname);

    // 全螢幕 overlay
    const overlay = document.createElement('div');
    overlay.id = 'line-punch-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:32px 24px;max-width:320px;width:90%;text-align:center;">
        <div id="lpo-icon" style="font-size:48px;margin-bottom:12px;">📍</div>
        <div id="lpo-title" style="font-size:20px;font-weight:bold;margin-bottom:8px;"></div>
        <div id="lpo-sub" style="font-size:14px;color:#666;margin-bottom:16px;"></div>
        <button id="lpo-close" style="display:none;margin-top:8px;padding:10px 28px;border-radius:8px;border:none;background:#4CAF50;color:#fff;font-size:16px;cursor:pointer;"></button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#lpo-title').textContent = t('LPT_LOCATING');
    overlay.querySelector('#lpo-sub').textContent = t('LPT_ALLOW_GPS');
    overlay.querySelector('#lpo-close').textContent = t('LPT_CLOSE');

    const setResult = (icon, title, sub, btnColor) => {
        overlay.querySelector('#lpo-icon').textContent = icon;
        overlay.querySelector('#lpo-title').textContent = title;
        overlay.querySelector('#lpo-sub').textContent = sub;
        const btn = overlay.querySelector('#lpo-close');
        btn.style.display = 'inline-block';
        btn.style.background = btnColor || '#4CAF50';
        btn.onclick = () => leaveLinePunchPage(overlay);
    };

    let position;
    try {
        position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                timeout: 15000,
                enableHighAccuracy: true
            });
        });
    } catch (err) {
        // 只有定位本身失敗才顯示定位錯誤；以前連線失敗也會被說成「無法取得位置」
        const geoErrors = { 1: t('LPT_GEO_DENIED'), 3: t('LPT_GEO_TIMEOUT') };
        setResult('❌', t('LPT_NO_LOCATION'), geoErrors[err.code] || t('LPT_GEO_CHECK'), '#f44336');
        return;
    }

    try {
        overlay.querySelector('#lpo-title').textContent = t('LPT_PUNCHING');
        overlay.querySelector('#lpo-sub').textContent = '';

        const params = new URLSearchParams({
            token: token,
            lat: position.coords.latitude,
            lng: position.coords.longitude
        });

        // 尖峰時段系統忙碌會自動重試；同一個打卡連結重送是安全的（後端回傳同樣的成功結果）
        const res = await punchWithRetry(`linePunch&${params.toString()}`, '', n => {
            overlay.querySelector('#lpo-sub').textContent = t('PUNCH_RETRYING', { n: n });
        });

        if (res.ok) {
            const typeText = res.punchType === '上班' ? '🟢 ' + t('KIOSK_CHECK_IN') : '🟠 ' + t('KIOSK_CHECK_OUT');
            const detailText = `${res.location ? res.location + '｜' : ''}${res.time || ''}`;
            setResult('✅', t('LPT_SUCCESS', { type: typeText }), detailText, '#4CAF50');

            // 3 秒倒數後自動關閉，並嘗試返回上一頁
            const card = overlay.querySelector('div');
            const countdownEl = document.createElement('div');
            countdownEl.style.cssText = 'font-size:12px;color:#aaa;margin-top:10px;';
            card.appendChild(countdownEl);
            let secs = 3;
            countdownEl.textContent = t('LPT_AUTO_CLOSE', { secs: secs });
            const autoCloseTimer = setInterval(() => {
                secs--;
                if (secs <= 0) {
                    clearInterval(autoCloseTimer);
                    leaveLinePunchPage(overlay);
                } else {
                    countdownEl.textContent = t('LPT_AUTO_CLOSE', { secs: secs });
                }
            }, 1000);
            overlay.querySelector('#lpo-close').onclick = () => {
                clearInterval(autoCloseTimer);
                leaveLinePunchPage(overlay);
            };

        } else {
            const msgMap = {
                ERR_NETWORK:      t('PUNCH_BUSY_FAILED'),
                ERR_LPT_INVALID:  t('LPT_ERR_INVALID'),
                ERR_LPT_EXPIRED:  t('LPT_ERR_EXPIRED'),
                // 後端的中文訊息會附上最近的打卡地點與距離，中文介面直接用
                ERR_NOT_IN_RANGE: punchServerMessage(res, 'LPT_ERR_NOT_IN_RANGE'),
                ERR_DUPLICATE_PUNCH: t('LPT_ERR_DUPLICATE'),
                // 一天兩組上下班的順序規則（GS/PunchRules.gs）
                ERR_PUNCH_SAME_TYPE: t('ERR_PUNCH_SAME_TYPE', res.params || {}),
                ERR_PUNCH_LIMIT: t('ERR_PUNCH_LIMIT', res.params || {})
            };
            const failText = msgMap[res.code] || (isBusyPunchFailure(res) ? t('PUNCH_BUSY_FAILED') : punchServerMessage(res, 'LPT_TRY_LATER'));
            // 系統錯誤時附上原因，截圖給管理員就知道是哪裡壞了
            setResult('❌', t('LPT_FAILED'), res.detail ? `${failText}（${res.detail}）` : failText, '#f44336');
        }
    } catch (err) {
        console.error('LINE 打卡失敗:', err);
        setResult('❌', t('LPT_FAILED'), t('PUNCH_BUSY_FAILED'), '#f44336');
    }
}

/**
 * 處理登入後待執行的 QR 打卡
 */
async function handlePendingQRPunch() {
    const pendingToken = sessionStorage.getItem('pendingQRToken');
    if (!pendingToken) return;
    sessionStorage.removeItem('pendingQRToken');
    await performQRPunch(pendingToken);
}

/**
 * 員工 QR 打卡（由掃描後的 URL 觸發）
 */
async function performQRPunch(qrTokenId) {
    showNotification(t('NOTIF_QR_PROCESSING'), 'info');
    try {
        const token = localStorage.getItem('sessionToken');
        if (!token) {
            showNotification(t('NOTIF_LOGIN_REQUIRED_QR'), 'error');
            return;
        }
        const qrLoc = sessionStorage.getItem('pendingQRLoc') || '';
        sessionStorage.removeItem('pendingQRLoc');
        const urlParams = new URLSearchParams({ qrToken: qrTokenId });
        if (qrLoc) urlParams.append('loc', qrLoc);
        const qrType = String(qrTokenId).indexOf('O_') === 0 ? '下班' : '上班';
        const res = await punchWithRetry(`qrPunch&${urlParams.toString()}`, qrType, n => {
            showNotification(t('PUNCH_RETRYING', { n: n }), 'warning');
        });
        if (res.ok) {
            const type = (res.params && res.params.type) || '';
            const loc  = (res.params && res.params.location) || '';
            showNotification(t('NOTIF_QR_PUNCH_OK', { detail: `${type || ''}${loc ? ' - ' + loc : ''}`.trim() }), 'success');
            // 重新載入異常記錄
            await loadAbnormalRecordsInBackground();
        } else {
            const msgMap = {
                'ERR_QR_EXPIRED':       t('QR_ERR_EXPIRED'),
                'ERR_QR_INVALID':       t('QR_ERR_INVALID'),
                'ERR_DUPLICATE_PUNCH':  punchServerMessage(res, 'QR_ERR_DUPLICATE'),
                'ERR_PUNCH_SAME_TYPE':  t('ERR_PUNCH_SAME_TYPE', res.params || {}),
                'ERR_PUNCH_LIMIT':      t('ERR_PUNCH_LIMIT', res.params || {}),
                'ERR_SESSION_INVALID':  t('QR_ERR_LOGIN')
            };
            showNotification(msgMap[res.code] || (isBusyPunchFailure(res) ? t('PUNCH_BUSY_FAILED') : punchServerMessage(res, 'NOTIF_QR_PUNCH_FAILED')), 'error');
        }
    } catch (err) {
        console.error('QR 打卡錯誤:', err);
        showNotification(t('NOTIF_QR_PUNCH_FAILED'), 'error');
    }
}

/**
 * 管理員：產生 QR Code
 *
 * 代碼由後端簽章（見 GS/QrPunch.gs）。以前是前端自己組，員工可以自己拼一個
 * 到期時間很久以後的代碼在家打卡。
 */
async function generateAdminQRCode() {
    const punchTypeEl = document.querySelector('input[name="qr-punch-type"]:checked');
    const punchType   = punchTypeEl ? punchTypeEl.value : '上班';

    const validSelect = document.getElementById('qr-valid-minutes');
    let validMinutes;
    if (validSelect.value === 'custom') {
        validMinutes = parseInt(document.getElementById('qr-valid-minutes-custom').value);
        if (!validMinutes || validMinutes < 1 || validMinutes > 1440) {
            showNotification(t('NOTIF_MINUTES_RANGE'), 'error');
            return;
        }
    } else {
        validMinutes = parseInt(validSelect.value);
    }

    const locationName = (document.getElementById('qr-location-name').value || '').trim();

    const btn = document.getElementById('generate-qr-btn');
    btn.disabled    = true;
    btn.textContent = t('QR_GENERATING');

    try {
        const res = await callApifetch(
            `createQrToken&punchType=${encodeURIComponent(punchType)}` +
            `&minutes=${validMinutes}&loc=${encodeURIComponent(locationName)}`, null);
        if (!res.ok) {
            showNotification(res.msg || t('NOTIF_QR_GENERATE_FAILED'), 'error');
            return;
        }
        const expiryMs  = res.expiresAt;
        const tokenId   = res.token;

        // 組成員工掃描後開啟的 URL
        const redirectUrl = API_CONFIG.redirectUrl.replace(/\/$/, '');
        const signedLoc   = res.loc || '';  // 後端簽章用的地點名稱，網址要跟它一字不差
        const locParam    = signedLoc ? `&loc=${encodeURIComponent(signedLoc)}` : '';
        const punchUrl    = `${redirectUrl}/?qrToken=${tokenId}${locParam}`;

        // 使用 qrcodejs 在瀏覽器端直接產生 QR Code（同步，不需要 Promise）
        const qrContainer = document.getElementById('qr-image');
        qrContainer.innerHTML = '';  // 清除上一次的 QR Code
        new QRCode(qrContainer, {
            text: punchUrl,
            width: 250,
            height: 250,
            colorDark: '#1e1b4b',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });

        // 標籤顯示
        const typeBadge = document.getElementById('qr-type-badge');
        typeBadge.textContent = punchType === '上班' ? t('KIOSK_CHECK_IN') : t('KIOSK_CHECK_OUT');
        typeBadge.className   = punchType === '上班'
            ? 'inline-block px-3 py-1 rounded-full text-sm font-bold mb-3 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
            : 'inline-block px-3 py-1 rounded-full text-sm font-bold mb-3 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300';

        const locBadge = document.getElementById('qr-location-badge');
        if (locationName) {
            locBadge.textContent = locationName;
            locBadge.style.display = 'inline-block';
        } else {
            locBadge.style.display = 'none';
        }

        document.getElementById('qr-display-area').style.display       = 'block';
        document.getElementById('qr-expired-msg').style.display         = 'none';
        document.getElementById('qr-regenerate-btn').style.display      = 'none';
        document.getElementById('qr-image').style.opacity               = '1';
        document.getElementById('qr-countdown-container').style.display = 'block';

        // 啟動倒數計時
        _qrExpiryTime = expiryMs;
        _qrTotalMs    = validMinutes * 60 * 1000;
        if (_qrCountdownInterval) clearInterval(_qrCountdownInterval);
        _tickQRCountdown();
        _qrCountdownInterval = setInterval(_tickQRCountdown, 1000);

        showNotification(t('NOTIF_QR_GENERATED', { minutes: validMinutes }), 'success');

    } catch (err) {
        console.error('generateAdminQRCode 錯誤:', err);
        showNotification(t('NOTIF_QR_GENERATE_FAILED'), 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = t('QR_GENERATE_BTN');
    }
}

/**
 * QR Code 倒數計時一次 tick
 */
function _tickQRCountdown() {
    if (!_qrExpiryTime) return;
    const remaining = _qrExpiryTime - Date.now();

    if (remaining <= 0) {
        clearInterval(_qrCountdownInterval);
        _qrCountdownInterval = null;
        document.getElementById('qr-countdown').textContent = '00:00';
        document.getElementById('qr-progress-fill').style.width = '0%';
        document.getElementById('qr-image').style.opacity = '0.3';
        document.getElementById('qr-countdown-container').style.display = 'none';
        document.getElementById('qr-expired-msg').style.display    = 'block';
        document.getElementById('qr-regenerate-btn').style.display = 'block';
        return;
    }

    const totalSec   = Math.ceil(remaining / 1000);
    const mins       = Math.floor(totalSec / 60);
    const secs       = totalSec % 60;
    const countdownEl = document.getElementById('qr-countdown');
    if (countdownEl) {
        countdownEl.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        // 顏色警示：剩餘 < 1 分鐘時變紅
        countdownEl.className = remaining < 60000
            ? 'text-4xl font-bold font-mono text-red-500 dark:text-red-400'
            : 'text-4xl font-bold font-mono text-indigo-600 dark:text-indigo-400';
    }

    const pct = _qrTotalMs > 0 ? (remaining / _qrTotalMs) * 100 : 0;
    const fillEl = document.getElementById('qr-progress-fill');
    if (fillEl) {
        fillEl.style.width = Math.max(0, pct) + '%';
        fillEl.className = remaining < 60000
            ? 'bg-red-500 h-2 rounded-full transition-all duration-1000'
            : 'bg-indigo-600 h-2 rounded-full transition-all duration-1000';
    }
}

// ==================== 平板打卡（管理員設定） ====================
//
// 平板用 kiosk.html 常駐顯示 QR Code。管理員在這裡產生平板專用的連結，
// 連結裡的金鑰只能拿來產生打卡 QR Code，平板上不必登入任何帳號。

let _kioskAdminBound = false;

function buildKioskUrl(kioskKey) {
    const base = API_CONFIG.redirectUrl.replace(/\/?$/, '/');
    // 金鑰放在 # 後面：不會送到伺服器，也不會出現在其他網站的 Referer 裡
    return `${base}kiosk.html#key=${encodeURIComponent(kioskKey)}`;
}

async function initKioskAdmin() {
    const section = document.getElementById('kiosk-admin-section');
    if (!section) return;

    if (!_kioskAdminBound) {
        _kioskAdminBound = true;
        document.getElementById('kiosk-create-btn')?.addEventListener('click', createKioskLink);
        document.getElementById('kiosk-disable-btn')?.addEventListener('click', disableKioskLink);
        document.getElementById('kiosk-copy-btn')?.addEventListener('click', async () => {
            const input = document.getElementById('kiosk-link-input');
            if (!input) return;
            try {
                await navigator.clipboard.writeText(input.value);
            } catch (error) {
                input.select();
                document.execCommand('copy');
            }
            showNotification(t('KIOSK_COPIED'), 'success');
        });
    }

    await refreshKioskStatus();
}

async function refreshKioskStatus() {
    const statusEl = document.getElementById('kiosk-status');
    const disableBtn = document.getElementById('kiosk-disable-btn');
    try {
        const res = await callApifetch('getKioskStatus', null);
        if (!res.ok) return;

        const locInput = document.getElementById('kiosk-location-name');
        if (locInput && !locInput.value) locInput.value = res.loc || '';

        if (statusEl) {
            statusEl.textContent = res.enabled
                ? t('KIOSK_STATUS_ENABLED', { loc: res.loc })
                : t('KIOSK_STATUS_DISABLED');
            statusEl.className = 'text-sm font-semibold mb-4 ' +
                (res.enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400');
        }
        if (disableBtn) disableBtn.style.display = res.enabled ? 'block' : 'none';
    } catch (error) {
        console.error('查詢平板打卡狀態失敗:', error);
    }
}

async function createKioskLink() {
    const button = document.getElementById('kiosk-create-btn');
    const loc = (document.getElementById('kiosk-location-name')?.value || '').trim();

    if (!confirm(t('KIOSK_CREATE_CONFIRM'))) return;

    generalButtonState(button, 'processing', t('LOADING'));
    try {
        const res = await callApifetch(`resetKioskKey&loc=${encodeURIComponent(loc)}`, null);
        if (!res.ok) {
            showNotification(res.msg || t('KIOSK_CREATE_FAILED'), 'error');
            return;
        }

        const url = buildKioskUrl(res.kioskKey);
        const area = document.getElementById('kiosk-link-area');
        const input = document.getElementById('kiosk-link-input');
        const qr = document.getElementById('kiosk-link-qr');
        if (input) input.value = url;
        if (qr && typeof QRCode !== 'undefined') {
            qr.innerHTML = '';
            new QRCode(qr, { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
        }
        if (area) area.style.display = 'block';

        showNotification(t('KIOSK_CREATED'), 'success');
        await refreshKioskStatus();
    } catch (error) {
        console.error('產生平板打卡連結失敗:', error);
        showNotification(t('KIOSK_CREATE_FAILED'), 'error');
    } finally {
        generalButtonState(button, 'idle');
    }
}

async function disableKioskLink() {
    if (!confirm(t('KIOSK_DISABLE_CONFIRM'))) return;

    try {
        const res = await callApifetch('disableKiosk', null);
        if (!res.ok) {
            showNotification(res.msg || t('KIOSK_DISABLE_FAILED'), 'error');
            return;
        }
        const area = document.getElementById('kiosk-link-area');
        if (area) area.style.display = 'none';
        showNotification(t('KIOSK_DISABLED'), 'success');
        await refreshKioskStatus();
    } catch (error) {
        console.error('停用平板打卡失敗:', error);
        showNotification(t('KIOSK_DISABLE_FAILED'), 'error');
    }
}
