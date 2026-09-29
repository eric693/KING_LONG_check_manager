// 使用 CDN 或絕對路徑來載入 JSON 檔案
// 注意：本檔案需要依賴 config.js，請確保它在腳本之前被載入。

let currentMonthDate = new Date();
let monthDataCache = {}; // 新增：用於快取月份打卡資料
let userId = localStorage.getItem("sessionUserId");
let todayShiftCache = null; // 快取今日排班
let weekShiftCache = null;  // 快取本週排班
let _isPunching = false; 
// 地圖狀態（定位分頁的地圖、標記、範圍圈與地點圖層）
// 檔案層級的函式也會存取，所以不能宣告在 DOMContentLoaded 裡面
let mapInstance = null;
let mapLoadingText = null;
let currentCoords = null;
let marker = null;
let circle = null;
let locationMarkers = null;  // Leaflet 延遲載入，用到時才建立
let locationCircles = null;
// 語系相關（translations / currentLang / t / loadTranslations / renderTranslations）
// 已抽到共用的 i18n.js，請確保它在本檔之前載入。

/**
 * 透過 fetch API 呼叫後端 API。
 * @param {string} action - API 的動作名稱。
 * @param {string} [loadingId="loading"] - 顯示 loading 狀態的 DOM 元素 ID。
 * @returns {Promise<object>} - 回傳一個包含 API 回應資料的 Promise。
 */
// 實際的 HTTP 呼叫與 GET/POST 切換都在 api.js，這裡只負責 loading 狀態與錯誤提示。
// 抽出去的原因見 api.js：shift.html 不載入 script.js，以前那幾支永遠繞過這裡。

async function callApifetch(action, loadingId = "loading") {
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.style.display = "block";
    
    try {
        return await apiRequestJson(action);
    } catch (error) {
        showNotification(t("CONNECTION_FAILED"), "error");
        console.error("API 呼叫失敗:", error);
        throw error;
    } finally {
        if (loadingEl) loadingEl.style.display = "none";
    }
}

// ====================  管理員匯出所有員工報表功能 ====================

// 已移到 reports.js

/* ===== 共用訊息顯示 ===== */
const showNotification = (message, type = 'success') => {
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notification-message');
    notificationMessage.textContent = message;
    notification.className = 'notification'; // reset classes
    if (type === 'success') {
        notification.classList.add('bg-green-500', 'text-white');
    } else if (type === 'warning') {
        notification.classList.add('bg-yellow-500', 'text-white');
    } else {
        notification.classList.add('bg-red-500', 'text-white');
    }
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
};

// 確保登入
// script.js - 完整替換 ensureLogin 函數
async function ensureLogin() 
{
    return new Promise(async (resolve) => {
      const token = localStorage.getItem("sessionToken");
      
      if (!token) {
        showLoginUI();
        resolve(false);
        return;
      }
      
      //  關鍵新增：檢查本地快取
      const cachedUser = localStorage.getItem("cachedUser");
      const cacheTime = localStorage.getItem("cacheTime");
      const now = Date.now();
      
      // 如果快取存在且未過期（5 分鐘內）
      if (cachedUser && cacheTime && (now - parseInt(cacheTime)) < 5 * 60 * 1000) {
        console.log(' 使用快取，秒速登入');
        
        const user = JSON.parse(cachedUser);
        
        // 直接顯示 UI（不等待 API）
        if (user.dept === "管理員") {
          setElementDisplay('tab-admin-btn', 'block');
        }
        
        setElementText("user-name", user.name);
        setElementSrc("profile-img", user.picture);
        localStorage.setItem("sessionUserId", user.userId);
        
        setElementDisplay('login-section', 'none');
        setElementDisplay('user-header', 'flex');
        setElementDisplay('main-app', 'block');
        
        // 背景驗證（不阻塞 UI）
        checkSessionInBackground(token);
        
        // 背景載入異常記錄
        loadAbnormalRecordsInBackground();
        
        resolve(true);
        return;
      }
      
      // 快取過期或不存在，正常流程
      setElementText("status", t("CHECKING_LOGIN"));
      
      try {
        const res = await callApifetch("initApp");
        
        if (res.ok) {
          console.log(' initApp 成功，儲存快取');
          
          //  儲存快取
          localStorage.setItem("cachedUser", JSON.stringify(res.user));
          localStorage.setItem("cacheTime", Date.now().toString());
          
          if (res.user.dept === "管理員") {
            setElementDisplay('tab-admin-btn', 'block');
          }
          
          setElementText("user-name", res.user.name);
          setElementSrc("profile-img", res.user.picture || res.user.rate);
          localStorage.setItem("sessionUserId", res.user.userId);
          
          showNotification(t("LOGIN_SUCCESS"));
          
          setElementDisplay('login-section', 'none');
          setElementDisplay('user-header', 'flex');
          setElementDisplay('main-app', 'block');
          
          renderAbnormalRecords(res.abnormalRecords);
          
          resolve(true);
        } else {
          console.error(' initApp 失敗');
          
          // 清除快取
          localStorage.removeItem("cachedUser");
          localStorage.removeItem("cacheTime");
          
          showLoginUI();
          showNotification(` ${t(res.code || "UNKNOWN_ERROR")}`, "error");
          resolve(false);
        }
      } catch (err) {
        console.error(' ensureLogin 錯誤:', err);
        
        localStorage.removeItem("cachedUser");
        localStorage.removeItem("cacheTime");
        
        showLoginUI();
        resolve(false);
      }
    });


/**
 * 背景驗證 Session（不阻塞 UI）
 */
async function checkSessionInBackground(token) {
    try {
      const res = await callApifetch("checkSession&token=" + token);
      
      if (!res.ok) {
        console.log(' Session 已失效');
        localStorage.removeItem("cachedUser");
        localStorage.removeItem("cacheTime");
        showNotification(t('NOTIF_SESSION_EXPIRED'), 'warning');
        
        setTimeout(() => {
          showLoginUI();
        }, 2000);
      }
    } catch (error) {
      console.error('背景驗證失敗:', error);
    }
}}

/**
 * 背景載入異常記錄（不阻塞 UI）
 */
async function loadAbnormalRecordsInBackground() {
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const userId = localStorage.getItem('sessionUserId');
      
      const res = await callApifetch(`getAbnormalRecords&month=${month}&userId=${userId}`);
      
      if (res.ok) {
        renderAbnormalRecords(res.records);
      }
    } catch (error) {
      console.error('載入異常記錄失敗:', error);
    }
}
  
/** 待打的 QR 卡 → 帶過 LINE 登入的字串（base64url 的 JSON） */
function encodeLoginResume() {
    const q = sessionStorage.getItem('pendingQRToken');
    if (!q) return '';
    const l = sessionStorage.getItem('pendingQRLoc') || '';
    const json = JSON.stringify(l ? { q: q, l: l } : { q: q });
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** LINE 登入回來的 state → { q, l }；不是我們放的就回傳 null */
function decodeLoginResume(state) {
    const dot = String(state || '').indexOf('.');
    if (dot === -1) return null;
    try {
        const b64 = state.slice(dot + 1).replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
        const json = new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
        const data = JSON.parse(json);
        return data && typeof data.q === 'string' && /^[IO]_[0-9A-Fa-f]+_[0-9a-f]+$/.test(data.q)
            ? { q: data.q, l: typeof data.l === 'string' ? data.l : '' }
            : null;
    } catch (error) {
        return null;
    }
}

/**
 * 登入成功（LINE 或登入連結）：存 session、顯示主畫面，再處理登入前掃的 QR 卡
 */
async function applyLoginResult(res) {
    localStorage.setItem("sessionToken", res.sToken);
    localStorage.setItem("cachedUser", JSON.stringify(res.user));
    localStorage.setItem("cacheTime", Date.now().toString());
    localStorage.setItem("sessionUserId", res.user.userId);

    if (res.user.dept === "管理員") {
        setElementDisplay('tab-admin-btn', 'block');
    }
    setElementText("user-name", res.user.name);
    setElementSrc("profile-img", res.user.picture);

    setElementDisplay('login-section', 'none');
    setElementDisplay('user-header', 'flex');
    setElementDisplay('main-app', 'block');

    if (res.abnormalRecords) {
        renderAbnormalRecords(res.abnormalRecords);
    }

    showNotification(t("LOGIN_SUCCESS"), "success");

    // UI 顯示後才載入異常記錄（不阻塞登入）
    loadAbnormalRecordsInBackground();

    // 初始化生物辨識（背景執行；薪資頁沒有載入 biometric.js）
    if (typeof initBiometricPunch === 'function') initBiometricPunch();

    // 登入後處理待執行的 QR 打卡
    if (typeof handlePendingQRPunch === 'function') await handlePendingQRPunch();
}

/** 前往 LINE 登入；有待打的 QR 卡就一起帶過去 */
async function startLineLogin() {
    const resume = encodeLoginResume();
    const res = await callApifetch('getLoginUrl' + (resume ? '&resume=' + encodeURIComponent(resume) : ''));
    if (res.url) window.location.href = res.url;
}

function showLoginUI() {
    setElementDisplay('login-btn', 'block');
    document.getElementById('user-header').style.display = 'none';
    document.getElementById('main-app').style.display = 'none';
    setElementText("status", t("SUBTITLE_LOGIN"));
}

/**
 *  渲染異常記錄（從 initApp 返回的資料）
 */
function renderAbnormalRecords(records) {
    console.log(' renderAbnormalRecords 開始', records);
    
    const recordsLoading = document.getElementById("abnormal-records-loading");
    const abnormalRecordsSection = document.getElementById("abnormal-records-section");
    const abnormalList = document.getElementById("abnormal-list");
    const recordsEmpty = document.getElementById("abnormal-records-empty");
    
    // 薪資頁等其他頁面沒有異常記錄區塊，直接略過
    if (!abnormalRecordsSection) return;
    
    if (!recordsLoading || !abnormalList || !recordsEmpty) {
        console.error(' 找不到必要的 DOM 元素');
        return;
    }
    
    recordsLoading.style.display = 'none';
    abnormalRecordsSection.style.display = 'block';
    
    if (records && records.length > 0) {
        console.log(` 有 ${records.length} 筆異常記錄`);
        
        recordsEmpty.style.display = 'none';
        abnormalList.innerHTML = '';
        
        const sortedRecords = records.sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });
        
        sortedRecords.forEach((record, index) => {
            console.log(`   ${index + 1}. ${record.date} - ${record.reason}`);
            
            let reasonClass, displayReason, buttonHtml;
            
            //  新增翻譯映射函數
            function translatePunchTypes(punchTypes) {
                if (!punchTypes) return '';
                
                const translations = {
                    '補上班審核中': t('STATUS_REPAIR_PENDING_IN') || 'Punch In Review Pending',
                    '補下班審核中': t('STATUS_REPAIR_PENDING_OUT') || 'Punch Out Review Pending',
                    '補上班通過': t('STATUS_REPAIR_APPROVED_IN') || 'Punch In Approved',
                    '補下班通過': t('STATUS_REPAIR_APPROVED_OUT') || 'Punch Out Approved',
                    '補上班被拒絕': t('STATUS_REPAIR_REJECTED_IN') || 'Punch In Rejected',
                    '補下班被拒絕': t('STATUS_REPAIR_REJECTED_OUT') || 'Punch Out Rejected'
                };
                
                return translations[punchTypes] || punchTypes;
            }
            
            switch(record.reason) {
                case 'STATUS_REPAIR_PENDING':
                    //  修改這段
                    const isToday = record.date === todayStr();
                    const isTodayAdjust = record.punchTypes && record.punchTypes.includes('當日修正');
                    const isHistoryAdjust = record.punchTypes && record.punchTypes.includes('歷史補打');
                    
                    if (isTodayAdjust) {
                        // 當日修正：橘色標示
                        reasonClass = 'text-orange-600 dark:text-orange-400';
                        displayReason = ` ${translatePunchTypes(record.punchTypes)}（當日修正）`;
                        buttonHtml = `
                            <span class="text-sm font-semibold text-orange-600 dark:text-orange-400">
                                ⏳ ${displayReason}
                            </span>
                        `;
                    } else if (isHistoryAdjust) {
                        // 歷史補打：黃色標示
                        reasonClass = 'text-yellow-600 dark:text-yellow-400';
                        displayReason = ` ${translatePunchTypes(record.punchTypes)}（歷史補打）`;
                        buttonHtml = `
                            <span class="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                                ⏳ ${displayReason}
                            </span>
                        `;
                    } else {
                        // 一般補打卡：保持原樣
                        reasonClass = 'text-yellow-600 dark:text-yellow-400';
                        displayReason = translatePunchTypes(record.punchTypes);
                        buttonHtml = `
                            <span class="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                                ⏳ ${displayReason}
                            </span>
                        `;
                    }
                    break;
                    
                case 'STATUS_REPAIR_APPROVED':
                    reasonClass = 'text-green-600 dark:text-green-400';
                    displayReason = translatePunchTypes(record.punchTypes);
                    buttonHtml = `
                        <span class="text-sm font-semibold text-green-600 dark:text-green-400">
                             ${translatePunchTypes(record.punchTypes)}
                        </span>
                    `;
                    break;
                
                case 'STATUS_REPAIR_REJECTED':
                    reasonClass = 'text-orange-600 dark:text-orange-400';
                    displayReason = translatePunchTypes(record.punchTypes);
                    
                    //  判斷是上班還是下班
                    const isIn = record.punchTypes && record.punchTypes.includes('上班');
                    const punchType = isIn ? '上班' : '下班';
                    
                    buttonHtml = `
                        <button data-date="${record.date}" 
                                data-type="${punchType}"
                                class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-orange-600 dark:bg-orange-500 rounded-md hover:bg-orange-700 dark:hover:bg-orange-600 transition-colors">
                            ${t('REAPPLY') || 'Reapply'}
                        </button>
                    `;
                    break;
                    
                case 'STATUS_PUNCH_IN_MISSING':
                    reasonClass = 'text-red-600 dark:text-red-400';
                    displayReason = t('STATUS_PUNCH_IN_MISSING');
                    buttonHtml = `
                        <button data-date="${record.date}" 
                                data-type="上班"
                                class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-indigo-600 dark:bg-indigo-500 rounded-md hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors">
                            ${t('BTN_ADJUST_IN')}
                        </button>
                    `;
                    break;
                    
                case 'STATUS_BREAK_PUNCH_MISSING':
                    // 兩頭班沒打休息卡：休息開始補「下班」、休息結束補「上班」，時間在表單裡自己選
                    reasonClass = 'text-red-600 dark:text-red-400';
                    displayReason = t('STATUS_BREAK_PUNCH_MISSING');
                    buttonHtml = `
                        <div class="flex flex-col gap-1">
                            <button data-date="${record.date}" data-type="下班"
                                    class="adjust-btn px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 dark:bg-purple-500 rounded-md hover:bg-purple-700 transition-colors">
                                ${t('BTN_ADJUST_BREAK_START')}
                            </button>
                            <button data-date="${record.date}" data-type="上班"
                                    class="adjust-btn px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 dark:bg-indigo-500 rounded-md hover:bg-indigo-700 transition-colors">
                                ${t('BTN_ADJUST_BREAK_END')}
                            </button>
                        </div>
                    `;
                    break;

                case 'STATUS_PUNCH_OUT_MISSING':
                    reasonClass = 'text-red-600 dark:text-red-400';
                    displayReason = t('STATUS_PUNCH_OUT_MISSING');
                    buttonHtml = `
                        <button data-date="${record.date}" 
                                data-type="下班"
                                class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-purple-600 dark:bg-purple-500 rounded-md hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors">
                            ${t('BTN_ADJUST_OUT')}
                        </button>
                    `;
                    break;
                    
                default:
                    reasonClass = 'text-gray-600 dark:text-gray-400';
                    displayReason = t(record.reason) || record.reason;
                    buttonHtml = '';
            }
            
            const li = document.createElement('li');
            li.className = 'p-3 bg-gray-50 rounded-lg flex justify-between items-center dark:bg-gray-700';
            
            li.innerHTML = `
                <div>
                    <p class="font-medium text-gray-800 dark:text-white">${record.date}</p>
                    <p class="text-sm ${reasonClass}">
                        ${displayReason}
                    </p>
                </div>
                ${buttonHtml}
            `;
            
            abnormalList.appendChild(li);
        });
        
        console.log(' 渲染完成');
        
    } else {
        console.log('ℹ  沒有異常記錄');
        recordsEmpty.style.display = 'block';
        abnormalList.innerHTML = '';
    }
}
/**
/**
 *  檢查本月打卡異常（完整修正版 - 支援多語言）
 */
