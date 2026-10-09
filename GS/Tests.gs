// Tests.gs
//
// 開發期間用的測試與除錯函式，從各個模組集中到這裡。
//
// 搬過來的原因：這些函式佔了後端約 13% 的程式碼，而 Apps Script 每次執行都要
// 解析專案裡所有 .gs。集中之後要精簡或在正式環境排除都只需要處理一個檔案。
//
// 這裡的函式都是從 Apps Script 編輯器手動執行的，沒有掛在 doGet 的路由上。

// ==================== 來自 AdminTools.gs ====================
/**
 * 查看特休假計算規則測試
 * 這個函數可以用來測試不同到職日期對應的特休假天數
 */
function testAnnualLeaveCalculation() {
  const testCases = [
    { hireDate: '2024-10-01', description: '剛到職（未滿6個月）' },
    { hireDate: '2024-04-01', description: '6個月（應得3天）' },
    { hireDate: '2023-10-01', description: '1年（應得7天）' },
    { hireDate: '2022-10-01', description: '2年（應得10天）' },
    { hireDate: '2021-10-01', description: '3年（應得14天）' },
    { hireDate: '2019-10-01', description: '5年（應得15天）' },
    { hireDate: '2014-10-01', description: '10年（應得15天）' },
    { hireDate: '2009-10-01', description: '15年（應得20天）' },
    { hireDate: '1994-10-01', description: '30年（應得30天，最高上限）' }
  ];
  
  Logger.log(' 特休假計算規則測試：\n');
  Logger.log('=' .repeat(60));
  
  testCases.forEach(testCase => {
    const days = calculateAnnualLeave_(new Date(testCase.hireDate));
    Logger.log(`${testCase.description}`);
    Logger.log(`  到職日期: ${testCase.hireDate}`);
    Logger.log(`  特休假: ${days} 天\n`);
  });
}


// ==================== 來自 Dailysalary.gs ====================
function testDailySalaryCalculation() {
  const params = {
    token: '3b419320-57b1-4cd0-861a-23a48b132a5c',
    employeeId: 'D001',
    yearMonth: '2025-11',
    workDays: 20,
    overtimeHours: 10,
    leaveDeduction: 500,
    advancePayment: 1000,
    agencyDeduction: 200,
    otherDeduction: 100,
    fineDeduction: 50
  };
  
  const result = handleCalculateDailySalary(params);
  Logger.log(JSON.stringify(result, null, 2));
}


// ==================== 來自 DbOperations.gs ====================
/**
 *  測試解除鎖定功能
 */
function testUnlockEmployeeName() {
  Logger.log(' 測試解除姓名鎖定');
  Logger.log('');
  
  //  替換成實際的 userId
  const testUserId = 'Ud3b574f260f5a777337158ccd4ff0ba2';
  
  const result = unlockEmployeeName(testUserId);
  
  Logger.log('');
  Logger.log(' 結果:');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 *  測試 checkSession_
 */
function testCheckSession() {
  Logger.log(' 測試 checkSession_');
  Logger.log('');
  
  const token = '04fd1452-4aca-4b03-ad17-45f03144c6ff';
  
  Logger.log(' Token: ' + token.substring(0, 20) + '...');
  Logger.log('');
  
  const result = checkSession_(token);
  
  Logger.log(' checkSession_ 結果:');
  Logger.log(JSON.stringify(result, null, 2));
  Logger.log('');
  
  if (result.ok && result.user) {
    Logger.log(' Session 有效');
    Logger.log('');
    Logger.log(' User 資料:');
    Logger.log('   - userId: ' + result.user.userId);
    Logger.log('   - employeeId: ' + result.user.employeeId);
    Logger.log('   - name: ' + result.user.name);
    Logger.log('   - dept: ' + result.user.dept);
    Logger.log('   - email: ' + result.user.email);
    Logger.log('   - status: ' + result.user.status);
    Logger.log('');
    Logger.log(' 檢查 user 物件是否乾淨:');
    Logger.log('   - user.ok 存在嗎? ' + (result.user.ok !== undefined ? ' 是（有問題）' : ' 否（正常）'));
  } else {
    Logger.log(' Session 無效');
    Logger.log('   code: ' + result.code);
  }
}

function testGetAttendanceDetailsWithOvertime() {
  Logger.log(' 測試 getAttendanceDetails');
  Logger.log('═══════════════════════════════════════');
  
  const monthParam = '2025-12';
  const userIdParam = 'U68e0ca9d516e63ed15bf9387fad174ac';
  
  Logger.log(` 查詢條件: ${monthParam}, userId: ${userIdParam}`);
  Logger.log('');
  
  const result = getAttendanceDetails(monthParam, userIdParam);
  
  Logger.log(' API 回應:');
  Logger.log(`   ok: ${result.ok}`);
  Logger.log(`   records 數量: ${result.records ? result.records.length : 0}`);
  Logger.log('');
  
  if (result.ok && result.records) {
    // 找出 2025-12-09 的記錄
    const dec09 = result.records.find(r => r.date === '2025-12-09');
    
    if (dec09) {
      Logger.log(' 找到 2025-12-09 的記錄:');
      Logger.log('');
      Logger.log(' 記錄內容:');
      Logger.log(JSON.stringify(dec09, null, 2));
      Logger.log('');
      
      Logger.log(' 加班資訊檢查:');
      Logger.log(`   overtime 存在: ${dec09.overtime ? '是' : '否'}`);
      
      if (dec09.overtime) {
        Logger.log('    加班資訊:');
        Logger.log(`      開始時間: ${dec09.overtime.startTime}`);
        Logger.log(`      結束時間: ${dec09.overtime.endTime}`);
        Logger.log(`      時數: ${dec09.overtime.hours}`);
        Logger.log(`      原因: ${dec09.overtime.reason}`);
      } else {
        Logger.log('    沒有加班資訊');
      }
    } else {
      Logger.log(' 沒有找到 2025-12-09 的記錄');
      Logger.log('');
      Logger.log(' 所有記錄的日期:');
      result.records.forEach((r, i) => {
        Logger.log(`   ${i + 1}. ${r.date} - ${r.name}`);
      });
    }
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  測試加班記錄查詢
 */
function testGetApprovedOvertimeRecords() {
  Logger.log(' 測試加班記錄查詢');
  Logger.log('═══════════════════════════════════════');
  
  const monthParam = '2025-12';
  const userIdParam = 'U68e0ca9d516e63ed15bf9387fad174ac';  // 替換成您的實際 userId
  
  Logger.log(` 查詢條件: ${monthParam}, userId: ${userIdParam}`);
  Logger.log('');
  
  const records = getApprovedOvertimeRecords(monthParam, userIdParam);
  
  Logger.log('');
  Logger.log(' 查詢結果:');
  Logger.log(`   找到 ${records.length} 筆記錄`);
  
  if (records.length > 0) {
    records.forEach((rec, i) => {
      Logger.log('');
      Logger.log(`   記錄 ${i + 1}:`);
      Logger.log(`      日期: ${rec.overtimeDate}`);
      Logger.log(`      員工: ${rec.employeeName} (${rec.employeeId})`);
      Logger.log(`      時間: ${rec.startTime} - ${rec.endTime}`);
      Logger.log(`      時數: ${rec.hours} 小時`);
      Logger.log(`      原因: ${rec.reason}`);
    });
  } else {
    Logger.log('    沒有找到符合條件的記錄');
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  測試審核通知流程
 */
function testApproveWithNotification() {
  Logger.log(' 測試審核 + LINE 通知');
  Logger.log('');
  
  //  請先在 Google Sheet 找一筆「補打卡」且「管理員審核 = ?」的記錄
  const testRowNumber = 20; // 替換成實際的行號
  
  Logger.log(' 測試核准補打卡...');
  const approveResult = updateReviewStatus(testRowNumber, "v", "核准");
  
  Logger.log('');
  Logger.log(' 審核結果:');
  Logger.log(JSON.stringify(approveResult, null, 2));
  
  if (approveResult.ok) {
    Logger.log('');
    Logger.log(' 測試成功！');
    Logger.log('   請檢查 LINE 是否收到通知');
  } else {
    Logger.log('');
    Logger.log(' 測試失敗');
  }
}

/**
 *  測試拒絕通知流程
 */
function testRejectWithNotification() {
  Logger.log(' 測試拒絕 + LINE 通知');
  Logger.log('');
  
  const testRowNumber = 21; // 替換成實際的行號
  
  Logger.log(' 測試拒絕補打卡...');
  const rejectResult = updateReviewStatus(testRowNumber, "x", "時間不符，請重新申請");
  
  Logger.log('');
  Logger.log(' 審核結果:');
  Logger.log(JSON.stringify(rejectResult, null, 2));
  
  if (rejectResult.ok) {
    Logger.log('');
    Logger.log(' 測試成功！');
    Logger.log('   請檢查 LINE 是否收到拒絕通知');
  } else {
    Logger.log('');
    Logger.log(' 測試失敗');
  }
}

/**
 *  測試員工基本資料功能
 */
function testEmployeeBasicInfo() {
  Logger.log(' 測試員工基本資料功能');
  Logger.log('═══════════════════════════════════════');
  
  // 步驟 1: 測試直接呼叫 setEmployeeBasicInfo
  Logger.log(' 測試 1: 直接呼叫 setEmployeeBasicInfo');
  const testData1 = {
    employeeId: 'TEST001',
    employeeName: '測試員工',
    idNumber: 'A123456789',
    address: '台北市',
    phone: '0912345678',
    birthDate: '1990-01-01'
  };
  
  const result1 = setEmployeeBasicInfo(testData1);
  Logger.log('結果: ' + JSON.stringify(result1));
  Logger.log('');
  
  // 步驟 2: 測試透過 Handler 呼叫
  Logger.log(' 測試 2: 透過 Handler 呼叫');
  const testParams = {
    token: '61ba577e-7b52-463c-9ce9-48d8c18a3da6',  //  替換成有效的 token
    employeeId: 'TEST002',
    employeeName: '測試員工2',
    idNumber: 'B123456789',
    address: '新北市',
    phone: '0987654321',
    birthDate: '1995-05-05'
  };
  
  const result2 = handleSetEmployeeBasicInfo(testParams);
  Logger.log('結果: ' + JSON.stringify(result2));

  Logger.log('═══════════════════════════════════════');
}


// ==================== 來自 Handlers.gs ====================
/**
 *  測試 handleAdjustPunch（完整流程）
 */
function testHandleAdjustPunchComplete() {
  Logger.log(' 測試 handleAdjustPunch 完整流程');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const testParams = {
    token: 'a8f8ca99-97d6-4643-ad8e-67a73f2bb649',  //  替換成你的有效 token
    type: '上班',
    datetime: '2025-12-16T10:30:00',
    lat: '25.0330',
    lng: '121.5654',
    note: '測試補打卡理由：系統測試用'
  };
  
  Logger.log(' 測試參數:');
  Logger.log(JSON.stringify(testParams, null, 2));
  Logger.log('');
  
  const result = handleAdjustPunch(testParams);
  
  Logger.log('');
  Logger.log(' 最終測試結果:');
  Logger.log(JSON.stringify(result, null, 2));
  Logger.log('');
  
  if (result.ok) {
    Logger.log(' 測試成功！');
    Logger.log('');
    Logger.log(' 請檢查 Google Sheet:');
    Logger.log('   1. 打開「補打卡申請」工作表');
    Logger.log('   2. 應該看到新增一筆「待審核」的記錄');
    Logger.log('   3. 「原因」欄應該有:「測試補打卡理由：系統測試用」');
    Logger.log('');
  } else {
    Logger.log(' 測試失敗');
    Logger.log('   code: ' + result.code);
    Logger.log('   msg: ' + result.msg);
  }
  
  Logger.log('═══════════════════════════════════════');
}

/**
 *  測試函數
 */
function testHandleSetEmployeeSalaryTW() {
  Logger.log(' 測試 handleSetEmployeeSalaryTW（完整版）');
  Logger.log('');
  
  const testParams = {
    token: '3577f5c0-7e0a-4082-9593-d84fb9ba1db1',  //  替換成有效的 token
    employeeId: 'Uffac21d92d99e3404b9228fd8c251e2a',
    employeeName: '洪培瑜Eric',
    idNumber: 'A173123222',
    employeeType: '正職',
    salaryType: '月薪',
    baseSalary: '50000',
    
    // ⭐ 固定津貼
    positionAllowance: '10',
    mealAllowance: '10',
    transportAllowance: '0',
    attendanceBonus: '16',
    performanceBonus: '0',
    otherAllowances: '56',
    
    // 銀行資訊
    bankCode: '052',
    bankAccount: '1111',
    hireDate: '',
    paymentDay: '5',
    
    // 法定扣款
    pensionSelfRate: '0',
    laborFee: '1053',
    healthFee: '710',
    employmentFee: '92',
    pensionSelf: '0',
    incomeTax: '800',
    
    // ⭐ 其他扣款
    welfareFee: '40',
    dormitoryFee: '0',
    groupInsurance: '0',
    otherDeductions: '36',
    
    // 備註
    note: '測試完整版薪資設定'
  };
  
  Logger.log(' 測試參數已準備');
  Logger.log('');
  
  const result = handleSetEmployeeSalaryTW(testParams);
  
  Logger.log('');
  Logger.log(' 測試結果:');
  Logger.log(JSON.stringify(result, null, 2));
  
  if (result.ok) {
    Logger.log('');
    Logger.log(' 測試成功！');
    Logger.log('   請檢查 Google Sheet 中的資料是否正確');
  } else {
    Logger.log('');
    Logger.log(' 測試失敗');
    Logger.log('   原因: ' + result.msg);
  }
}

/**
 *  檢查 salaryData 物件是否正確組裝
 */
function testCheckSalaryDataObject() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 檢查 salaryData 物件組裝');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const params = {
    employeeId: 'TEST123',
    employeeName: '測試員工',
    baseSalary: '60000',
    positionAllowance: '10',
    mealAllowance: '10',
    otherAllowances: '47',
    dormitoryFee: '67',
    otherDeductions: '90'
  };
  
  const safeString = (value) => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  };
  
  const safeNumber = (value) => {
    if (value === null || value === undefined) return 0;
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  };
  
  const salaryData = {
    employeeId: safeString(params.employeeId),
    employeeName: safeString(params.employeeName),
    baseSalary: safeNumber(params.baseSalary),
    positionAllowance: safeNumber(params.positionAllowance),
    mealAllowance: safeNumber(params.mealAllowance),
    otherAllowances: safeNumber(params.otherAllowances),
    dormitoryFee: safeNumber(params.dormitoryFee),
    otherDeductions: safeNumber(params.otherDeductions)
  };
  
  Logger.log(' salaryData 物件內容:');
  Logger.log('   employeeId: ' + salaryData.employeeId);
  Logger.log('   employeeName: ' + salaryData.employeeName);
  Logger.log('   baseSalary: ' + salaryData.baseSalary + ' (型別: ' + typeof salaryData.baseSalary + ')');
  Logger.log('   positionAllowance: ' + salaryData.positionAllowance + ' ⭐ (型別: ' + typeof salaryData.positionAllowance + ')');
  Logger.log('   mealAllowance: ' + salaryData.mealAllowance + ' ⭐ (型別: ' + typeof salaryData.mealAllowance + ')');
  Logger.log('   otherAllowances: ' + salaryData.otherAllowances + ' ⭐ (型別: ' + typeof salaryData.otherAllowances + ')');
  Logger.log('   dormitoryFee: ' + salaryData.dormitoryFee + ' ⭐ (型別: ' + typeof salaryData.dormitoryFee + ')');
  Logger.log('   otherDeductions: ' + salaryData.otherDeductions + ' ⭐ (型別: ' + typeof salaryData.otherDeductions + ')');
  Logger.log('');
  
  if (salaryData.positionAllowance === 10 && 
      salaryData.mealAllowance === 10 && 
      salaryData.otherAllowances === 47) {
    Logger.log(' salaryData 物件組裝正確！');
  } else {
    Logger.log(' salaryData 物件組裝有問題');
  }
  
  Logger.log('═══════════════════════════════════════');
}

/**
 *  測試 handleSetEmployeeSalaryTW 是否正確接收參數
 */
function testDiagnoseSalaryParams() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 診斷測試：薪資參數接收（完整版 v2.0）');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  // ⭐⭐⭐ 模擬前端送出的參數（完整 29 個參數）
  const testParams = {
    token: '3577f5c0-7e0a-4082-9593-d84fb9ba1db1',  //  替換成你的有效 token
    
    // 基本資訊 (6 個)
    employeeId: 'Uffac21d92d99e3404b9228fd8c251e2a',
    employeeName: '張鈺宸(傻傻)',
    idNumber: 'A173123222',
    employeeType: '正職',
    salaryType: '月薪',
    baseSalary: '60000',
    
    // ⭐ 固定津貼 (6 個) - 這是測試重點！
    positionAllowance: '10',
    mealAllowance: '10',
    transportAllowance: '0',
    attendanceBonus: '0',
    performanceBonus: '0',
    otherAllowances: '47',
    
    // 銀行資訊 (4 個)
    bankCode: '822',
    bankAccount: '22214',
    hireDate: '',
    paymentDay: '5',
    
    // 法定扣款 (6 個)
    pensionSelfRate: '0',
    laborFee: '1053',
    healthFee: '710',
    employmentFee: '92',
    pensionSelf: '0',
    incomeTax: '1300',
    
    // ⭐ 其他扣款 (4 個) - 這也是測試重點！
    welfareFee: '0',
    dormitoryFee: '67',
    groupInsurance: '0',
    otherDeductions: '90',
    
    // 備註 (1 個)
    note: '診斷測試 v2.0'
  };
  
  Logger.log(' 測試參數 (共 29 個):');
  Logger.log('');
  Logger.log('【基本資訊 - 6 個】');
  Logger.log('   1. employeeId: ' + testParams.employeeId);
  Logger.log('   2. employeeName: ' + testParams.employeeName);
  Logger.log('   3. idNumber: ' + testParams.idNumber);
  Logger.log('   4. employeeType: ' + testParams.employeeType);
  Logger.log('   5. salaryType: ' + testParams.salaryType);
  Logger.log('   6. baseSalary: ' + testParams.baseSalary);
  Logger.log('');
  Logger.log('【固定津貼 - 6 個】⭐⭐⭐');
  Logger.log('   7. positionAllowance: ' + testParams.positionAllowance + ' ⭐');
  Logger.log('   8. mealAllowance: ' + testParams.mealAllowance + ' ⭐');
  Logger.log('   9. transportAllowance: ' + testParams.transportAllowance);
  Logger.log('  10. attendanceBonus: ' + testParams.attendanceBonus);
  Logger.log('  11. performanceBonus: ' + testParams.performanceBonus);
  Logger.log('  12. otherAllowances: ' + testParams.otherAllowances + ' ⭐');
  Logger.log('');
  Logger.log('【銀行資訊 - 4 個】');
  Logger.log('  13. bankCode: ' + testParams.bankCode);
  Logger.log('  14. bankAccount: ' + testParams.bankAccount);
  Logger.log('  15. hireDate: ' + (testParams.hireDate || '(空)'));
  Logger.log('  16. paymentDay: ' + testParams.paymentDay);
  Logger.log('');
  Logger.log('【法定扣款 - 6 個】');
  Logger.log('  17. pensionSelfRate: ' + testParams.pensionSelfRate);
  Logger.log('  18. laborFee: ' + testParams.laborFee);
  Logger.log('  19. healthFee: ' + testParams.healthFee);
  Logger.log('  20. employmentFee: ' + testParams.employmentFee);
  Logger.log('  21. pensionSelf: ' + testParams.pensionSelf);
  Logger.log('  22. incomeTax: ' + testParams.incomeTax);
  Logger.log('');
  Logger.log('【其他扣款 - 4 個】⭐⭐⭐');
  Logger.log('  23. welfareFee: ' + testParams.welfareFee);
  Logger.log('  24. dormitoryFee: ' + testParams.dormitoryFee + ' ⭐');
  Logger.log('  25. groupInsurance: ' + testParams.groupInsurance);
  Logger.log('  26. otherDeductions: ' + testParams.otherDeductions + ' ⭐');
  Logger.log('');
  Logger.log('【備註 - 1 個】');
  Logger.log('  27. note: ' + testParams.note);
  Logger.log('');
  
  // ⭐ 呼叫 Handler 函數
  Logger.log(' 開始呼叫 handleSetEmployeeSalaryTW()');
  Logger.log('');
  
  const result = handleSetEmployeeSalaryTW(testParams);
  
  Logger.log('');
  Logger.log(' Handler 返回結果:');
  Logger.log('   ok: ' + result.ok);
  Logger.log('   msg: ' + result.msg);
  Logger.log('');
  
  if (result.ok) {
    Logger.log(' Handler 執行成功');
    Logger.log('');
    Logger.log(' 請檢查 Google Sheet「員工薪資設定」:');
    Logger.log('   G 欄（職務加給）應該是: 10');
    Logger.log('   H 欄（伙食費）應該是: 10');
    Logger.log('   L 欄（其他津貼）應該是: 47');
    Logger.log('   X 欄（宿舍費用）應該是: 67');
    Logger.log('   Z 欄（其他扣款）應該是: 90');
    Logger.log('');
    Logger.log(' 如果以上欄位仍然是 0，則問題在於 setEmployeeSalaryTW()');
  } else {
    Logger.log(' Handler 執行失敗');
    Logger.log('   錯誤訊息: ' + result.msg);
  }
  
  Logger.log('═══════════════════════════════════════');
}

/**
 *  檢查 Sheet 欄位結構
 */
function testCheckSheetStructure() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 檢查 Sheet 欄位結構');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const sheet = getEmployeeSalarySheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  Logger.log(' Sheet 欄位總數: ' + headers.length);
  Logger.log('');
  Logger.log(' 完整欄位列表:');
  
  headers.forEach((header, index) => {
    const column = String.fromCharCode(65 + index);
    Logger.log(`   ${column} (${index + 1}): ${header}`);
  });
  
  Logger.log('');
  Logger.log(' 關鍵欄位檢查:');
  Logger.log('   G 欄 (7):  ' + headers[6] + (headers[6] === '職務加給' ? ' ' : ' '));
  Logger.log('   H 欄 (8):  ' + headers[7] + (headers[7] === '伙食費' ? ' ' : ' '));
  Logger.log('   I 欄 (9):  ' + headers[8] + (headers[8] === '交通補助' ? ' ' : ' '));
  Logger.log('   L 欄 (12): ' + headers[11] + (headers[11] === '其他津貼' ? ' ' : ' '));
  Logger.log('   M 欄 (13): ' + headers[12] + (headers[12] === '銀行代碼' ? ' ' : ' '));
  Logger.log('   N 欄 (14): ' + headers[13] + (headers[13] === '銀行帳號' ? ' ' : ' '));
  Logger.log('   X 欄 (24): ' + headers[23] + (headers[23] === '宿舍費用' ? ' ' : ' '));
  Logger.log('   Z 欄 (26): ' + headers[25] + (headers[25] === '其他扣款' ? ' ' : ' '));
  
  Logger.log('═══════════════════════════════════════');
}

