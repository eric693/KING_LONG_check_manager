// Handlers.gs - 完整版本（包含原有功能 + 薪資系統完全修正版 + 三節獎金）

// ==================== 三節獎金相關 Handler ====================

function handleSetBonusRecord(params) {
  try {
    if (!validateSession(params.token)) {
      return { ok: false, msg: '未授權或 session 已過期' };
    }
    const session = handleCheckSession(params.token);
    if (!session.ok || session.user.dept !== '管理員') {
      return { ok: false, msg: '此功能僅限管理員使用' };
    }
    const bonusData = {
      employeeId:   params.employeeId,
      employeeName: params.employeeName || '',
      dept:         params.dept || '',
      bonusType:    params.bonusType,
      year:         params.year,
      amount:       parseFloat(params.amount) || 0,
      payDate:      params.payDate || '',
      status:       params.status || '已發放',
      note:         params.note || ''
    };
    const result = setBonusRecord(bonusData);
    return { ok: result.success, data: result, msg: result.message };
  } catch (error) {
    Logger.log('handleSetBonusRecord 錯誤: ' + error);
    return { ok: false, msg: error.toString() };
  }
}

function handleGetMyBonusRecords(params) {
  try {
    if (!validateSession(params.token)) {
      return { ok: false, msg: '未授權或 session 已過期' };
    }
    const session = handleCheckSession(params.token);
    if (!session.ok) return { ok: false, msg: 'Session 無效' };
    const result = getMyBonusRecords(session.user.userId, params.year || '');
    return { ok: result.success, data: result.data, msg: result.message };
  } catch (error) {
    Logger.log('handleGetMyBonusRecords 錯誤: ' + error);
    return { ok: false, msg: error.toString() };
  }
}

function handleGetAllBonusRecords(params) {
  try {
    if (!validateSession(params.token)) {
      return { ok: false, msg: '未授權或 session 已過期' };
    }
    const session = handleCheckSession(params.token);
    if (!session.ok || session.user.dept !== '管理員') {
      return { ok: false, msg: '此功能僅限管理員使用' };
    }
    const result = getAllBonusRecords(params.year || '');
    return { ok: result.success, data: result.data, msg: result.message };
  } catch (error) {
    Logger.log('handleGetAllBonusRecords 錯誤: ' + error);
    return { ok: false, msg: error.toString() };
  }
}

// ==================== 登入與認證相關 ====================
// Handlers.gs - 完全優化版 handleGetProfile

/**
 *  優化版：一次完成所有登入流程
 */
// Handlers.gs - 修改 handleGetProfile

function handleGetProfile(code) {
  try {
    const tokenResp = exchangeCodeForToken_(code);
    const profile = getLineUserInfo_(tokenResp);
    const sToken = writeSession_(profile.userId);
    const employee = writeEmployee_(profile);
    
    // ⭐⭐⭐ 關鍵：不再在這裡查詢異常記錄
    return {
      ok: true,
      code: "WELCOME_BACK",
      params: { name: profile.displayName },
      sToken: sToken,
      user: {
        userId: profile.userId,
        employeeId: profile.userId,
        email: profile.email || "",
        name: profile.displayName,
        picture: profile.pictureUrl,
        dept: employee[5] || "員工",
        status: "啟用"
      }
      // ⭐ 移除 abnormalRecords
    };
    
  } catch (error) {
    return { ok: false, code: "ERR_LOGIN_FAILED", msg: error.message };
  }
}
// function handleGetProfile(code) {
//   try {
//     Logger.log(' 開始登入流程');
    
//     // 步驟 1：兌換 LINE Token
//     const tokenResp = exchangeCodeForToken_(code);
    
//     // 步驟 2：取得 LINE 使用者資料
//     const profile = getLineUserInfo_(tokenResp);
    
//     // 步驟 3：建立 Session
//     const sToken = writeSession_(profile.userId);
    
//     // 步驟 4：寫入/更新員工資料
//     const employee = writeEmployee_(profile);
    
//     // ⭐⭐⭐ 關鍵優化：直接返回完整使用者資料 + 異常記錄
//     // 這樣前端就不需要再呼叫 initApp，減少一次 API 請求
    
//     const now = new Date();
//     const month = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    
//     // 取得異常記錄
//     const records = getAttendanceRecords(month, profile.userId);
//     const abnormalResults = checkAttendanceAbnormal(records);
    
//     Logger.log(' 登入完成，返回完整資料');
    
//     return {
//       ok: true,
//       code: "WELCOME_BACK",
//       params: { name: profile.displayName },
//       sToken: sToken,
//       // ⭐ 新增：直接返回使用者資料
//       user: {
//         userId: profile.userId,
//         employeeId: profile.userId,
//         email: profile.email || "",
//         name: profile.displayName,
//         picture: profile.pictureUrl,
//         dept: employee[5] || "員工",  // 從 writeEmployee_ 返回的 row 取得部門
//         status: "啟用"
//       },
//       // ⭐ 新增：直接返回異常記錄
//       abnormalRecords: abnormalResults
//     };
    
//   } catch (error) {
//     Logger.log(' 登入失敗: ' + error);
//     return {
//       ok: false,
//       code: "ERR_LOGIN_FAILED",
//       msg: error.message
//     };
//   }
// }
// function handleGetProfile(code) {
//   const tokenResp = exchangeCodeForToken_(code);
//   const profile   = getLineUserInfo_(tokenResp);
//   const sToken    = writeSession_(profile.userId);
//   writeEmployee_(profile);
//   return {
//     ok: true,
//     code: "WELCOME_BACK",
//     params: { name: profile.displayName },
//     sToken
//   };
// }

