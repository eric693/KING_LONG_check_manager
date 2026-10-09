// OvertimeOperations.gs - 加班功能後端（完全修正版）

// ==================== 常數定義 ====================
const SHEET_OVERTIME = "加班申請";

// ==================== 資料庫操作 ====================

/**
 * 初始化加班申請工作表
 */
function initOvertimeSheet() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_OVERTIME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_OVERTIME);
    const headers = [
      "申請ID", "員工ID", "員工姓名", "加班日期", 
      "開始時間", "結束時間", "加班時數", "申請原因",
      "申請時間", "審核狀態", "審核人ID", "審核人姓名",
      "審核時間", "審核意見", "補休時數"
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    Logger.log(" 加班申請工作表已建立");
  }
  
  return sheet;
}

function submitOvertimeRequest(sessionToken, overtimeDate, startTime, endTime, hours, reason, compensatoryHours) {
  const employee = checkSession_(sessionToken);
  const user = employee.user;
  if (!user) return { ok: false, code: "ERR_SESSION_INVALID" };
  
  const sheet = initOvertimeSheet();
  
  //  防重複提交
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowUserId = String(row[1]).trim();
    const rowDate = formatDate(row[3]);
    const rowStatus = String(row[9]).trim().toLowerCase();
    const rowStartTime = typeof row[4] === 'object' 
      ? Utilities.formatDate(row[4], "Asia/Taipei", "HH:mm")
      : String(row[4]).substring(0, 5);
    
    if (rowUserId === user.userId && 
        rowDate === overtimeDate && 
        rowStartTime === startTime &&
        rowStatus === "pending") {
      Logger.log(` 防重複: ${user.name} 在 ${overtimeDate} ${startTime} 已有待審核申請`);
      return { 
        ok: false, 
        code: "ERR_DUPLICATE_OVERTIME",
        msg: "您已提交過相同時段的加班申請，請等待審核"
      };
    }
  }
  
  const requestId = "OT" + new Date().getTime();
  
  const startDateTime = new Date(`${overtimeDate}T${startTime}:00`);
  const endDateTime = new Date(`${overtimeDate}T${endTime}:00`);
  
  const compHours = parseFloat(compensatoryHours) || 0;
  
  Logger.log(` 提交加班: ${user.name}, 日期=${overtimeDate}, 時數=${hours}, 補休=${compHours}`);
  
  const row = [
    requestId,
    user.userId,
    user.name,
    overtimeDate,
    startDateTime,
    endDateTime,
    parseFloat(hours),
    reason,
    new Date(),
    "pending",
    "", "", "", "",
    compHours
  ];
  
  sheet.appendRow(row);

  //  通知所有管理員
  try {
    notifyAdminsNewOvertimeRequest(
      user.name,
      overtimeDate,
      startTime,
      endTime,
      parseFloat(hours),
      reason
    );
    Logger.log(` 已通知管理員：${user.name} 提交加班申請`);
  } catch (notifyErr) {
    Logger.log(' 通知管理員失敗（不影響申請結果）: ' + notifyErr.message);
  }
  
  return { 
    ok: true, 
    code: "OVERTIME_SUBMIT_SUCCESS",
    requestId: requestId
  };
}

/**
 * Handler - 接收補休時數參數
 */
function handleSubmitOvertime(params) {
  const { token, overtimeDate, startTime, endTime, hours, reason, compensatoryHours } = params;
  
  Logger.log(` 收到加班申請: 日期=${overtimeDate}, 時數=${hours}, 補休=${compensatoryHours || 0}`);
  
  return submitOvertimeRequest(
    token, 
    overtimeDate, 
    startTime, 
    endTime, 
    parseFloat(hours), 
    reason,
    parseFloat(compensatoryHours) || 0
  );
}

/**
 * 查詢員工的加班申請記錄
 */