/**
 *  測試函數
 */
function testHandleGetMySalaryFinal() {
  Logger.log(' 測試最終修正版 handleGetMySalary');
  Logger.log('');
  
  const testParams = {
    token: '04fd1452-4aca-4b03-ad17-45f03144c6ff',
    yearMonth: '2025-11'
  };
  
  Logger.log(' 測試參數:');
  Logger.log('   token: ' + testParams.token.substring(0, 20) + '...');
  Logger.log('   yearMonth: ' + testParams.yearMonth);
  Logger.log('');
  
  const result = handleGetMySalary(testParams);
  
  Logger.log('');
  Logger.log(' 最終結果:');
  Logger.log(JSON.stringify(result, null, 2));
  
  if (result.ok) {
    Logger.log('');
    Logger.log(' 測試成功！');
  } else {
    Logger.log('');
    Logger.log(' 測試失敗');
    Logger.log('   原因: ' + result.msg);
  }
}

/**
 *  測試取得我的薪資
 */
function testHandleGetMySalary() {
  Logger.log(' 測試 handleGetMySalary');
  Logger.log('');
  
  const testParams = {
    token: '04fd1452-4aca-4b03-ad17-45f03144c6ff',  //  替換成有效的 token
    yearMonth: '2025-11'
  };
  
  Logger.log(' 測試參數:');
  Logger.log('   token: ' + testParams.token.substring(0, 20) + '...');
  Logger.log('   yearMonth: ' + testParams.yearMonth);
  Logger.log('');
  
  const result = handleGetMySalary(testParams);
  
  Logger.log('');
  Logger.log(' 最終結果:');
  Logger.log(JSON.stringify(result, null, 2));
  Logger.log('');
  
  if (result.ok) {
    Logger.log(' 測試成功！');
    if (result.data) {
      Logger.log('');
      Logger.log(' 薪資資料:');
      Logger.log('   員工姓名: ' + result.data['員工姓名']);
      Logger.log('   年月: ' + result.data['年月']);
      Logger.log('   實發金額: ' + result.data['實發金額']);
    }
  } else {
    Logger.log(' 測試失敗');
    Logger.log('   原因: ' + result.msg);
  }
}

// ==================== 來自 LeaveManagement.gs ====================
/**
 *  測試函數：測試無時段限制的請假
 */
function testUnlimitedLeave() {
  Logger.log(' 測試無時段限制請假');
  Logger.log('');
  
  const testParams = {
    token: '16568f73-dd16-4dde-958d-1ab2e703cab5',  //  替換成有效 token
    leaveType: 'ANNUAL_LEAVE',
    startDateTime: '2026-02-06T18:00',  // 晚上 18:00
    endDateTime: '2026-02-06T22:00',    // 晚上 22:00
    reason: '測試晚上時段請假'
  };
  
  Logger.log(' 測試參數:');
  Logger.log(JSON.stringify(testParams, null, 2));
  Logger.log('');
  
  const result = submitLeaveRequest(
    testParams.token,
    testParams.leaveType,
    testParams.startDateTime,
    testParams.endDateTime,
    testParams.reason
  );
  
  Logger.log('');
  Logger.log(' 測試結果:');
  Logger.log(JSON.stringify(result, null, 2));
  
  if (result.ok) {
    Logger.log('');
    Logger.log(' 測試成功！');
    Logger.log('應該顯示：4 小時');
    Logger.log('請檢查 Google Sheet 的「請假紀錄」工作表');
  } else {
    Logger.log('');
    Logger.log(' 測試失敗');
  }
}


// ==================== 來自 LineBotPunch.gs ====================
function debugMonthQuery() {
  Logger.log(' 診斷月份查詢問題');
  Logger.log('═══════════════════════════════════════');
  
  const userId = 'Ue76b65367821240ac26387d2972a5adf';
  const yearMonth = '2026-02';
  
  const sheet = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE);
  const values = sheet.getDataRange().getValues();
  
  Logger.log(' 檢查所有該用戶的記錄:');
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === userId) {
      const rawDate = values[i][0];
      
      Logger.log('');
      Logger.log(`第 ${i + 1} 行:`);
      Logger.log(`   原始日期: ${rawDate}`);
      Logger.log(`   類型: ${typeof rawDate}`);
      
      if (rawDate instanceof Date) {
        const year = rawDate.getFullYear();
        const month = rawDate.getMonth() + 1;
        const recordYM = year + '-' + String(month).padStart(2, '0');
        
        Logger.log(`   解析後: ${recordYM}`);
        Logger.log(`   匹配 ${yearMonth}? ${recordYM === yearMonth ? '' : ''}`);
      }
    }
  }
  
  Logger.log('═══════════════════════════════════════');
}

/**
 *  詳細測試 2026-02 的查詢
 */
