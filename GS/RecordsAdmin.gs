// RecordsAdmin.gs
//
// 資料管理頁（records.html）的後端：管理員不用打開試算表，直接在網頁上
//   ・查、新增、修改、刪除「打卡紀錄」
//   ・查、調整「假期餘額」
//
// 打卡紀錄沒有 ID 欄，用「列號 + 指紋」指定要改哪一筆：指紋是打卡時間、員工ID、上下班，
// 列表載入後如果有人在別處改了或刪了資料（列號位移），指紋對不上就拒絕，不會改錯筆。
//
// 這幾個 action 在 Main.gs 的 ROUTE_ACCESS 設為管理員限定，操作會寫進「管理操作記錄」。

const RECORDS_MAX_DAYS = 62;   // 打卡紀錄一次最多查兩個月

// 打卡紀錄欄位（0-based）：A 時間、B 員工ID、C 部門、D 姓名、E 上下班、F GPS、G 地點、
// H 標記（補打卡／系統虛擬卡）、I 審核（v／?／x）、J 備註
const PUNCH_COL = { time: 0, userId: 1, dept: 2, name: 3, type: 4, gps: 5, location: 6, mark: 7, audit: 8, note: 9 };

// 假期餘額表（getLeaveBalanceSheet）：A 員工ID、B 姓名、C 到職日、D～R 各假別（小時）、S 更新時間
const LEAVE_BALANCE_TYPES = [
  'ANNUAL_LEAVE', 'SICK_LEAVE', 'PERSONAL_LEAVE', 'BEREAVEMENT_LEAVE', 'MARRIAGE_LEAVE',
  'MATERNITY_LEAVE', 'PATERNITY_LEAVE', 'HOSPITALIZATION_LEAVE', 'MENSTRUAL_LEAVE', 'FAMILY_CARE_LEAVE',
  'OFFICIAL_LEAVE', 'WORK_INJURY_LEAVE', 'NATURAL_DISASTER_LEAVE', 'COMP_TIME_OFF', 'ABSENCE_WITHOUT_LEAVE'
];
const LEAVE_BALANCE_FIRST_COL = 4;                                   // D
const LEAVE_BALANCE_UPDATED_COL = LEAVE_BALANCE_FIRST_COL + LEAVE_BALANCE_TYPES.length;  // S

/** 儲存格的值是不是日期（試算表讀出來的日期、時間都是 Date） */
function isDateValue_(value) {
  return !!value && typeof value.getTime === 'function' && !isNaN(value.getTime());
}

function requireRecordsAdmin_(token) {
  const session = checkSession_(token);
  if (!session.ok || !session.user) {
    return { ok: false, code: 'ERR_SESSION_INVALID', msg: '未授權或 session 已過期' };
  }
  if (session.user.dept !== '管理員') {
    return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
  }
  return { ok: true, user: session.user };
}

// ==================== 打卡紀錄 ====================

function punchFingerprint_(row) {
  const t = isDateValue_(row[PUNCH_COL.time]) ? row[PUNCH_COL.time] : new Date(row[PUNCH_COL.time]);
  return [isNaN(t.getTime()) ? '' : t.getTime(), String(row[PUNCH_COL.userId]).trim(), String(row[PUNCH_COL.type]).trim()].join('|');
}

/** "yyyy-MM-dd" + "HH:mm" → Date（腳本時區）；格式不對回傳 null */
function parsePunchDateTime_(dateStr, timeStr) {
  const d = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = String(timeStr || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return null;
  const h = Number(t[1]), m = Number(t[2]);
  if (h > 23 || m > 59) return null;
  const date = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), h, m, 0);
  return isNaN(date.getTime()) ? null : date;
}

/** 員工名單裡的姓名（有手動姓名用手動的）與部門 */
function findEmployeeForRecords_(employeeId) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_EMPLOYEES);
  const values = sheet.getDataRange().getValues();
  const id = String(employeeId || '').trim();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === id) {
      return { userId: id, name: String(values[i][8] || values[i][2] || '').trim(), dept: values[i][5] || '' };
    }
  }
  return null;
}

/** 這一列的狀態，給畫面顯示：一般、補打卡已核准、補打卡審核中、補打卡駁回、系統虛擬卡 */
function punchRowStatus_(row) {
  const mark = String(row[PUNCH_COL.mark] || '').trim();
  const audit = String(row[PUNCH_COL.audit] || '').trim();
  if (mark === '系統虛擬卡') return 'VIRTUAL';
  if (mark === '補打卡') {
    if (audit === 'v') return 'ADJUST_APPROVED';
    if (audit === 'x') return 'ADJUST_REJECTED';
    return 'ADJUST_PENDING';
  }
  return 'NORMAL';
}

/**
 * API：查打卡紀錄
 * 參數：startDate、endDate（yyyy-MM-dd，最多 62 天）、employeeId（可省略 = 全部）
 */