async function checkAbnormal() {
    const now = new Date();
    const month = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const userId = localStorage.getItem("sessionUserId");
    
    console.log(' 開始檢查異常記錄');
    
    const recordsLoading = document.getElementById("abnormal-records-loading");
    const abnormalRecordsSection = document.getElementById("abnormal-records-section");
    const abnormalList = document.getElementById("abnormal-list");
    const recordsEmpty = document.getElementById("abnormal-records-empty");
    
    // 薪資頁等其他頁面沒有異常記錄區塊，直接略過
    if (!abnormalRecordsSection) return;
    
    if (!recordsLoading || !abnormalList || !recordsEmpty) {
        console.error(' 找不到必要的 DOM 元素');
        return;
    }
    
    recordsLoading.style.display = 'block';
    abnormalRecordsSection.style.display = 'none';
    
    //  翻譯映射函數
    function translatePunchTypes(punchTypes) {
        if (!punchTypes) return '';
        
        const translations = {
            '補上班審核中': t('STATUS_REPAIR_PENDING_IN') || 'Punch In Review Pending',
            '補下班審核中': t('STATUS_REPAIR_PENDING_OUT') || 'Punch Out Review Pending',
            '補上班通過': t('STATUS_REPAIR_APPROVED_IN') || 'Punch In Approved',
            '補下班通過': t('STATUS_REPAIR_APPROVED_OUT') || 'Punch Out Approved',
            '補上班被拒絕': t('STATUS_REPAIR_REJECTED_IN') || 'Punch In Rejected',
            '補下班被拒絕': t('STATUS_REPAIR_REJECTED_OUT') || 'Punch Out Rejected'
        };
        
        return translations[punchTypes] || punchTypes;
    }
    
    try {
        const res = await callApifetch(`getAbnormalRecords&month=${month}&userId=${userId}`);
        
        console.log(' API 回傳結果:', res);
        console.log('   記錄數量:', res.records?.length || 0);
        
        recordsLoading.style.display = 'none';
        
        if (res.ok) {
            abnormalRecordsSection.style.display = 'block';
            
            if (res.records && res.records.length > 0) {
                console.log(' 有異常記錄，開始渲染');
                
                recordsEmpty.style.display = 'none';
                abnormalList.innerHTML = '';
                
                //  按日期排序（由新到舊）
                const sortedRecords = res.records.sort((a, b) => {
                    return new Date(b.date) - new Date(a.date);
                });
                
                sortedRecords.forEach((record, index) => {
                    console.log(`   渲染第 ${index + 1} 筆: ${record.date} - ${record.reason}`);
                    
                    let reasonClass, displayReason, buttonHtml;
                    
                    switch(record.reason) {
                        case 'STATUS_REPAIR_PENDING':
                            // 審核中 - 黃色，按鈕禁用
                            reasonClass = 'text-yellow-600 dark:text-yellow-400';
                            displayReason = translatePunchTypes(record.punchTypes);
                            buttonHtml = `
                                <span class="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                                    ⏳ ${translatePunchTypes(record.punchTypes)}
                                </span>
                            `;
                            break;
                            
                        case 'STATUS_REPAIR_APPROVED':
                            // 已通過 - 綠色，按鈕禁用
                            reasonClass = 'text-green-600 dark:text-green-400';
                            displayReason = translatePunchTypes(record.punchTypes);
                            buttonHtml = `
                                <span class="text-sm font-semibold text-green-600 dark:text-green-400">
                                     ${translatePunchTypes(record.punchTypes)}
                                </span>
                            `;
                            break;
                            
                        case 'STATUS_PUNCH_IN_MISSING':
                            // 缺上班卡 - 紅色，可補打卡
                            reasonClass = 'text-red-600 dark:text-red-400';
                            displayReason = t('STATUS_PUNCH_IN_MISSING');
                            buttonHtml = `
                                <button data-date="${record.date}" 
                                        data-type="上班"
                                        class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-indigo-600 dark:bg-indigo-500 rounded-md hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors">
                                    ${t('BTN_ADJUST_IN')}
                                </button>
                            `;
                            break;
                            
                        case 'STATUS_BREAK_PUNCH_MISSING':
                            // 兩頭班沒打休息卡：休息開始補「下班」、休息結束補「上班」，時間在表單裡自己選
                            reasonClass = 'text-red-600 dark:text-red-400';
                            displayReason = t('STATUS_BREAK_PUNCH_MISSING');
                            buttonHtml = `
                                <div class="flex flex-col gap-1">
                                    <button data-date="${record.date}" data-type="下班"
                                            class="adjust-btn px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 dark:bg-purple-500 rounded-md hover:bg-purple-700 transition-colors">
                                        ${t('BTN_ADJUST_BREAK_START')}
                                    </button>
                                    <button data-date="${record.date}" data-type="上班"
                                            class="adjust-btn px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 dark:bg-indigo-500 rounded-md hover:bg-indigo-700 transition-colors">
                                        ${t('BTN_ADJUST_BREAK_END')}
                                    </button>
                                </div>
                            `;
                            break;

                        case 'STATUS_PUNCH_OUT_MISSING':
                            // 缺下班卡 - 紅色，可補打卡
                            reasonClass = 'text-red-600 dark:text-red-400';
                            displayReason = t('STATUS_PUNCH_OUT_MISSING');
                            buttonHtml = `
                                <button data-date="${record.date}" 
                                        data-type="下班"
                                        class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-purple-600 dark:bg-purple-500 rounded-md hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors">
                                    ${t('BTN_ADJUST_OUT')}
                                </button>
                            `;
                            break;

                        case 'STATUS_REPAIR_REJECTED':
                            //  被拒絕 - 橘色，可重新申請
                            reasonClass = 'text-orange-600 dark:text-orange-400';
                            displayReason = translatePunchTypes(record.punchTypes);
                            
                            //  判斷是上班還是下班
                            const isIn = record.punchTypes && record.punchTypes.includes('上班');
                            const punchType = isIn ? '上班' : '下班';
                            
                            buttonHtml = `
                                <button data-date="${record.date}" 
                                        data-type="${punchType}"
                                        class="adjust-btn px-4 py-2 text-sm font-semibold text-white bg-orange-600 dark:bg-orange-500 rounded-md hover:bg-orange-700 dark:hover:bg-orange-600 transition-colors">
                                    ${t('REAPPLY') || 'Reapply'}
                                </button>
                            `;
                            break;
                            
                        default:
                            reasonClass = 'text-gray-600 dark:text-gray-400';
                            displayReason = t(record.reason) || record.reason;
                            buttonHtml = '';
                    }
                    
                    const li = document.createElement('li');
                    li.className = 'p-3 bg-gray-50 rounded-lg flex justify-between items-center dark:bg-gray-700';
                    
                    li.innerHTML = `
                        <div>
                            <p class="font-medium text-gray-800 dark:text-white">${record.date}</p>
                            <p class="text-sm ${reasonClass}">
                                ${displayReason}
                            </p>
                        </div>
                        ${buttonHtml}
                    `;
                    
                    abnormalList.appendChild(li);
                });
                
                console.log(' 渲染完成');
                
            } else {
                console.log('ℹ  沒有異常記錄');
                recordsEmpty.style.display = 'block';
                abnormalList.innerHTML = '';
            }
        } else {
            console.error(" API 返回失敗:", res.msg || res.code);
            showNotification(t("ERROR_FETCH_RECORDS") || "無法取得記錄", "error");
        }
    } catch (err) {
        console.error(' 發生錯誤:', err);
        recordsLoading.style.display = 'none';
        showNotification(t("ERROR_FETCH_RECORDS") || "無法取得記錄", "error");
    }
}
// 渲染日曆的函式
async function renderCalendar(date) {
    const monthTitle = document.getElementById('month-title');
    const calendarGrid = document.getElementById('calendar-grid');
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();
    
    // 生成 monthKey
    const monthkey = currentMonthDate.getFullYear() + "-" + String(currentMonthDate.getMonth() + 1).padStart(2, "0");
    
    // 檢查快取中是否已有該月份資料
    if (monthDataCache[monthkey]) {
        // 如果有，直接從快取讀取資料並渲染
        const records = monthDataCache[monthkey];
        renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle);
        
        //  新增：更新統計資料
        updateMonthlyStats(records);
        
    } else {
        // 如果沒有，才發送 API 請求
        // 清空日曆，顯示載入狀態，並確保置中
        calendarGrid.innerHTML = '<div data-i18n="LOADING" class="col-span-full text-center text-gray-500 dark:text-gray-400 py-4">正在載入...</div>';
        renderTranslations(calendarGrid);
        try {
            const res = await callApifetch(`getAttendanceDetails&month=${monthkey}&userId=${userId}`);
            if (res.ok) {
                // 將資料存入快取
                monthDataCache[monthkey] = res.records;
                
                // 收到資料後，清空載入訊息
                calendarGrid.innerHTML = '';
                
                // 從快取取得本月資料
                const records = monthDataCache[monthkey] || [];
                renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle);
                
                //  新增：更新統計資料
                updateMonthlyStats(records);
                
            } else {
                console.error("Failed to fetch attendance records:", res.msg);
                showNotification(t("ERROR_FETCH_RECORDS"), "error");
            }
        } catch (err) {
            console.error(err);
        }
    }
}

