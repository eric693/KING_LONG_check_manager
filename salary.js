// salary.js - 薪資管理前端邏輯（完整版 v2.0 - 含所有津貼與扣款）
// ==================== 檢查依賴 ====================
if (typeof callApifetch !== 'function') {
    console.error(' callApifetch 函數未定義，請確認 script.js 已正確載入');
}

// ==================== 初始化薪資頁面 ====================

/**
 *  初始化薪資頁面（完整版 + 多語言）
 */
async function initSalaryTab() {
    try {
        console.log(' 開始初始化薪資頁面（完整版 v2.0 + 多語言）');
        
        // 步驟 0：載入翻譯
        await loadTranslations(currentLang);
        
        // 步驟 1：驗證 Session
        console.log(' 正在驗證 Session...');
        const session = await callApifetch("checkSession");
        
        if (!session.ok || !session.user) {
            console.error(' Session 驗證失敗:', session);
            showNotification(t('SALARY_LOGIN_REQUIRED'), 'error');
            return;
        }
        
        console.log(' Session 驗證成功');
        console.log(' 使用者:', session.user.name);
        console.log(' 權限:', session.user.dept);
        console.log(' 員工ID:', session.user.userId);
        
        // 步驟 2：設定當前月份
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        console.log(' 當前月份:', currentMonth);
        
        const employeeSalaryMonth = document.getElementById('employee-salary-month');
        if (employeeSalaryMonth) {
            employeeSalaryMonth.value = currentMonth;
        }
        
        // 步驟 3：載入薪資資料
        console.log(' 開始載入薪資資料...');
        await loadCurrentEmployeeSalary();
        
        console.log(' 開始載入薪資歷史...');
        await loadSalaryHistory();
        
        // 步驟 4：綁定事件（管理員才需要）
        if (session.user.dept === "管理員") {
            console.log(' 綁定管理員功能...');
            bindSalaryEvents();
        }
        
        console.log(' 薪資頁面初始化完成（完整版 v2.0 + 多語言）！');
        
    } catch (error) {
        console.error(' 初始化失敗:', error);
        console.error('錯誤堆疊:', error.stack);
        showNotification(t('SALARY_INIT_FAILED') + ': ' + error.message, 'error');
    }
}
// ==================== 員工薪資功能 ====================

/**
 *  載入當前員工的薪資（簡化版 - 後端自動計算）
 */
async function loadCurrentEmployeeSalary() {
    try {
        console.log(` 載入員工薪資`);
        
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const loadingEl = document.getElementById('current-salary-loading');
        const emptyEl = document.getElementById('current-salary-empty');
        const contentEl = document.getElementById('current-salary-content');
        
        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'none';
        
        //  直接呼叫 getMySalary（後端會自動重新計算並儲存）
        const result = await callApifetch(`getMySalary&yearMonth=${currentMonth}`);
        
        console.log(' 薪資資料回應:', result);
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (result.ok && result.data) {
            console.log(' 成功載入薪資資料');
            displayEmployeeSalary(result.data);
            if (contentEl) contentEl.style.display = 'block';
            await loadAttendanceDetails(currentMonth);
        } else {
            console.log(` 沒有 ${currentMonth} 的薪資記錄`);
            if (emptyEl) {
                showNoSalaryMessage(currentMonth);
                emptyEl.style.display = 'block';
            }
        }
        
    } catch (error) {
        console.error(' 載入失敗:', error);
        const loadingEl = document.getElementById('current-salary-loading');
        const emptyEl = document.getElementById('current-salary-empty');
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
    }
}

/**
 *  按月份查詢薪資（修正版 - 先重新計算）
 */
