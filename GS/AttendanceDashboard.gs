// AttendanceDashboard.gs
//
// 管理員頁的「即時出勤數據」：選一天，看那天
//   上班打卡（已到／應到）、未打卡、遲到、請假、下班打卡、加班
// 每一格都附名單，點開就知道是誰。
//
// 應到的人：
//   ・這個月有在用排班 → 那天有排班的在職員工
//   ・這個月完全沒排班 → 全部在職員工（畫面上會註明）
// 未打卡 = 應到 − 已打上班卡 − 當天有核准請假
// 遲到   = 當天第一張上班卡晚於排班上班時間（沒排班的人不算遲到）
// 補打卡只算已核准的；請假、加班只算已核准的，待審核的另外回報筆數。

const EMPLOYEE_INACTIVE_STATUSES = ['離職', '停用'];

/** 在職員工：{ userId: { name, role } }（員工名單 A ID、C 姓名、F 權限、H 狀態、I 鎖定姓名） */
function dashboardActiveEmployees_() {
  const values = getSheetValues_(SHEET_EMPLOYEES);
  const map = {};
  for (let i = 1; i < values.length; i++) {
    const userId = String(values[i][0] || '').trim();
    if (!userId) continue;
    if (EMPLOYEE_INACTIVE_STATUSES.indexOf(String(values[i][7] || '').trim()) !== -1) continue;
    map[userId] = {
      name: String(values[i][8] || values[i][2] || '').trim(),
      role: String(values[i][5] || '').trim()
    };
  }
  return map;
}

/** 當天的排班 { userId: { shiftType, startTime, endTime } }，以及這個月有沒有任何排班 */
function dashboardShifts_(date) {
  const data = getSheetValues_('排班表');
  const month = date.substring(0, 7);
  const byUser = {};
  let monthHasShifts = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][13] === '已刪除') continue;
    const shiftDate = formatDateOnly(data[i][3]);
    if (!shiftDate || shiftDate.substring(0, 7) !== month) continue;
    monthHasShifts = true;
    if (shiftDate !== date) continue;
    const userId = String(data[i][1] || '').trim();
    if (!userId || byUser[userId]) continue;   // 同一天多筆以第一筆為準，和薪資計算一致
    // formatTimeOnly 把空白當 00:00，沒填時間的班就留空，才不會人人都算遲到
    const timeOrBlank = v => (v === '' || v === null || v === undefined) ? '' : formatTimeOnly(v);
    byUser[userId] = {
      shiftType: String(data[i][4] || ''),
      startTime: timeOrBlank(data[i][5]),
      endTime: timeOrBlank(data[i][6])
    };
  }
  return { byUser: byUser, monthHasShifts: monthHasShifts };
}

/** 當天每個人的第一張上班卡、最後一張下班卡（HH:mm） */
function dashboardPunches_(date, tz) {
  const data = getAttendanceValuesForRange_(date, date);
  const byUser = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const time = isDateValue_(row[PUNCH_COL.time]) ? row[PUNCH_COL.time] : new Date(row[PUNCH_COL.time]);
    if (!row[PUNCH_COL.time] || isNaN(time.getTime())) continue;
    if (Utilities.formatDate(time, tz, 'yyyy-MM-dd') !== date) continue;
    const status = punchRowStatus_(row);
    if (status === 'ADJUST_PENDING' || status === 'ADJUST_REJECTED') continue;

    const userId = String(row[PUNCH_COL.userId] || '').trim();
    const type = String(row[PUNCH_COL.type] || '').trim();
    const hhmm = Utilities.formatDate(time, tz, 'HH:mm');
    const day = byUser[userId] || (byUser[userId] = { firstIn: null, lastOut: null, name: String(row[PUNCH_COL.name] || '') });
    if (type === '上班' && (!day.firstIn || hhmm < day.firstIn)) day.firstIn = hhmm;
    if (type === '下班' && (!day.lastOut || hhmm > day.lastOut)) day.lastOut = hhmm;
  }
  return byUser;
}

/** 當天有重疊的請假：核准的 { userId: [{ leaveType, start, end }] }，另回報待審核筆數 */
function dashboardLeaves_(date, tz) {
  const data = getLeaveRecordsSheet().getDataRange().getValues();
  const dayStart = parsePunchDateTime_(date, '00:00');
  const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
  const byUser = {};
  let pending = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const userId = String(row[1] || '').trim();
    if (!userId) continue;
    const from = isDateValue_(row[5]) ? row[5] : new Date(row[5]);
    const to = isDateValue_(row[6]) ? row[6] : new Date(row[6]);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < dayStart || from > dayEnd) continue;
    const status = String(row[10] || '').trim().toUpperCase();
    if (status === 'PENDING') pending++;
    if (status !== 'APPROVED') continue;
    (byUser[userId] = byUser[userId] || []).push({
      leaveType: String(row[4] || ''),
      start: Utilities.formatDate(from, tz, 'MM-dd HH:mm'),
      end: Utilities.formatDate(to, tz, 'MM-dd HH:mm')
    });
  }
  return { byUser: byUser, pending: pending };
}

