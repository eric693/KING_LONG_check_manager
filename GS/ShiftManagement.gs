/**
 * 排班管理模組
 * 負責處理員工排班的所有邏輯
 */

// ==================== ⭐ 格式化函數 (新增) ====================

function formatDateOnly(dateValue) {
  if (!dateValue) return "";
  
  let date;
  if (typeof dateValue === 'string') {
    // 已經是 YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    // ⭐ 新增：支援 YYYY/M/D 或 YYYY/MM/DD 格式
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateValue)) {
      const parts = dateValue.split('/');
      return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
    }
    date = new Date(dateValue);
  } else if (dateValue instanceof Date) {
    date = dateValue;
  } else {
    return String(dateValue);
  }
  
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatTimeOnly(timeValue) {
    // ⭐ 修正：改用 == null
    if (timeValue == null || timeValue === '') return '00:00';
    
    if (typeof timeValue === 'string' && /^\d{2}:\d{2}$/.test(timeValue)) {
        return timeValue;
    }
    
    // ⭐ 新增：處理 "0:00"
    if (typeof timeValue === 'string' && /^\d{1}:\d{2}$/.test(timeValue)) {
        return '0' + timeValue;
    }
    
    if (typeof timeValue === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(timeValue)) {
        return timeValue.substring(0, 5);
    }
    
    if (timeValue instanceof Date) {
        const hours = String(timeValue.getHours()).padStart(2, '0');
        const minutes = String(timeValue.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }
    
    if (typeof timeValue === 'string') {
        try {
            const date = new Date(timeValue);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        } catch (e) {
            return '00:00';
        }
    }
    
    return String(timeValue);
}

// ==================== 原有功能 ====================

/**
 * 取得排班工作表
 */
function getShiftSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('排班表');
  
  if (!sheet) {
    sheet = ss.insertSheet('排班表');
    const headers = [
      '排班ID',
      '員工ID', 
      '員工姓名',
      '日期',
      '班別',
      '上班時間',
      '下班時間',
      '地點',
      '備註',
      '建立時間',
      '建立者',
      '最後修改時間',
      '最後修改者',
      '狀態',
      '休息分鐘'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  } else if (sheet.getRange(1, SHIFT_BREAK_COL).getValue() === '') {
    // 加上「休息分鐘」之前建立的排班表：補欄位標題（舊排班這欄空白，工時照沒排班的規則算）
    sheet.getRange(1, SHIFT_BREAK_COL).setValue('休息分鐘');
  }
  
  return sheet;
}

// 排班表第 15 欄：這筆排班的休息分鐘（兩頭班中間的休息）。空白 = 沒有記錄
const SHIFT_BREAK_COL = 15;

/** 排班表這一列的休息分鐘；空白（舊資料）回傳 null */
function shiftRowBreakMinutes_(row) {
  const value = row[SHIFT_BREAK_COL - 1];
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/**
 * 決定一筆排班的班別名稱、上下班時間與休息分鐘。
 *
 * 畫面上選了班別會自己帶好時間與休息分鐘；批次上傳或其他來源可能只寫了班別代碼或名稱，
 * 這時候從班別設定補上。班別一律存成班別設定裡的名稱（例如上傳時寫 E，存成「午晚班1」）。
 */
function resolveShiftFields_(shiftData, templates) {
  const template = (typeof findShiftTemplate_ === 'function') ? findShiftTemplate_(shiftData.shiftType, templates) : null;

  let breakMinutes = '';
  const given = shiftData.breakMinutes;
  if (given !== undefined && given !== null && String(given).trim() !== '') {
    const n = Number(given);
    if (!Number.isInteger(n) || n < 0 || n > 720) {
      throw new Error('休息分鐘要是 0～720 的整數');
    }
    breakMinutes = n;
  } else if (template) {
    breakMinutes = template.breakMinutes;
  }

  return {
    shiftType: template ? template.name : shiftData.shiftType,
    startTime: shiftData.startTime || (template ? template.startTime : ''),
    endTime: shiftData.endTime || (template ? template.endTime : ''),
    breakMinutes: breakMinutes
  };
}

/**
 *  新增排班（修正版）
 */
function addShift(shiftData) {
  try {
    const sheet = getShiftSheet();
    const userId = Session.getActiveUser().getEmail();
    
    // 驗證必填欄位
    if (!shiftData.employeeId || !shiftData.date || !shiftData.shiftType) {
      return {
        success: false,
        message: '請填寫所有必填欄位'
      };
    }
    
    const resolved = resolveShiftFields_(shiftData);

    // ⭐⭐⭐ 修正：傳入班別參數
    const isDuplicate = checkDuplicateShift(
      shiftData.employeeId, 
      shiftData.date, 
      resolved.shiftType
    );
    
    if (isDuplicate) {
      return {
        success: false,
        message: '該員工在此日期已有此班別的排班'
      };
    }
    
    const shiftId = 'SHIFT-' + Utilities.getUuid();
    const timestamp = formatDateTime(new Date());
    
    const rowData = [
      shiftId,
      shiftData.employeeId,
      shiftData.employeeName || '',
      formatDateOnly(shiftData.date),
      resolved.shiftType,
      formatTimeOnly(resolved.startTime),
      formatTimeOnly(resolved.endTime),
      shiftData.location || '',
      shiftData.note || '',
      timestamp,
      userId,
      timestamp,
      userId,
      '正常',
      resolved.breakMinutes
    ];
    
    sheet.appendRow(rowData);
    
    // 發送LINE通知
    try {
      sendShiftNotification(shiftData.employeeId, shiftData);
    } catch (e) {
      Logger.log('發送排班通知失敗: ' + e);
    }
    
    return {
      success: true,
      message: '排班新增成功',
      shiftId: shiftId
    };
    
  } catch (error) {
    Logger.log('新增排班錯誤: ' + error);
    return {
      success: false,
      message: '新增排班失敗: ' + error.message
    };
  }
}

/**
 *  批量新增排班（精細重複檢查版 - 已統一邏輯）
 */
function batchAddShifts(shiftsArray) {
  try {
    const sheet = getShiftSheet();
    const userId = Session.getActiveUser().getEmail();
    const timestamp = formatDateTime(new Date());
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 開始批量新增（精細重複檢查）');
    Logger.log('   總筆數: ' + shiftsArray.length);
    Logger.log('   重複定義: 員工ID + 日期 + 班別');
    Logger.log('═══════════════════════════════════════');
    
    // 檢查鍵：員工ID_日期_班別
    const processedInBatch = new Set();
    
    // 預先載入已存在的排班
    const existingShifts = new Set();
    const existingData = sheet.getDataRange().getValues();
    
    for (let i = 1; i < existingData.length; i++) {
      if (existingData[i][13] !== '已刪除') {
        const existingKey = `${existingData[i][1]}_${formatDateOnly(existingData[i][3])}_${existingData[i][4]}`;
        existingShifts.add(existingKey);
      }
    }
    
    Logger.log(' 工作表中已有 ' + existingShifts.size + ' 個排班');
    Logger.log('');
    
    // 班別設定只讀一次，整批共用
    const templates = (typeof readShiftTemplates_ === 'function') ? readShiftTemplates_() : [];

    // 處理每筆資料
    shiftsArray.forEach((shiftData, index) => {
      try {
        // 上傳檔案裡的班別可能寫代碼（E）或名稱；統一換成班別設定裡的名稱，並補上時間與休息分鐘
        const resolved = resolveShiftFields_(shiftData, templates);
        shiftData.shiftType = resolved.shiftType;

        Logger.log(` 處理第 ${index + 1}/${shiftsArray.length} 筆`);
        Logger.log(`   員工: ${shiftData.employeeName}`);
        Logger.log(`   日期: ${shiftData.date}`);
        Logger.log(`   班別: ${shiftData.shiftType}`);
        
        const formattedDate = formatDateOnly(shiftData.date);
        const key = `${shiftData.employeeId}_${formattedDate}_${shiftData.shiftType}`;
        
        Logger.log(`   檢查鍵: ${key}`);
        
        // 檢查 1：本批次中是否已處理過
        if (processedInBatch.has(key)) {
          Logger.log(`    批次內重複`);
          results.failed++;
          results.errors.push(
            `第 ${index + 1} 筆 (${shiftData.employeeName} ${formattedDate} ${shiftData.shiftType}): 批次中已有相同的排班`
          );
          return;
        }
        
        // 檢查 2：工作表中是否已存在
        if (existingShifts.has(key)) {
          Logger.log(`    工作表中已存在`);
          results.failed++;
          results.errors.push(
            `第 ${index + 1} 筆 (${shiftData.employeeName} ${formattedDate} ${shiftData.shiftType}): 該員工在此日期已有此班別`
          );
          return;
        }
        
        // 標記為已處理
        processedInBatch.add(key);
        
        // 新增到工作表
        const shiftId = 'SHIFT-' + Utilities.getUuid();
        
        const rowData = [
          shiftId,
          shiftData.employeeId,
          shiftData.employeeName || '',
          formattedDate,
          shiftData.shiftType,
          formatTimeOnly(resolved.startTime),
          formatTimeOnly(resolved.endTime),
          shiftData.location || '',
          shiftData.note || '',
          timestamp,
          userId,
          timestamp,
          userId,
          '正常',
          resolved.breakMinutes
        ];
        
        sheet.appendRow(rowData);
        results.success++;
        
        Logger.log(`    新增成功`);
        
      } catch (e) {
        Logger.log(`    例外錯誤: ${e.message}`);
        results.failed++;
        results.errors.push(`第 ${index + 1} 筆: ${e.message}`);
      }
    });
    
    Logger.log('');
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 批量新增完成');
    Logger.log(`    成功: ${results.success} 筆`);
    Logger.log(`    失敗: ${results.failed} 筆`);
    Logger.log('═══════════════════════════════════════');
    
    return {
      success: true,
      message: `批量新增完成: 成功 ${results.success} 筆, 失敗 ${results.failed} 筆`,
      results: results
    };
    
  } catch (error) {
    Logger.log(' batchAddShifts 整體錯誤: ' + error);
    return {
      success: false,
      message: '批量新增失敗: ' + error.message
    };
  }
}
/**
 * 查詢排班
 */
function getShifts(filters) {
  try {
    const sheet = getShiftSheet();
    const data = sheet.getDataRange().getValues();
    const shifts = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      if (row[13] === '已刪除') continue;
      
      const shiftDate = formatDateOnly(row[3]);
      
      if (filters) {
        if (filters.employeeId && row[1] !== filters.employeeId) continue;
        if (filters.startDate && shiftDate < formatDateOnly(filters.startDate)) continue;
        if (filters.endDate && shiftDate > formatDateOnly(filters.endDate)) continue;
        if (filters.shiftType && row[4] !== filters.shiftType) continue;
        if (filters.location && row[7] !== filters.location) continue;
      }
      
      shifts.push({
        shiftId: row[0],
        employeeId: row[1],
        employeeName: row[2],
        date: formatDateOnly(row[3]),
        shiftType: row[4],
        startTime: formatTimeOnly(row[5]),
        endTime: formatTimeOnly(row[6]),
        location: row[7],
        note: row[8],
        createdAt: row[9],
        createdBy: row[10],
        updatedAt: row[11],
        updatedBy: row[12],
        status: row[13],
        breakMinutes: shiftRowBreakMinutes_(row)
      });
    }
    
    shifts.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return {
      success: true,
      data: shifts,
      count: shifts.length
    };
    
  } catch (error) {
    Logger.log('查詢排班錯誤: ' + error);
    return {
      success: false,
      message: '查詢排班失敗: ' + error.message,
      data: []
    };
  }
}


/**
 * 取得單一排班詳情 (⭐ 已修正 - 格式化回傳資料)
 */
function getShiftById(shiftId) {
  try {
    const sheet = getShiftSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === shiftId) {
        //  格式化回傳資料
        return {
          success: true,
          data: {
            shiftId: data[i][0],
            employeeId: data[i][1],
            employeeName: data[i][2],
            date: formatDateOnly(data[i][3]),
            shiftType: data[i][4],
            startTime: formatTimeOnly(data[i][5]),
            endTime: formatTimeOnly(data[i][6]),
            location: data[i][7],
            note: data[i][8],
            createdAt: data[i][9],
            createdBy: data[i][10],
            updatedAt: data[i][11],
            updatedBy: data[i][12],
            status: data[i][13],
            breakMinutes: shiftRowBreakMinutes_(data[i])
          }
        };
      }
    }
    
    return {
      success: false,
      message: '找不到該排班記錄'
    };
    
  } catch (error) {
    Logger.log('查詢排班詳情錯誤: ' + error);
    return {
      success: false,
      message: '查詢失敗: ' + error.message
    };
  }
}

