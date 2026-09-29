// users.js
//
// 員工管理：清單、角色調整、刪除、改姓名，以及員工自己的基本資料。
//
// 從 script.js 拆出來的：那支原本 4,000 多行，每個頁面都要整份載入。
// 這裡的函式仍然是全域的，載入順序沒有相依性。

/**
 * 載入所有用戶
 */
async function loadAllUsers() {
    const loadingEl = document.getElementById('users-loading');
    const emptyEl = document.getElementById('users-empty');
    const listEl = document.getElementById('users-list');
    const refreshBtn = document.getElementById('refresh-users-btn');
    
    try {
        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        if (listEl) listEl.innerHTML = '';
        
        // 按鈕進入處理中狀態
        if (refreshBtn) {
            generalButtonState(refreshBtn, 'processing', t('LOADING'));
        }
        
        const res = await callApifetch('getAllUsers');
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (res.ok && res.users && res.users.length > 0) {
            allUsersCache = res.users;
            renderUsersList(allUsersCache);
            updateUsersStats(allUsersCache);
        } else {
            if (emptyEl) emptyEl.style.display = 'block';
        }
        
    } catch (error) {
        console.error('載入用戶失敗:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        showNotification(t('NOTIF_LOAD_FAILED_RETRY'), 'error');
        
    } finally {
        // 恢復按鈕狀態
        if (refreshBtn) {
            generalButtonState(refreshBtn, 'idle');
        }
    }
}

function renderUsersList(users) {
    const listEl = document.getElementById('users-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    
    const currentUserId = localStorage.getItem('sessionUserId');
    
    users.forEach((user, index) => {
        const isCurrentUser = user.userId === currentUserId;
        const isAdmin = user.dept === '管理員';
        const isScheduler = user.dept === '排班人員';  //  新增
        
        const div = document.createElement('div');
        div.className = 'bg-gray-50 dark:bg-gray-700 rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow';
        div.dataset.userId = user.userId;
        div.dataset.userName = user.name;
        div.dataset.userDept = user.dept || '';

        div.innerHTML = `
        <div class="flex items-start space-x-3">
            <img src="${escapeHtml(user.picture || 'https://via.placeholder.com/48')}" 
                alt="${escapeHtml(user.name)}" 
                class="w-12 h-12 flex-shrink-0 rounded-full border-2 ${isAdmin ? 'border-yellow-400' : isScheduler ? 'border-blue-400' : 'border-gray-300'}">
            
            <div class="flex-1 min-w-0">
                <div class="flex flex-wrap items-center gap-1 mb-1">
                    <p class="font-bold text-gray-800 dark:text-white truncate">${escapeHtml(user.name)}</p>
                    ${isCurrentUser ? `<span class="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full whitespace-nowrap">${escapeHtml(t('USERS_BADGE_YOU'))}</span>` : ''}
                    ${isAdmin ? `<span class="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full whitespace-nowrap">${escapeHtml(t('ROLE_ADMIN'))}</span>` : 
                      isScheduler ? `<span class="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full whitespace-nowrap">${escapeHtml(t('ROLE_SCHEDULER'))}</span>` :
                      `<span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full whitespace-nowrap">${escapeHtml(t('ROLE_EMPLOYEE'))}</span>`}
                </div>
                
                <p class="text-xs text-gray-600 dark:text-gray-400 mb-2 truncate">
                    ${escapeHtml(user.dept ? roleLabel(user.dept) : t('USERS_NO_DEPT'))} ${user.rate ? `| ${escapeHtml(user.rate)}` : ''}
                </p>
                
                ${!isCurrentUser ? `
                    <div class="flex flex-wrap gap-2">
                        <button onclick="openEditNameDialog('${escapeJsAttr(user.userId)}', '${escapeJsAttr(user.name)}')"
                                class="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-md transition-colors">
                            ${escapeHtml(t('BTN_EDIT_NAME'))}
                        </button>
                        
                        ${isAdmin ? `
                            <button onclick="changeUserRole('${escapeJsAttr(user.userId)}', '${escapeJsAttr(user.name)}', 'scheduler')"
                                    class="flex-1 min-w-[120px] px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-md transition-colors">
                                ${escapeHtml(t('BTN_ROLE_TO_SCHEDULER'))}
                            </button>
                            <button onclick="changeUserRole('${escapeJsAttr(user.userId)}', '${escapeJsAttr(user.name)}', 'employee')"
                                    class="flex-1 min-w-[120px] px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-md transition-colors">
                                ${escapeHtml(t('BTN_DEMOTE_TO_EMPLOYEE'))}
                            </button>
                        ` : isScheduler ? `
                            <button onclick="changeUserRole('${escapeJsAttr(user.userId)}', '${escapeJsAttr(user.name)}', 'admin')"
                                    class="flex-1 min-w-[120px] px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded-md transition-colors">
                                ${escapeHtml(t('BTN_PROMOTE_TO_ADMIN'))}
                            </button>
                            <button onclick="changeUserRole('${escapeJsAttr(user.userId)}', '${escapeJsAttr(user.name)}', 'employee')"
                                    class="flex-1 min-w-[120px] px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-md transition-colors">
                                ${escapeHtml(t('BTN_DEMOTE_TO_EMPLOYEE'))}
                            </button>
                        ` : `
                            <button onclick="changeUserRole('${escapeJsAttr(user.userId)}', '${escapeJsAttr(user.name)}', 'admin')"
                                    class="flex-1 min-w-[120px] px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded-md transition-colors">
                                ${escapeHtml(t('BTN_PROMOTE_TO_ADMIN'))}
                            </button>
                            <button onclick="changeUserRole('${escapeJsAttr(user.userId)}', '${escapeJsAttr(user.name)}', 'scheduler')"
                                    class="flex-1 min-w-[120px] px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-md transition-colors">
                                ${escapeHtml(t('BTN_PROMOTE_TO_SCHEDULER'))}
                            </button>
                        `}
                        
                        <button onclick="openLoginLinkDialog('${escapeJsAttr(user.userId)}', '${escapeJsAttr(user.name)}')"
                                class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md transition-colors">
                            ${escapeHtml(t('LOGIN_LINK_BTN'))}
                        </button>
                        
                        <button onclick="offboardEmployee('${escapeJsAttr(user.userId)}', '${escapeJsAttr(user.name)}')"
                                class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-md transition-colors">
                            ${escapeHtml(t('AUDIT_ACTION_OFFBOARD_EMPLOYEE'))}
                        </button>
                        
                        <button onclick="confirmDeleteUser('${escapeJsAttr(user.userId)}', '${escapeJsAttr(user.name)}')"
                                class="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-md transition-colors">
                            ${escapeHtml(t('BTN_DELETE'))}
                        </button>
                    </div>
                ` : `
                    <span class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(t('USERS_CANNOT_EDIT_SELF'))}</span>
                `}
            </div>
        </div>
        `;
        
        listEl.appendChild(div);
    });
}

/**
 * 權限值（後端存中文）→ 目前語言的顯示文字
 */
function roleLabel(dept) {
    if (dept === '管理員') return t('ROLE_ADMIN');
    if (dept === '排班人員') return t('ROLE_SCHEDULER');
    if (dept === '員工') return t('ROLE_EMPLOYEE');
    return dept;
}

/**
 * 更新統計數據
 */
function updateUsersStats(users) {
    const totalEl = document.getElementById('total-users-count');
    const adminEl = document.getElementById('admin-users-count');
    const employeeEl = document.getElementById('employee-users-count');
    
    const adminCount = users.filter(u => u.dept === '管理員').length;
    const employeeCount = users.length - adminCount;
    
    if (totalEl) totalEl.textContent = users.length;
    if (adminEl) adminEl.textContent = adminCount;
    if (employeeEl) employeeEl.textContent = employeeCount;
}

/**
 * 搜尋用戶
 */
function filterUsersList(query) {
    const lowerQuery = query.toLowerCase().trim();
    
    if (!lowerQuery) {
        renderUsersList(allUsersCache);
        return;
    }
    
    const filtered = allUsersCache.filter(user => {
        const name = (user.name || '').toLowerCase();
        const dept = (user.dept || '').toLowerCase();
        return name.includes(lowerQuery) || dept.includes(lowerQuery);
    });
    
    renderUsersList(filtered);
}

/**
 * 更改用戶角色
 */
async function changeUserRole(userId, userName, newRole) {
    // const roleText = newRole === 'admin' ? '管理員' : '員工';
    
    const roleMap = {
        'admin': t('ROLE_ADMIN'),
        'scheduler': t('ROLE_SCHEDULER'),
        'employee': t('ROLE_EMPLOYEE')
    };

    const roleText = roleMap[newRole] || newRole;
    
    if (!confirm(t('USERS_ROLE_CONFIRM', { name: userName, role: roleText }))) {
        return;
    }

    
    try {
        showNotification(t('NOTIF_PROCESSING'), 'info');
        
        const res = await callApifetch(`updateUserRole&userId=${encodeURIComponent(userId)}&role=${newRole}`);
        
        if (res.ok) {
            showNotification(t('NOTIF_ROLE_UPDATED', { name: userName, role: roleText }), 'success');
            
            // 重新載入列表
            await loadAllUsers();
            
            // 如果改的是當前用戶，需要重新整理頁面
            const currentUserId = localStorage.getItem('sessionUserId');
            if (userId === currentUserId) {
                showNotification(t('NOTIF_ROLE_CHANGED_RELOAD'), 'warning');
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            }
        } else {
            showNotification(res.msg || t('NOTIF_OPERATION_FAILED'), 'error');
        }
        
    } catch (error) {
        console.error('更改角色失敗:', error);
        showNotification(t('NOTIF_OPERATION_FAILED'), 'error');
    }
}

/**
 * 確認刪除用戶
 */
function confirmDeleteUser(userId, userName) {
    if (!confirm(t('USERS_DELETE_CONFIRM', { name: userName }))) {
        return;
    }
    
    if (!confirm(t('USERS_DELETE_CONFIRM_AGAIN', { name: userName }))) {
        return;
    }
    
    deleteUser(userId, userName);
}

/**
 * 刪除用戶
 */
async function deleteUser(userId, userName) {
    try {
        showNotification(t('NOTIF_DELETING'), 'warning');
        
        const res = await callApifetch(`deleteUser&userId=${encodeURIComponent(userId)}`);
        
        if (res.ok) {
            showNotification(t('NOTIF_USER_DELETED', { name: userName }), 'success');
            
            // 重新載入列表
            await loadAllUsers();
        } else {
            showNotification(res.msg || t('DELETE_FAILED'), 'error');
        }
        
    } catch (error) {
        console.error('刪除用戶失敗:', error);
        showNotification(t('NOTIF_DELETE_FAILED_RETRY'), 'error');
    }
}

/**
 * 打開編輯姓名對話框
 */
function openEditNameDialog(userId, currentName) {
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    dialog.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-4">
                ${escapeHtml(t('EDIT_NAME_TITLE'))}
            </h3>
            
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    ${escapeHtml(t('EDIT_NAME_CURRENT'))}
                </label>
                <input type="text" 
                       value="${escapeHtml(currentName)}" 
                       disabled
                       class="w-full p-3 border border-gray-300 rounded-lg bg-gray-100 dark:bg-gray-700 dark:border-gray-600 text-gray-500 dark:text-gray-400">
            </div>
            
            <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    ${escapeHtml(t('EDIT_NAME_NEW'))} <span class="text-red-500">*</span>
                </label>
                <input type="text" 
                       id="new-name-input"
                       placeholder="${escapeHtml(t('EDIT_NAME_PLACEHOLDER'))}"
                       maxlength="50"
                       class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    ${escapeHtml(t('EDIT_NAME_HINT'))}
                </p>
            </div>
            
            <div class="flex space-x-3">
                <button onclick="closeEditNameDialog()"
                        class="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-semibold transition-colors">
                    ${escapeHtml(t('BTN_CANCEL'))}
                </button>
                <button onclick="saveNewName('${escapeJsAttr(userId)}')"
                        class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors">
                    ${escapeHtml(t('BTN_CONFIRM_CHANGE'))}
                </button>
            </div>
        </div>
    `;
    
    dialog.id = 'edit-name-dialog';
    document.body.appendChild(dialog);
    
    // 自動聚焦輸入框
    setTimeout(() => {
        document.getElementById('new-name-input').focus();
    }, 100);
    
    // 按 Enter 提交
    document.getElementById('new-name-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveNewName(userId);
        }
    });
    
    // 點擊背景關閉
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            closeEditNameDialog();
        }
    });
}

