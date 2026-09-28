// DbOperations.gs - 完整優化版（精簡版）

// ==================== 員工相關功能 ====================

/**
 * 修正：僅 admin_list 內的 userId 才是管理員，其餘為員工
 */
const ADMIN_LIST = [
  "Ue76b65367821240ac26387d2972a5adf",
  "U69d37ae1b9a878ba9408527026bd5b44"
];

const USER_ROLES = {
  ADMIN: '管理員',
  SCHEDULER: '排班人員',  // ⭐ 新增
  EMPLOYEE: '員工'
};

// 角色層級定義
const ROLE_LEVELS = {
  '管理員': 3,
  '排班人員': 2,  // ⭐ 新增
  '員工': 1
};
// DbOperations.gs - 修正後的 writeEmployee_ 函數

/**
 *  修正版：登入時不覆蓋手動設定的姓名
 */
function writeEmployee_(profile) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_EMPLOYEES);
  const values = sheet.getDataRange().getValues();
  const employeeId = profile.userId;

  // 檢查是否已存在
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === employeeId) {
      
      // ⭐⭐⭐ 關鍵修正：檢查是否有手動設定的姓名
      const currentName = values[i][2];           // C 欄：displayName（目前顯示的姓名）
      const nameOverride = values[i][8] || "";    // I 欄：nameOverride（手動設定的姓名）
      
      // 只在沒有手動設定姓名時才更新
      if (!nameOverride) {
        Logger.log(` 更新員工 ${profile.displayName} 的 LINE 姓名`);
        sheet.getRange(i + 1, 3).setValue(profile.displayName);  // C 欄
      } else {
        Logger.log(` 保留員工 ${currentName} 的手動設定姓名（忽略 LINE 姓名：${profile.displayName}）`);
        // 不更新姓名，保持原有的手動設定
      }
      
      // 更新其他資訊（email, 頭像等）
      sheet.getRange(i + 1, 2).setValue(profile.email || "");
      sheet.getRange(i + 1, 4).setValue(profile.pictureUrl);
      sheet.getRange(i + 1, 8).setValue("啟用");
      
      Logger.log(` 更新員工資料完成（保留原有權限：${values[i][5]}）`);
      return values[i];
    }
  }

  // 判斷是否為管理員
  const role = ADMIN_LIST.includes(employeeId) ? "管理員" : "員工";

  // 新增資料
  const row = [
    employeeId,              // A: userId
    profile.email || "",     // B: email
    profile.displayName,     // C: displayName
    profile.pictureUrl,      // D: pictureUrl
    new Date(),              // E: 建立時間
    role,                    // F: 部門（權限）
    "",                      // G: 到職日期
    "啟用",                  // H: 狀態
    ""                       // I: nameOverride（手動設定的姓名，新用戶為空）
  ];

  sheet.appendRow(row);
  Logger.log(` 新增員工 ${profile.displayName}（權限：${role}）`);
  return row;
}
// DbOperations.gs - 修正後的 findEmployeeByLineUserId_ 函數

/**
 *  修正版：優先使用手動設定的姓名
 */
function findEmployeeByLineUserId_(userId) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_EMPLOYEES);
  const values = sh.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === userId) {
      
      // ⭐⭐⭐ 關鍵修正：優先使用 nameOverride
      const displayName = values[i][2];        // C 欄：displayName
      const nameOverride = values[i][8] || ""; // I 欄：nameOverride
      
      const finalName = nameOverride || displayName; // 優先使用手動設定的姓名
      
      Logger.log(` 查詢員工: ${userId}`);
      Logger.log(`   displayName: ${displayName}`);
      Logger.log(`   nameOverride: ${nameOverride}`);
      Logger.log(`   最終姓名: ${finalName}`);
      
      return {
        ok: true,
        userId: values[i][0],        //  LINE userId
        employeeId: values[i][0],    //  員工ID = LINE userId
        email: values[i][1] || "",
        name: finalName,             // ⭐ 使用最終姓名
        picture: values[i][3],
        dept: values[i][5] || "管理員",
        status: values[i][7] || "啟用"
      };
    }
  }
  
  return { ok: false, code: "ERR_NO_DATA" };
}

// DbOperations.gs - 新增：解除姓名鎖定功能

/**
 *  解除姓名鎖定，恢復使用 LINE 姓名
 */
function unlockEmployeeName(userId) {
  try {
    Logger.log(' 解除員工姓名鎖定');
    Logger.log('   userId: ' + userId);
    
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_EMPLOYEES);
    
    if (!sheet) {
      return { ok: false, msg: '找不到員工工作表' };
    }
    
    const data = sheet.getDataRange().getValues();
    
    // 尋找用戶並解除鎖定
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        const currentName = data[i][2];  // C 欄: displayName
        
        // ⭐ 清除 nameOverride，下次登入時將使用 LINE 姓名
        sheet.getRange(i + 1, 9).setValue("");  // I 欄：nameOverride
        
        Logger.log(' 已解除姓名鎖定');
        Logger.log('   當前姓名: ' + currentName);
        Logger.log('   下次登入將使用 LINE 姓名');
        
        return {
          ok: true,
          msg: '已解除姓名鎖定，下次登入將使用 LINE 姓名',
          currentName: currentName
        };
      }
    }
    
    return { ok: false, msg: '找不到該員工' };
    
  } catch (error) {
    Logger.log(' unlockEmployeeName 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

/**
 *  取得所有員工列表（根據實際資料表結構）
 * 
 * 資料表欄位:
 * A (0) - userId
 * B (1) - email
 * C (2) - displayName
 * D (3) - pictureUrl
 * E (4) - 建立時間
 * F (5) - 部門
 * G (6) - 到職日期
 * H (7) - 狀態
 */
function getAllUsers() {
  try {
    Logger.log(' 開始取得員工列表');
    
    // 取得員工資料表
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_EMPLOYEES);
    
    if (!sheet) {
      Logger.log(' 找不到員工工作表: ' + SHEET_EMPLOYEES);
      return { 
        ok: false, 
        msg: "找不到員工工作表",
        users: []
      };
    }
    
    // 取得所有資料
    const data = sheet.getDataRange().getValues();
    
    // 檢查是否有資料
    if (data.length <= 1) {
      Logger.log(' 員工工作表只有標題，沒有資料');
      return {
        ok: true,
        users: [],
        count: 0,
        msg: "目前沒有員工資料"
      };
    }
    
    const users = [];
    
    Logger.log(' 開始解析員工資料...');
    Logger.log('   總行數（含標題）: ' + data.length);
    Logger.log('');
    
    // 從第二行開始讀取（跳過標題）
    for (let i = 1; i < data.length; i++) {
      const row = data[i];  // ⭐⭐⭐ 定義 row 變數
      
      // 檢查員工ID是否存在（A欄 = row[0]）
      if (!row[0] || String(row[0]).trim() === '') {
        Logger.log(`    第 ${i + 1} 行: 員工ID是空的，跳過`);
        continue;
      }
      
      // 檢查狀態（H欄 = row[7]）
      const status = row[7] ? String(row[7]).trim() : '';
      
      // 只加入「啟用」或空值的員工
      if (status !== '' && status !== '啟用') {
        Logger.log(`   ⏸ 第 ${i + 1} 行: ${row[2]} - 狀態是「${status}」，跳過`);
        continue;
      }
      
      // 建立使用者物件
      const user = {
        userId: String(row[0]).trim(),                    // A欄: userId
        email: row[1] ? String(row[1]).trim() : '',       // B欄: email
        name: row[2] ? String(row[2]).trim() : '未命名',   // C欄: displayName
        picture: row[3] ? String(row[3]).trim() : '',     // D欄: pictureUrl
        joinDate: row[4] || '',                           // E欄: 建立時間
        dept: row[5] ? String(row[5]).trim() : '',        // F欄: 部門
        hireDate: row[6] || '',                           // G欄: 到職日期
        status: status || '啟用'                          // H欄: 狀態
      };
      
      users.push(user);
      Logger.log(`    第 ${i + 1} 行: ${user.name} (${user.userId}) - ${user.dept}`);
    }
    
    Logger.log('');
    Logger.log(' 員工列表取得完成');
    Logger.log('   總筆數: ' + users.length);
    Logger.log('');
    
    return {
      ok: true,
      users: users,
      count: users.length,
      msg: `成功取得 ${users.length} 筆員工資料`
    };
    
  } catch (error) {
    Logger.log(' getAllUsers 錯誤: ' + error);
    Logger.log('   錯誤訊息: ' + error.message);
    Logger.log('   錯誤堆疊: ' + error.stack);
    
    return {
      ok: false,
      msg: error.message || '取得員工列表失敗',
      users: [],
      error: error.stack
    };
  }
}
// ==================== Session 管理 ====================

/**
 * ⭐ 驗證 Session Token（簡化版 - 只返回 true/false）
 */
function validateSession(sessionToken) {
  try {
    const result = checkSession_(sessionToken);
    return result.ok === true;
  } catch (error) {
    Logger.log('validateSession 錯誤: ' + error);
    return false;
  }
}

/**
 * 建立 Session
 */
function writeSession_(userId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSION);
  const oneTimeToken = Utilities.getUuid();
  const now = new Date();
  const expiredAt = new Date(now.getTime() + SESSION_TTL_MS);

  const range = sheet.getRange("B:B").createTextFinder(userId).findNext();

  if (range) {
    const row = range.getRow();
    sheet.getRange(row, 1, 1, 4).setValues([[oneTimeToken, userId, now, expiredAt]]);
  } else {
    sheet.appendRow([oneTimeToken, userId, now, expiredAt]);
  }
  return oneTimeToken;
}

