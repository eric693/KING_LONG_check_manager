// ManualPayslip.gs
//
// 手動薪資單：管理員直接逐項填金額，系統只負責加總，不依打卡、排班自動計算。
// 用在系統上線前的月份（例如上線前一個月的薪水），或之後需要特殊處理的個案。
//
// 存在「月薪資記錄」，跟一般薪資單同一張表、同一個欄位順序，所以員工的「我的薪資」、
// 列印、簽收、薪資報表與匯出都照常可用。差別是：
//   ・「狀態」欄是「手動輸入」
//   ・任何自動重算（員工打開薪資單、批次計算、改薪資設定、核准加班）都不會覆蓋它
//     （擋在 saveMonthlySalary，見 SalaryManagement.gs）
//   ・要改回自動計算，刪掉這張手動薪資單即可

const MANUAL_PAYSLIP_STATUS = '手動輸入';
const MANUAL_PAYSLIP_MAX_AMOUNT = 10000000;

// 可以手動填的金額欄位（鍵名與 saveMonthlySalary 相同）
const MANUAL_PAYSLIP_EARNINGS = [
  'baseSalary', 'positionAllowance', 'mealAllowance', 'transportAllowance', 'attendanceBonus',
  'performanceBonus', 'otherAllowances', 'weekdayOvertimePay', 'mealSubsidy', 'salesBonus', 'birthdayGift'
];
const MANUAL_PAYSLIP_DEDUCTIONS = [
  'laborFee', 'healthFee', 'employmentFee', 'pensionSelf', 'incomeTax',
  'leaveDeduction', 'advanceDeduction', 'otherDeductions'
];

// 「月薪資記錄」每一欄對應的英文鍵（順序與 MONTHLY_SALARY_HEADERS 相同）
const MONTHLY_SALARY_KEYS = [
  'salaryId', 'employeeId', 'employeeName', 'yearMonth', 'salaryType', 'hourlyRate', 'totalWorkHours', 'totalOvertimeHours',
  'baseSalary', 'positionAllowance', 'mealAllowance', 'transportAllowance', 'attendanceBonus', 'performanceBonus', 'otherAllowances',
  'weekdayOvertimePay', 'restdayOvertimePay', 'holidayWorkPay', 'holidayOvertimePay',
  'laborFee', 'healthFee', 'employmentFee', 'pensionSelf', 'incomeTax',
  'leaveDeduction', 'earlyLeaveDeduction', 'welfareFee', 'dormitoryFee', 'groupInsurance', 'otherDeductions',
  'sickLeaveHours', 'sickLeaveDeduction', 'personalLeaveHours', 'personalLeaveDeduction',
  'grossSalary', 'netSalary', 'bankCode', 'bankAccount', 'status', 'note', 'createdAt',
  'customAllowanceTotal', 'customDeductionTotal', 'customItemDetail',
  'mealSubsidy', 'salesBonus', 'birthdayGift', 'advanceDeduction', 'manualAddTotal', 'manualSubTotal',
  'attendanceNote', 'payslipNote', 'payrollAdjustmentsJson'
];

/**
 * 讀出某位員工某月的薪資單列
 * @returns {{ headers: Array, row: Array, rowIndex: number }|null}
 */
function readMonthlySalaryRow_(employeeId, yearMonth) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MONTHLY_SALARY_ENHANCED);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const data = sheet.getDataRange().getValues();
  const salaryId = `SAL-${yearMonth}-${employeeId}`;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === salaryId) {
      return { headers: data[0].map(h => String(h).trim()), row: data[i], rowIndex: i + 1 };
    }
  }
  return null;
}

function isManualPayslipRow_(headers, row) {
  const statusIndex = headers.indexOf('狀態');
  return statusIndex !== -1 && String(row[statusIndex] || '').trim() === MANUAL_PAYSLIP_STATUS;
}

/**
 * 薪資單列 → 跟計算結果一樣的物件（英文鍵），員工薪資頁、列印才能直接用。
 * 中文欄名的值也一併保留（例如簽收時間）。
 */
