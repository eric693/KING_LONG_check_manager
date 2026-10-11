// 管理員頁「即時出勤數據」：一週的日期列 + 六格統計（上班打卡、未打卡、遲到、請假、下班打卡、加班），
// 點一格就在下面列出是誰。資料來自後端 adminDailyAttendance（AttendanceDashboard.gs）。

let attDashDate = null;      // 選中的日期 yyyy-MM-dd
let attDashData = null;      // 最近一次的回應
let attDashTile = 'notPunched';
let attDashRequest = 0;      // 快速切換日期時只採用最後一次的回應

const ATT_DASH_WEEKDAYS = ['WEEK_MONDAY', 'WEEK_TUESDAY', 'WEEK_WEDNESDAY', 'WEEK_THURSDAY',
                           'WEEK_FRIDAY', 'WEEK_SATURDAY', 'WEEK_SUNDAY'];

function attDashKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function attDashParse(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function attDashAddDays(key, days) {
    const date = attDashParse(key);
    date.setDate(date.getDate() + days);
    return attDashKey(date);
}

function initAttendanceDashboard() {
    if (!document.getElementById('att-dash-card')) return;
    if (!attDashDate) attDashDate = attDashKey(new Date());
    renderAttDashWeek();
    loadAttendanceDashboard();
}

function attDashShiftWeek(direction) {
    attDashDate = attDashAddDays(attDashDate, direction * 7);
    renderAttDashWeek();
    loadAttendanceDashboard();
}

function attDashSelectDate(key) {
    attDashDate = key;
    renderAttDashWeek();
    loadAttendanceDashboard();
}

function attDashGoToday() {
    attDashSelectDate(attDashKey(new Date()));
}

/** 選中日期所在的那一週（週一到週日） */
function renderAttDashWeek() {
    const container = document.getElementById('att-dash-week');
    if (!container) return;
    const selected = attDashParse(attDashDate);
    const monday = attDashAddDays(attDashDate, -((selected.getDay() + 6) % 7));
    const today = attDashKey(new Date());

    container.innerHTML = ATT_DASH_WEEKDAYS.map((weekday, i) => {
        const key = attDashAddDays(monday, i);
        const isSelected = key === attDashDate;
        const isToday = key === today;
        const tone = isSelected
            ? 'bg-indigo-600 text-white dark:bg-indigo-500'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600';
        return `<button type="button" onclick="attDashSelectDate('${key}')"
                    class="flex flex-col items-center py-2 rounded-lg transition-colors ${tone}">
                    <span class="text-xs">${escapeHtml(t(weekday))}</span>
                    <span class="text-base font-semibold">${Number(key.slice(8))}</span>
                    <span class="w-1 h-1 mt-0.5 rounded-full ${isToday ? (isSelected ? 'bg-white' : 'bg-indigo-500') : 'bg-transparent'}"></span>
                </button>`;
    }).join('');

    const label = document.getElementById('att-dash-date-label');
    if (label) label.textContent = attDashDate;
}

async function loadAttendanceDashboard() {
    const tiles = document.getElementById('att-dash-tiles');
    const detail = document.getElementById('att-dash-detail');
    if (!tiles) return;
    const requestId = ++attDashRequest;
    tiles.classList.add('opacity-50');

    let res;
    try {
        res = await callApifetch(`adminDailyAttendance&date=${encodeURIComponent(attDashDate)}`, 'att-dash-loading');
    } catch (error) {
        res = { ok: false, msg: error.message };
    }
    if (requestId !== attDashRequest) return;
    tiles.classList.remove('opacity-50');

    // 舊版後端沒有這支 API、或回應不完整，都當成載入失敗
    const complete = res && res.ok && ['clockedIn', 'notPunched', 'late', 'onLeave', 'clockedOut', 'overtime']
        .every(key => Array.isArray(res[key]));
    if (!complete) {
        attDashData = null;
        tiles.innerHTML = '';
        document.getElementById('att-dash-summary').innerHTML = '';
        detail.innerHTML = `<p class="text-sm text-red-600 dark:text-red-400">${escapeHtml(t('ATT_DASH_LOAD_FAILED', { msg: (res && (res.msg || res.code)) || '' }))}</p>`;
        return;
    }
    attDashData = res;
    renderAttDashSummary();
    renderAttDashTiles();
    renderAttDashDetail();
}

function attDashSalaryTypeLabel(type) {
    if (type === '月薪') return t('SALARY_TYPE_MONTHLY');
    if (type === '時薪') return t('SALARY_TYPE_HOURLY');
    return type || t('ATT_DASH_SALARY_UNSET');
}

function renderAttDashSummary() {
    const el = document.getElementById('att-dash-summary');
    const d = attDashData;
    const types = Object.keys(d.bySalaryType || {})
        .sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || d.bySalaryType[b] - d.bySalaryType[a])
        .map(type => `${escapeHtml(attDashSalaryTypeLabel(type))} ${d.bySalaryType[type]}`);
    const parts = [`<span class="font-medium text-gray-700 dark:text-gray-200">${escapeHtml(t('ATT_DASH_ACTIVE', { n: d.activeCount }))}</span>`];
    if (types.length) parts.push(types.join('　'));
    let html = parts.join('<span class="mx-2 text-gray-300 dark:text-gray-600">|</span>');
    if (!d.usesShifts) {
        html += `<p class="mt-1 text-amber-600 dark:text-amber-400">${escapeHtml(t('ATT_DASH_NO_SHIFTS'))}</p>`;
    }
    if (d.date > d.today) {
        html += `<p class="mt-1 text-gray-500 dark:text-gray-400">${escapeHtml(t('ATT_DASH_FUTURE'))}</p>`;
    }
    el.innerHTML = html;
}

