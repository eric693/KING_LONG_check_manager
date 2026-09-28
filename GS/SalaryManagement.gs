// SalaryManagement-Enhanced.gs - 薪資管理系統（完整版 - 修正版）

// ==================== 常數定義 ====================

const SHEET_SALARY_CONFIG_ENHANCED = "員工薪資設定";
// 自訂津貼／扣款的金額存在這一欄（JSON），項目定義則在「系統設定」的 salaryItems
const SALARY_CUSTOM_ITEMS_COLUMN = "自訂項目";
const MONTHLY_CUSTOM_ALLOWANCE_COLUMN = "自訂津貼合計";
const MONTHLY_CUSTOM_DEDUCTION_COLUMN = "自訂扣款合計";
const MONTHLY_CUSTOM_DETAIL_COLUMN = "自訂項目明細";

/**
 * 「月薪資記錄」的欄位順序 —— 唯一的一份定義。
 *
 * 這個順序必須跟 saveMonthlySalary() 組 row 陣列的順序逐欄對齊，因為那支是
 * 按位置寫入的。過去自動建表用的表頭跟它對不上（多了「例假日加班費」、少了
 * 「早退扣款」），導致第 18 到 26 欄的標籤整排偏移一格：實際存的是勞保費，
 * 標籤卻寫「國定假日出勤薪資」。資料本身是對的（寫入順序一直一致），錯的是
 * 名稱；而 getMySalary() 是依標籤取值的，所以薪資單上的法定扣款全部顯示錯欄。
 *
 * 改這裡就要同步改 saveMonthlySalary()，兩邊必須一起動。
 */
const MONTHLY_SALARY_HEADERS = [
  // 基本資訊（8）
  "薪資單ID", "員工ID", "員工姓名", "年月",
  "薪資類型", "時薪", "工作時數", "總加班時數",

  // 應發項目（11）
  "基本薪資", "職務加給", "伙食費", "交通補助", "全勤獎金", "業績獎金", "其他津貼",
  "平日加班費", "休息日加班費", "國定假日出勤薪資", "國定假日加班費",

  // 法定扣款（5）
  "勞保費", "健保費", "就業保險費", "勞退自提", "所得稅",

  // 其他扣款（6）
  "請假扣款", "早退扣款", "福利金扣款", "宿舍費用", "團保費用", "其他扣款",

  // 請假明細（4）
  "病假時數", "病假扣款", "事假時數", "事假扣款",

  // 總計（2）
  "應發總額", "實發金額",

  // 銀行資訊（2）
  "銀行代碼", "銀行帳號",

  // 系統欄位（3）
  "狀態", "備註", "建立時間",

  // 自訂項目（3）
  MONTHLY_CUSTOM_ALLOWANCE_COLUMN, MONTHLY_CUSTOM_DEDUCTION_COLUMN, MONTHLY_CUSTOM_DETAIL_COLUMN
];

// 舊版自動建表用過的錯誤表頭，用來判斷某張表需不需要修正標籤
const LEGACY_MONTHLY_SALARY_HEADERS = [
  "薪資單ID", "員工ID", "員工姓名", "年月",
  "薪資類型", "時薪", "工作時數", "總加班時數",
  "基本薪資", "職務加給", "伙食費", "交通補助", "全勤獎金", "業績獎金", "其他津貼",
  "平日加班費", "休息日加班費", "例假日加班費", "國定假日加班費", "國定假日出勤薪資",
  "勞保費", "健保費", "就業保險費", "勞退自提", "所得稅",
  "請假扣款", "福利金扣款", "宿舍費用", "團保費用", "其他扣款",
  "病假時數", "病假扣款", "事假時數", "事假扣款",
  "應發總額", "實發金額",
  "銀行代碼", "銀行帳號",
  "狀態", "備註", "建立時間"
];
const SHEET_MONTHLY_SALARY_ENHANCED = "月薪資記錄";

// 台灣法定最低薪資（2025）
// const MIN_MONTHLY_SALARY = 29500;  // 月薪（正確值）
// const MIN_HOURLY_SALARY = 196;     // 時薪（正確值）

// ⭐⭐⭐ 2026 年台灣國定假日（完整版）
const TAIWAN_HOLIDAYS_2026 = [
  // 1月
  '2026-01-01', // 中華民國開國紀念日
  
  // 2月（農曆春節）
  '2026-02-15', // 農曆除夕前一日
  '2026-02-16', // 農曆除夕
  '2026-02-17', // 春節初一
  '2026-02-18', // 春節初二
  '2026-02-19', // 春節初三
  '2026-02-20', // 除夕前一日補假
  '2026-02-27', // 和平紀念日補假
  '2026-02-28', // 和平紀念日
  
  // 4月（兒童節與清明節）
  '2026-04-03', // 兒童節補假
  '2026-04-04', // 兒童節
  '2026-04-05', // 清明節
  '2026-04-06', // 清明節補假
  
  // 5月
  '2026-05-01', // 勞動節
  
  // 6月
  '2026-06-19', // 端午節
  
  // 9月
  '2026-09-25', // 中秋節
  '2026-09-28', // 孔子誕辰紀念日/教師節（軍公教放假）
  
  // 10月
  '2026-10-09', // 國慶日補假
  '2026-10-10', // 國慶日
  '2026-10-25', // 臺灣光復節（軍公教放假）
  '2026-10-26', // 臺灣光復節補假（軍公教放假）
  
  // 12月
  '2026-12-25', // 行憲紀念日（軍公教放假）
];

/**
 *  判斷是否為國定假日
 * @param {string} dateStr - 日期字串 (YYYY-MM-DD)
 * @returns {boolean}
 */
function isNationalHoliday(dateStr) {
  return TAIWAN_HOLIDAYS_2026.includes(dateStr);
}

/**
 *  提供前端國定假日清單
 *  前端原本只能靠星期判斷，落在平日的國定假日會被當成一般上班日，
 *  加班時數因此算成 0；有了這份清單就能跟後端用同一套判斷。
 * @returns {{ok: boolean, year: number, holidays: string[]}}
 */
function handleGetHolidays() {
  return {
    ok: true,
    year: 2026,
    holidays: TAIWAN_HOLIDAYS_2026
  };
}


// 加班費率
const OVERTIME_RATES = {
  weekday: 1.34,      // 平日加班（前2小時）
  weekdayExtra: 1.67, // 平日加班（第3小時起）
  restday: 1.34,      // 休息日前2小時
  restdayExtra: 1.67, // 休息日第3小時起
  holiday: 2.0        // 國定假日
};

/**
 *  判斷日期是平日/休息日/例假日/國定假日（修正版）
 * @param {string} dateStr - 日期字串 (YYYY-MM-DD)
 * @returns {string} 'weekday' | 'restday' | 'sunday' | 'holiday'
 */
function getDateType(dateStr) {
  try {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay(); // 0=週日, 1=週一, ..., 6=週六
    
    // ⭐⭐⭐ 優先判斷國定假日
    if (isNationalHoliday(dateStr)) {
      return 'holiday';
    }
    
    // 週日 = 例假日
    if (dayOfWeek === 0) {
      return 'sunday';
    }
    
    // 週六 = 休息日
    if (dayOfWeek === 6) {
      return 'restday';
    }
    
    // 週一~週五 = 平日
    return 'weekday';
    
  } catch (error) {
    Logger.log(' 判斷日期類型失敗: ' + error);
    return 'weekday'; // 預設為平日
  }
}

/**
 *  計算加班費（完整版 - 區分四種類型）
 * @param {number} hours - 加班時數
 * @param {number} hourlyRate - 時薪
 * @param {string} dateType - 日期類型 ('weekday' | 'restday' | 'sunday' | 'holiday')
 * @returns {Object} { firstPay, secondPay, thirdPay }
 */
/**
 * 解析員工薪資設定裡的自訂項目金額（存成 JSON 字串），壞掉就當作沒有
 */
function parseCustomItemAmounts_(raw) {
  if (!raw) return {};
  
  try {
    const parsed = (typeof raw === 'string') ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return {};
    
    const amounts = {};
    Object.keys(parsed).forEach(key => {
      const value = parseFloat(parsed[key]);
      if (!isNaN(value)) amounts[key] = value;
    });
    return amounts;
    
  } catch (error) {
    Logger.log(` 自訂項目金額格式錯誤，當作沒有設定: ${error.message}`);
    return {};
  }
}

/**
 * 把員工的自訂項目金額對上管理員定義的項目，算出津貼與扣款合計。
 *
 * 定義被刪掉的項目金額會留在員工設定裡但不計入，這樣誤刪再加回來金額就會回來。
 */
function resolveCustomSalaryItems_(rawAmounts) {
  const definitions = (typeof getSalaryItems_ === 'function') ? getSalaryItems_() : [];
  const amounts = parseCustomItemAmounts_(rawAmounts);
  
  const allowances = [];
  const deductions = [];
  let allowanceTotal = 0;
  let deductionTotal = 0;
  
  definitions.forEach(item => {
    const amount = amounts[item.id];
    if (!amount) return;  // 0 或沒填的項目不列出來，薪資單才不會一堆 $0
    
    const entry = { id: item.id, name: item.name, amount: amount };
    
    if (item.type === 'allowance') {
      allowances.push(entry);
      allowanceTotal += amount;
    } else {
      deductions.push(entry);
      deductionTotal += amount;
    }
  });
  
  return {
    allowances: allowances,
    deductions: deductions,
    allowanceTotal: Math.round(allowanceTotal),
    deductionTotal: Math.round(deductionTotal)
  };
}

/**
 * 取得加班規則。SystemSettings.gs 還沒部署時退回預設值，不讓薪資算不出來。
 */
function getOvertimeRules_() {
  if (typeof getSalaryRules_ === 'function') {
    return getSalaryRules_().overtimeRules;
  }
  return {
    weekdayFirst2: 1.34, weekdayAfter2: 1.67,
    restdayFirst2: 1.34, restday3to8: 1.67, restdayAfter8: 2.67,
    sunday: 2.0, holiday: 2.0,
    maxWeekdayHours: 4, maxRestdayHours: 12, maxHolidayHours: 8
  };
}

function calculateOvertimePay(hours, hourlyRate, dateType) {
  let firstPay = 0;   // 前2小時
  let secondPay = 0;  // 3-8小時
  let thirdPay = 0;   // 9小時起
  
  // 倍率由管理員在「薪資規則」設定，沒設定過就是勞基法的預設值
  const rules = getOvertimeRules_();
  
  if (dateType === 'weekday') {
    // 平日加班：前 2h 一個倍率，第 3h 起另一個
    const first = Math.min(hours, 2);
    firstPay = hourlyRate * first * rules.weekdayFirst2;
    
    if (hours > 2) {
      const rest = Math.min(hours - 2, 2); // 最多再算2小時（總共4h）
      secondPay = hourlyRate * rest * rules.weekdayAfter2;
    }
    
  } else if (dateType === 'restday') {
    // 休息日（週六）：前 2h、3-8h、9h 起 三段
    const first = Math.min(hours, 2);
    firstPay = hourlyRate * first * rules.restdayFirst2;
    
    if (hours > 2) {
      const second = Math.min(hours - 2, 6); // 3-8h
      secondPay = hourlyRate * second * rules.restday3to8;
    }
    
    if (hours > 8) {
      const third = hours - 8; // 9h起
      thirdPay = hourlyRate * third * rules.restdayAfter8;
    }
    
  } else if (dateType === 'sunday') {
    // 例假日（週日）：全天同一個倍率（僅加班費）
    firstPay = hourlyRate * hours * rules.sunday;
    
  } else if (dateType === 'holiday') {
    // 國定假日：全天同一個倍率（僅加班費，正常薪資另計）
    firstPay = hourlyRate * hours * rules.holiday;
  }
  
  return {
    firstPay: Math.round(firstPay),
    secondPay: Math.round(secondPay),
    thirdPay: Math.round(thirdPay)
  };
}
/**
 *  統一的 JSON 回應格式
 */
function jsonResponse(ok, data, message, code) {
  const response = {
    ok: ok,
    success: ok,
    data: data,
    records: data,
    msg: message,
    message: message,
    code: code || (ok ? 'SUCCESS' : 'ERROR')
  };
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
// ==================== 試算表管理 ====================

/**
 *  取得或建立員工薪資設定試算表（完整版）
 */
function getEmployeeSalarySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SALARY_CONFIG_ENHANCED);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SALARY_CONFIG_ENHANCED);
    
    const headers = [
      // 基本資訊 (6欄: A-F)
      "員工ID", "員工姓名", "身分證字號", "員工類型", "薪資類型", "基本薪資",
      
      // 固定津貼項目 (6欄: G-L)
      "職務加給", "伙食費", "交通補助", "全勤獎金", "業績獎金", "其他津貼",
      
      // 銀行資訊 (4欄: M-P)
      "銀行代碼", "銀行帳號", "到職日期", "發薪日",
      
      // 法定扣款 (6欄: Q-V)
      "勞退自提率(%)", "勞保費", "健保費", "就業保險費", "勞退自提", "所得稅",
      
      // 其他扣款 (4欄: W-Z)
      "福利金扣款", "宿舍費用", "團保費用", "其他扣款",
      
      // 系統欄位 (3欄: AA-AC)
      "狀態", "備註", "最後更新時間",
      
      // 自訂項目 (1欄: AD) — 管理員自訂的津貼／扣款金額，存成 {項目代碼: 金額}
      SALARY_CUSTOM_ITEMS_COLUMN
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.getRange(1, 1, 1, headers.length).setBackground("#10b981");
    sheet.getRange(1, 1, 1, headers.length).setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    
    Logger.log(" 建立員工薪資設定試算表（完整版）");
  }
  
  ensureTrailingColumns_(sheet, [SALARY_CUSTOM_ITEMS_COLUMN]);
  
  return sheet;
}

/**
 * 舊的試算表沒有新加的欄位，補在最後面。
 * 只往後append，既有欄位的索引不會變，所有依位置寫入的程式碼都不受影響。
 */
function ensureTrailingColumns_(sheet, columnNames) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(h => String(h).trim());
  const missing = columnNames.filter(name => headers.indexOf(name) === -1);
  
  if (missing.length === 0) return;
  
  sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
  sheet.getRange(1, lastColumn + 1, 1, missing.length)
       .setFontWeight("bold")
       .setBackground("#10b981")
       .setFontColor("#ffffff");
  
  Logger.log(` 已為「${sheet.getName()}」補上欄位: ${missing.join('、')}`);
}

/**
 *  取得或建立月薪資記錄試算表（完整版）
 */
function getMonthlySalarySheetEnhanced() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_MONTHLY_SALARY_ENHANCED);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_MONTHLY_SALARY_ENHANCED);
    
    const headers = MONTHLY_SALARY_HEADERS;
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.getRange(1, 1, 1, headers.length).setBackground("#10b981");
    sheet.getRange(1, 1, 1, headers.length).setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    
    Logger.log(" 建立月薪資記錄試算表（完整版）");
  }
  
  repairMonthlySalaryHeaders_(sheet);
  
  ensureTrailingColumns_(sheet, [
    MONTHLY_CUSTOM_ALLOWANCE_COLUMN,
    MONTHLY_CUSTOM_DEDUCTION_COLUMN,
    MONTHLY_CUSTOM_DETAIL_COLUMN
  ]);
  
  return sheet;
}

/**
 * 修正舊表的欄位名稱。
 *
 * 只改第 1 列的標籤，一格資料都不動 —— 因為資料本來就是按 saveMonthlySalary()
 * 的順序寫進去的，錯的只有標籤。也因此改完之後 getMySalary() 才會取到正確的欄。
 *
 * 為了不誤傷被人工調整過的試算表，只有在前 41 欄「完全等於」舊版錯誤表頭時才動手。
 */
function repairMonthlySalaryHeaders_(sheet) {
  try {
    const legacyLength = LEGACY_MONTHLY_SALARY_HEADERS.length;
    if (sheet.getLastColumn() < legacyLength) return;

    const current = sheet.getRange(1, 1, 1, legacyLength).getValues()[0]
                         .map(h => String(h).trim());

    for (let i = 0; i < legacyLength; i++) {
      if (current[i] !== LEGACY_MONTHLY_SALARY_HEADERS[i]) return;  // 不是那張舊表，不要碰
    }

    const corrected = MONTHLY_SALARY_HEADERS.slice(0, legacyLength);
    sheet.getRange(1, 1, 1, legacyLength).setValues([corrected]);

    Logger.log(" 已修正「月薪資記錄」的欄位名稱（第 18-26 欄原本整排偏移一格，資料未變動）");

  } catch (error) {
    // 修不動就算了，不能讓薪資功能因為這件事整個打不開
    Logger.log(" 修正月薪資記錄表頭失敗: " + error.message);
  }
}

function rebuildMonthlySalarySheet() {
  // 刪除舊表（如果存在）
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const oldSheet = ss.getSheetByName('月薪資記錄');
  if (oldSheet) {
    ss.deleteSheet(oldSheet);
  }
  
  // 建立新表
  getMonthlySalarySheetEnhanced();
  
  Logger.log(' 月薪資記錄試算表已重建');
}
// ==================== 薪資設定功能 ====================