function monthlyRowToSalaryData_(headers, row) {
  const data = {};
  headers.forEach((header, i) => { if (header) data[header] = row[i]; });

  MONTHLY_SALARY_HEADERS.forEach((header, i) => {
    const index = headers.indexOf(header);
    if (index !== -1) data[MONTHLY_SALARY_KEYS[i]] = row[index];
  });

  const ym = data.yearMonth;
  data.yearMonth = (ym instanceof Date || Object.prototype.toString.call(ym) === '[object Date]')
    ? Utilities.formatDate(ym, 'Asia/Taipei', 'yyyy-MM')
    : String(ym || '').substring(0, 7);
  data['年月'] = data.yearMonth;

  [].concat(MANUAL_PAYSLIP_EARNINGS, MANUAL_PAYSLIP_DEDUCTIONS,
            ['grossSalary', 'netSalary', 'hourlyRate', 'totalWorkHours', 'totalOvertimeHours',
             'manualAddTotal', 'manualSubTotal']).forEach(key => {
    data[key] = Number(data[key]) || 0;
  });

  try {
    const detail = JSON.parse(data.customItemDetail || '{}') || {};
    data.customAllowances = detail.allowances || [];
    data.customDeductions = detail.deductions || [];
  } catch (error) {
    data.customAllowances = [];
    data.customDeductions = [];
  }

  let adjustments = {};
  try {
    adjustments = JSON.parse(data.payrollAdjustmentsJson || '{}') || {};
  } catch (error) {
    adjustments = {};
  }
  data.manualItems = Array.isArray(adjustments.manualItems) ? adjustments.manualItems : [];
  data.payslipNote = String(data.payslipNote || adjustments.note || '');
  data.manualPayslip = isManualPayslipRow_(headers, row);
  delete data.payrollAdjustmentsJson;
  delete data.customItemDetail;
  return data;
}

/** 這個月是手動薪資單就回傳它（英文鍵的物件），不是就回傳 null */
function readManualPayslip_(employeeId, yearMonth) {
  const found = readMonthlySalaryRow_(employeeId, yearMonth);
  if (!found || !isManualPayslipRow_(found.headers, found.row)) return null;
  return monthlyRowToSalaryData_(found.headers, found.row);
}

function requireManualPayslipAdmin_(token) {
  const session = checkSession_(token);
  return (session.ok && session.user && session.user.dept === '管理員') ? session.user : null;
}

function manualPayslipTarget_(params) {
  const employeeId = String(params.employeeId || '').trim();
  const yearMonth = String(params.yearMonth || '').trim();
  if (!employeeId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) return null;
  return { employeeId: employeeId, yearMonth: yearMonth };
}

// ==================== API ====================

/**
 * API（管理員）：讀取某員工某月的薪資單，給手動薪資單表單預先帶入。
 * 已經有手動薪資單 → 帶它的金額；沒有 → 帶薪資設定裡的固定金額（基本薪資、津貼、勞健保）。
 */
function handleGetManualPayslip(params) {
  if (!requireManualPayslipAdmin_(params.token)) {
    return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
  }
  const target = manualPayslipTarget_(params);
  if (!target) return { ok: false, code: 'MANUAL_PAYSLIP_INVALID', msg: '請選擇員工與年月' };

  const found = readMonthlySalaryRow_(target.employeeId, target.yearMonth);
  if (found && isManualPayslipRow_(found.headers, found.row)) {
    return { ok: true, exists: true, autoExists: false, data: monthlyRowToSalaryData_(found.headers, found.row) };
  }

  // 沒有手動薪資單：用薪資設定的固定金額當起點，省得每一格重打
  const draft = { salaryType: '月薪', manualItems: [], payslipNote: '' };
  const configResult = getEmployeeSalaryTW(target.employeeId);
  if (configResult.success && configResult.data) {
    const c = configResult.data;
    const n = v => Number(v) || 0;
    draft.salaryType = String(c['薪資類型'] || '月薪').trim() === '時薪' ? '時薪' : '月薪';
    if (draft.salaryType === '時薪') {
      draft.hourlyRate = n(c['基本薪資']);
    } else {
      draft.baseSalary = n(c['基本薪資']);
    }
    draft.positionAllowance = n(c['職務加給']);
    draft.mealAllowance = n(c['伙食費']);
    draft.transportAllowance = n(c['交通補助']);
    draft.otherAllowances = n(c['其他津貼']);
    draft.laborFee = n(c['勞保費']);
    draft.healthFee = n(c['健保費']);
    draft.employmentFee = n(c['就業保險費']);
    draft.pensionSelf = n(c['勞退自提']);
  }
  return { ok: true, exists: false, autoExists: !!found, data: draft };
}

/**
 * API（管理員）：儲存手動薪資單
 * 參數：employeeId、yearMonth、payslip（JSON：salaryType、hourlyRate、totalWorkHours、各項金額、manualItems、note）
 */