function debugFebruary2026() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 診斷 2026-02 月份查詢');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const userId = 'Ue76b65367821240ac26387d2972a5adf';
  const yearMonth = '2026-02';
  
  // 步驟 1: 檢查原始資料
  Logger.log(' 步驟 1: 檢查原始資料');
  const sheet = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE);
  const values = sheet.getDataRange().getValues();
  
  Logger.log(`   工作表總行數: ${values.length}`);
  
  let count = 0;
  const records = [];
  
  for (let i = 1; i < values.length; i++) {
    const recordUserId = values[i][1];
    
    if (recordUserId === userId) {
      const recordDate = new Date(values[i][0]);
      const recordYearMonth = Utilities.formatDate(recordDate, 'Asia/Taipei', 'yyyy-MM');
      
      if (recordYearMonth === yearMonth) {
        count++;
        records.push({
          row: i + 1,
          date: Utilities.formatDate(recordDate, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss'),
          type: values[i][4],
          location: values[i][6]
        });
      }
    }
  }
  
  Logger.log(`   找到 ${count} 筆 2026-02 的記錄`);
  Logger.log('');
  
  if (count > 0) {
    Logger.log(' 記錄詳情:');
    records.forEach((r, i) => {
      Logger.log(`   ${i + 1}. 第 ${r.row} 行: ${r.date} - ${r.type} @ ${r.location}`);
    });
  }
  
  Logger.log('');
  
  // 步驟 2: 測試 getMonthlyPunchRecords
  Logger.log(' 步驟 2: 測試 getMonthlyPunchRecords');
  
  try {
    const result = getMonthlyPunchRecords(userId, yearMonth);
    Logger.log(`   回傳記錄數: ${result.length}`);
    
    if (result.length > 0) {
      Logger.log('');
      Logger.log(' getMonthlyPunchRecords 回傳的記錄:');
      result.forEach((r, i) => {
        Logger.log(`   ${i + 1}. ${r.date} ${r.time} - ${r.type} @ ${r.location}`);
      });
    } else {
      Logger.log(' getMonthlyPunchRecords 回傳 0 筆（但原始資料有記錄！）');
    }
  } catch (error) {
    Logger.log(' getMonthlyPunchRecords 錯誤: ' + error.message);
  }
  
  Logger.log('');
  
  // 步驟 3: 測試分組
  Logger.log(' 步驟 3: 測試 groupRecordsByDate');
  
  try {
    const records2 = getMonthlyPunchRecords(userId, yearMonth);
    const grouped = groupRecordsByDate(records2);
    
    Logger.log(`   分組後的日期數: ${Object.keys(grouped).length}`);
    
    if (Object.keys(grouped).length > 0) {
      Logger.log('');
      Logger.log(' 分組結果:');
      Object.keys(grouped).sort().forEach(date => {
        Logger.log(`   ${date}: ${grouped[date].length} 筆`);
        grouped[date].forEach(r => {
          Logger.log(`      - ${r.time} ${r.type}`);
        });
      });
    }
  } catch (error) {
    Logger.log(' groupRecordsByDate 錯誤: ' + error.message);
  }
  
  Logger.log('');
  
  // 步驟 4: 測試統計
  Logger.log(' 步驟 4: 測試 calculateMonthlyStats');
  
  try {
    const records3 = getMonthlyPunchRecords(userId, yearMonth);
    const grouped2 = groupRecordsByDate(records3);
    const stats = calculateMonthlyStats(grouped2);
    
    Logger.log('   統計結果:');
    Logger.log(`   - totalDays: ${stats.totalDays}`);
    Logger.log(`   - completeDays: ${stats.completeDays}`);
    Logger.log(`   - totalWorkHours: ${stats.totalWorkHours}`);
  } catch (error) {
    Logger.log(' calculateMonthlyStats 錯誤: ' + error.message);
  }
  
  Logger.log('');
  
  // 步驟 5: 測試完整的 sendMonthlyRecords
  Logger.log(' 步驟 5: 測試 sendMonthlyRecords');
  
  try {
    const testReplyToken = 'test-token-' + Date.now();
    
    Logger.log('   執行 sendMonthlyRecords...');
    sendMonthlyRecords(testReplyToken, userId, '洪培瑜Eric', yearMonth);
    
    Logger.log('');
    Logger.log(' 請檢查上方的 log:');
    Logger.log('   - 是否有「找到 X 筆打卡記錄」');
    Logger.log('   - 是否有嘗試發送 LINE 訊息');
    Logger.log('   - 是否有錯誤訊息');
    
  } catch (error) {
    Logger.log(' sendMonthlyRecords 錯誤: ' + error.message);
    Logger.log('   堆疊: ' + error.stack);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 診斷完成');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  檢查日期格式問題
 */
function checkDateFormatIssue() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 檢查日期格式問題');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const userId = 'Ue76b65367821240ac26387d2972a5adf';
  const sheet = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE);
  const values = sheet.getDataRange().getValues();
  
  Logger.log(' 檢查所有該用戶的記錄日期格式:');
  Logger.log('');
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === userId) {
      const rawDate = values[i][0];
      const dateType = Object.prototype.toString.call(rawDate);
      
      try {
        const date = new Date(rawDate);
        const formatted = Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
        const yearMonth = Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM');
        
        Logger.log(`第 ${i + 1} 行:`);
        Logger.log(`   原始值: ${rawDate}`);
        Logger.log(`   類型: ${dateType}`);
        Logger.log(`   Date 物件: ${date}`);
        Logger.log(`   格式化: ${formatted}`);
        Logger.log(`   年月: ${yearMonth}`);
        Logger.log('');
        
      } catch (error) {
        Logger.log(`第 ${i + 1} 行:  日期解析失敗`);
        Logger.log(`   原始值: ${rawDate}`);
        Logger.log(`   錯誤: ${error.message}`);
        Logger.log('');
      }
    }
  }
  
  Logger.log('═══════════════════════════════════════');
}

/**
 *  檢查 2026-02 的 Flex Message 是否有問題
 */
function checkFlexMessageForFebruary() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 檢查 2026-02 的 Flex Message');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const userId = 'Ue76b65367821240ac26387d2972a5adf';
  const yearMonth = '2026-02';
  const employeeName = '洪培瑜Eric';
  
  // 步驟 1: 取得資料
  Logger.log(' 步驟 1: 取得打卡記錄');
  const records = getMonthlyPunchRecords(userId, yearMonth);
  Logger.log(`   記錄數: ${records.length}`);
  Logger.log('');
  
  // 步驟 2: 分組和統計
  Logger.log(' 步驟 2: 分組和統計');
  const groupedRecords = groupRecordsByDate(records);
  const stats = calculateMonthlyStats(groupedRecords);
  
  Logger.log(`   分組日期數: ${Object.keys(groupedRecords).length}`);
  Logger.log(`   統計 - 總天數: ${stats.totalDays}`);
  Logger.log(`   統計 - 完整天數: ${stats.completeDays}`);
  Logger.log(`   統計 - 總工時: ${stats.totalWorkHours}`);
  Logger.log('');
  
  // 步驟 3: 生成 Flex Message（模擬 sendMonthlyRecordsSingle）
  Logger.log(' 步驟 3: 生成 Flex Message');
  
  try {
    const monthLabel = yearMonth.replace('-', '年') + '月';
    
    // 建立每日記錄的內容
    const dailyContents = [];
    
    Object.keys(groupedRecords).sort().reverse().forEach(date => {
      const dayRecords = groupedRecords[date];
      
      // 日期標題
      const dateLabel = formatDateLabel(date);
      dailyContents.push({
        type: 'text',
        text: dateLabel,
        weight: 'bold',
        size: 'md',
        color: '#2196F3',
        margin: 'lg'
      });
      
      // 該日的打卡記錄
      dayRecords.forEach(record => {
        const noteText = record.note === '補打卡' 
          ? (record.audit === 'v' ? '(補打卡-已核准)' : '(補打卡-待審核)')
          : '';
        
        dailyContents.push({
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          margin: 'sm',
          contents: [
            {
              type: 'text',
              text: record.type,
              color: record.type === '上班' ? '#4CAF50' : '#FF9800',
              size: 'sm',
              flex: 2,
              weight: 'bold'
            },
            {
              type: 'text',
              text: record.time,
              size: 'sm',
              flex: 3,
              color: '#333333'
            },
            {
              type: 'text',
              text: noteText,
              size: 'xs',
              flex: 3,
              color: '#999999'
            }
          ]
        });
        
        // 地點資訊
        if (record.location) {
          dailyContents.push({
            type: 'text',
            text: ` ${record.location}`,
            size: 'xs',
            color: '#666666',
            margin: 'xs'
          });
        }
      });
      
      // 分隔線
      dailyContents.push({
        type: 'separator',
        margin: 'lg'
      });
    });
    
    // 移除最後一條分隔線
    if (dailyContents.length > 0 && dailyContents[dailyContents.length - 1].type === 'separator') {
      dailyContents.pop();
    }
    
    const message = {
      type: 'flex',
      altText: `${monthLabel}打卡記錄`,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: ` ${monthLabel}`,
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF'
            },
            {
              type: 'text',
              text: employeeName,
              size: 'sm',
              color: '#FFFFFF',
              margin: 'xs'
            }
          ],
          backgroundColor: '#2196F3',
          paddingAll: '20px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            // 統計資訊
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: ' 本月統計',
                  weight: 'bold',
                  size: 'md',
                  color: '#333333'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'sm',
                  spacing: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: `打卡天數\n${stats.totalDays} 天`,
                      size: 'xs',
                      color: '#666666',
                      flex: 1,
                      align: 'center'
                    },
                    {
                      type: 'text',
                      text: `完整天數\n${stats.completeDays} 天`,
                      size: 'xs',
                      color: '#666666',
                      flex: 1,
                      align: 'center'
                    },
                    {
                      type: 'text',
                      text: `總工時\n${stats.totalWorkHours} 小時`,
                      size: 'xs',
                      color: '#666666',
                      flex: 1,
                      align: 'center'
                    }
                  ]
                }
              ],
              backgroundColor: '#F5F5F5',
              paddingAll: '12px',
              cornerRadius: '8px'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            // 每日記錄
            ...dailyContents
          ]
        }
      }
    };
    
    // 檢查 JSON 大小
    const jsonString = JSON.stringify(message);
    const jsonSize = new Blob([jsonString]).getSize();
    
    Logger.log(' Flex Message 生成成功');
    Logger.log('');
    Logger.log(' 訊息大小檢查:');
    Logger.log(`   JSON 長度: ${jsonString.length} 字元`);
    Logger.log(`   檔案大小: ${jsonSize} bytes`);
    Logger.log(`   檔案大小: ${(jsonSize / 1024).toFixed(2)} KB`);
    Logger.log('');
    
    if (jsonSize > 50000) {
      Logger.log(' 警告: Flex Message 可能太大！');
      Logger.log('   LINE 的 Flex Message 限制約 50KB');
      Logger.log('');
      Logger.log(' 建議:');
      Logger.log('   1. 使用 Carousel 分頁顯示');
      Logger.log('   2. 減少每頁顯示的記錄數');
    } else {
      Logger.log(' 大小正常（小於 50KB）');
    }
    
    Logger.log('');
    Logger.log(' Flex Message JSON 預覽（前 500 字元）:');
    Logger.log(jsonString.substring(0, 500) + '...');
    Logger.log('');
    
    // 檢查是否有特殊字元
    Logger.log(' 檢查特殊字元:');
    
    const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(jsonString);
    const hasSpecialChars = /[^\x00-\x7F]/g.test(jsonString);
    
    if (hasEmoji) {
      Logger.log('    包含 Emoji');
    }
    if (hasSpecialChars) {
      Logger.log('    包含非 ASCII 字元（中文等）');
    }
    if (!hasEmoji && !hasSpecialChars) {
      Logger.log('    沒有特殊字元');
    }
    
    Logger.log('');
    
    // 驗證 JSON 結構
    Logger.log(' 驗證 JSON 結構:');
    
    try {
      const parsed = JSON.parse(jsonString);
      Logger.log('    JSON 格式正確');
      
      // 檢查必要欄位
      const checks = [
        ['type', parsed.type === 'flex'],
        ['altText', !!parsed.altText],
        ['contents', !!parsed.contents],
        ['contents.type', parsed.contents.type === 'bubble'],
        ['contents.body', !!parsed.contents.body]
      ];
      
      checks.forEach(([field, valid]) => {
        if (valid) {
          Logger.log(`    ${field} 正確`);
        } else {
          Logger.log(`    ${field} 有問題`);
        }
      });
      
    } catch (parseError) {
      Logger.log('    JSON 解析失敗: ' + parseError.message);
    }
    
    Logger.log('');
    
    // 嘗試實際發送（使用假 token）
    Logger.log(' 測試發送:');
    
    const testReplyToken = 'test-token-' + Date.now();
    
    try {
      sendLineReply_(testReplyToken, [message]);
      Logger.log('    sendLineReply_ 執行成功');
      Logger.log('   （會看到 Invalid reply token 是正常的）');
    } catch (sendError) {
      Logger.log('    sendLineReply_ 執行失敗: ' + sendError.message);
      Logger.log('   這可能是問題所在！');
    }
    
  } catch (error) {
    Logger.log(' 生成 Flex Message 失敗');
    Logger.log('   錯誤: ' + error.message);
    Logger.log('   堆疊: ' + error.stack);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 檢查完成');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  測試修正後的月份查詢
 * 
 * 執行這個函數來測試 2026-02 的查詢是否正常
 */
function testFixedMonthQuery() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試修正後的月份查詢');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  // 測試參數
  const testCases = [
    {
      name: '連宜蓁',
      userId: 'Uf69dfe3aad5589e2f219d919cb44d469',
      yearMonth: '2026-02'
    },
    {
      name: '石彥儒',
      userId: 'U832116fa2b07abec1b0a478fbf28ed14',
      yearMonth: '2026-02'
    },
    {
      name: '陳子賢',
      userId: 'U33382af8df2f04d0413ca30aebde3728',
      yearMonth: '2026-02'
    }
  ];
  
  testCases.forEach((testCase, index) => {
    Logger.log(`\n 測試 ${index + 1}: ${testCase.name}`);
    Logger.log(`   userId: ${testCase.userId}`);
    Logger.log(`   查詢月份: ${testCase.yearMonth}`);
    Logger.log('───────────────────────────────────────');
    
    try {
      const records = getMonthlyPunchRecords(testCase.userId, testCase.yearMonth);
      
      Logger.log(`    查詢成功！`);
      Logger.log(`    找到 ${records.length} 筆記錄`);
      
      if (records.length > 0) {
        Logger.log('');
        Logger.log('   前 3 筆記錄：');
        records.slice(0, 3).forEach((record, i) => {
          Logger.log(`   ${i + 1}. ${record.date} ${record.time} - ${record.type}`);
        });
      } else {
        Logger.log('    沒有找到記錄（但應該要有！）');
      }
      
    } catch (error) {
      Logger.log(`    查詢失敗: ${error.message}`);
    }
  });
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試完成');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  檢查特定員工的所有記錄月份分布
 */
function checkEmployeeMonthDistribution() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 檢查員工記錄月份分布');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const userId = 'Uf69dfe3aad5589e2f219d919cb44d469'; // 連宜蓁
  const sheet = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE);
  const values = sheet.getDataRange().getValues();
  
  const monthCount = {};
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === userId) {
      const rawDate = values[i][0];
      
      let recordDate;
      if (rawDate instanceof Date) {
        recordDate = rawDate;
      } else if (typeof rawDate === 'string') {
        recordDate = new Date(rawDate);
      } else {
        continue;
      }
      
      if (isNaN(recordDate.getTime())) continue;
      
      // 使用修正後的方式取得年月
      const yearMonth = Utilities.formatDate(recordDate, 'Asia/Taipei', 'yyyy-MM');
      
      monthCount[yearMonth] = (monthCount[yearMonth] || 0) + 1;
    }
  }
  
  Logger.log(' 連宜蓁 的記錄分布：');
  Logger.log('');
  
  Object.keys(monthCount).sort().forEach(month => {
    Logger.log(`   ${month}: ${monthCount[month]} 筆`);
  });
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  直接測試 LINE Bot 的完整流程
 */