/**
 *  設定員工薪資資料（完整版 - 修正版）
 */
function setEmployeeSalaryTW(salaryData) {
  try {
    Logger.log(' 開始設定員工薪資（完整版 - 修正版）');
    Logger.log(' 收到的資料: ' + JSON.stringify(salaryData, null, 2));
    
    const sheet = getEmployeeSalarySheet();
    const data = sheet.getDataRange().getValues();
    
    // 驗證必填欄位
    if (!salaryData.employeeId || !salaryData.employeeName || !salaryData.baseSalary || salaryData.baseSalary <= 0) {
      return { success: false, message: "缺少必填欄位或基本薪資無效" };
    }
    
    // ⭐⭐⭐ 修正：安全地轉換數值（允許 0）
    const toNumber = (value) => {
      if (value === null || value === undefined || value === '') {
        return 0;
      }
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    };
    
    // 檢查是否已存在
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(salaryData.employeeId).trim()) {
        rowIndex = i + 1;
        break;
      }
    }
    
    const now = new Date();
    
    // ⭐ 修正：確保順序與 Sheet 欄位完全一致
    const row = [
      // A-F: 基本資訊 (6欄)
      String(salaryData.employeeId).trim(),              // A: 員工ID
      String(salaryData.employeeName).trim(),            // B: 員工姓名
      String(salaryData.idNumber || "").trim(),          // C: 身分證字號
      String(salaryData.employeeType || "正職").trim(),  // D: 員工類型
      String(salaryData.salaryType || "月薪").trim(),    // E: 薪資類型
      toNumber(salaryData.baseSalary) || 0,            // F: 基本薪資
      
      // G-L: 固定津貼項目 (6欄)
      toNumber(salaryData.positionAllowance) || 0,     // G: 職務加給
      toNumber(salaryData.mealAllowance) || 0,         // H: 伙食費
      toNumber(salaryData.transportAllowance) || 0,    // I: 交通補助
      toNumber(salaryData.attendanceBonus) || 0,       // J: 全勤獎金
      toNumber(salaryData.performanceBonus) || 0,      // K: 業績獎金
      toNumber(salaryData.otherAllowances) || 0,       // L: 其他津貼
      
      // M-P: 銀行資訊 (4欄)
      String(salaryData.bankCode || "").trim(),          // M: 銀行代碼
      String(salaryData.bankAccount || "").trim(),       // N: 銀行帳號
      salaryData.hireDate || "",                         // O: 到職日期
      String(salaryData.paymentDay || "5").trim(),       // P: 發薪日
      
      // Q-V: 法定扣款 (6欄)
      toNumber(salaryData.pensionSelfRate) || 0,       // Q: 勞退自提率(%)
      toNumber(salaryData.laborFee) || 0,              // R: 勞保費
      toNumber(salaryData.healthFee) || 0,             // S: 健保費
      toNumber(salaryData.employmentFee) || 0,         // T: 就業保險費
      toNumber(salaryData.pensionSelf) || 0,           // U: 勞退自提
      toNumber(salaryData.incomeTax) || 0,             // V: 所得稅
      
      // W-Z: 其他扣款 (4欄)
      toNumber(salaryData.welfareFee) || 0,            // W: 福利金扣款
      toNumber(salaryData.dormitoryFee) || 0,          // X: 宿舍費用
      toNumber(salaryData.groupInsurance) || 0,        // Y: 團保費用
      toNumber(salaryData.otherDeductions) || 0,       // Z: 其他扣款
      
      // AA-AC: 系統欄位 (3欄)
      "在職",                                             // AA: 狀態
      String(salaryData.note || "").trim(),              // AB: 備註
      now,                                                // AC: 最後更新時間
      
      // AD: 自訂項目金額（JSON）
      JSON.stringify(parseCustomItemAmounts_(salaryData.customItems))
    ];
    
    // ⭐⭐⭐ 記錄扣款數值（用於除錯）
    Logger.log(' 扣款數值檢查:');
    Logger.log('   勞保費: ' + row[17] + ' (型別: ' + typeof row[17] + ')');
    Logger.log('   健保費: ' + row[18] + ' (型別: ' + typeof row[18] + ')');
    Logger.log('   就業保險費: ' + row[19] + ' (型別: ' + typeof row[19] + ')');
    Logger.log('   勞退自提: ' + row[20] + ' (型別: ' + typeof row[20] + ')');
    Logger.log('   所得稅: ' + row[21] + ' (型別: ' + typeof row[21] + ')');
    Logger.log(` 準備寫入的 row 陣列長度: ${row.length}`);
    Logger.log(` Sheet 標題欄位數: ${data[0].length}`);
    
    if (row.length !== data[0].length) {
      Logger.log(` 警告：row 長度 (${row.length}) 與 Sheet 欄位數 (${data[0].length}) 不一致`);
    }
    
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      Logger.log(` 更新員工薪資設定: ${salaryData.employeeName} (列 ${rowIndex})`);
    } else {
      sheet.appendRow(row);
      Logger.log(` 新增員工薪資設定: ${salaryData.employeeName}`);
    }
    
    //  同步到月薪資記錄（增強版）
    const currentYearMonth = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM");
    
    Logger.log(` 開始計算 ${currentYearMonth} 的薪資...`);
    const recalculated = calculateMonthlySalary(salaryData.employeeId, currentYearMonth);
    
    if (recalculated.success) {
      Logger.log(' 薪資計算成功，準備儲存...');
      
      const saveResult = saveMonthlySalary(recalculated.data);
      
      if (saveResult.success) {
        Logger.log(' 已成功更新當月薪資記錄');
      } else {
        Logger.log(' 薪資記錄儲存失敗: ' + saveResult.message);
        // 不中斷主流程，只記錄警告
      }
    } else {
      Logger.log(' 薪資計算失敗: ' + recalculated.message);
      Logger.log('   原因：該月份可能尚無打卡或加班記錄');
    }
    
    return { 
      success: true, 
      message: "薪資設定成功" + 
        (recalculated.success ? "，當月薪資已同步" : "（當月薪資需待打卡後計算）")
    };
    
  } catch (error) {
    Logger.log(" 設定薪資失敗: " + error);
    Logger.log(" 錯誤堆疊: " + error.stack);
    return { success: false, message: error.toString() };
  }
}

/**
 *  取得員工薪資設定（完整版）
 */
function getEmployeeSalaryTW(employeeId) {
  try {
    const sheet = getEmployeeSalarySheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(employeeId).trim()) {
        const salaryConfig = {};
        headers.forEach((header, index) => {
          salaryConfig[header] = data[i][index];
        });
        
        return { success: true, data: salaryConfig };
      }
    }
    
    return { success: false, message: "找不到該員工薪資資料" };
    
  } catch (error) {
    Logger.log(" 取得薪資設定失敗: " + error);
    return { success: false, message: error.toString() };
  }
}

/**
 *  同步薪資到月薪資記錄（完整版 - 修正）
 */
function syncSalaryToMonthlyRecord(employeeId, yearMonth) {
  try {
    const salaryConfig = getEmployeeSalaryTW(employeeId);
    
    if (!salaryConfig.success) {
      return { success: false, message: "找不到員工薪資設定" };
    }
    
    const config = salaryConfig.data;
    const calculatedSalary = calculateMonthlySalary(employeeId, yearMonth);
    
    if (!calculatedSalary.success) {
      // ⭐⭐⭐ 關鍵修正：先判斷薪資類型
      const salaryType = String(config['薪資類型'] || '月薪').trim();
      const isHourly = salaryType === '時薪';
      
      // 建立基本薪資記錄
      const totalAllowances = 
        (parseFloat(config['職務加給']) || 0) +
        (parseFloat(config['伙食費']) || 0) +
        (parseFloat(config['交通補助']) || 0) +
        (parseFloat(config['全勤獎金']) || 0) +
        (parseFloat(config['業績獎金']) || 0) +
        (parseFloat(config['其他津貼']) || 0);
      
      const totalDeductions = 
        (parseFloat(config['勞保費']) || 0) +
        (parseFloat(config['健保費']) || 0) +
        (parseFloat(config['就業保險費']) || 0) +
        (parseFloat(config['勞退自提']) || 0) +
        (parseFloat(config['所得稅']) || 0) +
        (parseFloat(config['福利金扣款']) || 0) +
        (parseFloat(config['宿舍費用']) || 0) +
        (parseFloat(config['團保費用']) || 0) +
        (parseFloat(config['其他扣款']) || 0);
      
      // ⭐ 現在可以安全使用 isHourly 了
      const baseAmount = isHourly ? 0 : parseFloat(config['基本薪資']);
      const grossSalary = baseAmount + totalAllowances;
      
      const basicSalary = {
        employeeId: employeeId,
        employeeName: config['員工姓名'],
        yearMonth: yearMonth,
        
        // ⭐⭐⭐ 新增：薪資類型相關欄位
        salaryType: salaryType,
        hourlyRate: isHourly ? parseFloat(config['基本薪資']) : 0,
        totalWorkHours: 0,
        totalOvertimeHours: 0,
        
        baseSalary: isHourly ? 0 : parseFloat(config['基本薪資']),
        positionAllowance: config['職務加給'] || 0,
        mealAllowance: config['伙食費'] || 0,
        transportAllowance: config['交通補助'] || 0,
        attendanceBonus: config['全勤獎金'] || 0,
        performanceBonus: config['業績獎金'] || 0,
        otherAllowances: config['其他津貼'] || 0,
        weekdayOvertimePay: 0,
        restdayOvertimePay: 0,
        holidayOvertimePay: 0,
        laborFee: config['勞保費'] || 0,
        healthFee: config['健保費'] || 0,
        employmentFee: config['就業保險費'] || 0,
        pensionSelf: config['勞退自提'] || 0,
        incomeTax: config['所得稅'] || 0,
        leaveDeduction: 0,
        welfareFee: config['福利金扣款'] || 0,
        dormitoryFee: config['宿舍費用'] || 0,
        groupInsurance: config['團保費用'] || 0,
        otherDeductions: config['其他扣款'] || 0,
        grossSalary: grossSalary,
        netSalary: grossSalary - totalDeductions,
        bankCode: config['銀行代碼'] || "",
        bankAccount: config['銀行帳號'] || "",
        status: "已設定",
        note: "自動建立"
      };
      
      return saveMonthlySalary(basicSalary);
    }
    
    return saveMonthlySalary(calculatedSalary.data);
    
  } catch (error) {
    Logger.log(` 同步失敗: ${error}`);
    return { success: false, message: error.toString() };
  }
}

// ==================== 薪資計算功能 ====================
/**
 *  取得員工該月份的加班記錄（正確版）
 * 
 * @param {string} employeeId - 員工ID
 * @param {string} yearMonth - 年月 (YYYY-MM)
 * @returns {Array} 加班記錄陣列
 */
function getEmployeeMonthlyOvertime(employeeId, yearMonth) {
  try {
    Logger.log(' 開始取得員工加班記錄');
    Logger.log('   員工ID: ' + employeeId);
    Logger.log('   年月: ' + yearMonth);
    
    // 批次計算時走快取，單筆計算時照樣即時讀取（見 Utils.gs 的 withSheetCache_）
    const data = getSheetValues_(SHEET_OVERTIME);
    
    if (data.length === 0) {
      Logger.log(' 找不到「加班申請」工作表或沒有資料');
      return [];
    }
    
    if (data.length < 2) {
      Logger.log(' 「加班申請」工作表無資料');
      return [];
    }
    
    const headers = data[0];
    Logger.log(' 加班申請欄位: ' + headers.join(', '));
    
    // ⭐ 根據實際欄位結構定義索引
    const userIdIndex = 1;      // 員工ID
    const dateIndex = 3;        // 加班日期
    const hoursIndex = 6;       // 加班時數
    const statusIndex = 9;      // 審核狀態
    
    Logger.log(' 使用欄位索引:');
    Logger.log('   員工ID: ' + userIdIndex);
    Logger.log('   加班日期: ' + dateIndex);
    Logger.log('   加班時數: ' + hoursIndex);
    Logger.log('   審核狀態: ' + statusIndex);
    
    const records = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      const rowUserId = String(row[userIdIndex] || '').trim();
      const date = row[dateIndex];
      const hours = row[hoursIndex];
      const status = String(row[statusIndex] || '').trim().toLowerCase();
      
      // 檢查員工ID
      if (rowUserId !== employeeId) continue;
      
      // ⭐ 只計算已核准的加班
      if (status !== 'approved') {
        Logger.log(`   ⏭ 跳過未核准的加班: ${date} (狀態: ${status})`);
        continue;
      }
      
      // 解析日期
      let dateStr = '';
      if (date instanceof Date) {
        dateStr = Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM-dd');
      } else if (typeof date === 'string') {
        dateStr = date;
      } else {
        Logger.log(`   ⏭ 跳過無效日期: ${date}`);
        continue;
      }
      
      // 檢查年月
      const dateYearMonth = dateStr.substring(0, 7);
      if (dateYearMonth !== yearMonth) {
        continue;
      }
      
      const hoursNum = parseFloat(hours) || 0;
      
      records.push({
        date: dateStr,
        hours: hoursNum
      });
      
      Logger.log(`    ${dateStr}: ${hoursNum}h (狀態: ${status})`);
    }
    
    Logger.log(` 找到 ${records.length} 筆已核准的加班記錄`);
    
    return records;
    
  } catch (error) {
    Logger.log(' 取得加班記錄失敗: ' + error);
    Logger.log(' 錯誤堆疊: ' + error.stack);
    return [];
  }
}

/**
 *  儲存月薪資記錄（完整版 - 含早退扣款）
 * 
 * ⭐ 重要：此版本對應 41 欄的月薪資記錄表
 */
