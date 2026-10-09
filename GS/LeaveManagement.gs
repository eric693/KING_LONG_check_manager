// LeaveManagement.gs - 小時制請假系統（無時段限制版）

function submitLeaveRequest(sessionToken, leaveType, startDateTime, endDateTime, reason) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 開始處理請假申請（無時段限制版）');
    Logger.log('═══════════════════════════════════════');
    
    Logger.log(' 驗證 Session...');
    const employee = checkSession_(sessionToken);
    
    if (!employee.ok || !employee.user) {
      Logger.log(' Session 驗證失敗');
      return { 
        ok: false, 
        code: "ERR_SESSION_INVALID",
        msg: "未授權或 session 已過期" 
      };
    }
    
    const user = employee.user;
    Logger.log(' Session 驗證成功');
    Logger.log(`   員工ID: ${user.userId}`);
    Logger.log(`   員工姓名: ${user.name}`);
    Logger.log('');
    
    Logger.log(' 收到的參數:');
    Logger.log(`   leaveType: ${leaveType}`);
    Logger.log(`   startDateTime: ${startDateTime}`);
    Logger.log(`   endDateTime: ${endDateTime}`);
    Logger.log(`   reason: ${reason}`);
    Logger.log('');
    
    Logger.log(' 解析日期時間...');
    
    let start, end;
    
    try {
      start = new Date(startDateTime);
      end = new Date(endDateTime);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        Logger.log(' 日期時間格式無效');
        return {
          ok: false,
          code: "ERR_INVALID_DATETIME",
          msg: "日期時間格式無效"
        };
      }
      
      Logger.log(' 日期時間解析成功');
      Logger.log(`   開始: ${start.toISOString()}`);
      Logger.log(`   結束: ${end.toISOString()}`);
      
    } catch (parseError) {
      Logger.log(' 日期時間解析失敗: ' + parseError.message);
      return {
        ok: false,
        code: "ERR_DATETIME_PARSE",
        msg: "無法解析日期時間"
      };
    }
    
    Logger.log('');

    if (end <= start) {
      Logger.log(' 結束時間必須晚於開始時間');
      return {
        ok: false,
        code: "ERR_INVALID_TIME_RANGE",
        msg: "結束時間必須晚於開始時間"
      };
    }

    Logger.log(' 檢查是否為整點時間...');

    const startMinutes = start.getMinutes();
    const startSeconds = start.getSeconds();
    const endMinutes = end.getMinutes();
    const endSeconds = end.getSeconds();

    if (startMinutes !== 0 || startSeconds !== 0) {
      Logger.log(` 開始時間不是整點: ${start.toISOString()}`);
      return {
        ok: false,
        code: "ERR_INVALID_TIME_FORMAT",
        msg: "開始時間必須是整點（例如：09:00, 10:00）"
      };
    }

    if (endMinutes !== 0 || endSeconds !== 0) {
      Logger.log(` 結束時間不是整點: ${end.toISOString()}`);
      return {
        ok: false,
        code: "ERR_INVALID_TIME_FORMAT",
        msg: "結束時間必須是整點（例如：09:00, 10:00）"
      };
    }

    Logger.log(' 時間格式檢查通過（整點）');
    Logger.log('');

    Logger.log(' 計算工作時數和天數（無時段限制）...');
    
    const { workHours, days } = calculateWorkHoursAndDays_Unlimited(start, end);
    
    Logger.log(`   工作時數: ${workHours} 小時`);
    Logger.log(`   天數: ${days} 天`);
    Logger.log('');
    
    Logger.log(' 檢查假期餘額...');
    const balance = getLeaveBalance(sessionToken);
    
    if (!balance.ok) {
      Logger.log(' 無法取得假期餘額');
      return {
        ok: false,
        code: "ERR_BALANCE_CHECK",
        msg: "無法取得假期餘額"
      };
    }
    
    Logger.log(' 假期餘額檢查完成');
    Logger.log('');
    
    Logger.log(' 格式化日期時間...');
    
    const formattedStartDateTime = Utilities.formatDate(
      start,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd HH:mm:ss'
    );
    
    const formattedEndDateTime = Utilities.formatDate(
      end,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd HH:mm:ss'
    );
    
    Logger.log(`   開始時間（格式化）: ${formattedStartDateTime}`);
    Logger.log(`   結束時間（格式化）: ${formattedEndDateTime}`);
    Logger.log('');
    
    Logger.log(' 取得工作表...');
    const sheet = getLeaveRecordsSheet();
    
    if (!sheet) {
      Logger.log(' 無法取得請假記錄工作表');
      return {
        ok: false,
        code: "ERR_SHEET_ACCESS",
        msg: "無法存取請假記錄工作表"
      };
    }
    
    Logger.log(' 工作表已就緒');
    Logger.log('');
    
    Logger.log(' 準備寫入資料...');
    
    const row = [
      new Date(),                  // A: 申請時間
      user.userId || '',           // B: 員工ID
      user.name || '',             // C: 姓名
      user.dept || '',             // D: 部門
      leaveType || '',             // E: 假別
      formattedStartDateTime,      // F: 開始時間
      formattedEndDateTime,        // G: 結束時間
      workHours,                   // H: 工作時數
      days,                        // I: 天數
      reason || '',                // J: 原因
      'PENDING',                   // K: 狀態
      '',                          // L: 審核人
      '',                          // M: 審核時間
      ''                           // N: 審核意見
    ];
    
    try {
      sheet.appendRow(row);
      Logger.log(' 資料寫入成功');
    } catch (writeError) {
      Logger.log(' 資料寫入失敗: ' + writeError.message);
      return {
        ok: false,
        code: "ERR_WRITE_FAILED",
        msg: "無法寫入請假記錄"
      };
    }

    //  通知所有管理員
    try {
      notifyAdminsNewLeaveRequest(
        user.name,
        leaveType,
        formattedStartDateTime,
        formattedEndDateTime,
        workHours,
        reason
      );
      Logger.log(' 已通知管理員');
    } catch (notifyErr) {
      Logger.log(' 通知管理員失敗（不影響申請結果）: ' + notifyErr.message);
    }
    
    Logger.log('');
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 請假申請提交成功');
    Logger.log('═══════════════════════════════════════');
    
    return {
      ok: true,
      code: "LEAVE_SUBMIT_SUCCESS",
      msg: "請假申請已提交",
      data: {
        leaveType: leaveType,
        startDateTime: formattedStartDateTime,
        endDateTime: formattedEndDateTime,
        workHours: workHours,
        days: days,
        reason: reason
      }
    };
    
  } catch (error) {
    Logger.log('');
    Logger.log(' submitLeaveRequest 發生錯誤');
    Logger.log('錯誤訊息: ' + error.message);
    Logger.log('錯誤堆疊: ' + error.stack);
    Logger.log('═══════════════════════════════════════');
    
    return {
      ok: false,
      code: "ERR_INTERNAL_ERROR",
      msg: "系統錯誤：" + error.message
    };
  }
}

