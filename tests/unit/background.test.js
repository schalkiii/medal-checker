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

// 异步测试：同步 test() 不会等待 Promise，异步用例先入队，
// 由文件末尾的统一汇总器 await 后判定，避免"假通过"
const asyncTests = [];
function testAsync(name, fn) {
  asyncTests.push({ name, fn });
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
    tds += `<td><img src="${m.img}"></td>`;
    tds += `<td><h1>${m.name}</h1>${m.desc || ''}</td>`;
    tds += `<td>${m.timeRange || '不限 ~ 不限'}</td>`;
    tds += `<td>${m.duration}</td>`;
    tds += `<td>${m.bonus || '0%'}</td>`;
    tds += `<td>${m.price}</td>`;
    tds += `<td>${m.stock || '无限'}</td>`;
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
  assertEqual(medals[0].bonus, '1%');
  assertEqual(medals[1].bonus, '2%');
  assertEqual(medals[2].bonus, '0%');
  assertEqual(medals[0].stock, '无限');
  assertEqual(medals[1].stock, '无限');
  assertEqual(medals[2].stock, '无限');
  assertEqual(medals[0].timeRange, '不限');
  assertEqual(medals[1].timeRange, '不限');
  assertEqual(medals[2].timeRange, '不限');
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
  assertEqual(r.bonusIdx, 5);
  assertEqual(r.stockIdx, 7);
  assertEqual(r.timeIdx, 3);
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
  assertEqual(r.bonusIdx, 4);
  assertEqual(r.stockIdx, 6);
  assertEqual(r.timeIdx, 2);
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
    tds += `<td>${m.bonus || '0%'}</td>`;
    tds += `<td>${m.price}</td>`;
    tds += `<td>${m.stock || '无限'}</td>`;
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
      { id: 2, img: 'b.png', name: '9列勋章B', duration: '永久有效', bonus: '0.5%', price: '500', stock: '10', actionValue: '购买' },
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

test('9列表格提取加成', () => {
  const medals = bg.extractMedalsFromHtml(sample9Col);
  assertEqual(medals[0].bonus, '1%');
  assertEqual(medals[1].bonus, '0.5%');
});

test('9列表格提取库存', () => {
  const medals = bg.extractMedalsFromHtml(sample9Col);
  assertEqual(medals[0].stock, '无限');
  assertEqual(medals[1].stock, '10');
});

test('9列表格提取可购买时间', () => {
  const medals = bg.extractMedalsFromHtml(sample9Col);
  assertEqual(medals[0].timeRange, '不限');
  assertEqual(medals[1].timeRange, '不限');
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

test('buycenter提取库存和时间', () => {
  const html = `<table>
    <tr><td></td><td>《测试勋章》 ⠀测试描述 (可购买时间: 2025-01-01 ~ 2025-12-31)</td><td>88</td><td>1</td><td>50,000</td>
      <td><input type="button" value="交换&nbsp;/&nbsp;赠送" onclick="submit_karma_gift(1)"></td></tr>
  </table>`;
  const medals = bg.extractMedalsFromBuyCenter(html);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].stock, '88');
  assertEqual(medals[0].timeRange, '2025-01-01 ~ 2025-12-31');
});

test('buycenter空HTML返回空数组', () => {
  const medals = bg.extractMedalsFromBuyCenter('');
  assertEqual(medals.length, 0);
});

// ============================================================
// pterclub 自定义表格布局
// ============================================================
console.log('\n  ▶ extractMedalsFromPterclub');

const makePterclubHtml = (medalsData) => {
  let html = '<table align="center" width="70%" border="1" cellspacing="0" cellpadding="3">\n';
  html += '<tr><td class="colhead" colspan="6"><font class="big">猫 站 纪 念 徽 章</font></td></tr>\n';
  html += '<tr><td class="text" align="center" colspan="6">用你的猫粮换取徽章！</td></tr>\n';

  for (const m of medalsData) {
    html += '<tr><td class="colhead" align="center" colspan="6"><font class="big">[' + m.catId + '] ' + m.catName + '<br>(' + m.code + ' ' + m.desc + ')</font></td></tr>\n';
    html += '<tr>\n';
    html += '<td colspan="6"><div class="text" style="text-align:center;">';
    html += '<img title="' + m.name + '" src="storage/uploadpicz/hz/' + m.code + '.jpg" /><br>\n';
    html += '<form action="?page=page010&action=buymedal" method="post"><center>';
    const disabledAttr = m.disabled ? ' disabled="disabled"' : '';
    html += '<input type="submit" name="medalchosen" value="' + m.code + ' (' + m.price + ' 猫粮)"' + disabledAttr + ' />';
    html += '</center></form></div></td>\n</tr>\n';
  }

  html += '</table>';
  return html;
};

const samplePterclubHtml = makePterclubHtml([
  { catId: '042', catName: '五二零表白日', code: '042-001', name: '2026年五二零表白日纪念徽章', price: '52,099', desc: '此徽章仅于2026年5月20日至5月23日换领。', disabled: false },
  { catId: '041', catName: '五一劳动节暨母亲节', code: '041-001', name: '2026年五一劳动节纪念徽章', price: '30,000', desc: '此徽章仅于2026年5月1日至5月10日换领', disabled: false },
  { catId: '040', catName: '清明节', code: '040-001', name: '2026年清明节纪念徽章', price: '45,400', desc: '此徽章仅于2026年4月5日至4月8日换领。', disabled: true },
  { catId: '039', catName: '三八妇女节/女神节', code: '039-001', name: '2026年三八妇女节/女神节纪念徽章', price: '38,000', desc: '此徽章仅于2026年3月8日至3月14日换领。', disabled: true },
]);

test('pterclub 提取非disabled勋章', () => {
  const medals = bg.extractMedalsFromPterclub(samplePterclubHtml);
  assertEqual(medals.length, 2, '应提取2个非disabled勋章');
});

test('pterclub 提取名称', () => {
  const medals = bg.extractMedalsFromPterclub(samplePterclubHtml);
  assertEqual(medals[0].name, '2026年五二零表白日纪念徽章');
  assertEqual(medals[1].name, '2026年五一劳动节纪念徽章');
});

test('pterclub 提取价格', () => {
  const medals = bg.extractMedalsFromPterclub(samplePterclubHtml);
  assertEqual(medals[0].price, '52099');
  assertEqual(medals[1].price, '30000');
});

test('pterclub 提取medalId (code)', () => {
  const medals = bg.extractMedalsFromPterclub(samplePterclubHtml);
  assertEqual(medals[0].medalId, '042-001');
  assertEqual(medals[1].medalId, '041-001');
});

test('pterclub 全部disabled返回空数组', () => {
  const html = makePterclubHtml([
    { catId: '040', catName: '清明节', code: '040-001', name: '清明节纪念徽章', price: '45,400', desc: '仅于4月5日至4月8日换领。', disabled: true },
  ]);
  const medals = bg.extractMedalsFromPterclub(html);
  assertEqual(medals.length, 0);
});

test('pterclub 空HTML返回空数组', () => {
  const medals = bg.extractMedalsFromPterclub('');
  assertEqual(medals.length, 0);
});

test('pterclub 无medalchosen按钮返回空数组', () => {
  const medals = bg.extractMedalsFromPterclub('<table><tr><td>No medals here</td></tr></table>');
  assertEqual(medals.length, 0);
});

test('pterclub 名称不存在的勋章被跳过', () => {
  const html = makePterclubHtml([
    { catId: '040', catName: '测试', code: '040-001', name: '', price: '45,400', desc: 'test', disabled: false },
  ]);
  const medals = bg.extractMedalsFromPterclub(html);
  assertEqual(medals.length, 0);
});

// ============================================================
// sendToFeishu
// ============================================================
console.log('\n  ▶ sendToFeishu');

testAsync('sendToFeishu 发送POST请求', async () => {
  let capturedUrl, capturedOptions;
  const originalFetch = global.fetch;
  global.fetch = (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return Promise.resolve({ ok: true });
  };

  const results = [{ siteName: '测试站', count: 2, url: 'https://test.com', medals: [{ name: '勋章A', price: '1000' }, { name: '勋章B', duration: '30天' }] }];
  await bg.sendToFeishu('https://webhook.test', results, '2026-05-14 10:00');

  assertEqual(capturedUrl, 'https://webhook.test');
  assertEqual(capturedOptions.method, 'POST');
  assertEqual(capturedOptions.headers['Content-Type'], 'application/json');

  const body = JSON.parse(capturedOptions.body);
  assertEqual(body.msg_type, 'post');
  assert(body.content.post.zh_cn.title.includes('PT勋章扫描报告'));
  assert(body.content.post.zh_cn.content.length > 0);

  global.fetch = originalFetch;
});

testAsync('sendToFeishu 空结果也发送', async () => {
  let capturedBody;
  const originalFetch = global.fetch;
  global.fetch = (url, options) => {
    capturedBody = JSON.parse(options.body);
    return Promise.resolve({ ok: true });
  };

  await bg.sendToFeishu('https://webhook.test', [], '2026-05-14 10:00');
  assert(capturedBody.content.post.zh_cn.content.some(line =>
    line.some(block => block.text && block.text.includes('没有发现'))
  ));

  global.fetch = originalFetch;
});

testAsync('sendToFeishu 包含勋章详情', async () => {
  let capturedBody;
  const originalFetch = global.fetch;
  global.fetch = (url, options) => {
    capturedBody = JSON.parse(options.body);
    return Promise.resolve({ ok: true });
  };

  const results = [{ siteName: '测试站', count: 1, url: 'https://test.com', medals: [{ name: '稀有勋章', price: '5000', duration: '永久', bonus: '2%' }] }];
  await bg.sendToFeishu('https://webhook.test', results, '2026-05-14 10:00');

  const allText = capturedBody.content.post.zh_cn.content.map(line => line.map(b => b.text).join('')).join('');
  assert(allText.includes('稀有勋章'));
  assert(allText.includes('5000'));
  assert(allText.includes('永久'));

  global.fetch = originalFetch;
});

// ============================================================
// extractMedalsFromCards — card layout
// ============================================================
console.log('\n  ▶ extractMedalsFromCards - card layout');

function makeCardHtml(medals, useButton = false) {
  let cards = '';
  for (const m of medals) {
    const btnHtml = useButton
      ? `<div class="medal-action"><button type="button" class="btn buy " data-id="${m.id}"${m.disabled ? ' disabled' : ''}>${m.btnText || '购买'}</button></div>`
      : `<div class="medal-action"><input type="button" class="btn buy" data-id="${m.id}" value="${m.btnText || '购买'}"${m.disabled ? ' disabled' : ''}></div>`;
    cards += `<div class="medal-card ${m.cardClass || 'unpurchased'}">
      <div class="medal-image-container"><img src="${m.img}.png" alt="${m.name}"></div>
      <div class="medal-name">${m.name}</div>
      <div class="medal-info">
        <div><strong>可购买时间：</strong>${m.timeRange || '不限'}</div>
        <div><strong>购买后有效期(天)：</strong>${m.duration}</div>
        <div><strong>啤酒瓶加成：</strong>${m.bonus}</div>
        <div><strong>价格：</strong>${m.price}</div>
        <div><strong>库存：</strong>${m.stock}</div>
      </div>
      ${btnHtml}
    </div>`;
  }
  return `<div class="medal-cards"><div class="medal-list">${cards}</div></div>`;
}

function makeCardContainerHtml(medals) {
  let cards = '';
  for (const m of medals) {
    cards += `<div class="medal-card ${m.cardClass || 'unpurchased'}">
      <div class="medal-image-container"><img src="${m.img}.png" alt="${m.name}"></div>
      <div class="medal-name">${m.name}</div>
      <div class="medal-info">
        <div><strong>可购买时间：</strong>${m.timeRange || '不限'}</div>
        <div><strong>购买后有效期(天)：</strong>${m.duration}</div>
        <div><strong>啤酒瓶加成：</strong>${m.bonus}</div>
        <div><strong>价格：</strong>${m.price}</div>
        <div><strong>库存：</strong>${m.stock}</div>
      </div>
      <div class="medal-action"><button type="button" class="btn buy " data-id="${m.id}"${m.disabled ? ' disabled' : ''}>${m.btnText || '购买'}</button></div>
    </div>`;
  }
  return `<div class="medal-container"><div class="medal-list-time">${cards}</div></div>`;
}

const sampleCardInput = makeCardHtml([
  { id: 82, img: 'dashu', name: '大暑', duration: '365', bonus: '0.5%', price: '24,000', stock: '无限', btnText: '未到可购买时间', disabled: true },
  { id: 81, img: 'xiaoshu', name: '小暑', duration: '365', bonus: '0.5%', price: '24,000', stock: '无限', btnText: '未到可购买时间', disabled: true },
  { id: 80, img: 'xiazhi', name: '夏至', duration: '365', bonus: '0.5%', price: '24,000', stock: '无限', btnText: '购买', disabled: false },
  { id: 79, img: 'mangzhong', name: '芒种', duration: '365', bonus: '0.5%', price: '24,000', stock: '无限', btnText: '购买', disabled: false },
  { id: 78, img: 'xiaoman', name: '小满', duration: '365', bonus: '0.5%', price: '24,000', stock: '无限', btnText: '已过期', disabled: true }
]);

const sampleCardButton = makeCardContainerHtml([
  { id: 82, img: 'dashu', name: '大暑', duration: '365', bonus: '0.5%', price: '24,000', stock: '无限', btnText: '未到可购买时间', disabled: true },
  { id: 81, img: 'xiaoshu', name: '小暑', duration: '365', bonus: '0.5%', price: '24,000', stock: '无限', btnText: '未到可购买时间', disabled: true },
  { id: 80, img: 'xiazhi', name: '夏至', duration: '365', bonus: '0.5%', price: '24,000', stock: '无限', btnText: '购买', disabled: false },
  { id: 79, img: 'mangzhong', name: '芒种', duration: '365', bonus: '0.5%', price: '24,000', stock: '无限', btnText: '购买', disabled: false }
]);

test('卡片布局(medal-cards+input)提取可购买勋章', () => {
  const medals = bg.extractMedalsFromCards(sampleCardInput);
  assertEqual(medals.length, 2, '应提取2个可购买勋章');
});

test('卡片布局提取名称', () => {
  const medals = bg.extractMedalsFromCards(sampleCardInput);
  assert(medals[0].name.includes('夏至'), `实际名称: ${medals[0].name}`);
  assert(medals[1].name.includes('芒种'), `实际名称: ${medals[1].name}`);
});

test('卡片布局提取价格和有效期', () => {
  const medals = bg.extractMedalsFromCards(sampleCardInput);
  assertEqual(medals[0].price, '24,000');
  assertEqual(medals[0].duration, '365');
});

test('卡片布局提取加成和库存', () => {
  const medals = bg.extractMedalsFromCards(sampleCardInput);
  assertEqual(medals[0].bonus, '0.5%');
  assertEqual(medals[0].stock, '无限');
});

test('卡片布局提取medalId', () => {
  const medals = bg.extractMedalsFromCards(sampleCardInput);
  assertEqual(medals[0].medalId, '80');
  assertEqual(medals[1].medalId, '79');
});

test('卡片布局(medal-container+button)提取可购买勋章', () => {
  const medals = bg.extractMedalsFromCards(sampleCardButton);
  assertEqual(medals.length, 2, 'medal-container+button 应提取2个可购买勋章');
});

test('卡片布局button格式提取名称和价格', () => {
  const medals = bg.extractMedalsFromCards(sampleCardButton);
  assert(medals[0].name.includes('夏至'));
  assertEqual(medals[0].price, '24,000');
  assertEqual(medals[0].medalId, '80');
});

test('卡片布局过滤disabled按钮', () => {
  const html = makeCardHtml([
    { id: 1, img: 'a', name: '已禁用', duration: '30', bonus: '0%', price: '100', stock: '无限', btnText: '购买', disabled: true },
    { id: 2, img: 'b', name: '可用', duration: '30', bonus: '0%', price: '200', stock: '无限', btnText: '购买', disabled: false }
  ]);
  const medals = bg.extractMedalsFromCards(html);
  assertEqual(medals.length, 1);
  assert(medals[0].name.includes('可用'));
});

test('卡片布局过滤非购买文本', () => {
  const html = makeCardHtml([
    { id: 1, img: 'a', name: '仅授予', duration: '30', bonus: '0%', price: '100', stock: '无限', btnText: '仅授予', disabled: false },
    { id: 2, img: 'b', name: '可购买', duration: '30', bonus: '0%', price: '200', stock: '无限', btnText: '购买', disabled: false }
  ]);
  const medals = bg.extractMedalsFromCards(html);
  assertEqual(medals.length, 1);
  assert(medals[0].name.includes('可购买'));
});

test('卡片布局空HTML返回空数组', () => {
  const medals = bg.extractMedalsFromCards('');
  assertEqual(medals.length, 0);
});

test('卡片布局无容器返回空数组', () => {
  const medals = bg.extractMedalsFromCards('<div>普通页面</div>');
  assertEqual(medals.length, 0);
});

// ============================================================
// zmpt SPA 检测
// ============================================================
console.log('\n  ▶ zmpt SPA 检测');

test('zmpt SPA 页面不触发常规表格提取', () => {
  const html = '<html><head><link rel="modulepreload" href="/build/js/xxx.js"></head><body><div id="vite-app"></div></body></html>';
  const medals = bg.extractMedalsFromHtml(html);
  assertEqual(medals.length, 0, 'SPA空壳不应提取到勋章');
});

test('zmpt 检测条件: vite-app + modulepreload', () => {
  const zmptHtml = '<html><head><link rel="modulepreload" href="/build/js/xxx.js"></head><body><div id="vite-app"></div></body></html>';
  const isZmpt = zmptHtml.includes('id="vite-app"') && zmptHtml.includes('modulepreload');
  assert(isZmpt, '应检测为SPA站点');
});

test('非SPA站点不被误判', () => {
  const normalHtml = '<html><body><table><tr><td class="colhead">勋章</td></tr></table></body></html>';
  const isZmpt = normalHtml.includes('id="vite-app"') && normalHtml.includes('modulepreload');
  const isNotZmpt = !isZmpt;
  assert(isNotZmpt, '普通表格页面不应被误判为SPA');
});

testAsync('extractMedalsFromZmpt 在缺少 chrome.tabs 时返回空', async () => {
  // 注意：必须用 testAsync 真正 await——若用同步 test() 包裹，
  // 内部的 tabs.create 会真实执行并永久等待 complete 事件，
  // 其 45 秒兜底定时器会拖住整个测试进程
  const originalChrome = global.chrome;
  global.chrome = { ...originalChrome, tabs: undefined };
  try {
    const result = await bg.extractMedalsFromZmpt('https://zmpt.cc/medal.php', []);
    assertEqual(result.length, 0, '无chrome.tabs时应返回空');
  } finally {
    global.chrome = originalChrome;
  }
});

// ============================================================
// extractMedalsFromMedalItems — medal-item 卡片布局
// ============================================================
console.log('\n  ▶ extractMedalsFromMedalItems - medal-item卡片布局');

function makeMedalItemHtml(medals) {
  let items = '';
  for (const m of medals) {
    const btnClass = m.btnClass || 'buy-btn';
    items += `<div class="medal-item">
        <img src="${m.img}.png" alt="${m.name}" />
        <div class="medal-info">
            <h2>${m.name}</h2>
            <p>${m.desc || ''}</p>
            <p>${m.timeRange || '不限~不限'}</p>
            <table class="medal-details">
                <tr><td>加成</td><td>${m.bonus || '0%'}</td></tr>
                <tr><td>有效期</td><td>${m.duration}</td></tr>
                <tr><td>价格</td><td>${m.price}</td></tr>
                <tr><td>库存</td><td>${m.stock || '无限'}</td></tr>
            </table>
        </div>
        <div class="action-container">
            <input type="button" class="${btnClass}" data-id="${m.id}" value="${m.btnValue}"${m.disabled ? ' disabled' : ''}>
        </div>
    </div>`;
  }
  return `<div class="medal-type-container"><div class="medal-list">${items}</div></div>`;
}

const sampleMedalItems = makeMedalItemHtml([
  { id: 80, img: 'a', name: '测试勋章A', desc: '描述A', duration: '365', bonus: '5%', price: '100,000', stock: '50', btnClass: 'buy-btn', btnValue: '购买', disabled: false },
  { id: 79, img: 'b', name: '测试勋章B', desc: '描述B', duration: '永久有效', bonus: '0%', price: '50,000', stock: '无限', btnClass: 'buy-btn', btnValue: '购买', disabled: false },
  { id: 78, img: 'c', name: '已禁用勋章', duration: '30', bonus: '0%', price: '10,000', stock: '无限', btnClass: 'buy-btn', btnValue: '库存不足', disabled: true },
  { id: 77, img: 'd', name: '仅授予勋章', duration: '永久有效', bonus: '0%', price: '0', stock: '无限', btnClass: 'gift-btn', btnValue: '仅授予', disabled: false },
  { id: 76, img: 'e', name: '赠送勋章', duration: '30', bonus: '0%', price: '100', stock: '无限', btnClass: 'buy-btn', btnValue: '赠送', disabled: false }
]);

test('medal-item 提取可购买勋章', () => {
  const medals = bg.extractMedalsFromMedalItems(sampleMedalItems);
  assertEqual(medals.length, 2, '应提取2个可购买勋章');
});

test('medal-item 提取名称', () => {
  const medals = bg.extractMedalsFromMedalItems(sampleMedalItems);
  assert(medals[0].name.includes('测试勋章A'), `实际名称: ${medals[0].name}`);
  assert(medals[1].name.includes('测试勋章B'), `实际名称: ${medals[1].name}`);
});

test('medal-item 提取价格和有效期', () => {
  const medals = bg.extractMedalsFromMedalItems(sampleMedalItems);
  assertEqual(medals[0].price, '100,000');
  assertEqual(medals[0].duration, '365');
  assertEqual(medals[1].price, '50,000');
  assertEqual(medals[1].duration, '永久有效');
});

test('medal-item 提取加成和库存', () => {
  const medals = bg.extractMedalsFromMedalItems(sampleMedalItems);
  assertEqual(medals[0].bonus, '5%');
  assertEqual(medals[0].stock, '50');
  assertEqual(medals[1].bonus, '0%');
  assertEqual(medals[1].stock, '无限');
});

test('medal-item 提取medalId', () => {
  const medals = bg.extractMedalsFromMedalItems(sampleMedalItems);
  assertEqual(medals[0].medalId, '80');
  assertEqual(medals[1].medalId, '79');
});

test('medal-item 过滤disabled按钮', () => {
  const medals = bg.extractMedalsFromMedalItems(sampleMedalItems);
  const hasDisabled = medals.some(m => m.name.includes('已禁用'));
  assert(!hasDisabled, 'disabled按钮的勋章不应被提取');
});

test('medal-item 过滤"仅授予"按钮', () => {
  const medals = bg.extractMedalsFromMedalItems(sampleMedalItems);
  const hasAward = medals.some(m => m.name.includes('仅授予'));
  assert(!hasAward, '仅授予的勋章不应被提取');
});

test('medal-item 过滤"赠送"按钮', () => {
  const medals = bg.extractMedalsFromMedalItems(sampleMedalItems);
  const hasGift = medals.some(m => m.name.includes('赠送'));
  assert(!hasGift, '赠送的勋章不应被提取');
});

test('medal-item gift-btn 类名按钮', () => {
  const html = makeMedalItemHtml([
    { id: 1, img: 'a', name: 'gift-btn勋章', duration: '30', bonus: '0%', price: '100', stock: '无限', btnClass: 'gift-btn', btnValue: '购买', disabled: false }
  ]);
  const medals = bg.extractMedalsFromMedalItems(html);
  assertEqual(medals.length, 1, 'gift-btn类名的购买按钮应被提取');
  assert(medals[0].name.includes('gift-btn勋章'));
});

test('medal-item 空HTML返回空数组', () => {
  const medals = bg.extractMedalsFromMedalItems('');
  assertEqual(medals.length, 0);
});

test('medal-item 无medal-item返回空数组', () => {
  const medals = bg.extractMedalsFromMedalItems('<div>普通页面</div>');
  assertEqual(medals.length, 0);
});

// ============================================================
// extractMedalsFromHhanclub — hhanclub Tailwind 网格布局
// ============================================================
console.log('\n  ▶ extractMedalsFromHhanclub - hhanclub网格布局');

function makeHhanclubHtml(medals) {
  let rows = '';
  for (const m of medals) {
    rows += `<div class="medal-table py-5 bg-[#FFFFFF]">
                            <div class="px-5">
                                <img alt='${m.name}' src='${m.img}.svg' class='preview w-[150px] h-[150px] rounded-full'>                            </div>
                            <div class="flex flex-col pr-5 gap-y-[15px]">
                                <div>${m.name}</div>
                                <div>${m.desc || ''}</div>
                            </div>
                            <div>${m.price}</div>
                            <div>${m.stock || '无限'}</div>
                            <div>${m.limit || '1'}</div>
                            <div>${m.bonus || '0%'}</div>
                            <div>${m.duration}</div>
                            <div>${m.type || '普通'}</div>
                            <div>
                                <input type="button" class="" data-id="${m.id}" value="${m.btnValue}"${m.disabled ? ' disabled' : ''}>
                            </div>
                        </div>`;
  }
  return `<div class="medal-table bg-[#4F5879] opacity-[0.7] text-[#FFFFFF] h-[35px] text-[16px] font-bold leading-6">
                    <div></div>
                    <div>说明</div>
                    <div>购买价格</div>
                    <div>库存</div>
                    <div>限购</div>
                    <div>憨豆加成百分比</div>
                    <div>加成天数</div>
                    <div>购买类型</div>
                    <div>操作</div>
                </div>
                <div class="flex flex-col gap-y-[8px]">
                        ${rows}
                </div>`;
}

const sampleHhanclub = makeHhanclubHtml([
  { id: 5, img: 'a', name: '三周年站庆徽章', desc: '我们三岁啦！', price: '780,000', stock: '998178', limit: '1', bonus: '15%', duration: '365', type: '普通', btnValue: '购买', disabled: false },
  { id: 4, img: 'b', name: '二周年站庆徽章', desc: '我们两岁啦！', price: '680,000', stock: '998809', limit: '1', bonus: '0%', duration: '永久有效', type: '普通', btnValue: '购买', disabled: false },
  { id: 3, img: 'c', name: '已过期勋章', desc: 'test', price: '100,000', stock: '999', limit: '1', bonus: '0%', duration: '30', type: '普通', btnValue: '已过可购买时间', disabled: true }
]);

test('hhanclub 提取可购买勋章', () => {
  const medals = bg.extractMedalsFromHhanclub(sampleHhanclub);
  assertEqual(medals.length, 2, '应提取2个可购买勋章');
});

test('hhanclub 提取名称', () => {
  const medals = bg.extractMedalsFromHhanclub(sampleHhanclub);
  assert(medals[0].name.includes('三周年站庆徽章'), `实际名称: ${medals[0].name}`);
  assert(medals[1].name.includes('二周年站庆徽章'), `实际名称: ${medals[1].name}`);
});

test('hhanclub 提取价格', () => {
  const medals = bg.extractMedalsFromHhanclub(sampleHhanclub);
  assertEqual(medals[0].price, '780,000');
  assertEqual(medals[1].price, '680,000');
});

test('hhanclub 提取有效期和加成', () => {
  const medals = bg.extractMedalsFromHhanclub(sampleHhanclub);
  assertEqual(medals[0].duration, '365');
  assertEqual(medals[0].bonus, '15%');
  assertEqual(medals[1].duration, '永久有效');
  assertEqual(medals[1].bonus, '0%');
});

test('hhanclub 提取库存和medalId', () => {
  const medals = bg.extractMedalsFromHhanclub(sampleHhanclub);
  assertEqual(medals[0].stock, '998178');
  assertEqual(medals[0].medalId, '5');
  assertEqual(medals[1].stock, '998809');
  assertEqual(medals[1].medalId, '4');
});

test('hhanclub 过滤disabled按钮', () => {
  const medals = bg.extractMedalsFromHhanclub(sampleHhanclub);
  const hasDisabled = medals.some(m => m.name.includes('已过期'));
  assert(!hasDisabled, 'disabled按钮的勋章不应被提取');
});

test('hhanclub 过滤非购买文本', () => {
  const html = makeHhanclubHtml([
    { id: 1, img: 'a', name: '仅授予', price: '0', stock: '0', bonus: '0%', duration: '永久有效', btnValue: '仅授予', disabled: false },
    { id: 2, img: 'b', name: '可购买', price: '100', stock: '100', bonus: '0%', duration: '30', btnValue: '购买', disabled: false }
  ]);
  const medals = bg.extractMedalsFromHhanclub(html);
  assertEqual(medals.length, 1, '应只提取"购买"按钮的勋章');
  assert(medals[0].name.includes('可购买'));
});

test('hhanclub 空HTML返回空数组', () => {
  const medals = bg.extractMedalsFromHhanclub('');
  assertEqual(medals.length, 0);
});

test('hhanclub 无medal-table返回空数组', () => {
  const medals = bg.extractMedalsFromHhanclub('<div>普通页面</div>');
  assertEqual(medals.length, 0);
});

// ============================================================
// extractMedalsFromSiqi — si-qi BEM 风格 medal-card 布局
// ============================================================
console.log('\n  ▶ extractMedalsFromSiqi - si-qi BEM布局');

const sampleSiqi = `<div class="medal-card">
  <div class="medal-card__image"><img alt="测试勋章" src="x.png"></div>
  <div class="medal-card__body">
    <div class="medal-card__title"><h2>测试勋章 (#9)</h2></div>
    <div class="medal-card__meta">
      <div><span class="meta-label">价格</span><span class="meta-value">100,000</span></div>
      <div><span class="meta-label">有效期</span><span class="meta-value">永久有效</span></div>
      <div><span class="meta-label">加成</span><span class="meta-value">1%</span></div>
      <div><span class="meta-label">库存</span><span class="meta-value">411</span></div>
      <div><span class="meta-label">可购买</span><span class="meta-value">不限 ~ 2025-10-12 02:02:00</span></div>
    </div>
    <div class="medal-card__action">
      <input type="button" class="" data-id="9" value="购买">
    </div>
  </div>
</div>`;

const sampleSiqiMixed = `<div class="medal-card">
  <div class="medal-card__title"><h2>可购买勋章 (#1)</h2></div>
  <div><span class="meta-label">价格</span><span class="meta-value">50,000</span></div>
  <div><span class="meta-label">有效期</span><span class="meta-value">365</span></div>
  <div><span class="meta-label">加成</span><span class="meta-value">5%</span></div>
  <div><span class="meta-label">库存</span><span class="meta-value">100</span></div>
  <input type="button" class="" data-id="1" value="购买">
</div>
<div class="medal-card owned">
  <div class="medal-card__title"><h2>已购勋章 (#2)</h2></div>
  <div><span class="meta-label">价格</span><span class="meta-value">30,000</span></div>
  <input type="button" class="" data-id="2" value="已经购买" disabled>
</div>
<div class="medal-card">
  <div class="medal-card__title"><h2>赠送勋章 (#3)</h2></div>
  <div><span class="meta-label">价格</span><span class="meta-value">0</span></div>
  <input type="button" class="" data-id="3" value="赠送">
</div>
<div class="medal-card">
  <div class="medal-card__title"><h2>过期勋章 (#4)</h2></div>
  <div><span class="meta-label">价格</span><span class="meta-value">20,000</span></div>
  <input type="button" class="" data-id="4" value="已过可购买时间" disabled>
</div>`;

test('si-qi 提取可购买勋章', () => {
  const medals = bg.extractMedalsFromSiqi(sampleSiqi);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].name, '测试勋章 (#9)');
  assertEqual(medals[0].price, '100,000');
  assertEqual(medals[0].duration, '永久有效');
  assertEqual(medals[0].bonus, '1%');
  assertEqual(medals[0].stock, '411');
  assertEqual(medals[0].timeRange, '不限 ~ 2025-10-12 02:02:00');
  assertEqual(medals[0].medalId, '9');
});

