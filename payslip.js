// 薪資明細表：把計算結果做成一張可列印（另存 PDF）的薪資單
// 原本算完只有畫面上的卡片與試算表裡的一列，沒有能交給員工的單據。
// 資料一律取自剛剛那次計算的回傳值，不重新向後端要，避免兩邊數字不一致。

let lastCalculatedSalary = null;

/**
 * 記住最近一次的計算結果，供列印使用
 */
function setLastCalculatedSalary(data) {
    lastCalculatedSalary = data || null;
}

function payslipMoney(value) {
    const n = parseFloat(value) || 0;
    return 'NT$ ' + Math.round(n).toLocaleString('en-US');
}

// 只列出金額不為 0 的項目，明細才不會被一堆 0 洗版
function payslipRows(items) {
    return items
        .filter(([, value]) => (parseFloat(value) || 0) !== 0)
        .map(([label, value]) => `
            <tr>
                <td>${escapeHtml(label)}</td>
                <td class="amount">${payslipMoney(value)}</td>
            </tr>`)
        .join('');
}

/**
 * 後端的全勤／生日說明是 { code, params }，這裡依目前語系翻成文字。
 * 陣列參數（假別、日期）先各自翻譯再用該語系的分隔符號串起來。
 */
function payrollMessageText(msg) {
    if (!msg || !msg.code) return '';
    const sep = t('PAYROLL_LIST_SEPARATOR');
    const params = {};
    Object.entries(msg.params || {}).forEach(([key, value]) => {
        params[key] = Array.isArray(value) ? value.map(v => t(String(v))).join(sep) : value;
    });
    return t(msg.code, params);
}

function payrollAttendanceText(info) {
    if (!info) return '';
    let text = info.status ? payrollMessageText({ code: info.status, params: info.params }) : '';
    if (info.reasons && info.reasons.length) {
        text += t('PAYROLL_REASON_INTRO') + info.reasons.map(payrollMessageText).join(t('PAYROLL_REASON_SEPARATOR'));
    }
    if (info.manual) text += (text ? t('PAYROLL_REASON_SEPARATOR') : '') + t('PAYROLL_ATT_MANUAL');
    return text;
}

/** 計算結果直接帶 attendanceInfo；從試算表讀回的在「計薪調整」JSON 的 messages 裡 */
function payrollSavedMessages(data) {
    if (data.attendanceInfo !== undefined || data.birthdayMessage !== undefined) {
        return { attendance: data.attendanceInfo, birthday: data.birthdayMessage };
    }
    try {
        const saved = JSON.parse(data['計薪調整'] || 'null');
        if (saved && saved.messages) return saved.messages;
    } catch (error) {
        console.warn('計薪調整格式錯誤:', error);
    }
    return null;
}

/**
 * 計薪規則加上的項目（餐費、生日禮金、銷售獎金、預支、手動加減項目）。
 * 計算結果用英文欄位；從「月薪資記錄」讀回來的是中文欄名，兩種都要認得。
 * 薪資單、試算結果、員工自己的薪資頁都用這一份，三邊才會一致。
 */
function payrollRuleItems(data, options) {
    const pick = (key, header) => {
        const v = data[key] !== undefined ? data[key] : data[header];
        return parseFloat(v) || 0;
    };
    
    let manualItems = Array.isArray(data.manualItems) ? data.manualItems : null;
    let note = data.payslipNote !== undefined ? data.payslipNote : (data['薪資單備註'] || '');
    if (!manualItems) {
        manualItems = [];
        try {
            const saved = JSON.parse(data['計薪調整'] || 'null');
            if (saved && Array.isArray(saved.manualItems)) manualItems = saved.manualItems;
        } catch (error) {
            console.warn('計薪調整格式錯誤:', error);
        }
    }
    
    const mealDays = parseInt(data.mealDays, 10) || 0;
    const earnings = [
        [mealDays ? t('PAYROLL_MEAL_SUBSIDY_DAYS', { days: mealDays }) : t('PAYROLL_MEAL_SUBSIDY'), pick('mealSubsidy', '餐費')],
        [t('PAYROLL_BIRTHDAY_GIFT'), pick('birthdayGift', '生日禮金')],
        [t('PAYROLL_SALES_BONUS'), pick('salesBonus', '銷售獎金')]
    ].concat(manualItems.filter(i => i.type !== 'sub').map(i => [String(i.name || ''), i.amount]));
    
    const deductions = [
        [t('PAYROLL_ADVANCE_DEDUCTION'), pick('advanceDeduction', '預支抵扣')]
    ].concat(manualItems.filter(i => i.type === 'sub').map(i => [String(i.name || ''), i.amount]));
    
    // 薪資單要把自訂津貼／扣款也列出來（薪資頁另外有 renderCustomSalaryItems）
    if (options && options.includeCustom) {
        let allowances = data.customAllowances;
        let customDeductions = data.customDeductions;
        if (!allowances && !customDeductions && data['自訂項目明細']) {
            try {
                const detail = JSON.parse(data['自訂項目明細']) || {};
                allowances = detail.allowances;
                customDeductions = detail.deductions;
            } catch (error) {
                console.warn('自訂項目明細格式錯誤:', error);
            }
        }
        (allowances || []).forEach(i => earnings.push([String(i.name || ''), i.amount]));
        (customDeductions || []).forEach(i => deductions.push([String(i.name || ''), i.amount]));
    }
    
    // 有代碼就依語系翻譯；很舊的資料只有中文，就照原文顯示
    const messages = payrollSavedMessages(data);
    const attendanceNote = messages && messages.attendance
        ? payrollAttendanceText(messages.attendance)
        : (data.attendanceNote !== undefined ? data.attendanceNote : (data['全勤說明'] || ''));
    const birthdayNote = messages && messages.birthday
        ? payrollMessageText(messages.birthday)
        : (data.birthdayNote || '');
    
    return {
        earnings: earnings,
        deductions: deductions,
        attendanceNote: attendanceNote,
        birthdayNote: birthdayNote,
        note: note || ''
    };
}

