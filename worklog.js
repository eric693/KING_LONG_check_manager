// ==================== 工作日誌功能 ====================

/**
 * 初始化工作日誌分頁
 */
async function initWorklogTab() {
    await loadWorklogRecords();
    setupWorklogForm();
}

/**
 * 設定工作日誌表單
 */
let worklogEventsBound = false; // 分頁每切一次就會重跑一次，事件只能綁一次

function setupWorklogForm() {
    const dateInput = document.getElementById('worklog-date');
    const hoursInput = document.getElementById('worklog-hours');
    const contentInput = document.getElementById('worklog-content');
    const submitBtn = document.getElementById('submit-worklog-btn');
    
    if (dateInput) {
        const today = todayStr();
        dateInput.value = today;
        dateInput.max = today;
    }
    
    if (worklogEventsBound) return; // 日期預設值每次都要更新，事件則只綁一次
    
    if (hoursInput) {
        hoursInput.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (value < 0) e.target.value = 0;
            if (value > 24) e.target.value = 24;
        });
    }
    
    if (submitBtn) {
        submitBtn.addEventListener('click', submitWorklog);
    }
    
    worklogEventsBound = true;
}

/**
 * 提交工作日誌
 */
async function submitWorklog() {
    const dateInput = document.getElementById('worklog-date');
    const hoursInput = document.getElementById('worklog-hours');
    const contentInput = document.getElementById('worklog-content');
    const submitBtn = document.getElementById('submit-worklog-btn');
    
    const date = dateInput?.value;
    const hours = parseFloat(hoursInput?.value);
    const content = contentInput?.value.trim();
    
    if (!date) {
        showNotification(t('WORKLOG_DATE_REQUIRED') || '請選擇日期', 'error');
        return;
    }
    
    if (!hours || hours <= 0) {
        showNotification(t('WORKLOG_HOURS_REQUIRED') || '請輸入工作時數', 'error');
        return;
    }
    
    if (!content || content.length < 10) {
        showNotification(t('WORKLOG_CONTENT_REQUIRED') || '請填寫工作內容（至少 10 個字）', 'error');
        return;
    }
    
    const loadingText = t('LOADING') || '提交中...';
    generalButtonState(submitBtn, 'processing', loadingText);
    
    try {
        const userId = localStorage.getItem('sessionUserId');
        
        const params = new URLSearchParams({
            date: date,
            hours: hours,
            content: content,
            userId: userId
        });
        
        const res = await callApifetch(`submitWorklog&${params.toString()}`);
        
        if (res.ok) {
            showNotification(t('WORKLOG_SUBMIT_SUCCESS') || '工作日誌提交成功！', 'success');
            
            if (hoursInput) hoursInput.value = '';
            if (contentInput) contentInput.value = '';
            
            await loadWorklogRecords();
        } else {
            showNotification(res.msg || t('WORKLOG_SUBMIT_FAILED') || '提交失敗', 'error');
        }
        
    } catch (error) {
        console.error('提交工作日誌失敗:', error);
        showNotification(t('NETWORK_ERROR') || '網路錯誤', 'error');
        
    } finally {
        generalButtonState(submitBtn, 'idle');
    }
}

/**
 * 載入工作日誌記錄
 */