function saveMonthlySalary(salaryData) {
  try {
    const sheet = getMonthlySalarySheetEnhanced();
    
    let normalizedYearMonth = salaryData.yearMonth;
    
    if (salaryData.yearMonth instanceof Date) {
      normalizedYearMonth = Utilities.formatDate(salaryData.yearMonth, "Asia/Taipei", "yyyy-MM");
    } else if (typeof salaryData.yearMonth === 'string') {
      normalizedYearMonth = salaryData.yearMonth.substring(0, 7);
    }
    
    const salaryId = `SAL-${normalizedYearMonth}-${salaryData.employeeId}`;
    
    // ⭐⭐⭐ 加強版：支援三種可能的欄位名稱
    let salaryType = '月薪'; // 預設值
    
    if (salaryData.salaryType && String(salaryData.salaryType).trim() !== '') {
      salaryType = String(salaryData.salaryType).trim();
    } else if (salaryData['薪資類型'] && String(salaryData['薪資類型']).trim() !== '') {
      salaryType = String(salaryData['薪資類型']).trim();
    } else {
      const configResult = getEmployeeSalaryTW(salaryData.employeeId || salaryData['員工ID']);
      if (configResult.success && configResult.data) {
        salaryType = String(configResult.data['薪資類型'] || '月薪').trim();
      }
    }
    
    Logger.log(` saveMonthlySalary 儲存:`);
    Logger.log(`   - salaryId: ${salaryId}`);
    Logger.log(`   - 薪資類型: ${salaryType}`);
    
    // 自訂項目明細先算好，row 裡每一欄維持一行，才好跟 MONTHLY_SALARY_HEADERS 逐欄對照
    const customItemDetail = JSON.stringify({
      allowances: salaryData.customAllowances || [],
      deductions: salaryData.customDeductions || []
    });
    
    // row 的順序必須與 MONTHLY_SALARY_HEADERS 完全一致（依位置寫入）
    const row = [
      // === 基本資訊（8欄：A-H）===
      salaryId,                                              // A (col 1)
      salaryData.employeeId || salaryData['員工ID'],         // B (col 2)
      salaryData.employeeName || salaryData['員工姓名'],     // C (col 3)
      normalizedYearMonth,                                   // D (col 4)
      salaryType,                                            // E (col 5)
      salaryData.hourlyRate || salaryData['時薪'] || 0,     // F (col 6)
      salaryData.totalWorkHours || salaryData['工作時數'] || 0,    // G (col 7)
      salaryData.totalOvertimeHours || salaryData['總加班時數'] || 0, // H (col 8)
      
      // === 應發項目（11欄：I-S）===
      salaryData.baseSalary || salaryData['基本薪資'] || 0,              // I (col 9)
      salaryData.positionAllowance || salaryData['職務加給'] || 0,       // J (col 10)
      salaryData.mealAllowance || salaryData['伙食費'] || 0,             // K (col 11)
      salaryData.transportAllowance || salaryData['交通補助'] || 0,      // L (col 12)
      salaryData.attendanceBonus || salaryData['全勤獎金'] || 0,         // M (col 13)
      salaryData.performanceBonus || salaryData['業績獎金'] || 0,        // N (col 14)
      salaryData.otherAllowances || salaryData['其他津貼'] || 0,         // O (col 15)
      salaryData.weekdayOvertimePay || salaryData['平日加班費'] || 0,    // P (col 16)
      salaryData.restdayOvertimePay || salaryData['休息日加班費'] || 0,  // Q (col 17)
      salaryData.holidayWorkPay || salaryData['國定假日出勤薪資'] || 0,  // R (col 18)
      salaryData.holidayOvertimePay || salaryData['國定假日加班費'] || 0, // S (col 19)
      
      // === 法定扣款（5欄：T-X）===
      salaryData.laborFee || salaryData['勞保費'] || 0,                  // T (col 20)
      salaryData.healthFee || salaryData['健保費'] || 0,                 // U (col 21)
      salaryData.employmentFee || salaryData['就業保險費'] || 0,         // V (col 22)
      salaryData.pensionSelf || salaryData['勞退自提'] || 0,             // W (col 23)
      salaryData.incomeTax || salaryData['所得稅'] || 0,                 // X (col 24)
      
      // === 其他扣款（6欄：Y-AD）⭐ 包含早退扣款 ===
      salaryData.leaveDeduction || salaryData['請假扣款'] || 0,          // Y (col 25)
      salaryData.earlyLeaveDeduction || salaryData['早退扣款'] || 0,     // Z (col 26) ⭐⭐⭐
      salaryData.welfareFee || salaryData['福利金扣款'] || 0,            // AA (col 27)
      salaryData.dormitoryFee || salaryData['宿舍費用'] || 0,            // AB (col 28)
      salaryData.groupInsurance || salaryData['團保費用'] || 0,          // AC (col 29)
      salaryData.otherDeductions || salaryData['其他扣款'] || 0,         // AD (col 30)
      
      // === 請假明細（4欄：AE-AH）===
      salaryData.sickLeaveHours || salaryData['病假時數'] || 0,          // AE (col 31)
      salaryData.sickLeaveDeduction || salaryData['病假扣款'] || 0,      // AF (col 32)
      salaryData.personalLeaveHours || salaryData['事假時數'] || 0,      // AG (col 33)
      salaryData.personalLeaveDeduction || salaryData['事假扣款'] || 0,  // AH (col 34)
      
      // === 總計（2欄：AI-AJ）===
      salaryData.grossSalary || salaryData['應發總額'] || 0,             // AI (col 35)
      salaryData.netSalary || salaryData['實發金額'] || 0,               // AJ (col 36)
      
      // === 銀行資訊（2欄：AK-AL）===
      salaryData.bankCode || salaryData['銀行代碼'] || "",               // AK (col 37)
      salaryData.bankAccount || salaryData['銀行帳號'] || "",            // AL (col 38)
      
      // === 系統欄位（3欄：AM-AO）===
      salaryData.status || salaryData['狀態'] || "已計算",               // AM (col 39)
      salaryData.note || salaryData['備註'] || "",                       // AN (col 40)
      new Date(),                                                        // AO (col 41)
      
      // === 自訂項目（3欄：AP-AR）===
      // 合計是為了在試算表裡直接看得到，明細存 JSON 讓薪資單可以逐項列出
      salaryData.customAllowanceTotal || 0,                              // AP (col 42)
      salaryData.customDeductionTotal || 0,                              // AQ (col 43)
      customItemDetail                                                   // AR (col 44)
    ];
    
    Logger.log(` 準備寫入的 row 長度: ${row.length}`);
    
    // 檢查是否已存在
    const data = sheet.getDataRange().getValues();
    const headers = data.length > 0 ? data[0] : MONTHLY_SALARY_HEADERS;
    let found = false;
    let beforeRow = null;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === salaryId) {
        // 覆寫之前先留一份，稽核記錄才知道原本是多少
        beforeRow = data[i].slice();
        sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
        found = true;
        Logger.log(` 更新薪資單: ${salaryId}`);
        break;
      }
    }
    
    if (!found) {
      sheet.appendRow(row);
      Logger.log(` 新增薪資單: ${salaryId}`);
    }
    
    // 薪資單是會被勞檢的資料，每次寫入都要留下「誰、什麼時候、把哪一欄從多少改成多少」
    if (typeof logSalaryChange_ === 'function') {
      logSalaryChange_({
        salaryId: salaryId,
        headers: headers,
        beforeRow: beforeRow,
        afterRow: row,
        token: salaryData.token || (globalThis.currentRequest &&
                                    globalThis.currentRequest.parameter &&
                                    globalThis.currentRequest.parameter.token)
      });
    }
    
    return { success: true, salaryId: salaryId, message: "薪資單儲存成功" };
    
  } catch (error) {
    Logger.log(" 儲存薪資單失敗: " + error);
    Logger.log(" 錯誤堆疊: " + error.stack);
    return { success: false, message: error.toString() };
  }
}

/**
 *  API 入口：儲存月薪資記錄（接收 query string 參數）
 */
function saveMonthlySalaryAPI() {
  try {
    // 從 query string 讀取參數
    const salaryData = {
      employeeId: getParam('employeeId'),
      employeeName: getParam('employeeName'),
      yearMonth: getParam('yearMonth'),
      
      // ⭐ 薪資類型相關
      salaryType: getParam('salaryType') || '月薪',
      hourlyRate: parseFloat(getParam('hourlyRate')) || 0,
      totalWorkHours: parseFloat(getParam('totalWorkHours')) || 0,
      totalOvertimeHours: parseFloat(getParam('totalOvertimeHours')) || 0,
      
      // 應發項目
      baseSalary: parseFloat(getParam('baseSalary')) || 0,
      positionAllowance: parseFloat(getParam('positionAllowance')) || 0,
      mealAllowance: parseFloat(getParam('mealAllowance')) || 0,
      transportAllowance: parseFloat(getParam('transportAllowance')) || 0,
      attendanceBonus: parseFloat(getParam('attendanceBonus')) || 0,
      performanceBonus: parseFloat(getParam('performanceBonus')) || 0,
      otherAllowances: parseFloat(getParam('otherAllowances')) || 0,
      
      // 加班費
      weekdayOvertimePay: parseFloat(getParam('weekdayOvertimePay')) || 0,
      restdayOvertimePay: parseFloat(getParam('restdayOvertimePay')) || 0,
      holidayOvertimePay: parseFloat(getParam('holidayOvertimePay')) || 0,
      
      // 法定扣款
      laborFee: parseFloat(getParam('laborFee')) || 0,
      healthFee: parseFloat(getParam('healthFee')) || 0,
      employmentFee: parseFloat(getParam('employmentFee')) || 0,
      pensionSelf: parseFloat(getParam('pensionSelf')) || 0,
      pensionSelfRate: parseFloat(getParam('pensionSelfRate')) || 0,
      incomeTax: parseFloat(getParam('incomeTax')) || 0,
      
      // 其他扣款
      leaveDeduction: parseFloat(getParam('leaveDeduction')) || 0,
      welfareFee: parseFloat(getParam('welfareFee')) || 0,
      dormitoryFee: parseFloat(getParam('dormitoryFee')) || 0,
      groupInsurance: parseFloat(getParam('groupInsurance')) || 0,
      otherDeductions: parseFloat(getParam('otherDeductions')) || 0,
      
      // 總計
      grossSalary: parseFloat(getParam('grossSalary')) || 0,
      netSalary: parseFloat(getParam('netSalary')) || 0,
      
      // 銀行資訊
      bankCode: getParam('bankCode') || '',
      bankAccount: getParam('bankAccount') || '',
      
      // 狀態
      status: getParam('status') || '已計算',
      note: getParam('note') || ''
    };
    
    Logger.log(' saveMonthlySalaryAPI 收到參數:');
    Logger.log('   - employeeId: ' + salaryData.employeeId);
    Logger.log('   - yearMonth: ' + salaryData.yearMonth);
    Logger.log('   - salaryType: ' + salaryData.salaryType);
    Logger.log('   - hourlyRate: ' + salaryData.hourlyRate);
    Logger.log('   - totalWorkHours: ' + salaryData.totalWorkHours);
    Logger.log('   - baseSalary: ' + salaryData.baseSalary);
    
    // 呼叫原本的 saveMonthlySalary 函數
    const result = saveMonthlySalary(salaryData);
    
    if (result.success) {
      return jsonResponse(true, { salaryId: result.salaryId }, result.message);
    } else {
      return jsonResponse(false, null, result.message);
    }
    
  } catch (error) {
    Logger.log(' saveMonthlySalaryAPI 錯誤: ' + error);
    return jsonResponse(false, null, error.toString());
  }
}
/**
 *  查詢我的薪資（完整版 - 即時重算）
 * 
 * @param {string} userId - 員工ID
 * @param {string} yearMonth - 年月 (YYYY-MM)
 * @returns {Object} 薪資資料
 */
function getMySalary(userId, yearMonth) {
  try {
    const employeeId = userId;
    
    Logger.log(` 查詢薪資: ${employeeId}, ${yearMonth}`);
    
    // ⭐⭐⭐ 步驟 1：先重新計算薪資（確保資料是最新的）
    Logger.log(' 重新計算薪資...');
    const calculatedResult = calculateMonthlySalary(employeeId, yearMonth);
    
    if (calculatedResult.success) {
      // ⭐ 步驟 2：儲存計算結果到 Sheet
      Logger.log(' 儲存計算結果...');
      const saveResult = saveMonthlySalary(calculatedResult.data);
      
      if (!saveResult.success) {
        Logger.log(' 儲存失敗，但仍返回計算結果');
      }
      
      // ⭐ 步驟 3：返回最新的計算結果
      Logger.log(' 返回最新薪資資料');
      return { 
        success: true, 
        data: calculatedResult.data 
      };
    }
    
    // ⭐ 如果計算失敗，嘗試從 Sheet 讀取舊資料
    Logger.log(' 計算失敗，嘗試讀取舊資料...');
    
    const sheet = getMonthlySalarySheetEnhanced();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    if (data.length < 2) {
      return { success: false, message: "薪資記錄表中沒有資料" };
    }
    
    const employeeIdIndex = headers.indexOf('員工ID');
    const yearMonthIndex = headers.indexOf('年月');
    
    if (employeeIdIndex === -1 || yearMonthIndex === -1) {
      return { success: false, message: "試算表缺少必要欄位" };
    }
    
    for (let i = 1; i < data.length; i++) {
      const rowEmployeeId = String(data[i][employeeIdIndex]).trim();
      const rawYearMonth = data[i][yearMonthIndex];
      
      let normalizedYearMonth = '';
      
      if (rawYearMonth instanceof Date) {
        normalizedYearMonth = Utilities.formatDate(rawYearMonth, 'Asia/Taipei', 'yyyy-MM');
      } else if (typeof rawYearMonth === 'string') {
        normalizedYearMonth = rawYearMonth.substring(0, 7);
      } else {
        normalizedYearMonth = String(rawYearMonth).substring(0, 7);
      }
      
      if (rowEmployeeId === employeeId && normalizedYearMonth === yearMonth) {
        const salary = {};
        headers.forEach((header, index) => {
          if (header === '年月' && data[i][index] instanceof Date) {
            salary[header] = Utilities.formatDate(data[i][index], 'Asia/Taipei', 'yyyy-MM');
          } else {
            salary[header] = data[i][index];
          }
        });
        
        return { success: true, data: salary };
      }
    }
    
    return { success: false, message: "查無薪資記錄" };
    
  } catch (error) {
    Logger.log(' 查詢薪資失敗: ' + error);
    Logger.log(' 錯誤堆疊: ' + error.stack);
    return { success: false, message: error.toString() };
  }
}

/**
 *  查詢我的薪資歷史（完整版）
 */
function getMySalaryHistory(userId, limit = 12) {
  try {
    const employeeId = userId;
    const sheet = getMonthlySalarySheetEnhanced();
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      return { success: true, data: [], total: 0 };
    }
    
    const headers = data[0];
    const employeeIdIndex = headers.indexOf('員工ID');
    
    if (employeeIdIndex === -1) {
      return { success: false, message: "試算表缺少「員工ID」欄位" };
    }
    
    const salaries = [];
    
    for (let i = 1; i < data.length; i++) {
      const rowEmployeeId = String(data[i][employeeIdIndex]).trim();
      
      if (rowEmployeeId === employeeId) {
        const salary = {};
        headers.forEach((header, index) => {
          if (header === '年月' && data[i][index] instanceof Date) {
            salary[header] = Utilities.formatDate(data[i][index], "Asia/Taipei", "yyyy-MM");
          } else {
            salary[header] = data[i][index];
          }
        });
        salaries.push(salary);
      }
    }
    
    salaries.sort((a, b) => {
      const yearMonthA = String(a['年月'] || '');
      const yearMonthB = String(b['年月'] || '');
      return yearMonthB.localeCompare(yearMonthA);
    });
    
    const result = salaries.slice(0, limit);
    
    return { success: true, data: result, total: salaries.length };
    
  } catch (error) {
    Logger.log(" 查詢薪資歷史失敗: " + error);
    return { success: false, message: error.toString() };
  }
}

/**
 *  查詢所有員工的月薪資列表（完整版）
 */
function getAllMonthlySalary(yearMonth) {
  try {
    const sheet = getMonthlySalarySheetEnhanced();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const salaries = [];
    
    for (let i = 1; i < data.length; i++) {
      const rawYearMonth = data[i][3];
      
      let normalizedYearMonth = '';
      
      if (rawYearMonth instanceof Date) {
        normalizedYearMonth = Utilities.formatDate(rawYearMonth, "Asia/Taipei", "yyyy-MM");
      } else if (typeof rawYearMonth === 'string') {
        normalizedYearMonth = rawYearMonth.substring(0, 7);
      }
      
      if (!yearMonth || normalizedYearMonth === yearMonth) {
        const salary = {};
        headers.forEach((header, index) => {
          if (header === '年月') {
            salary[header] = normalizedYearMonth;
          } else {
            salary[header] = data[i][index];
          }
        });
        salaries.push(salary);
      }
    }
    
    return { success: true, data: salaries };
    
  } catch (error) {
    Logger.log(" 查詢薪資列表失敗: " + error);
    return { success: false, message: error.toString() };
  }
}

// ==================== 輔助函數 ====================

/**
 *  取得員工加班記錄
 */
function getEmployeeOvertimeRecords(employeeId, yearMonth) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("加班申請");
    
    if (!sheet) {
      return { success: true, data: [] };
    }
    
    const values = sheet.getDataRange().getValues();
    const records = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      if (!row[1] || !row[3]) continue;
      
      const rowEmployeeId = String(row[1]).trim();
      const overtimeDate = row[3];
      
      if (rowEmployeeId !== employeeId) continue;
      
      let dateStr = "";
      if (overtimeDate instanceof Date) {
        dateStr = Utilities.formatDate(overtimeDate, "Asia/Taipei", "yyyy-MM");
      } else if (typeof overtimeDate === "string") {
        dateStr = overtimeDate.substring(0, 7);
      }
      
      if (dateStr !== yearMonth) continue;
      
      const status = String(row[9] || "").trim().toLowerCase();
      if (status !== "approved") continue;
      
      records.push({
        overtimeDate: dateStr,
        overtimeHours: parseFloat(row[6]) || 0,
        overtimeType: "平日加班",
        reviewStatus: "核准"
      });
    }
    
    return { success: true, data: records };
    
  } catch (error) {
    Logger.log(" 取得加班記錄失敗: " + error);
    return { success: false, message: error.toString(), data: [] };
  }
}

function getEmployeeMonthlyLeave(employeeId, yearMonth) {
  try {
    Logger.log(` 開始取得 ${employeeId} 在 ${yearMonth} 的請假紀錄`);
    
    const values = getSheetValues_("請假紀錄");
    
    if (values.length === 0) {
      Logger.log(' 找不到「請假紀錄」工作表或沒有資料');
      return { success: true, data: [] };
    }
    const records = [];
    
    Logger.log(` 請假紀錄總行數: ${values.length - 1}`);
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      // ⭐⭐⭐ 修正：使用正確的欄位索引
      const rowEmployeeId = String(row[1] || '').trim();  // B 欄
      const leaveType = String(row[4] || '').trim();      // E 欄
      const startDate = row[5];                            // F 欄
      const leaveDays = parseFloat(row[8]) || 0;          // I 欄
      const status = String(row[10] || '').trim();        // K 欄
      
      // 跳過空白行
      if (!rowEmployeeId || !startDate) continue;
      
      // 檢查員工ID
      if (rowEmployeeId !== employeeId) continue;
      
      // 解析日期
      let dateStr = "";
      if (startDate instanceof Date) {
        dateStr = Utilities.formatDate(startDate, "Asia/Taipei", "yyyy-MM");
      } else if (typeof startDate === "string") {
        dateStr = startDate.substring(0, 7);
      }
      
      // 檢查年月
      if (dateStr !== yearMonth) continue;
      
      // ⭐⭐⭐ 檢查狀態（兼容多種格式）
      const statusUpper = status.toUpperCase();
      if (statusUpper !== "APPROVED" && statusUpper !== "核准") {
        Logger.log(`   ⏭ 跳過未核准的請假: ${dateStr}, 狀態: ${status}`);
        continue;
      }
      
      Logger.log(`    ${dateStr}: ${leaveType}, ${leaveDays} 天 (${status})`);
      
      records.push({
        leaveType: leaveType,
        startDate: startDate,
        leaveDays: leaveDays,
        reviewStatus: "核准"
      });
    }
    
    Logger.log(` 找到 ${records.length} 筆已核准的請假紀錄`);
    
    return { success: true, data: records };
    
  } catch (error) {
    Logger.log(" 取得請假記錄失敗: " + error);
    Logger.log(" 錯誤堆疊: " + error.stack);
    return { success: false, message: error.toString(), data: [] };
  }
}

