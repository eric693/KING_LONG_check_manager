// 各模組的操作說明（參考 shopcare 的作法）
// 每個功能頁在最上方插入一塊可收合的「操作說明」：先講這頁在做什麼，
// 再列操作步驟、注意事項與名詞解釋。收合狀態記在 localStorage，
// 熟了之後收起來就不會一直擋著看資料。
//
// 說明文字本身放在 i18n/help/<lang>.json，跟系統其他語系檔一樣有七種語言，
// 只會載入目前這個語言的檔案；語言切換時（#language-switcher）會自動重畫。
// 結構：{ ui:{...}, modules:{ 容器id: { intro, steps[], notes[], terms[[名詞,解釋]] } } }
(function () {
  const FALLBACK_LANG = 'zh-TW';
  const SUPPORTED = ['zh-TW', 'en-US', 'ja', 'ko', 'vi', 'th', 'id'];
  // 本機載不到時（例如頁面被放在別的網域）改用與 script.js 相同的來源
  const REMOTE_BASE = 'https://eric693.github.io/KING_LONG_check_manager/i18n/help/';

  const CSS = `
  .help-box{border:1px solid #c7d2fe;background:#eef2ff;border-radius:8px;margin-bottom:16px;overflow:hidden}
  .help-toggle{display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:0;cursor:pointer;font:inherit;font-size:13px;font-weight:600;color:#4338ca;text-align:left}
  .help-mark{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#4f46e5;color:#fff;font-size:12px;font-weight:700;flex:none}
  .help-arrow{margin-left:auto;font-weight:400;color:#6b7280}
  .help-body{display:none;padding:0 14px 12px 14px;font-size:13px;line-height:1.85;color:#374151}
  .help-box.open .help-body{display:block}
  .help-intro{margin:0 0 8px}
  .help-h{font-weight:600;margin:10px 0 4px;color:#4338ca}
  .help-body ol,.help-body ul{margin:0;padding-left:20px;list-style:revert}
  .help-body li{margin-bottom:3px}
  .help-body dl{margin:0}
  .help-body dt{font-weight:600}
  .help-body dd{margin:0 0 5px 0;color:#6b7280}
  .dark .help-box{border-color:#4338ca;background:rgba(67,56,202,.15)}
  .dark .help-toggle{color:#a5b4fc}
  .dark .help-h{color:#a5b4fc}
  .dark .help-body{color:#d1d5db}
  .dark .help-body dd,.dark .help-arrow{color:#9ca3af}
  `;

  const DEFAULT_UI = { title: '操作說明', expand: '展開', collapse: '收合', steps: '操作步驟', notes: '注意事項', terms: '名詞說明' };

  let data = null;   // 目前語言的說明內容
  let loaded = null; // 已載入的語言

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const storeKey = key => 'help_open_' + key;
  // 第一次看到某頁預設展開，之後照使用者自己收放的狀態
  const isOpen = key => { try { return localStorage.getItem(storeKey(key)) !== '0'; } catch { return true; } };

  function currentLang() {
    let lang;
    try { lang = localStorage.getItem('lang'); } catch {}
    return SUPPORTED.includes(lang) ? lang : FALLBACK_LANG;
  }

  async function fetchLang(lang) {
    for (const url of [`i18n/help/${lang}.json`, REMOTE_BASE + lang + '.json']) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch {}
    }
    return null;
  }

  async function load(lang) {
    let json = await fetchLang(lang);
    if (!json && lang !== FALLBACK_LANG) json = await fetchLang(FALLBACK_LANG);
    if (json) { data = json; loaded = lang; }
    return json;
  }

  function boxHtml(key, help, ui) {
    const li = arr => (arr || []).map(t => `<li>${esc(t)}</li>`).join('');
    const open = isOpen(key);
    const steps = help.steps && help.steps.length ? `<div class="help-h">${esc(ui.steps)}</div><ol>${li(help.steps)}</ol>` : '';
    const notes = help.notes && help.notes.length ? `<div class="help-h">${esc(ui.notes)}</div><ul>${li(help.notes)}</ul>` : '';
    const terms = help.terms && help.terms.length
      ? `<div class="help-h">${esc(ui.terms)}</div><dl>` +
        help.terms.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('') + `</dl>` : '';
    return `<section class="help-box${open ? ' open' : ''}" data-help="${esc(key)}">
      <button type="button" class="help-toggle">
        <span class="help-mark">?</span>${esc(ui.title)}<span class="help-arrow">${open ? esc(ui.collapse) : esc(ui.expand)}</span>
      </button>
      <div class="help-body">
        ${help.intro ? `<p class="help-intro">${esc(help.intro)}</p>` : ''}
        ${steps}${notes}${terms}
      </div>
    </section>`;
  }

  function injectStyle() {
    if (document.getElementById('help-style')) return;
    const st = document.createElement('style');
    st.id = 'help-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // 重畫所有說明區塊；語言換了就整塊換掉
  function render() {
    if (!data || !data.modules) return;
    const ui = Object.assign({}, DEFAULT_UI, data.ui || {});
    injectStyle();
    Object.keys(data.modules).forEach(key => {
      const host = document.getElementById(key);
      if (!host) return;
      const old = host.querySelector(':scope > .help-box');
      if (old) old.remove();
      host.insertAdjacentHTML('afterbegin', boxHtml(key, data.modules[key], ui));
      const box = host.querySelector(':scope > .help-box');
      box.querySelector('.help-toggle').onclick = () => {
        const open = box.classList.toggle('open');
        box.querySelector('.help-arrow').textContent = open ? ui.collapse : ui.expand;
        try { localStorage.setItem(storeKey(key), open ? '1' : '0'); } catch {}
      };
    });
  }

  async function mount(lang) {
    const want = lang || currentLang();
    if (want !== loaded) await load(want);
    render();
  }

  // 語言切換：跟著 #language-switcher 走，其他頁面可自行呼叫 Help.mount(lang)
  document.addEventListener('change', e => {
    const el = e.target;
    if (el && el.id === 'language-switcher') mount(el.value);
  });

  window.Help = { mount, render, get data() { return data; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount());
  else mount();
})();