async function loadEmployeeSalaryByMonth() {
    const monthInput = document.getElementById('employee-salary-month');
    const yearMonth = monthInput ? monthInput.value : '';
    
    if (!yearMonth) {
        showNotification(t('SALARY_SELECT_MONTH'), 'error');
        return;
    }
    
    const loadingEl = document.getElementById('current-salary-loading');
    const emptyEl = document.getElementById('current-salary-empty');
    const contentEl = document.getElementById('current-salary-content');
    
    if (!loadingEl || !emptyEl || !contentEl) {
        console.warn('薪資顯示元素未找到');
        return;
    }
    
    try {
        console.log(` 查詢 ${yearMonth} 薪資（先重新計算）`);
        
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        contentEl.style.display = 'none';
        
        //  關鍵修正：先取得 session 以獲取 employeeId
        const session = await callApifetch('checkSession');
        
        if (!session.ok || !session.user) {
            throw new Error('Session 驗證失敗');
        }
        
        const employeeId = session.user.userId;
        
        //  步驟 1：先重新計算薪資（確保資料是最新的）
        console.log(' 重新計算薪資...');
        const calcResult = await callApifetch(`calculateMonthlySalary&employeeId=${encodeURIComponent(employeeId)}&yearMonth=${encodeURIComponent(yearMonth)}`);
        
        if (calcResult.success && calcResult.data) {
            //  步驟 2：儲存計算結果
            console.log(' 儲存計算結果...');
            // await saveMonthlySalary(calcResult.data);
        }
        
        //  步驟 3：讀取薪資資料（確保是最新的）
        const res = await callApifetch(`getMySalary&yearMonth=${yearMonth}`);
        
        console.log(` 查詢 ${yearMonth} 薪資回應:`, res);
        
        loadingEl.style.display = 'none';
        
        if (res.ok && res.data) {
            console.log(` 找到 ${yearMonth} 的薪資記錄`);
            displayEmployeeSalary(res.data);
            contentEl.style.display = 'block';
            await loadAttendanceDetails(yearMonth);
        } else {
            console.log(` 沒有 ${yearMonth} 的薪資記錄`);
            showNoSalaryMessage(yearMonth);
            emptyEl.style.display = 'block';
            const detailsSection = document.getElementById('attendance-details-section');
            if (detailsSection) detailsSection.style.display = 'none';
        }
        
    } catch (error) {
        console.error(` 載入 ${yearMonth} 薪資失敗:`, error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
    }
}
/**
 *  載入每日加班明細
 */
async function loadDailyOvertimeDetails(yearMonth) {
    const detailsContainer = document.getElementById('overtime-details');
    if (!detailsContainer) return;
    
    try {
        detailsContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">' + tHtml('SALARY_LOADING') + '</p>';
        
        //  呼叫後端 API 取得加班記錄
        const res = await callApifetch(`getEmployeeMonthlyOvertime&yearMonth=${yearMonth}`);
        
        console.log(' 加班記錄回應:', res);
        
        if (res.ok && res.records && res.records.length > 0) {
            detailsContainer.innerHTML = '';
            
            res.records.forEach(record => {
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center p-2 bg-orange-50 dark:bg-orange-800/10 rounded border border-orange-200 dark:border-orange-700/30';
                
                const hours = parseFloat(record.hours) || 0;
                
                item.innerHTML = `
                    <div>
                        <span class="font-semibold text-orange-700 dark:text-orange-200">${escapeHtml(record.date)}</span>
                        <span class="text-sm text-orange-600 dark:text-orange-400 ml-2">${tHtml('STATUS_APPROVED')}</span>
                    </div>
                    <div class="text-right">
                        <span class="font-mono text-orange-700 dark:text-orange-300 font-bold">${hours.toFixed(1)}h</span>
                    </div>
                `;
                
                detailsContainer.appendChild(item);
            });
        } else {
            detailsContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">' + tHtml('SALARY_OT_NO_RECORDS') + '</p>';
        }
        
    } catch (error) {
        console.error(' 載入加班明細失敗:', error);
        detailsContainer.innerHTML = '<p class="text-sm text-red-600 dark:text-red-400">' + tHtml('LOAD_FAILED') + '</p>';
    }
}

async function loadOvertimeRecordsCard(yearMonth, salaryData) {
    console.log(' 載入加班記錄卡片');
    
    //  修正：讀取四種加班費
    const totalOvertimeHours = parseFloat(
        salaryData.totalOvertimeHours !== undefined 
            ? salaryData.totalOvertimeHours 
            : salaryData['總加班時數']
    ) || 0;
    
    const weekdayOvertimePay = parseFloat(
        salaryData.weekdayOvertimePay !== undefined 
            ? salaryData.weekdayOvertimePay 
            : salaryData['平日加班費']
    ) || 0;
    
    const restdayOvertimePay = parseFloat(
        salaryData.restdayOvertimePay !== undefined 
            ? salaryData.restdayOvertimePay 
            : salaryData['休息日加班費']
    ) || 0;
    
    const sundayOvertimePay = parseFloat(
        salaryData.sundayOvertimePay !== undefined 
            ? salaryData.sundayOvertimePay 
            : salaryData['例假日加班費']
    ) || 0;
    
    const holidayOvertimePay = parseFloat(
        salaryData.holidayOvertimePay !== undefined 
            ? salaryData.holidayOvertimePay 
            : salaryData['國定假日加班費']
    ) || 0;
    
    const holidayWorkPay = parseFloat(
        salaryData.holidayWorkPay !== undefined 
            ? salaryData.holidayWorkPay 
            : salaryData['國定假日出勤薪資']
    ) || 0;
    
    const totalOvertimePay = weekdayOvertimePay + restdayOvertimePay + 
                            sundayOvertimePay + holidayOvertimePay + holidayWorkPay;
    
    console.log(` 總加班: ${totalOvertimeHours}h`);
    console.log(`   平日: $${weekdayOvertimePay}`);
    console.log(`   休息日: $${restdayOvertimePay}`);
    console.log(`   例假日: $${sundayOvertimePay}`);
    console.log(`   國定假日加班費: $${holidayOvertimePay}`);
    console.log(`   國定假日出勤薪資: $${holidayWorkPay}`);
    
    // ... 顯示邏輯 ...
    
    if (totalOvertimeHours > 0) {
        overtimeCard.style.display = 'block';
        
        overtimeCard.innerHTML = `
            <h4 class="font-semibold mb-3 text-orange-600 dark:text-orange-400"> ${tHtml('SALARY_OT_MONTH_TITLE')}</h4>
            
            <div class="grid grid-cols-3 gap-4 mb-4">
                <div class="text-center p-3 bg-orange-50 dark:bg-orange-800/20 rounded-lg">
                    <p class="text-sm text-orange-700 dark:text-orange-300 mb-1">${tHtml('SALARY_OT_TOTAL_HOURS')}</p>
                    <p class="text-2xl font-bold text-orange-700 dark:text-orange-200">${totalOvertimeHours.toFixed(1)}h</p>
                </div>
                <div class="text-center p-3 bg-orange-50 dark:bg-orange-800/20 rounded-lg">
                    <p class="text-sm text-orange-700 dark:text-orange-300 mb-1">${tHtml('SALARY_WEEKDAY_OT')}</p>
                    <p class="text-xl font-bold text-orange-700 dark:text-orange-200">${formatCurrency(weekdayOvertimePay)}</p>
                    <p class="text-xs text-orange-600 dark:text-orange-400 mt-1">${tHtml('SALARY_OT_WEEKDAY_RULE_SHORT')}</p>
                </div>
                <div class="text-center p-3 bg-orange-50 dark:bg-orange-800/20 rounded-lg">
                    <p class="text-sm text-orange-700 dark:text-orange-300 mb-1">${tHtml('SALARY_OT_HOLIDAY_PAY')}</p>
                    <p class="text-xl font-bold text-orange-700 dark:text-orange-200">${formatCurrency(restdayOvertimePay + sundayOvertimePay + holidayOvertimePay + holidayWorkPay)}</p>
                    <p class="text-xs text-orange-600 dark:text-orange-400 mt-1">${tHtml('SALARY_OT_HOLIDAY_RULE_SHORT')}</p>
                </div>
            </div>
            
            <!--  詳細分類 -->
            ${restdayOvertimePay > 0 || sundayOvertimePay > 0 || holidayOvertimePay > 0 || holidayWorkPay > 0 ? `
                <div class="p-3 bg-orange-50 dark:bg-orange-800/10 rounded-lg mb-3">
                    <div class="text-sm space-y-1">
                        ${restdayOvertimePay > 0 ? `
                            <div class="flex justify-between">
                                <span class="text-orange-700 dark:text-orange-300">${tHtml('SALARY_OT_RESTDAY_SAT')}</span>
                                <span class="font-mono text-orange-700 dark:text-orange-200">${formatCurrency(restdayOvertimePay)}</span>
                            </div>
                        ` : ''}
                        ${sundayOvertimePay > 0 ? `
                            <div class="flex justify-between">
                                <span class="text-orange-700 dark:text-orange-300">${tHtml('SALARY_OT_SUNDAY')}</span>
                                <span class="font-mono text-orange-700 dark:text-orange-200">${formatCurrency(sundayOvertimePay)}</span>
                            </div>
                        ` : ''}
                        ${holidayWorkPay > 0 ? `
                            <div class="flex justify-between border-t border-orange-200 dark:border-orange-700/30 pt-2">
                                <span class="text-orange-700 dark:text-orange-300 font-semibold">${tHtml('SALARY_HOLIDAY_WORK_PAY')}</span>
                                <span class="font-mono text-orange-700 dark:text-orange-200 font-bold">${formatCurrency(holidayWorkPay)}</span>
                            </div>
                        ` : ''}
                        ${holidayOvertimePay > 0 ? `
                            <div class="flex justify-between">
                                <span class="text-orange-700 dark:text-orange-300 font-semibold">${tHtml('SALARY_OT_HOLIDAY_X2')}</span>
                                <span class="font-mono text-orange-700 dark:text-orange-200 font-bold">${formatCurrency(holidayOvertimePay)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
            
            <div class="p-3 bg-orange-50 dark:bg-orange-800/20 rounded-lg">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-orange-700 dark:text-orange-200">${tHtml('SALARY_OT_TOTAL_PAY')}</span>
                    <span class="text-2xl font-bold text-orange-700 dark:text-orange-300">${formatCurrency(totalOvertimePay)}</span>
                </div>
            </div>
            
            <div id="overtime-details" class="mt-4 space-y-2">
                <!-- 每日加班明細將動態載入 -->
            </div>
        `;
        
        await loadDailyOvertimeDetails(yearMonth);
        
    } else {
        overtimeCard.style.display = 'none';
    }
}

/**
 *  載入每日工時明細
 */
async function loadDailyWorkHours(yearMonth) {
    const detailsContainer = document.getElementById('work-hours-details');
    if (!detailsContainer) return;
    
    try {
        detailsContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">' + tHtml('SALARY_LOADING') + '</p>';
        
        //  呼叫後端 API 取得打卡記錄
        const res = await callApifetch(`getEmployeeMonthlyAttendance&yearMonth=${yearMonth}`);
        
        console.log(' 打卡記錄回應:', res);
        
        if (res.ok && res.records && res.records.length > 0) {
            detailsContainer.innerHTML = '';
            
            res.records.forEach(record => {
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center p-2 bg-purple-50 dark:bg-purple-800/10 rounded border border-purple-200 dark:border-purple-700/30';
                
                const workHours = parseFloat(record.workHours) || 0;
                // 一天可能有兩組上下班（兩頭班休息前打卡）：每一段都列出來
                const timeText = Array.isArray(record.segments) && record.segments.length
                    ? record.segments.map(seg => `${seg.start} ~ ${seg.end}`).join('、')
                    : `${record.punchIn || '--'} ~ ${record.punchOut || '--'}`;
                
                item.innerHTML = `
                    <div>
                        <span class="font-semibold text-purple-700 dark:text-purple-200">${escapeHtml(record.date)}</span>
                        <span class="text-sm text-purple-600 dark:text-purple-400 ml-2">
                            ${escapeHtml(timeText)}
                        </span>
                    </div>
                    <div class="text-right">
                        <span class="font-mono text-purple-700 dark:text-purple-300 font-bold">${workHours.toFixed(2)}h</span>
                    </div>
                `;
                
                detailsContainer.appendChild(item);
            });
        } else {
            detailsContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">' + tHtml('SALARY_ATT_NO_RECORDS') + '</p>';
        }
        
    } catch (error) {
        console.error(' 載入每日工時失敗:', error);
        detailsContainer.innerHTML = '<p class="text-sm text-red-600 dark:text-red-400">' + tHtml('LOAD_FAILED') + '</p>';
    }
}

/**
 *  載入工作時數卡片（時薪專用）
 */
async function loadWorkHoursCard(yearMonth, salaryData) {
    console.log(' 載入工作時數卡片');
    
    // 從薪資資料中取得工時資訊
    const totalWorkHours = parseFloat(salaryData['工作時數']) || 0;
    const hourlyRate = parseFloat(salaryData['時薪']) || 0;
    const baseSalary = parseFloat(salaryData['基本薪資']) || 0;
    const totalWorkHoursInt = Math.floor(totalWorkHours);
    console.log(`⏱ 總工時: ${totalWorkHours}h, 時薪: $${hourlyRate}, 基本薪資: $${baseSalary}`);
    
    // 建立工時卡片
    let workHoursCard = document.getElementById('work-hours-card');
    
    if (!workHoursCard) {
        workHoursCard = document.createElement('div');
        workHoursCard.id = 'work-hours-card';
        workHoursCard.className = 'feature-box bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 mb-4';
        
        const detailsSection = document.getElementById('attendance-details-section');
        const firstChild = detailsSection.firstChild;
        detailsSection.insertBefore(workHoursCard, firstChild);
    }
    
    workHoursCard.innerHTML = `
        <h4 class="font-semibold mb-3 text-purple-600 dark:text-purple-400"> ${tHtml('SALARY_WH_MONTH_TITLE')}</h4>
        
        <div class="grid grid-cols-3 gap-4 mb-4">
            <div class="text-center p-3 bg-purple-50 dark:bg-purple-800/20 rounded-lg">
                <p class="text-sm text-purple-700 dark:text-purple-300 mb-1">${tHtml('HOURLY_RATE_LABEL')}</p>
                <p class="text-2xl font-bold text-purple-700 dark:text-purple-200">$${hourlyRate}</p>
            </div>
            <div class="text-center p-3 bg-purple-50 dark:bg-purple-800/20 rounded-lg">
                <p class="text-sm text-purple-700 dark:text-purple-300 mb-1">${tHtml('SALARY_WH_TOTAL')}</p>
                <p class="text-2xl font-bold text-purple-700 dark:text-purple-200">${Math.floor(totalWorkHours)}h</p>
            </div>
            <div class="text-center p-3 bg-purple-50 dark:bg-purple-800/20 rounded-lg">
                <p class="text-sm text-purple-700 dark:text-purple-300 mb-1">${tHtml('SALARY_BASE')}</p>
                <p class="text-2xl font-bold text-purple-700 dark:text-purple-200">${formatCurrency(baseSalary)}</p>
                <p class="text-xs text-purple-600 dark:text-purple-400 mt-1">${tHtml('SALARY_WH_BASE_FORMULA')}</p>
            </div>
        </div>
        
        <div id="work-hours-details" class="space-y-2">
            <!-- 每日工時明細將動態載入 -->
        </div>
    `;
    
    // 載入每日工時明細
    await loadDailyWorkHours(yearMonth);
}

/**
 * 在薪資明細上列出自訂津貼與扣款。
 *
 * 後端可能回 camelCase（剛算完的結果）或中文欄名（從試算表讀回來的薪資單），
 * 兩種都要接得住。
 */
function renderCustomSalaryItems(data) {
    const anchor = document.getElementById('detail-performance-bonus');
    if (!anchor || !anchor.parentElement) return;
    
    const container = anchor.parentElement.parentElement || anchor.parentElement;
    
    // 每次重畫前先清掉上一次的，不然切換月份會愈疊愈多
    container.querySelectorAll('.custom-salary-item').forEach(el => el.remove());
    
    let allowances = data.customAllowances;
    let deductions = data.customDeductions;
    
    if (!allowances && !deductions && data['自訂項目明細']) {
        try {
            const detail = JSON.parse(data['自訂項目明細']) || {};
            allowances = detail.allowances;
            deductions = detail.deductions;
        } catch (error) {
            console.warn('自訂項目明細格式錯誤:', error);
        }
    }
    
    const rows = []
        .concat((allowances || []).map(item => ({ item: item, isDeduction: false })))
        .concat((deductions || []).map(item => ({ item: item, isDeduction: true })));
    
    rows.forEach(({ item, isDeduction }) => {
        const row = document.createElement('div');
        row.className = 'custom-salary-item flex justify-between text-sm';
        
        const label = document.createElement('span');
        label.textContent = item.name + '：';
        
        const amount = document.createElement('span');
        amount.className = 'font-mono ' + (isDeduction ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400');
        amount.textContent = (isDeduction ? '-' : '') + formatCurrency(item.amount || 0);
        
        row.appendChild(label);
        row.appendChild(amount);
        container.appendChild(row);
    });
}

/**
 * 薪資單簽收區塊。
 *
 * 只有列印版而沒有簽收記錄的話，公司拿不出「員工已收到」的證明；
 * 已簽收的不再顯示按鈕，第一次簽收的時間才有意義，不覆蓋。
 */
function renderPayslipAcknowledgement(data) {
    const status = document.getElementById('payslip-ack-status');
    const button = document.getElementById('acknowledge-payslip-btn');
    if (!status || !button) return;

    const yearMonth = data.yearMonth || data['年月'] || '';
    const acknowledgedAt = data['簽收時間'] || data.acknowledgedAt || '';

    if (acknowledgedAt) {
        status.textContent = `${t('PAYSLIP_ACKNOWLEDGED_AT')}：${acknowledgedAt}`;
        button.style.display = 'none';
        return;
    }

    status.textContent = t('PAYSLIP_NOT_ACKNOWLEDGED');
    button.style.display = 'inline-block';
    button.disabled = false;

    button.onclick = async () => {
        if (!yearMonth) return;
        button.disabled = true;

        try {
            const res = await callApifetch(
                `acknowledgePayslip&yearMonth=${encodeURIComponent(yearMonth)}`, null);

            if (res.ok) {
                status.textContent = `${t('PAYSLIP_ACKNOWLEDGED_AT')}：${res.acknowledgedAt}`;
                button.style.display = 'none';
                showNotification(t('PAYSLIP_ACK_DONE'), 'success');
            } else {
                showNotification(res.msg || t('PAYSLIP_ACK_FAILED'), 'error');
                button.disabled = false;
            }
        } catch (error) {
            console.error('簽收薪資單失敗:', error);
            showNotification(t('PAYSLIP_ACK_FAILED'), 'error');
            button.disabled = false;
        }
    };
}

function displayEmployeeSalary(data) {
    console.log(' 顯示薪資明細（完整版）:', data);
    
    renderPayslipAcknowledgement(data);
    
    const safeSet = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        } else {
            console.warn(` 元素 #${id} 未找到`);
        }
    };
    
    const salaryType = data.salaryType || '月薪';
    const isHourly  = salaryType === '時薪';
    const isWeekly  = salaryType === '週薪';
    
    // 應發總額與實發金額
    safeSet('gross-salary', formatCurrency(data.grossSalary));  // ← 改這裡
    safeSet('net-salary', formatCurrency(data.netSalary));      // ← 改這裡
    
    // 計算扣款總額
    const deductions = 
        (parseFloat(data.laborFee) || 0) +           // ← 改這裡
        (parseFloat(data.healthFee) || 0) +          // ← 改這裡
        (parseFloat(data.employmentFee) || 0) +      // ← 改這裡
        (parseFloat(data.pensionSelf) || 0) +        // ← 改這裡
        (parseFloat(data.incomeTax) || 0) +          // ← 改這裡
        (parseFloat(data.leaveDeduction) || 0) +     // ← 改這裡
        (parseFloat(data.earlyLeaveDeduction || data['早退扣款']) || 0) +
        (parseFloat(data.welfareFee) || 0) +         // ← 改這裡
        (parseFloat(data.dormitoryFee) || 0) +       // ← 改這裡
        (parseFloat(data.groupInsurance) || 0) +     // ← 改這裡
        (parseFloat(data.otherDeductions) || 0);     // ← 改這裡
    
    safeSet('total-deductions', formatCurrency(deductions));
    
    // 應發項目
    if (isHourly) {
        const hourlyRate = parseFloat(data.hourlyRate) || 0;
        const totalWorkHours = parseFloat(data.totalWorkHours) || 0;
        safeSet('detail-base-salary', formatCurrency(data.baseSalary));
        const baseSalaryEl = document.getElementById('detail-base-salary');
        if (baseSalaryEl && baseSalaryEl.parentElement) {
            let info = baseSalaryEl.parentElement.querySelector('.salary-type-info');
            if (!info) {
                info = document.createElement('div');
                info.className = 'salary-type-info text-xs text-purple-600 dark:text-purple-400 mt-1';
                baseSalaryEl.parentElement.appendChild(info);
            }
            info.textContent = t('SALARY_HOURLY_INFO', { rate: hourlyRate, hours: Math.floor(totalWorkHours) });
        }
    } else if (isWeekly) {
        const weeklyRate = parseFloat(data.weeklyRate) || parseFloat(data.baseSalary) || 0;
        const weekCount  = parseFloat(data.weekCount) || 0;
        safeSet('detail-base-salary', formatCurrency(data.baseSalary));
        const baseSalaryEl = document.getElementById('detail-base-salary');
        if (baseSalaryEl && baseSalaryEl.parentElement) {
            let info = baseSalaryEl.parentElement.querySelector('.salary-type-info');
            if (!info) {
                info = document.createElement('div');
                info.className = 'salary-type-info text-xs text-amber-600 dark:text-amber-400 mt-1';
                baseSalaryEl.parentElement.appendChild(info);
            }
            info.textContent = t('SALARY_WEEKLY_INFO', { rate: weeklyRate, weeks: weekCount });
        }
    } else {
        safeSet('detail-base-salary', formatCurrency(data.baseSalary));
        const baseSalaryEl = document.getElementById('detail-base-salary');
        if (baseSalaryEl && baseSalaryEl.parentElement) {
            const info = baseSalaryEl.parentElement.querySelector('.salary-type-info');
            if (info) info.remove();
        }
    }
    
    //  工時統計資訊
    const totalWorkHours = parseFloat(data.totalWorkHours) || 0;
    const totalOvertimeHours = parseFloat(data.totalOvertimeHours) || 0;

    const weekdayOvertimeEl = document.getElementById('detail-weekday-overtime');
    if (weekdayOvertimeEl && weekdayOvertimeEl.parentElement) {
        //  修正：先移除舊的工時統計區塊
        const oldWorkHoursInfo = weekdayOvertimeEl.parentElement.querySelector('.work-hours-summary');
        if (oldWorkHoursInfo) {
            oldWorkHoursInfo.remove();
        }
        
        //  新增：檢查是否已存在工時統計區塊（在父容器層級）
        const container = weekdayOvertimeEl.closest('.space-y-2') || weekdayOvertimeEl.parentElement.parentElement;
        const existingSummaries = container.querySelectorAll('.work-hours-summary');
        existingSummaries.forEach(summary => summary.remove());
        
        if (totalWorkHours > 0 || totalOvertimeHours > 0) {
            const workHoursSummary = document.createElement('div');
            workHoursSummary.className = 'work-hours-summary mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/30 rounded-lg';
            
            let summaryHTML = '<div class="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">' + tHtml('SALARY_WH_SUMMARY_TITLE') + '</div>';
            
            if (isHourly && totalWorkHours > 0) {
                summaryHTML += `
                    <div class="flex justify-between text-sm mb-1">
                        <span class="text-blue-700 dark:text-blue-200">${tHtml('SALARY_WH_PUNCHED')}</span>
                        <span class="font-mono text-blue-700 dark:text-blue-100">${Math.floor(totalWorkHours)}h</span>
                    </div>
                `;
            }
            
            if (totalOvertimeHours > 0) {
                summaryHTML += `
                    <div class="flex justify-between text-sm">
                        <span class="text-orange-700 dark:text-orange-200">${tHtml('OVERTIME_HOURS_LABEL')}</span>
                        <span class="font-mono text-orange-700 dark:text-orange-100">${totalOvertimeHours.toFixed(1)}h</span>
                    </div>
                `;
            }
            
            workHoursSummary.innerHTML = summaryHTML;
            
            //  修正：只插入一次
            weekdayOvertimeEl.parentElement.parentElement.insertBefore(
                workHoursSummary,
                weekdayOvertimeEl.parentElement
            );
        }
    }
        
    // 其他津貼
    safeSet('detail-position-allowance', formatCurrency(data.positionAllowance || 0));
    safeSet('detail-meal-allowance', formatCurrency(data.mealAllowance || 0));
    safeSet('detail-transport-allowance', formatCurrency(data.transportAllowance || 0));
    safeSet('detail-attendance-bonus', formatCurrency(data.attendanceBonus || 0));
    safeSet('detail-performance-bonus', formatCurrency(data.performanceBonus || 0));
    
    //  自訂津貼／扣款：項目由管理員定義，所以只能動態長出來
    renderCustomSalaryItems(data);
    
    // 加班費
    safeSet('detail-weekday-overtime', formatCurrency(data.weekdayOvertimePay || 0));
    safeSet('detail-restday-overtime', formatCurrency(data.restdayOvertimePay || 0));
    safeSet('detail-holiday-overtime', formatCurrency(data.holidayOvertimePay || 0));
    
    // 扣款項目
    safeSet('detail-labor-fee', formatCurrency(data.laborFee));
    safeSet('detail-health-fee', formatCurrency(data.healthFee));
    safeSet('detail-employment-fee', formatCurrency(data.employmentFee));
    
    const pensionRate = parseFloat(data.pensionSelfRate) || 0;
    safeSet('detail-pension-rate', `${pensionRate}%`);
    
    safeSet('detail-pension-self', formatCurrency(data.pensionSelf));
    safeSet('detail-income-tax', formatCurrency(data.incomeTax));
    safeSet('detail-leave-deduction', formatCurrency(data.leaveDeduction));
    
    //  新增：早退扣款顯示
    const earlyLeaveDeduction = parseFloat(data.earlyLeaveDeduction || data['早退扣款']) || 0;
    safeSet('detail-early-leave-deduction', formatCurrency(earlyLeaveDeduction));

    const sickLeaveHours = parseFloat(data.sickLeaveHours) || 0;  //  改名
    const sickLeaveDeduction = parseFloat(data.sickLeaveDeduction) || 0;
    const personalLeaveHours = parseFloat(data.personalLeaveHours) || 0;  //  改名
    const personalLeaveDeduction = parseFloat(data.personalLeaveDeduction) || 0;
    
    console.log(' 請假資料檢查:');
    console.log('   病假時數:', sickLeaveHours);  //  改名
    console.log('   病假扣款:', sickLeaveDeduction);
    console.log('   事假時數:', personalLeaveHours);  //  改名
    console.log('   事假扣款:', personalLeaveDeduction);
    console.log('   早退扣款:', earlyLeaveDeduction); //  新增

    const leaveDeductionEl = document.getElementById('detail-leave-deduction');

    if (leaveDeductionEl) {
        let container = leaveDeductionEl.closest('.space-y-2');
        
        if (!container) {
            container = leaveDeductionEl.parentElement;
        }
        
        if (container) {
            const oldLeaveDetails = container.querySelector('.leave-details');
            if (oldLeaveDetails) {
                oldLeaveDetails.remove();
            }
            
            if (sickLeaveHours > 0 || personalLeaveHours > 0) {  //  改名
                const leaveDetails = document.createElement('div');
                leaveDetails.className = 'leave-details p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg mt-2 mb-2 border border-yellow-200 dark:border-yellow-700/30';
                
                let detailsHTML = '<div class="text-xs space-y-1">';
                
                if (sickLeaveHours > 0) {  //  改名
                    detailsHTML += `
                        <div class="flex justify-between">
                            <span class="text-yellow-700 dark:text-yellow-300">${tHtml('SALARY_SICK_LEAVE_LINE', { hours: sickLeaveHours })}</span>
                            <span class="font-mono text-yellow-700 dark:text-yellow-200 font-bold">${formatCurrency(sickLeaveDeduction)}</span>
                        </div>
                    `;
                }
                
                if (personalLeaveHours > 0) {  //  改名
                    detailsHTML += `
                        <div class="flex justify-between">
                            <span class="text-yellow-700 dark:text-yellow-300">${tHtml('SALARY_PERSONAL_LEAVE_LINE', { hours: personalLeaveHours })}</span>
                            <span class="font-mono text-yellow-700 dark:text-yellow-200 font-bold">${formatCurrency(personalLeaveDeduction)}</span>
                        </div>
                    `;
                }
                
                detailsHTML += '</div>';
                leaveDetails.innerHTML = detailsHTML;
                
                const leaveDeductionRow = leaveDeductionEl.closest('.flex');
                if (leaveDeductionRow && leaveDeductionRow.nextSibling) {
                    leaveDeductionRow.parentNode.insertBefore(leaveDetails, leaveDeductionRow.nextSibling);
                } else {
                    container.appendChild(leaveDetails);
                }
                
                console.log('請假明細已顯示');
            } else {
                console.log('本月無請假記錄');
            }
        }
    }
    
    const otherDeductions = 
        (parseFloat(data.welfareFee) || 0) +
        (parseFloat(data.dormitoryFee) || 0) +
        (parseFloat(data.groupInsurance) || 0) +
        (parseFloat(data.otherDeductions) || 0);
    safeSet('detail-other-deductions', formatCurrency(otherDeductions));
    
    // 銀行資訊
    let bankCode = data.bankCode;
    const bankAccount = data.bankAccount;
    
    if (bankCode) {
        bankCode = String(bankCode).padStart(3, '0');
    }
    
    safeSet('detail-bank-name', getBankName(bankCode));
    safeSet('detail-bank-account', bankAccount || '--');
    
    console.log(' 薪資明細顯示完成');
}
/**
 *  載入薪資歷史
 */
async function loadSalaryHistory() {
    const loadingEl = document.getElementById('salary-history-loading');
    const emptyEl = document.getElementById('salary-history-empty');
    const listEl = document.getElementById('salary-history-list');
    
    if (!loadingEl || !emptyEl || !listEl) {
        console.warn('薪資歷史元素未找到');
        return;
    }
    
    try {
        console.log(' 載入薪資歷史');
        
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        listEl.innerHTML = '';
        
        const res = await callApifetch('getMySalaryHistory&limit=12');
        
        console.log(' 薪資歷史回應:', res);
        
        loadingEl.style.display = 'none';
        
        if (res.ok && res.data && res.data.length > 0) {
            console.log(` 找到 ${res.data.length} 筆薪資歷史`);
            res.data.forEach(salary => {
                const item = createSalaryHistoryItem(salary);
                listEl.appendChild(item);
            });
        } else {
            console.log(' 沒有薪資歷史記錄');
            emptyEl.style.display = 'block';
        }
        
    } catch (error) {
        console.error(' 載入薪資歷史失敗:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
    }
}

/**
 * 建立薪資歷史項目
 */
function createSalaryHistoryItem(salary) {
    const div = document.createElement('div');
    div.className = 'feature-box flex justify-between items-center hover:bg-gray-50 dark:hover:bg-white/10 transition cursor-pointer';
    
    div.innerHTML = `
        <div>
            <div class="font-semibold text-lg">
                ${escapeHtml(salary['年月'] || '--')}
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                ${escapeHtml(salaryValueLabel(salary['狀態'] || '已計算'))}
            </div>
        </div>
        <div class="text-right">
            <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                ${formatCurrency(salary['實發金額'])}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                ${tHtml('SALARY_GROSS_SHORT', { amount: formatCurrency(salary['應發總額']) })}
            </div>
        </div>
    `;
    
    return div;
}

/**
 * 顯示無薪資訊息
 */
function showNoSalaryMessage(month) {
    const emptyEl = document.getElementById('current-salary-empty');
    if (emptyEl) {
        emptyEl.innerHTML = `
            <div class="empty-state-icon"></div>
            <div class="empty-state-title">${tHtml('SALARY_NO_RECORD')}</div>
            <div class="empty-state-text">
                <p>${tHtml('SALARY_NO_DATA_FOR_MONTH', { month })}</p>
                <p style="margin-top: 0.5rem; font-size: 0.875rem;">
                    ${tHtml('SALARY_EMPTY_HINT_SETUP')}<br>
                    ${tHtml('SALARY_EMPTY_HINT_CONTACT')}
                </p>
            </div>
        `;
    }
}

// ==================== 管理員功能 ====================

function bindSalaryEvents() {
    console.log(' 綁定薪資表單事件（完整版）');
    
    const configForm = document.getElementById('salary-config-form');
    if (configForm) {
        //  修正：移除舊的監聽器，避免重複綁定
        configForm.removeEventListener('submit', handleSalaryConfigSubmit);
        
        //  修正：使用 addEventListener 而不是 onsubmit
        configForm.addEventListener('submit', async (e) => {
            e.preventDefault();  // ← 立即阻止預設行為
            e.stopPropagation(); // ← 阻止事件冒泡
            
            await handleSalaryConfigSubmit(e);
        });
        
        console.log(' 薪資設定表單已綁定');
    }
    
    const calculateBtn = document.getElementById('calculate-salary-btn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', handleSalaryCalculation);
        console.log(' 薪資計算按鈕已綁定');
    }
}

/**
 *  處理薪資設定表單提交（完整版 - 含所有津貼與扣款）
 */
async function handleSalaryConfigSubmit(e) {
    e.preventDefault();
    
    console.log(' 開始提交薪資設定表單（完整版）');
    
    const safeGetValue = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };
    
    const toNumber = (value) => {
        if (value === '' || value === null || value === undefined) {
            return 0; // 空值視為 0
        }
        const num = parseFloat(value);
        return isNaN(num) ? 0 : Math.round(num);
    };
    // 基本資訊
    const employeeId = safeGetValue('config-employee-id');
    const employeeName = safeGetValue('config-employee-name');
    const idNumber = safeGetValue('config-id-number');
    const employeeType = safeGetValue('config-employee-type');
    const salaryType = safeGetValue('config-salary-type');
    const baseSalary = toNumber(safeGetValue('config-base-salary'));  //  改這裡

    if (!employeeId || !employeeName || !salaryType) {
        showNotification(t('SALARY_FILL_REQUIRED'), 'error');
        return;
    }
    
    if (salaryType === '月薪' && baseSalary <= 0) {
        showNotification(t('NOTIF_BASE_SALARY_POSITIVE'), 'error');
        return;
    }
    if (salaryType === '時薪' && (isNaN(baseSalary) || baseSalary <= 0)) {
        showNotification(t('NOTIF_HOURLY_RATE_POSITIVE'), 'error');
        return;
    }
    if (salaryType === '週薪' && (isNaN(baseSalary) || baseSalary <= 0)) {
        showNotification(t('NOTIF_WEEKLY_SALARY_POSITIVE'), 'error');
        return;
    }

    //  固定津貼（6項）
    const positionAllowance = toNumber(safeGetValue('config-position-allowance'));  //  改這裡
    const mealAllowance = toNumber(safeGetValue('config-meal-allowance'));          //  改這裡
    const transportAllowance = toNumber(safeGetValue('config-transport-allowance'));//  改這裡
    const attendanceBonus = toNumber(safeGetValue('config-attendance-bonus'));      //  改這裡
    const performanceBonus = toNumber(safeGetValue('config-performance-bonus'));    //  改這裡
    const otherAllowances = toNumber(safeGetValue('config-other-allowances'));      //  改這裡

    // 法定扣款
    const laborFee = toNumber(safeGetValue('config-labor-fee'));            //  改這裡
    const healthFee = toNumber(safeGetValue('config-health-fee'));          //  改這裡
    const employmentFee = toNumber(safeGetValue('config-employment-fee'));  //  改這裡
    const pensionSelf = toNumber(safeGetValue('config-pension-self'));      //  改這裡
    const incomeTax = toNumber(safeGetValue('config-income-tax'));          //  改這裡
    const pensionSelfRate = toNumber(safeGetValue('config-pension-rate'));  //  改這裡

    //  其他扣款（4項）
    const welfareFee = toNumber(safeGetValue('config-welfare-fee'));        //  改這裡
    const dormitoryFee = toNumber(safeGetValue('config-dormitory-fee'));    //  改這裡
    const groupInsurance = toNumber(safeGetValue('config-group-insurance'));//  改這裡
    const otherDeductions = toNumber(safeGetValue('config-other-deductions'));//  改這裡

    // 其他資訊
    const bankCodeRaw = document.getElementById('config-bank-code').value;
    const bankCode = bankCodeRaw ? String(bankCodeRaw).padStart(3, '0') : '';
    const bankAccount = safeGetValue('config-bank-account');
    const hireDate = safeGetValue('config-hire-date');
    const paymentDay = safeGetValue('config-payment-day') || '5';
    const note = safeGetValue('config-note');
    
    // 驗證
    if (!employeeId || !employeeName || !baseSalary || parseFloat(baseSalary) <= 0) {
        showNotification(t('SALARY_FILL_REQUIRED'), 'error');
        return;
    }
    
    if (!employeeType || !salaryType) {
        showNotification(t('SALARY_SELECT_TYPE'), 'error');
        return;
    }
    
    try {
        showNotification(t('SALARY_SAVING'), 'info');
        
        //  重新排序參數，與後端 Sheet 欄位順序一致
        const queryString = 
            // 基本資訊 (6個參數)
            `employeeId=${encodeURIComponent(employeeId)}` +
            `&employeeName=${encodeURIComponent(employeeName)}` +
            `&idNumber=${encodeURIComponent(idNumber)}` +                    //  新增
            `&employeeType=${encodeURIComponent(employeeType)}` +            //  新增
            `&salaryType=${encodeURIComponent(salaryType)}` +                //  新增
            `&baseSalary=${encodeURIComponent(baseSalary)}` +
            
            // 固定津貼 (6個參數)
            `&positionAllowance=${encodeURIComponent(positionAllowance)}` +
            `&mealAllowance=${encodeURIComponent(mealAllowance)}` +
            `&transportAllowance=${encodeURIComponent(transportAllowance)}` +
            `&attendanceBonus=${encodeURIComponent(attendanceBonus)}` +
            `&performanceBonus=${encodeURIComponent(performanceBonus)}` +
            `&otherAllowances=${encodeURIComponent(otherAllowances)}` +
            
            // 銀行資訊 (4個參數)
            `&bankCode=${encodeURIComponent(bankCode)}` +
            `&bankAccount=${encodeURIComponent(bankAccount)}` +
            `&hireDate=${encodeURIComponent(hireDate)}` +
            `&paymentDay=${encodeURIComponent(paymentDay)}` +
            
            // 法定扣款 (6個參數)
            `&pensionSelfRate=${encodeURIComponent(pensionSelfRate)}` +
            `&laborFee=${encodeURIComponent(laborFee)}` +
            `&healthFee=${encodeURIComponent(healthFee)}` +
            `&employmentFee=${encodeURIComponent(employmentFee)}` +
            `&pensionSelf=${encodeURIComponent(pensionSelf)}` +
            `&incomeTax=${encodeURIComponent(incomeTax)}` +
            
            // 其他扣款 (4個參數)
            `&welfareFee=${encodeURIComponent(welfareFee)}` +
            `&dormitoryFee=${encodeURIComponent(dormitoryFee)}` +
            `&groupInsurance=${encodeURIComponent(groupInsurance)}` +
            `&otherDeductions=${encodeURIComponent(otherDeductions)}` +
            
            // 備註
            `&note=${encodeURIComponent(note)}` +
            
            // 自訂項目（管理員在「公司層級設定」定義，金額存成 {代碼: 金額}）
            `&customItems=${encodeURIComponent(JSON.stringify(
                typeof collectCustomItemValues === 'function' ? collectCustomItemValues() : {}
            ))}`;
        
        console.log(' 送出參數:', queryString);
        
        const res = await callApifetch(`setEmployeeSalaryTW&${queryString}`);
        
        if (res.ok) {
            showNotification(t('SALARY_SAVE_SUCCESS'), 'success');
            e.target.reset();
            
            // 重置所有輸入欄位為 0
            const resetFields = [
                'config-position-allowance',
                'config-meal-allowance',
                'config-transport-allowance',
                'config-attendance-bonus',
                'config-performance-bonus',
                'config-other-allowances',
                'config-welfare-fee',
                'config-dormitory-fee',
                'config-group-insurance',
                'config-other-deductions',
                'config-labor-fee',
                'config-health-fee',
                'config-employment-fee',
                'config-pension-self',
                'config-income-tax',
                'config-pension-rate'
            ];
            
            resetFields.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '0';
            });
            
            // 重置試算預覽
            if (typeof setCalculatedValues === 'function') {
                setCalculatedValues(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            }
        } else {
            showNotification(t('SALARY_SAVE_FAILED') + ': ' + (res.msg || res.message || t('UNKNOWN_ERROR')), 'error');

        }
        
    } catch (error) {
        console.error(' 設定薪資失敗:', error);
        showNotification(t('SALARY_SAVE_ERROR'), 'error');
    }
}
/**
 *  處理薪資計算
 */
