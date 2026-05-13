const { JSDOM } = require('jsdom');
const { createChromeMock } = require('../mocks/chrome-mock');

const jsdomSetup = new JSDOM('<!DOCTYPE html>');
global.DOMParser = jsdomSetup.window.DOMParser;
global.FileReader = jsdomSetup.window.FileReader;

global.chrome = createChromeMock();
global.AbortController = AbortController;
global.navigator = { userAgent: 'Mozilla/5.0 Test' };
global.fetch = () => Promise.resolve({ ok: false, status: 404 });

delete require.cache[require.resolve('../../background.js')];
const bg = require('../../background.js');

let tests = 0;
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests++;
  try {
    fn();
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

// ============================================================
// NexusPHP 标准表格结构（10列/勋章）
// td[0]=ID | td[1]=图片 | td[2]=名称(h1) | td[3]=可购买时间
// td[4]=有效期 | td[5]=加成 | td[6]=价格 | td[7]=库存
// td[8]=操作(购买/已购等) | td[9]=赠送
// ============================================================

console.log('\n━━━ background.js 单元测试 ━━━\n');

// ============================================================
// getCookieDomain
// ============================================================
console.log('  ▶ getCookieDomain');

test('标准https URL提取域名', () => {
  const r = bg.getCookieDomain('https://1ptba.com/medal.php');
  assertEqual(r, '1ptba.com');
});

test('带www子域名', () => {
  const r = bg.getCookieDomain('https://www.example.com/medal.php');
  assertEqual(r, '.example.com');
});

test('不带协议', () => {
  const r = bg.getCookieDomain('example.com/medal.php');
  assertEqual(r, 'example.com');
});

test('无效URL返回空', () => {
  const r = bg.getCookieDomain('');
  assertEqual(r, '');
});

// ============================================================
// extractTdText
// ============================================================
console.log('\n  ▶ extractTdText');

test('简单文本', () => {
  const r = bg.extractTdText('<td>黄金勋章</td>');
  assertEqual(r, '黄金勋章');
});

test('h1标签换行', () => {
  const r = bg.extractTdText('<td><h1>卟啵电竞出道纪念</h1>描述文本</td>');
  assert(r.includes('卟啵电竞出道纪念'), '应包含h1文本');
  assert(r.includes('描述文本'), '应包含描述文本');
});

test('br换行', () => {
  const r = bg.extractTdText('<td>不限<br>不限</td>');
  assertEqual(r, '不限 不限');
});

// ============================================================
// extractMedalsFromHtml - NexusPHP 标准结构
// ============================================================
console.log('\n  ▶ extractMedalsFromHtml - NexusPHP标准');

function makeNexusRow(medals) {
  let tds = '';
  for (const m of medals) {
    tds += `<td>${m.id}</td>`;
    tds += `<td><img src="${m.img}" class="preview"></td>`;
    tds += `<td><h1>${m.name}</h1>${m.desc || ''}</td>`;
    tds += `<td>${m.timeRange || '不限 ~ 不限'}</td>`;
    tds += `<td>${m.duration}</td>`;
    tds += `<td>${m.bonus}</td>`;
    tds += `<td>${m.price}</td>`;
    tds += `<td>${m.stock}</td>`;
    tds += `<td><input type="button" class="buy" data-id="${m.id}" value="${m.actionValue}"></td>`;
    tds += `<td><input type="button" value="赠送"></td>`;
  }
  return `<tr>${tds}</tr>`;
}

const sampleNexusBasic = `<table>
  <thead>
    <tr>
      <td class="colhead">ID</td>
      <td class="colhead">图片</td>
      <td class="colhead">描述</td>
      <td class="colhead">可购买时间</td>
      <td class="colhead">购买后有效期(天)</td>
      <td class="colhead">魔力加成</td>
      <td class="colhead">价格</td>
      <td class="colhead">库存</td>
      <td class="colhead">购买</td>
      <td class="colhead">赠送</td>
    </tr>
  </thead>
  <tbody>
    ${makeNexusRow([
      { id: 35, img: 'gold.png', name: '黄金勋章', desc: '稀有黄金', duration: '30', bonus: '1%', price: '1,000', stock: '无限', actionValue: '购买' },
      { id: 34, img: 'silver.png', name: '白银勋章', desc: '稀有白银', duration: '永久有效', bonus: '0.5%', price: '500', stock: '无限', actionValue: '购买' },
      { id: 33, img: 'bronze.png', name: '青铜勋章', desc: '普通青铜', duration: '180', bonus: '0%', price: '100', stock: '无限', actionValue: '已过可购买时间' }
    ])}
  </tbody>
</table>`;

test('提取可购买勋章（标准NexusPHP）', () => {
  const medals = bg.extractMedalsFromHtml(sampleNexusBasic);
  assertEqual(medals.length, 2, '应只提取2个可购买的勋章');
});

test('提取名称（从h1）', () => {
  const medals = bg.extractMedalsFromHtml(sampleNexusBasic);
  assert(medals[0].name.includes('黄金勋章'), `名称应包含"黄金勋章"，实际: ${medals[0].name}`);
  assert(medals[1].name.includes('白银勋章'), `名称应包含"白银勋章"，实际: ${medals[1].name}`);
});

test('提取价格', () => {
  const medals = bg.extractMedalsFromHtml(sampleNexusBasic);
  assertEqual(medals[0].price, '1,000');
  assertEqual(medals[1].price, '500');
});

test('提取有效期', () => {
  const medals = bg.extractMedalsFromHtml(sampleNexusBasic);
  assertEqual(medals[0].duration, '30');
  assertEqual(medals[1].duration, '永久有效');
});

test('排除非购买按钮', () => {
  const medals = bg.extractMedalsFromHtml(sampleNexusBasic);
  const hasBronze = medals.some(m => m.name.includes('青铜'));
  assert(!hasBronze, '已过可购买时间的勋章不应被提取');
});

// ============================================================
// 多个勋章在同一行
// ============================================================
console.log('\n  ▶ 多勋章单行');

const sampleMultiRow = `<table>
  <tbody>
    ${makeNexusRow([
      { id: 10, img: 'a.png', name: '勋章A', duration: '永久有效', bonus: '1%', price: '10,000', stock: '无限', actionValue: '购买' },
      { id: 9, img: 'b.png', name: '勋章B', duration: '永久有效', bonus: '2%', price: '20,000', stock: '无限', actionValue: '购买' },
      { id: 8, img: 'c.png', name: '勋章C', duration: '30', bonus: '0%', price: '5,000', stock: '无限', actionValue: '购买' },
      { id: 7, img: 'd.png', name: '勋章D', duration: '永久有效', bonus: '0%', price: '1', stock: '无限', actionValue: '已过可购买时间' }
    ])}
  </tbody>
</table>`;

test('单行多个勋章正确分组', () => {
  const medals = bg.extractMedalsFromHtml(sampleMultiRow);
  assertEqual(medals.length, 3, '应提取3个可购买的');
  assertEqual(medals[0].name, '勋章A');
  assertEqual(medals[1].name, '勋章B');
  assertEqual(medals[2].name, '勋章C');
});

test('多行多个勋章', () => {
  const html = `<table>
    <tbody>
      ${makeNexusRow([
        { id: 5, img: 'x.png', name: '勋章X', duration: '永久有效', bonus: '1%', price: '100', stock: '无限', actionValue: '购买' }
      ])}
      ${makeNexusRow([
        { id: 4, img: 'y.png', name: '勋章Y', duration: '180', bonus: '0%', price: '200', stock: '无限', actionValue: '购买' }
      ])}
    </tbody>
  </table>`;
  const medals = bg.extractMedalsFromHtml(html);
  assertEqual(medals.length, 2);
  assertEqual(medals[0].name, '勋章X');
  assertEqual(medals[1].name, '勋章Y');
});

// ============================================================
// 各种购买状态
// ============================================================
console.log('\n  ▶ 购买状态过滤');

test('仅提取value="购买"的勋章', () => {
  const html = `<table><tbody>
    ${makeNexusRow([
      { id: 1, img: 'a.png', name: '可购买', duration: '永久有效', bonus: '0%', price: '100', stock: '无限', actionValue: '购买' },
      { id: 2, img: 'b.png', name: '已购买', duration: '永久有效', bonus: '0%', price: '200', stock: '无限', actionValue: '已经购买' },
      { id: 3, img: 'c.png', name: '仅授予', duration: '永久有效', bonus: '0%', price: '300', stock: '无限', actionValue: '仅授予' },
      { id: 4, img: 'd.png', name: '库存不足', duration: '永久有效', bonus: '0%', price: '400', stock: '无限', actionValue: '库存不足' },
      { id: 5, img: 'e.png', name: '需更多魔力', duration: '永久有效', bonus: '0%', price: '500', stock: '无限', actionValue: '需要更多魔力值' }
    ])}
  </tbody></table>`;
  const medals = bg.extractMedalsFromHtml(html);
  assertEqual(medals.length, 1, '应只提取1个可购买的');
  assert(medals[0].name.includes('可购买'), '应只提取名称为"可购买"的');
});

// ============================================================
// 无表格体（无tbody）
// ============================================================
console.log('\n  ▶ 边界情况');

test('无tbody的表格', () => {
  const html = `<table>${makeNexusRow([
    { id: 1, img: 'a.png', name: '无tbody', duration: '永久有效', bonus: '0%', price: '100', stock: '无限', actionValue: '购买' }
  ])}</table>`;
  const medals = bg.extractMedalsFromHtml(html);
  assertEqual(medals.length, 1, '无tbody也应能提取');
});

test('空HTML返回空数组', () => {
  const medals = bg.extractMedalsFromHtml('');
  assertEqual(medals.length, 0);
});

test('无关HTML返回空数组', () => {
  const medals = bg.extractMedalsFromHtml('<div>这是一个普通的页面</div>');
  assertEqual(medals.length, 0);
});

// ============================================================
// getColumnLayout
// ============================================================
console.log('\n  ▶ getColumnLayout');

test('10列布局', () => {
  const r = bg.getColumnLayout(10);
  assertEqual(r.stride, 10);
  assertEqual(r.actionIdx, 8);
  assertEqual(r.nameIdx, 2);
  assertEqual(r.priceIdx, 6);
  assertEqual(r.durationIdx, 4);
});

test('20列（2个10列勋章）', () => {
  const r = bg.getColumnLayout(20);
  assertEqual(r.stride, 10);
});

test('9列布局', () => {
  const r = bg.getColumnLayout(9);
  assertEqual(r.stride, 9);
  assertEqual(r.actionIdx, 7);
  assertEqual(r.nameIdx, 1);
  assertEqual(r.priceIdx, 5);
  assertEqual(r.durationIdx, 3);
});

test('18列（2个9列勋章）', () => {
  const r = bg.getColumnLayout(18);
  assertEqual(r.stride, 9);
});

test('不支持的列数返回null', () => {
  assertEqual(bg.getColumnLayout(8), null);
  assertEqual(bg.getColumnLayout(11), null);
  assertEqual(bg.getColumnLayout(0), null);
});

// ============================================================
// extractMedalsFromHtml - 9列NexusPHP
// ============================================================
console.log('\n  ▶ extractMedalsFromHtml - 9列NexusPHP');

function makeNexus9Row(medals) {
  let tds = '';
  for (const m of medals) {
    tds += `<td><img src="${m.img}"></td>`;
    tds += `<td><h1>${m.name}</h1>${m.desc || ''}</td>`;
    tds += `<td>${m.timeRange || '不限 ~ 不限'}</td>`;
    tds += `<td>${m.duration}</td>`;
    tds += `<td>${m.bonus}</td>`;
    tds += `<td>${m.price}</td>`;
    tds += `<td>${m.stock}</td>`;
    tds += `<td><input type="button" class="buy" data-id="${m.id}" value="${m.actionValue}"></td>`;
    tds += `<td><input type="button" value="赠送"></td>`;
  }
  return `<tr>${tds}</tr>`;
}

const sample9Col = `<table>
  <thead>
    <tr>
      <td class="colhead">图片</td>
      <td class="colhead">描述</td>
      <td class="colhead">可购买时间</td>
      <td class="colhead">购买后有效期(天)</td>
      <td class="colhead">魔力加成</td>
      <td class="colhead">价格</td>
      <td class="colhead">库存</td>
      <td class="colhead">购买</td>
      <td class="colhead">赠送</td>
    </tr>
  </thead>
  <tbody>
    ${makeNexus9Row([
      { id: 1, img: 'a.png', name: '9列勋章A', duration: '30', bonus: '1%', price: '1,000', stock: '无限', actionValue: '购买' },
      { id: 2, img: 'b.png', name: '9列勋章B', duration: '永久有效', bonus: '0.5%', price: '500', stock: '无限', actionValue: '购买' },
      { id: 3, img: 'c.png', name: '9列已过期', duration: '30', bonus: '0%', price: '100', stock: '无限', actionValue: '已过可购买时间' }
    ])}
  </tbody>
</table>`;

test('9列表格提取可购买勋章', () => {
  const medals = bg.extractMedalsFromHtml(sample9Col);
  assertEqual(medals.length, 2, '应只提取2个可购买的');
});

test('9列表格提取名称', () => {
  const medals = bg.extractMedalsFromHtml(sample9Col);
  assert(medals[0].name.includes('9列勋章A'), `实际: ${medals[0].name}`);
  assert(medals[1].name.includes('9列勋章B'), `实际: ${medals[1].name}`);
});

test('9列表格提取价格', () => {
  const medals = bg.extractMedalsFromHtml(sample9Col);
  assertEqual(medals[0].price, '1,000');
  assertEqual(medals[1].price, '500');
});

test('9列表格提取有效期', () => {
  const medals = bg.extractMedalsFromHtml(sample9Col);
  assertEqual(medals[0].duration, '30');
  assertEqual(medals[1].duration, '永久有效');
});

test('9列表格多勋章单行', () => {
  const html = `<table><tbody>
    ${makeNexus9Row([
      { id: 1, img: 'a.png', name: '勋章A', duration: '永久有效', bonus: '0%', price: '100', stock: '无限', actionValue: '购买' },
      { id: 2, img: 'b.png', name: '勋章B', duration: '30', bonus: '0%', price: '200', stock: '无限', actionValue: '购买' },
      { id: 3, img: 'c.png', name: '勋章C', duration: '180', bonus: '0%', price: '300', stock: '无限', actionValue: '已过可购买时间' }
    ])}
  </tbody></table>`;
  const medals = bg.extractMedalsFromHtml(html);
  assertEqual(medals.length, 2);
  assertEqual(medals[0].name, '勋章A');
  assertEqual(medals[1].name, '勋章B');
});

// ============================================================
// extractMedalsFromBuyCenter
// ============================================================
console.log('\n  ▶ extractMedalsFromBuyCenter');

test('buycenter提取可购买的勋章', () => {
  const html = `<table>
    <tr>
      <td class="colhead" colspan="6">勋章中心</td>
    </tr>
    <tr>
      <td></td>
      <td>《测试勋章》 ⠀这是一个测试勋章 (可购买时间: 不限)</td>
      <td>100</td>
      <td>1</td>
      <td>50,000</td>
      <td><input type="button" name="submit" value="交换&nbsp;/&nbsp;赠送" onclick="submit_karma_gift(1)"></td>
    </tr>
    <tr>
      <td></td>
      <td>《VIP勋章》 ⠀VIP用户专属 (可购买时间: 不限)</td>
      <td>50</td>
      <td>1</td>
      <td>100,000</td>
      <td><input type="button" name="submit" value="需要更多魔力值" disabled="disabled"></td>
    </tr>
    <tr>
      <td></td>
      <td>《周年勋章》 ⠀一周年纪念 (可购买时间: 不限)</td>
      <td>200</td>
      <td>1</td>
      <td>200,000</td>
      <td><input type="button" name="submit" value="交换&nbsp;/&nbsp;赠送" onclick="submit_karma_gift(3)"></td>
    </tr>
  </table>`;
  const medals = bg.extractMedalsFromBuyCenter(html);
  assertEqual(medals.length, 2, '应只提取2个可交换的');
});

test('buycenter提取名称', () => {
  const html = `<table>
    <tr><td></td><td>《测试勋章》 ⠀测试描述</td><td>100</td><td>1</td><td>50,000</td>
      <td><input type="button" value="交换&nbsp;/&nbsp;赠送" onclick="submit_karma_gift(1)"></td></tr>
  </table>`;
  const medals = bg.extractMedalsFromBuyCenter(html);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].name, '《测试勋章》');
});

test('buycenter提取价格', () => {
  const html = `<table>
    <tr><td></td><td>《测试勋章》 ⠀测试描述内容</td><td>100</td><td>1</td><td>50,000</td>
      <td><input type="button" value="交换&nbsp;/&nbsp;赠送" onclick="submit_karma_gift(1)"></td></tr>
  </table>`;
  const medals = bg.extractMedalsFromBuyCenter(html);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].price, '50,000');
});

test('buycenter空HTML返回空数组', () => {
  const medals = bg.extractMedalsFromBuyCenter('');
  assertEqual(medals.length, 0);
});

// ============================================================
// 汇总
// ============================================================
console.log(`\n  ━━━ background.js: ${passed}/${tests} 通过 ━━━`);
if (failed > 0) {
  console.log(`  ❌ ${failed} 个测试失败\n`);
  process.exitCode = 1;
} else {
  console.log('  🟢 全部通过\n');
}

module.exports = { passed, failed, tests };