/**
 * 兌換一次性 token
 */
function verifyOneTimeToken_(otoken) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSION);
  const range = sheet.getRange("A:A").createTextFinder(otoken).findNext();
  if (!range) return null;

  const row = range.getRow();
  const sessionToken = Utilities.getUuid();
  const now = new Date();
  const expiredAt = new Date(now.getTime() + SESSION_TTL_MS);
  const userId = sheet.getRange(row, 2).getValue();

  sheet.getRange(row, 1, 1, 4).setValues([[sessionToken, userId, now, expiredAt]]);
  return sessionToken;
}

// ==================== 打卡功能 ====================

/**
 * 打卡功能（加入防重複：同一天同類型只能打一次）
 */
function punch(sessionToken, type, lat, lng, note) {
  const employee = checkSession_(sessionToken);
  const user = employee.user;
  if (!user) return { ok: false, code: "ERR_SESSION_INVALID" };

  const shLoc = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOCATIONS);
  const lastRow = shLoc.getLastRow();

  if (lastRow < 2) {
    return { ok: false, code: "ERR_NO_LOCATIONS" };
  }

  const values = shLoc.getRange(2, 1, lastRow - 1, 5).getValues();
  let locationName = null;
  let minDistance = Infinity;

  for (let [, name, locLat, locLng, radius] of values) {
    if (!name || !locLat || !locLng) continue;
    const dist = getDistanceMeters_(lat, lng, Number(locLat), Number(locLng));
    if (dist <= Number(radius) && dist < minDistance) {
      locationName = name;
      minDistance = dist;
    }
  }

  if (!locationName) {
    return { ok: false, code: "ERR_OUT_OF_RANGE" };
  }

  // 一天最多兩組上下班（休息前要打卡），順序與次數見 PunchRules.gs
  if (type !== '上班' && type !== '下班') {
    return { ok: false, code: "ERR_INVALID_PUNCH_TYPE", msg: '打卡類型不正確' };
  }
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ATTENDANCE);
  const sequence = checkPunchSequence_(user.userId, type, sh.getDataRange().getValues());
  if (!sequence.ok) {
    Logger.log('打卡順序不符: ' + user.name + ' ' + type + ' - ' + sequence.msg);
    return sequence;
  }

  // 寫入打卡記錄
  const row = [
    new Date(),
    user.userId,
    user.dept,
    user.name,
    type,
    '(' + lat + ',' + lng + ')',
    locationName,
    "",
    "",
    note || ""
  ];
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);

  Logger.log('打卡成功: ' + user.name + ' - ' + type);
  return { ok: true, code: "PUNCH_SUCCESS", params: { type: type } };
}


/**
 * 補打卡功能（加入防重複：同一天同類型只能有一筆待審核）
 */
function punchAdjusted(sessionToken, type, punchDate, lat, lng, note) {
  const employee = checkSession_(sessionToken);
  const user = employee.user;

  if (!user) {
    return { ok: false, code: "ERR_SESSION_INVALID" };
  }

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ADJUST_PUNCH);

  if (!sh) {
    Logger.log('找不到補打卡申請工作表');
    return { ok: false, code: "ERR_SHEET_NOT_FOUND" };
  }

  const dateOnly = Utilities.formatDate(punchDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const timeOnly = Utilities.formatDate(punchDate, Session.getScriptTimeZone(), 'HH:mm');

  // 防重複：同一員工同一日期同一類型，只能有一筆「待審核」申請
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const userIdCol = headers.indexOf('用戶ID');
  const dateCol = headers.indexOf('日期');
  const typeCol = headers.indexOf('類型');
  const statusCol = headers.indexOf('狀態');

  if (userIdCol >= 0 && dateCol >= 0 && typeCol >= 0 && statusCol >= 0) {
    const allValues = sh.getDataRange().getValues();
    for (let i = 1; i < allValues.length; i++) {
      const row = allValues[i];
      const rowUserId = String(row[userIdCol] || '').trim();
      const rowDate = String(row[dateCol] || '').trim();
      const rowType = String(row[typeCol] || '').trim();
      const rowStatus = String(row[statusCol] || '').trim();

      if (rowUserId === user.userId &&
          rowDate === dateOnly &&
          rowType === type &&
          rowStatus === '待審核') {
        Logger.log('防重複補打卡: ' + user.name + ' 在 ' + dateOnly + ' 已有待審核的補' + type + '卡申請');
        return {
          ok: false,
          code: "ERR_DUPLICATE_ADJUST_PUNCH",
          msg: dateOnly + ' 的補' + type + '卡申請已送出，請等待審核後再申請'
        };
      }
    }
  }

  const applicationId = Utilities.getUuid().substring(0, 8).toUpperCase();

  const row = [
    applicationId,  // A: 申請ID
    user.userId,    // B: 用戶ID
    user.name,      // C: 姓名
    dateOnly,       // D: 日期
    timeOnly,       // E: 時間
    type,           // F: 類型
    note || '',     // G: 原因
    '待審核',       // H: 狀態
    new Date(),     // I: 申請時間
    '',             // J: 審核人
    ''              // K: 審核時間
  ];

  sh.appendRow(row);

  Logger.log('補打卡申請已提交: ' + user.name + ' - ' + dateOnly + ' ' + type);
  Logger.log('   理由: ' + note);

  // 通知所有管理員有新的補打卡申請
  try {
    notifyAdminsNewAdjustPunchRequest(user.name, dateOnly, timeOnly, type, note);
  } catch (notifyErr) {
    Logger.log(' LINE 通知管理員失敗（不影響申請）: ' + notifyErr.message);
  }

  return {
    ok: true,
    code: "ADJUST_PUNCH_SUCCESS",
    params: { type: type }
  };
}

