// PunchRules.gs
//
// 一天最多打兩組上下班卡：上班 → 下班（開始休息）→ 上班（休息結束）→ 下班。
// 餐飲業兩頭班休息前要打卡，所以同一天可以有兩次上班、兩次下班。
//
// 網頁打卡、LINE 打卡、QR／平板打卡都用 checkPunchSequence_ 檢查，規則一致：
//   ・同一種卡不能連續打（上一次是上班，這次就要打下班）
//   ・上班、下班各最多 PUNCH_MAX_PER_TYPE 次
//
// 工時也在這裡配對（computeDayWorkFromPunches_）：
//   ・兩段以上：各段實際工作時間相加（休息時間已經由打卡扣掉）
//   ・只有一段：套用班別的休息分鐘（見 ShiftTemplates.gs 的 computeNetWorkMinutes_），
//     但扣的量不超過「超出該班應工作時數」的部分 —— 兩頭班只上了午段就走，不會被多扣 3 小時

const PUNCH_MAX_PER_TYPE = 2;

// 給前端翻譯用的鍵（i18n 的 t() 會把參數值也翻譯一次）
const PUNCH_TYPE_KEYS = { '上班': 'PUNCH_IN', '下班': 'PUNCH_OUT' };

function otherPunchType_(type) {
  return type === '上班' ? '下班' : '上班';
}

/** 這一列打卡算不算數：一般打卡，或是已核准的補打卡 */
function isCountedPunchRow_(row) {
  const note = String(row[7] || '').trim();
  if (note === '系統虛擬卡') return false;
  if (note === '補打卡') return String(row[8] || '').trim() === 'v';
  return true;
}

/**
 * 某位員工某一天、依時間排序的有效打卡
 * @param {Array} [rows] 打卡紀錄整張表（已經讀過就傳進來，避免再讀一次）
 * @returns {Array<{type: string, time: Date}>}
 */
function getDayPunches_(userId, dateStr, rows) {
  const tz = Session.getScriptTimeZone();
  const data = rows || SpreadsheetApp.getActive().getSheetByName(SHEET_ATTENDANCE).getDataRange().getValues();
  const list = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || String(row[1]).trim() !== String(userId).trim()) continue;
    const time = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (isNaN(time.getTime())) continue;
    if (Utilities.formatDate(time, tz, 'yyyy-MM-dd') !== dateStr) continue;
    if (!isCountedPunchRow_(row)) continue;
    const type = String(row[4] || '').trim();
    if (type !== '上班' && type !== '下班') continue;
    list.push({ type: type, time: time });
  }

  list.sort((a, b) => a.time - b.time);
  return list;
}

/**
 * 能不能打這種卡。通過回傳 { ok: true }；不行回傳前端可以直接顯示的錯誤。
 */
function checkPunchSequence_(userId, type, rows) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const punches = getDayPunches_(userId, today, rows);
  const next = otherPunchType_(type);

  const last = punches[punches.length - 1];
  if (last && last.type === type) {
    return {
      ok: false,
      code: 'ERR_PUNCH_SAME_TYPE',
      params: { type: PUNCH_TYPE_KEYS[type], next: PUNCH_TYPE_KEYS[next] },
      msg: `剛才已經打過${type}卡，下一次請打${next}卡`
    };
  }

  const count = punches.filter(p => p.type === type).length;
  if (count >= PUNCH_MAX_PER_TYPE) {
    return {
      ok: false,
      code: 'ERR_PUNCH_LIMIT',
      params: { type: PUNCH_TYPE_KEYS[type] },
      msg: `今天的${type}卡已經打滿 ${PUNCH_MAX_PER_TYPE} 次`
    };
  }

  return { ok: true, count: count + 1 };
}

/** LINE 傳位置訊息打卡時，該打哪一種：上一次是上班就打下班，否則打上班 */
function nextPunchType_(userId, rows) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const punches = getDayPunches_(userId, today, rows);
  const last = punches[punches.length - 1];
  return last && last.type === '上班' ? '下班' : '上班';
}

/**
 * 把一天的打卡配成「上班 → 下班」的工作段
 * @param {Array<{type: string, time: Date}>} punches 已依時間排序
 * @returns {{ segments: Array<{start: Date, end: Date, minutes: number}>, unpaired: number }}
 */
