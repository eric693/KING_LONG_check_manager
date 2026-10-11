// 串接檢查：把前端呼叫、Main.gs 路由、GS handler、HTML 元素四邊對起來，
// 任何一邊缺了就列出來。純靜態掃描，不需要連到 Apps Script。
//
// 用法：node tools/wiring-check.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const listFiles = (dir, ext) =>
  fs.readdirSync(path.join(ROOT, dir))
    .filter(f => f.endsWith(ext))
    .map(f => path.join(dir, f));

const problems = [];
const report = (section, items) => {
  console.log(`\n── ${section} ──`);
  if (items.length === 0) {
    console.log('   OK');
  } else {
    items.forEach(i => console.log('   ✗ ' + i));
    problems.push(...items.map(i => `${section}: ${i}`));
  }
};

const gsFiles = listFiles('GS', '.gs');
const gsSource = gsFiles.map(read).join('\n');
const frontFiles = [...listFiles('.', '.js'), ...listFiles('.', '.html')]
  .filter(f => !f.includes('qrcode.min') && !f.startsWith('tools'));
const frontSource = frontFiles.map(read).join('\n');

// ---------- 1. 後端路由 → handler 函式 ----------
const main = read('GS/Main.gs');
const routes = new Map();   // action -> handler 名稱（抓不到對應函式時為 null）
// 先把所有 case 標籤收下來，這才是「這個 action 有沒有被處理」的依據
for (const m of main.matchAll(/case\s+["'](\w+)["']\s*:/g)) {
  routes.set(m[1], null);
}
// 再補上「case 後面直接 return respond(handleXxx(...))」這種可以靜態對到函式的
for (const m of main.matchAll(/case\s+["'](\w+)["']\s*:\s*(?:\r?\n)?\s*return\s+respond1?\((\w+)\(/g)) {
  routes.set(m[1], m[2]);
}
for (const m of main.matchAll(/case\s+["'](\w+)["']\s*:\s*(?:\r?\n)?\s*return\s+(\w+)\(\)/g)) {
  if (!routes.get(m[1])) routes.set(m[1], m[2]);
}

const definedGsFns = new Set(
  [...gsSource.matchAll(/^\s*function\s+(\w+)\s*\(/gm)].map(m => m[1])
);

report('後端路由指向的 handler 不存在', [...routes.entries()]
  .filter(([, fn]) => fn && !definedGsFns.has(fn))
  .map(([action, fn]) => `${action} → ${fn}()`));

// ---------- 2. 前端呼叫的 action → 後端路由 ----------
const calledActions = new Set();
for (const m of frontSource.matchAll(/callApifetch\(\s*[`'"]([A-Za-z]\w*)/g)) {
  calledActions.add(m[1]);
}
// 樣板字串組出來的（例如 `${action}&...`）抓不到，另外撈常見寫法
for (const m of frontSource.matchAll(/action=([A-Za-z]\w*)/g)) {
  calledActions.add(m[1]);
}

report('前端呼叫了但後端沒有路由的 action',
  [...calledActions].filter(a => !routes.has(a)).sort());

// ---------- 3. 後端 handler 有寫但沒接路由 ----------
const handlerFns = [...definedGsFns].filter(fn => /^handle[A-Z]/.test(fn));
const routedHandlers = new Set([...routes.values()].filter(Boolean));
// 有些 handler 是被別的程式直接呼叫的（LINE webhook、內部流程），不走 doGet 路由
const calledElsewhere = (fn) => {
  const pattern = new RegExp(`\\b${fn}\\s*\\(`, 'g');
  const hits = (gsSource.match(pattern) || []).length;
  return hits > 1;  // 1 次是自己的宣告
};
// 已知例外：LINE Bot 的文字指令處理函式，簽章是 (replyToken, userId, ...) 而不是 (params)，
// 本來就不該掛在 doGet 路由上；目前還沒接到任何指令，先留著。
const KNOWN_UNROUTED = new Set(['handleLeaveReview']);
report('有 handler 但沒掛上路由、也沒被其他程式呼叫',
  handlerFns
    .filter(fn => !routedHandlers.has(fn) && !calledElsewhere(fn) && !KNOWN_UNROUTED.has(fn))
    .sort());

// ---------- 4. HTML 的 onclick/onchange 指向的函式 ----------
const htmlFiles = listFiles('.', '.html');
const definedFrontFns = new Set(
  [...frontSource.matchAll(/function\s+(\w+)\s*\(/g)].map(m => m[1])
);
const inlineMissing = [];
for (const file of htmlFiles) {
  const html = read(file);
  for (const m of html.matchAll(/on(?:click|change|input|submit)="(\w+)\(/g)) {
    if (!definedFrontFns.has(m[1])) inlineMissing.push(`${file}: ${m[1]}()`);
  }
}
report('HTML 內嵌事件指向未定義的函式', [...new Set(inlineMissing)].sort());

// ---------- 5. 新模組用到的 DOM id 是否存在 ----------
const pageIds = {};
for (const file of htmlFiles) {
  const html = read(file);
  pageIds[file] = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
}

const checkIds = (jsFile, pages) => {
  const js = read(jsFile);
  const ids = new Set(
    [...js.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1])
  );
  return [...ids]
    .filter(id => !pages.some(p => pageIds[p].has(id)))
    .map(id => `${jsFile}: #${id}`);
};

report('salary-admin.js 用到但頁面沒有的 id', checkIds('salary-admin.js', ['salary.html']));
report('worktime.js 用到但頁面沒有的 id',
  checkIds('worktime.js', ['index.html', 'salary.html']));
report('pwa.js 用到但頁面沒有的 id',
  checkIds('pwa.js', ['index.html', 'salary.html', 'shift.html']));

// ---------- 6. PWA 檔案 ----------
const pwaMissing = [];
const manifest = JSON.parse(read('manifest.webmanifest'));
manifest.icons.forEach(icon => {
  if (!fs.existsSync(path.join(ROOT, icon.src))) pwaMissing.push(`manifest 少了圖示 ${icon.src}`);
});
const sw = read('sw.js');
for (const m of sw.matchAll(/'\.\/([^']+)'/g)) {
  const target = m[1];
  if (target === '' || target.endsWith('/')) continue;
  if (!fs.existsSync(path.join(ROOT, target))) pwaMissing.push(`sw.js 預快取了不存在的 ${target}`);
}
htmlFiles.forEach(file => {
  const html = read(file);
  if (!html.includes('manifest.webmanifest')) pwaMissing.push(`${file} 沒有連到 manifest`);
  if (!html.includes('pwa.js')) pwaMissing.push(`${file} 沒有載入 pwa.js`);
});
report('PWA 設定', pwaMissing);

// ---------- 7. i18n：HTML 用到的鍵是否每個語系都有 ----------
const langs = fs.readdirSync(path.join(ROOT, 'i18n'))
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''));
const dicts = {};
langs.forEach(l => { dicts[l] = JSON.parse(read(`i18n/${l}.json`)); });

const usedKeys = new Set();
htmlFiles.forEach(file => {
  const html = read(file);
  for (const m of html.matchAll(/data-i18n(?:-option|-key|-label)?="([^"]+)"/g)) usedKeys.add(m[1]);
});

const i18nMissing = [];
[...usedKeys].sort().forEach(key => {
  const missing = langs.filter(l => !(key in dicts[l]));
  if (missing.length === langs.length) {
    i18nMissing.push(`${key}：所有語系都沒有`);
  } else if (missing.length > 0) {
    i18nMissing.push(`${key}：缺 ${missing.join(', ')}`);
  }
});
report('i18n 翻譯鍵', i18nMissing);

// ---------- 8. 測試函式要集中在 Tests.gs ----------
// 這些函式是從 Apps Script 編輯器手動執行的，不屬於任何執行路徑，
// 但 Apps Script 每次執行都要解析專案裡全部的 .gs。
const strayTests = [];
gsFiles.filter(f => !f.endsWith('Tests.gs')).forEach(file => {
  const src = read(file);
  for (const m of src.matchAll(/^function ((?:test|debug)[A-Z]\w*)\s*\(/gm)) {
    strayTests.push(`${m[1]}() 還留在 ${file}`);
  }
});
report('測試函式集中度', strayTests);

// ---------- 9. 前端同名函式不能重複定義 ----------
// 所有前端腳本共用一個全域範圍，後載入的會蓋掉先載入的，症狀跟 GS 一樣難查。
const frontFunctionLocations = new Map();
listFiles('.', '.js')
  .filter(f => !f.includes('qrcode.min'))
  .forEach(file => {
    const src = read(file);
    for (const m of src.matchAll(/^(?:async )?function (\w+)\s*\(/gm)) {
      if (!frontFunctionLocations.has(m[1])) frontFunctionLocations.set(m[1], []);
      frontFunctionLocations.get(m[1]).push(file);
    }
  });

report('前端同名函式重複定義',
  [...frontFunctionLocations.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => `${name}()：${files.join('、')}`)
    .sort());

// ---------- 10. GS 同名函式不能重複定義 ----------
// Apps Script 把所有 .gs 當成同一個全域範圍，同名函式後載入的會蓋掉先載入的，
// 而檔案順序不是我們控制的 —— 兩份內容不同時，實際跑到哪一份等於不可預期。
const gsFunctionLocations = new Map();
gsFiles.forEach(file => {
  const src = read(file);
  for (const m of src.matchAll(/^function (\w+)\s*\(/gm)) {
    if (!gsFunctionLocations.has(m[1])) gsFunctionLocations.set(m[1], []);
    gsFunctionLocations.get(m[1]).push(file);
  }
});

report('GS 同名函式重複定義',
  [...gsFunctionLocations.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => `${name}()：${files.join('、')}`)
    .sort());

// ---------- 11. 月薪資記錄：表頭順序必須與 saveMonthlySalary 寫入的順序一致 ----------
// saveMonthlySalary 是按「位置」寫入的，表頭跟它差一格，整排欄位的名稱就會錯位，
// 而 getMySalary 是依名稱取值的 —— 薪資單上就會顯示到別欄的金額。
const salarySource = read('GS/SalaryManagement.gs');
const salaryProblems = [];

const headerMatch = salarySource.match(/const MONTHLY_SALARY_HEADERS = \[([\s\S]*?)\n\];/);
const rowMatch = salarySource.match(/function saveMonthlySalary\(salaryData\)[\s\S]*?const row = \[([\s\S]*?)\n    \];/);

if (!headerMatch || !rowMatch) {
  salaryProblems.push('找不到 MONTHLY_SALARY_HEADERS 或 saveMonthlySalary 的 row 定義');
} else {
  // 表頭：字串字面值，或指向自訂項目欄名的常數
  const headerNames = [];
  for (const m of headerMatch[1].matchAll(/"([^"]+)"|\b(MONTHLY_CUSTOM_\w+_COLUMN)\b/g)) {
    headerNames.push(m[1] || m[2]);
  }

  // 寫入：每一列取它引用的中文欄名（salaryData['X'] 的 X），沒有就算它一欄
  const rowEntries = [];
  rowMatch[1].split('\n').forEach(line => {
    const text = line.trim();
    if (!text || text.startsWith('//')) return;
    const named = text.match(/salaryData\['([^']+)'\]/);
    rowEntries.push(named ? named[1] : null);
  });

  if (headerNames.length !== rowEntries.length) {
    salaryProblems.push(`表頭 ${headerNames.length} 欄，但 saveMonthlySalary 寫入 ${rowEntries.length} 欄`);
  }

  rowEntries.forEach((name, i) => {
    if (name && headerNames[i] && name !== headerNames[i]) {
      salaryProblems.push(`第 ${i + 1} 欄錯位：表頭是「${headerNames[i]}」，卻寫入「${name}」的值`);
    }
  });
}

report('月薪資記錄欄位對齊', salaryProblems);

// ---------- 12. 操作說明：每個 help 模組都要有對應的容器 ----------
// help.js 是用容器 id 去掛說明區塊的，改版換了 id 就會靜靜地少一塊說明，
// 畫面上看不出來，所以在這裡擋住。
const helpLangs = fs.readdirSync(path.join(ROOT, 'i18n/help'))
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''));
const helpDicts = {};
helpLangs.forEach(l => { helpDicts[l] = JSON.parse(read(`i18n/help/${l}.json`)); });

const allIds = new Set();
Object.values(pageIds).forEach(ids => ids.forEach(id => allIds.add(id)));

const helpProblems = [];
const baseModules = Object.keys(helpDicts[helpLangs[0]].modules);

baseModules.forEach(key => {
  if (!allIds.has(key)) helpProblems.push(`說明模組「${key}」找不到對應的容器 id`);
});

// 每個語系的模組要一致，少一個就是某個語言看不到那塊說明
helpLangs.slice(1).forEach(lang => {
  const keys = Object.keys(helpDicts[lang].modules);
  baseModules.filter(k => !keys.includes(k))
    .forEach(k => helpProblems.push(`${lang} 缺少說明模組「${k}」`));
  keys.filter(k => !baseModules.includes(k))
    .forEach(k => helpProblems.push(`${lang} 多出說明模組「${k}」`));
});

report('操作說明模組', helpProblems);

// ---------- 事先編好的 Tailwind 產出檔 ----------
// salary.html、index.html 用事先編好的 tailwind.*.css，不是 CDN。新增 class 後忘了重編，
// 那個 class 就不會有樣式，畫面也不會報錯，所以在這裡把它抓出來。
const TW = new RegExp('^(?:(?:sm|md|lg|xl|2xl|dark|hover|focus|active|disabled|group-hover|first|last):)*-?(?:' +
  '(?:text|bg|border|border-[trblxy]|p[xytrbl]?|m[xytrbl]?|w|h|min-w|max-w|min-h|max-h|gap|gap-[xy]|space-[xy]|' +
  'rounded(?:-[trbl]{1,2})?|font|shadow|grid-cols|col-span|items|justify|self|leading|tracking|opacity|z|inset|' +
  'top|left|right|bottom|divide|ring|from|to|via|overflow|overflow-[xy]|whitespace|cursor|duration|ease|order|' +
  'flex|basis|grow|shrink|list|align|object|translate-[xy]|scale|rotate)-[\\w./%\\[\\]#-]+' +
  '|flex|grid|hidden|block|inline|inline-block|inline-flex|table|truncate|uppercase|lowercase|italic|underline|' +
  'relative|absolute|fixed|sticky|transition|rounded|shadow|border|container|sr-only|grow|shrink)$');
const escapeSel = t => t.replace(/([:/.[\]%#])/g, '\\$1');

function checkTailwindBuild(page) {
  const twProblems = [];
  const cssFile = `tailwind.${page}.css`;
  const twConfig = require(`./tailwind.${page}.config.js`);
  const twCss = fs.existsSync(path.join(ROOT, cssFile)) ? read(cssFile) : null;
  if (!twCss) return [`找不到 ${cssFile}，請執行 bash tools/build-tailwind.sh`];
  // 頁面自己 <style> 和 style.css 裡定義的 class 不算
  const pageCss = (read(`${page}.html`).match(/<style>[\s\S]*?<\/style>/g) || []).join('\n') + read('style.css');
  const custom = new Set([...pageCss.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
  const seen = new Map();   // class -> 出現的檔案
  twConfig.content.forEach(file => {
    const src = read(file);
    const lists = [
      ...[...src.matchAll(/class(?:Name)?\s*=\s*["'`]([^"'`]*)/g)].map(m => m[1]),
      ...[...src.matchAll(/classList\.(?:add|remove|toggle)\(([^)]*)\)/g)]
        .map(m => [...m[1].matchAll(/['"]([\w:/.-]+)['"]/g)].map(x => x[1]).join(' ')),
      ...[...src.matchAll(/\?\s*'([^']*)'\s*:\s*'([^']*)'/g)].map(m => m[1] + ' ' + m[2])
    ];
    lists.join(' ').split(/\s+/).forEach(tok => {
      if (!tok || tok.includes('$') || tok.includes('{') || custom.has(tok) || !TW.test(tok)) return;
      if (!twCss.includes('.' + escapeSel(tok))) seen.set(tok, file);
    });
  });
  seen.forEach((file, tok) =>
    twProblems.push(`${file} 用了 ${tok}，但 ${cssFile} 沒有，請執行 bash tools/build-tailwind.sh`));
  return twProblems;
}
report('薪資頁 Tailwind 產出檔', checkTailwindBuild('salary'));
report('主頁 Tailwind 產出檔', checkTailwindBuild('index'));
if (read('index.html').includes('cdn.tailwindcss.com')) {
  report('主頁 Tailwind 來源', ['index.html 又載入了 cdn.tailwindcss.com，請改用 tailwind.index.css']);
}

// ---------- 總結 ----------
console.log('\n════════════════════════════════');
if (problems.length === 0) {
  console.log(' 全部串接檢查通過');
} else {
  console.log(` 共 ${problems.length} 個問題待處理`);
}
process.exit(problems.length === 0 ? 0 : 1);