/**
 *  更新本月出勤統計（修正小數問題）
 */
async function updateMonthlyStats(records) {
    const workDaysEl = document.getElementById('stats-work-days-value');
    const abnormalCountEl = document.getElementById('stats-abnormal-count-value');
    const normalDaysEl = document.getElementById('stats-normal-days-value');
    const overtimeHoursEl = document.getElementById('stats-overtime-hours-value');
    
    if (!workDaysEl || !abnormalCountEl || !normalDaysEl) {
        console.warn('找不到統計元素');
        return;
    }
    
    let totalWorkHours = 0;
    let abnormalCount = 0;
    let normalWorkHours = 0;
    let totalOvertimeHours = 0;
    
    records.forEach(record => {
        const punchIn = record.record ? record.record.find(r => r.type === '上班') : null;
        const punchOut = record.record ? record.record.find(r => r.type === '下班') : null;
        
        let dayWorkHours = 0;
        
        if (punchIn && punchOut) {
            try {
                const inTime = new Date(`${record.date} ${punchIn.time}`);
                const outTime = new Date(`${record.date} ${punchOut.time}`);
                const diffMs = outTime - inTime;
                let totalHoursRaw = diffMs / (1000 * 60 * 60);
                
                if (totalHoursRaw > 0) {
                    //  修正：智能計算午休時間
                    const lunchBreak = calculateLunchBreak(inTime, outTime);
                    dayWorkHours = Math.max(0, totalHoursRaw - lunchBreak);
                    
                    //  修正：四捨五入到 0.5 小時
                    dayWorkHours = Math.round(dayWorkHours * 2) / 2;
                    
                    totalWorkHours += dayWorkHours;
                }
            } catch (e) {
                console.error('計算工時失敗:', e);
            }
        }
        
        // 計算加班時數
        let overtimeFromPunch = Math.max(0, dayWorkHours - 8);
        
        // 檢查手動申請的加班
        let overtimeFromApplication = 0;
        if (record.overtime) {
            const status = String(
                record.overtime.status || 
                record.overtime.reviewStatus || 
                record.overtime.approvalStatus || 
                ''
            ).toLowerCase().trim();
            
            if (status === 'approved' || status === '已核准') {
                overtimeFromApplication = parseFloat(record.overtime.hours) || 0;
            } else if (status === '' && record.overtime.hours) {
                overtimeFromApplication = parseFloat(record.overtime.hours) || 0;
            }
        }
        
        const dayOvertimeHours = Math.max(overtimeFromPunch, overtimeFromApplication);
        totalOvertimeHours += dayOvertimeHours;
        
        // 判斷異常記錄
        const abnormalReasons = [
            'STATUS_PUNCH_IN_MISSING',
            'STATUS_PUNCH_OUT_MISSING',
            'STATUS_BREAK_PUNCH_MISSING',
            'STATUS_REPAIR_PENDING',
            'STATUS_REPAIR_REJECTED'
        ];
        
        if (abnormalReasons.includes(record.reason)) {
            abnormalCount++;
        } else if (record.reason === 'STATUS_PUNCH_NORMAL' || record.reason === 'STATUS_REPAIR_APPROVED') {
            normalWorkHours += dayWorkHours;
        }
    });
    
    //  修正：顯示為整數（如果小數部分為 .0）
    workDaysEl.textContent = formatHours(totalWorkHours);
    abnormalCountEl.textContent = abnormalCount;
    normalDaysEl.textContent = formatHours(normalWorkHours);
    
    if (overtimeHoursEl) {
        overtimeHoursEl.textContent = formatHours(totalOvertimeHours);
    }
}

/**
 *  修改：根據薪資類型決定午休時間
 */
function calculateLunchBreak(inTime, outTime, salaryType) {
    // 午休區間取自管理員設定的工作時段（worktime.js），預設 12:00-13:00
    const schedule = (typeof getWorkSchedule === 'function')
        ? getWorkSchedule()
        : { lunchStart: '12:00', lunchEnd: '13:00' };
    const [startHour, startMin] = schedule.lunchStart.split(':').map(Number);
    const [endHour, endMin] = schedule.lunchEnd.split(':').map(Number);
    
    const lunchStart = new Date(inTime);
    lunchStart.setHours(startHour, startMin, 0, 0);
    
    const fullLunchHours = ((endHour * 60 + endMin) - (startHour * 60 + startMin)) / 60;
    //  月薪扣整段午休，時薪只扣一半（預設就是 1 小時 vs 0.5 小時）
    const deductHours = salaryType === '月薪' ? fullLunchHours : fullLunchHours / 2;
    
    const lunchEnd = new Date(lunchStart.getTime() + deductHours * 60 * 60 * 1000);
    
    // 如果工作時段完全不涵蓋午休時間，不扣除
    if (outTime <= lunchStart || inTime >= lunchEnd) {
        return 0;
    }
    
    // 如果涵蓋完整午休時間
    if (inTime < lunchStart && outTime > lunchEnd) {
        return deductHours;
    }
    
    // 部分涵蓋午休時間
    const overlapStart = inTime > lunchStart ? inTime : lunchStart;
    const overlapEnd = outTime < lunchEnd ? outTime : lunchEnd;
    const overlapMs = overlapEnd - overlapStart;
    const overlapHours = overlapMs / (1000 * 60 * 60);
    
    return Math.max(0, overlapHours);
}

/**
 *  新增：格式化小時顯示
 */
function formatHours(hours) {
    if (hours === 0) return '0';
    
    // 如果是整數，不顯示小數點
    if (Number.isInteger(hours)) {
        return hours.toString();
    }
    
    // 如果小數部分是 .5，顯示一位小數
    if (hours % 1 === 0.5) {
        return hours.toFixed(1);
    }
    
    // 其他情況四捨五入到最接近的 0.5
    const rounded = Math.round(hours * 2) / 2;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
}

async function submitAdjustPunch(date, type, note) {
    try {
        showNotification(t('NOTIF_SUBMITTING_ADJUST'), "info");

        const sessionToken = localStorage.getItem("sessionToken");

        // 嘗試取得位置（非必要，失敗不影響補打卡）
        let lat = 0, lng = 0;
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            lat = position.coords.latitude;
            lng = position.coords.longitude;
        } catch (_) {}

        // 設定預設時間
        const datetime = `${date}T${type === '上班' ? '09:00:00' : '18:00:00'}`;

        const params = new URLSearchParams({
            token: sessionToken,
            type: type,
            lat: lat,
            lng: lng,
            datetime: datetime,
            note: note || `補打卡 - ${type}`
        });
        
        const res = await callApifetch(`adjustPunch&${params.toString()}`);
        if (res.ok) clearMonthDataCache(); // 補打卡送出後，快取的月資料已過期
        
        if (res.ok) {
            showNotification(t('NOTIF_ADJUST_PUNCH_SUBMITTED'), "success");
            
            //  關鍵：補打卡成功後，重新檢查異常記錄
            await checkAbnormal();
            
            // 關閉對話框
            closeAdjustDialog();
        } else {
            showNotification(t(res.code) || "補打卡失敗", "error");
        }
    } catch (err) {
        console.error('補打卡錯誤:', err);
        showNotification(t('NOTIF_ADJUST_PUNCH_FAILED'), "error");
    }
}

// 新增一個獨立的渲染函式，以便從快取或 API 回應中調用
// 在 script.js 中找到 renderCalendarWithData 函數，並修改如下：

function renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle) {
    calendarGrid.innerHTML = '';
    monthTitle.textContent = t("MONTH_YEAR_TEMPLATE", {
        year: year,
        month: month+1
    });
    
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell';
        calendarGrid.appendChild(emptyCell);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
        const dayCell = document.createElement('div');
        const cellDate = new Date(year, month, i);
        dayCell.textContent = i;
        let dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        let dateClass = 'normal-day';
        
        const todayRecords = records.filter(r => r.date === dateKey);
        
        //  移除：不再添加 emoji 圖示
        // const statusIcons = [];
        
        if (todayRecords.length > 0) {
            const record = todayRecords[0];
            const reason = record.reason;
            
            //  判斷打卡狀態
            switch (reason) {
                case "STATUS_PUNCH_IN_MISSING":
                case "STATUS_PUNCH_OUT_MISSING":
                    dateClass = 'abnormal-day';
                    break;
                case "STATUS_PUNCH_NORMAL":
                    dateClass = 'day-off';
                    break;
                case "STATUS_REPAIR_PENDING":
                    dateClass = 'pending-virtual';
                    break;
                case "STATUS_REPAIR_APPROVED":
                    dateClass = 'approved-virtual';
                    break;
                case "STATUS_NO_RECORD":
                    // 如果有加班或請假，則顯示為特殊狀態
                    if (record.overtime || record.leave) {
                        dateClass = 'day-off';
                    }
                    break;
                default:
                    if (reason && reason !== "") {
                        dateClass = 'pending-adjustment';
                    }
                    break;
            }
            
            //  移除：不再添加加班和請假的 emoji
            /*
            //  如果有加班記錄，加上特殊標記
            if (record.overtime) {
                statusIcons.push('');
            }
            
            //  如果有請假記錄，加上特殊標記
            if (record.leave) {
                const leaveStatus = record.leave.status;
                
                // 根據請假狀態設定不同圖示
                if (leaveStatus === 'APPROVED') {
                    statusIcons.push('');
                    dateClass = 'leave-day'; // 新的 CSS 類別
                } else if (leaveStatus === 'PENDING') {
                    statusIcons.push('⏳');
                } else if (leaveStatus === 'REJECTED') {
                    statusIcons.push('');
                }
            }
            */
        }
        
        const isToday = (year === today.getFullYear() && month === today.getMonth() && i === today.getDate());
        if (isToday) {
            dayCell.classList.add('today');
        } else if (cellDate > today) {
            dayCell.classList.add('future-day');
            dayCell.style.pointerEvents = 'none';
        } else {
            dayCell.classList.add(dateClass);
        }
        
        //  移除：不再顯示 emoji 圖示
        /*
        //  將日期和圖示組合顯示
        if (statusIcons.length > 0) {
            dayCell.innerHTML = `
                <div class="day-cell-content">
                    <span class="day-number">${i}</span>
                    <div class="status-icons">
                        ${statusIcons.map(icon => `<span class="status-icon">${icon}</span>`).join('')}
                    </div>
                </div>
            `;
        }
        */
        
        dayCell.classList.add('day-cell');
        dayCell.dataset.date = dateKey;
        dayCell.dataset.records = JSON.stringify(todayRecords);
        calendarGrid.appendChild(dayCell);
    }
}

/**
 *  渲染每日打卡記錄（改進版 - 請假資訊顯示在打卡記錄下方）
 * 
 * 修改說明：
 * 1. 添加標題區塊，清楚標示日期
 * 2. 打卡記錄使用卡片樣式，更清晰
 * 3. 請假資訊緊接在打卡記錄下方，而非獨立區塊
 * 4. 優化視覺層次，使用圖標和顏色增強可讀性
 */

