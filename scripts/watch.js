#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WATCH_FILES = ['background.js', 'options/options.js', 'options/options.html', 'manifest.json'];

console.log('👁️  文件监控模式已启动');
console.log(`   监控文件: ${WATCH_FILES.join(', ')}`);
console.log('   修改文件后自动运行 lint-fix → check\n');

let running = false;
let pending = false;
let debounceTimer = null;

function runPipeline() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  pending = false;

  const now = new Date().toLocaleTimeString();
  console.log(`\n[${now}] 🔄 检测到变更，运行流水线...\n`);

  const child = spawn('node', ['scripts/lint-fix.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true
  });

  child.on('close', (code) => {
    running = false;
    if (code === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] 🟢 流水线通过\n`);
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] 🔴 流水线失败 (exit ${code})\n`);
    }
    if (pending) {
      runPipeline();
    }
  });
}

WATCH_FILES.forEach(file => {
  const fullPath = path.resolve(ROOT, file);
  try {
    fs.watch(fullPath, (eventType) => {
      if (eventType === 'change') {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runPipeline, 500);
      }
    });
  } catch (e) {
    console.error(`无法监控 ${file}: ${e.message}`);
  }
});

console.log('✅ 监控就绪，等待文件变更...\n');

process.on('SIGINT', () => {
  console.log('\n👋 监控已停止');
  process.exit(0);
});