/**
 * 更新排班
 */
function updateShift(shiftId, updateData) {
  try {
    const sheet = getShiftSheet();
    const data = sheet.getDataRange().getValues();
    const userId = Session.getActiveUser().getEmail();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === shiftId) {
        if (updateData.date) sheet.getRange(i + 1, 4).setValue(formatDateOnly(updateData.date));
        if (updateData.shiftType) sheet.getRange(i + 1, 5).setValue(updateData.shiftType);
        // 有給休息分鐘就用；只換了班別沒給，就用新班別的休息分鐘
        const hasBreak = updateData.breakMinutes !== undefined && updateData.breakMinutes !== null &&
                         String(updateData.breakMinutes).trim() !== '';
        if (hasBreak || updateData.shiftType) {
          const resolved = resolveShiftFields_({ shiftType: updateData.shiftType || data[i][4], breakMinutes: updateData.breakMinutes });
          if (hasBreak || resolved.breakMinutes !== '') sheet.getRange(i + 1, SHIFT_BREAK_COL).setValue(resolved.breakMinutes);
        }
        if (updateData.startTime) sheet.getRange(i + 1, 6).setValue(formatTimeOnly(updateData.startTime));
        if (updateData.endTime) sheet.getRange(i + 1, 7).setValue(formatTimeOnly(updateData.endTime));
        if (updateData.location) sheet.getRange(i + 1, 8).setValue(updateData.location);
        if (updateData.note !== undefined) sheet.getRange(i + 1, 9).setValue(updateData.note);
        
        sheet.getRange(i + 1, 12).setValue(formatDateTime(new Date()));
        sheet.getRange(i + 1, 13).setValue(userId);
        
        return {
          success: true,
          message: '排班更新成功'
        };
      }
    }
    
    return {
      success: false,
      message: '找不到該排班記錄'
    };
    
  } catch (error) {
    Logger.log('更新排班錯誤: ' + error);
    return {
      success: false,
      message: '更新失敗: ' + error.message
    };
  }
}