// ==================== 時薪計算功能 ====================

/**
 *  計算時薪員工的月薪資（完整修正版 - 含請假扣款）
 * 
 * @param {string} employeeId - 員工ID
 * @param {string} yearMonth - 年月 (YYYY-MM)
 * @returns {Object} 薪資計算結果
 */
function calculateHourlySalary(employeeId, yearMonth) {
  try {
    Logger.log(` 開始計算時薪薪資: ${employeeId}, ${yearMonth}`);
    
    // 1. 取得員工薪資設定
    const salaryConfig = getEmployeeSalaryTW(employeeId);
    if (!salaryConfig.success) {
      Logger.log(' 找不到員工薪資設定');
      return { success: false, message: "找不到員工薪資設定" };
    }
    
    const config = salaryConfig.data;
    const hourlyRate = parseFloat(config['基本薪資']) || 0; // 時薪
    
    Logger.log(` 時薪: $${hourlyRate}`);
    
    // 2. ⭐ 取得該月份的打卡記錄
    const attendanceRecords = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
    Logger.log(` 找到 ${attendanceRecords.length} 筆打卡記錄`);
    
    // 3. 計算工作時數
    let totalWorkHours = 0;
    
    attendanceRecords.forEach(record => {
      if (record.workHours > 0) {
        totalWorkHours += record.workHours;
        Logger.log(`   ${record.date}: ${record.punchIn} ~ ${record.punchOut} = ${record.workHours.toFixed(2)}h`);
      }
    });

    Logger.log(`⏱ 總工作時數: ${totalWorkHours.toFixed(1)}h`);
    
    // 4. 計算基本薪資（工作時數 × 時薪）
    const basePay = totalWorkHours * hourlyRate;
    
    Logger.log(` 基本薪資 = ${hourlyRate} × ${totalWorkHours.toFixed(2)} = $${Math.round(basePay)}`);
    
    // 5. ⭐ 取得加班記錄
    const overtimeRecords = getEmployeeMonthlyOvertime(employeeId, yearMonth);
    Logger.log(` 找到 ${overtimeRecords.length} 筆加班記錄`);
    
    // 6. ⭐⭐⭐ 計算加班費（區分平日/休息日/例假日/國定假日）
    let totalOvertimeHours = 0;
    let weekdayOvertimePay = 0;   // 平日加班費
    let restdayOvertimePay = 0;   // 休息日加班費（週六）
    let sundayOvertimePay = 0;    // 例假日加班費（週日）
    let holidayOvertimePay = 0;   // 國定假日加班費
    let holidayWorkPay = 0;       // 國定假日出勤薪資（正常工資）
    
    // 按日期分組計算
    const overtimeByDate = {};

    overtimeRecords.forEach(record => {
      const date = record.date;
      if (!overtimeByDate[date]) {
        overtimeByDate[date] = 0;
      }
      overtimeByDate[date] += parseFloat(record.hours) || 0;
    });

    // ⭐⭐⭐ 讀取員工類型
    const overtimeRules = getOvertimeRules_();
    const employeeType = String(config['員工類型'] || '兼職').trim();
    const isFullTime = (employeeType === '正職');
    Logger.log(` 員工類型: ${employeeType}`);

    let holidayCompHours = 0;
    
    // ⭐⭐⭐ 遍歷每天的加班記錄（區分四種日期類型）
    Object.keys(overtimeByDate).forEach(date => {
      let dailyHours = overtimeByDate[date];
      
      // 判斷日期類型
      const dateType = getDateType(date);
      const dateTypeName = {
        'weekday': '平日',
        'restday': '休息日（週六）',
        'sunday': '例假日（週日）',
        'holiday': '國定假日'
      }[dateType];
      
      Logger.log(`\n ${date} (${dateTypeName}): ${dailyHours.toFixed(1)}h`);
      
      // 根據日期類型限制加班時數（上限同樣可在「薪資規則」調整）
      let maxHours = overtimeRules.maxWeekdayHours;
      if (dateType === 'restday') maxHours = overtimeRules.maxRestdayHours;
      if (dateType === 'holiday') maxHours = overtimeRules.maxHolidayHours;
      
      if (dailyHours > maxHours) {
        Logger.log(`    超過上限 (${dailyHours}h > ${maxHours}h)，限制為 ${maxHours}h`);
        dailyHours = maxHours;
      }
      
      // ⭐⭐⭐ 關鍵：國定假日分別計算正常薪資與加班費
      if (dateType === 'holiday') {
        if (isFullTime) {
          // 正職 → 補休，不計費
          holidayCompHours += dailyHours;
          totalOvertimeHours += dailyHours;
          Logger.log(`    正職員工國定假日補休 ${dailyHours}h，不計費`);
          return;
        } else {
          // 兼職/約聘 → ×2
          const normalPay = hourlyRate * dailyHours * 1.0;
          const overtimePay = hourlyRate * dailyHours * overtimeRules.holiday;
          holidayWorkPay += normalPay;
          holidayOvertimePay += overtimePay;
          Logger.log(`   - 正常薪資: $${Math.round(normalPay)} (×1.0)`);
          Logger.log(`   - 加班費: $${Math.round(overtimePay)} (×2.0)`);
          Logger.log(`    兼職員工國定假日: $${Math.round(normalPay + overtimePay)}`);
        }
        
      } else {
        // 其他日期類型：平日/休息日/例假日
        const pay = calculateOvertimePay(dailyHours, hourlyRate, dateType);
        const totalPay = pay.firstPay + pay.secondPay + pay.thirdPay;
        
        if (dateType === 'weekday') {
          weekdayOvertimePay += totalPay;
          Logger.log(`   - 前2h: $${pay.firstPay} (×1.34)`);
          if (pay.secondPay > 0) {
            Logger.log(`   - 3h起: $${pay.secondPay} (×1.67)`);
          }
          Logger.log(`    小計: $${totalPay}`);
          
        } else if (dateType === 'restday') {
          restdayOvertimePay += totalPay;
          Logger.log(`   - 前2h: $${pay.firstPay} (×1.34)`);
          if (pay.secondPay > 0) {
            Logger.log(`   - 3-8h: $${pay.secondPay} (×1.67)`);
          }
          if (pay.thirdPay > 0) {
            Logger.log(`   - 9h起: $${pay.thirdPay} (×2.67)`);
          }
          Logger.log(`    小計: $${totalPay}`);
          
        } else if (dateType === 'sunday') {
          sundayOvertimePay += totalPay;
          Logger.log(`   - 全天: $${totalPay} (×2.0)`);
        }
      }
      
      totalOvertimeHours += dailyHours;
    });

    // ⭐ 四捨五入
    weekdayOvertimePay = Math.round(weekdayOvertimePay);
    restdayOvertimePay = Math.round(restdayOvertimePay);
    holidayOvertimePay = Math.round(holidayOvertimePay);
    holidayWorkPay = Math.round(holidayWorkPay);

    Logger.log(`\n 加班費計算完成:`);
    Logger.log(`   - 總時數: ${totalOvertimeHours.toFixed(1)}h`);
    Logger.log(`   - 平日加班費: $${weekdayOvertimePay}`);
    Logger.log(`   - 休息日加班費: $${restdayOvertimePay}`);
    Logger.log(`   - 國定假日出勤薪資: $${holidayWorkPay}`);
    Logger.log(`   - 國定假日加班費: $${holidayOvertimePay}`);
    
    // 7. 固定津貼（時薪員工通常沒有，但保留欄位）
    const positionAllowance = parseFloat(config['職務加給']) || 0;
    const mealAllowance = parseFloat(config['伙食費']) || 0;
    const transportAllowance = parseFloat(config['交通補助']) || 0;
    let attendanceBonus = parseFloat(config['全勤獎金']) || 0;
    const performanceBonus = parseFloat(config['業績獎金']) || 0;
    const otherAllowances = parseFloat(config['其他津貼']) || 0;
    
    Logger.log(` 固定津貼:`);
    if (positionAllowance > 0) Logger.log(`   - 職務加給: $${positionAllowance}`);
    if (mealAllowance > 0) Logger.log(`   - 伙食費: $${mealAllowance}`);
    if (transportAllowance > 0) Logger.log(`   - 交通補助: $${transportAllowance}`);
    if (attendanceBonus > 0) Logger.log(`   - 全勤獎金: $${attendanceBonus}`);
    if (performanceBonus > 0) Logger.log(`   - 業績獎金: $${performanceBonus}`);
    if (otherAllowances > 0) Logger.log(`   - 其他津貼: $${otherAllowances}`);
    
    // 7.5 ⭐⭐⭐ 早退扣款（時薪員工通常不適用，但保留欄位）
    let earlyLeaveDeduction = 0;

    // 時薪員工通常按實際工時計薪，不計算早退扣款
    // 如果需要計算，可參考月薪員工的邏輯
    Logger.log(`\n 早退扣款: $0 (時薪員工不適用)`);
    // ⭐⭐⭐ 8. 請假扣款計算（修正為時數版本）
    Logger.log(`\n 開始計算請假扣款...`);
    const leaveRecords = getEmployeeMonthlyLeave(employeeId, yearMonth);

    let leaveDeduction = 0;
    let sickLeaveHours = 0;        // ⭐ 改為時數
    let sickLeaveDeduction = 0;
    let personalLeaveHours = 0;    // ⭐ 改為時數
    let personalLeaveDeduction = 0;

    if (leaveRecords.success && leaveRecords.data && leaveRecords.data.length > 0) {
      Logger.log(` 找到 ${leaveRecords.data.length} 筆請假記錄`);
      
      leaveRecords.data.forEach(record => {
        if (record.reviewStatus === '核准') {
          const leaveType = String(record.leaveType).toUpperCase();
          const days = parseFloat(record.leaveDays) || 0;
          const dailyHours = 8; // 一天工作8小時
          const deductionHours = days * dailyHours; // ⭐ 轉換為時數
          
          // ⭐ 病假：扣半薪（時薪 × 工時 × 50%）
          if (leaveType === 'SICK_LEAVE' || leaveType === '病假') {
            sickLeaveHours += deductionHours; // ⭐ 累計時數
            const deduction = Math.round(hourlyRate * deductionHours * 0.5);
            sickLeaveDeduction += deduction;
            Logger.log(`   病假 ${days} 天 = ${deductionHours}h × $${hourlyRate} × 50% = $${deduction}`);
          }
          
          // ⭐ 事假：扣全薪（時薪 × 工時）
          if (leaveType === 'PERSONAL_LEAVE' || leaveType === '事假') {
            personalLeaveHours += deductionHours; // ⭐ 累計時數
            const deduction = Math.round(hourlyRate * deductionHours);
            personalLeaveDeduction += deduction;
            Logger.log(`   事假 ${days} 天 = ${deductionHours}h × $${hourlyRate} = $${deduction}`);
          }
        }
      });
      
      leaveDeduction = sickLeaveDeduction + personalLeaveDeduction;
      
      Logger.log(`\n 請假扣款統計:`);
      Logger.log(`   病假: ${sickLeaveHours} 小時，扣款 $${sickLeaveDeduction} (半薪)`);
      Logger.log(`   事假: ${personalLeaveHours} 小時，扣款 $${personalLeaveDeduction} (全薪)`);
      Logger.log(`   合計扣款: $${leaveDeduction}`);
      
      // ⭐ 如果有請假，取消全勤獎金
      if (leaveDeduction > 0) {
        attendanceBonus = 0;
        Logger.log(` 有請假記錄，取消全勤獎金`);
      }
    } else {
      Logger.log(` 無請假記錄`);
    }
    
    // 8.5 自訂項目（管理員自行定義的津貼與扣款）
    const customItems = resolveCustomSalaryItems_(config[SALARY_CUSTOM_ITEMS_COLUMN]);
    
    if (customItems.allowances.length > 0 || customItems.deductions.length > 0) {
      Logger.log(`\n 自訂項目:`);
      customItems.allowances.forEach(item => Logger.log(`   + ${item.name}: $${item.amount}`));
      customItems.deductions.forEach(item => Logger.log(`   - ${item.name}: $${item.amount}`));
    }
    
    // 9. 應發總額
    const grossSalary = basePay + 
                       positionAllowance + 
                       mealAllowance + 
                       transportAllowance + 
                       attendanceBonus + 
                       performanceBonus + 
                       otherAllowances +
                       weekdayOvertimePay + 
                       restdayOvertimePay +
                       holidayOvertimePay +
                       holidayWorkPay +
                       customItems.allowanceTotal;
    
    Logger.log(` 應發總額: $${Math.round(grossSalary)}`);
    
    // 10. 扣款項目（時薪若月薪未達基本工資，可能不需扣保險）
    let laborFee = 0;
    let healthFee = 0;
    let employmentFee = 0;
    let pensionSelf = 0;
    
    // ⭐ 修正後：時薪人員固定使用最低投保級距
    // 時薪人員不論月薪資多少，一律使用 $11,100 投保級距
    const insuredSalary = 11100;  // ⭐ 2026年最低投保級距
    //  優先使用設定表中的數值（可能是 0 或其他值）
    laborFee = parseFloat(config['勞保費']) || 0;
    healthFee = parseFloat(config['健保費']) || 0;

    // 如果設定表中沒有值（都是 0），則使用預設值
    if (laborFee === 0 && healthFee === 0 && parseFloat(config['基本薪資']) > 0) {
        Logger.log(' 設定表中扣款為 0，使用預設值');
        laborFee = 277;   // 預設勞保費
        healthFee = 458;  // 預設健保費
    }

    Logger.log(` 時薪人員扣款（從設定表讀取）:`);
    Logger.log(`   投保級距: $${insuredSalary}`);
    Logger.log(`   勞保費: $${laborFee} (設定值: ${config['勞保費']})`);
    Logger.log(`   健保費: $${healthFee} (設定值: ${config['健保費']})`);
    // laborFee = 277;   // 兼職勞保費（固定）
    // healthFee = 458;  // 兼職健保費（固定）
    // laborFee = Math.round(insuredSalary * 0.125 * 0.2);      // NT$738
    // healthFee = Math.round(insuredSalary * 0.0517 * 0.3 * 2.62);    // NT$458
    // employmentFee = Math.round(insuredSalary * 0.01 * 0.2);  // NT$59

    Logger.log(` 時薪人員扣款計算 (固定投保級距: $${insuredSalary})`);
    const pensionSelfRate = parseFloat(config['勞退自提率(%)']) || 0;
    pensionSelf = Math.round(insuredSalary * (pensionSelfRate / 100));

    // 起扣門檻與稅率級距改由「薪資規則」設定，預設值與原本寫死的相同
    const incomeTax = calculateIncomeTax_(grossSalary);

    if (incomeTax > 0) {
      Logger.log(` 時薪員工計算所得稅: $${incomeTax}`);
    } else {
      Logger.log(` 時薪員工未達起扣門檻，不扣所得稅`);
    }

    Logger.log(` 時薪人員扣款計算 (固定投保級距: $${insuredSalary})`);
    Logger.log(`   - 應發總額: $${Math.round(grossSalary)}`);
    Logger.log(`   - 勞保費: $${laborFee}`);
    Logger.log(`   - 健保費: $${healthFee}`);
    Logger.log(`   - 就業保險費: $0 (不計算)`);
    Logger.log(`   - 勞退自提 (${pensionSelfRate}%): $${pensionSelf}`);
    Logger.log(`   - 所得稅: $${incomeTax}`);
    
    // 11. 其他扣款
    const welfareFee = parseFloat(config['福利金扣款']) || 0;
    const dormitoryFee = parseFloat(config['宿舍費用']) || 0;
    const groupInsurance = parseFloat(config['團保費用']) || 0;
    const otherDeductions = parseFloat(config['其他扣款']) || 0;
    
    if (welfareFee > 0 || dormitoryFee > 0 || groupInsurance > 0 || otherDeductions > 0) {
      Logger.log(` 其他扣款:`);
      if (welfareFee > 0) Logger.log(`   - 福利金: $${welfareFee}`);
      if (dormitoryFee > 0) Logger.log(`   - 宿舍費用: $${dormitoryFee}`);
      if (groupInsurance > 0) Logger.log(`   - 團保費用: $${groupInsurance}`);
      if (otherDeductions > 0) Logger.log(`   - 其他扣款: $${otherDeductions}`);
    }
    
    // 12. 扣款總額（加入請假扣款）
    const totalDeductions = laborFee + healthFee + employmentFee + pensionSelf + incomeTax +
                           leaveDeduction +
                           welfareFee + dormitoryFee + groupInsurance + otherDeductions +
                           customItems.deductionTotal;
    
    Logger.log(` 扣款總額: $${totalDeductions}`);
    
    // 13. 實發金額
    const netSalary = grossSalary - totalDeductions;
    
    Logger.log('');
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 時薪薪資計算結果匯總:');
    Logger.log('═══════════════════════════════════════');
    Logger.log(`   員工: ${config['員工姓名']} (${employeeId})`);
    Logger.log(`   月份: ${yearMonth}`);
    Logger.log(`   時薪: $${hourlyRate}`);
    Logger.log(`   工作時數: ${totalWorkHours.toFixed(2)}h`);
    Logger.log(`   基本薪資: $${Math.round(basePay)}`);
    Logger.log(`   加班時數: ${totalOvertimeHours.toFixed(1)}h`);
    Logger.log(`   - 平日加班費: $${weekdayOvertimePay}`);
    Logger.log(`   - 休息日加班費: $${restdayOvertimePay}`);
    Logger.log(`   - 國定假日出勤薪資: $${holidayWorkPay}`);
    Logger.log(`   - 國定假日加班費: $${holidayOvertimePay}`);
    if (leaveDeduction > 0) {
      Logger.log(`   請假扣款:`);
      Logger.log(`   - 病假: ${sickLeaveHours} 小時，扣款 $${sickLeaveDeduction}`);  //  改用 sickLeaveHours
      Logger.log(`   - 事假: ${personalLeaveHours} 小時，扣款 $${personalLeaveDeduction}`);  //  改用 personalLeaveHours
      Logger.log(`   - 合計: $${leaveDeduction}`);
    }
    Logger.log(`   應發總額: $${Math.round(grossSalary)}`);
    Logger.log(`   扣款總額: $${totalDeductions}`);
    Logger.log(`   實發金額: $${Math.round(netSalary)}`);
    Logger.log('═══════════════════════════════════════');
    Logger.log('');
    
    // 14. 返回結果（加入請假相關欄位）
    const result = {
      employeeId: employeeId,
      employeeName: config['員工姓名'],
      yearMonth: yearMonth,
      salaryType: '時薪',
      hourlyRate: hourlyRate,
      totalWorkHours: Math.round(totalWorkHours * 100) / 100,  // 工時算到分鐘，顯示也要到小數兩位
      baseSalary: Math.round(basePay),
      positionAllowance: positionAllowance,
      mealAllowance: mealAllowance,
      transportAllowance: transportAllowance,
      attendanceBonus: attendanceBonus,
      performanceBonus: performanceBonus,
      otherAllowances: otherAllowances,
      weekdayOvertimePay: weekdayOvertimePay,
      restdayOvertimePay: restdayOvertimePay,
      holidayOvertimePay: holidayOvertimePay,
      holidayWorkPay: holidayWorkPay,
      totalOvertimeHours: totalOvertimeHours,
      laborFee: laborFee,
      healthFee: healthFee,
      employmentFee: employmentFee,
      pensionSelf: pensionSelf,
      pensionSelfRate: parseFloat(config['勞退自提率(%)']) || 0,
      incomeTax: incomeTax,
      leaveDeduction: leaveDeduction,
      sickLeaveHours: sickLeaveHours,      
      sickLeaveDeduction: sickLeaveDeduction,    // ⭐ 新增
      personalLeaveHours: personalLeaveHours,
      personalLeaveDeduction: personalLeaveDeduction, // ⭐ 新增
      earlyLeaveDeduction: earlyLeaveDeduction,
      welfareFee: welfareFee,
      dormitoryFee: dormitoryFee,
      groupInsurance: groupInsurance,
      otherDeductions: otherDeductions,
      customAllowances: customItems.allowances,
      customDeductions: customItems.deductions,
      customAllowanceTotal: customItems.allowanceTotal,
      customDeductionTotal: customItems.deductionTotal,
      grossSalary: Math.round(grossSalary),
      netSalary: Math.round(netSalary),
      bankCode: config['銀行代碼'] || "",
      bankAccount: config['銀行帳號'] || "",
      status: "已計算",
      note: `工作${totalWorkHours.toFixed(1)}h，加班${totalOvertimeHours.toFixed(1)}h` + 
        (sickLeaveHours > 0 ? `，病假${sickLeaveHours}h(半薪)` : '') +      // ⭐ 改為時數
        (personalLeaveHours > 0 ? `，事假${personalLeaveHours}h` : '')      // ⭐ 改為時數
    };
    
    Logger.log(' 時薪計算完成');
    
    return { success: true, data: result };
    
  } catch (error) {
    Logger.log(" 計算時薪薪資失敗: " + error);
    Logger.log(" 錯誤堆疊: " + error.stack);
    return { success: false, message: error.toString() };
  }
}

