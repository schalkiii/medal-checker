#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = 0;
let warnings = 0;
let passed = 0;

function log(level, msg) {
  const prefix = { error: '❌', warn: '⚠️ ', ok: '✅', info: '🔍' }[level] || '  ';
  console.log(`  ${prefix} ${msg}`);
  if (level === 'error') errors++;
  else if (level === 'warn') warnings++;
  else if (level === 'ok') passed++;
}

function section(title) {
  console.log(`\n━━━ ${title} ━━━`);
}

function fileExists(filePath) {
  return fs.existsSync(path.resolve(ROOT, filePath));
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(ROOT, filePath), 'utf-8'));
  } catch (e) {
    return null;
  }
}

function checkJSSyntax(filePath) {
  try {
    const code = fs.readFileSync(path.resolve(ROOT, filePath), 'utf-8');
    new Function(code);
    return true;
  } catch (e) {
    log('error', `${filePath}: 语法错误 — ${e.message}`);
    return false;
  }
}

function checkHTMLBasic(filePath) {
  try {
    const html = fs.readFileSync(path.resolve(ROOT, filePath), 'utf-8');
    const issues = [];

    if (!/<!DOCTYPE\s+html/i.test(html)) issues.push('缺少 DOCTYPE 声明');
    if (!/<html[\s>]/i.test(html)) issues.push('缺少 <html> 标签');
    if (!/<head[\s>]/i.test(html)) issues.push('缺少 <head> 标签');
    if (!/<body[\s>]/i.test(html)) issues.push('缺少 <body> 标签');
    if (!/<\/html>/i.test(html)) issues.push('缺少 </html> 闭合标签');
    if (!/<\/body>/i.test(html)) issues.push('缺少 </body> 闭合标签');

    const openDiv = (html.match(/<div[^>]*>/gi) || []).length;
    const closeDiv = (html.match(/<\/div>/gi) || []).length;
    if (openDiv !== closeDiv) issues.push(`<div> 标签不匹配: 打开${openDiv} 闭合${closeDiv}`);

    const scripts = html.match(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi) || [];
    scripts.forEach(s => {
      const m = s.match(/src=["']([^"']+)["']/);
      if (m && !fileExists(m[1]) && !fileExists(path.join(path.dirname(filePath), m[1]))) {
        issues.push(`引用的脚本不存在: ${m[1]}`);
      }
    });

    issues.forEach(i => log('warn', `${filePath}: ${i}`));
    return issues.length === 0;
  } catch (e) {
    log('error', `${filePath}: 读取失败 — ${e.message}`);
    return false;
  }
}

// ============================================================
// 1. 文件完整性检查
// ============================================================
section('1. 文件完整性检查');

const requiredFiles = [
  'manifest.json',
  'background.js',
  'icon.png',
  'options/options.html',
  'options/options.js'
];

requiredFiles.forEach(f => {
  if (fileExists(f)) log('ok', `${f} 存在`);
  else log('error', `${f} 缺失`);
});

// ============================================================
// 2. manifest.json 校验
// ============================================================
section('2. manifest.json 校验');

const manifest = readJSON('manifest.json');
if (!manifest) {
  log('error', 'manifest.json 无法解析');
} else {
  const checks = [
    { key: 'manifest_version', expect: 3, label: 'manifest_version == 3' },
    { key: 'name', type: 'string', label: 'name 字段存在' },
    { key: 'version', type: 'string', label: 'version 字段存在' },
    { key: 'permissions', type: 'object', label: 'permissions 是数组' },
    { key: 'host_permissions', type: 'object', label: 'host_permissions 是数组' },
    { key: 'background', type: 'object', label: 'background 配置存在' },
    { key: 'action', type: 'object', label: 'action 配置存在' },
  ];

  checks.forEach(c => {
    if (c.expect !== undefined) {
      if (manifest[c.key] === c.expect) log('ok', c.label);
      else log('error', `${c.label} (当前: ${manifest[c.key]})`);
    } else if (c.type) {
      const actualType = Array.isArray(manifest[c.key]) ? 'object' : typeof manifest[c.key];
      if (actualType === c.type || (c.type === 'object' && manifest[c.key] !== undefined)) {
        log('ok', c.label);
      } else {
        log('error', `${c.label} (当前类型: ${actualType})`);
      }
    }
  });

  if (manifest.background?.service_worker) {
    const sw = manifest.background.service_worker;
    if (fileExists(sw)) log('ok', `service_worker: ${sw} 存在`);
    else log('error', `service_worker: ${sw} 文件缺失`);
  }

  if (manifest.options_ui?.page) {
    const page = manifest.options_ui.page;
    if (fileExists(page)) log('ok', `options_ui.page: ${page} 存在`);
    else log('error', `options_ui.page: ${page} 文件缺失`);
  }

  const permissions = manifest.permissions || [];
  const required = ['cookies', 'storage'];
  required.forEach(p => {
    if (permissions.includes(p)) log('ok', `权限 ${p} 已声明`);
    else log('error', `缺少必要权限: ${p}`);
  });
}