function testLineMonthQuery() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 模擬 LINE Bot 查詢流程');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const userId = 'Uf69dfe3aad5589e2f219d919cb44d469';
  const employeeName = '連宜蓁';
  const yearMonth = '2026-02';
  const testReplyToken = 'test-token-' + Date.now();
  
  Logger.log(' 模擬用戶操作：');
  Logger.log(`   用戶: ${employeeName}`);
  Logger.log(`   查詢月份: ${yearMonth}`);
  Logger.log('');
  
  try {
    Logger.log(' 執行 sendMonthlyRecords...');
    sendMonthlyRecords(testReplyToken, userId, employeeName, yearMonth);
    
    Logger.log('');
    Logger.log(' 函數執行完成');
    Logger.log('');
    Logger.log(' 請檢查上方的 log 輸出：');
    Logger.log('   - 是否有「找到 X 筆打卡記錄」');
    Logger.log('   - 是否有建立 Flex Message');
    Logger.log('   - 是否有發送訊息（會看到 Invalid reply token 是正常的）');
    
  } catch (error) {
    Logger.log(' 執行失敗: ' + error.message);
    Logger.log('   堆疊: ' + error.stack);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  完整測試 Eric 的月份查詢流程
 */
function testEricMonthQuery() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試 Eric 的月份查詢流程');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  // 先檢查 Eric 的資料
  checkEricRecords();
  
  Logger.log('');
  Logger.log(' 模擬 LINE Bot 查詢:');
  Logger.log('');
  
  // 從員工表找 Eric 的 userId
  const empSheet = getSpreadsheet_().getSheetByName('員工資料');
  const empValues = empSheet.getDataRange().getValues();
  
  let ericUserId = null;
  let ericName = null;
  
  for (let i = 1; i < empValues.length; i++) {
    const name = empValues[i][1];
    if (name && (name.includes('洪培瑜') || name.includes('Eric'))) {
      ericUserId = empValues[i][4];
      ericName = empValues[i][1];
      break;
    }
  }
  
  if (!ericUserId) {
    Logger.log(' 找不到 Eric 的資料');
    return;
  }
  
  const testReplyToken = 'test-token-' + Date.now();
  const yearMonth = '2026-02';
  
  Logger.log(`   用戶: ${ericName}`);
  Logger.log(`   userId: ${ericUserId}`);
  Logger.log(`   查詢月份: ${yearMonth}`);
  Logger.log('');
  
  try {
    Logger.log(' 執行 sendMonthlyRecords...');
    sendMonthlyRecords(testReplyToken, ericUserId, ericName, yearMonth);
    
    Logger.log('');
    Logger.log(' 執行完成');
    
  } catch (error) {
    Logger.log(' 執行失敗: ' + error.message);
    Logger.log('   堆疊: ' + error.stack);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  檢查當前的圖文選單狀態
 */
function checkRichMenuStatus() {
  try {
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 檢查圖文選單狀態');
    Logger.log('═══════════════════════════════════════');
    Logger.log('');
    
    const channelAccessToken = PropertiesService.getScriptProperties()
      .getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!channelAccessToken) {
      Logger.log(' 找不到 LINE_CHANNEL_ACCESS_TOKEN');
      return;
    }
    
    // 列出所有圖文選單
    const listUrl = 'https://api.line.me/v2/bot/richmenu/list';
    
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(listUrl, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      Logger.log(' 圖文選單列表：');
      Logger.log('');
      
      if (result.richmenus && result.richmenus.length > 0) {
        result.richmenus.forEach((menu, index) => {
          Logger.log(`${index + 1}. ${menu.name}`);
          Logger.log(`   ID: ${menu.richMenuId}`);
          Logger.log(`   尺寸: ${menu.size.width}x${menu.size.height}`);
          Logger.log(`   選單文字: ${menu.chatBarText}`);
          Logger.log(`   已設定: ${menu.selected ? '是' : '否'}`);
          Logger.log('');
        });
      } else {
        Logger.log('目前沒有圖文選單');
      }
    } else {
      Logger.log(' 取得失敗');
      Logger.log('   回應: ' + response.getContentText());
    }
    
    Logger.log('═══════════════════════════════════════');
    
  } catch (error) {
    Logger.log(' 檢查失敗: ' + error.message);
  }
}

/**
 *  測試實際的月份查詢函數
 */
function testActualMonthQuery() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試實際的月份查詢函數');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const userId = 'Ue76b65367821240ac26387d2972a5adf';
  const yearMonth = '2026-02';
  
  Logger.log(` 測試參數:`);
  Logger.log(`   userId: ${userId}`);
  Logger.log(`   yearMonth: ${yearMonth}`);
  Logger.log('');
  
  // 呼叫實際的查詢函數
  Logger.log(' 呼叫 getMonthlyPunchRecords...');
  const records = getMonthlyPunchRecords(userId, yearMonth);
  
  Logger.log('');
  Logger.log(` 回傳結果: ${records.length} 筆`);
  Logger.log('');
  
  if (records.length > 0) {
    Logger.log(' 記錄內容:');
    records.forEach((record, index) => {
      Logger.log(`${index + 1}. ${record.date} ${record.time} - ${record.type} @ ${record.location}`);
    });
  } else {
    Logger.log(' 沒有回傳任何記錄！');
    Logger.log('');
    Logger.log('這表示 getMonthlyPunchRecords 函數有問題');
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  測試完整的 sendMonthlyRecords 流程
 */
function testFullMonthlyRecordsFlow() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試完整的月份查詢流程');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const userId = 'Ue76b65367821240ac26387d2972a5adf';
  const employeeName = '洪培瑜Eric';
  const yearMonth = '2026-02';
  const testReplyToken = 'test-token-' + Date.now();
  
  Logger.log(` 測試 sendMonthlyRecords:`);
  Logger.log(`   userId: ${userId}`);
  Logger.log(`   employeeName: ${employeeName}`);
  Logger.log(`   yearMonth: ${yearMonth}`);
  Logger.log('');
  
  try {
    Logger.log(' 呼叫 sendMonthlyRecords...');
    sendMonthlyRecords(testReplyToken, userId, employeeName, yearMonth);
    
    Logger.log('');
    Logger.log(' 函數執行完成（請檢查上方的 log）');
    Logger.log('');
    Logger.log(' 預期應該看到:');
    Logger.log('   - "找到 6 筆打卡記錄"');
    Logger.log('   - Flex Message 建立成功');
    Logger.log('   - LINE 回覆發送（會顯示 Invalid reply token 是正常的）');
    
  } catch (error) {
    Logger.log('');
    Logger.log(' 函數執行失敗:');
    Logger.log(`   錯誤: ${error.message}`);
    Logger.log(`   堆疊: ${error.stack}`);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  完整測試 LINE Bot 月份查詢流程
 */
function fullTestLineMonthQuery() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 完整測試 LINE Bot 月份查詢');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const testUserId = 'Ue76b65367821240ac26387d2972a5adf';
  
  // 步驟 1: 檢查員工資料
  Logger.log('步驟 1: 檢查員工資料');
  const employee = findEmployeeByLineUserId_(testUserId);
  
  if (!employee.ok) {
    Logger.log(' 找不到員工資料！');
    Logger.log('   這就是問題所在！');
    return;
  }
  
  Logger.log(' 員工資料:');
  Logger.log(`   name: ${employee.name}`);
  Logger.log(`   dept: ${employee.dept}`);
  Logger.log('');
  
  // 步驟 2: 模擬完整流程
  Logger.log('步驟 2: 模擬 LINE Bot 處理流程');
  
  const mockEvent = {
    type: 'message',
    replyToken: 'test-' + Date.now(),
    source: { userId: testUserId },
    message: { type: 'text', text: '查詢:2026-02' }
  };
  
  Logger.log(' 事件內容:');
  Logger.log(`   userId: ${mockEvent.source.userId}`);
  Logger.log(`   text: ${mockEvent.message.text}`);
  Logger.log('');
  
  try {
    handleLineMessage(mockEvent);
    Logger.log('');
    Logger.log(' handleLineMessage 執行完成');
  } catch (error) {
    Logger.log('');
    Logger.log(' handleLineMessage 執行失敗:');
    Logger.log(`   ${error.message}`);
    Logger.log(`   ${error.stack}`);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}


// ==================== 來自 LineNotification.gs ====================
/**
 * 每日早上檢查昨天忘記下班打卡（只檢查平日）
 * 設定觸發器：每天早上 9:00 執行
 */
function checkForgotPunchDaily() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  //  新增：檢查昨天是否為平日
  if (!isWeekday(yesterday)) {
    Logger.log(`⏭ ${Utilities.formatDate(yesterday, "GMT+8", "yyyy-MM-dd")} 是週末，跳過檢查`);
    return;
  }
  
  const dateStr = Utilities.formatDate(yesterday, "GMT+8", "yyyy-MM-dd");
  
  const attendanceSheet = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE);
  const employeeSheet = getSpreadsheet_().getSheetByName(SHEET_EMPLOYEES);
  
  if (!attendanceSheet || !employeeSheet) {
    Logger.log(" 找不到必要的工作表");
    return;
  }
  
  const employees = employeeSheet.getDataRange().getValues();
  const attendances = attendanceSheet.getDataRange().getValues();
  const headers = attendances[0];
  
  Logger.log(` 開始檢查 ${dateStr} (平日) 的下班打卡`);
  
  // 遍歷所有員工
  for (let i = 1; i < employees.length; i++) {
    const userId = employees[i][EMPLOYEE_COL.USER_ID];
    const name = employees[i][EMPLOYEE_COL.NAME];
    const status = employees[i][EMPLOYEE_COL.STATUS];
    
    if (status !== '啟用') continue;
    
    // 檢查昨天的打卡記錄
    let hasPunchOut = false;
    
    for (let j = 1; j < attendances.length; j++) {
      const recordDate = formatDate(attendances[j][0]);
      const recordUserId = attendances[j][1];
      const recordType = attendances[j][4]; // 打卡類別
      
      if (recordUserId === userId && recordDate === dateStr && recordType === '下班') {
        hasPunchOut = true;
        break;
      }
    }
    
    // 發送通知
    if (!hasPunchOut) {
      try {
        notifyForgotPunch(userId, name, dateStr, "下班");
        Logger.log(` 已提醒 ${name} 昨天忘記下班打卡`);
      } catch (err) {
        Logger.log(` 提醒 ${name} 失敗: ${err.message}`);
      }
    }
  }
  
  Logger.log(" 下班打卡檢查完成");
}

/**
 * 每日早上檢查昨天忘記上班打卡（只檢查平日）
 * 設定觸發器：每天早上 9:00 執行
 */
function checkForgotPunchInMorning() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  //  新增：檢查昨天是否為平日
  if (!isWeekday(yesterday)) {
    Logger.log(`⏭ ${Utilities.formatDate(yesterday, "GMT+8", "yyyy-MM-dd")} 是週末，跳過檢查`);
    return;
  }
  
  const dateStr = Utilities.formatDate(yesterday, "GMT+8", "yyyy-MM-dd");
  
  const attendanceSheet = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE);
  const employeeSheet = getSpreadsheet_().getSheetByName(SHEET_EMPLOYEES);
  
  if (!attendanceSheet || !employeeSheet) {
    Logger.log(" 找不到必要的工作表");
    return;
  }
  
  const employees = employeeSheet.getDataRange().getValues();
  const attendances = attendanceSheet.getDataRange().getValues();
  
  Logger.log(` 開始檢查 ${dateStr} (平日) 的上班打卡`);
  
  for (let i = 1; i < employees.length; i++) {
    const userId = employees[i][EMPLOYEE_COL.USER_ID];
    const name = employees[i][EMPLOYEE_COL.NAME];
    const status = employees[i][EMPLOYEE_COL.STATUS];
    
    if (status !== '啟用') continue;
    
    let hasPunchIn = false;
    
    for (let j = 1; j < attendances.length; j++) {
      const recordDate = formatDate(attendances[j][0]);
      const recordUserId = attendances[j][1];
      const recordType = attendances[j][4];
      
      if (recordUserId === userId && recordDate === dateStr && recordType === '上班') {
        hasPunchIn = true;
        break;
      }
    }
    
    if (!hasPunchIn) {
      try {
        notifyForgotPunch(userId, name, dateStr, "上班");
        Logger.log(` 已提醒 ${name} 昨天忘記上班打卡`);
      } catch (err) {
        Logger.log(` 提醒 ${name} 失敗: ${err.message}`);
      }
    }
  }
  
  Logger.log(" 上班打卡檢查完成");
}

/**
 * 測試忘記打卡通知
 */
function testForgotPunchNotification() {
  const testUserId = "U7211ffe337b29ad1f738815cb8bfdf81";
  const testName = "測試員工";
  const testDate = "2025-10-12";
  
  Logger.log(" 測試發送忘記打卡通知...");
  const result = notifyForgotPunch(testUserId, testName, testDate, "上班");
  Logger.log(result.ok ? " 通知發送成功" : " 通知發送失敗: " + result.error);
}

/**
 * 測試補打卡審核通知（核准）
 */
function testPunchApprovedNotification() {
  const testUserId = "U7211ffe337b29ad1f738815cb8bfdf81";
  const testName = "測試員工";
  const testDate = "2025-10-12";
  const testTime = "09:00";
  const reviewer = "管理員";
  
  Logger.log(" 測試發送補打卡核准通知...");
  const result = notifyPunchReview(testUserId, testName, testDate, testTime, "上班", reviewer, true);
  Logger.log(result.ok ? " 通知發送成功" : " 通知發送失敗: " + result.error);
}

/**
 * 測試補打卡審核通知（拒絕）
 */
function testPunchRejectedNotification() {
  const testUserId = "U7211ffe337b29ad1f738815cb8bfdf81";
  const testName = "測試員工";
  const testDate = "2025-10-12";
  const testTime = "09:00";
  const reviewer = "管理員";
  const reason = "時間不符，請重新申請";
  
  Logger.log(" 測試發送補打卡拒絕通知...");
  const result = notifyPunchReview(testUserId, testName, testDate, testTime, "上班", reviewer, false, reason);
  Logger.log(result.ok ? " 通知發送成功" : " 通知發送失敗: " + result.error);
}

/**
 * 測試請假審核通知（核准）
 */
function testLeaveApprovedNotification() {
  const testUserId = "U7211ffe337b29ad1f738815cb8bfdf81";
  const testName = "測試員工";
  const leaveType = "特休假";
  const startDate = "2025-10-15";
  const endDate = "2025-10-17";
  const days = 3;
  const reviewer = "管理員";
  
  Logger.log(" 測試發送請假核准通知...");
  const result = notifyLeaveReview(testUserId, testName, leaveType, startDate, endDate, days, reviewer, true);
  Logger.log(result.ok ? " 通知發送成功" : " 通知發送失敗: " + result.error);
}

/**
 * 測試請假審核通知（拒絕）
 */
function testLeaveRejectedNotification() {
  const testUserId = "U7211ffe337b29ad1f738815cb8bfdf81";
  const testName = "測試員工";
  const leaveType = "特休假";
  const startDate = "2025-10-15";
  const endDate = "2025-10-17";
  const days = 3;
  const reviewer = "管理員";
  const reason = "該時段人力不足，請調整日期";
  
  Logger.log(" 測試發送請假拒絕通知...");
  const result = notifyLeaveReview(testUserId, testName, leaveType, startDate, endDate, days, reviewer, false, reason);
  Logger.log(result.ok ? " 通知發送成功" : " 通知發送失敗: " + result.error);
}

/**
 * 測試加班審核通知（核准）
 */
function testOvertimeApprovedNotification() {
  const testUserId = "U7211ffe337b29ad1f738815cb8bfdf81";
  const testName = "測試員工";
  const date = "2025-10-12";
  const hours = 3;
  const reviewer = "管理員";
  
  Logger.log(" 測試發送加班核准通知...");
  const result = notifyOvertimeReview(testUserId, testName, date, hours, reviewer, true);
  Logger.log(result.ok ? " 通知發送成功" : " 通知發送失敗: " + result.error);
}

/**
 * 測試加班審核通知（拒絕）
 */
function testOvertimeRejectedNotification() {
  const testUserId = "U7211ffe337b29ad1f738815cb8bfdf81";
  const testName = "測試員工";
  const date = "2025-10-12";
  const hours = 3;
  const reviewer = "管理員";
  const reason = "未事先申請，請下次提前告知";
  
  Logger.log(" 測試發送加班拒絕通知...");
  const result = notifyOvertimeReview(testUserId, testName, date, hours, reviewer, false, reason);
  Logger.log(result.ok ? " 通知發送成功" : " 通知發送失敗: " + result.error);
}

/**
 * 測試所有通知（一次執行所有測試）
 */
