const { JSDOM } = require('jsdom');
const { createChromeMock } = require('../mocks/chrome-mock');

const jsdom = new JSDOM('<!DOCTYPE html>');
global.DOMParser = jsdom.window.DOMParser;
global.FileReader = jsdom.window.FileReader;

let tests = 0;
let passed = 0;
let failed = 0;
const pendingTests = [];

function test(name, fn) {
  tests++;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      pendingTests.push(
        result.then(() => {
          passed++;
          console.log(`  ✅ ${name}`);
        }).catch(e => {
          failed++;
          console.log(`  ❌ ${name}`);
          console.log(`     ${e.message}`);
        })
      );
      return;
    }
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
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

const bgPath = require('path').resolve(__dirname, '../../background.js');
delete require.cache[require.resolve(bgPath)];

const chromeMock = createChromeMock({
  cookies: [
    { name: 'uid', value: '12345', domain: 'example.com' },
    { name: 'pass', value: 'hash123', domain: '.example.com' }
  ]
});

global.chrome = chromeMock;
global.AbortController = AbortController;
global.navigator = { userAgent: 'Mozilla/5.0 TestAgent' };
global.fetch = null;

const bg = require(bgPath);

console.log('\n━━━ background.js 单元测试 ━━━');

// ============================================================
// 1. getCookieDomain
// ============================================================
console.log('\n  ▶ getCookieDomain');
test('单级域名返回自身', () => {
  assertEqual(bg.getCookieDomain('https://example.com/medal.php'), 'example.com');
});

test('双级域名返回自身', () => {
  assertEqual(bg.getCookieDomain('https://mysite.org/path'), 'mysite.org');
});

test('三级域名返回后两级', () => {
  assertEqual(bg.getCookieDomain('https://pt.chdbits.xyz/'), '.chdbits.xyz');
});

test('无效URL返回原值', () => {
  assertEqual(bg.getCookieDomain('not-a-url'), 'not-a-url');
});

// ============================================================
// 2. extractMedalsFromHtml
// ============================================================
console.log('\n  ▶ extractMedalsFromHtml');

const sampleHTML1 = `
<table>
  <tr>
    <td><img src="gold.png" alt="黄金勋章"></td>
    <td>黄金勋章</td>
    <td>价格：1000</td>
    <td>有效期：30天</td>
    <td><input type="submit" value="购买"></td>
  </tr>
  <tr>
    <td><img src="silver.png" alt="白银勋章"></td>
    <td>白银勋章</td>
    <td>所需：500 积分</td>
    <td>永久</td>
    <td><input type="submit" value="购买/silver"></td>
  </tr>
  <tr>
    <td>不可购买勋章</td>
    <td>价格：999</td>
    <td><input type="submit" value="已购买"></td>
  </tr>
</table>`;

test('提取勋章数量正确', () => {
  const medals = bg.extractMedalsFromHtml(sampleHTML1);
  assertEqual(medals.length, 2, `期望2个勋章，实际${medals.length}个`);
});

test('提取勋章名称', () => {
  const medals = bg.extractMedalsFromHtml(sampleHTML1);
  assertContains(medals[0].name, '黄金', '第一个勋章应包含"黄金"');
});

test('提取价格信息', () => {
  const medals = bg.extractMedalsFromHtml(sampleHTML1);
  assert(medals.some(m => m.price === '1000'), '应包含价格为1000的勋章');
});

test('提取有效期信息', () => {
  const medals = bg.extractMedalsFromHtml(sampleHTML1);
  assert(medals.some(m => m.duration === '30天'), '应包含有效期30天的勋章');
  assert(medals.some(m => m.duration === '永久'), '应包含永久勋章');
});

test('排除非购买按钮(已购买)', () => {
  const medals = bg.extractMedalsFromHtml(sampleHTML1);
  assert(!medals.some(m => m.name && m.name.includes('不可购买')),
    '不应包含已购买的勋章');
});

const sampleHTML2 = `
<div class="medal-card">
  <h3>钻石勋章</h3>
  <span>售价：5000</span>
  <span>期限：永久</span>
  <input type="submit" value="购买/diamond">
</div>`;

test('div容器中提取勋章', () => {
  const medals = bg.extractMedalsFromHtml(sampleHTML2);
  assertEqual(medals.length, 1);
  assertContains(medals[0].name, '钻石');
});

const sampleHTML3 = '<input type="submit" value="购买">';

test('无额外信息的勋章仍可提取', () => {
  const medals = bg.extractMedalsFromHtml(sampleHTML3);
  assertEqual(medals.length, 1);
  assert(medals[0].name.length > 0, '至少应有默认名称');
});

// ============================================================
// 3. chrome.action.onClicked
// ============================================================
console.log('\n  ▶ chrome.action.onClicked');

test('点击图标打开选项页', () => {
  chromeMock.reset();
  chromeMock.action.onClicked.emit('event');
  assert(chromeMock._optionsPageOpened, '应调用 openOptionsPage');
});

// ============================================================
// 4. 消息处理 - startScan
// ============================================================
console.log('\n  ▶ startScan 消息处理');

test('无站点配置时返回错误日志', async () => {
  chromeMock.reset();
  chromeMock._storage.set('sites', []);

  delete require.cache[require.resolve(bgPath)];
  require(bgPath);

  const handler = chromeMock._listeners.get('runtime.onMessage');
  assert(handler, '应注册 onMessage 监听器');

  await handler({ action: 'startScan' }, {}, () => {});
  await new Promise(r => setTimeout(r, 50));

  const errorLogs = chromeMock._sentMessages.filter(m =>
    m.type === 'scanLog' && m.isError
  );
  assert(errorLogs.length > 0, `应发送错误日志，实际: ${JSON.stringify(chromeMock._sentMessages)}`);
  assertContains(errorLogs[0].text, '未配置', '错误信息应提示未配置');
});

test('无Cookie时发送警告', async () => {
  chromeMock.reset();
  chromeMock._storage.set('sites', ['TestPT|https://testpt.com/medal.php']);
  global.fetch = () => Promise.resolve({ ok: false, status: 404 });

  delete require.cache[require.resolve(bgPath)];
  require(bgPath);

  const handler = chromeMock._listeners.get('runtime.onMessage');
  assert(handler, 'reset后应重新注册onMessage监听器');

  await handler({ action: 'startScan' }, {}, () => {});
  await new Promise(r => setTimeout(r, 50));

  const warnLogs = chromeMock._sentMessages.filter(m =>
    m.type === 'scanLog' && m.isError && m.text.includes('Cookie')
  );
  assert(warnLogs.length > 0, `应发送Cookie警告，实际日志: ${JSON.stringify(chromeMock._sentMessages)}`);
});

// ============================================================
// 汇总 (wrapped in async runner)
// ============================================================
async function runAll() {
  // All tests run above synchronously in the module scope
  // Wait for any pending async tests
  await Promise.all(pendingTests);
  await new Promise(r => setTimeout(r, 200));

  console.log(`\n  ━━━ background.js: ${passed}/${tests} 通过 ━━━`);
  if (failed > 0) {
    console.log(`  ❌ ${failed} 个测试失败\n`);
    process.exitCode = 1;
  } else {
    console.log('  🟢 全部通过\n');
  }
}

runAll();

module.exports = { passed, failed, tests };