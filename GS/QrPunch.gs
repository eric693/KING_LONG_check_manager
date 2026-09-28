// QrPunch.gs
//
// QR Code 打卡。
//
// 以前 QR 代碼是前端自己組的（{I|O}_{到期時間}_{亂數}），後端只檢查格式和到期時間，
// 所以任何人自己拼一個到期時間很久以後的代碼，就能在家打卡、完全繞過 GPS。
// 現在代碼一律由後端用只存在伺服器的密鑰簽章，前端無法偽造：
//
//   {I|O}_{到期毫秒HEX}_{簽章前 16 碼}
//   簽章 = HMAC-SHA256(密鑰, "類型|到期HEX|地點名稱")
//
// 地點名稱也在簽章範圍內，改網址上的 loc 參數會讓代碼失效。
//
// 代碼有兩個來源：
//   1. 管理員在後台手動產生（createQrToken），有效 1～1440 分鐘
//   2. 公司平板的打卡頁（kiosk.html）每 30 秒向 getKioskQr 要新代碼，每個 3 分鐘失效。
//      平板不登入任何帳號，而是用一組「平板金鑰」；這組金鑰只能拿來產生 QR Code。
//      伺服器只存金鑰的雜湊，管理員重設後舊平板立刻失效。

const QR_PROP_SECRET = 'QR_SIGNING_SECRET';
const QR_PROP_KIOSK_HASH = 'QR_KIOSK_KEY_HASH';
const QR_PROP_KIOSK_LOCATION = 'QR_KIOSK_LOCATION';
const QR_PROP_KIOSK_CREATED = 'QR_KIOSK_CREATED';

const QR_MAX_MINUTES = 1440;
// 平板代碼的有效時間：員工掃完若還要先登入 LINE，要留時間給他，但也不能長到能拍照外傳
const QR_KIOSK_TOKEN_MS = 3 * 60 * 1000;
const QR_KIOSK_LOCATION_DEFAULT = '公司平板';

function qrBytesToHex_(bytes) {
  return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function getQrSigningSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty(QR_PROP_SECRET);
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(QR_PROP_SECRET, secret);
  }
  return secret;
}

function signQrPayload_(typeCode, expiryHex, locationName) {
  const payload = `${typeCode}|${expiryHex}|${locationName || ''}`;
  return qrBytesToHex_(Utilities.computeHmacSha256Signature(payload, getQrSigningSecret_())).slice(0, 16);
}

/**
 * 產生一組簽章過的 QR 代碼
 * @param {string} punchType 上班 / 下班
 */
function createSignedQrToken_(punchType, validMs, locationName) {
  const typeCode = punchType === '下班' ? 'O' : 'I';
  const expiryMs = Date.now() + validMs;
  const expiryHex = expiryMs.toString(16).toUpperCase();
  return {
    token: `${typeCode}_${expiryHex}_${signQrPayload_(typeCode, expiryHex, locationName)}`,
    expiresAt: expiryMs
  };
}

// 逐字元比對，不因為前面就不同而提早結束
function qrSafeEquals_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 驗證 QR 代碼。通過回傳 { ok: true, punchType }
 */
function verifyQrToken_(qrTokenId, locationName) {
  const match = String(qrTokenId || '').match(/^([IO])_([0-9A-Fa-f]{1,13})_([0-9a-f]{16})$/);
  if (!match) {
    return { ok: false, code: 'ERR_QR_INVALID', msg: 'QR Code 無效' };
  }

  const typeCode = match[1];
  const expiryHex = match[2];
  const expected = signQrPayload_(typeCode, expiryHex, locationName);
  if (!qrSafeEquals_(match[3], expected)) {
    return { ok: false, code: 'ERR_QR_INVALID', msg: 'QR Code 無效' };
  }

  const expiryMs = parseInt(expiryHex, 16);
  if (isNaN(expiryMs) || Date.now() > expiryMs) {
    return { ok: false, code: 'ERR_QR_EXPIRED', msg: 'QR Code 已過期，請重新掃描' };
  }

  return { ok: true, punchType: typeCode === 'I' ? '上班' : '下班' };
}

/**
 * 員工使用 QR Code 打卡
 */