/** 當天的加班：核准的 { userId: [{ startTime, endTime, hours }] }，另回報待審核筆數 */
function dashboardOvertime_(date, tz) {
  const data = initOvertimeSheet().getDataRange().getValues();
  const byUser = {};
  let pending = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const userId = String(row[1] || '').trim();
    if (!userId) continue;
    const rowDate = isDateValue_(row[3]) ? Utilities.formatDate(row[3], tz, 'yyyy-MM-dd') : String(row[3] || '').substring(0, 10);
    if (rowDate !== date) continue;
    const status = String(row[9] || '').trim().toLowerCase();
    if (status === 'pending') pending++;
    if (status !== 'approved') continue;
    (byUser[userId] = byUser[userId] || []).push({
      startTime: overtimeTimeText_(row[4], tz),
      endTime: overtimeTimeText_(row[5], tz),
      hours: Number(row[6]) || 0
    });
  }
  return { byUser: byUser, pending: pending };
}

function dashboardMinutes_(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * API：某一天的出勤總覽（僅管理員）
 * 參數：date（yyyy-MM-dd，省略 = 今天）
 */
function handleAdminDailyAttendance(params) {
  try {
    const admin = requireRecordsAdmin_(params.token);
    if (!admin.ok) return admin;

    const tz = Session.getScriptTimeZone();
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const date = String(params.date || today).trim();
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parsePunchDateTime_(date, '00:00') : null;
    // new Date 會把 2026-13-40 進位成別的日子，換回字串對不上就是不存在的日期
    if (!parsed || Utilities.formatDate(parsed, tz, 'yyyy-MM-dd') !== date) {
      return { ok: false, code: 'RECORDS_DATE', msg: '日期格式不正確' };
    }
    const nowMinutes = dashboardMinutes_(Utilities.formatDate(new Date(), tz, 'HH:mm'));

    const employees = dashboardActiveEmployees_();
    const shifts = dashboardShifts_(date);
    const punches = dashboardPunches_(date, tz);
    const leaves = dashboardLeaves_(date, tz);
    const overtime = dashboardOvertime_(date, tz);

    const nameOf = id => (employees[id] && employees[id].name) || (punches[id] && punches[id].name) || id;
    const byName = (a, b) => a.name.localeCompare(b.name);

    // 在職人數，依薪資類型分
    const salaryTypes = {};
    (typeof listPayableEmployees_ === 'function' ? listPayableEmployees_() : []).forEach(e => {
      salaryTypes[e.employeeId] = e.salaryType;
    });
    const activeIds = Object.keys(employees);
    const byType = {};
    activeIds.forEach(id => {
      const type = salaryTypes[id] || '';
      byType[type] = (byType[type] || 0) + 1;
    });

    // 應到
    const expectedIds = shifts.monthHasShifts
      ? activeIds.filter(id => shifts.byUser[id])
      : activeIds;

    const clockedIn = Object.keys(punches).filter(id => punches[id].firstIn)
      .map(id => ({ userId: id, name: nameOf(id), time: punches[id].firstIn,
                    shift: shifts.byUser[id] ? shifts.byUser[id].startTime : '' }))
      .sort((a, b) => a.time.localeCompare(b.time));

    const clockedOut = Object.keys(punches).filter(id => punches[id].lastOut)
      .map(id => ({ userId: id, name: nameOf(id), time: punches[id].lastOut,
                    shift: shifts.byUser[id] ? shifts.byUser[id].endTime : '' }))
      .sort((a, b) => a.time.localeCompare(b.time));

    const onLeave = Object.keys(leaves.byUser)
      .map(id => ({ userId: id, name: nameOf(id), items: leaves.byUser[id] }))
      .sort(byName);

    // 未來的日子還不能算「沒打卡」
    const notPunched = date > today ? [] : expectedIds
      .filter(id => !(punches[id] && punches[id].firstIn) && !leaves.byUser[id])
      .map(id => {
        const shift = shifts.byUser[id];
        const start = shift ? dashboardMinutes_(shift.startTime) : null;
        return {
          userId: id,
          name: nameOf(id),
          shift: shift ? shift.startTime + '-' + shift.endTime : '',
          // 今天還沒到上班時間的，畫面上另外標示
          notStartedYet: date === today && start !== null && nowMinutes < start
        };
      })
      .sort((a, b) => (a.shift || '99').localeCompare(b.shift || '99') || a.name.localeCompare(b.name));

    const late = [];
    Object.keys(punches).forEach(id => {
      const shift = shifts.byUser[id];
      if (!shift || !punches[id].firstIn) return;
      const scheduled = dashboardMinutes_(shift.startTime);
      const actual = dashboardMinutes_(punches[id].firstIn);
      if (scheduled === null || actual === null) return;
      const minutes = actual - scheduled;
      if (minutes <= 0 || minutes > 12 * 60) return;   // 準時，或跨日班的早到
      late.push({ userId: id, name: nameOf(id), time: punches[id].firstIn, shift: shift.startTime, minutes: minutes });
    });
    late.sort((a, b) => b.minutes - a.minutes);

    const overtimeList = Object.keys(overtime.byUser)
      .map(id => ({ userId: id, name: nameOf(id), items: overtime.byUser[id] }))
      .sort(byName);

    return {
      ok: true,
      date: date,
      today: today,
      usesShifts: shifts.monthHasShifts,
      activeCount: activeIds.length,
      bySalaryType: byType,
      expectedCount: expectedIds.length,
      clockedIn: clockedIn,
      notPunched: notPunched,
      late: late,
      onLeave: onLeave,
      clockedOut: clockedOut,
      overtime: overtimeList,
      pendingLeaves: leaves.pending,
      pendingOvertime: overtime.pending
    };
  } catch (error) {
    Logger.log(' handleAdminDailyAttendance 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}