test('si-qi 混合场景仅提取可购买', () => {
  const medals = bg.extractMedalsFromSiqi(sampleSiqiMixed);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].name, '可购买勋章 (#1)');
  assertEqual(medals[0].medalId, '1');
  assertEqual(medals[0].price, '50,000');
});

test('si-qi 繁体購買按钮也识别', () => {
  const html = `<div class="medal-card">
    <div class="medal-card__title"><h2>繁体勋章 (#5)</h2></div>
    <div><span class="meta-label">價格</span><span class="meta-value">88,888</span></div>
    <input type="button" class="" data-id="5" value="購買">
  </div>`;
  const medals = bg.extractMedalsFromSiqi(html);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].name, '繁体勋章 (#5)');
  assertEqual(medals[0].price, '88,888');
});

test('si-qi disabled按钮被过滤', () => {
  const html = `<div class="medal-card">
    <div class="medal-card__title"><h2>禁用勋章 (#6)</h2></div>
    <input type="button" class="" data-id="6" value="购买" disabled>
  </div>`;
  const medals = bg.extractMedalsFromSiqi(html);
  assertEqual(medals.length, 0);
});

test('si-qi 赠送按钮被过滤', () => {
  const html = `<div class="medal-card">
    <div class="medal-card__title"><h2>赠送勋章 (#7)</h2></div>
    <input type="button" class="" data-id="7" value="赠送">
  </div>`;
  const medals = bg.extractMedalsFromSiqi(html);
  assertEqual(medals.length, 0);
});

