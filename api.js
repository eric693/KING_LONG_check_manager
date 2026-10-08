// api.js
//
// 所有對 Apps Script 後端的呼叫都走這裡。
//
// 重點是 API_CONFIG.useHttpPost：用 GET 的話 sessionToken 會留在網址列、瀏覽器
// 歷史、以及沿途每一層的存取紀錄裡；改用 POST 放在請求主體就不會。後端的 doPost
// 會把表單請求轉給 doGet 的路由，所以兩種方式的行為完全一樣。
//
// 以前 script.js 有一份 callApifetch，但 shift.html 不載入 script.js，於是
// shift.js 自己直接組網址 fetch —— 那幾支永遠是 GET，改設定也沒用。抽成這支
// 共用模組之後，只要改 config.js 一個開關，全站都會跟著改。

const API_TIMEOUT_MS = 20000; // 後端沒回應時的等待上限

// 前端是靜態部署（GitHub Pages 推上去就生效），後端要手動重新部署 Apps Script，
// 兩邊不會同時更新。如果後端還是舊版、doPost 不認得這個 action，POST 會失敗，
// 這時自動退回 GET，整個 session 都不再嘗試 POST —— 使用者不會看到系統壞掉。
let _postUnsupported = false;

/**
 * 呼叫後端 API。
 *
 * @param {string} action - "punch" 或 "punch&type=上班&lat=..." 這種格式，
 *                          後面接的查詢字串會被拆成表單欄位。
 * @param {Object} [options]
 * @param {boolean} [options.allowRetry] - 逾時是否可以重試；預設只有唯讀查詢才重試
 * @returns {Promise<Response>} 原始的 fetch Response
 */
async function apiRequest(action, options = {}) {
    const token = localStorage.getItem('sessionToken') || '';

    // action 可能帶著自己的查詢字串，POST 時要拆成表單欄位
    const [name, ...rest] = String(action).split('&');
    const query = rest.join('&');

    // 只讀的查詢失敗時可以安全重試；打卡、送單這類會寫資料的不能重試，
    // 否則一次逾時就變成兩筆記錄。
    const isReadOnly = /^(get|list|check|query|preview|init)/i.test(name);

    const usePost = (typeof API_CONFIG !== 'undefined') &&
                    API_CONFIG.useHttpPost &&
                    !_postUnsupported;

    let url;
    let fetchOptions;

    // 呼叫端自己帶了 token 就不要蓋掉：LINE 打卡連結（linePunch）的 token 是一次性打卡代碼，
    // 不是登入憑證。以前一律覆蓋成登入憑證，後端就找不到打卡連結，LINE 打卡永遠失敗。
    const callerToken = new URLSearchParams(query).has('token');

    if (usePost) {
        const body = new URLSearchParams(query);
        body.set('action', name);
        if (!callerToken) body.set('token', token);
        url = API_CONFIG.apiUrl;
        // 用 x-www-form-urlencoded 才不會觸發預檢請求，Apps Script 也讀得到 e.parameter
        fetchOptions = { method: 'POST', body: body };
    } else {
        url = `${API_CONFIG.apiUrl}?action=${encodeURIComponent(name)}` +
              (callerToken ? '' : `&token=${encodeURIComponent(token)}`) +
              (query ? '&' + query : '');
        fetchOptions = {};
    }

    const attempts = (options.allowRetry ?? isReadOnly) ? 2 : 1;

    let lastError = null;

    for (let i = 0; i < attempts; i++) {
        // Apps Script 偶爾會很久不回應，沒有逾時的話畫面會一直卡在「載入中」
        const controller = new AbortController();
        const timeoutMs = options.timeoutMs || API_TIMEOUT_MS;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, { ...fetchOptions, signal: controller.signal });

            // POST 被後端擋掉（舊版還沒部署）→ 記下來，之後全部改用 GET
            if (usePost && !response.ok && isReadOnly) {
                console.warn('POST 不可用，本次 session 改用 GET:', response.status);
                _postUnsupported = true;
                return apiRequest(action, options);
            }

            return response;
        } catch (err) {
            lastError = (err.name === 'AbortError')
                ? new Error(`連線逾時（${(options.timeoutMs || API_TIMEOUT_MS) / 1000} 秒）`)
                : err;
            if (i < attempts - 1) console.warn('API 重試中:', name, lastError.message);
        } finally {
            clearTimeout(timer);
        }
    }

    // 連線層就失敗的唯讀查詢，也給 GET 一次機會（同樣只降級一次）
    // 寫入類的不重試，避免一次逾時變成兩筆記錄。
    if (usePost && isReadOnly) {
        console.warn('POST 連線失敗，本次 session 改用 GET:', lastError && lastError.message);
        _postUnsupported = true;
        return apiRequest(action, options);
    }

    throw lastError;
}