/**
 *  計算請假時數與天數
 *
 * 只計算落在「工作時段」內的時間，並跳過非工作日（週六日與國定假日）。
 * 舊版是用牆上時鐘的時間差再扣午休，9/9 08:30 到 9/11 17:30 會算成 54 小時，
 * 把兩個晚上也算進去；三天事假應該是 3 × 8 = 24 小時。
 * 工作時段改由「系統設定」工作表控制，管理員可在網頁版調整（見 SystemSettings.gs）。
 * 下面這組只是還沒設定過、或設定值不合法時的預設值。
 */
const DEFAULT_WORK_SCHEDULE = {
  start: '08:30',       // 上班
  end: '17:30',         // 下班
  lunchStart: '12:00',  // 午休開始
  lunchEnd: '13:00'     // 午休結束
};

function toMinutesOfDay_(hhmm) {
  const parts = String(hhmm).split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

function overlapMinutes_(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function calculateWorkHoursAndDays_Unlimited(start, end) {
  try {
    Logger.log(' 計算請假時數（工作時段版）');
    Logger.log(`   開始: ${start}`);
    Logger.log(`   結束: ${end}`);

    if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end) || end <= start) {
      return { workHours: 0, days: 0 };
    }

    const workSchedule = (typeof getWorkSchedule_ === 'function')
      ? getWorkSchedule_()
      : DEFAULT_WORK_SCHEDULE;
    const cfg = {
      start: toMinutesOfDay_(workSchedule.start),
      end: toMinutesOfDay_(workSchedule.end),
      lunchStart: toMinutesOfDay_(workSchedule.lunchStart),
      lunchEnd: toMinutesOfDay_(workSchedule.lunchEnd)
    };

    let totalMinutes = 0;
    const tz = Session.getScriptTimeZone();
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    while (cursor <= lastDay) {
      const dateStr = Utilities.formatDate(cursor, tz, 'yyyy-MM-dd');
      const dayOfWeek = cursor.getDay();
      const isHoliday = (typeof isNationalHoliday === 'function') && isNationalHoliday(dateStr);

      // 例假日、休息日與國定假日不計入請假時數
      if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) {
        Logger.log(`   ${dateStr} 非工作日，略過`);
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }

      const dayStart = new Date(cursor);
      const dayEnd = new Date(cursor);
      dayEnd.setHours(23, 59, 59, 999);

      const from = start > dayStart ? start : dayStart;
      const to = end < dayEnd ? end : dayEnd;

      if (to > from) {
        const fromMin = from.getHours() * 60 + from.getMinutes();
        const toMin = to.getHours() * 60 + to.getMinutes() + (to.getSeconds() >= 59 ? 1 : 0);

        let minutes = overlapMinutes_(fromMin, toMin, cfg.start, cfg.end);
        // 午休不算請假
        minutes -= overlapMinutes_(Math.max(fromMin, cfg.start), Math.min(toMin, cfg.end), cfg.lunchStart, cfg.lunchEnd);
        minutes = Math.max(0, minutes);

        if (minutes > 0) {
          Logger.log(`   ${dateStr} 計入 ${(minutes / 60).toFixed(2)} 小時`);
          totalMinutes += minutes;
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    const finalHours = Math.round((totalMinutes / 60) * 100) / 100;
    const days = Math.round((finalHours / 8) * 100) / 100;

    Logger.log(`    最終時數: ${finalHours} 小時 = ${days} 天`);

    return { workHours: finalHours, days: days };

  } catch (error) {
    Logger.log(` calculateWorkHoursAndDays_Unlimited 錯誤: ${error.message}`);
    return { workHours: 0, days: 0 };
  }
}

/**
 *  取得或建立請假記錄工作表
 */
function getLeaveRecordsSheet() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName('請假紀錄');
  
  if (!sheet) {
    Logger.log(' 請假紀錄工作表不存在，自動建立...');
    
    sheet = ss.insertSheet('請假紀錄');
    
    sheet.appendRow([
      '申請時間', '員工ID', '姓名', '部門', '假別',
      '開始時間', '結束時間', '工作時數', '天數', '原因',
      '狀態', '審核人', '審核時間', '審核意見'
    ]);
    
    const headerRange = sheet.getRange(1, 1, 1, 14);
    headerRange.setBackground('#4A90E2');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    
    sheet.setFrozenRows(1);
    
    Logger.log(' 請假紀錄工作表已建立');
  }
  
  return sheet;
}

/**
 *  取得假期餘額
 */
function getLeaveBalance(sessionToken) {
  try {
    const employee = checkSession_(sessionToken);
    
    if (!employee.ok || !employee.user) {
      return {
        ok: false,
        code: "ERR_SESSION_INVALID"
      };
    }
    
    const user = employee.user;
    Logger.log(' 查詢員工: ' + user.userId);
    
    const sheet = getLeaveBalanceSheet();
    
    if (!sheet) {
      Logger.log(' 工作表不存在，嘗試建立...');
      initializeEmployeeLeave(sessionToken);
      return getLeaveBalance(sessionToken);
    }
    
    const values = sheet.getDataRange().getValues();
    Logger.log(' 工作表行數: ' + values.length);
    
    for (let i = 1; i < values.length; i++) {
      Logger.log(`   檢查第 ${i} 行: ${values[i][0]}`);
      
      if (values[i][0] === user.userId) {
        Logger.log(' 找到員工資料');
        
        const balance = {
          employeeName: values[i][1] || user.name,
          hireDate: values[i][2] || null,        // C: 到職日 ⭐
          ANNUAL_LEAVE: values[i][3] || 0,       // D ⭐
          SICK_LEAVE: values[i][4] || 0,         // E ⭐
          PERSONAL_LEAVE: values[i][5] || 0,
          BEREAVEMENT_LEAVE: values[i][6] || 0,
          MARRIAGE_LEAVE: values[i][7] || 0,
          MATERNITY_LEAVE: values[i][8] || 0,
          PATERNITY_LEAVE: values[i][9] || 0,
          HOSPITALIZATION_LEAVE: values[i][10] || 0,
          MENSTRUAL_LEAVE: values[i][11] || 0,
          FAMILY_CARE_LEAVE: values[i][12] || 0,
          OFFICIAL_LEAVE: values[i][13] || 0,
          WORK_INJURY_LEAVE: values[i][14] || 0,
          NATURAL_DISASTER_LEAVE: values[i][15] || 0,
          COMP_TIME_OFF: values[i][16] || 0,
          ABSENCE_WITHOUT_LEAVE: values[i][17] || 0
        };

        // ⭐ 格式化到職日
        if (balance.hireDate) {
          balance.hireDate = formatDate(balance.hireDate);
        }
        Logger.log(' 假期餘額（小時）:');
        Logger.log(JSON.stringify(balance, null, 2));
        
        return {
          ok: true,
          balance: balance
        };
      }
    }
    
    Logger.log(' 找不到員工資料，嘗試初始化...');
    initializeEmployeeLeave(sessionToken);
    return getLeaveBalance(sessionToken);
    
  } catch (error) {
    Logger.log(' getLeaveBalance 錯誤: ' + error);
    Logger.log('錯誤堆疊: ' + error.stack);
    return {
      ok: false,
      code: "ERR_INTERNAL_ERROR",
      msg: error.message
    };
  }
}

/**
 *  取得或建立假期餘額工作表
 */
function getLeaveBalanceSheet() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName('假期餘額');
  
  if (!sheet) {
    Logger.log(' 假期餘額工作表不存在，自動建立...');
    
    sheet = ss.insertSheet('假期餘額');
    
    //  新的（19欄）
    sheet.appendRow([
      '員工ID',           // A
      '姓名',             // B
      '到職日',           // C ⭐ 新增
      '特休假',           // D
      '未住院病假',       // E
      '事假',             // F
      '喪假',             // G
      '婚假',             // H
      '產假',             // I
      '陪產檢及陪產假',   // J
      '住院病假',         // K
      '生理假',           // L
      '家庭照顧假',       // M
      '公假(含兵役假)',   // N
      '公傷假',           // O
      '天然災害停班',     // P
      '加班補休假',       // Q
      '曠工',             // R
      '更新時間'          // S
    ]);
    const headerRange = sheet.getRange(1, 1, 1, 19);
    headerRange.setBackground('#4A90E2');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    
    sheet.setFrozenRows(1);
    
    Logger.log(' 假期餘額工作表已建立');
  }
  
  return sheet;
}