test('si-qi 无medal-card__title返回空', () => {
  const html = `<div class="medal-card">
    <div>普通卡片</div>
    <input type="button" class="" data-id="8" value="购买">
  </div>`;
  const medals = bg.extractMedalsFromSiqi(html);
  assertEqual(medals.length, 0);
});

test('si-qi 无meta-label返回空', () => {
  const html = `<div class="medal-card">
    <div class="medal-card__title"><h2>无元数据 (#10)</h2></div>
    <input type="button" class="" data-id="10" value="购买">
  </div>`;
  const medals = bg.extractMedalsFromSiqi(html);
  assertEqual(medals.length, 0);
});

test('si-qi 空HTML返回空数组', () => {
  const medals = bg.extractMedalsFromSiqi('');
  assertEqual(medals.length, 0);
});

test('si-qi 普通页面返回空数组', () => {
  const medals = bg.extractMedalsFromSiqi('<div>普通页面</div>');
  assertEqual(medals.length, 0);
});

test('si-qi 不误匹配普通 medal-card 布局', () => {
  // 13city 等普通 medal-card 布局不应触发 si-qi 提取器
  const html = `<div class="medal-cards">
    <div class="medal-card ">
      <input class="btn buy " type="button" value="购买" data-id="100">
    </div>
  </div>`;
  const medals = bg.extractMedalsFromSiqi(html);
  assertEqual(medals.length, 0);
});