function handleGetLoginUrl() {
  const baseUrl = LINE_REDIRECT_URL;
  const state   = Utilities.getUuid();
  const scope   = encodeURIComponent('openid profile email');
  const redirect= encodeURIComponent(baseUrl);
  const url     = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${encodeURIComponent(LINE_CHANNEL_ID)}&redirect_uri=${redirect}&state=${state}&scope=${scope}`;
  return { url };
}

function handleCheckSession(sessionToken) {
  const user = checkSession_(sessionToken);
  return user.ok ? user : { ok: false, code: user.code };
}

function handleExchangeToken(otoken) {
  const sessionToken = verifyOneTimeToken_(otoken);
  return sessionToken
    ? { ok:true, sToken: sessionToken }
    : { ok:false, code:"ERR_INVALID_TOKEN" };
}

// ==================== 打卡功能相關 ====================

function handlePunch(params) {
  const { token, type, lat, lng, note } = params;
  return punch(token, type, parseFloat(lat), parseFloat(lng), note);
}

// function handleAdjustPunch(params) {
//   const { token, type, lat, lng, note, datetime } = params;
//   const punchDate = datetime ? new Date(datetime) : new Date();
//   return punchAdjusted(token, type, punchDate, parseFloat(lat), parseFloat(lng), note);
// }

/**
 * 處理 LINE Bot 網頁打卡（Token 驗證 + GPS 地圍圍欄）
 * 不需要 sessionToken；LINE 打卡 Token 本身即是身份驗證
 */
function handleLinePunchWithToken(params) {
  try {
    const { token, lat, lng } = params;

    if (!token || !lat || !lng) {
      return { ok: false, code: 'ERR_MISSING_PARAMS', msg: '缺少必要參數' };
    }

    const props = PropertiesService.getScriptProperties();
    const key = 'LPT_' + token;
    const dataStr = props.getProperty(key);

    if (!dataStr) {
      return { ok: false, code: 'ERR_LPT_INVALID', msg: '打卡連結無效或已使用，請重新在 LINE 輸入打卡指令' };
    }

    const data = JSON.parse(dataStr);

    if (new Date().getTime() > data.expiry) {
      props.deleteProperty(key);
      return { ok: false, code: 'ERR_LPT_EXPIRED', msg: '打卡連結已過期（5 分鐘），請重新在 LINE 輸入打卡指令' };
    }

    // 單次使用：立即刪除 token
    props.deleteProperty(key);

    const userId    = data.userId;
    const punchType = data.punchType;
    const latF      = parseFloat(lat);
    const lngF      = parseFloat(lng);

    // 地理圍欄驗證
    const locationCheck = checkPunchLocation(latF, lngF);
    if (!locationCheck.valid) {
      const nearest = locationCheck.nearestLocation;
      const hint = nearest ? `（距離最近地點「${nearest.name}」還有 ${nearest.distance} 公尺）` : '';
      return { ok: false, code: 'ERR_NOT_IN_RANGE', msg: locationCheck.reason + hint };
    }

    // 防重複打卡
    if (isDuplicatePunch_(userId, punchType)) {
      return { ok: false, code: 'ERR_DUPLICATE_PUNCH', msg: '您剛剛已經打過卡了，請勿重複操作' };
    }

    // 一天最多兩組上下班（休息前要打卡），順序與次數見 PunchRules.gs
    const sequence = checkPunchSequence_(userId, punchType);
    if (!sequence.ok) return sequence;

    // 執行打卡
    const result = executePunch(userId, punchType, latF, lngF, locationCheck.locationName);

    if (!result.success) {
      return { ok: false, code: 'ERR_PUNCH_FAILED', msg: result.message };
    }

    // 推播 LINE 成功通知給本人
    try {
      const employee = findEmployeeByLineUserId_(userId);
      if (employee.ok) {
        const emoji = punchType === '上班' ? '🟢' : '🟠';
        const loc   = locationCheck.locationName || '';
        const notifyResult = sendLineNotification_(userId, {
          type: 'flex',
          altText: emoji + ' ' + punchType + '打卡成功',
          contents: createPunchSuccessMessage(employee.name, punchType, result.time, loc)
        });
        if (!notifyResult.ok) {
          // Flex 失敗時改用純文字
          sendLineNotification_(userId, {
            type: 'text',
            text: emoji + ' ' + punchType + '打卡成功！\n👤 ' + employee.name +
                  '\n⏰ ' + result.time + (loc ? '\n📍 ' + loc : '')
          });
        }
      }
    } catch (notifyErr) {
      Logger.log('LINE push 通知失敗（不影響打卡）: ' + notifyErr.message);
    }

    return {
      ok: true,
      punchType: punchType,
      time: result.time,
      location: locationCheck.locationName
    };

  } catch (err) {
    Logger.log('handleLinePunchWithToken 錯誤: ' + err.message);
    return { ok: false, code: 'ERR_INTERNAL', msg: '系統錯誤，請稍後再試' };
  }
}

/**
 *  處理補打卡（完全修正版 - 強化參數驗證和日誌）
 */
function handleAdjustPunch(params) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' handleAdjustPunch 開始');
    Logger.log('═══════════════════════════════════════');
    
    // ⭐ 步驟 1：記錄收到的原始參數
    Logger.log(' 收到的原始 params 物件:');
    Logger.log('   - token: ' + (params.token ? params.token.substring(0, 20) + '...' : '缺少'));
    Logger.log('   - type: ' + (params.type || '缺少'));
    Logger.log('   - datetime: ' + (params.datetime || '缺少'));
    Logger.log('   - lat: ' + (params.lat || '缺少'));
    Logger.log('   - lng: ' + (params.lng || '缺少'));
    Logger.log('   - note: ' + (params.note || '缺少'));
    Logger.log('');
    
    // ⭐ 步驟 2：解構參數（使用解構賦值）
    const { token, type, lat, lng, note, datetime } = params;
    
    // ⭐ 步驟 3：驗證必要參數
    if (!token) {
      Logger.log(' 缺少 token');
      return { ok: false, code: "ERR_MISSING_TOKEN", msg: "缺少認證 token" };
    }
    
    if (!type) {
      Logger.log(' 缺少 type');
      return { ok: false, code: "ERR_MISSING_TYPE", msg: "缺少打卡類型" };
    }
    
    if (!datetime) {
      Logger.log(' 缺少 datetime');
      return { ok: false, code: "ERR_MISSING_DATETIME", msg: "缺少日期時間" };
    }
    
    // 位置資訊為選填（補打卡為事後申請，不強制 GPS）

    // ⭐⭐⭐ 關鍵驗證：理由長度
    if (!note || note.trim().length < 2) {
      Logger.log(' 理由不足 2 個字');
      Logger.log('   note 內容: "' + note + '"');
      Logger.log('   note 長度: ' + (note ? note.length : 0));
      return { ok: false, code: "ERR_REASON_TOO_SHORT", msg: "補打卡理由至少需要 2 個字" };
    }
    
    Logger.log(' 所有參數驗證通過');
    Logger.log('');
    
    // ⭐ 步驟 4：轉換日期
    const punchDate = datetime ? new Date(datetime) : new Date();
    
    if (isNaN(punchDate.getTime())) {
      Logger.log(' 日期格式錯誤');
      return { ok: false, code: "ERR_INVALID_DATE", msg: "日期格式錯誤" };
    }
    
    Logger.log(' 轉換後的日期: ' + punchDate.toISOString());
    Logger.log('');
    
    // ⭐ 步驟 5：記錄即將傳遞給核心函數的參數
    Logger.log(' 準備呼叫 punchAdjusted()');
    Logger.log('   參數 1 (token): ' + token.substring(0, 20) + '...');
    Logger.log('   參數 2 (type): ' + type);
    Logger.log('   參數 3 (punchDate): ' + punchDate.toISOString());
    Logger.log('   參數 4 (lat): ' + parseFloat(lat));
    Logger.log('   參數 5 (lng): ' + parseFloat(lng));
    Logger.log('   參數 6 (note): ' + note);  // ⭐⭐⭐ 確認有傳遞
    Logger.log('');
    
    // ⭐⭐⭐ 關鍵：呼叫核心函數並傳遞所有 6 個參數
    const result = punchAdjusted(
      token, 
      type, 
      punchDate, 
      parseFloat(lat), 
      parseFloat(lng), 
      note  // ⭐ 確保理由有傳遞
    );
    
    Logger.log(' punchAdjusted() 回傳結果:');
    Logger.log('   - ok: ' + result.ok);
    Logger.log('   - code: ' + (result.code || '無'));
    Logger.log('   - msg: ' + (result.msg || '無'));
    Logger.log('');
    Logger.log('═══════════════════════════════════════');
    
    return result;
    
  } catch (error) {
    Logger.log('');
    Logger.log(' handleAdjustPunch 發生錯誤');
    Logger.log('錯誤訊息: ' + error.message);
    Logger.log('錯誤堆疊: ' + error.stack);
    Logger.log('═══════════════════════════════════════');
    
    return { 
      ok: false, 
      code: "ERR_INTERNAL_ERROR", 
      msg: "補打卡處理失敗: " + error.message 
    };
  }
}

// ==================== 出勤記錄相關 ====================

function handleGetAbnormalRecords(params) {
  const { month, userId } = params;
  if (!month) return { ok: false, code: "ERR_MISSING_MONTH" };
  const records = getAttendanceRecords(month, userId);
  const abnormalResults = checkAttendanceAbnormal(records);
  return { ok: true, records: abnormalResults };
}


/**
 *  處理取得出勤詳細資料（完整修正版 - 含打卡+請假+加班）
 */
function handleGetAttendanceDetails(params) {
  const { month, userId } = params;
  
  Logger.log('═══════════════════════════════════════');
  Logger.log(' handleGetAttendanceDetails 開始');
  Logger.log('   month: ' + month);
  Logger.log('   userId: ' + userId);
  Logger.log('═══════════════════════════════════════');
  
  if (!month) {
    Logger.log(' 缺少 month 參數');
    return { ok: false, code: "ERR_MISSING_MONTH" };
  }
  
  try {
    // ⭐⭐⭐ 關鍵修正：直接呼叫 DbOperations.gs 中的 getAttendanceDetails
    // 這個函數會自動合併 打卡 + 請假 + 加班 資料
    const result = getAttendanceDetails(month, userId);
    
    Logger.log(' 資料合併完成');
    Logger.log('   ok: ' + result.ok);
    Logger.log('   records 數量: ' + (result.records ? result.records.length : 0));
    
    // 檢查是否有請假和加班資料
    if (result.ok && result.records) {
      const hasLeave = result.records.some(r => r.leave);
      const hasOvertime = result.records.some(r => r.overtime);
      
      Logger.log('   包含請假: ' + (hasLeave ? '是' : '否'));
      Logger.log('   包含加班: ' + (hasOvertime ? '是' : '否'));
    }
    
    Logger.log('═══════════════════════════════════════');
    
    return result;
    
  } catch (error) {
    Logger.log(' handleGetAttendanceDetails 錯誤: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
    Logger.log('═══════════════════════════════════════');
    
    return { 
      ok: false, 
      code: "INTERNAL_ERROR",
      msg: error.message 
    };
  }
}

// ==================== 地點管理相關 ====================

function handleAddLocation(params) {
  const { name, lat, lng } = params;
  return addLocation(name, lat, lng);
}

function handleGetLocation() {
  return getLocation();
}

// ==================== 員工管理相關 ====================
/**
 * 處理取得所有用戶
 */
function handleGetAllUsers(params) {
  try {
    Logger.log(' 處理取得所有用戶請求');
    
    // ⭐ 修正：排班人員也可以查詢員工列表
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    // ⭐ 檢查是否有排班或管理權限
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, msg: '無法取得使用者資訊' };
    }
    
    const userRole = session.user.dept;
    
    // ⭐ 管理員、排班人員都可以查詢
    if (userRole !== '管理員' && userRole !== '排班人員') {
      return { ok: false, msg: '需要管理員或排班人員權限' };
    }
    
    const result = getAllUsers();
    return result;
    
  } catch (error) {
    Logger.log(' handleGetAllUsers 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

/**
 * 處理更新用戶角色
 */
function handleUpdateUserRole(params) {
  try {
    Logger.log(' 處理更新用戶角色請求');
    
    // 驗證 Session
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    // 驗證管理員權限
    const session = checkSession_(params.token);
    if (!session.ok || !session.user || session.user.dept !== '管理員') {
      return { ok: false, msg: '需要管理員權限' };
    }
    
    const userId = params.userId;
    const role = params.role;  // 'admin' 或 'employee'
    
    if (!userId || !role) {
      return { ok: false, msg: '缺少必要參數' };
    }
    
    // 不能改自己
    if (userId === session.user.userId) {
      return { ok: false, msg: '不能修改自己的角色' };
    }
    
    const result = updateUserRole(userId, role);
    return result;
    
  } catch (error) {
    Logger.log(' handleUpdateUserRole 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

/**
 * 處理刪除用戶
 */
function handleDeleteUser(params) {
  try {
    Logger.log(' 處理刪除用戶請求');
    
    // 驗證 Session
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    // 驗證管理員權限
    const session = checkSession_(params.token);
    if (!session.ok || !session.user || session.user.dept !== '管理員') {
      return { ok: false, msg: '需要管理員權限' };
    }
    
    const userId = params.userId;
    
    if (!userId) {
      return { ok: false, msg: '缺少用戶 ID' };
    }
    
    // 不能刪除自己
    if (userId === session.user.userId) {
      return { ok: false, msg: '不能刪除自己' };
    }
    
    const result = deleteUser(userId);
    return result;
    
  } catch (error) {
    Logger.log(' handleDeleteUser 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

// function handleGetAllUsers() {
//   return getAllUsers();
// }

// ==================== 審核功能相關 ====================

function handleGetReviewRequest() {
  return getReviewRequest();
}

function handleApproveReview(params) {
  const recordId = params.id;
  if (!recordId) {
    return { ok: false, msg: "缺少審核 ID" };
  }
  return updateReviewStatus(recordId, "v", "核准");
}

function handleRejectReview(params) {
  const recordId = params.id;
  if (!recordId) {
    return { ok: false, msg: "缺少審核 ID" };
  }
  return updateReviewStatus(recordId, "x", "拒絕");
}

// ==================== 加班功能相關 ====================

function handleGetEmployeeOvertime(params) {
  Logger.log(`查詢員工加班記錄`);
  return getEmployeeOvertimeRequests(params.token);
}

function handleGetPendingOvertime(params) {
  Logger.log(`查詢待審核加班申請`);
  return getPendingOvertimeRequests(params.token);
}

function handleReviewOvertime(params) {
  const { token, rowNumber, reviewAction, comment } = params;
  
  Logger.log(`handleReviewOvertime 收到參數:`);
  Logger.log(`   - rowNumber: ${rowNumber}`);
  Logger.log(`   - reviewAction: "${reviewAction}"`);
  Logger.log(`   - comment: "${comment}"`);
  
  return reviewOvertimeRequest(
    token, 
    parseInt(rowNumber), 
    reviewAction,
    comment || ""
  );
}

// ==================== 請假功能相關 ====================

function handleGetLeaveBalance(params) {
  return getLeaveBalance(params.token);
}

// function handleSubmitLeave(params) {
//   const { token, leaveType, startDate, endDate, days, reason } = params;
//   return submitLeaveRequest(token, leaveType, startDate, endDate, parseFloat(days), reason);
// }
function handleSubmitLeave(params) {
  const { token, leaveType, startDateTime, endDateTime, reason } = params;
  
  return submitLeaveRequest(
    token,
    leaveType,
    startDateTime,  // 現在是完整的日期時間
    endDateTime,    // 現在是完整的日期時間
    reason
  );
}
function handleGetEmployeeLeaveRecords(params) {
  return getEmployeeLeaveRecords(params.token);
}

function handleGetPendingLeaveRequests(params) {
  return getPendingLeaveRequests(params.token);
}

function handleReviewLeave(params) {
  const { token, rowNumber, reviewAction, comment } = params;
  return reviewLeaveRequest(token, parseInt(rowNumber), reviewAction, comment || "");
}

function handleInitializeEmployeeLeave(params) {
  return initializeEmployeeLeave(params.token);
}

// ==================== 排班功能相關 ====================

function handleAddShift(params) {
  try {
    // ⭐ 使用新的權限檢查
    const permCheck = checkSchedulingPermission(params.token);
    if (!permCheck.ok) {
      return permCheck;  // 直接返回錯誤訊息
    }
    
    Logger.log(' 收到新增排班請求');
    
    const shiftData = {
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      date: params.date,
      shiftType: params.shiftType,
      startTime: params.startTime,
      endTime: params.endTime,
      location: params.location,
      note: params.note || '',
      breakMinutes: params.breakMinutes
    };
    
    if (!shiftData.employeeId || !shiftData.date || !shiftData.shiftType) {
      return { ok: false, msg: "缺少必填欄位" };
    }
    
    const result = addShift(shiftData);
    
    return { 
      ok: result.success, 
      msg: result.message,
      data: result
    };
    
  } catch (error) {
    Logger.log(' handleAddShift 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

function handleBatchAddShifts(params) {
  try {
    // ⭐ 使用新的權限檢查
    const permCheck = checkSchedulingPermission(params.token);
    if (!permCheck.ok) {
      return permCheck;
    }
    
    Logger.log(' 收到批量新增排班請求');
    
    let shiftsArray;
    
    if (params.shiftsArray) {
      try {
        if (typeof params.shiftsArray === 'string') {
          const decoded = decodeURIComponent(params.shiftsArray);
          shiftsArray = JSON.parse(decoded);
          Logger.log(' 成功解析 shiftsArray: ' + shiftsArray.length + ' 筆');
        } else {
          shiftsArray = params.shiftsArray;
        }
      } catch (parseError) {
        Logger.log(' 解析 shiftsArray 失敗: ' + parseError);
        return { ok: false, msg: "資料格式錯誤: 無法解析 JSON" };
      }
    } else {
      Logger.log(' 缺少 shiftsArray 參數');
      return { ok: false, msg: "缺少 shiftsArray 參數" };
    }
    
    if (!Array.isArray(shiftsArray)) {
      return { ok: false, msg: "shiftsArray 必須是陣列" };
    }
    
    if (shiftsArray.length === 0) {
      return { ok: false, msg: "批量資料不能為空" };
    }
    
    Logger.log(' 準備批量新增: ' + shiftsArray.length + ' 筆排班');
    
    const result = batchAddShifts(shiftsArray);
    
    Logger.log(' 批量新增結果: ' + JSON.stringify(result));
    
    return { 
      ok: result.success, 
      msg: result.message,
      data: result
    };
    
  } catch (error) {
    Logger.log(' handleBatchAddShifts 錯誤: ' + error);
    return { ok: false, msg: "批量新增失敗: " + error.message };
  }
}

function handleUpdateShift(params) {
  try {
    // ⭐ 使用新的權限檢查
    const permCheck = checkSchedulingPermission(params.token);
    if (!permCheck.ok) {
      return permCheck;
    }
    
    if (!params.shiftId) {
      return { ok: false, msg: "缺少 shiftId 參數" };
    }
    
    Logger.log(' 更新排班: ' + params.shiftId);
    
    const updateData = {
      date: params.date,
      shiftType: params.shiftType,
      startTime: params.startTime,
      endTime: params.endTime,
      location: params.location,
      note: params.note,
      breakMinutes: params.breakMinutes
    };
    
    const result = updateShift(params.shiftId, updateData);
    
    return { 
      ok: result.success, 
      msg: result.message 
    };
    
  } catch (error) {
    Logger.log(' handleUpdateShift 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

function handleDeleteShift(params) {
  try {
    // ⭐ 使用新的權限檢查
    const permCheck = checkSchedulingPermission(params.token);
    if (!permCheck.ok) {
      return permCheck;
    }
    
    if (!params.shiftId) {
      return { ok: false, msg: "缺少 shiftId 參數" };
    }
    
    Logger.log(' 刪除排班: ' + params.shiftId);
    
    const result = deleteShift(params.shiftId);
    
    return { 
      ok: result.success, 
      msg: result.message 
    };
    
  } catch (error) {
    Logger.log(' handleDeleteShift 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

function handleGetShifts(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    Logger.log(' 收到查詢排班請求');
    
    const filters = {
      employeeId: params.employeeId,
      startDate: params.startDate,
      endDate: params.endDate,
      shiftType: params.shiftType,
      location: params.location
    };
    
    const result = getShifts(filters);
    
    return { 
      ok: result.success, 
      data: result.data, 
      count: result.count,
      msg: result.message 
    };
    
  } catch (error) {
    Logger.log(' handleGetShifts 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

function handleGetShiftById(params) {
  try {

    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    if (!params.shiftId) {
      return { ok: false, msg: "缺少 shiftId 參數" };
    }
    
    Logger.log(' 查詢排班詳情: ' + params.shiftId);
    
    const result = getShiftById(params.shiftId);
    
    return { 
      ok: result.success, 
      data: result.data, 
      msg: result.message 
    };
    
  } catch (error) {
    Logger.log(' handleGetShiftById 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

function handleGetEmployeeShiftForDate(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    if (!params.employeeId || !params.date) {
      return { ok: false, msg: "缺少必要參數" };
    }
    
    Logger.log(' 查詢員工排班: ' + params.employeeId + ', 日期: ' + params.date);
    
    const result = getEmployeeShiftForDate(params.employeeId, params.date);
    
    return { 
      ok: result.success, 
      hasShift: result.hasShift,
      data: result.data, 
      msg: result.message 
    };
    
  } catch (error) {
    Logger.log(' handleGetEmployeeShiftForDate 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

function handleGetWeeklyShiftStats(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    Logger.log(' 查詢本週排班統計');
    
    const result = getWeeklyShiftStats();
    
    return { 
      ok: result.success, 
      data: result.data, 
      msg: result.message 
    };
    
  } catch (error) {
    Logger.log(' handleGetWeeklyShiftStats 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

function handleExportShifts(params) {
  try {
    // ⭐ 使用新的權限檢查
    const permCheck = checkSchedulingPermission(params.token);
    if (!permCheck.ok) {
      return permCheck;
    }
    
    Logger.log(' 匯出排班資料');
    
    const filters = {
      employeeId: params.employeeId,
      startDate: params.startDate,
      endDate: params.endDate,
      shiftType: params.shiftType
    };
    
    const result = exportShifts(filters);
    
    return { 
      ok: result.success, 
      data: result.data, 
      filename: result.filename, 
      msg: result.message 
    };
    
  } catch (error) {
    Logger.log(' handleExportShifts 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

// ==================== 薪資系統 Handler 函數（完全修正版 v4.0）====================

// Handlers.gs - handleSetEmployeeSalaryTW 完全修正版 v5.0
// ⭐ 修正：補齊所有津貼和扣款參數

/**
 *  處理設定員工薪資（完全修正版 v5.0）
 */
function handleSetEmployeeSalaryTW(params) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 開始設定員工薪資（完整版 v5.0）');
    Logger.log('═══════════════════════════════════════');
    
    if (!params || Object.keys(params).length === 0) {
      Logger.log(' params 為空或未定義');
      return { ok: false, msg: "未收到任何參數" };
    }
    
    Logger.log(' 收到的參數:');
    Logger.log('   - token: ' + (params.token ? '存在' : '缺少'));
    Logger.log('   - employeeId: ' + (params.employeeId || '缺少'));
    Logger.log('   - employeeName: ' + (params.employeeName || '缺少'));
    Logger.log('   - baseSalary: ' + (params.baseSalary || '缺少'));
    Logger.log('   - positionAllowance: ' + (params.positionAllowance || '0'));
    Logger.log('   - mealAllowance: ' + (params.mealAllowance || '0'));
    Logger.log('   - transportAllowance: ' + (params.transportAllowance || '0'));
    Logger.log('   - attendanceBonus: ' + (params.attendanceBonus || '0'));
    Logger.log('   - performanceBonus: ' + (params.performanceBonus || '0'));
    Logger.log('   - otherAllowances: ' + (params.otherAllowances || '0'));
    
    if (!params.token) {
      Logger.log(' 缺少認證 token');
      return { ok: false, msg: "缺少認證 token" };
    }
    
    const sessionResult = checkSession_(params.token);
    
    if (!sessionResult.ok) {
      Logger.log(' Session 驗證失敗');
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    Logger.log(' Session 驗證成功');
    
    const safeString = (value) => {
      if (value === null || value === undefined) return '';
      return String(value).trim();
    };
    
    const safeNumber = (value) => {
      if (value === null || value === undefined) return 0;
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    };
    
    // ⭐⭐⭐ 關鍵修正：補齊所有津貼和扣款參數
    const salaryData = {
      // 基本資訊 (6 項)
      employeeId: safeString(params.employeeId),
      employeeName: safeString(params.employeeName),
      idNumber: safeString(params.idNumber),
      employeeType: safeString(params.employeeType) || '正職',
      salaryType: safeString(params.salaryType) || '月薪',
      baseSalary: safeNumber(params.baseSalary),
      
      // ⭐ 固定津貼（6 項）- 這是缺少的部分！
      positionAllowance: safeNumber(params.positionAllowance),
      mealAllowance: safeNumber(params.mealAllowance),
      transportAllowance: safeNumber(params.transportAllowance),
      attendanceBonus: safeNumber(params.attendanceBonus),
      performanceBonus: safeNumber(params.performanceBonus),
      otherAllowances: safeNumber(params.otherAllowances),
      
      // 銀行資訊 (4 項)
      bankCode: safeString(params.bankCode),
      bankAccount: safeString(params.bankAccount),
      hireDate: params.hireDate || new Date(),
      paymentDay: safeString(params.paymentDay) || '5',
      
      // 法定扣款 (6 項)
      pensionSelfRate: safeNumber(params.pensionSelfRate),
      laborFee: safeNumber(params.laborFee),
      healthFee: safeNumber(params.healthFee),
      employmentFee: safeNumber(params.employmentFee),
      pensionSelf: safeNumber(params.pensionSelf),
      incomeTax: safeNumber(params.incomeTax),
      
      // ⭐ 其他扣款（4 項）
      welfareFee: safeNumber(params.welfareFee),
      dormitoryFee: safeNumber(params.dormitoryFee),
      groupInsurance: safeNumber(params.groupInsurance),
      otherDeductions: safeNumber(params.otherDeductions),
      
      // 備註
      note: safeString(params.note),
      
      // 自訂津貼／扣款金額（JSON 字串，setEmployeeSalaryTW 會自己解析與正規化）
      customItems: params.customItems
    };
    
    Logger.log('');
    Logger.log(' 組裝後的 salaryData:');
    Logger.log('   基本薪資: ' + salaryData.baseSalary);
    Logger.log('   職務加給: ' + salaryData.positionAllowance);
    Logger.log('   伙食費: ' + salaryData.mealAllowance);
    Logger.log('   交通補助: ' + salaryData.transportAllowance);
    Logger.log('   全勤獎金: ' + salaryData.attendanceBonus);
    Logger.log('   業績獎金: ' + salaryData.performanceBonus);
    Logger.log('   其他津貼: ' + salaryData.otherAllowances);
    Logger.log('   銀行代碼: ' + salaryData.bankCode);
    Logger.log('   銀行帳號: ' + salaryData.bankAccount);
    Logger.log('   福利金: ' + salaryData.welfareFee);
    Logger.log('   宿舍費用: ' + salaryData.dormitoryFee);
    Logger.log('   團保費用: ' + salaryData.groupInsurance);
    Logger.log('   其他扣款: ' + salaryData.otherDeductions);
    
    // 驗證必填欄位
    if (!salaryData.employeeId || !salaryData.employeeName || salaryData.baseSalary <= 0) {
      Logger.log(' 必填欄位驗證失敗');
      return { ok: false, msg: "必填欄位不完整或無效" };
    }
    
    Logger.log(' 開始儲存薪資設定...');
    
    // 呼叫核心函數
    const result = setEmployeeSalaryTW(salaryData);
    
    Logger.log(' 儲存結果: ' + result.success);
    Logger.log('   訊息: ' + result.message);
    Logger.log('═══════════════════════════════════════');
    
    return { 
      ok: result.success, 
      msg: result.message,
      data: result 
    };
    
  } catch (error) {
    Logger.log(' 發生嚴重錯誤');
    Logger.log('錯誤訊息: ' + error.message);
    Logger.log('錯誤堆疊: ' + error.stack);
    Logger.log('═══════════════════════════════════════');
    
    return { 
      ok: false, 
      msg: `設定失敗: ${error.message}`,
      error: error.stack
    };
  }
}

// 診斷測試腳本 - 完整版

/**
 *  處理取得員工薪資
 */
function handleGetEmployeeSalaryTW(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權" };
    }
    
    if (!params.employeeId) {
      return { ok: false, msg: "缺少員工ID" };
    }
    
    const result = getEmployeeSalaryTW(params.employeeId);
    return { ok: result.success, data: result.data, msg: result.message };
    
  } catch (error) {
    Logger.log(' handleGetEmployeeSalaryTW 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

// Handlers.gs - handleGetMySalary 完全修正版（修復 userId = null 問題）

//  最終修正版 - 使用 Logger.log 而不是 console.log



/**
 *  處理取得我的薪資（最終修正版 - 使用 Logger.log）
 */
function handleGetMySalary(params) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' handleGetMySalary 開始');
    Logger.log('═══════════════════════════════════════');
    
    // ⭐ 步驟 1：檢查參數
    if (!params || !params.token) {
      Logger.log(' 缺少 token');
      return { ok: false, msg: "缺少 token" };
    }
    
    Logger.log(' 收到的參數:');
    Logger.log('   - token: ' + params.token.substring(0, 20) + '...');
    Logger.log('   - yearMonth: ' + (params.yearMonth || '缺少'));
    Logger.log('');
    
    // ⭐ 步驟 2：驗證 Session
    Logger.log(' 驗證 Session...');
    const session = checkSession_(params.token);
    
    Logger.log(' Session 檢查結果:');
    Logger.log('   - ok: ' + session.ok);
    Logger.log('   - code: ' + (session.code || '無'));
    
    if (!session.ok) {
      Logger.log(' Session 無效');
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    // ⭐ 步驟 3：檢查並取得 user 物件
    if (!session.user) {
      Logger.log(' Session 中沒有 user 資訊');
      return { ok: false, msg: "無法取得使用者資訊" };
    }
    
    Logger.log(' 使用者資訊:');
    Logger.log('   - userId: ' + (session.user.userId || 'undefined'));
    Logger.log('   - employeeId: ' + (session.user.employeeId || 'undefined'));
    Logger.log('   - name: ' + (session.user.name || 'undefined'));
    Logger.log('   - dept: ' + (session.user.dept || 'undefined'));
    Logger.log('');
    
    // ⭐⭐⭐ 關鍵修正：確保正確取得 employeeId
    let employeeId = null;
    
    // 優先順序：userId > employeeId > id
    if (session.user.userId) {
      employeeId = String(session.user.userId).trim();
      Logger.log(' 從 session.user.userId 取得: ' + employeeId);
    } else if (session.user.employeeId) {
      employeeId = String(session.user.employeeId).trim();
      Logger.log(' 從 session.user.employeeId 取得: ' + employeeId);
    } else if (session.user.id) {
      employeeId = String(session.user.id).trim();
      Logger.log(' 從 session.user.id 取得: ' + employeeId);
    }
    
    if (!employeeId || employeeId === 'null' || employeeId === 'undefined') {
      Logger.log(' 無法取得有效的員工ID');
      Logger.log('   完整 user 物件: ' + JSON.stringify(session.user));
      return { ok: false, msg: "無法取得員工ID" };
    }
    
    Logger.log(' 最終員工ID: ' + employeeId);
    Logger.log('');
    
    // ⭐ 步驟 4：檢查 yearMonth
    if (!params.yearMonth) {
      Logger.log(' 缺少 yearMonth 參數');
      return { ok: false, msg: "缺少年月參數" };
    }
    
    // 正規化 yearMonth（確保格式為 yyyy-MM）
    let yearMonth = params.yearMonth;
    if (typeof yearMonth === 'string' && yearMonth.length > 7) {
      yearMonth = yearMonth.substring(0, 7);
    }
    
    Logger.log(' 查詢年月: ' + yearMonth);
    Logger.log('');
    Logger.log(' 開始查詢薪資...');
    Logger.log('   employeeId: ' + employeeId);
    Logger.log('   yearMonth: ' + yearMonth);
    Logger.log('');
    
    // ⭐ 步驟 5：呼叫核心查詢函數
    const result = getMySalary(employeeId, yearMonth);
    
    Logger.log('');
    Logger.log(' 查詢結果:');
    Logger.log('   - success: ' + result.success);
    Logger.log('   - message: ' + (result.message || result.msg || '無'));
    
    if (result.success && result.data) {
      Logger.log('   - 有資料: 是');
      Logger.log('   - 薪資單ID: ' + result.data['薪資單ID']);
      Logger.log('   - 員工姓名: ' + result.data['員工姓名']);
      Logger.log('   - 實發金額: ' + result.data['實發金額']);
    } else {
      Logger.log('   - 有資料: 否');
    }
    
    Logger.log('═══════════════════════════════════════');
    
    // ⭐ 步驟 6：返回結果（統一格式）
    return { 
      ok: result.success,
      success: result.success, // 向後相容
      data: result.data, 
      msg: result.message || result.msg || (result.success ? '查詢成功' : '查無資料')
    };
    
  } catch (error) {
    Logger.log('');
    Logger.log(' 發生錯誤');
    Logger.log('錯誤訊息: ' + error.message);
    Logger.log('錯誤堆疊: ' + error.stack);
    Logger.log('═══════════════════════════════════════');
    
    return { 
      ok: false, 
      success: false,
      msg: '查詢失敗: ' + error.message,
      error: error.stack
    };
  }
}

/**
 *  處理取得我的薪資歷史（修正版）
 */
function handleGetMySalaryHistory(params) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' handleGetMySalaryHistory 開始');
    Logger.log('═══════════════════════════════════════');
    
    if (!params.token) {
      Logger.log(' 缺少 token');
      return { ok: false, msg: "缺少 token" };
    }
    
    Logger.log(' 驗證 Session...');
    const session = checkSession_(params.token);
    
    if (!session.ok || !session.user) {
      Logger.log(' Session 無效');
      return { ok: false, msg: "未授權" };
    }
    
    Logger.log(' Session 有效');
    
    // 取得員工ID
    let employeeId = null;
    if (session.user.userId) {
      employeeId = String(session.user.userId).trim();
    } else if (session.user.employeeId) {
      employeeId = String(session.user.employeeId).trim();
    }
    
    if (!employeeId) {
      Logger.log(' 無法取得員工ID');
      return { ok: false, msg: "無法取得員工ID" };
    }
    
    Logger.log(' 員工ID: ' + employeeId);
    
    const limit = parseInt(params.limit) || 12;
    Logger.log(' 查詢筆數限制: ' + limit);
    
    const result = getMySalaryHistory(employeeId, limit);
    
    Logger.log(' 查詢結果:');
    Logger.log('   - success: ' + result.success);
    Logger.log('   - total: ' + (result.total || 0));
    Logger.log('═══════════════════════════════════════');
    
    return { 
      ok: result.success, 
      data: result.data,
      total: result.total,
      msg: result.message 
    };
    
  } catch (error) {
    Logger.log(' handleGetMySalaryHistory 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

function manualTestGetMySalary() {
  Logger.log(' 手動測試 getMySalary');
  Logger.log('');
  
  const token = '04fd1452-4aca-4b03-ad17-45f03144c6ff';
  const yearMonth = '2025-11';
  
  Logger.log(' Step 1: 檢查 Session');
  const session = checkSession_(token);
  Logger.log('Session 結果: ' + JSON.stringify(session, null, 2));
  
  if (!session.ok) {
    Logger.log(' Session 無效');
    return;
  }
  
  Logger.log('');
  Logger.log(' Step 2: 取得 userId');
  const userId = session.user.userId;
  Logger.log('userId: ' + userId);
  Logger.log('userId 型別: ' + typeof userId);
  
  if (!userId) {
    Logger.log(' userId 是 null 或 undefined');
    return;
  }
  
  Logger.log('');
  Logger.log(' Step 3: 呼叫 getMySalary');
  const result = getMySalary(userId, yearMonth);
  
  Logger.log('');
  Logger.log(' 最終結果:');
  Logger.log(JSON.stringify(result, null, 2));
  
  if (result.success) {
    Logger.log('');
    Logger.log(' 成功！');
  } else {
    Logger.log('');
    Logger.log(' 失敗');
  }
}

/**
 *  處理計算月薪
 */
function handleCalculateMonthlySalary(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    if (!params.employeeId) {
      return { ok: false, msg: "缺少員工ID" };
    }
    
    if (!params.yearMonth) {
      return { ok: false, msg: "缺少年月參數" };
    }
    
    Logger.log(' 計算月薪: ' + params.employeeId + ', ' + params.yearMonth);
    
    const result = calculateMonthlySalary(params.employeeId, params.yearMonth);
    
    return { 
      ok: result.success, 
      data: result.data, 
      msg: result.message 
    };
    
  } catch (error) {
    Logger.log(' handleCalculateMonthlySalary 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

/**
 *  處理儲存月薪記錄
 */
function handleSaveMonthlySalary(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    Logger.log(' 儲存月薪資單');
    
    let salaryData;
    if (params.data) {
      if (typeof params.data === 'string') {
        try {
          salaryData = JSON.parse(decodeURIComponent(params.data));
        } catch (e) {
          Logger.log(' 解析 data 參數失敗: ' + e);
          return { ok: false, msg: "資料格式錯誤" };
        }
      } else {
        salaryData = params.data;
      }
    } else {
      salaryData = {
        employeeId: params.employeeId,
        employeeName: params.employeeName,
        yearMonth: params.yearMonth,
        baseSalary: params.baseSalary,
        weekdayOvertimePay: params.weekdayOvertimePay,
        restdayOvertimePay: params.restdayOvertimePay,
        holidayOvertimePay: params.holidayOvertimePay,
        laborFee: params.laborFee,
        healthFee: params.healthFee,
        employmentFee: params.employmentFee,
        pensionSelf: params.pensionSelf,
        incomeTax: params.incomeTax,
        leaveDeduction: params.leaveDeduction,
        grossSalary: params.grossSalary,
        netSalary: params.netSalary,
        bankCode: params.bankCode,
        bankAccount: params.bankAccount
      };
    }
    
    const result = saveMonthlySalary(salaryData);
    
    return { 
      ok: result.success, 
      msg: result.message,
      salaryId: result.salaryId
    };
    
  } catch (error) {
    Logger.log(' handleSaveMonthlySalary 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

/**
 *  處理取得所有員工薪資列表
 */
function handleGetAllMonthlySalary(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權" };
    }
    
    const result = getAllMonthlySalary(params.yearMonth);
    return { ok: result.success, data: result.data, msg: result.message };
    
  } catch (error) {
    Logger.log(' handleGetAllMonthlySalary 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

/**
 *  從 Session 取得員工ID的輔助函數
 */
function getUserIdFromSession(token) {
  try {
    const session = checkSession_(token);
    if (session.ok && session.user) {
      return session.user.userId || session.user.employeeId;
    }
    return null;
  } catch (error) {
    Logger.log(' getUserIdFromSession 錯誤: ' + error);
    return null;
  }
}

// ==================== 測試函數 ====================

// DailySalaryHandlers.gs - 日薪系統 Handler 函數

/**
 *  處理設定日薪員工
 */
function handleSetDailyEmployee(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    const employeeData = {
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      bloodType: params.bloodType,
      phone: params.phone,
      birthDate: params.birthDate,
      emergencyContact: params.emergencyContact,
      emergencyPhone: params.emergencyPhone,
      address: params.address,
      dailySalary: parseFloat(params.dailySalary) || 0,
      overtimeHourlyRate: parseFloat(params.overtimeHourlyRate) || 0,
      mealAllowancePerDay: parseFloat(params.mealAllowancePerDay) || 0,
      drivingAllowance: parseFloat(params.drivingAllowance) || 0,
      positionAllowance: parseFloat(params.positionAllowance) || 0,
      housingAllowance: parseFloat(params.housingAllowance) || 0,
      laborFee: parseFloat(params.laborFee) || 0,
      healthFee: parseFloat(params.healthFee) || 0,
      dependentHealthFee: parseFloat(params.dependentHealthFee) || 0,
      bankCode: params.bankCode,
      bankAccount: params.bankAccount,
      note: params.note
    };
    
    if (!employeeData.employeeId || !employeeData.employeeName) {
      return { ok: false, msg: "必填欄位不完整" };
    }
    
    const result = setDailyEmployee(employeeData);
    return { 
      ok: result.success, 
      msg: result.message,
      data: result 
    };
    
  } catch (error) {
    Logger.log(' handleSetDailyEmployee 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

/**
 *  處理取得日薪員工資料
 */
function handleGetDailyEmployee(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權" };
    }
    
    if (!params.employeeId) {
      return { ok: false, msg: "缺少員工ID" };
    }
    
    const result = getDailyEmployee(params.employeeId);
    return { ok: result.success, data: result.data, msg: result.message };
    
  } catch (error) {
    return { ok: false, msg: error.message };
  }
}


function handleCalculateDailySalary(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    if (!params.employeeId || !params.yearMonth) {
      return { ok: false, msg: "缺少必要參數" };
    }
    
    Logger.log(' 處理日薪計算請求');
    Logger.log('   員工ID: ' + params.employeeId);
    Logger.log('   年月: ' + params.yearMonth);
    
    //  關鍵修正：組裝手動輸入的參數
    const manualInputs = {
      workDays: parseFloat(params.workDays) || 0,
      overtimeHours: parseFloat(params.overtimeHours) || 0,
      leaveDeduction: parseFloat(params.leaveDeduction) || 0,
      advancePayment: parseFloat(params.advancePayment) || 0,
      agencyDeduction: parseFloat(params.agencyDeduction) || 0,
      otherDeduction: parseFloat(params.otherDeduction) || 0,
      fineDeduction: parseFloat(params.fineDeduction) || 0
    };
    
    Logger.log(' 手動輸入參數:');
    Logger.log('   上班天數: ' + manualInputs.workDays);
    Logger.log('   加班時數: ' + manualInputs.overtimeHours);
    Logger.log('   請假扣款: ' + manualInputs.leaveDeduction);
    
    //  傳遞第三個參數給核心函數
    const result = calculateDailySalary(
      params.employeeId, 
      params.yearMonth,
      manualInputs  // ⭐ 傳遞手動輸入
    );
    
    Logger.log(' 計算結果: ' + result.success);
    
    return { 
      ok: result.success, 
      data: result.data, 
      msg: result.message 
    };
    
  } catch (error) {
    Logger.log(' handleCalculateDailySalary 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

/**
 *  處理儲存日薪記錄（保持不變）
 */
function handleSaveDailySalaryRecord(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    let salaryData;
    if (params.data) {
      if (typeof params.data === 'string') {
        try {
          salaryData = JSON.parse(decodeURIComponent(params.data));
        } catch (e) {
          return { ok: false, msg: "資料格式錯誤" };
        }
      } else {
        salaryData = params.data;
      }
    } else {
      return { ok: false, msg: "缺少薪資資料" };
    }
    
    const result = saveDailySalaryRecord(salaryData);
    return { 
      ok: result.success, 
      msg: result.message,
      calculationId: result.calculationId
    };
    
  } catch (error) {
    Logger.log(' handleSaveDailySalaryRecord 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

/**
 *  處理取得所有日薪員工（保持不變）
 */
function handleGetAllDailyEmployees(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權" };
    }
    
    const result = getAllDailyEmployees();
    return { ok: result.success, data: result.data, total: result.total, msg: result.message };
    
  } catch (error) {
    return { ok: false, msg: error.message };
  }
}

/**
 *  處理取得日薪計算記錄（保持不變）
 */
function handleGetDailySalaryRecords(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權" };
    }
    
    const result = getDailySalaryRecords(params.yearMonth);
    return { ok: result.success, data: result.data, total: result.total, msg: result.message };
    
  } catch (error) {
    return { ok: false, msg: error.message };
  }
}

/**
 *  處理 initApp（合併 checkSession 和 getAbnormalRecords）
 */
function handleInitApp(params) {
  try {
    const sessionToken = params.token;
    
    if (!sessionToken) {
      return { ok: false, code: "MISSING_SESSION_TOKEN" };
    }
    
    // 1. 檢查 Session
    const session = checkSession_(sessionToken);
    
    if (!session.ok) {
      return { ok: false, code: session.code };
    }
    
    // 2. 取得異常記錄
    const now = new Date();
    const month = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const userId = session.user.userId;
    
    const records = getAttendanceRecords(month, userId);
    const abnormalResults = checkAttendanceAbnormal(records);
    
    //  3. 取得加班記錄（新增）
    const overtimeRecords = getApprovedOvertimeRecords(userId, month);
    
    //  4. 將加班記錄加入異常記錄陣列
    overtimeRecords.forEach(ot => {
      abnormalResults.push({
        date: ot.date,
        reason: 'STATUS_OVERTIME_APPROVED',
        punchTypes: null,
        overtime: {
          startTime: ot.startTime,
          endTime: ot.endTime,
          hours: ot.hours,
          reason: ot.reason
        }
      });
    });
    
    // 5. 返回合併結果
    return {
      ok: true,
      user: session.user,
      code: session.code,
      params: session.params,
      abnormalRecords: abnormalResults  // 現在包含打卡異常 + 加班記錄
    };
    
  } catch (error) {
    Logger.log(' handleInitApp 錯誤: ' + error);
    return { ok: false, code: "INTERNAL_ERROR", msg: error.message };
  }
}
// function handleInitApp(params) {
//   try {
//     const sessionToken = params.token;
    
//     if (!sessionToken) {
//       return { ok: false, code: "MISSING_SESSION_TOKEN" };
//     }
    
//     // 1. 檢查 Session
//     const session = checkSession_(sessionToken);
    
//     if (!session.ok) {
//       return { ok: false, code: session.code };
//     }
    
//     // 2. 取得異常記錄
//     const now = new Date();
//     const month = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
//     const userId = session.user.userId;
    
//     const records = getAttendanceRecords(month, userId);
//     const abnormalResults = checkAttendanceAbnormal(records);
    
//     // 3. 返回合併結果
//     return {
//       ok: true,
//       user: session.user,
//       code: session.code,
//       params: session.params,
//       abnormalRecords: abnormalResults
//     };
    
//   } catch (error) {
//     Logger.log(' handleInitApp 錯誤: ' + error);
//     return { ok: false, code: "INTERNAL_ERROR", msg: error.message };
//   }
// }


/**
 * 處理取得員工月度打卡分析資料
 */
function handleGetEmployeeMonthlyPunchData(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    // 驗證管理員權限
    const session = checkSession_(params.token);
    if (!session.ok || session.user.dept !== '管理員') {
      return { ok: false, msg: "需要管理員權限" };
    }
    
    if (!params.employeeId || !params.yearMonth) {
      return { ok: false, msg: "缺少必要參數" };
    }
    
    const result = getEmployeeMonthlyPunchData(params.employeeId, params.yearMonth);
    
    return {
      ok: result.success,
      data: result.data,
      msg: result.message || '查詢成功',
      employeeId: result.employeeId,
      yearMonth: result.yearMonth,
      totalDays: result.totalDays
    };
    
  } catch (error) {
    Logger.log(' handleGetEmployeeMonthlyPunchData 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}


/**
 *  取得員工本月打卡記錄（前端專用）
 */
function handleGetEmployeeMonthlyAttendance(params) {
  try {
    const employee = checkSession_(params.token);
    const user = employee.user;
    if (!user) return { ok: false, code: "ERR_SESSION_INVALID" };
    
    const yearMonth = params.yearMonth;
    if (!yearMonth) {
      return { ok: false, message: "缺少年月參數" };
    }
    
    Logger.log(` 員工 ${user.name} 查詢 ${yearMonth} 打卡記錄`);
    
    // 以前呼叫的是 getEmployeeMonthlyAttendance()：那支不收參數、回傳的是 ContentService 物件，
    // 前端拿到的 records 永遠是空的，薪資頁的「每日工時明細」一直顯示沒有資料
    const records = getEmployeeMonthlyAttendanceInternal(user.userId, yearMonth);
    
    return {
      ok: true,
      records: records
    };
    
  } catch (error) {
    Logger.log(" 取得打卡記錄失敗: " + error);
    return { ok: false, message: error.toString() };
  }
}

/**
 *  取得員工本月加班記錄（前端專用）
 */
function handleGetEmployeeMonthlyOvertime(params) {
  try {
    const employee = checkSession_(params.token);
    const user = employee.user;
    if (!user) return { ok: false, code: "ERR_SESSION_INVALID" };
    
    const yearMonth = params.yearMonth;
    if (!yearMonth) {
      return { ok: false, message: "缺少年月參數" };
    }
    
    Logger.log(` 員工 ${user.name} 查詢 ${yearMonth} 加班記錄`);
    
    const records = getEmployeeMonthlyOvertime(user.userId, yearMonth);
    
    return {
      ok: true,
      records: records
    };
    
  } catch (error) {
    Logger.log(" 取得加班記錄失敗: " + error);
    return { ok: false, message: error.toString() };
  }
}

/**
 * 取得所有公告
 */
function handleGetAnnouncements(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('公告');
    
    // 如果工作表不存在,建立它
    if (!sheet) {
      sheet = ss.insertSheet('公告');
      sheet.appendRow(['ID', '標題', '內容', '優先級', '建立時間']);
    }
    
    const data = sheet.getDataRange().getValues();
    const announcements = [];
    
    // 跳過標題列
    for (let i = 1; i < data.length; i++) {
      announcements.push({
        id: data[i][0],
        title: data[i][1],
        content: data[i][2],
        priority: data[i][3],
        createdAt: data[i][4]
      });
    }
    
    // 按時間排序 (最新在前)
    announcements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return { ok: true, announcements: announcements };
    
  } catch (error) {
    return { ok: false, msg: error.toString() };
  }
}

/**
 * 新增公告 (僅管理員)
 */
function handleAddAnnouncement(params) {
  try {
    //  驗證管理員權限
    const user = getUserByToken(params.token);
    if (!user || user.dept !== '管理員') {
      return { ok: false, msg: '無權限' };
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('公告');
    
    if (!sheet) {
      sheet = ss.insertSheet('公告');
      sheet.appendRow(['ID', '標題', '內容', '優先級', '建立時間']);
    }
    
    const id = Date.now().toString();
    const title = params.title;
    const content = params.content;
    const priority = params.priority || 'normal';
    const createdAt = new Date().toISOString();
    
    sheet.appendRow([id, title, content, priority, createdAt]);
    
    return {
      ok: true,
      announcement: { id, title, content, priority, createdAt }
    };
    
  } catch (error) {
    return { ok: false, msg: error.toString() };
  }
}
/**
 * 刪除公告 (僅管理員) - 修正版
 */
function handleDeleteAnnouncement(params) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 開始刪除公告');
    Logger.log('   收到的 ID: ' + params.id);
    Logger.log('   ID 型別: ' + typeof params.id);
    
    const user = getUserByToken(params.token);
    if (!user || user.dept !== '管理員') {
      Logger.log(' 無權限');
      return { ok: false, msg: '無權限' };
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('公告');
    
    if (!sheet) {
      Logger.log(' 工作表不存在');
      return { ok: false, msg: '工作表不存在' };
    }
    
    const data = sheet.getDataRange().getValues();
    const announcementId = String(params.id);  // ⭐⭐⭐ 強制轉為字串
    
    Logger.log('   轉換後的 ID: ' + announcementId);
    Logger.log('   工作表總行數: ' + data.length);
    Logger.log('');
    
    // 找到對應的列
    for (let i = 1; i < data.length; i++) {
      const rowId = String(data[i][0]);  // ⭐⭐⭐ 也轉為字串
      
      Logger.log(`   檢查第 ${i + 1} 行: ID = "${rowId}"`);
      
      if (rowId === announcementId) {
        Logger.log(`    找到匹配！刪除第 ${i + 1} 行`);
        sheet.deleteRow(i + 1);
        Logger.log('═══════════════════════════════════════');
        return { ok: true, msg: '公告已刪除' };
      }
    }
    
    Logger.log('    沒有找到匹配的 ID');
    Logger.log('');
    Logger.log(' 工作表中所有的 ID:');
    for (let i = 1; i < data.length; i++) {
      Logger.log(`   - "${data[i][0]}" (${typeof data[i][0]})`);
    }
    Logger.log('═══════════════════════════════════════');
    
    return { ok: false, msg: '找不到公告' };
    
  } catch (error) {
    Logger.log(' 錯誤: ' + error);
    Logger.log('═══════════════════════════════════════');
    return { ok: false, msg: error.toString() };
  }
}


// ==================== 員工基本資料 Handler ====================

/**
 *  處理設定員工基本資料（員工自己填寫版）
 */
function handleSetEmployeeBasicInfo(params) {
  try {
    Logger.log(' 處理設定員工基本資料請求（員工自填）');
    
    // ⭐ 驗證 Session（所有員工都可以使用）
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    // ⭐ 從 Session 取得當前使用者資訊
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, msg: '無法取得使用者資訊' };
    }
    
    const currentUser = session.user;
    
    Logger.log(' 當前使用者: ' + currentUser.name);
    Logger.log('   userId: ' + currentUser.userId);
    
    // 姓名由員工自己填（真實姓名）。存檔後同步成系統上顯示的名字，並鎖定不再被 LINE 名稱覆蓋
    const realName = String(params.name || '').trim();
    if (realName.length < 2 || realName.length > 50) {
      return { ok: false, code: 'NOTIF_NAME_TOO_SHORT', msg: '姓名需為 2～50 個字' };
    }
    if (/[<>]/.test(realName)) {
      return { ok: false, code: 'REAL_NAME_INVALID_CHARS', msg: '姓名不能包含 < 或 > 符號' };
    }

    // ⭐⭐⭐ 關鍵修正：使用當前使用者的 ID，不從前端接收
    const employeeData = {
      employeeId: currentUser.userId,        // 自動使用登入者的 ID
      employeeName: realName,
      idNumber: params.idNumber,             // 從前端接收
      address: params.address,               // 從前端接收
      phone: params.phone,                   // 從前端接收
      birthDate: params.birthDate            // 從前端接收
    };
    
    Logger.log(' 準備儲存資料:');
    Logger.log('   員工ID: ' + employeeData.employeeId);
    Logger.log('   姓名: ' + employeeData.employeeName);
    Logger.log('   身分證: ' + (employeeData.idNumber || '未填'));
    Logger.log('   地址: ' + (employeeData.address || '未填'));
    
    const result = setEmployeeBasicInfo(employeeData);
    
    if (result.success && realName !== currentUser.name) {
      const renamed = updateEmployeeName(currentUser.userId, realName);
      if (!renamed.ok) {
        return { ok: false, msg: renamed.msg || '姓名更新失敗' };
      }
    }
    
    return {
      ok: result.success,
      msg: result.message,
      name: realName
    };
    
  } catch (error) {
    Logger.log(' handleSetEmployeeBasicInfo 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}
/**
 *  處理取得員工基本資料（查詢自己的資料）
 */
function handleGetEmployeeBasicInfo(params) {
  try {
    Logger.log(' 處理查詢員工基本資料請求');
    
    // 驗證 Session
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    // ⭐ 從 Session 取得當前使用者
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, msg: '無法取得使用者資訊' };
    }
    
    const currentUser = session.user;
    
    Logger.log(' 查詢員工: ' + currentUser.name);
    
    // ⭐⭐⭐ 只能查詢自己的資料
    const result = getEmployeeBasicInfo(currentUser.userId);
    
    // 還沒填過也回傳目前的姓名，表單才有預設值
    return {
      ok: result.success,
      data: result.data,
      msg: result.message,
      currentName: currentUser.name
    };
    
  } catch (error) {
    Logger.log(' handleGetEmployeeBasicInfo 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

/**
 *  處理取得所有員工基本資料
 */
function handleGetAllEmployeeBasicInfo(params) {
  try {
    Logger.log(' 處理取得所有員工基本資料請求');
    
    // 驗證 Session
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    // 驗證管理員權限
    const session = checkSession_(params.token);
    if (!session.ok || !session.user || session.user.dept !== '管理員') {
      return { ok: false, msg: '需要管理員權限' };
    }
    
    const result = getAllEmployeeBasicInfo();
    
    return {
      ok: result.success,
      data: result.data,
      total: result.total,
      msg: result.message
    };
    
  } catch (error) {
    Logger.log(' handleGetAllEmployeeBasicInfo 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

/**
 *  處理刪除員工基本資料
 */
function handleDeleteEmployeeBasicInfo(params) {
  try {
    Logger.log(' 處理刪除員工基本資料請求');
    
    // 驗證 Session
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, msg: "未授權或 session 已過期" };
    }
    
    // 驗證管理員權限
    const session = checkSession_(params.token);
    if (!session.ok || !session.user || session.user.dept !== '管理員') {
      return { ok: false, msg: '需要管理員權限' };
    }
    
    if (!params.employeeId) {
      return { ok: false, msg: '缺少員工ID' };
    }
    
    const result = deleteEmployeeBasicInfo(params.employeeId);
    
    return {
      ok: result.success,
      msg: result.message
    };
    
  } catch (error) {
    Logger.log(' handleDeleteEmployeeBasicInfo 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}

// ==================== 2. 新增權限檢查函數 ====================

// ==================== QR 打卡 Handler ====================

/**
 * 員工使用 QR Code 打卡
 */
function handleQRPunch(params) {
  try {
    if (!params.token || !validateSession(params.token)) {
      return { ok: false, code: 'ERR_SESSION_INVALID', msg: '請先登入再掃描 QR Code' };
    }
    if (!params.qrToken) {
      return { ok: false, msg: '缺少 QR Token 參數' };
    }
    return qrPunch(params.token, params.qrToken, params.loc || '');
  } catch (error) {
    Logger.log('handleQRPunch 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}
/**
 *  取得員工當月總工作時數（前端 getEmployeeWorkHours 用）
 *
 * 原本 Main.gs 路由指到 handleGetEmployeeWorkHours()，但這支函式從來沒被寫出來，
 * 呼叫這個 action 會直接丟 ReferenceError。另一支 getEmployeeWorkHoursAPI() 依賴
 * 並不存在的 getParam()，同樣不能用，所以這裡按照前端期待的格式重寫一份。
 */
function handleGetEmployeeWorkHours(params) {
  try {
    const session = checkSession_(params.token);
    const user = session.user;
    if (!user) return { ok: false, code: "ERR_SESSION_INVALID", msg: "未授權或 session 已過期" };

    const yearMonth = params.yearMonth;
    if (!yearMonth) {
      return { ok: false, code: "MISSING_YEAR_MONTH", msg: "缺少年月參數" };
    }

    // 管理員可以查別人，員工只能查自己
    const isAdmin = (user.dept === '管理員');
    const employeeId = (isAdmin && params.employeeId) ? params.employeeId : user.userId;

    const attendanceRecords = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
    const result = calculateEmployeeWorkHours(employeeId, yearMonth);

    if (!result.success) {
      return { ok: false, msg: result.message || '計算工時失敗' };
    }

    // 有算出工時的日子才算一個工作天
    const workDays = attendanceRecords.filter(record => record.workHours > 0).length;

    return {
      ok: true,
      data: {
        employeeId: employeeId,
        yearMonth: yearMonth,
        totalWorkHours: Math.round(result.totalWorkHours * 100) / 100,
        workDays: workDays
      }
    };

  } catch (error) {
    Logger.log(' handleGetEmployeeWorkHours 錯誤: ' + error);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * 檢查是否有排班權限（管理員或排班人員）
 */
function checkSchedulingPermission(token) {
  try {
    const session = checkSession_(token);
    
    if (!session.ok || !session.user) {
      return { ok: false, msg: '未授權或 session 已過期' };
    }
    
    const userRole = session.user.dept;  // 從部門欄位取得角色
    
    // 允許管理員和排班人員
    if (userRole === '管理員' || userRole === '排班人員') {
      return { ok: true, user: session.user };
    }
    
    return { ok: false, msg: '權限不足：需要管理員或排班人員權限' };

  } catch (error) {
    Logger.log(' checkSchedulingPermission 錯誤: ' + error);
    return { ok: false, msg: error.message };
  }
}
