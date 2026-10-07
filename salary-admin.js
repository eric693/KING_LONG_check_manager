// salary-admin.js
//
// 薪資頁重整後新增的管理端功能，跟既有的 salary.js 分開放，避免那支再變大：
//   1. 公司層級設定：自訂津貼／扣款項目、加班倍率、勞健保投保級距
//   2. 薪資設定分頁的左側員工清單（點名字就切人，不用再拉下拉選單）
//   3. 薪資試算：月薪／時薪合併成一個入口，依員工的薪資類型自動分流
//   4. 薪資報表分頁的批次計算與薪資設定複製
//
// 既有的表單、計算、列表邏輯仍然在 salary.html 的內嵌腳本與 salary.js 裡，
// 這裡只負責驅動它們，不重寫計算。

let salaryAdminIsAdmin = false;
let salaryItemDefinitions = [];      // 管理員定義的自訂項目
let salaryEmployeeDirectory = [];    // 有薪資設定的在職員工（試算、批次計算用）
let salaryAllEmployees = [];         // 所有在職員工，含 hasConfig（複製設定的目標用）
let currentConfigEmployeeId = '';    // 薪資設定分頁目前選到的人

const salaryTabsInitialized = {
  setting: false,
  calc: false,
  report: false
};

const OVERTIME_RULE_FIELDS = [
  { key: 'weekdayFirst2',   labelKey: 'RULE_WEEKDAY_FIRST2',   fallback: '平日前 2 小時', step: '0.01' },
  { key: 'weekdayAfter2',   labelKey: 'RULE_WEEKDAY_AFTER2',   fallback: '平日第 3 小時起', step: '0.01' },
  { key: 'restdayFirst2',   labelKey: 'RULE_RESTDAY_FIRST2',   fallback: '休息日前 2 小時', step: '0.01' },
  { key: 'restday3to8',     labelKey: 'RULE_RESTDAY_3TO8',     fallback: '休息日第 3-8 小時', step: '0.01' },
  { key: 'restdayAfter8',   labelKey: 'RULE_RESTDAY_AFTER8',   fallback: '休息日第 9 小時起', step: '0.01' },
  { key: 'sunday',          labelKey: 'RULE_SUNDAY',           fallback: '例假日', step: '0.01' },
  { key: 'holiday',         labelKey: 'RULE_HOLIDAY',          fallback: '國定假日', step: '0.01' },
  { key: 'maxWeekdayHours', labelKey: 'RULE_MAX_WEEKDAY',      fallback: '平日每日上限 (小時)', step: '0.5' },
  { key: 'maxRestdayHours', labelKey: 'RULE_MAX_RESTDAY',      fallback: '休息日每日上限 (小時)', step: '0.5' },
  { key: 'maxHolidayHours', labelKey: 'RULE_MAX_HOLIDAY',      fallback: '國定假日每日上限 (小時)', step: '0.5' }
];

// 計薪規則（PayrollRules.gs）：金額與門檻
const PAYROLL_RULE_FIELDS = [
  { key: 'fullTimeAttendanceBonus', labelKey: 'PAYROLL_RULE_FT_ATTENDANCE',    fallback: '正職全勤獎金', step: '1' },
  { key: 'lateGraceMinutes',        labelKey: 'PAYROLL_RULE_LATE_GRACE_MIN',   fallback: '遲到緩衝（分鐘）', step: '1' },
  { key: 'lateGraceTimes',          labelKey: 'PAYROLL_RULE_LATE_GRACE_TIMES', fallback: '每月可緩衝次數', step: '1' },
  { key: 'maxMissedPunches',        labelKey: 'PAYROLL_RULE_MAX_MISSED',       fallback: '每月可忘卡次數', step: '1' },
  { key: 'partTimeAttendanceBonus', labelKey: 'PAYROLL_RULE_PT_ATTENDANCE',    fallback: '兼職全勤獎金', step: '1' },
  { key: 'partTimeAttendanceHours', labelKey: 'PAYROLL_RULE_PT_HOURS',         fallback: '兼職全勤排班時數', step: '0.5' },
  { key: 'mealPerDay',              labelKey: 'PAYROLL_RULE_MEAL_PER_DAY',     fallback: '餐費（每天）', step: '1' },
  { key: 'mealMinHours',            labelKey: 'PAYROLL_RULE_MEAL_MIN_HOURS',   fallback: '餐費門檻（小時）', step: '0.5' },
  { key: 'fullTimeBirthdayGift',    labelKey: 'PAYROLL_RULE_FT_BIRTHDAY',      fallback: '正職生日禮金', step: '1' },
  { key: 'partTimeBirthdayGift',    labelKey: 'PAYROLL_RULE_PT_BIRTHDAY',      fallback: '兼職生日禮金', step: '1' },
  { key: 'birthdayMinTenureMonths', labelKey: 'PAYROLL_RULE_BIRTHDAY_TENURE',  fallback: '生日禮金到職滿（月）', step: '1' }
];

/**
 * 翻譯小工具：沒有翻譯就用寫在程式裡的中文，不要讓畫面出現翻譯鍵
 */
function ta(key, fallback) {
  if (typeof t !== 'function') return fallback;
  const text = t(key);
  return (text === key) ? fallback : text;
}

/**
 * salary.html 的 checkUserPermission() 取得角色後呼叫這裡
 */
function onSalaryAdminReady(isAdmin) {
  salaryAdminIsAdmin = !!isAdmin;

  // 三節獎金改成摺疊區塊，展開時才去抓記錄
  const bonusCollapsible = document.getElementById('bonus-collapsible');
  if (bonusCollapsible) {
    bonusCollapsible.addEventListener('toggle', () => {
      if (bonusCollapsible.open && typeof loadBonusRecords === 'function') {
        loadBonusRecords();
      }
    }, { once: false });
  }

  if (!salaryAdminIsAdmin) return;

  // 一進頁面預設在「我的薪資」，其他分頁等使用者點到才初始化
  initSalarySettingTab();
}

// ==================== 員工清單 ====================

/**
 * 取得有薪資設定的在職員工；失敗時回傳空陣列，畫面自己顯示提示
 */
async function loadSalaryEmployeeDirectory(force = false) {
  if (salaryEmployeeDirectory.length > 0 && !force) return salaryEmployeeDirectory;

  try {
    const res = await callApifetch('listPayableEmployees', null);
    salaryEmployeeDirectory = (res.ok && Array.isArray(res.employees)) ? res.employees : [];
    salaryAllEmployees = (res.ok && Array.isArray(res.allEmployees)) ? res.allEmployees : [];
  } catch (error) {
    console.error('載入員工清單失敗:', error);
    salaryEmployeeDirectory = [];
    salaryAllEmployees = [];
  }

  return salaryEmployeeDirectory;
}

/**
 * 依員工ID找出薪資類型（月薪／時薪／週薪）
 */
function getEmployeeSalaryType(employeeId) {
  const found = salaryEmployeeDirectory.find(emp => emp.employeeId === employeeId);
  return found ? found.salaryType : '';
}

/**
 * 左側員工清單；keyword 只做單純的字串比對
 */