test('si-qi 通过 extractMedalsFromHtml 回退链调用', () => {
  const medals = bg.extractMedalsFromHtml(sampleSiqi);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].name, '测试勋章 (#9)');
});

// ============================================================
// extractMedalsFromZmptNew — zmpt.cc 新版 CSS Modules 布局
// ============================================================
console.log('\n  ▶ extractMedalsFromZmptNew - zmpt 新版 CSS Modules 布局');

// 真实站点样本（简化版，保留关键结构）
const sampleZmptNew = `<div class="index-module__card-wrap___C0zIS"><div class="index-module__card___90vxo"><div class="index-module__img-box___nrscc"><img alt="" src="x.png"></div><div class="index-module__title___ecDG8"><div>十二生肖</div><div class="index-module__title-description___kAu2l">随机版</div></div><div class="index-module__time-limit___cv1Bw"><div>2025-06-04 00:00:00 - 2030-12-31 00:00:00</div></div><div class="index-module__desc___4OOeV"><div class="index-module__item___6A7a7"><div class="index-module__label___dRuRs">电力加成</div><div class="index-module__content___Yr-LT">35%</div></div><div class="index-module__item___6A7a7"><div class="index-module__label___dRuRs">有效期</div><div class="index-module__content___Yr-LT">永久有效</div></div><div class="index-module__item___6A7a7"><div class="index-module__label___dRuRs">价格</div><div class="index-module__content___Yr-LT">5000000</div></div><div class="index-module__item___6A7a7"><div class="index-module__label___dRuRs">库存</div><div class="index-module__content___Yr-LT">无限</div></div><div class="index-module__item___6A7a7"><div class="index-module__label___dRuRs">优先级</div><div class="index-module__content___Yr-LT"><input class="index-module__priority-input___ullyF" step="1" placeholder="尚未购买" disabled="" type="number" value=""></div></div></div><div class="index-module__control___tcPgO"><button class="">购买</button><button>赠送</button></div></div></div>`;

// 混合场景：可购买 + 已过可购买时间 + 佩戴中
const sampleZmptNewMixed = `<div>
<div class="index-module__card-wrap___C0zIS"><div class="index-module__card___90vxo"><div class="index-module__title___ecDG8"><div>可购买勋章</div></div><div class="index-module__desc___4OOeV"><div class="index-module__item___6A7a7"><div class="index-module__label___dRuRs">价格</div><div class="index-module__content___Yr-LT">10000</div></div><div class="index-module__item___6A7a7"><div class="index-module__label___dRuRs">库存</div><div class="index-module__content___Yr-LT">无限</div></div></div><div class="index-module__control___tcPgO"><button class="">购买</button><button disabled="">赠送</button></div></div></div>
<div class="index-module__card-wrap___C0zIS"><div class="index-module__card___90vxo"><div class="index-module__title___ecDG8"><div>过期勋章</div></div><div class="index-module__desc___4OOeV"><div class="index-module__item___6A7a7"><div class="index-module__label___dRuRs">价格</div><div class="index-module__content___Yr-LT">100</div></div></div><div class="index-module__control___tcPgO"><button disabled="">已过可购买时间</button><button disabled="">赠送</button></div></div></div>
<div class="index-module__card-wrap___C0zIS"><div class="index-module__card___90vxo"><div class="index-module__title___ecDG8"><div>已购勋章</div></div><div class="index-module__desc___4OOeV"><div class="index-module__item___6A7a7"><div class="index-module__label___dRuRs">价格</div><div class="index-module__content___Yr-LT">500</div></div></div><div class="index-module__control___tcPgO"><button class="">佩戴</button><button disabled="">赠送</button></div></div></div>
</div>`;

test('zmpt 提取可购买勋章', () => {
  const medals = bg.extractMedalsFromZmptNew(sampleZmptNew);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].name, '十二生肖');
  assertEqual(medals[0].price, '5000000');
  assertEqual(medals[0].duration, '永久有效');
  assertEqual(medals[0].bonus, '35%');
  assertEqual(medals[0].stock, '无限');
  assertEqual(medals[0].timeRange, '2025-06-04 00:00:00 - 2030-12-31 00:00:00');
});

test('zmpt 混合场景仅提取可购买', () => {
  const medals = bg.extractMedalsFromZmptNew(sampleZmptNewMixed);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].name, '可购买勋章');
  assertEqual(medals[0].price, '10000');
  assertEqual(medals[0].stock, '无限');
});

