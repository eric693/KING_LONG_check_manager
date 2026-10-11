// overtime.js - 加班功能前端邏輯

// ==================== 初始化加班頁面 ====================

//  使用 Promise 單例取代 boolean 鎖
// boolean 鎖在 async/await 間有競態，Promise 單例才能真正防止重入
let _pendingOvertimePromise = null;
let _employeeOvertimePromise = null;
/**
 * 初始化加班申請表單
 */
async function initOvertimeTab() {
    const overtimeView = document.getElementById('overtime-view');
    
    if (!overtimeView) {
        console.error("找不到加班頁面元素");
        return;
    }
    
    // 載入員工的加班記錄
    await loadEmployeeOvertimeRecords();
    
    // 國定假日清單（有快取，不會每次都打 API）
    await loadNationalHolidays();
    
    // 綁定申請表單提交事件
    bindOvertimeFormEvents();
}

const MAX_MONTHLY_OVERTIME = 46;      // 每月加班時數上限
// 國定假日相關（loadNationalHolidays / isFullDayOvertime）已移到 holidays.js

/**
 * 載入員工的加班申請記錄（修改版 - 計算本月統計）
 */
async function loadEmployeeOvertimeRecords() {
    const recordsList = document.getElementById('overtime-records-list');
    const recordsEmpty = document.getElementById('overtime-records-empty');
    const recordsLoading = document.getElementById('overtime-records-loading');
    
    recordsLoading.style.display = 'block';
    recordsList.innerHTML = '';
    recordsEmpty.style.display = 'none';
    
    try {
        const res = await callApifetch('getEmployeeOvertime');
        recordsLoading.style.display = 'none';
        
        if (res.ok && res.requests && res.requests.length > 0) {
            //  計算本月已核准加班時數
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            
            const approvedThisMonth = res.requests.filter(req => {
                const reqMonth = req.overtimeDate.substring(0, 7); // "YYYY-MM"
                const status = String(req.status).toLowerCase().trim();
                return reqMonth === currentMonth && status === 'approved';
            });
            
            const totalApprovedHours = approvedThisMonth.reduce((sum, req) => {
                return sum + (parseFloat(req.hours) || 0);
            }, 0);
            
            //  顯示本月統計
            displayMonthlyOvertimeStats(totalApprovedHours);
            
            await renderOvertimeRecords(res.requests, recordsList);
        } else {
            recordsEmpty.style.display = 'block';
            displayMonthlyOvertimeStats(0); // 顯示 0 小時
        }
    } catch (err) {
        console.error(err);
        recordsLoading.style.display = 'none';
        showNotification(t('ERROR_LOAD_OVERTIME') || '載入失敗', 'error');
    }
}

/**
 *  新增：顯示本月加班統計
 */
function displayMonthlyOvertimeStats(approvedHours) {
    const now = new Date();
    
    const remaining = Math.max(0, MAX_MONTHLY_OVERTIME - approvedHours);
    const exceeded = Math.max(0, approvedHours - MAX_MONTHLY_OVERTIME);
    
    const statsHtml = `
        <div class="mb-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg">
            <h3 class="text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-3">
                ${escapeHtml(t('OT_MONTH_STATS', { year: now.getFullYear(), month: now.getMonth() + 1 }))}
            </h3>
            <div class="grid grid-cols-2 gap-3">
                <div class="text-center">
                    <p class="text-xs text-gray-600 dark:text-gray-400">${escapeHtml(t('OT_APPROVED_HOURS'))}</p>
                    <p class="text-2xl font-bold ${approvedHours > MAX_MONTHLY_OVERTIME ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}">
                        ${approvedHours.toFixed(1)}
                    </p>
                    <p class="text-xs text-gray-500">${escapeHtml(t('OT_OF_MAX', { max: MAX_MONTHLY_OVERTIME }))}</p>
                </div>
                <div class="text-center">
                    <p class="text-xs text-gray-600 dark:text-gray-400">
                        ${escapeHtml(exceeded > 0 ? t('OT_OVER_LIMIT_LABEL') : t('OT_REMAINING_LABEL'))}
                    </p>
                    <p class="text-2xl font-bold ${exceeded > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}">
                        ${exceeded > 0 ? exceeded.toFixed(1) : remaining.toFixed(1)}
                    </p>
                    <p class="text-xs text-gray-500">${escapeHtml(t('UNIT_HOURS'))}</p>
                </div>
            </div>
            ${exceeded > 0 ? `
                <div class="mt-3 p-2 bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 rounded text-center">
                    <p class="text-xs font-semibold text-orange-800 dark:text-orange-300">
                         ${escapeHtml(t('OT_OVER_LIMIT_NOTE'))}
                    </p>
                </div>
            ` : ''}
        </div>
    `;
    
    // 在表單前插入統計區塊
    const formContainer = document.querySelector('#overtime-view .card');
    if (formContainer) {
        let statsContainer = document.getElementById('overtime-stats-container');
        if (!statsContainer) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'overtime-stats-container';
            formContainer.insertBefore(statsContainer, formContainer.firstChild);
        }
        statsContainer.innerHTML = statsHtml;
    }
}