/**
 * 刪除排班
 */
function deleteShift(shiftId) {
  try {
    const sheet = getShiftSheet();
    const data = sheet.getDataRange().getValues();
    const userId = Session.getActiveUser().getEmail();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === shiftId) {
        sheet.getRange(i + 1, 14).setValue('已刪除');
        sheet.getRange(i + 1, 12).setValue(formatDateTime(new Date()));
        sheet.getRange(i + 1, 13).setValue(userId);
        
        return {
          success: true,
          message: '排班刪除成功'
        };
      }
    }
    
    return {
      success: false,
      message: '找不到該排班記錄'
    };
    
  } catch (error) {
    Logger.log('刪除排班錯誤: ' + error);
    return {
      success: false,
      message: '刪除失敗: ' + error.message
    };
  }
}


/**
 * 取得員工的排班資訊（用於打卡驗證） (⭐ 已修正 - 格式化回傳資料)
 */
function getEmployeeShiftForDate(employeeId, date) {
  try {
    const sheet = getShiftSheet();
    const data = sheet.getDataRange().getValues();
    
    const targetDate = formatDateOnly(date);
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === employeeId && data[i][13] !== '已刪除') {
        const shiftDate = formatDateOnly(data[i][3]);
        
        if (shiftDate === targetDate) {
          //  格式化回傳資料
          return {
            success: true,
            hasShift: true,
            data: {
              shiftId: data[i][0],
              shiftType: data[i][4],
              startTime: formatTimeOnly(data[i][5]),
              endTime: formatTimeOnly(data[i][6]),
              location: data[i][7],
              breakMinutes: shiftRowBreakMinutes_(data[i])
            }
          };
        }
      }
    }
    
    return {
      success: true,
      hasShift: false,
      message: '今日無排班'
    };
    
  } catch (error) {
    Logger.log('查詢員工排班錯誤: ' + error);
    return {
      success: false,
      message: '查詢失敗: ' + error.message
    };
  }
}