async function handleSalaryCalculation() {
    const employeeIdEl = document.getElementById('calc-employee-id');
    const yearMonthEl = document.getElementById('calc-year-month');
    const resultEl = document.getElementById('salary-calculation-result');
    
    if (!employeeIdEl || !yearMonthEl || !resultEl) return;
    
    const employeeId = employeeIdEl.value.trim();
    const yearMonth = yearMonthEl.value;
    
    if (!employeeId || !yearMonth) {
        showNotification(t('SALARY_INPUT_EMPLOYEE_MONTH'), 'error');
        return;
    }
    
    try {
        showNotification(t('SALARY_CALCULATING'), 'info');
        
        const res = await callApifetch(`calculateMonthlySalary&employeeId=${encodeURIComponent(employeeId)}&yearMonth=${encodeURIComponent(yearMonth)}`);
        
        if (res.ok && res.data) {
            displaySalaryCalculation(res.data, resultEl);
            resultEl.style.display = 'block';
            showNotification(t('SALARY_CALC_SUCCESS'), 'success');
            
            // 算完直接存檔（要修正就重算覆蓋），不再多問一次
            await saveSalaryRecord(res.data);
        } else {
            showNotification(t('SALARY_CALC_FAILED') + ': ' + (res.msg || t('UNKNOWN_ERROR')), 'error');

        }
        
    } catch (error) {
        console.error(' 計算薪資失敗:', error);
        showNotification(t('SALARY_CALC_ERROR'), 'error');
    }
}