function testAllNotifications() {
  Logger.log("========== 開始測試所有通知類型 ==========\n");
  
  testForgotPunchNotification();
  Utilities.sleep(1000);
  
  testPunchApprovedNotification();
  Utilities.sleep(1000);
  
  testPunchRejectedNotification();
  Utilities.sleep(1000);
  
  testLeaveApprovedNotification();
  Utilities.sleep(1000);
  
  testLeaveRejectedNotification();
  Utilities.sleep(1000);
  
  testOvertimeApprovedNotification();
  Utilities.sleep(1000);
  
  testOvertimeRejectedNotification();
  
  Logger.log("\n========== 所有測試完成 ==========");
}


// ==================== 來自 Main.gs ====================
/**
 * 測試排班系統
 */
function testShiftAPI() {
  Logger.log('===== 測試排班 API =====');
  
  // 模擬前端請求參數
  const testParams = {
    token: '2d3ce046-3dcc-4a62-ac92-ac0c87993669',  // 請替換成真實的 token
    employeeId: 'U123456',
    employeeName: '測試員工',
    date: '2025-10-25',
    shiftType: '早班',
    startTime: '09:00',
    endTime: '18:00',
    location: '台北辦公室',
    note: '測試排班'
  };
  
  // 測試新增排班
  const addResult = handleAddShift(testParams);
  Logger.log('新增排班結果: ' + JSON.stringify(addResult));
  
  // 測試查詢排班
  const queryParams = {
    token: '2d3ce046-3dcc-4a62-ac92-ac0c87993669',
    employeeId: 'U123456'
  };
  const queryResult = handleGetShifts(queryParams);
  Logger.log('查詢排班結果: ' + JSON.stringify(queryResult));
}


// ==================== 來自 SalaryManagement.gs ====================
function testCheckMonthlySalarySheet() {
  const sheet = getMonthlySalarySheetEnhanced();
  const lastRow = sheet.getLastRow();
  
  Logger.log(' 月薪資記錄總行數: ' + lastRow);
  
  if (lastRow > 1) {
    const lastData = sheet.getRange(lastRow, 1, 1, 5).getValues()[0];
    Logger.log(' 最後一筆記錄:');
    Logger.log('   薪資單ID: ' + lastData[0]);
    Logger.log('   員工ID: ' + lastData[1]);
    Logger.log('   員工姓名: ' + lastData[2]);
    Logger.log('   年月: ' + lastData[3]);
  }
}

function checkLatestSaveLog() {
  Logger.log(' 檢查最近的儲存記錄...');
  
  // 1. 檢查薪資設定表
  const configSheet = getEmployeeSalarySheet();
  const configLastRow = configSheet.getLastRow();
  Logger.log(` 薪資設定表總行數: ${configLastRow}`);
  
  if (configLastRow > 1) {
    const lastConfig = configSheet.getRange(configLastRow, 1, 1, 5).getValues()[0];
    Logger.log('   最後一筆設定:');
    Logger.log('   - 員工ID: ' + lastConfig[0]);
    Logger.log('   - 員工姓名: ' + lastConfig[1]);
    Logger.log('   - 基本薪資: ' + lastConfig[5]);
  }
  
  // 2. 檢查月薪資記錄表
  const salarySheet = getMonthlySalarySheetEnhanced();
  const salaryLastRow = salarySheet.getLastRow();
  Logger.log(`\n 月薪資記錄表總行數: ${salaryLastRow}`);
  
  if (salaryLastRow > 1) {
    const lastSalary = salarySheet.getRange(salaryLastRow, 1, 1, 5).getValues()[0];
    Logger.log('   最後一筆記錄:');
    Logger.log('   - 薪資單ID: ' + lastSalary[0]);
    Logger.log('   - 員工ID: ' + lastSalary[1]);
    Logger.log('   - 員工姓名: ' + lastSalary[2]);
    Logger.log('   - 年月: ' + lastSalary[3]);
  }
}

function testSaveAndSync() {
  const testData = {
    employeeId: 'Ue76b65367821240ac26387d2972a5adf',
    employeeName: 'Eric',
    idNumber: '',
    employeeType: '正職',
    salaryType: '月薪',
    baseSalary: 34000,
    positionAllowance: 0,
    mealAllowance: 2400,
    transportAllowance: 0,
    attendanceBonus: 1000,
    performanceBonus: 0,
    otherAllowances: 0,
    bankCode: '822',
    bankAccount: '123456789',
    hireDate: '',
    paymentDay: '5',
    pensionSelfRate: 0,
    laborFee: 682,
    healthFee: 527,
    employmentFee: 68,
    pensionSelf: 0,
    incomeTax: 0,
    welfareFee: 0,
    dormitoryFee: 0,
    groupInsurance: 0,
    otherDeductions: 0,
    note: '測試'
  };
  
  Logger.log(' 開始測試薪資設定與同步');
  const result = setEmployeeSalaryTW(testData);
  
  Logger.log('\n 最終結果:');
  Logger.log(JSON.stringify(result, null, 2));
  
  // 檢查是否真的寫入了
  SpreadsheetApp.flush();
  checkLatestSaveLog();
}

/**
 *  測試時薪計算（使用實際打卡資料）
 */
function testCalculateHourlySalary() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試時薪計算');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const employeeId = 'U68e0ca9d516e63ed15bf9387fad174ac';
  const yearMonth = '2025-12';
  
  const result = calculateMonthlySalary(employeeId, yearMonth);
  
  Logger.log('');
  Logger.log(' 計算結果:');
  Logger.log(JSON.stringify(result, null, 2));
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  測試打卡工時計算
 */
function testGetEmployeeMonthlyAttendance() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試 getEmployeeMonthlyAttendance');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const employeeId = 'U68e0ca9d516e63ed15bf9387fad174ac'; // CSF
  const yearMonth = '2025-12';
  
  const records = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
  
  Logger.log('');
  Logger.log(' 測試結果：找到 ' + records.length + ' 筆記錄');
  Logger.log('');
  
  let totalHours = 0;
  
  records.forEach(record => {
    Logger.log(`   ${record.date}: ${record.punchIn || '--'} ~ ${record.punchOut || '--'}, 工時: ${record.workHours.toFixed(2)}h`);
    totalHours += record.workHours;
  });
  
  Logger.log('');
  Logger.log(' 總工時: ' + totalHours.toFixed(2) + ' 小時');
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  測試病假半薪計算
 */
function testSickLeaveHalfPay() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試病假半薪計算');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf'; // 替換成實際員工ID
  const yearMonth = '2026-01';
  
  const result = calculateMonthlySalary(employeeId, yearMonth);
  
  if (result.success) {
    const data = result.data;
    Logger.log(' 計算成功');
    Logger.log(`   員工: ${data.employeeName}`);
    Logger.log(`   基本薪資: $${data.baseSalary}`);
    Logger.log(`   病假: ${data.sickLeaveHours || 0} 天`);
    Logger.log(`   病假扣款: $${data.sickLeaveDeduction || 0} (半薪)`);
    Logger.log(`   事假: ${data.personalLeaveHours || 0} 天`);
    Logger.log(`   事假扣款: $${data.personalLeaveDeduction || 0} (全薪)`);
    Logger.log(`   總扣款: $${data.leaveDeduction}`);
    Logger.log(`   實發金額: $${data.netSalary}`);
  } else {
    Logger.log(' 計算失敗:', result.message);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

function testExportSalaryDirect() {
  Logger.log(' 开始测试汇出功能');
  
  // 模拟请求参数
  const mockParams = {
    action: 'exportAllSalaryExcel',
    token: '48c4c025-f8fa-4528-9429-910b507c6774',  //  替换成真实的 token
    yearMonth: '2025-12',
    callback: 'callback'
  };
  
  // 模拟 doGet 请求
  const mockEvent = {
    parameter: mockParams
  };
  
  const result = doGet(mockEvent);
  Logger.log(' 测试结果:');
  Logger.log(result.getContent());
}

function testCheckSalaryData() {
  Logger.log(' 檢查薪資記錄資料結構');
  
  const ss = getSpreadsheet_();
  const salarySheet = ss.getSheetByName('月薪資記錄');
  
  if (!salarySheet) {
    Logger.log(' 找不到「月薪資記錄」工作表');
    return;
  }
  
  const lastRow = salarySheet.getLastRow();
  Logger.log(` 總行數: ${lastRow}`);
  
  if (lastRow <= 1) {
    Logger.log(' 工作表中沒有資料');
    return;
  }
  
  // 取得標題列
  const headers = salarySheet.getRange(1, 1, 1, salarySheet.getLastColumn()).getValues()[0];
  Logger.log(` 欄位標題: ${headers.join(', ')}`);
  
  // 取得前 5 筆資料
  const sampleData = salarySheet.getRange(2, 1, Math.min(5, lastRow - 1), salarySheet.getLastColumn()).getValues();
  
  Logger.log('\n 前 5 筆資料:');
  sampleData.forEach((row, index) => {
    Logger.log(`\n第 ${index + 1} 筆:`);
    Logger.log(`   員工ID (col 2): ${row[1]}`);
    Logger.log(`   員工姓名 (col 3): ${row[2]}`);
    Logger.log(`   年月 (col 4): ${row[3]} (型別: ${typeof row[3]})`);
    
    if (row[3] instanceof Date) {
      Logger.log(`   年月 (格式化): ${Utilities.formatDate(row[3], 'Asia/Taipei', 'yyyy-MM')}`);
    }
  });
}

function testEricSalary() {
  const employeeId = 'Ud3b574f260f5a777337158ccd4ff0ba2'; // Eric 的 ID
  const yearMonth = '2025-12';
  
  const result = calculateMonthlySalary(employeeId, yearMonth);
  
  Logger.log(' 計算結果:');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 *  測試取得 Eric 的工作時數（後端驗證）
 */
function testEricWorkHours() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試 Eric 的工作時數');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  const employeeId = 'Ud3b574f260f5a777337158ccd4ff0ba2'; // Eric
  const yearMonth = '2025-12';
  
  Logger.log(` 員工ID: ${employeeId}`);
  Logger.log(` 查詢月份: ${yearMonth}`);
  Logger.log('');
  
  // ==================== 方法 1：直接呼叫內部函數 ====================
  Logger.log(' 方法 1：呼叫 getEmployeeMonthlyAttendanceInternal');
  Logger.log('─────────────────────────────────────');
  
  const attendanceRecords = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
  
  Logger.log(` 找到 ${attendanceRecords.length} 筆打卡記錄`);
  Logger.log('');
  
  // 計算總工時
  let totalWorkHours = 0;
  
  Logger.log(' 每日工時明細:');
  attendanceRecords.forEach(record => {
    if (record.workHours > 0) {
      totalWorkHours += record.workHours;
      Logger.log(`   ${record.date}: ${record.punchIn || '--'} ~ ${record.punchOut || '--'} = ${record.workHours.toFixed(1)}h`);
    } else {
      Logger.log(`   ${record.date}: ${record.punchIn || '--'} ~ ${record.punchOut || '--'} = 打卡不完整`);
    }
  });
  
  Logger.log('');
  Logger.log('─────────────────────────────────────');
  Logger.log(` 總工作時數: ${totalWorkHours.toFixed(1)} 小時`);
  Logger.log(` 出勤天數: ${attendanceRecords.filter(r => r.workHours > 0).length} 天`);
  Logger.log('─────────────────────────────────────');
  Logger.log('');
  
  // ==================== 方法 2：呼叫 calculateEmployeeWorkHours ====================
  Logger.log(' 方法 2：呼叫 calculateEmployeeWorkHours');
  Logger.log('─────────────────────────────────────');
  
  const result = calculateEmployeeWorkHours(employeeId, yearMonth);
  
  if (result.success) {
    Logger.log(` 成功取得工作時數: ${result.totalWorkHours.toFixed(1)}h`);
  } else {
    Logger.log(` 失敗: ${result.message}`);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試完成');
  Logger.log('═══════════════════════════════════════');
  
  // ==================== 方法 3：檢查薪資計算結果 ====================
  Logger.log('');
  Logger.log(' 方法 3：檢查薪資計算結果中的工作時數');
  Logger.log('─────────────────────────────────────');
  
  const salaryResult = calculateMonthlySalary(employeeId, yearMonth);
  
  if (salaryResult.success) {
    const data = salaryResult.data;
    Logger.log(` 薪資類型: ${data.salaryType}`);
    Logger.log(` 時薪: $${data.hourlyRate || 0}`);
    Logger.log(` 工作時數: ${data.totalWorkHours || 0}h`);
    Logger.log(` 基本薪資: $${data.baseSalary}`);
    Logger.log(` 加班時數: ${data.totalOvertimeHours || 0}h`);
  } else {
    Logger.log(` 計算失敗: ${salaryResult.message}`);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

function testSalaryTypePreservation() {
  Logger.log(' 測試薪資類型保存');
  
  // 測試時薪員工
  const hourlyEmployeeId = 'U68e0ca9d516e63ed15bf9387fad174ac'; // CSF
  const monthlyEmployeeId = 'Ud3b574f260f5a777337158ccd4ff0ba2'; // Eric
  const yearMonth = '2025-12';
  
  Logger.log('\n 測試時薪員工:');
  const hourlyResult = calculateMonthlySalary(hourlyEmployeeId, yearMonth);
  if (hourlyResult.success) {
    Logger.log(`   薪資類型: ${hourlyResult.data.salaryType}`);
    Logger.log(`   時薪: ${hourlyResult.data.hourlyRate}`);
    Logger.log(`   基本薪資: ${hourlyResult.data.baseSalary}`);
    saveMonthlySalary(hourlyResult.data);
  }
  
  Logger.log('\n 測試月薪員工:');
  const monthlyResult = calculateMonthlySalary(monthlyEmployeeId, yearMonth);
  if (monthlyResult.success) {
    Logger.log(`   薪資類型: ${monthlyResult.data.salaryType}`);
    Logger.log(`   時薪: ${monthlyResult.data.hourlyRate}`);
    Logger.log(`   基本薪資: ${monthlyResult.data.baseSalary}`);
    saveMonthlySalary(monthlyResult.data);
  }
  
  Logger.log('\n 測試完成，請檢查「月薪資記錄」工作表');
}

function debugCSFSalary() {
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf'; // CSF
  const yearMonth = '2026-01';
  
  Logger.log(' 測試 CSF 的薪資計算');
  
  // 步驟 1：計算薪資
  const result = calculateMonthlySalary(employeeId, yearMonth);
  
  Logger.log(' 計算結果:');
  Logger.log('   success: ' + result.success);
  
  if (result.success && result.data) {
    Logger.log('   薪資類型: ' + result.data.salaryType);
    Logger.log('   時薪: ' + result.data.hourlyRate);
    Logger.log('   工作時數: ' + result.data.totalWorkHours);
    Logger.log('   基本薪資: ' + result.data.baseSalary);
    Logger.log('   應發總額: ' + result.data.grossSalary);
    Logger.log('   實發金額: ' + result.data.netSalary);
    
    // ⭐⭐⭐ 檢查完整的 data 結構
    Logger.log('\n完整的 result.data:');
    Logger.log(JSON.stringify(result.data, null, 2));
  } else {
    Logger.log(' 計算失敗: ' + result.message);
  }
  
  // 步驟 2：檢查 Sheet 中的資料
  Logger.log('\n 檢查 Sheet 中的資料:');
  const sheet = getMonthlySalarySheetEnhanced();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const salaryIdToFind = `SAL-${yearMonth}-${employeeId}`;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === salaryIdToFind) {
      Logger.log(` 找到薪資單: ${salaryIdToFind}`);
      Logger.log(`   薪資類型 (欄位5): ${data[i][4]}`);
      Logger.log(`   時薪 (欄位6): ${data[i][5]}`);
      Logger.log(`   工作時數 (欄位7): ${data[i][6]}`);
      Logger.log(`   基本薪資 (欄位9): ${data[i][8]}`);
      Logger.log(`   應發總額 (欄位30): ${data[i][29]}`);
      Logger.log(`   實發金額 (欄位31): ${data[i][30]}`);
      break;
    }
  }
}

function checkSheetColumns() {
  const sheet = getMonthlySalarySheetEnhanced();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  Logger.log(' 月薪資記錄 Sheet 的欄位:');
  headers.forEach((header, index) => {
    Logger.log(`   欄位 ${index + 1}: ${header}`);
  });
  
  Logger.log(`\n 總共 ${headers.length} 個欄位`);
}

function debugEricSalaryFull() {
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf'; // Eric
  const yearMonth = '2026-01';
  
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試 Eric 的薪資計算與儲存（完整版）');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  // 步驟 1：計算薪資
  Logger.log(' 步驟 1：計算薪資...');
  const result = calculateMonthlySalary(employeeId, yearMonth);
  
  if (!result.success) {
    Logger.log(' 計算失敗: ' + result.message);
    return;
  }
  
  Logger.log(' 計算成功');
  Logger.log(`   應發總額: $${result.data.grossSalary}`);
  Logger.log(`   實發金額: $${result.data.netSalary}`);
  Logger.log('');
  
  // 步驟 2：儲存薪資
  Logger.log(' 步驟 2：儲存薪資...');
  const saveResult = saveMonthlySalary(result.data);
  
  if (!saveResult.success) {
    Logger.log(' 儲存失敗: ' + saveResult.message);
    return;
  }
  
  Logger.log(' 儲存成功: ' + saveResult.salaryId);
  Logger.log('');
  
  // 步驟 3：從 Sheet 讀取驗證
  Logger.log(' 步驟 3：從 Sheet 讀取驗證...');
  const sheet = getMonthlySalarySheetEnhanced();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const salaryId = saveResult.salaryId;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === salaryId) {
      Logger.log(' 找到薪資單: ' + salaryId);
      Logger.log('');
      Logger.log(' 關鍵欄位驗證:');
      Logger.log(`   薪資類型 (欄位5): ${data[i][4]}`);
      Logger.log(`   基本薪資 (欄位9): ${data[i][8]}`);
      Logger.log(`   平日加班費 (欄位16): ${data[i][15]}`);
      Logger.log(`   請假扣款 (欄位24): ${data[i][23]}`);
      Logger.log(`   病假時數 (欄位29): ${data[i][28]}`);
      Logger.log(`   病假扣款 (欄位30): ${data[i][29]}`);
      Logger.log(`   事假時數 (欄位31): ${data[i][30]}`);
      Logger.log(`   事假扣款 (欄位32): ${data[i][31]}`);
      Logger.log(`   應發總額 (欄位33): ${data[i][32]}`);
      Logger.log(`   實發金額 (欄位34): ${data[i][33]}`);
      Logger.log('');
      
      // 驗證數值是否正確
      const savedGross = parseFloat(data[i][32]) || 0;
      const savedNet = parseFloat(data[i][33]) || 0;
      const calculatedGross = result.data.grossSalary;
      const calculatedNet = result.data.netSalary;
      
      if (savedGross === calculatedGross && savedNet === calculatedNet) {
        Logger.log(' 數值驗證通過！');
        Logger.log(`   應發: ${savedGross} = ${calculatedGross} `);
        Logger.log(`   實發: ${savedNet} = ${calculatedNet} `);
      } else {
        Logger.log(' 數值驗證失敗！');
        Logger.log(`   應發: ${savedGross} ≠ ${calculatedGross} `);
        Logger.log(`   實發: ${savedNet} ≠ ${calculatedNet} `);
      }
      
      break;
    }
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試完成');
  Logger.log('═══════════════════════════════════════');
}

function checkEricSalaryInSheet() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 檢查 Eric 在 Sheet 中的薪資資料');
  Logger.log('═══════════════════════════════════════');
  
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf';
  const yearMonth = '2026-01';
  
  const sheet = getMonthlySalarySheetEnhanced();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const salaryId = `SAL-${yearMonth}-${employeeId}`;
  
  Logger.log(`\n 尋找薪資單: ${salaryId}`);
  Logger.log(` Sheet 總行數: ${data.length}`);
  
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === salaryId) {
      found = true;
      Logger.log(`\n 找到薪資單在第 ${i + 1} 行`);
      Logger.log('\n 完整資料:');
      
      // 顯示所有欄位
      for (let j = 0; j < Math.min(headers.length, data[i].length); j++) {
        const header = headers[j];
        const value = data[i][j];
        
        // 重點欄位用特殊標記
        const isImportant = [
          '基本薪資', '平日加班費', '休息日加班費', '國定假日加班費',
          '請假扣款', '病假時數', '病假扣款', '事假時數', '事假扣款',
          '應發總額', '實發金額'
        ].includes(header);
        
        const prefix = isImportant ? '⭐' : '  ';
        Logger.log(`${prefix} [${j + 1}] ${header}: ${value}`);
      }
      
      break;
    }
  }
  
  if (!found) {
    Logger.log(`\n 找不到薪資單: ${salaryId}`);
    Logger.log('\n Sheet 中現有的薪資單ID:');
    
    for (let i = 1; i < Math.min(data.length, 6); i++) {
      Logger.log(`   第 ${i + 1} 行: ${data[i][0]}`);
    }
  }
  
  Logger.log('\n═══════════════════════════════════════');
}