/**
 * 關閉編輯姓名對話框
 */
function closeEditNameDialog() {
    const dialog = document.getElementById('edit-name-dialog');
    if (dialog) {
        dialog.remove();
    }
}

/**
 * 儲存新姓名
 */
async function saveNewName(userId) {
    const input = document.getElementById('new-name-input');
    const newName = input.value.trim();
    
    // 驗證
    if (!newName) {
        showNotification(t('NOTIF_NEW_NAME_REQUIRED'), 'error');
        input.focus();
        return;
    }
    
    if (newName.length < 2) {
        showNotification(t('NOTIF_NAME_TOO_SHORT'), 'error');
        input.focus();
        return;
    }
    
    if (newName.length > 50) {
        showNotification(t('NOTIF_NAME_TOO_LONG'), 'error');
        input.focus();
        return;
    }
    
    if (/[<>]/.test(newName)) {
        showNotification(t('REAL_NAME_INVALID_CHARS'), 'error');
        input.focus();
        return;
    }
    
    try {
        showNotification(t('NOTIF_UPDATING'), 'info');
        
        const res = await callApifetch(
            `updateEmployeeName&userId=${encodeURIComponent(userId)}&newName=${encodeURIComponent(newName)}`
        );
        
        if (res.ok) {
            showNotification(t('NOTIF_NAME_UPDATED', { name: res.newName }), 'success');
            
            // 關閉對話框
            closeEditNameDialog();
            
            // 重新載入用戶列表
            await loadAllUsers();
        } else {
            showNotification(res.msg || t('UPDATE_FAILED'), 'error');
        }
        
    } catch (error) {
        console.error('更新姓名失敗:', error);
        showNotification(t('NOTIF_UPDATE_FAILED'), 'error');
    }
}