function handleAdminListPunches(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;

    const start = parsePunchDateTime_(params.startDate, '00:00');
    const end = parsePunchDateTime_(params.endDate, '23:59');
    if (!start || !end || start > end) {
      return { ok: false, code: 'RECORDS_DATE', msg: '請選擇正確的日期範圍' };
    }
    if ((end - start) / 86400000 > RECORDS_MAX_DAYS) {
      return { ok: false, code: 'RECORDS_RANGE', msg: `一次最多查 ${RECORDS_MAX_DAYS} 天` };
    }
    const endMs = end.getTime() + 59999;   // 含 23:59 這一整分鐘

    const tz = Session.getScriptTimeZone();
    const nameMap = getEmployeeNameMap_();
    const employeeId = String(params.employeeId || '').trim();
    const data = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE).getDataRange().getValues();
    const records = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[PUNCH_COL.time]) continue;
      const time = isDateValue_(row[PUNCH_COL.time]) ? row[PUNCH_COL.time] : new Date(row[PUNCH_COL.time]);
      if (isNaN(time.getTime()) || time < start || time.getTime() > endMs) continue;
      const uid = String(row[PUNCH_COL.userId]).trim();
      if (employeeId && uid !== employeeId) continue;

      records.push({
        row: i + 1,
        key: punchFingerprint_(row),
        date: Utilities.formatDate(time, tz, 'yyyy-MM-dd'),
        time: Utilities.formatDate(time, tz, 'HH:mm'),
        userId: uid,
        name: nameMap[uid] || String(row[PUNCH_COL.name] || ''),
        type: String(row[PUNCH_COL.type] || ''),
        location: String(row[PUNCH_COL.location] || ''),
        note: String(row[PUNCH_COL.note] || ''),
        status: punchRowStatus_(row)
      });
    }

    records.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.name.localeCompare(b.name));
    return { ok: true, records: records };
  } catch (error) {
    Logger.log(' handleAdminListPunches 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

function validatePunchInput_(params) {
  const time = parsePunchDateTime_(params.date, params.time);
  if (!time) return { ok: false, code: 'RECORDS_DATE', msg: '日期或時間格式不正確' };
  const type = String(params.type || '').trim();
  if (type !== '上班' && type !== '下班') return { ok: false, code: 'ERR_INVALID_PUNCH_TYPE', msg: '打卡類型要是上班或下班' };
  const note = String(params.note || '').trim();
  if (note.length > 200) return { ok: false, code: 'RECORDS_NOTE', msg: '備註最多 200 個字' };
  return { ok: true, time: time, type: type, location: String(params.location || '').trim().slice(0, 50), note: note };
}

/**
 * API：管理員新增一筆打卡（直接算數，不用再審核）
 * 參數：employeeId、date、time、type、location、note
 */
function handleAdminAddPunch(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;
    const input = validatePunchInput_(params);
    if (!input.ok) return input;
    const emp = findEmployeeForRecords_(params.employeeId);
    if (!emp) return { ok: false, code: 'RECORDS_NO_EMPLOYEE', msg: '找不到這位員工' };

    const note = '管理員新增（' + admin.user.name + '）' + (input.note ? '：' + input.note : '');
    const row = [input.time, emp.userId, emp.dept, emp.name, input.type, '', input.location, '', '', note];

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE);
      sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    } finally {
      lock.releaseLock();
    }
    params.employeeName = emp.name;   // 管理操作記錄要看得到是誰的卡
    return { ok: true };
  } catch (error) {
    Logger.log(' handleAdminAddPunch 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/** 找到列號且指紋相符的那一列；不符回傳錯誤 */
function lockedPunchRow_(sheet, rowNumber, key) {
  const row = Number(rowNumber);
  if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) {
    return { ok: false, code: 'RECORDS_STALE', msg: '這筆資料已經變動，請重新查詢' };
  }
  const values = sheet.getRange(row, 1, 1, 10).getValues()[0];
  if (punchFingerprint_(values) !== String(key || '')) {
    return { ok: false, code: 'RECORDS_STALE', msg: '這筆資料已經變動，請重新查詢' };
  }
  return { ok: true, row: row, values: values };
}

/**
 * API：修改一筆打卡（時間、上下班、地點、備註）
 * 參數：row、key（列表給的）、date、time、type、location、note
 */
function handleAdminUpdatePunch(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;
    const input = validatePunchInput_(params);
    if (!input.ok) return input;

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE);
      const found = lockedPunchRow_(sh, params.row, params.key);
      if (!found.ok) return found;
      const old = found.values;
      sh.getRange(found.row, PUNCH_COL.time + 1).setValue(input.time);
      sh.getRange(found.row, PUNCH_COL.type + 1).setValue(input.type);
      sh.getRange(found.row, PUNCH_COL.location + 1).setValue(input.location);
      sh.getRange(found.row, PUNCH_COL.note + 1).setValue(input.note);

      const tz = Session.getScriptTimeZone();
      const oldTime = isDateValue_(old[PUNCH_COL.time]) ? Utilities.formatDate(old[PUNCH_COL.time], tz, 'yyyy-MM-dd HH:mm') : String(old[PUNCH_COL.time]);
      params.employeeId = String(old[PUNCH_COL.userId]);
      params.employeeName = String(old[PUNCH_COL.name] || '');
      params.before = `${oldTime} ${old[PUNCH_COL.type]} ${old[PUNCH_COL.location] || ''}`.trim();
    } finally {
      lock.releaseLock();
    }
    return { ok: true };
  } catch (error) {
    Logger.log(' handleAdminUpdatePunch 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：刪除一筆打卡
 * 參數：row、key
 */
function handleAdminDeletePunch(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE);
      const found = lockedPunchRow_(sh, params.row, params.key);
      if (!found.ok) return found;
      const old = found.values;
      sh.deleteRow(found.row);

      const tz = Session.getScriptTimeZone();
      const oldTime = isDateValue_(old[PUNCH_COL.time]) ? Utilities.formatDate(old[PUNCH_COL.time], tz, 'yyyy-MM-dd HH:mm') : String(old[PUNCH_COL.time]);
      params.employeeId = String(old[PUNCH_COL.userId]);
      params.employeeName = String(old[PUNCH_COL.name] || '');
      params.deleted = `${oldTime} ${old[PUNCH_COL.type]} ${old[PUNCH_COL.location] || ''} ${old[PUNCH_COL.note] || ''}`.trim();
    } finally {
      lock.releaseLock();
    }
    return { ok: true };
  } catch (error) {
    Logger.log(' handleAdminDeletePunch 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

// ==================== 假期餘額 ====================

/**
 * API：所有員工的假期餘額（小時）。名單上有、但還沒有餘額資料的員工也列出來（exists: false）
 */
function handleAdminGetLeaveBalances(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;

    const tz = Session.getScriptTimeZone();
    const values = getLeaveBalanceSheet().getDataRange().getValues();
    const nameMap = getEmployeeNameMap_();
    const list = [];
    const seen = new Set();

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const uid = String(row[0] || '').trim();
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const balances = {};
      LEAVE_BALANCE_TYPES.forEach((type, j) => { balances[type] = Number(row[LEAVE_BALANCE_FIRST_COL - 1 + j]) || 0; });
      const hire = row[2];
      const updated = row[LEAVE_BALANCE_UPDATED_COL - 1];
      list.push({
        userId: uid,
        name: nameMap[uid] || String(row[1] || ''),
        hireDate: isDateValue_(hire) ? Utilities.formatDate(hire, tz, 'yyyy-MM-dd') : String(hire || ''),
        balances: balances,
        updatedAt: isDateValue_(updated) ? Utilities.formatDate(updated, tz, 'yyyy-MM-dd HH:mm') : String(updated || ''),
        exists: true
      });
    }

    // 還沒有餘額資料的在職員工
    const empValues = getSpreadsheet_().getSheetByName(SHEET_EMPLOYEES).getDataRange().getValues();
    for (let i = 1; i < empValues.length; i++) {
      const uid = String(empValues[i][0] || '').trim();
      if (!uid || seen.has(uid) || String(empValues[i][7] || '').trim() === '停用') continue;
      seen.add(uid);
      const balances = {};
      LEAVE_BALANCE_TYPES.forEach(type => { balances[type] = 0; });
      list.push({ userId: uid, name: nameMap[uid] || String(empValues[i][2] || ''), hireDate: '', balances: balances, updatedAt: '', exists: false });
    }

    list.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, types: LEAVE_BALANCE_TYPES, employees: list };
  } catch (error) {
    Logger.log(' handleAdminGetLeaveBalances 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：設定一位員工的假期餘額
 * 參數：employeeId、balances（JSON：{ 假別: 小時 }，只改有給的假別）、hireDate（yyyy-MM-dd，可省略）
 */
function handleAdminSetLeaveBalance(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;

    const emp = findEmployeeForRecords_(params.employeeId);
    if (!emp) return { ok: false, code: 'RECORDS_NO_EMPLOYEE', msg: '找不到這位員工' };

    let input;
    try {
      input = JSON.parse(params.balances || '{}');
    } catch (e) {
      return { ok: false, code: 'RECORDS_INVALID', msg: '假期資料格式錯誤' };
    }
    const updates = {};
    for (const type of Object.keys(input || {})) {
      if (LEAVE_BALANCE_TYPES.indexOf(type) === -1) {
        return { ok: false, code: 'RECORDS_INVALID', msg: '假別不正確：' + type };
      }
      const hours = Number(input[type]);
      if (!isFinite(hours) || hours < 0 || hours > 9999) {
        return { ok: false, code: 'RECORDS_HOURS', msg: '時數要是 0～9999 的數字' };
      }
      updates[type] = Math.round(hours * 100) / 100;
    }
    let hireDate = null;
    if (params.hireDate) {
      hireDate = parsePunchDateTime_(params.hireDate, '00:00');
      if (!hireDate) return { ok: false, code: 'RECORDS_DATE', msg: '到職日格式不正確' };
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sheet = getLeaveBalanceSheet();
      const values = sheet.getDataRange().getValues();
      let rowNumber = -1;
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0]).trim() === emp.userId) { rowNumber = i + 1; break; }
      }

      const before = [];
      if (rowNumber < 0) {
        // 還沒有餘額資料：新增一列，沒給的假別是 0
        const row = [emp.userId, emp.name, hireDate || ''];
        LEAVE_BALANCE_TYPES.forEach(type => row.push(updates[type] !== undefined ? updates[type] : 0));
        row.push(new Date());
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
      } else {
        const current = values[rowNumber - 1];
        const rowValues = LEAVE_BALANCE_TYPES.map((type, j) => {
          const old = Number(current[LEAVE_BALANCE_FIRST_COL - 1 + j]) || 0;
          if (updates[type] === undefined) return old;
          if (updates[type] !== old) before.push(`${type} ${old}→${updates[type]}`);
          return updates[type];
        });
        sheet.getRange(rowNumber, LEAVE_BALANCE_FIRST_COL, 1, rowValues.length).setValues([rowValues]);
        if (hireDate) sheet.getRange(rowNumber, 3).setValue(hireDate);
        sheet.getRange(rowNumber, LEAVE_BALANCE_UPDATED_COL).setValue(new Date());
      }

      params.employeeName = emp.name;
      params.changes = before.length ? before.join('; ') : (rowNumber < 0 ? '新建餘額資料' : '沒有變更');
    } finally {
      lock.releaseLock();
    }
    return { ok: true };
  } catch (error) {
    Logger.log(' handleAdminSetLeaveBalance 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

// ==================== 請假紀錄 ====================
//
// 請假紀錄表（getLeaveRecordsSheet）：A 申請時間、B 員工ID、C 姓名、D 部門、E 假別（代碼）、
// F 開始時間、G 結束時間、H 工作時數、I 天數、J 原因、K 狀態、L 審核人、M 審核時間、N 審核意見
//
// 只開放「取消」：已核准的取消時把時數退回假期餘額（核准時是從那裡扣的），
// 不開放直接改時數或假別，免得紀錄和餘額對不起來。要改就取消後請員工重新申請。

const LEAVE_STATUS_CANCELLED = 'CANCELLED';

function leaveFingerprint_(row) {
  const applied = isDateValue_(row[0]) ? row[0].getTime() : String(row[0]);
  return [applied, String(row[1]).trim(), String(row[4]).trim(), String(row[10]).trim()].join('|');
}

/** API：查請假紀錄。參數：startDate、endDate（請假期間有重疊就列出）、employeeId、status（可省略） */
function handleAdminListLeaves(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;
    const start = parsePunchDateTime_(params.startDate, '00:00');
    const end = parsePunchDateTime_(params.endDate, '23:59');
    if (!start || !end || start > end) return { ok: false, code: 'RECORDS_DATE', msg: '請選擇正確的日期範圍' };

    const tz = Session.getScriptTimeZone();
    const nameMap = getEmployeeNameMap_();
    const employeeId = String(params.employeeId || '').trim();
    const status = String(params.status || '').trim().toUpperCase();
    const data = getLeaveRecordsSheet().getDataRange().getValues();
    const fmt = v => isDateValue_(v) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm') : String(v || '');
    const records = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const uid = String(row[1] || '').trim();
      if (!uid) continue;
      if (employeeId && uid !== employeeId) continue;
      const rowStatus = String(row[10] || '').trim().toUpperCase();
      if (status && rowStatus !== status) continue;
      const from = isDateValue_(row[5]) ? row[5] : new Date(row[5]);
      const to = isDateValue_(row[6]) ? row[6] : new Date(row[6]);
      if (isNaN(from.getTime()) || isNaN(to.getTime())) continue;
      if (to < start || from.getTime() > end.getTime() + 59999) continue;

      records.push({
        row: i + 1,
        key: leaveFingerprint_(row),
        userId: uid,
        name: nameMap[uid] || String(row[2] || ''),
        leaveType: String(row[4] || ''),
        start: fmt(from),
        end: fmt(to),
        hours: Number(row[7]) || 0,
        days: Number(row[8]) || 0,
        reason: String(row[9] || ''),
        status: rowStatus,
        reviewer: String(row[11] || ''),
        comment: String(row[13] || '')
      });
    }
    records.sort((a, b) => b.start.localeCompare(a.start));
    return { ok: true, records: records };
  } catch (error) {
    Logger.log(' handleAdminListLeaves 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：取消一筆請假。已核准的把時數退回假期餘額。
 * 參數：row、key、comment（取消原因，可省略）
 */
function handleAdminCancelLeave(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sheet = getLeaveRecordsSheet();
      const rowNumber = Number(params.row);
      if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
        return { ok: false, code: 'RECORDS_STALE', msg: '這筆資料已經變動，請重新查詢' };
      }
      const record = sheet.getRange(rowNumber, 1, 1, 14).getValues()[0];
      if (leaveFingerprint_(record) !== String(params.key || '')) {
        return { ok: false, code: 'RECORDS_STALE', msg: '這筆資料已經變動，請重新查詢' };
      }
      const status = String(record[10] || '').trim().toUpperCase();
      if (status === LEAVE_STATUS_CANCELLED || status === 'REJECTED') {
        return { ok: false, code: 'RECORDS_LEAVE_NOT_ACTIVE', msg: '這筆請假已經取消或駁回了' };
      }

      const userId = String(record[1]).trim();
      const leaveType = String(record[4]).trim();
      const hours = Number(record[7]) || 0;
      let refunded = 0;

      if (status === 'APPROVED' && hours > 0) {
        const col = LEAVE_BALANCE_TYPES.indexOf(leaveType);
        if (col === -1) return { ok: false, code: 'RECORDS_INVALID', msg: '不認得的假別：' + leaveType };
        const balSheet = getLeaveBalanceSheet();
        const balValues = balSheet.getDataRange().getValues();
        let balRow = -1;
        for (let i = 1; i < balValues.length; i++) {
          if (String(balValues[i][0]).trim() === userId) { balRow = i + 1; break; }
        }
        if (balRow < 0) return { ok: false, code: 'RECORDS_NO_BALANCE', msg: '找不到這位員工的假期餘額，請先到「假期餘額」設定' };
        const cell = balSheet.getRange(balRow, LEAVE_BALANCE_FIRST_COL + col);
        cell.setValue(Math.round(((Number(cell.getValue()) || 0) + hours) * 100) / 100);
        balSheet.getRange(balRow, LEAVE_BALANCE_UPDATED_COL).setValue(new Date());
        refunded = hours;
      }

      const note = '管理員取消（' + admin.user.name + '）' + (params.comment ? '：' + String(params.comment).slice(0, 200) : '');
      sheet.getRange(rowNumber, 11, 1, 4).setValues([[LEAVE_STATUS_CANCELLED, admin.user.name, new Date(), note]]);

      params.employeeId = userId;
      params.employeeName = String(record[2] || '');
      params.cancelled = `${leaveType} ${hours} 小時（原狀態 ${status}${refunded ? '，已退回餘額' : ''}）`;
      return { ok: true, refunded: refunded };
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    Logger.log(' handleAdminCancelLeave 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

// ==================== 加班紀錄 ====================
//
// 加班申請表（SHEET_OVERTIME）：A 申請ID、B 員工ID、C 姓名、D 加班日期、E 開始、F 結束、G 時數、
// H 原因、I 申請時間、J 審核狀態（pending/approved/rejected）、K 審核人ID、L 審核人、M 審核時間、
// N 審核意見、O 補休時數
//
// 可以改時間與時數、可以取消。已核准的改過或取消後，跟核准時一樣重算並儲存那個月的薪資。

const OVERTIME_STATUS_CANCELLED = 'cancelled';

function overtimeFingerprint_(row) {
  return [String(row[0]).trim(), String(row[1]).trim(), String(row[9]).trim().toLowerCase()].join('|');
}

function overtimeTimeText_(value, tz) {
  if (isDateValue_(value)) return Utilities.formatDate(value, tz, 'HH:mm');
  const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

/** 已核准的加班改過或取消後，重算那個月的薪資（跟 reviewOvertimeRequest 一樣） */
function recalcSalaryAfterOvertimeChange_(employeeId, overtimeDate) {
  try {
    const tz = Session.getScriptTimeZone();
    const yearMonth = isDateValue_(overtimeDate) ? Utilities.formatDate(overtimeDate, tz, 'yyyy-MM') : String(overtimeDate).substring(0, 7);
    const recalc = calculateMonthlySalary(employeeId, yearMonth);
    if (recalc && recalc.success) {
      const saved = saveMonthlySalary(recalc.data);
      return !!(saved && saved.success);
    }
  } catch (error) {
    Logger.log(' 加班修改後重算薪資失敗: ' + error.message);
  }
  return false;
}

/** API：查加班紀錄。參數：startDate、endDate（加班日期）、employeeId、status（可省略） */
function handleAdminListOvertime(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(params.endDate || '') || params.startDate > params.endDate) {
      return { ok: false, code: 'RECORDS_DATE', msg: '請選擇正確的日期範圍' };
    }
    const tz = Session.getScriptTimeZone();
    const sheet = initOvertimeSheet();
    const data = sheet.getDataRange().getValues();
    const nameMap = getEmployeeNameMap_();
    const employeeId = String(params.employeeId || '').trim();
    const status = String(params.status || '').trim().toLowerCase();
    const records = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const uid = String(row[1] || '').trim();
      if (!uid) continue;
      if (employeeId && uid !== employeeId) continue;
      const rowStatus = String(row[9] || '').trim().toLowerCase();
      if (status && rowStatus !== status) continue;
      const date = isDateValue_(row[3]) ? Utilities.formatDate(row[3], tz, 'yyyy-MM-dd') : String(row[3] || '').substring(0, 10);
      if (date < params.startDate || date > params.endDate) continue;
      records.push({
        row: i + 1,
        key: overtimeFingerprint_(row),
        userId: uid,
        name: nameMap[uid] || String(row[2] || ''),
        date: date,
        startTime: overtimeTimeText_(row[4], tz),
        endTime: overtimeTimeText_(row[5], tz),
        hours: Number(row[6]) || 0,
        reason: String(row[7] || ''),
        status: rowStatus,
        reviewer: String(row[11] || ''),
        comment: String(row[13] || ''),
        compHours: Number(row[14]) || 0
      });
    }
    records.sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));
    return { ok: true, records: records };
  } catch (error) {
    Logger.log(' handleAdminListOvertime 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

function lockedOvertimeRow_(sheet, params) {
  const rowNumber = Number(params.row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    return { ok: false, code: 'RECORDS_STALE', msg: '這筆資料已經變動，請重新查詢' };
  }
  const record = sheet.getRange(rowNumber, 1, 1, 15).getValues()[0];
  if (overtimeFingerprint_(record) !== String(params.key || '')) {
    return { ok: false, code: 'RECORDS_STALE', msg: '這筆資料已經變動，請重新查詢' };
  }
  return { ok: true, row: rowNumber, record: record };
}

/**
 * API：修改加班的開始、結束時間與時數
 * 參數：row、key、startTime、endTime（HH:mm）、hours（0～24）
 */
function handleAdminUpdateOvertime(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;
    const startOk = /^\d{2}:\d{2}$/.test(params.startTime || '');
    const endOk = /^\d{2}:\d{2}$/.test(params.endTime || '');
    const hours = Number(params.hours);
    if (!startOk || !endOk) return { ok: false, code: 'RECORDS_DATE', msg: '時間格式要是 HH:mm' };
    if (!isFinite(hours) || hours <= 0 || hours > 24) return { ok: false, code: 'RECORDS_HOURS', msg: '加班時數要大於 0、最多 24' };

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    let found;
    try {
      const sheet = initOvertimeSheet();
      found = lockedOvertimeRow_(sheet, params);
      if (!found.ok) return found;
      const status = String(found.record[9]).trim().toLowerCase();
      if (status === 'rejected' || status === OVERTIME_STATUS_CANCELLED) {
        return { ok: false, code: 'RECORDS_OT_NOT_ACTIVE', msg: '已駁回或取消的加班不能修改' };
      }
      const tz = Session.getScriptTimeZone();
      params.before = `${overtimeTimeText_(found.record[4], tz)}~${overtimeTimeText_(found.record[5], tz)} ${found.record[6]} 小時`;
      // 跟員工送出時一樣，開始、結束存成「加班日期 + 時間」
      const dateStr = isDateValue_(found.record[3]) ? Utilities.formatDate(found.record[3], tz, 'yyyy-MM-dd') : String(found.record[3]).substring(0, 10);
      const startAt = parsePunchDateTime_(dateStr, params.startTime);
      const endAt = parsePunchDateTime_(dateStr, params.endTime);
      if (!startAt || !endAt) return { ok: false, code: 'RECORDS_DATE', msg: '時間格式要是 HH:mm' };
      sheet.getRange(found.row, 5, 1, 3).setValues([[startAt, endAt, Math.round(hours * 100) / 100]]);
      const oldComment = String(found.record[13] || '');
      sheet.getRange(found.row, 14).setValue((oldComment ? oldComment + '；' : '') + `管理員修改（${admin.user.name}）`);
    } finally {
      lock.releaseLock();
    }

    const status = String(found.record[9]).trim().toLowerCase();
    const salaryUpdated = status === 'approved' ? recalcSalaryAfterOvertimeChange_(String(found.record[1]).trim(), found.record[3]) : false;
    params.employeeId = String(found.record[1]).trim();
    params.employeeName = String(found.record[2] || '');
    return { ok: true, salaryUpdated: salaryUpdated };
  } catch (error) {
    Logger.log(' handleAdminUpdateOvertime 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/** API：取消一筆加班。參數：row、key、comment */
function handleAdminCancelOvertime(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    let found;
    try {
      const sheet = initOvertimeSheet();
      found = lockedOvertimeRow_(sheet, params);
      if (!found.ok) return found;
      const status = String(found.record[9]).trim().toLowerCase();
      if (status === 'rejected' || status === OVERTIME_STATUS_CANCELLED) {
        return { ok: false, code: 'RECORDS_OT_NOT_ACTIVE', msg: '這筆加班已經取消或駁回了' };
      }
      const note = '管理員取消（' + admin.user.name + '）' + (params.comment ? '：' + String(params.comment).slice(0, 200) : '');
      sheet.getRange(found.row, 10, 1, 5).setValues([[OVERTIME_STATUS_CANCELLED, admin.user.userId, admin.user.name, new Date(), note]]);
    } finally {
      lock.releaseLock();
    }

    const status = String(found.record[9]).trim().toLowerCase();
    const salaryUpdated = status === 'approved' ? recalcSalaryAfterOvertimeChange_(String(found.record[1]).trim(), found.record[3]) : false;
    params.employeeId = String(found.record[1]).trim();
    params.employeeName = String(found.record[2] || '');
    params.cancelled = `${found.record[6]} 小時（原狀態 ${status}）`;
    return { ok: true, salaryUpdated: salaryUpdated };
  } catch (error) {
    Logger.log(' handleAdminCancelOvertime 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

// ==================== 資料表（試算表裡的每一張工作表：查、新增、修改、刪除） ====================
//
// 管理員不用打開 Google 試算表，直接在網頁上操作任何一張表。
//   ・登入憑證（Session、登入連結）不列出：看得到就能冒用別人登入
//   ・稽核記錄（管理操作記錄、薪資異動記錄）只能看：能改就失去記錄的意義
//   ・修改用「列號 + 指紋」指定：清單載入後有人動過那一列（或列號位移），就拒絕，不會改錯列
//   ・寫回時照原本的格式：日期還是日期、數字還是數字，0912… 這類號碼不會被試算表轉成數字；
//     只寫有改到的格子，公式不會被蓋掉

const SHEET_EDITOR_HIDDEN = ['Session', '登入連結'];
const SHEET_EDITOR_READONLY = ['管理操作記錄', '薪資異動記錄'];
const SHEET_EDITOR_PAGE_SIZE = 100;
// 這些欄位的內容不寫進管理操作記錄（只記「已修改」）
const SHEET_EDITOR_SENSITIVE = /身分證|身份證|證號|帳號|帳戶|銀行|密碼|idNumber|account|password|secret/i;

function editorAuditText_(header, text) {
  return SHEET_EDITOR_SENSITIVE.test(String(header || '')) ? '***' : text;
}

function editorSheet_(name) {
  const sheetName = String(name || '');
  if (!sheetName || SHEET_EDITOR_HIDDEN.indexOf(sheetName) !== -1) return null;
  return getSpreadsheet_().getSheetByName(sheetName);
}

/** 儲存格 → { v: 顯示／編輯用文字, t: 型別 }。型別：date、datetime、time、number、bool、text */
function editorCell_(value, tz) {
  if (isDateValue_(value)) {
    if (value.getFullYear() < 1901) return { v: Utilities.formatDate(value, tz, 'HH:mm'), t: 'time' };
    const hms = Utilities.formatDate(value, tz, 'HH:mm:ss');
    if (hms === '00:00:00') return { v: Utilities.formatDate(value, tz, 'yyyy-MM-dd'), t: 'date' };
    return { v: Utilities.formatDate(value, tz, 'yyyy-MM-dd HH:mm:ss'), t: 'datetime' };
  }
  if (typeof value === 'number') return { v: String(value), t: 'number' };
  if (typeof value === 'boolean') return { v: value ? 'TRUE' : 'FALSE', t: 'bool' };
  return { v: value === null || value === undefined ? '' : String(value), t: 'text' };
}

function editorRowKey_(raw) {
  const text = JSON.stringify(raw.map(v => isDateValue_(v) ? 'D' + v.getTime() : v));
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** 每一欄的型別（看前幾個有值的格子，最多的那種），新增列時用 */
function editorColumnTypes_(values, width, tz) {
  const types = [];
  for (let c = 0; c < width; c++) {
    const count = {};
    let seen = 0;
    for (let r = values.length - 1; r >= 1 && seen < 30; r--) {
      const v = values[r][c];
      if (v === '' || v === null || v === undefined) continue;
      const t = editorCell_(v, tz).t;
      count[t] = (count[t] || 0) + 1;
      seen++;
    }
    types.push(Object.keys(count).sort((a, b) => count[b] - count[a])[0] || 'text');
  }
  return types;
}

/** 使用者輸入的文字 → 要寫進試算表的值（照欄位型別） */
function editorParseInput_(text, type) {
  const s = String(text === null || text === undefined ? '' : text).trim();
  if (s === '') return '';
  let m;
  if (type === 'date' || type === 'datetime') {
    m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    throw new Error(`「${s}」不是日期，請用 2026-10-05 或 2026-10-05 18:30 這種格式`);
  }
  if (type === 'time') {
    m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return new Date(1899, 11, 30, Number(m[1]), Number(m[2]), 0);
    throw new Error(`「${s}」不是時間，請用 18:30 這種格式`);
  }
  if (type === 'number') {
    if (/^-?\d+(\.\d+)?$/.test(s.replace(/,/g, ''))) return Number(s.replace(/,/g, ''));
    throw new Error(`「${s}」不是數字`);
  }
  if (type === 'bool') return /^(true|是|y|yes|1|v)$/i.test(s);
  // 文字：加單引號，試算表就不會把 0912… 轉成數字、把 =… 當成公式
  return /^[=+\-@]|^\d/.test(s) ? "'" + s : s;
}

function editorReadOnly_(name) {
  return SHEET_EDITOR_READONLY.indexOf(name) !== -1;
}

/** API：試算表裡所有工作表（實際名稱、資料列數、是否唯讀） */
function handleAdminListSheets(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;
    const sheets = getSpreadsheet_().getSheets()
      .filter(sh => SHEET_EDITOR_HIDDEN.indexOf(sh.getName()) === -1)
      .map(sh => ({ name: sh.getName(), rows: Math.max(0, sh.getLastRow() - 1), readOnly: editorReadOnly_(sh.getName()) }));
    return { ok: true, sheets: sheets };
  } catch (error) {
    Logger.log(' handleAdminListSheets 錯誤: ' + error.message);
    return { ok: false, msg: '讀取工作表清單失敗：' + error.message };
  }
}

/**
 * API：讀一張工作表（最新的在前，每頁 100 列）
 * 參數：sheet（工作表名稱）、keyword（整列搜尋）、column（欄位編號，0 起算）＋ value（該欄包含的文字）、page（0 起算）
 */
function handleAdminBrowseSheet(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;
    const sheet = editorSheet_(params.sheet);
    if (!sheet) return { ok: false, code: 'RECORDS_NO_SHEET', msg: '找不到這張工作表' };

    const tz = Session.getScriptTimeZone();
    const name = sheet.getName();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 1 || lastCol < 1) {
      return { ok: true, name: name, readOnly: editorReadOnly_(name), headers: [], types: [], rows: [], total: 0, page: 0, pageSize: SHEET_EDITOR_PAGE_SIZE };
    }
    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = values[0].map((h, i) => String(h === null || h === undefined ? '' : h).trim());
    const types = editorColumnTypes_(values, lastCol, tz);

    const keyword = String(params.keyword || '').trim().toLowerCase();
    const column = params.column === '' || params.column === undefined ? -1 : Number(params.column);
    const columnValue = String(params.value || '').trim().toLowerCase();
    const page = Math.max(0, parseInt(params.page, 10) || 0);

    const matched = [];
    for (let r = values.length - 1; r >= 1; r--) {
      const raw = values[r];
      if (!raw.some(v => v !== '' && v !== null)) continue;
      const cells = raw.map(v => editorCell_(v, tz));
      if (keyword && !cells.map(c => c.v).join(' ').toLowerCase().includes(keyword)) continue;
      if (column >= 0 && columnValue && !(cells[column] && cells[column].v.toLowerCase().includes(columnValue))) continue;
      matched.push({ row: r + 1, raw: raw, cells: cells });
    }

    const slice = matched.slice(page * SHEET_EDITOR_PAGE_SIZE, (page + 1) * SHEET_EDITOR_PAGE_SIZE).map(item => ({
      row: item.row,
      key: editorRowKey_(item.raw),
      cells: item.cells
    }));
    return {
      ok: true, name: name, readOnly: editorReadOnly_(name),
      headers: headers, types: types, rows: slice,
      total: matched.length, page: page, pageSize: SHEET_EDITOR_PAGE_SIZE
    };
  } catch (error) {
    Logger.log(' handleAdminBrowseSheet 錯誤: ' + error.message);
    return { ok: false, msg: '讀取工作表失敗：' + error.message };
  }
}

function editorWritableSheet_(params) {
  const sheet = editorSheet_(params.sheet);
  if (!sheet) return { ok: false, code: 'RECORDS_NO_SHEET', msg: '找不到這張工作表' };
  if (editorReadOnly_(sheet.getName())) return { ok: false, code: 'RECORDS_READONLY', msg: '這張表是稽核記錄，只能查看不能修改' };
  return { ok: true, sheet: sheet };
}

function editorParseValues_(params) {
  let values;
  try {
    values = JSON.parse(params.values || '[]');
  } catch (e) {
    return null;
  }
  return Array.isArray(values) ? values : null;
}

/**
 * API：修改一列。只寫有變動的格子。
 * 參數：sheet、row、key、values（JSON 陣列，每欄的文字，長度 = 欄數）
 */
function handleAdminUpdateSheetRow(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;
    const target = editorWritableSheet_(params);
    if (!target.ok) return target;
    const sheet = target.sheet;
    const input = editorParseValues_(params);
    if (!input) return { ok: false, code: 'RECORDS_INVALID', msg: '資料格式錯誤' };

    const tz = Session.getScriptTimeZone();
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const row = Number(params.row);
      const lastCol = sheet.getLastColumn();
      if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) {
        return { ok: false, code: 'RECORDS_STALE', msg: '這一列已經變動，請重新查詢' };
      }
      const raw = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
      if (editorRowKey_(raw) !== String(params.key || '')) {
        return { ok: false, code: 'RECORDS_STALE', msg: '這一列已經被改過或位置變了，請重新查詢' };
      }
      const all = sheet.getRange(1, 1, sheet.getLastRow(), lastCol).getValues();
      const colTypes = editorColumnTypes_(all, lastCol, tz);
      const headers = all[0];

      const changes = [];
      for (let c = 0; c < Math.min(lastCol, input.length); c++) {
        const old = editorCell_(raw[c], tz);
        const text = String(input[c] === null || input[c] === undefined ? '' : input[c]).trim();
        if (text === old.v) continue;
        const type = raw[c] === '' || raw[c] === null ? colTypes[c] : old.t;
        let value;
        try {
          value = editorParseInput_(text, type);
        } catch (e) {
          return { ok: false, code: 'RECORDS_FORMAT', msg: `「${headers[c] || '第 ' + (c + 1) + ' 欄'}」：${e.message}` };
        }
        changes.push({ col: c + 1, value: value,
          label: `${headers[c] || '第' + (c + 1) + '欄'}: ${editorAuditText_(headers[c], old.v)}→${editorAuditText_(headers[c], text)}` });
      }
      changes.forEach(ch => sheet.getRange(row, ch.col).setValue(ch.value));

      params.changes = changes.length ? `${sheet.getName()} 第${row}列 ` + changes.map(ch => ch.label).join('; ') : '沒有變更';
      params.values = '';
      return { ok: true, changed: changes.length };
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    Logger.log(' handleAdminUpdateSheetRow 錯誤: ' + error.message);
    return { ok: false, msg: '儲存失敗：' + error.message };
  }
}

/**
 * API：在表的最後新增一列
 * 參數：sheet、values（JSON 陣列）
 */
function handleAdminAddSheetRow(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;
    const target = editorWritableSheet_(params);
    if (!target.ok) return target;
    const sheet = target.sheet;
    const input = editorParseValues_(params);
    if (!input || !input.some(v => String(v || '').trim() !== '')) {
      return { ok: false, code: 'RECORDS_INVALID', msg: '請至少填一個欄位' };
    }

    const tz = Session.getScriptTimeZone();
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const lastCol = Math.max(1, sheet.getLastColumn());
      const all = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, sheet.getLastRow(), lastCol).getValues() : [[]];
      const colTypes = editorColumnTypes_(all, lastCol, tz);
      const headers = all[0] || [];
      const row = [];
      for (let c = 0; c < lastCol; c++) {
        try {
          row.push(editorParseInput_(input[c], colTypes[c]));
        } catch (e) {
          return { ok: false, code: 'RECORDS_FORMAT', msg: `「${headers[c] || '第 ' + (c + 1) + ' 欄'}」：${e.message}` };
        }
      }
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, lastCol).setValues([row]);
      params.changes = `${sheet.getName()} 新增：` + input.map((v, c) => editorAuditText_(headers[c], String(v || '').trim()))
        .filter(Boolean).join(' | ').slice(0, 300);
      params.values = '';
      return { ok: true };
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    Logger.log(' handleAdminAddSheetRow 錯誤: ' + error.message);
    return { ok: false, msg: '新增失敗：' + error.message };
  }
}