test('zmpt 繁体購買按钮也识别', () => {
  const html = `<div class="index-module__card-wrap___C0zIS"><div class="index-module__card___90vxo"><div class="index-module__title___ecDG8"><div>繁体勋章</div></div><div class="index-module__desc___4OOeV"><div class="index-module__item___6A7a7"><div class="index-module__label___dRuRs">價格</div><div class="index-module__content___Yr-LT">88888</div></div></div><div class="index-module__control___tcPgO"><button class="">購買</button></div></div></div>`;
  const medals = bg.extractMedalsFromZmptNew(html);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].name, '繁体勋章');
  assertEqual(medals[0].price, '88888');
});

test('zmpt disabled购买按钮被过滤', () => {
  const html = `<div class="index-module__card-wrap___C0zIS"><div class="index-module__card___90vxo"><div class="index-module__title___ecDG8"><div>禁用勋章</div></div><div class="index-module__control___tcPgO"><button disabled="">购买</button></div></div></div>`;
  const medals = bg.extractMedalsFromZmptNew(html);
  assertEqual(medals.length, 0);
});

test('zmpt 已过可购买时间被过滤', () => {
  const html = `<div class="index-module__card-wrap___C0zIS"><div class="index-module__card___90vxo"><div class="index-module__title___ecDG8"><div>过期勋章</div></div><div class="index-module__control___tcPgO"><button disabled="">已过可购买时间</button></div></div></div>`;
  const medals = bg.extractMedalsFromZmptNew(html);
  assertEqual(medals.length, 0);
});

test('zmpt 佩戴按钮被过滤', () => {
  const html = `<div class="index-module__card-wrap___C0zIS"><div class="index-module__card___90vxo"><div class="index-module__title___ecDG8"><div>已购勋章</div></div><div class="index-module__control___tcPgO"><button class="">佩戴</button></div></div></div>`;
  const medals = bg.extractMedalsFromZmptNew(html);
  assertEqual(medals.length, 0);
});

test('zmpt 无index-module__card返回空', () => {
  const html = `<div class="medal-card"><div>普通卡片</div></div>`;
  const medals = bg.extractMedalsFromZmptNew(html);
  assertEqual(medals.length, 0);
});

test('zmpt 无index-module__label返回空', () => {
  const html = `<div class="index-module__card-wrap"><div class="index-module__card"><div>无label</div></div></div>`;
  const medals = bg.extractMedalsFromZmptNew(html);
  assertEqual(medals.length, 0);
});

test('zmpt 空HTML返回空数组', () => {
  const medals = bg.extractMedalsFromZmptNew('');
  assertEqual(medals.length, 0);
});

test('zmpt 普通页面返回空数组', () => {
  const medals = bg.extractMedalsFromZmptNew('<div>普通页面</div>');
  assertEqual(medals.length, 0);
});

test('zmpt 不误匹配 si-qi BEM 布局', () => {
  // si-qi 的 medal-card 布局不应触发 zmpt 提取器
  const html = `<div class="medal-card"><div class="medal-card__title"><h2>si-qi勋章</h2></div><input type="button" data-id="1" value="购买"></div>`;
  const medals = bg.extractMedalsFromZmptNew(html);
  assertEqual(medals.length, 0);
});

test('zmpt 真实渲染HTML能提取', () => {
  // 使用真实保存的渲染后 HTML fixture
  const fs = require('fs');
  const path = require('path');
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'zmpt-rendered.html');
  if (!fs.existsSync(fixturePath)) {
    console.log('    (跳过：fixture 文件不存在)');
    return;
  }
  const html = fs.readFileSync(fixturePath, 'utf-8');
  const medals = bg.extractMedalsFromZmptNew(html);
  assert(medals.length >= 1, '应至少提取到 1 个勋章');
  // 验证提取的勋章名称是预期的
  const names = medals.map(m => m.name);
  assert(names.includes('十二生肖'), '应包含"十二生肖"');
});

// ============================================================
// setupAlarm
// ============================================================
console.log('\n  ▶ setupAlarm');

test('setupAlarm 禁用时不创建alarm', () => {
  global.chrome.alarms._created = [];
  global.chrome.alarms._cleared = false;
  const origClear = global.chrome.alarms.clear;
  global.chrome.alarms.clear = (name, cb) => {
    global.chrome.alarms._cleared = true;
    if (cb) cb();
  };
  bg.setupAlarm({ enabled: false, time: '08:00' });
  assert(global.chrome.alarms._cleared);
  assertEqual(global.chrome.alarms._created.length, 0);
  global.chrome.alarms.clear = origClear;
});

test('setupAlarm 启用时创建alarm', () => {
  const origClear = global.chrome.alarms.clear;
  global.chrome.alarms.clear = (name, cb) => {
    global.chrome.alarms._cleared = true;
    if (cb) cb();
  };
  global.chrome.alarms._created = [];
  global.chrome.alarms._cleared = false;
  bg.setupAlarm({ enabled: true, time: '08:00' });
  assert(global.chrome.alarms._cleared);
  assertEqual(global.chrome.alarms._created.length, 1);
  assertEqual(global.chrome.alarms._created[0].name, bg.ALARM_NAME);
  assertEqual(global.chrome.alarms._created[0].options.periodInMinutes, 1440);
  global.chrome.alarms.clear = origClear;
});

test('setupAlarm null配置不创建alarm', () => {
  global.chrome.alarms._created = [];
  global.chrome.alarms._cleared = false;
  const origClear = global.chrome.alarms.clear;
  global.chrome.alarms.clear = (name, cb) => {
    global.chrome.alarms._cleared = true;
    if (cb) cb();
  };
  bg.setupAlarm(null);
  assert(global.chrome.alarms._cleared);
  assertEqual(global.chrome.alarms._created.length, 0);
  global.chrome.alarms.clear = origClear;
});

// ============================================================
// updateScheduleConfig 消息处理
// ============================================================
console.log('\n  ▶ updateScheduleConfig 消息');

test('updateScheduleConfig 消息触发setupAlarm', () => {
  const origClear = global.chrome.alarms.clear;
  global.chrome.alarms.clear = (name, cb) => {
    global.chrome.alarms._cleared = true;
    if (cb) cb();
  };

  const msgHandler = global.chrome._listeners.get('runtime.onMessage');
  assert(msgHandler, 'message handler should exist');

  msgHandler({ action: 'updateScheduleConfig', scheduleConfig: { enabled: true, time: '10:00' } }, {}, () => {});
  assert(global.chrome.alarms._cleared);
  assertEqual(global.chrome.alarms._created.length, 1);
  assertEqual(global.chrome.alarms._created[0].name, bg.ALARM_NAME);

  global.chrome.alarms.clear = origClear;
});

// ============================================================
// 魔力值提取 / 价格解析 / 分页标记
// ============================================================
console.log('\n  ▶ extractMagicBalance / parsePriceNumber / tagMedalsWithPage');

test('从表头提取魔力值(标签包裹)', () => {
  const html = '<div>魔力: <b>12345</b></div>';
  assertEqual(bg.extractMagicBalance(html), 12345);
});

test('从表头提取魔力值(冒号+数字)', () => {
  const html = '当前 魔法 99,999 点';
  assertEqual(bg.extractMagicBalance(html), 99999);
});

test('带千分位逗号', () => {
  const html = '麦力：12,345';
  assertEqual(bg.extractMagicBalance(html), 12345);
});

test('忽略魔力加成百分比', () => {
  const html = '勋章加成 魔力+5% 余额 5000';
  assertEqual(bg.extractMagicBalance(html), 5000);
});

test('无魔力值返回null', () => {
  const html = '<div>没有任何余额信息</div>';
  assertEqual(bg.extractMagicBalance(html), null);
});

test('parsePriceNumber 整数', () => {
  assertEqual(bg.parsePriceNumber('1000'), 1000);
});

test('parsePriceNumber 千分位', () => {
  assertEqual(bg.parsePriceNumber('1,000'), 1000);
});

test('parsePriceNumber 带单位', () => {
  assertEqual(bg.parsePriceNumber('1000 魔力'), 1000);
});

test('parsePriceNumber 猫粮单位', () => {
  assertEqual(bg.parsePriceNumber('2000猫粮'), 2000);
});

test('parsePriceNumber 免费返回null', () => {
  assertEqual(bg.parsePriceNumber('免费'), null);
});

test('parsePriceNumber 空返回null', () => {
  assertEqual(bg.parsePriceNumber(''), null);
});

test('tagMedalsWithPage 添加页码与URL', () => {
  const tagged = bg.tagMedalsWithPage(
    [{ name: 'A' }],
    2,
    'https://x.com/medal.php?page=1',
  );
  assertEqual(tagged[0].page, 2);
  assertEqual(tagged[0].pageUrl, 'https://x.com/medal.php?page=1');
  assertEqual(tagged[0].name, 'A');
});

test('tagMedalsWithPage 非数组原样返回', () => {
  assertEqual(bg.tagMedalsWithPage(null, 1, 'u'), null);
});

// ============================================================
// isSpaShell — SPA 壳页面检测（zmpt/yemapt）
// ============================================================
console.log('\n  ▶ isSpaShell - SPA壳检测');

test('Vite 壳（vite-app 空挂载点）判定为 SPA', () => {
  const html = '<html><head><link rel="modulepreload" href="/assets/x.js"><script type="module" src="/assets/index.js"></script></head><body><div id="vite-app"></div></body></html>';
  assert(bg.isSpaShell(html), 'Vite 空壳应判定为 SPA');
});

test('umi 壳（root 挂载点 + loading 文案）判定为 SPA', () => {
  const html = '<html><head><script defer src="https://static-ui.yemapt.org/umi.js"></script></head><body><div id="root">resource loading...</div></body></html>';
  assert(bg.isSpaShell(html), 'umi 空壳应判定为 SPA');
});

test('普通 NexusPHP 页面不判定为 SPA', () => {
  const html = '<html><body><script src="/jquery.js"></script><table><tr><td>大量勋章表格内容'.repeat(50) + '</td></tr></table></body></html>';
  assert(!bg.isSpaShell(html), '正文丰满的页面不应判定为 SPA');
});