async function renderDailyRecords(dateKey) {
    const dailyRecordsCard = document.getElementById('daily-records-card');
    const dailyRecordsTitle = document.getElementById('daily-records-title');
    const dailyRecordsList = document.getElementById('daily-records-list');
    const dailyRecordsEmpty = document.getElementById('daily-records-empty');
    const recordsLoading = document.getElementById("daily-records-loading");
    const adjustmentFormContainer = document.getElementById('daily-adjustment-form-container');
    
    if (!dailyRecordsCard || !dailyRecordsTitle || !dailyRecordsList || !dailyRecordsEmpty) {
        console.error(' renderDailyRecords: 找不到必要的 DOM 元素');
        showNotification(t('NOTIF_UI_LOAD_FAILED'), 'error');
        return;
    }
    
    dailyRecordsTitle.textContent = t("DAILY_RECORDS_TITLE", { dateKey: dateKey });
    dailyRecordsList.innerHTML = '';
    dailyRecordsEmpty.style.display = 'none';
    
    if (adjustmentFormContainer) {
        adjustmentFormContainer.innerHTML = '';
    }
    
    if (recordsLoading) {
        recordsLoading.style.display = 'block';
    }
    
    const dateObject = new Date(dateKey);
    const month = dateObject.getFullYear() + "-" + String(dateObject.getMonth() + 1).padStart(2, '0');
    const userId = localStorage.getItem("sessionUserId");
    
    if (monthDataCache[month]) {
        renderRecords(monthDataCache[month]);
        if (recordsLoading) {
            recordsLoading.style.display = 'none';
        }
    } else {
        try {
            const res = await callApifetch(`getAttendanceDetails&month=${month}&userId=${userId}`);
            if (recordsLoading) {
                recordsLoading.style.display = 'none';
            }
            if (res.ok) {
                monthDataCache[month] = res.records;
                renderRecords(res.records);
            } else {
                console.error("Failed to fetch attendance records:", res.msg);
                showNotification(t("ERROR_FETCH_RECORDS"), "error");
            }
        } catch (err) {
            console.error(err);
            if (recordsLoading) {
                recordsLoading.style.display = 'none';
            }
        }
    }
    
    function renderRecords(records) {
        const dailyRecords = records.filter(record => record.date === dateKey);
        
        if (dailyRecords.length > 0) {
            dailyRecordsEmpty.style.display = 'none';
            
            dailyRecords.forEach(recordData => {
                const li = document.createElement('li');
                li.className = 'p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-3';
                
                let workHoursDecimal = 0;
                let overtimeHours = 0;
                let hasOvertime = false;
                let punchInRecord = null;
                let punchOutRecord = null;
                //  標題區塊
                const titleHtml = `
                    <div class="flex items-center justify-between mb-3 pb-2 border-b-2 border-gray-300 dark:border-gray-600">
                        <h4 class="text-lg font-bold text-gray-800 dark:text-white">
                             ${dateKey} <span data-i18n="DAILY_ATTENDANCE_TITLE">出勤記錄</span>
                        </h4>
                    </div>
                `;
                
                //  打卡記錄區塊
                let recordHtml = '';
                if (recordData.record && recordData.record.length > 0) {
                    recordHtml = `
                        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                            <h5 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                                <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                                </svg>
                                <span data-i18n="PUNCH_RECORDS_TITLE">打卡紀錄</span>
                            </h5>
                            <div class="space-y-2">
                                ${recordData.record.map(r => {
                                    const typeKey = r.type === '上班' ? 'PUNCH_IN' : 'PUNCH_OUT';
                                    const typeColor = r.type === '上班' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                                    return `
                                        <div class="flex items-start space-x-2 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                                            <span class="${typeColor} font-bold text-sm">●</span>
                                            <div class="flex-1">
                                                <p class="font-medium text-gray-800 dark:text-white">
                                                    ${r.time} - <span data-i18n="${typeKey}">${t(typeKey)}</span>
                                                </p>
                                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                                     ${r.location}
                                                </p>
                                                ${r.note ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-1"> ${escapeHtml(r.note)}</p>` : ''}
                                            </div>
                                        </div>
                                    `;
                                }).join("")}
                            </div>
                        </div>
                    `;
                } else {
                    recordHtml = `
                        <div class="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                            <p class="text-sm text-gray-500 dark:text-gray-400 italic text-center py-2">
                                 <span data-i18n="DAILY_RECORDS_EMPTY">該日沒有打卡紀錄</span>
                            </p>
                        </div>
                    `;
                }
                
                // 加班資訊區塊
                let overtimeHtml = '';
                if (recordData.overtime) {
                    const ot = recordData.overtime;
                    overtimeHtml = `
                        <div class="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-lg p-3">
                            <div class="flex items-center justify-between mb-2">
                                <h5 class="text-sm font-semibold flex items-center">
                                    <svg class="w-4 h-4 mr-2 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                                    </svg>
                                    <span data-i18n="OVERTIME_PERIOD">加班時段</span>
                                </h5>
                                <span class="px-2 py-1 bg-orange-600 text-white text-xs font-bold rounded-full">
                                    ${ot.hours} <span data-i18n="UNIT_HOURS">小時</span>
                                </span>
                            </div>
                            <div class="space-y-1 pl-6">
                                <p class="text-sm text-orange-700 dark:text-orange-400">
                                    <span data-i18n="TIME_LABEL">時間</span>：<span class="font-semibold">${ot.startTime} - ${ot.endTime}</span>
                                </p>
                                ${ot.reason ? `
                                    <p class="text-sm text-orange-600 dark:text-orange-300">
                                        <span data-i18n="REASON_LABEL">原因</span>：${escapeHtml(ot.reason)}
                                    </p>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }
                
                let overtimeAlertHtml = '';
                if (hasOvertime && overtimeHours > 0) {
                    overtimeAlertHtml = `
                        <div class="mt-3 p-4 bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-lg">
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <div class="flex items-center mb-2">
                                        <svg class="w-5 h-5 text-orange-600 dark:text-orange-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                                        </svg>
                                        <h4 class="text-sm font-bold text-orange-800 dark:text-orange-300">
                                            偵測到加班時數
                                        </h4>
                                    </div>
                                    <div class="ml-7 space-y-1">
                                        <p class="text-sm text-orange-700 dark:text-orange-400">
                                            <span class="font-semibold">總工時：</span>${workHoursDecimal.toFixed(2)} 小時
                                        </p>
                                        <p class="text-sm text-orange-700 dark:text-orange-400">
                                            <span class="font-semibold">標準工時：</span>8 小時（已扣除午休 1 小時）
                                        </p>
                                        <p class="text-sm font-bold text-orange-800 dark:text-orange-200">
                                            <span class="text-orange-600 dark:text-orange-400"> 加班時數：</span>${overtimeHours.toFixed(2)} 小時
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onclick="quickApplyOvertime('${recordData.date}', '${punchInRecord.time}', '${punchOutRecord.time}', ${overtimeHours.toFixed(2)})"
                                    class="ml-4 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-sm font-bold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center space-x-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                                    </svg>
                                    <span>快速申請</span>
                                </button>
                            </div>
                        </div>
                    `;
                }
                // 請假資訊區塊
                let leaveHtml = '';
                if (recordData.leave) {
                    const leave = recordData.leave;
                    let statusClass = 'bg-yellow-50 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-700';
                    let statusBadgeClass = 'bg-yellow-600 text-white';
                    let statusText = t('PENDING');
                    let statusIcon = '⏳';
                    
                    if (leave.status === 'APPROVED') {
                        statusClass = 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700';
                        statusBadgeClass = 'bg-green-600 text-white';
                        statusText = t('APPROVED');
                        statusIcon = '';
                    } else if (leave.status === 'REJECTED') {
                        statusClass = 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700';
                        statusBadgeClass = 'bg-red-600 text-white';
                        statusText = t('REJECTED');
                        statusIcon = '';
                    }
                    
                    leaveHtml = `
                        <div class="${statusClass} border-2 rounded-lg p-3">
                            <div class="flex items-center justify-between mb-2">
                                <h5 class="text-sm font-semibold flex items-center">
                                    <svg class="w-4 h-4 mr-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                                        <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/>
                                    </svg>
                                    <span data-i18n="LEAVE_INFO_TITLE">請假資訊</span>
                                </h5>
                                <span class="px-2 py-1 text-xs font-bold rounded-full ${statusBadgeClass}">
                                    ${statusIcon} ${statusText}
                                </span>
                            </div>
                            <div class="space-y-1 pl-6">
                                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    <span data-i18n="LEAVE_TYPE">假別</span>：<span class="text-blue-600 dark:text-blue-400 font-semibold" data-i18n="${leave.leaveType}">${t(leave.leaveType)}</span>
                                </p>
                                <p class="text-sm text-gray-600 dark:text-gray-400">
                                    <span data-i18n="LEAVE_DAYS_COUNT">天數</span>：<span class="font-semibold">${leave.days}</span> <span data-i18n="UNIT_DAYS">天</span>
                                </p>
                                ${leave.reason ? `
                                    <p class="text-sm text-gray-600 dark:text-gray-400">
                                        <span data-i18n="LEAVE_REASON_DISPLAY">原因</span>：${escapeHtml(leave.reason)}
                                    </p>
                                ` : ''}
                                ${leave.reviewComment ? `
                                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                        <span data-i18n="REVIEW_COMMENT">審核意見</span>：${escapeHtml(leave.reviewComment)}
                                    </p>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }
                
                //  系統判斷狀態
                const statusHtml = `
                    <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 text-center">
                        <p class="text-sm text-gray-600 dark:text-gray-400">
                            <span data-i18n="SYSTEM_JUDGMENT">系統判斷</span>：
                            <span class="font-semibold text-gray-800 dark:text-white" data-i18n="${escapeHtml(recordData.reason)}">${t(recordData.reason)}</span>
                        </p>
                    </div>
                `;
                
                li.innerHTML = titleHtml + recordHtml + overtimeHtml + leaveHtml + statusHtml;
                dailyRecordsList.appendChild(li);
                renderTranslations(li);
            });
        } else {
            dailyRecordsEmpty.style.display = 'block';
        }
        
        dailyRecordsCard.style.display = 'block';
    }
}

// 已移到 location-picker.js

document.addEventListener('DOMContentLoaded', async () => {
    
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const punchInBtn = document.getElementById('punch-in-btn');
    const punchOutBtn = document.getElementById('punch-out-btn');
    const tabDashboardBtn = document.getElementById('tab-dashboard-btn');
    const tabMonthlyBtn = document.getElementById('tab-monthly-btn');
    const tabLocationBtn = document.getElementById('tab-location-btn');
    const tabAdminBtn = document.getElementById('tab-admin-btn');
    const tabOvertimeBtn = document.getElementById('tab-overtime-btn');
    const tabLeaveBtn = document.getElementById('tab-leave-btn'); //  新增請假按鈕
    const tabSalaryBtn = document.getElementById('tab-salary-btn'); //  新增
    const tabWorklogBtn = document.getElementById('tab-worklog-btn');
    const tabExpenseBtn = document.getElementById('tab-expense-btn');
    const abnormalList = document.getElementById('abnormal-list');
    const adjustmentFormContainer = document.getElementById('adjustment-form-container');
    const calendarGrid = document.getElementById('calendar-grid');
    // 取得當前位置按鈕事件
    const getLocationBtn = document.getElementById('get-location-btn');
    const locationLatInput = document.getElementById('location-lat');
    const locationLngInput = document.getElementById('location-lng');
    const addLocationBtn = document.getElementById('add-location-btn');
    //  新增：綁定用戶管理按鈕
    const refreshUsersBtn = document.getElementById('refresh-users-btn');
    if (refreshUsersBtn) {
        refreshUsersBtn?.addEventListener('click', loadAllUsers);
    }
    const adjustTodayBtn = document.getElementById('adjust-today-btn');
    if (adjustTodayBtn) {
        adjustTodayBtn?.addEventListener('click', openAdjustTodayDialog);
    }

    const historyAdjustBtn = document.getElementById('history-adjust-btn');
    if (historyAdjustBtn) {
        historyAdjustBtn?.addEventListener('click', openHistoryAdjustDialog);
    }
    //  新增：綁定搜尋功能
    const searchUsersInput = document.getElementById('search-users-input');
    if (searchUsersInput) {
        searchUsersInput?.addEventListener('input', (e) => {
            if (typeof filterUsersList === 'function') filterUsersList(e.target.value);
        });
    }

    if (tabWorklogBtn) {
        // switchTab 內部已經會呼叫 initWorklogTab()，這裡不能再呼叫一次
        tabWorklogBtn?.addEventListener('click', () => switchTab('worklog-view'));
    }

    // switchTab 內部會呼叫 initExpenseTab()
    tabExpenseBtn?.addEventListener('click', () => switchTab('expense-view'));
    let pendingRequests = []; // 新增：用於快取待審核的請求
    
    // 地圖狀態改宣告在檔案最上方（見 mapInstance 等）：
    // 這些變數原本宣告在這個 DOMContentLoaded 區塊內，但 initRadiusSlider、
    // selectSearchResult 這些「檔案層級」的函式也會用到，呼叫時會直接 ReferenceError。
    /**
     * 從後端取得所有打卡地點，並將它們顯示在地圖上。
     */
    // 全域變數，用於儲存地點標記和圓形
    // Leaflet 改成延遲載入，所以圖層群組不能在這裡就建立（宣告見檔案上方）
    
    /**
     * 取得並渲染所有待審核的請求。
     */
    async function fetchAndRenderReviewRequests() {
        const loadingEl = document.getElementById('requests-loading');
        const emptyEl = document.getElementById('requests-empty');
        const listEl = document.getElementById('pending-requests-list');
        
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        listEl.innerHTML = '';
        
        try {
            const res = await callApifetch("getReviewRequest");
            
            if (res.ok && Array.isArray(res.reviewRequest)) {
                pendingRequests = res.reviewRequest; // 快取所有請求
                
                if (pendingRequests.length === 0) {
                    emptyEl.style.display = 'block';
                } else {
                    renderReviewRequests(pendingRequests);
                }
            } else {
                showNotification(t('NOTIF_REQUESTS_FAILED_MSG') + res.msg, "error");
                emptyEl.style.display = 'block';
            }
        } catch (error) {
            showNotification(t('NOTIF_REQUESTS_FAILED_NET'), "error");
            emptyEl.style.display = 'block';
            console.error("Failed to fetch review requests:", error);
        } finally {
            loadingEl.style.display = 'none';
        }
    }
    
    /**
     * 根據資料渲染待審核列表。
     * @param {Array<Object>} requests - 請求資料陣列。
     */
    function renderReviewRequests(requests) {
        const listEl = document.getElementById('pending-requests-list');
        listEl.innerHTML = '';
        
        requests.forEach((req, index) => {
            const li = document.createElement('li');
            li.className = 'p-4 bg-gray-50 rounded-lg shadow-sm flex flex-col space-y-3 dark:bg-gray-700';
            
            //  優化顯示布局
            li.innerHTML = `
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-2">
                            <span class="font-bold text-gray-800 dark:text-white">${escapeHtml(req.name)}</span>
                            <span class="text-xs px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                                ${escapeHtml(req.remark)}
                            </span>
                        </div>
                        
                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">
                            <span data-i18n-key="${req.type}"></span>
                        </p>
                        
                        <p class="text-xs text-gray-500 dark:text-gray-500">
                            ${req.applicationPeriod}
                        </p>
                        
                        <!--  新增：顯示補打卡理由 -->
                        ${req.note ? `
                            <div class="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 rounded">
                                <p class="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
                                     補打卡理由：
                                </p>
                                <p class="text-sm text-yellow-700 dark:text-yellow-400">
                                    ${escapeHtml(req.note)}
                                </p>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="flex justify-end space-x-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <button data-i18n="ADMIN_APPROVE_BUTTON" 
                            data-index="${index}" 
                            class="approve-btn px-4 py-2 rounded-md text-sm font-bold btn-primary">
                        核准
                    </button>
                    <button data-i18n="ADMIN_REJECT_BUTTON" 
                            data-index="${index}" 
                            class="reject-btn px-4 py-2 rounded-md text-sm font-bold btn-warning">
                        拒絕
                    </button>
                </div>
            `;
            
            listEl.appendChild(li);
            renderTranslations(li);
        });
        
        // 保持原有的按鈕事件綁定
        listEl.querySelectorAll('.approve-btn').forEach(button => {
            button.addEventListener('click', (e) => handleReviewAction(e.currentTarget, e.currentTarget.dataset.index, 'approve'));
        });
        
        listEl.querySelectorAll('.reject-btn').forEach(button => {
            button.addEventListener('click', (e) => handleReviewAction(e.currentTarget, e.currentTarget.dataset.index, 'reject'));
        });
    }
    
    /**
     * 處理審核動作（核准或拒絕）。
     * @param {HTMLElement} button - 被點擊的按鈕元素。
     * @param {number} index - 請求在陣列中的索引。
     * @param {string} action - 'approve' 或 'reject'。
     */
    async function handleReviewAction(button, index, action) {
        const request = pendingRequests[index];
        if (!request) {
            showNotification(t('NOTIF_REQUEST_NOT_FOUND'), "error");
            return;
        }

        const recordId = request.id;
        const endpoint = action === 'approve' ? 'approveReview' : 'rejectReview';
        const loadingText = t('LOADING') || '處理中...';
        
        // A. 進入處理中狀態
        generalButtonState(button, 'processing', loadingText);
        
        try {
            const res = await callApifetch(`${endpoint}&id=${recordId}`);
            
            if (res.ok) {
                const translationKey = action === 'approve' ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED';
                showNotification(t(translationKey), "success");
                
                // 由於成功後列表會被重新整理，這裡可以不立即恢復按鈕狀態
                // 但是為了保險起見，我們仍然在 finally 中恢復。
                
                // 延遲執行，讓按鈕的禁用狀態能被看到
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 列表重新整理會渲染新按鈕，覆蓋舊的按鈕
                fetchAndRenderReviewRequests();
            } else {
                showNotification(t('REVIEW_FAILED', { msg: res.msg }), "error");
            }
            
        } catch (err) {
            showNotification(t("REVIEW_NETWORK_ERROR"), "error");
            console.error(err);
            
        } finally {
            // B. 無論成功或失敗，都需要將按鈕恢復到可點擊狀態
            // 只有在列表沒有被重新整理時，這個恢復才有意義
            generalButtonState(button, 'idle');
        }
    }
    /**
     * 從後端取得所有打卡地點，並將它們顯示在地圖上。
     */
    async function fetchAndRenderLocationsOnMap() {
        try {
            await ensureLib('leaflet');
            const res = await callApifetch("getLocations");
            
            // 第一次用到時才建立圖層群組
            if (!locationMarkers) locationMarkers = L.layerGroup();
            if (!locationCircles) locationCircles = L.layerGroup();
            
            // 清除舊的地點標記和圓形
            locationMarkers.clearLayers();
            locationCircles.clearLayers();
            
            if (res.ok && Array.isArray(res.locations)) {
                // 遍歷所有地點並在地圖上放置標記和圓形
                res.locations.forEach(loc => {
                    // 如果沒有容許誤差，則預設為 50 公尺
                    const punchInRadius = loc.scope || 50;
                    
                    // 加入圓形範圍
                    const locationCircle = L.circle([loc.lat, loc.lng], {
                        color: 'red',
                        fillColor: '#f03',
                        fillOpacity: 0.2,
                        radius: punchInRadius
                    });
                    locationCircle.bindPopup(`<b>${escapeHtml(loc.name)}</b><br>可打卡範圍：${punchInRadius}公尺`);
                    locationCircles.addLayer(locationCircle);
                });
                
                // 將所有地點標記和圓形一次性加到地圖上
                locationMarkers.addTo(mapInstance);
                locationCircles.addTo(mapInstance);
                
                console.log("地點標記和範圍已成功載入地圖。");
            } else {
                showNotification(t('NOTIF_LOCATIONS_FAILED_MSG') + res.msg, "error");
                console.error("Failed to fetch locations:", res.msg);
            }
        } catch (error) {
            showNotification(t('NOTIF_LOCATIONS_FAILED_NET'), "error");
            console.error("Failed to fetch locations:", error);
        }
    }
    // 初始化地圖並取得使用者位置
    async function initLocationMap(forceReload = false){
        await ensureLib('leaflet'); // 切到定位分頁才載入 Leaflet
        const mapContainer = document.getElementById('map-container');
        const statusEl = document.getElementById('location-status');
        const coordsEl = document.getElementById('location-coords');
        console.log(mapInstance && !forceReload);
        // 取得載入文字元素
        if (!mapLoadingText) {
            mapLoadingText = document.getElementById('map-loading-text');
        }
        // 檢查地圖實例是否已存在
        if (mapInstance) {
            // 如果已經存在，並且沒有被要求強制重新載入，則直接返回
            if (!forceReload) {
                mapInstance.invalidateSize();
                return;
            }
            
            // 如果被要求強制重新載入，則先徹底銷毀舊的地圖實例
            mapInstance.remove();
            mapInstance = null;
        }
        
        
        // 顯示載入中的文字
        mapLoadingText.style.display = 'block'; // 或 'block'，根據你的樣式決定
        
        // 建立地圖
        mapInstance = L.map('map-container', {
            center: [25.0330, 121.5654], // 預設中心點為台北市
            zoom: 13
        });
        
        // 加入 OpenStreetMap 圖層
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapInstance);
        
        // 讓地圖在完成載入後隱藏載入中的文字
        mapInstance.whenReady(() => {
            mapLoadingText.style.display = 'none';
            // 確保地圖的尺寸正確
            mapInstance.invalidateSize();
        });
        
        // 顯示載入狀態
        //mapContainer.innerHTML = t("MAP_LOADING");
        statusEl.textContent = t('DETECTING_LOCATION');
        coordsEl.textContent = t('UNKNOWN_LOCATION');
        
        // 取得使用者地理位置
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                                                     (position) => {
                                                         const { latitude, longitude } = position.coords;
                                                         currentCoords = [latitude, longitude];
                                                         
                                                         // 更新狀態顯示
                                                         statusEl.textContent = t('DETECTION_SUCCESS');
                                                         coordsEl.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                                                         
                                                         // 設定地圖視圖
                                                         mapInstance.setView(currentCoords, 18);
                                                         
                                                         // 在地圖上放置標記
                                                         if (marker) mapInstance.removeLayer(marker);
                                                         marker = L.marker(currentCoords).addTo(mapInstance)
                                                         .bindPopup(t('CURRENT_LOCATION'))
                                                         .openPopup();
                                                         
                                                         
                                                     },
                                                     (error) => {
                                                         // 處理定位失敗
                                                         statusEl.textContent = t('ERROR_GEOLOCATION_PERMISSION_DENIED');
                                                         console.error("Geolocation failed:", error);
                                                         
                                                         let message;
                                                         switch(error.code) {
                                                             case error.PERMISSION_DENIED:
                                                                 message = t('ERROR_GEOLOCATION_PERMISSION_DENIED');
                                                                 break;
                                                             case error.POSITION_UNAVAILABLE:
                                                                 message = t('ERROR_GEOLOCATION_UNAVAILABLE');
                                                                 break;
                                                             case error.TIMEOUT:
                                                                 message = t('ERROR_GEOLOCATION_TIMEOUT');
                                                                 break;
                                                             case error.UNKNOWN_ERROR:
                                                                 message = t('ERROR_GEOLOCATION_UNKNOWN');
                                                                 break;
                                                         }
                                                         showNotification(t('NOTIF_LOCATION_FAILED_MSG', { msg: message }), "error");
                                                     }
                                                     );
            // 成功取得使用者位置後，載入所有打卡地點
            fetchAndRenderLocationsOnMap();
        } else {
            showNotification(t('ERROR_BROWSER_NOT_SUPPORTED'), "error");
            statusEl.textContent = '不支援定位';
        }
    }
    
    
    // 處理 API 測試按鈕事件
    document.getElementById('test-api-btn')?.addEventListener('click', async () => {
        // 這裡替換成您想要測試的 API action 名稱
        const testAction = "testEndpoint";
        
        try {
            // 使用 await 等待 API 呼叫完成並取得回應
            const res = await callApifetch(testAction);
            
            // 檢查 API 回應中的 'ok' 屬性
            if (res && res.ok) {
                showNotification(t('NOTIF_API_TEST_OK') + JSON.stringify(res), "success");
            } else {
                // 如果 res.ok 為 false，表示後端處理失敗
                showNotification(t('NOTIF_API_TEST_FAILED') + (res ? res.msg : "無回應資料"), "error");
            }
        } catch (error) {
            // 捕捉任何在 callApifetch 函式中拋出的錯誤（例如網路連線問題）
            console.error("API 呼叫發生錯誤:", error);
            showNotification(t('NOTIF_API_FAILED'), "error");
        }
    });
    
    getLocationBtn?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            showNotification(t("ERROR_GEOLOCATION", { msg: t('ERROR_BROWSER_NOT_SUPPORTED') }), "error");
            return;
        }
        
        getLocationBtn.textContent = '取得中...';
        getLocationBtn.disabled = true;
        
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const radius = parseInt(document.getElementById('location-radius').value); // 新增
            
            locationLatInput.value = lat.toFixed(6);
            locationLngInput.value = lng.toFixed(6);
            getLocationBtn.textContent = '已取得';
            addLocationBtn.disabled = false;
            
            // 同步到新增地點的選取器地圖（可再拖曳微調）
            setPickerLocation(lat, lng);
            
            // 新增：更新地圖和圓形範圍
            if (mapInstance) {
                const coords = [lat, lng];
                currentCoords = coords;
                mapInstance.setView(coords, 18);
                
                if (marker) {
                    marker.setLatLng(coords);
                } else {
                    marker = L.marker(coords).addTo(mapInstance);
                }
                
                // 顯示圓形範圍
                if (circle) {
                    circle.setLatLng(coords);
                    circle.setRadius(radius);
                } else {
                    circle = L.circle(coords, {
                        color: 'blue',
                        fillColor: '#30f',
                        fillOpacity: 0.2,
                        radius: radius
                    }).addTo(mapInstance);
                }
            }
            
            showNotification(t('NOTIF_LOCATION_OK'), 'success');
        }, (err) => {
            showNotification(t("ERROR_GEOLOCATION", { msg: err.message }), "error");
            getLocationBtn.textContent = '取得當前位置';
            getLocationBtn.disabled = false;
        });
    });
    // 處理新增打卡地點
    document.getElementById('add-location-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('location-name').value;
        const lat = document.getElementById('location-lat').value;
        const lng = document.getElementById('location-lng').value;
        const radius = document.getElementById('location-radius').value; // 新增
        
        if (!name || !lat || !lng) {
            showNotification(t('NOTIF_FILL_ALL_AND_LOCATION'), "error");
            return;
        }
        
        try {
            // 加入 radius 參數
            const res = await callApifetch(`addLocation&name=${encodeURIComponent(name)}&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${radius}`);
            if (res.ok) {
                showNotification(t('NOTIF_LOCATION_ADDED'), "success");
                
                // 清空輸入欄位
                document.getElementById('location-name').value = '';
                document.getElementById('location-lat').value = '';
                document.getElementById('location-lng').value = '';
                document.getElementById('location-search').value = ''; // 新增
                document.getElementById('location-radius').value = 200; // 新增
                document.getElementById('radius-value').textContent = '200'; // 新增
                
                // 重設按鈕狀態
                getLocationBtn.textContent = '取得當前位置';
                getLocationBtn.disabled = false;
                addLocationBtn.disabled = true;
                
                // 新增：清除地圖上的圓形
                if (circle) {
                    mapInstance.removeLayer(circle);
                    circle = null;
                }
            } else {
                showNotification(t('NOTIF_ADD_LOCATION_FAILED_MSG') + res.msg, "error");
            }
        } catch (err) {
            console.error(err);
        }
    });
    // UI切換邏輯
    const TAB_RELOAD_INTERVAL_MS = 30000; // 同一分頁 30 秒內不重複載入
    const tabLoadedAt = {};
    
    const switchTab = (tabId) => {
        // 修改這一行，加入 'shift-view'
        const tabs = ['dashboard-view', 'monthly-view', 'location-view', 'shift-view', 'admin-view', 'overtime-view', 'leave-view', 'salary-view', 'worklog-view', 'expense-view'];
        
        // 修改這一行，加入 'tab-shift-btn'
        const btns = ['tab-dashboard-btn', 'tab-monthly-btn', 'tab-location-btn', 'tab-shift-btn', 'tab-admin-btn', 'tab-overtime-btn', 'tab-leave-btn', 'tab-salary-btn', 'tab-worklog-btn', 'tab-expense-btn'];
    
        // 1. 移除舊的 active 類別和 CSS 屬性
        tabs.forEach(id => {
            const tabElement = document.getElementById(id);
            tabElement.style.display = 'none';
            tabElement.classList.remove('active');
        });
        
        // 2. 移除按鈕的選中狀態
        btns.forEach(id => {
            const btnElement = document.getElementById(id);
            if (btnElement) {
                btnElement.classList.replace('bg-indigo-600', 'bg-gray-200');
                btnElement.classList.replace('text-white', 'text-gray-600');
                btnElement.classList.add('dark:text-gray-300', 'dark:bg-gray-700');
            }
        });
        
        // 3. 顯示新頁籤並新增 active 類別
        const newTabElement = document.getElementById(tabId);
        newTabElement.style.display = 'block';
        newTabElement.classList.add('active');
        
        // 4. 設定新頁籤按鈕的選中狀態
        const newBtnElement = document.getElementById(`tab-${tabId.replace('-view', '-btn')}`);
        if (newBtnElement) {
            newBtnElement.classList.replace('bg-gray-200', 'bg-indigo-600');
            newBtnElement.classList.replace('text-gray-600', 'text-white');
            newBtnElement.classList.remove('dark:text-gray-300', 'dark:bg-gray-700');
            newBtnElement.classList.add('dark:bg-indigo-500');
        }
        
        // 5. 根據頁籤 ID 執行特定動作
        // 管理員分頁一次會打 7 支 API，來回切分頁很傷；
        // 短時間內切回同一個分頁就沿用剛才載入的結果，頁面內的操作仍會各自重新整理。
        const now = Date.now();
        if (now - (tabLoadedAt[tabId] || 0) < TAB_RELOAD_INTERVAL_MS) return;
        tabLoadedAt[tabId] = now;
        
        if (tabId === 'monthly-view') {
            renderCalendar(currentMonthDate);
        } else if (tabId === 'location-view') {
            initLocationMap();
        } else if (tabId === 'shift-view') { // 新增：排班分頁初始化
            initShiftTab();
        } else if (tabId === 'admin-view') {
            fetchAndRenderReviewRequests();
            loadPendingOvertimeRequests();
            loadPendingWorklogs();  // 
            loadPendingLeaveRequests();
            if (typeof displayAdminAnnouncements === 'function') displayAdminAnnouncements();
            initWorkScheduleAdmin();
            initAdminAnalysis();
            if (typeof loadAllUsers === 'function') loadAllUsers();
            if (typeof loadPendingExpenses === 'function') loadPendingExpenses();
            if (typeof initKioskAdmin === 'function') initKioskAdmin();
            if (typeof initAdminAuditLog === 'function') initAdminAuditLog();
            refreshLocationPicker();
        } else if (tabId === 'overtime-view') {
            initOvertimeTab();
        } else if (tabId === 'leave-view') {
            loadWorkSchedule();
            initLeaveTab();
        } else if (tabId === 'salary-view') { //  新增
            initSalaryTab();
        } else if (tabId === 'worklog-view') { //  新增
            initWorklogTab();
        } else if (tabId === 'expense-view') {
            if (typeof initExpenseTab === 'function') initExpenseTab();
        }
        
    };
    
    // 初始化拉桿（薪資頁沒有載入 location-picker.js）
    if (typeof initRadiusSlider === 'function') initRadiusSlider();
    
    //  搜尋功能事件綁定
    const searchBtn = document.getElementById('search-location-btn');
    const searchInput = document.getElementById('location-search');
    
    if (searchBtn && searchInput) {
        // 點擊搜尋按鈕
        searchBtn.addEventListener('click', async () => {
            const query = searchInput.value.trim();
            if (query) {
                const results = await searchLocation(query);
                displaySearchResults(results);
            }
        });
        
        // Enter 鍵搜尋
        searchInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    const results = await searchLocation(query);
                    displaySearchResults(results);
                }
            }
        });
    }
    
    // 點擊外部關閉搜尋結果
    document.addEventListener('click', (e) => {
        const resultsContainer = document.getElementById('search-results');
        const searchInput = document.getElementById('location-search');
        const searchBtn = document.getElementById('search-location-btn');
        
        if (resultsContainer && 
            !resultsContainer.contains(e.target) && 
            e.target !== searchInput && 
            e.target !== searchBtn) {
            resultsContainer.classList.add('hidden');
        }
    });
    // 語系初始化
    // 語系：沒有紀錄時由 i18n.js 依瀏覽器語言決定
    const pageLang = detectLang();
    const langSwitcher = document.getElementById('language-switcher');
    if (langSwitcher) langSwitcher.value = pageLang;
    await loadTranslations(pageLang);
    if (typeof renderWorkScheduleNote === 'function') renderWorkScheduleNote();
    
    
    
    const params = new URLSearchParams(window.location.search);
    const otoken = params.get('code');
    const qrTokenFromUrl = params.get('qrToken');

    // LINE Bot 網頁打卡：無需登入，直接處理後結束
    if (params.get('linePunchToken')) {
        if (typeof handleLinePunchFromUrl === 'function') await handleLinePunchFromUrl();
        // 繼續正常初始化（讓員工可操作 app）
    }

    // 若 URL 帶有 QR Token，先存起來等登入後使用
    if (qrTokenFromUrl) {
        sessionStorage.setItem('pendingQRToken', qrTokenFromUrl);
        const qrLocFromUrl = params.get('loc');
        if (qrLocFromUrl) sessionStorage.setItem('pendingQRLoc', qrLocFromUrl);
        else sessionStorage.removeItem('pendingQRLoc');
        history.replaceState({}, '', window.location.pathname);
    }
    
    // 從 LINE 登入回來：QR 代碼接在 state 後面帶回來（見 GS 的 handleGetLoginUrl）。
    // LINE App 常會在另一個分頁或瀏覽器打開回來的網址，sessionStorage 已經沒有了，要從這裡取回。
    const resumeQr = decodeLoginResume(params.get('state'));
    if (otoken && resumeQr) {
        sessionStorage.setItem('pendingQRToken', resumeQr.q);
        if (resumeQr.l) sessionStorage.setItem('pendingQRLoc', resumeQr.l);
        else sessionStorage.removeItem('pendingQRLoc');
    }

    const loginCode = params.get('loginCode');

    if (otoken || loginCode) {
        try {
            // LINE 登入回來帶 code；管理員給的登入連結帶 loginCode（不經過 LINE，見 GS/LoginLinks.gs）
            const res = otoken
                ? await callApifetch(`getProfile&otoken=${otoken}`)
                : await callApifetch(`redeemLoginLink&loginCode=${encodeURIComponent(loginCode)}`);
            // 清除 URL 參數（登入代碼不留在網址列與瀏覽紀錄）
            history.replaceState({}, '', window.location.pathname);
            if (res.ok && res.sToken) {
                if (loginCode) {
                    // 記住這個瀏覽器是用連結登入的：之後就算登出，掃 QR Code 也不要自動帶去 LINE
                    try { localStorage.setItem('loginByLink', '1'); } catch (e) { /* 私密模式等 */ }
                }
                await applyLoginResult(res);
            } else {
                const failMsg = loginCode
                    ? (res.code && t(res.code) !== res.code ? t(res.code) : (res.msg || t('LOGIN_LINK_INVALID')))
                    : t("ERROR_LOGIN_FAILED", { msg: res.msg || t("UNKNOWN_ERROR") });
                showNotification(failMsg, "error");
                if (loginCode) setElementText('status', failMsg);
                showLoginUI();
            }

        } catch (err) {
            console.error(err);
            showLoginUI();
        }
    } else {
        const loginOk = await ensureLogin();
        if (typeof initBiometricPunch === 'function') initBiometricPunch();
        if (loginOk) {
            if (typeof handlePendingQRPunch === 'function') await handlePendingQRPunch();
        } else if (qrTokenFromUrl && !localStorage.getItem('loginByLink')) {
            // 剛掃了 QR Code 但這個瀏覽器還沒登入（手機相機常用 Safari／Chrome 開，
            // 跟平常登入的 LINE 瀏覽器不共用登入）：直接帶去 LINE 登入，回來自動打卡，不用再按一次
            setElementText('status', t('QR_LOGIN_REDIRECTING'));
            showNotification(t('QR_LOGIN_REDIRECTING'), 'info');
            await startLineLogin();
        }
    }
    
    // 綁定按鈕事件
    if (loginBtn) loginBtn.onclick = startLineLogin;
    
    if (logoutBtn) logoutBtn.onclick = () => {
        localStorage.removeItem("sessionToken");
        window.location.href = "/buono_check_manager"
    };
    
    /* ===== 打卡功能 ===== */
    // generalButtonState 已移到 utils.js

        /**
     * 輔助函數：計算時間差（分鐘）
     * @param {string} time1 - 時間 1，格式 "HH:MM"
     * @param {string} time2 - 時間 2，格式 "HH:MM"
     * @returns {number} - 時間差（分鐘），正數表示 time1 晚於 time2
     */
    function getTimeDifference(time1, time2) {
        const [h1, m1] = time1.split(':').map(Number);
        const [h2, m2] = time2.split(':').map(Number);
        
        const minutes1 = h1 * 60 + m1;
        const minutes2 = h2 * 60 + m2;
        
        return minutes1 - minutes2;
    }

    /**
     *  新增：將打卡時間進位到最近的 15 分鐘
     */
    function roundPunchTime(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        
        let roundedMinutes = Math.ceil(minutes / 15) * 15;
        let roundedHours = hours;
        
        if (roundedMinutes === 60) {
        roundedMinutes = 0;
        roundedHours = (hours + 1) % 24;
        }
        
        return `${String(roundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
    }

    punchInBtn?.addEventListener('click', () => doPunch("上班"));
    punchOutBtn?.addEventListener('click', () => doPunch("下班"));

    // 處理補打卡表單
    abnormalList?.addEventListener('click', (e) => {
        const button = e.target.closest('.adjust-btn');
        
        if (button) {
            const date = button.dataset.date;
            const type = button.dataset.type;
            
            console.log(`點擊補打卡: ${date} - ${type}`);
            
            const typeText = t(type === '上班' ? 'PUNCH_IN' : 'PUNCH_OUT');
            
            const formHtml = `
                <div class="p-4 border-t border-gray-200 dark:border-gray-600 fade-in">
                    <p class="font-semibold mb-2 dark:text-white">
                        ${t('MAKEUP_PUNCH_TITLE', { date: date, type: typeText })}
                    </p>
                    
                    <!-- 選擇時間 -->
                    <div class="form-group mb-3">
                        <label for="adjustDateTime" class="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                            ${t('SELECT_PUNCH_TIME', { type: typeText })}
                        </label>
                        <input id="adjustDateTime" 
                            type="datetime-local" 
                            class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500">
                    </div>
                    
                    <!-- 補打卡理由 -->
                    <div class="form-group mb-3">
                        <label for="adjustReason" class="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                            <span data-i18n="ADJUST_REASON_LABEL">補打卡理由</span>
                            <span class="text-red-500">*</span>
                        </label>
                        <textarea id="adjustReason" 
                                  rows="3" 
                                  required
                                  placeholder="${t('ADJUST_REASON_PLACEHOLDER') || '請說明補打卡原因...'}"
                                  class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"></textarea>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-2">
                        <button id="cancel-adjust-btn" 
                                data-i18n="BTN_CANCEL"
                                class="py-2 px-4 rounded-lg font-bold bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500">
                            ${t('BTN_CANCEL')}
                        </button>
                        <button id="submit-adjust-btn" 
                                data-type="${type}"
                                data-date="${date}"
                                class="py-2 px-4 rounded-lg font-bold btn-primary">
                            ${t(type === '上班' ? 'BTN_SUBMIT_PUNCH_IN' : 'BTN_SUBMIT_PUNCH_OUT')}
                        </button>
                    </div>
                </div>
            `;
            
            adjustmentFormContainer.innerHTML = formHtml;
            
            const adjustDateTimeInput = document.getElementById("adjustDateTime");
            const defaultTime = type === '上班' ? '09:00' : '18:00';
            adjustDateTimeInput.value = `${date}T${defaultTime}`;
            
            //  新增：平滑滾動到補打卡表單
            setTimeout(() => {
                adjustmentFormContainer.scrollIntoView({ 
                    behavior: 'smooth',  // 平滑滾動
                    block: 'start'       // 滾動到元素頂部
                });
                
                // 可選：讓理由輸入框自動聚焦
                const reasonInput = document.getElementById('adjustReason');
                if (reasonInput) {
                    reasonInput.focus();
                }
            }, 100); // 稍微延遲，確保表單已渲染
            
            // 綁定取消按鈕
            document.getElementById('cancel-adjust-btn').addEventListener('click', () => {
                adjustmentFormContainer.innerHTML = '';
            });
        }
    });
    
    function validateAdjustTime(value) {
        const selected = new Date(value);
        const now = new Date();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (selected < monthStart) {
            showNotification(t("ERR_BEFORE_MONTH_START"), "error");
            return false;
        }
        // 不允許選今天以後
        if (selected > today) {
            showNotification(t("ERR_AFTER_TODAY"), "error");
            return false;
        }
        return true;
    }


    adjustmentFormContainer?.addEventListener('click', async (e) => {
        const button = e.target.closest('#submit-adjust-btn');
        
        if (button) {
            const loadingText = t('LOADING') || '處理中...';
            
            const datetime = document.getElementById("adjustDateTime").value;
            const reason = document.getElementById("adjustReason")?.value.trim();
            const type = button.dataset.type;
            const date = button.dataset.date;
            
            if (!datetime) {
                showNotification(t('NOTIF_SELECT_ADJUST_DATETIME'), "error");
                return;
            }
            
            //  修改：改為至少 2 個字
            if (!reason || reason.length < 2) {
                showNotification(t('ADJUST_REASON_REQUIRED') || "請填寫補打卡理由（至少 2 個字）", "error");
                return;
            }
            
            if (!validateAdjustTime(datetime)) return;
            
            generalButtonState(button, 'processing', loadingText);

            try {
                const sessionToken = localStorage.getItem("sessionToken");

                // 嘗試取得位置（非必要，失敗不影響補打卡）
                let lat = 0, lng = 0;
                try {
                    const position = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                    });
                    lat = position.coords.latitude;
                    lng = position.coords.longitude;
                } catch (_) {}

                const params = new URLSearchParams({
                    token: sessionToken,
                    type: type,
                    lat: lat,
                    lng: lng,
                    datetime: datetime,
                    note: reason
                });
                
                const res = await callApifetch(`adjustPunch&${params.toString()}`);
                if (res.ok) clearMonthDataCache(); // 補打卡送出後，快取的月資料已過期
                console.log(' 前端提交補打卡:', {
                    type: type,
                    datetime: datetime,
                    reason: reason,
                    response: res
                });
                
                if (res.ok) {
                    showNotification(t('NOTIF_ADJUST_PUNCH_SUBMITTED'), "success");
                    await checkAbnormal();
                    adjustmentFormContainer.innerHTML = '';
                } else {
                    showNotification(t(res.code) || "補打卡失敗", "error");
                }
                
            } catch (err) {
                console.error('補打卡錯誤:', err);
                showNotification(t('NOTIF_ADJUST_PUNCH_FAILED'), "error");
                
            } finally {
                if (adjustmentFormContainer.innerHTML !== '') {
                    generalButtonState(button, 'idle');
                }
            }
        }
    });
    

    // 頁面切換事件
    const tabShiftBtn = document.getElementById('tab-shift-btn');

    // 在現有的分頁按鈕事件後面加入：
    tabShiftBtn?.addEventListener('click', () => {switchTab('shift-view');});


    tabSalaryBtn?.addEventListener('click', () => {switchTab('salary-view');});
    tabDashboardBtn?.addEventListener('click', () => switchTab('dashboard-view'));
    
    tabLocationBtn?.addEventListener('click', () => switchTab('location-view'));
    tabMonthlyBtn?.addEventListener('click', () => switchTab('monthly-view'));
    tabOvertimeBtn?.addEventListener('click', () => {
        switchTab('overtime-view');
        initOvertimeTab();
    });

    //  新增請假按鈕事件
    tabLeaveBtn?.addEventListener('click', () => {
        switchTab('leave-view');
        initLeaveTab();
    });

    tabAdminBtn?.addEventListener('click', async () => {
    
        // 獲取按鈕元素和處理中文字
        const button = tabAdminBtn;
        const loadingText = t('CHECKING') || '檢查中...';
        
        // A. 進入處理中狀態
        generalButtonState(button, 'processing', loadingText);
        
        try {
            //  修正：改用 initApp（與 ensureLogin 一致）
            const res = await callApifetch("initApp");
            
            console.log(' 管理員權限檢查:', res);
            console.log('   - ok:', res.ok);
            console.log('   - user:', res.user);
            console.log('   - dept:', res.user?.dept);
            
            // 檢查回傳的結果和權限
            if (res.ok && res.user && res.user.dept === "管理員") {
                console.log(' 管理員權限驗證通過');
                // 如果 Session 有效且是管理員，執行頁籤切換
                switchTab('admin-view');
            } else {
                console.log(' 權限驗證失敗');
                console.log('   實際部門:', res.user?.dept);
                // 如果權限不足或 Session 無效，給予錯誤提示
                showNotification(t("ERR_NO_PERMISSION") || "您沒有權限執行此操作", "error");
            }
            
        } catch (err) {
            // 處理網路錯誤或 API 呼叫失敗
            console.error(' API 呼叫錯誤:', err);
            showNotification(t("NETWORK_ERROR") || '網絡錯誤', "error");
            
        } finally {
            // B. 無論 API 成功、失敗或網路錯誤，都要恢復按鈕狀態
            generalButtonState(button, 'idle');
        }
    });

    //  新增：綁定查詢按鈕
    const loadAnalysisBtn = document.getElementById('load-punch-analysis-btn');
    if (loadAnalysisBtn) {
        loadAnalysisBtn?.addEventListener('click', loadPunchAnalysis);
    }
    //  新增：綁定匯出按鈕
    const exportEmployeePunchBtn = document.getElementById('export-employee-punch-btn');
    if (exportEmployeePunchBtn) {
        exportEmployeePunchBtn?.addEventListener('click', exportEmployeePunchReport);
    }
    // 月曆按鈕事件
    document.getElementById('prev-month')?.addEventListener('click', () => {
        currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
        renderCalendar(currentMonthDate);
    });
    
    document.getElementById('next-month')?.addEventListener('click', () => {
        currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
        renderCalendar(currentMonthDate);
    });

    const exportAttendanceBtn = document.getElementById('export-attendance-btn');
    if (exportAttendanceBtn) {
        exportAttendanceBtn?.addEventListener('click', () => {
            exportAttendanceReport(currentMonthDate);
        });
    }

    const adminExportAllBtn = document.getElementById('admin-export-all-btn');
    const adminExportMonthInput = document.getElementById('admin-export-month');

    if (adminExportAllBtn && adminExportMonthInput) {
        // 設定預設月份為當月
        const now = new Date();
        const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        adminExportMonthInput.value = defaultMonth;
        
        // 綁定按鈕點擊事件
        adminExportAllBtn?.addEventListener('click', () => {
            const selectedMonth = adminExportMonthInput.value;
            
            if (!selectedMonth) {
                showNotification(t('NOTIF_SELECT_EXPORT_MONTH'), 'error');
                return;
            }
            
            exportAllEmployeesReport(selectedMonth);
        });
    }
    // 語系切換事件
    document.getElementById('language-switcher')?.addEventListener('change', (e) => {
        const newLang = e.target.value;
        loadTranslations(newLang).then(() => {
            if (typeof renderWorkScheduleNote === 'function') renderWorkScheduleNote();
        });
        // 取得當前顯示的標籤頁ID
        const currentTab = document.querySelector('.active');
        const currentTabId = currentTab ? currentTab.id : null;
        console.log(currentTabId);
        // 如果當前頁面是「地圖」頁籤，則重新載入地圖
        if (currentTabId === 'location-view') {
            initLocationMap(true); // 重新載入地圖
        }
    });
    // 點擊日曆日期的事件監聽器
    calendarGrid?.addEventListener('click', (e) => {
        if (e.target.classList.contains('day-cell') && e.target.dataset.date) {
            const date = e.target.dataset.date;
            renderDailyRecords(date);
        }
    });

    // 在 DOMContentLoaded 中修改
    const submitAnnouncementBtn = document.getElementById('submit-announcement-btn');
    if (submitAnnouncementBtn) {
        submitAnnouncementBtn?.addEventListener('click', async () => {
            const title = document.getElementById('announcement-title').value.trim();
            const content = document.getElementById('announcement-content').value.trim();
            const priority = document.getElementById('announcement-priority').value;
            
            if (!title || !content) {
                showNotification(t('NOTIF_TITLE_CONTENT_REQUIRED'), 'error');
                return;
            }
            
            try {
                const res = await callApifetch(
                    `addAnnouncement&title=${encodeURIComponent(title)}&content=${encodeURIComponent(content)}&priority=${priority}`
                );
                
                if (res.ok) {
                    document.getElementById('announcement-title').value = '';
                    document.getElementById('announcement-content').value = '';
                    document.getElementById('announcement-priority').value = 'normal';
                    
                    showNotification(t('NOTIF_ANNOUNCE_OK'), 'success');
                    
                    // 重新載入公告列表
                    if (typeof displayAdminAnnouncements === 'function') await displayAdminAnnouncements();
                    if (typeof displayAnnouncements === 'function') await displayAnnouncements();
                } else {
                    showNotification(res.msg || '發布失敗', 'error');
                }
                
            } catch (error) {
                console.error('發布公告失敗:', error);
                showNotification(t('NOTIF_PUBLISH_FAILED'), 'error');
            }
        });
    }

    //  在這裡加入基本資料的初始化和事件綁定
    if (typeof initEmployeeBasicInfo === 'function') await initEmployeeBasicInfo();
    
    const saveBasicInfoBtn = document.getElementById('save-basic-info-btn');
    if (saveBasicInfoBtn) {
        saveBasicInfoBtn?.addEventListener('click', saveEmployeeBasicInfo);
        console.log(' 基本資料儲存按鈕已綁定');
    } else {
        console.warn(' 找不到基本資料儲存按鈕');
    }
    if (typeof displayAnnouncements === 'function') displayAnnouncements();
});

/**
 * 初始化排班分頁
 */
function initShiftTab() {
    loadTodayShift();
    loadWeekShift();
}

/**
 * 載入今日排班
 */
async function loadTodayShift() {
    const loadingEl = document.getElementById('today-shift-loading');
    const emptyEl = document.getElementById('today-shift-empty');
    const infoEl = document.getElementById('today-shift-info');
    
    // 如果有快取，直接使用
    if (todayShiftCache !== null) {
        displayTodayShift(todayShiftCache);
        return;
    }
    
    try {
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        infoEl.style.display = 'none';
        
        const userId = localStorage.getItem('sessionUserId');
        const today = todayStr();
        
        const res = await callApifetch(`getEmployeeShiftForDate&employeeId=${userId}&date=${today}`);
        
        loadingEl.style.display = 'none';
        
        // 快取結果
        todayShiftCache = res;
        displayTodayShift(res);
        
    } catch (error) {
        console.error('載入今日排班失敗:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
    }
}

/**
 * 顯示今日排班
 */
function displayTodayShift(res) {
    const emptyEl = document.getElementById('today-shift-empty');
    const infoEl = document.getElementById('today-shift-info');
    
    if (res.ok && res.hasShift) {
        document.getElementById('shift-type').textContent = res.data.shiftType;
        document.getElementById('shift-time').textContent = 
            `${res.data.startTime} - ${res.data.endTime}`;
        document.getElementById('shift-location').textContent = res.data.location;
        infoEl.style.display = 'block';
    } else {
        emptyEl.style.display = 'block';
    }
}

/**
 *  載入未來 7 天排班（完全修正版 - 強制清除舊快取）
 */
async function loadWeekShift() {
    const loadingEl = document.getElementById('week-shift-loading');
    const emptyEl = document.getElementById('week-shift-empty');
    const listEl = document.getElementById('week-shift-list');
    
    //  步驟 1: 計算「今天到未來 7 天」的範圍
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const startOfWeek = today;
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + 7);
    
    const startDateStr = toLocalDateStr(startOfWeek);
    const endDateStr = toLocalDateStr(endOfWeek);
    
    console.log(' 未來排班範圍:', {
        today: toLocalDateStr(today),
        startOfWeek: startDateStr,
        endOfWeek: endDateStr
    });
    
    //  步驟 2: 生成快取鍵值
    const cacheKey = `${startDateStr}_${endDateStr}`;
    
    //  步驟 3: 檢查快取（但只有在「分頁初次載入」時才使用）
    // 如果快取存在且日期範圍相同，才使用快取
    if (weekShiftCache !== null && 
        weekShiftCache.cacheKey === cacheKey &&
        Date.now() - weekShiftCache.timestamp < 60000) { // 快取 1 分鐘有效
        
        console.log(' 使用有效快取（1 分鐘內）');
        displayWeekShift(weekShiftCache.data);
        return;
    }
    
    //  步驟 4: 清除舊快取，強制重新載入
    console.log(' 清除舊快取，重新載入');
    weekShiftCache = null;
    
    try {
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        listEl.innerHTML = '';
        
        const userId = localStorage.getItem('sessionUserId');
        
        const filters = {
            employeeId: userId,
            startDate: startDateStr,
            endDate: endDateStr
        };
        
        console.log(' 呼叫 API，篩選條件:', filters);
        
        const res = await callApifetch(`getShifts&filters=${encodeURIComponent(JSON.stringify(filters))}`);
        
        console.log(' API 回應:', res);
        
        loadingEl.style.display = 'none';
        
        //  步驟 5: 快取新資料
        weekShiftCache = {
            cacheKey: cacheKey,
            data: res,
            timestamp: Date.now()
        };
        
        console.log(' 已快取新資料:', weekShiftCache);
        
        //  步驟 6: 顯示資料
        displayWeekShift(res);
        
    } catch (error) {
        console.error(' 載入未來排班失敗:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
    }
}
/**
 * 顯示本週排班
 */
function displayWeekShift(res) {
    const emptyEl = document.getElementById('week-shift-empty');
    const listEl = document.getElementById('week-shift-list');
    
    console.log(' displayWeekShift 收到的資料:', res);
    
    if (res.ok && res.data && res.data.length > 0) {
        listEl.innerHTML = '';
        
        console.log(' 開始渲染', res.data.length, '筆排班');
        
        res.data.forEach((shift, index) => {
            console.log(`   ${index + 1}. ${shift.date} - ${shift.shiftType}`);
            
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center text-sm bg-white dark:bg-gray-800 p-2 rounded-md';
            item.innerHTML = `
                <div>
                    <span class="font-semibold text-purple-900 dark:text-purple-200">
                        ${formatShiftDate(shift.date)}
                    </span>
                    <span class="text-purple-700 dark:text-purple-400 ml-2">
                        ${escapeHtml(shift.shiftType)}
                    </span>
                </div>
                <div class="text-purple-700 dark:text-purple-400">
                    ${shift.startTime} - ${shift.endTime}
                </div>
            `;
            listEl.appendChild(item);
        });
        
        emptyEl.style.display = 'none';
    } else {
        console.log(' 沒有排班資料或資料格式錯誤');
        emptyEl.style.display = 'block';
        listEl.innerHTML = '';
    }
}

/**
 * 格式化排班日期
 */
function formatShiftDate(dateString) {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = [
        t('WEEK_SUNDAY'),
        t('WEEK_MONDAY'),
        t('WEEK_TUESDAY'),
        t('WEEK_WEDNESDAY'),
        t('WEEK_THURSDAY'),
        t('WEEK_FRIDAY'),
        t('WEEK_SATURDAY')
    ];
    const weekday = weekdays[date.getDay()];
    
    return `${month}/${day} (${weekday})`;
}

/**
 * 清除排班快取（當有更新時使用）
 */
/**
 * 清掉出勤記錄的月份快取；打卡、補打卡之後一定要呼叫，
 * 否則切到「出勤記錄」看到的還是打卡前的資料。
 */
function clearMonthDataCache(monthKey) {
    if (monthKey) {
        delete monthDataCache[monthKey];
    } else {
        monthDataCache = {};
    }
}

function clearShiftCache() {
    todayShiftCache = null;
    weekShiftCache = null;
}

// 已移到 analytics.js

// 已移到 reports.js


/**
 * 取得星期幾
 */
function getDayOfWeek(dateString) {
    const date = new Date(dateString);
    const weekdays = [
        t('WEEKDAY_SUNDAY') || 'Sunday',
        t('WEEKDAY_MONDAY') || 'Monday',
        t('WEEKDAY_TUESDAY') || 'Tuesday',
        t('WEEKDAY_WEDNESDAY') || 'Wednesday',
        t('WEEKDAY_THURSDAY') || 'Thursday',
        t('WEEKDAY_FRIDAY') || 'Friday',
        t('WEEKDAY_SATURDAY') || 'Saturday'
    ];
    return weekdays[date.getDay()];
}

/**
 * 將時間字串轉換為小數
 */
function timeToDecimal(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + (minutes / 60);
}

// 已移到 biometric.js


/**
     * 執行打卡
     */
async function doPunch(type) {

    //  防止重複提交
    if (_isPunching) {
        showNotification(t('NOTIF_PUNCHING'), 'warning');
        return;
    }
    _isPunching = true;
    
    const punchButtonId = type === '上班' ? 'punch-in-btn' : 'punch-out-btn';
    
    const button = document.getElementById(punchButtonId);
    const loadingText = t('LOADING') || '處理中...';

    if (!button) {
        _isPunching = false; // 沒有按鈕也要放開鎖，否則之後再也打不了卡
        return;
    }

    generalButtonState(button, 'processing', loadingText);
    
    // ==================== 上班打卡前檢查排班 ====================
    if (type === '上班') {
        try {
            const userId = localStorage.getItem('sessionUserId');
            const today = todayStr();

            const now = new Date();
            const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            
            const shiftRes = await callApifetch(`getEmployeeShiftForDate&employeeId=${userId}&date=${today}`);
            
            if (shiftRes.ok && shiftRes.hasShift) {
                const shift = shiftRes.data;
                
                showNotification(
                    t('SHIFT_INFO_NOTIFICATION', {
                        shiftType: shift.shiftType,
                        startTime: shift.startTime,
                        endTime: shift.endTime
                    }) || `今日排班：${escapeHtml(shift.shiftType)} (${shift.startTime}-${shift.endTime})`,
                    'info'
                );
                
                // const now = new Date();
                // const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                
                if (shift.startTime) {
                    const timeDiff = getTimeDifference(currentTime, shift.startTime);
                    
                    if (timeDiff < -30) {
                        showNotification(
                            t('EARLY_PUNCH_WARNING') || `注意：您的排班時間是 ${shift.startTime}，目前提前超過 30 分鐘打卡。`,
                            'warning'
                        );
                    }
                    else if (timeDiff > 30) {
                        showNotification(
                            t('LATE_PUNCH_WARNING') || `注意：您的排班時間是 ${shift.startTime}，目前已遲到超過 30 分鐘。`,
                            'warning'
                        );
                    }
                }
            }
        } catch (error) {
            console.error('檢查排班失敗:', error);
        }
    }
    
    if (!navigator.geolocation) {
        showNotification(t("ERROR_GEOLOCATION", { msg: "您的瀏覽器不支援地理位置功能。" }), "error");
        generalButtonState(button, 'idle');
        _isPunching = false;
        return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const now = new Date();
        const datetime = now.toISOString();

        const action = `punch&type=${encodeURIComponent(type)}&lat=${lat}&lng=${lng}&datetime=${encodeURIComponent(datetime)}&note=${encodeURIComponent(navigator.userAgent)}`;

        try {
            const res = await callApifetch(action);
            const msgKey = res.code || "UNKNOWN_ERROR";
            let msg = t(msgKey, res.params || {});
            // 錯誤碼沒有翻譯時，顯示後端的中文說明，不要讓員工看到 ERR_… 這種代碼
            if (msg === msgKey && res.msg) msg = res.msg;
            showNotification(msg, res.ok ? "success" : "error");

            if (res.ok) {
                clearMonthDataCache(); // 打卡成功，出勤記錄的快取已經過期
            }

            if (res.ok && type === '上班') {
                clearShiftCache();
            }
        } catch (err) {
            console.error(err);
        } finally {
            generalButtonState(button, 'idle');
            _isPunching = false;  //  釋放鎖
        }
    }, (err) => {
        showNotification(t("ERROR_GEOLOCATION", { msg: err.message }), "error");
        generalButtonState(button, 'idle');
        _isPunching = false;  //  釋放鎖（定位失敗也要釋放）
    });
}

/**
 * 輔助函數：計算時間差（分鐘）
 */
function getTimeDifference(time1, time2) {
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    
    const minutes1 = h1 * 60 + m1;
    const minutes2 = h2 * 60 + m2;
    
    return minutes1 - minutes2;
}

/**
 *  新增：將打卡時間進位到最近的 15 分鐘
 */
function roundPunchTime(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    
    let roundedMinutes = Math.ceil(minutes / 15) * 15;
    let roundedHours = hours;
    
    if (roundedMinutes === 60) {
      roundedMinutes = 0;
      roundedHours = (hours + 1) % 24;
    }
    
    return `${String(roundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
  }
// ==================== 用戶管理用戶管理功能 ====================

let allUsersCache = []; // 快取所有用戶

//  在 script.js 的 changeUserRole 函數中新增排班人員選項
//  修改用戶列表渲染函數
// ==================== 編輯員工姓名功能 ====================

// ====================  佈告欄功能 ====================

// ==================== 員工基本資料功能 ====================
/**
 *  初始化員工基本資料（自動載入）
 */
let _isSubmittingToday = false;
// ==================== 歷史補打卡功能 ====================

let _isSubmittingHistory = false;
// ==================== LINE Bot 網頁打卡 ====================

// ==================== QR Code 打卡系統 ====================

let _qrCountdownInterval = null;
let _qrExpiryTime = null;
let _qrTotalMs = null;

// 初始化自訂分鐘輸入框的顯示邏輯
document.addEventListener('DOMContentLoaded', () => {
    const validSelect = document.getElementById('qr-valid-minutes');
    const customInput = document.getElementById('qr-valid-minutes-custom');
    if (validSelect && customInput) {
        validSelect.addEventListener('change', () => {
            customInput.style.display = validSelect.value === 'custom' ? 'block' : 'none';
        });
    }
});