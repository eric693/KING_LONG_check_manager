// PayrollRules.gs
//
// 店家自己的計薪規則，在薪資算完之後（calculateMonthlySalary）再套上去：
//
//   正職（薪資類型「月薪」）
//     全勤獎金：當月沒有下列情形才發
//       ・遲到超過 lateGraceMinutes 分鐘，或 lateGraceMinutes 分鐘內的遲到超過 lateGraceTimes 次
//         （遲到 = 當天第一次上班卡晚於排班的上班時間）
//       ・忘記打卡超過 maxMissedPunches 次（補打卡、或配不成對的卡各算一次）
//       ・請事假、病假、住院病假，或有曠工（有排班、沒打卡、也沒請假）
//     餐費：實際工時滿 mealMinHours 小時的天數 × mealPerDay
//     生日禮金：生日在當月，且到職滿 birthdayMinTenureMonths 個月
//     加班費的時薪改用（基本薪資 + 伙食費 + 職務加給）÷ 30 ÷ 8（在 SalaryManagement.gs）
//
//   兼職（薪資類型「時薪」）
//     全勤獎金：當月排班時數達 partTimeAttendanceHours
//     餐費：排班滿 mealMinHours 小時、而且當天有出勤的天數 × mealPerDay
//     生日禮金：同正職，金額不同
//
//   兩種都有、每張薪資單各自填的：銷售獎金、預支抵扣、手動加減項目、薪資單備註。
//   這些存在「月薪資記錄」的「計薪調整」欄（JSON），重新計算時會沿用，
//   員工打開自己的薪資單（會觸發重算）也不會把管理員填的東西洗掉。
//
// 金額與門檻都在「薪資規則」設定（SystemSettings.gs 的 DEFAULT_PAYROLL_RULES）。

const PAYROLL_ADJUSTMENTS_COLUMN = '計薪調整';

// 請了這些假，正職當月就沒有全勤
const PAYROLL_ATTENDANCE_BREAKING_LEAVES = [
  'PERSONAL_LEAVE', '事假',
  'SICK_LEAVE', '病假',
  'HOSPITALIZATION_LEAVE', '住院病假',
  'ABSENCE_WITHOUT_LEAVE', '曠工'
];

// 中文假別 → 代碼（請假紀錄新舊資料兩種都有）
const PAYROLL_LEAVE_CODE_BY_NAME = {
  '事假': 'PERSONAL_LEAVE', '病假': 'SICK_LEAVE', '未住院病假': 'SICK_LEAVE',
  '住院病假': 'HOSPITALIZATION_LEAVE', '曠工': 'ABSENCE_WITHOUT_LEAVE'
};

// 全勤說明、生日說明：後端回傳 { code, params }，前端依語系翻譯（i18n 同名鍵）。
// 這裡的中文只拿來寫進試算表的「全勤說明」欄，給直接看試算表的人讀。
const PAYROLL_MESSAGES_ZH = {
  PAYROLL_ATT_QUALIFIED: '符合全勤',
  PAYROLL_ATT_NOT_QUALIFIED: '未全勤',
  PAYROLL_ATT_LATE_OVER: '遲到超過 {minutes} 分鐘 {count} 次',
  PAYROLL_ATT_LATE_GRACE: '{minutes} 分鐘內的遲到 {count} 次（可容許 {allowed} 次）',
  PAYROLL_ATT_MISSED: '忘記打卡 {count} 次（可容許 {allowed} 次）',
  PAYROLL_ATT_LEAVE: '有請 {types}',
  PAYROLL_ATT_ABSENT: '有排班未出勤 {count} 天（{dates}）',
  PAYROLL_ATT_PT_QUALIFIED: '排班 {hours} 小時，符合全勤',
  PAYROLL_ATT_PT_SHORT: '排班 {hours} 小時，未達 {required} 小時',
  PAYROLL_ATT_MANUAL: '管理員調整',
  PAYROLL_BDAY_GIVEN: '當月壽星（到職 {hireDate}，依{source}）',
  PAYROLL_BDAY_NO_HIRE: '當月壽星，但沒有到職日期，未發生日禮金',
  PAYROLL_BDAY_TENURE: '當月壽星，到職未滿 {months} 個月（到職 {hireDate}）',
  PAYROLL_HIRE_SRC_CONFIG: '薪資設定',
  PAYROLL_HIRE_SRC_EMPLOYEES: '員工名單',
  PAYROLL_HIRE_SRC_ACCOUNT: '帳號建立日'
};