/**
 * 組出薪資明細表的 HTML
 */
function buildPayslipHtml(data) {
    const num = v => parseFloat(v) || 0;
    
    const earnings = [
        [t('SALARY_BASE'), data.baseSalary],
        [t('SALARY_POSITION_ALLOWANCE'), data.positionAllowance],
        [t('SALARY_MEAL_ALLOWANCE'), data.mealAllowance],
        [t('SALARY_TRANSPORT_ALLOWANCE'), data.transportAllowance],
        [t('SALARY_ATTENDANCE_BONUS'), data.attendanceBonus],
        [t('SALARY_PERFORMANCE_BONUS'), data.performanceBonus],
        [t('SALARY_OTHER_ALLOWANCES_LABEL'), data.otherAllowances],
        [t('SALARY_WEEKDAY_OT'), data.weekdayOvertimePay],
        [t('SALARY_REST_OT'), data.restdayOvertimePay],
        [t('SALARY_HOLIDAY_OT'), data.holidayOvertimePay],
        [t('SALARY_HOLIDAY_WORK_PAY') !== 'SALARY_HOLIDAY_WORK_PAY'
            ? t('SALARY_HOLIDAY_WORK_PAY') : '國定假日出勤薪資', data.holidayWorkPay]
    ];
    const ruleItems = payrollRuleItems(data, { includeCustom: true });
    earnings.push(...ruleItems.earnings);
    
    const deductions = [
        [t('SALARY_LABOR_INS'), data.laborFee],
        [t('SALARY_HEALTH_INS'), data.healthFee],
        [t('SALARY_EMPLOYMENT_INS'), data.employmentFee],
        [t('SALARY_PENSION'), data.pensionSelf],
        [t('SALARY_TAX'), data.incomeTax],
        [t('SALARY_LEAVE_DEDUCT'), data.leaveDeduction],
        [t('SALARY_EARLY_LEAVE_DEDUCT'), data.earlyLeaveDeduction || data['早退扣款']],
        [t('SALARY_WELFARE_FEE_LABEL'), data.welfareFee],
        [t('SALARY_DORMITORY_FEE_LABEL'), data.dormitoryFee],
        [t('SALARY_GROUP_INSURANCE_LABEL'), data.groupInsurance],
        [t('SALARY_OTHER_DEDUCT'), data.otherDeductions]
    ].concat(ruleItems.deductions);
    
    // 扣款合計 = 應發 − 實發：自訂扣款、預支、手動減項都算在裡面，跟實發金額一定對得起來
    const totalDeductions = num(data.grossSalary) - num(data.netSalary);
    const account = String(data.bankAccount || '');
    // 明細會被列印出來，帳號只留末四碼
    const maskedAccount = account ? account.slice(-4).padStart(account.length, '*') : '';
    
    const workHours = num(data.totalWorkHours);
    const overtimeHours = num(data.totalOvertimeHours);
    
    return `<!DOCTYPE html>
<html lang="${escapeHtml(currentLang || 'zh-TW')}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(t('PAYSLIP_TITLE'))} - ${escapeHtml(data.employeeName || '')} ${escapeHtml(data.yearMonth || '')}</title>
<style>
  body { font-family: "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif; color: #111; margin: 0; padding: 24px; }
  .sheet { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; font-size: 13px; margin-bottom: 16px; }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
  .meta td { padding: 4px 8px; border: 1px solid #ddd; }
  .meta td:nth-child(odd) { background: #f5f5f5; width: 110px; color: #444; }
  .cols { display: flex; gap: 16px; }
  .col { flex: 1; }
  h2 { font-size: 14px; margin: 0 0 6px; padding-bottom: 4px; border-bottom: 2px solid #333; }
  table.items { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.items td { padding: 5px 6px; border-bottom: 1px solid #eee; }
  td.amount { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.total td { border-top: 2px solid #333; border-bottom: 0; font-weight: 700; padding-top: 8px; }
  .net { margin-top: 18px; padding: 12px 14px; background: #f0f4ff; border: 1px solid #c7d2fe; border-radius: 6px;
         display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: 700; }
  .note { margin-top: 12px; font-size: 13px; white-space: pre-wrap; }
  .sign { margin-top: 28px; display: flex; justify-content: space-between; font-size: 13px; color: #444; }
  .sign span { border-top: 1px solid #999; padding-top: 6px; width: 45%; }
  .foot { margin-top: 18px; font-size: 11px; color: #777; }
  .no-print { margin: 0 auto 16px; max-width: 720px; }
  .no-print button { font: inherit; padding: 8px 16px; border: 0; border-radius: 6px; background: #4f46e5; color: #fff; cursor: pointer; }
  @media print { .no-print { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<div class="no-print"><button onclick="window.print()">${escapeHtml(t('PAYSLIP_PRINT_BTN'))}</button></div>
<div class="sheet">
  <h1>${escapeHtml(t('PAYSLIP_TITLE'))}</h1>
  <div class="sub">${escapeHtml(t('PAYSLIP_PERIOD'))}：${escapeHtml(data.yearMonth || '')}</div>
  
  <table class="meta">
    <tr>
      <td>${escapeHtml(t('PAYSLIP_EMPLOYEE'))}</td><td>${escapeHtml(data.employeeName || '')}</td>
      <td>${escapeHtml(t('PAYSLIP_EMPLOYEE_ID'))}</td><td>${escapeHtml(data.employeeId || '')}</td>
    </tr>
    <tr>
      <td>${escapeHtml(t('SALARY_TYPE_LABEL'))}</td><td>${escapeHtml(data.salaryType || '')}</td>
      <td>${escapeHtml(t('WORK_HOURS_LABEL'))}</td><td>${workHours ? workHours.toFixed(1) : '-'}</td>
    </tr>
    <tr>
      <td>${escapeHtml(t('STATS_OVERTIME_HOURS'))}</td><td>${overtimeHours ? overtimeHours.toFixed(1) : '-'}</td>
      <td>${escapeHtml(t('SALARY_ACCOUNT'))}</td><td>${escapeHtml(maskedAccount || '-')}</td>
    </tr>
  </table>
  
  <div class="cols">
    <div class="col">
      <h2>${escapeHtml(t('SALARY_EARNINGS'))}</h2>
      <table class="items">
        ${payslipRows(earnings)}
        <tr class="total">
          <td>${escapeHtml(t('SALARY_GROSS'))}</td>
          <td class="amount">${payslipMoney(data.grossSalary)}</td>
        </tr>
      </table>
    </div>
    <div class="col">
      <h2>${escapeHtml(t('SALARY_DEDUCTIONS_DETAIL'))}</h2>
      <table class="items">
        ${payslipRows(deductions)}
        <tr class="total">
          <td>${escapeHtml(t('SALARY_DEDUCTIONS'))}</td>
          <td class="amount">${payslipMoney(totalDeductions)}</td>
        </tr>
      </table>
    </div>
  </div>
  
  <div class="net">
    <span>${escapeHtml(t('SALARY_NET'))}</span>
    <span>${payslipMoney(data.netSalary)}</span>
  </div>
  
  ${ruleItems.attendanceNote ? `<div class="note"><strong>${escapeHtml(t('PAYROLL_ATTENDANCE_NOTE'))}：</strong>${escapeHtml(ruleItems.attendanceNote)}</div>` : ''}
  ${ruleItems.note ? `<div class="note"><strong>${escapeHtml(t('PAYROLL_PAYSLIP_NOTE'))}：</strong>${escapeHtml(ruleItems.note)}</div>` : ''}
  
  <div class="sign">
    <span>${escapeHtml(t('PAYSLIP_SIGNATURE'))}</span>
    <span>${escapeHtml(t('PAYSLIP_ISSUED_AT'))}：${escapeHtml(new Date().toLocaleString())}</span>
  </div>
  
  <div class="foot">${escapeHtml(t('PAYSLIP_CONFIDENTIAL'))}</div>
</div>
</body>
</html>`;
}

/**
 * 開新視窗顯示薪資明細，使用者可直接列印或另存 PDF
 */
function printPayslip(data) {
    const salary = data || lastCalculatedSalary;
    if (!salary) {
        showNotification(t('PAYSLIP_NO_DATA'), 'error');
        return;
    }
    
    const win = window.open('', '_blank');
    if (!win) {
        // 多半是被彈出視窗封鎖擋掉
        showNotification(t('PAYSLIP_POPUP_BLOCKED'), 'error');
        return;
    }
    
    win.document.open();
    win.document.write(buildPayslipHtml(salary));
    win.document.close();
}
