// SystemSettings.gs
//
// 系統層級的可調參數（目前是全公司共用的工作時段），存在試算表的「系統設定」
// 工作表裡，管理員可以從網頁版直接改，不必動程式碼也不必重新部署。
//
// 前端 config.js 的 API_CONFIG.workSchedule 只是離線 / 尚未登入時的預設值，
// 登入後會用 getWorkSchedule 的結果覆蓋，所以兩邊的計算結果才會一致。

const SHEET_SYSTEM_SETTINGS = '系統設定';
const SETTING_KEY_WORK_SCHEDULE = 'workSchedule';
const WORK_SCHEDULE_CACHE_KEY = 'system_settings_work_schedule';
const WORK_SCHEDULE_CACHE_TTL = 300; // 秒；改設定時會主動清掉

/**
 * 取得（必要時建立）系統設定工作表
 */
function getSystemSettingsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SYSTEM_SETTINGS);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SYSTEM_SETTINGS);
    sheet.appendRow(['設定鍵', '設定值(JSON)', '更新時間', '更新者']);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * 讀取單一設定值（JSON 字串），找不到回傳 null
 */
function readSystemSetting_(key) {
  const sheet = getSystemSettingsSheet_();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === key) {
      return { row: i + 1, value: String(data[i][1] || '') };
    }
  }

  return null;
}

/**
 * 寫入單一設定值（有就覆蓋、沒有就新增）
 */
function writeSystemSetting_(key, value, updatedBy) {
  const sheet = getSystemSettingsSheet_();
  const existing = readSystemSetting_(key);
  const now = new Date().toISOString();

  if (existing) {
    sheet.getRange(existing.row, 1, 1, 4).setValues([[key, value, now, updatedBy || '']]);
  } else {
    sheet.appendRow([key, value, now, updatedBy || '']);
  }
}

/**
 * 檢查 HH:MM（24 小時制）
 */
function isValidTimeOfDay_(hhmm) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(hhmm || '').trim());
}

/**
 * 驗證工作時段設定，通過回傳 { ok: true, workSchedule }，否則 { ok: false, msg }
 */
function validateWorkSchedule_(input) {
  const fields = ['start', 'end', 'lunchStart', 'lunchEnd'];
  const schedule = {};

  for (let i = 0; i < fields.length; i++) {
    const name = fields[i];
    const value = String((input && input[name]) || '').trim();

    if (!isValidTimeOfDay_(value)) {
      return { ok: false, msg: `時間格式錯誤（${name}）：請使用 HH:MM，例如 08:30` };
    }

    schedule[name] = value;
  }

  const start = toMinutesOfDay_(schedule.start);
  const end = toMinutesOfDay_(schedule.end);
  const lunchStart = toMinutesOfDay_(schedule.lunchStart);
  const lunchEnd = toMinutesOfDay_(schedule.lunchEnd);

  if (end <= start) {
    return { ok: false, msg: '下班時間必須晚於上班時間' };
  }
  if (lunchEnd < lunchStart) {
    return { ok: false, msg: '午休結束時間不能早於午休開始時間' };
  }
  if (lunchStart < start || lunchEnd > end) {
    return { ok: false, msg: '午休時間必須落在上班與下班時間之間' };
  }

  return { ok: true, workSchedule: schedule };
}

/**
 * 取得目前生效的工作時段。
 * 讀不到或資料壞掉時退回 DEFAULT_WORK_SCHEDULE，確保請假時數一定算得出來。
 */
function getWorkSchedule_() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(WORK_SCHEDULE_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }

    const stored = readSystemSetting_(SETTING_KEY_WORK_SCHEDULE);
    let schedule = DEFAULT_WORK_SCHEDULE;

    if (stored && stored.value) {
      const parsed = JSON.parse(stored.value);
      const checked = validateWorkSchedule_(parsed);
      if (checked.ok) {
        schedule = checked.workSchedule;
      } else {
        Logger.log(` 系統設定的工作時段不合法，改用預設值：${checked.msg}`);
      }
    }

    cache.put(WORK_SCHEDULE_CACHE_KEY, JSON.stringify(schedule), WORK_SCHEDULE_CACHE_TTL);
    return schedule;

  } catch (error) {
    Logger.log(` 讀取工作時段失敗，改用預設值: ${error.message}`);
    return DEFAULT_WORK_SCHEDULE;
  }
}