/**
 * 取得本週排班統計
 */
function getWeeklyShiftStats() {
  try {
    const sheet = getShiftSheet();
    const data = sheet.getDataRange().getValues();
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    const startDateStr = formatDateOnly(startOfWeek);
    const endDateStr = formatDateOnly(endOfWeek);
    
    const stats = {
      totalShifts: 0,
      byShiftType: {},
      byEmployee: {}
    };
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][13] === '已刪除') continue;
      
      const shiftDate = formatDateOnly(data[i][3]);
      if (shiftDate >= startDateStr && shiftDate <= endDateStr) {
        stats.totalShifts++;
        
        const shiftType = data[i][4];
        stats.byShiftType[shiftType] = (stats.byShiftType[shiftType] || 0) + 1;
        
        const employeeName = data[i][2];
        stats.byEmployee[employeeName] = (stats.byEmployee[employeeName] || 0) + 1;
      }
    }
    
    return {
      success: true,
      data: stats
    };
    
  } catch (error) {
    Logger.log('取得排班統計錯誤: ' + error);
    return {
      success: false,
      message: '取得統計失敗: ' + error.message
    };
  }
}

/**
 * 匯出排班資料
 */
function exportShifts(filters) {
  try {
    const result = getShifts(filters);
    if (!result.success) {
      return result;
    }
    
    return {
      success: true,
      data: result.data,
      filename: `排班表_${formatDateOnly(new Date()).replace(/-/g, '')}.csv`
    };
    
  } catch (error) {
    Logger.log('匯出排班錯誤: ' + error);
    return {
      success: false,
      message: '匯出失敗: ' + error.message
    };
  }
}