function testGetMySalaryAPI() {
  Logger.log(' 測試 getMySalary API');
  
  const userId = 'Ue76b65367821240ac26387d2972a5adf';
  const yearMonth = '2026-01';
  
  const result = getMySalary(userId, yearMonth);
  
  Logger.log('\n API 回應:');
  Logger.log('   success: ' + result.success);
  
  if (result.success && result.data) {
    Logger.log('\n 資料欄位:');
    Logger.log('   基本薪資: ' + result.data['基本薪資']);
    Logger.log('   平日加班費: ' + result.data['平日加班費']);
    Logger.log('   請假扣款: ' + result.data['請假扣款']);
    Logger.log('   病假時數: ' + result.data['病假時數']);
    Logger.log('   病假扣款: ' + result.data['病假扣款']);
    Logger.log('   事假時數: ' + result.data['事假時數']);
    Logger.log('   事假扣款: ' + result.data['事假扣款']);
    Logger.log('   應發總額: ' + result.data['應發總額']);
    Logger.log('   實發金額: ' + result.data['實發金額']);
    
    Logger.log('\n 完整 data 物件:');
    Logger.log(JSON.stringify(result.data, null, 2));
  } else {
    Logger.log(' 取得資料失敗: ' + result.message);
  }
}

/**
 *  執行重建並驗證
 */
function testRebuildSheet() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 重建月薪資記錄試算表');
  Logger.log('═══════════════════════════════════════');
  
  const result = rebuildMonthlySalarySheetComplete();
  
  if (result.success) {
    Logger.log('\n 重建成功！');
    Logger.log(`   總欄位數: ${result.columnCount}`);
    Logger.log('\n 請手動確認以下事項:');
    Logger.log('   1. 標題列格式正確（綠底白字）');
    Logger.log('   2. 欄位寬度適中');
    Logger.log('   3. 凍結標題列與前3欄');
    Logger.log('   4. 數值格式正確（金額、小數點）');
  } else {
    Logger.log('\n 重建失敗: ' + result.message);
  }
  
  Logger.log('\n═══════════════════════════════════════');
}

/**
 *  測試請假記錄讀取
 */
function testLeaveRecords() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試請假記錄讀取');
  Logger.log('═══════════════════════════════════════');
  
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf'; // Eric
  const yearMonth = '2026-01';
  
  Logger.log(` 查詢: ${employeeId} 在 ${yearMonth} 的請假記錄`);
  Logger.log('');
  
  const result = getEmployeeMonthlyLeave(employeeId, yearMonth);
  
  if (result.success) {
    Logger.log(` 成功取得 ${result.data.length} 筆請假記錄`);
    
    result.data.forEach(record => {
      Logger.log(`   類型: ${record.leaveType}`);
      Logger.log(`   天數: ${record.leaveDays}`);
      Logger.log(`   狀態: ${record.reviewStatus}`);
      Logger.log('');
    });
  } else {
    Logger.log(' 取得失敗: ' + result.message);
  }
  
  Logger.log('═══════════════════════════════════════');
}

function fullTestEricSalary() {
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf';
  const yearMonth = '2026-01';
  
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 完整測試 Eric 的薪資計算');
  Logger.log('═══════════════════════════════════════\n');
  
  // 步驟 1：讀取請假記錄
  Logger.log(' 步驟 1：讀取請假記錄');
  const leaveResult = getEmployeeMonthlyLeave(employeeId, yearMonth);
  Logger.log(`   病假總天數: ${leaveResult.data.filter(r => r.leaveType.includes('SICK')).reduce((sum, r) => sum + r.leaveDays, 0)}`);
  Logger.log(`   事假總天數: ${leaveResult.data.filter(r => r.leaveType.includes('PERSONAL')).reduce((sum, r) => sum + r.leaveDays, 0)}\n`);
  
  // 步驟 2：計算薪資
  Logger.log(' 步驟 2：計算薪資');
  const calcResult = calculateMonthlySalary(employeeId, yearMonth);
  
  if (calcResult.success) {
    const data = calcResult.data;
    Logger.log(`   基本薪資: $${data.baseSalary}`);
    Logger.log(`   病假時數: ${data.sickLeaveHours} 小時`);
    Logger.log(`   病假扣款: $${data.sickLeaveDeduction}`);
    Logger.log(`   事假時數: ${data.personalLeaveHours} 小時`);
    Logger.log(`   事假扣款: $${data.personalLeaveDeduction}`);
    Logger.log(`   請假扣款總計: $${data.leaveDeduction}`);
    Logger.log(`   應發總額: $${data.grossSalary}`);
    Logger.log(`   實發金額: $${data.netSalary}\n`);
    
    // 驗證扣款計算
    const dailyRate = Math.round(data.baseSalary / 30);
    const expectedSickDeduction = Math.round(0.75 * dailyRate * 0.5); // 病假0.75天
    const expectedPersonalDeduction = Math.round(1 * dailyRate); // 事假1天
    
    Logger.log(' 步驟 3：驗證扣款計算');
    Logger.log(`   日薪: $${dailyRate}`);
    Logger.log(`   預期病假扣款: $${expectedSickDeduction}`);
    Logger.log(`   實際病假扣款: $${data.sickLeaveDeduction}`);
    Logger.log(`   預期事假扣款: $${expectedPersonalDeduction}`);
    Logger.log(`   實際事假扣款: $${data.personalLeaveDeduction}\n`);
    
    // 步驟 4：儲存並驗證
    Logger.log(' 步驟 4：儲存薪資');
    const saveResult = saveMonthlySalary(data);
    Logger.log(`   儲存結果: ${saveResult.success ? ' 成功' : ' 失敗'}\n`);
    
    if (saveResult.success) {
      // 從 Sheet 讀取驗證
      checkEricSalaryInSheet();
    }
  }
  
  Logger.log('═══════════════════════════════════════');
}

function checkEricData() {
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf';
  const yearMonth = '2026-01';
  
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 檢查 Eric 的基礎資料');
  Logger.log('═══════════════════════════════════════');
  
  // 1. 檢查員工設定
  Logger.log('\n 步驟 1：檢查員工薪資設定');
  const config = getEmployeeSalaryTW(employeeId);
  if (config.success) {
    Logger.log(' 找到薪資設定:');
    Logger.log(`   員工姓名: ${config.data['員工姓名']}`);
    Logger.log(`   基本薪資: ${config.data['基本薪資']}`);
    Logger.log(`   薪資類型: ${config.data['薪資類型']}`);
  } else {
    Logger.log(' 找不到薪資設定');
  }
  
  // 2. 檢查打卡記錄
  Logger.log('\n 步驟 2：檢查打卡記錄');
  const attendance = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
  Logger.log(`   找到 ${attendance.length} 筆打卡記錄`);
  
  // 3. 檢查加班記錄
  Logger.log('\n 步驟 3：檢查加班記錄');
  const overtime = getEmployeeMonthlyOvertime(employeeId, yearMonth);
  Logger.log(`   找到 ${overtime.length} 筆加班記錄`);
  
  // 4. 檢查請假記錄
  Logger.log('\n 步驟 4：檢查請假記錄');
  const leave = getEmployeeMonthlyLeave(employeeId, yearMonth);
  Logger.log(`   找到 ${leave.data ? leave.data.length : 0} 筆請假記錄`);
  
  // 5. 檢查月薪資記錄
  Logger.log('\n 步驟 5：檢查月薪資記錄');
  const salary = getMySalary(employeeId, yearMonth);
  if (salary.success) {
    Logger.log(' 找到薪資記錄');
  } else {
    Logger.log(' 沒有薪資記錄: ' + salary.message);
  }
  
  Logger.log('\n═══════════════════════════════════════');
}

function manualSyncEricSalary() {
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf';
  const yearMonth = '2026-01';
  
  Logger.log(' 手動觸發薪資計算與同步');
  
  // 步驟 1：計算薪資
  Logger.log(' 步驟 1：計算薪資...');
  const calcResult = calculateMonthlySalary(employeeId, yearMonth);
  
  if (!calcResult.success) {
    Logger.log(' 計算失敗: ' + calcResult.message);
    return;
  }
  
  Logger.log(' 計算成功');
  Logger.log(`   應發總額: $${calcResult.data.grossSalary}`);
  Logger.log(`   實發金額: $${calcResult.data.netSalary}`);
  
  // 步驟 2：儲存薪資
  Logger.log('\n 步驟 2：儲存薪資...');
  const saveResult = saveMonthlySalary(calcResult.data);
  
  if (saveResult.success) {
    Logger.log(' 儲存成功: ' + saveResult.salaryId);
    
    // 步驟 3：驗證
    Logger.log('\n 步驟 3：驗證...');
    const sheet = getMonthlySalarySheetEnhanced();
    const lastRow = sheet.getLastRow();
    Logger.log(`   月薪資記錄總行數: ${lastRow}`);
    
    if (lastRow > 1) {
      const lastData = sheet.getRange(lastRow, 1, 1, 5).getValues()[0];
      Logger.log(`   最後一筆記錄:`);
      Logger.log(`   - 薪資單ID: ${lastData[0]}`);
      Logger.log(`   - 員工姓名: ${lastData[2]}`);
      Logger.log(`   - 年月: ${lastData[3]}`);
    }
  } else {
    Logger.log(' 儲存失敗: ' + saveResult.message);
  }
}

