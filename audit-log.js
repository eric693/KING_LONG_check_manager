// audit-log.js - 管理員分頁的「操作紀錄」
//
// 後端在 Main.gs 路由層統一記錄管理操作（見 GS/AuditLog.gs 的 ADMIN_AUDIT_ACTIONS），
// 這裡只負責查詢與顯示。動作名稱用 AUDIT_ACTION_* 翻譯，找不到才用後端給的中文。

const AUDIT_ACTION_KEYS = [
  'approveReview', 'rejectReview', 'reviewOvertime', 'reviewLeave', 'reviewWorklog', 'deleteWorklog',
  'addLocation', 'updateUserRole', 'deleteUser', 'updateEmployeeName', 'deleteEmployeeBasicInfo',
  'offboardEmployee', 'reinstateEmployee',
  'addShift', 'batchAddShifts', 'updateShift', 'deleteShift',
  'setEmployeeSalaryTW', 'copySalaryConfig', 'batchCalculateSalary', 'setBonusRecord',
  'setDailyEmployee', 'saveDailySalaryRecord',
  'updateSalaryRules', 'resetSalaryRules', 'saveSalaryItems', 'updateWorkSchedule', 'resetWorkSchedule',
  'addAnnouncement', 'deleteAnnouncement', 'deleteAttachment', 'reviewExpense',
  'createQrToken', 'resetKioskKey', 'disableKiosk', 'saveShiftTemplates'
];

let auditLogInitialized = false;

// approveReview → AUDIT_ACTION_APPROVE_REVIEW
function auditActionI18nKey(action) {
  return 'AUDIT_ACTION_' + String(action).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

function auditActionLabel(action, fallback) {
  const key = auditActionI18nKey(action);
  const text = t(key);
  return text === key ? (fallback || action) : text;
}

/**
 * 切到管理員分頁時呼叫：第一次建立篩選選單並綁定事件，之後每次都重新查一次
 */
function initAdminAuditLog() {
  const section = document.getElementById('admin-audit-section');
  if (!section) return;

  if (!auditLogInitialized) {
    auditLogInitialized = true;

    const monthInput = document.getElementById('audit-month');
    if (monthInput && !monthInput.value) {
      const now = new Date();
      monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    populateAuditActionOptions();

    document.getElementById('audit-search-btn')?.addEventListener('click', loadAdminAuditLog);
    document.getElementById('audit-keyword')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') loadAdminAuditLog();
    });
  } else {
    // 語系可能換過，選單文字重建一次
    populateAuditActionOptions();
  }

  loadAdminAuditLog();
}

function populateAuditActionOptions() {
  const select = document.getElementById('audit-action');
  if (!select) return;

  const current = select.value;
  select.innerHTML = '';

  const all = document.createElement('option');
  all.value = '';
  all.textContent = t('AUDIT_ACTION_ALL');
  select.appendChild(all);

  AUDIT_ACTION_KEYS.forEach(action => {
    const option = document.createElement('option');
    option.value = action;
    option.textContent = auditActionLabel(action);
    select.appendChild(option);
  });

  select.value = current;
}

async function loadAdminAuditLog() {
  const list = document.getElementById('audit-list');
  if (!list) return;

  const yearMonth = document.getElementById('audit-month')?.value || '';
  const actionKey = document.getElementById('audit-action')?.value || '';
  const keyword = (document.getElementById('audit-keyword')?.value || '').trim();

  list.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400 py-4">${escapeHtml(t('AUDIT_LOADING'))}</p>`;

  try {
    const res = await callApifetch(
      `getAdminAuditLog&yearMonth=${encodeURIComponent(yearMonth)}` +
      `&actionKey=${encodeURIComponent(actionKey)}&keyword=${encodeURIComponent(keyword)}`
    );

    if (!res.ok) {
      list.innerHTML = `<p class="text-center text-red-600 dark:text-red-400 py-4">${escapeHtml(res.msg || t('AUDIT_LOAD_FAILED'))}</p>`;
      return;
    }

    renderAdminAuditLog(res.entries || []);
  } catch (error) {
    console.error('載入操作紀錄失敗:', error);
    list.innerHTML = `<p class="text-center text-red-600 dark:text-red-400 py-4">${escapeHtml(t('AUDIT_LOAD_FAILED'))}</p>`;
  }
}

function renderAdminAuditLog(entries) {
  const list = document.getElementById('audit-list');
  if (!list) return;

  if (entries.length === 0) {
    list.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400 py-4">${escapeHtml(t('AUDIT_EMPTY'))}</p>`;
    return;
  }

  list.innerHTML = entries.map(entry => {
    const target = entry.targetName || entry.targetId
      ? `<p class="text-sm text-gray-600 dark:text-gray-300">${escapeHtml(t('AUDIT_TARGET', {
          target: [entry.targetName, entry.targetId].filter(Boolean).join(' / ')
        }))}</p>`
      : '';
    const detail = entry.detail
      ? `<p class="text-xs text-gray-500 dark:text-gray-400 break-all mt-1">${escapeHtml(entry.detail)}</p>`
      : '';

    return `
      <li class="p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
        <div class="flex flex-wrap justify-between gap-2">
          <span class="font-semibold text-gray-800 dark:text-white">${escapeHtml(auditActionLabel(entry.action, entry.label))}</span>
          <span class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(entry.at)}</span>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-300">${escapeHtml(t('AUDIT_ACTOR', { actor: entry.actor || '-' }))}</p>
        ${target}
        ${detail}
      </li>`;
  }).join('');
}