/**
 * 發送排班通知（透過LINE）
 */
function sendShiftNotification(employeeId, shiftData) {
  try {
    // 取得員工的LINE User ID
    const userInfo = getUserInfoByEmployeeId(employeeId);
    if (!userInfo || !userInfo.lineUserId) {
      Logger.log('找不到員工的LINE ID');
      return;
    }
    
    const message = `您好！您有新的排班通知：\n\n` +
                   `日期: ${shiftData.date}\n` +
                   `班別: ${shiftData.shiftType}\n` +
                   `上班時間: ${shiftData.startTime}\n` +
                   `下班時間: ${shiftData.endTime}\n` +
                   `地點: ${shiftData.location}\n` +
                   `${shiftData.note ? '備註: ' + shiftData.note : ''}`;
    
    sendLineMessage(userInfo.lineUserId, message);
    
  } catch (error) {
    Logger.log('發送排班通知錯誤: ' + error);
  }
}

/**
 * 從員工ID取得使用者資訊
 */
function getUserInfoByEmployeeId(employeeId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userSheet = ss.getSheetByName('使用者資料');
    if (!userSheet) return null;
    
    const data = userSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === employeeId) {
        return {
          lineUserId: data[i][1],
          name: data[i][2],
          email: data[i][3]
        };
      }
    }
    
    return null;
  } catch (error) {
    Logger.log('取得使用者資訊錯誤: ' + error);
    return null;
  }
}