function payrollLeaveNameZh_(code) {
  return (typeof LEAVE_TYPES !== 'undefined' && LEAVE_TYPES[code] && LEAVE_TYPES[code].name) || code;
}

/** { code, params } → 中文 */
function payrollMessageZh_(msg) {
  if (!msg) return '';
  const params = msg.params || {};
  return String(PAYROLL_MESSAGES_ZH[msg.code] || msg.code).replace(/\{(\w+)\}/g, (m, key) => {
    const value = params[key];
    if (Array.isArray(value)) return value.map(v => key === 'types' ? payrollLeaveNameZh_(v) : v).join('、');
    if (typeof value === 'string' && PAYROLL_MESSAGES_ZH[value]) return PAYROLL_MESSAGES_ZH[value];
    return value === undefined ? m : String(value);
  });
}

/** 全勤說明 { status, reasons, manual } → 中文 */
function payrollAttendanceZh_(info) {
  if (!info || !info.status) return '';
  let text = payrollMessageZh_({ code: info.status, params: info.params });
  if (info.reasons && info.reasons.length) text += '：' + info.reasons.map(payrollMessageZh_).join('；');
  if (info.manual) text += (text ? '；' : '') + PAYROLL_MESSAGES_ZH.PAYROLL_ATT_MANUAL;
  return text;
}

const PAYROLL_MAX_MANUAL_ITEMS = 20;
const PAYROLL_MAX_AMOUNT = 1000000;
const PAYROLL_MAX_NOTE = 500;

function getPayrollRules_() {
  const rules = (typeof getSalaryRules_ === 'function') ? getSalaryRules_().payrollRules : null;
  return rules || DEFAULT_PAYROLL_RULES;
}

/** Date、"2026-03-05"、"2026/3/5" → Date（當地日期的 00:00）；看不懂回傳 null */
function payrollParseDate_(value) {
  if (!value) return null;
  if (value instanceof Date || Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const m = String(value).trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(date.getTime()) ? null : date;
}

function payrollDateKey_(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** "HH:mm" → 分鐘；看不懂回傳 null */
function payrollTimeToMinutes_(text) {
  const m = String(text || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 一筆排班的應工作分鐘（休假、沒有時間的班 = 0） */
function payrollScheduledMinutes_(shift) {
  if (!shift) return 0;
  if (/休/.test(String(shift.shiftType || ''))) return 0;
  const start = payrollTimeToMinutes_(shift.startTime);
  const end = payrollTimeToMinutes_(shift.endTime);
  if (start === null || end === null || start === end) return 0;
  return calcShiftMinutes_(shift.startTime, shift.endTime, false, Number(shift.breakMinutes) || 0).workMinutes;
}

// ==================== 計薪調整（每張薪資單各自填的） ====================

/**
 * 整理計薪調整：去掉亂填的值，金額四捨五入到元。
 * 回傳 { ok, adjustments } 或 { ok: false, msg }
 */
function normalizePayrollAdjustments_(input) {
  const src = input && typeof input === 'object' ? input : {};
  const money = (value, label) => {
    if (value === null || value === undefined || value === '') return { ok: true, value: null };
    const n = Number(value);
    if (!isFinite(n) || n < 0 || n > PAYROLL_MAX_AMOUNT) {
      return { ok: false, msg: `${label}要介於 0～${PAYROLL_MAX_AMOUNT}` };
    }
    return { ok: true, value: Math.round(n) };
  };

  const sales = money(src.salesBonus, '銷售獎金');
  if (!sales.ok) return sales;
  const advance = money(src.advanceDeduction, '預支抵扣');
  if (!advance.ok) return advance;
  const attendance = money(src.attendanceBonus, '全勤獎金');
  if (!attendance.ok) return attendance;

  const rawItems = Array.isArray(src.manualItems) ? src.manualItems : [];
  if (rawItems.length > PAYROLL_MAX_MANUAL_ITEMS) {
    return { ok: false, msg: `手動項目最多 ${PAYROLL_MAX_MANUAL_ITEMS} 筆` };
  }
  const manualItems = [];
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i] || {};
    const name = String(item.name || '').trim();
    const amount = money(item.amount, `第 ${i + 1} 筆手動項目的金額`);
    if (!amount.ok) return amount;
    if (!name && !amount.value) continue;            // 整列空白就略過
    if (!name || name.length > 30) return { ok: false, msg: `第 ${i + 1} 筆手動項目要填名稱（最多 30 字）` };
    manualItems.push({ name: name, amount: amount.value || 0, type: item.type === 'sub' ? 'sub' : 'add' });
  }

  const note = String(src.note || '').trim();
  if (note.length > PAYROLL_MAX_NOTE) return { ok: false, msg: `備註最多 ${PAYROLL_MAX_NOTE} 字` };

  return {
    ok: true,
    adjustments: {
      salesBonus: sales.value || 0,
      advanceDeduction: advance.value,       // null = 用已核准的預支申請自動帶入
      attendanceBonus: attendance.value,     // null = 依規則判斷
      manualItems: manualItems,
      note: note
    }
  };
}

/** 讀出這張薪資單上次存的計薪調整；沒有就回傳 null */
function readSavedPayrollAdjustments_(employeeId, yearMonth) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MONTHLY_SALARY_ENHANCED);
    if (!sheet || sheet.getLastRow() < 2) return null;
    const data = sheet.getDataRange().getValues();
    const col = data[0].map(h => String(h).trim()).indexOf(PAYROLL_ADJUSTMENTS_COLUMN);
    if (col === -1) return null;

    const salaryId = `SAL-${yearMonth}-${employeeId}`;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== salaryId) continue;
      const raw = String(data[i][col] || '').trim();
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const checked = normalizePayrollAdjustments_(parsed);
      if (!checked.ok) return null;
      // 全勤／生日說明的代碼一併留著：只存欄位、不重算的存檔路徑才不會把它們弄丟
      if (parsed && parsed.messages) checked.adjustments.messages = parsed.messages;
      return checked.adjustments;
    }
  } catch (error) {
    Logger.log(' 讀取計薪調整失敗（改用空白）: ' + error);
  }
  return null;
}