/**
 *  初始化假期餘額（小時制）
 */
function initializeEmployeeLeave(sessionToken) {
  try {
    const employee = checkSession_(sessionToken);
    
    if (!employee.ok || !employee.user) {
      return {
        ok: false,
        code: "ERR_SESSION_INVALID"
      };
    }
    
    const user = employee.user;
    const sheet = getLeaveBalanceSheet();
    
    // 檢查是否已存在
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === user.userId) {
        Logger.log('ℹ 員工 ' + user.name + ' 的假期餘額已存在');
        return {
          ok: true,
          msg: "假期餘額已存在"
        };
      }
    }
    
    const hireDate = new Date();
    const leaveInfo = getCurrentAnnualLeaveInfo(hireDate);
    const annualLeaveHours = leaveInfo.currentHours;

    const defaultBalance = [
      user.userId,         // A
      user.name,           // B
      hireDate,            // C: 到職日 ⭐
      annualLeaveHours,    // D: 特休假（即時計算）⭐
      240,                 // E: 未住院病假
      112,                 // F: 事假
      40,                  // G: 喪假
      64,                  // H: 婚假
      448,                 // I: 產假
      56,                  // J: 陪產假
      240,                 // K: 住院病假
      96,                  // L: 生理假
      56,                  // M: 家庭照顧假
      0,                   // N: 公假
      0,                   // O: 公傷假
      0,                   // P: 天然災害停班
      0,                   // Q: 加班補休假
      0,                   // R: 曠工
      new Date()           // S: 更新時間
    ];
    
    sheet.appendRow(defaultBalance);
    
    Logger.log(' 已為員工 ' + user.name + ' 初始化假期餘額（小時制）');
    
    return {
      ok: true,
      msg: "假期餘額已初始化（小時制）"
    };
    
  } catch (error) {
    Logger.log(' initializeEmployeeLeave 錯誤: ' + error);
    return {
      ok: false,
      msg: error.message
    };
  }
}