function renderEmployeeList(keyword = '') {
  const container = document.getElementById('employee-list');
  if (!container) return;

  const lower = keyword.trim().toLowerCase();
  const matched = salaryEmployeeDirectory.filter(emp =>
    !lower ||
    emp.employeeName.toLowerCase().includes(lower) ||
    emp.employeeId.toLowerCase().includes(lower)
  );

  if (matched.length === 0) {
    container.innerHTML = `<div class="employee-list-empty">${
      salaryEmployeeDirectory.length === 0
        ? ta('SALARY_NO_CONFIGURED_EMPLOYEE', '尚無員工薪資設定')
        : ta('SALARY_NO_MATCH', '找不到符合的員工')
    }</div>`;
    return;
  }

  container.innerHTML = '';
  matched.forEach(emp => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'employee-list-item' + (emp.employeeId === currentConfigEmployeeId ? ' active' : '');
    button.dataset.employeeId = emp.employeeId;

    const name = document.createElement('span');
    name.textContent = emp.employeeName || emp.employeeId;

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = salaryValueLabel(emp.salaryType || '');

    button.appendChild(name);
    button.appendChild(tag);
    button.addEventListener('click', () => selectConfigEmployee(emp.employeeId));
    container.appendChild(button);
  });
}

/**
 * 點左邊清單等同於在下拉選單選人：沿用原本的 onEmployeeSelect() 帶資料
 */
function selectConfigEmployee(employeeId) {
  const select = document.getElementById('config-employee-select');
  if (!select) return;

  // 下拉選單的 value 是整包 JSON，要比對裡面的 userId
  let matchedOption = null;
  for (let i = 0; i < select.options.length; i++) {
    const raw = select.options[i].value;
    if (!raw) continue;
    try {
      if (JSON.parse(raw).userId === employeeId) {
        matchedOption = select.options[i];
        break;
      }
    } catch (error) {
      // 不是 JSON 的選項（例如「載入失敗」）直接略過
    }
  }

  if (!matchedOption) {
    showNotification(ta('SALARY_EMPLOYEE_NOT_IN_LIST', '這位員工不在下拉選單裡，請重新整理頁面'), 'error');
    return;
  }

  select.value = matchedOption.value;
  currentConfigEmployeeId = employeeId;
  renderEmployeeList(document.getElementById('employee-filter')?.value || '');

  if (typeof onEmployeeSelect === 'function') onEmployeeSelect();
  loadCustomItemValues(employeeId);
}

// ==================== 自訂項目 ====================

/**
 * 取得管理員定義的自訂項目
 */
async function loadSalaryItems(force = false) {
  if (salaryItemDefinitions.length > 0 && !force) return salaryItemDefinitions;

  try {
    const res = await callApifetch('getSalaryItems', null);
    salaryItemDefinitions = (res.ok && Array.isArray(res.items)) ? res.items : [];
  } catch (error) {
    console.error('載入自訂薪資項目失敗:', error);
    salaryItemDefinitions = [];
  }

  return salaryItemDefinitions;
}

/**
 * 公司層級設定裡的項目定義編輯器
 */
function renderSalaryItemsEditor() {
  const container = document.getElementById('salary-items-editor');
  if (!container) return;

  container.innerHTML = '';

  if (salaryItemDefinitions.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'summary-hint';
    hint.textContent = ta('SALARY_NO_CUSTOM_ITEMS', '還沒有自訂項目，按「新增項目」開始。');
    container.appendChild(hint);
    return;
  }

  salaryItemDefinitions.forEach(item => container.appendChild(buildSalaryItemRow(item)));
}

function buildSalaryItemRow(item) {
  const row = document.createElement('div');
  row.className = 'item-row definition-row';

  const id = document.createElement('input');
  id.type = 'text';
  id.className = 'form-input item-id';
  id.placeholder = ta('SALARY_ITEM_CODE', '代碼');
  id.value = item.id || '';
  id.maxLength = 32;

  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'form-input item-name';
  name.placeholder = ta('SALARY_ITEM_NAME', '顯示名稱');
  name.value = item.name || '';
  name.maxLength = 20;

  const type = document.createElement('select');
  type.className = 'form-select item-type';
  [
    ['allowance', ta('SALARY_ITEM_TYPE_ALLOWANCE', '津貼（加項）')],
    ['deduction', ta('SALARY_ITEM_TYPE_DEDUCTION', '扣款（減項）')]
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    type.appendChild(option);
  });
  type.value = item.type || 'allowance';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'row-remove-btn';
  remove.textContent = ta('BTN_REMOVE', '刪除');
  remove.addEventListener('click', () => row.remove());

  row.appendChild(id);
  row.appendChild(name);
  row.appendChild(type);
  row.appendChild(remove);
  return row;
}

/**
 * 讀回編輯器上的項目定義並存檔
 */
