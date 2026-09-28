// Main.gs - 完整版（含打卡、加班、請假、排班系統）

// 路由層的權限關卡。這幾支 handler 自己沒有檢查權限（有的連登入都不用），
// 統一在這裡擋，handler 就算以後被改動也不會漏掉。
//   'admin'          只有管理員
//   { self: 參數名 }  管理員，或是查詢／操作自己的資料（參數值等於自己的 userId）
const ROUTE_ACCESS = {
  getReviewRequest: 'admin',
  approveReview: 'admin',
  rejectReview: 'admin',
  addLocation: 'admin',
  updateEmployeeName: 'admin',
  getEmployeeSalaryTW: 'admin',
  setEmployeeSalaryTW: 'admin',
  saveMonthlySalary: 'admin',
  getAllMonthlySalary: 'admin',
  setDailyEmployee: 'admin',
  getDailyEmployee: 'admin',
  getAllDailyEmployees: 'admin',
  calculateDailySalary: 'admin',
  saveDailySalaryRecord: 'admin',
  getDailySalaryRecords: 'admin',
  calculateMonthlySalary: { self: 'employeeId' },
  getAttendanceDetails: { self: 'userId' },
  getAbnormalRecords: { self: 'userId' },
  getPendingExpenses: 'admin',
  reviewExpense: 'admin',
  createQrToken: 'admin',
  resetKioskKey: 'admin',
  disableKiosk: 'admin',
  getKioskStatus: 'admin',
  saveShiftTemplates: 'admin',
  savePayrollAdjustments: 'admin'
};

/**
 * 檢查這次請求有沒有權限。通過時回傳 { ok: true, user }（不需檢查的 action，user 為 null）
 */