test('无外部脚本的小页面（跳转页）不判定为 SPA', () => {
  const html = '<html><head><meta http-equiv="refresh" content="0;url=login.php"></head><body>Redirecting...</body></html>';
  assert(!bg.isSpaShell(html), 'Meta 跳转页没有外部脚本，不应判定为 SPA');
});

test('空输入不判定为 SPA', () => {
  assert(!bg.isSpaShell(''), '空字符串不应判定为 SPA');
  assert(!bg.isSpaShell(null), 'null 不应判定为 SPA');
});

// ============================================================
// extractMedalsFromCards 泛化 — hxpt/luckpt/cspt/longpt 布局
// （v1.7 曾将容器匹配退化为硬编码 "<div class=\"medal-card "，
//   导致这些站点整体漏扫，此处锁定回归）
// ============================================================
console.log('\n  ▶ extractMedalsFromCards - 泛化站点布局');

// hxpt：medal-card + medal-title + medal-detail-item(span+strong)
// + class 含 buy 的 button；购买价(过期+50%) 应覆盖定价
const sampleHxptCard = `<div class="medal-card">
  <div class="medal-title"> 二十四节气 - 白露 </div>
  <div class="medal-details">
    <div class="medal-detail-item"><span>定价:</span><strong>188,888</strong></div>
    <div class="medal-detail-item" title="已超过销售期"><span>购买价<em>(过期+50%)</em>:</span><strong>283,332</strong></div>
    <div class="medal-detail-item"><span>时长:</span><strong>360 天</strong></div>
    <div class="medal-detail-item"><span>加成:</span><strong>1%</strong></div>
  </div>
  <div class="medal-actions">
    <button class="action-btn btn-primary view-detail" data-id="16" data-inventory="无限" data-sale-begin="2027-09-07 00:00" data-sale-end="2027-09-11 23:59">详情</button>
    <button class="action-btn btn-primary buy" data-id="16" data-buy-price="283332">购买</button>
  </div>
</div>`;

test('hxpt 布局: class 含 buy 的 button 可提取', () => {
  const medals = bg.extractMedalsFromCards(sampleHxptCard);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].name, '二十四节气 - 白露');
  assertEqual(medals[0].medalId, '16');
});

test('hxpt 布局: 购买价覆盖定价作为价格', () => {
  const medals = bg.extractMedalsFromCards(sampleHxptCard);
  assertEqual(medals[0].price, '283,332');
  assertEqual(medals[0].duration, '360 天');
  assertEqual(medals[0].bonus, '1%');
  assertEqual(medals[0].stock, '无限');
  assertEqual(medals[0].timeRange, '2027-09-07 00:00 ~ 2027-09-11 23:59');
});

// luckpt：medal-card 带属性 + meta-label/meta-value(div) + 头部行内加成
const sampleLuckptCard = `<div class="medal-card" data-medal-id="93">
  <div class="medal-card__header"><span class="pill pill-buyable">可购买</span><span class="medal-addition">幸运星加成：1.000%</span></div>
  <div class="medal-card__info"><div class="medal-card__name">立春</div>
  <div class="medal-card__meta">
    <div class="meta-item"><div class="meta-label">获取方式</div><div class="meta-value">兑换</div></div>
    <div class="meta-item"><div class="meta-label">价格</div><div class="meta-value">88,888</div></div>
    <div class="meta-item"><div class="meta-label">购买后有效期(天)</div><div class="meta-value">永久有效</div></div>
    <div class="meta-item"><div class="meta-label">库存</div><div class="meta-value">2937</div></div>
    <div class="meta-item meta-item-wide"><div class="meta-label">可购买时间</div><div class="meta-value">不限 ~ 不限</div></div>
  </div></div>
  <div class="medal-card__actions"><button class="btn buy-action primary btn-buy" data-id="93" data-name="立春" data-price="88,888">购买</button></div>
</div>`;

test('luckpt 布局: 属性型 medal-card 容器可识别', () => {
  const medals = bg.extractMedalsFromCards(sampleLuckptCard);
  assertEqual(medals.length, 1, 'class="medal-card" 后带属性的容器必须能识别');
  assertEqual(medals[0].name, '立春');
  assertEqual(medals[0].medalId, '93');
});

test('luckpt 布局: meta-label/meta-value 与头部加成提取', () => {
  const medals = bg.extractMedalsFromCards(sampleLuckptCard);
  assertEqual(medals[0].price, '88,888');
  assertEqual(medals[0].duration, '永久有效');
  assertEqual(medals[0].stock, '2937');
  assertEqual(medals[0].timeRange, '不限 ~ 不限');
  assertEqual(medals[0].bonus, '1.000%');
});

// cspt：medal-card locked + stat-item/stat-value + sale-time + buy-btn
const sampleCsptCard = `<div class="medal-card locked" data-id="68">
  <div class="medal-image"><img src="x.png" alt="61儿童节" /></div>
  <div class="medal-info">
    <h4 class="medal-name">61儿童节</h4>
    <div class="sale-time">📅 不限 ~ 不限</div>
    <div class="stats-grid">
      <div class="stat-item">购买后有效期(天): <span class="stat-value">365</span></div>
      <div class="stat-item">魔力加成: <span class="stat-value primary">+0.5%</span></div>
      <div class="stat-item">价格: <span class="stat-value primary">88,888</span></div>
      <div class="stat-item">库存: <span class="stat-value">无限</span></div>
    </div>
    <div class="actions"><button class="btn btn-primary buy-btn" data-id="68" data-name="61儿童节" data-price="88888" data-price-formatted="88,888" data-duration="365" data-bonus="0.5%">购买</button><button class="btn btn-outline gift-btn" data-id="68" data-name="61儿童节">赠送</button></div>
  </div>
</div>`;

test('cspt 布局: stat-item + sale-time + buy-btn 提取', () => {
  const medals = bg.extractMedalsFromCards(sampleCsptCard);
  assertEqual(medals.length, 1);
  assertEqual(medals[0].name, '61儿童节');
  assertEqual(medals[0].price, '88,888');
  assertEqual(medals[0].duration, '365');
  assertEqual(medals[0].bonus, '+0.5%');
  assertEqual(medals[0].stock, '无限');
  assertEqual(medals[0].timeRange, '不限 ~ 不限');
});

// longpt：medal-card 无属性 + detail-label/detail-value(值内含 <br>)
// + class 含 buy 的 input
const sampleLongptCard = `<div class="medal-card">  <div class="medal-header"><div class="medal-image-container"><img src="dahan.png" class="medal-image" alt="大寒" /></div><h2 class="medal-name">大寒</h2></div>
  <div class="medal-details">
    <div class="detail-item"><span class="detail-label">可购买时间</span><span class="detail-value">2026-01-20 00:00:00 ~<br>不限</span></div>
    <div class="detail-item"><span class="detail-label">购买后有效期(天)</span><span class="detail-value">永久有效</span></div>
    <div class="detail-item"><span class="detail-label">魔力加成</span><span class="detail-value">5%</span></div>
    <div class="detail-item"><span class="detail-label">价格</span><span class="detail-value">260,120</span></div>
    <div class="detail-item"><span class="detail-label">库存</span><span class="detail-value">无限</span></div>
  </div>
  <div class="medal-actions"><div class="action-row"><input type="button" class="medal-action-btn-unified buy" data-id="23" value="购买"></div>
  <div class="action-row gift-row"><input type="button" class="medal-action-btn-unified gift" data-id="23" value="赠送"></div></div>
</div>`;

test('longpt 布局: 无属性 medal-card 容器与 <br> 值提取', () => {
  const medals = bg.extractMedalsFromCards(sampleLongptCard);
  assertEqual(medals.length, 1, 'class="medal-card" 后直接跟引号的容器必须能识别');
  assertEqual(medals[0].name, '大寒');
  assertEqual(medals[0].price, '260,120');
  assertEqual(medals[0].timeRange, '2026-01-20 00:00:00 ~ 不限');
});

test('卡片含 medal-card__title 时跳过（交给 si-qi 提取器）', () => {
  const siqiCard = `<div class="medal-card">
    <div class="medal-card__title"><h2>siqi勋章 (#9)</h2></div>
    <div><span class="meta-label">价格</span><span class="meta-value">100,000</span></div>
    <input type="button" class="" data-id="9" value="购买">
  </div>`;
  assertEqual(bg.extractMedalsFromCards(siqiCard).length, 0, 'si-qi 布局不应被通用提取器抢占');
  assertEqual(bg.extractMedalsFromSiqi(siqiCard).length, 1, 'si-qi 专用提取器应正常处理');
});

test('medal-card-list 等派生容器名不误匹配', () => {
  const html = `<div class="medal-card-list"><div class="medal-card">
    <div class="medal-name">圈套勋章</div>
    <button class="btn buy" data-id="1">购买</button>
  </div></div>`;
  // medal-card-list 自身不是卡片；内部的 medal-card 仍应被提取
  const medals = bg.extractMedalsFromCards(html);
  assertEqual(medals.length, 1, '内部真正的 medal-card 仍应提取');
  assertEqual(medals[0].name, '圈套勋章');
});

test('class 无 buy 的购买按钮按文本兜底识别', () => {
  const card = `<div class="medal-card">
    <div class="medal-name">无buy类勋章</div>
    <div class="actions"><button class="btn btn-primary" data-id="5">购买</button></div>
  </div>`;
  const medals = bg.extractMedalsFromCards(card);
  assertEqual(medals.length, 1, '文本为购买的 button 应能兜底识别');
  assertEqual(medals[0].medalId, '5');
});

test('启用状态的"已经购买"按钮不被误提取', () => {
  const card = `<div class="medal-card">
    <div class="medal-name">已购勋章</div>
    <button type="button" class="btn buy " data-id="84">已经购买</button>
  </div>`;
  assertEqual(bg.extractMedalsFromCards(card).length, 0, '已经购买不是可购买状态');
});

// ============================================================
// extractMedalsFromZmpt — SPA 渲染器（mock tabs 流程）
// ============================================================
console.log('\n  ▶ extractMedalsFromZmpt - SPA渲染器');

