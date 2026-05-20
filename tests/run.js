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
const debugPackage = path.resolve(ROOT, 'PT_Debug_2026-05-19.json');

console.log('╔══════════════════════════════════════╗');
console.log('║   PT勋章扫描器 — 浏览器模拟测试    ║');
console.log('╚══════════════════════════════════════╝');
console.log('');

let allPassed = true;

for (const file of testFiles) {
  const result = spawnSync('node', [file], {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    env: { ...process.env }
  });

  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0 || result.error) {
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