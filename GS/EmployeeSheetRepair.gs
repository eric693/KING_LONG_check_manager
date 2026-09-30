// EmployeeSheetRepair.gs
//
// 修復「員工名單」被人刪掉一整欄（通常是 B email 或 C 姓名）之後的錯位。
//
// 正確的欄位：A 員工ID、B email、C 姓名、D 大頭照網址、E 建立時間、F 權限、G 到職日期、H 狀態、I 鎖定姓名
//
// 刪欄之後會出現兩種壞掉的列：
//   1. 刪欄後沒再登入過的人：整列往左移一格 → C 是大頭照網址
//      刪的是 B：[ID, 姓名, 大頭照, 建立時間, 權限, 到職日, 狀態, 鎖定姓名]
//      刪的是 C：[ID, email, 大頭照, 建立時間, 權限, 到職日, 狀態, 鎖定姓名]（姓名只剩鎖定姓名那一份）
//   2. 刪欄後用 LINE 登入過的人：登入時照舊位置寫回了 email、姓名、大頭照、狀態，
//      變成 [ID, email, 姓名, 大頭照, 權限, 到職日, 狀態, 啟用] → E 是權限文字
//      （原本的建立時間與鎖定姓名已經被蓋掉，修復後建立時間留空）
//
// 使用方式（在 Apps Script 編輯器）：
//   1. 先執行 previewEmployeeSheetRepair，看「執行記錄」裡每一列修正前 → 修正後
//   2. 確認沒問題再執行 applyEmployeeSheetRepair，才會真的寫入
// 寫入前會把整張表備份成「員工名單_備份_時間」工作表，萬一不對可以對照還原。

const EMPLOYEE_SHEET_HEADERS = ['userId', 'email', '姓名', '大頭照', '建立時間', '權限', '到職日期', '狀態', '鎖定姓名'];
const EMPLOYEE_ROLE_VALUES = ['管理員', '員工', '排班人員'];

function repairIsUrl_(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function repairIsDate_(value) {
  return value instanceof Date || Object.prototype.toString.call(value) === '[object Date]';
}

/**
 * 判斷一列要怎麼修。回傳 null 代表這列是正常的
 * @returns {{ kind: string, fixed: Array }|null}
 */
function planEmployeeRowRepair_(row) {
  const r = row.slice(0, 9);
  while (r.length < 9) r.push('');

  // 情況 1：整列左移一格（C 是大頭照網址）
  if (repairIsUrl_(r[2])) {
    const b = String(r[1] || '').trim();
    const bIsEmail = b === '' || b.indexOf('@') !== -1;
    const email = bIsEmail ? b : '';
    const name = bIsEmail ? String(r[7] || '').trim() : b;   // 刪的是姓名欄時，只剩鎖定姓名
    return {
      kind: bIsEmail ? '左移一格（C 姓名欄被刪）' : '左移一格（B email 欄被刪）',
      fixed: [r[0], email, name, r[2], r[3], r[4], r[5], r[6] || '啟用', r[7] || '']
    };
  }

  // 情況 2：刪欄後登入過（E 是權限文字、H 被寫成「啟用」）
  const eText = String(r[4] || '').trim();
  const eIsRole = !repairIsDate_(r[4]) && EMPLOYEE_ROLE_VALUES.indexOf(eText) !== -1;
  const fIsRole = EMPLOYEE_ROLE_VALUES.indexOf(String(r[5] || '').trim()) !== -1;
  if (eIsRole && !fIsRole) {
    return {
      kind: '刪欄後登入過（權限在 E 欄）',
      fixed: [r[0], r[1], r[2], r[3], '', eText, r[5], String(r[6] || '').trim() || '啟用', '']
    };
  }

  return null;
}

function runEmployeeSheetRepair_(apply) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  if (!sheet) {
    Logger.log('找不到「員工名單」工作表');
    return { ok: false, fixed: 0 };
  }

  const data = sheet.getDataRange().getValues();
  const plans = [];
  for (let i = 1; i < data.length; i++) {
    if (!String(data[i][0] || '').trim()) continue;
    const plan = planEmployeeRowRepair_(data[i]);
    if (plan) plans.push({ row: i + 1, before: data[i].slice(0, 9), plan: plan });
  }

  const show = v => repairIsDate_(v) ? Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd HH:mm') : String(v);
  Logger.log(`「員工名單」共 ${data.length - 1} 列，需要修正 ${plans.length} 列`);
  plans.forEach(p => {
    Logger.log(`第 ${p.row} 列：${p.plan.kind}`);
    Logger.log('  修正前：' + p.before.map(show).join(' | '));
    Logger.log('  修正後：' + p.plan.fixed.map(show).join(' | '));
  });

  if (!apply) {
    Logger.log(plans.length
      ? '這是預覽，沒有寫入。確認上面「修正後」都對，再執行 applyEmployeeSheetRepair。'
      : '沒有需要修正的列。');
    return { ok: true, fixed: 0, planned: plans.length };
  }
  if (plans.length === 0) {
    Logger.log('沒有需要修正的列。');
    return { ok: true, fixed: 0 };
  }

  // 寫入前先備份整張表
  const backupName = '員工名單_備份_' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmm');
  const backup = ss.insertSheet(backupName);
  backup.getRange(1, 1, data.length, data[0].length).setValues(data);
  Logger.log('已備份成工作表：' + backupName);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    plans.forEach(p => sheet.getRange(p.row, 1, 1, 9).setValues([p.plan.fixed]));
    sheet.getRange(1, 1, 1, 9).setValues([EMPLOYEE_SHEET_HEADERS]);
  } finally {
    lock.releaseLock();
  }

  Logger.log(`完成，已修正 ${plans.length} 列，並把第 1 列標題改回標準欄名。`);
  Logger.log('請打開「員工名單」確認 F 欄權限（管理員／員工／排班人員）是否正確，姓名空白的可在後台「編輯姓名」補上。');
  return { ok: true, fixed: plans.length, backup: backupName };
}

/** 預覽：只列出會怎麼改，不寫入 */
function previewEmployeeSheetRepair() {
  return runEmployeeSheetRepair_(false);
}

/** 執行修復（會先備份） */
function applyEmployeeSheetRepair() {
  return runEmployeeSheetRepair_(true);
}
