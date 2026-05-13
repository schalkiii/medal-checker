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
  const regex = /<input[^>]*?value\s*=\s*"[^"]*(?:购买|購買|交换)[^"]*"[^>]*>/gi;
  const matches = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    matches.push({ index: m.index, text: m[0] });
  }
  return matches;
}

function analyzeRow(tds, layout) {
  const stride = layout.stride;
  const groups = [];
  for (let i = 0; i + stride - 1 < tds.length; i += stride) {
    const group = tds.slice(i, i + stride);
    const actionTd = group[layout.actionIdx] || '';
    const actionInputs = actionTd.match(/value\s*=\s*"([^"]*)"/i);
    const actionValue = actionInputs ? actionInputs[1] : '(no input)';
    const nameText = bg.extractTdText(group[layout.nameIdx] || '');
    const nameH1 = nameText.match(/^(.+?)(?:\n|$)/);
    const name = nameH1 ? nameH1[1].trim() : '(no h1)';
    const price = bg.extractTdText(group[layout.priceIdx] || '').trim();
    const duration = bg.extractTdText(group[layout.durationIdx] || '').trim();
    groups.push({ name, price, duration, actionValue });
  }
  return groups;
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

  for (const page of pages) {
    const { url, html } = page;
    console.log('═══════════════════════════════════════════════════════');
    console.log(`🔗 ${url}`);
    console.log(`📐 HTML 大小: ${(html.length / 1024).toFixed(1)} KB`);
    console.log('───────────────────────────────────────────────────────');

    const isBuyCenter = url.includes('buycenter.php');

    if (isBuyCenter) {
      // Analyze buycenter structure
      console.log('\n📋 BuyCenter 分析:');
      const rows = html.match(/<tr[\s\S]*?(?=<tr|$)/gi) || [];
      let dataRowCount = 0;
      for (const row of rows) {
        const tds = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
        if (tds.length >= 6) {
          const nameText = bg.extractTdText(tds[1] || '');
          const actionTd = tds[5] || '';
          const actionInputs = actionTd.match(/value\s*=\s*"([^"]*)"/i);
          const actionValue = actionInputs ? actionInputs[1] : '(none)';
          const isDisabled = actionTd.includes('disabled');
          const price = bg.extractTdText(tds[4] || '');
          console.log(`  行 ${dataRowCount}: price=${price} action="${actionValue}"${isDisabled ? ' [disabled]' : ''} name="${nameText.substring(0, 50)}"`);
          dataRowCount++;
        }
      }
      console.log(`  数据行数: ${dataRowCount}`);
    } else {
      // Analyze table structure
      console.log('\n📋 表格结构分析:');
      const rows = html.match(/<tr[\s\S]*?(?=<tr|$)/gi) || [];
      const colCounts = {};
      let dataRows = 0;

      for (const row of rows) {
        const tds = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
        if (tds.length >= 5) {
          colCounts[tds.length] = (colCounts[tds.length] || 0) + 1;
          if (!row.includes('colhead') && !row.includes('thead')) {
            dataRows++;
            const layout = bg.getColumnLayout(tds.length);
            if (layout) {
              const groups = analyzeRow(tds, layout);
              if (groups.length > 0) {
                console.log(`  ${tds.length}列数据行 (${groups.length}组):`);
                groups.forEach((g, gi) => {
                  const purchasable = g.actionValue.includes('购买') || g.actionValue.includes('購買') ? '✅' : '❌';
                  console.log(`    [${gi}] ${purchasable} name="${g.name.substring(0, 40)}" price=${g.price} duration=${g.duration} action="${g.actionValue}"`);
                });
              }
            }
          }
        }
      }

      console.log(`  列数分布: ${JSON.stringify(colCounts)}`);
      console.log(`  数据行数: ${dataRows}`);

      // Find all purchase inputs
      const inputs = findPurchaseInputs(html);
      console.log(`\n📥 购买/交换按钮: ${inputs.length} 个`);
      const uniqueActions = new Set();
      inputs.forEach(inp => {
        const valMatch = inp.text.match(/value\s*=\s*"([^"]*)"/i);
        if (valMatch) uniqueActions.add(valMatch[1]);
      });
      console.log(`  按钮类型: ${[...uniqueActions].join(', ')}`);
    }

    // Run actual extraction
    const medals = isBuyCenter
      ? bg.extractMedalsFromBuyCenter(html)
      : bg.extractMedalsFromHtml(html);
    console.log(`\n🏅 实际提取结果: ${medals.length} 个`);
    medals.forEach((m, i) => {
      console.log(`  [${i + 1}] 「${m.name}」 价格=${m.price} 有效期=${m.duration}`);
    });

    totalFound += medals.length;
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 汇总: 共 ${pages.length} 个页面，提取 ${totalFound} 个勋章`);
  console.log('');
}

analyzeFile(inputPath);