/**
 *  取得員工請假記錄
 */
function getEmployeeLeaveRecords(sessionToken) {
  try {
    const employee = checkSession_(sessionToken);
    
    if (!employee.ok || !employee.user) {
      return {
        ok: false,
        code: "ERR_SESSION_INVALID"
      };
    }
    
    const user = employee.user;
    const sheet = getLeaveRecordsSheet();
    const values = sheet.getDataRange().getValues();
    
    if (values.length <= 1) {
      return {
        ok: true,
        records: []
      };
    }
    
    const records = [];
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][1] === user.userId) {
        const record = {
          applyTime: formatDateTime(values[i][0]),
          employeeName: values[i][2],
          dept: values[i][3],
          leaveType: values[i][4],
          startDateTime: values[i][5],
          endDateTime: values[i][6],
          workHours: values[i][7],
          days: values[i][8],
          reason: values[i][9] || '',
          status: values[i][10] || 'PENDING',
          reviewer: values[i][11] || '',
          reviewTime: values[i][12] ? formatDateTime(values[i][12]) : '',
          reviewComment: values[i][13] || ''
        };
        
        records.push(record);
      }
    }
    
    records.sort((a, b) => new Date(b.applyTime) - new Date(a.applyTime));
    
    return {
      ok: true,
      records: records
    };
    
  } catch (error) {
    Logger.log(' getEmployeeLeaveRecords 錯誤: ' + error);
    return {
      ok: false,
      msg: error.message
    };
  }
}

/**
 *  取得待審核請假申請（使用無限制計算邏輯）
 */
function getPendingLeaveRequests(sessionToken) {
  try {
    const employee = checkSession_(sessionToken);
    
    if (!employee.ok || !employee.user) {
      return {
        ok: false,
        code: "ERR_SESSION_INVALID"
      };
    }
    
    if (employee.user.dept !== '管理員') {
      return {
        ok: false,
        code: "ERR_PERMISSION_DENIED",
        msg: "需要管理員權限"
      };
    }
    
    const sheet = getLeaveRecordsSheet();
    const values = sheet.getDataRange().getValues();
    
    if (values.length <= 1) {
      return {
        ok: true,
        requests: []
      };
    }
    
    const requests = [];
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][10] === 'PENDING') {
        
        const startDateTime = values[i][5];
        const endDateTime = values[i][6];
        
        let correctWorkHours = 0;
        let correctDays = 0;
        
        try {
          const start = new Date(startDateTime);
          const end = new Date(endDateTime);
          
          if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const result = calculateWorkHoursAndDays_Unlimited(start, end);
            correctWorkHours = result.workHours;
            correctDays = result.days;
          }
        } catch (err) {
          Logger.log(' 計算工時失敗:', err);
          correctWorkHours = values[i][7] || 0;
          correctDays = values[i][8] || 0;
        }
        
        const request = {
          rowNumber: i + 1,
          applyTime: formatDateTime(values[i][0]),
          employeeId: values[i][1],
          employeeName: values[i][2],
          dept: values[i][3],
          leaveType: values[i][4],
          startDateTime: startDateTime,
          endDateTime: endDateTime,
          workHours: correctWorkHours,
          days: correctDays,
          reason: values[i][9] || ''
        };
        
        requests.push(request);
      }
    }
    
    return {
      ok: true,
      requests: requests
    };
    
  } catch (error) {
    Logger.log(' getPendingLeaveRequests 錯誤: ' + error);
    return {
      ok: false,
      msg: error.message
    };
  }
}