/**
 * 員工ID → 目前的姓名（手動設定的姓名優先，沒有才用 LINE 名稱）
 */
function getEmployeeNameMap_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_EMPLOYEES);
  const map = {};
  if (!sheet) return map;

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const userId = String(values[i][0] || '').trim();
    if (!userId) continue;
    map[userId] = String(values[i][8] || values[i][2] || '').trim();
  }
  return map;
}

/**
 * 取得出勤紀錄
 *
 * 打卡當下會把姓名寫進紀錄，所以員工後來改了姓名，舊紀錄還是 LINE 名稱。
 * 這裡一律換成目前的姓名，報表才會一致；找不到員工（例如已刪除）才用紀錄上的名字。
 */
function getAttendanceRecords(monthParam, userIdParam) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ATTENDANCE);
  const values = sheet.getDataRange().getValues().slice(1);
  const nameMap = getEmployeeNameMap_();
  
  return values.filter(row => {
    if (!row[0]) return false;
    
    const d = new Date(row[0]);
    const yyyy_mm = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const monthMatch = yyyy_mm === monthParam;
    const userMatch = userIdParam ? row[1] === userIdParam : true;
    return monthMatch && userMatch;
  }).map(r => ({
    date: r[0],
    userId: r[1],
    salary: r[2],
    name: nameMap[String(r[1]).trim()] || r[3],
    type: r[4],
    gps: r[5],
    location: r[6],
    note: r[7],
    audit: r[8],
    device: r[9]
  }));
}

/**
 * 取得出勤詳細資料（用於報表匯出）
 */
/**
 *  修正版：取得出勤詳細資料（修正 localeCompare 錯誤）
 * 
 * 修正內容：
 * 1. 修正請假記錄合併時可能產生 undefined date 的問題
 * 2. 加強日期格式驗證
 * 3. 改進錯誤處理
 */
function getAttendanceDetails(monthParam, userIdParam) {
  try {
    Logger.log(' getAttendanceDetails 開始');
    Logger.log(`   monthParam: ${monthParam}`);
    Logger.log(`   userIdParam: ${userIdParam}`);
    
    const records = getAttendanceRecords(monthParam, userIdParam);
    const leaveRecords = getApprovedLeaveRecords(monthParam, userIdParam);
    const overtimeRecords = getApprovedOvertimeRecords(monthParam, userIdParam);
    
    Logger.log(`   打卡記錄: ${records.length} 筆`);
    Logger.log(`   請假記錄: ${leaveRecords.length} 筆`);
    Logger.log(`   加班記錄: ${overtimeRecords.length} 筆`);
    
    //  建立日期集合（過濾掉無效日期）
    const allDates = new Set();
    
    // 加入打卡記錄的日期
    records.forEach(r => {
      const dateKey = formatDate(r.date);
      if (dateKey) {
        allDates.add(dateKey);
      }
    });
    
    //  加入請假記錄的日期（檢查日期格式）
    leaveRecords.forEach(r => {
      if (r.date && typeof r.date === 'string' && r.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        allDates.add(r.date);
      } else {
        Logger.log(` 請假記錄日期格式錯誤: ${r.date}`);
      }
    });
    
    // 加入加班記錄的日期
    overtimeRecords.forEach(r => {
      if (r.date && typeof r.date === 'string' && r.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        allDates.add(r.date);
      }
    });
    
    Logger.log(`   涉及日期總數: ${allDates.size} 天`);
    
    //  按日期建立資料結構
    const dailyRecords = {};
    
    // 初始化所有日期
    allDates.forEach(dateKey => {
      dailyRecords[dateKey] = {
        date: dateKey,
        userId: userIdParam,
        name: '',
        record: [],
        reason: 'STATUS_NO_RECORD',
        overtime: null,
        leave: null
      };
    });
    
    // 填入打卡記錄
    records.forEach(r => {
      const dateKey = formatDate(r.date);
      
      if (dailyRecords[dateKey]) {
        if (!dailyRecords[dateKey].name) {
          dailyRecords[dateKey].name = r.name;
        }
        
        dailyRecords[dateKey].record.push({
          type: r.type,
          time: formatTime(r.date),
          location: r.location,
          note: r.note || '',
          audit: r.audit || ''   // 補打卡要核准（v）才算數，判斷當天有沒有少打卡時要用
        });
      }
    });
    
    //  填入請假資料
    leaveRecords.forEach(leave => {
      const dateKey = leave.date;
      
      if (dailyRecords[dateKey]) {
        dailyRecords[dateKey].leave = {
          leaveType: leave.leaveType,
          days: leave.days,
          status: leave.status,
          reason: leave.reason || '',
          employeeName: leave.employeeName,
          reviewComment: leave.reviewComment || ''
        };
        
        // 如果沒有員工姓名，從請假記錄取得
        if (!dailyRecords[dateKey].name && leave.employeeName) {
          dailyRecords[dateKey].name = leave.employeeName;
        }
        
        Logger.log(`   ${dateKey}: 加入請假資訊 (${leave.leaveType})`);
      }
    });
    
    // 填入加班資料
    overtimeRecords.forEach(ot => {
      const dateKey = ot.date;
      
      if (dailyRecords[dateKey]) {
        dailyRecords[dateKey].overtime = {
          startTime: ot.startTime,
          endTime: ot.endTime,
          hours: ot.hours,
          reason: ot.reason || ''
        };
        
        Logger.log(`   ${dateKey}: 加入加班資訊 (${ot.hours}h)`);
      }
    });
    
    // 判斷每日狀態
    Object.keys(dailyRecords).forEach(dateKey => {
      const daily = dailyRecords[dateKey];
      
      const hasPunchIn = daily.record.some(r => r.type === '上班');
      const hasPunchOut = daily.record.some(r => r.type === '下班');
      
      //  修正：如果有請假，根據打卡情況設定狀態
      if (daily.leave) {
        if (hasPunchIn && hasPunchOut) {
          // 有打卡也有請假（可能是半天假）
          daily.reason = 'STATUS_PUNCH_NORMAL';
        } else {
          // 只有請假沒打卡（全天假）
          daily.reason = 'STATUS_NO_RECORD';
        }
        Logger.log(`   ${dateKey}: 有請假記錄，狀態設為 ${daily.reason}`);
      } else {
        // 原有的打卡狀態判斷
        // 一天可以有兩組上下班（休息前打卡）：兩種卡都有但次數對不上，也算少打一張
        const counted = daily.record.filter(r => r.note !== '補打卡' || r.audit === 'v');
        const inCount = counted.filter(r => r.type === '上班').length;
        const outCount = counted.filter(r => r.type === '下班').length;
        if (hasPunchIn && hasPunchOut && inCount !== outCount) {
          daily.reason = inCount > outCount ? 'STATUS_PUNCH_OUT_MISSING' : 'STATUS_PUNCH_IN_MISSING';
        } else if (hasPunchIn && hasPunchOut) {
          daily.reason = 'STATUS_PUNCH_NORMAL';
        } else if (!hasPunchIn && !hasPunchOut) {
          daily.reason = 'STATUS_NO_RECORD';
        } else if (!hasPunchIn) {
          daily.reason = 'STATUS_PUNCH_IN_MISSING';
        } else if (!hasPunchOut) {
          daily.reason = 'STATUS_PUNCH_OUT_MISSING';
        }
      }
    });
    
    //  修正：轉換為陣列並排序（確保所有 date 都存在）
    const result = Object.values(dailyRecords)
      .filter(r => r.date) // 過濾掉沒有 date 的記錄
      .sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return a.date.localeCompare(b.date);
      });
    
    Logger.log(` getAttendanceDetails 完成: ${result.length} 筆`);
    
    //  除錯：顯示所有日期
    Logger.log('');
    Logger.log(' 最終結果包含的日期:');
    result.forEach(r => {
      const hasLeave = r.leave ? '' : '';
      const hasOvertime = r.overtime ? '⏰' : '';
      Logger.log(`   ${r.date} ${hasLeave}${hasOvertime} - ${r.reason}`);
    });
    
    return {
      ok: true,
      records: result
    };
    
  } catch (error) {
    Logger.log(' getAttendanceDetails 錯誤: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
    return {
      ok: false,
      msg: error.message
    };
  }
}