/**
 * API：取得工作時段（所有登入者都要用，前端算請假時數預覽會呼叫）
 */
function handleGetWorkSchedule(params) {
  try {
    if (!params || !params.token || !validateSession(params.token)) {
      return { ok: false, code: 'SESSION_INVALID', msg: '未授權或 session 已過期' };
    }

    const stored = readSystemSetting_(SETTING_KEY_WORK_SCHEDULE);

    return {
      ok: true,
      workSchedule: getWorkSchedule_(),
      isDefault: !(stored && stored.value)
    };

  } catch (error) {
    Logger.log(` handleGetWorkSchedule 錯誤: ${error.message}`);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：更新工作時段（僅管理員）
 */
function handleUpdateWorkSchedule(params) {
  try {
    const user = getUserByToken(params.token);
    if (!user || user.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '此功能僅限管理員使用' };
    }

    const checked = validateWorkSchedule_({
      start: params.start,
      end: params.end,
      lunchStart: params.lunchStart,
      lunchEnd: params.lunchEnd
    });

    if (!checked.ok) {
      return { ok: false, code: 'INVALID_WORK_SCHEDULE', msg: checked.msg };
    }

    writeSystemSetting_(
      SETTING_KEY_WORK_SCHEDULE,
      JSON.stringify(checked.workSchedule),
      user.name || user.userId || ''
    );

    // 下一次讀取要拿到新值，快取必須先清掉
    CacheService.getScriptCache().remove(WORK_SCHEDULE_CACHE_KEY);

    Logger.log(` 管理員 ${user.name} 更新工作時段: ${JSON.stringify(checked.workSchedule)}`);

    return { ok: true, msg: '工作時段已更新', workSchedule: checked.workSchedule };

  } catch (error) {
    Logger.log(` handleUpdateWorkSchedule 錯誤: ${error.message}`);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：還原成系統預設值（僅管理員）
 */
function handleResetWorkSchedule(params) {
  try {
    const user = getUserByToken(params.token);
    if (!user || user.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '此功能僅限管理員使用' };
    }

    const existing = readSystemSetting_(SETTING_KEY_WORK_SCHEDULE);
    if (existing) {
      getSystemSettingsSheet_().deleteRow(existing.row);
    }

    CacheService.getScriptCache().remove(WORK_SCHEDULE_CACHE_KEY);

    return { ok: true, msg: '已還原為預設工作時段', workSchedule: DEFAULT_WORK_SCHEDULE };

  } catch (error) {
    Logger.log(` handleResetWorkSchedule 錯誤: ${error.message}`);
    return { ok: false, msg: error.toString() };
  }
}

// ==================== 薪資規則（加班倍率、投保級距） ====================
//
// 原本這兩組數字寫死在 SalaryManagement.gs 裡，勞基法或投保級距一改就得改程式碼
// 再重新部署。改成跟工作時段一樣放進「系統設定」，管理員自己維護。

const SETTING_KEY_SALARY_RULES = 'salaryRules';
const SALARY_RULES_CACHE_KEY = 'system_settings_salary_rules';

/**
 * 加班倍率與每日加班上限的預設值（依勞基法）
 */
const DEFAULT_OVERTIME_RULES = {
  weekdayFirst2: 1.34,   // 平日前 2 小時
  weekdayAfter2: 1.67,   // 平日第 3 小時起
  restdayFirst2: 1.34,   // 休息日前 2 小時
  restday3to8: 1.67,     // 休息日第 3-8 小時
  restdayAfter8: 2.67,   // 休息日第 9 小時起
  sunday: 2.0,           // 例假日
  holiday: 2.0,          // 國定假日
  maxWeekdayHours: 4,    // 平日每日加班上限
  maxRestdayHours: 12,   // 休息日每日加班上限
  maxHolidayHours: 8     // 國定假日每日加班上限
};

/**
 * 投保級距預設值（2026 年）
 * insured = 投保薪資、labor = 勞保費、health = 健保費（員工自付額）
 */
const DEFAULT_INSURANCE_BRACKETS = [
  { min: 0,     max: 29500, insured: 29500, labor: 738,  health: 458 },
  { min: 29501, max: 30300, insured: 30300, labor: 758,  health: 470 },
  { min: 30301, max: 31800, insured: 31800, labor: 795,  health: 493 },
  { min: 31801, max: 33000, insured: 33000, labor: 833,  health: 516 },
  { min: 33001, max: 34800, insured: 34800, labor: 870,  health: 540 },
  { min: 34801, max: 36300, insured: 36300, labor: 908,  health: 563 },
  { min: 36301, max: 38200, insured: 38200, labor: 955,  health: 592 },
  { min: 38201, max: 40100, insured: 40100, labor: 1002, health: 622 },
  { min: 40101, max: 42000, insured: 42000, labor: 1050, health: 651 },
  { min: 42001, max: 43900, insured: 43900, labor: 1098, health: 681 },
  { min: 43901, max: 45800, insured: 45800, labor: 1145, health: 710 },
  { min: 45801, max: 48200, insured: 48200, labor: 1145, health: 748 },
  { min: 48201, max: 50600, insured: 50600, labor: 1145, health: 785 },
  { min: 50601, max: 53000, insured: 53000, labor: 1145, health: 822 },
  { min: 53001, max: 55400, insured: 55400, labor: 1145, health: 859 },
  { min: 55401, max: 57800, insured: 57800, labor: 1145, health: 896 },
  { min: 57801, max: 60800, insured: 60800, labor: 1145, health: 943 },
  { min: 60801, max: null,  insured: 60800, labor: 1145, health: 943 }  // null = 無上限
];

/**
 * 所得稅扣繳級距的預設值。
 *
 * 原本只有時薪計算會自動算稅，而且門檻（88,000）與稅率（5% / 12%）是寫死的；
 * 月薪則完全不算，直接用管理員在薪資設定裡手填的數字。同一家公司兩套邏輯，
 * 法規一改還得改程式重新部署。現在統一由這裡設定。
 *
 * threshold 以下不扣；rate 是超過該級距下限的部分適用的稅率；
 * base 是到這一級距下限為止的累計稅額。
 */
const DEFAULT_INCOME_TAX_RULES = {
  // 月薪制是否也自動計算。預設 false —— 沿用現況（讀設定表裡手填的金額），
  // 避免一升級就讓所有月薪員工的實發金額改變。要自動算再由管理員打開。
  autoCalculateForMonthly: false,
  threshold: 88000,
  brackets: [
    { min: 88000,  rate: 0.05, base: 0 },
    { min: 176000, rate: 0.12, base: 4400 }
  ]
};

/**
 * 驗證所得稅設定
 */
// ==================== 計薪規則（全勤、餐費、生日禮金） ====================
//
// 店家自己的計薪規則，金額與門檻都可以在薪資頁的「薪資規則」調整，見 PayrollRules.gs。
// 正職 = 薪資類型「月薪」，兼職 = 「時薪」。
const DEFAULT_PAYROLL_RULES = {
  enabled: true,
  // 正職全勤：每月可以有 lateGraceTimes 次、每次 lateGraceMinutes 分鐘內的遲到；
  // 忘記打卡（補打卡或缺卡）最多 maxMissedPunches 次
  fullTimeAttendanceBonus: 2000,
  lateGraceMinutes: 5,
  lateGraceTimes: 1,
  maxMissedPunches: 2,
  // 兼職全勤：當月排班時數達 partTimeAttendanceHours
  partTimeAttendanceBonus: 1000,
  partTimeAttendanceHours: 96,
  // 餐費：一天工作（正職看實際工時、兼職看排班）滿 mealMinHours 小時，加發 mealPerDay
  mealPerDay: 110,
  mealMinHours: 8,
  // 生日禮金：生日在當月，且到職滿 birthdayMinTenureMonths 個月
  fullTimeBirthdayGift: 1200,
  partTimeBirthdayGift: 600,
  birthdayMinTenureMonths: 3
};

function validatePayrollRules_(input) {
  if (!input || typeof input !== 'object') return { ok: false, msg: '計薪規則格式錯誤' };
  const rules = { enabled: input.enabled !== false };
  const limits = {
    fullTimeAttendanceBonus: [0, 100000], lateGraceMinutes: [0, 120], lateGraceTimes: [0, 31],
    maxMissedPunches: [0, 62], partTimeAttendanceBonus: [0, 100000], partTimeAttendanceHours: [0, 400],
    mealPerDay: [0, 10000], mealMinHours: [0, 24], fullTimeBirthdayGift: [0, 100000],
    partTimeBirthdayGift: [0, 100000], birthdayMinTenureMonths: [0, 120]
  };
  for (const key of Object.keys(limits)) {
    const raw = (input[key] === undefined || input[key] === null || input[key] === '') ? DEFAULT_PAYROLL_RULES[key] : input[key];
    const value = Number(raw);
    const [min, max] = limits[key];
    if (!isFinite(value) || value < min || value > max) {
      return { ok: false, msg: `計薪規則「${key}」要介於 ${min}～${max}` };
    }
    rules[key] = value;
  }
  return { ok: true, payrollRules: rules };
}

function validateIncomeTaxRules_(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, msg: '所得稅設定格式錯誤' };
  }

  const threshold = parseFloat(input.threshold);
  if (isNaN(threshold) || threshold < 0) {
    return { ok: false, msg: '起扣門檻必須是 0 以上的數字' };
  }

  if (!Array.isArray(input.brackets) || input.brackets.length === 0) {
    return { ok: false, msg: '所得稅級距不能是空的' };
  }

  const brackets = [];
  let previousMin = -1;

  for (let i = 0; i < input.brackets.length; i++) {
    const row = input.brackets[i] || {};
    const min = parseFloat(row.min);
    const rate = parseFloat(row.rate);
    const base = parseFloat(row.base);

    if (isNaN(min) || min < 0) {
      return { ok: false, msg: `第 ${i + 1} 級的下限不正確` };
    }
    if (isNaN(rate) || rate < 0 || rate > 1) {
      return { ok: false, msg: `第 ${i + 1} 級的稅率必須介於 0 與 1 之間（0.05 代表 5%）` };
    }
    if (isNaN(base) || base < 0) {
      return { ok: false, msg: `第 ${i + 1} 級的累計稅額不正確` };
    }
    if (min <= previousMin) {
      return { ok: false, msg: `第 ${i + 1} 級的下限必須大於上一級` };
    }

    previousMin = min;
    brackets.push({ min: min, rate: rate, base: base });
  }

  return {
    ok: true,
    incomeTaxRules: {
      autoCalculateForMonthly: input.autoCalculateForMonthly === true ||
                               input.autoCalculateForMonthly === 'true',
      threshold: threshold,
      brackets: brackets
    }
  };
}

