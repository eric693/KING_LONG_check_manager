// ShiftTemplates.gs
//
// 班別設定：班別代碼、名稱、預定上下班、跨日、休息分鐘。
//
// 餐飲業的兩頭班（例如午晚班 10:30–21:30，中間休 3 小時）用「休息分鐘」表示：
// 員工照常只打上班、下班兩次卡，工時 = 實際在店時間 − 這個班的休息分鐘。
//
// 排班時會把班別的時間與休息分鐘「複製」進那筆排班（排班表第 15 欄），
// 之後改班別設定不會回頭改到已經排好、甚至已經發薪的班。
//
// 工時的計算規則也集中在這裡（computeNetWorkMinutes_），薪資、出勤分析、LINE 查詢都用同一套：
//   有排班：扣該班的休息分鐘
//   沒排班（例如臨時來上班）：在店超過 8 小時扣 1 小時，否則不扣
//   一律算到分鐘，不再捨去到整數小時

const SHEET_SHIFT_TEMPLATES = '班別設定';

const SHIFT_TEMPLATE_HEADERS = ['班別代碼', '班別名稱', '預定上班', '預定下班', '跨日', '休息分鐘', '狀態'];

// 沒有排班的日子：在店超過這個分鐘數才扣休息
const UNSCHEDULED_BREAK_THRESHOLD_MINUTES = 8 * 60;
const UNSCHEDULED_BREAK_MINUTES = 60;

// 第一次使用時建立的班別（依店家提供的班別表）
const DEFAULT_SHIFT_TEMPLATES = [
  ['E', '午晚班1', '10:30', '21:30', '否', 180],
  ['A', '午晚班2', '11:30', '22:00', '否', 150],
  ['G', '午晚班3', '11:00', '21:30', '否', 150],
  ['F', '午班1', '10:30', '14:30', '否', 0],
  ['B', '午班2', '11:30', '15:30', '否', 0],
  ['H', '午班2', '11:00', '15:00', '否', 0],
  ['C', '晚班1', '18:00', '21:30', '否', 0],
  ['D', '晚班2', '17:00', '21:00', '否', 0],
  ['I', '晚班3', '17:30', '21:30', '否', 0],
  ['X', '休假', '', '', '否', 0]
];

function getShiftTemplateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SHIFT_TEMPLATES);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SHIFT_TEMPLATES);
    sheet.appendRow(SHIFT_TEMPLATE_HEADERS);
    DEFAULT_SHIFT_TEMPLATES.forEach(t => sheet.appendRow(t.concat(['啟用'])));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SHIFT_TEMPLATE_HEADERS.length)
         .setFontWeight('bold')
         .setBackground('#1f4e79')
         .setFontColor('#ffffff');
    Logger.log(' 已建立「班別設定」工作表');
  }

  return sheet;
}

/**
 * 儲存格的時間 → "HH:mm"；空白保持空白。
 * （formatTimeOnly 會把空白變成 "00:00"，休假這類沒有時間的班別就會被當成 24 小時）
 */
function shiftTimeText_(value) {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  return formatTimeOnly(value);
}

