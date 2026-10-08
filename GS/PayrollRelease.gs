// PayrollRelease.gs
//
// 薪資條發放：管理員把一個月的薪資單都核對好，再一次「發放」給員工。
//
//   發放前（草稿）：只有管理員看得到。員工的「我的薪資」顯示「本月薪資尚未發放」，
//                   也不能簽收。
//   發放：所有人同時看得到，有 LINE 的員工收到通知。
//   發放後：員工看到的是發放時存下的薪資單，打開時不再重新計算。
//           之後管理員又改了金額，薪資單會標記「發放後更新」，員工端也看得到。
//
// 狀態存在「系統設定」的 payrollRelease（JSON）：
//   { requireFrom: 'YYYY-MM', months: { 'YYYY-MM': { releasedAt, releasedBy, notified, skipped, failed } } }
// requireFrom 以前的月份當作早就發放過（這個功能上線前員工本來就看得到），
// 第一次讀取時設成上一個月：上線當下正在處理的月份要走發放流程。

const SETTING_KEY_PAYROLL_RELEASE = 'payrollRelease';
const MONTHLY_UPDATED_AFTER_RELEASE_COLUMN = '發放後更新時間';

// 員工看得到的金額有變才算「發放後更新」（說明文字、JSON、時間欄不算）。
// 用函式而不是頂層常數：其他檔案的常數在這支載入時不一定已經定義。
function payrollReleaseWatchedColumns_() {
  return MONTHLY_SALARY_HEADERS
    .filter(h => MONTHLY_SALARY_TEXT_COLUMNS.indexOf(h) === -1)
    .concat(PAYROLL_SHEET_MONTHLY_FIELDS.map(f => f.header));
}

function payrollPreviousMonth_() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM');
}

/** 讀出發放狀態；還沒有就初始化（requireFrom = 上個月）並存起來 */
function getPayrollReleaseState_() {
  const stored = readSystemSetting_(SETTING_KEY_PAYROLL_RELEASE);
  if (stored && stored.value) {
    try {
      const state = JSON.parse(stored.value);
      if (state && /^\d{4}-\d{2}$/.test(state.requireFrom || '')) {
        state.months = state.months || {};
        return state;
      }
    } catch (error) {
      Logger.log(' 薪資發放設定格式錯誤，重新初始化: ' + error);
    }
  }
  const state = { requireFrom: payrollPreviousMonth_(), months: {} };
  writeSystemSetting_(SETTING_KEY_PAYROLL_RELEASE, JSON.stringify(state), '');
  return state;
}

function savePayrollReleaseState_(state, updatedBy) {
  writeSystemSetting_(SETTING_KEY_PAYROLL_RELEASE, JSON.stringify(state), updatedBy || '');
}

/** 這個月員工看不看得到 */
function isPayrollReleased_(yearMonth, state) {
  const s = state || getPayrollReleaseState_();
  return String(yearMonth) < s.requireFrom || !!s.months[yearMonth];
}

/** 這個月的發放資訊；不需要發放（上線前的月份）或還沒發放回傳 null */
function getPayrollReleaseInfo_(yearMonth, state) {
  const s = state || getPayrollReleaseState_();
  return s.months[yearMonth] || null;
}

/**
 * saveMonthlySalary 寫入前呼叫：已發放的月份，員工看得到的金額有變，
 * 就在整列的「發放後更新時間」填上現在。
 */
function markUpdatedAfterRelease_(headers, beforeRow, fullRow, yearMonth) {
  if (!beforeRow) return;
  const index = headers.indexOf(MONTHLY_UPDATED_AFTER_RELEASE_COLUMN);
  if (index === -1) return;
  const state = getPayrollReleaseState_();
  if (!getPayrollReleaseInfo_(yearMonth, state)) return;

  const watched = payrollReleaseWatchedColumns_();
  const changed = headers.some((header, i) => {
    if (watched.indexOf(header) === -1) return false;
    return Math.round(sheetNumber_(beforeRow[i]) * 100) !== Math.round(sheetNumber_(fullRow[i]) * 100);
  });
  if (changed) fullRow[index] = new Date();
}

/** 員工端讀已發放的薪資單：發放時存下的那一列，不重新計算 */
function readReleasedPayslip_(employeeId, yearMonth) {
  const found = readMonthlySalaryRow_(employeeId, yearMonth);
  if (!found) return null;
  const data = monthlyRowToSalaryData_(found.headers, found.row);
  const info = getPayrollReleaseInfo_(yearMonth);
  data.releasedAt = info ? info.releasedAt : '';
  const updated = data[MONTHLY_UPDATED_AFTER_RELEASE_COLUMN];
  data.updatedAfterRelease = updated ? formatDateTime(updated) : '';
  if (data['簽收時間']) data['簽收時間'] = formatDateTime(data['簽收時間']);
  return data;
}

function payrollReleaseYearMonth_(row, index) {
  const raw = row[index];
  return (raw instanceof Date) ? Utilities.formatDate(raw, 'Asia/Taipei', 'yyyy-MM') : String(raw || '').substring(0, 7);
}

function requirePayrollReleaseAdmin_(token) {
  const session = checkSession_(token);
  return (session.ok && session.user && session.user.dept === '管理員') ? session.user : null;
}

// ==================== API ====================

/**
 * API（管理員）：某個月的確認清單。
 * 列出所有在職員工：薪資單是手動、自動還是還沒建立，應發、扣款、實發，簽收狀況。
 */