/**
 *  新增：取得已核准的加班記錄
 */
function getApprovedOvertimeRecords(monthParam, userIdParam) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log('⏰ 開始查詢加班記錄');
    Logger.log('   月份: ' + monthParam);
    Logger.log('   員工ID: ' + userIdParam);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_OVERTIME);
    
    if (!sheet) {
      Logger.log(' 找不到加班申請工作表');
      return [];
    }
    
    const values = sheet.getDataRange().getValues();
    
    if (values.length <= 1) {
      Logger.log(' 加班工作表只有標題，沒有資料');
      return [];
    }
    
    // ⭐ 步驟 1: 取得標題列
    const headers = values[0];
    
    Logger.log(' 加班工作表標題:');
    headers.forEach((h, i) => {
      Logger.log(`   ${i}. ${h}`);
    });
    
    // ⭐ 步驟 2: 動態找出欄位索引
    const employeeIdCol = headers.indexOf('員工ID');
    const employeeNameCol = headers.indexOf('員工姓名');
    const overtimeDateCol = headers.indexOf('加班日期');
    const startTimeCol = headers.indexOf('開始時間');
    const endTimeCol = headers.indexOf('結束時間');
    const hoursCol = headers.indexOf('加班時數');
    const reasonCol = headers.indexOf('申請原因');
    const statusCol = headers.indexOf('審核狀態');
    
    Logger.log('');
    Logger.log(' 欄位索引:');
    Logger.log(`   員工ID: ${employeeIdCol}`);
    Logger.log(`   員工姓名: ${employeeNameCol}`);
    Logger.log(`   加班日期: ${overtimeDateCol}`);
    Logger.log(`   開始時間: ${startTimeCol}`);
    Logger.log(`   結束時間: ${endTimeCol}`);
    Logger.log(`   加班時數: ${hoursCol}`);
    Logger.log(`   申請原因: ${reasonCol}`);
    Logger.log(`   審核狀態: ${statusCol}`);
    
    // ⭐ 步驟 3: 智能格式化時間（完全兼容版）
    const formatTime = (dateTime) => {
      if (!dateTime) return "";
      
      try {
        // 情況 1: Date 物件
        if (dateTime instanceof Date) {
          return Utilities.formatDate(dateTime, "Asia/Taipei", "HH:mm");
        }
        
        // 情況 2: 字串處理
        const str = String(dateTime).trim();
        
        // 情況 2a: ISO 格式 "2025/12/09 下午 9:20:00"
        if (str.includes('下午') || str.includes('上午')) {
          const timePart = str.split(' ')[2]; // 取 "9:20:00"
          return timePart.substring(0, 5); // 回傳 "09:20"
        }
        
        // 情況 2b: ISO 格式 "2025-12-10T18:00:00"
        if (str.includes('T')) {
          const timePart = str.split('T')[1];
          return timePart.substring(0, 5);
        }
        
        // 情況 2c: 已經是 "HH:mm" 或 "HH:mm:ss" 格式
        if (str.includes(':')) {
          return str.substring(0, 5);
        }
        
        return str;
        
      } catch (e) {
        Logger.log(` 時間格式化失敗: ${dateTime}, 錯誤: ${e}`);
        return "";
      }
    };
    
    // ⭐ 步驟 4: 智能格式化日期（完全兼容版）
    const formatOvertimeDate = (dateValue) => {
      if (!dateValue) return "";
      
      try {
        // 情況 1: Date 物件
        if (dateValue instanceof Date) {
          return Utilities.formatDate(dateValue, "Asia/Taipei", "yyyy-MM-dd");
        }
        
        // 情況 2: 字串處理
        const str = String(dateValue).trim();
        
        // 情況 2a: "2025-12-09" 格式（已經是正確格式）
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
          return str;
        }
        
        // 情況 2b: "2025/12/09" 格式
        if (str.includes('/')) {
          const parts = str.split('/');
          if (parts.length >= 3) {
            const year = parts[0];
            const month = parts[1].padStart(2, '0');
            const day = parts[2].split(' ')[0].padStart(2, '0'); // 處理可能包含時間的情況
            return `${year}-${month}-${day}`;
          }
        }
        
        // 情況 2c: "2025-12-09T..." ISO 格式
        if (str.includes('T')) {
          return str.split('T')[0];
        }
        
        return str;
        
      } catch (e) {
        Logger.log(` 日期格式化失敗: ${dateValue}, 錯誤: ${e}`);
        return "";
      }
    };
    
    // ⭐ 步驟 5: 篩選並組裝記錄
    const overtimeRecords = [];
    
    Logger.log('');
    Logger.log(' 開始篩選記錄...');
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      // 格式化日期
      const overtimeDate = formatOvertimeDate(row[overtimeDateCol]);
      const employeeId = row[employeeIdCol];
      const status = String(row[statusCol]).trim().toLowerCase();
      
      // 檢查條件
      const monthMatch = overtimeDate && overtimeDate.startsWith(monthParam);
      const userMatch = userIdParam ? employeeId === userIdParam : true;
      const statusMatch = status === "approved";
      
      Logger.log(`   ${i}. ${overtimeDate} - ${row[employeeNameCol]}`);
      Logger.log(`      員工ID: ${employeeId}, 狀態: ${status}`);
      Logger.log(`      monthMatch: ${monthMatch}, userMatch: ${userMatch}, statusMatch: ${statusMatch}`);
      
      if (monthMatch && userMatch && statusMatch) {
        const record = {
          employeeId: employeeId,
          employeeName: row[employeeNameCol],
          date: overtimeDate,  // ⭐⭐⭐ 使用 date（與前端一致）
          startTime: formatTime(row[startTimeCol]),
          endTime: formatTime(row[endTimeCol]),
          hours: parseFloat(row[hoursCol]) || 0,
          reason: row[reasonCol] || ''
        };
        
        overtimeRecords.push(record);
        
        Logger.log(`       符合條件！`);
        Logger.log(`         日期: ${record.date}`);
        Logger.log(`         時間: ${record.startTime} - ${record.endTime}`);
        Logger.log(`         時數: ${record.hours}`);
      } else {
        Logger.log(`       不符合條件`);
      }
    }
    
    Logger.log('');
    Logger.log(` 找到 ${overtimeRecords.length} 筆已核准加班記錄`);
    
    if (overtimeRecords.length > 0) {
      Logger.log('');
      Logger.log(' 加班記錄詳細列表:');
      overtimeRecords.forEach((rec, idx) => {
        Logger.log(`   ${idx + 1}. ${rec.date} - ${rec.employeeName}`);
        Logger.log(`      ${rec.startTime} ~ ${rec.endTime} (${rec.hours}h)`);
      });
    }
    
    Logger.log('═══════════════════════════════════════');
    
    return overtimeRecords;
    
  } catch (error) {
    Logger.log(' getApprovedOvertimeRecords 錯誤: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
    Logger.log('═══════════════════════════════════════');
    return [];
  }
}

