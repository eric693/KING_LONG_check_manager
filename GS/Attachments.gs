// Attachments.gs
//
// 申請單的附件：請假的診斷證明、加班的佐證、補打卡的說明照片、報銷的發票等。
// 原本這些只能用文字描述，審核的人沒有依據。
//
// 檔案存進 Google 雲端硬碟，metadata 存在「附件」工作表。
// 檔案「不」開放公開連結 —— 診斷證明這類東西不該任何人拿到網址就看得到，
// 所以讀取一律經過 API 驗證身分後才回傳內容。

const SHEET_ATTACHMENTS = '附件';
const ATTACHMENT_FOLDER_NAME = '出勤管家附件';

// Apps Script 的請求大小有限制，base64 會比原檔大約 1/3，抓 3MB 是安全又夠用的上限
const ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;

// 只接受這幾種：照片與 PDF 足以涵蓋證明文件，不開放任意檔案避免被當檔案空間用
const ATTACHMENT_ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'
];

// 附件掛在哪一種申請單上
const ATTACHMENT_TYPES = ['leave', 'overtime', 'adjustPunch', 'worklog', 'expense'];

/**
 * 取得（必要時建立）附件記錄表
 */
function getAttachmentSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_ATTACHMENTS);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ATTACHMENTS);
    sheet.appendRow(['附件ID', '類型', '記錄鍵', '員工ID', '員工姓名',
                     '檔名', 'MIME', '雲端硬碟檔案ID', '大小(bytes)', '上傳時間']);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 10)
         .setFontWeight('bold')
         .setBackground('#6366f1')
         .setFontColor('#ffffff');
    Logger.log(' 已建立「附件」工作表');
  }

  return sheet;
}

/**
 * 取得（必要時建立）存放附件的雲端硬碟資料夾
 */
function getAttachmentFolder_(type) {
  const root = (function () {
    const existing = DriveApp.getFoldersByName(ATTACHMENT_FOLDER_NAME);
    return existing.hasNext() ? existing.next() : DriveApp.createFolder(ATTACHMENT_FOLDER_NAME);
  })();

  const existing = root.getFoldersByName(type);
  return existing.hasNext() ? existing.next() : root.createFolder(type);
}

/**
 * 找出某筆附件所在的列
 */
function findAttachmentRow_(attachmentId) {
  const sheet = getAttachmentSheet_();
  const data = sheet.getDataRange().getValues();
  const target = String(attachmentId || '').trim();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === target) {
      return { sheet: sheet, rowIndex: i + 1, row: data[i] };
    }
  }

  return null;
}

/**
 * API：上傳附件
 *
 * 參數：type、recordKey、filename、mimeType、data（base64，不含 data: 前綴）
 */
