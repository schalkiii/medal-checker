#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const testFiles = [
  'tests/unit/background.test.js',
  'tests/unit/options.test.js',
  'tests/integration/messaging.test.js'
];

const regressionFile = 'tests/regression/snapshot.test.js';
// 回归测试需要一份真实调试包（PT_Debug_*.json 已被 .gitignore 忽略，由使用者自行放置）。
// 自动发现任意日期的调试包，避免写死日期导致回归测试永不运行。
const debugPackageName = require('fs')
  .readdirSync(ROOT)
  .find((f) => /^PT_Debug_\d{4}-\d{2}-\d{2}\.json$/.test(f));
const debugPackage = debugPackageName ? path.resolve(ROOT, debugPackageName) : null;

console.log('╔══════════════════════════════════════╗');
console.log('║   PT勋章扫描器 — 浏览器模拟测试    ║');
console.log('╚══════════════════════════════════════╝');
console.log('');

let allPassed = true;

// 每个测试子进程的硬上限。原先写死 30 秒：机器繁忙时同一套用例实测要 50 秒，
// 子进程被 kill 后只留一个红字、既不报用例结果也不说原因，容易被误读成测试失败。
// 现按最慢用例放宽到 3 分钟，且被强制终止时明确区分「超时」与「断言失败」。
const SECTION_TIMEOUT_MS = Number(process.env.PT_TEST_TIMEOUT) || 180000;

for (const file of testFiles) {
  const result = spawnSync('node', [file], {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: SECTION_TIMEOUT_MS,
    env: { ...process.env }
  });

  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error || result.signal) {
    console.log(`  ❌ ${file} 未正常结束（${result.error ? result.error.message : 'signal ' + result.signal}，上限 ${SECTION_TIMEOUT_MS / 1000}s）`);
    allPassed = false;
  } else if (result.status !== 0) {
    allPassed = false;
  }
}

console.log('╔══════════════════════════════════════╗');
if (allPassed) {
  console.log('║     🟢 全部测试通过！              ║');
} else {
  console.log('║     🔴 存在测试失败                ║');
}
console.log('╚══════════════════════════════════════╝');
console.log('');

if (!allPassed) process.exit(1);

let regrPassed = true;
if (require('fs').existsSync(debugPackage)) {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   回归测试 — 97 站点快照对比        ║');
  console.log('╚══════════════════════════════════════╝');

  const regrResult = spawnSync('node', [regressionFile], {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60000,
    env: { ...process.env }
  });

  process.stdout.write(regrResult.stdout);
  if (regrResult.stderr) process.stderr.write(regrResult.stderr);

  if (regrResult.status !== 0 || regrResult.error) {
    regrPassed = false;
  }
}

if (allPassed && regrPassed) {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     🟢 全部测试通过！              ║');
  console.log('╚══════════════════════════════════════╝');
} else {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     🔴 存在测试失败                ║');
  console.log('╚══════════════════════════════════════╝');
}
console.log('');

if (!allPassed || !regrPassed) process.exit(1);