/**
 *  取得員工該月份的打卡記錄並計算工時（修正版）
 * 
 * @param {string} employeeId - 員工ID
 * @param {string} yearMonth - 年月 (YYYY-MM)
 * @returns {Array} 打卡記錄陣列
 */
function getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth) {
  try {
    Logger.log(' 開始取得員工打卡記錄');
    Logger.log('   員工ID: ' + employeeId);
    Logger.log('   年月: ' + yearMonth);
    
    // 打卡紀錄是最大的一張表，批次計算時特別值得快取
    const data = getSheetValues_(SHEET_ATTENDANCE);
    
    if (data.length < 2) {
      Logger.log(' 找不到「打卡紀錄」工作表或無資料');
      return [];
    }
    
    const headers = data[0];
    Logger.log(' 打卡紀錄欄位: ' + headers.join(', '));
    
    // 先用標題找欄位；找不到就用固定位置。打卡時一律照這個順序寫入
    // （時間、員工ID、部門、姓名、類別、GPS、地點、備註、審核、裝置），但範本的標題是
    // 「打卡人員ＩＤ」不是「userId」，以前找不到就整個回傳空的：時薪員工工時變 0、工時明細空白。
    const col = (names, position) => {
      for (const name of names) {
        const i = headers.indexOf(name);
        if (i !== -1) return i;
      }
      return position;
    };
    const punchTimeIndex = col(['打卡時間'], 0);
    const userIdIndex = col(['userId', '打卡人員ＩＤ', '打卡人員ID', '員工ID'], 1);
    const typeIndex = col(['打卡類別'], 4);
    const noteIndex = col(['備註'], 7);
    const auditIndex = col(['管理員審核'], 8);
    
    Logger.log(' 欄位索引:');
    Logger.log('   打卡時間: ' + punchTimeIndex);
    Logger.log('   userId: ' + userIdIndex);
    Logger.log('   打卡類別: ' + typeIndex);
    
    if (punchTimeIndex === -1 || userIdIndex === -1 || typeIndex === -1) {
      Logger.log(' 「打卡紀錄」工作表缺少必要欄位');
      return [];
    }
    
    // ⭐ 按日期分組打卡記錄（改用陣列儲存所有打卡）
    const recordsByDate = {};
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      const rowUserId = String(row[userIdIndex] || '').trim();
      const punchTime = row[punchTimeIndex];
      const punchType = String(row[typeIndex] || '').trim();
      const note = row[noteIndex] || '';
      const audit = row[auditIndex] || '';
      
      if (rowUserId !== employeeId) continue;
      
      // 解析打卡時間
      let punchDate = null;
      let timeStr = '';
      let fullDateTime = null;
      
      if (punchTime instanceof Date) {
        punchDate = Utilities.formatDate(punchTime, 'Asia/Taipei', 'yyyy-MM-dd');
        timeStr = Utilities.formatDate(punchTime, 'Asia/Taipei', 'HH:mm');
        fullDateTime = punchTime;
      } else if (typeof punchTime === 'string') {
        const parts = punchTime.split(' ');
        if (parts.length >= 2) {
          punchDate = parts[0];
          timeStr = parts[1].substring(0, 5);
          try {
            fullDateTime = new Date(punchTime);
          } catch (e) {
            continue;
          }
        }
      } else {
        continue;
      }
      
      const dateStr = punchDate.substring(0, 7);
      if (dateStr !== yearMonth) continue;
      
      // 只計算正常打卡或已核准的補打卡
      const isNormalPunch = (note !== '補打卡');
      const isApprovedAdjustment = (note === '補打卡' && audit === 'v');
      
      if (!isNormalPunch && !isApprovedAdjustment) {
        Logger.log(`   ⏭ 跳過 ${punchDate} ${timeStr} 的未核准補打卡`);
        continue;
      }
      
      // ⭐ 改用陣列儲存所有打卡（支援同一天多次打卡）
      if (!recordsByDate[punchDate]) {
        recordsByDate[punchDate] = [];
      }
      
      recordsByDate[punchDate].push({
        type: punchType,
        time: timeStr,
        fullDateTime: fullDateTime,
        note: note
      });
    }
    
    Logger.log(` 找到 ${Object.keys(recordsByDate).length} 天的打卡記錄`);
    
    // ⭐⭐⭐ 關鍵修正：配對上下班記錄並計算工時
    const records = [];

    // 當月排班一次讀進來：工時要扣「那天那個班」的休息分鐘（兩頭班中間的休息）
    const shiftMap = (typeof getEmployeeShiftMapForMonth === 'function')
      ? getEmployeeShiftMapForMonth(employeeId, yearMonth)
      : {};
    
    Object.keys(recordsByDate).forEach(date => {
      const dayPunches = recordsByDate[date];
      
      // 按時間排序
      dayPunches.sort((a, b) => a.fullDateTime - b.fullDateTime);
      
      // 一天可以有兩組上下班（休息前打卡）：配成工作段再相加，規則見 PunchRules.gs
      const punchIns = dayPunches.filter(p => p.type === '上班');
      const punchOuts = dayPunches.filter(p => p.type === '下班');
      const punchIn = punchIns.length > 0 ? punchIns[0].time : null;
      const punchOut = punchOuts.length > 0 ? punchOuts[punchOuts.length - 1].time : null;

      const day = computeDayWorkFromPunches_(
        dayPunches.filter(p => p.fullDateTime instanceof Date && !isNaN(p.fullDateTime.getTime()))
                  .map(p => ({ type: p.type, time: p.fullDateTime })),
        shiftMap[date] || null
      );
      const workHours = minutesToHours_(day.netMinutes);
      const segments = day.segments;
      const firstIn = segments.length ? segments[0].start : punchIn;
      const lastOut = segments.length ? segments[segments.length - 1].end : punchOut;
      const breakMinutes = (firstIn && lastOut)
        ? Math.max(0, Math.round((new Date(`${date} ${lastOut}`) - new Date(`${date} ${firstIn}`)) / 60000) - day.netMinutes)
        : 0;
      Logger.log(`   ${date}: ${segments.map(x => x.start + '~' + x.end).join('、') || '打卡不完整'} = ${workHours}h`);

      records.push({
        date: date,
        punchIn: punchIn,
        punchOut: punchOut,
        workHours: workHours,
        breakMinutes: breakMinutes,
        segments: segments   // 每一段的上下班時間，例如 [{start:'10:28', end:'14:31'}, …]
      });
    });
    
    // 按日期排序
    records.sort((a, b) => a.date.localeCompare(b.date));
    
    Logger.log(` 成功處理 ${records.length} 筆打卡記錄`);
    
    return records;
    
  } catch (error) {
    Logger.log(' 取得打卡記錄失敗: ' + error);
    Logger.log(' 錯誤堆疊: ' + error.stack);
    return [];
  }
}

/**
 *  新增 API：取得員工該月份的加班記錄
 */
function getEmployeeMonthlyOvertimeAPI() {
  try {
    const session = checkSessionInternal();
    if (!session.ok) {
      return jsonResponse({ ok: false, msg: 'SESSION_INVALID', code: 'SESSION_INVALID' });
    }
    
    const employeeId = session.user.userId;
    const yearMonth = getParam('yearMonth');
    
    if (!yearMonth) {
      return jsonResponse({ ok: false, msg: 'MISSING_YEAR_MONTH', code: 'MISSING_YEAR_MONTH' });
    }
    
    Logger.log(` 取得 ${employeeId} 在 ${yearMonth} 的加班記錄`);
    
    const records = getEmployeeMonthlyOvertime(employeeId, yearMonth);
    
    return jsonResponse({ ok: true, records: records });
    
  } catch (error) {
    Logger.log(' getEmployeeMonthlyOvertimeAPI 錯誤: ' + error);
    return jsonResponse({ ok: false, msg: error.toString(), code: 'ERROR' });
  }
}

/**
 *  計算午休時間（12:00-13:00）
 * 
 * @param {Date} startTime - 上班時間
 * @param {Date} endTime - 下班時間
 * @returns {number} 午休時間（毫秒）
 */
function calculateLunchBreak(startTime, endTime) {
  const lunchStart = new Date(startTime);
  lunchStart.setHours(12, 0, 0, 0);
  
  const lunchEnd = new Date(startTime);
  lunchEnd.setHours(13, 0, 0, 0);
  
  // 如果工作時段包含午休時間，扣除1小時
  if (startTime < lunchEnd && endTime > lunchStart) {
    return 60 * 60 * 1000; // 1小時 = 3600000毫秒
  }
  
  return 0;
}

/**
 *  正職月薪員工 - 依級距表計算
 * 
 * 使用提供的投保薪資級距表：
 * - 級距 1: 29,500 → 勞保 738、健保 458
 * - 級距 2: 30,300 → 勞保 758、健保 470
 * - 級距 3: 31,800 → 勞保 795、健保 493
 * ...以此類推
 */

function getInsuredSalary(salary) {
  // 級距表可由管理員在「薪資規則」維護，沒設定過就用程式內建的預設級距
  const brackets = (typeof getSalaryRules_ === 'function')
    ? getSalaryRules_().insuranceBrackets
    : [{ min: 0, max: null, insured: 29500, labor: 738, health: 458 }];
  
  for (let i = 0; i < brackets.length; i++) {
    const bracket = brackets[i];
    // max 為 null 代表最高級距（以上），沒有上限
    const upper = (bracket.max === null || bracket.max === undefined) ? Infinity : bracket.max;
    
    if (salary >= bracket.min && salary <= upper) {
      Logger.log(` 月薪 $${salary} → 級距 ${i + 1} ($${bracket.insured})`);
      Logger.log(`   勞保費: $${bracket.labor}, 健保費: $${bracket.health}`);
      return bracket;
    }
  }
  
  // 理論上不會走到這裡（最高級距沒有上限），保險起見退回最低級距
  return brackets[0];
}
/**
 *  修改：計算月薪資（統一入口，自動判斷月薪/時薪）
 */
function calculateMonthlySalary(employeeId, yearMonth) {
  try {
    Logger.log(` 開始計算薪資: ${employeeId}, ${yearMonth}`);
    
    // 1. 取得員工薪資設定
    const salaryConfig = getEmployeeSalaryTW(employeeId);
    if (!salaryConfig.success) {
      return { success: false, message: "找不到員工薪資設定" };
    }
    
    const config = salaryConfig.data;
    const salaryType = String(config['薪資類型'] || '月薪').trim();
    
    Logger.log(` 薪資類型: ${salaryType}`);
    
    // 2. 根據薪資類型分流
    if (salaryType === '時薪') {
      Logger.log('使用時薪計算邏輯');
      return calculateHourlySalary(employeeId, yearMonth);
    } else if (salaryType === '週薪') {
      Logger.log('使用週薪計算邏輯');
      return calculateWeeklySalary(employeeId, yearMonth);
    } else {
      Logger.log('使用月薪計算邏輯');
      return calculateMonthlySalaryInternal(employeeId, yearMonth);
    }
    
  } catch (error) {
    Logger.log(" 計算薪資失敗: " + error);
    Logger.log(" 錯誤堆疊: " + error.stack);
    return { success: false, message: error.toString() };
  }
}

/**
 *  月薪計算（內部函數 - 完整修正版）
 */