function checkRouteAccess_(action, params) {
  const rule = ROUTE_ACCESS[action];
  if (!rule) return { ok: true, user: null };

  const session = checkSession_(params.token);
  if (!session.ok || !session.user) {
    return { ok: false, error: { ok: false, code: 'ERR_SESSION_INVALID', msg: '未授權或 session 已過期' } };
  }

  const user = session.user;
  if (user.dept === '管理員') return { ok: true, user: user };

  if (rule !== 'admin' && rule.self) {
    const requested = String(params[rule.self] || '').trim();
    if (requested && requested === user.userId) return { ok: true, user: user };
  }

  return { ok: false, error: { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' } };
}

// doGet(e) 負責處理所有外部請求
function doGet(e) {
  const action       = e.parameter.action;
  const callback     = e.parameter.callback || "callback";
  const sessionToken = e.parameter.token;
  const code         = e.parameter.otoken;

  // 讓深層的函式（例如薪資稽核記錄）能知道是誰發的請求，
  // 不必把 token 一路當參數傳下去。原本只有匯出 Excel 那一支會設。
  globalThis.currentRequest = e;

  // 通過權限關卡的使用者，寫操作記錄時直接沿用，不必再查一次 session
  let requestUser = null;

  function respond(obj) {
    logAdminAction_(action, e.parameter, obj, requestUser);
    return ContentService.createTextOutput(
      `${callback}(${JSON.stringify(obj)})`
    ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  
  function respond1(obj) {
    logAdminAction_(action, e.parameter, obj, requestUser);
    const output = ContentService.createTextOutput(JSON.stringify(obj));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }
  
  try {
    const access = checkRouteAccess_(action, e.parameter);
    if (!access.ok) return respond1(access.error);
    requestUser = access.user;

    switch (action) {
      // ==================== 登入與 Session ====================
      case "getProfile":
        return respond1(handleGetProfile(code));
      case "getLoginUrl":
        return respond1(handleGetLoginUrl());
      case "checkSession":
        return respond1(handleCheckSession(sessionToken));
      case "exchangeToken":
        return respond1(handleExchangeToken(e.parameter.otoken));
      
      // ==================== 打卡系統 ====================
      case "punch":
        return respond1(handlePunch(e.parameter));
      case "linePunch":
        return respond1(handleLinePunchWithToken(e.parameter));
      case "adjustPunch":
        return respond1(handleAdjustPunch(e.parameter));
      case "getAbnormalRecords":
        return respond1(handleGetAbnormalRecords(e.parameter));
      case "getAttendanceDetails":
        return respond1(handleGetAttendanceDetails(e.parameter));
      
      // ==================== 地點管理 ====================
      case "addLocation":
        return respond1(handleAddLocation(e.parameter));
      case "getLocations":
        return respond1(handleGetLocation());
      
      case "setEmployeeBasicInfo":
        return respond1(handleSetEmployeeBasicInfo(e.parameter));

      case "getEmployeeBasicInfo":
        return respond1(handleGetEmployeeBasicInfo(e.parameter));

      case "getAllEmployeeBasicInfo":
        return respond1(handleGetAllEmployeeBasicInfo(e.parameter));

      case "deleteEmployeeBasicInfo":
        return respond1(handleDeleteEmployeeBasicInfo(e.parameter));
      // ==================== 員工管理 ====================
      case "getAllUsers":
        return respond1(handleGetAllUsers(e.parameter));
      
      case "updateUserRole":
        return respond1(handleUpdateUserRole(e.parameter));
      case "deleteUser":
        return respond1(handleDeleteUser(e.parameter));
      
      case "updateEmployeeName":
        if (!validateSession(e.parameter.token)) {
          return respond1({ ok: false, code: "ERR_SESSION_INVALID" });
        }
        
        const targetUserId = e.parameter.userId;
        const newName = e.parameter.newName;
        
        if (!targetUserId || !newName) {
          return respond1({ ok: false, msg: "缺少必要參數" });
        }
        
        const updateNameResult = updateEmployeeName(targetUserId, newName);
        return respond1(updateNameResult);
      // ==================== 補打卡審核 ====================
      case "getReviewRequest":
        return respond1(handleGetReviewRequest());
      case "approveReview":
        return respond1(handleApproveReview(e.parameter));
      case "rejectReview":
        return respond1(handleRejectReview(e.parameter));
      
      // ==================== 加班系統 ====================
      case "submitOvertime":
        return respond1(handleSubmitOvertime(e.parameter));
      case "getEmployeeOvertime":
        return respond1(handleGetEmployeeOvertime(e.parameter));
      case "getPendingOvertime":
        return respond1(handleGetPendingOvertime(e.parameter));
      case "reviewOvertime":
        return respond1(handleReviewOvertime(e.parameter));
      
      // ==================== 請假系統 ====================
      case "getLeaveBalance":
        return respond1(handleGetLeaveBalance(e.parameter));
      case "submitLeave":
        return respond1(handleSubmitLeave(e.parameter));
      case "getEmployeeLeaveRecords":
        return respond1(handleGetEmployeeLeaveRecords(e.parameter));
      case "getPendingLeaveRequests":
        return respond1(handleGetPendingLeaveRequests(e.parameter));
      case "reviewLeave":
        return respond1(handleReviewLeave(e.parameter));
      case "initializeEmployeeLeave":
        return respond1(handleInitializeEmployeeLeave(e.parameter));
      
      // ==================== 工作日誌系統（⭐ 新增在這裡）====================
      case "submitWorklog":
        return respond1(handleSubmitWorklog(e.parameter));
      case "getWorklogs":
        return respond1(handleGetWorklogs(e.parameter));
      case "getWorklogDetail":
        return respond1(handleGetWorklogDetail(e.parameter));
      case "getPendingWorklogs":
        return respond1(handleGetPendingWorklogs(e.parameter));
      case "reviewWorklog":
        return respond1(handleReviewWorklog(e.parameter));
      case "getWorklogReport":
        return respond1(handleGetWorklogReport(e.parameter));
      case "getAllWorklogReport":  
        return respond1(handleGetAllWorklogReport(e.parameter));
      case "updateWorklog":
        return respond1(handleUpdateWorklog(e.parameter));
      case "deleteWorklog":
        return respond1(handleDeleteWorklog(e.parameter));
      // ==================== 排班系統 ====================
      case "addShift":
        return respond1(handleAddShift(e.parameter));
      case "batchAddShifts":
        return respond(handleBatchAddShifts(e.parameter));
      case "getShifts":
        return respond1(handleGetShifts(e.parameter));
      case "getShiftById":
        return respond1(handleGetShiftById(e.parameter));
      case "updateShift":
        return respond1(handleUpdateShift(e.parameter));
      case "deleteShift":
        return respond1(handleDeleteShift(e.parameter));
      case "getEmployeeShiftForDate":
        return respond1(handleGetEmployeeShiftForDate(e.parameter));
      case "getWeeklyShiftStats":
        return respond1(handleGetWeeklyShiftStats(e.parameter));
      case "exportShifts":
        return respond1(handleExportShifts(e.parameter));
      case "getShiftTemplates":
        return respond1(handleGetShiftTemplates(e.parameter));
      case "saveShiftTemplates":
        return respond1(handleSaveShiftTemplates(e.parameter));
      case "savePayrollAdjustments":
        return respond1(handleSavePayrollAdjustments(e.parameter));
      
      // ==================== 薪資系統 ====================
      case "setEmployeeSalaryTW":
        return respond1(handleSetEmployeeSalaryTW(e.parameter));
      case "getEmployeeSalaryTW":
        return respond1(handleGetEmployeeSalaryTW(e.parameter));
      case "getMySalary":
        return respond1(handleGetMySalary(e.parameter));
      case "getMySalaryHistory":
        return respond1(handleGetMySalaryHistory(e.parameter));
      case "calculateMonthlySalary":
        return respond1(handleCalculateMonthlySalary(e.parameter));
      case "getEmployeeWorkHours":
        return respond1(handleGetEmployeeWorkHours(e.parameter));
      // case "saveMonthlySalary":
      //   return respond1(handleSaveMonthlySalary(e.parameter));
      case "getAllMonthlySalary":
        return respond1(handleGetAllMonthlySalary(e.parameter));

      // ==================== 三節獎金系統 ====================
      case "setBonusRecord":
        return respond1(handleSetBonusRecord(e.parameter));
      case "getMyBonusRecords":
        return respond1(handleGetMyBonusRecords(e.parameter));
      case "getAllBonusRecords":
        return respond1(handleGetAllBonusRecords(e.parameter));

       // ==================== 日薪系統 ====================
      case "setDailyEmployee":
        return respond1(handleSetDailyEmployee(e.parameter));
      case "getDailyEmployee":
        return respond1(handleGetDailyEmployee(e.parameter));
      case "calculateDailySalary":
        return respond1(handleCalculateDailySalary(e.parameter));
      case "saveDailySalaryRecord":
        return respond1(handleSaveDailySalaryRecord(e.parameter));
      case "getAllDailyEmployees":
        return respond1(handleGetAllDailyEmployees(e.parameter));
      case "getDailySalaryRecords":
        return respond1(handleGetDailySalaryRecords(e.parameter));

      case "saveMonthlySalary":
        return saveMonthlySalaryAPI();

      case 'exportAllSalaryExcel':
        try {
          Logger.log(' 收到 exportAllSalaryExcel 请求');
          Logger.log('   action: ' + action);
          Logger.log('   token: ' + (e.parameter.token ? '有' : '无'));
          Logger.log('   yearMonth: ' + e.parameter.yearMonth);
          
          // ⭐ 验证 session
          if (!e.parameter.token) {
            Logger.log(' 缺少 token');
            return respond1({ 
              ok: false, 
              msg: '缺少 token',
              code: 'MISSING_TOKEN' 
            });
          }
          
          if (!validateSession(e.parameter.token)) {
            Logger.log(' token 验证失败');
            return respond1({ 
              ok: false, 
              msg: '未授權或 session 已過期',
              code: 'SESSION_INVALID' 
            });
          }
          
          Logger.log(' token 验证成功');
          
          const sessionResult = handleCheckSession(e.parameter.token);
          
          if (!sessionResult.ok || !sessionResult.user) {
            Logger.log(' 无法取得使用者资讯');
            return respond1({ 
              ok: false, 
              msg: 'Session 資料無效',
              code: 'SESSION_DATA_INVALID' 
            });
          }
          
          const user = sessionResult.user;
          Logger.log(' 使用者: ' + user.name);
          Logger.log(' 權限: ' + user.dept);
          
          if (user.dept !== '管理員') {
            Logger.log(' 权限不足');
            return respond1({ 
              ok: false, 
              msg: '此功能僅限管理員使用',
              code: 'PERMISSION_DENIED' 
            });
          }
          
          const yearMonth = e.parameter.yearMonth;
          if (!yearMonth) {
            Logger.log(' 缺少 yearMonth');
            return respond1({ 
              ok: false, 
              msg: '缺少年月參數',
              code: 'MISSING_YEAR_MONTH' 
            });
          }
          
          Logger.log(` 管理員 ${user.name} 請求匯出 ${yearMonth} 薪資總表`);
          
          
          // ⭐⭐⭐ 呼叫匯出函数（不傳參數）
          const result = exportAllSalaryExcel();
          
          Logger.log(' exportAllSalaryExcel 回传类型: ' + typeof result);
          
          // ⭐⭐⭐ 修正：result 是 ContentService 物件，需要解析
          try {
            const resultContent = result.getContent();
            const resultJson = JSON.parse(resultContent);
            
            Logger.log(' 解析後的結果: ' + JSON.stringify(resultJson));
            
            if (resultJson.ok) {
              return respond1({ 
                ok: true, 
                fileUrl: resultJson.data.fileUrl,
                fileName: resultJson.data.fileName,
                recordCount: resultJson.data.recordCount,
                msg: '匯出成功'
              });
            } else {
              return respond1({ 
                ok: false, 
                msg: resultJson.message || resultJson.msg || '匯出失敗'
              });
            }
          } catch (parseError) {
            Logger.log(' 解析結果失敗: ' + parseError);
            return respond1({ 
              ok: false, 
              msg: '結果解析失敗: ' + parseError.message 
            });
          }
          
        } catch (error) {
          Logger.log(' exportAllSalaryExcel 錯誤: ' + error);
          Logger.log(' 錯誤堆疊: ' + error.stack);
          return respond1({ 
            ok: false, 
            msg: '系統錯誤: ' + error.message 
          });
        }
        break;
      // 在 doGet(e) 的 switch 區塊中新增：
      case "getEmployeeMonthlyPunchData":
        return respond1(handleGetEmployeeMonthlyPunchData(e.parameter));
      case "getEmployeeMonthlyAttendance":
        return respond1(handleGetEmployeeMonthlyAttendance(e.parameter));
      case "getEmployeeMonthlyOvertime":
        return respond1(handleGetEmployeeMonthlyOvertime(e.parameter));
      
      // ==================== QR 打卡系統 ====================
      case "qrPunch":
        return respond1(handleQRPunch(e.parameter));
      case "createQrToken":
        return respond1(handleCreateQrToken(e.parameter));
      case "getKioskQr":
        return respond1(handleGetKioskQr(e.parameter));
      case "resetKioskKey":
        return respond1(handleResetKioskKey(e.parameter));
      case "disableKiosk":
        return respond1(handleDisableKiosk(e.parameter));
      case "getKioskStatus":
        return respond1(handleGetKioskStatus(e.parameter));

      // ==================== 系統設定 ====================
      case "getWorkSchedule":
        return respond1(handleGetWorkSchedule(e.parameter));
      case "updateWorkSchedule":
        return respond1(handleUpdateWorkSchedule(e.parameter));
      case "resetWorkSchedule":
        return respond1(handleResetWorkSchedule(e.parameter));
      case "getSalaryRules":
        return respond1(handleGetSalaryRules(e.parameter));
      case "updateSalaryRules":
        return respond1(handleUpdateSalaryRules(e.parameter));
      case "resetSalaryRules":
        return respond1(handleResetSalaryRules(e.parameter));
      case "getSalaryItems":
        return respond1(handleGetSalaryItems(e.parameter));
      case "saveSalaryItems":
        return respond1(handleSaveSalaryItems(e.parameter));

      // ==================== 薪資批次工具 ====================
      case "batchCalculateSalary":
        return respond1(handleBatchCalculateSalary(e.parameter));
      case "copySalaryConfig":
        return respond1(handleCopySalaryConfig(e.parameter));
      case "previewSalaryConfigCopy":
        return respond1(handlePreviewSalaryConfigCopy(e.parameter));
      case "listPayableEmployees":
        return respond1(handleListPayableEmployees(e.parameter));
      case "getAdminAuditLog":
        return respond1(handleGetAdminAuditLog(e.parameter));
      case "getSalaryAuditLog":
        return respond1(handleGetSalaryAuditLog(e.parameter));

      // ==================== 申請單附件 ====================
      case "uploadAttachment":
        return respond1(handleUploadAttachment(e.parameter));
      case "listAttachments":
        return respond1(handleListAttachments(e.parameter));
      case "listAttachmentsBatch":
        return respond1(handleListAttachmentsBatch(e.parameter));
      case "getAttachment":
        return respond1(handleGetAttachment(e.parameter));
      case "deleteAttachment":
        return respond1(handleDeleteAttachment(e.parameter));

      // ==================== 薪資簽收與離職 ====================
      case "acknowledgePayslip":
        return respond1(handleAcknowledgePayslip(e.parameter));
      case "getPayslipAcknowledgements":
        return respond1(handleGetPayslipAcknowledgements(e.parameter));
      case "offboardEmployee":
        return respond1(handleOffboardEmployee(e.parameter));
      case "reinstateEmployee":
        return respond1(handleReinstateEmployee(e.parameter));

      case "getAnnouncements":
        return respond1(handleGetAnnouncements(e.parameter));
      case "addAnnouncement":
        return respond1(handleAddAnnouncement(e.parameter));
      case "deleteAnnouncement":
        return respond1(handleDeleteAnnouncement(e.parameter));
      
      // ==================== 費用申請（預支／報銷）====================
      case "submitExpense":
        return respond1(handleSubmitExpense(e.parameter));
      case "getMyExpenses":
        return respond1(handleGetMyExpenses(e.parameter));
      case "getPendingExpenses":
        return respond1(handleGetPendingExpenses(e.parameter));
      case "reviewExpense":
        return respond1(handleReviewExpense(e.parameter));
      // ==================== 假日清單 ====================
      case "getHolidays":
        return respond1(handleGetHolidays());
      
      // ==================== 測試端點 ====================
      case "initApp":
        return respond1(handleInitApp(e.parameter));
      case "testEndpoint":
        return respond1({ ok: true, msg: "CORS 測試成功!" });
      
      // ==================== 預設：返回 HTML 頁面 ====================
      default:
        return HtmlService.createHtmlOutputFromFile('index')
               .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  } catch (err) {
    return respond1({ ok: false, msg: err.message });
  }
}

// Main.gs - 新增 LINE Bot Webhook 處理

function doPost(e) {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 收到 POST 請求');
    Logger.log('═══════════════════════════════════════');
    
    //  先嘗試從 parameter 讀取（FormData）
    if (e.parameter && e.parameter.action) {
      Logger.log(' 識別為 Form Data 請求');
      
      const action = e.parameter.action;
      const token = e.parameter.token;
      
      Logger.log('   action: ' + action);
      Logger.log('   token: ' + (token ? '有' : '無'));
      
      // ========== 處理批量上傳排班 ==========
      if (action === 'batchAddShifts') {
        Logger.log(' 處理批量上傳排班');
        
        // 驗證 token
        if (!token || !validateSession(token)) {
          Logger.log(' Token 驗證失敗');
          return ContentService.createTextOutput(JSON.stringify({
            ok: false,
            msg: '未授權或 session 已過期'
          })).setMimeType(ContentService.MimeType.JSON);
        }
        
        Logger.log(' Token 驗證成功');
        
        // 檢查權限
        const permCheck = checkSchedulingPermission(token);
        if (!permCheck.ok) {
          Logger.log(' 權限檢查失敗');
          return ContentService.createTextOutput(JSON.stringify(permCheck))
            .setMimeType(ContentService.MimeType.JSON);
        }
        
        Logger.log(' 權限驗證通過（by ' + permCheck.user.name + '）');
        
        //  從 Form Data 解析 shiftsArray
        let shiftsArray;
        try {
          shiftsArray = JSON.parse(e.parameter.shiftsArray);
          Logger.log(' 成功解析 shiftsArray: ' + shiftsArray.length + ' 筆');
        } catch (parseError) {
          Logger.log(' 解析 shiftsArray 失敗: ' + parseError);
          return ContentService.createTextOutput(JSON.stringify({
            ok: false,
            msg: '資料格式錯誤'
          })).setMimeType(ContentService.MimeType.JSON);
        }
        
        if (!Array.isArray(shiftsArray)) {
          Logger.log(' shiftsArray 不是陣列');
          return ContentService.createTextOutput(JSON.stringify({
            ok: false,
            msg: 'shiftsArray 必須是陣列'
          })).setMimeType(ContentService.MimeType.JSON);
        }
        
        if (shiftsArray.length === 0) {
          Logger.log(' shiftsArray 是空的');
          return ContentService.createTextOutput(JSON.stringify({
            ok: false,
            msg: '批量資料不能為空'
          })).setMimeType(ContentService.MimeType.JSON);
        }
        
        Logger.log(' 準備批量新增: ' + shiftsArray.length + ' 筆排班');
        
        // 呼叫核心函數
        const result = batchAddShifts(shiftsArray);
        logAdminAction_('batchAddShifts', e.parameter, { ok: result.success }, permCheck.user);
        
        Logger.log('');
        Logger.log(' 批量新增結果:');
        Logger.log('   成功: ' + result.results.success + ' 筆');
        Logger.log('   失敗: ' + result.results.failed + ' 筆');
        Logger.log('═══════════════════════════════════════');
        
        return ContentService.createTextOutput(JSON.stringify({
          ok: result.success,
          msg: result.message,
          results: result.results
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      //  其他 action 一律交給 doGet 的路由處理
      //  POST 表單的參數同樣落在 e.parameter，所以路由可以完全共用。
      //  這讓前端能改用 POST 傳 token，不必再把權杖放在網址列（會留在瀏覽器歷史與存取紀錄裡）。
      Logger.log(' 交由 doGet 路由處理: ' + action);
      return doGet(e);
    }
    
    //  如果不是 Form Data，嘗試解析 JSON（LINE Webhook）
    if (e.postData && e.postData.contents) {
      Logger.log(' postData.contents: ' + e.postData.contents.substring(0, 200) + '...');
      
      const postData = JSON.parse(e.postData.contents);
      
      // LINE Webhook（有 events 屬性）
      if (postData.events && Array.isArray(postData.events)) {
        Logger.log(' 識別為 LINE Webhook 請求');
        Logger.log(' 收到 ' + postData.events.length + ' 個事件');
        
        // 處理每個事件
        postData.events.forEach((event, index) => {
          Logger.log('');
          Logger.log(` 處理事件 ${index + 1}/${postData.events.length}`);
          Logger.log('   type: ' + event.type);
          
          const eventId = event.webhookEventId || 
                         `${event.timestamp}_${event.source.userId}_${event.type}`;
          
          Logger.log('   eventId: ' + eventId);
          
          if (isEventProcessed_(eventId)) {
            Logger.log('⏭ 跳過已處理的事件');
            return;
          }
          
          try {
            if (event.type === 'message') {
              if (event.message.type === 'text') {
                Logger.log('   message.type: text');
                Logger.log('   message.text: ' + event.message.text);
                handleLineMessage(event);
              } else if (event.message.type === 'location') {
                Logger.log('   message.type: location');
                Logger.log('   latitude: ' + event.message.latitude);
                Logger.log('   longitude: ' + event.message.longitude);
                handleLineLocation(event);
              }
            }
          } catch (eventError) {
            Logger.log(' 事件處理錯誤: ' + eventError);
            Logger.log('   錯誤堆疊: ' + eventError.stack);
          }
        });
        
        Logger.log('');
        Logger.log(' LINE Webhook 處理完成');
        Logger.log('═══════════════════════════════════════');
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'ok'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // 未知的請求類型
    Logger.log(' 無法識別的請求類型');
    Logger.log('═══════════════════════════════════════');
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: '無法識別的請求類型'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('');
    Logger.log(' doPost 錯誤: ' + error);
    Logger.log('   錯誤訊息: ' + error.message);
    Logger.log('   錯誤堆疊: ' + error.stack);
    Logger.log('═══════════════════════════════════════');
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 驗證 LINE Signature（測試模式：暫時停用）
 */
/**
 *  Signature 驗證（測試模式：已停用）
 * 
 * 正式上線時請啟用此函數
 */
function verifyLineSignature_(body, signature) {
  // 測試期間暫時返回 true
  Logger.log(' Signature 驗證已暫時停用（測試模式）');
  return true;
  
  /* 
  //  正式上線時請啟用以下程式碼：
  try {
    const channelSecret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
    
    if (!channelSecret) {
      Logger.log(' 找不到 LINE_CHANNEL_SECRET');
      return false;
    }
    
    const hash = Utilities.computeHmacSha256Signature(body, channelSecret);
    const expectedSignature = Utilities.base64Encode(hash);
    
    Logger.log(' Expected Signature: ' + expectedSignature);
    Logger.log(' Received Signature: ' + signature);
    
    return expectedSignature === signature;
    
  } catch (error) {
    Logger.log(' Signature 驗證錯誤: ' + error);
    return false;
  }
  */
}
// function verifyLineSignature_(body, signature) {
//   //  測試期間暫時返回 true
//   Logger.log(' Signature 驗證已暫時停用（測試模式）');
//   return true;

//   /* 
//   //  正式上線時請啟用以下程式碼：
//   try {
//     const channelSecret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
    
//     if (!channelSecret) {
//       Logger.log(' 找不到 LINE_CHANNEL_SECRET');
//       return false;
//     }
    
//     const hash = Utilities.computeHmacSha256Signature(body, channelSecret);
//     const expectedSignature = Utilities.base64Encode(hash);
    
//     Logger.log(' Expected Signature: ' + expectedSignature);
//     Logger.log(' Received Signature: ' + signature);
    
//     return expectedSignature === signature;
    
//   } catch (error) {
//     Logger.log(' Signature 驗證錯誤: ' + error);
//     return false;
//   }
//   */
// }

// function verifyLineSignature_(body, signature) {
//   const channelSecret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
//   const hash = Utilities.computeHmacSha256Signature(body, channelSecret);
//   const expectedSignature = Utilities.base64Encode(hash);
//   return expectedSignature === signature;
// }

// ==================== 排班系統 Handler 函數 ====================

// ==================== 排班系統 Handler 函數（修正版）====================

// ==================== 薪資系統 Handler 函數 ====================

// LineBotPunch.gs - 補充缺少的函數