// ==================== 地點管理 ====================
/**
 * 新增打卡地點
 * @param {string} name - 地點名稱
 * @param {number} lat - 緯度
 * @param {number} lng - 經度
 * @param {number} radius - 打卡範圍（公尺），預設 200，範圍 30-2000
 */
function addLocation(name, lat, lng, radius) {
  if (!name || !lat || !lng) {
    return { ok: false, code: "ERR_INVALID_INPUT" };
  }
  
  // 驗證 radius 參數，確保在合理範圍內
  const validRadius = radius && !isNaN(radius) ? parseInt(radius) : 200;
  const finalRadius = Math.max(30, Math.min(2000, validRadius)); // 限制在 30-2000 之間
  
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LOCATIONS);
  sh.appendRow(["", name, lat, lng, finalRadius]);
  
  Logger.log(` 新增地點：${name}，範圍：${finalRadius}公尺`);
  return { ok: true, code: "LOCATION_ADD_SUCCESS" };
}

/**
 * 取得所有打卡地點
 */
function getLocation() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOCATIONS);
  const values = sheet.getDataRange().getValues();
  
  if (values.length === 0) {
    return { ok: true, locations: [] };
  }
  
  const headers = values.shift();
  const locations = values
    .filter(row => row[1])
    .map(row => ({
      id: row[headers.indexOf('ID')] || '',
      name: row[headers.indexOf('地點名稱')] || '',
      lat: row[headers.indexOf('GPS(緯度)')] || 0,
      lng: row[headers.indexOf('GPS(經度)')] || 0,
      scope: row[headers.indexOf('容許誤差(公尺)')] || 100
    }));
  
  return { ok: true, locations: locations };
}

// ==================== 審核功能 ====================

/**
 * 取得待審核請求（補打卡）
 */
function getReviewRequest() {
  Logger.log(' 開始取得待審核補打卡申請');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ADJUST_PUNCH);
  
  if (!sheet) {
    Logger.log(' 找不到「補打卡申請」工作表');
    return { ok: false, msg: "找不到補打卡申請工作表" };
  }
  
  const values = sheet.getDataRange().getValues();
  
  if (values.length <= 1) {
    Logger.log(' 補打卡申請工作表只有標題，沒有資料');
    return { ok: true, reviewRequest: [] };
  }
  
  const headers = values[0];
  
  // 篩選「待審核」的申請
  const reviewRequest = values.filter((row, index) => {
    if (index === 0 || !row[0]) return false;
    
    const statusCol = headers.indexOf('狀態');
    const status = row[statusCol];
    
    return status === '待審核';
    
  }).map(row => {
    const actualRowNumber = values.indexOf(row) + 1;
    
    // 從工作表讀取各欄位
    const applicationId = row[headers.indexOf('申請ID')];
    const userId = row[headers.indexOf('用戶ID')];
    const name = row[headers.indexOf('姓名')];
    const dateValue = row[headers.indexOf('日期')];  // ⭐ 關鍵：可能是字串或 Date
    const timeValue = row[headers.indexOf('時間')];  // ⭐ 關鍵：可能是字串或 Date
    const type = row[headers.indexOf('類型')];
    const reason = row[headers.indexOf('原因')];
    const applicationTime = row[headers.indexOf('申請時間')];
    
    //  修正：智能格式化日期
    let date, time;
    
    // 處理日期
    if (dateValue instanceof Date) {
      date = Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else if (typeof dateValue === 'string') {
      date = dateValue;
    } else {
      date = '未知日期';
    }
    
    // 處理時間
    if (timeValue instanceof Date) {
      time = Utilities.formatDate(timeValue, Session.getScriptTimeZone(), 'HH:mm');
    } else if (typeof timeValue === 'string') {
      time = timeValue;
    } else {
      time = '未知時間';
    }
    
    Logger.log(`   ${actualRowNumber}. ${name} - ${date} ${time} ${type}`);
    Logger.log(`      理由: ${reason}`);
    const isTodayAdjust = reason && reason.includes('【當日修正】');
    
    return {
      id: actualRowNumber,
      applicationId: applicationId,
      userId: userId,
      name: name,
      type: type,
      remark: `補${type}卡`,
      applicationPeriod: `${date} ${time}`,
      note: reason || '',
      punchTypes: isTodayAdjust ? `當日修正 - 補${type}卡` : `補${type}審核中`  // ⭐ 新增
    };
  });
  
  Logger.log('');
  Logger.log(` 找到 ${reviewRequest.length} 筆待審核申請`);
  
  return { ok: true, reviewRequest: reviewRequest };
}

/**
 * 更新審核狀態（含 LINE 通知）
 */
/**
 *  更新審核狀態（完整修正版 - 從補打卡申請工作表讀取）
 */