function calculateMonthlySalaryInternal(employeeId, yearMonth) {
  try {
    Logger.log(` 開始計算月薪: ${employeeId}, ${yearMonth}`);
    
    // 1. 取得員工薪資設定
    const salaryConfig = getEmployeeSalaryTW(employeeId);
    if (!salaryConfig.success) {
      return { success: false, message: "找不到員工薪資設定" };
    }
    
    const config = salaryConfig.data;
    
    // 2. 取得加班記錄
    const overtimeRecords = getEmployeeMonthlyOvertime(employeeId, yearMonth);
    Logger.log(` 找到 ${overtimeRecords.length} 筆加班記錄`);
    
    // 3. 取得請假記錄
    const leaveRecords = getEmployeeMonthlyLeave(employeeId, yearMonth);
    
    // 4. 基本薪資
    const baseSalary = parseFloat(config['基本薪資']) || 0;
    const hourlyRate = Math.round(baseSalary / 30 / 8); // 平日時薪
    
    Logger.log(` 基本薪資: ${baseSalary}, 時薪: ${hourlyRate}`);
    
    // 5. 固定津貼
    const positionAllowance = parseFloat(config['職務加給']) || 0;
    const mealAllowance = parseFloat(config['伙食費']) || 0;
    const transportAllowance = parseFloat(config['交通補助']) || 0;
    let attendanceBonus = parseFloat(config['全勤獎金']) || 0;
    const performanceBonus = parseFloat(config['業績獎金']) || 0;
    const otherAllowances = parseFloat(config['其他津貼']) || 0;
    
    Logger.log(` 固定津貼:`);
    if (positionAllowance > 0) Logger.log(`   - 職務加給: $${positionAllowance}`);
    if (mealAllowance > 0) Logger.log(`   - 伙食費: $${mealAllowance}`);
    if (transportAllowance > 0) Logger.log(`   - 交通補助: $${transportAllowance}`);
    if (attendanceBonus > 0) Logger.log(`   - 全勤獎金: $${attendanceBonus}`);
    if (performanceBonus > 0) Logger.log(`   - 業績獎金: $${performanceBonus}`);
    if (otherAllowances > 0) Logger.log(`   - 其他津貼: $${otherAllowances}`);
    
    // 6. ⭐⭐⭐ 計算加班費（區分四種類型）
    let totalOvertimeHours = 0;
    let weekdayOvertimePay = 0;   // 平日加班費
    let restdayOvertimePay = 0;   // 休息日加班費（週六）
    let sundayOvertimePay = 0;    // 例假日加班費（週日）
    let holidayOvertimePay = 0;   // 國定假日加班費
    let holidayWorkPay = 0;       // 國定假日出勤薪資（另計）
    
    // 按日期分組計算
    const overtimeByDate = {};
    
    overtimeRecords.forEach(record => {
      const date = record.date;
      if (!overtimeByDate[date]) {
        overtimeByDate[date] = 0;
      }
      overtimeByDate[date] += parseFloat(record.hours) || 0;
    });
    
    Logger.log(` 每日加班統計: ${JSON.stringify(overtimeByDate)}`);
    const overtimeRules = getOvertimeRules_();
    const employeeType = String(config['員工類型'] || '正職').trim();
    const isFullTime = (employeeType === '正職');
    let holidayCompHours = 0;
    Logger.log(` 員工類型: ${employeeType}`);
    // 遍歷每天的加班記錄
    Object.keys(overtimeByDate).forEach(date => {
      let dailyHours = overtimeByDate[date];
      
      // 判斷日期類型
      const dateType = getDateType(date);
      const dateTypeName = {
        'weekday': '平日',
        'restday': '休息日（週六）',
        'sunday': '例假日（週日）',
        'holiday': '國定假日'
      }[dateType];
      
      Logger.log(`\n ${date} (${dateTypeName}): ${dailyHours.toFixed(1)}h`);
      
      // 根據日期類型限制加班時數（上限同樣可在「薪資規則」調整）
      let maxHours = overtimeRules.maxWeekdayHours;
      if (dateType === 'restday') maxHours = overtimeRules.maxRestdayHours;
      if (dateType === 'holiday') maxHours = overtimeRules.maxHolidayHours;
      
      if (dailyHours > maxHours) {
        Logger.log(`    超過上限 (${dailyHours}h > ${maxHours}h)，限制為 ${maxHours}h`);
        dailyHours = maxHours;
      }
      
      // 國定假日分別計算正常薪資與加班費
      if (dateType === 'holiday') {
        if (isFullTime) {
          // 正職 → 補休，不計費
          holidayCompHours += dailyHours;
          totalOvertimeHours += dailyHours;
          Logger.log(`    正職員工國定假日補休 ${dailyHours}h，不計費`);
          return;
        } else {
          // 兼職/約聘 → ×2
          const normalPay = hourlyRate * dailyHours * 1.0;
          const overtimePay = hourlyRate * dailyHours * overtimeRules.holiday;
          holidayWorkPay += normalPay;
          holidayOvertimePay += overtimePay;
          Logger.log(`   - 正常薪資: $${Math.round(normalPay)} (×1.0)`);
          Logger.log(`   - 加班費: $${Math.round(overtimePay)} (×2.0)`);
          Logger.log(`    兼職員工國定假日: $${Math.round(normalPay + overtimePay)}`);
        }
        
      } else {
        // 其他日期類型
        const pay = calculateOvertimePay(dailyHours, hourlyRate, dateType);
        const totalPay = pay.firstPay + pay.secondPay + pay.thirdPay;
        
        if (dateType === 'weekday') {
          weekdayOvertimePay += totalPay;
          Logger.log(`   - 前2h: $${pay.firstPay} (×1.34)`);
          if (pay.secondPay > 0) {
            Logger.log(`   - 3h起: $${pay.secondPay} (×1.67)`);
          }
          Logger.log(`    小計: $${totalPay}`);
          
        } else if (dateType === 'restday') {
          restdayOvertimePay += totalPay;
          Logger.log(`   - 前2h: $${pay.firstPay} (×1.34)`);
          if (pay.secondPay > 0) {
            Logger.log(`   - 3-8h: $${pay.secondPay} (×1.67)`);
          }
          if (pay.thirdPay > 0) {
            Logger.log(`   - 9h起: $${pay.thirdPay} (×2.67)`);
          }
          Logger.log(`    小計: $${totalPay}`);
          
        } else if (dateType === 'sunday') {
          sundayOvertimePay += totalPay;
          Logger.log(`   - 全天: $${totalPay} (×2.0)`);
        }
      }
      
      totalOvertimeHours += dailyHours;
    });

    // 四捨五入
    weekdayOvertimePay = Math.round(weekdayOvertimePay);
    restdayOvertimePay = Math.round(restdayOvertimePay);
    sundayOvertimePay = Math.round(sundayOvertimePay);
    holidayOvertimePay = Math.round(holidayOvertimePay);
    holidayWorkPay = Math.round(holidayWorkPay);

    Logger.log(`\n 加班費計算完成:`);
    Logger.log(`   - 總時數: ${totalOvertimeHours.toFixed(1)}h`);
    Logger.log(`   - 平日加班費: $${weekdayOvertimePay}`);
    Logger.log(`   - 休息日加班費: $${restdayOvertimePay}`);
    Logger.log(`   - 例假日加班費: $${sundayOvertimePay}`);
    Logger.log(`   - 國定假日出勤薪資: $${holidayWorkPay}`);
    Logger.log(`   - 國定假日加班費: $${holidayOvertimePay}`);
    
    // 6.5 ⭐⭐⭐ 早退扣款（僅月薪員工）- 修正版
    let earlyLeaveDeduction = 0;

    Logger.log(`\n 開始計算早退扣款...`);

    // 取得該月份的打卡記錄
    const attendanceRecords = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);

    // 整月排班一次讀進來。以前是每個打卡日都呼叫 getEmployeeShiftForDate()，
    // 而那支每次都會把整張排班表讀一遍 —— 22 個工作天就是 22 次全表讀取。
    const shiftMap = (typeof getEmployeeShiftMapForMonth === 'function')
      ? getEmployeeShiftMapForMonth(employeeId, yearMonth)
      : {};

    attendanceRecords.forEach(record => {
      const date = record.date;
      
      // ⭐⭐⭐ 使用 try-catch 避免錯誤中斷流程
      try {
        const shift = shiftMap[date];
        
        if (shift) {
          const scheduledEndTime = shift.endTime;
          const actualEndTime = record.punchOut;
          
          if (scheduledEndTime && actualEndTime) {
            // 解析時間（處理跨日班）
            const [schedHour, schedMin] = scheduledEndTime.split(':').map(Number);
            const [actualHour, actualMin] = actualEndTime.split(':').map(Number);
            
            // 轉換為分鐘數（跨日班需要特殊處理）
            let schedMinutes = schedHour * 60 + schedMin;
            let actualMinutes = actualHour * 60 + actualMin;
            
            // 如果是跨日班（下班時間 < 上班時間），下班時間加24小時
            if (schedHour < 12) {
              schedMinutes += 24 * 60;
            }
            
            if (actualHour < 12 && record.punchIn && record.punchIn.startsWith('1')) {
              actualMinutes += 24 * 60;
            }
            
            // 計算早退分鐘數
            if (actualMinutes < schedMinutes) {
              const earlyMinutes = schedMinutes - actualMinutes;
              const earlyHours = earlyMinutes / 60;
              const deduction = Math.round(hourlyRate * earlyHours);
              
              earlyLeaveDeduction += deduction;
              
              Logger.log(`   ${date}: 早退 ${earlyMinutes} 分鐘 (${earlyHours.toFixed(2)}h) → 扣款 $${deduction}`);
            }
          }
        }
      } catch (shiftError) {
        // 如果取得排班失敗，記錄警告但繼續處理
        Logger.log(`    ${date}: 無法取得排班資訊，跳過早退檢查`);
      }
    });

    Logger.log(`\n 早退扣款統計:`);
    Logger.log(`   合計扣款: $${earlyLeaveDeduction}`);
    
    // 7. 請假扣款
    let leaveDeduction = 0;
    let sickLeaveHours = 0;       
    let sickLeaveDeduction = 0;
    let personalLeaveHours = 0;   
    let personalLeaveDeduction = 0;
    
    if (leaveRecords.success && leaveRecords.data && leaveRecords.data.length > 0) {
      Logger.log(` 找到 ${leaveRecords.data.length} 筆請假記錄`);
      
      leaveRecords.data.forEach(record => {
        if (record.reviewStatus === '核准') {
          const leaveType = String(record.leaveType).toUpperCase();
          const days = parseFloat(record.leaveDays) || 0;
          const hours = days * 8;
          const dailyRate = Math.round(baseSalary / 30);
          
          // 病假：扣半薪
          if (leaveType === 'SICK_LEAVE' || leaveType === '病假') {
            sickLeaveHours += hours;
            const deduction = Math.round(days * dailyRate * 0.5);
            sickLeaveDeduction += deduction;
            Logger.log(`   病假 ${days} 天 = ${hours}h × $${dailyRate} × 50% = $${deduction}`);
          }
          
          // 事假：扣全薪
          if (leaveType === 'PERSONAL_LEAVE' || leaveType === '事假') {
            personalLeaveHours += hours;
            const deduction = Math.round(days * dailyRate);
            personalLeaveDeduction += deduction;
            Logger.log(`   事假 ${days} 天 = ${hours}h × $${dailyRate} = $${deduction}`);
          }
        }
      });
      
      leaveDeduction = sickLeaveDeduction + personalLeaveDeduction;
      
      Logger.log(`\n 請假扣款統計:`);
      Logger.log(`   病假: ${sickLeaveHours} 小時，扣款 $${sickLeaveDeduction} (半薪)`);
      Logger.log(`   事假: ${personalLeaveHours} 小時，扣款 $${personalLeaveDeduction} (全薪)`);
      Logger.log(`   合計扣款: $${leaveDeduction}`);
      
      // 如果有請假，取消全勤獎金
      if (leaveDeduction > 0) {
        attendanceBonus = 0;
        Logger.log(` 有請假記錄，取消全勤獎金`);
      }
    } else {
      Logger.log(`\n 請假扣款統計:`);
      Logger.log(`   病假: 0 小時，扣款 $0 (半薪)`);
      Logger.log(`   事假: 0 小時，扣款 $0 (全薪)`);
      Logger.log(`   合計扣款: $0`);
      Logger.log(` 無請假記錄`);
    }
    
    // 8. ⭐⭐⭐ 法定扣款（直接使用設定表中的數值）
    const laborFee = parseFloat(config['勞保費']) || 0;
    const healthFee = parseFloat(config['健保費']) || 0;
    const employmentFee = parseFloat(config['就業保險費']) || 0;
    const pensionSelf = parseFloat(config['勞退自提']) || 0;
    const pensionSelfRate = parseFloat(config['勞退自提率(%)']) || 0;
    // 月薪的所得稅預設沿用設定表裡手填的金額；管理員在「薪資規則」把
    // autoCalculateForMonthly 打開之後，才改成跟時薪一樣自動依級距計算。
    const taxRules = (typeof getSalaryRules_ === 'function')
      ? getSalaryRules_().incomeTaxRules
      : null;
    const incomeTax = (taxRules && taxRules.autoCalculateForMonthly)
      ? calculateIncomeTax_(baseSalary + positionAllowance + mealAllowance +
                            transportAllowance + attendanceBonus + performanceBonus +
                            otherAllowances)
      : (parseFloat(config['所得稅']) || 0);
    
    Logger.log(`\n 使用設定表中的扣款數值:`);
    Logger.log(`   勞保費: $${laborFee}`);
    Logger.log(`   健保費: $${healthFee}`);
    Logger.log(`   就業保險費: $${employmentFee}`);
    Logger.log(`   勞退自提 (${pensionSelfRate}%): $${pensionSelf}`);
    Logger.log(`   所得稅: $${incomeTax}`);
    
    // 9. 其他扣款
    const welfareFee = parseFloat(config['福利金扣款']) || 0;
    const dormitoryFee = parseFloat(config['宿舍費用']) || 0;
    const groupInsurance = parseFloat(config['團保費用']) || 0;
    const otherDeductions = parseFloat(config['其他扣款']) || 0;
    
    if (welfareFee > 0 || dormitoryFee > 0 || groupInsurance > 0 || otherDeductions > 0) {
      Logger.log(`\n 其他扣款:`);
      if (welfareFee > 0) Logger.log(`   - 福利金: $${welfareFee}`);
      if (dormitoryFee > 0) Logger.log(`   - 宿舍費用: $${dormitoryFee}`);
      if (groupInsurance > 0) Logger.log(`   - 團保費用: $${groupInsurance}`);
      if (otherDeductions > 0) Logger.log(`   - 其他扣款: $${otherDeductions}`);
    }
    
    // 9.5 自訂項目（管理員自行定義的津貼與扣款）
    const customItems = resolveCustomSalaryItems_(config[SALARY_CUSTOM_ITEMS_COLUMN]);
    
    if (customItems.allowances.length > 0 || customItems.deductions.length > 0) {
      Logger.log(`\n 自訂項目:`);
      customItems.allowances.forEach(item => Logger.log(`   + ${item.name}: $${item.amount}`));
      customItems.deductions.forEach(item => Logger.log(`   - ${item.name}: $${item.amount}`));
    }
    
    // 10. 應發總額
    const grossSalary = baseSalary + 
                       positionAllowance + 
                       mealAllowance + 
                       transportAllowance + 
                       attendanceBonus + 
                       performanceBonus + 
                       otherAllowances +
                       weekdayOvertimePay + 
                       restdayOvertimePay +
                       sundayOvertimePay +
                       holidayOvertimePay +
                       holidayWorkPay +
                       customItems.allowanceTotal;
    
    // 11. 扣款總額
    const totalDeductions = laborFee + 
                           healthFee + 
                           employmentFee + 
                           pensionSelf + 
                           incomeTax +
                           leaveDeduction + 
                           earlyLeaveDeduction +
                           welfareFee + 
                           dormitoryFee + 
                           groupInsurance + 
                           otherDeductions +
                           customItems.deductionTotal;
    
    // 12. 實發金額
    const netSalary = grossSalary - totalDeductions;
    
    Logger.log('');
    Logger.log('═══════════════════════════════════════');
    Logger.log(' 月薪薪資計算結果匯總:');
    Logger.log('═══════════════════════════════════════');
    Logger.log(`   員工: ${config['員工姓名']} (${employeeId})`);
    Logger.log(`   月份: ${yearMonth}`);
    Logger.log(`   基本薪資: $${baseSalary}`);
    Logger.log(`   加班時數: ${totalOvertimeHours.toFixed(1)}h`);
    Logger.log(`   - 平日加班費: $${weekdayOvertimePay}`);
    Logger.log(`   - 休息日加班費: $${restdayOvertimePay}`);
    Logger.log(`   - 例假日加班費: $${sundayOvertimePay}`);
    Logger.log(`   - 國定假日加班費: $${holidayOvertimePay}`);
    Logger.log(`   - 國定假日出勤薪資: $${holidayWorkPay}`);
    Logger.log(`   應發總額: $${Math.round(grossSalary)}`);
    Logger.log(`   扣款總額: $${totalDeductions}`);
    Logger.log(`   實發金額: $${Math.round(netSalary)}`);
    Logger.log('═══════════════════════════════════════');
    Logger.log('');
    
    const result = {
      employeeId: employeeId,
      employeeName: config['員工姓名'],
      yearMonth: yearMonth,
      salaryType: '月薪',
      hourlyRate: 0,
      totalWorkHours: 0,
      baseSalary: baseSalary,
      positionAllowance: positionAllowance,
      mealAllowance: mealAllowance,
      transportAllowance: transportAllowance,
      attendanceBonus: attendanceBonus,
      performanceBonus: performanceBonus,
      otherAllowances: otherAllowances,
      weekdayOvertimePay: weekdayOvertimePay,
      restdayOvertimePay: restdayOvertimePay,
      holidayWorkPay: holidayWorkPay, 
      holidayOvertimePay: holidayOvertimePay,
      totalOvertimeHours: totalOvertimeHours,
      laborFee: laborFee,              // ⭐ 使用設定表數值（可為 0）
      healthFee: healthFee,            // ⭐ 使用設定表數值（可為 0）
      employmentFee: employmentFee,    // ⭐ 使用設定表數值（可為 0）
      pensionSelf: pensionSelf,        // ⭐ 使用設定表數值（可為 0）
      pensionSelfRate: pensionSelfRate,
      incomeTax: incomeTax,            // ⭐ 使用設定表數值（可為 0）
      leaveDeduction: Math.round(leaveDeduction),
      sickLeaveHours: sickLeaveHours,
      sickLeaveDeduction: sickLeaveDeduction,
      personalLeaveHours: personalLeaveHours,
      personalLeaveDeduction: personalLeaveDeduction,
      earlyLeaveDeduction: earlyLeaveDeduction,
      welfareFee: welfareFee,
      dormitoryFee: dormitoryFee,
      groupInsurance: groupInsurance,
      otherDeductions: otherDeductions,
      customAllowances: customItems.allowances,
      customDeductions: customItems.deductions,
      customAllowanceTotal: customItems.allowanceTotal,
      customDeductionTotal: customItems.deductionTotal,
      grossSalary: Math.round(grossSalary),
      netSalary: Math.round(netSalary),
      bankCode: config['銀行代碼'] || "",
      bankAccount: config['銀行帳號'] || "",
      status: "已計算",
      note: `本月加班${totalOvertimeHours.toFixed(1)}小時` + 
        (holidayCompHours > 0 ? `，國定假日補休${holidayCompHours.toFixed(1)}h` : '') +
        (sickLeaveHours > 0 ? `，病假${sickLeaveHours}h(半薪)` : '') +
        (personalLeaveHours > 0 ? `，事假${personalLeaveHours}h` : '') +
        (earlyLeaveDeduction > 0 ? `，早退扣款$${earlyLeaveDeduction}` : '')
    };
    
    Logger.log(' 月薪計算完成');
    
    return { success: true, data: result };
    
  } catch (error) {
    Logger.log(" 計算月薪失敗: " + error);
    Logger.log(" 錯誤堆疊: " + error.stack);
    return { success: false, message: error.toString() };
  }
}