/**
 *  審核請假申請
 */
function reviewLeaveRequest(sessionToken, rowNumber, reviewAction, comment) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 開始審核請假');
    Logger.log('═══════════════════════════════════════');
    Logger.log(`   行號: ${rowNumber}`);
    Logger.log(`   動作: ${reviewAction}`);
    Logger.log('');
    
    const employee = checkSession_(sessionToken);
    
    if (!employee.ok || !employee.user) {
      return {
        ok: false,
        code: "ERR_SESSION_INVALID"
      };
    }
    
    if (employee.user.dept !== '管理員') {
      return {
        ok: false,
        code: "ERR_PERMISSION_DENIED",
        msg: "需要管理員權限"
      };
    }
    
    const sheet = getLeaveRecordsSheet();
    const record = sheet.getRange(rowNumber, 1, 1, 14).getValues()[0];
    
    const userId = record[1];
    const employeeName = record[2];
    const leaveType = record[4];
    const workHours = record[7];
    const days = record[8];
    
    Logger.log(' 請假資料:');
    Logger.log(`   員工: ${employeeName} (${userId})`);
    Logger.log(`   假別: ${leaveType}`);
    Logger.log(`   時數: ${workHours} 小時`);
    Logger.log(`   天數: ${days} 天`);
    Logger.log('');
    
    const status = (reviewAction === 'approve') ? 'APPROVED' : 'REJECTED';
    
    sheet.getRange(rowNumber, 11).setValue(status);
    sheet.getRange(rowNumber, 12).setValue(employee.user.name);
    sheet.getRange(rowNumber, 13).setValue(new Date());
    sheet.getRange(rowNumber, 14).setValue(comment || '');
    
    Logger.log(` 審核狀態已更新: ${status}`);
    Logger.log('');
    
    if (reviewAction === 'approve') {
      Logger.log(' 開始扣除假期餘額...');
      
      const deductResult = deductLeaveBalance(userId, leaveType, workHours);
      
      if (!deductResult.ok) {
        Logger.log(' 扣除餘額失敗: ' + deductResult.msg);
        
        sheet.getRange(rowNumber, 11).setValue('PENDING');
        
        return {
          ok: false,
          code: "ERR_DEDUCT_FAILED",
          msg: "扣除餘額失敗: " + deductResult.msg
        };
      }
      
      Logger.log(' 假期餘額扣除成功');
      Logger.log(`   ${leaveType}: 扣除 ${workHours} 小時`);
      Logger.log(`   剩餘: ${deductResult.remaining} 小時`);
    }
    
    Logger.log('');
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 審核完成');
    Logger.log('═══════════════════════════════════════');
    
    return {
      ok: true,
      msg: "審核完成"
    };
    
  } catch (error) {
    Logger.log(' reviewLeaveRequest 錯誤: ' + error);
    Logger.log('錯誤堆疊: ' + error.stack);
    return {
      ok: false,
      msg: error.message
    };
  }
}

/**
 *  扣除假期餘額
 */
function deductLeaveBalance(userId, leaveType, hours) {
  try {
    Logger.log(' 扣除假期餘額');
    Logger.log(`   員工ID: ${userId}`);
    Logger.log(`   假別: ${leaveType}`);
    Logger.log(`   小時數: ${hours}`);
    Logger.log('');
    
    const sheet = getLeaveBalanceSheet();
    const values = sheet.getDataRange().getValues();
    
    const leaveTypeColumnMap = {
      'ANNUAL_LEAVE': 4,
      'SICK_LEAVE': 5,
      'PERSONAL_LEAVE': 6,
      'BEREAVEMENT_LEAVE': 7,
      'MARRIAGE_LEAVE': 8,
      'MATERNITY_LEAVE': 9,
      'PATERNITY_LEAVE': 10,
      'HOSPITALIZATION_LEAVE': 11,
      'MENSTRUAL_LEAVE': 12,
      'FAMILY_CARE_LEAVE': 13,
      'OFFICIAL_LEAVE': 14,
      'WORK_INJURY_LEAVE': 15,
      'NATURAL_DISASTER_LEAVE': 16,
      'COMP_TIME_OFF': 17,
      'ABSENCE_WITHOUT_LEAVE': 18
    };
    
    const columnIndex = leaveTypeColumnMap[leaveType];
    
    if (!columnIndex) {
      Logger.log(' 無效的假別: ' + leaveType);
      return {
        ok: false,
        msg: "無效的假別"
      };
    }
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === userId) {
        Logger.log(` 找到員工記錄（第 ${i + 1} 行）`);
        Logger.log(`   姓名: ${values[i][1]}`);
        
        const currentBalance = values[i][columnIndex - 1];
        
        Logger.log(`   目前餘額: ${currentBalance} 小時`);
        
        if (currentBalance < hours) {
          Logger.log(`    餘額不足：需要 ${hours} 小時，只剩 ${currentBalance} 小時`);
          return {
            ok: false,
            msg: `${leaveType} 餘額不足（需要 ${hours} 小時，只剩 ${currentBalance} 小時）`
          };
        }
        
        const newBalance = currentBalance - hours;
        
        Logger.log(`   扣除 ${hours} 小時後: ${newBalance} 小時`);
        
        sheet.getRange(i + 1, columnIndex).setValue(newBalance);
        sheet.getRange(i + 1, 19).setValue(new Date()); //  S欄（更新時間）
        
        Logger.log(' 餘額已更新');
        
        return {
          ok: true,
          remaining: newBalance
        };
      }
    }
    
    Logger.log(' 找不到員工記錄');
    return {
      ok: false,
      msg: "找不到員工記錄"
    };
    
  } catch (error) {
    Logger.log(' deductLeaveBalance 錯誤: ' + error);
    return {
      ok: false,
      msg: error.message
    };
  }
}

