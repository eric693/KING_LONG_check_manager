// 管理員打卡分析：員工清單、月資料查詢與兩張 Chart.js 圖表
// 從 script.js 拆出。Chart.js 由 libs.js 的 ensureLib('chart') 延遲載入。

// ==================== 管理員打卡分析功能 ====================

let workHoursChart = null;
let punchTimeChart = null;

/**
 * 初始化管理員分析功能
 */
async function initAdminAnalysis() {
    await loadEmployeeListForAnalysis();
    
    //  新增：為工作日誌匯出載入員工列表
    const worklogExportSelect = document.getElementById('worklog-export-employee');
    if (worklogExportSelect) {
        try {
            const res = await callApifetch('getAllUsers');
            
            if (res.ok && res.users) {
                //  清空現有選項
                worklogExportSelect.innerHTML = '';
                
                //  加入「請選擇員工」
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = `-- ${t('SELECT_EMPLOYEE_PLACEHOLDER')} --`;
                worklogExportSelect.appendChild(defaultOption);
                
                //  加入「全部員工」選項
                const allOption = document.createElement('option');
                allOption.value = 'ALL';
                allOption.textContent = t('ALL_EMPLOYEES');
                worklogExportSelect.appendChild(allOption);
                
                //  加入每個員工
                res.users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.userId;
                    option.textContent = `${user.name} (${user.dept || t('UNCATEGORIZED')})`;
                    worklogExportSelect.appendChild(option);
                });
                
                console.log(' 工作日誌匯出員工選單載入成功');
            }
        } catch (error) {
            console.error(' 載入員工列表失敗:', error);
        }
    }
    
    // 設定預設月份
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const monthInput = document.getElementById('analysis-month');
    if (monthInput) {
        monthInput.value = defaultMonth;
    }
    
    const worklogMonthInput = document.getElementById('worklog-export-month');
    if (worklogMonthInput) {
        worklogMonthInput.value = defaultMonth;
    }
}
/**
 * 載入員工列表到下拉選單
 */
async function loadEmployeeListForAnalysis() {
    try {
        const res = await callApifetch('getAllUsers');
        
        if (res.ok && res.users) {
            const select = document.getElementById('analysis-employee');
            if (!select) return;
            
            select.innerHTML = `<option value="">${escapeHtml(t('SELECT_EMPLOYEE_PLACEHOLDER'))}</option>`;
            
            res.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.userId;
                option.textContent = `${user.name} (${user.dept || t('UNCATEGORIZED')})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('載入員工列表失敗:', error);
    }
}

/**
 * 載入打卡分析資料並繪製圖表
 */
async function loadPunchAnalysis() {
    const employeeId = document.getElementById('analysis-employee')?.value;
    const yearMonth = document.getElementById('analysis-month')?.value;
    
    if (!employeeId) {
        showNotification(t('NOTIF_SELECT_EMPLOYEE'), 'error');
        return;
    }
    
    if (!yearMonth) {
        showNotification(t('NOTIF_SELECT_MONTH'), 'error');
        return;
    }
    
    const loadingEl = document.getElementById('punch-analysis-loading');
    const containerEl = document.getElementById('punch-analysis-container');
    const emptyEl = document.getElementById('punch-analysis-empty');
    
    try {
        if (loadingEl) loadingEl.style.display = 'block';
        if (containerEl) containerEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';
        
        const res = await callApifetch(`getEmployeeMonthlyPunchData&employeeId=${employeeId}&yearMonth=${yearMonth}`);
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (res.ok && res.data && res.data.length > 0) {
            if (containerEl) containerEl.style.display = 'block';
            await renderCharts(res.data);
        } else {
            if (emptyEl) emptyEl.style.display = 'block';
        }
        
    } catch (error) {
        console.error('載入分析失敗:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        showNotification(t('NOTIF_LOAD_FAILED_RETRY'), 'error');
    }
}

/**
 * 繪製圖表
 */
async function renderCharts(data) {
    await ensureLib('chart'); // 進到分析畫面才載入 Chart.js
    const dates = data.map(d => d.date.substring(5));
    const workHours = data.map(d => d.workHours || 0);
    const punchInTimes = data.map(d => d.punchIn ? timeToDecimal(d.punchIn) : null);
    const punchOutTimes = data.map(d => d.punchOut ? timeToDecimal(d.punchOut) : null);
    
    renderWorkHoursChart(dates, workHours);
    renderPunchTimeChart(dates, punchInTimes, punchOutTimes);
}

/**
 * 繪製工作時數圖表
 */
function renderWorkHoursChart(dates, workHours) {
    const canvas = document.getElementById('work-hours-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (workHoursChart) {
        workHoursChart.destroy();
    }
    
    workHoursChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [{
                label: t('CHART_WORK_HOURS'),
                data: workHours,
                backgroundColor: 'rgba(79, 70, 229, 0.6)',
                borderColor: 'rgba(79, 70, 229, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: t('CHART_HOURS_AXIS')
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return t('HOURS_N', { n: context.parsed.y.toFixed(2) });
                        }
                    }
                }
            }
        }
    });
}

/**
 * 繪製打卡時間分布圖
 */
function renderPunchTimeChart(dates, punchInTimes, punchOutTimes) {
    const canvas = document.getElementById('punch-time-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (punchTimeChart) {
        punchTimeChart.destroy();
    }
    
    punchTimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: t('BTN_PUNCH_IN'),
                    data: punchInTimes,
                    borderColor: 'rgba(34, 197, 94, 1)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    fill: false,
                    tension: 0.1
                },
                {
                    label: t('BTN_PUNCH_OUT'),
                    data: punchOutTimes,
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    min: 6,
                    max: 22,
                    ticks: {
                        stepSize: 1,
                        callback: function(value) {
                            return `${Math.floor(value)}:${String(Math.round((value % 1) * 60)).padStart(2, '0')}`;
                        }
                    },
                    title: {
                        display: true,
                        text: t('CHART_TIME_AXIS')
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            const hours = Math.floor(value);
                            const minutes = Math.round((value % 1) * 60);
                            return `${context.dataset.label}: ${hours}:${String(minutes).padStart(2, '0')}`;
                        }
                    }
                }
            }
        }
    });
}