const renderedZmptPage = `<div class="index-module__card-wrap___C0zIS"><div class="index-module__card___90vxo"><div class="index-module__title___ecDG8"><div>渲染勋章</div></div><div class="index-module__desc___4OOeV"><div class="index-module__item___6A7a7"><div class="index-module__label___dRuRs">价格</div><div class="index-module__content___Yr-LT">10000</div></div></div><div class="index-module__control___tcPgO"><button class="">购买</button></div></div></div>`;

testAsync('SPA 渲染: 后台开标签→等 complete→读挂载点→关标签', async () => {
  chrome.reset();
  chrome.scripting._execScriptResult = [{ result: renderedZmptPage }];

  const promise = bg.extractMedalsFromZmpt('https://zmpt.cc/medal.php', []);
  // 等待 chrome.tabs.create 回调执行并注册 onUpdated 监听
  await new Promise((r) => setTimeout(r, 10));

  const tab = chrome._createdTabs[chrome._createdTabs.length - 1];
  assert(tab, '应创建标签页');
  assertEqual(tab.active, false, '标签页应后台打开（active:false）');

  // 模拟页面加载完成事件
  chrome.tabs.onUpdated.emit('event', tab.id, { status: 'complete' });

  const rendered = await promise;
  assert(rendered.includes('index-module__card-wrap'), '应返回渲染后的 HTML');
  assert(
    chrome.tabs._removedTabs.includes(tab.id),
    '渲染完成后必须关闭标签页（否则每次扫描残留空标签）',
  );
});

testAsync('SPA 渲染: 注入失败时自动重试直至成功', async () => {
  chrome.reset();
  let callCount = 0;
  const originalExecute = chrome.scripting.executeScript.bind(chrome.scripting);
  chrome.scripting.executeScript = (injection, callback) => {
    callCount++;
    // 前两次调用模拟页面仍在导航（注入被拒），第三次返回渲染内容
    if (callCount < 3) return Promise.reject(new Error('Cannot access contents of page'));
    const result = [{ result: renderedZmptPage }];
    if (callback) setTimeout(() => callback(result), 0);
    return Promise.resolve(result);
  };

  const promise = bg.extractMedalsFromZmpt('https://zmpt.cc/medal.php', []);
  await new Promise((r) => setTimeout(r, 10));
  const tab = chrome._createdTabs[chrome._createdTabs.length - 1];
  chrome.tabs.onUpdated.emit('event', tab.id, { status: 'complete' });

  const rendered = await promise;
  assert(rendered.includes('index-module__card-wrap'), '重试后应取到渲染内容');
  assert(callCount >= 3, '注入失败应触发重试');
  assert(chrome.tabs._removedTabs.includes(tab.id), '成功后必须关闭标签页');
  chrome.scripting.executeScript = originalExecute;
});

testAsync('SPA 渲染: 无浏览器环境返回空字符串', async () => {
  const originalChrome = global.chrome;
  global.chrome = undefined;
  try {
    const rendered = await bg.extractMedalsFromZmpt('https://zmpt.cc/medal.php', []);
    assertEqual(rendered, '', '无 chrome.tabs 时应返回空字符串');
  } finally {
    global.chrome = originalChrome;
  }
});

// ============================================================
// collectPageNumbers / buildPageUrl — 分页工具
// ============================================================
console.log('\n  ▶ collectPageNumbers / buildPageUrl - 分页工具');

test('收集分页页码: 含省略号折叠的中间页', () => {
  const html = '<p><a href="?page=1">1</a><a href="?page=2">2</a><span>…</span><a href="?page=12">12</a><a href="?page=13">13</a></p>';
  assertEqual(JSON.stringify(bg.collectPageNumbers(html, false)), JSON.stringify([1, 2, 12, 13]));
});

test('收集分页页码: 忽略 page=0（0 索引站点首页）', () => {
  const html = '<a href="?page=0">0</a><a href="?page=1">1</a>';
  assertEqual(JSON.stringify(bg.collectPageNumbers(html, false)), JSON.stringify([1]));
});

test('收集分页页码: pterclub page=page001 形式', () => {
  const html = '<a href="?page=page001">1</a><a href="?page=page002">2</a>';
  assertEqual(JSON.stringify(bg.collectPageNumbers(html, true)), JSON.stringify([1, 2]));
});

test('收集分页页码: 无分页链接返回空数组', () => {
  assertEqual(bg.collectPageNumbers('<p>没有分页</p>', false).length, 0);
});

test('buildPageUrl: 无查询参数用 ? 连接', () => {
  assertEqual(
    bg.buildPageUrl('https://kamept.com/medal.php', 2, false),
    'https://kamept.com/medal.php?page=2',
  );
});

test('buildPageUrl: 已有查询参数用 & 连接', () => {
  assertEqual(
    bg.buildPageUrl('https://totheglory.im/mall.php?cid=5', 2, false),
    'https://totheglory.im/mall.php?cid=5&page=2',
  );
});

test('buildPageUrl: pterclub 使用三位零填充页码', () => {
  assertEqual(
    bg.buildPageUrl('https://pterclub.net/medal.php', 2, true),
    'https://pterclub.net/medal.php?page=page002',
  );
});

// ============================================================
// scanSiteMedals — 单站扫描（mock fetch，覆盖分页/SPA/打标）
// ============================================================
console.log('\n  ▶ scanSiteMedals - 单站扫描');

// 构造带分页条的标准 NexusPHP 勋章页（10 列布局，1 个可购买勋章）
const makeMedalTablePage = (medalName, medalId, pageLinks) => {
  const links = pageLinks.map((p) => `<a href="?page=${p}">${p}</a>`).join('');
  return `<table><tr><td class="colhead">ID</td><td class="colhead">图片</td><td class="colhead">描述</td><td class="colhead">可购买时间</td><td class="colhead">购买后有效期(天)</td><td class="colhead">魔力加成</td><td class="colhead">价格</td><td class="colhead">库存</td><td class="colhead">购买</td><td class="colhead">赠送</td></tr>
<tr><td>${medalId}</td><td><img src="x.png"></td><td><h1>${medalName}</h1>描述</td><td>不限 ~ 不限</td><td>永久有效</td><td>1%</td><td>1,000</td><td>无限</td><td><input type="button" value="购买" data-id="${medalId}"></td><td><input type="number"></td></tr></table>
<p class="pagination">${links}</p>`;
};

testAsync('scanSiteMedals: 0 索引多页站点全量抓取（含省略号折叠页）并按页打标', async () => {
  const savedFetch = global.fetch;
  const siteUrl = 'https://kamept.test/medal.php';
  const pages = {
    [siteUrl]: makeMedalTablePage('勋章A', 71, [1, 3]),          // 分页条省略了第 2 页
    [`${siteUrl}?page=1`]: makeMedalTablePage('勋章B', 48, [0, 2, 3]), // 翻到这里才发现 ?page=2
    [`${siteUrl}?page=2`]: makeMedalTablePage('勋章C', 29, [0, 1, 3]),
    [`${siteUrl}?page=3`]: makeMedalTablePage('勋章D', 11, [0, 1, 2]),
  };
  global.fetch = (url) =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(pages[url] || '') });

  const logs = [];
  const { medals, pageCount, pageHtmls } = await bg.scanSiteMedals(
    'KamePT', siteUrl, [{ name: 'c', value: '1' }], (t) => logs.push(t),
  );

  assertEqual(medals.length, 4, '省略号折叠的第 2 页也必须被抓取');
  assertEqual(pageCount, 4, '共 4 页（首页 + 3 个分页）');
  assertEqual(medals[0].page, 1);
  assertEqual(medals[0].pageUrl, siteUrl);
  assertEqual(medals[1].page, 2);
  assertEqual(medals[1].pageUrl, `${siteUrl}?page=1`);
  assertEqual(medals[2].page, 3);
  assertEqual(medals[2].pageUrl, `${siteUrl}?page=2`);
  assertEqual(medals[3].page, 4);
  assertEqual(medals[3].pageUrl, `${siteUrl}?page=3`);
  assertEqual(pageHtmls.length, 4, '调试包应保存全部 4 个页面');
  global.fetch = savedFetch;
});

testAsync('scanSiteMedals: 单页站点只抓首页', async () => {
  const savedFetch = global.fetch;
  const siteUrl = 'https://kufei.test/medal.php';
  global.fetch = (url) =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(makeMedalTablePage(' solo ', 9, [])) });

  const { medals, pageCount } = await bg.scanSiteMedals(
    '库非', siteUrl, [{ name: 'c', value: '1' }], () => {},
  );
  assertEqual(medals.length, 1);
  assertEqual(pageCount, 1);
  assertEqual(medals[0].pageUrl, siteUrl);
  global.fetch = savedFetch;
});

testAsync('scanSiteMedals: 1 索引站点 ?page=1 与首页重复时去重', async () => {
  const savedFetch = global.fetch;
  const siteUrl = 'https://standard.test/medal.php';
  const basePage = makeMedalTablePage('重复勋章', 5, [1, 2]);
  const pages = {
    [siteUrl]: basePage,                       // 1 索引：首页即 ?page=1 内容
    [`${siteUrl}?page=1`]: basePage,
    [`${siteUrl}?page=2`]: makeMedalTablePage('第二页勋章', 6, [1]),
  };
  global.fetch = (url) =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(pages[url] || '') });

  const { medals } = await bg.scanSiteMedals(
    '标准站', siteUrl, [{ name: 'c', value: '1' }], () => {},
  );
  assertEqual(medals.length, 2, '重复的 ?page=1 不应重复罗列勋章');
  assertEqual(medals[1].page, 2, '1 索引站点页码应为 N');
  assertEqual(medals[1].pageUrl, `${siteUrl}?page=2`);
  global.fetch = savedFetch;
});

