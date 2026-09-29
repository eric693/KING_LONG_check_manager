// LoginLinks.gs
//
// 不透過 LINE 登入：LINE 帳號不能用的員工（或根本沒有 LINE 的員工），
// 由管理員產生一條「登入連結」給他。員工在自己的手機打開這條連結，那個瀏覽器就登入了，
// 之後打卡、掃平板 QR Code 都跟用 LINE 登入的一樣。
//
//   ・連結只能用一次，預設 72 小時內有效；同一位員工產生新連結，舊的沒用過的會作廢
//   ・伺服器只存連結代碼的雜湊，試算表外流也拿不到能登入的連結
//   ・離職（Offboarding.gs）會刪掉他所有的 session，連結登入的也一樣失效
//
// 沒有 LINE 的新員工由管理員直接建立，員工ID 用「M」開頭（LINE 的是「U」開頭），
// 系統發 LINE 通知時會跳過這些人。

const SHEET_LOGIN_LINKS = '登入連結';
const LOGIN_LINK_HEADERS = ['連結雜湊', '員工ID', '建立時間', '到期時間', '使用時間', '建立者', '狀態'];
const LOGIN_LINK_DEFAULT_HOURS = 72;
const LOGIN_LINK_MAX_HOURS = 24 * 14;
// 同一位員工最多同時保留幾個登入中的裝置（多的從最舊的開始登出）
const SESSION_MAX_PER_USER = 5;

// 只有管理員建立的員工可以不綁 LINE；可以給的權限不包含管理員（要升管理員請用員工管理的按鈕）
const NO_LINE_EMPLOYEE_ROLES = ['員工', '排班人員'];

function getLoginLinkSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_LOGIN_LINKS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LOGIN_LINKS);
    sheet.appendRow(LOGIN_LINK_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, LOGIN_LINK_HEADERS.length)
         .setFontWeight('bold').setBackground('#4a5568').setFontColor('#ffffff');
  }
  return sheet;
}

function hashLoginCode_(code) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(code))
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function isLineUserId_(userId) {
  return /^U[0-9a-f]{32}$/.test(String(userId || ''));
}

/**
 * 新增一個 session（不覆蓋同一個人其他裝置的登入），並只留最新的 SESSION_MAX_PER_USER 個
 * @returns {string} session token
 */
function createSessionForUser_(userId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSION);
  const token = Utilities.getUuid();
  const now = new Date();
  sheet.appendRow([token, userId, now, new Date(now.getTime() + SESSION_TTL_MS)]);
  pruneUserSessions_(sheet, userId);
  return token;
}

function pruneUserSessions_(sheet, userId) {
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === String(userId).trim()) {
      rows.push({ row: i + 1, created: new Date(data[i][2]).getTime() || 0 });
    }
  }
  if (rows.length <= SESSION_MAX_PER_USER) return;
  rows.sort((a, b) => a.created - b.created);
  rows.slice(0, rows.length - SESSION_MAX_PER_USER)
      .map(r => r.row)
      .sort((a, b) => b - a)            // 由下往上刪，列號才不會位移
      .forEach(row => sheet.deleteRow(row));
}

function findEmployeeRow_(userId) {
  const data = SpreadsheetApp.getActive().getSheetByName(SHEET_EMPLOYEES).getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][EMPLOYEE_COL.USER_ID]).trim() === String(userId).trim()) {
      return { row: i + 1, values: data[i] };
    }
  }
  return null;
}

function requireLoginLinkAdmin_(token) {
  const session = checkSession_(token);
  return (session.ok && session.user && session.user.dept === '管理員') ? session.user : null;
}

// ==================== API ====================

/**
 * API（管理員）：建立沒有 LINE 的員工
 * 參數：name（真實姓名）、role（員工／排班人員，預設員工）
 */