/**
 *  初始化員工基本資料（自動載入）
 */
async function initEmployeeBasicInfo() {
    try {
        console.log(' 初始化員工基本資料'); //  改這裡
        
        const token = localStorage.getItem('sessionToken');
        if (!token) {
            console.log(' 未登入，跳過載入'); //  改這裡
            return;
        }
        
        const loadingEl = document.getElementById('basic-info-loading');
        const formEl = document.getElementById('basic-info-form');
        
        // 這個表單只有 index.html 有，其他頁面直接跳過
        if (!formEl) return;
        
        if (loadingEl) loadingEl.style.display = 'block';
        if (formEl) formEl.style.display = 'none';
        
        const res = await callApifetch('getEmployeeBasicInfo');
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (formEl) formEl.style.display = 'block';
        
        // 姓名：填過就用填的，沒填過先帶目前系統上的名字（通常是 LINE 名稱）讓員工改
        const nameInput = document.getElementById('employee-real-name');
        if (nameInput) {
            nameInput.value = (res.data && res.data.employeeName) || res.currentName || '';
        }
        
        if (res.ok && res.data) {
            console.log(' 載入成功，填入資料'); //  改這裡
            
            // 填入表單
            document.getElementById('employee-id-number').value = res.data.idNumber || '';
            document.getElementById('employee-address').value = res.data.address || '';
            document.getElementById('employee-phone').value = res.data.phone || '';
            document.getElementById('employee-birthdate').value = res.data.birthDate || '';
            
            // 顯示最後更新時間
            if (res.data.updatedAt) {
                const updateTimeEl = document.getElementById('basic-info-update-time');
                const updateTimeText = document.getElementById('update-time-text');
                
                if (updateTimeEl && updateTimeText) {
                    const date = new Date(res.data.updatedAt);
                    updateTimeText.textContent = date.toLocaleString('zh-TW');
                    updateTimeEl.style.display = 'block';
                }
            }
        } else {
            console.log('ℹ 尚未填寫基本資料'); //  改這裡
        }
        
    } catch (error) {
        console.error(' initEmployeeBasicInfo 錯誤:', error); //  改這裡
    }
}