/**
 *  取得已核准的請假記錄（使用無限制計算）
 */
function getApprovedLeaveRecords(monthParam, userIdParam) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' getApprovedLeaveRecords 開始（無時段限制版）');
    Logger.log('═══════════════════════════════════════');
    Logger.log(`   monthParam: ${monthParam}`);
    Logger.log(`   userIdParam: ${userIdParam}`);
    Logger.log('');
    
    const sheet = getSpreadsheet_().getSheetByName('請假紀錄');
    
    if (!sheet) {
      Logger.log(' 找不到請假紀錄工作表');
      return [];
    }
    
    const values = sheet.getDataRange().getValues();
    
    if (values.length <= 1) {
      Logger.log(' 工作表只有標題，沒有資料');
      return [];
    }
    
    Logger.log(` 工作表有 ${values.length - 1} 筆資料`);
    Logger.log('');
    
    const leaveRecords = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      const applyTime = row[0];
      const employeeId = row[1];
      const employeeName = row[2];
      const dept = row[3];
      const leaveType = row[4];
      const startDateTime = row[5];
      const endDateTime = row[6];
      const workHours = row[7];
      const days = row[8];
      const reason = row[9];
      const status = row[10];
      const reviewer = row[11];
      const reviewTime = row[12];
      const reviewComment = row[13];
      
      Logger.log(`═══════════════════════════════════════`);
      Logger.log(` 第 ${i + 1} 行:`);
      Logger.log(`   員工ID: ${employeeId}`);
      Logger.log(`   員工姓名: ${employeeName}`);
      Logger.log(`   狀態: "${status}"`);
      Logger.log(`   開始時間: ${startDateTime}`);
      Logger.log(`   結束時間: ${endDateTime}`);
      Logger.log(`   工作時數: ${workHours} 小時`);
      Logger.log(`   天數: ${days} 天`);
      
      if (String(status).trim() !== 'APPROVED') {
        Logger.log(`   ⏭ 狀態不是 APPROVED，跳過`);
        Logger.log('');
        continue;
      }
      
      let formattedStartDate, formattedEndDate;
      
      try {
        const startDate = new Date(startDateTime);
        const endDate = new Date(endDateTime);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          Logger.log(`    日期格式無效，跳過`);
          Logger.log('');
          continue;
        }
        
        formattedStartDate = formatDate(startDate);
        formattedEndDate = formatDate(endDate);
        
        Logger.log(`   格式化開始日期: ${formattedStartDate}`);
        Logger.log(`   格式化結束日期: ${formattedEndDate}`);
        
      } catch (dateError) {
        Logger.log(`    日期解析錯誤: ${dateError.message}`);
        Logger.log('');
        continue;
      }
      
      if (!formattedStartDate.startsWith(monthParam)) {
        Logger.log(`   ⏭ 月份不符，跳過`);
        Logger.log('');
        continue;
      }
      
      if (userIdParam && employeeId !== userIdParam) {
        Logger.log(`   ⏭ 員工ID不符，跳過`);
        Logger.log('');
        continue;
      }
      
      Logger.log(`    符合所有條件！`);
      
      const start = new Date(startDateTime);
      const end = new Date(endDateTime);
      
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      const totalDays = Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1;
      
      Logger.log(`    請假天數範圍: ${totalDays} 天`);
      
      for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d);
        
        if (dateStr.startsWith(monthParam)) {
          leaveRecords.push({
            employeeId: employeeId,
            employeeName: employeeName,
            date: dateStr,
            leaveType: leaveType,
            workHours: parseFloat(workHours) || 0,
            days: parseFloat(days) || 0,
            status: status,
            reason: reason || '',
            startDateTime: startDateTime,
            endDateTime: endDateTime,
            reviewer: reviewer || '',
            reviewTime: reviewTime || '',
            reviewComment: reviewComment || ''
          });
          
          Logger.log(`       加入日期: ${dateStr}`);
        }
      }
      
      Logger.log('');
    }
    
    Logger.log('═══════════════════════════════════════');
    Logger.log(` getApprovedLeaveRecords 完成`);
    Logger.log(`   共找到 ${leaveRecords.length} 筆已核准的請假記錄`);
    Logger.log('═══════════════════════════════════════');
    
    return leaveRecords;
    
  } catch (error) {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' getApprovedLeaveRecords 錯誤');
    Logger.log('   錯誤訊息: ' + error.message);
    Logger.log('   錯誤堆疊: ' + error.stack);
    Logger.log('═══════════════════════════════════════');
    return [];
  }
}

