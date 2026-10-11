// leave.js - 請假系統前端邏輯（無時段限制版）

//  添加全域標記
let leaveTabInitialized = false;
let leaveEventsBound = false;

/**
 * 初始化請假頁籤（防重複版）
 */
async function initLeaveTab() {
    console.log(' initLeaveTab 被調用');
    
    if (leaveTabInitialized) {
        console.log('⏭ 請假系統已初始化，跳過');
        return;
    }
    
    console.log(' 開始初始化請假系統...');
    
    leaveTabInitialized = true;
    
    try {
        // 計算請假時數要跳過國定假日，清單有快取不會每次都打 API
        await loadNationalHolidays();
        await loadLeaveBalance();
        await loadLeaveRecords();
        bindLeaveEventListeners();
        
        console.log(' 請假系統初始化完成');
    } catch (error) {
        console.error(' 請假系統初始化失敗:', error);
        leaveTabInitialized = false;
    }
}

/**
 * 綁定請假相關事件（防重複版）
 */
function bindLeaveEventListeners() {
    if (leaveEventsBound) {
        console.log('⏭ 事件監聽器已綁定，跳過');
        return;
    }
    
    console.log(' 綁定事件監聽器...');
    
    const leaveTypeSelect = document.getElementById('leave-type');
    if (leaveTypeSelect) {
        leaveTypeSelect.addEventListener('change', handleLeaveTypeChange);
    }
    
    const startInput = document.getElementById('leave-start-datetime');
    const endInput = document.getElementById('leave-end-datetime');
    
    if (startInput) {
        startInput.addEventListener('change', updateWorkHoursPreview);
        console.log(' 已綁定開始時間事件');
    }
    
    if (endInput) {
        endInput.addEventListener('change', updateWorkHoursPreview);
        console.log(' 已綁定結束時間事件');
    }
    
    leaveEventsBound = true;
}

/**
 * 重置初始化狀態（用於手動刷新）
 */
function resetLeaveTab() {
    console.log(' 重置請假系統狀態');
    leaveTabInitialized = false;
    leaveEventsBound = false;
}

/**
 * 手動刷新請假數據（不重新綁定事件）
 */
async function refreshLeaveData() {
    console.log(' 手動刷新請假數據...');
    await loadLeaveBalance();
    await loadLeaveRecords();
}

/**
 *  計算請假時數
 *
 * 只計算落在「工作時段」內的時間，並跳過非工作日（週六日與國定假日）。
 * 舊版是用牆上時鐘的時間差再扣午休，所以 9/9 08:30 到 9/11 17:30 會算成 54 小時
 * （把兩個晚上也算進去），實際上三天事假應該是 3 × 8 = 24 小時。
 *
 * 工作時段由管理員在網頁版的「工作時段設定」調整，實際值存在後端「系統設定」
 * 工作表；worktime.js 會把它寫進 API_CONFIG.workSchedule，這裡每次計算都即時讀取，
 * 所以前端預覽會跟後端實扣一致。config.js 的值只是還沒取得設定前的預設值。
 */