function handleSaveManualPayslip(params) {
  const admin = requireManualPayslipAdmin_(params.token);
  if (!admin) return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
  const target = manualPayslipTarget_(params);
  if (!target) return { ok: false, code: 'MANUAL_PAYSLIP_INVALID', msg: '請選擇員工與年月' };

  let input;
  try {
    input = JSON.parse(params.payslip || '{}') || {};
  } catch (error) {
    return { ok: false, code: 'MANUAL_PAYSLIP_INVALID', msg: '薪資單資料格式錯誤' };
  }

  const amounts = {};
  for (const key of [].concat(MANUAL_PAYSLIP_EARNINGS, MANUAL_PAYSLIP_DEDUCTIONS, ['hourlyRate', 'totalWorkHours'])) {
    const raw = input[key];
    const value = (raw === undefined || raw === null || raw === '') ? 0 : Number(raw);
    if (!isFinite(value) || value < 0 || value > MANUAL_PAYSLIP_MAX_AMOUNT) {
      return { ok: false, code: 'MANUAL_PAYSLIP_AMOUNT', msg: `金額要介於 0～${MANUAL_PAYSLIP_MAX_AMOUNT}`, params: { field: key } };
    }
    amounts[key] = key === 'totalWorkHours' ? Math.round(value * 100) / 100 : Math.round(value);
  }

  // 手動加減項目與備註沿用計薪調整的檢查（名稱必填、金額範圍、備註長度）
  const checked = normalizePayrollAdjustments_({ manualItems: input.manualItems, note: input.note });
  if (!checked.ok) return { ok: false, code: 'MANUAL_PAYSLIP_INVALID', msg: checked.msg };
  const manualItems = checked.adjustments.manualItems;
  const note = checked.adjustments.note;
  const manualAddTotal = manualItems.filter(i => i.type === 'add').reduce((s, i) => s + i.amount, 0);
  const manualSubTotal = manualItems.filter(i => i.type === 'sub').reduce((s, i) => s + i.amount, 0);

  const gross = MANUAL_PAYSLIP_EARNINGS.reduce((s, k) => s + amounts[k], 0) + manualAddTotal;
  const deductions = MANUAL_PAYSLIP_DEDUCTIONS.reduce((s, k) => s + amounts[k], 0) + manualSubTotal;

  // 姓名、銀行帳號：薪資設定優先，沒有就用員工名單上的名字
  let employeeName = '';
  let bankCode = '';
  let bankAccount = '';
  const configResult = getEmployeeSalaryTW(target.employeeId);
  if (configResult.success && configResult.data) {
    employeeName = String(configResult.data['員工姓名'] || '');
    bankCode = configResult.data['銀行代碼'] || '';
    bankAccount = configResult.data['銀行帳號'] || '';
  }
  if (!employeeName && typeof getEmployeeNameMap_ === 'function') {
    employeeName = getEmployeeNameMap_()[target.employeeId] || '';
  }
  if (!employeeName) return { ok: false, code: 'NOT_FOUND', msg: '找不到這位員工' };

  const salaryData = Object.assign({}, amounts, {
    employeeId: target.employeeId,
    employeeName: employeeName,
    yearMonth: target.yearMonth,
    salaryType: input.salaryType === '時薪' ? '時薪' : '月薪',
    grossSalary: gross,
    netSalary: gross - deductions,
    bankCode: bankCode,
    bankAccount: bankAccount,
    status: MANUAL_PAYSLIP_STATUS,
    note: '手動輸入（' + (admin.name || admin.userId) + '）',
    payslipNote: note,
    manualAddTotal: manualAddTotal,
    manualSubTotal: manualSubTotal,
    payrollAdjustments: {
      manual: true,
      salesBonus: amounts.salesBonus,
      advanceDeduction: amounts.advanceDeduction,
      attendanceBonus: amounts.attendanceBonus,
      manualItems: manualItems,
      note: note
    },
    manualPayslip: true,       // 讓 saveMonthlySalary 知道可以覆蓋手動薪資單
    token: params.token        // 稽核記錄要知道是誰改的
  });

  const saved = saveMonthlySalary(salaryData);
  if (!saved.success) return { ok: false, msg: saved.message };

  return { ok: true, salaryId: saved.salaryId, data: readManualPayslip_(target.employeeId, target.yearMonth) };
}

/**
 * API（管理員）：刪除手動薪資單，這個月改回自動計算
 */
function handleDeleteManualPayslip(params) {
  if (!requireManualPayslipAdmin_(params.token)) {
    return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
  }
  const target = manualPayslipTarget_(params);
  if (!target) return { ok: false, code: 'MANUAL_PAYSLIP_INVALID', msg: '請選擇員工與年月' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = readMonthlySalaryRow_(target.employeeId, target.yearMonth);
    if (!found || !isManualPayslipRow_(found.headers, found.row)) {
      return { ok: false, code: 'MANUAL_PAYSLIP_NOT_FOUND', msg: '這個月沒有手動薪資單' };
    }
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MONTHLY_SALARY_ENHANCED).deleteRow(found.rowIndex);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