/**
 * 呼叫 API 並解析 JSON，順便把後端回傳格式統一。
 *
 * 後端各處的回傳鍵不一致（ok / success、data / records 都有人用），
 * 這裡兩邊互補，呼叫端寫哪一種都讀得到。
 */
async function apiRequestJson(action, options = {}) {
    const response = await apiRequest(action, options);

    if (!response.ok) {
        throw new Error(`HTTP 錯誤: ${response.status}`);
    }

    const data = await response.json();

    if (data.success !== undefined && data.ok === undefined) data.ok = data.success;
    if (data.ok !== undefined && data.success === undefined) data.success = data.ok;
    if (data.data !== undefined && data.records === undefined) data.records = data.data;
    if (data.records !== undefined && data.data === undefined) data.data = data.records;

    return data;
}

/**
 * 給已經自己組好 URLSearchParams 的呼叫端用（shift.js 有好幾處是這樣寫的）。
 *
 * params 裡要有 action，token 會自動補上（有的話會覆蓋，以 localStorage 為準）。
 *
 * @param {URLSearchParams} params
 * @returns {Promise<Response>}
 */
async function apiRequestParams(params) {
    const search = new URLSearchParams(params);
    search.set('token', localStorage.getItem('sessionToken') || '');

    const action = search.get('action') || '';
    search.delete('action');

    // 交給 apiRequest 統一處理 GET/POST、逾時與重試
    const query = search.toString();
    return apiRequest(query ? `${action}&${query}` : action);
}


// ==================== 打卡專用：尖峰時段自動重試 ====================
//
// 上下班時間大家同時打卡，Apps Script 同時處理的請求有上限（同一個帳號約 30 個），
// 超過的請求會直接失敗、或回一頁錯誤網頁、或拖到逾時。以前員工只看到「連線失敗」，
// 只能自己再按一次。現在打卡遇到這種「系統忙碌」的失敗會等一下自動重試。
//
// 重試是安全的：
//   ・網頁／QR 打卡：後端會檢查上下班順序，第一次其實已經寫進去的話，重試會回
//     「已經打過這種卡」，這裡當成成功
//   ・LINE 打卡：同一個打卡連結成功後再送，後端回傳同樣的成功結果

const PUNCH_TIMEOUT_MS = 45000;
const PUNCH_RETRY_DELAYS_MS = [0, 2500, 6000];

function isBusyPunchFailure(res) {
    if (!res || res.ok) return false;
    if (res.code === 'ERR_NETWORK' || res.code === 'ERR_INTERNAL' || res.code === 'ERR_BUSY') return true;
    return /too many|simultaneous|timed out|timeout|逾時|busy|忙碌|Service/i.test(String(res.detail || '') + ' ' + String(res.msg || ''));
}

/**
 * @param {string} action   跟 callApifetch 一樣的 action 字串
 * @param {string} [punchType] 上班／下班（用來辨認「其實已經打過了」）
 * @param {function(number)} [onRetry] 第 n 次重試前呼叫（給畫面顯示「正在重試」）
 * @returns {Promise<Object>} 後端回應；連線層失敗時是 { ok:false, code:'ERR_NETWORK' }
 */
