#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

console.log('🔧 ESLint 自动修复...\n');
try {
  const result = execSync('npx eslint background.js options/options.js --fix', {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log(result || '✅ 无需修复，代码已符合规范');
} catch (e) {
  const output = (e.stdout || '') + (e.stderr || '');
  console.log(output || '✅ 自动修复完成');
}

console.log('\n🔍 运行完整检查...\n');
try {
  execSync('node scripts/check.js', {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: 'inherit'
  });
} catch {
  process.exit(1);
}