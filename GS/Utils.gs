// Utils.gs

function jsonp(e, obj) {
  const cb = e.parameter.callback || "callback";
  return ContentService.createTextOutput(cb + "(" + JSON.stringify(obj) + ")")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// 距離計算公式
function getDistanceMeters_(lat1, lng1, lat2, lng2) {
  function toRad(deg) { return deg * Math.PI / 180; }
  const R = 6371000; // 地球半徑 (公尺)
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 工具函式：將日期格式化 yyyy-mm-dd
/** 取得 row 的 yyy-MM-dd（支援物件/陣列、字串/Date），以台北時區輸出 */
function getYmdFromRow(row) {
  const raw = (row && (row.date ?? row[0])) ?? null; // 物件 row.date 或 陣列 row[0]
  if (raw == null) return null;

  try {
    if (raw instanceof Date) {
      return Utilities.formatDate(raw, "Asia/Taipei", "yyyy-MM-dd");
    }
    const s = String(raw).trim();

    // 先嘗試用 Date 解析（支援 ISO 或一般日期字串）
    const d = new Date(s);
    if (!isNaN(d)) {
      return Utilities.formatDate(d, "Asia/Taipei", "yyyy-MM-dd");
    }

    // 再退而求其次處理 ISO 字串（有 T）
    if (s.includes("T")) return s.split("T")[0];

    return s; // 最後保底，讓外層去判斷是否為有效格式
  } catch (e) {
    return null;
  }
}

/** 取欄位：優先物件屬性，其次陣列索引 */
function pick(row, objKey, idx) {
  const v = row?.[objKey];
  return (v !== undefined && v !== null) ? v : row?.[idx];
}

// ==================== 日期格式化（全專案唯一的一份） ====================
//
// 這兩支原本散在 Constants.gs / LeaveManagement.gs / OvertimeOperations.gs /
// DbOperations.gs / ShiftManagement.gs，各自的行為還不一樣：有的收到 null 會回傳
// "NaN-NaN-NaN"，有的字串原樣退回，有的寫死 Asia/Taipei。同名函式在 Apps Script
// 裡是後載入的蓋掉先載入的，所以實際跑到哪一份取決於檔案順序——等於行為不可預期。
//
// 這裡合成一份涵蓋所有既有行為的版本，任何呼叫端的預期都不會被破壞。

/**
 * 格式化為 yyyy-MM-dd
 *
 * - null / undefined / 空字串 → 回傳空字串
 * - 已經是 yyyy-MM-dd 的字串 → 原樣回傳（不重新解析，避免時區位移）
 * - 其他字串或 Date → 依腳本時區格式化
 */
function formatDate(date) {
  if (!date) return '';

  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return date.trim();
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return date;
    date = parsed;
  }

  try {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } catch (error) {
    return String(date);
  }
}

/**
 * 格式化為 yyyy-MM-dd HH:mm:ss；空值回傳空字串
 */
function formatDateTime(date) {
  if (!date) return '';

  if (typeof date === 'string') {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return date;
    date = parsed;
  }

  try {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  } catch (error) {
    return String(date);
  }
}

// ==================== 單次執行內的試算表讀取快取 ====================
//
// 算一位員工的薪資要把「打卡紀錄」「加班紀錄」「請假紀錄」「排班表」各讀一次整表。
// 單筆計算沒問題，但批次計算 30 個人就是 120 次全表讀取，很容易撞到 Apps Script
// 的六分鐘上限。
//
// 這個快取「預設關閉」，只有批次流程會用 withSheetCache_() 明確打開。這樣一般操作
// 永遠讀得到最新資料，不會因為快取而看到別人剛改過的舊值。

let _sheetValuesCache = null;

/**
 * 在快取開啟的狀態下執行 fn；結束後一定關閉並清空。
 */
function withSheetCache_(fn) {
  const previous = _sheetValuesCache;
  _sheetValuesCache = {};

  try {
    return fn();
  } finally {
    _sheetValuesCache = previous;
  }
}

/**
 * 讀取整張工作表的值。快取開啟時，同一次執行內同一張表只會真的讀一次。
 *
 * @param {string} sheetName 工作表名稱
 * @return {Array<Array>} 整張表的值；找不到工作表時回傳空陣列
 */
function getSheetValues_(sheetName) {
  if (_sheetValuesCache && _sheetValuesCache[sheetName]) {
    return _sheetValuesCache[sheetName];
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet ? sheet.getDataRange().getValues() : [];

  if (_sheetValuesCache) {
    _sheetValuesCache[sheetName] = values;
  }

  return values;
}

/**
 * 明確作廢某張表的快取。寫入之後若同一次執行還要再讀，就要呼叫這個。
 */
function invalidateSheetCache_(sheetName) {
  if (!_sheetValuesCache) return;

  if (sheetName) {
    delete _sheetValuesCache[sheetName];
  } else {
    _sheetValuesCache = {};
  }
}

/**
 * 檢查員工每天的打卡異常狀態，並回傳格式化的異常列表
 * @param {Array} attendanceRows 打卡紀錄，每筆包含：
 * [打卡時間, 員工ID, 薪資, 員工姓名, 上下班, GPS位置, 地點, 備註, 使用裝置詳細訊息]
 * @returns {Array} 每天每位員工的異常結果，格式為 { date: string, reason: string, id: string } 的陣列
 */
function checkAttendanceAbnormal(attendanceRows) {
  const dailyRecords = {};
  const abnormalRecords = [];
  let abnormalIdCounter = 0;
  
  Logger.log("═══════════════════════════════════════");
  Logger.log(" checkAttendanceAbnormal 開始");
  Logger.log(` 總記錄數: ${attendanceRows.length}`);
  
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  // ===== 步驟 1：按使用者和日期分組 =====
  let targetUserId = null;
  let targetMonth = null;
  
  attendanceRows.forEach(row => {
    try {
      const date = getYmdFromRow(row);
      const userId = row.userId;
      
      if (!targetUserId) targetUserId = userId;
      if (!targetMonth && date) targetMonth = date.substring(0, 7);
      
      if (date === today) {
        Logger.log(`⏭ 跳過今天的資料: ${date}`);
        return;
      }
      
      if (!dailyRecords[userId]) dailyRecords[userId] = {};
      if (!dailyRecords[userId][date]) dailyRecords[userId][date] = [];
      dailyRecords[userId][date].push(row);
      
    } catch (err) {
      Logger.log(" 解析 row 失敗: " + JSON.stringify(row) + " | 錯誤: " + err.message);
    }
  });
  
  // ===== 步驟 2：生成整個月份的日期列表 =====
  const allDatesInMonth = [];
  if (targetMonth) {
    const [year, month] = targetMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      
      if (dateStr < today && !isWeekend) {
        allDatesInMonth.push(dateStr);
      }
    }
    Logger.log(` 本月應檢查的日期數: ${allDatesInMonth.length}`);
  }
  
  // ===== 步驟 3：檢查每一天的打卡狀態 =====
  // 兩頭班要打休息卡：當月排班一次讀進來（見 ShiftTemplates.gs / PunchRules.gs）
  const shiftMap = (targetUserId && targetMonth && typeof getEmployeeShiftMapForMonth === 'function')
    ? getEmployeeShiftMapForMonth(targetUserId, targetMonth)
    : {};

  if (targetUserId && targetMonth) {
    for (const date of allDatesInMonth) {
      const dayRecords = dailyRecords[targetUserId]?.[date] || [];
      const filteredRows = dayRecords.filter(r => r.note !== "系統虛擬卡");
      
      const punchInRecords = filteredRows.filter(r => r.type === "上班");
      const punchOutRecords = filteredRows.filter(r => r.type === "下班");
      
      const adjustedPunchIn = punchInRecords.find(r => r.note === "補打卡");
      const adjustedPunchOut = punchOutRecords.find(r => r.note === "補打卡");
      
      const hasNormalPunchIn = punchInRecords.some(r => r.note !== "補打卡");
      const hasNormalPunchOut = punchOutRecords.some(r => r.note !== "補打卡");
      const hasApprovedPunchIn = adjustedPunchIn && adjustedPunchIn.audit === "v";
      const hasApprovedPunchOut = adjustedPunchOut && adjustedPunchOut.audit === "v";
      
      const hasPunchIn = hasNormalPunchIn || hasApprovedPunchIn;
      const hasPunchOut = hasNormalPunchOut || hasApprovedPunchOut;
      
      // ⭐⭐⭐ 處理上班卡狀態
      if (adjustedPunchIn && adjustedPunchIn.audit === "?") {
        abnormalIdCounter++;
        abnormalRecords.push({
          date: date,
          reason: "STATUS_REPAIR_PENDING",
          userId: targetUserId,
          id: `abnormal-${abnormalIdCounter}`,
          punchTypes: "補上班審核中"
        });
        Logger.log(`⏳ ${date}: 補上班審核中`);
      } else if (adjustedPunchIn && adjustedPunchIn.audit === "v") {
        abnormalIdCounter++;
        abnormalRecords.push({
          date: date,
          reason: "STATUS_REPAIR_APPROVED",
          userId: targetUserId,
          id: `abnormal-${abnormalIdCounter}`,
          punchTypes: "補上班通過"
        });
        Logger.log(` ${date}: 補上班已通過`);
      } else if (adjustedPunchIn && adjustedPunchIn.audit === "x") {
        abnormalIdCounter++;
        abnormalRecords.push({
          date: date,
          reason: "STATUS_REPAIR_REJECTED",
          userId: targetUserId,
          id: `abnormal-${abnormalIdCounter}`,
          punchTypes: "補上班被拒絕"
        });
        Logger.log(` ${date}: 補上班被拒絕`);
      } else if (!hasPunchIn) {
        abnormalIdCounter++;
        abnormalRecords.push({
          date: date,
          reason: "STATUS_PUNCH_IN_MISSING",
          userId: targetUserId,
          id: `abnormal-${abnormalIdCounter}`
        });
        Logger.log(` ${date}: 缺少上班卡`);
      }
      
      // ⭐⭐⭐ 處理下班卡狀態
      if (adjustedPunchOut && adjustedPunchOut.audit === "?") {
        abnormalIdCounter++;
        abnormalRecords.push({
          date: date,
          reason: "STATUS_REPAIR_PENDING",
          userId: targetUserId,
          id: `abnormal-${abnormalIdCounter}`,
          punchTypes: "補下班審核中"
        });
        Logger.log(`⏳ ${date}: 補下班審核中`);
      } else if (adjustedPunchOut && adjustedPunchOut.audit === "v") {
        abnormalIdCounter++;
        abnormalRecords.push({
          date: date,
          reason: "STATUS_REPAIR_APPROVED",
          userId: targetUserId,
          id: `abnormal-${abnormalIdCounter}`,
          punchTypes: "補下班通過"
        });
        Logger.log(` ${date}: 補下班已通過`);
      } else if (adjustedPunchOut && adjustedPunchOut.audit === "x") {
        abnormalIdCounter++;
        abnormalRecords.push({
          date: date,
          reason: "STATUS_REPAIR_REJECTED",
          userId: targetUserId,
          id: `abnormal-${abnormalIdCounter}`,
          punchTypes: "補下班被拒絕"
        });
        Logger.log(` ${date}: 補下班被拒絕`);
      } else if (!hasPunchOut) {
        abnormalIdCounter++;
        abnormalRecords.push({
          date: date,
          reason: "STATUS_PUNCH_OUT_MISSING",
          userId: targetUserId,
          id: `abnormal-${abnormalIdCounter}`
        });
        Logger.log(` ${date}: 缺少下班卡`);
      }

      // ⭐ 一天可以有兩組上下班（休息前打卡）：上班、下班都有，但次數對不上
      const pendingAdjust = filteredRows.some(r => r.note === "補打卡" && r.audit === "?");
      const countedRows = filteredRows.filter(r => r.note !== "補打卡" || r.audit === "v");
      const inCount = countedRows.filter(r => r.type === "上班").length;
      const outCount = countedRows.filter(r => r.type === "下班").length;

      if (hasPunchIn && hasPunchOut && !pendingAdjust && inCount !== outCount) {
        abnormalIdCounter++;
        abnormalRecords.push({
          date: date,
          reason: inCount > outCount ? "STATUS_PUNCH_OUT_MISSING" : "STATUS_PUNCH_IN_MISSING",
          userId: targetUserId,
          id: `abnormal-${abnormalIdCounter}`
        });
        Logger.log(` ${date}: 上班 ${inCount} 次、下班 ${outCount} 次，少一張卡`);
      }

      // ⭐ 兩頭班（排班有休息時間）卻只打了一組上下班：沒打休息卡
      const shift = shiftMap[date];
      if (shift && Number(shift.breakMinutes) > 0 && !pendingAdjust && inCount === 1 && outCount === 1) {
        abnormalIdCounter++;
        abnormalRecords.push({
          date: date,
          reason: "STATUS_BREAK_PUNCH_MISSING",
          userId: targetUserId,
          id: `abnormal-${abnormalIdCounter}`
        });
        Logger.log(` ${date}: 兩頭班沒有打休息卡`);
      }
    }
  }
  
  Logger.log("═══════════════════════════════════════");
  Logger.log(` 檢查完成，發現 ${abnormalRecords.length} 筆異常記錄`);
  Logger.log("異常記錄: " + JSON.stringify(abnormalRecords, null, 2));
  Logger.log("═══════════════════════════════════════");
  
  return abnormalRecords;
}

/**
 * 讀取目前請求的參數（doGet 會把請求放在 globalThis.currentRequest）。
 *
 * saveMonthlySalaryAPI 等幾支函式直接呼叫 getParam()，但 repo 裡從來沒有這支函式，
 * 「儲存薪資單」因此一直丟 ReferenceError。
 */
function getParam(name) {
  const e = globalThis.currentRequest;
  return e && e.parameter ? e.parameter[name] : undefined;
}