// ==================== 資料來源 ====================

/** 當月已核准、日期在當月的預支金額 */
function sumApprovedAdvances_(employeeId, yearMonth) {
  if (typeof SHEET_EXPENSE === 'undefined') return 0;
  const data = getSheetValues_(SHEET_EXPENSE);
  let total = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[EXPENSE_COL.EMPLOYEE_ID]).trim() !== String(employeeId).trim()) continue;
    if (String(row[EXPENSE_COL.TYPE]) !== 'advance') continue;
    if (String(row[EXPENSE_COL.STATUS]) !== EXPENSE_STATUS.APPROVED) continue;
    const date = payrollParseDate_(row[EXPENSE_COL.DATE]);
    if (!date || payrollDateKey_(date).substring(0, 7) !== yearMonth) continue;
    total += Number(row[EXPENSE_COL.AMOUNT]) || 0;
  }
  return Math.round(total);
}

/**
 * 當月（有重疊到就算）已核准的請假：[{ type, start: Date, end: Date }]
 * 請假紀錄：B 員工ID、E 假別、F 開始、G 結束、K 狀態
 */
function getApprovedLeavesForMonth_(employeeId, yearMonth) {
  const data = getSheetValues_('請假紀錄');
  const [y, m] = yearMonth.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0);
  const list = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[1] || '').trim() !== String(employeeId).trim()) continue;
    const status = String(row[10] || '').trim().toUpperCase();
    if (status !== 'APPROVED' && status !== '核准') continue;
    const start = payrollParseDate_(row[5]);
    if (!start) continue;
    const end = payrollParseDate_(row[6]) || start;
    if (end < monthStart || start > monthEnd) continue;
    const type = String(row[4] || '').trim();
    list.push({ type: PAYROLL_LEAVE_CODE_BY_NAME[type] || type, start: start, end: end });
  }
  return list;
}

/** 生日（員工基本資料 F 欄） */
function getEmployeeBirthday_(employeeId) {
  const sheetName = (typeof SHEET_EMPLOYEE_INFO !== 'undefined') ? SHEET_EMPLOYEE_INFO : '員工基本資料';
  const data = getSheetValues_(sheetName);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(employeeId).trim()) return payrollParseDate_(data[i][5]);
  }
  return null;
}

/**
 * 到職日：薪資設定的「到職日期」→ 員工名單的到職日期 → 員工名單的建立時間（帳號建立日，保守估計）
 * @returns {{ date: Date|null, source: string }}
 */