function attDashTiles() {
    const d = attDashData;
    return [
        { id: 'clockedIn', label: 'ATT_DASH_CLOCK_IN', highlight: true,
          value: `${d.clockedIn.length}<span class="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">${escapeHtml(t('ATT_DASH_ARRIVED'))}</span>`
               + `<span class="text-gray-400 mx-1">/</span>${d.expectedCount}<span class="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">${escapeHtml(t('ATT_DASH_EXPECTED'))}</span>` },
        { id: 'notPunched', label: 'ATT_DASH_NOT_PUNCHED', value: d.notPunched.length, alert: d.notPunched.some(p => !p.notStartedYet) },
        { id: 'late', label: 'ATT_DASH_LATE', value: d.late.length, alert: d.late.length > 0 },
        { id: 'onLeave', label: 'ATT_DASH_LEAVE', value: d.onLeave.length },
        { id: 'clockedOut', label: 'ATT_DASH_CLOCK_OUT', highlight: true, value: d.clockedOut.length },
        { id: 'overtime', label: 'ATT_DASH_OVERTIME', value: d.overtime.length }
    ];
}

function renderAttDashTiles() {
    const container = document.getElementById('att-dash-tiles');
    container.innerHTML = attDashTiles().map(tile => {
        const selected = tile.id === attDashTile;
        const base = tile.highlight
            ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';
        const ring = selected ? 'ring-2 ring-indigo-500 dark:ring-indigo-400' : '';
        const number = tile.alert ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-white';
        return `<button type="button" onclick="attDashSelectTile('${tile.id}')"
                    class="rounded-lg border p-3 text-center transition-shadow hover:shadow ${base} ${ring}">
                    <p class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(t(tile.label))}</p>
                    <p class="text-2xl font-semibold mt-1 ${number}">${tile.value}</p>
                </button>`;
    }).join('');
}

function attDashSelectTile(id) {
    attDashTile = id;
    if (!attDashData) return;
    renderAttDashTiles();
    renderAttDashDetail();
}

function attDashRow(name, detail, tag) {
    return `<li class="flex items-center justify-between gap-3 py-2">
                <span class="font-medium text-gray-800 dark:text-gray-100">${escapeHtml(name)}</span>
                <span class="text-sm text-right text-gray-500 dark:text-gray-400">${detail}${tag || ''}</span>
            </li>`;
}

function attDashTag(text, tone) {
    return `<span class="ml-2 inline-block px-2 py-0.5 rounded-full text-xs ${tone}">${escapeHtml(text)}</span>`;
}

function renderAttDashDetail() {
    const el = document.getElementById('att-dash-detail');
    const d = attDashData;
    const tile = attDashTiles().find(x => x.id === attDashTile);
    let rows = [];
    let note = '';

    switch (attDashTile) {
        case 'clockedIn':
        case 'clockedOut':
            rows = d[attDashTile].map(p => attDashRow(p.name,
                escapeHtml(p.time) + (p.shift ? `<span class="ml-2 text-xs">${escapeHtml(t('ATT_DASH_SHIFT', { time: p.shift }))}</span>` : '')));
            break;
        case 'notPunched':
            rows = d.notPunched.map(p => attDashRow(p.name,
                p.shift ? escapeHtml(t('ATT_DASH_SHIFT', { time: p.shift })) : '',
                p.notStartedYet ? attDashTag(t('ATT_DASH_NOT_STARTED'), 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300') : ''));
            break;
        case 'late':
            rows = d.late.map(p => attDashRow(p.name,
                `${escapeHtml(p.time)}<span class="ml-2 text-xs">${escapeHtml(t('ATT_DASH_SHIFT', { time: p.shift }))}</span>`,
                attDashTag(t('ATT_DASH_LATE_MIN', { n: p.minutes }), 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300')));
            break;
        case 'onLeave':
            rows = d.onLeave.map(p => attDashRow(p.name,
                p.items.map(l => `${escapeHtml(t(l.leaveType))} ${escapeHtml(l.start)} ~ ${escapeHtml(l.end)}`).join('<br>')));
            if (d.pendingLeaves) note = t('ATT_DASH_PENDING_LEAVE', { n: d.pendingLeaves });
            break;
        case 'overtime':
            rows = d.overtime.map(p => attDashRow(p.name,
                p.items.map(o => escapeHtml(t('ATT_DASH_OT_ITEM', { start: o.startTime, end: o.endTime, hours: o.hours }))).join('<br>')));
            if (d.pendingOvertime) note = t('ATT_DASH_PENDING_OT', { n: d.pendingOvertime });
            break;
    }

    el.innerHTML = `
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">${escapeHtml(t(tile.label))} · ${escapeHtml(d.date)}</h3>
        ${rows.length
            ? `<ul class="divide-y divide-gray-100 dark:divide-gray-700">${rows.join('')}</ul>`
            : `<p class="text-sm text-gray-500 dark:text-gray-400 py-2">${escapeHtml(t('ATT_DASH_EMPTY'))}</p>`}
        ${note ? `<p class="text-xs text-amber-600 dark:text-amber-400 mt-2">${escapeHtml(note)}</p>` : ''}`;
}