/**
 *  根據勞基法計算特休天數（依年資級距）
 * 
 * 台灣勞基法規定（天數）：
 * - 未滿 6 個月：0 天
 * - 滿 6 個月未滿 1 年：3 天
 * - 滿 1 年未滿 2 年：7 天
 * - 滿 2 年未滿 3 年：10 天
 * - 滿 3 年未滿 5 年：14 天
 * - 滿 5 年未滿 10 年：15 天
 * - 滿 10 年以上：每年加 1 天，最高 30 天
 * 
 * @param {number} yearsOfService - 年資（小數點，例如 1.5 代表 1.5 年）
 * @returns {number} - 特休小時數（天數 × 8）
 */
function calculateAnnualLeave(yearsOfService) {
  let days = 0;

  if (yearsOfService < 0.5) {
    days = 0;
  } else if (yearsOfService < 1) {
    days = 3;   // 滿 6 個月：3 天 = 24 小時
  } else if (yearsOfService < 2) {
    days = 7;   // 滿 1 年：7 天 = 56 小時
  } else if (yearsOfService < 3) {
    days = 10;  // 滿 2 年：10 天 = 80 小時
  } else if (yearsOfService < 5) {
    days = 14;  // 滿 3 年：14 天 = 112 小時
  } else if (yearsOfService < 10) {
    days = 15;  // 滿 5 年：15 天 = 120 小時
  } else {
    // 滿 10 年：每滿 1 年加 1 天，最高 30 天
    const extraYears = Math.floor(yearsOfService - 10);
    days = Math.min(15 + extraYears + 1, 30);
  }

  return days * 8; // 轉換為小時
}

//  修正：改用直接比較日期的方式計算整年數
function calculateYearsOfService(hireDate, baseDate) {
  if (!hireDate) return 0;
  
  const hire = new Date(hireDate);
  const base = baseDate || new Date();
  
  if (isNaN(hire.getTime())) return 0;
  
  let years = base.getFullYear() - hire.getFullYear();
  
  // 檢查今年的週年日是否已到
  const thisYearAnniversary = new Date(hire);
  thisYearAnniversary.setFullYear(base.getFullYear());
  
  if (base < thisYearAnniversary) {
    years -= 1; // 今年的週年日還沒到，年資減 1
  }
  
  // 加上不足 1 年的小數部分
  const lastAnniversary = new Date(hire);
  lastAnniversary.setFullYear(hire.getFullYear() + years);
  
  const nextAnniversary = new Date(lastAnniversary);
  nextAnniversary.setFullYear(lastAnniversary.getFullYear() + 1);
  
  const fraction = (base - lastAnniversary) / (nextAnniversary - lastAnniversary);
  
  return years + fraction;
}


/**
 *  即時計算員工當前「應享有」的特休時數（考量到期）
 * 
 * 邏輯說明：
 * - 特休以「到職週年日」為週期，每年重新給予
 * - 每個週期的特休必須在「下一個週年日」前使用，否則到期歸零（或依公司規定）
 * - 此函數計算「當前週期」應有的特休時數
 * 
 * 範例：
 *   到職日：2023-07-01
 *   今天：2025-03-04
 *   → 年資 = 1.67 年 → 應得 7 天 = 56 小時（進入第 2 個週期）
 *   → 當前週期：2024-07-01 ~ 2025-06-30
 *   → 本週期已給予 56 小時
 * 
 * @param {Date} hireDate - 到職日
 * @param {Date} [baseDate] - 計算基準日（預設今天）
 * @returns {{currentHours: number, periodStart: Date, periodEnd: Date, yearsOfService: number}}
 */
