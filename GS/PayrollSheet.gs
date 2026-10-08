// PayrollSheet.gs
//
// 「薪資明細表」：公司每月交給會計的那張表，員工橫排、項目直列、最右邊總計。
//
//   應發：本薪、全勤、伙食費、加班費、證照津貼、津貼、油資津貼、差旅費 → 薪資總額
//   應扣：勞保自付額、退休金自提、健保自付額、扣繳稅額、
//         事假、病假、生理假、家庭照顧假、到職不足月 → 應扣合計
//   公司負擔：勞保、勞退、健保 → 公司負擔合計（只列出來，不影響實發）
//   實發金額 = 薪資總額 − 應扣合計
//
// 這支檔案負責三件事：
//   1. 薪資設定多出來的固定金額（證照津貼、油資津貼、差旅費、投保級距、三項公司負擔）
//   2. 計算時加上這些項目，以及生理假、家庭照顧假、到職不足月的扣款（applyPayrollSheetItems_）
//   3. 匯出薪資明細表（exportPayrollSheet_）

// 「員工薪資設定」補在最後面的欄位：每個人每月固定的金額
const PAYROLL_SHEET_CONFIG_FIELDS = [
  { key: 'insuredSalary',    header: '投保級距' },
  { key: 'licenseAllowance', header: '證照津貼' },
  { key: 'fuelAllowance',    header: '油資津貼' },
  { key: 'travelAllowance',  header: '差旅費' },
  { key: 'laborEmployer',    header: '勞保公司負擔' },
  { key: 'healthEmployer',   header: '健保公司負擔' },
  { key: 'pensionEmployer',  header: '勞退公司負擔' }
];

// 「月薪資記錄」補在最後面的欄位。依欄名寫入，不依位置：
// 這張表後面還有簽收時間等其他功能補上的欄位，位置不固定。
const PAYROLL_SHEET_MONTHLY_FIELDS = [
  { key: 'licenseAllowance',         header: '證照津貼' },
  { key: 'fuelAllowance',            header: '油資津貼' },
  { key: 'travelAllowance',          header: '差旅費' },
  { key: 'sundayOvertimePay',        header: '例假日加班費' },
  { key: 'menstrualLeaveDeduction',  header: '生理假扣款' },
  { key: 'familyCareLeaveDeduction', header: '家庭照顧假扣款' },
  { key: 'proRataDeduction',         header: '到職不足月扣款' },
  { key: 'insuredSalary',            header: '投保級距' },
  { key: 'laborEmployer',            header: '勞保公司負擔' },
  { key: 'healthEmployer',           header: '健保公司負擔' },
  { key: 'pensionEmployer',          header: '勞退公司負擔' }
];

const PAYROLL_SHEET_COMPANY_SETTING = 'payrollSheetCompanyName';
const PAYROLL_SHEET_DEFAULT_COMPANY = '欽龍營造股份有限公司';

const PAYROLL_SHEET_LEAVE_CODES = {
  MENSTRUAL_LEAVE: ['MENSTRUAL_LEAVE', '生理假'],
  FAMILY_CARE_LEAVE: ['FAMILY_CARE_LEAVE', '家庭照顧假']
};

function payrollSheetNumber_(value) {
  return (typeof sheetNumber_ === 'function') ? sheetNumber_(value) : (Number(value) || 0);
}

/** 薪資設定的固定金額 → { insuredSalary, licenseAllowance, … } */
function readPayrollSheetConfig_(config) {
  const out = {};
  PAYROLL_SHEET_CONFIG_FIELDS.forEach(f => {
    out[f.key] = Math.round(payrollSheetNumber_(config && config[f.header]));
  });
  return out;
}

/**
 * 依欄名把資料寫進一列（整列陣列，就地修改）。
 * 資料用英文鍵或中文欄名都可以；都沒有就寫 0。
 */