function handleGetPayrollRelease(params) {
  if (!requirePayrollReleaseAdmin_(params.token)) {
    return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
  }
  const yearMonth = String(params.yearMonth || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    return { ok: false, code: 'INVALID_YEAR_MONTH', msg: '年月格式錯誤' };
  }

  const state = getPayrollReleaseState_();
  const sheet = getMonthlySalarySheetEnhanced();
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const col = name => headers.indexOf(name);
  const ymIndex = col('年月');

  const byEmployee = {};
  for (let i = 1; i < data.length; i++) {
    if (payrollReleaseYearMonth_(data[i], ymIndex) !== yearMonth) continue;
    const row = data[i];
    const id = String(row[col('員工ID')]).trim();
    const gross = sheetNumber_(row[col('應發總額')]);
    const net = sheetNumber_(row[col('實發金額')]);
    const ack = col('簽收時間') === -1 ? '' : row[col('簽收時間')];
    const updated = col(MONTHLY_UPDATED_AFTER_RELEASE_COLUMN) === -1 ? '' : row[col(MONTHLY_UPDATED_AFTER_RELEASE_COLUMN)];
    byEmployee[id] = {
      employeeId: id,
      employeeName: String(row[col('員工姓名')] || ''),
      status: isManualPayslipRow_(headers, row) ? 'manual' : 'auto',
      gross: gross,
      deductions: gross - net,
      net: net,
      acknowledgedAt: ack ? formatDateTime(ack) : '',
      updatedAfterRelease: updated ? formatDateTime(updated) : ''
    };
  }

  // 在職、有薪資設定卻還沒有薪資單的人也列出來，才知道誰漏了
  const rows = [];
  listPayableEmployees_().forEach(emp => {
    if (byEmployee[emp.employeeId]) {
      rows.push(byEmployee[emp.employeeId]);
      delete byEmployee[emp.employeeId];
    } else {
      rows.push({ employeeId: emp.employeeId, employeeName: emp.employeeName, status: 'missing',
                  gross: 0, deductions: 0, net: 0, acknowledgedAt: '', updatedAfterRelease: '' });
    }
  });
  Object.keys(byEmployee).forEach(id => rows.push(byEmployee[id]));   // 已離職但這個月有薪資單

  return {
    ok: true,
    yearMonth: yearMonth,
    requiresRelease: yearMonth >= state.requireFrom,
    release: getPayrollReleaseInfo_(yearMonth, state),
    rows: rows
  };
}

/**
 * API（管理員）：發放某個月的薪資條。員工從這一刻起看得到，有 LINE 的人收到通知。
 */
function handleReleasePayroll(params) {
  const admin = requirePayrollReleaseAdmin_(params.token);
  if (!admin) return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
  const yearMonth = String(params.yearMonth || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    return { ok: false, code: 'INVALID_YEAR_MONTH', msg: '年月格式錯誤' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let state;
  try {
    state = getPayrollReleaseState_();
    if (state.months[yearMonth]) {
      return { ok: false, code: 'PAYROLL_ALREADY_RELEASED', msg: '這個月已經發放過了' };
    }
    state.months[yearMonth] = { releasedAt: formatDateTime(new Date()), releasedBy: admin.name || admin.userId };
    savePayrollReleaseState_(state, admin.name || '');
  } finally {
    lock.releaseLock();
  }

  // 通知：這個月有薪資單的人
  const sheet = getMonthlySalarySheetEnhanced();
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const ymIndex = headers.indexOf('年月');
  const idIndex = headers.indexOf('員工ID');
  const nameIndex = headers.indexOf('員工姓名');
  const month = Number(yearMonth.substring(5, 7));
  const url = (typeof LINE_REDIRECT_URL !== 'undefined') ? LINE_REDIRECT_URL : '';

  let notified = 0, skipped = 0, failed = 0;
  for (let i = 1; i < data.length; i++) {
    if (payrollReleaseYearMonth_(data[i], ymIndex) !== yearMonth) continue;
    const employeeId = String(data[i][idIndex]).trim();
    if (typeof isLineUserId_ === 'function' && !isLineUserId_(employeeId)) { skipped++; continue; }
    const name = String(data[i][nameIndex] || '');
    const result = sendLineNotification_(employeeId, {
      type: 'text',
      text: `${name} 您好，${month} 月薪資條已發放，請到系統查看並簽收。` + (url ? `\n${url}` : '')
    });
    if (result && result.ok) notified++; else failed++;
  }

  const lock2 = LockService.getScriptLock();
  lock2.waitLock(10000);
  try {
    state = getPayrollReleaseState_();
    if (state.months[yearMonth]) {
      Object.assign(state.months[yearMonth], { notified: notified, skipped: skipped, failed: failed });
      savePayrollReleaseState_(state, admin.name || '');
    }
  } finally {
    lock2.releaseLock();
  }

  return { ok: true, release: state.months[yearMonth], notified: notified, skipped: skipped, failed: failed };
}

/**
 * API（管理員）：取消發放（例如發錯月份）。員工又看不到，已經寄出的 LINE 通知收不回來。
 */
function handleUnreleasePayroll(params) {
  const admin = requirePayrollReleaseAdmin_(params.token);
  if (!admin) return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
  const yearMonth = String(params.yearMonth || '').trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const state = getPayrollReleaseState_();
    if (!state.months[yearMonth]) return { ok: false, code: 'PAYROLL_NOT_RELEASED', msg: '這個月還沒有發放' };
    delete state.months[yearMonth];
    savePayrollReleaseState_(state, admin.name || '');
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}
