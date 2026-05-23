const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

process.exitCode = 0;

console.log('\n━━━ 回归测试：97 站点勋章解析快照对比 ━━━');

global.DOMParser = (new JSDOM('')).window.DOMParser;
delete require.cache[path.resolve(__dirname, '../mocks/chrome-mock.js')];
const { createChromeMock } = require('../mocks/chrome-mock');
global.chrome = createChromeMock();
global.AbortController = AbortController;
global.navigator = { userAgent: 'test' };
global.fetch = () => Promise.resolve({ ok: false });

delete require.cache[require.resolve('../../background.js')];
const bg = require('../../background.js');

const snapshotPath = path.resolve(__dirname, '../fixtures/snapshot.json');
const debugPath = path.resolve(__dirname, '../../PT_Debug_2026-05-23.json');

if (!fs.existsSync(snapshotPath)) {
  console.log('  ⚠️  快照文件不存在，请先运行: node scripts/build-snapshot.js PT_Debug_*.json');
  process.exit(0);
}
if (!fs.existsSync(debugPath)) {
  console.log('  ⚠️  调试包不存在: ' + debugPath);
  process.exit(0);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
const debugData = JSON.parse(fs.readFileSync(debugPath, 'utf-8'));
const pages = debugData.pages || [];

let passCount = 0;
let failCount = 0;
const failures = [];

for (const page of pages) {
  const url = page.url;
  const domain = new URL(url).hostname;
  const medals = bg.extractMedalsFromHtml(page.html);
  const key = url;

  const expected = snapshot.sites.find(s => s.url === url);
  const expectedCount = expected ? expected.medalCount : 0;
  const expectedMedals = expected ? expected.medals : [];

  const siteLabel = `${domain}${new URL(url).pathname}`;

  if (medals.length !== expectedCount) {
    failCount++;
    failures.push({
      site: siteLabel,
      url,
      reason: `medalCount mismatch: expected ${expectedCount}, got ${medals.length}`,
      expected: expectedMedals.map(m => m.name),
      got: medals.map(m => m.name)
    });
    continue;
  }

  let detailMismatch = false;
  for (let i = 0; i < medals.length; i++) {
    if (medals[i].name !== expectedMedals[i].name ||
        medals[i].price !== expectedMedals[i].price ||
        medals[i].duration !== expectedMedals[i].duration ||
        medals[i].bonus !== expectedMedals[i].bonus) {
      detailMismatch = true;
      failCount++;
      failures.push({
        site: siteLabel,
        url,
        reason: `medal[${i}] detail mismatch`,
        expected: { name: expectedMedals[i].name, price: expectedMedals[i].price, duration: expectedMedals[i].duration, bonus: expectedMedals[i].bonus },
        got: { name: medals[i].name, price: medals[i].price, duration: medals[i].duration, bonus: medals[i].bonus }
      });
      break;
    }
  }
  if (!detailMismatch) {
    passCount++;
  }
}

console.log(`\n  总页面数: ${snapshot.totalPages}  |  有勋章站点: ${snapshot.summary.sitesWithMedals}  |  总勋章: ${snapshot.summary.totalMedals}`);
console.log(`  ✅ 通过: ${passCount}`);
if (failCount > 0) {
  console.log(`  ❌ 失败: ${failCount}`);
  console.log('\n  失败详情:');
  for (const f of failures) {
    console.log(`\n  [${f.site}]`);
    console.log(`    ${f.reason}`);
    console.log(`    expected: ${JSON.stringify(f.expected)}`);
    console.log(`    got:      ${JSON.stringify(f.got)}`);
  }
  process.exitCode = 1;
} else {
  console.log(`  🟢 全部通过 — 无回归`);
}

console.log('\n');

// ============================================================
// Layout type coverage check
// ============================================================
console.log('━━━ 布局类型覆盖检查 ━━━');

const layoutStats = {
  'table': { pages: 0, avgMedals: 0, totalMedals: 0 },
  'table+card': { pages: 0, avgMedals: 0, totalMedals: 0 },
  'table+card+medal-container': { pages: 0, avgMedals: 0, totalMedals: 0 },
  'table+buycenter': { pages: 0, avgMedals: 0, totalMedals: 0 },
  'unknown': { pages: 0, avgMedals: 0, totalMedals: 0 }
};

for (const page of pages) {
  const html = page.html;
  let category = 'unknown';
  const hasTable = html.indexOf('<table') >= 0;
  const hasCard = html.indexOf('medal-card') >= 0;
  const hasBuycenter = html.indexOf('buycenter') >= 0;
  const hasMedalContainer = html.indexOf('medal-container') >= 0;

  const parts = [];
  if (hasTable) parts.push('table');
  if (hasCard) parts.push('card');
  if (hasBuycenter) parts.push('buycenter');
  if (hasMedalContainer) parts.push('medal-container');

  if (parts.length > 0) {
    category = parts.join('+');
  }

  if (!layoutStats[category]) {
    layoutStats[category] = { pages: 0, avgMedals: 0, totalMedals: 0 };
  }

  const entry = snapshot.sites.find(s => s.url === page.url);
  const count = entry ? entry.medalCount : 0;
  layoutStats[category].pages++;
  layoutStats[category].totalMedals += count;
}

for (const [cat, stats] of Object.entries(layoutStats)) {
  if (stats.pages === 0) continue;
  const avg = (stats.totalMedals / stats.pages).toFixed(2);
  console.log(`  ${cat.padEnd(35)} ${String(stats.pages).padStart(3)} 页  avg=${avg} 枚/页`);
}

if (layoutStats.unknown && layoutStats.unknown.pages > 0) {
  const unkList = [];
  for (const page of pages) {
    const html = page.html;
    if (html.indexOf('<table') < 0 && html.indexOf('medal-card') < 0 && html.indexOf('buycenter') < 0) {
      unkList.push(new URL(page.url).hostname);
    }
  }
  if (unkList.length > 0) {
    console.log(`    (${unkList.length} 个站点: ${[...new Set(unkList)].join(', ')})`);
  }
}

console.log('\n');