// AttendanceArchive.gs
//
// 打卡紀錄會一直長大，而打卡、查出勤、算薪資每次都整張讀進來，表越大越慢。
// 每月把「上個月以前」的打卡搬到按年份分的封存分頁（打卡紀錄_2026），
// 主表只留上個月和這個月，打卡時讀的資料量就固定很小。
//
// 查某段日期（報表、薪資、資料管理）用 getAttendanceValuesForRange_ / forEachAttendanceSheet_，
// 日期早於封存點才會去讀封存分頁。封存點記在指令碼屬性 ATTENDANCE_ARCHIVED_BEFORE。
//
// 安裝：在 Apps Script 編輯器執行一次 installAttendanceArchiveTrigger()（每月 2 日凌晨 3 點自動封存），
// 想馬上封存就直接執行 archiveOldAttendance()。

const ATTENDANCE_ARCHIVE_PREFIX = '打卡紀錄_';
const ATTENDANCE_ARCHIVED_BEFORE_KEY = 'ATTENDANCE_ARCHIVED_BEFORE';

/** 封存點 yyyy-MM-dd：這天以前的打卡都在封存分頁；還沒封存過回傳 '' */
function attendanceArchivedBefore_() {
  return PropertiesService.getScriptProperties().getProperty(ATTENDANCE_ARCHIVED_BEFORE_KEY) || '';
}

function isAttendanceSheetName_(name) {
  return name === SHEET_ATTENDANCE || new RegExp('^' + ATTENDANCE_ARCHIVE_PREFIX + '\\d{4}$').test(String(name || ''));
}

/**
 * 涵蓋 [startKey, endKey]（yyyy-MM-dd）要讀的每一張打卡表，依序呼叫 fn(sheetName, values)。
 * 主表一定讀；日期早於封存點時，再讀那幾年的封存分頁。
 */
function forEachAttendanceSheet_(startKey, endKey, fn) {
  fn(SHEET_ATTENDANCE, getSheetValues_(SHEET_ATTENDANCE));
  const before = attendanceArchivedBefore_();
  if (!before || startKey >= before) return;
  const lastYear = Number((endKey < before ? endKey : before).slice(0, 4));
  for (let year = Number(startKey.slice(0, 4)); year <= lastYear; year++) {
    const values = getSheetValues_(ATTENDANCE_ARCHIVE_PREFIX + year);
    if (values.length > 1) fn(ATTENDANCE_ARCHIVE_PREFIX + year, values);
  }
}

/** 同上，合成一張（第 0 列是主表的標題），給只需要讀的地方用 */
function getAttendanceValuesForRange_(startKey, endKey) {
  let merged = null;
  forEachAttendanceSheet_(startKey, endKey, (name, values) => {
    merged = merged ? merged.concat(values.slice(1)) : values;
  });
  return merged || [];
}

/** yyyy-MM → [當月第一天, 當月最後可能的日期]，給上面兩個函式用 */
function attendanceMonthRange_(yearMonth) {
  return [yearMonth + '-01', yearMonth + '-31'];
}

/**
 * 把上個月以前的打卡搬到封存分頁。每月觸發一次；手動執行也安全（沒東西可搬就什麼都不做）。
 */
function archiveOldAttendance() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1);   // 保留上個月和這個月
    const cutoffKey = Utilities.formatDate(cutoff, tz, 'yyyy-MM-dd');

    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEET_ATTENDANCE);
    const values = sheet.getDataRange().getValues();
    const header = values[0];
    const byYear = {};
    const rowsToDelete = [];

    for (let i = 1; i < values.length; i++) {
      const raw = values[i][0];
      if (!raw) continue;
      const time = isDateValue_(raw) ? raw : new Date(raw);
      if (isNaN(time.getTime()) || time >= cutoff) continue;
      const year = Utilities.formatDate(time, tz, 'yyyy');
      (byYear[year] = byYear[year] || []).push(values[i]);
      rowsToDelete.push(i + 1);
    }

    // 先寫進封存分頁，寫完才從主表刪，中途出錯也不會掉資料（最多重複一份）
    Object.keys(byYear).forEach(year => {
      const name = ATTENDANCE_ARCHIVE_PREFIX + year;
      let archive = ss.getSheetByName(name);
      if (!archive) {
        archive = ss.insertSheet(name);
        archive.getRange(1, 1, 1, header.length).setValues([header]);
        archive.setFrozenRows(1);
        archive.getRange('A:A').setNumberFormat('yyyy/MM/dd HH:mm:ss');
      }
      const rows = byYear[year].sort((a, b) => new Date(a[0]) - new Date(b[0]));
      archive.getRange(archive.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);
    });

    // 主表全部都要搬走時留一列空白：凍結標題後不能把其他列刪光
    if (rowsToDelete.length && rowsToDelete.length === values.length - 1) {
      sheet.insertRowAfter(sheet.getLastRow());
    }
    // 從下往上刪連續的區段，列號才不會跑掉
    for (let end = rowsToDelete.length - 1; end >= 0;) {
      let start = end;
      while (start > 0 && rowsToDelete[start - 1] === rowsToDelete[start] - 1) start--;
      sheet.deleteRows(rowsToDelete[start], end - start + 1);
      end = start - 1;
    }

    // 封存點只會往後移
    if (cutoffKey > attendanceArchivedBefore_()) {
      PropertiesService.getScriptProperties().setProperty(ATTENDANCE_ARCHIVED_BEFORE_KEY, cutoffKey);
    }
    Logger.log(`打卡紀錄封存：搬了 ${rowsToDelete.length} 筆，${cutoffKey} 以前都在封存分頁`);
    return { ok: true, moved: rowsToDelete.length, archivedBefore: attendanceArchivedBefore_() };
  } finally {
    lock.releaseLock();
  }
}

/** 在編輯器執行一次：每月 2 日凌晨 3 點自動封存（重複執行不會裝兩個） */
function installAttendanceArchiveTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'archiveOldAttendance')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('archiveOldAttendance').timeBased().onMonthDay(2).atHour(3).create();
  Logger.log('已設定：每月 2 日凌晨 3 點封存打卡紀錄');
}

/** 健康檢查用：有沒有裝每月封存的觸發器 */
function hasAttendanceArchiveTrigger_() {
  try {
    return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'archiveOldAttendance');
  } catch (error) {
    return null;   // 還沒授權觸發器權限：不能讓健康檢查整個失敗
  }
}