/**
 * 格式化時間顯示 - 只顯示 HH:mm 格式
 * @param {string} timeStr - 時間字串
 * @returns {string} 格式化後的時間
 */
function formatTimeDisplay(timeStr) {
    if (!timeStr) return '';
    
    // 轉換為字串
    const str = String(timeStr);
    
    // 如果是完整的 datetime 格式 (包含 T)，只取時間部分
    if (str.includes('T')) {
        const timePart = str.split('T')[1];
        return timePart.substring(0, 5); // 取 HH:mm
    }
    
    // 如果已經是時間格式，確保只取 HH:mm
    if (str.includes(':')) {
        return str.substring(0, 5);
    }
    
    return str;
}

/**
 * 渲染加班記錄列表
 */
async function renderOvertimeRecords(requests, container) {
    container.innerHTML = '';
    
    // 整頁的附件一次抓完，不要每筆各打一次 API
    if (typeof prefetchAttachments === 'function') {
        await prefetchAttachments('overtime', requests.map(r => buildAttachmentKey('overtime', {
            employeeId: r.employeeId || userId,
            overtimeDate: r.overtimeDate || r.date,
            startTime: r.startTime
        })));
    }
    
    requests.forEach(req => {
        const li = document.createElement('li');
        li.className = 'p-4 bg-gray-50 dark:bg-gray-700 rounded-lg';
        
        // 格式化時間顯示
        const startTime = formatTimeDisplay(req.startTime);
        const endTime = formatTimeDisplay(req.endTime);
        
        //  確保時數正確顯示
        const hours = parseFloat(req.hours) || 0;
        const compHours = parseFloat(req.compensatoryHours) || 0;
        // 狀態顯示
        let statusBadge = '';
        let statusClass = '';
        
        //  統一處理狀態（轉為小寫比對）
        const status = String(req.status).toLowerCase().trim();
        
        console.log(`渲染加班記錄: 狀態=${status}, 時間=${startTime}-${endTime}, 時數=${hours}`);
        
        switch(status) {
            case 'pending':
                statusBadge = t('OVERTIME_STATUS_PENDING') || '待審核';
                statusClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
                break;
            case 'approved':
                statusBadge = t('OVERTIME_STATUS_APPROVED') || '已核准';
                statusClass = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
                break;
            case 'rejected':
                statusBadge = t('OVERTIME_STATUS_REJECTED') || '已拒絕';
                statusClass = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
                break;
            default:
                statusBadge = status;
                statusClass = 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
        }
        
        li.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-semibold text-gray-800 dark:text-white">${req.overtimeDate}</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        ${startTime} - ${endTime} (${escapeHtml(t('HOURS_N', { n: hours }))})
                    </p>
                    ${compHours > 0 ? `
                        <p class="text-sm text-orange-600 dark:text-orange-400 font-semibold mt-1">
                            ${escapeHtml(t('OT_COMP_HOURS'))}：${escapeHtml(t('HOURS_N', { n: compHours }))}
                        </p>
                    ` : ''}
                </div>
                <span class="px-2 py-1 text-xs font-semibold rounded ${statusClass}">
                    ${statusBadge}
                </span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
                <strong>${escapeHtml(t('OVERTIME_REASON_LABEL'))}</strong>${escapeHtml(req.reason)}
            </p>
            ${req.reviewComment ? `
                <p class="text-sm text-gray-500 dark:text-gray-400 italic">
                    <strong>${escapeHtml(t('OVERTIME_REVIEW_COMMENT'))}</strong>${escapeHtml(req.reviewComment)}
                </p>
            ` : ''}
        `;
        
        // 加班佐證（工作照片、主管信件等）
        if (typeof renderAttachments === 'function') {
            const box = document.createElement('div');
            box.className = 'mt-2';
            li.appendChild(box);

            const key = buildAttachmentKey('overtime', {
                employeeId: req.employeeId || userId,
                overtimeDate: req.overtimeDate || req.date,
                startTime: req.startTime
            });
            renderAttachments(box, 'overtime', key, { canUpload: req.status === 'PENDING' || req.reviewStatus === '待審核' });
        }

        container.appendChild(li);
        renderTranslations(li);
    });
}
/**
 * 綁定加班表單事件
 */
function bindOvertimeFormEvents() {
    const submitBtn = document.getElementById('submit-overtime-btn');
    
    if (submitBtn) {
        // 移除舊的事件監聽器，避免重複綁定
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        newSubmitBtn.addEventListener('click', handleOvertimeSubmit);
    }
    
    // 自動計算加班時數
    const startTimeInput = document.getElementById('overtime-start-time');
    const endTimeInput = document.getElementById('overtime-end-time');
    
    const dateInput = document.getElementById('overtime-date');
    
    if (startTimeInput && endTimeInput) {
        const toMin = t => parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]);

        // 平日是接在正常班之後加班，所以從 19:30 起算；
        // 國定假日與週末整天都算加班，要從實際開始時間算起。

        const calculateHours = () => {
            const start = startTimeInput.value;
            const end = endTimeInput.value;
            const hoursInput = document.getElementById('overtime-hours');
            if (!start || !end || !hoursInput) return;

            const startMin = toMin(start);
            let endMin = toMin(end);
            if (endMin <= startMin) endMin += 24 * 60; // 跨夜加班

            // 起算點：休息日看開始時間，平日不早於 19:30
            const fullDay = isFullDayOvertime(dateInput && dateInput.value);
            const beginMin = fullDay ? startMin : Math.max(startMin, OVERTIME_THRESHOLD_MIN);
            const hours = endMin <= beginMin
                ? 0
                : Math.ceil((endMin - beginMin) / OVERTIME_UNIT_MIN) * 0.5;

            hoursInput.value = hours.toFixed(1);
        };

        startTimeInput.addEventListener('change', calculateHours);
        endTimeInput.addEventListener('change', calculateHours);
        if (dateInput) dateInput.addEventListener('change', calculateHours);
    }
}

/**
 * 處理加班申請提交（修改版 - 加入補休時數檢查）
 */
async function handleOvertimeSubmit() {
    const dateInput = document.getElementById('overtime-date');
    const startTimeInput = document.getElementById('overtime-start-time');
    const endTimeInput = document.getElementById('overtime-end-time');
    const hoursInput = document.getElementById('overtime-hours');
    const reasonInput = document.getElementById('overtime-reason');
    const submitBtn = document.getElementById('submit-overtime-btn');
    
    const overtimeDate = dateInput.value;
    const startTime = startTimeInput.value;
    const endTime = endTimeInput.value;
    const hours = parseFloat(hoursInput.value);
    const reason = reasonInput.value;
    
    // 驗證
    if (!overtimeDate || !startTime || !endTime || !hours || !reason) {
        showNotification(t('OVERTIME_FILL_ALL_FIELDS') || '請填寫所有欄位', 'error');
        return;
    }
    
    if (hours <= 0) {
        showNotification(t('OVERTIME_INVALID_HOURS') || '加班時數必須大於0', 'error');
        return;
    }
    
    //  檢查是否超過本月上限
    const checkResult = await checkMonthlyOvertimeLimit(overtimeDate, hours);
    
    if (!checkResult.withinLimit) {
        // 超過上限，顯示補休時數欄位
        showCompensatoryHoursInput(checkResult.currentHours, hours, checkResult.exceeded);
        return;
    }
    
    // 在上限內，正常提交
    submitOvertimeRequest(overtimeDate, startTime, endTime, hours, reason, 0);
}

/**
 *  修改：提交加班申請（加入補休時數參數）
 */
async function submitOvertimeRequest(overtimeDate, startTime, endTime, hours, reason, compensatoryHours) {
    const submitBtn = document.getElementById('submit-overtime-btn');
    const loadingText = t('LOADING') || '處理中...';
    
    generalButtonState(submitBtn, 'processing', loadingText);
    
    console.log(`提交加班申請: 日期=${overtimeDate}, 時數=${hours}, 補休=${compensatoryHours}`);
    
    try {
        const res = await callApifetch(
            `submitOvertime&overtimeDate=${overtimeDate}&startTime=${startTime}&endTime=${endTime}&hours=${hours}&reason=${encodeURIComponent(reason)}&compensatoryHours=${compensatoryHours}`
        );
        
        if (res.ok) {
            showNotification(t('OVERTIME_SUBMIT_SUCCESS') || '加班申請提交成功', 'success');
            
            // 清空表單
            document.getElementById('overtime-date').value = '';
            document.getElementById('overtime-start-time').value = '';
            document.getElementById('overtime-end-time').value = '';
            document.getElementById('overtime-hours').value = '';
            document.getElementById('overtime-reason').value = '';
            
            // 重新載入記錄
            await loadEmployeeOvertimeRecords();
        } else {
            showNotification(t(res.code) || t('ERROR_SUBMIT_OVERTIME') || '提交失敗', 'error');
        }
    } catch (err) {
        console.error(err);
        showNotification(t('NETWORK_ERROR') || '網路錯誤', 'error');
    } finally {
        generalButtonState(submitBtn, 'idle');
    }
}

/**
 *  新增：檢查本月加班時數上限
 */
async function checkMonthlyOvertimeLimit(overtimeDate, requestHours) {
    try {
        const res = await callApifetch('getEmployeeOvertime');
        
        if (!res.ok) {
            return { withinLimit: true, currentHours: 0, exceeded: 0 };
        }
        
        // 計算申請月份已核准的加班時數
        const requestMonth = overtimeDate.substring(0, 7); // "YYYY-MM"
        
        const approvedThisMonth = res.requests.filter(req => {
            const reqMonth = req.overtimeDate.substring(0, 7);
            const status = String(req.status).toLowerCase().trim();
            return reqMonth === requestMonth && status === 'approved';
        });
        
        const currentHours = approvedThisMonth.reduce((sum, req) => {
            return sum + (parseFloat(req.hours) || 0);
        }, 0);
        
        const totalAfterRequest = currentHours + requestHours;
        const exceeded = Math.max(0, totalAfterRequest - MAX_MONTHLY_OVERTIME);
        
        return {
            withinLimit: totalAfterRequest <= MAX_MONTHLY_OVERTIME,
            currentHours: currentHours,
            totalAfterRequest: totalAfterRequest,
            exceeded: exceeded
        };
        
    } catch (error) {
        console.error('檢查加班上限失敗:', error);
        return { withinLimit: true, currentHours: 0, exceeded: 0 };
    }
}

/**
 *  新增：顯示補休時數輸入欄位
 */
function showCompensatoryHoursInput(currentHours, requestHours, exceededHours) {
    const formHtml = `
        <div id="compensatory-hours-form" class="mt-4 p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-lg">
            <h3 class="text-lg font-bold text-orange-800 dark:text-orange-300 mb-3">
                 ${escapeHtml(t('OT_LIMIT_TITLE'))}
            </h3>
            
            <div class="space-y-2 mb-4 text-sm">
                <p class="text-orange-700 dark:text-orange-400">
                    <strong>${escapeHtml(t('OT_THIS_MONTH_APPROVED'))}</strong>${escapeHtml(t('HOURS_N', { n: currentHours.toFixed(1) }))}
                </p>
                <p class="text-orange-700 dark:text-orange-400">
                    <strong>${escapeHtml(t('OT_THIS_REQUEST'))}</strong>${escapeHtml(t('HOURS_N', { n: requestHours.toFixed(1) }))}
                </p>
                <p class="text-orange-700 dark:text-orange-400">
                    <strong>${escapeHtml(t('OT_TOTAL'))}</strong>${escapeHtml(t('HOURS_N', { n: (currentHours + requestHours).toFixed(1) }))}
                </p>
                <p class="text-red-700 dark:text-red-400 font-bold">
                    <strong>${escapeHtml(t('OT_EXCEEDED'))}</strong>${escapeHtml(t('HOURS_N', { n: exceededHours.toFixed(1) }))}
                </p>
            </div>
            
            <div class="bg-white dark:bg-gray-800 rounded-lg p-3 mb-4">
                <label for="compensatory-hours" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    ${escapeHtml(t('OT_COMP_HOURS'))} <span class="text-red-500">*</span>
                </label>
                <input type="number" 
                       id="compensatory-hours" 
                       step="0.5" 
                       min="0" 
                       max="${exceededHours.toFixed(1)}"
                       value="${exceededHours.toFixed(1)}"
                       class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white">
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    ${escapeHtml(t('OT_COMP_SUGGEST', { hours: exceededHours.toFixed(1) }))}
                </p>
            </div>
            
            <div class="grid grid-cols-2 gap-3">
                <button id="cancel-compensatory-btn" 
                        class="py-2 px-4 rounded-lg font-bold bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200">
                    ${escapeHtml(t('BTN_CANCEL'))}
                </button>
                <button id="confirm-compensatory-btn" 
                        class="py-2 px-4 rounded-lg font-bold btn-primary">
                    ${escapeHtml(t('CONFIRM_SUBMIT'))}
                </button>
            </div>
        </div>
    `;
    
    // 插入表單
    const submitBtn = document.getElementById('submit-overtime-btn');
    const parentDiv = submitBtn.parentElement;
    
    let formContainer = document.getElementById('compensatory-hours-form');
    if (formContainer) {
        formContainer.remove();
    }
    
    parentDiv.insertAdjacentHTML('afterend', formHtml);
    
    // 綁定取消按鈕
    document.getElementById('cancel-compensatory-btn').addEventListener('click', () => {
        document.getElementById('compensatory-hours-form').remove();
    });
    
    // 綁定確認按鈕
    document.getElementById('confirm-compensatory-btn').addEventListener('click', () => {
        const compensatoryHours = parseFloat(document.getElementById('compensatory-hours').value) || 0;
        
        if (compensatoryHours < 0) {
            showNotification(t('NOTIF_COMP_HOURS_NEGATIVE'), 'error');
            return;
        }
        
        if (compensatoryHours > exceededHours) {
            showNotification(t('NOTIF_COMP_HOURS_EXCEED', { hours: exceededHours.toFixed(1) }), 'error');
            return;
        }
        
        // 提交加班申請（含補休時數）
        const dateInput = document.getElementById('overtime-date');
        const startTimeInput = document.getElementById('overtime-start-time');
        const endTimeInput = document.getElementById('overtime-end-time');
        const hoursInput = document.getElementById('overtime-hours');
        const reasonInput = document.getElementById('overtime-reason');
        
        submitOvertimeRequest(
            dateInput.value,
            startTimeInput.value,
            endTimeInput.value,
            parseFloat(hoursInput.value),
            reasonInput.value,
            compensatoryHours
        );
        
        document.getElementById('compensatory-hours-form').remove();
    });
}

// ==================== 管理員審核功能 ====================

async function loadPendingOvertimeRequests() {
    if (typeof loadAdminPendingCounts === 'function') loadAdminPendingCounts();  // 管理員頁「審核」的數字跟著更新
    //  Promise 單例：若已有進行中的請求，直接返回同一個 Promise（不重跑）
    // boolean 鎖在 await 之前就被跳過了（JS 是單執行緒，但 await 讓出控制權時鎖已設好）
    // 真正的問題是：兩次呼叫同時在事件循環佇列中，第一個 await 前鎖還沒設
    // Promise 單例確保無論呼叫幾次，都只執行一次 API
    if (_pendingOvertimePromise) {
        console.log(' loadPendingOvertimeRequests 已在執行，跳過重複呼叫');
        return _pendingOvertimePromise;
    }

    _pendingOvertimePromise = _doLoadPendingOvertime();
    try {
        await _pendingOvertimePromise;
    } finally {
        _pendingOvertimePromise = null;
    }
}

async function _doLoadPendingOvertime() {
    const requestsList = document.getElementById('pending-overtime-list');
    const requestsEmpty = document.getElementById('overtime-requests-empty');
    const requestsLoading = document.getElementById('overtime-requests-loading');

    if (!requestsList || !requestsEmpty || !requestsLoading) return;

    requestsList.innerHTML = '';  //  強制清空
    requestsLoading.style.display = 'block';
    requestsEmpty.style.display = 'none';
    
    try {
        const res = await callApifetch('getPendingOvertime');
        requestsLoading.style.display = 'none';
        if (res.ok && res.requests && res.requests.length > 0) {
            //  前端去重：同一個 rowNumber 只保留一筆
            const seen = new Set();
            const uniqueRequests = res.requests.filter(req => {
                const key = req.rowNumber || (req.overtimeDate + '_' + req.startTime + '_' + req.employeeId);
                if (seen.has(key)) {
                    console.warn(' 過濾重複記錄:', key);
                    return false;
                }
                seen.add(key);
                return true;
            });
            console.log(`載入待審核: 原始 ${res.requests.length} 筆 → 去重後 ${uniqueRequests.length} 筆`);
            await renderPendingOvertimeRequests(uniqueRequests, requestsList);
        } else {
            requestsEmpty.style.display = 'block';
        }
    } catch (err) {
        requestsLoading.style.display = 'none';
        showNotification(t('ERROR_LOAD_OVERTIME') || '載入失敗', 'error');
    }
}

/**
 * 渲染待審核列表
 */
async function renderPendingOvertimeRequests(requests, container) {
    container.innerHTML = '';
    
    if (typeof prefetchAttachments === 'function') {
        await prefetchAttachments('overtime', requests.map(r => buildAttachmentKey('overtime', {
            employeeId: r.employeeId,
            overtimeDate: r.overtimeDate || r.date,
            startTime: r.startTime
        })));
    }
    
    requests.forEach(req => {
        const li = document.createElement('li');
        li.className = 'p-4 bg-gray-50 dark:bg-gray-700 rounded-lg';
        
        // 格式化時間顯示
        const startTime = formatTimeDisplay(req.startTime);
        const endTime = formatTimeDisplay(req.endTime);
        const hours = parseFloat(req.hours) || 0;
        
        console.log(`渲染待審核: 行號=${req.rowNumber}, 時間=${startTime}-${endTime}, 時數=${hours}`);
        
        li.innerHTML = `
            <div class="space-y-2">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-semibold text-gray-800 dark:text-white">${escapeHtml(req.employeeName)}</p>
                        <p class="text-sm text-gray-600 dark:text-gray-400">
                            ${req.overtimeDate} | ${startTime} - ${endTime}
                        </p>
                        <p class="text-sm text-indigo-600 dark:text-indigo-400">
                            <strong data-i18n="OVERTIME_HOURS_LABEL">加班時數：</strong>${escapeHtml(t('HOURS_N', { n: hours }))}
                        </p>
                    </div>
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                    <strong data-i18n="OVERTIME_REASON_LABEL">申請原因：</strong>${escapeHtml(req.reason)}
                </p>
                <div class="flex space-x-2 mt-3">
                    <button 
                        data-i18n="ADMIN_APPROVE_BUTTON" 
                        data-row="${req.rowNumber}" 
                        class="approve-overtime-btn flex-1 px-3 py-2 rounded-md text-sm font-bold btn-primary">
                        核准
                    </button>
                    <button 
                        data-i18n="ADMIN_REJECT_BUTTON" 
                        data-row="${req.rowNumber}" 
                        class="reject-overtime-btn flex-1 px-3 py-2 rounded-md text-sm font-bold btn-warning">
                        拒絕
                    </button>
                </div>
            </div>
        `;
        
        // 加班佐證（工作照片、主管信件等）
        if (typeof renderAttachments === 'function') {
            const box = document.createElement('div');
            box.className = 'mt-2';
            li.appendChild(box);

            const key = buildAttachmentKey('overtime', {
                employeeId: req.employeeId || '',
                overtimeDate: req.overtimeDate || req.date,
                startTime: req.startTime
            });
            renderAttachments(box, 'overtime', key, { canUpload: false });
        }

        container.appendChild(li);
        renderTranslations(li);
    });

    
    // 綁定審核按鈕事件
    container.querySelectorAll('.approve-overtime-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleOvertimeReview(e.currentTarget, 'approve'));
    });
    
    container.querySelectorAll('.reject-overtime-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleOvertimeReview(e.currentTarget, 'reject'));
    });
}

async function handleOvertimeReview(button, action) {
    const rowNumber = button.dataset.row;
    const loadingText = t('LOADING') || '處理中...';
    
    //  禁用同一列所有按鈕，防止重複點擊
    const parentLi = button.closest('li');
    const allBtnsInRow = parentLi ? parentLi.querySelectorAll('button') : [button];
    allBtnsInRow.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    });
    
    generalButtonState(button, 'processing', loadingText);
    
    let comment = '';
    if (action === 'reject') {
        comment = prompt(t('OVERTIME_REJECT_REASON_PROMPT') || '請輸入拒絕原因（選填）') || '';
    }
    
    try {
        const res = await callApifetch(
            `reviewOvertime&rowNumber=${rowNumber}&reviewAction=${action}&comment=${encodeURIComponent(comment)}`
        );
        
        if (res.ok) {
            const successMsg = action === 'approve' 
                ? (t('OVERTIME_APPROVED') || '已核准加班申請') 
                : (t('OVERTIME_REJECTED') || '已拒絕加班申請');
            showNotification(successMsg, 'success');
            
            //  直接移除該列（不重新載入整個列表，避免競態重複）
            if (parentLi) {
                parentLi.style.transition = 'opacity 0.3s';
                parentLi.style.opacity = '0';
                setTimeout(() => {
                    parentLi.remove();
                    const requestsList = document.getElementById('pending-overtime-list');
                    const requestsEmpty = document.getElementById('overtime-requests-empty');
                    if (requestsList && requestsList.children.length === 0) {
                        if (requestsEmpty) requestsEmpty.style.display = 'block';
                    }
                }, 300);
            }
        } else {
            showNotification(t(res.code) || res.msg || '審核失敗', 'error');
            allBtnsInRow.forEach(btn => {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            });
            generalButtonState(button, 'idle');
        }
    } catch (err) {
        console.error('審核錯誤:', err);
        showNotification(t('NETWORK_ERROR') || '網路錯誤', 'error');
        allBtnsInRow.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        });
        generalButtonState(button, 'idle');
    }
}

/**
 * 控制按鈕的載入狀態
 * @param {HTMLElement} button - 按鈕元素
 * @param {string} state - 'processing' 或 'idle'
 * @param {string} loadingText - 處理中顯示的文字
 */
// generalButtonState 已移到 utils.js

/**
 *  快速申請加班（從每日記錄觸發）
 * @param {string} date - 加班日期 (YYYY-MM-DD)
 * @param {string} startTime - 開始時間 (HH:mm)
 * @param {string} endTime - 結束時間 (HH:mm)
 * @param {number} hours - 加班時數
 */
function quickApplyOvertime(date, startTime, endTime, hours) {
    console.log(' 快速申請加班:', { date, startTime, endTime, hours });
    
    // 切換到加班頁籤
    switchTab('overtime-view');
    
    // 等待頁面切換完成後填入表單
    setTimeout(() => {
        const dateInput = document.getElementById('overtime-date');
        const startTimeInput = document.getElementById('overtime-start-time');
        const endTimeInput = document.getElementById('overtime-end-time');
        const hoursInput = document.getElementById('overtime-hours');
        const reasonInput = document.getElementById('overtime-reason');
        
        // 自動填入表單
        if (dateInput) dateInput.value = date;
        if (startTimeInput) startTimeInput.value = startTime;
        if (endTimeInput) endTimeInput.value = endTime;
        if (hoursInput) hoursInput.value = hours.toFixed(2);
        
        if (reasonInput) {
            reasonInput.value = `系統偵測到超時工作 ${hours.toFixed(2)} 小時（已扣除午休時間），申請加班`;
            
            // 聚焦到原因欄位，方便員工補充說明
            reasonInput.focus();
            
            // 將游標移到文字最後
            reasonInput.setSelectionRange(reasonInput.value.length, reasonInput.value.length);
        }
        
        // 滾動到表單頂部
        const overtimeView = document.getElementById('overtime-view');
        if (overtimeView) {
            overtimeView.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }
        
        // 顯示提示
        showNotification(
            `已自動填入加班申請表單（${hours.toFixed(2)} 小時），請確認後提交`, 
            'success'
        );
        
    }, 300); // 延遲 300ms 確保頁面已切換
}