function getEmployeeHireDate_(employeeId, config) {
  const fromConfig = payrollParseDate_(config && config['到職日期']);
  if (fromConfig) return { date: fromConfig, source: 'PAYROLL_HIRE_SRC_CONFIG' };

  const data = getSheetValues_(SHEET_EMPLOYEES);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][EMPLOYEE_COL.USER_ID]).trim() !== String(employeeId).trim()) continue;
    const hire = payrollParseDate_(data[i][EMPLOYEE_COL.HIRE_DATE]);
    if (hire) return { date: hire, source: 'PAYROLL_HIRE_SRC_EMPLOYEES' };
    const created = payrollParseDate_(data[i][EMPLOYEE_COL.CREATED]);
    if (created) return { date: created, source: 'PAYROLL_HIRE_SRC_ACCOUNT' };
  }
  return { date: null, source: '' };
}

// ==================== 各項規則 ====================

/**
 * 正職全勤
 * @returns {{ qualified: boolean, reasons: Array<{code, params}>, lateGraceUsed: number, missedPunches: number }}
 */
function evaluateFullTimeAttendance_(rules, attendance, shiftMap, leaves, yearMonth, today) {
  const reasons = [];
  const byDate = {};
  attendance.forEach(r => { byDate[r.date] = r; });

  // 遲到：當天第一次上班卡 vs 排班上班時間
  let lateGraceUsed = 0;
  let lateOver = 0;
  attendance.forEach(r => {
    const shift = shiftMap[r.date];
    if (!payrollScheduledMinutes_(shift)) return;
    const firstIn = (r.segments && r.segments.length) ? r.segments[0].start : r.punchIn;
    const actual = payrollTimeToMinutes_(firstIn);
    const scheduled = payrollTimeToMinutes_(shift.startTime);
    if (actual === null || scheduled === null) return;
    const late = actual - scheduled;
    if (late <= 0 || late > 12 * 60) return;   // 準時，或是跨日班的早到
    if (late <= rules.lateGraceMinutes) lateGraceUsed++;
    else lateOver++;
  });
  if (lateOver > 0) {
    reasons.push({ code: 'PAYROLL_ATT_LATE_OVER', params: { minutes: rules.lateGraceMinutes, count: lateOver } });
  }
  if (lateGraceUsed > rules.lateGraceTimes) {
    reasons.push({ code: 'PAYROLL_ATT_LATE_GRACE',
                   params: { minutes: rules.lateGraceMinutes, count: lateGraceUsed, allowed: rules.lateGraceTimes } });
  }

  // 忘記打卡：補打卡、配不成對的卡
  const missedPunches = attendance.reduce((sum, r) => sum + (r.adjustedCount || 0) + (r.unpaired || 0), 0);
  if (missedPunches > rules.maxMissedPunches) {
    reasons.push({ code: 'PAYROLL_ATT_MISSED', params: { count: missedPunches, allowed: rules.maxMissedPunches } });
  }

  // 請假
  const breaking = leaves.filter(l => PAYROLL_ATTENDANCE_BREAKING_LEAVES.indexOf(l.type) !== -1);
  if (breaking.length > 0) {
    const types = breaking.map(l => l.type).filter((type, i, all) => all.indexOf(type) === i);
    reasons.push({ code: 'PAYROLL_ATT_LEAVE', params: { types: types } });
  }

  // 曠工：有排班、沒打卡、也沒請假（只看今天以前的班）
  const absent = Object.keys(shiftMap).filter(date => {
    if (date.substring(0, 7) !== yearMonth || date > today) return false;
    if (!payrollScheduledMinutes_(shiftMap[date])) return false;
    const record = byDate[date];
    if (record && (record.punchIn || record.punchOut)) return false;
    const day = payrollParseDate_(date);
    return !leaves.some(l => day >= l.start && day <= l.end);
  }).sort();
  if (absent.length > 0) reasons.push({ code: 'PAYROLL_ATT_ABSENT', params: { count: absent.length, dates: absent } });

  return { qualified: reasons.length === 0, reasons: reasons, lateGraceUsed: lateGraceUsed, missedPunches: missedPunches };
}

/** 生日禮金 */
function evaluateBirthdayGift_(amount, rules, employeeId, config, yearMonth) {
  const birthday = getEmployeeBirthday_(employeeId);
  const [y, m] = yearMonth.split('-').map(Number);
  if (!birthday) return { amount: 0, message: null };
  if (birthday.getMonth() + 1 !== m) return { amount: 0, message: null };

  const hire = getEmployeeHireDate_(employeeId, config);
  if (!hire.date) return { amount: 0, message: { code: 'PAYROLL_BDAY_NO_HIRE', params: {} } };

  const monthEnd = new Date(y, m, 0);
  const eligibleFrom = new Date(hire.date.getFullYear(), hire.date.getMonth() + rules.birthdayMinTenureMonths, hire.date.getDate());
  if (eligibleFrom > monthEnd) {
    return { amount: 0, message: { code: 'PAYROLL_BDAY_TENURE',
                                   params: { months: rules.birthdayMinTenureMonths, hireDate: payrollDateKey_(hire.date) } } };
  }
  return { amount: amount, message: { code: 'PAYROLL_BDAY_GIVEN',
                                      params: { hireDate: payrollDateKey_(hire.date), source: hire.source } } };
}

