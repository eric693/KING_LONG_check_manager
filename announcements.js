// announcements.js
//
// 公告：儀表板顯示、管理員發布與刪除。資料來自後端「公告」工作表。
//
// 從 script.js 拆出來的：那支原本 4,000 多行，每個頁面都要整份載入。
// 這裡的函式仍然是全域的，載入順序沒有相依性。

/**
 * 載入公告 (從後端)
 */
async function loadAnnouncements() {
    try {
        const res = await callApifetch('getAnnouncements');
        
        if (res.ok) {
            return res.announcements || [];
        }
        
        return [];
        
    } catch (error) {
        console.error('載入公告失敗:', error);
        return [];
    }
}

/**
 * 顯示公告 (儀表板)
 */
async function displayAnnouncements() {
    const list = document.getElementById('announcements-list');
    const empty = document.getElementById('announcements-empty');
    
    if (!list) return;
    
    const announcements = await loadAnnouncements();
    const displayAnnouncements = announcements.slice(0, 3); // 只顯示前 3 筆
    
    if (displayAnnouncements.length === 0) {
        if (empty) empty.style.display = 'block';
        list.innerHTML = '';
        return;
    }
    
    if (empty) empty.style.display = 'none';
    list.innerHTML = '';
    
    displayAnnouncements.forEach(a => {
        const icon = a.priority === 'high' ? '' : a.priority === 'medium' ? '' : '';
        const div = document.createElement('div');
        div.className = 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-3';
        div.innerHTML = `
            <div class="flex items-start justify-between mb-2">
                <h3 class="font-bold text-gray-800 dark:text-white">${icon} ${escapeHtml(a.title)}</h3>
                <span class="text-xs text-gray-500">${new Date(a.createdAt).toLocaleDateString()}</span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-300">${escapeHtml(a.content)}</p>
        `;
        list.appendChild(div);
    });
}

/**
 * 顯示管理員公告列表
 */
async function displayAdminAnnouncements() {
    const list = document.getElementById('admin-announcements-list');
    if (!list) return;
    
    const announcements = await loadAnnouncements();
    list.innerHTML = '';
    
    if (announcements.length === 0) {
        list.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center py-4">${escapeHtml(t('ANNOUNCEMENT_EMPTY'))}</p>`;
        return;
    }
    
    announcements.forEach(a => {
        const div = document.createElement('div');
        div.className = 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <h3 class="font-bold text-gray-800 dark:text-white mb-1">${escapeHtml(a.title)}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">${escapeHtml(a.content)}</p>
                    <span class="text-xs text-gray-500">${new Date(a.createdAt).toLocaleString()}</span>
                </div>
                <button class="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded ml-4" 
                        data-i18n="BTN_DELETE"
                        onclick="deleteAnnouncement('${a.id}')">
                    ${escapeHtml(t('BTN_DELETE'))}
                </button>
            </div>
        `;
        list.appendChild(div);
        renderTranslations(div);
    });
}

/**
 * 刪除公告
 */
async function deleteAnnouncement(id) {
    if (!confirm(t('DELETE_ANNOUNCEMENT_CONFIRM') || '確定要刪除此公告嗎？')) {
        return;
    }
    
    try {
        const res = await callApifetch(`deleteAnnouncement&id=${id}`);
        
        if (res.ok) {
            showNotification(t('ANNOUNCEMENT_DELETED') || '公告已刪除', 'success');
            displayAdminAnnouncements();
            displayAnnouncements();
        } else {
            showNotification(res.msg || t('DELETE_FAILED'), 'error');
        }
        
    } catch (error) {
        console.error('刪除公告失敗:', error);
        showNotification(t('NOTIF_DELETE_FAILED'), 'error');
    }
}