function updateReviewStatus(rowNumber, status, note) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 開始審核補打卡');
    Logger.log('   行號: ' + rowNumber);
    Logger.log('   狀態: ' + status);
    
    //  修正：改為從補打卡申請工作表讀取
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ADJUST_PUNCH);
    
    if (!sheet) {
      Logger.log(' 找不到補打卡申請工作表');
      return { ok: false, msg: "找不到補打卡申請工作表" };
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    Logger.log(' 工作表標題:', headers);
    
    // 找出「狀態」、「審核人」、「審核時間」欄位
    const statusCol = headers.indexOf('狀態') + 1;
    const reviewerCol = headers.indexOf('審核人') + 1;
    const reviewTimeCol = headers.indexOf('審核時間') + 1;
    
    if (statusCol === 0) {
      Logger.log(' 找不到「狀態」欄位');
      return { ok: false, msg: "找不到「狀態」欄位" };
    }
    
    // 取得該行的申請資料
    const record = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    Logger.log(' 申請記錄:', record);
    
    //  從補打卡申請工作表讀取資料
    const applicationId = record[headers.indexOf('申請ID')];
    const userId = record[headers.indexOf('用戶ID')];
    const employeeName = record[headers.indexOf('姓名')];
    const dateValue = record[headers.indexOf('日期')];
    const timeValue = record[headers.indexOf('時間')];
    const punchType = record[headers.indexOf('類型')];
    const reason = record[headers.indexOf('原因')];
    
    //  智能格式化日期時間
    let punchDate, punchTime;
    
    // 處理日期
    if (dateValue instanceof Date) {
      punchDate = Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else if (typeof dateValue === 'string') {
      // 如果已經是字串格式，檢查是否符合 YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        punchDate = dateValue;
      } else {
        // 嘗試解析
        const parsedDate = new Date(dateValue);
        if (!isNaN(parsedDate)) {
          punchDate = Utilities.formatDate(parsedDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else {
          punchDate = dateValue;
        }
      }
    } else {
      punchDate = '未知日期';
    }
    
    // 處理時間
    if (timeValue instanceof Date) {
      punchTime = Utilities.formatDate(timeValue, Session.getScriptTimeZone(), 'HH:mm');
    } else if (typeof timeValue === 'string') {
      // 如果已經是字串格式，檢查是否符合 HH:mm
      if (/^\d{1,2}:\d{2}$/.test(timeValue)) {
        punchTime = timeValue;
      } else {
        punchTime = timeValue;
      }
    } else {
      punchTime = '未知時間';
    }
    
    Logger.log('');
    Logger.log(' 解析資料:');
    Logger.log('   申請ID: ' + applicationId);
    Logger.log('   用戶ID: ' + userId);
    Logger.log('   員工姓名: ' + employeeName);
    Logger.log('   日期: ' + punchDate);
    Logger.log('   時間: ' + punchTime);
    Logger.log('   類型: ' + punchType);
    Logger.log('   理由: ' + reason);
    
    //  更新審核狀態
    const statusText = (status === "v") ? "已核准" : "已拒絕";
    
    sheet.getRange(rowNumber, statusCol).setValue(statusText);
    
    if (reviewerCol > 0) {
      sheet.getRange(rowNumber, reviewerCol).setValue("系統管理員");
    }
    
    if (reviewTimeCol > 0) {
      sheet.getRange(rowNumber, reviewTimeCol).setValue(new Date());
    }
    
    Logger.log(' 已更新審核狀態為: ' + statusText);
    
    //  如果核准，寫入「出勤紀錄」工作表
    if (status === "v") {
      const attendanceSheet = SpreadsheetApp.getActive().getSheetByName(SHEET_ATTENDANCE);
      
      if (attendanceSheet) {
        Logger.log('');
        Logger.log(' 寫入出勤紀錄...');
        
        // 建立完整的日期時間物件
        const punchDateTime = new Date(`${punchDate} ${punchTime}`);
        
        Logger.log('   打卡時間物件: ' + punchDateTime);
        
        //  取得員工部門資料（可選）
        let employeeDept = '';
        try {
          const employeeInfo = findEmployeeByLineUserId_(userId);
          if (employeeInfo.ok) {
            employeeDept = employeeInfo.dept || '';
          }
        } catch (e) {
          Logger.log(' 無法取得員工部門: ' + e.message);
        }
        
        // 根據出勤紀錄工作表的欄位順序寫入
        const row = [
          punchDateTime,           // A: 打卡時間
          userId,                  // B: userId
          employeeDept,            // C: 部門
          employeeName,            // D: 打卡人員
          punchType,               // E: 打卡類別（上班/下班）
          '',                      // F: GPS
          '',                      // G: 地點
          '補打卡',                // H: 備註
          'v',                     // I: 管理員審核
          reason || note || ''     // J: 裝置資訊（補打卡理由）
        ];
        
        attendanceSheet.appendRow(row);
        
        Logger.log(' 已寫入出勤紀錄');
        Logger.log('   寫入內容: ' + JSON.stringify(row));
      } else {
        Logger.log(' 找不到出勤紀錄工作表');
      }
    }
    
    //  發送 LINE 通知
    const isApproved = (status === "v");
    
    try {
      Logger.log('');
      Logger.log(' 發送 LINE 通知...');
      
      notifyPunchReview(
        userId,
        employeeName,
        punchDate,
        punchTime,
        punchType,
        "系統管理員",
        isApproved,
        note || ""
      );
      
      Logger.log(' LINE 通知已發送');
    } catch (notifyError) {
      Logger.log(' LINE 通知發送失敗: ' + notifyError.message);
    }
    
    Logger.log('═══════════════════════════════════════');
    return { ok: true, msg: "審核成功並已通知員工" };
    
  } catch (err) {
    Logger.log(' updateReviewStatus 錯誤: ' + err.message);
    Logger.log('   錯誤堆疊: ' + err.stack);
    return { ok: false, msg: `審核失敗：${err.message}` };
  }
}


// ==================== 用戶角色管理 ====================

function updateUserRole(userId, newRole) {
  try {
    Logger.log(' 開始更新用戶角色');
    Logger.log('   userId: ' + userId);
    Logger.log('   newRole: ' + newRole);
    
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_EMPLOYEES);
    
    if (!sheet) {
      return {
        ok: false,
        msg: '找不到員工工作表'
      };
    }
    
    const data = sheet.getDataRange().getValues();
    
    // 檢查是否為最後一個管理員
    if (newRole === 'employee' || newRole === 'scheduler') {  // ⭐ 新增 scheduler 檢查
      const adminCount = data.filter((row, index) => 
        index > 0 && row[5] === '管理員'  // F 欄: 部門
      ).length;
      
      if (adminCount <= 1) {
        const currentRole = data.find((row, index) => index > 0 && row[0] === userId)?.[5];
        if (currentRole === '管理員') {
          return {
            ok: false,
            msg: '至少需要保留一位管理員'
          };
        }
      }
    }
    
    // 尋找用戶並更新
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {  // A 欄: userId
        // ⭐ 支援三種角色
        let newDept;
        if (newRole === 'admin') {
          newDept = '管理員';
        } else if (newRole === 'scheduler') {
          newDept = '排班人員';  // ⭐ 新增
        } else {
          newDept = '員工';
        }
        
        sheet.getRange(i + 1, 6).setValue(newDept);  // F 欄: 部門
        
        Logger.log(' 已更新角色為: ' + newDept);
        
        return {
          ok: true,
          msg: '角色已更新'
        };
      }
    }
    
    return {
      ok: false,
      msg: '找不到該用戶'
    };
    
  } catch (error) {
    Logger.log(' updateUserRole 錯誤: ' + error);
    return {
      ok: false,
      msg: error.message
    };
  }
}

/**
 *  刪除用戶
 */
