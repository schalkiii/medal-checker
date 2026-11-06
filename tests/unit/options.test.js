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
    'scanBtn', 'openAllBtn', 'resultList', 'resultStats', 'clearResultsBtn', 'diffToggleBtn', 'debugExportBtn',
    'detectBtn', 'detectSummary'];
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
// 5. 定时任务配置
// ============================================================
console.log('\n  ▶ 定时任务配置');

test('定时配置DOM元素存在', () => {
  const chromeMock = createChromeMock();
  setupDOM();
  loadOptions(chromeMock);

  const ids = ['scheduleToggle', 'scheduleTime', 'webhookUrl', 'scheduleStatus', 'saveScheduleBtn', 'testWebhookBtn'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    assert(el !== null, `元素 #${id} 应存在`);
  });
});

test('定时配置从storage加载', () => {
  const chromeMock = createChromeMock();
  chromeMock._storage.set('scheduleConfig', { enabled: true, time: '09:30', webhookUrl: 'https://webhook.test/hook' });
  chromeMock._storage.set('sites', ['SiteX|https://x.com/medal.php']);
  setupDOM();
  loadOptions(chromeMock);

  assert(document.getElementById('scheduleToggle').checked, 'toggle应被勾选');
  assertEqual(document.getElementById('scheduleTime').value, '09:30');
  assertEqual(document.getElementById('webhookUrl').value, 'https://webhook.test/hook');
  assertContains(document.getElementById('scheduleStatus').textContent, '已启用');
});

test('保存定时配置写入storage并发送消息', () => {
  const chromeMock = createChromeMock();
  chromeMock._storage.set('sites', ['SiteX|https://x.com/medal.php']);
  setupDOM();
  loadOptions(chromeMock);

  const toggle = document.getElementById('scheduleToggle');
  const timeInput = document.getElementById('scheduleTime');
  const urlInput = document.getElementById('webhookUrl');

  toggle.checked = true;
  timeInput.value = '07:00';
  urlInput.value = 'https://feishu.webhook/test';

  document.getElementById('saveScheduleBtn').click();

  const saved = chromeMock._storage.get('scheduleConfig');
  assert(saved !== undefined, 'scheduleConfig应保存到storage');
  assertEqual(saved.enabled, true);
  assertEqual(saved.time, '07:00');
  assertEqual(saved.webhookUrl, 'https://feishu.webhook/test');

  const sentMsg = chromeMock._sentMessages.find(m => m.action === 'updateScheduleConfig');
  assert(sentMsg !== undefined, '应发送updateScheduleConfig消息');
  assertEqual(sentMsg.scheduleConfig.enabled, true);
});

// ============================================================
// 6. Diff模式高亮
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
  // 捕获当前 DOM 引用：后续测试会重新 setupDOM() 并覆盖 global.document，
  // 若不固定引用，异步回调会操作到错误的 DOM 导致断言失败。
  const doc = document;

  setTimeout(() => {
    const diffBtn = doc.getElementById('diffToggleBtn');
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

      const resultList = doc.getElementById('resultList');
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
// 7. 勋章分页跳转 & 魔力不足筛选
// ============================================================
console.log('\n  ▶ 分页跳转 & 魔力不足筛选');

test('勋章链接跳转到具体分页', () => {
  const chromeMock = createChromeMock();
  chromeMock._storage.set('sites', ['SiteX|https://x.com/medal.php']);
  setupDOM();
  loadOptions(chromeMock);

  const handler = chromeMock._listeners.get('runtime.onMessage');
  handler({
    type: 'scanResult',
    data: [{
      siteName: 'TestPT',
      count: 1,
      url: 'https://test.com/medal.php',
      medals: [
        { name: '第二页勋章', price: '100', duration: '30天', page: 2, pageUrl: 'https://test.com/medal.php?page=1' }
      ]
    }]
  });

  const resultList = document.getElementById('resultList');
  assertContains(resultList.innerHTML, 'href="https://test.com/medal.php?page=1"', '应链接到具体分页');
  assertContains(resultList.innerHTML, '第2页', '应显示所在页码');
});

test('无页码时回退到站点链接', () => {
  const chromeMock = createChromeMock();
  chromeMock._storage.set('sites', ['SiteX|https://x.com/medal.php']);
  setupDOM();
  loadOptions(chromeMock);

  const handler = chromeMock._listeners.get('runtime.onMessage');
  handler({
    type: 'scanResult',
    data: [{
      siteName: 'TestPT',
      count: 1,
      url: 'https://test.com/medal.php',
      medals: [
        { name: '首页勋章', price: '100', duration: '30天' }
      ]
    }]
  });

  const resultList = document.getElementById('resultList');
  assertContains(resultList.innerHTML, 'href="https://test.com/medal.php"', '无页码应回退到站点首页');
});

test('魔力不足筛选只显示买不起的勋章', () => {
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
      balance: 100,
      medals: [
        { name: '便宜勋章', price: '50', duration: '30天' },
        { name: '贵勋章', price: '200', duration: '永久' }
      ]
    }]
  });

  document.getElementById('filterMagicBtn').click();

  const resultList = document.getElementById('resultList');
  assertContains(resultList.innerHTML, '贵勋章', '应显示买不起的贵勋章');
  assert(!resultList.innerHTML.includes('便宜勋章'), '应隐藏买得起的便宜勋章');
});