async function loadWorklogRecords() {
    const loadingEl = document.getElementById('worklog-records-loading');
    const emptyEl = document.getElementById('worklog-records-empty');
    const listEl = document.getElementById('worklog-records-list');
    
    if (!listEl) return;
    
    try {
        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        listEl.innerHTML = '';
        
        const userId = localStorage.getItem('sessionUserId');
        const res = await callApifetch(`getWorklogs&userId=${userId}`);
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (res.ok && res.worklogs && res.worklogs.length > 0) {
            renderWorklogRecords(res.worklogs);
        } else {
            if (emptyEl) emptyEl.style.display = 'block';
        }
        
    } catch (error) {
        console.error('載入工作日誌失敗:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
    }
}

/**
 * 渲染工作日誌記錄
 */
function renderWorklogRecords(worklogs) {
    const listEl = document.getElementById('worklog-records-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    
    const sortedWorklogs = worklogs.sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
    });
    
    sortedWorklogs.forEach((log) => {
        const li = document.createElement('li');
        li.className = 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700';
        
        let workDateStr = log.date;
        if (log.date) {
            try {
                if (/^\d{4}-\d{2}-\d{2}$/.test(log.date)) {
                    workDateStr = log.date;
                } else if (log.date.includes('T')) {
                    const date = new Date(log.date);
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    workDateStr = `${year}-${month}-${day}`;
                }
            } catch (e) {
                workDateStr = log.date;
            }
        }
        
        let submittedTimeStr = '';
        if (log.submittedAt) {
            try {
                const submittedDate = new Date(log.submittedAt);
                submittedTimeStr = submittedDate.toLocaleString('zh-TW', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            } catch (e) {
                submittedTimeStr = log.submittedAt;
            }
        }
        
        const safeTranslate = (key, fallback) => {
            if (typeof t !== 'function') return fallback;
            const result = t(key);
            return (result && result !== key) ? result : fallback;
        };
        
        const unitHours = safeTranslate('UNIT_HOURS', '小時');
        const btnEdit = safeTranslate('BTN_EDIT', '編輯');
        const btnDelete = safeTranslate('BTN_DELETE', '刪除');
        const btnResubmit = safeTranslate('BTN_RESUBMIT', '重新提交');
        const reviewComment = safeTranslate('REVIEW_COMMENT', '審核意見');
        
        let statusClass = '';
        let statusText = '';
        let statusIcon = '';
        let actionButtons = '';
        
        switch(log.status) {
            case 'PENDING':
                statusClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
                statusText = safeTranslate('STATUS_PENDING', '待審核');
                statusIcon = '⏳';
                actionButtons = `
                    <button onclick="editWorklog('${log.id}')" 
                            class="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors">
                         ${btnEdit}
                    </button>
                    <button onclick="deleteWorklog('${log.id}')" 
                            class="px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors">
                         ${btnDelete}
                    </button>
                `;
                break;
            case 'APPROVED':
                statusClass = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
                statusText = safeTranslate('STATUS_APPROVED', '已核准');
                statusIcon = '';
                break;
            case 'REJECTED':
                statusClass = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
                statusText = safeTranslate('STATUS_REJECTED', '已拒絕');
                statusIcon = '';
                actionButtons = `
                    <button onclick="editWorklog('${log.id}')" 
                            class="px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-md transition-colors">
                         ${btnResubmit}
                    </button>
                `;
                break;
        }
        
        li.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div class="flex-1">
                    <div class="flex items-center space-x-2 mb-2">
                        <span class="font-bold text-gray-800 dark:text-white">${workDateStr}</span>
                        <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">
                            ${statusIcon} ${statusText}
                        </span>
                    </div>
                    <div class="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>⏱ ${log.hours} ${unitHours}</span>
                        ${submittedTimeStr ? `<span> ${submittedTimeStr}</span>` : ''}
                    </div>
                </div>
            </div>
            
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-3">
                <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${escapeHtml(log.content)}</p>
            </div>
            
            ${log.reviewComment ? `
                <div class="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-600 rounded p-3 mb-3">
                    <p class="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">
                         ${reviewComment}：
                    </p>
                    <p class="text-sm text-blue-700 dark:text-blue-400">${escapeHtml(log.reviewComment)}</p>
                </div>
            ` : ''}
            
            ${actionButtons ? `
                <div class="flex space-x-2 pt-3 border-t border-gray-200 dark:border-gray-600">
                    ${actionButtons}
                </div>
            ` : ''}
        `;
        
        listEl.appendChild(li);
    });
}

/**
 * 編輯工作日誌
 */
async function editWorklog(logId) {
    try {
        const res = await callApifetch(`getWorklogDetail&id=${logId}`);
        
        if (res.ok && res.worklog) {
            const log = res.worklog;
            
            const dateInput = document.getElementById('worklog-date');
            const hoursInput = document.getElementById('worklog-hours');
            const contentInput = document.getElementById('worklog-content');
            
            if (dateInput) dateInput.value = log.date;
            if (hoursInput) hoursInput.value = log.hours;
            if (contentInput) contentInput.value = log.content;
            
            document.getElementById('worklog-form-container')?.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
            
            const submitBtn = document.getElementById('submit-worklog-btn');
            if (submitBtn) {
                submitBtn.textContent = t('BTN_UPDATE') || '更新';
                submitBtn.onclick = () => updateWorklog(logId);
            }
            
            showNotification(t('WORKLOG_EDIT_MODE') || '進入編輯模式', 'info');
        }
        
    } catch (error) {
        console.error('載入工作日誌失敗:', error);
        showNotification(t('LOAD_FAILED') || '載入失敗', 'error');
    }
}

/**
 * 更新工作日誌
 */
async function updateWorklog(logId) {
    const dateInput = document.getElementById('worklog-date');
    const hoursInput = document.getElementById('worklog-hours');
    const contentInput = document.getElementById('worklog-content');
    const submitBtn = document.getElementById('submit-worklog-btn');
    
    const date = dateInput?.value;
    const hours = parseFloat(hoursInput?.value);
    const content = contentInput?.value.trim();
    
    if (!date || !hours || !content || content.length < 10) {
        showNotification(t('FORM_INCOMPLETE') || '請完整填寫表單', 'error');
        return;
    }
    
    const loadingText = t('UPDATING') || '更新中...';
    generalButtonState(submitBtn, 'processing', loadingText);
    
    try {
        const params = new URLSearchParams({
            id: logId,
            date: date,
            hours: hours,
            content: content
        });
        
        const res = await callApifetch(`updateWorklog&${params.toString()}`);
        
        if (res.ok) {
            showNotification(t('WORKLOG_UPDATE_SUCCESS') || '工作日誌更新成功！', 'success');
            
            if (hoursInput) hoursInput.value = '';
            if (contentInput) contentInput.value = '';
            submitBtn.textContent = t('BTN_SUBMIT_WORKLOG') || '提交工作日誌';
            submitBtn.onclick = submitWorklog;
            
            await loadWorklogRecords();
        } else {
            showNotification(res.msg || t('UPDATE_FAILED') || '更新失敗', 'error');
        }
        
    } catch (error) {
        console.error('更新工作日誌失敗:', error);
        showNotification(t('NETWORK_ERROR') || '網路錯誤', 'error');
        
    } finally {
        generalButtonState(submitBtn, 'idle');
    }
}

/**
 * 刪除工作日誌
 */
async function deleteWorklog(logId) {
    if (!confirm(t('WORKLOG_DELETE_CONFIRM') || '確定要刪除此工作日誌嗎？')) {
        return;
    }
    
    try {
        const res = await callApifetch(`deleteWorklog&id=${logId}`);
        
        if (res.ok) {
            showNotification(t('WORKLOG_DELETE_SUCCESS') || '工作日誌已刪除', 'success');
            await loadWorklogRecords();
        } else {
            showNotification(res.msg || t('DELETE_FAILED') || '刪除失敗', 'error');
        }
        
    } catch (error) {
        console.error('刪除工作日誌失敗:', error);
        showNotification(t('NETWORK_ERROR') || '網路錯誤', 'error');
    }
}

// ==================== 管理員功能 ====================

/**
 * 載入待審核的工作日誌
 */
async function loadPendingWorklogs() {
    if (typeof loadAdminPendingCounts === 'function') loadAdminPendingCounts();  // 管理員頁「審核」的數字跟著更新
    const loadingEl = document.getElementById('worklog-requests-loading');
    const emptyEl = document.getElementById('worklog-requests-empty');
    const listEl = document.getElementById('pending-worklog-list');
    
    if (!listEl) return;
    
    try {
        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        listEl.innerHTML = '';
        
        const res = await callApifetch('getPendingWorklogs');
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (res.ok && res.worklogs && res.worklogs.length > 0) {
            renderPendingWorklogs(res.worklogs);
        } else {
            if (emptyEl) emptyEl.style.display = 'block';
        }
        
    } catch (error) {
        console.error('載入待審核工作日誌失敗:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
    }
}

/**
 * 渲染待審核的工作日誌（完全多語言版）
 */
function renderPendingWorklogs(worklogs) {
    const listEl = document.getElementById('pending-worklog-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    
    //  安全翻譯函數
    const safeTranslate = (key, fallback) => {
        if (typeof t !== 'function') return fallback;
        const result = t(key);
        return (result && result !== key) ? result : fallback;
    };
    
    //  預先取得所有翻譯
    const unitHours = safeTranslate('UNIT_HOURS', '小時');
    const submittedAt = safeTranslate('SUBMITTED_AT', '提交於');
    const workContent = safeTranslate('WORK_CONTENT', '工作內容');
    const reviewCommentLabel = safeTranslate('REVIEW_COMMENT', '審核意見');
    const optionalLabel = safeTranslate('OPTIONAL', '選填');
    const reviewCommentPlaceholder = safeTranslate('REVIEW_COMMENT_PLACEHOLDER', '填寫審核意見（選填）...');
    const btnApprove = safeTranslate('BTN_APPROVE', '核准');
    const btnReject = safeTranslate('BTN_REJECT', '拒絕');
    const unknownEmployee = safeTranslate('UNKNOWN_EMPLOYEE', '未知員工');
    const uncategorized = safeTranslate('UNCATEGORIZED', '未分類');
    
    worklogs.forEach((log) => {
        const li = document.createElement('li');
        li.className = 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700';
        
        // 格式化工作日期
        let workDateStr = log.date;
        if (log.date) {
            try {
                if (/^\d{4}-\d{2}-\d{2}$/.test(log.date)) {
                    workDateStr = log.date;
                } else if (log.date.includes('T')) {
                    const date = new Date(log.date);
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    workDateStr = `${year}-${month}-${day}`;
                }
            } catch (e) {
                workDateStr = log.date;
            }
        }
        
        // 格式化提交時間
        let submittedTimeStr = '';
        if (log.submittedAt) {
            try {
                const submittedDate = new Date(log.submittedAt);
                submittedTimeStr = submittedDate.toLocaleString('zh-TW', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            } catch (e) {
                submittedTimeStr = log.submittedAt;
            }
        }
        
        li.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div class="flex-1">
                    <div class="flex items-center space-x-2 mb-2">
                        <span class="font-bold text-gray-800 dark:text-white">${escapeHtml(log.userName || unknownEmployee)}</span>
                        <span class="text-xs px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                            ${escapeHtml(log.department || uncategorized)}
                        </span>
                    </div>
                    <div class="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                        <span> ${workDateStr}</span>
                        <span>⏱ ${log.hours} ${unitHours}</span>
                        ${submittedTimeStr ? `<span> ${submittedAt} ${submittedTimeStr}</span>` : ''}
                    </div>
                </div>
            </div>
            
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-3">
                <p class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                     ${workContent}：
                </p>
                <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">${escapeHtml(log.content)}</p>
            </div>
            
            <div class="mb-3">
                <label for="review-comment-${log.id}" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                     ${reviewCommentLabel} <span class="text-xs text-gray-500">(${optionalLabel})</span>
                </label>
                <textarea id="review-comment-${log.id}" 
                          rows="2" 
                          placeholder="${reviewCommentPlaceholder}"
                          class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white text-sm"></textarea>
            </div>
            
            <div class="flex space-x-2">
                <button onclick="approveWorklog('${log.id}')" 
                        class="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md font-semibold transition-colors">
                     ${btnApprove}
                </button>
                <button onclick="rejectWorklog('${log.id}')" 
                        class="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md font-semibold transition-colors">
                     ${btnReject}
                </button>
            </div>
        `;
        
        listEl.appendChild(li);
    });
}

/**
 * 核准工作日誌
 */
async function approveWorklog(logId) {
    const commentInput = document.getElementById(`review-comment-${logId}`);
    const comment = commentInput?.value.trim() || '';
    
    try {
        const url = `reviewWorklog&worklogId=${encodeURIComponent(logId)}&reviewAction=approve&reviewComment=${encodeURIComponent(comment)}`;
        const res = await callApifetch(url);
        
        if (res.ok) {
            showNotification(t('WORKLOG_APPROVE_SUCCESS') || '工作日誌已核准', 'success');
            await loadPendingWorklogs();
        } else {
            showNotification(res.msg || t('APPROVE_FAILED') || '核准失敗', 'error');
        }
        
    } catch (error) {
        console.error('核准失敗:', error);
        showNotification(t('NETWORK_ERROR') || '網路錯誤', 'error');
    }
}

/**
 * 拒絕工作日誌
 */
async function rejectWorklog(logId) {
    const commentInput = document.getElementById(`review-comment-${logId}`);
    const comment = commentInput?.value.trim();
    
    if (!comment) {
        showNotification(t('REJECT_REASON_REQUIRED') || '請填寫拒絕原因', 'error');
        commentInput?.focus();
        return;
    }
    
    try {
        const url = `reviewWorklog&worklogId=${encodeURIComponent(logId)}&reviewAction=reject&reviewComment=${encodeURIComponent(comment)}`;
        const res = await callApifetch(url);
        
        if (res.ok) {
            showNotification(t('WORKLOG_REJECT_SUCCESS') || '工作日誌已拒絕', 'success');
            await loadPendingWorklogs();
        } else {
            showNotification(res.msg || t('REJECT_FAILED') || '拒絕失敗', 'error');
        }
        
    } catch (error) {
        console.error('拒絕失敗:', error);
        showNotification(t('NETWORK_ERROR') || '網路錯誤', 'error');
    }
}

/**
 * 匯出工作日誌報表（支援全部員工）
 */
async function exportWorklogReport() {
    await ensureLib('xlsx'); // 匯出時才載入 SheetJS
    const employeeSelect = document.getElementById('worklog-export-employee');
    const monthInput = document.getElementById('worklog-export-month');
    const exportBtn = document.getElementById('export-worklog-btn');
    
    if (!employeeSelect || !monthInput) return;
    
    const employeeId = employeeSelect.value;
    const yearMonth = monthInput.value;
    
    if (!employeeId) {
        showNotification(t('SELECT_EMPLOYEE_FIRST') || '請先選擇員工', 'error');
        return;
    }
    
    if (!yearMonth) {
        showNotification(t('SELECT_MONTH_FIRST') || '請先選擇月份', 'error');
        return;
    }
    
    const loadingText = t('PREPARING_REPORT') || '正在準備報表...';
    showNotification(loadingText, 'warning');
    
    if (exportBtn) {
        generalButtonState(exportBtn, 'processing', loadingText);
    }
    
    try {
        let employeeName, worklogs;
        
        if (employeeId === 'ALL') {
            employeeName = t('ALL_EMPLOYEES') || '全部員工';
            
            const res = await callApifetch(`getAllWorklogReport&yearMonth=${yearMonth}`);
            
            if (!res.ok || !res.worklogs || res.worklogs.length === 0) {
                showNotification(t('NO_WORKLOG_THIS_MONTH') || '本月沒有任何工作日誌', 'warning');
                return;
            }
            
            worklogs = res.worklogs;
            
        } else {
            employeeName = employeeSelect.options[employeeSelect.selectedIndex].text.split(' (')[0];
            
            const res = await callApifetch(`getWorklogReport&employeeId=${employeeId}&yearMonth=${yearMonth}`);
            
            if (!res.ok || !res.worklogs || !res.worklogs.length === 0) {
                showNotification(t('NO_WORKLOG_THIS_MONTH') || '本月沒有工作日誌', 'warning');
                return;
            }
            
            worklogs = res.worklogs;
        }
        
        await generateWorklogExcel(employeeName, yearMonth, worklogs);
        
        showNotification(t('EXPORT_SUCCESS') || '報表已成功匯出！', 'success');
        
    } catch (error) {
        console.error('匯出失敗:', error);
        showNotification(t('EXPORT_FAILED') || '匯出失敗，請稍後再試', 'error');
        
    } finally {
        if (exportBtn) {
            generalButtonState(exportBtn, 'idle');
        }
    }
}

/**
 * 生成工作日誌 Excel（支援全部員工）
 */
async function generateWorklogExcel(employeeName, yearMonth, worklogs) {
    const [year, month] = yearMonth.split('-');
    
    const isAllEmployees = (employeeName === (t('ALL_EMPLOYEES') || '全部員工'));
    
    //  翻譯表頭
    const headers = {
        employeeName: t('EMPLOYEE_NAME') || '員工姓名',
        department: t('DEPARTMENT') || '部門',
        date: t('DATE') || '日期',
        workHours: t('WORK_HOURS') || '工作時數',
        workContent: t('WORK_CONTENT') || '工作內容',
        status: t('STATUS') || '狀態',
        reviewComment: t('REVIEW_COMMENT') || '審核意見',
        submittedTime: t('SUBMITTED_TIME') || '提交時間'
    };
    
    let exportData;
    
    if (isAllEmployees) {
        exportData = worklogs.map(log => ({
            [headers.employeeName]: log.userName || t('UNKNOWN') || '未知',
            [headers.department]: log.department || t('UNCATEGORIZED') || '未分類',
            [headers.date]: log.date,
            [headers.workHours]: log.hours,
            [headers.workContent]: log.content,
            [headers.status]: getStatusText(log.status),
            [headers.reviewComment]: log.reviewComment || '-',
            [headers.submittedTime]: log.submittedAt ? new Date(log.submittedAt).toLocaleString('zh-TW') : '-'
        }));
    } else {
        exportData = worklogs.map(log => ({
            [headers.date]: log.date,
            [headers.workHours]: log.hours,
            [headers.workContent]: log.content,
            [headers.status]: getStatusText(log.status),
            [headers.reviewComment]: log.reviewComment || '-',
            [headers.submittedTime]: log.submittedAt ? new Date(log.submittedAt).toLocaleString('zh-TW') : '-'
        }));
    }
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    const wscols = isAllEmployees ? [
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
        { wch: 50 },
        { wch: 12 },
        { wch: 30 },
        { wch: 20 }
    ] : [
        { wch: 12 },
        { wch: 10 },
        { wch: 50 },
        { wch: 12 },
        { wch: 30 },
        { wch: 20 }
    ];
    
    ws['!cols'] = wscols;
    
    const wb = XLSX.utils.book_new();
    // 年月用 2026-10 這種寫法，各語言都通用（Excel 分頁名稱最多 31 字）
    const sheetName = `${year}-${String(month).padStart(2, '0')} ${t('WORKLOG')}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    
    const fileName = `${employeeName}_${year}-${String(month).padStart(2, '0')}_${t('WORKLOG')}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

/**
 * 獲取狀態文字
 */
function getStatusText(status) {
    const statusMap = {
        'PENDING': t('STATUS_PENDING') || '待審核',
        'APPROVED': t('STATUS_APPROVED') || '已核准',
        'REJECTED': t('STATUS_REJECTED') || '已拒絕'
    };
    return statusMap[status] || status;
}

/**
 * 載入管理員頁面的員工選單（用於匯出工作日誌）
 */
async function loadWorklogExportEmployees() {
    const employeeSelect = document.getElementById('worklog-export-employee');
    
    if (!employeeSelect) return;
    
    try {
        const res = await callApifetch('getAllUsers');
        
        if (res.ok && res.users && res.users.length > 0) {
            employeeSelect.innerHTML = '';
            
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = t('SELECT_EMPLOYEE_PLACEHOLDER') || '-- 請選擇員工 --';
            employeeSelect.appendChild(defaultOption);
            
            const allOption = document.createElement('option');
            allOption.value = 'ALL';
            allOption.textContent = t('ALL_EMPLOYEES') || '全部員工';
            employeeSelect.appendChild(allOption);
            
            res.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.userId;
                option.textContent = `${user.name} (${user.dept || t('UNCATEGORIZED') || '未分類'})`;
                employeeSelect.appendChild(option);
            });
            
            console.log(' 員工選單載入成功（含全部員工選項）');
        }
        
    } catch (error) {
        console.error(' 載入員工列表失敗:', error);
    }
}