/** "HH:mm" → 分鐘數；空白或格式不對回傳 null */
function shiftTimeToMinutes_(value) {
  const text = shiftTimeText_(value);
  const m = String(text || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 計算一個班的總分鐘與工作分鐘。
 * 下班時間早於（或等於）上班時間時視為跨日，即使「跨日」欄沒勾。
 */
function calcShiftMinutes_(startTime, endTime, crossDay, breakMinutes) {
  const start = shiftTimeToMinutes_(startTime);
  const end = shiftTimeToMinutes_(endTime);
  if (start === null || end === null) {
    return { totalMinutes: 0, workMinutes: 0 };
  }
  let total = end - start;
  if (crossDay || total <= 0) total += 24 * 60;
  const work = Math.max(0, total - (Number(breakMinutes) || 0));
  return { totalMinutes: total, workMinutes: work };
}

function isCrossDayValue_(value) {
  return value === true || /^(是|y|yes|true|1)$/i.test(String(value || '').trim());
}

/**
 * 讀出所有班別（包含停用的；呼叫端自己過濾）
 */
function readShiftTemplates_() {
  const data = getShiftTemplateSheet_().getDataRange().getValues();
  const list = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const code = String(row[0] || '').trim();
    if (!code) continue;

    const startTime = shiftTimeText_(row[2]);
    const endTime = shiftTimeText_(row[3]);
    const crossDay = isCrossDayValue_(row[4]);
    const breakMinutes = Math.max(0, Math.round(Number(row[5]) || 0));
    const minutes = calcShiftMinutes_(startTime, endTime, crossDay, breakMinutes);

    list.push({
      code: code,
      name: String(row[1] || '').trim(),
      startTime: startTime,
      endTime: endTime,
      crossDay: crossDay,
      breakMinutes: breakMinutes,
      totalMinutes: minutes.totalMinutes,
      workMinutes: minutes.workMinutes,
      workHours: Math.round(minutes.workMinutes / 60 * 100) / 100,
      active: String(row[6] || '啟用').trim() !== '停用'
    });
  }

  return list;
}

/**
 * 用代碼或名稱找班別（批次上傳、舊資料都可能只寫其中一種）。
 * 代碼優先，因為名稱可能重複（例如兩個「午班2」）。
 */
function findShiftTemplate_(value, templates) {
  const key = String(value || '').trim();
  if (!key) return null;
  const list = templates || readShiftTemplates_();
  const upper = key.toUpperCase();
  return list.find(t => t.code.toUpperCase() === upper) ||
         list.find(t => t.name === key) ||
         null;
}

/**
 * 實際在店分鐘數 → 淨工作分鐘數
 *
 * @param {number} spanMinutes 第一次上班卡到最後一次下班卡
 * @param {Object|null} shift  當天的排班（getEmployeeShiftMapForMonth 的項目），沒有排班傳 null
 */
function computeNetWorkMinutes_(spanMinutes, shift) {
  if (!(spanMinutes > 0)) return 0;

  let breakMinutes;
  if (shift && shift.breakMinutes !== null && shift.breakMinutes !== undefined && shift.breakMinutes !== '') {
    breakMinutes = Number(shift.breakMinutes) || 0;
  } else {
    // 沒有排班，或是舊的排班沒有記錄休息時間
    breakMinutes = spanMinutes > UNSCHEDULED_BREAK_THRESHOLD_MINUTES ? UNSCHEDULED_BREAK_MINUTES : 0;
  }

  return Math.max(0, spanMinutes - breakMinutes);
}

/** 分鐘 → 小時，四捨五入到小數兩位（7 小時 50 分 = 7.83） */
function minutesToHours_(minutes) {
  return Math.round((Number(minutes) || 0) / 60 * 100) / 100;
}

// ==================== API ====================

/**
 * API：取得班別設定（登入即可；排班、查詢畫面都要用）
 */
function handleGetShiftTemplates(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, code: 'ERR_SESSION_INVALID', msg: '未授權或 session 已過期' };
    }
    return { ok: true, templates: readShiftTemplates_() };
  } catch (error) {
    Logger.log(' handleGetShiftTemplates 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}

/**
 * API：儲存整份班別設定（僅管理員；休息分鐘會影響薪資）
 * 參數：templates（JSON 陣列，每項 { code, name, startTime, endTime, crossDay, breakMinutes, active }）
 */
function handleSaveShiftTemplates(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user || session.user.dept !== '管理員') {
      return { ok: false, code: 'PERMISSION_DENIED', msg: '需要管理員權限' };
    }

    let input;
    try {
      input = JSON.parse(params.templates || '[]');
    } catch (error) {
      return { ok: false, code: 'SHIFT_TEMPLATE_INVALID', msg: '班別資料格式錯誤' };
    }
    if (!Array.isArray(input)) {
      return { ok: false, code: 'SHIFT_TEMPLATE_INVALID', msg: '班別資料格式錯誤' };
    }
    if (input.length > 100) {
      return { ok: false, code: 'SHIFT_TEMPLATE_INVALID', msg: '班別最多 100 個' };
    }

    const seen = {};
    const rows = [];
    for (let i = 0; i < input.length; i++) {
      const t = input[i] || {};
      const code = String(t.code || '').trim();
      const name = String(t.name || '').trim();
      const label = `第 ${i + 1} 列`;

      if (!code || code.length > 10 || /[<>]/.test(code)) {
        return { ok: false, code: 'SHIFT_TEMPLATE_CODE', msg: `${label}：班別代碼要填，最多 10 個字` };
      }
      if (seen[code.toUpperCase()]) {
        return { ok: false, code: 'SHIFT_TEMPLATE_DUPLICATE', msg: `${label}：班別代碼「${code}」重複了` };
      }
      seen[code.toUpperCase()] = true;
      if (!name || name.length > 30 || /[<>]/.test(name)) {
        return { ok: false, code: 'SHIFT_TEMPLATE_NAME', msg: `${label}：班別名稱要填，最多 30 個字` };
      }

      const start = String(t.startTime || '').trim();
      const end = String(t.endTime || '').trim();
      // 休假這類班別可以不填時間；有填就兩個都要填
      if ((start || end) && (shiftTimeToMinutes_(start) === null || shiftTimeToMinutes_(end) === null)) {
        return { ok: false, code: 'SHIFT_TEMPLATE_TIME', msg: `${label}：上下班時間格式要是 HH:mm` };
      }

      const breakMinutes = Number(t.breakMinutes || 0);
      if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 720) {
        return { ok: false, code: 'SHIFT_TEMPLATE_BREAK', msg: `${label}：休息分鐘要是 0～720 的整數` };
      }
      const crossDay = isCrossDayValue_(t.crossDay);
      if (start && breakMinutes >= calcShiftMinutes_(start, end, crossDay, 0).totalMinutes) {
        return { ok: false, code: 'SHIFT_TEMPLATE_BREAK', msg: `${label}：休息時間不能比整個班還長` };
      }

      rows.push([code, name, start, end, crossDay ? '是' : '否', breakMinutes, t.active === false ? '停用' : '啟用']);
    }

    const sheet = getShiftTemplateSheet_();
    const last = sheet.getLastRow();
    if (last > 1) sheet.deleteRows(2, last - 1);
    if (rows.length) sheet.getRange(2, 1, rows.length, SHIFT_TEMPLATE_HEADERS.length).setValues(rows);

    return { ok: true, templates: readShiftTemplates_() };

  } catch (error) {
    Logger.log(' handleSaveShiftTemplates 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}