/**
 *  儲存員工基本資料
 */
async function saveEmployeeBasicInfo() {
    try {
        console.log(' 儲存員工基本資料'); //  改這裡
        
        const saveBtn = document.getElementById('save-basic-info-btn');
        const loadingText = t('SAVING') || '儲存中...';
        
        // 取得表單資料
        const realName = (document.getElementById('employee-real-name')?.value || '').trim();
        const idNumber = document.getElementById('employee-id-number').value.trim();
        const address = document.getElementById('employee-address').value.trim();
        const phone = document.getElementById('employee-phone').value.trim();
        const birthDate = document.getElementById('employee-birthdate').value;
        
        // 驗證必填欄位
        if (!realName) {
            showNotification(t('REAL_NAME_REQUIRED'), 'error');
            return;
        }
        if (realName.length < 2) {
            showNotification(t('NOTIF_NAME_TOO_SHORT'), 'error');
            return;
        }
        if (/[<>]/.test(realName)) {
            showNotification(t('REAL_NAME_INVALID_CHARS'), 'error');
            return;
        }
        
        if (!idNumber) {
            showNotification(t('NOTIF_ID_NUMBER_REQUIRED'), 'error');
            return;
        }
        
        // 驗證身分證格式（台灣身分證）
        const idPattern = /^[A-Z][12]\d{8}$/;
        if (!idPattern.test(idNumber)) {
            showNotification(t('NOTIF_ID_FORMAT_INVALID'), 'error');
            return;
        }
        
        // 按鈕進入處理中狀態
        if (saveBtn) {
            generalButtonState(saveBtn, 'processing', loadingText);
        }
        
        // 呼叫 API
        const res = await callApifetch(
            `setEmployeeBasicInfo&name=${encodeURIComponent(realName)}&idNumber=${encodeURIComponent(idNumber)}&address=${encodeURIComponent(address)}&phone=${encodeURIComponent(phone)}&birthDate=${encodeURIComponent(birthDate)}`
        );
        
        if (res.ok) {
            showNotification(t('SAVE_SUCCESS') || '儲存成功！', 'success');
            
            // 畫面上方的名字與快取的使用者資料一起換掉，不必重新登入
            const newName = res.name || realName;
            const userNameEl = document.getElementById('user-name');
            if (userNameEl) userNameEl.textContent = newName;
            try {
                const cached = JSON.parse(localStorage.getItem('cachedUser') || 'null');
                if (cached) {
                    cached.name = newName;
                    localStorage.setItem('cachedUser', JSON.stringify(cached));
                }
            } catch (error) {
                // 快取壞掉就算了，下次登入會重抓
            }
            
            // 更新最後更新時間
            const updateTimeEl = document.getElementById('basic-info-update-time');
            const updateTimeText = document.getElementById('update-time-text');
            
            if (updateTimeEl && updateTimeText) {
                const now = new Date();
                updateTimeText.textContent = now.toLocaleString('zh-TW');
                updateTimeEl.style.display = 'block';
            }
        } else {
            showNotification(res.msg || t('NOTIF_SAVE_FAILED'), 'error');
        }
        
    } catch (error) {
        console.error(' saveEmployeeBasicInfo 錯誤:', error); //  改這裡
        showNotification(t('NOTIF_SAVE_FAILED'), 'error');
        
    } finally {
        const saveBtn = document.getElementById('save-basic-info-btn');
        if (saveBtn) {
            generalButtonState(saveBtn, 'idle');
        }
    }
}