/**
 * 驗證加班倍率設定
 */
function validateOvertimeRules_(input) {
  const rates = ['weekdayFirst2', 'weekdayAfter2', 'restdayFirst2', 'restday3to8',
                 'restdayAfter8', 'sunday', 'holiday'];
  const caps = ['maxWeekdayHours', 'maxRestdayHours', 'maxHolidayHours'];
  const rules = {};

  for (let i = 0; i < rates.length; i++) {
    const value = parseFloat(input && input[rates[i]]);
    if (isNaN(value) || value <= 0 || value > 10) {
      return { ok: false, msg: `加班倍率不合理（${rates[i]}）：請輸入 0 到 10 之間的數字` };
    }
    rules[rates[i]] = value;
  }

  for (let i = 0; i < caps.length; i++) {
    const value = parseFloat(input && input[caps[i]]);
    if (isNaN(value) || value <= 0 || value > 24) {
      return { ok: false, msg: `加班時數上限不合理（${caps[i]}）：請輸入 0 到 24 之間的數字` };
    }
    rules[caps[i]] = value;
  }

  return { ok: true, overtimeRules: rules };
}

/**
 * 驗證投保級距表：每一列都要有數字，而且級距要由低到高、不重疊
 */
function validateInsuranceBrackets_(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, msg: '投保級距表不能是空的' };
  }

  const brackets = [];
  let previousMax = -1;

  for (let i = 0; i < input.length; i++) {
    const row = input[i] || {};
    const isLast = (i === input.length - 1);

    const min = parseFloat(row.min);
    // 最後一級可以不填上限，代表「以上」
    const max = (row.max === null || row.max === '' || row.max === undefined)
      ? null
      : parseFloat(row.max);
    const insured = parseFloat(row.insured);
    const labor = parseFloat(row.labor);
    const health = parseFloat(row.health);

    if ([min, insured, labor, health].some(v => isNaN(v) || v < 0)) {
      return { ok: false, msg: `第 ${i + 1} 級的數字不完整或為負數` };
    }
    if (max !== null && (isNaN(max) || max < min)) {
      return { ok: false, msg: `第 ${i + 1} 級的上限必須大於或等於下限` };
    }
    if (max === null && !isLast) {
      return { ok: false, msg: `只有最後一級可以不填上限` };
    }
    if (min <= previousMax) {
      return { ok: false, msg: `第 ${i + 1} 級的下限必須大於上一級的上限` };
    }

    previousMax = (max === null) ? Infinity : max;
    brackets.push({ min: min, max: max, insured: insured, labor: labor, health: health });
  }

  return { ok: true, insuranceBrackets: brackets };
}