function qrPunch(sessionToken, qrTokenId, locationName) {
  const session = checkSession_(sessionToken);
  if (!session.ok || !session.user) {
    return { ok: false, code: 'ERR_SESSION_INVALID', msg: '請先登入' };
  }
  const user = session.user;

  const rawLocation = String(locationName || '').trim();
  const verified = verifyQrToken_(qrTokenId, rawLocation);
  if (!verified.ok) return verified;

  const punchType = verified.punchType;
  const loc = rawLocation || 'QR打卡';

  // 一天最多兩組上下班（休息前要打卡），順序與次數見 PunchRules.gs
  const attendanceSh = SpreadsheetApp.getActive().getSheetByName(SHEET_ATTENDANCE);
  const sequence = checkPunchSequence_(user.userId, punchType, attendanceSh.getDataRange().getValues());
  if (!sequence.ok) return sequence;
  const now = new Date();

  const punchRow = [now, user.userId, user.dept, user.name, punchType, 'QR打卡', loc, '', '', 'QR打卡'];
  attendanceSh.getRange(attendanceSh.getLastRow() + 1, 1, 1, punchRow.length).setValues([punchRow]);

  Logger.log('QR打卡成功: ' + user.name + ' - ' + punchType + ' - ' + loc);
  return { ok: true, code: 'PUNCH_SUCCESS', params: { type: punchType, location: loc } };
}

function requireQrAdmin_(token) {
  const session = checkSession_(token);
  if (!session.ok || !session.user || session.user.dept !== '管理員') {
    return null;
  }
  return session.user;
}

/**
 * API：管理員手動產生 QR 代碼
 * 參數：punchType（上班／下班）、minutes（1～1440）、loc（選填）
 */
function handleCreateQrToken(params) {
  if (!requireQrAdmin_(params.token)) {
    return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
  }

  const minutes = parseInt(params.minutes, 10);
  if (!minutes || minutes < 1 || minutes > QR_MAX_MINUTES) {
    return { ok: false, code: 'ERR_QR_MINUTES', msg: '有效時間需介於 1～1440 分鐘' };
  }

  const punchType = params.punchType === '下班' ? '下班' : '上班';
  const loc = String(params.loc || '').trim().slice(0, 50);
  const created = createSignedQrToken_(punchType, minutes * 60 * 1000, loc);

  return { ok: true, token: created.token, expiresAt: created.expiresAt, loc: loc };
}

// ==================== 平板打卡頁 ====================

function hashKioskKey_(key) {
  return qrBytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(key)));
}

/**
 * API：產生新的平板金鑰（舊的立刻失效）。金鑰只在這次回傳，伺服器只存雜湊。
 * 參數：loc（顯示在平板與打卡紀錄上的地點名稱，選填）
 */
function handleResetKioskKey(params) {
  if (!requireQrAdmin_(params.token)) {
    return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
  }

  const key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const loc = String(params.loc || '').trim().slice(0, 50) || QR_KIOSK_LOCATION_DEFAULT;

  PropertiesService.getScriptProperties().setProperties({
    [QR_PROP_KIOSK_HASH]: hashKioskKey_(key),
    [QR_PROP_KIOSK_LOCATION]: loc,
    [QR_PROP_KIOSK_CREATED]: new Date().toISOString()
  });

  return { ok: true, kioskKey: key, loc: loc };
}

/**
 * API：停用平板打卡（清掉金鑰）
 */
function handleDisableKiosk(params) {
  if (!requireQrAdmin_(params.token)) {
    return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
  }
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(QR_PROP_KIOSK_HASH);
  props.deleteProperty(QR_PROP_KIOSK_CREATED);
  return { ok: true };
}

/**
 * API：平板打卡目前的狀態（僅管理員）
 */
function handleGetKioskStatus(params) {
  if (!requireQrAdmin_(params.token)) {
    return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
  }
  const props = PropertiesService.getScriptProperties();
  return {
    ok: true,
    enabled: !!props.getProperty(QR_PROP_KIOSK_HASH),
    loc: props.getProperty(QR_PROP_KIOSK_LOCATION) || QR_KIOSK_LOCATION_DEFAULT,
    createdAt: props.getProperty(QR_PROP_KIOSK_CREATED) || ''
  };
}

/**
 * API：平板取得目前的上班、下班 QR 代碼。不需要登入，用平板金鑰驗證。
 */
function handleGetKioskQr(params) {
  const props = PropertiesService.getScriptProperties();
  const storedHash = props.getProperty(QR_PROP_KIOSK_HASH);
  const key = String(params.kioskKey || '');

  if (!storedHash || !key || !qrSafeEquals_(hashKioskKey_(key), storedHash)) {
    return { ok: false, code: 'ERR_KIOSK_KEY_INVALID', msg: '平板打卡連結已失效，請管理員重新產生' };
  }

  const loc = props.getProperty(QR_PROP_KIOSK_LOCATION) || QR_KIOSK_LOCATION_DEFAULT;
  const checkIn = createSignedQrToken_('上班', QR_KIOSK_TOKEN_MS, loc);
  const checkOut = createSignedQrToken_('下班', QR_KIOSK_TOKEN_MS, loc);

  return {
    ok: true,
    loc: loc,
    checkIn: checkIn.token,
    checkOut: checkOut.token,
    expiresAt: checkIn.expiresAt,
    serverTime: Date.now()
  };
}
