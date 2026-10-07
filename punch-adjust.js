// punch-adjust.js
//
// 補打卡：當日調整與歷史補登，兩者都會送出申請給管理員審核。
//
// 從 script.js 拆出來的：那支原本 4,000 多行，每個頁面都要整份載入。
// 這裡的函式仍然是全域的，載入順序沒有相依性。

/**
     *  打開當日異常修正對話框
     */
function openAdjustTodayDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    dialog.id = 'adjust-today-dialog';
    
    const now = new Date();
    const today = toLocalDateStr(now);
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    dialog.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-4">
                 當日異常修正
            </h3>
            
            <p class="text-sm text-yellow-600 dark:text-yellow-400 mb-4">
                 此功能用於修正今天的打卡記錄。例如：忘記打上班卡、打錯類型等。
            </p>
            
            <!-- 選擇要修正的類型 -->
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    修正類型 <span class="text-red-500">*</span>
                </label>
                <select id="adjust-type-select" 
                        class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white">
                    <option value="上班">補打上班卡</option>
                    <option value="下班">補打下班卡</option>
                </select>
            </div>
            
            <!-- 選擇時間 -->
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    實際打卡時間 <span class="text-red-500">*</span>
                </label>
                <input type="time" 
                    id="adjust-time-input"
                    value="${currentTime}"
                    class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white">
            </div>
            
            <!-- 修正理由 -->
            <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    修正理由 <span class="text-red-500">*</span>
                </label>
                <textarea id="adjust-reason-input" 
                        rows="3" 
                        required
                        placeholder="例如：忘記打卡、系統延遲、打錯類型..."
                        class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"></textarea>
            </div>
            
            <div class="flex space-x-3">
                <button onclick="closeAdjustTodayDialog()"
                        class="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-semibold">
                    取消
                </button>
                <button onclick="submitAdjustToday()"
                        id="submit-adjust-today-btn"
                        class="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold">
                    確認修正
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 點擊背景關閉
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            closeAdjustTodayDialog();
        }
    });
}

/**
 *  關閉當日異常修正對話框
 */
function closeAdjustTodayDialog() {
    const dialog = document.getElementById('adjust-today-dialog');
    if (dialog) {
        dialog.remove();
    }
}

/**
 *  提交當日異常修正
 */
async function submitAdjustToday() {
    if (_isSubmittingToday) { showNotification(t('NOTIF_PROCESSING_NO_DOUBLE'), 'warning'); return; }
    _isSubmittingToday = true;
    // 不管成功、失敗或欄位沒填，結束都要放開。以前從來沒放開：送過一次之後，
    // 再補第二張卡永遠只會看到「處理中，請勿重複送出」
    try {
        return await submitAdjustTodayInner();
    } finally {
        _isSubmittingToday = false;
    }
}

async function submitAdjustTodayInner() {
    const typeSelect = document.getElementById('adjust-type-select');
    const timeInput = document.getElementById('adjust-time-input');
    const reasonInput = document.getElementById('adjust-reason-input');
    const submitBtn = document.getElementById('submit-adjust-today-btn');
    
    const type = typeSelect.value;
    const time = timeInput.value;
    const reason = reasonInput.value.trim();
    
    // 驗證
    if (!time) {
        showNotification(t('NOTIF_SELECT_TIME'), 'error');
        return;
    }
    
    if (!reason || reason.length < 2) {
        showNotification(t('NOTIF_ADJUST_REASON_2'), 'error');
        return;
    }
    
    const loadingText = t('LOADING') || '處理中...';
    generalButtonState(submitBtn, 'processing', loadingText);
    
    try {
        const sessionToken = localStorage.getItem("sessionToken");
        
        // 位置非必要：補打卡是事後申請。以前一定要定位成功才能送出（而且沒有逾時），
        // 定位被拒或在 LINE 瀏覽器裡抓不到位置時，當日修正就一直失敗
        let lat = 0, lng = 0;
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: false });
            });
            lat = position.coords.latitude;
            lng = position.coords.longitude;
        } catch (_) {}
        
        // 組合完整日期時間
        const now = new Date();
        const today = toLocalDateStr(now);
        const datetime = `${today}T${time}:00`;
        
        const params = new URLSearchParams({
            token: sessionToken,
            type: type,
            lat: lat,
            lng: lng,
            datetime: datetime,
            note: `【當日修正】${reason}`
        });
        
        const result = await submitAdjustPunchRequest(params);
        if (result.ok) clearMonthDataCache(); // 補打卡送出後，快取的月資料已過期
        
        if (result.ok) {
            showNotification(t('NOTIF_ADJUST_SUBMITTED'), 'success');
            closeAdjustTodayDialog();
            
            // 重新載入異常記錄
            await checkAbnormal();
        } else {
            showNotification(result.message, 'error');
        }
        
    } catch (err) {
        console.error('當日修正錯誤:', err);
        showNotification(t('NOTIF_ADJUST_FAILED'), 'error');
        
    } finally {
        generalButtonState(submitBtn, 'idle');
    }
}

