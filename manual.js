// manual.js
//
// 使用手冊：把 i18n/help/<lang>.json 裡各功能頁的「操作說明」彙整成一頁。
//
// 內容不另外維護一份，直接讀 help.js 用的同一份資料，這樣頁面上看到的說明
// 跟手冊永遠一致，不會改了一邊忘了另一邊。
//
// 章節標題沿用主系統既有的分頁名稱鍵（TAB_* / SALARY_TAB_* / SHIFT_TAB_*），
// 所以七種語言都不用額外翻譯。

(function () {
  const SUPPORTED = ['zh-TW', 'en-US', 'ja', 'ko', 'vi', 'th', 'id'];
  const FALLBACK_LANG = 'zh-TW';
  const REMOTE_BASE = 'https://eric693.github.io/buono_check_manager/i18n/help/';

  // 手冊的編排順序，以及每個說明模組對應的標題翻譯鍵。
  // 這裡刻意寫死順序，讓手冊照使用者實際會走的流程排，而不是 JSON 的鍵順序。
  const GROUPS = [
    {
      labelKey: 'MANUAL_GROUP_MAIN',
      fallback: '主系統',
      modules: [
        ['dashboard-view', 'TAB_DASHBOARD'],
        ['monthly-view', 'TAB_MONTHLY'],
        ['location-view', 'TAB_LOCATION'],
        ['shift-view', 'TAB_SHIFT'],
        ['overtime-view', 'TAB_OVERTIME'],
        ['leave-view', 'TAB_LEAVE'],
        ['worklog-view', 'TAB_WORKLOG'],
        ['expense-view', 'TAB_EXPENSE'],
        ['salary-view', 'TAB_SALARY'],
        ['admin-view', 'TAB_ADMIN']
      ]
    },
    {
      labelKey: 'MANUAL_GROUP_SHIFT',
      fallback: '排班管理',
      modules: [
        ['view-tab', 'SHIFT_TAB_VIEW'],
        ['add-tab', 'SHIFT_TAB_ADD'],
        ['batch-tab', 'SHIFT_TAB_BATCH'],
        ['templates-tab', 'SHIFT_TAB_TEMPLATES'],
        ['stats-tab', 'SHIFT_TAB_STATS']
      ]
    },
    {
      labelKey: 'MANUAL_GROUP_SALARY',
      fallback: '薪資管理',
      modules: [
        ['employee-salary', 'SALARY_TAB_EMPLOYEE'],
        ['salary-setting', 'SALARY_TAB_SETTING'],
        ['salary-calc', 'SALARY_TAB_CALC'],
        ['manual-payslip', 'MANUAL_PAYSLIP_TITLE'],
        ['salary-report', 'SALARY_TAB_REPORT'],
        ['bonus-records', 'SALARY_TAB_BONUS']
      ]
    }
  ];

  const DEFAULT_UI = {
    steps: '操作步驟',
    notes: '注意事項',
    terms: '名詞說明'
  };

  let helpData = null;

  /**
   * 翻譯：i18n.js 的 t() 找不到鍵時會原樣回傳，這裡改成退回寫死的中文
   */
  function tr(key, fallback) {
    if (typeof t !== 'function') return fallback;
    const text = t(key);
    return (text === key) ? fallback : text;
  }

  function currentLang() {
    let lang;
    try { lang = localStorage.getItem('lang'); } catch (error) { /* 無痕模式讀不到 */ }
    if (SUPPORTED.includes(lang)) return lang;
    return (typeof detectLang === 'function') ? detectLang() : FALLBACK_LANG;
  }

  async function fetchHelp(lang) {
    for (const url of [`i18n/help/${lang}.json`, REMOTE_BASE + lang + '.json']) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch (error) {
        console.warn('載入說明資料失敗:', url, error);
      }
    }
    return null;
  }

  function listItems(parent, items, ordered) {
    if (!items || items.length === 0) return;
    const list = document.createElement(ordered ? 'ol' : 'ul');
    items.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;   // 用 textContent，說明文字裡的符號不會被當成 HTML
      list.appendChild(li);
    });
    parent.appendChild(list);
  }

  function label(parent, text) {
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = text;
    parent.appendChild(el);
  }

  function buildSection(moduleKey, titleKey, help, ui) {
    const section = document.createElement('section');
    section.className = 'section';
    section.id = 'manual-' + moduleKey;

    const heading = document.createElement('h3');
    heading.textContent = tr(titleKey, moduleKey);
    section.appendChild(heading);

    if (help.intro) {
      const intro = document.createElement('p');
      intro.className = 'intro';
      intro.textContent = help.intro;
      section.appendChild(intro);
    }

    if (help.steps && help.steps.length) {
      label(section, ui.steps);
      listItems(section, help.steps, true);
    }

    if (help.notes && help.notes.length) {
      label(section, ui.notes);
      listItems(section, help.notes, false);
    }

    if (help.terms && help.terms.length) {
      label(section, ui.terms);
      const dl = document.createElement('dl');
      help.terms.forEach(([term, explanation]) => {
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.textContent = explanation;
        dl.appendChild(dt);
        dl.appendChild(dd);
      });
      section.appendChild(dl);
    }

    return section;
  }

  function render() {
    const content = document.getElementById('manual-content');
    const toc = document.getElementById('manual-toc');
    if (!content || !toc || !helpData || !helpData.modules) return;

    const ui = Object.assign({}, DEFAULT_UI, helpData.ui || {});

    content.innerHTML = '';
    toc.innerHTML = '';

    GROUPS.forEach(group => {
      // 說明資料裡沒有的模組就跳過，整組都沒有就連標題都不要出現
      const available = group.modules.filter(([key]) => helpData.modules[key]);
      if (available.length === 0) return;

      const groupTitle = tr(group.labelKey, group.fallback);

      const title = document.createElement('h2');
      title.className = 'group-title';
      title.textContent = groupTitle;
      content.appendChild(title);

      const tocLabel = document.createElement('div');
      tocLabel.className = 'group-label';
      tocLabel.textContent = groupTitle;
      toc.appendChild(tocLabel);

      available.forEach(([moduleKey, titleKey]) => {
        content.appendChild(buildSection(moduleKey, titleKey, helpData.modules[moduleKey], ui));

        const link = document.createElement('a');
        link.href = '#manual-' + moduleKey;
        link.textContent = tr(titleKey, moduleKey);
        toc.appendChild(link);
      });
    });
  }

  async function mount(lang) {
    const want = SUPPORTED.includes(lang) ? lang : currentLang();

    // 介面字串與說明資料是兩份檔案，都要換成同一個語言
    if (typeof loadTranslations === 'function') await loadTranslations(want);

    let data = await fetchHelp(want);
    if (!data && want !== FALLBACK_LANG) data = await fetchHelp(FALLBACK_LANG);

    if (!data) {
      const content = document.getElementById('manual-content');
      if (content) {
        content.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'loading';
        p.textContent = tr('MANUAL_LOAD_FAILED', '說明資料載入失敗，請重新整理頁面。');
        content.appendChild(p);
      }
      return;
    }

    helpData = data;
    render();
  }

  async function init() {
    const lang = currentLang();
    const switcher = document.getElementById('language-switcher');
    if (switcher) {
      switcher.value = lang;
      switcher.addEventListener('change', e => mount(e.target.value));
    }

    document.getElementById('manual-print-btn')?.addEventListener('click', () => window.print());

    await mount(lang);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