function deleteUser(userId) {
  try {
    Logger.log(' 開始刪除用戶');
    Logger.log('   userId: ' + userId);
    
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_EMPLOYEES);
    
    if (!sheet) {
      return {
        ok: false,
        msg: '找不到員工工作表'
      };
    }
    
    const data = sheet.getDataRange().getValues();
    
    // 檢查是否為最後一個管理員
    const targetUser = data.find((row, index) => index > 0 && row[0] === userId);
    
    if (targetUser && targetUser[5] === '管理員') {  // F 欄: 部門
      const adminCount = data.filter((row, index) => 
        index > 0 && row[5] === '管理員'
      ).length;
      
      if (adminCount <= 1) {
        return {
          ok: false,
          msg: '不能刪除最後一位管理員'
        };
      }
    }
    
    // 尋找並刪除用戶
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {  // A 欄: userId
        sheet.deleteRow(i + 1);
        
        Logger.log(' 用戶已刪除');
        
        return {
          ok: true,
          msg: '用戶已刪除'
        };
      }
    }
    
    return {
      ok: false,
      msg: '找不到該用戶'
    };
    
  } catch (error) {
    Logger.log(' deleteUser 錯誤: ' + error);
    return {
      ok: false,
      msg: error.message
    };
  }
}

// ==================== 工具函數 ====================

/**
 * 格式化時間
 */
function formatTime(date) {
  if (!date) return '';
  try {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm:ss');
  } catch (e) {
    return String(date);
  }
}


/**
 * 取得員工指定月份的詳細打卡資料（用於圖表分析）
 * @param {string} employeeId - 員工ID
 * @param {string} yearMonth - 年月，格式 "YYYY-MM"
 * @returns {Object} 包含每日打卡時間和工時的資料
 */
function getEmployeeMonthlyPunchData(employeeId, yearMonth) {
  try {
    Logger.log(' 取得員工打卡分析資料');
    Logger.log('   員工ID: ' + employeeId);
    Logger.log('   月份: ' + yearMonth);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ATTENDANCE);
    const values = sheet.getDataRange().getValues();
    
    if (values.length <= 1) {
      return { 
        success: false, 
        message: '無打卡記錄' 
      };
    }
    
    // 過濾該員工該月份的記錄
    const records = values.slice(1).filter(row => {
      if (!row[0]) return false;
      
      const date = new Date(row[0]);
      const recordMonth = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
      const recordEmployeeId = row[1];
      
      return recordMonth === yearMonth && recordEmployeeId === employeeId;
    });
    
    if (records.length === 0) {
      return {
        success: false,
        message: '該月份無打卡記錄'
      };
    }
    
    // 按日期分組
    const dailyData = {};
    
    records.forEach(row => {
      const timestamp = new Date(row[0]);
      const dateKey = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      const type = row[4]; // 上班/下班
      const time = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'HH:mm');
      const note = row[7] || '';
      const audit = row[8] || '';
      
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = {
          date: dateKey,
          punchIn: null,
          punchOut: null,
          workHours: 0,
          status: 'normal',
          punches: []
        };
      }
      
      // 只記錄正常打卡或已核准的補打卡；一天可能有兩組上下班，全部留著配對
      if (note !== '補打卡' || audit === 'v') {
        if (type === '上班' || type === '下班') {
          dailyData[dateKey].punches.push({ type: type, time: timestamp });
          // 圖表畫的是第一次上班、最後一次下班
          if (type === '上班' && !dailyData[dateKey].punchIn) dailyData[dateKey].punchIn = time;
          if (type === '下班') dailyData[dateKey].punchOut = time;
        }
      }
    });
    
    // 計算工時：跟薪資同一套規則，扣當天排班的休息分鐘（見 ShiftTemplates.gs）
    const shiftMap = (typeof getEmployeeShiftMapForMonth === 'function')
      ? getEmployeeShiftMapForMonth(employeeId, yearMonth)
      : {};
    const result = Object.values(dailyData).map(day => {
      day.punches.sort((a, b) => a.time - b.time);
      const work = computeDayWorkFromPunches_(day.punches, shiftMap[day.date] || null);
      day.workHours = minutesToHours_(work.netMinutes);
      if (!work.segments.length || work.unpaired > 0) day.status = 'incomplete';
      delete day.punches;
      return day;
    });
    
    // 排序（由舊到新）
    result.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return {
      success: true,
      data: result,
      employeeId: employeeId,
      yearMonth: yearMonth,
      totalDays: result.length
    };
    
  } catch (error) {
    Logger.log(' getEmployeeMonthlyPunchData 錯誤: ' + error);
    return {
      success: false,
      message: error.message
    };
  }
}

// DbOperations.gs - 修正後的 updateEmployeeName 函數

/**
 *  修正版：更新員工姓名並設定鎖定標記
 */
function updateEmployeeName(userId, newName) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 開始更新員工姓名');
    Logger.log('   userId: ' + userId);
    Logger.log('   newName: ' + newName);
    
    // 驗證輸入
    if (!userId || !newName) {
      return {
        ok: false,
        msg: '缺少必要參數'
      };
    }
    
    const trimmedName = String(newName).trim();
    
    if (trimmedName.length < 2) {
      return {
        ok: false,
        msg: '姓名至少需要 2 個字'
      };
    }
    
    if (trimmedName.length > 50) {
      return {
        ok: false,
        msg: '姓名不能超過 50 個字'
      };
    }
    
    // 姓名會顯示在各種管理畫面上，擋掉 HTML 符號，就算哪個畫面漏了跳脫也不會被塞進程式碼
    if (/[<>]/.test(trimmedName)) {
      return {
        ok: false,
        msg: '姓名不能包含 < 或 > 符號'
      };
    }
    
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_EMPLOYEES);
    
    if (!sheet) {
      return {
        ok: false,
        msg: '找不到員工工作表'
      };
    }
    
    const data = sheet.getDataRange().getValues();
    
    // 尋找用戶並更新
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {  // A 欄: userId
        const oldName = data[i][2];  // C 欄: displayName
        
        // ⭐⭐⭐ 關鍵修正：同時更新姓名和 nameOverride
        sheet.getRange(i + 1, 3).setValue(trimmedName);   // C 欄：displayName
        sheet.getRange(i + 1, 9).setValue(trimmedName);   // I 欄：nameOverride（設定鎖定）
        
        Logger.log(' 已更新姓名並設定鎖定');
        Logger.log('   舊姓名: ' + oldName);
        Logger.log('   新姓名: ' + trimmedName);
        Logger.log('   nameOverride: ' + trimmedName + ' ');
        Logger.log('═══════════════════════════════════════');
        
        return {
          ok: true,
          msg: '姓名已更新並鎖定',
          oldName: oldName,
          newName: trimmedName
        };
      }
    }
    
    return {
      ok: false,
      msg: '找不到該員工'
    };
    
  } catch (error) {
    Logger.log(' updateEmployeeName 錯誤: ' + error);
    Logger.log('═══════════════════════════════════════');
    return {
      ok: false,
      msg: error.message
    };
  }
}
/**
 * 根據 token 取得使用者資料
 */
function getUserByToken(token) {
  try {
    const session = checkSession_(token);
    if (session.ok && session.user) {
      return session.user;
    }
    return null;
  } catch (error) {
    Logger.log(' getUserByToken 錯誤: ' + error);
    return null;
  }
}