/**
 * 取得目前生效的薪資規則。任何一半壞掉都只退回那一半的預設值。
 */
function getSalaryRules_() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(SALARY_RULES_CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const stored = readSystemSetting_(SETTING_KEY_SALARY_RULES);
    let overtimeRules = DEFAULT_OVERTIME_RULES;
    let insuranceBrackets = DEFAULT_INSURANCE_BRACKETS;
    let incomeTaxRules = DEFAULT_INCOME_TAX_RULES;
    let payrollRules = DEFAULT_PAYROLL_RULES;

    if (stored && stored.value) {
      const parsed = JSON.parse(stored.value);

      const checkedOvertime = validateOvertimeRules_(parsed.overtimeRules);
      if (checkedOvertime.ok) {
        overtimeRules = checkedOvertime.overtimeRules;
      } else {
        Logger.log(` 加班倍率設定不合法，改用預設值：${checkedOvertime.msg}`);
      }

      const checkedBrackets = validateInsuranceBrackets_(parsed.insuranceBrackets);
      if (checkedBrackets.ok) {
        insuranceBrackets = checkedBrackets.insuranceBrackets;
      } else {
        Logger.log(` 投保級距設定不合法，改用預設值：${checkedBrackets.msg}`);
      }

      // 舊的設定裡還沒有計薪規則，沒有就沿用預設值
      if (parsed.payrollRules) {
        const checkedPayroll = validatePayrollRules_(parsed.payrollRules);
        if (checkedPayroll.ok) payrollRules = checkedPayroll.payrollRules;
      }

      // 舊的設定裡還沒有這一段，沒有就沿用預設值
      if (parsed.incomeTaxRules) {
        const checkedTax = validateIncomeTaxRules_(parsed.incomeTaxRules);
        if (checkedTax.ok) {
          incomeTaxRules = checkedTax.incomeTaxRules;
        } else {
          Logger.log(` 所得稅設定不合法，改用預設值：${checkedTax.msg}`);
        }
      }
    }

    const rules = {
      overtimeRules: overtimeRules,
      insuranceBrackets: insuranceBrackets,
      incomeTaxRules: incomeTaxRules,
      payrollRules: payrollRules
    };
    cache.put(SALARY_RULES_CACHE_KEY, JSON.stringify(rules), WORK_SCHEDULE_CACHE_TTL);
    return rules;

  } catch (error) {
    Logger.log(` 讀取薪資規則失敗，改用預設值: ${error.message}`);
    return {
      overtimeRules: DEFAULT_OVERTIME_RULES,
      insuranceBrackets: DEFAULT_INSURANCE_BRACKETS,
      incomeTaxRules: DEFAULT_INCOME_TAX_RULES,
      payrollRules: DEFAULT_PAYROLL_RULES
    };
  }
}