// ==================== 套用 ====================

/**
 * 把計薪規則套到一筆已經算好的薪資上（直接修改 data）。
 *
 * @param {Object} data 月薪或時薪的計算結果
 * @param {Object} config 員工薪資設定
 * @param {Object} [adjustments] 這次要用的計薪調整；沒給就沿用這張薪資單上次存的
 */
function applyPayrollRules_(data, config, adjustments) {
  const rules = getPayrollRules_();
  const isFullTime = data.salaryType === '月薪';
  const isPartTime = data.salaryType === '時薪';
  if (!isFullTime && !isPartTime) return data;

  const employeeId = data.employeeId;
  const yearMonth = data.yearMonth;
  const adj = adjustments || readSavedPayrollAdjustments_(employeeId, yearMonth) ||
              { salesBonus: 0, advanceDeduction: null, attendanceBonus: null, manualItems: [], note: '' };

  const deductionsBefore = (Number(data.grossSalary) || 0) - (Number(data.netSalary) || 0);
  let gross = (Number(data.grossSalary) || 0) - (Number(data.attendanceBonus) || 0);
  let deductions = deductionsBefore;

  let attendanceBonus = Number(data.attendanceBonus) || 0;
  let attendanceInfo = null;   // { status, params, reasons, manual }
  let attendanceQualified = attendanceBonus > 0;
  let mealSubsidy = 0;
  let mealDays = 0;
  let birthdayGift = 0;
  let birthdayMessage = null;

  if (rules.enabled) {
    const attendance = getEmployeeMonthlyAttendanceInternal(employeeId, yearMonth);
    const shiftMap = (typeof getEmployeeShiftMapForMonth === 'function')
      ? getEmployeeShiftMapForMonth(employeeId, yearMonth)
      : {};
    const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');

    if (isFullTime) {
      const leaves = getApprovedLeavesForMonth_(employeeId, yearMonth);
      const result = evaluateFullTimeAttendance_(rules, attendance, shiftMap, leaves, yearMonth, today);
      attendanceQualified = result.qualified;
      attendanceBonus = result.qualified ? rules.fullTimeAttendanceBonus : 0;
      attendanceInfo = {
        status: result.qualified ? 'PAYROLL_ATT_QUALIFIED' : 'PAYROLL_ATT_NOT_QUALIFIED',
        params: {},
        reasons: result.reasons
      };

      // 餐費：實際工時滿門檻的天數
      mealDays = attendance.filter(r => (Number(r.workHours) || 0) >= rules.mealMinHours).length;

      const gift = evaluateBirthdayGift_(rules.fullTimeBirthdayGift, rules, employeeId, config, yearMonth);
      birthdayGift = gift.amount;
      birthdayMessage = gift.message;
    } else {
      // 兼職全勤：看排班時數
      const scheduledMinutes = Object.keys(shiftMap)
        .filter(date => date.substring(0, 7) === yearMonth)
        .reduce((sum, date) => sum + payrollScheduledMinutes_(shiftMap[date]), 0);
      const scheduledHours = minutesToHours_(scheduledMinutes);
      const qualified = scheduledHours >= rules.partTimeAttendanceHours;
      attendanceQualified = qualified;
      attendanceBonus = qualified ? rules.partTimeAttendanceBonus : 0;
      attendanceInfo = {
        status: qualified ? 'PAYROLL_ATT_PT_QUALIFIED' : 'PAYROLL_ATT_PT_SHORT',
        params: { hours: scheduledHours, required: rules.partTimeAttendanceHours },
        reasons: []
      };

      // 餐費：排班滿門檻、而且當天有出勤
      const worked = {};
      attendance.forEach(r => { if ((Number(r.workHours) || 0) > 0) worked[r.date] = true; });
      mealDays = Object.keys(shiftMap).filter(date =>
        worked[date] && payrollScheduledMinutes_(shiftMap[date]) >= rules.mealMinHours * 60
      ).length;

      const gift = evaluateBirthdayGift_(rules.partTimeBirthdayGift, rules, employeeId, config, yearMonth);
      birthdayGift = gift.amount;
      birthdayMessage = gift.message;
    }

    mealSubsidy = mealDays * rules.mealPerDay;
  }

  // 管理員在這張薪資單上直接改了全勤獎金，就以管理員為準
  if (adj.attendanceBonus !== null && adj.attendanceBonus !== undefined) {
    attendanceBonus = adj.attendanceBonus;
    attendanceInfo = Object.assign({ status: '', params: {}, reasons: [] }, attendanceInfo, { manual: true });
  }

  const advanceAuto = sumApprovedAdvances_(employeeId, yearMonth);
  const advanceDeduction = (adj.advanceDeduction !== null && adj.advanceDeduction !== undefined)
    ? adj.advanceDeduction
    : advanceAuto;

  const manualItems = adj.manualItems || [];
  const manualAddTotal = manualItems.filter(i => i.type === 'add').reduce((s, i) => s + i.amount, 0);
  const manualSubTotal = manualItems.filter(i => i.type === 'sub').reduce((s, i) => s + i.amount, 0);
  const salesBonus = adj.salesBonus || 0;

  gross += attendanceBonus + mealSubsidy + birthdayGift + salesBonus + manualAddTotal;
  deductions += advanceDeduction + manualSubTotal;

  data.attendanceBonus = attendanceBonus;
  data.attendanceQualified = attendanceQualified;
  data.attendanceInfo = attendanceInfo;
  data.attendanceNote = payrollAttendanceZh_(attendanceInfo);   // 中文，寫進試算表的「全勤說明」
  data.mealSubsidy = mealSubsidy;
  data.mealDays = mealDays;
  data.birthdayGift = birthdayGift;
  data.birthdayMessage = birthdayMessage;
  data.birthdayNote = payrollMessageZh_(birthdayMessage);
  data.salesBonus = salesBonus;
  data.advanceDeduction = advanceDeduction;
  data.advanceAuto = advanceAuto;
  data.manualItems = manualItems;
  data.manualAddTotal = manualAddTotal;
  data.manualSubTotal = manualSubTotal;
  data.payslipNote = adj.note || '';
  data.payrollAdjustments = {
    salesBonus: salesBonus,
    advanceDeduction: adj.advanceDeduction === undefined ? null : adj.advanceDeduction,
    attendanceBonus: adj.attendanceBonus === undefined ? null : adj.attendanceBonus,
    manualItems: manualItems,
    note: adj.note || '',
    // 給前端翻譯用：從試算表讀回的薪資單也能依語系顯示全勤／生日說明（存檔時才會用到，讀回時會被忽略）
    messages: { attendance: attendanceInfo, birthday: birthdayMessage }
  };
  data.payrollRulesApplied = !!rules.enabled;
  data.grossSalary = Math.round(gross);
  data.netSalary = Math.round(gross - deductions);

  return data;
}