function handleUploadAttachment(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, code: 'SESSION_INVALID', msg: '未授權或 session 已過期' };
    }

    const type = String(params.type || '').trim();
    const recordKey = String(params.recordKey || '').trim();
    const filename = String(params.filename || '').trim();
    const mimeType = String(params.mimeType || '').trim();

    if (ATTACHMENT_TYPES.indexOf(type) === -1) {
      return { ok: false, code: 'INVALID_TYPE', msg: '不支援的附件類型' };
    }
    if (!recordKey) {
      return { ok: false, code: 'MISSING_RECORD', msg: '缺少記錄識別' };
    }
    if (!filename) {
      return { ok: false, code: 'MISSING_FILENAME', msg: '缺少檔名' };
    }
    if (ATTACHMENT_ALLOWED_TYPES.indexOf(mimeType) === -1) {
      return { ok: false, code: 'INVALID_MIME', msg: '只接受圖片（JPG／PNG／WebP／HEIC）與 PDF' };
    }
    if (!params.data) {
      return { ok: false, code: 'MISSING_DATA', msg: '沒有收到檔案內容' };
    }

    let bytes;
    try {
      bytes = Utilities.base64Decode(params.data);
    } catch (error) {
      return { ok: false, code: 'INVALID_DATA', msg: '檔案內容格式錯誤' };
    }

    if (bytes.length > ATTACHMENT_MAX_BYTES) {
      return {
        ok: false,
        code: 'FILE_TOO_LARGE',
        msg: `檔案超過 ${Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB 上限`
      };
    }

    const blob = Utilities.newBlob(bytes, mimeType, filename);
    const file = getAttachmentFolder_(type).createFile(blob);

    // 刻意不呼叫 setSharing：診斷證明這類文件不該拿到網址就看得到，
    // 讀取一律走 handleGetAttachment 驗身分。
    const attachmentId = 'ATT_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    getAttachmentSheet_().appendRow([
      attachmentId, type, recordKey,
      session.user.userId, session.user.name || '',
      filename, mimeType, file.getId(), bytes.length, new Date()
    ]);

    Logger.log(` 附件已上傳: ${filename}（${bytes.length} bytes）by ${session.user.name}`);

    return {
      ok: true,
      msg: '附件已上傳',
      attachment: {
        attachmentId: attachmentId,
        filename: filename,
        mimeType: mimeType,
        size: bytes.length,
        uploadedBy: session.user.name || '',
        uploadedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    Logger.log(' handleUploadAttachment 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：列出某筆申請單的附件（只回 metadata，不含檔案內容）
 *
 * 本人與管理員都看得到；審核者需要看附件才能審，所以管理員一定要能列。
 */
function handleListAttachments(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, code: 'SESSION_INVALID', msg: '未授權或 session 已過期' };
    }

    const type = String(params.type || '').trim();
    const recordKey = String(params.recordKey || '').trim();
    if (!type || !recordKey) {
      return { ok: false, code: 'MISSING_PARAMS', msg: '缺少類型或記錄識別' };
    }

    const isAdmin = (session.user.dept === '管理員');
    const data = getAttachmentSheet_().getDataRange().getValues();
    const attachments = [];

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() !== type) continue;
      if (String(data[i][2]).trim() !== recordKey) continue;
      if (!isAdmin && String(data[i][3]).trim() !== session.user.userId) continue;

      attachments.push({
        attachmentId: data[i][0],
        filename: data[i][5],
        mimeType: data[i][6],
        size: data[i][8],
        uploadedBy: data[i][4],
        uploadedAt: formatDateTime(data[i][9])
      });
    }

    return { ok: true, attachments: attachments };

  } catch (error) {
    Logger.log(' handleListAttachments 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：一次查詢多筆申請單的附件。
 *
 * 清單畫面上每一筆記錄各打一次 listAttachments 的話，20 筆請假就是 20 次
 * Apps Script 呼叫 —— 而 Apps Script 對同一個使用者是排隊處理的，畫面會很慢。
 * 這裡讓前端把所有記錄鍵一次送上來，整張表只掃一遍。
 *
 * 參數：type、recordKeys（JSON 陣列）
 * 回傳：{ 記錄鍵: [附件...] }
 */
function handleListAttachmentsBatch(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, code: 'SESSION_INVALID', msg: '未授權或 session 已過期' };
    }

    const type = String(params.type || '').trim();
    if (!type) {
      return { ok: false, code: 'MISSING_PARAMS', msg: '缺少類型' };
    }

    let recordKeys;
    try {
      recordKeys = JSON.parse(params.recordKeys || '[]');
    } catch (error) {
      return { ok: false, code: 'INVALID_PARAMS', msg: '記錄識別格式錯誤' };
    }

    if (!Array.isArray(recordKeys) || recordKeys.length === 0) {
      return { ok: true, attachments: {} };
    }

    // 用物件當 set，查詢是 O(1)，不必對每一列跑 indexOf
    const wanted = {};
    recordKeys.forEach(key => { wanted[String(key)] = true; });

    const isAdmin = (session.user.dept === '管理員');
    const data = getAttachmentSheet_().getDataRange().getValues();
    const grouped = {};

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() !== type) continue;

      const key = String(data[i][2]).trim();
      if (!wanted[key]) continue;
      if (!isAdmin && String(data[i][3]).trim() !== session.user.userId) continue;

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        attachmentId: data[i][0],
        filename: data[i][5],
        mimeType: data[i][6],
        size: data[i][8],
        uploadedBy: data[i][4],
        uploadedAt: formatDateTime(data[i][9])
      });
    }

    return { ok: true, attachments: grouped };

  } catch (error) {
    Logger.log(' handleListAttachmentsBatch 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：取得附件內容（base64）。本人或管理員才能讀。
 */
function handleGetAttachment(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, code: 'SESSION_INVALID', msg: '未授權或 session 已過期' };
    }

    const found = findAttachmentRow_(params.attachmentId);
    if (!found) {
      return { ok: false, code: 'NOT_FOUND', msg: '找不到這個附件' };
    }

    const isAdmin = (session.user.dept === '管理員');
    if (!isAdmin && String(found.row[3]).trim() !== session.user.userId) {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '無權查看這個附件' };
    }

    const file = DriveApp.getFileById(found.row[7]);
    const blob = file.getBlob();

    return {
      ok: true,
      filename: found.row[5],
      mimeType: found.row[6],
      data: Utilities.base64Encode(blob.getBytes())
    };

  } catch (error) {
    Logger.log(' handleGetAttachment 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：刪除附件。上傳者本人或管理員可刪。
 */
function handleDeleteAttachment(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, code: 'SESSION_INVALID', msg: '未授權或 session 已過期' };
    }

    const found = findAttachmentRow_(params.attachmentId);
    if (!found) {
      return { ok: false, code: 'NOT_FOUND', msg: '找不到這個附件' };
    }

    const isAdmin = (session.user.dept === '管理員');
    if (!isAdmin && String(found.row[3]).trim() !== session.user.userId) {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '只能刪除自己上傳的附件' };
    }

    // 丟到垃圾桶而不是永久刪除，誤刪還救得回來
    try {
      DriveApp.getFileById(found.row[7]).setTrashed(true);
    } catch (error) {
      Logger.log(' 雲端硬碟檔案已不存在，只清除記錄: ' + error.message);
    }

    found.sheet.deleteRow(found.rowIndex);

    return { ok: true, msg: '附件已刪除' };

  } catch (error) {
    Logger.log(' handleDeleteAttachment 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}
