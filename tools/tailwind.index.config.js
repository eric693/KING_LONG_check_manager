// index.html（主頁）用的 Tailwind 設定。
// 主頁原本用 cdn.tailwindcss.com 在手機上即時編譯（每次開頁都要下載編譯器、掃描整頁），
// 這裡改成事先編好的 tailwind.index.css。規則和 tailwind.salary.config.js 一樣：
// 只有在下列檔案裡「看得到完整字串」的 class 才會輸出，不要用字串拼接產生 class 名稱。
//
// 改了主頁或下列任一支 js 的 class 之後要重新產生：
//   bash tools/build-tailwind.sh
// node tools/wiring-check.js 會檢查產出檔是否還跟得上原始碼。
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './config.js',
    './api.js',
    './utils.js',
    './libs.js',
    './i18n.js',
    './holidays.js',
    './worktime.js',
    './help.js',
    './script.js',
    './announcements.js',
    './audit-log.js',
    './expense.js',
    './users.js',
    './punch-adjust.js',
    './qr-punch.js',
    './attachments.js',
    './location-picker.js',
    './analytics.js',
    './attendance-dashboard.js',
    './biometric.js',
    './reports.js',
    './overtime.js',
    './leave.js',
    './payslip.js',
    './salary.js',
    './worklog.js',
    './pwa.js'
  ],
  theme: { extend: {} },
  plugins: []
};
