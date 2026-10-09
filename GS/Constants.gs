// Constants.gs - 系統常數定義（完整版 - 含所有假別）

// ==================== LINE 登入設定 ====================
const LINE_CHANNEL_ID     = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ID");
const LINE_CHANNEL_SECRET = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_SECRET");
const LINE_REDIRECT_URL   = "https://eric693.github.io/KING_LONG_check_manager/";

// ==================== Session 設定 ====================
const SESSION_TTL_MS = 7000 * 60 * 60 * 24; // 1 天
const TOKEN_LENGTH   = 36;

// ==================== 試算表 ====================
// 只讀寫這一份試算表，不管 Apps Script 是不是綁在它上面
const SPREADSHEET_ID = '1Y6da5p8G6TdbrKOsbwrwgYbBM9Ly-CgX6jYL7cHse7M';
let spreadsheetCache_ = null;

function getSpreadsheet_() {
  if (!spreadsheetCache_) spreadsheetCache_ = SpreadsheetApp.openById(SPREADSHEET_ID);
  return spreadsheetCache_;
}

// ==================== 工作表名稱 ====================
// 基礎系統
const SHEET_EMPLOYEES  = '員工名單';
const SHEET_ATTENDANCE = '打卡紀錄';
const SHEET_SESSION    = 'Session';
const SHEET_LOCATIONS  = '打卡地點表';
const SHEET_ADJUST_PUNCH  = "補打卡申請";
// 加班系統
const SHEET_OVERTIME_RECORDS = '加班紀錄';

// 請假系統
const SHEET_LEAVE_RECORDS = '請假紀錄';
const SHEET_LEAVE_BALANCE = '員工假期額度';

// 獎金系統
const SHEET_BONUS_RECORDS = '獎金發放記錄';

// ==================== 三節獎金類型 ====================
const BONUS_TYPES = {
  DRAGON_BOAT:     '端午節獎金',
  MID_AUTUMN:      '中秋節獎金',
  SPRING_FESTIVAL: '春節獎金'
};

// ==================== 薪資類型 ====================
const SALARY_TYPES = {
  MONTHLY: '月薪',
  HOURLY:  '時薪',
  WEEKLY:  '週薪'  // 週領薪水，不扣勞健保
};

// ==================== 工作表名稱（新增）====================
// const SHEET_WORKLOG = '工作日誌';

// ==================== 工作日誌狀態（新增）====================
// const WORKLOG_STATUS = {
//   PENDING: 'PENDING',      // 待審核
//   APPROVED: 'APPROVED',    // 已核准
//   REJECTED: 'REJECTED'     // 已拒絕
// };
// ==================== 員工資料表欄位索引 ====================
const EMPLOYEE_COL = {
  USER_ID: 0,      // A 欄：userId
  EMAIL: 1,        // B 欄：email
  NAME: 2,         // C 欄：displayName
  PICTURE: 3,      // D 欄：pictureUrl
  CREATED: 4,      // E 欄：建立時間
  DEPT: 5,         // F 欄：部門
  HIRE_DATE: 6,    // G 欄：到職日期
  STATUS: 7        // H 欄：狀態
};

// ==================== 假期類型定義（完整版）====================
const LEAVE_TYPES = {
  // 1. 特休假
  ANNUAL_LEAVE: {
    code: 'ANNUAL_LEAVE',
    name: '特休假',
    maxDays: null,  // 根據年資計算
    isPaid: true,
    requiresProof: false,
    category: 'paid'
  },
  
  // 2. 加班補休假
  COMP_TIME_OFF: {
    code: 'COMP_TIME_OFF',
    name: '加班補休假',
    maxDays: null,  // 根據加班時數
    isPaid: true,
    requiresProof: false,
    category: 'paid'
  },
  
  // 3. 事假
  PERSONAL_LEAVE: {
    code: 'PERSONAL_LEAVE',
    name: '事假',
    maxDays: 14,
    isPaid: false,
    requiresProof: false,
    category: 'unpaid'
  },
  
  // 4. 未住院病假
  SICK_LEAVE: {
    code: 'SICK_LEAVE',
    name: '未住院病假',
    maxDays: 30,
    isPaid: true,   // 半薪（30天內）
    requiresProof: true,
    category: 'paid'
  },
  
  // 5. 住院病假
  HOSPITALIZATION_LEAVE: {
    code: 'HOSPITALIZATION_LEAVE',
    name: '住院病假',
    maxDays: 30,    // 一年內合計不得超過30天
    isPaid: true,   // 半薪
    requiresProof: true,
    category: 'paid'
  },
  
  // 6. 喪假
  BEREAVEMENT_LEAVE: {
    code: 'BEREAVEMENT_LEAVE',
    name: '喪假',
    maxDays: 0,  // 依親屬關係而定
    isPaid: true,
    requiresProof: true,
    category: 'paid'
  },
  
  // 7. 婚假
  MARRIAGE_LEAVE: {
    code: 'MARRIAGE_LEAVE',
    name: '婚假',
    maxDays: 8,
    isPaid: true,
    requiresProof: true,
    category: 'paid'
  },
  
  // 8. 陪產檢及陪產假
  PATERNITY_LEAVE: {
    code: 'PATERNITY_LEAVE',
    name: '陪產檢及陪產假',
    maxDays: 7,     // 7天（含陪產檢假5天 + 陪產假2天）
    isPaid: true,
    requiresProof: true,
    category: 'paid'
  },
  
  // 9. 產假
  MATERNITY_LEAVE: {
    code: 'MATERNITY_LEAVE',
    name: '產假',
    maxDays: 56,    // 8週
    isPaid: true,
    requiresProof: true,
    category: 'paid'
  },
  
  // 10. 公假（含兵役假）
  OFFICIAL_LEAVE: {
    code: 'OFFICIAL_LEAVE',
    name: '公假（含兵役假）',
    maxDays: null,  // 無上限
    isPaid: true,
    requiresProof: true,
    category: 'paid'
  },
  
  // 11. 公傷假
  WORK_INJURY_LEAVE: {
    code: 'WORK_INJURY_LEAVE',
    name: '公傷假',
    maxDays: null,  // 無上限
    isPaid: true,   // 全薪
    requiresProof: true,
    category: 'paid'
  },
  
  // 12. 曠工
  ABSENCE_WITHOUT_LEAVE: {
    code: 'ABSENCE_WITHOUT_LEAVE',
    name: '曠工',
    maxDays: null,
    isPaid: false,
    requiresProof: false,
    category: 'unpaid',
    isNegative: true  // 負面記錄
  },
  
  // 13. 天然災害停班
  NATURAL_DISASTER_LEAVE: {
    code: 'NATURAL_DISASTER_LEAVE',
    name: '天然災害停班',
    maxDays: null,
    isPaid: true,
    requiresProof: false,
    category: 'paid'
  },
  
  // 14. 家庭照顧假
  FAMILY_CARE_LEAVE: {
    code: 'FAMILY_CARE_LEAVE',
    name: '家庭照顧假',
    maxDays: 7,
    isPaid: false,
    requiresProof: false,
    category: 'unpaid'
  },
  
  // 15. 生理假
  MENSTRUAL_LEAVE: {
    code: 'MENSTRUAL_LEAVE',
    name: '生理假',
    maxDays: 12,  // 每月1天
    isPaid: true,  // 半薪
    requiresProof: false,
    category: 'paid'
  }
};

