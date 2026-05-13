#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

if (process.argv.length < 3) {
  console.error('用法: node scripts/analyze-html.js <debug-file.json>');
  console.error('       node scripts/analyze-html.js <raw.html>');
  process.exit(1);
}

const inputPath = path.resolve(process.argv[2]);
if (!fs.existsSync(inputPath)) {
  console.error(`文件不存在: ${inputPath}`);
  process.exit(1);
}

const ext = path.extname(inputPath).toLowerCase();

// Mock minimal chrome API for background.js
const mockStorage = new Map();
global.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        const result = {};
        const kArr = Array.isArray(keys) ? keys : [keys];
        kArr.forEach(k => { if (mockStorage.has(k)) result[k] = mockStorage.get(k); });
        if (cb) setTimeout(() => cb(result), 0);
        return Promise.resolve(result);
      },
      set(items, cb) {
        Object.entries(items).forEach(([k, v]) => mockStorage.set(k, v));
        if (cb) setTimeout(cb, 0);
        return Promise.resolve();
      }
    }
  },
  cookies: { getAll(_details, cb) { if (cb) setTimeout(() => cb([]), 0); return Promise.resolve([]); } },
  runtime: {
    sendMessage() {},
    onMessage: { addListener() {} }
  },
  action: { onClicked: { addListener() {} } },
  tabs: { create() {} }
};
global.AbortController = AbortController;
global.navigator = { userAgent: 'Mozilla/5.0 Analyzer' };
global.fetch = () => Promise.resolve({ ok: false });

delete require.cache[require.resolve(path.join(ROOT, 'background.js'))];
const bg = require(path.join(ROOT, 'background.js'));

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPurchaseInputs(html) {
  const regex = /<input[^>]*value="购买[^"]*"[^>]*>/gi;
  const matches = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    matches.push({ index: m.index, text: m[0] });
  }
  return matches;
}

function analyzeContainer(html, pos) {
  const before = html.slice(Math.max(0, pos - 2000), pos);
  const after = html.slice(pos, pos + 2000);

  const boundaries = {};
  const trIdx = before.lastIndexOf('<tr');
  if (trIdx !== -1) boundaries.tr = trIdx;
  if (trIdx === -1) {
    const tdIdx = before.lastIndexOf('<td');
    if (tdIdx !== -1) boundaries.td = tdIdx;
  }
  if (Object.keys(boundaries).length === 0) {
    const divIdx = before.lastIndexOf('<div');
    if (divIdx !== -1) boundaries.div = divIdx;
  }

  let containerHtml;
  const startValues = Object.values(boundaries);
  if (startValues.length > 0) {
    const start = Math.max(...startValues);
    containerHtml = html.slice(start, pos + 2000);
  } else {
    containerHtml = before + after;
  }

  const altMatch = containerHtml.match(/alt\s*=\s*["']([^"']+)["']/i);
  const altText = altMatch ? altMatch[1].trim() : '';

  const text = stripTags(containerHtml);

  return { boundaries, containerHtml: containerHtml.slice(0, 300), altText, text };
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  let pages;

  if (filePath.endsWith('.json')) {
    try {
      const data = JSON.parse(content);
      if (data.pages && Array.isArray(data.pages)) {
        pages = data.pages;
        console.log(`📦 调试包: ${data.dateStr || '未知日期'}, ${pages.length} 个页面\n`);
      } else if (data.html) {
        pages = [{ url: data.url || 'single-page', html: data.html }];
      } else {
        console.error('JSON 格式无法识别，需要包含 pages 数组');
        process.exit(1);
      }
    } catch (e) {
      console.error('JSON 解析失败:', e.message);
      process.exit(1);
    }
  } else {
    pages = [{ url: filePath, html: content }];
  }

  let totalFound = 0;
  let totalExpected = 0;

  for (const page of pages) {
    const { url, html } = page;
    console.log('═══════════════════════════════════════════════════════');
    console.log(`🔗 ${url}`);
    console.log(`📐 HTML 大小: ${(html.length / 1024).toFixed(1)} KB`);
    console.log('───────────────────────────────────────────────────────');

    // Step 1: Find all purchase inputs
    const inputs = findPurchaseInputs(html);
    console.log(`\n📥 购买按钮匹配: ${inputs.length} 个`);
    inputs.forEach((inp, i) => {
      const ctx = analyzeContainer(html, inp.index);
      console.log(`\n  [${i + 1}] 位置 ${inp.index}: ${inp.text}`);
      console.log(`      容器边界: ${JSON.stringify(ctx.boundaries)}`);
      console.log(`      alt文本: ${ctx.altText || '(无)'}`);
      console.log(`      去标签文本: ${ctx.text.slice(0, 200)}`);
    });

    // Step 2: Run the actual extraction
    const medals = bg.extractMedalsFromHtml(html);
    console.log(`\n🏅 实际提取结果: ${medals.length} 个勋章`);
    medals.forEach((m, i) => {
      console.log(`  [${i + 1}] 名称="${m.name}"  价格="${m.price}"  有效期="${m.duration}"`);
    });

    totalFound += medals.length;

    // Step 3: Show HTML context around each purchase button (raw)
    console.log('\n📄 原始HTML上下文（每个购买按钮前后300字符）:');
    inputs.forEach((inp, i) => {
      const start = Math.max(0, inp.index - 300);
      const end = Math.min(html.length, inp.index + 300);
      console.log(`\n  --- [${i + 1}] input at ${inp.index} ---`);
      console.log(`  ${html.slice(start, end).replace(/\n/g, '\\n')}`);
    });

    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 汇总: 共 ${pages.length} 个页面，提取 ${totalFound} 个勋章`);
  console.log('');
}

analyzeFile(inputPath);