function testEarlyLeaveDeduction() {
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf'; // Eric
  const yearMonth = '2026-01';
  
  const result = calculateMonthlySalary(employeeId, yearMonth);
  
  if (result.success) {
    Logger.log('早退扣款: $' + result.data.earlyLeaveDeduction);
    Logger.log('實發金額: $' + result.data.netSalary);
  }
}

function testHourlySalaryNew() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試時薪員工（2026年投保級距）');
  Logger.log('═══════════════════════════════════════');
  
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf'; 
  const yearMonth = '2025-12';
  
  // 1. 先檢查薪資設定
  const config = getEmployeeSalaryTW(employeeId);
  if (config.success) {
    Logger.log('\n 員工薪資設定:');
    Logger.log(`   員工姓名: ${config.data['員工姓名']}`);
    Logger.log(`   薪資類型: ${config.data['薪資類型']}`);
    Logger.log(`   基本薪資（時薪）: ${config.data['基本薪資']}`);
    Logger.log(`   勞保費: ${config.data['勞保費']}`);
    Logger.log(`   健保費: ${config.data['健保費']}`);
    Logger.log(`   就業保險費: ${config.data['就業保險費']}`);
  }
  
  // 2. 計算薪資
  Logger.log('\n 開始計算薪資...');
  const result = calculateMonthlySalary(employeeId, yearMonth);
  
  if (result.success) {
    Logger.log('\n 計算結果:');
    Logger.log(`   薪資類型: ${result.data.salaryType}`);
    Logger.log(`   時薪: ${result.data.hourlyRate}`);
    Logger.log(`   工作時數: ${result.data.totalWorkHours}h`);
    Logger.log(`   基本薪資: $${result.data.baseSalary}`);
    Logger.log(`   加班時數: ${result.data.totalOvertimeHours}h`);
    Logger.log('');
    Logger.log('    扣款明細:');
    Logger.log(`   - 勞保費: $${result.data.laborFee} (預期: $738)`);
    Logger.log(`   - 健保費: $${result.data.healthFee} (預期: $458)`);
    Logger.log(`   - 就業保險費: $${result.data.employmentFee} (預期: $59)`);
    Logger.log('');
    Logger.log(`   應發總額: $${result.data.grossSalary}`);
    Logger.log(`   實發金額: $${result.data.netSalary}`);
    
    // 3. 驗證投保級距
    Logger.log('\n 驗證投保級距:');
    const expectedInsured = 29500;
    const expectedLabor = Math.round(expectedInsured * 0.125 * 0.2);
    const expectedHealth = Math.round(expectedInsured * 0.0517 * 0.3);
    const expectedEmployment = Math.round(expectedInsured * 0.01 * 0.2);
    
    Logger.log(`   投保級距應為: $${expectedInsured}`);
    Logger.log(`   勞保費應為: $${expectedLabor}`);
    Logger.log(`   健保費應為: $${expectedHealth}`);
    Logger.log(`   就業保險費應為: $${expectedEmployment}`);
    
    if (result.data.laborFee === expectedLabor &&
        result.data.healthFee === expectedHealth &&
        result.data.employmentFee === expectedEmployment) {
      Logger.log('\n 投保級距計算正確！');
    } else {
      Logger.log('\n 投保級距計算不正確，請檢查：');
      Logger.log(`   實際勞保費: $${result.data.laborFee} vs 預期: $${expectedLabor}`);
      Logger.log(`   實際健保費: $${result.data.healthFee} vs 預期: $${expectedHealth}`);
      Logger.log(`   實際就保費: $${result.data.employmentFee} vs 預期: $${expectedEmployment}`);
    }
  } else {
    Logger.log(' 計算失敗: ' + result.message);
  }
  
  Logger.log('\n═══════════════════════════════════════');
}

/**
 *  測試健保費為 0 的情況
 */
function testZeroHealthFee() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試健保費設定為 0');
  Logger.log('═══════════════════════════════════════\n');
  
  const testData = {
    employeeId: 'TEST_ZERO_HEALTH',
    employeeName: '測試健保費為0',
    idNumber: '',
    employeeType: '正職',
    salaryType: '月薪',
    baseSalary: 30000,
    positionAllowance: 0,
    mealAllowance: 0,
    transportAllowance: 0,
    attendanceBonus: 0,
    performanceBonus: 0,
    otherAllowances: 0,
    bankCode: '822',
    bankAccount: '123456789',
    hireDate: '',
    paymentDay: '5',
    pensionSelfRate: 0,
    laborFee: 758,     // 勞保費正常
    healthFee: 0,      // ⭐⭐⭐ 健保費設為 0
    employmentFee: 0,
    pensionSelf: 0,
    incomeTax: 0,
    welfareFee: 0,
    dormitoryFee: 0,
    groupInsurance: 0,
    otherDeductions: 0,
    note: '測試健保費為 0'
  };
  
  Logger.log(' 提交測試資料...');
  Logger.log('   健保費: ' + testData.healthFee + ' (型別: ' + typeof testData.healthFee + ')');
  
  const result = setEmployeeSalaryTW(testData);
  
  Logger.log('\n 設定結果:');
  Logger.log('   success: ' + result.success);
  Logger.log('   message: ' + result.message);
  
  if (result.success) {
    Logger.log('\n 設定成功！');
    
    // 驗證：從 Sheet 讀取確認
    Logger.log('\n 從 Sheet 驗證...');
    const sheet = getEmployeeSalarySheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === testData.employeeId) {
        Logger.log(' 找到記錄:');
        Logger.log('   勞保費 (col 18): ' + data[i][17]);
        Logger.log('   健保費 (col 19): ' + data[i][18]);
        Logger.log('   就業保險費 (col 20): ' + data[i][19]);
        
        if (data[i][18] === 0) {
          Logger.log('\n 健保費成功設定為 0！');
        } else {
          Logger.log('\n 健保費未正確設定為 0，實際值: ' + data[i][18]);
        }
        
        break;
      }
    }
  } else {
    Logger.log('\n 設定失敗: ' + result.message);
  }
  
  Logger.log('\n═══════════════════════════════════════');
}


// ==================== 來自 ShiftManagement.gs ====================
/**
 * 測試時間格式化
 */
function testTimeFormatting() {
  const testCases = [
    "08:00",
    "08:00:00",
    new Date("2025-10-24T00:00:00"),
    "1899-12-30T01:00:00.000Z"
  ];
  
  Logger.log("=== 時間格式化測試 ===");
  testCases.forEach(test => {
    Logger.log(`輸入: ${test} → 輸出: ${formatTimeOnly(test)}`);
  });
}

/**
 * 測試排班系統
 */
function testShiftSystem() {
  Logger.log('===== 測試排班系統 =====');
  
  const testShift = {
    employeeId: 'TEST001',
    employeeName: '測試員工',
    date: '2025-10-25',
    shiftType: '早班',
    startTime: '08:00',
    endTime: '16:00',
    location: '測試地點',
    note: '測試備註'
  };
  
  const addResult = addShift(testShift);
  Logger.log('新增結果: ' + JSON.stringify(addResult));
  
  const queryResult = getShifts({ employeeId: 'TEST001' });
  Logger.log('查詢結果: ' + JSON.stringify(queryResult));
}

function testSingleShift() {
  const testData = {
    employeeId: 'Ue76b65367821240ac26387d2972a5adf',
    employeeName: '測試員工',
    date: '2026-02-20',
    shiftType: '廚房A班',
    startTime: '11:00',
    endTime: '20:00',
    location: '總公司',
    note: '測試'
  };
  
  Logger.log('測試單筆新增');
  const result = addShift(testData);
  Logger.log('結果: ' + JSON.stringify(result));
}

function checkExistingShifts() {
  const sheet = getShiftSheet();
  const data = sheet.getDataRange().getValues();
  
  Logger.log('現有排班數量: ' + (data.length - 1));
  
  // 檢查日期格式
  for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
    Logger.log(`Row ${i + 1}:`);
    Logger.log(`  日期原始: ${data[i][3]}`);
    Logger.log(`  日期類型: ${typeof data[i][3]}`);
    Logger.log(`  格式化後: ${formatDateOnly(data[i][3])}`);
  }
}


// ==================== 來自 Utils.gs ====================
function checkAttendance(attendanceRows) {
  const dailyRecords = {}; // 按 userId+date 分組
  const dailyStatus = []; // 用於儲存格式化的異常紀錄
  let abnormalIdCounter = 0; // 用於產生唯一的 id
  
  // 輔助函式：從時間戳記中擷取 'YYYY-MM-DD'
  function getYmdFromRow(row) {
    if (row.date) {
      const d = new Date(row.date);
      return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
    }
    return '';
  }

  // 輔助函式：從時間戳記中擷取 'HH:mm'
  function getHhMmFromRow(row) {
    if (row.date) {
      const d = new Date(row.date);
      return Utilities.formatDate(d, 'Asia/Taipei', 'HH:mm');
    }
    return '未知時間';
  }
  
  attendanceRows.forEach(row => {
    try {
      const date = getYmdFromRow(row);
      const userId = row.userId;
  
      if (!dailyRecords[userId]) dailyRecords[userId] = {};
      if (!dailyRecords[userId][date]) dailyRecords[userId][date] = [];
      dailyRecords[userId][date].push(row);

    } catch (err) {
      Logger.log(" 解析 row 失敗: " + JSON.stringify(row) + " | 錯誤: " + err.message);
    }
  });

  for (const userId in dailyRecords) {
    for (const date in dailyRecords[userId]) {
      const rows = dailyRecords[userId][date] || [];

      //  新增：取得員工姓名（從第一筆記錄中取得）
      const userName = rows[0]?.name || '未知員工';
      const userDept = rows[0]?.dept || '';

      // 過濾系統虛擬卡
      const filteredRows = rows.filter(r => r.note !== "系統虛擬卡");

      const record = filteredRows.map(r => ({
        time: getHhMmFromRow(r),
        type: r.type || '未知類型',
        note: r.note || "",
        audit: r.audit || "",
        location: r.location || ""
      }));

      const types = record.map(r => r.type);
      const notes = record.map(r => r.note);
      const audits = record.map(r => r.audit);

      let reason = "";
      let id = "normal";

      const hasAdjustment = notes.some(note => note === "補打卡");
      
      const approvedAdjustments = record.filter(r => r.note === "補打卡");
      const isAllApproved = approvedAdjustments.length > 0 &&
                      approvedAdjustments.every(r => r.audit === "v");

      // 計算成對數量
      const typeCounts = { 上班: 0, 下班: 0 };
      record.forEach(r => {
        if (r.type === "上班") typeCounts["上班"]++;
        else if (r.type === "下班") typeCounts["下班"]++;
      });

      // 只要至少有一對就算正常
      const hasPair = typeCounts["上班"] > 0 && typeCounts["下班"] > 0;

      if (!hasPair) {
        if (typeCounts["上班"] === 0 && typeCounts["下班"] === 0) {
          reason = "未打上班卡, 未打下班卡";
        } else if (typeCounts["上班"] > 0) {
          reason = "未打下班卡";
        } else if (typeCounts["下班"] > 0) {
          reason = "未打上班卡";
        }
      } else if (isAllApproved) {
        reason = "補卡通過";
      } else if (hasAdjustment) {
        reason = "有補卡(審核中)";
      } else {
        reason = "正常";
      }

      if (reason) {
        abnormalIdCounter++;
        id = `abnormal-${abnormalIdCounter}`;
      }

      dailyStatus.push({
        ok: !reason,
        date: date,
        userId: userId,
        name: userName,
        dept: userDept,
        record: record,
        reason: reason,
        id: id
      });
    }
  }

  Logger.log("checkAttendance debug: %s", JSON.stringify(dailyStatus));
  return dailyStatus;
}


// ==================== 來自 WorklogHandlers.gs ====================
/**
 *  測試提交工作日誌 API
 */
function testHandleSubmitWorklog() {
  Logger.log(' 測試 handleSubmitWorklog');
  
  const testParams = {
    token: '你的有效token',  //  替換成有效的 token
    date: '2026-01-16',
    hours: '8.5',
    content: '測試工作日誌內容：完成系統開發、修復 bug、參與會議討論。'
  };
  
  const result = handleSubmitWorklog(testParams);
  Logger.log('結果: ' + JSON.stringify(result, null, 2));
}

/**
 *  測試查詢工作日誌 API
 */
function testHandleGetWorklogs() {
  Logger.log(' 測試 handleGetWorklogs');
  
  const testParams = {
    token: '71cff111-bdd2-4c44-ae34-ba86265d1c78',
    limit: 10
  };
  
  const result = handleGetWorklogs(testParams);
  Logger.log('結果: ' + JSON.stringify(result, null, 2));
}

/**
 *  測試審核工作日誌 API
 */
function testHandleReviewWorklog() {
  Logger.log(' 測試 handleReviewWorklog');
  
  const testParams = {
    token: '71cff111-bdd2-4c44-ae34-ba86265d1c78',  //  需要管理員權限
    id: 'WL_1234567890',  //  替換成實際的工作日誌 ID
    action: 'approve',
    comment: '工作內容詳實，核准通過'
  };
  
  const result = handleReviewWorklog(testParams);
  Logger.log('結果: ' + JSON.stringify(result, null, 2));
}


// ==================== 來自 WorklogOperations.gs ====================
/**
 *  測試提交工作日誌
 */
function testSubmitWorklog() {
  Logger.log(' 測試提交工作日誌');
  
  const result = submitWorklog(
    'U123456',
    '測試員工',
    '工程部',
    '2026-01-16',
    8.5,
    '今日完成了以下工作：1. 修復系統 bug 2. 優化資料庫查詢 3. 參與技術會議'
  );
  
  Logger.log('結果: ' + JSON.stringify(result, null, 2));
}

/**
 *  測試查詢工作日誌
 */
function testGetWorklogs() {
  Logger.log(' 測試查詢工作日誌');
  
  const result = getWorklogs('U123456');
  
  Logger.log('結果: ' + JSON.stringify(result, null, 2));
}

/**
 *  測試審核工作日誌
 */
function testReviewWorklog() {
  Logger.log(' 測試審核工作日誌');
  
  // 先取得待審核的工作日誌
  const pending = getPendingWorklogs();
  
  if (pending.success && pending.worklogs.length > 0) {
    const worklogId = pending.worklogs[0].id;
    
    const result = reviewWorklog(
      worklogId,
      'approve',
      'ADMIN001',
      '管理員',
      '工作內容詳實，核准通過'
    );
    
    Logger.log('結果: ' + JSON.stringify(result, null, 2));
  } else {
    Logger.log('沒有待審核的工作日誌');
  }
}

/**
 *  測試核准工作日誌（使用便捷函數）
 */
function testApproveWorklog() {
  Logger.log(' 測試核准工作日誌');
  
  const pending = getPendingWorklogs();
  
  if (pending.success && pending.worklogs.length > 0) {
    const worklogId = pending.worklogs[0].id;
    
    const result = approveWorklog(
      worklogId,
      'ADMIN001',
      '管理員',
      '工作內容詳實，核准通過'
    );
    
    Logger.log('結果: ' + JSON.stringify(result, null, 2));
  } else {
    Logger.log('沒有待審核的工作日誌');
  }
}

/**
 *  測試拒絕工作日誌（使用便捷函數）
 */
