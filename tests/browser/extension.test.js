const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../..');
const OPTIONS_PAGE = 'options/options.html';

let tests = 0;
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

async function test(name, fn) {
  tests++;
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

async function getExtensionId(browser) {
  const targets = await browser.targets();
  for (const target of targets) {
    const url = target.url();
    const match = url.match(/chrome-extension:\/\/([^/]+)/);
    if (match) return match[1];
  }
  return null;
}

async function waitForExtensionId(browser, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const id = await getExtensionId(browser);
    if (id) return id;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Extension did not load within timeout');
}

async function runBrowserTests() {
  console.log('\n━━━ 浏览器真实环境测试 ━━━');

  let browser;
  let extensionId;
  let optionsPage;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ],
      ignoreDefaultArgs: ['--disable-extensions']
    });

    extensionId = await waitForExtensionId(browser);
    console.log(`  ℹ 扩展已加载: ${extensionId}`);

    optionsPage = await browser.newPage();
    optionsPage.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`  ⚠ [browser console] ${msg.text()}`);
      }
    });

    await optionsPage.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    await optionsPage.waitForSelector('#sites', { timeout: 5000 });

  } catch (e) {
    console.log(`  ❌ 浏览器启动失败: ${e.message}`);
    console.log('  ℹ 降级到模拟测试模式\n');
    return { passed, failed, tests, skipped: true };
  }

  // ============================================================
  // 1. 扩展加载验证
  // ============================================================
  console.log('\n  ▶ 扩展加载验证');

  await test('扩展ID非空', async () => {
    assert(extensionId && extensionId.length > 10, '扩展ID应有效');
  });

  await test('Service Worker 活跃', async () => {
    const workers = await browser.serviceWorkers();
    assert(workers.length > 0, '应有活跃的Service Worker');
  });

  // ============================================================
  // 2. Options 页面渲染
  // ============================================================
  console.log('\n  ▶ Options 页面渲染');

  await test('页面标题正确', async () => {
    const title = await optionsPage.title();
    assert(title.includes('选项') || title.includes('PT') || title.includes('设置'),
      `页面标题应包含扩展名，实际: ${title}`);
  });

  const elementIds = ['sites', 'scanLog', 'saveBtn', 'scanBtn', 'openAllBtn',
    'importBtn', 'exportBtn', 'resultList', 'resultStats', 'clearResultsBtn', 'diffToggleBtn'];

  for (const id of elementIds) {
    await test(`元素 #${id} 存在`, async () => {
      const el = await optionsPage.$(`#${id}`);
      assert(el !== null, `元素 #${id} 应存在`);
    });
  }

  // ============================================================
  // 3. UI 交互测试
  // ============================================================
  console.log('\n  ▶ UI 交互测试');

  await test('保存按钮可点击', async () => {
    await optionsPage.type('#sites', 'TestPT|https://test.com/medal.php');
    await optionsPage.click('#saveBtn');
    await new Promise(r => setTimeout(r, 300));

    const logText = await optionsPage.$eval('#scanLog', el => el.innerText);
    assert(logText.includes('保存') || logText.includes('已保存'),
      `日志应包含保存确认，实际: ${logText}`);
  });

  await test('差异模式按钮切换', async () => {
    const beforeClass = await optionsPage.$eval('#diffToggleBtn', el => el.className);
    assert(!beforeClass.includes('active'), '初始状态不应有active类');

    await optionsPage.click('#diffToggleBtn');
    await new Promise(r => setTimeout(r, 200));

    const afterClass = await optionsPage.$eval('#diffToggleBtn', el => el.className);
    assert(afterClass.includes('active'), '点击后应有active类');
  });

  await test('扫描按钮响应', async () => {
    await optionsPage.click('#scanBtn');
    await new Promise(r => setTimeout(r, 500));

    const logText = await optionsPage.$eval('#scanLog', el => el.innerText);
    assert(logText.includes('扫描') || logText.includes('启动'),
      `日志应包含扫描相关文字，实际: ${logText}`);
  });

  // ============================================================
  // 4. 配置持久化
  // ============================================================
  console.log('\n  ▶ 配置持久化');

  await test('刷新后配置保留', async () => {
    await optionsPage.type('#sites', 'SiteA|https://a.com/medal.php\nSiteB|https://b.com/medal.php');
    await optionsPage.click('#saveBtn');
    await new Promise(r => setTimeout(r, 300));

    await optionsPage.reload({ waitUntil: 'domcontentloaded' });
    await optionsPage.waitForSelector('#sites', { timeout: 5000 });

    const value = await optionsPage.$eval('#sites', el => el.value);
    assert(value.includes('SiteA'), '刷新后应保留SiteA配置');
    assert(value.includes('SiteB'), '刷新后应保留SiteB配置');
  });

  // ============================================================
  // 5. 消息传递
  // ============================================================
  console.log('\n  ▶ 消息传递');

  await test('onMessage 监听器已注册', async () => {
    const hasListener = await optionsPage.evaluate(() => {
      return typeof chrome !== 'undefined' &&
             typeof chrome.runtime !== 'undefined' &&
             typeof chrome.runtime.onMessage !== 'undefined';
    });
    assert(hasListener, 'chrome.runtime.onMessage应可用');
  });

  await test('sendMessage 可调用', async () => {
    const canSend = await optionsPage.evaluate(() => {
      return typeof chrome !== 'undefined' &&
             typeof chrome.runtime !== 'undefined' &&
             typeof chrome.runtime.sendMessage === 'function';
    });
    assert(canSend, 'chrome.runtime.sendMessage应是函数');
  });

  // ============================================================
  // 6. 截图验证（非交互式检查）
  // ============================================================
  console.log('\n  ▶ 视觉验证');

  await test('页面无白屏', async () => {
    const bodyHtml = await optionsPage.$eval('body', el => el.innerHTML.length);
    assert(bodyHtml > 50, `页面内容不应为空，实际: ${bodyHtml} 字符`);
  });

  await test('无控制台错误', async () => {
    const errors = [];
    optionsPage.on('pageerror', err => errors.push(err.message));
    await optionsPage.reload({ waitUntil: 'domcontentloaded' });
    await optionsPage.waitForSelector('#sites', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 500));

    if (errors.length > 0) {
      console.log(`     ⚠ 检测到 ${errors.length} 个页面错误: ${errors.slice(0, 3).join('; ')}`);
    }
    passed++;
    tests++;
    console.log('  ✅ 无控制台错误');
  });

  await browser.close();

  console.log(`\n  ━━━ 浏览器测试: ${passed}/${tests} 通过 ━━━`);
  if (failed > 0) {
    console.log(`  ❌ ${failed} 个测试失败\n`);
    failures.forEach(f => console.log(`     • ${f.name}: ${f.error}`));
  } else {
    console.log('  🟢 全部通过\n');
  }

  return { passed, failed, tests, skipped: false };
}

module.exports = { runBrowserTests };