/**
 *  打開歷史補打卡對話框
 */
function openHistoryAdjustDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    dialog.id = 'history-adjust-dialog';
    
    const now = new Date();
    const today = toLocalDateStr(now);
    // 可以補上個月與本月：月初還要補上個月最後幾天的卡
    const monthStart = toLocalDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    
    dialog.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-4">
                 歷史補打卡
            </h3>
            
            <!-- 說明提示 -->
            <div class="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 rounded p-3 mb-4">
                <p class="text-sm text-yellow-800 dark:text-yellow-300">
                    <strong> 注意事項：</strong>
                </p>
                <ul class="text-xs text-yellow-700 dark:text-yellow-400 mt-2 space-y-1 list-disc list-inside">
                    <li>只能補打<strong>本月</strong>的打卡記錄</li>
                    <li>需要<strong>主管審核</strong>通過才會生效</li>
                    <li>請詳細說明補打卡原因</li>
                </ul>
            </div>
            
            <!-- 選擇日期 -->
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    補打日期 <span class="text-red-500">*</span>
                </label>
                <input type="date" 
                       id="history-adjust-date"
                       min="${monthStart}" 
                       max="${today}"
                       class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent">
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                     可選範圍：${monthStart} ~ ${today}
                </p>
            </div>
            
            <!-- 選擇類型 -->
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    補打類型 <span class="text-red-500">*</span>
                </label>
                <select id="history-adjust-type" 
                        class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent">
                    <option value="">請選擇</option>
                    <option value="上班">補打上班卡</option>
                    <option value="下班">補打下班卡</option>
                </select>
            </div>
            
            <!-- 選擇時間 -->
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    實際打卡時間 <span class="text-red-500">*</span>
                </label>
                <input type="time" 
                       id="history-adjust-time"
                       class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent">
            </div>
            
            <!-- 補打原因 -->
            <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    補打原因 <span class="text-red-500">*</span>
                </label>
                <textarea id="history-adjust-reason" 
                          rows="4" 
                          required
                          placeholder="請詳細說明為什麼需要補打卡（至少 10 個字）&#10;例如：&#10;- 當天忘記打卡&#10;- 系統故障無法打卡&#10;- 外出洽公不在打卡範圍&#10;- 手機沒電無法打卡"
                          class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"></textarea>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                     理由越詳細，主管審核通過率越高
                </p>
            </div>
            
            <!-- 按鈕區 -->
            <div class="flex space-x-3">
                <button onclick="closeHistoryAdjustDialog()"
                        class="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-semibold transition-colors">
                    取消
                </button>
                <button onclick="submitHistoryAdjust()"
                        id="submit-history-adjust-btn"
                        class="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-semibold transition-colors">
                    提交補打卡申請
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 點擊背景關閉
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            closeHistoryAdjustDialog();
        }
    });
}

/**
 *  關閉歷史補打卡對話框
 */
function closeHistoryAdjustDialog() {
    const dialog = document.getElementById('history-adjust-dialog');
    if (dialog) {
        dialog.remove();
    }
}