testAsync('scanSiteMedals: SPA 壳页面触发标签页渲染后提取', async () => {
  const savedFetch = global.fetch;
  const siteUrl = 'https://zmpt.cc/medal.php';
  global.fetch = () =>
    Promise.resolve({
      ok: true,
      text: () =>
        Promise.resolve(
          '<html><head><script type="module" src="/assets/index.js"></script></head><body><div id="vite-app"></div></body></html>',
        ),
    });
  chrome.reset();
  chrome.scripting._execScriptResult = [{ result: renderedZmptPage }];

  const scanPromise = bg.scanSiteMedals(
    'zmpt.cc', siteUrl, [{ name: 'c', value: '1' }], () => {},
  );

  // 扫描内部会创建后台标签页，等待其出现后模拟页面加载完成事件
  let tab = null;
  for (let i = 0; i < 50 && !tab; i++) {
    await new Promise((r) => setTimeout(r, 5));
    tab = chrome._createdTabs[chrome._createdTabs.length - 1];
  }
  assert(tab, 'SPA 站点应创建后台标签页');
  chrome.tabs.onUpdated.emit('event', tab.id, { status: 'complete' });

  const { medals, pageHtmls } = await scanPromise;

  assertEqual(medals.length, 1, 'SPA 渲染后应提取到勋章');
  assertEqual(medals[0].name, '渲染勋章');
  assert(
    pageHtmls[0].html.includes('index-module__card-wrap'),
    '调试包应保存渲染后的 HTML（而非空壳）',
  );
  assert(
    chrome.tabs._removedTabs.includes(tab.id),
    '渲染完成后必须关闭标签页',
  );
  global.fetch = savedFetch;
});

testAsync('scanSiteMedals: 请求失败时返回空结果', async () => {
  const savedFetch = global.fetch;
  global.fetch = () => Promise.resolve({ ok: false, status: 502 });
  const { medals, pageCount } = await bg.scanSiteMedals(
    '坏站', 'https://bad.test/medal.php', [{ name: 'c', value: '1' }], () => {},
  );
  assertEqual(medals.length, 0);
  assertEqual(pageCount, 0);
  global.fetch = savedFetch;
});

// ============================================================
// sunnypt.top — Next.js SPA API 直抓（不开标签页）
// ============================================================
console.log('\n  ▶ parseSunnyptMedals - sunnypt API 勋章映射');

// 真实 medals/list 响应样本（2026-10-18 抓取）
const sunnyptList = [
  { id: 1, name: 'Sunny 启航！', price: 50000, get_type: 1, description: '', image_large: 'pic/a.png', image_small: 'pic/a-s.png', display_on_medal_page: 1, duration: 0, bonus_addition_factor: 0, gift_fee_factor: 0, sale_begin_time: 1733932800, sale_end_time: 1738252800, inventory: -1 },
  { id: 2, name: '蛇年大吉！', price: 88888, get_type: 1, description: '', image_large: 'pic/b.png', image_small: 'pic/b-s.png', display_on_medal_page: 1, duration: 0, bonus_addition_factor: 0.01, gift_fee_factor: 0.1, sale_begin_time: 1738080000, sale_end_time: 1741968000, inventory: -1 },
  // 在售但未拥有（应保留，余额不足不排除）
  { id: 5, name: '测试在售勋章', price: 280000, get_type: 1, description: '', image_large: 'pic/c.png', image_small: 'pic/c-s.png', display_on_medal_page: 1, duration: 30, bonus_addition_factor: 0.005, gift_fee_factor: 0.1, sale_begin_time: 1792166400, sale_end_time: 1794758400, inventory: 50 },
  // 未开始售卖
  { id: 6, name: '未来勋章', price: 1000, get_type: 1, duration: 0, bonus_addition_factor: 0, sale_begin_time: 1892166400, sale_end_time: 1894758400, inventory: -1 },
  // 售罄
  { id: 7, name: '售罄勋章', price: 2000, get_type: 1, duration: 0, bonus_addition_factor: 0, sale_begin_time: 1792166400, sale_end_time: 1794758400, inventory: 0 },
];

const sunnyptNow = 1792254997; // 2026-10-18

test('sunnypt: 过滤已结束/未开始/售罄，保留在售', () => {
  const medals = bg.parseSunnyptMedals(sunnyptList, [], null, sunnyptNow);
  const names = medals.map((m) => m.name);
  assertEqual(medals.length, 1);
  assert(names.includes('测试在售勋章'), '在售勋章应保留');
  assert(!names.includes('Sunny 启航！'), '已结束应排除');
  assert(!names.includes('未来勋章'), '未开始应排除');
  assert(!names.includes('售罄勋章'), '售罄应排除');
});

test('sunnypt: 已拥有勋章排除', () => {
  const medals = bg.parseSunnyptMedals(sunnyptList, [{ medal_id: 5, expire_at: 0 }], null, sunnyptNow);
  assertEqual(medals.length, 0, 'medals/my 中的勋章应排除');
});

test('sunnypt: 余额不足不排除（前端魔力不足筛选负责）', () => {
  const medals = bg.parseSunnyptMedals(sunnyptList, [], sunnyptNow);
  assertEqual(medals.length, 1, '余额不足的在售勋章仍应保留');
  assertEqual(medals[0].price, '280,000');
});

test('sunnypt: 字段映射（价格/有效期/加成/库存/时间/ID）', () => {
  const medals = bg.parseSunnyptMedals(sunnyptList, [], null, sunnyptNow);
  const m = medals[0];
  assertEqual(m.name, '测试在售勋章');
  assertEqual(m.price, '280,000');
  assertEqual(m.duration, '30 天');
  assertEqual(m.bonus, '0.5%');
  assertEqual(m.stock, '50');
  assertEqual(m.timeRange, '2026-10-17 00:00 ~ 2026-11-16 00:00');
  assertEqual(m.medalId, '5');
});

test('sunnypt: 库存 -1 映射为无限', () => {
  const list = [{ id: 9, name: '无限库存', price: 100, duration: 0, bonus_addition_factor: 0.01, sale_begin_time: 1792166400, sale_end_time: 1794758400, inventory: -1 }];
  const medals = bg.parseSunnyptMedals(list, [], null, sunnyptNow);
  assertEqual(medals[0].stock, '无限');
  assertEqual(medals[0].bonus, '1%');
  assertEqual(medals[0].duration, '永久');
});

test('sunnypt: 非法输入返回空数组', () => {
  assertEqual(bg.parseSunnyptMedals(null, [], null, sunnyptNow).length, 0);
  assertEqual(bg.parseSunnyptMedals('not-array', [], null, sunnyptNow).length, 0);
  assertEqual(bg.parseSunnyptMedals([null, undefined, 'x'], [], null, sunnyptNow).length, 0);
});

test('formatSunnyptTime Unix 秒转 UTC 字符串', () => {
  assertEqual(bg.formatSunnyptTime(1733932800), '2024-12-12 00:00');
  assertEqual(bg.formatSunnyptTime(0), '不限');
  assertEqual(bg.formatSunnyptTime(null), '不限');
});

testAsync('scanSunnyptBounty: 会话取 JWT → API 直抓全流程', async () => {
  const savedFetch = global.fetch;
  const cookieHeader = [];
  const seenUrls = [];
  const seenAuth = [];
  global.fetch = (url, options = {}) => {
    seenUrls.push(url);
    seenAuth.push(options.headers && options.headers.Authorization);
    if (url.endsWith('/api/auth/session')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { accessToken: 'fake-jwt-token' } }),
      });
    }
    if (url.includes('/api/v1/medals/list')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: sunnyptList }) });
    }
    if (url.includes('/api/v1/medals/my')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: [{ medal_id: 5, expire_at: 0 }] }) });
    }
    if (url.includes('/api/v1/user/seed-bonus')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: { seed_bonus: 177519.86 } }) });
    }
    return Promise.resolve({ ok: false, status: 404 });
  };

  const logs = [];
  const { medals, balance, pageHtmls, pageCount } = await bg.scanSunnyptBounty(
    'https://sunnypt.top/bounty?tab=renown',
    [{ name: 'session', value: 'x', domain: '.sunnypt.top' }],
  );

  // 会话请求带 Cookie，API 请求带 Bearer 头
  assert(seenUrls[0].endsWith('/api/auth/session'), '首先应请求会话端点');
  assert(
    seenUrls.some((u) => u.includes('api.sunnypt.top/api/v1/medals/list')),
    '应请求勋章列表 API',
  );
  assert(
    seenAuth.some((a) => a === 'Bearer fake-jwt-token'),
    'API 请求应带 Bearer 令牌',
  );
  // 已拥有的 id=5 被排除，其余在售过滤后为 0 条
  assertEqual(medals.length, 0, '唯一在售勋章已被拥有，应为空');
  assertEqual(balance, 177519.86);
  assertEqual(pageCount, 1);
  assert(pageHtmls[0].html.includes('测试在售勋章'), '调试包应保存 API 原始响应');
  global.fetch = savedFetch;
});

testAsync('scanSunnyptBounty: 未登录（无令牌）抛出异常', async () => {
  const savedFetch = global.fetch;
  global.fetch = (url) =>
    url.endsWith('/api/auth/session')
      ? Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) })
      : Promise.resolve({ ok: false, status: 404 });
  let threw = false;
  try {
    await bg.scanSunnyptBounty(
      'https://sunnypt.top/bounty?tab=renown',
      [{ name: 'c', value: '1' }],
    );
  } catch (e) {
    threw = true;
    assert(e.message.includes('访问令牌'), '错误信息应提示令牌问题: ' + e.message);
  }
  assert(threw, '无令牌应抛出异常');
  global.fetch = savedFetch;
});

// ============================================================
// 汇总（先执行异步用例，再统一判定）
// ============================================================
(async () => {
  for (const t of asyncTests) {
    tests++;
    try {
      await t.fn();
      passed++;
      console.log(`  ✅ ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`  ❌ ${t.name}`);
      console.log(`     ${e.message}`);
    }
  }

  console.log(`\n  ━━━ background.js: ${passed}/${tests} 通过 ━━━`);
  if (failed > 0) {
    console.log(`  ❌ ${failed} 个测试失败\n`);
    process.exitCode = 1;
  } else {
    console.log('  🟢 全部通过\n');
  }

  module.exports = { passed, failed, tests };
})();