/**
 * 依設定計算所得稅。門檻以下不扣，否則取適用的級距算「累計稅額 + 超過部分 × 稅率」。
 */
function calculateIncomeTax_(grossSalary) {
  const rules = (typeof getSalaryRules_ === 'function')
    ? getSalaryRules_().incomeTaxRules
    : DEFAULT_INCOME_TAX_RULES;

  const amount = parseFloat(grossSalary) || 0;
  if (amount < rules.threshold) return 0;

  // 級距由低到高，取最後一個「下限 <= 應發總額」的
  let applicable = null;
  for (let i = 0; i < rules.brackets.length; i++) {
    if (amount >= rules.brackets[i].min) applicable = rules.brackets[i];
  }

  if (!applicable) return 0;

  return Math.round(applicable.base + (amount - applicable.min) * applicable.rate);
}

/**
 * API：取得薪資規則（所有登入者都能看，薪資單要顯示倍率）
 */
function handleGetSalaryRules(params) {
  try {
    if (!params || !params.token || !validateSession(params.token)) {
      return { ok: false, code: 'SESSION_INVALID', msg: '未授權或 session 已過期' };
    }

    const stored = readSystemSetting_(SETTING_KEY_SALARY_RULES);
    const rules = getSalaryRules_();

    return {
      ok: true,
      overtimeRules: rules.overtimeRules,
      insuranceBrackets: rules.insuranceBrackets,
      incomeTaxRules: rules.incomeTaxRules,
      payrollRules: rules.payrollRules,
      defaults: {
        overtimeRules: DEFAULT_OVERTIME_RULES,
        insuranceBrackets: DEFAULT_INSURANCE_BRACKETS,
        incomeTaxRules: DEFAULT_INCOME_TAX_RULES,
        payrollRules: DEFAULT_PAYROLL_RULES
      },
      isDefault: !(stored && stored.value)
    };

  } catch (error) {
    Logger.log(` handleGetSalaryRules 錯誤: ${error.message}`);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：更新薪資規則（僅管理員）
 * 前端把 overtimeRules 與 insuranceBrackets 各自用 JSON 字串送上來。
 */
function handleUpdateSalaryRules(params) {
  try {
    const user = getUserByToken(params.token);
    if (!user || user.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '此功能僅限管理員使用' };
    }

    const current = getSalaryRules_();
    let overtimeRules = current.overtimeRules;
    let insuranceBrackets = current.insuranceBrackets;
    let incomeTaxRules = current.incomeTaxRules;
    let payrollRules = current.payrollRules || DEFAULT_PAYROLL_RULES;

    // 兩個區塊各自獨立，只送其中一個就只改那一個
    if (params.overtimeRules) {
      const checked = validateOvertimeRules_(JSON.parse(params.overtimeRules));
      if (!checked.ok) return { ok: false, code: 'INVALID_OVERTIME_RULES', msg: checked.msg };
      overtimeRules = checked.overtimeRules;
    }

    if (params.insuranceBrackets) {
      const checked = validateInsuranceBrackets_(JSON.parse(params.insuranceBrackets));
      if (!checked.ok) return { ok: false, code: 'INVALID_INSURANCE_BRACKETS', msg: checked.msg };
      insuranceBrackets = checked.insuranceBrackets;
    }

    if (params.incomeTaxRules) {
      const checked = validateIncomeTaxRules_(JSON.parse(params.incomeTaxRules));
      if (!checked.ok) return { ok: false, code: 'INVALID_INCOME_TAX_RULES', msg: checked.msg };
      incomeTaxRules = checked.incomeTaxRules;
    }

    if (params.payrollRules) {
      const checked = validatePayrollRules_(JSON.parse(params.payrollRules));
      if (!checked.ok) return { ok: false, code: 'INVALID_PAYROLL_RULES', msg: checked.msg };
      payrollRules = checked.payrollRules;
    }

    const rules = {
      overtimeRules: overtimeRules,
      insuranceBrackets: insuranceBrackets,
      incomeTaxRules: incomeTaxRules,
      payrollRules: payrollRules
    };
    writeSystemSetting_(SETTING_KEY_SALARY_RULES, JSON.stringify(rules), user.name || '');
    CacheService.getScriptCache().remove(SALARY_RULES_CACHE_KEY);

    Logger.log(` 管理員 ${user.name} 更新薪資規則`);

    return {
      ok: true,
      msg: '薪資規則已更新',
      overtimeRules: overtimeRules,
      insuranceBrackets: insuranceBrackets,
      incomeTaxRules: incomeTaxRules,
      payrollRules: payrollRules
    };

  } catch (error) {
    Logger.log(` handleUpdateSalaryRules 錯誤: ${error.message}`);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：還原薪資規則預設值（僅管理員）
 */
function handleResetSalaryRules(params) {
  try {
    const user = getUserByToken(params.token);
    if (!user || user.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '此功能僅限管理員使用' };
    }

    const existing = readSystemSetting_(SETTING_KEY_SALARY_RULES);
    if (existing) getSystemSettingsSheet_().deleteRow(existing.row);
    CacheService.getScriptCache().remove(SALARY_RULES_CACHE_KEY);

    return {
      ok: true,
      msg: '已還原為預設薪資規則',
      overtimeRules: DEFAULT_OVERTIME_RULES,
      insuranceBrackets: DEFAULT_INSURANCE_BRACKETS,
      incomeTaxRules: DEFAULT_INCOME_TAX_RULES,
      payrollRules: DEFAULT_PAYROLL_RULES
    };

  } catch (error) {
    Logger.log(` handleResetSalaryRules 錯誤: ${error.message}`);
    return { ok: false, msg: error.toString() };
  }
}

// ==================== 自訂薪資項目 ====================
//
// 原本津貼與扣款各自是固定欄位（職務加給、伙食費…），公司要加一項就得改試算表
// 欄位與所有讀寫程式。這裡讓管理員自己定義項目，每位員工的金額存在
// 「員工薪資設定」的「自訂項目」欄（JSON），計算時再併進應發／扣款。

const SETTING_KEY_SALARY_ITEMS = 'salaryItems';
const SALARY_ITEMS_CACHE_KEY = 'system_settings_salary_items';
const MAX_SALARY_ITEMS = 30;

/**
 * 驗證自訂項目清單
 */
function validateSalaryItems_(input) {
  if (!Array.isArray(input)) {
    return { ok: false, msg: '自訂項目格式錯誤' };
  }
  if (input.length > MAX_SALARY_ITEMS) {
    return { ok: false, msg: `自訂項目最多 ${MAX_SALARY_ITEMS} 項` };
  }

  const items = [];
  const seenIds = {};

  for (let i = 0; i < input.length; i++) {
    const row = input[i] || {};
    const id = String(row.id || '').trim();
    const name = String(row.name || '').trim();
    const type = String(row.type || '').trim();

    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
      return { ok: false, msg: `第 ${i + 1} 項的代碼只能用英數字、底線與減號，長度 1-32` };
    }
    if (!name || name.length > 20) {
      return { ok: false, msg: `第 ${i + 1} 項的名稱不能空白，且不超過 20 個字` };
    }
    if (type !== 'allowance' && type !== 'deduction') {
      return { ok: false, msg: `第 ${i + 1} 項的類型只能是津貼或扣款` };
    }
    if (seenIds[id]) {
      return { ok: false, msg: `代碼重複：${id}` };
    }

    seenIds[id] = true;
    items.push({ id: id, name: name, type: type });
  }

  return { ok: true, items: items };
}

/**
 * 取得自訂薪資項目定義（沒設定過就是空陣列）
 */
function getSalaryItems_() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(SALARY_ITEMS_CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const stored = readSystemSetting_(SETTING_KEY_SALARY_ITEMS);
    let items = [];

    if (stored && stored.value) {
      const checked = validateSalaryItems_(JSON.parse(stored.value));
      if (checked.ok) {
        items = checked.items;
      } else {
        Logger.log(` 自訂薪資項目不合法，當作沒有設定：${checked.msg}`);
      }
    }

    cache.put(SALARY_ITEMS_CACHE_KEY, JSON.stringify(items), WORK_SCHEDULE_CACHE_TTL);
    return items;

  } catch (error) {
    Logger.log(` 讀取自訂薪資項目失敗: ${error.message}`);
    return [];
  }
}