/** API：刪除一列。參數：sheet、row、key */
function handleAdminDeleteSheetRow(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;
    const target = editorWritableSheet_(params);
    if (!target.ok) return target;
    const sheet = target.sheet;

    const tz = Session.getScriptTimeZone();
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const row = Number(params.row);
      if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) {
        return { ok: false, code: 'RECORDS_STALE', msg: '這一列已經變動，請重新查詢' };
      }
      const raw = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
      if (editorRowKey_(raw) !== String(params.key || '')) {
        return { ok: false, code: 'RECORDS_STALE', msg: '這一列已經被改過或位置變了，請重新查詢' };
      }
      sheet.deleteRow(row);
      const headers = sheet.getRange(1, 1, 1, raw.length).getValues()[0];
      params.changes = `${sheet.getName()} 刪除第${row}列：` + raw.map((v, c) => editorAuditText_(headers[c], editorCell_(v, tz).v))
        .filter(Boolean).join(' | ').slice(0, 300);
      return { ok: true };
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    Logger.log(' handleAdminDeleteSheetRow 錯誤: ' + error.message);
    return { ok: false, msg: '刪除失敗：' + error.message };
  }
}

// ==================== 工時明細（算薪水用） ====================
//
// 選月份，列出每位員工每天的上下班時段與工時、整月合計。
// 工時用的是薪資計算同一支函式（getEmployeeMonthlyAttendanceInternal），兩邊的數字一定一樣。