function toMinutesOfDay(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

function workScheduleConfig() {
    const cfg = (typeof API_CONFIG !== 'undefined' && API_CONFIG.workSchedule) || {};
    return {
        start: toMinutesOfDay(cfg.start || '08:30'),
        end: toMinutesOfDay(cfg.end || '17:30'),
        lunchStart: toMinutesOfDay(cfg.lunchStart || '12:00'),
        lunchEnd: toMinutesOfDay(cfg.lunchEnd || '13:00')
    };
}

function calculateWorkHours(startTime, endTime) {
    if (!startTime || !endTime) {
        return 0;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.error(' 無效的日期格式');
        return 0;
    }

    if (end <= start) {
        console.error(' 結束時間必須晚於開始時間');
        return 0;
    }

    const cfg = workScheduleConfig();
    const overlap = (aStart, aEnd, bStart, bEnd) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

    let totalMinutes = 0;
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    while (cursor <= lastDay) {
        const dateStr = toLocalDateStr(cursor);

        // 例假日與國定假日不計入請假時數（holidays.js 提供清單，抓不到時只看星期）
        if (typeof isNonWorkingDay === 'function' && isNonWorkingDay(dateStr)) {
            cursor.setDate(cursor.getDate() + 1);
            continue;
        }

        // 這一天請假區間與工作時段的交集（都換算成當天的分鐘數）
        const dayStart = new Date(cursor);
        const dayEnd = new Date(cursor);
        dayEnd.setHours(23, 59, 59, 999);

        const from = start > dayStart ? start : dayStart;
        const to = end < dayEnd ? end : dayEnd;
        if (to <= from) {
            cursor.setDate(cursor.getDate() + 1);
            continue;
        }

        const fromMin = from.getHours() * 60 + from.getMinutes();
        const toMin = to.getHours() * 60 + to.getMinutes() + (to.getSeconds() >= 59 ? 1 : 0);

        let minutes = overlap(fromMin, toMin, cfg.start, cfg.end);
        // 午休不算請假
        minutes -= overlap(Math.max(fromMin, cfg.start), Math.min(toMin, cfg.end), cfg.lunchStart, cfg.lunchEnd);

        totalMinutes += Math.max(0, minutes);
        cursor.setDate(cursor.getDate() + 1);
    }

    const finalHours = Math.round((totalMinutes / 60) * 100) / 100;
    console.log(`    請假時數: ${finalHours} 小時`);
    return finalHours;
}

/**
 * 更新工時預覽（即時顯示）
 */
function updateWorkHoursPreview() {
    console.log(' updateWorkHoursPreview 被觸發');
    
    const startTime = document.getElementById('leave-start-datetime').value;
    const endTime = document.getElementById('leave-end-datetime').value;
    const previewEl = document.getElementById('work-hours-preview');
    const hoursEl = document.getElementById('calculated-hours');
    const warningEl = document.getElementById('work-hours-warning');
    
    console.log(' 輸入值:', {
        startTime: startTime,
        endTime: endTime
    });
    
    // 如果沒有輸入，隱藏預覽
    if (!startTime || !endTime) {
        console.log(' 開始或結束時間為空');
        if (previewEl) previewEl.classList.add('hidden');
        return;
    }
    
    // 計算工時
    const workHours = calculateWorkHours(startTime, endTime);
    
    console.log(' 計算結果:', workHours, '小時');
    
    // 顯示預覽區塊
    if (previewEl) previewEl.classList.remove('hidden');
    if (hoursEl) hoursEl.textContent = workHours;
    
    // 清除之前的警告
    if (warningEl) {
        warningEl.classList.add('hidden');
        warningEl.textContent = '';
    }
    
    // 檢查各種錯誤情況
    let hasError = false;
    let errorMsg = '';
    
    if (workHours <= 0) {
        hasError = true;
        errorMsg = t('LEAVE_ERR_END_BEFORE_START');
    } else if (!Number.isInteger(workHours)) {
        hasError = true;
        errorMsg = t('LEAVE_ERR_WHOLE_HOURS', { hours: workHours });
    }
    
    // 顯示警告訊息
    if (hasError) {
        if (warningEl) {
            warningEl.classList.remove('hidden');
            warningEl.classList.remove('text-green-600', 'dark:text-green-400');
            warningEl.classList.add('text-red-600', 'dark:text-red-400');
            warningEl.textContent = errorMsg;
        }
        if (hoursEl) {
            hoursEl.classList.add('text-red-600', 'dark:text-red-400');
            hoursEl.classList.remove('text-blue-800', 'dark:text-blue-300');
        }
    } else {
        // 顯示成功狀態
        if (hoursEl) {
            hoursEl.classList.remove('text-red-600', 'dark:text-red-400');
            hoursEl.classList.add('text-blue-800', 'dark:text-blue-300');
        }
        
        // 顯示成功提示
        if (warningEl) {
            warningEl.classList.remove('hidden');
            warningEl.classList.remove('text-red-600', 'dark:text-red-400');
            warningEl.classList.add('text-green-600', 'dark:text-green-400');
            
            //  顯示時段資訊
            const start = new Date(startTime);
            const end = new Date(endTime);
            const startHour = start.getHours();
            const endHour = end.getHours();
            
            let timeInfo = '';
            if (startHour < 9 || endHour > 18) {
                timeInfo = t('LEAVE_NONSTANDARD_HOURS');
            }
            
            warningEl.textContent = t('LEAVE_HOURS_OK', { note: timeInfo });
        }
    }
}

/**
 * 快速選擇時段
 */
function quickSelectTimeRange(type) {
    console.log(' 快速選擇:', type);
    
    const now = new Date();
    const today = toLocalDateStr(now); // YYYY-MM-DD
    
    let startTime, endTime;
    
    switch(type) {
        case '1h':
            startTime = `${today}T09:00`;
            endTime = `${today}T10:00`;
            break;
            
        case '2h':
            startTime = `${today}T09:00`;
            endTime = `${today}T11:00`;
            break;
            
        case '4h':
            startTime = `${today}T13:00`;
            endTime = `${today}T17:00`;
            break;
            
        case '8h':
            startTime = `${today}T09:00`;
            endTime = `${today}T18:00`;
            break;
            
        default:
            console.error(' 未知的時段類型:', type);
            return;
    }
    
    console.log(' 設定時間:', { startTime, endTime });
    
    // 設定時間
    const startInput = document.getElementById('leave-start-datetime');
    const endInput = document.getElementById('leave-end-datetime');
    
    if (startInput) startInput.value = startTime;
    if (endInput) endInput.value = endTime;
    
    // 更新工時預覽
    updateWorkHoursPreview();
}

async function submitLeaveApplication() {
    console.log(' 開始提交請假申請');
    
    if (!validateLeaveForm()) {
        console.error(' 表單驗證失敗');
        return;
    }
    
    const leaveType = document.getElementById('leave-type').value;
    const startTime = document.getElementById('leave-start-datetime').value;
    const endTime = document.getElementById('leave-end-datetime').value;
    const reason = document.getElementById('leave-reason').value;
    const workHours = calculateWorkHours(startTime, endTime);
    
    console.log(' 提交資料:', {
        leaveType,
        startTime,
        endTime,
        workHours,
        reason
    });
    
    // 檢查假期餘額
    try {
        const balanceRes = await callApifetch('getLeaveBalance');
        
        if (balanceRes.ok && balanceRes.balance) {
            const availableHours = balanceRes.balance[leaveType] || 0;
            
            console.log(` 假期餘額檢查:`, {
                假別: leaveType,
                可用小時: availableHours,
                申請小時: workHours
            });
            
            if (workHours > availableHours) {
                showNotification(
                    t('LEAVE_BALANCE_SHORT', { type: t(leaveType), available: availableHours, requested: workHours }),
                    'error'
                );
                return;
            }
        }
    } catch (error) {
        console.error(' 檢查餘額失敗:', error);
    }
    
    const button = document.getElementById('submit-leave-btn');
    if (button) {
        button.disabled = true;
        button.textContent = t('LOADING');
    }
    
    try {
        const response = await callApifetch(
            `submitLeave&leaveType=${encodeURIComponent(leaveType)}` +
            `&startDateTime=${encodeURIComponent(startTime)}` +
            `&endDateTime=${encodeURIComponent(endTime)}` +
            `&reason=${encodeURIComponent(reason)}`
        );
        
        console.log(' 後端回應:', response);
        
        if (response.ok) {
            showNotification(t('NOTIF_LEAVE_SUBMITTED_HOURS', { hours: workHours }), 'success');
            
            // 清空表單
            document.getElementById('leave-type').value = '';
            document.getElementById('leave-start-datetime').value = '';
            document.getElementById('leave-end-datetime').value = '';
            document.getElementById('leave-reason').value = '';
            
            const previewEl = document.getElementById('work-hours-preview');
            if (previewEl) previewEl.classList.add('hidden');
            
            console.log(' 重新載入假期餘額...');
            await loadLeaveBalance();
            
            console.log(' 重新載入請假記錄...');
            await loadLeaveRecords();
            
            console.log(' 資料更新完成');
        } else {
            showNotification(response.msg || t('SUBMIT_FAILED'), 'error');
        }
    } catch (error) {
        console.error(' 提交請假申請失敗:', error);
        showNotification(t('NOTIF_NETWORK_ERROR_RETRY'), 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = t('BTN_SUBMIT_LEAVE');
        }
    }
}

/**
 * 驗證請假表單
 */
function validateLeaveForm() {
    const leaveType = document.getElementById('leave-type').value;
    const startTime = document.getElementById('leave-start-datetime').value;
    const endTime = document.getElementById('leave-end-datetime').value;
    const reason = document.getElementById('leave-reason').value;
    
    if (!leaveType) {
        showNotification(t('NOTIF_SELECT_LEAVE_TYPE'), 'error');
        return false;
    }
    
    if (!startTime) {
        showNotification(t('NOTIF_SELECT_START_TIME'), 'error');
        return false;
    }
    
    if (!endTime) {
        showNotification(t('NOTIF_SELECT_END_TIME'), 'error');
        return false;
    }
    
    // 檢查是否為整點時間
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    if (start.getMinutes() !== 0 || start.getSeconds() !== 0) {
        showNotification(t('NOTIF_START_TIME_ON_HOUR'), 'error');
        return false;
    }
    
    if (end.getMinutes() !== 0 || end.getSeconds() !== 0) {
        showNotification(t('NOTIF_END_TIME_ON_HOUR'), 'error');
        return false;
    }
    
    if (!reason.trim() || reason.trim().length < 2) {
        showNotification(t('NOTIF_LEAVE_REASON_2'), 'error');
        return false;
    }
    
    const workHours = calculateWorkHours(startTime, endTime);
    
    if (workHours <= 0) {
        showNotification(t('NOTIF_LEAVE_HOURS_POSITIVE'), 'error');
        return false;
    }
    
    if (!Number.isInteger(workHours)) {
        showNotification(t('NOTIF_LEAVE_HOURS_INTEGER', { hours: workHours }), 'error');
        return false;
    }
    
    return true;
}

/**
 * 載入假期餘額
 */
async function loadLeaveBalance() {
    const loadingEl = document.getElementById('leave-balance-loading');
    
    console.log(' 開始載入假期餘額...');
    
    if (loadingEl) loadingEl.style.display = 'block';
    
    try {
        const res = await callApifetch('getLeaveBalance');
        
        console.log(' 後端返回的假期餘額:', res);
        
        if (res.ok && res.balance) {
            console.log(' 假期餘額數據:', res.balance);
            renderLeaveBalance(res.balance);
        } else {
            console.error(' 載入假期餘額失敗:', res);
        }
    } catch (err) {
        console.error(' 載入假期餘額錯誤:', err);
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        console.log(' 假期餘額載入完成');
    }
}

/**
 * 渲染假期餘額
 */
function renderLeaveBalance(balance) {
    const listEl = document.getElementById('leave-balance-list');
    if (!listEl) return;
    
    console.log(' 開始渲染假期餘額:', balance);
    
    listEl.innerHTML = '';
    
    const leaveOrder = [
        'ANNUAL_LEAVE', 'COMP_TIME_OFF', 'PERSONAL_LEAVE', 'SICK_LEAVE',
        'HOSPITALIZATION_LEAVE', 'BEREAVEMENT_LEAVE', 'MARRIAGE_LEAVE',
        'PATERNITY_LEAVE', 'MATERNITY_LEAVE', 'OFFICIAL_LEAVE',
        'WORK_INJURY_LEAVE', 'ABSENCE_WITHOUT_LEAVE', 'NATURAL_DISASTER_LEAVE',
        'FAMILY_CARE_LEAVE', 'MENSTRUAL_LEAVE'
    ];
    
    leaveOrder.forEach(leaveType => {
        if (balance[leaveType] !== undefined) {
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg';
            
            const typeSpan = document.createElement('span');
            typeSpan.className = 'font-medium text-gray-800 dark:text-white';
            typeSpan.textContent = t(leaveType);
            
            const hours = balance[leaveType];
            
            const hoursSpan = document.createElement('span');
            hoursSpan.className = leaveType === 'ABSENCE_WITHOUT_LEAVE' 
                ? 'text-red-600 dark:text-red-400 font-bold'
                : 'text-indigo-600 dark:text-indigo-400 font-bold';
            hoursSpan.textContent = t('HOURS_N', { n: hours });
            
            item.appendChild(typeSpan);
            item.appendChild(hoursSpan);
            listEl.appendChild(item);
        }
    });
    
    console.log(' 假期餘額渲染完成');
}

/**
 * 載入請假紀錄
 */
async function loadLeaveRecords() {
    const userId = localStorage.getItem('sessionUserId');
    const loadingEl = document.getElementById('leave-records-loading');
    const emptyEl = document.getElementById('leave-records-empty');
    const listEl = document.getElementById('leave-records-list');
    
    console.log(' 開始載入請假記錄...');
    
    try {
        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        if (listEl) listEl.innerHTML = '';
        
        const res = await callApifetch(`getEmployeeLeaveRecords&employeeId=${userId}`);
        
        console.log(' 後端返回的請假記錄:', res);
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (res.ok && res.records && res.records.length > 0) {
            console.log(` 獲取到 ${res.records.length} 筆記錄`);
            
            const uniqueRecords = [];
            const seenIds = new Set();
            
            res.records.forEach(record => {
                const uniqueKey = record.rowNumber || 
                    `${record.leaveType}_${record.startDateTime}_${record.endDateTime}_${record.reason}`;
                
                if (!seenIds.has(uniqueKey)) {
                    seenIds.add(uniqueKey);
                    uniqueRecords.push(record);
                } else {
                    console.warn(' 發現重複記錄:', record);
                }
            });
            
            console.log(` 去重後剩餘 ${uniqueRecords.length} 筆記錄`);
            await renderLeaveRecords(uniqueRecords);
        } else {
            console.log('ℹ 沒有請假記錄');
            if (emptyEl) emptyEl.style.display = 'block';
        }
    } catch (error) {
        console.error(' 載入請假紀錄失敗:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
    }
}

/**
 * 格式化日期時間顯示
 */
function formatDateTime(isoString) {
    if (!isoString) return t('NOT_SET');
    
    try {
        const date = new Date(isoString);
        
        if (isNaN(date.getTime())) return isoString;
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (error) {
        console.error(' 日期格式化失敗:', error);
        return isoString;
    }
}

/**
 * 渲染請假記錄
 */
async function renderLeaveRecords(records) {
    const listEl = document.getElementById('leave-records-list');
    if (!listEl) return;
    
    // 整頁的附件一次抓完，不要每筆各打一次 API
    if (typeof prefetchAttachments === 'function') {
        await prefetchAttachments('leave', records.map(r => buildAttachmentKey('leave', {
            employeeId: r.employeeId || userId,
            startDateTime: r.startDateTime || r.startTime
        })));
    }
    
    console.log(` 開始渲染 ${records.length} 筆請假記錄`);
    
    listEl.innerHTML = '';
    
    records.forEach((record, index) => {
        const card = document.createElement('div');
        card.className = 'card p-4 hover:shadow-lg transition-shadow';
        
        let statusClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        let statusText = t('PENDING');
        
        if (record.status === 'APPROVED') {
            statusClass = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            statusText = t('APPROVED');
        } else if (record.status === 'REJECTED') {
            statusClass = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            statusText = t('REJECTED');
        }
        
        const workHoursDisplay = t('HOURS_N', { n: record.workHours || 0 });
        const startTime = formatDateTime(record.startDateTime || record.startTime);
        const endTime = formatDateTime(record.endDateTime || record.endTime);
        
        if (index === 0) {
            console.log(' 記錄範例:', {
                leaveType: record.leaveType,
                startDateTime: record.startDateTime,
                endDateTime: record.endDateTime,
                workHours: record.workHours,
                status: record.status
            });
        }
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <h3 class="font-bold text-lg text-gray-800 dark:text-white">
                    ${t(record.leaveType)}
                </h3>
                <span class="px-3 py-1 rounded-full text-sm font-medium ${statusClass}">
                    ${statusText}
                </span>
            </div>
            
            <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <div class="flex items-center">
                    <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
                    </svg>
                    <span>${startTime} ~ ${endTime}</span>
                </div>
                
                <div class="flex items-center">
                    <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                    </svg>
                    <span class="font-medium text-indigo-600 dark:text-indigo-400">
                        ${workHoursDisplay}
                    </span>
                </div>
                
                <div class="flex items-start">
                    <svg class="w-4 h-4 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                    </svg>
                    <span>${escapeHtml(t('LEAVE_REASON_LABEL_SHORT'))}</span>
                    <span class="ml-1">${escapeHtml(record.reason || t('NONE'))}</span>
                </div>
            </div>
        `;
        
        // 附件（診斷證明之類）。待審核的才可以再加或刪，已審完的只能看。
        if (typeof renderAttachments === 'function') {
            const box = document.createElement('div');
            box.className = 'mt-3';
            card.appendChild(box);

            const key = buildAttachmentKey('leave', {
                employeeId: record.employeeId || userId,
                startDateTime: record.startDateTime || record.startTime
            });
            renderAttachments(box, 'leave', key, { canUpload: record.status === 'PENDING' });
        }

        listEl.appendChild(card);
    });
    
    console.log(` 渲染完成，共 ${records.length} 筆記錄`);
}

/**
 * 處理請假類型變更
 */
function handleLeaveTypeChange(e) {
    console.log('請假類型變更:', e.target.value);
}

/**
 * 載入待審核的請假申請（管理員用）
 */
async function loadPendingLeaveRequests() {
    if (typeof loadAdminPendingCounts === 'function') loadAdminPendingCounts();  // 管理員頁「審核」的數字跟著更新
    const loadingEl = document.getElementById('leave-requests-loading');
    const emptyEl = document.getElementById('leave-requests-empty');
    const listEl = document.getElementById('pending-leave-list');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (listEl) listEl.innerHTML = '';
    
    try {
        const res = await callApifetch('getPendingLeaveRequests');
        
        if (res.ok) {
            if (res.requests && res.requests.length > 0) {
                await renderPendingLeaveRequests(res.requests);
            } else {
                if (emptyEl) emptyEl.style.display = 'block';
            }
        }
    } catch (err) {
        console.error('載入待審核請假失敗:', err);
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

async function renderPendingLeaveRequests(requests) {
    if (typeof prefetchAttachments === 'function') {
        await prefetchAttachments('leave', requests.map(r => buildAttachmentKey('leave', {
            employeeId: r.employeeId,
            startDateTime: r.startDateTime || r.startTime
        })));
    }

    const listEl = document.getElementById('pending-leave-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    
    requests.forEach(req => {
        const li = document.createElement('li');
        li.className = 'p-4 bg-gray-50 dark:bg-gray-700 rounded-lg';
        
        const timeDisplay = req.startDateTime && req.endDateTime
            ? `${formatDateTime(req.startDateTime)} ~ ${formatDateTime(req.endDateTime)}`
            : req.startDate && req.endDate
            ? `${req.startDate} ~ ${req.endDate}`
            : t('LEAVE_TIME_NOT_SET');
        
        const durationDisplay = req.workHours
            ? t('HOURS_N', { n: req.workHours })
            : req.days
            ? t('DAYS_N', { n: req.days })
            : t('LEAVE_DURATION_UNKNOWN');
        
        const balanceWarning = req.insufficientBalance 
            ? `<p class="text-xs text-red-600 dark:text-red-400 mt-2 font-semibold">
                    ${escapeHtml(t('LEAVE_EMPLOYEE_SHORT', { n: req.remainingBalance }))}
               </p>`
            : '';
        
        li.innerHTML = `
            <div class="flex flex-col space-y-2">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <p class="font-semibold text-gray-800 dark:text-white">
                            ${escapeHtml(req.employeeName)} - ${t(req.leaveType)}
                        </p>
                        <p class="text-sm text-gray-600 dark:text-gray-400">
                            ${timeDisplay}
                        </p>
                        <p class="text-xs text-gray-500 mt-1">
                            ${durationDisplay}
                        </p>
                        ${req.reason ? `
                            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                ${escapeHtml(t('REASON_LABEL'))}：${escapeHtml(req.reason)}
                            </p>
                        ` : ''}
                        ${balanceWarning}
                    </div>
                </div>
                
                <div class="flex space-x-2 mt-2">
                    <button 
                        data-row="${req.rowNumber}" 
                        class="approve-leave-btn flex-1 px-3 py-2 rounded-md text-sm font-bold btn-primary">
                        ${escapeHtml(t('ADMIN_APPROVE_BUTTON'))}
                    </button>
                    <button 
                        data-row="${req.rowNumber}" 
                        class="reject-leave-btn flex-1 px-3 py-2 rounded-md text-sm font-bold btn-warning">
                        ${escapeHtml(t('ADMIN_REJECT_BUTTON'))}
                    </button>
                </div>
            </div>
        `;
        
        // 審核者要看得到附件才有依據，但不該替別人加或刪
        if (typeof renderAttachments === 'function') {
            const box = document.createElement('div');
            box.className = 'mt-2';
            li.appendChild(box);

            const key = buildAttachmentKey('leave', {
                employeeId: req.employeeId,
                startDateTime: req.startDateTime || req.startTime
            });
            renderAttachments(box, 'leave', key, { canUpload: false });
        }

        listEl.appendChild(li);
    });
    
    listEl.querySelectorAll('.approve-leave-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleReviewLeave(e.currentTarget, 'approve'));
    });
    
    listEl.querySelectorAll('.reject-leave-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleReviewLeave(e.currentTarget, 'reject'));
    });
}

/**
 * 處理請假審核
 */
async function handleReviewLeave(button, action) {
    const rowNumber = button.dataset.row;
    
    const comment = action === 'reject' 
        ? prompt(t('ENTER_REJECT_REASON')) 
        : '';
    
    if (action === 'reject' && !comment) {
        showNotification(t('NOTIF_REJECT_REASON_REQUIRED'), 'warning');
        return;
    }
    
    button.disabled = true;
    button.textContent = t('LOADING');
    
    try {
        const res = await callApifetch(
            `reviewLeave&rowNumber=${rowNumber}` +
            `&reviewAction=${action}` +
            `&comment=${encodeURIComponent(comment || '')}`
        );
        
        if (res.ok) {
            showNotification(action === 'approve' ? t('APPROVED') : t('REJECTED'), 'success');
            await new Promise(resolve => setTimeout(resolve, 500));
            loadPendingLeaveRequests();
        } else {
            showNotification(t('NOTIF_REVIEW_FAILED'), 'error');
        }
    } catch (err) {
        console.error('審核請假失敗:', err);
        showNotification(t('NOTIF_NETWORK_ERROR'), 'error');
    } finally {
        button.disabled = false;
        button.textContent = action === 'approve' ? t('ADMIN_APPROVE_BUTTON') : t('ADMIN_REJECT_BUTTON');
    }
}