// ==================== 離職處理 ====================
//
// 刪除員工會把人整個移掉，出勤與薪資記錄就對不上人了。
// 離職是把狀態標記起來：保留所有歷史資料，但他登不進來、也不會再被算薪。

/**
 * 辦理離職
 */
async function offboardEmployee(userId, userName) {
    const today = new Date().toISOString().slice(0, 10);
    const leaveDate = prompt(t('OFFBOARD_PROMPT_DATE'), today);
    if (leaveDate === null) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate.trim())) {
        showNotification(t('OFFBOARD_INVALID_DATE'), 'error');
        return;
    }

    if (!confirm(t('OFFBOARD_CONFIRM', { name: userName, date: leaveDate }))) return;

    try {
        const res = await callApifetch(
            `offboardEmployee&employeeId=${encodeURIComponent(userId)}` +
            `&leaveDate=${encodeURIComponent(leaveDate.trim())}`);

        if (res.ok) {
            // 後端實際做了哪幾件事列在 console，管理員才知道狀態已經一致
            showNotification(res.msg || t('OFFBOARD_DONE'), 'success');
            if (res.steps) console.log(' 離職處理:\n' + res.steps.join('\n'));
            await loadAllUsers();
        } else {
            showNotification(res.msg || t('OFFBOARD_FAILED'), 'error');
        }
    } catch (error) {
        console.error('辦理離職失敗:', error);
        showNotification(t('OFFBOARD_FAILED'), 'error');
    }
}