/**
 *  API：取得員工該月份的打卡記錄
 */
function getEmployeeMonthlyAttendance() {
  try {
    const session = checkSessionInternal();
    if (!session.ok) {
      return jsonResponse({ ok: false, msg: 'SESSION_INVALID', code: 'SESSION_INVALID' });
    }
    
    const employeeId = session.user.userId;
    const yearMonth = getParam('yearMonth');
    
    if (!yearMonth) {
      return jsonResponse({ ok: false, msg: 'MISSING_YEAR_MONTH', code: 'MISSING_YEAR_MONTH' });
    }
    
    Logger.log(` API: 取得 ${employeeId} 在 ${yearMonth} 的打卡記錄`);
    
    // 呼叫 SalaryManagement-Enhanced.gs 中的內部函數
    const records = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
    
    return jsonResponse({ ok: true, records: records });
    
  } catch (error) {
    Logger.log(' getEmployeeMonthlyAttendance API 錯誤: ' + error);
    return jsonResponse({ ok: false, msg: error.toString(), code: 'ERROR' });
  }
}


// ==================== 薪資匯出功能（管理員專用） ====================

/**
 *  匯出所有員工薪資總表為 Excel（修正版）
 */
function exportAllSalaryExcel() {
  try {
    // 從全域變數取得參數
    const e = globalThis.currentRequest;
    
    if (!e || !e.parameter) {
      return jsonResponse(false, null, '無法取得請求參數', 'NO_REQUEST');
    }
    
    const params = e.parameter;
    const yearMonth = params.yearMonth;
    
    Logger.log(' exportAllSalaryExcel 收到參數:');
    Logger.log('   yearMonth: ' + yearMonth);
    
    // 驗證參數
    if (!yearMonth) {
      return jsonResponse(false, null, '缺少 yearMonth 參數', 'MISSING_YEAR_MONTH');
    }
    
    // ⭐⭐⭐ 移除 Session 驗證（已在 Main.gs 中驗證過）
    
    Logger.log(' 開始匯出薪資總表: ' + yearMonth);
    
    // 取得薪資記錄
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const salarySheet = ss.getSheetByName('月薪資記錄');
    
    if (!salarySheet) {
      return jsonResponse(false, null, '找不到月薪資記錄工作表', 'SHEET_NOT_FOUND');
    }
    
    const lastRow = salarySheet.getLastRow();
    
    if (lastRow <= 1) {
      return jsonResponse(false, null, '沒有薪資記錄', 'NO_RECORDS');
    }
    
    const allData = salarySheet.getRange(2, 1, lastRow - 1, salarySheet.getLastColumn()).getValues();
    
    Logger.log(` 原始資料筆數: ${allData.length}`);
    
    // 篩選指定月份的記錄
    const records = [];
    
    allData.forEach((row, index) => {
      const rowYearMonth = row[3]; // 第4欄是年月
      
      let normalizedYearMonth = '';
      
      if (rowYearMonth instanceof Date) {
        normalizedYearMonth = Utilities.formatDate(rowYearMonth, 'Asia/Taipei', 'yyyy-MM');
      } else if (typeof rowYearMonth === 'string') {
        normalizedYearMonth = rowYearMonth.substring(0, 7);
      } else {
        return;
      }
      
      if (normalizedYearMonth === yearMonth) {
        records.push(row);
        Logger.log(` 找到符合記錄: 員工 ${row[2]}, 年月 ${normalizedYearMonth}`);
      }
    });
    
    Logger.log(` 找到 ${records.length} 筆 ${yearMonth} 的記錄`);
    
    if (records.length === 0) {
      return jsonResponse(false, null, `${yearMonth} 沒有薪資記錄`, 'NO_RECORDS_FOR_MONTH');
    }
    
    // 建立新的試算表
    const spreadsheet = SpreadsheetApp.create(`薪資總表_${yearMonth}`);
    const sheet = spreadsheet.getActiveSheet();
    sheet.setName('薪資明細');
    
    // 設定標題列
    const headers = [
      '薪資單ID', '員工ID', '員工姓名', '年月', '薪資類型', '時薪', '工作時數', '總加班時數',
      '基本薪資', '職務加給', '伙食費', '交通補助', '全勤獎金', '業績獎金', '其他津貼',
      '平日加班費', '休息日加班費', '國定假日加班費',
      '勞保費', '健保費', '就業保險費', '勞退自提', '所得稅',
      '請假扣款', '福利金扣款', '宿舍費用', '團保費用', '其他扣款',
      '應發總額', '實發金額',
      '銀行代碼', '銀行帳號',
      '狀態', '備註', '建立時間'
    ];
    
    // 寫入標題列
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // 格式化標題列
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#4a5568');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    
    // 寫入資料
    if (records.length > 0) {
      const dataToWrite = records.map(row => {
        while (row.length < headers.length) {
          row.push('');
        }
        return row.slice(0, headers.length);
      });
      
      sheet.getRange(2, 1, dataToWrite.length, headers.length).setValues(dataToWrite);
      Logger.log(` 已寫入 ${dataToWrite.length} 筆資料`);
    }
    
    // 自動調整欄寬
    for (let i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
    
    // 凍結標題列
    sheet.setFrozenRows(1);
    
    // 設定檔案權限
    const file = DriveApp.getFileById(spreadsheet.getId());
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 取得下載連結
    const fileId = spreadsheet.getId();
    const downloadUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
    
    Logger.log(' Excel 已生成');
    Logger.log(' 檔案 ID: ' + fileId);
    Logger.log(' 下載連結: ' + downloadUrl);
    
    return jsonResponse(true, {
      fileUrl: downloadUrl,
      fileId: fileId,
      fileName: `薪資總表_${yearMonth}`,
      recordCount: records.length
    }, '薪資總表已生成');
    
  } catch (error) {
    Logger.log(' exportAllSalaryExcel 錯誤: ' + error.toString());
    Logger.log(' 錯誤堆疊: ' + error.stack);
    return jsonResponse(false, null, '匯出失敗: ' + error.toString(), 'EXPORT_ERROR');
  }
}
/**
 *  取得或建立資料夾
 * 
 * @param {string} folderName - 資料夾名稱
 * @param {Folder} parentFolder - 父資料夾（可選）
 * @returns {Folder} 資料夾物件
 */
function getOrCreateFolder(folderName, parentFolder) {
  const parent = parentFolder || DriveApp.getRootFolder();
  
  const folders = parent.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parent.createFolder(folderName);
  }
}

/**
 *  取得銀行名稱（重複使用現有函數）
 */
function getBankName(code) {
  if (!code || code === '') {
    return '未設定';
  }
  
  // 自動補零到 3 位數
  const bankCode = String(code).padStart(3, '0');
  
  const banks = {
    // 公股銀行
    "004": "臺灣銀行",
    "005": "臺灣土地銀行",
    "006": "合作金庫商業銀行",
    "007": "第一商業銀行",
    "008": "華南商業銀行",
    "009": "彰化商業銀行",
    "011": "上海商業儲蓄銀行",
    "012": "台北富邦商業銀行",
    "013": "國泰世華商業銀行",
    "016": "高雄銀行",
    "017": "兆豐國際商業銀行",
    "050": "臺灣中小企業銀行",
    
    // 民營銀行
    "103": "臺灣新光商業銀行",
    "108": "陽信商業銀行",
    "118": "板信商業銀行",
    "147": "三信商業銀行",
    "803": "聯邦商業銀行",
    "805": "遠東國際商業銀行",
    "806": "元大商業銀行",
    "807": "永豐商業銀行",
    "808": "玉山商業銀行",
    "809": "凱基商業銀行",
    "810": "星展（台灣）商業銀行",
    "812": "台新國際商業銀行",
    "816": "安泰商業銀行",
    "822": "中國信託商業銀行",
    "826": "樂天國際商業銀行",
    
    // 外商銀行
    "052": "渣打國際商業銀行",
    "081": "匯豐（台灣）商業銀行",
    "101": "瑞興商業銀行",
    "102": "華泰商業銀行",
    "815": "日盛國際商業銀行",
    "824": "連線商業銀行",
    
    // 郵局
    "700": "中華郵政"
  };
  
  return banks[bankCode] || `未知銀行 (${bankCode})`;
}

console.log(' 薪資匯出功能已載入（管理員專用）');


/**
 *  計算員工該月份的總工時（不含扣除項目，僅計算淨工作時數）
 * 
 * @param {string} employeeId - 員工ID
 * @param {string} yearMonth - 年月 (YYYY-MM)
 * @returns {Object} { success, totalWorkHours }
 */
function calculateEmployeeWorkHours(employeeId, yearMonth) {
  try {
    Logger.log(`⏱ 計算員工工時: ${employeeId}, ${yearMonth}`);
    
    // 1. 取得打卡記錄
    const attendanceRecords = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
    Logger.log(` 找到 ${attendanceRecords.length} 筆打卡記錄`);
    
    // 2. 計算總工時（已扣除午休）
    let totalWorkHours = 0;
    
    attendanceRecords.forEach(record => {
      if (record.workHours > 0) {
        totalWorkHours += record.workHours;
      }
    });
    
    Logger.log(` 總工時: ${totalWorkHours.toFixed(1)} 小時`);
    
    return { 
      success: true, 
      totalWorkHours: totalWorkHours 
    };
    
  } catch (error) {
    Logger.log(' 計算工時失敗: ' + error);
    return { 
      success: false, 
      totalWorkHours: 0,
      message: error.toString() 
    };
  }
}

/**
 *  API：取得員工該月份的總工作時數
 * 
 * 用途：查詢員工該月份的淨工作時數（已扣除午休）
 * 路徑：?action=getEmployeeWorkHours&yearMonth=2025-12
 * 
 * @returns {Object} { ok, totalWorkHours, records }
 */
function getEmployeeWorkHoursAPI() {
  try {
    // 1. 驗證 Session
    const session = checkSessionInternal();
    if (!session.ok) {
      return jsonResponse(false, null, 'SESSION_INVALID', 'SESSION_INVALID');
    }
    
    const employeeId = session.user.userId;
    const yearMonth = getParam('yearMonth');
    
    // 2. 驗證參數
    if (!yearMonth) {
      return jsonResponse(false, null, '缺少 yearMonth 參數', 'MISSING_YEAR_MONTH');
    }
    
    Logger.log(` API: 取得 ${employeeId} 在 ${yearMonth} 的總工作時數`);
    
    // 3. 取得打卡記錄
    const attendanceRecords = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
    
    // 4. 計算總工時
    let totalWorkHours = 0;
    
    attendanceRecords.forEach(record => {
      if (record.workHours > 0) {
        totalWorkHours += record.workHours;
      }
    });
    
    // 5. 保留1位小數
    const totalWorkHoursRounded = Math.round(totalWorkHours * 100) / 100;
    
    Logger.log(` 總工作時數: ${totalWorkHoursRounded}h`);
    
    // 6. 返回結果
    return jsonResponse(true, {
      totalWorkHours: totalWorkHoursRounded,
      workDays: attendanceRecords.length,
      records: attendanceRecords.map(r => ({
        date: r.date,
        punchIn: r.punchIn,
        punchOut: r.punchOut,
        workHours: parseFloat(r.workHours.toFixed(1))
      }))
    }, '查詢成功');
    
  } catch (error) {
    Logger.log(' getEmployeeWorkHoursAPI 錯誤: ' + error);
    Logger.log(' 錯誤堆疊: ' + error.stack);
    return jsonResponse(false, null, error.toString(), 'ERROR');
  }
}


/**
 *  重新建立月薪資記錄試算表（完整版）
 */
