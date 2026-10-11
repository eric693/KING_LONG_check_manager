// MyToday.gs
//
// 員工首頁的「今天」卡片：今天的班、今天打了哪些卡、下一張該打什麼、今天有沒有請假、這週做了幾小時。
// 只看自己的資料（用 token 找人，不收 userId 參數）。工時和薪資用同一套規則（PunchRules.gs）。

/**
 * API：我的今天
 * 參數：token
 */
function handleGetMyToday(params) {
  try {
    const session = checkSession_(params.token);
    if (!session.ok || !session.user) {
      return { ok: false, code: 'ERR_SESSION_INVALID', msg: '未授權或 session 已過期' };
    }
    const userId = String(session.user.userId).trim();
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

    // 這週一到週日
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(Utilities.formatDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i), tz, 'yyyy-MM-dd'));
    }

    // 排班：一週可能跨兩個月
    const shifts = {};
    [...new Set(week.map(d => d.substring(0, 7)))].forEach(month => {
      Object.assign(shifts, getEmployeeShiftMapForMonth(userId, month));
    });

    // 這週的打卡，依日期分；算工時只用有效的卡（補打卡要核准），今天的清單也列出審核中的補打卡
    const rows = getAttendanceValuesForRange_(week[0], week[6]);
    const counted = {};
    const todayList = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || String(row[1]).trim() !== userId) continue;
      const time = isDateValue_(row[0]) ? row[0] : new Date(row[0]);
      if (isNaN(time.getTime())) continue;
      const date = Utilities.formatDate(time, tz, 'yyyy-MM-dd');
      if (date < week[0] || date > week[6]) continue;
      const type = String(row[4] || '').trim();
      if (type !== '上班' && type !== '下班') continue;
      if (isCountedPunchRow_(row)) (counted[date] = counted[date] || []).push({ type: type, time: time });
      if (date === today) {
        const status = punchRowStatus_(row);
        if (status === 'ADJUST_REJECTED' || status === 'VIRTUAL') continue;
        todayList.push({ type: type, time: Utilities.formatDate(time, tz, 'HH:mm'), status: status, at: time.getTime() });
      }
    }
    Object.keys(counted).forEach(date => counted[date].sort((a, b) => a.time - b.time));
    todayList.sort((a, b) => a.at - b.at);
    todayList.forEach(p => delete p.at);

    // 下一張該打的卡（規則同 checkPunchSequence_）；兩種卡都打滿就沒有下一張
    const todayPunches = counted[today] || [];
    const last = todayPunches[todayPunches.length - 1];
    let next = last && last.type === '上班' ? '下班' : '上班';
    if (todayPunches.filter(p => p.type === next).length >= PUNCH_MAX_PER_TYPE) next = null;
    const onDuty = !!(last && last.type === '上班');

    // 這週每天的工時（到今天為止；今天還在上班中的那一段不算）
    const days = week.filter(date => date <= today).map(date => {
      const work = computeDayWorkFromPunches_(counted[date] || [], shifts[date] || null);
      return { date: date, hours: minutesToHours_(work.netMinutes) };
    });
    const weekHours = Math.round(days.reduce((sum, d) => sum + d.hours, 0) * 100) / 100;

    const shift = shifts[today] || null;
    const leave = dashboardLeaves_(today, tz).byUser[userId] || [];

    return {
      ok: true,
      date: today,
      shift: shift ? { shiftType: shift.shiftType || '', startTime: shift.startTime, endTime: shift.endTime } : null,
      punches: todayList,
      next: next,
      onDuty: onDuty,
      since: onDuty ? Utilities.formatDate(last.time, tz, 'HH:mm') : '',
      leave: leave,
      week: days,
      weekHours: weekHours
    };
  } catch (error) {
    Logger.log(' handleGetMyToday 錯誤: ' + error.message);
    return { ok: false, msg: error.toString() };
  }
}
