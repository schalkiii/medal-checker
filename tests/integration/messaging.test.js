const { JSDOM } = require('jsdom');
const { createChromeMock } = require('../mocks/chrome-mock');

const jsdomSetup = new JSDOM('<!DOCTYPE html>');
global.DOMParser = jsdomSetup.window.DOMParser;
global.FileReader = jsdomSetup.window.FileReader;

let tests = 0;
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function mark(name, ok) {
  tests++;
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

console.log('\n━━━ 消息传递集成测试 ━━━');

async function runAll() {
  const fs = require('fs');
  const path = require('path');
  const bgContent = fs.readFileSync(path.resolve(__dirname, '../../background.js'), 'utf-8');
  const optContent = fs.readFileSync(path.resolve(__dirname, '../../options/options.js'), 'utf-8');

  // ============================================================
  // 1. 消息协议一致性（同步）
  // ============================================================
  console.log('\n  ▶ 消息协议验证');

  try {
    const chromeMock = createChromeMock();
    global.chrome = chromeMock;
    global.AbortController = AbortController;
    global.navigator = { userAgent: 'Mozilla/5.0' };
    global.fetch = () => Promise.resolve({ ok: false, status: 404 });

    delete require.cache[require.resolve('../../background.js')];
    require('../../background.js');

    const handler = chromeMock._listeners.get('runtime.onMessage');
    assert(handler, 'background应注册onMessage监听器');
    mark('startScan action 前后端匹配', true);
  } catch (e) {
    mark('startScan action 前后端匹配', false);
    console.log(`     ${e.message}`);
  }

  try {
    const bgTypes = bgContent.match(/type:\s*['"](\w+)['"]/g) || [];
    const optTypes = optContent.match(/message\.type\s*===\s*['"](\w+)['"]/g) || [];

    assert(bgTypes.some(t => t.includes('scanResult')), 'background应发送scanResult');
    assert(bgTypes.some(t => t.includes('scanLog')), 'background应发送scanLog');
    assert(optTypes.some(t => t.includes('scanResult')), 'options应监听scanResult');
    assert(optTypes.some(t => t.includes('scanLog')), 'options应监听scanLog');
    mark('scanResult type 前后端匹配', true);
  } catch (e) {
    mark('scanResult type 前后端匹配', false);
    console.log(`     ${e.message}`);
  }

try {
    const bgActions = bgContent.match(/action\s*===\s*['"](\w+)['"]/g) || [];
    const optActions = optContent.match(/action:\s*['"](\w+)['"]/g) || [];

    assert(bgActions.some(a => a.includes('startScan')), 'background应处理startScan');
    assert(bgActions.some(a => a.includes('detectSites')), 'background应处理detectSites');
    assert(bgActions.some(a => a.includes('updateScheduleConfig')), 'background应处理updateScheduleConfig');
    assert(optActions.some(a => a.includes('startScan')), 'options应发送startScan');
    assert(optActions.some(a => a.includes('detectSites')), 'options应发送detectSites');
    assert(optActions.some(a => a.includes('updateScheduleConfig')), 'options应发送updateScheduleConfig');
    mark('startScan action 前后端匹配', true);
  } catch (e) {
    mark('startScan action 前后端匹配', false);
    console.log(`     ${e.message}`);
  }

  // ============================================================
  // 2. Storage 数据流（异步，顺序执行）
  // ============================================================
  console.log('\n  ▶ Storage 数据流');

  // 设置共享的 chrome mock
  const chromeMock = createChromeMock({
    cookies: [
      { name: 'uid', value: '12345', domain: 'testpt.com' },
      { name: 'pass', value: 'hash', domain: '.testpt.com' }
    ]
  });
  chromeMock._storage.set('sites', ['TestPT|https://testpt.com/medal.php']);

  global.chrome = chromeMock;
  global.fetch = () => Promise.resolve({
    ok: true,
    text: () => Promise.resolve('<input value="购买">')
  });

  delete require.cache[require.resolve('../../background.js')];
  require('../../background.js');

  // 测试1: scanResults 持久化
  try {
    const handler = chromeMock._listeners.get('runtime.onMessage');
    handler({ action: 'startScan' }, {}, () => {});

    await new Promise(r => setTimeout(r, 200));

    const scanResults = chromeMock._storage.get('scanResults');
    assert(scanResults !== undefined, 'scanResults应被设置');
    assert(scanResults.length > 0, 'scanResults应有数据');
    mark('scanResults 持久化', true);
  } catch (e) {
    mark('scanResults 持久化', false);
    console.log(`     ${e.message}`);
  }

  // 测试2: scanHistory 追加
  try {
    const history = chromeMock._storage.get('scanHistory');
    assert(history !== undefined, 'scanHistory应存在');
    assert(Array.isArray(history), 'scanHistory应是数组');
    assert(history.length >= 1, 'scanHistory至少应有1条记录');
    assert(history[0].timestamp !== undefined, '应有timestamp');
    mark('scanHistory 追加', true);
  } catch (e) {
    mark('scanHistory 追加', false);
    console.log(`     ${e.message}`);
  }

  // 测试3: 第二次扫描追加到scanHistory
  try {
    global.fetch = () => Promise.resolve({
      ok: true,
      text: () => Promise.resolve('<input value="购买"><input value="购买">')
    });

    const handler = chromeMock._listeners.get('runtime.onMessage');
    handler({ action: 'startScan' }, {}, () => {});

    await new Promise(r => setTimeout(r, 200));

    const history = chromeMock._storage.get('scanHistory');
    assert(history.length >= 2, `应有2条以上记录，实际${history.length}条`);
    mark('第二次扫描追加到scanHistory', true);
  } catch (e) {
    mark('第二次扫描追加到scanHistory', false);
    console.log(`     ${e.message}`);
  }

  // 汇总
  console.log(`\n  ━━━ 集成测试: ${passed}/${tests} 通过 ━━━`);
  if (failed > 0) {
    console.log(`  ❌ ${failed} 个测试失败\n`);
    process.exitCode = 1;
  } else {
    console.log('  🟢 全部通过\n');
  }
}

runAll().catch(e => {
  console.error('集成测试运行异常:', e);
  process.exitCode = 1;
});