// ==================== 員工基本資料管理 ====================

const SHEET_EMPLOYEE_INFO = '員工基本資料';

/**
 *  設定員工基本資料
 */
function setEmployeeBasicInfo(data) {
  try {
    Logger.log(' 設定員工基本資料');
    Logger.log('   員工ID: ' + data.employeeId);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_EMPLOYEE_INFO);
    
    // 如果工作表不存在，創建它
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_EMPLOYEE_INFO);
      sheet.appendRow([
        '員工ID',
        '姓名',
        '身分證字號',
        '地址',
        '電話',
        '生日',
        '建立時間',
        '更新時間'
      ]);
      
      // 設定標題列格式
      const headerRange = sheet.getRange(1, 1, 1, 8);
      headerRange.setBackground('#4A90E2');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
      
      Logger.log(' 已建立「員工基本資料」工作表');
    }
    
    const allData = sheet.getDataRange().getValues();
    let rowIndex = -1;
    
    // 尋找是否已存在該員工
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][0] === data.employeeId) {
        rowIndex = i + 1;
        Logger.log('   找到現有記錄，將更新第 ' + rowIndex + ' 行');
        break;
      }
    }
    
    const now = new Date();
    
    if (rowIndex > 0) {
      // 更新現有記錄
      sheet.getRange(rowIndex, 2).setValue(data.employeeName || '');
      sheet.getRange(rowIndex, 3).setValue(data.idNumber || '');
      sheet.getRange(rowIndex, 4).setValue(data.address || '');
      // sheet.getRange(rowIndex, 5).setValue(data.phone || '');
      const phoneValue = data.phone ? `'${data.phone}` : '';  // 加上單引號
      sheet.getRange(rowIndex, 5).setValue(phoneValue);
      sheet.getRange(rowIndex, 6).setValue(data.birthDate || '');
      sheet.getRange(rowIndex, 8).setValue(now);
      
      Logger.log(' 已更新員工基本資料');
      
    } else {
      // 新增記錄
      sheet.appendRow([
        data.employeeId,
        data.employeeName || '',
        data.idNumber || '',
        data.address || '',
        data.phone || '',
        data.birthDate || '',
        now,
        now
      ]);
      
      Logger.log(' 已新增員工基本資料');
    }
    
    return {
      success: true,
      message: rowIndex > 0 ? '員工資料已更新' : '員工資料已新增'
    };
    
  } catch (error) {
    Logger.log(' setEmployeeBasicInfo 錯誤: ' + error);
    return {
      success: false,
      message: '儲存失敗: ' + error.message
    };
  }
}

/**
 *  取得員工基本資料
 */
function getEmployeeBasicInfo(employeeId) {
  try {
    Logger.log(' 查詢員工基本資料: ' + employeeId);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_EMPLOYEE_INFO);
    
    if (!sheet) {
      return {
        success: false,
        message: '員工基本資料工作表不存在'
      };
    }
    
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === employeeId) {
        const employeeInfo = {
          employeeId: data[i][0],
          employeeName: data[i][1],
          idNumber: data[i][2],
          address: data[i][3],
          phone: data[i][4],
          birthDate: data[i][5],
          createdAt: data[i][6],
          updatedAt: data[i][7]
        };
        
        Logger.log(' 找到員工資料');
        
        return {
          success: true,
          data: employeeInfo
        };
      }
    }
    
    Logger.log(' 找不到該員工的基本資料');
    
    return {
      success: false,
      message: '找不到該員工的基本資料'
    };
    
  } catch (error) {
    Logger.log(' getEmployeeBasicInfo 錯誤: ' + error);
    return {
      success: false,
      message: '查詢失敗: ' + error.message
    };
  }
}

/**
 *  取得所有員工基本資料
 */
function getAllEmployeeBasicInfo() {
  try {
    Logger.log(' 取得所有員工基本資料');
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_EMPLOYEE_INFO);
    
    if (!sheet) {
      return {
        success: true,
        data: [],
        total: 0,
        message: '員工基本資料工作表不存在'
      };
    }
    
    const data = sheet.getDataRange().getValues();
    const employees = [];
    
    for (let i = 1; i < data.length; i++) {
      employees.push({
        employeeId: data[i][0],
        employeeName: data[i][1],
        idNumber: data[i][2],
        address: data[i][3],
        phone: data[i][4],
        birthDate: data[i][5],
        createdAt: data[i][6],
        updatedAt: data[i][7]
      });
    }
    
    Logger.log(` 共找到 ${employees.length} 筆員工基本資料`);
    
    return {
      success: true,
      data: employees,
      total: employees.length
    };
    
  } catch (error) {
    Logger.log(' getAllEmployeeBasicInfo 錯誤: ' + error);
    return {
      success: false,
      message: '查詢失敗: ' + error.message
    };
  }
}

/**
 *  刪除員工基本資料
 */
function deleteEmployeeBasicInfo(employeeId) {
  try {
    Logger.log(' 刪除員工基本資料: ' + employeeId);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_EMPLOYEE_INFO);
    
    if (!sheet) {
      return {
        success: false,
        message: '員工基本資料工作表不存在'
      };
    }
    
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === employeeId) {
        sheet.deleteRow(i + 1);
        
        Logger.log(' 已刪除員工基本資料');
        
        return {
          success: true,
          message: '員工資料已刪除'
        };
      }
    }
    
    return {
      success: false,
      message: '找不到該員工'
    };
    
  } catch (error) {
    Logger.log(' deleteEmployeeBasicInfo 錯誤: ' + error);
    return {
      success: false,
      message: '刪除失敗: ' + error.message
    };
  }
}

// QR 打卡已移到 QrPunch.gs

/**
 *  檢查 Session（自動延期）- 修正版
 */
function checkSession_(sessionToken) {
  if (!sessionToken) return { ok: false, code: "MISSING_SESSION_TOKEN" };

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSION);
  if (!sh) return { ok: false, code: "SESSION_SHEET_NOT_FOUND" };

  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const [token, userId, , expiredAt] = values[i];
    if (token === sessionToken) {
      if (expiredAt && new Date() > new Date(expiredAt)) {
        return { ok: false, code: "ERR_SESSION_EXPIRED" };
      }
      
      // 延長 Session
      const newExpiredAt = new Date(new Date().getTime() + SESSION_TTL_MS);
      sh.getRange(i + 1, 4).setValue(newExpiredAt);
      
      // 查詢員工資料
      const employee = findEmployeeByLineUserId_(userId);
      if (!employee.ok) {
        Logger.log(" Session 檢查失敗: " + JSON.stringify(employee));
        return { ok: false, code: employee.code };
      }
      
      // ⭐⭐⭐ 關鍵修正：不要返回整個 employee 物件，而是只返回純淨的 user 資料
      return { 
        ok: true, 
        user: {
          userId: employee.userId,
          employeeId: employee.employeeId,
          email: employee.email,
          name: employee.name,
          picture: employee.picture,
          dept: employee.dept,
          status: employee.status
        },
        code: "WELCOME_BACK",
        params: { name: employee.name }
      };
    }
  }
  return { ok: false, code: "ERR_SESSION_INVALID" };
}