test('魔力值未知时魔力不足筛选不显示该站勋章', () => {
  const chromeMock = createChromeMock();
  chromeMock._storage.set('sites', ['SiteX|https://x.com/medal.php']);
  setupDOM();
  loadOptions(chromeMock);

  const handler = chromeMock._listeners.get('runtime.onMessage');
  handler({
    type: 'scanResult',
    data: [{
      siteName: 'TestPT',
      count: 1,
      url: 'https://test.com/medal.php',
      balance: null,
      medals: [
        { name: '未知余额勋章', price: '99999', duration: '永久' }
      ]
    }]
  });

  document.getElementById('filterMagicBtn').click();

  const resultList = document.getElementById('resultList');
  assert(!resultList.innerHTML.includes('未知余额勋章'), '魔力值未知时应保守隐藏该站勋章');
});

// ============================================================
// 时魔与回本展示
// ============================================================
function renderPaybackResult(hourly, medal) {
  const chromeMock = createChromeMock();
  chromeMock._storage.set('sites', ['SiteX|https://x.com/medal.php']);
  setupDOM();
  loadOptions(chromeMock);

  chromeMock._listeners.get('runtime.onMessage')({
    type: 'scanResult',
    data: [{
      siteName: 'TestPT',
      count: 1,
      url: 'https://test.com/medal.php',
      balance: 1000,
      hourly,
      medals: [medal]
    }]
  });
  return document.getElementById('resultList').innerHTML;
}

test('站点头部显示时魔，勋章行显示回本时长', () => {
  const html = renderPaybackResult(
    { medalBase: 99.285, medalCoef: 0.06, baseHourly: 149.285, totalHourly: 155.242, source: 'table' },
    { name: '辅车勋章', price: '66,666', bonus: '6%', payback: { windowHours: 24, base: 99.285, extraPerHour: 5.9571, gain: 142.97, price: 66666, hours: 11190.8, canPayback: false, estimated: false } }
  );
  assertContains(html, '⚡ 时魔 155.24', '站点头部应显示合计时魔');
  assertContains(html, '回本 466 天', '11190.8 小时折算为 466 天（不再用小时/年）');
  assert(!html.includes('回本 11190'), '不应直接抛小时数');
  assert(!html.includes('✓ 24h 内回本'), '不能回本时不给绿色结论');
});

test('24 小时内可回本给出绿色结论', () => {
  const html = renderPaybackResult(
    { medalBase: 1000, medalCoef: 0, baseHourly: 1200, totalHourly: 1200, source: 'table' },
    { name: '划算勋章', price: '10,000', bonus: '50%', payback: { windowHours: 24, base: 1000, extraPerHour: 500, gain: 12000, price: 10000, hours: 20, canPayback: true, estimated: false } }
  );
  assertContains(html, '✓ 24h 内回本');
});

test('负加成勋章只说无法回本，不出现病句', () => {
  const html = renderPaybackResult(
    { medalBase: 99.285, medalCoef: 0.06, baseHourly: 149.285, totalHourly: 155.242, source: 'table' },
    { name: '负加成勋章', price: '1,000', bonus: '-5%', payback: { windowHours: 24, base: 99.285, extraPerHour: -4.964, gain: -119.1, price: 1000, hours: null, canPayback: false, estimated: false } }
  );
  assertContains(html, '⏳ 无法回本');
  assert(!html.includes('回本 无法回本'), '不应拼出「回本 无法回本」');
});

test('估算口径带 ≈ 标记', () => {
  const html = renderPaybackResult(
    { medalBase: null, medalCoef: null, baseHourly: 25.438, totalHourly: 25.438, source: 'text' },
    { name: '老版站勋章', price: '1,000', bonus: '11%', payback: { windowHours: 24, base: 25.438, extraPerHour: 2.798, gain: 67.15, price: 1000, hours: 357.4, canPayback: false, estimated: true } }
  );
  assertContains(html, '⏳ ≈回本 15 天');
});

test('大额时魔与超长回本都用千分位', () => {
  const html = renderPaybackResult(
    { medalBase: 494.753, medalCoef: 10.333, baseHourly: 7035.787, totalHourly: 7035.787, source: 'table' },
    { name: '天价勋章', price: '800,000', bonus: '0.1%', payback: { windowHours: 24, base: 494.753, extraPerHour: 0.4948, gain: 11.87, price: 800000, hours: 1616976, canPayback: false, estimated: false } }
  );
  assertContains(html, '⚡ 时魔 7,035.79', '时魔与余额一样带千分位');
  assertContains(html, '回本 67,374 天', '超过十天后取整并带千分位');
});

test('时魔取不到时标注未知且不编造回本结论', () => {
  const html = renderPaybackResult(null, { name: '无时魔勋章', price: '1,000', bonus: '5%' });
  assertContains(html, '⚡ 时魔未知');
  assert(!html.includes('meta-payback'), '无时魔数据不应给出任何回本结论');
});

test('改版之前的历史结果不显示时魔栏', () => {
  // 历史 scanResults 里没有 hourly 键：既不显示时魔，也不谎称"时魔未知"
  const html = renderPaybackResult(undefined, { name: '历史勋章', price: '1,000', bonus: '1%' });
  assert(!html.includes('时魔'), '缺 hourly 键的旧结果不应出现时魔相关文案');
  assert(!html.includes('meta-payback'), '旧结果没有 payback 字段，回本栏应缺席');
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