// ============================================================
// 3. JavaScript 语法检查
// ============================================================
section('3. JavaScript 语法检查');

const jsFiles = ['background.js', 'options/options.js'];
jsFiles.forEach(f => {
  if (fileExists(f)) {
    if (checkJSSyntax(f)) log('ok', `${f} 语法正确`);
  }
});

// ============================================================
// 4. HTML 结构检查
// ============================================================
section('4. HTML 结构检查');

const htmlFiles = ['options/options.html'];
htmlFiles.forEach(f => {
  if (fileExists(f)) {
    if (checkHTMLBasic(f)) log('ok', `${f} 结构正常`);
  }
});

// ============================================================
// 5. 代码质量检查 (ESLint)
// ============================================================
section('5. ESLint 代码质量检查');

const { execSync } = require('child_process');
try {
  const result = execSync('npx eslint background.js options/options.js 2>&1', {
    cwd: ROOT,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  });
  const lines = result.trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    log('ok', 'ESLint: 无问题');
  } else {
    lines.forEach(line => {
      if (line.includes('error')) log('error', line.trim());
      else log('warn', line.trim());
    });
  }
} catch (e) {
  const output = (e.stdout || '') + (e.stderr || '');
  const lines = output.trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    log('ok', 'ESLint: 无问题');
  } else {
    lines.forEach(line => {
      if (line.includes(' error ') || line.includes('(error)')) log('error', line.trim());
      else log('warn', line.trim());
    });
  }
}

// ============================================================
// 6. 跨文件引用检查
// ============================================================
section('6. 跨文件引用检查');

const bgContent = fs.readFileSync(path.resolve(ROOT, 'background.js'), 'utf-8');
const optJSC = fs.readFileSync(path.resolve(ROOT, 'options/options.js'), 'utf-8');
const optHTML = fs.readFileSync(path.resolve(ROOT, 'options/options.html'), 'utf-8');

const bgMsgActions = (bgContent.match(/request\.action\s*===\s*['"](\w+)['"]/g) || [])
  .map(m => m.match(/['"](\w+)['"]/)[1]);
const optMsgTypes = (optJSC.match(/message\.type\s*===\s*['"](\w+)['"]/g) || [])
  .map(m => m.match(/['"](\w+)['"]/)[1]);

log('info', `background 处理的 action: [${bgMsgActions.join(', ')}]`);
log('info', `options 监听的 type: [${optMsgTypes.join(', ')}]`);

const optSendActions = (optJSC.match(/action:\s*['"](\w+)['"]/g) || [])
  .map(m => m.match(/['"](\w+)['"]/)[1]);
const bgSendTypes = (bgContent.match(/type:\s*['"](\w+)['"]/g) || [])
  .map(m => m.match(/['"](\w+)['"]/)[1]);

log('info', `options 发送的 action: [${optSendActions.join(', ')}]`);
log('info', `background 发送的 type: [${bgSendTypes.join(', ')}]`);

optSendActions.forEach(a => {
  if (bgMsgActions.includes(a)) log('ok', `消息 action '${a}' 前后端匹配`);
  else log('error', `消息 action '${a}' 在 background 中未处理`);
});

bgSendTypes.forEach(t => {
  if (optMsgTypes.includes(t)) log('ok', `消息 type '${t}' 前后端匹配`);
  else log('warn', `消息 type '${t}' 在 options 中未监听`);
});

const storageKeys = [
  ...new Set([
    ...(bgContent.match(/chrome\.storage\.local\.(?:get|set|remove)\(/g) || []),
    ...(optJSC.match(/chrome\.storage\.local\.(?:get|set|remove)\(/g) || [])
  ])
];
log('info', `chrome.storage.local 操作: ${storageKeys.length} 处`);

const elemIds = [...optHTML.matchAll(/id=["']([^"']+)["']/g)].map(m => m[1]);
const jsGetElemIds = [...optJSC.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);

const missingInHTML = jsGetElemIds.filter(id => !elemIds.includes(id));
const unusedInJS = elemIds.filter(id => !jsGetElemIds.includes(id) &&
  !['scanLog', 'resultBox', 'resultList', 'resultStats'].includes(id));

missingInHTML.forEach(id => log('error', `JS 引用了不存在的元素 #${id}`));
unusedInJS.forEach(id => log('warn', `HTML 中的 #${id} 未在 JS 中引用`));

// ============================================================
// 汇总
// ============================================================
section('检查结果汇总');

console.log(`  ✅ 通过: ${passed}`);
console.log(`  ⚠️  警告: ${warnings}`);
console.log(`  ❌ 错误: ${errors}`);
console.log('');

if (errors > 0) {
  console.log('  🔴 存在错误，请修复后重新运行\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('  🟡 检查通过（有警告）\n');
  process.exit(0);
} else {
  console.log('  🟢 全部检查通过！\n');
  process.exit(0);
}