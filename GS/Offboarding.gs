// Offboarding.gs
//
// 兩件原本沒有的事：
//   1. 薪資單簽收 —— 員工確認「我看過這個月的薪資單了」，留下時間戳記。
//      原本只有列印版，公司拿不出員工已收到的證明。
//   2. 離職處理 —— 員工名單有「狀態」欄，但沒有一個地方把離職該做的事做完：
//      標記狀態、作廢 session、記錄離職日與最後結算月份。
//
// 兩者都會寫進「薪資異動記錄」，因為都屬於事後會被追問的動作。

// ==================== 薪資單簽收 ====================

const MONTHLY_ACK_COLUMN = '簽收時間';
const MONTHLY_ACK_BY_COLUMN = '簽收人';

/**
 * API：員工簽收自己的薪資單
 */
function handleAcknowledgePayslip(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, code: 'SESSION_INVALID', msg: '未授權或 session 已過期' };
    }

    const yearMonth = String(params.yearMonth || '').trim();
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return { ok: false, code: 'INVALID_YEAR_MONTH', msg: '年月格式錯誤' };
    }

    // 還沒發放的薪資單不能簽收（PayrollRelease.gs）
    if (typeof isPayrollReleased_ === 'function' && !isPayrollReleased_(yearMonth)) {
      return { ok: false, code: 'PAYSLIP_NOT_RELEASED', msg: '本月薪資尚未發放' };
    }

    const sheet = getMonthlySalarySheetEnhanced();
    ensureTrailingColumns_(sheet, [MONTHLY_ACK_COLUMN, MONTHLY_ACK_BY_COLUMN]);

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());

    const employeeIdIndex = headers.indexOf('員工ID');
    const yearMonthIndex = headers.indexOf('年月');
    const ackIndex = headers.indexOf(MONTHLY_ACK_COLUMN);
    const ackByIndex = headers.indexOf(MONTHLY_ACK_BY_COLUMN);

    if (employeeIdIndex === -1 || yearMonthIndex === -1 || ackIndex === -1) {
      return { ok: false, msg: '薪資記錄表缺少必要欄位' };
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][employeeIdIndex]).trim() !== session.user.userId) continue;

      // 年月可能存成日期物件
      const raw = data[i][yearMonthIndex];
      const rowYearMonth = (raw instanceof Date)
        ? Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM')
        : String(raw).substring(0, 7);

      if (rowYearMonth !== yearMonth) continue;

      // 已經簽過就不覆蓋，第一次簽收的時間才有意義
      if (data[i][ackIndex]) {
        return {
          ok: true,
          msg: '這個月的薪資單已經簽收過了',
          acknowledgedAt: formatDateTime(data[i][ackIndex]),
          alreadyAcknowledged: true
        };
      }

      const now = new Date();
      sheet.getRange(i + 1, ackIndex + 1).setValue(now);
      if (ackByIndex !== -1) {
        sheet.getRange(i + 1, ackByIndex + 1).setValue(session.user.name || session.user.userId);
      }

      Logger.log(` ${session.user.name} 簽收 ${yearMonth} 薪資單`);

      return {
        ok: true,
        msg: '已簽收',
        acknowledgedAt: formatDateTime(now),
        alreadyAcknowledged: false
      };
    }

    return { ok: false, code: 'NOT_FOUND', msg: '找不到這個月的薪資單' };

  } catch (error) {
    Logger.log(' handleAcknowledgePayslip 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：管理員查看某個月誰簽收了、誰還沒
 */
function handleGetPayslipAcknowledgements(params) {
  try {
    const user = getUserByToken(params.token);
    if (!user || user.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '此功能僅限管理員使用' };
    }

    const yearMonth = String(params.yearMonth || '').trim();
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return { ok: false, code: 'INVALID_YEAR_MONTH', msg: '年月格式錯誤' };
    }

    const sheet = getMonthlySalarySheetEnhanced();
    ensureTrailingColumns_(sheet, [MONTHLY_ACK_COLUMN, MONTHLY_ACK_BY_COLUMN]);

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());

    const nameIndex = headers.indexOf('員工姓名');
    const idIndex = headers.indexOf('員工ID');
    const yearMonthIndex = headers.indexOf('年月');
    const ackIndex = headers.indexOf(MONTHLY_ACK_COLUMN);

    // 欄位缺了就直接說清楚，不要讓 data[i][-1] 變成 undefined 一路傳到前端
    if (nameIndex === -1 || idIndex === -1 || yearMonthIndex === -1 || ackIndex === -1) {
      return { ok: false, msg: '薪資記錄表缺少必要欄位' };
    }

    const rows = [];

    for (let i = 1; i < data.length; i++) {
      const raw = data[i][yearMonthIndex];
      const rowYearMonth = (raw instanceof Date)
        ? Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM')
        : String(raw).substring(0, 7);

      if (rowYearMonth !== yearMonth) continue;

      rows.push({
        employeeId: data[i][idIndex],
        employeeName: data[i][nameIndex],
        acknowledgedAt: data[i][ackIndex] ? formatDateTime(data[i][ackIndex]) : '',
        acknowledged: !!data[i][ackIndex]
      });
    }

    return {
      ok: true,
      yearMonth: yearMonth,
      total: rows.length,
      acknowledged: rows.filter(r => r.acknowledged).length,
      rows: rows
    };

  } catch (error) {
    Logger.log(' handleGetPayslipAcknowledgements 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

// ==================== 離職處理 ====================

const EMPLOYEE_STATUS_ACTIVE = '啟用';
const EMPLOYEE_STATUS_LEFT = '離職';

/**
 * API：辦理離職（僅管理員）
 *
 * 做三件事：員工名單標記離職與離職日、作廢該員的所有 session、
 * 薪資設定狀態改為離職（批次計算就不會再算到他）。
 */
function handleOffboardEmployee(params) {
  try {
    const admin = getUserByToken(params.token);
    if (!admin || admin.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '此功能僅限管理員使用' };
    }

    const employeeId = String(params.employeeId || '').trim();
    if (!employeeId) {
      return { ok: false, code: 'MISSING_EMPLOYEE', msg: '缺少員工ID' };
    }
    if (employeeId === admin.userId) {
      return { ok: false, code: 'CANNOT_OFFBOARD_SELF', msg: '不能對自己辦理離職' };
    }

    const leaveDate = String(params.leaveDate || '').trim() ||
                      formatDate(new Date());

    const ss = getSpreadsheet_();
    const steps = [];

    // 1. 員工名單：狀態改離職
    const employeeSheet = ss.getSheetByName(SHEET_EMPLOYEES);
    let employeeName = employeeId;
    let found = false;

    if (employeeSheet) {
      const data = employeeSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() !== employeeId) continue;

        employeeName = String(data[i][2] || employeeId).trim();
        employeeSheet.getRange(i + 1, 8).setValue(EMPLOYEE_STATUS_LEFT);  // H 欄：狀態
        found = true;
        steps.push('員工名單已標記離職');
        break;
      }
    }

    if (!found) {
      return { ok: false, code: 'NOT_FOUND', msg: '找不到這位員工' };
    }

    // 2. 作廢所有 session，讓他立刻登不進來
    let revoked = 0;
    const sessionSheet = ss.getSheetByName(SHEET_SESSION);
    if (sessionSheet) {
      const data = sessionSheet.getDataRange().getValues();
      // 由下往上刪，才不會邊刪邊位移
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][1] || '').trim() === employeeId) {
          sessionSheet.deleteRow(i + 1);
          revoked++;
        }
      }
    }
    steps.push(`已作廢 ${revoked} 個登入工作階段`);

    // 3. 薪資設定：狀態改離職，批次計算就會自動略過他
    const salarySheet = getEmployeeSalarySheet();
    const salaryData = salarySheet.getDataRange().getValues();
    const salaryHeaders = salaryData[0].map(h => String(h).trim());
    const statusIndex = salaryHeaders.indexOf('狀態');
    const noteIndex = salaryHeaders.indexOf('備註');

    for (let i = 1; i < salaryData.length; i++) {
      if (String(salaryData[i][0]).trim() !== employeeId) continue;

      if (statusIndex !== -1) {
        salarySheet.getRange(i + 1, statusIndex + 1).setValue(EMPLOYEE_STATUS_LEFT);
      }
      if (noteIndex !== -1) {
        const existing = String(salaryData[i][noteIndex] || '').trim();
        const note = `離職日 ${leaveDate}`;
        salarySheet.getRange(i + 1, noteIndex + 1)
                   .setValue(existing ? `${existing}；${note}` : note);
      }
      steps.push('薪資設定已標記離職，批次計算不會再算到');
      break;
    }

    // 4. 留下稽核記錄
    if (typeof getSalaryAuditSheet_ === 'function') {
      getSalaryAuditSheet_().appendRow([
        new Date(), '', employeeId, employeeName, leaveDate.substring(0, 7),
        '離職', '狀態', EMPLOYEE_STATUS_ACTIVE, EMPLOYEE_STATUS_LEFT, admin.name || ''
      ]);
    }

    Logger.log(` 管理員 ${admin.name} 為 ${employeeName} 辦理離職（${leaveDate}）`);

    return {
      ok: true,
      msg: `${employeeName} 的離職處理已完成`,
      employeeName: employeeName,
      leaveDate: leaveDate,
      steps: steps
    };

  } catch (error) {
    Logger.log(' handleOffboardEmployee 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：復職（僅管理員）。誤操作要救得回來。
 */
function handleReinstateEmployee(params) {
  try {
    const admin = getUserByToken(params.token);
    if (!admin || admin.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '此功能僅限管理員使用' };
    }

    const employeeId = String(params.employeeId || '').trim();
    if (!employeeId) {
      return { ok: false, code: 'MISSING_EMPLOYEE', msg: '缺少員工ID' };
    }

    const ss = getSpreadsheet_();
    const employeeSheet = ss.getSheetByName(SHEET_EMPLOYEES);
    let employeeName = employeeId;
    let found = false;

    if (employeeSheet) {
      const data = employeeSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() !== employeeId) continue;
        employeeName = String(data[i][2] || employeeId).trim();
        employeeSheet.getRange(i + 1, 8).setValue(EMPLOYEE_STATUS_ACTIVE);
        found = true;
        break;
      }
    }

    if (!found) {
      return { ok: false, code: 'NOT_FOUND', msg: '找不到這位員工' };
    }

    const salarySheet = getEmployeeSalarySheet();
    const salaryData = salarySheet.getDataRange().getValues();
    const statusIndex = salaryData[0].map(h => String(h).trim()).indexOf('狀態');

    if (statusIndex !== -1) {
      for (let i = 1; i < salaryData.length; i++) {
        if (String(salaryData[i][0]).trim() !== employeeId) continue;
        salarySheet.getRange(i + 1, statusIndex + 1).setValue('在職');
        break;
      }
    }

    if (typeof getSalaryAuditSheet_ === 'function') {
      getSalaryAuditSheet_().appendRow([
        new Date(), '', employeeId, employeeName, '',
        '復職', '狀態', EMPLOYEE_STATUS_LEFT, EMPLOYEE_STATUS_ACTIVE, admin.name || ''
      ]);
    }

    Logger.log(` 管理員 ${admin.name} 為 ${employeeName} 辦理復職`);

    return { ok: true, msg: `${employeeName} 已復職`, employeeName: employeeName };

  } catch (error) {
    Logger.log(' handleReinstateEmployee 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}