/**
 *  提交歷史補打卡申請
 */
async function submitHistoryAdjust() {
    if (_isSubmittingHistory) { showNotification(t('NOTIF_PROCESSING_NO_DOUBLE'), 'warning'); return; }
    _isSubmittingHistory = true;
    // 欄位沒填而提早結束時也要放開，不然之後再也送不出去
    try {
        return await submitHistoryAdjustInner();
    } finally {
        _isSubmittingHistory = false;
    }
}

async function submitHistoryAdjustInner() {

    const dateInput = document.getElementById('history-adjust-date');
    const typeInput = document.getElementById('history-adjust-type');
    const timeInput = document.getElementById('history-adjust-time');
    const reasonInput = document.getElementById('history-adjust-reason');
    const submitBtn = document.getElementById('submit-history-adjust-btn');

    try {
        const date   = dateInput.value;
        const type   = typeInput.value;
        const time   = timeInput.value;
        const reason = reasonInput.value.trim();

        // ===== 驗證 =====

        if (!date) {
            showNotification(t('NOTIF_SELECT_ADJUST_DATE'), 'error');
            dateInput.focus();
            return;
        }
        if (!type) {
            showNotification(t('NOTIF_SELECT_ADJUST_TYPE'), 'error');
            typeInput.focus();
            return;
        }
        if (!time) {
            showNotification(t('NOTIF_SELECT_PUNCH_TIME'), 'error');
            timeInput.focus();
            return;
        }
        if (reason.length < 10) {
            showNotification(t('NOTIF_ADJUST_REASON_10'), 'error');
            reasonInput.focus();
            return;
        }

        // 用當地日期解析（new Date('2026-10-08') 會被當成 UTC，台灣是早上 8 點，今天會被誤判成未來）
        const [sy, sm, sd] = date.split('-').map(Number);
        const selectedDate = new Date(sy, sm - 1, sd);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        if (selectedDate < monthStart) {
            showNotification(t('NOTIF_ADJUST_THIS_MONTH_ONLY'), 'error');
            return;
        }
        if (selectedDate > today) {
            showNotification(t('NOTIF_NO_FUTURE_ADJUST'), 'error');
            return;
        }
        if (selectedDate.getTime() === today.getTime()) {
            if (!confirm('您選擇的是今天的日期，建議使用「當日異常修正」功能更快速。\n\n確定要繼續使用歷史補打卡嗎？')) {
                return;
            }
        }

        // ===== 提交 =====

        generalButtonState(submitBtn, 'processing', '提交中...');

        const sessionToken = localStorage.getItem("sessionToken");

        // 嘗試取得位置（非必要，失敗不影響補打卡）
        let lat = 0, lng = 0;
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 5000,
                    enableHighAccuracy: false
                });
            });
            lat = position.coords.latitude;
            lng = position.coords.longitude;
        } catch (_) {}

        const datetime    = `${date}T${time}:00`;
        const noteWithTag = `【歷史補打】${reason}`;

        const params = new URLSearchParams({
            token: sessionToken,
            type: type,
            lat: lat,
            lng: lng,
            datetime: datetime,
            note: noteWithTag
        });

        const result = await submitAdjustPunchRequest(params);
        if (result.ok) clearMonthDataCache(); // 補打卡送出後，快取的月資料已過期

        if (result.ok) {
            showNotification(t('NOTIF_HISTORY_ADJUST_SUBMITTED'), 'success');
            closeHistoryAdjustDialog();
            await checkAbnormal();
        } else {
            showNotification(result.message, 'error');
        }

    } catch (err) {
        console.error('歷史補打卡錯誤:', err);
        if (err.code === 1) {
            showNotification(t('NOTIF_NO_LOCATION_PERMISSION'), 'error');
        } else {
            showNotification(t('NOTIF_SUBMIT_FAILED'), 'error');
        }
    } finally {
        _isSubmittingHistory = false;
        generalButtonState(submitBtn, 'idle');
    }
}