function placePayrollSheetFields_(row, headers, fields, data) {
  fields.forEach(f => {
    const index = headers.indexOf(f.header);
    if (index === -1) return;
    let value = data[f.key];
    if (value === undefined || value === null || value === '') value = data[f.header];
    row[index] = Number(value) || 0;
  });
  return row;
}

/**
 * 到職不足月：當月才到職的月薪員工，本薪按在職天數比例發。
 * 扣款 = 本薪 − 本薪 ÷ 30 × 在職天數（在職天數依日曆算，到職當天算一天）。
 * 例：本薪 40,100，8/5 到職 → 在職 27 天 → 扣 40,100 − 36,090 = 4,010。
 *
 * @returns {{ deduction: number, days: number, hireDate: Date|null }}
 */
function calculateProRataDeduction_(baseSalary, hireDate, yearMonth) {
  const none = { deduction: 0, days: 0, hireDate: hireDate || null };
  if (!hireDate || !baseSalary) return none;
  const [y, m] = yearMonth.split('-').map(Number);
  if (hireDate.getFullYear() !== y || hireDate.getMonth() + 1 !== m) return none;
  if (hireDate.getDate() <= 1) return none;

  const daysInMonth = new Date(y, m, 0).getDate();
  const days = daysInMonth - hireDate.getDate() + 1;
  const deduction = Math.max(0, Math.round(baseSalary - baseSalary / 30 * days));
  return { deduction: deduction, days: days, hireDate: hireDate };
}

/**
 * 到職日：薪資設定的「到職日期」，沒有就用員工名單的到職日期。
 * 不用帳號建立日推估 —— 帳號晚建的老員工會被誤扣到職不足月。
 */
function getProRataHireDate_(employeeId, config) {
  if (typeof getEmployeeHireDate_ !== 'function') return payrollParseDate_(config && config['到職日期']);
  const hire = getEmployeeHireDate_(employeeId, config);
  return hire.source === 'PAYROLL_HIRE_SRC_ACCOUNT' ? null : hire.date;
}

/**
 * 把薪資明細表的項目加到一筆已經算好的薪資上（直接修改 data）。
 * 要在 applyPayrollRules_ 之前呼叫：那支以「應發 − 實發」當作既有的扣款。
 */
function applyPayrollSheetItems_(data, config) {
  const isMonthly = data.salaryType === '月薪';
  const isHourly = data.salaryType === '時薪';
  if (!isMonthly && !isHourly) return data;

  const fixed = readPayrollSheetConfig_(config);

  // 生理假（半薪）、家庭照顧假（不給薪）
  let menstrualDays = 0;
  let familyCareDays = 0;
  const leaves = getEmployeeMonthlyLeave(data.employeeId, data.yearMonth);
  (leaves.data || []).forEach(record => {
    const type = String(record.leaveType || '').trim().toUpperCase();
    const days = parseFloat(record.leaveDays) || 0;
    if (PAYROLL_SHEET_LEAVE_CODES.MENSTRUAL_LEAVE.indexOf(type) !== -1) menstrualDays += days;
    if (PAYROLL_SHEET_LEAVE_CODES.FAMILY_CARE_LEAVE.indexOf(type) !== -1) familyCareDays += days;
  });
  const dailyPay = isMonthly
    ? (Number(data.baseSalary) || 0) / 30
    : (Number(data.hourlyRate) || 0) * 8;
  const menstrualLeaveDeduction = Math.round(menstrualDays * dailyPay * 0.5);
  const familyCareLeaveDeduction = Math.round(familyCareDays * dailyPay);

  const proRata = isMonthly
    ? calculateProRataDeduction_(Number(data.baseSalary) || 0, getProRataHireDate_(data.employeeId, config), data.yearMonth)
    : { deduction: 0, days: 0 };

  const addedEarnings = fixed.licenseAllowance + fixed.fuelAllowance + fixed.travelAllowance;
  const addedDeductions = menstrualLeaveDeduction + familyCareLeaveDeduction + proRata.deduction;

  Object.assign(data, fixed, {
    sundayOvertimePay: Number(data.sundayOvertimePay) || 0,
    menstrualLeaveDays: menstrualDays,
    menstrualLeaveDeduction: menstrualLeaveDeduction,
    familyCareLeaveDays: familyCareDays,
    familyCareLeaveDeduction: familyCareLeaveDeduction,
    proRataDeduction: proRata.deduction,
    proRataDays: proRata.days,
    leaveDeduction: (Number(data.leaveDeduction) || 0) + menstrualLeaveDeduction + familyCareLeaveDeduction,
    grossSalary: (Number(data.grossSalary) || 0) + addedEarnings,
    netSalary: (Number(data.netSalary) || 0) + addedEarnings - addedDeductions
  });

  if (proRata.deduction > 0) {
    data.note = (data.note ? data.note + '，' : '') + `到職不足月：本薪÷30×在職${proRata.days}天`;
  }
  return data;
}