function getEmployeeOvertimeRequests(sessionToken) {
  const employee = checkSession_(sessionToken);
  const user = employee.user;
  if (!user) return { ok: false, code: "ERR_SESSION_INVALID" };
  
  const sheet = getSpreadsheet_().getSheetByName(SHEET_OVERTIME);
  if (!sheet) return { ok: true, requests: [] };
  
  const values = sheet.getDataRange().getValues();
  
  const formatTime = (dateTime) => {
    if (!dateTime) return "";
    if (typeof dateTime === "string") {
      if (dateTime.includes(':')) return dateTime.substring(0, 5);
      return dateTime;
    }
    return Utilities.formatDate(dateTime, "Asia/Taipei", "HH:mm");
  };
  
  const requests = values.slice(1).filter(row => {
    return row[1] === user.userId;
  }).map(row => {
    return {
      requestId: row[0],
      overtimeDate: formatDate(row[3]),
      startTime: formatTime(row[4]),
      endTime: formatTime(row[5]),
      hours: parseFloat(row[6]) || 0,
      reason: row[7],
      applyDate: formatDate(row[8]),
      status: String(row[9]).trim().toLowerCase(),
      reviewerName: row[11] || "",
      reviewComment: row[13] || "",
      compensatoryHours: parseFloat(row[14]) || 0
    };
  });
  
  Logger.log(` 員工 ${user.name} 的加班記錄: ${requests.length} 筆`);
  return { ok: true, requests: requests };
}

/**
 * 取得所有待審核的加班申請（管理員用）- 加入後端去重
 */
function getPendingOvertimeRequests(sessionToken) {
  const employee = checkSession_(sessionToken);
  const user = employee.user;
  if (!user) return { ok: false, code: "ERR_SESSION_INVALID" };
  
  if (user.dept !== "管理員") {
    return { ok: false, code: "ERR_NO_PERMISSION" };
  }
  
  const sheet = getSpreadsheet_().getSheetByName(SHEET_OVERTIME);
  if (!sheet) return { ok: true, requests: [] };
  
  const values = sheet.getDataRange().getValues();
  
  const formatTime = (dateTime) => {
    if (!dateTime) return "";
    if (typeof dateTime === "string") {
      if (dateTime.includes(':')) return dateTime.substring(0, 5);
      return dateTime;
    }
    return Utilities.formatDate(dateTime, "Asia/Taipei", "HH:mm");
  };
  
  const requests = [];
  //  後端去重：同一員工同一日期同一開始時間只取最新一筆（rowNumber 最大）
  const seenKeys = {};
  
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const status = String(row[9]).trim().toLowerCase();
    
    if (status === "pending") {
      const employeeId = String(row[1]).trim();
      const date = formatDate(row[3]);
      const startT = formatTime(row[4]);
      const key = `${employeeId}_${date}_${startT}`;
      
      // 同一 key 出現多次，保留 rowNumber 最大的（最新提交的）
      if (seenKeys[key] !== undefined) {
        Logger.log(` 發現重複申請 key=${key}，row ${i+1} 覆蓋 row ${seenKeys[key].rowNumber}`);
        // 從 requests 移除舊的
        const oldIdx = requests.findIndex(r => r.rowNumber === seenKeys[key].rowNumber);
        if (oldIdx !== -1) requests.splice(oldIdx, 1);
      }
      
      const entry = {
        rowNumber: i + 1,
        requestId: row[0],
        employeeId: row[1],
        employeeName: row[2],
        overtimeDate: date,
        startTime: startT,
        endTime: formatTime(row[5]),
        hours: parseFloat(row[6]) || 0,
        reason: row[7],
        applyDate: formatDate(row[8]),
        compensatoryHours: parseFloat(row[14]) || 0
      };
      
      requests.push(entry);
      seenKeys[key] = entry;
    }
  }
  
  Logger.log(` 共 ${requests.length} 筆待審核加班申請（已去重）`);
  return { ok: true, requests: requests };
}

/**
 *  審核加班申請（完整版 - 含自動更新薪資）
 */
