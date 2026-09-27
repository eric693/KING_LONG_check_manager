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
        const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

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
                ? new Error(`連線逾時（${API_TIMEOUT_MS / 1000} 秒）`)
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