function getCurrentAnnualLeaveInfo(hireDate, baseDate) {
  const hire = new Date(hireDate);
  const today = baseDate || new Date();

  if (isNaN(hire.getTime())) {
    Logger.log(' 無效的到職日');
    return { currentHours: 0, periodStart: null, periodEnd: null, yearsOfService: 0 };
  }

  // 計算完整年資（小數）
  const yearsOfService = calculateYearsOfService(hire, today);

  // 計算目前處於第幾個年資週期（floor = 已完整滿幾年）
  const completedYears = Math.floor(yearsOfService);

  // 當前週期的開始與結束
  // 注意：滿半年時才開始第一個週期
  let periodStart, periodEnd, hoursForCurrentPeriod;

  if (yearsOfService < 0.5) {
    // 未滿半年，尚未取得特休
    return {
      currentHours: 0,
      periodStart: null,
      periodEnd: null,
      yearsOfService: yearsOfService
    };
  } else if (yearsOfService < 1) {
    periodStart = new Date(hire);
    periodStart.setMonth(periodStart.getMonth() + 6);

    //  修正：週年日的前一天
    const firstAnniversary = new Date(hire);
    firstAnniversary.setFullYear(hire.getFullYear() + 1);
    periodEnd = new Date(firstAnniversary);
    periodEnd.setDate(periodEnd.getDate() - 1);  // 週年日前一天

    hoursForCurrentPeriod = 3 * 8; // 24 小時
  } else {
    // 滿 1 年以上：以週年日為週期
    periodStart = new Date(hire);
    periodStart.setFullYear(hire.getFullYear() + completedYears);

    const nextAnniversary = new Date(hire);
    nextAnniversary.setFullYear(hire.getFullYear() + completedYears + 1);
    periodEnd = new Date(nextAnniversary);
    periodEnd.setDate(periodEnd.getDate() - 1);

    // 本週期應得天數（以「進入本週期時的年資」計算）
    hoursForCurrentPeriod = calculateAnnualLeave(completedYears);
  }

  Logger.log(' 特休週期計算:');
  Logger.log(`   到職日: ${formatDate(hire)}`);
  Logger.log(`   今天: ${formatDate(today)}`);
  Logger.log(`   年資: ${yearsOfService.toFixed(4)} 年`);
  Logger.log(`   當前週期: ${formatDate(periodStart)} ~ ${formatDate(periodEnd)}`);
  Logger.log(`   本週期應得: ${hoursForCurrentPeriod} 小時 (${hoursForCurrentPeriod / 8} 天)`);

  return {
    currentHours: hoursForCurrentPeriod,
    periodStart: periodStart,
    periodEnd: periodEnd,
    yearsOfService: yearsOfService
  };
}

function updateAllEmployeesAnnualLeave() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 開始批次更新特休餘額');
  Logger.log('═══════════════════════════════════════');

  const balanceSheet = getLeaveBalanceSheet();
  const balanceValues = balanceSheet.getDataRange().getValues();
  const today = new Date();
  const todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const todayMonth = today.getMonth();
  const todayDate = today.getDate();

  let updateCount = 0;

  for (let i = 1; i < balanceValues.length; i++) {
    const userId = balanceValues[i][0];
    const employeeName = balanceValues[i][1];
    const hireDate = balanceValues[i][2];

    if (!hireDate) {
      Logger.log(` ${employeeName} 沒有到職日，跳過`);
      continue;
    }

    const hire = new Date(hireDate);
    const yearsOfService = calculateYearsOfService(hire, today);
    const currentAnnualLeave = parseFloat(balanceValues[i][3]) || 0;

    // ⭐ 補漏機制：特休是 0 但年資已超過 6 個月
    if (currentAnnualLeave === 0 && yearsOfService >= 0.5) {
      const leaveInfo = getCurrentAnnualLeaveInfo(hire, today);
      const correctHours = leaveInfo.currentHours;

      if (correctHours > 0) {
        balanceSheet.getRange(i + 1, 4).setValue(correctHours);
        balanceSheet.getRange(i + 1, 19).setValue(new Date());
        Logger.log(` 補漏 ${employeeName}: 0 → ${correctHours} 小時`);
        updateCount++;
        continue; // 補漏完就跳到下一個員工
      }
    }

    // ⭐ 今天已更新過則跳過（防止每小時重複觸發）
    const lastUpdateDate = balanceValues[i][18];
    if (lastUpdateDate) {
      const lastUpdateStr = Utilities.formatDate(
        new Date(lastUpdateDate),
        Session.getScriptTimeZone(),
        'yyyy-MM-dd'
      );
      if (lastUpdateStr === todayStr) {
        Logger.log(`⏭ ${employeeName}: 今天已更新過，跳過`);
        continue;
      }
    }

    // 判斷今天是否為週年日或半年日
    const halfYearDate = new Date(hire);
    halfYearDate.setMonth(halfYearDate.getMonth() + 6);

    const isAnniversary = (todayMonth === hire.getMonth() && todayDate === hire.getDate());
    const isHalfYear = (todayMonth === halfYearDate.getMonth() && todayDate === halfYearDate.getDate());
    const isHalfYearTrigger = isHalfYear && yearsOfService < 1;
    const isAnniversaryTrigger = isAnniversary && yearsOfService >= 1;

    if (!isHalfYearTrigger && !isAnniversaryTrigger) {
      Logger.log(` ${employeeName}: 今天非觸發日，跳過`);
      continue;
    }

    const leaveInfo = getCurrentAnnualLeaveInfo(hire, today);
    const newAnnualHours = leaveInfo.currentHours;

    Logger.log(` ${employeeName} 週年更新: ${newAnnualHours} 小時`);

    if (isHalfYearTrigger) {
      balanceSheet.getRange(i + 1, 4).setValue(24);
      Logger.log(`    滿半年，設定 24 小時`);
    } else {
      const oldRemaining = balanceValues[i][3];
      balanceSheet.getRange(i + 1, 4).setValue(oldRemaining + newAnnualHours);
      Logger.log(`    週年日，累加後共 ${oldRemaining + newAnnualHours} 小時`);
    }

    balanceSheet.getRange(i + 1, 19).setValue(new Date());
    updateCount++;
  }

  Logger.log(`\n 完成，共更新 ${updateCount} 筆`);
  return { ok: true, updateCount: updateCount };
}