/**
 *  顯示薪資計算結果（支援月薪/時薪區分 + 國定假日完整版）
 */
function displaySalaryCalculation(data, container) {
    if (!container) return;
    
    // 記住這次的計算結果，列印薪資明細時直接用，不再向後端要一次
    if (typeof setLastCalculatedSalary === 'function') setLastCalculatedSalary(data);
    
    // 計算扣款總額
    const totalDeductions = 
        (parseFloat(data.laborFee) || 0) + 
        (parseFloat(data.healthFee) || 0) + 
        (parseFloat(data.employmentFee) || 0) + 
        (parseFloat(data.pensionSelf) || 0) + 
        (parseFloat(data.incomeTax) || 0) + 
        (parseFloat(data.leaveDeduction) || 0) +
        (parseFloat(data.earlyLeaveDeduction || data['早退扣款']) || 0) +
        (parseFloat(data.welfareFee) || 0) +
        (parseFloat(data.dormitoryFee) || 0) +
        (parseFloat(data.groupInsurance) || 0) +
        (parseFloat(data.otherDeductions) || 0);
    
    const isHourly = data.salaryType === '時薪';
    
    //  修正：讀取四種加班費 + 國定假日出勤薪資
    const weekdayOvertimePay = parseFloat(data.weekdayOvertimePay) || 0;
    const restdayOvertimePay = parseFloat(data.restdayOvertimePay) || 0;
    const holidayWorkPay = parseFloat(data.holidayWorkPay) || 0;          //  新增
    const holidayOvertimePay = parseFloat(data.holidayOvertimePay) || 0;
    const totalOvertimeHours = parseFloat(data.totalOvertimeHours) || 0;
    
    //  修正：病假/事假明細（改用時數）
    const sickLeaveHours = parseFloat(data.sickLeaveHours) || 0;  //  改名
    const sickLeaveDeduction = parseFloat(data.sickLeaveDeduction) || 0;
    const personalLeaveHours = parseFloat(data.personalLeaveHours) || 0;  //  改名
    const personalLeaveDeduction = parseFloat(data.personalLeaveDeduction) || 0;
    //  新增：早退扣款變數
    const earlyLeaveDeduction = parseFloat(data.earlyLeaveDeduction || data['早退扣款']) || 0;
    container.innerHTML = `
        <div class="calculation-card">
            <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
                <button type="button" onclick="printPayslip()"
                        class="tab-btn" style="padding:6px 14px;">
                    ${escapeHtml(t('PAYSLIP_PRINT_BTN'))}
                </button>
            </div>
            <h3 class="text-xl font-bold mb-4">
                ${tHtml('SALARY_CALC_RESULT_TITLE', { name: data.employeeName || '--', month: data.yearMonth || '--' })}
                <span class="ml-2 px-3 py-1 text-sm rounded-full ${isHourly ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'}">
                    ${escapeHtml(salaryValueLabel(data.salaryType || '月薪'))}
                </span>
            </h3>
            
            <!-- 三大金額卡片 -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="info-card" style="background: var(--positive-soft, rgba(34, 197, 94, 0.1)); border-color: transparent;">
                    <div class="info-label">${tHtml('SALARY_GROSS')}</div>
                    <div class="info-value" style="color: var(--positive, #22c55e);">${formatCurrency(data.grossSalary)}</div>
                </div>
                <div class="info-card" style="background: var(--negative-soft, rgba(239, 68, 68, 0.1)); border-color: transparent;">
                    <div class="info-label">${tHtml('SALARY_DEDUCTIONS')}</div>
                    <div class="info-value" style="color: var(--negative, #ef4444);">${formatCurrency(totalDeductions)}</div>
                </div>
                <div class="info-card" style="background: var(--accent-soft, rgba(168, 85, 247, 0.1)); border-color: transparent;">
                    <div class="info-label">${tHtml('SALARY_NET')}</div>
                    <div class="info-value" style="color: var(--accent-text, #a855f7);">${formatCurrency(data.netSalary)}</div>
                </div>
            </div>
            
            <!--  時薪工時統計區塊 -->
            ${isHourly ? `
                <div class="bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-700 rounded-lg p-4 mb-6">
                    <h4 class="font-semibold text-purple-800 dark:text-purple-300 mb-3"> ${tHtml('SALARY_HOURLY_STATS_TITLE')}</h4>
                    <div class="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <p class="text-sm text-purple-600 dark:text-purple-400">${tHtml('HOURLY_RATE_LABEL')}</p>
                            <p class="text-2xl font-bold text-purple-800 dark:text-purple-200">$${data.hourlyRate || 0}</p>
                        </div>
                        <div>
                            <p class="text-sm text-purple-600 dark:text-purple-400">${tHtml('WORK_HOURS')}</p>
                            <p class="text-2xl font-bold text-purple-800 dark:text-purple-200">${Math.floor(data.totalWorkHours || 0)}h</p>
                        </div>
                        <div>
                            <p class="text-sm text-purple-600 dark:text-purple-400">${tHtml('SALARY_BASE')}</p>
                            <p class="text-xl font-bold text-purple-800 dark:text-purple-200">${formatCurrency(data.baseSalary)}</p>
                            <p class="text-xs text-purple-500">${tHtml('SALARY_WH_BASE_FORMULA')}</p>
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <!--  加班統計區塊（完整版：含國定假日） -->
            ${totalOvertimeHours > 0 ? `
                <div class="bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-700 rounded-lg p-4 mb-6">
                    <h4 class="font-semibold text-orange-800 dark:text-orange-300 mb-3"> ${tHtml('SALARY_OT_MONTH_TITLE')}</h4>
                    
                    <!-- 總時數 -->
                    <div class="text-center p-3 bg-orange-100 dark:bg-orange-800/30 rounded-lg mb-3">
                        <p class="text-sm text-orange-600 dark:text-orange-400">${tHtml('SALARY_OT_TOTAL_HOURS')}</p>
                        <p class="text-3xl font-bold text-orange-800 dark:text-orange-200">${totalOvertimeHours.toFixed(1)}h</p>
                    </div>
                    
                    <!-- 分類明細 -->
                    <div class="space-y-2">
                        ${weekdayOvertimePay > 0 ? `
                            <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg border border-blue-300 dark:border-blue-700">
                                <div class="flex justify-between items-center">
                                    <div>
                                        <span class="font-semibold text-blue-800 dark:text-blue-300">${tHtml('SALARY_OT_WEEKDAY')}</span>
                                        <span class="text-xs text-blue-600 dark:text-blue-400 ml-2">${tHtml('SALARY_OT_WEEKDAY_DAYS')}</span>
                                    </div>
                                    <span class="text-lg font-bold text-blue-800 dark:text-blue-200">${formatCurrency(weekdayOvertimePay)}</span>
                                </div>
                                <p class="text-xs text-blue-600 dark:text-blue-400 mt-1">${tHtml('SALARY_OT_WEEKDAY_RULE')}</p>
                            </div>
                        ` : ''}
                        
                        ${restdayOvertimePay > 0 ? `
                            <div class="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg border border-purple-300 dark:border-purple-700">
                                <div class="flex justify-between items-center">
                                    <div>
                                        <span class="font-semibold text-purple-800 dark:text-purple-300">${tHtml('SALARY_OT_RESTDAY')}</span>
                                        <span class="text-xs text-purple-600 dark:text-purple-400 ml-2">${tHtml('SALARY_OT_RESTDAY_DAYS')}</span>
                                    </div>
                                    <span class="text-lg font-bold text-purple-800 dark:text-purple-200">${formatCurrency(restdayOvertimePay)}</span>
                                </div>
                                <p class="text-xs text-purple-600 dark:text-purple-400 mt-1">${tHtml('SALARY_OT_RESTDAY_RULE')}</p>
                            </div>
                        ` : ''}
                        
                        ${holidayWorkPay > 0 || holidayOvertimePay > 0 ? `
                            <div class="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg border border-red-300 dark:border-red-700">
                                <div class="flex justify-between items-center mb-2">
                                    <div>
                                        <span class="font-semibold text-red-800 dark:text-red-300"> ${tHtml('SALARY_OT_HOLIDAY_WORK')}</span>
                                    </div>
                                    <span class="text-lg font-bold text-red-800 dark:text-red-200">${formatCurrency(holidayWorkPay + holidayOvertimePay)}</span>
                                </div>
                                
                                <!--  分開顯示正常薪資與加班費 -->
                                <div class="text-xs space-y-1 mt-2 border-t border-red-200 dark:border-red-700/30 pt-2">
                                    ${holidayWorkPay > 0 ? `
                                        <div class="flex justify-between">
                                            <span class="text-red-600 dark:text-red-400">${tHtml('SALARY_OT_HOLIDAY_NORMAL_PAY')}</span>
                                            <span class="font-mono text-red-700 dark:text-red-300">${formatCurrency(holidayWorkPay)}</span>
                                        </div>
                                    ` : ''}
                                    ${holidayOvertimePay > 0 ? `
                                        <div class="flex justify-between">
                                            <span class="text-red-600 dark:text-red-400">${tHtml('SALARY_OT_HOLIDAY_OT_PAY')}</span>
                                            <span class="font-mono text-red-700 dark:text-red-300">${formatCurrency(holidayOvertimePay)}</span>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
            
            <!-- 應發項目 vs 扣款項目 -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!--  應發項目 -->
                <div class="calculation-detail">
                    <h4 class="font-semibold mb-3 text-green-600 dark:text-green-400"> ${tHtml('SALARY_EARNINGS_TITLE')}</h4>
                    
                    ${isHourly ? `
                        <div class="calculation-row">
                            <span>${tHtml('HOURLY_RATE_LABEL')}</span>
                            <span class="font-mono">$${data.hourlyRate || 0}</span>
                        </div>
                        <div class="calculation-row">
                            <span>${tHtml('WORK_HOURS')}</span>
                            <span class="font-mono">${(data.totalWorkHours || 0).toFixed(1)}h</span>
                        </div>
                        <div class="calculation-row">
                            <span>${tHtml('SALARY_BASE_HOURLY_FORMULA')}</span>
                            <span class="font-mono">${formatCurrency(data.baseSalary)}</span>
                        </div>
                    ` : `
                        <div class="calculation-row">
                            <span>${tHtml('SALARY_BASE')}</span>
                            <span class="font-mono">${formatCurrency(data.baseSalary)}</span>
                        </div>
                    `}
                    
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_POSITION_ALLOWANCE')}</span>
                        <span class="font-mono">${formatCurrency(data.positionAllowance || 0)}</span>
                    </div>
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_MEAL_ALLOWANCE')}</span>
                        <span class="font-mono">${formatCurrency(data.mealAllowance || 0)}</span>
                    </div>
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_TRANSPORT_ALLOWANCE')}</span>
                        <span class="font-mono">${formatCurrency(data.transportAllowance || 0)}</span>
                    </div>
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_ATTENDANCE_BONUS')}</span>
                        <span class="font-mono">${formatCurrency(data.attendanceBonus || 0)}</span>
                    </div>
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_PERFORMANCE_BONUS')}</span>
                        <span class="font-mono">${formatCurrency(data.performanceBonus || 0)}</span>
                    </div>
                    
                    ${weekdayOvertimePay > 0 ? `
                        <div class="calculation-row">
                            <span>${tHtml('SALARY_WEEKDAY_OT')}</span>
                            <span class="font-mono">${formatCurrency(weekdayOvertimePay)}</span>
                        </div>
                    ` : ''}
                    
                    ${restdayOvertimePay > 0 ? `
                        <div class="calculation-row">
                            <span>${tHtml('SALARY_REST_OT')}</span>
                            <span class="font-mono">${formatCurrency(restdayOvertimePay)}</span>
                        </div>
                    ` : ''}
                    
                    ${holidayWorkPay > 0 ? `
                        <div class="calculation-row">
                            <span>${tHtml('SALARY_HOLIDAY_WORK_PAY')}</span>
                            <span class="font-mono">${formatCurrency(holidayWorkPay)}</span>
                        </div>
                    ` : ''}
                    
                    ${holidayOvertimePay > 0 ? `
                        <div class="calculation-row">
                            <span>${tHtml('SALARY_HOLIDAY_OT')}</span>
                            <span class="font-mono">${formatCurrency(holidayOvertimePay)}</span>
                        </div>
                    ` : ''}
                    
                    <div class="calculation-row total">
                        <span>${tHtml('SALARY_GROSS')}</span>
                        <span>${formatCurrency(data.grossSalary)}</span>
                    </div>
                </div>
                
                <!--  扣款項目 -->
                <div class="calculation-detail">
                    <h4 class="font-semibold mb-3 text-red-600 dark:text-red-400"> ${tHtml('SALARY_DEDUCTIONS_TITLE')}</h4>
                    
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_LABOR_INS')}</span>
                        <span class="font-mono">${formatCurrency(data.laborFee)}</span>
                    </div>
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_HEALTH_INS')}</span>
                        <span class="font-mono">${formatCurrency(data.healthFee)}</span>
                    </div>
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_EMPLOYMENT_INS')}</span>
                        <span class="font-mono">${formatCurrency(data.employmentFee)}</span>
                    </div>
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_PENSION_WITH_RATE', { rate: data.pensionSelfRate || 0 })}</span>
                        <span class="font-mono">${formatCurrency(data.pensionSelf)}</span>
                    </div>
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_TAX')}</span>
                        <span class="font-mono">${formatCurrency(data.incomeTax)}</span>
                    </div>
                    
                    ${!isHourly && data.leaveDeduction > 0 ? `
                        <div class="calculation-row">
                            <span>${tHtml('SALARY_LEAVE_DEDUCT')}</span>
                            <span class="font-mono">${formatCurrency(data.leaveDeduction)}</span>
                        </div>

                        <!--  病假/事假明細 -->
                        ${sickLeaveHours > 0 || personalLeaveHours > 0 ? `
                            <div class="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg mt-2 mb-2 border border-yellow-200 dark:border-yellow-700/30">
                                <div class="text-xs space-y-1">
                                    ${sickLeaveHours > 0 ? `
                                        <div class="flex justify-between">
                                            <span class="text-yellow-700 dark:text-yellow-300">${tHtml('SALARY_SICK_LEAVE_LINE', { hours: sickLeaveHours })}</span>
                                            <span class="font-mono text-yellow-700 dark:text-yellow-200">${formatCurrency(sickLeaveDeduction)}</span>
                                        </div>
                                    ` : ''}
                                    ${personalLeaveHours > 0 ? `
                                        <div class="flex justify-between">
                                            <span class="text-yellow-700 dark:text-yellow-300">${tHtml('SALARY_PERSONAL_LEAVE_LINE', { hours: personalLeaveHours })}</span>
                                            <span class="font-mono text-yellow-700 dark:text-yellow-200">${formatCurrency(personalLeaveDeduction)}</span>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}
                    ` : ''}
                    
                    <!--  新增：早退扣款 -->
                    ${!isHourly && earlyLeaveDeduction > 0 ? `
                        <div class="calculation-row">
                            <span>${tHtml('SALARY_EARLY_LEAVE_DEDUCT')}</span>
                            <span class="font-mono">${formatCurrency(earlyLeaveDeduction)}</span>
                        </div>
                    ` : ''}
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_WELFARE_FEE_LABEL')}</span>
                        <span class="font-mono">${formatCurrency(data.welfareFee || 0)}</span>
                    </div>
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_DORMITORY_FEE_LABEL')}</span>
                        <span class="font-mono">${formatCurrency(data.dormitoryFee || 0)}</span>
                    </div>
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_GROUP_INSURANCE_LABEL')}</span>
                        <span class="font-mono">${formatCurrency(data.groupInsurance || 0)}</span>
                    </div>
                    <div class="calculation-row">
                        <span>${tHtml('SALARY_OTHER_DEDUCT')}</span>
                        <span class="font-mono">${formatCurrency(data.otherDeductions || 0)}</span>
                    </div>
                    
                    <div class="calculation-row total">
                        <span>${tHtml('SALARY_NET')}</span>
                        <span>${formatCurrency(data.netSalary)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}
/**
 *  儲存薪資記錄（修正版 - 包含所有必要欄位）
 */
async function saveSalaryRecord(data) {
    try {
        showNotification(t('SALARY_SAVING_RECORD'), 'info');
        
        //  修正：加入完整的欄位（特別是 salaryType, hourlyRate, totalWorkHours）
        const queryString = 
            `employeeId=${encodeURIComponent(data.employeeId)}` +
            `&employeeName=${encodeURIComponent(data.employeeName)}` +
            `&yearMonth=${encodeURIComponent(data.yearMonth)}` +
            
            //  新增：薪資類型相關欄位
            `&salaryType=${encodeURIComponent(data.salaryType || '月薪')}` +
            `&hourlyRate=${encodeURIComponent(data.hourlyRate || 0)}` +
            `&totalWorkHours=${encodeURIComponent(data.totalWorkHours || 0)}` +
            `&totalOvertimeHours=${encodeURIComponent(data.totalOvertimeHours || 0)}` +
            
            // 應發項目
            `&baseSalary=${encodeURIComponent(data.baseSalary)}` +
            `&positionAllowance=${encodeURIComponent(data.positionAllowance || 0)}` +
            `&mealAllowance=${encodeURIComponent(data.mealAllowance || 0)}` +
            `&transportAllowance=${encodeURIComponent(data.transportAllowance || 0)}` +
            `&attendanceBonus=${encodeURIComponent(data.attendanceBonus || 0)}` +
            `&performanceBonus=${encodeURIComponent(data.performanceBonus || 0)}` +
            `&otherAllowances=${encodeURIComponent(data.otherAllowances || 0)}` +
            
            //  修正：加班費（三種）
            `&weekdayOvertimePay=${encodeURIComponent(data.weekdayOvertimePay || 0)}` +
            `&restdayOvertimePay=${encodeURIComponent(data.restdayOvertimePay || 0)}` +
            `&holidayOvertimePay=${encodeURIComponent(data.holidayOvertimePay || 0)}` +
            
            // 法定扣款
            `&laborFee=${encodeURIComponent(data.laborFee || 0)}` +
            `&healthFee=${encodeURIComponent(data.healthFee || 0)}` +
            `&employmentFee=${encodeURIComponent(data.employmentFee || 0)}` +
            `&pensionSelf=${encodeURIComponent(data.pensionSelf || 0)}` +
            `&pensionSelfRate=${encodeURIComponent(data.pensionSelfRate || 0)}` +
            `&incomeTax=${encodeURIComponent(data.incomeTax || 0)}` +
            
            // 其他扣款
            `&leaveDeduction=${encodeURIComponent(data.leaveDeduction || 0)}` +
            `&welfareFee=${encodeURIComponent(data.welfareFee || 0)}` +
            `&dormitoryFee=${encodeURIComponent(data.dormitoryFee || 0)}` +
            `&groupInsurance=${encodeURIComponent(data.groupInsurance || 0)}` +
            `&otherDeductions=${encodeURIComponent(data.otherDeductions || 0)}` +
            
            // 總計
            `&grossSalary=${encodeURIComponent(data.grossSalary)}` +
            `&netSalary=${encodeURIComponent(data.netSalary)}` +
            
            // 銀行資訊
            `&bankCode=${encodeURIComponent(data.bankCode || '')}` +
            `&bankAccount=${encodeURIComponent(data.bankAccount || '')}` +
            
            // 狀態
            `&status=${encodeURIComponent(data.status || '已計算')}` +
            `&note=${encodeURIComponent(data.note || '')}`;
        
        console.log(' 儲存薪資記錄，包含參數:', {
            employeeId: data.employeeId,
            yearMonth: data.yearMonth,
            salaryType: data.salaryType,  //  確認有傳遞
            hourlyRate: data.hourlyRate,
            totalWorkHours: data.totalWorkHours
        });
        
        const res = await callApifetch(`saveMonthlySalary&${queryString}`);
        
        if (res.ok) {
            showNotification(t('SALARY_RECORD_SAVED'), 'success');
        } else {
            showNotification(t('SALARY_SAVE_FAILED') + ': ' + (res.msg || t('UNKNOWN_ERROR')), 'error');
        }
        
    } catch (error) {
        console.error(' 儲存薪資單失敗:', error);
        showNotification(t('SALARY_SAVE_ERROR'), 'error');
    }
}

/**
 * 載入所有員工薪資列表
 */
async function loadAllEmployeeSalaryFromList() {
    const yearMonthEl = document.getElementById('filter-year-month-list');
    const loadingEl = document.getElementById('all-salary-loading-list');
    const listEl = document.getElementById('all-salary-list-content');
    
    if (!yearMonthEl || !loadingEl || !listEl) return;
    
    const yearMonth = yearMonthEl.value;
    
    if (!yearMonth) {
        showNotification(t('SALARY_SELECT_MONTH'), 'error');
        return;
    }
    
    try {
        loadingEl.style.display = 'block';
        listEl.innerHTML = '';
        
        const res = await callApifetch(`getAllMonthlySalary&yearMonth=${encodeURIComponent(yearMonth)}`);
        
        loadingEl.style.display = 'none';
        
        if (res.ok && res.data && res.data.length > 0) {
            res.data.forEach(salary => {
                const item = createAllSalaryItem(salary);
                listEl.appendChild(item);
            });
        } else {
            listEl.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400 py-8">' + tHtml('SALARY_NO_RECORD') + '</p>';
        }
        
    } catch (error) {
        console.error(' 載入薪資列表失敗:', error);
        loadingEl.style.display = 'none';
        listEl.innerHTML = '<p class="text-center text-red-600 dark:text-red-400 py-8">' + tHtml('LOAD_FAILED') + '</p>';
    }
}

/**
 * 建立所有員工薪資項目
 */
function createAllSalaryItem(salary) {
    const div = document.createElement('div');
    div.className = 'feature-box flex justify-between items-center hover:bg-gray-50 dark:hover:bg-white/10 transition cursor-pointer';
    
    div.innerHTML = `
        <div>
            <div class="font-semibold text-lg">
                ${escapeHtml(salary['員工姓名'] || '--')} <span class="text-gray-500 dark:text-gray-400 text-sm">(${escapeHtml(salary['員工ID'] || '--')})</span>
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                ${escapeHtml(salary['年月'] || '--')} | ${escapeHtml(salaryValueLabel(salary['狀態'] || '--'))}
            </div>
        </div>
        <div class="text-right">
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">
                ${formatCurrency(salary['實發金額'])}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                ${escapeHtml(getBankName(salary['銀行代碼']))} ${escapeHtml(salary['銀行帳號'] || '--')}
            </div>
        </div>
    `;
    
    return div;
}

// ==================== 工具函數 ====================

/**
 * 格式化貨幣
 */
/**
 * 翻譯後要放進 innerHTML 用：翻譯字串與帶入的參數一起跳脫，參數請傳原始值
 */
function tHtml(key, params) {
    return escapeHtml(t(key, params));
}

/**
 * 後端存的是中文值（薪資類型、狀態、獎金類型）。
 * 程式比對要用原值，只有顯示時才換成目前語系的文字。
 */
const SALARY_VALUE_KEYS = {
    '月薪': 'SALARY_TYPE_MONTHLY',
    '時薪': 'SALARY_TYPE_HOURLY',
    '週薪': 'SALARY_TYPE_WEEKLY',
    '已計算': 'SALARY_STATUS_CALCULATED',
    '已發放': 'BONUS_STATUS_PAID',
    '待發放': 'BONUS_STATUS_PENDING',
    '春節獎金': 'BONUS_TYPE_SPRING',
    '端午節獎金': 'BONUS_TYPE_DRAGON_BOAT',
    '中秋節獎金': 'BONUS_TYPE_MID_AUTUMN'
};

function salaryValueLabel(value) {
    const key = SALARY_VALUE_KEYS[value];
    return key ? t(key) : value;
}

function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0';
    const num = parseFloat(amount);
    if (isNaN(num)) return '$0';
    return '$' + num.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * 取得銀行名稱
 */
function getBankName(code) {
    const banks = {
        // 公股銀行
        "004": "臺灣銀行",
        "005": "臺灣土地銀行",
        "006": "合作金庫商業銀行",
        "007": "第一商業銀行",
        "008": "華南商業銀行",
        "009": "彰化商業銀行",
        "011": "上海商業儲蓄銀行",
        "012": "台北富邦商業銀行",
        "013": "國泰世華商業銀行",
        "016": "高雄銀行",
        "017": "兆豐國際商業銀行",
        "050": "臺灣中小企業銀行",
        
        // 民營銀行
        "103": "臺灣新光商業銀行",
        "108": "陽信商業銀行",
        "118": "板信商業銀行",
        "147": "三信商業銀行",
        "803": "聯邦商業銀行",
        "805": "遠東國際商業銀行",
        "806": "元大商業銀行",
        "807": "永豐商業銀行",
        "808": "玉山商業銀行",
        "809": "凱基商業銀行",
        "810": "星展（台灣）商業銀行",
        "812": "台新國際商業銀行",
        "816": "安泰商業銀行",
        "822": "中國信託商業銀行",
        "826": "樂天國際商業銀行",
        
        // 外商銀行
        "052": "渣打國際商業銀行",
        "081": "匯豐（台灣）商業銀行",
        "101": "瑞興商業銀行",
        "102": "華泰商業銀行",
        "815": "日盛國際商業銀行",
        "824": "連線商業銀行",
        
        // 郵局
        "700": "中華郵政"
    };
    
    return banks[code] || t('SALARY_UNKNOWN_BANK');
}

//  新方法：直接用 calculateMonthlySalary（跟時薪計算一樣）
async function loadAttendanceDetails(yearMonth) {
    try {
        console.log(` 載入 ${yearMonth} 出勤明細`);
        
        const detailsSection = document.getElementById('attendance-details-section');
        if (!detailsSection) return;
        
        //  改用跟時薪計算一樣的 API
        // 先取得當前使用者的 session
        const session = await callApifetch('checkSession');
        if (!session.ok || !session.user) {
            detailsSection.style.display = 'none';
            return;
        }
        
        const employeeId = session.user.userId;
        
        //  呼叫 calculateMonthlySalary（跟時薪計算完全一樣）
        const res = await callApifetch(`calculateMonthlySalary&employeeId=${encodeURIComponent(employeeId)}&yearMonth=${encodeURIComponent(yearMonth)}`);
        
        if (!res.ok || !res.data) {
            detailsSection.style.display = 'none';
            return;
        }
        
        const data = res.data;
        const salaryType = data.salaryType || '月薪';
        const isHourly = salaryType === '時薪';
        
        console.log(` 薪資類型: ${salaryType}, 是否為時薪: ${isHourly}`);
        
        // 顯示出勤明細區塊
        detailsSection.style.display = 'block';
        
        //  如果是時薪，顯示工作時數卡片（直接用 API 回傳的資料）
        if (isHourly) {
            displayWorkHoursFromCalculation(data);
        }
        
        // 顯示加班記錄（直接用 API 回傳的資料）
        if (data.totalOvertimeHours > 0) {
            displayOvertimeFromCalculation(data);
        }
        
    } catch (error) {
        console.error(' 載入出勤明細失敗:', error);
    }
}

function displayWorkHoursFromCalculation(data) {
    const detailsSection = document.getElementById('attendance-details-section');
    if (!detailsSection) return;
    
    const oldCard = document.getElementById('work-hours-card');
    if (oldCard) oldCard.remove();
    
    const workHoursCard = document.createElement('div');
    workHoursCard.id = 'work-hours-card';
    workHoursCard.className = 'feature-box bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 mb-4';
    
    //  修正：保留小數位數
    const totalWorkHours = parseFloat(data.totalWorkHours || 0).toFixed(1);
    const hourlyRate = data.hourlyRate || 0;
    const baseSalary = data.baseSalary || 0;
    
    workHoursCard.innerHTML = `
      <h4 class="font-semibold mb-3 text-purple-600 dark:text-purple-400">${tHtml('SALARY_WH_MONTH_TITLE')}</h4>
      
      <div class="grid grid-cols-3 gap-4 mb-4">
        <div class="text-center p-3 bg-purple-50 dark:bg-purple-800/20 rounded-lg">
          <p class="text-sm text-purple-700 dark:text-purple-300 mb-1">${tHtml('HOURLY_RATE_LABEL')}</p>
          <p class="text-2xl font-bold text-purple-700 dark:text-purple-200">$${hourlyRate}</p>
        </div>
        <div class="text-center p-3 bg-purple-50 dark:bg-purple-800/20 rounded-lg">
          <p class="text-sm text-purple-700 dark:text-purple-300 mb-1">${tHtml('SALARY_WH_TOTAL')}</p>
          <p class="text-2xl font-bold text-purple-700 dark:text-purple-200">${totalWorkHours}h</p>
        </div>
        <div class="text-center p-3 bg-purple-50 dark:bg-purple-800/20 rounded-lg">
          <p class="text-sm text-purple-700 dark:text-purple-300 mb-1">${tHtml('SALARY_BASE')}</p>
          <p class="text-2xl font-bold text-purple-700 dark:text-purple-200">${formatCurrency(baseSalary)}</p>
          <p class="text-xs text-purple-600 dark:text-purple-400 mt-1">${tHtml('SALARY_WH_BASE_FORMULA')}</p>
        </div>
      </div>
      
      <div class="p-3 bg-purple-50 dark:bg-purple-800/10 rounded-lg text-sm text-purple-700 dark:text-purple-300">
         ${tHtml('SALARY_WH_INCLUDED')}
      </div>
    `;
    
    detailsSection.insertBefore(workHoursCard, detailsSection.firstChild);
  }


  function displayOvertimeFromCalculation(data) {
    const detailsSection = document.getElementById('attendance-details-section');
    if (!detailsSection) return;
    
    const oldCard = document.getElementById('overtime-card');
    if (oldCard) oldCard.remove();
    
    const overtimeCard = document.createElement('div');
    overtimeCard.id = 'overtime-card';
    overtimeCard.className = 'feature-box bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700 mt-4';
    
    //  修正：正確讀取四種加班費 + 國定假日出勤薪資
    const totalOvertimeHours = Math.floor(data.totalOvertimeHours || 0);
    const weekdayOvertimePay = parseFloat(data.weekdayOvertimePay) || 0;
    const restdayOvertimePay = parseFloat(data.restdayOvertimePay) || 0;
    const holidayWorkPay = parseFloat(data.holidayWorkPay) || 0;          //  新增這行
    const holidayOvertimePay = parseFloat(data.holidayOvertimePay) || 0;
    
    console.log(' displayOvertimeFromCalculation 讀取的加班費:');
    console.log('   平日:', weekdayOvertimePay);
    console.log('   休息日:', restdayOvertimePay);
    console.log('   國定假日出勤薪資:', holidayWorkPay);               //  新增這行
    console.log('   國定假日加班費:', holidayOvertimePay);
    
    overtimeCard.innerHTML = `
        <h4 class="font-semibold mb-3 text-orange-600 dark:text-orange-400"> ${tHtml('SALARY_OT_MONTH_TITLE')}</h4>
        
        <!-- 總時數 -->
        <div class="text-center p-3 bg-orange-50 dark:bg-orange-800/20 rounded-lg mb-3">
            <p class="text-sm text-orange-700 dark:text-orange-300 mb-1">${tHtml('SALARY_OT_TOTAL_HOURS')}</p>
            <p class="text-3xl font-bold text-orange-700 dark:text-orange-200">${totalOvertimeHours}h</p>
        </div>
        
        <!--  關鍵修正：使用 space-y-2 垂直排列 -->
        <div class="space-y-2 mb-3">
            ${weekdayOvertimePay > 0 ? `
                <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg border border-blue-300 dark:border-blue-700">
                    <div class="flex justify-between items-center">
                        <div>
                            <span class="font-semibold text-blue-800 dark:text-blue-300">${tHtml('SALARY_OT_WEEKDAY')}</span>
                            <span class="text-xs text-blue-600 dark:text-blue-400 ml-2">${tHtml('SALARY_OT_WEEKDAY_DAYS')}</span>
                        </div>
                        <span class="text-lg font-bold text-blue-800 dark:text-blue-200">${formatCurrency(weekdayOvertimePay)}</span>
                    </div>
                    <p class="text-xs text-blue-600 dark:text-blue-400 mt-1">${tHtml('SALARY_OT_WEEKDAY_RULE')}</p>
                </div>
            ` : ''}
            
            ${restdayOvertimePay > 0 ? `
                <div class="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg border border-purple-300 dark:border-purple-700">
                    <div class="flex justify-between items-center">
                        <div>
                            <span class="font-semibold text-purple-800 dark:text-purple-300">${tHtml('SALARY_OT_RESTDAY')}</span>
                            <span class="text-xs text-purple-600 dark:text-purple-400 ml-2">${tHtml('SALARY_OT_RESTDAY_DAYS')}</span>
                        </div>
                        <span class="text-lg font-bold text-purple-800 dark:text-purple-200">${formatCurrency(restdayOvertimePay)}</span>
                    </div>
                    <p class="text-xs text-purple-600 dark:text-purple-400 mt-1">${tHtml('SALARY_OT_RESTDAY_RULE')}</p>
                </div>
            ` : ''}
            
            ${holidayWorkPay > 0 || holidayOvertimePay > 0 ? `
                <div class="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg border border-red-300 dark:border-red-700">
                    <div class="flex justify-between items-center mb-2">
                        <div>
                            <span class="font-semibold text-red-800 dark:text-red-300">${tHtml('SALARY_OT_HOLIDAY_WORK')}</span>
                        </div>
                        <span class="text-lg font-bold text-red-800 dark:text-red-200">${formatCurrency(holidayWorkPay + holidayOvertimePay)}</span>
                    </div>
                    
                    <!--  分開顯示正常薪資與加班費 -->
                    <div class="text-xs space-y-1 mt-2 border-t border-red-200 dark:border-red-700/30 pt-2">
                        ${holidayWorkPay > 0 ? `
                            <div class="flex justify-between">
                                <span class="text-red-600 dark:text-red-400">${tHtml('SALARY_OT_HOLIDAY_NORMAL_PAY')}</span>
                                <span class="font-mono text-red-700 dark:text-red-300">${formatCurrency(holidayWorkPay)}</span>
                            </div>
                        ` : ''}
                        ${holidayOvertimePay > 0 ? `
                            <div class="flex justify-between">
                                <span class="text-red-600 dark:text-red-400">${tHtml('SALARY_OT_HOLIDAY_OT_PAY')}</span>
                                <span class="font-mono text-red-700 dark:text-red-300">${formatCurrency(holidayOvertimePay)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    detailsSection.appendChild(overtimeCard);
}
/**
 *  載入打卡記錄
 */
async function loadPunchRecords(yearMonth) {
    const loadingEl = document.getElementById('punch-records-loading');
    const emptyEl = document.getElementById('punch-records-empty');
    const listEl = document.getElementById('punch-records-list');
    const totalEl = document.getElementById('total-work-hours');
    
    if (!loadingEl || !emptyEl || !listEl) return;
    
    try {
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        listEl.innerHTML = '';
        
        // 呼叫後端 API 取得打卡記錄
        const res = await callApifetch(`getEmployeeMonthlyAttendance&yearMonth=${yearMonth}`);
        
        loadingEl.style.display = 'none';
        
        if (res.ok && res.records && res.records.length > 0) {
            let totalHours = 0;
            
            res.records.forEach(record => {
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center p-2 bg-gray-50 dark:bg-white/5 rounded';
                
                const workHours = parseFloat(record.workHours) || 0;
                totalHours += workHours;
                // 一天可能有兩組上下班（兩頭班休息前打卡）：每一段都列出來
                const timeText = Array.isArray(record.segments) && record.segments.length
                    ? record.segments.map(seg => `${seg.start} ~ ${seg.end}`).join('、')
                    : `${record.punchIn || '--'} ~ ${record.punchOut || '--'}`;
                
                item.innerHTML = `
                    <div>
                        <span class="font-semibold">${escapeHtml(record.date)}</span>
                        <span class="text-sm text-gray-500 dark:text-gray-400 ml-2">
                            ${escapeHtml(timeText)}
                        </span>
                    </div>
                    <div class="text-right">
                        <span class="font-mono text-blue-600 dark:text-blue-400">${workHours.toFixed(2)}h</span>
                    </div>
                `;
                
                listEl.appendChild(item);
            });
            
            if (totalEl) {
                totalEl.textContent = t('SALARY_HOURS_VALUE', { hours: totalHours.toFixed(1) });
            }
            
        } else {
            emptyEl.style.display = 'block';
            if (totalEl) totalEl.textContent = t('SALARY_HOURS_VALUE', { hours: '0.0' });
        }
        
    } catch (error) {
        console.error(' 載入打卡記錄失敗:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
    }
}

/**
 *  載入加班記錄
 */
async function loadOvertimeRecords(yearMonth) {
    const loadingEl = document.getElementById('overtime-records-loading');
    const emptyEl = document.getElementById('overtime-records-empty');
    const listEl = document.getElementById('overtime-records-list');
    const totalEl = document.getElementById('total-overtime-hours');
    
    if (!loadingEl || !emptyEl || !listEl) return;
    
    try {
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        listEl.innerHTML = '';
        
        // 呼叫後端 API 取得加班記錄
        const res = await callApifetch(`getEmployeeMonthlyOvertime&yearMonth=${yearMonth}`);
        
        loadingEl.style.display = 'none';
        
        if (res.ok && res.records && res.records.length > 0) {
            let totalHours = 0;
            
            res.records.forEach(record => {
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center p-2 bg-gray-50 dark:bg-white/5 rounded';
                
                const hours = record.hours || 0;
                totalHours += hours;
                
                item.innerHTML = `
                    <div>
                        <span class="font-semibold">${escapeHtml(record.date)}</span>
                        <span class="text-sm text-gray-500 dark:text-gray-400 ml-2">${tHtml('STATUS_APPROVED')}</span>
                    </div>
                    <div class="text-right">
                        <span class="font-mono text-orange-600 dark:text-orange-400">${hours.toFixed(1)}h</span>
                    </div>
                `;
                
                listEl.appendChild(item);
            });
            
            if (totalEl) {
                totalEl.textContent = t('SALARY_HOURS_VALUE', { hours: totalHours.toFixed(1) });
            }
            
        } else {
            emptyEl.style.display = 'block';
            if (totalEl) totalEl.textContent = t('SALARY_HOURS_VALUE', { hours: '0.0' });
        }
        
    } catch (error) {
        console.error(' 載入加班記錄失敗:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
    }
}

// ==================== 薪資匯出功能（管理員專用） ====================

/**
 *  匯出所有員工薪資總表為 Excel（管理員專用）
 */
async function exportAllSalaryExcel() {
    try {
        console.log(' 開始匯出薪資總表');
        
        // 取得月份
        const yearMonthEl = document.getElementById('filter-year-month-list');
        const yearMonth = yearMonthEl ? yearMonthEl.value : '';
        
        if (!yearMonth) {
            showNotification(t('NOTIF_SELECT_MONTH_EXPORT'), 'error');
            return;
        }
        
        const token = localStorage.getItem('sessionToken');
        if (!token) {
            showNotification(t('NOTIF_LOGIN_REQUIRED'), 'error');
            return;
        }
        
        console.log(' 準備匯出:', { yearMonth, token: token ? '存在' : '不存在' });
        
        // 顯示進度
        showExportProgress(t('SALARY_EXPORT_PROGRESS'));
        
        // 走 api.js，token 才不會被串在網址上（見 config.js 的 useHttpPost）
        const result = await apiRequestJson(
            `exportAllSalaryExcel&yearMonth=${encodeURIComponent(yearMonth)}`);
        
        console.log(' 收到回應:', result);
        
        hideExportProgress();
        
        //  修正：正確判斷成功
        if (result.ok && result.fileUrl) {
            // 成功：開啟下載連結
            const url = safeHttpUrl(result.fileUrl);
            if (url) window.open(url, '_blank');
            
            showNotification(
                t('SALARY_EXPORT_SUCCESS_MSG', {
                    file: result.fileName || t('SALARY_EXPORT_DEFAULT_NAME'),
                    count: result.recordCount || 0
                }),
                'success'
            );
            
            // 顯示結果區塊（備用）
            displayExportResult({
                fileName: result.fileName,
                fileUrl: result.fileUrl,
                recordCount: result.recordCount
            });
            
        } else {
            throw new Error(result.msg || result.message || t('SALARY_EXPORT_FAILED'));
        }
        
    } catch (error) {
        hideExportProgress();
        console.error(' 匯出失敗:', error);
        showNotification(t('NOTIF_EXPORT_FAILED_MSG') + error.message, 'error');
    }
}

/**
 *  顯示匯出結果（備用方案）
 */
/**
 * 只放行 http(s) 網址，避免後端回傳的連結是 javascript: 之類的東西
 */
function safeHttpUrl(url) {
    if (!url) return '';
    try {
        const u = new URL(String(url || ''), location.href);
        return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
    } catch (e) {
        return '';
    }
}

function displayExportResult(data) {
    // 建立結果提示區塊
    let resultDiv = document.getElementById('export-result-box');
    
    if (!resultDiv) {
        resultDiv = document.createElement('div');
        resultDiv.id = 'export-result-box';
        resultDiv.className = 'mt-4 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-500 rounded-lg';
        
        const exportSection = document.querySelector('#admin-view .feature-box');
        if (exportSection) {
            exportSection.appendChild(resultDiv);
        }
    }
    
    resultDiv.innerHTML = `
        <div class="flex items-center justify-between">
            <div>
                <p class="font-semibold text-green-800 dark:text-green-300">
                     ${tHtml('SALARY_EXPORT_READY')}
                </p>
                <p class="text-sm text-green-700 dark:text-green-400">
                    ${tHtml('SALARY_EXPORT_FILE_NAME', { name: data.fileName })}<br>
                    ${tHtml('SALARY_EXPORT_RECORD_COUNT', { count: data.recordCount })}
                </p>
            </div>
            <a href="${escapeHtml(safeHttpUrl(data.fileUrl))}" 
               download="${escapeHtml(data.fileName)}.xlsx"
               class="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors">
                 ${tHtml('SALARY_EXPORT_REDOWNLOAD')}
            </a>
        </div>
    `;
    
    resultDiv.style.display = 'block';
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 *  顯示匯出進度
 */
function showExportProgress(message) {
    // 移除舊的進度提示（如果存在）
    const oldProgress = document.getElementById('export-progress-overlay');
    if (oldProgress) {
        oldProgress.remove();
    }
    
    // 建立新的進度提示
    const overlay = document.createElement('div');
    overlay.id = 'export-progress-overlay';
    overlay.className = 'export-progress-overlay';
    
    overlay.innerHTML = `
        <div class="export-progress">
            <div class="export-progress-spinner"></div>
            <div class="export-progress-text">${escapeHtml(message)}</div>
            <p class="export-progress-hint" style="color: var(--text-muted, #94a3b8);">
                ${tHtml('SALARY_EXPORT_WAIT')}
            </p>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

/**
 *  隱藏匯出進度
 */
function hideExportProgress() {
    const overlay = document.getElementById('export-progress-overlay');
    if (overlay) {
        overlay.remove();
    }
}

console.log(' 薪資匯出功能已載入（管理員專用）');

console.log(' 薪資管理系統（完整版 v2.0）JS 已載入');
console.log(' 包含：基本薪資 + 6項津貼 + 10項扣款');

/**
 *  呼叫 API：取得員工總工作時數
 * 
 * @param {string} yearMonth - 年月 (YYYY-MM)
 * @returns {Promise<Object>} { ok, totalWorkHours, workDays, records }
 */
async function getEmployeeWorkHours(yearMonth) {
    try {
      console.log(` 呼叫 API: getEmployeeWorkHours, 年月: ${yearMonth}`);
      
      const res = await callApifetch(`getEmployeeWorkHours&yearMonth=${encodeURIComponent(yearMonth)}`);
      
      if (res.ok && res.data) {
        console.log(` 總工作時數: ${res.data.totalWorkHours}h`);
        console.log(` 工作天數: ${res.data.workDays} 天`);
        return res;
      } else {
        console.error(' 取得工作時數失敗:', res.msg);
        return { ok: false, msg: res.msg };
      }
      
    } catch (error) {
      console.error(' 呼叫 API 失敗:', error);
      return { ok: false, msg: error.toString() };
    }
  }

// ==================== 週薪類型切換 ====================

function onSalaryTypeChange() {
    const type = document.getElementById('config-salary-type')?.value;
    const hint = document.getElementById('salary-type-hint');
    const baseHint = document.getElementById('base-salary-hint');

    if (!type) return;

    const hintMap = {
        '月薪': t('SALARY_TYPE_HINT_MONTHLY'),
        '時薪': t('SALARY_TYPE_HINT_HOURLY'),
        '週薪': t('SALARY_TYPE_HINT_WEEKLY')
    };
    const baseHintMap = {
        '月薪': t('SALARY_BASE_HINT_MONTHLY'),
        '時薪': t('SALARY_BASE_HINT_HOURLY'),
        '週薪': t('SALARY_BASE_HINT_WEEKLY')
    };

    if (hint) hint.textContent = hintMap[type] || '';
    if (baseHint) baseHint.textContent = baseHintMap[type] || '';

    // 週薪：法定扣款欄位清零並加提示
    const insuranceIds = ['config-labor-fee','config-health-fee','config-employment-fee',
                          'config-pension-self','config-income-tax','config-pension-rate'];
    const legalSection = document.getElementById('config-labor-fee')?.closest('.feature-box');

    if (type === '週薪') {
        insuranceIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = '0'; el.setAttribute('placeholder', t('SALARY_WEEKLY_NOT_APPLICABLE')); }
        });
        if (legalSection && !legalSection.querySelector('.weekly-notice')) {
            const notice = document.createElement('div');
            notice.className = 'weekly-notice mt-2 p-3 rounded-lg text-sm';
            notice.style.cssText = 'background:var(--warning-soft, rgba(245,158,11,0.15));border:1px solid var(--warning, rgba(245,158,11,0.4));color:var(--warning, #f59e0b);';
            notice.textContent = t('SALARY_WEEKLY_NOTICE');
            legalSection.prepend(notice);
        }
    } else {
        if (legalSection) {
            const notice = legalSection.querySelector('.weekly-notice');
            if (notice) notice.remove();
        }
        insuranceIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.removeAttribute('placeholder');
        });
    }

    if (typeof autoCalculateDeductions === 'function') autoCalculateDeductions();
}

// ==================== 三節獎金前端功能 ====================

async function initBonusTab() {
    const select = document.getElementById('bonus-employee-select');
    if (!select) return;
    try {
        const res = await callApifetch('getAllUsers');
        if (res.ok && res.data) {
            select.innerHTML = '<option value="">' + tHtml('SALARY_SELECT_EMPLOYEE') + '</option>';
            res.data.forEach(emp => {
                const opt = document.createElement('option');
                opt.value = emp.userId || emp.lineUserId;
                opt.textContent = (emp.name || emp.displayName) + ' (' + (emp.dept || '') + ')';
                opt.dataset.name = emp.name || emp.displayName;
                opt.dataset.dept = emp.dept || '';
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('載入員工列表失敗:', e);
    }
}

function onBonusEmployeeSelect() {
    const select = document.getElementById('bonus-employee-select');
    const opt = select?.options[select.selectedIndex];
    if (!opt || !opt.value) return;
    const idEl = document.getElementById('bonus-employee-id');
    const nameEl = document.getElementById('bonus-employee-name');
    if (idEl) idEl.value = opt.value;
    if (nameEl) nameEl.value = opt.dataset.name || '';
}

async function loadBonusRecords() {
    const year = document.getElementById('bonus-year-filter')?.value || '';
    const loading = document.getElementById('bonus-loading');
    const empty = document.getElementById('bonus-empty');
    const list = document.getElementById('bonus-list');
    if (!list) return;

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    list.innerHTML = '';

    try {
        const isAdmin = (typeof currentUserRole !== 'undefined') && currentUserRole === 'admin';
        const action = isAdmin ? ('getAllBonusRecords&year=' + year) : ('getMyBonusRecords&year=' + year);
        const res = await callApifetch(action);
        if (loading) loading.style.display = 'none';
        if (res.ok && res.data && res.data.length > 0) {
            res.data.forEach(bonus => list.appendChild(createBonusItem(bonus)));
        } else {
            if (empty) empty.style.display = 'block';
        }
    } catch (e) {
        console.error('載入獎金失敗:', e);
        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'block';
    }
}

function createBonusItem(bonus) {
    const div = document.createElement('div');
    div.className = 'feature-box flex justify-between items-center';
    div.style.borderColor = 'var(--border, rgba(245,158,11,0.3))';
    const statusColor = bonus['狀態'] === '已發放' ? 'var(--positive, #22c55e)' : 'var(--warning, #f59e0b)';
    div.innerHTML =
        '<div>' +
            '<div class="font-semibold text-lg">' + escapeHtml(salaryValueLabel(bonus['獎金類型'] || '--')) + '</div>' +
            '<div class="text-sm" style="color:var(--text-muted, #94a3b8); margin-top:0.25rem;">' +
                tHtml('BONUS_YEAR_SUFFIX', { year: bonus['年度'] || '--' }) +
                (bonus['員工姓名'] ? ' · ' + escapeHtml(bonus['員工姓名']) : '') +
                (bonus['發放日期'] ? ' · ' + tHtml('BONUS_PAY_DATE', { date: bonus['發放日期'] }) : '') +
            '</div>' +
            (bonus['備註'] ? '<div class="text-xs" style="color:var(--text-subtle, #64748b); margin-top:0.25rem;">' + escapeHtml(bonus['備註']) + '</div>' : '') +
        '</div>' +
        '<div class="text-right">' +
            '<div class="text-2xl font-bold" style="color:var(--warning, #f59e0b);">' + formatCurrency(bonus['發放金額']) + '</div>' +
            '<div class="text-sm mt-1" style="color:' + statusColor + ';">' + escapeHtml(salaryValueLabel(bonus['狀態'] || '--')) + '</div>' +
        '</div>';
    return div;
}

async function submitBonusRecord() {
    const employeeId = document.getElementById('bonus-employee-id')?.value?.trim();
    const employeeName = document.getElementById('bonus-employee-name')?.value?.trim();
    const bonusType = document.getElementById('bonus-type')?.value;
    const year = document.getElementById('bonus-year')?.value;
    const amount = parseFloat(document.getElementById('bonus-amount')?.value) || 0;
    const payDate = document.getElementById('bonus-pay-date')?.value || '';
    const status = document.getElementById('bonus-status')?.value || '已發放';
    const note = document.getElementById('bonus-note')?.value?.trim() || '';

    if (!employeeId || !bonusType || !year || amount <= 0) {
        showNotification(t('NOTIF_BONUS_FIELDS_REQUIRED'), 'error');
        return;
    }

    const empOpt = Array.from(document.getElementById('bonus-employee-select')?.options || [])
                        .find(o => o.value === employeeId);
    const dept = empOpt?.dataset?.dept || '';

    try {
        showNotification(t('NOTIF_SAVING'), 'info');
        const qs = 'employeeId=' + encodeURIComponent(employeeId)
                 + '&employeeName=' + encodeURIComponent(employeeName)
                 + '&dept=' + encodeURIComponent(dept)
                 + '&bonusType=' + encodeURIComponent(bonusType)
                 + '&year=' + encodeURIComponent(year)
                 + '&amount=' + encodeURIComponent(amount)
                 + '&payDate=' + encodeURIComponent(payDate)
                 + '&status=' + encodeURIComponent(status)
                 + '&note=' + encodeURIComponent(note);
        const res = await callApifetch('setBonusRecord&' + qs);
        if (res.ok) {
            showNotification(t('NOTIF_BONUS_SAVED'), 'success');
            loadBonusRecords();
        } else {
            showNotification(t('NOTIF_SAVE_FAILED_MSG') + (res.msg || t('UNKNOWN_ERROR')), 'error');
        }
    } catch (e) {
        console.error('submitBonusRecord 錯誤:', e);
        showNotification(t('NOTIF_SAVE_FAILED'), 'error');
    }
}
