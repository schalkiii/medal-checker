const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { createChromeMock } = require('../mocks/chrome-mock');

let tests = 0;
let passed = 0;
let failed = 0;
const pendingTests = [];

function test(name, fn) {
  tests++;

  const complete = (err) => {
    if (err) {
      failed++;
      console.log(`  ❌ ${name}`);
      console.log(`     ${err.message || err}`);
    } else {
      passed++;
      console.log(`  ✅ ${name}`);
    }
  };

  try {
    if (fn.length > 0) {
      pendingTests.push(new Promise((resolve) => {
        const wrappedComplete = (err) => {
          complete(err);
          resolve();
        };
        fn(wrappedComplete);
      }));
    } else {
      const result = fn();
      if (result && typeof result.then === 'function') {
        pendingTests.push(result.then(() => complete(), (e) => complete(e)));
      } else {
        complete();
      }
    }
  } catch (e) {
    complete(e);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertContains(str, substr, msg) {
  if (!str.includes(substr)) {
    throw new Error(msg || `expected string to contain "${substr}"`);
  }
}

const htmlPath = path.resolve(__dirname, '../../options/options.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

function setupDOM() {
  const dom = new JSDOM(html, {
    url: 'chrome-extension://testid/options/options.html',
    runScripts: 'outside-only',
    resources: 'usable'
  });

  global.document = dom.window.document;
  global.HTMLInputElement = dom.window.HTMLInputElement;
  global.HTMLAnchorElement = dom.window.HTMLAnchorElement;
  global.Blob = dom.window.Blob;
  global.FileReader = dom.window.FileReader;

  return dom;
}

function loadOptions(chromeMock) {
  global.chrome = chromeMock;
  global.confirm = () => true;
  global.alert = () => {};
  global.URL = {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {}
  };

  const optPath = path.resolve(__dirname, '../../options/options.js');
  delete require.cache[require.resolve(optPath)];
  require(optPath);

  const event = new global.document.defaultView.Event('DOMContentLoaded');
  global.document.dispatchEvent(event);
}

console.log('\n━━━ options.js DOM 测试 ━━━');

// ============================================================
// 1. DOM 元素初始化
// ============================================================
console.log('\n  ▶ DOM 元素验证');

test('所有关键元素存在', () => {
  const chromeMock = createChromeMock();
  setupDOM();
  loadOptions(chromeMock);

  const ids = ['sites', 'scanLog', 'importBtn', 'exportBtn', 'saveBtn',
    'scanBtn', 'openAllBtn', 'resultList', 'resultStats', 'clearResultsBtn', 'diffToggleBtn'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    assert(el !== null, `元素 #${id} 应存在`);
  });
});

test('页面标题正确', () => {
  const h2 = document.querySelector('h2');
  assert(h2 !== null, 'h2 标题应存在');
  assertContains(h2.textContent, 'PT 勋章扫描器');
});

// ============================================================
// 2. 按钮事件 (同步部分)
// ============================================================
console.log('\n  ▶ 按钮事件');

test('保存按钮保存配置', () => {
  const chromeMock = createChromeMock();
  setupDOM();
  loadOptions(chromeMock);

  const textarea = document.getElementById('sites');
  textarea.value = 'SiteX|https://x.com/medal.php';

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.click();

  const saved = chromeMock._storage.get('sites');
  assert(saved !== undefined, '应保存sites到storage');
});

test('差异模式按钮切换状态', () => {
  const chromeMock = createChromeMock();
  chromeMock._storage.set('sites', ['SiteX|https://x.com/medal.php']);
  setupDOM();
  loadOptions(chromeMock);

  const diffBtn = document.getElementById('diffToggleBtn');
  assert(diffBtn !== null, 'diffToggleBtn应存在');

  diffBtn.click();
  assert(diffBtn.classList.contains('active'), '点击后应有active类');

  diffBtn.click();
  assert(!diffBtn.classList.contains('active'), '再次点击应移除active类');
});

// ============================================================
// 3. 日志系统
// ============================================================
console.log('\n  ▶ 日志系统');

let logChromeMock = null;

test('scanLog消息追加到日志区', () => {
  logChromeMock = createChromeMock();
  logChromeMock._storage.set('sites', ['SiteX|https://x.com/medal.php']);
  setupDOM();
  loadOptions(logChromeMock);

  const handler = logChromeMock._listeners.get('runtime.onMessage');
  assert(handler, '应注册runtime.onMessage监听器');

  handler({ type: 'scanLog', text: '测试日志', isError: false });
  const logEl = document.getElementById('scanLog');
  assertContains(logEl.innerHTML, '测试日志');
});

test('错误日志标红', () => {
  const handler = logChromeMock._listeners.get('runtime.onMessage');
  handler({ type: 'scanLog', text: '错误消息', isError: true });
  const logEl = document.getElementById('scanLog');
  assertContains(logEl.innerHTML, 'e53935');
});

// ============================================================
// 4. 结果展示
// ============================================================
console.log('\n  ▶ 结果展示');

test('scanResult更新结果区', () => {
  const chromeMock = createChromeMock();
  chromeMock._storage.set('sites', ['SiteX|https://x.com/medal.php']);
  setupDOM();
  loadOptions(chromeMock);

  const handler = chromeMock._listeners.get('runtime.onMessage');
  handler({
    type: 'scanResult',
    data: [{
      siteName: 'TestPT',
      count: 2,
      url: 'https://test.com/medal.php',
      medals: [
        { name: '勋章A', price: '100', duration: '30天' },
        { name: '勋章B', price: '200', duration: '永久' }
      ]
    }]
  });

  const resultList = document.getElementById('resultList');
  assertContains(resultList.innerHTML, 'TestPT', '应显示站点名');
  assertContains(resultList.innerHTML, '勋章A', '应显示勋章名A');
  assertContains(resultList.innerHTML, '勋章B', '应显示勋章名B');
  assertContains(resultList.innerHTML, '100', '应显示价格');
  assertContains(resultList.innerHTML, '永久', '应显示有效期');
});

test('结果区链接可点击', () => {
  const resultList = document.getElementById('resultList');
  assertContains(resultList.innerHTML, 'href="https://test.com/medal.php"', '链接应有href');
  assertContains(resultList.innerHTML, 'target="_blank"', '链接应新标签打开');
});

test('统计栏显示总勋章数', () => {
  const stats = document.getElementById('resultStats');
  assertContains(stats.innerHTML, '2', '应显示总勋章数2');
});

test('无勋章站点不显示', () => {
  const chromeMock = createChromeMock();
  chromeMock._storage.set('sites', ['SiteX|https://x.com/medal.php']);
  setupDOM();
  loadOptions(chromeMock);

  document.getElementById('resultList').innerHTML = '';
  document.getElementById('resultStats').innerHTML = '';

  const handler = chromeMock._listeners.get('runtime.onMessage');
  handler({
    type: 'scanResult',
    data: [{
      siteName: 'NoMedal',
      count: 0,
      url: 'https://empty.com/medal.php',
      medals: []
    }]
  });

  const resultList = document.getElementById('resultList');
  assert(!resultList.innerHTML.includes('NoMedal'),
    'count=0的站点不应显示在结果中');
});

// ============================================================
// 5. Diff模式高亮
// ============================================================
console.log('\n  ▶ Diff模式');

test('diff模式高亮新增勋章', (done) => {
  const chromeMock = createChromeMock();
  chromeMock._storage.set('sites', ['SiteX|https://x.com/medal.php']);

  chromeMock._storage.set('scanHistory', [
    {
      timestamp: 500,
      dateStr: '2026-05-11',
      results: [{
        siteName: 'TestPT',
        count: 1,
        url: 'https://test.com/medal.php',
        medals: [{ name: '旧勋章', price: '100', duration: '30天' }]
      }]
    },
    {
      timestamp: 1000,
      dateStr: '2026-05-12',
      results: [{
        siteName: 'TestPT',
        count: 1,
        url: 'https://test.com/medal.php',
        medals: [{ name: '旧勋章', price: '100', duration: '30天' }]
      }]
    }
  ]);

  setupDOM();
  loadOptions(chromeMock);

  setTimeout(() => {
    const diffBtn = document.getElementById('diffToggleBtn');
    diffBtn.click();

    setTimeout(() => {
      const handler = chromeMock._listeners.get('runtime.onMessage');
      handler({
        type: 'scanResult',
        data: [{
          siteName: 'TestPT',
          count: 2,
          url: 'https://test.com/medal.php',
          medals: [
            { name: '旧勋章', price: '100', duration: '30天' },
            { name: '新勋章', price: '200', duration: '永久' }
          ]
        }]
      });

      const resultList = document.getElementById('resultList');
      try {
        assertContains(resultList.innerHTML, '新勋章', '应显示新勋章');
        assertContains(resultList.innerHTML, 'NEW', '应有NEW标记');
        assertContains(resultList.innerHTML, 'new-medal', '应有new-medal样式类');
        done();
      } catch (e) {
        done(e);
      }
    }, 50);
  }, 50);
});

// ============================================================
// 汇总（等待所有异步测试完成）
// ============================================================
Promise.all(pendingTests).then(() => {
  console.log(`\n  ━━━ options.js: ${passed}/${tests} 通过 ━━━`);
  if (failed > 0) {
    console.log(`  ❌ ${failed} 个测试失败\n`);
    process.exitCode = 1;
  } else {
    console.log('  🟢 全部通过\n');
  }
});

module.exports = { passed, failed, tests };