/**
 * 當月才到職的月薪員工，全勤獎金按在職天數比例發：全勤 ÷ 30 × 在職天數。
 * 例：全勤 2,000，8/5 到職、在職 27 天 → 1,800。
 * 管理員在薪資單上直接改過全勤金額的，以管理員為準，不再打折。
 */
function prorateAttendanceBonus_(data) {
  const days = Number(data.proRataDays) || 0;
  const bonus = Number(data.attendanceBonus) || 0;
  if (data.salaryType !== '月薪' || !days || !bonus) return data;
  if (data.attendanceInfo && data.attendanceInfo.manual) return data;

  const prorated = Math.round(bonus / 30 * days);
  const cut = bonus - prorated;
  if (cut <= 0) return data;

  data.attendanceBonus = prorated;
  data.grossSalary = (Number(data.grossSalary) || 0) - cut;
  data.netSalary = (Number(data.netSalary) || 0) - cut;
  data.note = (data.note ? data.note + '，' : '') + `全勤按在職${days}天比例發`;
  return data;
}

// ==================== 匯出薪資明細表 ====================

function payrollSheetRocDate_(date) {
  if (!date) return '';
  return `${date.getFullYear() - 1911}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function getPayrollSheetCompanyName_(requested) {
  const name = String(requested || '').trim().substring(0, 60);
  try {
    const saved = readSystemSetting_(PAYROLL_SHEET_COMPANY_SETTING);
    const savedName = saved ? String(saved.value || '').trim() : '';
    if (!name) return savedName || PAYROLL_SHEET_DEFAULT_COMPANY;
    if (savedName !== name) writeSystemSetting_(PAYROLL_SHEET_COMPANY_SETTING, name, '');
  } catch (error) {
    Logger.log(' 公司名稱設定讀寫失敗: ' + error);
  }
  return name || PAYROLL_SHEET_DEFAULT_COMPANY;
}

/**
 * 一位員工一欄的資料。各列金額加起來一定等於這張薪資單的應發、應扣：
 * 表上沒有獨立一列的項目（交通補助、生日禮金、自訂項目、手動加減項…）歸到「其他應發」「其他扣款」。
 */
function buildPayrollSheetColumn_(record, config, yearMonth) {
  const n = header => payrollSheetNumber_(record[header]);
  // 舊的薪資單沒有公司負擔、投保級距欄（空白），改用薪資設定的金額
  const nOrConfig = header => {
    const raw = record[header];
    return (raw === '' || raw === undefined || raw === null) ? payrollSheetNumber_(config[header]) : payrollSheetNumber_(raw);
  };

  const gross = n('應發總額');
  const deductionsTotal = gross - n('實發金額');

  const earnings = {
    base: n('基本薪資'),
    attendance: n('全勤獎金'),
    meal: n('伙食費') + n('餐費'),
    overtime: n('平日加班費') + n('休息日加班費') + n('例假日加班費') + n('國定假日出勤薪資') + n('國定假日加班費'),
    license: n('證照津貼'),
    allowance: n('職務加給') + n('其他津貼'),
    fuel: n('油資津貼'),
    travel: n('差旅費')
  };
  earnings.other = gross - Object.keys(earnings).reduce((s, k) => s + earnings[k], 0);

  const sick = n('病假扣款');
  const personal = n('事假扣款');
  const menstrual = n('生理假扣款');
  const familyCare = n('家庭照顧假扣款');
  const deductions = {
    labor: n('勞保費') + n('就業保險費'),
    pension: n('勞退自提'),
    health: n('健保費'),
    tax: n('所得稅'),
    personal: personal,
    sick: sick,
    menstrual: menstrual,
    familyCare: familyCare,
    proRata: n('到職不足月扣款')
  };
  deductions.other = deductionsTotal - Object.keys(deductions).reduce((s, k) => s + deductions[k], 0);

  const hireDate = getProRataHireDate_(record['員工ID'], config);
  const notes = [String(config['備註'] || '').trim(), String(record['薪資單備註'] || '').trim()];
  if (deductions.proRata > 0) {
    const proRata = calculateProRataDeduction_(earnings.base, hireDate, yearMonth);
    if (proRata.days) notes.push(`到職不足月：本薪÷30×在職${proRata.days}天`);
  }

  return {
    name: String(record['員工姓名'] || config['員工姓名'] || record['員工ID']),
    hireDate: payrollSheetRocDate_(hireDate),
    insuredSalary: nOrConfig('投保級距'),
    earnings: earnings,
    deductions: deductions,
    employer: {
      labor: nOrConfig('勞保公司負擔'),
      pension: nOrConfig('勞退公司負擔'),
      health: nOrConfig('健保公司負擔')
    },
    note: notes.filter(Boolean).filter((t, i, all) => all.indexOf(t) === i).join('\n')
  };
}

/**
 * 產生薪資明細表（Google 試算表），回傳 { spreadsheet, recordCount }。
 * 第一個分頁是明細表，第二個分頁「原始資料」是月薪資記錄的原樣，對帳用。
 */
function exportPayrollSheet_(yearMonth, companyName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salarySheet = ss.getSheetByName(SHEET_MONTHLY_SALARY_ENHANCED);
  if (!salarySheet || salarySheet.getLastRow() < 2) return { error: 'NO_RECORDS', message: '沒有薪資記錄' };

  const all = salarySheet.getDataRange().getValues();
  const headers = all[0].map(h => String(h).trim());
  const ymIndex = headers.indexOf('年月');
  const rows = all.slice(1).filter(row => {
    const ym = row[ymIndex];
    const text = (ym instanceof Date) ? Utilities.formatDate(ym, 'Asia/Taipei', 'yyyy-MM') : String(ym || '').substring(0, 7);
    return text === yearMonth;
  });
  if (rows.length === 0) return { error: 'NO_RECORDS_FOR_MONTH', message: `${yearMonth} 沒有薪資記錄` };

  // 員工順序照「員工薪資設定」的排列，那是管理員自己排的
  const configSheet = getEmployeeSalarySheet();
  const configData = configSheet.getDataRange().getValues();
  const configHeaders = configData[0].map(h => String(h).trim());
  const configs = {};
  const order = [];
  configData.slice(1).forEach(row => {
    const id = String(row[0]).trim();
    if (!id) return;
    const config = {};
    configHeaders.forEach((h, i) => { config[h] = row[i]; });
    configs[id] = config;
    order.push(id);
  });
  const records = rows.map(row => {
    const record = {};
    headers.forEach((h, i) => { record[h] = row[i]; });
    return record;
  });
  const rank = id => { const i = order.indexOf(String(id).trim()); return i === -1 ? order.length : i; };
  records.sort((a, b) => rank(a['員工ID']) - rank(b['員工ID']));

  const columns = records.map(r => buildPayrollSheetColumn_(r, configs[String(r['員工ID']).trim()] || {}, yearMonth));
  const hasOtherEarnings = columns.some(c => c.earnings.other !== 0);
  const hasOtherDeductions = columns.some(c => c.deductions.other !== 0);

  // 每一列：[標題, 取值, 樣式]；取值為 null 的是區段標題列
  const R = [];
  const add = (label, get, style) => R.push({ label: label, get: get, style: style || '' });
  add('入職日', c => c.hireDate, 'text');
  add('投保級距', c => c.insuredSalary, 'insured');
  const earningStart = R.length;
  add('本薪', c => c.earnings.base);
  add('全勤', c => c.earnings.attendance);
  add('伙食費', c => c.earnings.meal);
  add('加班費', c => c.earnings.overtime);
  add('證照津貼', c => c.earnings.license);
  add('津貼', c => c.earnings.allowance);
  add('油資津貼', c => c.earnings.fuel);
  add('差旅費', c => c.earnings.travel);
  if (hasOtherEarnings) add('其他應發', c => c.earnings.other);
  const earningEnd = R.length - 1;
  const grossRow = R.length;
  add('薪資總額', null, 'gross');
  add('應扣項目', null, 'section');
  const deductionStart = R.length;
  add('勞保自付額', c => c.deductions.labor);
  add('退休金自提', c => c.deductions.pension);
  add('健保自付額', c => c.deductions.health);
  add('扣繳稅額', c => c.deductions.tax);
  add('事假', c => c.deductions.personal);
  add('病假', c => c.deductions.sick);
  add('生理假', c => c.deductions.menstrual);
  add('家庭照顧假', c => c.deductions.familyCare);
  add('到職不足月', c => c.deductions.proRata);
  if (hasOtherDeductions) add('其他扣款', c => c.deductions.other);
  const deductionEnd = R.length - 1;
  const deductionTotalRow = R.length;
  add('應扣合計', null, 'subtotal');
  add('公司負擔', null, 'section');
  const employerStart = R.length;
  add('勞保公司負擔', c => c.employer.labor);
  add('勞退公司負擔', c => c.employer.pension);
  add('健保公司負擔', c => c.employer.health);
  const employerEnd = R.length - 1;
  add('公司負擔合計', null, 'subtotal');
  const netRow = R.length;
  add('實發金額', null, 'net');
  add('備註', c => c.note, 'note');

  const TOP = 3;                          // 第 1 列標題、第 2 列姓名，資料從第 3 列開始
  const sheetRow = i => TOP + i;
  const width = columns.length + 2;       // 標題欄 + 每人一欄 + 總計
  const totalCol = width;
  const colLetter = c => getColumnLetter(c);
  const firstLetter = colLetter(2);
  const lastLetter = colLetter(columns.length + 1);

  const values = R.map((row, i) => {
    const r = sheetRow(i);
    const line = [row.label];
    columns.forEach((c, j) => {
      const L = colLetter(j + 2);
      if (row.style === 'gross') line.push(`=SUM(${L}${sheetRow(earningStart)}:${L}${sheetRow(earningEnd)})`);
      else if (row.style === 'subtotal' && i === deductionTotalRow) line.push(`=SUM(${L}${sheetRow(deductionStart)}:${L}${sheetRow(deductionEnd)})`);
      else if (row.style === 'subtotal') line.push(`=SUM(${L}${sheetRow(employerStart)}:${L}${sheetRow(employerEnd)})`);
      else if (row.style === 'net') line.push(`=${L}${sheetRow(grossRow)}-${L}${sheetRow(deductionTotalRow)}`);
      else if (row.style === 'section') line.push('');
      else line.push(row.get(c));
    });
    const summable = ['text', 'note', 'section', 'insured'].indexOf(row.style) === -1;
    line.push(summable ? `=SUM(${firstLetter}${r}:${lastLetter}${r})` : '');
    return line;
  });

  const [y, m] = yearMonth.split('-').map(Number);
  const company = getPayrollSheetCompanyName_(companyName);
  const title = `${company}${y - 1911}年${m}月份薪資明細表`;

  const spreadsheet = SpreadsheetApp.create(`薪資明細表_${yearMonth}`);
  const sheet = spreadsheet.getActiveSheet();
  sheet.setName(`${y - 1911}年${m}月`);
  if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());

  const NAVY = '#2b4a72';
  const HEADER_BLUE = '#5b8bd0';
  const TOTAL_GREEN = '#eaf0dc';
  const LAVENDER = '#e3e0ee';
  const NET_PINK = '#e8bcbc';
  const BEIGE = '#ecebdf';

  // 標題列
  sheet.getRange(1, 1, 1, width).merge()
       .setValue(title).setBackground(NAVY).setFontColor('#ffffff')
       .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);

  // 姓名列
  const nameRow = ['姓名'].concat(columns.map(c => c.name)).concat(['總計']);
  sheet.getRange(2, 1, 1, width).setValues([nameRow])
       .setBackground(HEADER_BLUE).setFontColor('#ffffff').setFontWeight('bold')
       .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.getRange(2, totalCol).setBackground(TOTAL_GREEN).setFontColor('#000000');
  sheet.setRowHeight(2, 30);

  // 入職日是民國年的文字，先設成文字格式，免得被試算表當成日期
  sheet.getRange(sheetRow(0), 1, 1, width).setNumberFormat('@');
  sheet.getRange(TOP, 1, R.length, width).setValues(values);
  sheet.getRange(TOP, 2, R.length, width - 1).setNumberFormat('#,##0;-#,##0;""').setHorizontalAlignment('center');
  sheet.getRange(TOP, totalCol, R.length, 1).setNumberFormat('#,##0').setFontWeight('bold').setBackground(TOTAL_GREEN);
  sheet.getRange(sheetRow(0), 2, 1, width - 1).setNumberFormat('@');

  R.forEach((row, i) => {
    const line = sheet.getRange(sheetRow(i), 1, 1, width - 1);
    if (row.style === 'insured') line.setBackground(BEIGE);
    if (row.style === 'gross' || row.style === 'subtotal') line.setBackground(LAVENDER);
    if (row.style === 'net') sheet.getRange(sheetRow(i), 1, 1, width).setBackground(NET_PINK).setFontWeight('bold');
    if (['insured', 'gross', 'subtotal', 'net', 'section'].indexOf(row.style) !== -1) {
      sheet.getRange(sheetRow(i), 1).setHorizontalAlignment('center');
    }
    if (row.style === 'note') {
      sheet.getRange(sheetRow(i), 1, 1, width).setWrap(true).setVerticalAlignment('top');
      sheet.getRange(sheetRow(i), 1).setVerticalAlignment('middle').setHorizontalAlignment('center');
      sheet.setRowHeight(sheetRow(i), 120);
    }
  });

  sheet.getRange(1, 1, TOP - 1 + R.length, width)
       .setBorder(true, true, true, true, true, true, '#c9d3e0', SpreadsheetApp.BorderStyle.SOLID);
  sheet.setColumnWidth(1, 100);
  for (let c = 2; c <= width; c++) sheet.setColumnWidth(c, 82);
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(1);

  // 原始資料（「計薪調整」是給系統重算用的 JSON，不匯出）
  const raw = spreadsheet.insertSheet('原始資料');
  const keep = [];
  headers.forEach((h, i) => { if (h && h !== PAYROLL_ADJUSTMENTS_COLUMN) keep.push(i); });
  raw.getRange(1, 1, 1, keep.length).setValues([keep.map(i => headers[i])])
     .setBackground('#4a5568').setFontColor('#ffffff').setFontWeight('bold');
  raw.getRange(2, 1, rows.length, keep.length)
     .setValues(rows.map(row => keep.map(i => row[i] === undefined ? '' : row[i])));
  raw.setFrozenRows(1);

  spreadsheet.setActiveSheet(sheet);
  return { spreadsheet: spreadsheet, recordCount: rows.length, title: title };
}