async function saveSalaryItems() {
  const container = document.getElementById('salary-items-editor');
  if (!container) return;

  const items = [];
  container.querySelectorAll('.definition-row').forEach(row => {
    const id = row.querySelector('.item-id').value.trim();
    const name = row.querySelector('.item-name').value.trim();
    const type = row.querySelector('.item-type').value;
    if (!id && !name) return;  // 整列空白就當作沒填
    items.push({ id: id, name: name, type: type });
  });

  const btn = document.getElementById('save-salary-items-btn');
  if (btn) btn.disabled = true;

  try {
    const res = await callApifetch(
      `saveSalaryItems&items=${encodeURIComponent(JSON.stringify(items))}`, null);

    if (res.ok) {
      salaryItemDefinitions = res.items || items;
      renderSalaryItemsEditor();
      renderCustomItemInputs({});
      if (currentConfigEmployeeId) loadCustomItemValues(currentConfigEmployeeId);
      showNotification(ta('SALARY_ITEMS_SAVED', '自訂項目已儲存'), 'success');
    } else {
      showNotification(res.msg || ta('SALARY_ITEMS_SAVE_FAILED', '自訂項目儲存失敗'), 'error');
    }
  } catch (error) {
    console.error('儲存自訂項目失敗:', error);
    showNotification(ta('SALARY_ITEMS_SAVE_FAILED', '自訂項目儲存失敗'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * 在員工薪資設定表單裡長出每個自訂項目的金額欄位
 */
function renderCustomItemInputs(values = {}) {
  const section = document.getElementById('config-custom-items-section');
  const container = document.getElementById('config-custom-items');
  if (!section || !container) return;

  if (salaryItemDefinitions.length === 0) {
    section.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  section.style.display = 'block';
  container.innerHTML = '';

  salaryItemDefinitions.forEach(item => {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.className = 'form-label';
    label.setAttribute('for', `config-custom-${item.id}`);
    label.textContent = item.name +
      (item.type === 'deduction' ? ` (${ta('SALARY_ITEM_TYPE_DEDUCTION_SHORT', '扣款')})`
                                 : ` (${ta('SALARY_ITEM_TYPE_ALLOWANCE_SHORT', '津貼')})`);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'form-input custom-item-input';
    input.id = `config-custom-${item.id}`;
    input.dataset.itemId = item.id;
    input.min = '0';
    input.step = '1';
    input.value = values[item.id] || 0;

    group.appendChild(label);
    group.appendChild(input);
    container.appendChild(group);
  });
}

/**
 * 表單送出時由 salary.js 呼叫，取得目前填的自訂項目金額
 */
function collectCustomItemValues() {
  const values = {};
  document.querySelectorAll('.custom-item-input').forEach(input => {
    const amount = parseFloat(input.value);
    values[input.dataset.itemId] = isNaN(amount) ? 0 : amount;
  });
  return values;
}

/**
 * 切換員工時把他已存的自訂項目金額填回表單
 */
async function loadCustomItemValues(employeeId) {
  if (!employeeId || salaryItemDefinitions.length === 0) {
    renderCustomItemInputs({});
    return;
  }

  try {
    const res = await callApifetch(
      `getEmployeeSalaryTW&employeeId=${encodeURIComponent(employeeId)}`, null);

    let values = {};
    if (res.ok && res.data && res.data['自訂項目']) {
      try {
        values = JSON.parse(res.data['自訂項目']) || {};
      } catch (error) {
        console.warn('自訂項目金額格式錯誤，當作 0:', error);
      }
    }
    renderCustomItemInputs(values);

  } catch (error) {
    console.error('載入自訂項目金額失敗:', error);
    renderCustomItemInputs({});
  }
}

// ==================== 加班倍率與投保級距 ====================

function renderOvertimeRulesEditor(rules) {
  const container = document.getElementById('overtime-rules-editor');
  if (!container || !rules) return;

  container.innerHTML = '';

  OVERTIME_RULE_FIELDS.forEach(field => {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.className = 'form-label';
    label.setAttribute('for', `rule-${field.key}`);
    label.textContent = ta(field.labelKey, field.fallback);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'form-input overtime-rule-input';
    input.id = `rule-${field.key}`;
    input.dataset.ruleKey = field.key;
    input.step = field.step;
    input.min = '0';
    input.value = (rules[field.key] === undefined) ? '' : rules[field.key];

    group.appendChild(label);
    group.appendChild(input);
    container.appendChild(group);
  });
}

function renderPayrollRulesEditor(rules) {
  const container = document.getElementById('payroll-rules-editor');
  if (!container || !rules) return;

  const enabled = document.getElementById('payroll-rules-enabled');
  if (enabled) enabled.checked = rules.enabled !== false;

  container.innerHTML = '';
  PAYROLL_RULE_FIELDS.forEach(field => {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.className = 'form-label';
    label.setAttribute('for', `payroll-rule-${field.key}`);
    label.textContent = ta(field.labelKey, field.fallback);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'form-input payroll-rule-input';
    input.id = `payroll-rule-${field.key}`;
    input.dataset.ruleKey = field.key;
    input.step = field.step;
    input.min = '0';
    input.value = (rules[field.key] === undefined) ? '' : rules[field.key];

    group.appendChild(label);
    group.appendChild(input);
    container.appendChild(group);
  });
}

function collectPayrollRules() {
  const rules = { enabled: !!document.getElementById('payroll-rules-enabled')?.checked };
  document.querySelectorAll('.payroll-rule-input').forEach(input => {
    rules[input.dataset.ruleKey] = parseFloat(input.value);
  });
  return rules;
}

function renderInsuranceBracketsEditor(brackets) {
  const container = document.getElementById('insurance-brackets-editor');
  if (!container || !Array.isArray(brackets)) return;

  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'item-row bracket-row summary-hint';
  [
    ta('BRACKET_MIN', '下限'),
    ta('BRACKET_MAX', '上限'),
    ta('BRACKET_INSURED', '投保薪資'),
    ta('BRACKET_LABOR', '勞保費'),
    ta('BRACKET_HEALTH', '健保費'),
    ''
  ].forEach(text => {
    const cell = document.createElement('span');
    cell.textContent = text;
    header.appendChild(cell);
  });
  container.appendChild(header);

  brackets.forEach(bracket => container.appendChild(buildBracketRow(bracket)));
}

function buildBracketRow(bracket) {
  const row = document.createElement('div');
  row.className = 'item-row bracket-row';

  [
    { field: 'min', value: bracket.min },
    // 上限留白代表「以上」，所以 null 要轉成空字串而不是 0
    { field: 'max', value: (bracket.max === null || bracket.max === undefined) ? '' : bracket.max },
    { field: 'insured', value: bracket.insured },
    { field: 'labor', value: bracket.labor },
    { field: 'health', value: bracket.health }
  ].forEach(cell => {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = `form-input bracket-${cell.field}`;
    input.min = '0';
    input.step = '1';
    input.value = cell.value;
    row.appendChild(input);
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'row-remove-btn';
  remove.textContent = ta('BTN_REMOVE', '刪除');
  remove.addEventListener('click', () => row.remove());
  row.appendChild(remove);

  return row;
}

function renderIncomeTaxEditor(rules) {
  const container = document.getElementById('income-tax-editor');
  if (!container || !rules) return;

  const threshold = document.getElementById('tax-threshold');
  const auto = document.getElementById('tax-auto-monthly');
  if (threshold) threshold.value = rules.threshold;
  if (auto) auto.checked = !!rules.autoCalculateForMonthly;

  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'item-row tax-header summary-hint';
  header.style.gridTemplateColumns = 'repeat(3, 1fr) auto';
  [
    ta('TAX_MIN', '級距下限'),
    ta('TAX_RATE', '稅率（0.05 = 5%）'),
    ta('TAX_BASE', '累計稅額'),
    ''
  ].forEach(text => {
    const cell = document.createElement('span');
    cell.textContent = text;
    header.appendChild(cell);
  });
  container.appendChild(header);

  (rules.brackets || []).forEach(bracket => container.appendChild(buildTaxBracketRow(bracket)));
}

function buildTaxBracketRow(bracket) {
  const row = document.createElement('div');
  row.className = 'item-row tax-row';
  row.style.gridTemplateColumns = 'repeat(3, 1fr) auto';

  [
    { field: 'min', value: bracket.min, step: '1' },
    { field: 'rate', value: bracket.rate, step: '0.001' },
    { field: 'base', value: bracket.base, step: '1' }
  ].forEach(cell => {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = `form-input tax-${cell.field}`;
    input.min = '0';
    input.step = cell.step;
    input.value = cell.value;
    row.appendChild(input);
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'row-remove-btn';
  remove.textContent = ta('BTN_REMOVE', '刪除');
  remove.addEventListener('click', () => row.remove());
  row.appendChild(remove);

  return row;
}

/**
 * 把畫面上的所得稅設定讀回來
 */
function collectIncomeTaxRules() {
  const brackets = [];
  document.querySelectorAll('#income-tax-editor .tax-row').forEach(row => {
    brackets.push({
      min: parseFloat(row.querySelector('.tax-min').value),
      rate: parseFloat(row.querySelector('.tax-rate').value),
      base: parseFloat(row.querySelector('.tax-base').value)
    });
  });

  return {
    autoCalculateForMonthly: !!document.getElementById('tax-auto-monthly')?.checked,
    threshold: parseFloat(document.getElementById('tax-threshold')?.value),
    brackets: brackets
  };
}

async function loadSalaryRules() {
  try {
    const res = await callApifetch('getSalaryRules', null);
    // 後端沒回完整內容時就不要動畫面，免得整個編輯器變空白
    if (res.ok && res.overtimeRules && Array.isArray(res.insuranceBrackets)) {
      renderOvertimeRulesEditor(res.overtimeRules);
      renderInsuranceBracketsEditor(res.insuranceBrackets);
      renderIncomeTaxEditor(res.incomeTaxRules);
      renderPayrollRulesEditor(res.payrollRules);
    }
  } catch (error) {
    console.error('載入薪資規則失敗:', error);
  }
}

async function saveSalaryRules() {
  const overtimeRules = {};
  document.querySelectorAll('.overtime-rule-input').forEach(input => {
    overtimeRules[input.dataset.ruleKey] = parseFloat(input.value);
  });

  const brackets = [];
  document.querySelectorAll('#insurance-brackets-editor .bracket-row').forEach(row => {
    const min = row.querySelector('.bracket-min');
    if (!min) return;  // 標題列沒有 input

    const maxValue = row.querySelector('.bracket-max').value.trim();
    brackets.push({
      min: parseFloat(min.value),
      max: maxValue === '' ? null : parseFloat(maxValue),
      insured: parseFloat(row.querySelector('.bracket-insured').value),
      labor: parseFloat(row.querySelector('.bracket-labor').value),
      health: parseFloat(row.querySelector('.bracket-health').value)
    });
  });

  const btn = document.getElementById('save-salary-rules-btn');
  if (btn) btn.disabled = true;

  try {
    const query =
      `overtimeRules=${encodeURIComponent(JSON.stringify(overtimeRules))}` +
      `&insuranceBrackets=${encodeURIComponent(JSON.stringify(brackets))}` +
      `&incomeTaxRules=${encodeURIComponent(JSON.stringify(collectIncomeTaxRules()))}`;
    const payrollEditor = document.getElementById('payroll-rules-editor');
    const payrollQuery = (payrollEditor && payrollEditor.children.length)
      ? `&payrollRules=${encodeURIComponent(JSON.stringify(collectPayrollRules()))}`
      : '';
    const res = await callApifetch(`updateSalaryRules&${query}${payrollQuery}`, null);

    if (res.ok) {
      renderOvertimeRulesEditor(res.overtimeRules || overtimeRules);
      renderInsuranceBracketsEditor(res.insuranceBrackets || brackets);
      if (res.incomeTaxRules) renderIncomeTaxEditor(res.incomeTaxRules);
      if (res.payrollRules) renderPayrollRulesEditor(res.payrollRules);
      showNotification(ta('SALARY_RULES_SAVED', '薪資規則已更新'), 'success');
    } else {
      showNotification(res.msg || ta('SALARY_RULES_SAVE_FAILED', '薪資規則更新失敗'), 'error');
    }
  } catch (error) {
    console.error('儲存薪資規則失敗:', error);
    showNotification(ta('SALARY_RULES_SAVE_FAILED', '薪資規則更新失敗'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function resetSalaryRules() {
  if (!confirm(ta('SALARY_RULES_RESET_CONFIRM', '確定要還原成預設的加班倍率與投保級距嗎？'))) return;

  try {
    const res = await callApifetch('resetSalaryRules', null);
    if (res.ok) {
      renderOvertimeRulesEditor(res.overtimeRules);
      renderInsuranceBracketsEditor(res.insuranceBrackets);
      renderIncomeTaxEditor(res.incomeTaxRules);
      renderPayrollRulesEditor(res.payrollRules);
      showNotification(ta('SALARY_RULES_RESET_DONE', '已還原為預設薪資規則'), 'success');
    } else {
      showNotification(res.msg || ta('SALARY_RULES_SAVE_FAILED', '薪資規則更新失敗'), 'error');
    }
  } catch (error) {
    console.error('還原薪資規則失敗:', error);
    showNotification(ta('SALARY_RULES_SAVE_FAILED', '薪資規則更新失敗'), 'error');
  }
}

// ==================== 薪資試算（月薪／時薪合併） ====================

/**
 * 把下面兩個原本的計算區塊，交給上方單一選擇器驅動
 */
function dispatchUnifiedCalculation() {
  const employeeSelect = document.getElementById('unified-calc-employee');
  const monthInput = document.getElementById('unified-calc-month');
  if (!employeeSelect || !monthInput) return;

  const raw = employeeSelect.value;
  const yearMonth = monthInput.value;

  if (!raw) {
    showNotification(ta('SALARY_SELECT_EMPLOYEE', '請選擇員工'), 'error');
    return;
  }
  if (!yearMonth) {
    showNotification(ta('SALARY_SELECT_MONTH', '請選擇計算年月'), 'error');
    return;
  }

  let employeeId = '';
  try {
    employeeId = JSON.parse(raw).userId;
  } catch (error) {
    showNotification(ta('SALARY_SELECT_EMPLOYEE', '請選擇員工'), 'error');
    return;
  }

  const salaryType = getEmployeeSalaryType(employeeId);
  const isHourly = (salaryType === '時薪');

  const panelId = isHourly ? 'hourly-calc' : 'monthly-calc';
  const otherPanelId = isHourly ? 'monthly-calc' : 'hourly-calc';
  const selectId = isHourly ? 'hourly-employee-select' : 'calc-employee-select';
  const monthId = isHourly ? 'hourly-year-month' : 'calc-year-month';
  const buttonId = isHourly ? 'calculate-hourly-btn' : 'calculate-salary-btn';

  // 把選擇同步到對應區塊，再觸發它原本的流程
  const panelSelect = document.getElementById(selectId);
  const panelMonth = document.getElementById(monthId);
  const panelButton = document.getElementById(buttonId);

  if (!panelSelect || !panelMonth || !panelButton) {
    showNotification(ta('SALARY_CALC_PANEL_MISSING', '找不到計算區塊，請重新整理頁面'), 'error');
    return;
  }

  panelSelect.value = raw;
  panelSelect.dispatchEvent(new Event('change'));
  panelMonth.value = yearMonth;

  document.getElementById(otherPanelId).style.display = 'none';
  document.getElementById(panelId).style.display = 'block';

  panelButton.click();
}

/**
 * 選到人之後先告訴使用者會用哪一種算法
 */
function updateCalcTypeHint() {
  const hint = document.getElementById('unified-calc-type-hint');
  const select = document.getElementById('unified-calc-employee');
  if (!hint || !select) return;

  if (!select.value) {
    hint.textContent = '';
    return;
  }

  let employeeId = '';
  try {
    employeeId = JSON.parse(select.value).userId;
  } catch (error) {
    hint.textContent = '';
    return;
  }

  const salaryType = getEmployeeSalaryType(employeeId);

  if (!salaryType) {
    hint.textContent = ta('SALARY_CALC_NO_CONFIG', '這位員工還沒有薪資設定，請先到「薪資設定」建立。');
    return;
  }

  hint.textContent = ta('SALARY_CALC_TYPE_HINT', '薪資類型') + '：' + salaryType;
}

/**
 * 從既有的下拉選單複製選項，確保 value 格式與原本的計算流程一致
 */
function mirrorEmployeeOptions(targetId, sourceId) {
  const target = document.getElementById(targetId);
  const source = document.getElementById(sourceId);
  if (!target || !source) return;

  target.innerHTML = '';
  for (let i = 0; i < source.options.length; i++) {
    target.appendChild(source.options[i].cloneNode(true));
  }
}

// ==================== 批次計算 ====================

/**
 * 分批呼叫後端，直到 nextIndex 為 null 為止
 */
async function runBatchCalculation() {
  const monthInput = document.getElementById('batch-calc-month');
  const progressEl = document.getElementById('batch-calc-progress');
  const resultsEl = document.getElementById('batch-calc-results');
  const btn = document.getElementById('batch-calc-btn');

  const yearMonth = monthInput ? monthInput.value : '';
  if (!yearMonth) {
    showNotification(ta('SALARY_SELECT_MONTH', '請選擇計算年月'), 'error');
    return;
  }

  if (!confirm(ta('SALARY_BATCH_CONFIRM', '將重新計算並覆寫該月份所有在職員工的薪資單，確定要繼續嗎？'))) {
    return;
  }

  if (btn) btn.disabled = true;
  if (resultsEl) resultsEl.innerHTML = '';
  if (progressEl) progressEl.textContent = ta('SALARY_BATCH_RUNNING', '計算中...');

  let startIndex = 0;
  let failed = 0;
  let succeeded = 0;

  try {
    while (true) {
      const res = await callApifetch(
        `batchCalculateSalary&yearMonth=${encodeURIComponent(yearMonth)}&startIndex=${startIndex}`, null);

      if (!res.ok) {
        showNotification(res.msg || ta('SALARY_BATCH_FAILED', '批次計算失敗'), 'error');
        break;
      }

      (res.results || []).forEach(row => {
        if (row.ok) succeeded++; else failed++;
        if (resultsEl) resultsEl.appendChild(buildBatchResultRow(row));
      });

      if (progressEl) {
        progressEl.textContent = `${res.processed} / ${res.total}`;
      }

      if (res.nextIndex === null || res.nextIndex === undefined) {
        if (progressEl) {
          progressEl.textContent = ta('SALARY_BATCH_DONE', '完成') +
            `：${succeeded} 成功、${failed} 失敗（共 ${res.total} 位）`;
        }
        showNotification(res.msg || ta('SALARY_BATCH_DONE', '完成'), failed > 0 ? 'info' : 'success');
        break;
      }

      startIndex = res.nextIndex;
    }
  } catch (error) {
    console.error('批次計算失敗:', error);
    showNotification(ta('SALARY_BATCH_FAILED', '批次計算失敗'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function buildBatchResultRow(row) {
  const el = document.createElement('div');
  el.className = 'batch-result-row' + (row.ok ? '' : ' failed');

  const name = document.createElement('span');
  name.textContent = row.employeeName || row.employeeId;

  const detail = document.createElement('span');
  detail.textContent = row.ok
    ? `${row.salaryType || ''} ${ta('SALARY_NET', '實發')} NT$ ${Number(row.netSalary || 0).toLocaleString()}`
    : (row.msg || ta('SALARY_BATCH_ROW_FAILED', '計算失敗'));

  el.appendChild(name);
  el.appendChild(detail);
  return el;
}

// ==================== 複製薪資設定 ====================

function renderCopyTargets() {
  const container = document.getElementById('copy-target-list');
  const sourceSelect = document.getElementById('copy-source-employee');
  if (!container) return;

  const sourceId = sourceSelect ? sourceSelect.value : '';

  container.innerHTML = '';

  // 新人報到是這個功能的主要用途，所以還沒建薪資設定的人也要能選
  const pool = salaryAllEmployees.length > 0 ? salaryAllEmployees : salaryEmployeeDirectory;
  const targets = pool.filter(emp => emp.employeeId !== sourceId);

  if (targets.length === 0) {
    container.innerHTML = `<div class="employee-list-empty">${
      ta('SALARY_NO_COPY_TARGET', '沒有其他可套用的員工')}</div>`;
    return;
  }

  targets.forEach(emp => {
    const label = document.createElement('label');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'copy-target';
    checkbox.value = emp.employeeId;
    checkbox.dataset.hasConfig = (emp.hasConfig === false) ? '0' : '1';

    const text = document.createElement('span');
    text.textContent = emp.employeeName || emp.employeeId;

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = (emp.hasConfig === false)
      ? ta('SALARY_NOT_CONFIGURED', '尚未設定')
      : (emp.salaryType || '');

    label.appendChild(checkbox);
    label.appendChild(text);
    label.appendChild(tag);
    container.appendChild(label);
  });
}

/**
 * 預覽：按下去之前先看到「哪些欄位會被蓋成什麼值」
 */
async function refreshCopyPreview() {
  const previewEl = document.getElementById('copy-config-preview');
  const sourceSelect = document.getElementById('copy-source-employee');
  if (!previewEl) return;

  const sourceId = sourceSelect ? sourceSelect.value : '';
  const groups = Array.from(document.querySelectorAll('.copy-group:checked')).map(el => el.value);

  if (!sourceId || groups.length === 0) {
    previewEl.innerHTML = '';
    return;
  }

  try {
    const query =
      `sourceEmployeeId=${encodeURIComponent(sourceId)}` +
      `&groups=${encodeURIComponent(JSON.stringify(groups))}`;
    const res = await callApifetch(`previewSalaryConfigCopy&${query}`, null);

    if (!res.ok || !Array.isArray(res.fields)) {
      previewEl.innerHTML = '';
      return;
    }

    previewEl.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'help-h';
    title.textContent = ta('SALARY_COPY_PREVIEW', '將套用以下內容') +
      `（${ta('SALARY_COPY_FROM', '來源')}：${res.sourceEmployeeName}）`;
    previewEl.appendChild(title);

    res.fields.forEach(field => {
      const row = document.createElement('div');
      row.className = 'batch-result-row';

      const name = document.createElement('span');
      name.textContent = field.name;

      const value = document.createElement('span');
      value.textContent = (typeof field.value === 'number')
        ? field.value.toLocaleString()
        : String(field.value);

      row.appendChild(name);
      row.appendChild(value);
      previewEl.appendChild(row);
    });

  } catch (error) {
    console.error('載入複製預覽失敗:', error);
    previewEl.innerHTML = '';
  }
}

/**
 * 複製結果專用的列；批次計算那支會印出實發金額，用在這裡並不對
 */
function buildCopyResultRow(row) {
  const el = document.createElement('div');
  el.className = 'batch-result-row' + (row.ok ? '' : ' failed');

  const name = document.createElement('span');
  name.textContent = row.employeeName || row.employeeId;

  const detail = document.createElement('span');
  detail.textContent = row.ok
    ? (row.created ? ta('SALARY_COPY_CREATED', '已建立設定') : ta('SALARY_COPY_APPLIED', '已套用'))
    : (row.msg || ta('SALARY_COPY_ROW_FAILED', '未處理'));

  el.appendChild(name);
  el.appendChild(detail);
  return el;
}

async function runCopySalaryConfig() {
  const sourceSelect = document.getElementById('copy-source-employee');
  const resultsEl = document.getElementById('copy-config-results');
  const btn = document.getElementById('copy-config-btn');

  const sourceId = sourceSelect ? sourceSelect.value : '';
  if (!sourceId) {
    showNotification(ta('SALARY_COPY_SELECT_SOURCE', '請選擇來源員工'), 'error');
    return;
  }

  const targets = Array.from(document.querySelectorAll('.copy-target:checked')).map(el => el.value);
  if (targets.length === 0) {
    showNotification(ta('SALARY_COPY_SELECT_TARGET', '請選擇要套用的員工'), 'error');
    return;
  }

  const groups = Array.from(document.querySelectorAll('.copy-group:checked')).map(el => el.value);
  if (groups.length === 0) {
    showNotification(ta('SALARY_COPY_SELECT_GROUP', '請選擇要複製的項目'), 'error');
    return;
  }

  const newOnes = Array.from(document.querySelectorAll('.copy-target:checked'))
    .filter(el => el.dataset.hasConfig === '0').length;
  const existing = targets.length - newOnes;

  let confirmText = ta('SALARY_COPY_CONFIRM', '將覆寫這些員工目前的設定，確定要繼續嗎？');
  if (newOnes > 0) {
    confirmText = `${ta('SALARY_COPY_CONFIRM_DETAIL', '將覆寫')} ${existing} ` +
      `${ta('SALARY_COPY_CONFIRM_EXISTING', '位既有設定、新建')} ${newOnes} ` +
      `${ta('SALARY_COPY_CONFIRM_NEW', '位新設定，確定要繼續嗎？')}`;
  }

  if (!confirm(confirmText)) return;

  if (btn) btn.disabled = true;
  if (resultsEl) resultsEl.innerHTML = '';

  try {
    const query =
      `sourceEmployeeId=${encodeURIComponent(sourceId)}` +
      `&targetEmployeeIds=${encodeURIComponent(JSON.stringify(targets))}` +
      `&groups=${encodeURIComponent(JSON.stringify(groups))}`;
    const res = await callApifetch(`copySalaryConfig&${query}`, null);

    if (res.ok) {
      (res.results || []).forEach(row => {
        if (resultsEl) resultsEl.appendChild(buildCopyResultRow(row));
      });

      // 有人沒套用成功時不要報成功，不然管理員會以為全部都好了
      const failed = (res.results || []).filter(row => !row.ok).length;
      showNotification(res.msg || ta('SALARY_COPY_DONE', '設定已套用'),
                       failed > 0 ? 'info' : 'success');

      // 目標可能從「尚未設定」變成已設定，清單要重抓
      await loadSalaryEmployeeDirectory(true);
      renderCopyTargets();
    } else {
      showNotification(res.msg || ta('SALARY_COPY_FAILED', '複製設定失敗'), 'error');
    }
  } catch (error) {
    console.error('複製薪資設定失敗:', error);
    showNotification(ta('SALARY_COPY_FAILED', '複製設定失敗'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ==================== 薪資異動記錄 ====================

async function loadSalaryAuditLog() {
  const resultsEl = document.getElementById('audit-log-results');
  const btn = document.getElementById('load-audit-btn');
  if (!resultsEl) return;

  const employeeId = document.getElementById('audit-employee')?.value || '';
  const yearMonth = document.getElementById('audit-month')?.value || '';

  if (btn) btn.disabled = true;
  resultsEl.innerHTML = '';

  try {
    const query = [];
    if (employeeId) query.push(`employeeId=${encodeURIComponent(employeeId)}`);
    if (yearMonth) query.push(`yearMonth=${encodeURIComponent(yearMonth)}`);

    const res = await callApifetch(
      `getSalaryAuditLog${query.length ? '&' + query.join('&') : ''}`, null);

    if (!res.ok) {
      showNotification(res.msg || ta('SALARY_AUDIT_FAILED', '查詢異動記錄失敗'), 'error');
      return;
    }

    const entries = res.entries || [];

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'employee-list-empty';
      empty.textContent = ta('SALARY_AUDIT_EMPTY', '沒有異動記錄');
      resultsEl.appendChild(empty);
      return;
    }

    entries.forEach(entry => resultsEl.appendChild(buildAuditRow(entry)));

  } catch (error) {
    console.error('查詢薪資異動記錄失敗:', error);
    showNotification(ta('SALARY_AUDIT_FAILED', '查詢異動記錄失敗'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function buildAuditRow(entry) {
  const el = document.createElement('div');
  el.className = 'batch-result-row';
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '150px 1fr 1fr 100px';
  el.style.gap = '0.75rem';

  const when = document.createElement('span');
  when.className = 'summary-hint';
  when.textContent = entry.at;

  const what = document.createElement('span');
  what.textContent = `${entry.employeeName || entry.employeeId}・${entry.yearMonth}` +
    (entry.column ? `・${entry.column}` : `・${entry.action}`);

  const change = document.createElement('span');
  change.className = 'font-mono';
  change.textContent = entry.column ? `${entry.before} → ${entry.after}` : '';

  const who = document.createElement('span');
  who.className = 'summary-hint';
  who.textContent = entry.actor;

  el.appendChild(when);
  el.appendChild(what);
  el.appendChild(change);
  el.appendChild(who);
  return el;
}

// ==================== 薪資單簽收狀況 ====================

async function loadPayslipAcknowledgements() {
  const resultsEl = document.getElementById('ack-results');
  const summaryEl = document.getElementById('ack-summary');
  const btn = document.getElementById('load-ack-btn');
  const yearMonth = document.getElementById('ack-month')?.value || '';

  if (!yearMonth) {
    showNotification(ta('SALARY_SELECT_MONTH', '請選擇年月'), 'error');
    return;
  }

  if (btn) btn.disabled = true;
  if (resultsEl) resultsEl.innerHTML = '';
  if (summaryEl) summaryEl.textContent = '';

  try {
    const res = await callApifetch(
      `getPayslipAcknowledgements&yearMonth=${encodeURIComponent(yearMonth)}`, null);

    if (!res.ok) {
      showNotification(res.msg || ta('PAYSLIP_ACK_LOAD_FAILED', '查詢簽收狀況失敗'), 'error');
      return;
    }

    if (summaryEl) {
      summaryEl.textContent = `${res.acknowledged} / ${res.total} ` +
        ta('PAYSLIP_ACK_COUNT', '位已簽收');
    }

    (res.rows || []).forEach(row => {
      const el = document.createElement('div');
      el.className = 'batch-result-row' + (row.acknowledged ? '' : ' failed');

      const name = document.createElement('span');
      name.textContent = row.employeeName || row.employeeId;

      const detail = document.createElement('span');
      detail.textContent = row.acknowledged
        ? row.acknowledgedAt
        : ta('PAYSLIP_NOT_ACKNOWLEDGED', '尚未簽收');

      el.appendChild(name);
      el.appendChild(detail);
      if (resultsEl) resultsEl.appendChild(el);
    });

  } catch (error) {
    console.error('查詢簽收狀況失敗:', error);
    showNotification(ta('PAYSLIP_ACK_LOAD_FAILED', '查詢簽收狀況失敗'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ==================== 各分頁初始化 ====================

async function initSalarySettingTab() {
  if (!salaryAdminIsAdmin || salaryTabsInitialized.setting) return;
  salaryTabsInitialized.setting = true;

  await loadSalaryEmployeeDirectory();
  renderEmployeeList();

  document.getElementById('employee-filter')?.addEventListener('input', (e) => {
    renderEmployeeList(e.target.value);
  });

  await loadSalaryItems();
  renderSalaryItemsEditor();
  renderCustomItemInputs({});

  document.getElementById('add-salary-item-btn')?.addEventListener('click', () => {
    const container = document.getElementById('salary-items-editor');
    if (!container) return;
    // 第一次新增時要先把「還沒有自訂項目」那行提示清掉
    if (salaryItemDefinitions.length === 0 && container.querySelector('p')) {
      container.innerHTML = '';
    }
    container.appendChild(buildSalaryItemRow({ id: '', name: '', type: 'allowance' }));
  });

  document.getElementById('save-salary-items-btn')?.addEventListener('click', saveSalaryItems);

  await loadSalaryRules();

  document.getElementById('add-bracket-btn')?.addEventListener('click', () => {
    const container = document.getElementById('insurance-brackets-editor');
    if (container) {
      container.appendChild(buildBracketRow({ min: 0, max: '', insured: 0, labor: 0, health: 0 }));
    }
  });

  document.getElementById('add-tax-bracket-btn')?.addEventListener('click', () => {
    const container = document.getElementById('income-tax-editor');
    if (container) container.appendChild(buildTaxBracketRow({ min: 0, rate: 0, base: 0 }));
  });

  document.getElementById('save-salary-rules-btn')?.addEventListener('click', saveSalaryRules);
  document.getElementById('reset-salary-rules-btn')?.addEventListener('click', resetSalaryRules);

  // 下拉選單是 salary.html 非同步載入的，晚一點再同步左側清單的選取狀態
  setTimeout(() => renderEmployeeList(document.getElementById('employee-filter')?.value || ''), 800);
}

async function initUnifiedCalcTab() {
  if (!salaryAdminIsAdmin || salaryTabsInitialized.calc) return;
  salaryTabsInitialized.calc = true;

  await loadSalaryEmployeeDirectory();
  mirrorEmployeeOptions('unified-calc-employee', 'calc-employee-select');

  const monthInput = document.getElementById('unified-calc-month');
  if (monthInput && !monthInput.value) {
    monthInput.value = new Date().toISOString().slice(0, 7);
  }

  document.getElementById('unified-calc-employee')?.addEventListener('change', updateCalcTypeHint);
  document.getElementById('unified-calc-btn')?.addEventListener('click', dispatchUnifiedCalculation);

  initManualPayslip();
}

async function initSalaryReportTab() {
  if (!salaryAdminIsAdmin || salaryTabsInitialized.report) return;
  salaryTabsInitialized.report = true;

  await loadSalaryEmployeeDirectory();

  const sourceSelect = document.getElementById('copy-source-employee');
  if (sourceSelect) {
    sourceSelect.innerHTML = `<option value="">${ta('SALARY_SELECT_EMPLOYEE', '請選擇員工')}</option>`;
    salaryEmployeeDirectory.forEach(emp => {
      const option = document.createElement('option');
      option.value = emp.employeeId;
      option.textContent = `${emp.employeeName || emp.employeeId}（${emp.salaryType || ''}）`;
      sourceSelect.appendChild(option);
    });
    sourceSelect.addEventListener('change', () => {
      renderCopyTargets();
      refreshCopyPreview();
    });
  }

  document.querySelectorAll('.copy-group').forEach(el => {
    el.addEventListener('change', refreshCopyPreview);
  });

  renderCopyTargets();

  const batchMonth = document.getElementById('batch-calc-month');
  if (batchMonth && !batchMonth.value) {
    batchMonth.value = new Date().toISOString().slice(0, 7);
  }

  // 異動記錄的員工下拉：只列有薪資設定的人，因為只有他們才會有薪資單
  const auditSelect = document.getElementById('audit-employee');
  if (auditSelect) {
    salaryEmployeeDirectory.forEach(emp => {
      const option = document.createElement('option');
      option.value = emp.employeeId;
      option.textContent = emp.employeeName || emp.employeeId;
      auditSelect.appendChild(option);
    });
  }

  const ackMonth = document.getElementById('ack-month');
  if (ackMonth && !ackMonth.value) ackMonth.value = new Date().toISOString().slice(0, 7);

  document.getElementById('load-ack-btn')?.addEventListener('click', loadPayslipAcknowledgements);
  document.getElementById('load-audit-btn')?.addEventListener('click', loadSalaryAuditLog);
  document.getElementById('batch-calc-btn')?.addEventListener('click', runBatchCalculation);
  document.getElementById('copy-config-btn')?.addEventListener('click', runCopySalaryConfig);
}


// ==================== 手動薪資單（GS/ManualPayslip.gs） ====================
//
// 管理員直接逐項填金額，系統只加總。存檔後任何自動重算都不會覆蓋，
// 員工的「我的薪資」、列印、簽收照常可用。

const MANUAL_PAYSLIP_EARNING_FIELDS = [
  ['baseSalary', 'SALARY_BASE', '基本薪資'],
  ['positionAllowance', 'SALARY_POSITION_ALLOWANCE', '職務加給'],
  ['mealAllowance', 'SALARY_MEAL_ALLOWANCE', '伙食費'],
  ['transportAllowance', 'SALARY_TRANSPORT_ALLOWANCE', '交通補助'],
  ['attendanceBonus', 'SALARY_ATTENDANCE_BONUS', '全勤獎金'],
  ['performanceBonus', 'SALARY_PERFORMANCE_BONUS', '業績獎金'],
  ['otherAllowances', 'SALARY_OTHER_ALLOWANCES_LABEL', '其他津貼'],
  ['weekdayOvertimePay', 'MANUAL_OT_PAY', '加班費'],
  ['mealSubsidy', 'PAYROLL_MEAL_SUBSIDY', '餐費'],
  ['salesBonus', 'PAYROLL_SALES_BONUS', '銷售獎金'],
  ['birthdayGift', 'PAYROLL_BIRTHDAY_GIFT', '生日禮金']
];
const MANUAL_PAYSLIP_DEDUCTION_FIELDS = [
  ['laborFee', 'SALARY_LABOR_INS', '勞保費'],
  ['healthFee', 'SALARY_HEALTH_INS', '健保費'],
  ['employmentFee', 'SALARY_EMPLOYMENT_INS', '就業保險費'],
  ['pensionSelf', 'SALARY_PENSION', '勞退自提'],
  ['incomeTax', 'SALARY_TAX', '所得稅'],
  ['leaveDeduction', 'SALARY_LEAVE_DEDUCT', '請假扣款'],
  ['advanceDeduction', 'PAYROLL_ADVANCE_DEDUCTION', '預支抵扣'],
  ['otherDeductions', 'SALARY_OTHER_DEDUCT', '其他扣款']
];

let manualPayslipState = null;   // { employeeId, yearMonth, exists, data }

function initManualPayslip() {
  mirrorEmployeeOptions('mp-employee', 'calc-employee-select');

  const month = document.getElementById('mp-month');
  if (month && !month.value) {
    // 預設上個月：最常見的用途是補發系統上線前的薪資
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    month.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const build = (containerId, fields) => {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    fields.forEach(([key, labelKey, fallback]) => {
      const group = document.createElement('div');
      group.className = 'form-group';
      const label = document.createElement('label');
      label.className = 'form-label';
      label.setAttribute('for', 'mp-' + key);
      label.textContent = ta(labelKey, fallback);
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.id = 'mp-' + key;
      input.className = 'form-input mp-amount';
      input.dataset.key = key;
      input.dataset.kind = containerId === 'mp-earnings' ? 'add' : 'sub';
      group.appendChild(label);
      group.appendChild(input);
      box.appendChild(group);
    });
  };
  build('mp-earnings', MANUAL_PAYSLIP_EARNING_FIELDS);
  build('mp-deductions', MANUAL_PAYSLIP_DEDUCTION_FIELDS);

  const form = document.getElementById('mp-form');
  if (form) form.oninput = updateManualPayslipTotals;
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on('mp-load', loadManualPayslip);
  on('mp-add-item', () => { addManualPayslipItem(null); updateManualPayslipTotals(); });
  on('mp-save', saveManualPayslip);
  on('mp-delete', deleteManualPayslip);
  on('mp-preview', () => { if (typeof printPayslip === 'function') printPayslip(collectManualPayslipPreview()); });
}

function addManualPayslipItem(item) {
  const list = document.getElementById('mp-items');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'mp-item flex flex-wrap gap-2 items-center';
  row.innerHTML = `
      <select class="form-input mp-item-type" style="width:auto;">
          <option value="add"></option>
          <option value="sub"></option>
      </select>
      <input type="text" maxlength="30" class="form-input mp-item-name" style="flex:1;min-width:8rem;">
      <input type="number" min="0" step="1" class="form-input mp-item-amount" style="width:8rem;">
      <button type="button" class="row-remove-btn mp-item-remove"></button>`;
  const [addOpt, subOpt] = row.querySelectorAll('option');
  addOpt.textContent = ta('PAYROLL_MANUAL_ADD', '加項');
  subOpt.textContent = ta('PAYROLL_MANUAL_SUB', '減項');
  row.querySelector('.mp-item-name').placeholder = ta('PAYROLL_ITEM_NAME', '項目名稱');
  row.querySelector('.mp-item-amount').placeholder = ta('PAYROLL_ITEM_AMOUNT', '金額');
  const remove = row.querySelector('.mp-item-remove');
  remove.textContent = ta('PAYROLL_REMOVE_ITEM', '移除');
  remove.onclick = () => { row.remove(); updateManualPayslipTotals(); };
  row.querySelector('.mp-item-type').value = item && item.type === 'sub' ? 'sub' : 'add';
  row.querySelector('.mp-item-name').value = (item && item.name) || '';
  row.querySelector('.mp-item-amount').value = (item && item.amount) || '';
  list.appendChild(row);
}

function collectManualPayslip() {
  const num = el => (el && el.value.trim() !== '') ? Number(el.value) : 0;
  const payslip = {
    salaryType: document.getElementById('mp-salaryType').value,
    hourlyRate: num(document.getElementById('mp-hourlyRate')),
    totalWorkHours: num(document.getElementById('mp-totalWorkHours')),
    manualItems: Array.from(document.querySelectorAll('#mp-items .mp-item')).map(row => ({
      type: row.querySelector('.mp-item-type').value,
      name: row.querySelector('.mp-item-name').value.trim(),
      amount: row.querySelector('.mp-item-amount').value
    })),
    note: document.getElementById('mp-note').value
  };
  document.querySelectorAll('#mp-form .mp-amount').forEach(input => {
    payslip[input.dataset.key] = num(input);
  });
  return payslip;
}

function manualPayslipTotals(payslip) {
  const sum = fields => fields.reduce((s, [key]) => s + (Number(payslip[key]) || 0), 0);
  const items = payslip.manualItems.filter(i => i.name || Number(i.amount));
  const add = items.filter(i => i.type !== 'sub').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const sub = items.filter(i => i.type === 'sub').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const gross = sum(MANUAL_PAYSLIP_EARNING_FIELDS) + add;
  const deductions = sum(MANUAL_PAYSLIP_DEDUCTION_FIELDS) + sub;
  return { gross: gross, deductions: deductions, net: gross - deductions };
}

function updateManualPayslipTotals() {
  const totals = manualPayslipTotals(collectManualPayslip());
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = formatCurrency(value); };
  set('mp-gross', totals.gross);
  set('mp-deduct', totals.deductions);
  set('mp-net', totals.net);
}

/** 預覽薪資條：用畫面上的數字組出跟正式薪資單一樣的資料 */
function collectManualPayslipPreview() {
  const payslip = collectManualPayslip();
  const totals = manualPayslipTotals(payslip);
  return Object.assign({}, payslip, {
    employeeId: manualPayslipState ? manualPayslipState.employeeId : '',
    employeeName: manualPayslipSelectedEmployee().name,
    yearMonth: manualPayslipState ? manualPayslipState.yearMonth : '',
    grossSalary: totals.gross,
    netSalary: totals.net,
    payslipNote: payslip.note,
    manualItems: payslip.manualItems.filter(i => i.name)
  });
}

function fillManualPayslipForm(data) {
  const value = v => (v === undefined || v === null || Number(v) === 0) ? '' : v;
  document.getElementById('mp-salaryType').value = data.salaryType === '時薪' ? '時薪' : '月薪';
  document.getElementById('mp-hourlyRate').value = value(data.hourlyRate);
  document.getElementById('mp-totalWorkHours').value = value(data.totalWorkHours);
  document.querySelectorAll('#mp-form .mp-amount').forEach(input => {
    input.value = value(data[input.dataset.key]);
  });
  const list = document.getElementById('mp-items');
  list.innerHTML = '';
  (data.manualItems || []).forEach(addManualPayslipItem);
  document.getElementById('mp-note').value = data.payslipNote || '';
  updateManualPayslipTotals();
}

function renderManualPayslipStatus() {
  const status = document.getElementById('mp-status');
  const del = document.getElementById('mp-delete');
  if (!manualPayslipState) return;
  let key = 'MANUAL_PAYSLIP_STATUS_NEW';
  let fallback = '這個月還沒有手動薪資單，已帶入薪資設定的固定金額，請修改成實際要發的金額。';
  if (manualPayslipState.exists) {
    key = 'MANUAL_PAYSLIP_STATUS_EXISTING';
    fallback = '這個月已經有手動薪資單，修改後按儲存即可更新。';
  } else if (manualPayslipState.autoExists) {
    key = 'MANUAL_PAYSLIP_STATUS_AUTO_EXISTS';
    fallback = '這個月已經有系統自動計算的薪資單，儲存手動薪資單後會取代它。';
  }
  if (status) {
    status.textContent = ta(key, fallback);
    status.style.color = manualPayslipState.autoExists && !manualPayslipState.exists ? '#b45309' : '';
  }
  if (del) del.style.display = manualPayslipState.exists ? '' : 'none';
}

/** 員工選單的值是 JSON（{ userId, name, … }），跟薪資試算的選單一樣 */
function manualPayslipSelectedEmployee() {
  const raw = document.getElementById('mp-employee')?.value || '';
  try {
    const employee = JSON.parse(raw);
    return { id: String(employee.userId || ''), name: String(employee.name || '') };
  } catch (error) {
    return { id: raw, name: '' };
  }
}

async function loadManualPayslip() {
  const employeeId = manualPayslipSelectedEmployee().id;
  const yearMonth = document.getElementById('mp-month').value;
  if (!employeeId || !yearMonth) {
    showNotification(ta('SALARY_INPUT_EMPLOYEE_MONTH', '請選擇員工與年月'), 'error');
    return;
  }
  try {
    const res = await callApifetch(`getManualPayslip&employeeId=${encodeURIComponent(employeeId)}` +
                                   `&yearMonth=${encodeURIComponent(yearMonth)}`, null);
    if (!res.ok) {
      showNotification(res.msg || ta('MANUAL_PAYSLIP_SAVE_FAILED', '手動薪資單處理失敗'), 'error');
      return;
    }
    manualPayslipState = { employeeId: employeeId, yearMonth: yearMonth, exists: !!res.exists, autoExists: !!res.autoExists };
    fillManualPayslipForm(res.data || {});
    renderManualPayslipStatus();
    document.getElementById('mp-form').style.display = 'block';
  } catch (error) {
    console.error('載入手動薪資單失敗:', error);
    showNotification(ta('MANUAL_PAYSLIP_SAVE_FAILED', '手動薪資單處理失敗'), 'error');
  }
}

async function saveManualPayslip() {
  if (!manualPayslipState) return;
  if (manualPayslipState.autoExists && !manualPayslipState.exists &&
      !confirm(ta('MANUAL_PAYSLIP_CONFIRM_REPLACE', '這個月已經有自動計算的薪資單，確定要用手動薪資單取代嗎？'))) {
    return;
  }
  const btn = document.getElementById('mp-save');
  if (btn) btn.disabled = true;
  try {
    const res = await callApifetch(
      `saveManualPayslip&employeeId=${encodeURIComponent(manualPayslipState.employeeId)}` +
      `&yearMonth=${encodeURIComponent(manualPayslipState.yearMonth)}` +
      `&payslip=${encodeURIComponent(JSON.stringify(collectManualPayslip()))}`, null);
    if (res.ok) {
      manualPayslipState.exists = true;
      manualPayslipState.autoExists = false;
      if (res.data) fillManualPayslipForm(res.data);
      renderManualPayslipStatus();
      showNotification(ta('MANUAL_PAYSLIP_SAVED', '手動薪資單已儲存，員工可以在「我的薪資」查看'), 'success');
    } else {
      const text = res.code && ta(res.code, '') ? ta(res.code, '') : '';
      showNotification(text || res.msg || ta('MANUAL_PAYSLIP_SAVE_FAILED', '手動薪資單處理失敗'), 'error');
    }
  } catch (error) {
    console.error('儲存手動薪資單失敗:', error);
    showNotification(ta('MANUAL_PAYSLIP_SAVE_FAILED', '手動薪資單處理失敗'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteManualPayslip() {
  if (!manualPayslipState || !manualPayslipState.exists) return;
  if (!confirm(ta('MANUAL_PAYSLIP_DELETE_CONFIRM', '確定要刪除這張手動薪資單嗎？這個月會改回依打卡自動計算。'))) return;
  try {
    const res = await callApifetch(
      `deleteManualPayslip&employeeId=${encodeURIComponent(manualPayslipState.employeeId)}` +
      `&yearMonth=${encodeURIComponent(manualPayslipState.yearMonth)}`, null);
    if (res.ok) {
      showNotification(ta('MANUAL_PAYSLIP_DELETED', '已刪除手動薪資單，這個月改回自動計算'), 'success');
      document.getElementById('mp-form').style.display = 'none';
      manualPayslipState = null;
    } else {
      showNotification(res.msg || ta('MANUAL_PAYSLIP_SAVE_FAILED', '手動薪資單處理失敗'), 'error');
    }
  } catch (error) {
    console.error('刪除手動薪資單失敗:', error);
    showNotification(ta('MANUAL_PAYSLIP_SAVE_FAILED', '手動薪資單處理失敗'), 'error');
  }
}