// ==================== 測試函數 ====================

// ==================== 整月排班快取 ====================
//
// getEmployeeShiftForDate() 每次呼叫都會把整張排班表讀進來。算薪資時它被放在
// 「逐日檢查早退」的迴圈裡，一位員工 22 個工作天就讀 22 次整表；批次計算 30 人
// 等於 600 多次全表讀取，六分鐘的執行上限根本撐不住。
//
// 這裡改成一次讀完整表、整理成 { 'yyyy-MM-dd': 班別資料 }，之後查哪一天都不必再碰試算表。

/**
 * 取得某位員工某個月的所有排班，回傳以日期為鍵的物件。
 *
 * @param {string} employeeId 員工ID
 * @param {string} yearMonth  yyyy-MM
 * @return {Object} { 'yyyy-MM-dd': { shiftId, shiftType, startTime, endTime, location } }
 */
function getEmployeeShiftMapForMonth(employeeId, yearMonth) {
  const map = {};

  try {
    getShiftSheet();  // 確保工作表存在
    const data = getSheetValues_('排班表');
    const targetId = String(employeeId).trim();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() !== targetId) continue;
      if (data[i][13] === '已刪除') continue;

      const shiftDate = formatDateOnly(data[i][3]);
      if (!shiftDate || shiftDate.substring(0, 7) !== yearMonth) continue;

      // 同一天有多筆時以第一筆為準，與 getEmployeeShiftForDate 的行為一致
      if (map[shiftDate]) continue;

      map[shiftDate] = {
        shiftId: data[i][0],
        shiftType: data[i][4],
        startTime: formatTimeOnly(data[i][5]),
        endTime: formatTimeOnly(data[i][6]),
        location: data[i][7],
        breakMinutes: shiftRowBreakMinutes_(data[i])
      };
    }

    Logger.log(` ${employeeId} 在 ${yearMonth} 共 ${Object.keys(map).length} 天有排班（整月一次讀取）`);

  } catch (error) {
    // 讀不到就回空的，呼叫端會當作「沒有排班」，不會讓薪資算不出來
    Logger.log(' getEmployeeShiftMapForMonth 錯誤: ' + error);
  }

  return map;
}

/**
 *  統一版：檢查重複排班
 * 重複定義：同一員工 + 同一日期 + 同一班別
 * 
 * @param {string} employeeId - 員工ID
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @param {string} shiftType - 班別
 * @returns {boolean} true=重複, false=不重複
 */
function checkDuplicateShift(employeeId, date, shiftType) {
  try {
    const sheet = getShiftSheet();
    const data = sheet.getDataRange().getValues();
    
    const targetDate = formatDateOnly(date);
    
    Logger.log(` 檢查重複: ${employeeId} - ${targetDate} - ${shiftType}`);
    
    for (let i = 1; i < data.length; i++) {
      // 跳過已刪除的記錄
      if (data[i][13] === '已刪除') continue;
      
      const shiftDate = formatDateOnly(data[i][3]);
      
      // ⭐⭐⭐ 比較：員工ID + 日期 + 班別
      if (data[i][1] === employeeId && 
          shiftDate === targetDate && 
          data[i][4] === shiftType) {
        Logger.log(` 發現重複: Row ${i + 1}`);
        return true;
      }
    }
    
    Logger.log(` 無重複`);
    return false;
    
  } catch (error) {
    Logger.log(' checkDuplicateShift 錯誤: ' + error);
    return false; // 錯誤時允許新增
  }
}
