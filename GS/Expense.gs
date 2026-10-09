// Expense.gs
//
// 費用申請：預支（先向公司借款）與報銷（代墊後請款）。
// 員工送出 → 管理員核准或駁回，流程跟加班、請假一樣。
//
// 兩種共用一張「費用申請」表，用「類型」欄區分。
// 審核用申請ID找列，不用列號 —— 列號會因為刪除其他列而位移，審到別人的申請。
// 報銷的發票照片走附件系統（Attachments.gs），記錄鍵是 expense:申請ID。

const SHEET_EXPENSE = '費用申請';

const EXPENSE_TYPES = ['advance', 'reimbursement'];

const EXPENSE_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

// 單筆金額上限，擋掉多打幾個 0 的誤輸入
const EXPENSE_MAX_AMOUNT = 1000000;
const EXPENSE_MAX_TEXT = 500;

// 欄位位置（0 起算）
const EXPENSE_COL = {
  ID: 0, TYPE: 1, CREATED_AT: 2, EMPLOYEE_ID: 3, EMPLOYEE_NAME: 4,
  DATE: 5, AMOUNT: 6, REASON: 7, INVOICE_NUMBER: 8, NOTE: 9,
  STATUS: 10, REVIEWER: 11, REVIEWED_AT: 12, REVIEW_COMMENT: 13
};

function getExpenseSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_EXPENSE);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_EXPENSE);
    sheet.appendRow(['申請ID', '類型', '申請時間', '員工ID', '員工姓名',
                     '日期', '金額', '事由', '發票號碼', '備註',
                     '狀態', '審核者', '審核時間', '審核意見']);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 14)
         .setFontWeight('bold')
         .setBackground('#0d9488')
         .setFontColor('#ffffff');
    Logger.log(' 已建立「費用申請」工作表');
  }

  return sheet;
}

function expenseRowToObject_(row) {
  return {
    id: String(row[EXPENSE_COL.ID]),
    type: String(row[EXPENSE_COL.TYPE]),
    createdAt: formatDateTime(row[EXPENSE_COL.CREATED_AT]),
    employeeId: String(row[EXPENSE_COL.EMPLOYEE_ID]),
    employeeName: String(row[EXPENSE_COL.EMPLOYEE_NAME]),
    date: formatDate(row[EXPENSE_COL.DATE]),
    amount: Number(row[EXPENSE_COL.AMOUNT]) || 0,
    reason: String(row[EXPENSE_COL.REASON] || ''),
    invoiceNumber: String(row[EXPENSE_COL.INVOICE_NUMBER] || ''),
    note: String(row[EXPENSE_COL.NOTE] || ''),
    status: String(row[EXPENSE_COL.STATUS]),
    reviewer: String(row[EXPENSE_COL.REVIEWER] || ''),
    reviewedAt: formatDateTime(row[EXPENSE_COL.REVIEWED_AT]),
    reviewComment: String(row[EXPENSE_COL.REVIEW_COMMENT] || '')
  };
}

/**
 * API：送出費用申請
 * 參數：type（advance / reimbursement）、date、amount、reason、invoiceNumber、note
 */