function handleCreateNoLineEmployee(params) {
  const admin = requireLoginLinkAdmin_(params.token);
  if (!admin) return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };

  const name = String(params.name || '').trim();
  if (name.length < 2 || name.length > 50 || /[<>]/.test(name)) {
    return { ok: false, code: 'NO_LINE_NAME_INVALID', msg: '姓名需為 2～50 個字，不能包含 < 或 >' };
  }
  const role = NO_LINE_EMPLOYEE_ROLES.indexOf(params.role) !== -1 ? params.role : '員工';

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_EMPLOYEES);
    const userId = 'M' + Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    // 欄位與 LINE 登入建立的員工相同；姓名同時寫進 nameOverride，之後不會被任何 LINE 名稱蓋掉
    sheet.appendRow([userId, '', name, '', new Date(), role, '', '啟用', name]);
    return { ok: true, userId: userId, name: name, role: role };
  } finally {
    lock.releaseLock();
  }
}

/**
 * API（管理員）：替員工產生一次性的登入連結代碼
 * 參數：userId、hours（有效時數，預設 72，最多 14 天）
 * 回傳的 code 只會出現這一次，前端組成網址給員工
 */
function handleCreateLoginLink(params) {
  const admin = requireLoginLinkAdmin_(params.token);
  if (!admin) return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };

  const userId = String(params.userId || '').trim();
  const employee = userId ? findEmployeeRow_(userId) : null;
  if (!employee) return { ok: false, code: 'NOT_FOUND', msg: '找不到這位員工' };
  if (String(employee.values[EMPLOYEE_COL.STATUS] || '啟用').trim() !== '啟用') {
    return { ok: false, code: 'LOGIN_LINK_INACTIVE', msg: '這位員工已停用或離職，不能產生登入連結' };
  }

  const hours = parseInt(params.hours, 10) || LOGIN_LINK_DEFAULT_HOURS;
  if (hours < 1 || hours > LOGIN_LINK_MAX_HOURS) {
    return { ok: false, code: 'LOGIN_LINK_HOURS', msg: `有效時間需介於 1～${LOGIN_LINK_MAX_HOURS} 小時` };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getLoginLinkSheet_();
    const data = sheet.getDataRange().getValues();
    // 舊的、還沒用過的連結作廢：傳錯人或外流時，重新產生一次就好
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === userId && String(data[i][6]) === '有效') {
        sheet.getRange(i + 1, 7).setValue('已作廢');
      }
    }

    const code = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
    sheet.appendRow([hashLoginCode_(code), userId, now, expiresAt, '', admin.name || admin.userId, '有效']);

    return { ok: true, code: code, expiresAt: expiresAt.getTime(), userId: userId };
  } finally {
    lock.releaseLock();
  }
}

/**
 * API（不需登入）：員工打開登入連結，換成 session
 * 參數：loginCode
 */
function handleRedeemLoginLink(params) {
  const code = String(params.loginCode || '').trim();
  if (!/^[0-9a-f]{64}$/.test(code)) {
    return { ok: false, code: 'LOGIN_LINK_INVALID', msg: '登入連結無效' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getLoginLinkSheet_();
    const data = sheet.getDataRange().getValues();
    const hash = hashLoginCode_(code);

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] !== hash) continue;

      if (String(data[i][6]) !== '有效') {
        return { ok: false, code: 'LOGIN_LINK_USED', msg: '這個登入連結已經用過或已作廢，請向管理員索取新的' };
      }
      if (new Date() > new Date(data[i][3])) {
        return { ok: false, code: 'LOGIN_LINK_EXPIRED', msg: '登入連結已過期，請向管理員索取新的' };
      }

      const userId = String(data[i][1]);
      const employee = findEmployeeByLineUserId_(userId);
      if (!employee.ok || String(employee.status || '啟用') !== '啟用') {
        return { ok: false, code: 'LOGIN_LINK_INACTIVE', msg: '這個帳號已停用，請聯絡管理員' };
      }

      // 先標記用過，再發 session：就算後面出錯，連結也不能再用第二次
      sheet.getRange(i + 1, 5, 1, 3).setValues([[new Date(), data[i][5], '已使用']]);
      const sToken = createSessionForUser_(userId);

      return {
        ok: true,
        sToken: sToken,
        user: {
          userId: employee.userId,
          employeeId: employee.employeeId,
          email: employee.email || '',
          name: employee.name,
          picture: employee.picture || '',
          dept: employee.dept,
          status: employee.status
        }
      };
    }

    return { ok: false, code: 'LOGIN_LINK_INVALID', msg: '登入連結無效' };
  } finally {
    lock.releaseLock();
  }
}