/**
 * 復職（誤操作要救得回來）
 */
async function reinstateEmployee(userId, userName) {
    if (!confirm(t('REINSTATE_CONFIRM', { name: userName }))) return;

    try {
        const res = await callApifetch(
            `reinstateEmployee&employeeId=${encodeURIComponent(userId)}`);

        if (res.ok) {
            showNotification(res.msg || t('REINSTATE_DONE'), 'success');
            await loadAllUsers();
        } else {
            showNotification(res.msg || t('REINSTATE_FAILED'), 'error');
        }
    } catch (error) {
        console.error('辦理復職失敗:', error);
        showNotification(t('REINSTATE_FAILED'), 'error');
    }
}


// ==================== 不透過 LINE 登入（GS/LoginLinks.gs） ====================

function closeUsersDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog) dialog.remove();
}

function openUsersDialog(id, innerHtml) {
    closeUsersDialog(id);
    const dialog = document.createElement('div');
    dialog.id = id;
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    dialog.innerHTML = `<div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">${innerHtml}</div>`;
    dialog.addEventListener('click', e => { if (e.target === dialog) closeUsersDialog(id); });
    document.body.appendChild(dialog);
    return dialog;
}

/** 管理員：建立沒有 LINE 的員工，建立後直接產生他的登入連結 */
function openNoLineEmployeeDialog() {
    const dialog = openUsersDialog('no-line-employee-dialog', `
        <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-2">${escapeHtml(t('NO_LINE_ADD_TITLE'))}</h3>
        <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">${escapeHtml(t('NO_LINE_ADD_DESC'))}</p>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">${escapeHtml(t('NO_LINE_NAME_LABEL'))} <span class="text-red-500">*</span></label>
        <input type="text" id="no-line-name" maxlength="50" placeholder="${escapeHtml(t('EDIT_NAME_PLACEHOLDER'))}"
               class="w-full p-3 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">${escapeHtml(t('NO_LINE_ROLE_LABEL'))}</label>
        <select id="no-line-role" class="w-full p-3 mb-5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white">
            <option value="員工">${escapeHtml(t('ROLE_EMPLOYEE'))}</option>
            <option value="排班人員">${escapeHtml(t('ROLE_SCHEDULER'))}</option>
        </select>
        <div class="flex gap-3">
            <button type="button" class="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-semibold" data-close>${escapeHtml(t('BTN_CANCEL'))}</button>
            <button type="button" class="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold" data-submit>${escapeHtml(t('NO_LINE_CREATE_BTN'))}</button>
        </div>`);
    dialog.querySelector('[data-close]').onclick = () => closeUsersDialog('no-line-employee-dialog');
    const submit = dialog.querySelector('[data-submit]');
    submit.onclick = async () => {
        const name = dialog.querySelector('#no-line-name').value.trim();
        if (name.length < 2) {
            showNotification(t('NOTIF_NAME_TOO_SHORT'), 'error');
            return;
        }
        submit.disabled = true;
        try {
            const res = await callApifetch(`createNoLineEmployee&name=${encodeURIComponent(name)}` +
                                           `&role=${encodeURIComponent(dialog.querySelector('#no-line-role').value)}`);
            if (!res.ok) {
                showNotification(res.msg || t('NO_LINE_CREATE_FAILED'), 'error');
                submit.disabled = false;
                return;
            }
            closeUsersDialog('no-line-employee-dialog');
            showNotification(t('NO_LINE_CREATED', { name: res.name }), 'success');
            if (typeof loadAllUsers === 'function') loadAllUsers();
            openLoginLinkDialog(res.userId, res.name);
        } catch (error) {
            console.error('建立員工失敗:', error);
            showNotification(t('NO_LINE_CREATE_FAILED'), 'error');
            submit.disabled = false;
        }
    };
    setTimeout(() => dialog.querySelector('#no-line-name').focus(), 50);
}