/**
 * API：月工時明細
 * 參數：yearMonth（yyyy-MM）、employeeId（可省略 = 全部在職員工）
 */
function handleAdminMonthlyHours(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;
    const yearMonth = String(params.yearMonth || '');
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return { ok: false, code: 'RECORDS_DATE', msg: '請選擇月份' };

    const nameMap = getEmployeeNameMap_();
    let ids;
    if (params.employeeId) {
      ids = [String(params.employeeId).trim()];
    } else {
      const values = getSpreadsheet_().getSheetByName(SHEET_EMPLOYEES).getDataRange().getValues();
      ids = values.slice(1)
        .filter(r => String(r[0] || '').trim() && String(r[7] || '啟用').trim() === '啟用')
        .map(r => String(r[0]).trim());
    }

    const employees = ids.map(id => {
      const attendance = getEmployeeMonthlyAttendanceInternal(id, yearMonth) || [];
      const days = attendance.map(d => ({
        date: d.date,
        segments: d.segments || [],
        punchIn: d.punchIn || '',
        punchOut: d.punchOut || '',
        hours: Number(d.workHours) || 0,
        unpaired: Number(d.unpaired) || 0,
        adjusted: Number(d.adjustedCount) || 0
      }));
      const total = days.reduce((sum, d) => sum + d.hours, 0);
      return {
        userId: id,
        name: nameMap[id] || id,
        days: days,
        totalHours: Math.round(total * 100) / 100,
        daysWorked: days.filter(d => d.hours > 0).length,
        incompleteDays: days.filter(d => d.unpaired > 0).length
      };
    }).filter(e => params.employeeId || e.days.length);   // 全部時，沒有打卡的人不列

    employees.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, yearMonth: yearMonth, employees: employees };
  } catch (error) {
    Logger.log(' handleAdminMonthlyHours 錯誤: ' + error.message);
    return { ok: false, msg: '計算工時失敗：' + error.message };
  }
}