function reviewOvertimeRequest(sessionToken, rowNumber, action, comment) {
  const employee = checkSession_(sessionToken);
  const user = employee.user;
  if (!user) return { ok: false, code: "ERR_SESSION_INVALID" };
  
  if (user.dept !== "管理員") {
    return { ok: false, code: "ERR_NO_PERMISSION" };
  }
  
  const sheet = getSpreadsheet_().getSheetByName(SHEET_OVERTIME);
  if (!sheet) return { ok: false, msg: "找不到加班申請工作表" };
  
  const actionStr = String(action).trim().toLowerCase();
  const isApprove = (actionStr === "approve");
  const status = isApprove ? "approved" : "rejected";
  const reviewTime = new Date();
  
  Logger.log(` 審核請求: rowNumber=${rowNumber}, action="${action}", 處理後="${actionStr}", isApprove=${isApprove}, 目標狀態="${status}"`);
  
  try {
    const record = sheet.getRange(rowNumber, 1, 1, 15).getValues()[0];
    const requestId = record[0];
    const employeeId = record[1];
    const employeeName = record[2];
    const overtimeDate = record[3];
    const startTime = record[4];
    const endTime = record[5];
    const hours = record[6];
    const reason = record[7];
    
    Logger.log(` 審核對象: ${employeeName}, 日期: ${formatDate(overtimeDate)}, 時數: ${hours}`);
    
    sheet.getRange(rowNumber, 10).setValue(status);
    sheet.getRange(rowNumber, 11).setValue(user.userId);
    sheet.getRange(rowNumber, 12).setValue(user.name);
    sheet.getRange(rowNumber, 13).setValue(reviewTime);
    sheet.getRange(rowNumber, 14).setValue(comment || "");
    
    SpreadsheetApp.flush();
    
    const actualStatus = String(sheet.getRange(rowNumber, 10).getValue()).trim().toLowerCase();
    Logger.log(` 審核完成: 預期=${status}, 實際=${actualStatus}`);
    
    if (actualStatus !== status) {
      Logger.log(` 狀態不符！`);
      return {
        ok: false,
        msg: `狀態寫入異常：預期 ${status}，實際 ${actualStatus}`
      };
    }
    
    if (isApprove) {
      try {
        let yearMonth = '';
        if (overtimeDate instanceof Date) {
          yearMonth = Utilities.formatDate(overtimeDate, 'Asia/Taipei', 'yyyy-MM');
        } else if (typeof overtimeDate === 'string') {
          yearMonth = overtimeDate.substring(0, 7);
        }
        
        Logger.log(` 開始更新 ${employeeName} 的 ${yearMonth} 薪資...`);
        
        const recalcResult = calculateMonthlySalary(employeeId, yearMonth);
        
        if (recalcResult.success) {
          const saveResult = saveMonthlySalary(recalcResult.data);
          if (saveResult.success) {
            Logger.log(` 已自動更新 ${employeeName} 的 ${yearMonth} 薪資`);
          } else {
            Logger.log(` 薪資儲存失敗: ${saveResult.message}`);
          }
        } else {
          Logger.log(` 薪資計算失敗: ${recalcResult.message}`);
        }
        
      } catch (error) {
        Logger.log(` 自動更新薪資時發生錯誤: ${error.message}`);
      }
    }
    
    try {
      notifyOvertimeReview(
        employeeId,
        employeeName,
        formatDate(overtimeDate),
        hours,
        user.name,
        isApprove,
        comment || ""
      );
      Logger.log(` 已發送加班審核通知給 ${employeeName} (${employeeId})`);
    } catch (err) {
      Logger.log(` LINE 通知發送失敗: ${err.message}`);
    }
    
    const resultCode = isApprove ? "OVERTIME_APPROVED" : "OVERTIME_REJECTED";
    Logger.log(` 返回結果碼: ${resultCode}`);
    
    return { 
      ok: true, 
      code: resultCode
    };
    
  } catch (error) {
    Logger.log(` 審核失敗: ${error.message}`);
    return { 
      ok: false, 
      msg: `審核失敗: ${error.message}` 
    };
  }
}

/**
 *  升級工具：為現有工作表新增補休時數欄位（只需執行一次）
 */
function upgradeOvertimeSheet() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_OVERTIME);
  
  if (!sheet) {
    Logger.log(" 工作表不存在，將建立新表");
    initOvertimeSheet();
    return;
  }
  
  const lastCol = sheet.getLastColumn();
  
  if (lastCol >= 15) {
    const header15 = sheet.getRange(1, 15).getValue();
    if (header15 === "補休時數") {
      Logger.log(" 已存在補休時數欄位，無需升級");
      return;
    }
  }
  
  sheet.getRange(1, 15).setValue("補休時數").setFontWeight("bold");
  sheet.setColumnWidth(15, 80);
  
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const defaultValues = Array(lastRow - 1).fill([0]);
    sheet.getRange(2, 15, lastRow - 1, 1).setValues(defaultValues);
  }
  
  Logger.log(` 升級完成！已為 ${lastRow - 1} 筆記錄新增補休時數欄位`);
}

// ==================== Handlers ====================