async function punchWithRetry(action, punchType, onRetry) {
    const typeKey = punchType === '上班' ? 'PUNCH_IN' : (punchType === '下班' ? 'PUNCH_OUT' : '');
    let last = null;
    let hadFailure = false;

    for (let i = 0; i < PUNCH_RETRY_DELAYS_MS.length; i++) {
        if (PUNCH_RETRY_DELAYS_MS[i]) {
            if (typeof onRetry === 'function') onRetry(i);
            await new Promise(resolve => setTimeout(resolve, PUNCH_RETRY_DELAYS_MS[i]));
        }
        try {
            const res = await apiRequestJson(action, { timeoutMs: PUNCH_TIMEOUT_MS });
            // 前一次失敗、這次卻說「已經打過這種卡」：表示前一次其實已經寫進去了
            if (hadFailure && !res.ok && res.code === 'ERR_PUNCH_SAME_TYPE' && typeKey &&
                res.params && res.params.type === typeKey) {
                return { ok: true, code: 'PUNCH_SUCCESS', params: { type: punchType }, recovered: true };
            }
            if (isBusyPunchFailure(res)) {
                last = res;
                hadFailure = true;
                continue;
            }
            return res;
        } catch (error) {
            console.warn('打卡請求失敗，準備重試:', error && error.message);
            last = { ok: false, code: 'ERR_NETWORK', msg: String((error && error.message) || error) };
            hadFailure = true;
        }
    }
    return last;
}

/**
 * 送出補打卡申請（三個入口共用：當日修正、歷史補打、出勤異常的補打卡）。
 * 系統忙碌時自動重試；前一次其實已經送出、重試時被判定「重複申請」，就當成成功。
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function submitAdjustPunchRequest(params) {
    const action = `adjustPunch&${params.toString()}`;
    let hadFailure = false;
    let last = null;
    for (let i = 0; i < PUNCH_RETRY_DELAYS_MS.length; i++) {
        if (PUNCH_RETRY_DELAYS_MS[i]) {
            showNotification(t('PUNCH_RETRYING', { n: i }), 'warning');
            await new Promise(resolve => setTimeout(resolve, PUNCH_RETRY_DELAYS_MS[i]));
        }
        try {
            const res = await apiRequestJson(action, { timeoutMs: PUNCH_TIMEOUT_MS });
            if (hadFailure && !res.ok && res.code === 'ERR_DUPLICATE_ADJUST_PUNCH') return { ok: true, res: res };
            if (isBusyPunchFailure(res) || res.code === 'ERR_INTERNAL_ERROR') {
                last = res;
                hadFailure = true;
                continue;
            }
            return { ok: !!res.ok, res: res, message: res.ok ? '' : adjustPunchErrorMessage(res) };
        } catch (error) {
            console.warn('補打卡請求失敗，準備重試:', error && error.message);
            last = { ok: false, code: 'ERR_NETWORK' };
            hadFailure = true;
        }
    }
    return { ok: false, res: last, message: t('PUNCH_BUSY_FAILED') };
}

/** 補打卡失敗的訊息：有翻譯用翻譯，沒有就用後端的說明，不要讓員工看到 ERR_… 代碼 */
function adjustPunchErrorMessage(res) {
    if (!res) return t('NOTIF_ADJUST_PUNCH_FAILED');
    const text = res.code ? t(res.code, res.params || {}) : '';
    if (text && text !== res.code) return text;
    return res.msg || t('NOTIF_ADJUST_PUNCH_FAILED');
}

// ==================== 試算表把金額存成日期 ====================
//
// 「月薪資記錄」有幾欄被試算表設成日期格式，寫進去的金額會被存成日期（0 變成 1899/12/30），
// 後端舊版讀回來就變成 -2209190400000 這種毫秒數（新版後端會自己換算，這裡是雙重保險）。
// 正常的金額不可能大到 1e11，看到這種數字就當成日期換算回試算表的日期序號（= 原本的金額）。
function sheetAmount(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) value = Date.parse(value);
    const n = Number(value);
    if (!isFinite(n)) return 0;
    if (Math.abs(n) > 1e11) return Math.round((n - Date.UTC(1899, 11, 30)) / 86400000) + 0;  // +0：不要 -0
    return n;
}

/** 薪資資料裡所有被存成日期的金額換回數字（回傳新物件，不改原本的） */
function normalizeSalaryAmounts(data) {
    if (!data || typeof data !== 'object') return data;
    const out = Array.isArray(data) ? data.slice() : Object.assign({}, data);
    Object.keys(out).forEach(key => {
        const v = out[key];
        if ((typeof v === 'number' && Math.abs(v) > 1e11) ||
            (typeof v === 'string' && /^1[89]\d\d-\d{2}-\d{2}T/.test(v))) {
            out[key] = sheetAmount(v);
        }
    });
    return out;
}
