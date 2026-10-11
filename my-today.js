// 首頁「今天」卡片：今天的班、目前狀態、下一張該打的卡、今天的打卡、今天的請假、這週每天的工時。
// 資料來自後端 getMyToday（MyToday.gs）。登入後、打卡成功、送出補打卡後都會重新載入（api.js punchWithRetry）。

const MY_TODAY_WEEKDAYS = ['WEEK_MONDAY', 'WEEK_TUESDAY', 'WEEK_WEDNESDAY', 'WEEK_THURSDAY',
                           'WEEK_FRIDAY', 'WEEK_SATURDAY', 'WEEK_SUNDAY'];

let myTodayTimer = null;

/** 登入、打卡、補打卡都會叫；半秒內只發一次請求 */
function loadMyToday() {
    clearTimeout(myTodayTimer);
    myTodayTimer = setTimeout(fetchMyToday, 500);
}

async function fetchMyToday() {
    const card = document.getElementById('my-today-card');
    if (!card || !localStorage.getItem('sessionToken')) return;
    let res;
    try {
        res = await apiRequestJson('getMyToday');
    } catch (error) {
        return;   // 卡片只是輔助資訊，抓不到就維持原樣，不跳錯誤
    }
    if (!res || !res.ok) return;
    renderMyToday(res);
    card.style.display = '';
}

function myTodayPunchLabel(type) {
    return type === '上班' ? t('PUNCH_IN') : t('PUNCH_OUT');
}

function renderMyToday(d) {
    const weekdayIndex = (myTodayParseDate(d.date).getDay() + 6) % 7;
    document.getElementById('my-today-date').textContent =
        `${d.date.slice(5).replace('-', '/')}（${t(MY_TODAY_WEEKDAYS[weekdayIndex])}）`;

    // 狀態：上班中／已下班／還沒打卡
    const status = document.getElementById('my-today-status');
    if (d.onDuty) {
        status.textContent = t('MY_TODAY_ON_DUTY', { time: d.since });
        status.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    } else if (d.punches.some(p => p.status !== 'ADJUST_PENDING')) {
        status.textContent = t('MY_TODAY_OFF');
        status.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300';
    } else {
        status.textContent = t('MY_TODAY_NOT_YET');
        status.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
    }

    const shiftText = d.shift
        ? `${escapeHtml(d.shift.shiftType || '')} ${escapeHtml(d.shift.startTime)}–${escapeHtml(d.shift.endTime)}`.trim()
        : escapeHtml(t('MY_TODAY_NO_SHIFT'));
    const nextText = d.next
        ? escapeHtml(d.next === '上班' ? t('MY_TODAY_NEXT_IN') : t('MY_TODAY_NEXT_OUT'))
        : escapeHtml(t('MY_TODAY_DONE'));

    const leaveHtml = (d.leave || []).map(l =>
        `<p class="mt-3 text-sm rounded-lg px-3 py-2 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
            ${escapeHtml(t('MY_TODAY_LEAVE'))}：${escapeHtml(t(l.leaveType))} ${escapeHtml(l.start.slice(6))}–${escapeHtml(l.end.slice(6))}
        </p>`).join('');

    const punchesHtml = d.punches.length
        ? d.punches.map(p => {
            const pending = p.status === 'ADJUST_PENDING';
            const tone = pending
                ? 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800'
                : (p.type === '上班'
                    ? 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800'
                    : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800');
            return `<span class="inline-block px-2 py-1 rounded-md border text-xs ${tone}">
                        ${escapeHtml(p.time)} ${escapeHtml(myTodayPunchLabel(p.type))}${pending ? '（' + escapeHtml(t('MY_TODAY_PENDING')) + '）' : ''}
                    </span>`;
        }).join(' ')
        : `<span class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(t('MY_TODAY_NO_PUNCH'))}</span>`;

    // 這週：七根長條，最高的那天當 100%
    const maxHours = Math.max(8, ...d.week.map(w => w.hours));
    const bars = MY_TODAY_WEEKDAYS.map((weekday, i) => {
        const day = d.week[i];
        const isToday = day && day.date === d.date;
        const height = day ? Math.round((day.hours / maxHours) * 100) : 0;
        const tone = isToday ? 'bg-indigo-500 dark:bg-indigo-400' : 'bg-indigo-200 dark:bg-indigo-800';
        return `<div class="flex flex-col items-center gap-1 flex-1">
                    <span class="text-[10px] text-gray-500 dark:text-gray-400 h-3">${day && day.hours ? day.hours : ''}</span>
                    <div class="w-full max-w-[1.75rem] h-16 rounded bg-gray-100 dark:bg-gray-700 flex items-end overflow-hidden">
                        <div class="w-full rounded ${tone}" style="height: ${height}%"></div>
                    </div>
                    <span class="text-xs ${isToday ? 'font-semibold text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}">${escapeHtml(t(weekday))}</span>
                </div>`;
    }).join('');

    document.getElementById('my-today-body').innerHTML = `
        <div class="grid grid-cols-2 gap-3">
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <p class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(t('MY_TODAY_SHIFT'))}</p>
                <p class="mt-1 font-semibold text-gray-800 dark:text-white">${shiftText}</p>
            </div>
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <p class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(t('MY_TODAY_NEXT'))}</p>
                <p class="mt-1 font-semibold text-gray-800 dark:text-white">${nextText}</p>
            </div>
        </div>
        ${leaveHtml}
        <div class="mt-4">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">${escapeHtml(t('MY_TODAY_PUNCHES'))}</p>
            <div class="flex flex-wrap gap-2">${punchesHtml}</div>
        </div>
        <div class="mt-4">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                <span class="font-semibold text-gray-700 dark:text-gray-200">${escapeHtml(t('MY_TODAY_WEEK', { hours: d.weekHours }))}</span>
            </p>
            <div class="flex items-end gap-1">${bars}</div>
        </div>`;

    // 下一張該打的卡：對應的打卡按鈕加外框提示
    const nextBtn = { '上班': 'punch-in-btn', '下班': 'punch-out-btn' };
    Object.entries(nextBtn).forEach(([type, id]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const on = d.next === type;
        btn.classList.toggle('ring-4', on);
        btn.classList.toggle('ring-indigo-300', on);
        btn.classList.toggle('dark:ring-indigo-700', on);
    });
}

function myTodayParseDate(key) {
    const [y, m, day] = key.split('-').map(Number);
    return new Date(y, m - 1, day);
}