/**
 * API：取得自訂薪資項目
 */
function handleGetSalaryItems(params) {
  try {
    if (!params || !params.token || !validateSession(params.token)) {
      return { ok: false, code: 'SESSION_INVALID', msg: '未授權或 session 已過期' };
    }
    return { ok: true, items: getSalaryItems_() };

  } catch (error) {
    Logger.log(` handleGetSalaryItems 錯誤: ${error.message}`);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：儲存自訂薪資項目（僅管理員）
 *
 * 刪掉某個項目時，員工設定裡那一項的金額會留著但不再計入薪資；
 * 之後把同樣代碼加回來，金額就會回來。這是刻意的，避免誤刪造成資料消失。
 */
function handleSaveSalaryItems(params) {
  try {
    const user = getUserByToken(params.token);
    if (!user || user.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '此功能僅限管理員使用' };
    }

    const checked = validateSalaryItems_(JSON.parse(params.items || '[]'));
    if (!checked.ok) {
      return { ok: false, code: 'INVALID_SALARY_ITEMS', msg: checked.msg };
    }

    writeSystemSetting_(SETTING_KEY_SALARY_ITEMS, JSON.stringify(checked.items), user.name || '');
    CacheService.getScriptCache().remove(SALARY_ITEMS_CACHE_KEY);

    Logger.log(` 管理員 ${user.name} 更新自訂薪資項目，共 ${checked.items.length} 項`);

    return { ok: true, msg: '自訂項目已儲存', items: checked.items };

  } catch (error) {
    Logger.log(` handleSaveSalaryItems 錯誤: ${error.message}`);
    return { ok: false, msg: error.toString() };
  }
}