function testRejectWorklog() {
  Logger.log(' 測試拒絕工作日誌');
  
  const pending = getPendingWorklogs();
  
  if (pending.success && pending.worklogs.length > 0) {
    const worklogId = pending.worklogs[0].id;
    
    const result = rejectWorklog(
      worklogId,
      'ADMIN001',
      '管理員',
      '工作內容不夠詳細，請補充說明'
    );
    
    Logger.log('結果: ' + JSON.stringify(result, null, 2));
  } else {
    Logger.log('沒有待審核的工作日誌');
  }
}

/**
 *  測試修正後的 getWorklogReport 函數
 */
function testFixedWorklogReport() {
  Logger.log(' 測試修正後的工作日誌匯出功能');
  
  // ⭐ 使用實際存在的員工ID
  const tests = [
    { id: 'U1771fd65da16e2f2000a3c3805fbe256', name: '洪培瑜Eric' },
    { id: 'U123456', name: '測試員工' }
  ];
  
  tests.forEach(test => {
    Logger.log('\n' + '='.repeat(60));
    Logger.log(' 測試員工: ' + test.name);
    Logger.log('   員工ID: ' + test.id);
    Logger.log('   年月: 2026-01');
    Logger.log('='.repeat(60));
    
    // ⭐ 呼叫修正後的 getWorklogReport（不是 Debug 版本）
    const result = getWorklogReport(test.id, '2026-01');
    
    Logger.log('\n 結果:');
    Logger.log('   成功: ' + result.success);
    Logger.log('   找到筆數: ' + result.worklogs.length);
    
    if (result.worklogs && result.worklogs.length > 0) {
      Logger.log('\n 工作日誌列表:');
      result.worklogs.forEach((log, index) => {
        Logger.log(`   [${index + 1}] ${log.date} - ${log.hours}小時 - ${log.status}`);
        Logger.log(`       內容: ${log.content.substring(0, 50)}...`);
      });
      
      Logger.log('\n 統計:');
      Logger.log('   總時數: ' + result.summary.totalHours);
      Logger.log('   已核准時數: ' + result.summary.approvedHours);
    } else {
      Logger.log('    沒有找到工作日誌');
    }
  });
  
  Logger.log('\n' + '='.repeat(60));
  Logger.log(' 測試完成');
  Logger.log('='.repeat(60));
}



// ==================== 來自 Linebottest.gs ====================
/**
 *  測試 Webhook 設定
 * 
 * 用途：檢查 LINE Webhook 是否正確設定
 * 執行：在 Apps Script 編輯器中執行此函數
 */
function testWebhookSetup() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試 Webhook 設定');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  // 檢查 Script Properties
  Logger.log(' 步驟 1：檢查 Script Properties');
  
  const accessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  const channelSecret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
  
  if (!accessToken) {
    Logger.log(' LINE_CHANNEL_ACCESS_TOKEN 未設定');
    Logger.log('   請到「專案設定」→「指令碼屬性」中設定');
  } else {
    Logger.log(' LINE_CHANNEL_ACCESS_TOKEN: ' + accessToken.substring(0, 20) + '...');
  }
  
  if (!channelSecret) {
    Logger.log(' LINE_CHANNEL_SECRET 未設定');
    Logger.log('   請到「專案設定」→「指令碼屬性」中設定');
  } else {
    Logger.log(' LINE_CHANNEL_SECRET: ' + channelSecret.substring(0, 10) + '...');
  }
  
  Logger.log('');
  
  // 檢查工作表
  Logger.log(' 步驟 2：檢查必要工作表');
  
  const sheets = {
    'SHEET_ATTENDANCE': getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE),
    'SHEET_EMPLOYEES': getSpreadsheet_().getSheetByName(SHEET_EMPLOYEES),
    'SHEET_LOCATIONS': getSpreadsheet_().getSheetByName(SHEET_LOCATIONS)
  };
  
  for (let name in sheets) {
    if (sheets[name]) {
      Logger.log(` ${name} 存在`);
    } else {
      Logger.log(` ${name} 不存在`);
    }
  }
  
  Logger.log('');
  
  // 檢查打卡地點
  Logger.log(' 步驟 3：檢查打卡地點設定');
  
  const locationSheet = getSpreadsheet_().getSheetByName(SHEET_LOCATIONS);
  
  if (locationSheet) {
    const lastRow = locationSheet.getLastRow();
    
    if (lastRow < 2) {
      Logger.log(' 尚未設定打卡地點');
      Logger.log('   請在「地點管理」工作表中新增地點');
    } else {
      Logger.log(` 已設定 ${lastRow - 1} 個打卡地點`);
      
      const locations = locationSheet.getRange(2, 1, lastRow - 1, 5).getValues();
      
      Logger.log('');
      Logger.log(' 地點列表:');
      locations.forEach((loc, i) => {
        const [, name, lat, lng, radius] = loc;
        Logger.log(`   ${i + 1}. ${name}`);
        Logger.log(`      座標: ${lat}, ${lng}`);
        Logger.log(`      範圍: ${radius} 公尺`);
      });
    }
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 檢查完成！');
  Logger.log('');
  
  if (accessToken && channelSecret && sheets['SHEET_ATTENDANCE'] && sheets['SHEET_EMPLOYEES']) {
    Logger.log(' 基本設定正確，可以開始測試！');
    Logger.log('');
    Logger.log(' 下一步：');
    Logger.log('   1. 執行 testLineBotMessage() 測試訊息處理');
    Logger.log('   2. 執行 testLineBotLocation() 測試位置打卡');
    Logger.log('   3. 用實際 LINE App 測試');
  } else {
    Logger.log(' 請先完成上述設定');
  }
  
  Logger.log('═══════════════════════════════════════');
}

/**
 *  測試員工註冊狀態
 * 
 * 用途：檢查 LINE User ID 是否已註冊
 * 執行：修改 testUserId 後執行
 */
function testEmployeeRegistration() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試員工註冊狀態');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  //  替換成你的 LINE User ID
  const testUserId = 'Ue76b65367821240ac26387d2972a5adf';
  
  Logger.log(' 查詢 User ID: ' + testUserId);
  Logger.log('');
  
  const employee = findEmployeeByLineUserId_(testUserId);
  
  if (employee.ok) {
    Logger.log(' 員工已註冊');
    Logger.log('');
    Logger.log(' 員工資訊:');
    Logger.log('   姓名: ' + employee.name);
    Logger.log('   Email: ' + employee.email);
    Logger.log('   部門: ' + employee.dept);
    Logger.log('   狀態: ' + employee.status);
  } else {
    Logger.log(' 員工未註冊');
    Logger.log('');
    Logger.log(' 解決方法:');
    Logger.log('   1. 開啟網頁版打卡系統');
    Logger.log('   2. 用 LINE 登入一次');
    Logger.log('   3. 系統會自動註冊該 LINE 帳號');
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  模擬 LINE Bot 收到「打卡」訊息
 * 
 * 用途：測試文字訊息處理流程
 * 執行：修改 testUserId 後執行
 */
function testLineBotMessage() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試 LINE Bot 文字訊息處理');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  //  替換成你的 LINE User ID
  const testUserId = 'Ue76b65367821240ac26387d2972a5adf';
  
  Logger.log(' 模擬收到訊息...');
  Logger.log('   User ID: ' + testUserId);
  Logger.log('   訊息內容: 打卡');
  Logger.log('');
  
  // 模擬 LINE Webhook 事件
  const testEvent = {
    postData: {
      contents: JSON.stringify({
        events: [
          {
            type: 'message',
            replyToken: 'test-reply-token-' + Date.now(),
            source: {
              userId: testUserId
            },
            message: {
              type: 'text',
              text: '打卡'
            }
          }
        ]
      })
    },
    parameter: {},
    headers: {}
  };
  
  try {
    const result = doPost(testEvent);
    
    Logger.log(' 處理結果:');
    Logger.log(result.getContent());
    Logger.log('');
    Logger.log(' 測試完成');
    Logger.log('');
    Logger.log(' 如果在 LINE 上沒收到訊息，檢查：');
    Logger.log('   1. User ID 是否正確');
    Logger.log('   2. 員工是否已註冊');
    Logger.log('   3. LINE Bot 的 Reply Token 是否有效');
    
  } catch (error) {
    Logger.log(' 測試失敗: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  模擬 LINE Bot 收到位置訊息
 * 
 * 用途：測試位置打卡流程
 * 執行：修改參數後執行
 */
function testLineBotLocation() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試 LINE Bot 位置打卡');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  //  替換成你的參數
  const testUserId = 'Ue76b65367821240ac26387d2972a5adf';
  const testLat = 25.0330;      // 緯度
  const testLng = 121.5654;     // 經度
  
  Logger.log(' 模擬傳送位置...');
  Logger.log('   User ID: ' + testUserId);
  Logger.log('   座標: ' + testLat + ', ' + testLng);
  Logger.log('');
  
  // 先檢查位置是否有效
  Logger.log(' 檢查位置有效性...');
  const locationCheck = checkPunchLocation(testLat, testLng);
  
  if (locationCheck.valid) {
    Logger.log(' 位置有效');
    Logger.log('   地點: ' + locationCheck.locationName);
    Logger.log('   距離: ' + locationCheck.distance + ' 公尺');
  } else {
    Logger.log(' 位置無效');
    Logger.log('   原因: ' + locationCheck.reason);
    
    if (locationCheck.nearestLocation) {
      Logger.log('   最近地點: ' + locationCheck.nearestLocation.name);
      Logger.log('   距離: ' + locationCheck.nearestLocation.distance + ' 公尺');
    }
  }
  
  Logger.log('');
  
  // 模擬位置訊息
  const testEvent = {
    postData: {
      contents: JSON.stringify({
        events: [
          {
            type: 'message',
            replyToken: 'test-reply-token-' + Date.now(),
            source: {
              userId: testUserId
            },
            message: {
              type: 'location',
              latitude: testLat,
              longitude: testLng,
              address: '測試地址'
            }
          }
        ]
      })
    },
    parameter: {},
    headers: {}
  };
  
  try {
    Logger.log(' 執行打卡...');
    const result = doPost(testEvent);
    
    Logger.log('');
    Logger.log(' 處理結果:');
    Logger.log(result.getContent());
    Logger.log('');
    
    // 檢查 Google Sheet 是否有新記錄
    Logger.log(' 檢查打卡記錄...');
    const sheet = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE);
    const lastRow = sheet.getLastRow();
    const lastRecord = sheet.getRange(lastRow, 1, 1, 10).getValues()[0];
    
    Logger.log('   最後一筆記錄:');
    Logger.log('   時間: ' + lastRecord[0]);
    Logger.log('   員工: ' + lastRecord[3]);
    Logger.log('   類型: ' + lastRecord[4]);
    Logger.log('   地點: ' + lastRecord[6]);
    
    Logger.log('');
    Logger.log(' 測試完成');
    
  } catch (error) {
    Logger.log(' 測試失敗: ' + error);
    Logger.log('   錯誤堆疊: ' + error.stack);
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  測試所有指令
 * 
 * 用途：一次測試所有 LINE Bot 指令
 * 執行：修改 testUserId 後執行
 */
function testAllCommands() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 測試所有 LINE Bot 指令');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  //  替換成你的 LINE User ID
  const testUserId = 'Ue76b65367821240ac26387d2972a5adf';
  
  const commands = [
    '指令',
    '打卡',
    '查詢',
    '補打卡',
    '說明'
  ];
  
  commands.forEach((cmd, i) => {
    Logger.log(` 測試指令 ${i + 1}/${commands.length}: ${cmd}`);
    
    const testEvent = {
      postData: {
        contents: JSON.stringify({
          events: [
            {
              type: 'message',
              replyToken: 'test-reply-token-' + Date.now(),
              source: {
                userId: testUserId
              },
              message: {
                type: 'text',
                text: cmd
              }
            }
          ]
        })
      },
      parameter: {},
      headers: {}
    };
    
    try {
      doPost(testEvent);
      Logger.log('    成功');
    } catch (error) {
      Logger.log('    失敗: ' + error.message);
    }
    
    Logger.log('');
    
    // 等待 1 秒避免太快
    Utilities.sleep(1000);
  });
  
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 所有測試完成！');
  Logger.log('');
  Logger.log(' 請到 LINE 檢查是否收到訊息');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  檢查今天的打卡記錄
 * 
 * 用途：查看指定員工今天的打卡狀況
 * 執行：修改 testUserId 後執行
 */
function checkTodayPunchRecords() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 檢查今日打卡記錄');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  //  替換成你的 LINE User ID
  const testUserId = 'YOUR_LINE_USER_ID_HERE';
  
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const sheet = getSpreadsheet_().getSheetByName(SHEET_ATTENDANCE);
  const values = sheet.getDataRange().getValues();
  
  Logger.log(' 日期: ' + today);
  Logger.log(' User ID: ' + testUserId);
  Logger.log('');
  
  const records = [];
  
  for (let i = 1; i < values.length; i++) {
    const recordDate = Utilities.formatDate(new Date(values[i][0]), 'Asia/Taipei', 'yyyy-MM-dd');
    const recordUserId = values[i][1];
    
    if (recordUserId === testUserId && recordDate === today) {
      records.push({
        time: Utilities.formatDate(new Date(values[i][0]), 'Asia/Taipei', 'HH:mm:ss'),
        name: values[i][3],
        type: values[i][4],
        location: values[i][6],
        note: values[i][7]
      });
    }
  }
  
  if (records.length === 0) {
    Logger.log(' 今天還沒有打卡記錄');
  } else {
    Logger.log(` 找到 ${records.length} 筆記錄:`);
    Logger.log('');
    
    records.forEach((r, i) => {
      Logger.log(`   ${i + 1}. ${r.type}`);
      Logger.log(`      時間: ${r.time}`);
      Logger.log(`      地點: ${r.location}`);
      Logger.log(`      備註: ${r.note || '無'}`);
      Logger.log('');
    });
    
    // 判斷打卡狀態
    const hasPunchIn = records.some(r => r.type === '上班');
    const hasPunchOut = records.some(r => r.type === '下班');
    
    Logger.log(' 打卡狀態:');
    Logger.log('   上班卡: ' + (hasPunchIn ? ' 已打' : ' 未打'));
    Logger.log('   下班卡: ' + (hasPunchOut ? ' 已打' : ' 未打'));
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

/**
 *  產生測試報告
 * 
 * 用途：執行所有測試並產生完整報告
 * 執行：直接執行（會花較長時間）
 */
function generateTestReport() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 產生完整測試報告');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  Logger.log('⏰ 開始時間: ' + new Date());
  Logger.log('');
  
  // 測試 1: Webhook 設定
  Logger.log('========== 測試 1: Webhook 設定 ==========');
  testWebhookSetup();
  Logger.log('');
  
  // 測試 2: 員工註冊
  Logger.log('========== 測試 2: 員工註冊 ==========');
  testEmployeeRegistration();
  Logger.log('');
  
  // 測試 3: 打卡記錄
  Logger.log('========== 測試 3: 打卡記錄 ==========');
  checkTodayPunchRecords();
  Logger.log('');
  
  Logger.log('⏰ 結束時間: ' + new Date());
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 報告產生完成！');
  Logger.log('═══════════════════════════════════════');
}
