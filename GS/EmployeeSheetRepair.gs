// EmployeeSheetRepair.gs
//
// 修復「員工名單」被人刪掉一整欄（通常是 B email 或 C 姓名）之後的錯位。
//
// 正確的欄位：A 員工ID、B email、C 姓名、D 大頭照網址、E 建立時間、F 權限、G 到職日期、H 狀態、I 鎖定姓名
//
// 刪欄之後會出現好幾種壞掉的列（見 planEmployeeRowRepair_ 的說明），例如：
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

const EMPLOYEE_STATUS_VALUES = ['啟用', '離職', '停用'];

function repairText_(value) {
  return repairIsDate_(value) ? '' : String(value === null || value === undefined ? '' : value).trim();
}

function repairLooksLikeDate_(value) {
  return repairIsDate_(value) || /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(repairText_(value));
}

function repairIsRole_(value) {
  return EMPLOYEE_ROLE_VALUES.indexOf(repairText_(value)) !== -1;
}

function repairIsStatus_(value) {
  return EMPLOYEE_STATUS_VALUES.indexOf(repairText_(value)) !== -1;
}

/**
 * 這一列是不是正確的新格式：E 是建立時間（或空白）、權限不在 E、C 不是網址、D 不是時間
 */
function isEmployeeRowAligned_(r) {
  return !repairIsRole_(r[4]) && !repairIsUrl_(r[2]) && !repairLooksLikeDate_(r[3]);
}

/**
 * 判斷一列要怎麼修。回傳 null 代表這列是正常的
 *
 * 刪欄後，舊程式還是照「原本的位置」寫入，所以一列可能混著好幾種狀況：
 *   沒動過的欄位   → 往左移了一格（B 姓名、C 大頭照、D 建立時間、E 權限、F 到職日、G 狀態、H 鎖定姓名）
 *   LINE 登入寫回  → B email、C 姓名、D 大頭照、H「啟用」
 *   改真實姓名寫回 → C 姓名、I 鎖定姓名（原本的大頭照被蓋掉）
 *   調整權限寫回   → F 權限（比 E 新）
 *   離職／復職     → H 狀態（比 G 新）
 * 所以不照「哪一種情況」整列搬，而是逐項找出每個值最可能在哪一格。
 *
 * @returns {{ kind: string, fixed: Array }|null}
 */
function planEmployeeRowRepair_(row) {
  const r = row.slice(0, 9);
  while (r.length < 9) r.push('');
  if (isEmployeeRowAligned_(r)) return null;

  const t = i => repairText_(r[i]);

  // 大頭照：C 或 D 裡的網址（改過真實姓名的人已經被蓋掉，只能留空，下次 LINE 登入會補回）
  const picture = repairIsUrl_(r[2]) ? t(2) : (repairIsUrl_(r[3]) ? t(3) : '');
  // 建立時間：D 如果是時間
  const created = repairLooksLikeDate_(r[3]) ? r[3] : '';
  // 權限：F 是權限（刪欄後在後台改過）優先，否則 E
  const role = repairIsRole_(r[5]) ? t(5) : (repairIsRole_(r[4]) ? t(4) : '員工');
  // 到職日：F 不是權限時就是到職日
  const hireDate = repairIsRole_(r[5]) ? '' : r[5];
  // 狀態：H 是狀態字（登入或離職寫回的，比較新）優先，否則 G
  const status = repairIsStatus_(r[7]) ? t(7) : (repairIsStatus_(r[6]) ? t(6) : '啟用');
  // 鎖定姓名：I（刪欄後改真實姓名寫的）優先，否則 H（原本的鎖定姓名，左移過來的）
  const override = t(8) || (repairIsStatus_(r[7]) ? '' : t(7));
  // 姓名：鎖定姓名 > C（登入或改名寫回的，不是網址、不是時間）> B（左移過來的 LINE 名稱，不是 email）
  const cName = (!repairIsUrl_(r[2]) && !repairLooksLikeDate_(r[2])) ? t(2) : '';
  const bName = t(1).indexOf('@') === -1 ? t(1) : '';
  const name = override || cName || bName;
  // email：B 如果是 email
  const email = t(1).indexOf('@') !== -1 ? t(1) : '';

  return {
    kind: '欄位錯位',
    fixed: [r[0], email, name, picture, created, role, hireDate, status, override]
  };
}

/**
 * 最早那份「員工名單_備份_…」（第一次修復前的原始資料）裡每個人的鎖定姓名
 * @returns {Object<string, string>} userId → 鎖定姓名
 */
function readOriginalLockedNames_(ss) {
  const backups = ss.getSheets()
    .map(sh => sh.getName())
    .filter(name => name.indexOf('員工名單_備份_') === 0)
    .sort();
  if (backups.length === 0) return {};

  const data = ss.getSheetByName(backups[0]).getDataRange().getValues();
  const locks = {};
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    if (!id) continue;
    const row = data[i].slice(0, 9);
    while (row.length < 9) row.push('');
    const plan = planEmployeeRowRepair_(row);
    const lock = repairText_((plan ? plan.fixed : row)[8]);
    if (lock) locks[id] = lock;
  }
  return locks;
}

function runEmployeeSheetRepair_(apply) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  if (!sheet) {
    Logger.log('找不到「員工名單」工作表');
    return { ok: false, fixed: 0 };
  }

  const data = sheet.getDataRange().getValues();
  const originalLocks = readOriginalLockedNames_(ss);
  const plans = [];
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    if (!id) continue;
    let plan = planEmployeeRowRepair_(data[i]);

    // 鎖定姓名被清掉的（舊版修復程式會這樣）：從最早的備份補回來，
    // 不然下次 LINE 登入，姓名就會被 LINE 名稱蓋掉
    const lock = originalLocks[id];
    const current = plan ? plan.fixed : data[i].slice(0, 9);
    while (current.length < 9) current.push('');
    if (lock && !repairText_(current[8])) {
      const fixed = current.slice();
      fixed[8] = lock;
      fixed[2] = lock;
      plan = { kind: plan ? plan.kind + '＋補回鎖定姓名' : '補回鎖定姓名', fixed: fixed };
    }

    if (plan) plans.push({ row: i + 1, before: data[i].slice(0, 9), plan: plan });
  }

  Logger.log('員工名單修復程式 第 3 版（逐欄判斷、從最早的備份補回鎖定姓名）');
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
