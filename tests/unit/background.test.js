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

test('sendToFeishu 发送POST请求', async () => {
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

test('sendToFeishu 空结果也发送', async () => {
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

test('sendToFeishu 包含勋章详情', async () => {
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

test('extractMedalsFromZmpt 在非浏览器环境返回空数组', async () => {
  const medals = await bg.extractMedalsFromZmpt('https://zmpt.cc/medal.php', []);
  assertEqual(medals.length, 0, '无chrome.tabs时应返回空数组');
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