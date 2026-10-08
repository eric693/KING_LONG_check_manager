// sw.js — Service Worker
//
// 目的是讓系統可以「安裝到主畫面」並在離線時仍打得開畫面，
// 不是拿來做離線打卡。打卡、請假、查詢這些都會打 Apps Script（跨網域），
// 一律直接走網路、完全不快取，避免使用者看到過期的出勤或薪資資料。
//
// 改版時記得把 CACHE_VERSION 加一，舊快取會在 activate 時清掉。

const CACHE_VERSION = 'v7';
const CACHE_NAME = `attendance-shell-${CACHE_VERSION}`;

// 安裝時先抓下來的「外殼」：沒有網路也能把畫面畫出來的最小集合
const PRECACHE_URLS = [
  './',
  './index.html',
  './salary.html',
  './shift.html',
  './manual.html',
  './manual.js',
  './style.css',
  './tailwind.salary.css',
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
  './kiosk.html',
  './kiosk.js',
  './users.js',
  './punch-adjust.js',
  './qr-punch.js',
  './attachments.js',
  './location-picker.js',
  './analytics.js',
  './biometric.js',
  './reports.js',
  './overtime.js',
  './leave.js',
  './payslip.js',
  './salary.js',
  './worklog.js',
  './shift.js',
  './qrcode.min.js',
  './manifest.webmanifest',
  './0rigin.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './i18n/zh-TW.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // 單一檔案抓失敗不該讓整個安裝失敗（例如某個語系檔暫時 404）
    await Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key.startsWith('attendance-shell-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

/**
 * 圖片、字型這類不會變的資源：有快取就直接用
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * 程式碼與頁面：永遠先問網路，拿不到才退回快取
 * （寧可慢一點，也不要讓使用者跑到舊版的計算邏輯）
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // 離線又沒快取時，導頁請求至少把首頁外殼給它
    if (request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 只處理同網域的 GET；Apps Script API、CDN 一律不碰
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