// ==================== API ====================

/**
 * API：管理員儲存某張薪資單的計薪調整，並用它重算、存檔。
 * 參數：employeeId、yearMonth、adjustments（JSON：salesBonus、advanceDeduction、attendanceBonus、manualItems、note）
 */
function handleSavePayrollAdjustments(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user || session.user.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
    }

    const employeeId = String(params.employeeId || '').trim();
    const yearMonth = String(params.yearMonth || '').trim();
    if (!employeeId || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return { ok: false, code: 'PAYROLL_ADJUST_INVALID', msg: '缺少員工或年月' };
    }

    let input;
    try {
      input = JSON.parse(params.adjustments || '{}');
    } catch (error) {
      return { ok: false, code: 'PAYROLL_ADJUST_INVALID', msg: '計薪調整格式錯誤' };
    }
    const checked = normalizePayrollAdjustments_(input);
    if (!checked.ok) return { ok: false, code: 'PAYROLL_ADJUST_INVALID', msg: checked.msg };

    const calculated = calculateMonthlySalary(employeeId, yearMonth, checked.adjustments);
    if (!calculated.success) return { ok: false, msg: calculated.message };

    calculated.data.token = params.token;   // 稽核記錄要知道是誰改的
    const saved = saveMonthlySalary(calculated.data);
    delete calculated.data.token;
    if (!saved.success) return { ok: false, msg: saved.message };

    return { ok: true, data: calculated.data, salaryId: saved.salaryId };

  } catch (error) {
    Logger.log(' handleSavePayrollAdjustments 錯誤: ' + error);
    return { ok: false, msg: error.toString() };
  }
}