/** 管理員：替員工產生一次性登入連結，顯示連結與 QR Code */
async function openLoginLinkDialog(userId, userName) {
    const dialog = openUsersDialog('login-link-dialog', `
        <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-2">${escapeHtml(t('LOGIN_LINK_TITLE', { name: userName }))}</h3>
        <p class="text-sm text-gray-600 dark:text-gray-300" data-body>${escapeHtml(t('LOADING'))}</p>`);
    try {
        const res = await callApifetch(`createLoginLink&userId=${encodeURIComponent(userId)}`);
        if (!document.body.contains(dialog)) return;
        if (!res.ok) {
            dialog.querySelector('[data-body]').textContent = res.msg || t('LOGIN_LINK_FAILED');
            return;
        }
        const base = API_CONFIG.redirectUrl.replace(/\/?$/, '/');
        const url = `${base}?loginCode=${encodeURIComponent(res.code)}`;
        const expires = new Date(res.expiresAt).toLocaleString();
        dialog.firstElementChild.innerHTML = `
            <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-2">${escapeHtml(t('LOGIN_LINK_TITLE', { name: userName }))}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">${escapeHtml(t('LOGIN_LINK_DESC'))}</p>
            <div class="flex justify-center bg-white p-3 rounded-lg mb-3" data-qr></div>
            <div class="flex gap-2 mb-2">
                <input type="text" readonly value="${escapeHtml(url)}" data-url
                       class="flex-1 min-w-0 p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white">
                <button type="button" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg" data-copy>${escapeHtml(t('KIOSK_COPY_BTN'))}</button>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">${escapeHtml(t('LOGIN_LINK_EXPIRES', { time: expires }))}</p>
            <p class="text-xs text-amber-600 dark:text-amber-400 mb-4">${escapeHtml(t('LOGIN_LINK_WARNING'))}</p>
            <button type="button" class="w-full px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-semibold" data-close>${escapeHtml(t('BTN_CLOSE'))}</button>`;
        if (typeof QRCode === 'function') {
            new QRCode(dialog.querySelector('[data-qr]'), { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
        }
        dialog.querySelector('[data-copy]').onclick = async () => {
            const input = dialog.querySelector('[data-url]');
            try {
                await navigator.clipboard.writeText(input.value);
            } catch (error) {
                input.select();
                document.execCommand('copy');
            }
            showNotification(t('KIOSK_COPIED'), 'success');
        };
        dialog.querySelector('[data-close]').onclick = () => closeUsersDialog('login-link-dialog');
    } catch (error) {
        console.error('產生登入連結失敗:', error);
        const body = dialog.querySelector('[data-body]');
        if (body) body.textContent = t('LOGIN_LINK_FAILED');
    }
}