function handleSubmitExpense(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, code: 'ERR_SESSION_INVALID', msg: '未授權或 session 已過期' };
    }

    const type = String(params.type || '').trim();
    const date = String(params.date || '').trim();
    const amount = Number(params.amount);
    const reason = String(params.reason || '').trim();
    const invoiceNumber = String(params.invoiceNumber || '').trim();
    const note = String(params.note || '').trim();

    if (EXPENSE_TYPES.indexOf(type) === -1) {
      return { ok: false, code: 'EXPENSE_INVALID_TYPE', msg: '不支援的申請類型' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, code: 'EXPENSE_INVALID_DATE', msg: '日期格式錯誤' };
    }
    if (!isFinite(amount) || amount <= 0 || amount > EXPENSE_MAX_AMOUNT) {
      return { ok: false, code: 'EXPENSE_INVALID_AMOUNT', msg: '金額不正確' };
    }
    if (!reason) {
      return { ok: false, code: 'EXPENSE_REASON_REQUIRED', msg: '請填寫事由' };
    }
    if (reason.length > EXPENSE_MAX_TEXT || note.length > EXPENSE_MAX_TEXT || invoiceNumber.length > 50) {
      return { ok: false, code: 'EXPENSE_TEXT_TOO_LONG', msg: '內容太長' };
    }

    const id = 'EXP_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    // 金額四捨五入到元，避免浮點數寫進試算表變成 1234.5600000001
    getExpenseSheet_().appendRow([
      id, type, new Date(), session.user.userId, session.user.name || '',
      date, Math.round(amount), reason,
      type === 'reimbursement' ? invoiceNumber : '',
      note, EXPENSE_STATUS.PENDING, '', '', ''
    ]);

    Logger.log(` 費用申請已送出: ${id}（${type} ${Math.round(amount)}）by ${session.user.name}`);

    return { ok: true, id: id, msg: '申請已送出' };

  } catch (error) {
    Logger.log(' handleSubmitExpense 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：查自己的費用申請（新到舊）
 */
function handleGetMyExpenses(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, code: 'ERR_SESSION_INVALID', msg: '未授權或 session 已過期' };
    }

    const data = getExpenseSheet_().getDataRange().getValues();
    const records = [];

    for (let i = data.length - 1; i >= 1 && records.length < 100; i--) {
      if (String(data[i][EXPENSE_COL.EMPLOYEE_ID]) !== session.user.userId) continue;
      records.push(expenseRowToObject_(data[i]));
    }

    return { ok: true, records: records };

  } catch (error) {
    Logger.log(' handleGetMyExpenses 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：待審核的費用申請（僅管理員，舊到新，先申請的先審）
 */
function handleGetPendingExpenses(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user || session.user.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
    }

    const data = getExpenseSheet_().getDataRange().getValues();
    const records = [];

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][EXPENSE_COL.STATUS]) !== EXPENSE_STATUS.PENDING) continue;
      records.push(expenseRowToObject_(data[i]));
    }

    return { ok: true, records: records };

  } catch (error) {
    Logger.log(' handleGetPendingExpenses 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：審核費用申請（僅管理員）
 * 參數：id、reviewAction（approve / reject）、comment
 */
function handleReviewExpense(params) {
  const lock = LockService.getScriptLock();
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user || session.user.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
    }

    const id = String(params.id || '').trim();
    const reviewAction = String(params.reviewAction || '').trim();
    const comment = String(params.comment || '').trim().slice(0, EXPENSE_MAX_TEXT);

    if (!id) {
      return { ok: false, code: 'EXPENSE_NOT_FOUND', msg: '缺少申請ID' };
    }
    if (reviewAction !== 'approve' && reviewAction !== 'reject') {
      return { ok: false, code: 'EXPENSE_INVALID_ACTION', msg: '審核動作不正確' };
    }

    // 兩個管理員同時按，第二個要看到「已審核」而不是蓋掉第一個的結果
    lock.waitLock(10000);

    const sheet = getExpenseSheet_();
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][EXPENSE_COL.ID]) !== id) continue;

      if (String(data[i][EXPENSE_COL.STATUS]) !== EXPENSE_STATUS.PENDING) {
        return { ok: false, code: 'EXPENSE_ALREADY_REVIEWED', msg: '這筆申請已經審核過了' };
      }

      const status = reviewAction === 'approve' ? EXPENSE_STATUS.APPROVED : EXPENSE_STATUS.REJECTED;
      sheet.getRange(i + 1, EXPENSE_COL.STATUS + 1, 1, 4)
           .setValues([[status, session.user.name || session.user.userId, new Date(), comment]]);

      return { ok: true, status: status, msg: '已審核' };
    }

    return { ok: false, code: 'EXPENSE_NOT_FOUND', msg: '找不到這筆申請' };

  } catch (error) {
    Logger.log(' handleReviewExpense 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  } finally {
    lock.releaseLock();
  }
}