function rebuildMonthlySalarySheetComplete() {
  try {
    Logger.log(' 開始重建月薪資記錄試算表...');

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. 刪除舊表（會一併刪掉所有薪資單，這是刻意的：這支是重建工具）
    const oldSheet = ss.getSheetByName(SHEET_MONTHLY_SALARY_ENHANCED);
    if (oldSheet) {
      ss.deleteSheet(oldSheet);
      Logger.log(' 已刪除舊的月薪資記錄表');
    }

    // 2. 建立新表並套用唯一的那份表頭定義
    const sheet = ss.insertSheet(SHEET_MONTHLY_SALARY_ENHANCED);
    const headers = MONTHLY_SALARY_HEADERS;

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#10b981");
    headerRange.setFontColor("#ffffff");
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");

    // 3. 格式與寬度全部依「欄位名稱」推導。
    //    以前這裡是寫死的欄號（moneyColumns、狀態在第 38 欄…），表頭一改就全錯，
    //    而表頭確實改過，所以那些數字早就對不上了。
    const hourColumns = ['工作時數', '總加班時數', '病假時數', '事假時數'];
    const dateColumns = ['建立時間'];
    const textColumns = ['薪資單ID', '員工ID', '員工姓名', '年月', '薪資類型',
                         '銀行代碼', '銀行帳號', '狀態', '備註',
                         MONTHLY_CUSTOM_DETAIL_COLUMN];
    const wideColumns = { '薪資單ID': 200, '銀行帳號': 150, '備註': 150, '建立時間': 150,
                          '員工ID': 120 };

    headers.forEach((name, index) => {
      const col = index + 1;
      sheet.setColumnWidth(col, wideColumns[name] || 95);

      if (hourColumns.indexOf(name) !== -1) {
        sheet.getRange(2, col, 1000, 1).setNumberFormat('0.0');
      } else if (dateColumns.indexOf(name) !== -1) {
        sheet.getRange(2, col, 1000, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      } else if (textColumns.indexOf(name) === -1) {
        // 剩下的都是金額
        sheet.getRange(2, col, 1000, 1).setNumberFormat('#,##0');
      }
    });

    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(3);

    // 4. 狀態欄的條件格式
    const statusIndex = headers.indexOf('狀態');
    if (statusIndex !== -1) {
      const statusRange = sheet.getRange(2, statusIndex + 1, 1000, 1);
      const rules = [
        { text: '已計算', background: '#d1fae5', font: '#065f46' },
        { text: '已發放', background: '#dbeafe', font: '#1e40af' }
      ].map(spec => SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(spec.text)
        .setBackground(spec.background)
        .setFontColor(spec.font)
        .setRanges([statusRange])
        .build());

      sheet.setConditionalFormatRules(rules);
    }

    Logger.log(` 月薪資記錄試算表已重建（${headers.length} 欄）`);

    return { success: true, message: `已重建月薪資記錄試算表（${headers.length} 欄）` };

  } catch (error) {
    Logger.log(' rebuildMonthlySalarySheetComplete 錯誤: ' + error);
    return { success: false, message: error.toString() };
  }
}

/**
 *  重建員工薪資設定試算表（不需要早退扣款，這是設定表）
 */
function rebuildEmployeeSalarySheet() {
  try {
    Logger.log(' 開始重建員工薪資設定試算表...');
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. 刪除舊表（如果存在）
    const oldSheet = ss.getSheetByName('員工薪資設定');
    if (oldSheet) {
      ss.deleteSheet(oldSheet);
      Logger.log(' 已刪除舊的員工薪資設定表');
    }
    
    // 2. 建立新表
    const sheet = ss.insertSheet('員工薪資設定');
    
    // 3. 定義標題列（29 欄）
    const headers = [
      // === 基本資訊 (6欄: A-F) ===
      "員工ID",           // A
      "員工姓名",         // B
      "身分證字號",       // C
      "員工類型",         // D
      "薪資類型",         // E
      "基本薪資",         // F
      
      // === 固定津貼項目 (6欄: G-L) ===
      "職務加給",         // G
      "伙食費",           // H
      "交通補助",         // I
      "全勤獎金",         // J
      "業績獎金",         // K
      "其他津貼",         // L
      
      // === 銀行資訊 (4欄: M-P) ===
      "銀行代碼",         // M
      "銀行帳號",         // N
      "到職日期",         // O
      "發薪日",           // P
      
      // === 法定扣款 (6欄: Q-V) ===
      "勞退自提率(%)",    // Q
      "勞保費",           // R
      "健保費",           // S
      "就業保險費",       // T
      "勞退自提",         // U
      "所得稅",           // V
      
      // === 其他扣款 (4欄: W-Z) ===
      "福利金扣款",       // W
      "宿舍費用",         // X
      "團保費用",         // Y
      "其他扣款",         // Z
      
      // === 系統欄位 (3欄: AA-AC) ===
      "狀態",             // AA
      "備註",             // AB
      "最後更新時間"      // AC
    ];
    
    // 4. 寫入標題列
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // 5. 格式化標題列
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#10b981");  // 綠色
    headerRange.setFontColor("#ffffff");
    headerRange.setHorizontalAlignment("center");
    
    // 6. 設定欄寬
    sheet.setColumnWidth(1, 250);  // 員工ID
    sheet.setColumnWidth(2, 100);  // 員工姓名
    sheet.setColumnWidth(3, 120);  // 身分證字號
    sheet.setColumnWidth(4, 80);   // 員工類型
    sheet.setColumnWidth(5, 80);   // 薪資類型
    sheet.setColumnWidth(6, 100);  // 基本薪資
    
    for (let col = 7; col <= 12; col++) {
      sheet.setColumnWidth(col, 90);  // 津貼
    }
    
    for (let col = 13; col <= 16; col++) {
      sheet.setColumnWidth(col, 90);  // 銀行資訊
    }
    
    for (let col = 17; col <= 26; col++) {
      sheet.setColumnWidth(col, 90);  // 扣款
    }
    
    sheet.setColumnWidth(27, 80);   // 狀態
    sheet.setColumnWidth(28, 150);  // 備註
    sheet.setColumnWidth(29, 150);  // 最後更新時間
    
    // 7. 凍結標題列和前3欄
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(3);
    
    // 8. 設定數值格式
    sheet.getRange(2, 6, 1000, 21).setNumberFormat('#,##0');  // 金額欄位
    
    Logger.log(' 員工薪資設定試算表重建完成');
    Logger.log(`   總欄位數: ${headers.length}`);
    
    return { success: true, message: '員工薪資設定試算表重建完成' };
    
  } catch (error) {
    Logger.log(' 重建失敗: ' + error);
    return { success: false, message: error.toString() };
  }
}

/**
 *  重建月薪資記錄試算表（完整版 - 含早退扣款）
 */
/**
 * 早退扣款那一欄已經併進 MONTHLY_SALARY_HEADERS，不需要另一套重建流程了。
 * 保留這個名稱只是為了讓既有的書籤或手動執行紀錄還能跑。
 */
function rebuildMonthlySalarySheetWithEarlyLeave() {
  return rebuildMonthlySalarySheetComplete();
}

/**
 * 輔助函數：將欄位索引轉換為欄位字母
 */
function getColumnLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function diagnoseCSFSalary() {
  Logger.log('═══════════════════════════════════════');
  Logger.log(' 診斷 CSF 的薪資計算與儲存流程');
  Logger.log('═══════════════════════════════════════\n');
  
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf';
  const yearMonth = '2025-01';
  
  // 步驟 1：檢查薪資設定
  Logger.log(' 步驟 1：檢查薪資設定');
  const config = getEmployeeSalaryTW(employeeId);
  if (config.success) {
    Logger.log(' 薪資設定:');
    Logger.log('   勞保費: ' + config.data['勞保費']);
    Logger.log('   健保費: ' + config.data['健保費']);
    Logger.log('   就業保險費: ' + config.data['就業保險費']);
  }
  
  // 步驟 2：計算薪資
  Logger.log('\n 步驟 2：計算薪資');
  const calcResult = calculateMonthlySalary(employeeId, yearMonth);
  
  if (calcResult.success) {
    Logger.log(' 計算結果:');
    Logger.log('   薪資類型: ' + calcResult.data.salaryType);
    Logger.log('   勞保費: ' + calcResult.data.laborFee + ' (預期: 738)');
    Logger.log('   健保費: ' + calcResult.data.healthFee + ' (預期: 458)');
    Logger.log('   就業保險費: ' + calcResult.data.employmentFee + ' (預期: 59)');
    
    // ⭐⭐⭐ 檢查 data 物件的完整性
    Logger.log('\n 檢查 data 物件的完整性:');
    Logger.log('   data.laborFee 型別: ' + typeof calcResult.data.laborFee);
    Logger.log('   data.healthFee 型別: ' + typeof calcResult.data.healthFee);
    Logger.log('   data.employmentFee 型別: ' + typeof calcResult.data.employmentFee);
    
    // 步驟 3：儲存薪資
    Logger.log('\n 步驟 3：儲存薪資');
    const saveResult = saveMonthlySalary(calcResult.data);
    
    if (saveResult.success) {
      Logger.log(' 儲存成功: ' + saveResult.salaryId);
      
      // 步驟 4：從 Sheet 讀取驗證
      Logger.log('\n 步驟 4：從 Sheet 讀取驗證');
      const sheet = getMonthlySalarySheetEnhanced();
      const data = sheet.getDataRange().getValues();
      
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === saveResult.salaryId) {
          Logger.log(' 找到薪資單在第 ' + (i + 1) + ' 行');
          Logger.log('   勞保費 (col 20): ' + data[i][19]);
          Logger.log('   健保費 (col 21): ' + data[i][20]);
          Logger.log('   就業保險費 (col 22): ' + data[i][21]);
          
          // ⭐⭐⭐ 驗證
          if (data[i][19] === 738 && data[i][20] === 458 && data[i][21] === 59) {
            Logger.log('\n 扣款數值正確！');
          } else {
            Logger.log('\n 扣款數值不正確！');
            Logger.log('   Sheet 勞保費: ' + data[i][19] + ' (預期: 738)');
            Logger.log('   Sheet 健保費: ' + data[i][20] + ' (預期: 458)');
            Logger.log('   Sheet 就保費: ' + data[i][21] + ' (預期: 59)');
          }
          
          break;
        }
      }
    } else {
      Logger.log(' 儲存失敗: ' + saveResult.message);
    }
  } else {
    Logger.log(' 計算失敗: ' + calcResult.message);
  }
  
  Logger.log('\n═══════════════════════════════════════');
}


function recalculateEricOnly() {
  Logger.log(' 重新計算 Eric 的薪資');
  
  const employeeId = 'Ue76b65367821240ac26387d2972a5adf';
  const months = ['2026-01'];
  
  months.forEach(yearMonth => {
    Logger.log(`\n 計算 ${yearMonth}...`);
    
    const result = calculateMonthlySalary(employeeId, yearMonth);
    
    if (result.success) {
      Logger.log(`   應發總額: $${result.data.grossSalary}`);
      Logger.log(`   實發金額: $${result.data.netSalary}`);
      Logger.log(`   勞保費: $${result.data.laborFee}`);
      Logger.log(`   健保費: $${result.data.healthFee}`);
      Logger.log(`   就業保險費: $${result.data.employmentFee}`);
      
      const saveResult = saveMonthlySalary(result.data);
      
      if (saveResult.success) {
        Logger.log(`    儲存成功: ${saveResult.salaryId}`);
      } else {
        Logger.log(`    儲存失敗: ${saveResult.message}`);
      }
    } else {
      Logger.log(`    計算失敗: ${result.message}`);
    }
  });
  
  Logger.log('\n 完成');
}


// ==================== 週薪計算 ====================

/**
 * 計算週薪員工的月薪資（不扣勞健保）
 * baseSalary = 每週薪資金額
 */
function calculateWeeklySalary(employeeId, yearMonth) {
  try {
    Logger.log('開始計算週薪: ' + employeeId + ', ' + yearMonth);

    const salaryConfig = getEmployeeSalaryTW(employeeId);
    if (!salaryConfig.success) return { success: false, message: '找不到員工薪資設定' };

    const config = salaryConfig.data;
    const weeklyRate = parseFloat(config['基本薪資']) || 0;

    // 計算該月有幾週（週一出現幾次）
    const parts = yearMonth.split('-');
    const year  = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay  = new Date(year, month, 0);
    let weekCount = 0;
    for (var d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 1) weekCount++;
    }
    if (weekCount === 0) weekCount = 4;

    const basePay = weeklyRate * weekCount;

    // 固定津貼
    const positionAllowance  = parseFloat(config['職務加給'])  || 0;
    const mealAllowance      = parseFloat(config['伙食費'])    || 0;
    const transportAllowance = parseFloat(config['交通補助'])  || 0;
    var attendanceBonus      = parseFloat(config['全勤獎金'])  || 0;
    const performanceBonus   = parseFloat(config['業績獎金'])  || 0;
    const otherAllowances    = parseFloat(config['其他津貼'])  || 0;

    // 加班費（以週薪換算時薪）
    const hourlyEquiv = weekCount > 0 ? (weeklyRate / 40) : 0;
    const overtimeRecords = getEmployeeMonthlyOvertime(employeeId, yearMonth);
    var weekdayOvertimePay = 0, restdayOvertimePay = 0;
    var holidayOvertimePay = 0, holidayWorkPay = 0;
    var totalOvertimeHours = 0;

    const overtimeByDate = {};
    overtimeRecords.forEach(function(r) {
      overtimeByDate[r.date] = (overtimeByDate[r.date] || 0) + (parseFloat(r.hours) || 0);
    });
    Object.keys(overtimeByDate).forEach(function(date) {
      const hours    = overtimeByDate[date];
      const dateType = getDateType(date);
      const pay      = calculateOvertimePay(hours, hourlyEquiv, dateType);
      if (dateType === 'weekday')  weekdayOvertimePay += pay.firstPay + pay.secondPay + pay.thirdPay;
      else if (dateType === 'restday') restdayOvertimePay += pay.firstPay + pay.secondPay + pay.thirdPay;
      else holidayOvertimePay += Math.round(hourlyEquiv * hours * 2.0);
      totalOvertimeHours += hours;
    });

    // 請假扣款
    const leaveRecords = getEmployeeMonthlyLeave(employeeId, yearMonth);
    var leaveDeduction = 0;
    var sickLeaveHours = 0, sickLeaveDeduction = 0;
    var personalLeaveHours = 0, personalLeaveDeduction = 0;
    if (leaveRecords.success && leaveRecords.data) {
      leaveRecords.data.forEach(function(r) {
        if (r.reviewStatus === '核准') {
          const leaveType = String(r.leaveType).toUpperCase();
          const deductHours = (parseFloat(r.leaveDays) || 0) * 8;
          if (leaveType === 'SICK_LEAVE' || leaveType === '病假') {
            sickLeaveHours += deductHours;
            sickLeaveDeduction += Math.round(hourlyEquiv * deductHours * 0.5);
          }
          if (leaveType === 'PERSONAL_LEAVE' || leaveType === '事假') {
            personalLeaveHours += deductHours;
            personalLeaveDeduction += Math.round(hourlyEquiv * deductHours);
          }
        }
      });
      leaveDeduction = sickLeaveDeduction + personalLeaveDeduction;
      if (leaveDeduction > 0) attendanceBonus = 0;
    }

    const grossSalary = Math.round(basePay + positionAllowance + mealAllowance +
      transportAllowance + attendanceBonus + performanceBonus + otherAllowances +
      weekdayOvertimePay + restdayOvertimePay + holidayOvertimePay + holidayWorkPay);

    // 週薪不扣勞健保、就業保險、勞退、所得稅
    const welfareFee      = parseFloat(config['福利金扣款']) || 0;
    const dormitoryFee    = parseFloat(config['宿舍費用'])   || 0;
    const groupInsurance  = parseFloat(config['團保費用'])   || 0;
    const otherDeductions = parseFloat(config['其他扣款'])   || 0;
    const netSalary = Math.round(grossSalary - leaveDeduction - welfareFee - dormitoryFee - groupInsurance - otherDeductions);

    return {
      success: true,
      data: {
        employeeId: employeeId,
        employeeName: config['員工姓名'],
        yearMonth: yearMonth,
        salaryType: '週薪',
        weeklyRate: weeklyRate,
        weekCount: weekCount,
        hourlyRate: Math.round(hourlyEquiv * 100) / 100,
        totalWorkHours: weekCount * 40,
        totalOvertimeHours: totalOvertimeHours,
        baseSalary: Math.round(basePay),
        positionAllowance: positionAllowance,
        mealAllowance: mealAllowance,
        transportAllowance: transportAllowance,
        attendanceBonus: attendanceBonus,
        performanceBonus: performanceBonus,
        otherAllowances: otherAllowances,
        weekdayOvertimePay: Math.round(weekdayOvertimePay),
        restdayOvertimePay: Math.round(restdayOvertimePay),
        holidayOvertimePay: Math.round(holidayOvertimePay),
        holidayWorkPay: Math.round(holidayWorkPay),
        laborFee: 0, healthFee: 0, employmentFee: 0, pensionSelf: 0, incomeTax: 0,
        leaveDeduction: leaveDeduction,
        sickLeaveHours: sickLeaveHours,
        sickLeaveDeduction: sickLeaveDeduction,
        personalLeaveHours: personalLeaveHours,
        personalLeaveDeduction: personalLeaveDeduction,
        earlyLeaveDeduction: 0,
        welfareFee: welfareFee,
        dormitoryFee: dormitoryFee,
        groupInsurance: groupInsurance,
        otherDeductions: otherDeductions,
        grossSalary: grossSalary,
        netSalary: netSalary,
        bankCode: config['銀行代碼'] || '',
        bankAccount: config['銀行帳號'] || '',
        status: '已計算',
        note: '週薪制，' + weekCount + '週'
      }
    };
  } catch (error) {
    Logger.log('計算週薪失敗: ' + error);
    return { success: false, message: error.toString() };
  }
}

// ==================== 三節獎金 ====================

function getBonusRecordSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_BONUS_RECORDS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_BONUS_RECORDS);
    const headers = ['發放ID','員工ID','員工姓名','部門','獎金類型','年度','發放金額','發放日期','狀態','備註','建立時間'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#f59e0b');
    sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    Logger.log('建立獎金發放記錄工作表');
  }
  return sheet;
}

function setBonusRecord(bonusData) {
  try {
    if (!bonusData.employeeId || !bonusData.bonusType || !bonusData.year || bonusData.amount === undefined) {
      return { success: false, message: '缺少必填欄位' };
    }
    const sheet  = getBonusRecordSheet();
    const data   = sheet.getDataRange().getValues();
    const bonusId = 'BONUS-' + bonusData.year + '-' + bonusData.bonusType + '-' + bonusData.employeeId;
    var foundRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === bonusId) { foundRow = i + 1; break; }
    }
    const now = new Date();
    const row = [
      bonusId,
      String(bonusData.employeeId).trim(),
      String(bonusData.employeeName || '').trim(),
      String(bonusData.dept || '').trim(),
      String(bonusData.bonusType).trim(),
      String(bonusData.year).trim(),
      parseFloat(bonusData.amount) || 0,
      bonusData.payDate || Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd'),
      bonusData.status || '已發放',
      String(bonusData.note || '').trim(),
      now
    ];
    if (foundRow > 0) {
      sheet.getRange(foundRow, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    return { success: true, bonusId: bonusId, message: '獎金記錄已儲存' };
  } catch (error) {
    Logger.log('設定獎金失敗: ' + error);
    return { success: false, message: error.toString() };
  }
}

function getMyBonusRecords(employeeId, year) {
  try {
    const sheet   = getBonusRecordSheet();
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const records = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() !== String(employeeId).trim()) continue;
      if (year && String(data[i][5]).trim() !== String(year).trim()) continue;
      const rec = {};
      headers.forEach(function(h, idx) {
        rec[h] = data[i][idx] instanceof Date
          ? Utilities.formatDate(data[i][idx], 'Asia/Taipei', 'yyyy-MM-dd')
          : data[i][idx];
      });
      records.push(rec);
    }
    const order = { '春節獎金': 1, '端午節獎金': 2, '中秋節獎金': 3 };
    records.sort(function(a, b) {
      return (parseInt(b['年度']) - parseInt(a['年度'])) ||
             ((order[a['獎金類型']] || 99) - (order[b['獎金類型']] || 99));
    });
    return { success: true, data: records };
  } catch (error) {
    Logger.log('查詢獎金失敗: ' + error);
    return { success: false, message: error.toString() };
  }
}

function getAllBonusRecords(year) {
  try {
    const sheet   = getBonusRecordSheet();
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const records = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      if (year && String(data[i][5]).trim() !== String(year).trim()) continue;
      const rec = {};
      headers.forEach(function(h, idx) {
        rec[h] = data[i][idx] instanceof Date
          ? Utilities.formatDate(data[i][idx], 'Asia/Taipei', 'yyyy-MM-dd')
          : data[i][idx];
      });
      records.push(rec);
    }
    records.sort(function(a, b) { return parseInt(b['年度']) - parseInt(a['年度']); });
    return { success: true, data: records };
  } catch (error) {
    Logger.log('查詢全部獎金失敗: ' + error);
    return { success: false, message: error.toString() };
  }
}