// ==================== 喪假天數對照表 ====================
const BEREAVEMENT_DAYS = {
  '父母': 8,
  '配偶': 8,
  '養父母': 8,
  '繼父母': 8,
  '子女': 8,
  '配偶父母': 6,
  '配偶養父母': 6,
  '配偶繼父母': 6,
  '祖父母': 6,
  '配偶祖父母': 3,
  '曾祖父母': 3,
  '兄弟姊妹': 3
};

// ==================== 特休假計算規則（台灣勞基法）====================
const ANNUAL_LEAVE_RULES = [
  { minMonths: 0, maxMonths: 6, days: 0, description: '未滿6個月' },
  { minMonths: 6, maxMonths: 12, days: 3, description: '6個月以上未滿1年' },
  { minYears: 1, maxYears: 2, days: 7, description: '1年以上未滿2年' },
  { minYears: 2, maxYears: 3, days: 10, description: '2年以上未滿3年' },
  { minYears: 3, maxYears: 5, days: 14, description: '3年以上未滿5年' },
  { minYears: 5, maxYears: 10, days: 15, description: '5年以上未滿10年' },
  { minYears: 10, maxYears: 999, days: 15, extraPerYear: 1, maxDays: 30, description: '10年以上' }
];

// ==================== 請假狀態 ====================
const LEAVE_STATUS = {
  PENDING: 'PENDING',      // 待審核
  APPROVED: 'APPROVED',    // 已核准
  REJECTED: 'REJECTED',    // 已拒絕
  CANCELLED: 'CANCELLED'   // 已取消
};

// ==================== 系統設定 ====================
const LEAVE_SYSTEM_CONFIG = {
  allowViewOthersLeave: false,
  allowFutureLeave: true,
  advanceNoticeDays: 0,
  allowHalfDay: true,
  allowNegativeBalance: false
};

// ==================== 工具函數 ====================

/**
 * 取得假期類型資訊
 */
function getLeaveTypeInfo(leaveTypeCode) {
  return LEAVE_TYPES[leaveTypeCode] || null;
}

/**
 * 取得所有假期類型列表（按順序）
 */
function getAllLeaveTypes() {
  return [
    'ANNUAL_LEAVE',
    'COMP_TIME_OFF',
    'PERSONAL_LEAVE',
    'SICK_LEAVE',
    'HOSPITALIZATION_LEAVE',
    'BEREAVEMENT_LEAVE',
    'MARRIAGE_LEAVE',
    'PATERNITY_LEAVE',
    'MATERNITY_LEAVE',
    'OFFICIAL_LEAVE',
    'WORK_INJURY_LEAVE',
    'ABSENCE_WITHOUT_LEAVE',
    'NATURAL_DISASTER_LEAVE',
    'FAMILY_CARE_LEAVE',
    'MENSTRUAL_LEAVE'
  ];
}

/**
 * 取得當前年度
 */
function getCurrentLeaveYear() {
  return new Date().getFullYear();
}

/**
 * 檢查是否為管理員
 */
function isAdmin(user) {
  return user && user.dept === '管理員';
}

// ==================== 系統版本資訊 ====================
const SYSTEM_VERSION = {
  version: '0.8.0',
  buildDate: '2025-12-13',
  features: [
    '打卡系統',
    '補打卡審核',
    '打卡紀錄',
    '地點管理',
    '加班管理',
    '請假管理（15種假別）'
  ]
};