function pairPunchSegments_(punches) {
  const segments = [];
  let open = null;
  let unpaired = 0;

  punches.forEach(p => {
    if (p.type === '上班') {
      if (open) unpaired++;       // 連續兩次上班：以第一次為準
      else open = p.time;
    } else {
      if (open) {
        segments.push({ start: open, end: p.time, minutes: Math.max(0, Math.round((p.time - open) / 60000)) });
        open = null;
      } else {
        unpaired++;               // 沒有上班就下班
      }
    }
  });
  if (open) unpaired++;           // 最後忘了打下班

  return { segments: segments, unpaired: unpaired };
}

/**
 * 一天的淨工作分鐘
 * @param {Array<{type: string, time: Date}>} punches 已依時間排序
 * @param {Object|null} shift 當天排班（getEmployeeShiftMapForMonth 的項目）
 */
function computeDayWorkFromPunches_(punches, shift) {
  const paired = pairPunchSegments_(punches);
  const segments = paired.segments;
  const total = segments.reduce((sum, s) => sum + s.minutes, 0);

  let netMinutes;
  if (segments.length >= 2) {
    // 有打休息卡：休息時間已經不在工作段裡
    netMinutes = total;
  } else if (segments.length === 1) {
    const span = segments[0].minutes;
    const hasScheduledBreak = shift && shift.breakMinutes !== null && shift.breakMinutes !== undefined &&
                              shift.breakMinutes !== '' && Number(shift.breakMinutes) > 0;
    if (hasScheduledBreak) {
      // 兩頭班卻沒打休息卡：補扣休息，但最多只扣到「該班應工作時數」為止
      const breakMinutes = Number(shift.breakMinutes);
      const scheduled = (typeof calcShiftMinutes_ === 'function')
        ? calcShiftMinutes_(shift.startTime, shift.endTime, false, breakMinutes)
        : { workMinutes: 0 };
      const excess = scheduled.workMinutes > 0 ? Math.max(0, span - scheduled.workMinutes) : breakMinutes;
      netMinutes = span - Math.min(breakMinutes, excess);
    } else {
      netMinutes = computeNetWorkMinutes_(span, shift);
    }
  } else {
    netMinutes = 0;
  }

  const fmt = d => Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm');
  return {
    netMinutes: Math.max(0, netMinutes),
    segments: segments.map(s => ({ start: fmt(s.start), end: fmt(s.end), minutes: s.minutes })),
    unpaired: paired.unpaired
  };
}

// ==================== 打卡失敗紀錄 ====================
//
// 打卡失敗時員工只看到一句訊息，管理員事後無從查起。每一次失敗都記一筆：
// 誰、用什麼方式、什麼時候、錯誤代碼與原因（含系統錯誤的詳細內容）。

const SHEET_PUNCH_FAILURES = '打卡失敗紀錄';
const PUNCH_FAILURE_HEADERS = ['時間', '員工ID', '姓名', '方式', '打卡類別', '錯誤代碼', '錯誤訊息', '詳細'];

function logPunchFailure_(info) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_PUNCH_FAILURES);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_PUNCH_FAILURES);
      sheet.appendRow(PUNCH_FAILURE_HEADERS);
      sheet.setFrozenRows(1);
    }
    let name = info.name || '';
    if (!name && info.userId && typeof getEmployeeNameMap_ === 'function') {
      name = getEmployeeNameMap_()[info.userId] || '';
    }
    sheet.appendRow([
      new Date(), info.userId || '', name, info.method || '', info.type || '',
      info.code || '', String(info.msg || '').slice(0, 300), String(info.detail || '').slice(0, 300)
    ]);
  } catch (error) {
    // 記錄失敗不能影響打卡本身的回應
    Logger.log('打卡失敗紀錄寫入失敗: ' + error);
  }
}

/** LINE 打卡連結：清掉過期很久的（沒被點開的連結會一直留在指令碼屬性裡） */
function cleanupLinePunchTokens_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    const cutoff = Date.now() - 60 * 60 * 1000;
    Object.keys(all).forEach(key => {
      if (key.indexOf('LPT_') !== 0) return;
      try {
        if ((JSON.parse(all[key]).expiry || 0) < cutoff) props.deleteProperty(key);
      } catch (error) {
        props.deleteProperty(key);
      }
    });
  } catch (error) {
    Logger.log('清理 LINE 打卡連結失敗: ' + error);
  }
}
