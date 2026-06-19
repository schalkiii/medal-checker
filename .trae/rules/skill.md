# Skill 文档 - PT Medal Scanner

## 诊断勋章解析失败的方法学

### 问题描述

站点勋章无法被解析，`extractMedalsFromHtml()` 返回 0 个结果。

### 诊断步骤

1. **导出调试包**：在扩展选项页点击「导出调试数据」获取 `PT_Debug_*.json`
2. **运行分析脚本**：`node scripts/analyze-html.js PT_Debug_*.json`
3. **查看站点分类**：脚本会输出该站点属于表格布局、buycenter 还是卡片布局
4. **定位失败原因**：检查输出中的勋章数、购买按钮数、可用按钮数是否与实际一致

### 卡片布局的常见问题

#### 问题 1：容器标签不匹配

`extractMedalsFromCards()` 曾在查找容器标签时硬编码 `<div class="medal-cards">`（v1.2 及之前），但部分站点（如 13city）使用 `<div class="medal-container">`。

**解决方案**（v1.3+）：不再依赖容器标签来限定搜索范围，直接在整个 HTML 中查找 `<div class="medal-card ` 元素。这样可以兼容 `medal-cards`、`medal-container` 以及没有明确容器的页面。

#### 问题 2：购买按钮类型不匹配

v1.2 及之前只匹配 `<input class="btn buy" ... value="购买">`，但卡片布局站点使用 `<button ... class="btn buy ">`。

**解决方案**（v1.3+）：正则改为 `/<(?:input|button)[^>]*\bclass="btn buy[^"]*"[^>]*\/?\s*>/i`，同时匹配两种标签。

#### 问题 3：class 属性尾部空格

某些站点的 `class="btn buy "` 尾部有空格（如 13city），之前的精确匹配 `class="btn buy"` 无法匹配。

**解决方案**（v1.3+）：使用 `class="btn buy[^"]*"` 容忍尾部空格。

#### 问题 4：容器未正确闭合

部分站点的 HTML 中，`medal-container` 的 `</div>` 可能缺失（被外层 `<td>` 隐式闭合），导致深度计数无法返回 0。

**解决方案**（v1.3+）：不依赖容器边界来提取卡片，直接在全局 HTML 中查找每个 `medal-card`。

### 验证步骤

1. 运行 `node scripts/analyze-html.js PT_Debug_*.json` 确认目标站点正确输出
2. 运行 `node tests/unit/background.test.js` 确认所有测试通过
3. 运行 `npm test` 确认 25 项检查全部通过

### 历史参考

- 2026-05-16: 修复 13city 卡片布局解析问题（v1.3）
  - 修改文件：`background.js`（extractMedalsFromCards 重构）
  - 同步更新：`scripts/analyze-html.js`（卡片布局分析分支）
  - 新增测试：11 个卡片布局单元测试（54→54，覆盖 medal-cards+input 和 medal-container+button）
  - 测试数从 43 增至 54

- 2026-05-23: 适配 pterclub.net 勋章解析（v1.5）
  - 新增 `extractMedalsFromPterclub()` 函数处理猫站自定义表格布局
  - 特征：`<input type="submit" name="medalchosen" value="CODE (PRICE 猫粮)">`
  - 名称提取：从 `<img title="NAME">` 的上一个匹配获取
  - 价格提取：从 value 属性中正则提取 `(数字 猫粮)`
  - 分页：pterclub 使用 `?page=page001` 格式，需特殊处理
  - 新增测试：8 个 pterclub 单元测试（62→62，但重新分配了测试）

## pterclub（猫站）布局适配指南

### 布局特征

猫站的勋章页面使用自定义表格布局，不同于标准 NexusPHP：

```html
<table>
  <!-- 分类头部 -->
  <tr><td class="colhead" colspan="6"><font class="big">[042] 类别名</font></td></tr>
  <!-- 勋章行 -->
  <tr>
    <td colspan="6"><div class="text">
      <img title="勋章名称" src="..." />
      <form action="?page=page010&action=buymedal" method="post">
        <input type="submit" name="medalchosen" value="042-001 (52,099 猫粮)" disabled="disabled" />
      </form>
    </div></td>
  </tr>
</table>
```

### 关键点

1. 提交按钮使用 `name="medalchosen"`，不是标准的 `name="medal" value="购买"`
2. 价格内嵌在 value 属性中：`value="CODE (PRICE 猫粮)"`
3. 页面上所有按钮都可能 disabled，即使非 disabled 也由服务端校验价格
4. 分页格式：`?page=page001` 到 `?page=page010`

### 注意事项

- 名称提取时必须取 **最后一个** `<img title>` 而非第一个（因为窗口中可能包含上一个勋章图片）
- 使用 `matchAll` + 取最后一个元素来正确获取最近的图片

- 2026-06-19: 新增 medal-item 布局 + hhanclub 网格布局 + SPA 适配（v1.7）
  - 新增 `extractMedalsFromMedalItems()` 通用提取器，处理 medal-item + medal-details 表格 + buy-btn/gift-btn 按钮模式
  - 新增 `extractMedalsFromHhanclub()` 特异性提取器，处理 hhanclub.net Tailwind 9 列网格布局
  - zmpt.cc SPA 站点已通过 chrome.tabs + scripting 注入适配（v1.6+）
  - 新增 24 个单元测试（86→86，11 medal-item + 9 hhanclub + 4 SPA）
  - 新增站点：hhanclub.net、hdbao.cc、dstudio.me、musopia.vip、playlet.cc
  - URL 更新：agsvpt.com → pt.agsvpt.cn、playletpt.xyz → playlet.cc

## medal-item 布局适配指南

### 布局特征

部分站点使用 `medal-item` 卡片布局，不同于标准 NexusPHP 表格和 medal-card 布局：

```html
<div class="medal-item">
  <img alt="勋章名称" src="..." />
  <div class="medal-info">
    <h2>勋章名称</h2>
    <p>描述</p>
    <p>不限~不限</p>
    <table class="medal-details">
      <tr><td>加成</td><td>0%</td></tr>
      <tr><td>有效期</td><td>365</td></tr>
      <tr><td>价格</td><td>888,888</td></tr>
      <tr><td>库存</td><td>0</td></tr>
    </table>
  </div>
  <div class="action-container">
    <input type="button" class="buy-btn" data-id="80" value="库存不足" disabled>
  </div>
</div>
```

### 关键点

1. 容器识别：`class="medal-item"` + `class="medal-details"` 双重检测
2. 按钮类名变体：`buy-btn`、`gift-btn` 或空 `class=""`（通过 `data-id` 属性识别）
3. 名称提取：优先从 `<h2>` 提取，回退到 `<img alt>`
4. 字段提取：从 `medal-details` 表格中按 label 匹配（价格/有效期/加成/库存）
5. 过滤规则：排除 `disabled`、`仅授予`、`交换`、`赠送` 按钮

### 适用站点

- pt.agsvpt.cn（`buy-btn` 类名）
- hdkyl.in（空 `class=""`，通过 `data-id` 识别）
- qingwapt.com（`gift-btn` 类名）

## hhanclub 网格布局适配指南

### 布局特征

hhanclub.net 使用 Tailwind CSS 9 列网格布局，完全自定义：

```html
<div class="medal-table py-5 bg-[#FFFFFF]">
  <div class="px-5"><img alt='勋章名称' src='...'></div>
  <div class="flex flex-col pr-5 gap-y-[15px]">
    <div>勋章名称</div>
    <div>描述</div>
  </div>
  <div>780,000</div>      <!-- 价格 -->
  <div>998178</div>         <!-- 库存 -->
  <div>1</div>              <!-- 限购 -->
  <div>15%</div>            <!-- 加成 -->
  <div>365</div>            <!-- 有效期 -->
  <div>普通</div>           <!-- 类型 -->
  <div>
    <input type="button" data-id="5" value="购买" disabled>
  </div>
</div>
```

### 关键点

1. 容器识别：`class="medal-table py-5"`（`py-5` 区分数据行和 header 行）
2. 深度计数提取：使用 `<div>` 深度计数而非正则，确保正确匹配嵌套 div 边界
3. 列索引：cells[0]=外层容器, cells[1]=图片, cells[2]=名称描述, cells[3]=价格, cells[4]=库存, cells[5]=限购, cells[6]=加成, cells[7]=有效期, cells[8]=类型, cells[9]=操作
4. 按钮过滤：仅提取 `value="购买"` 或 `value="購買"` 且非 disabled 的按钮

## SPA 站点适配指南

### 问题描述

zmpt.cc 等站点使用 Vue/Vite 构建的 SPA，静态 HTML 中只有 `<div id="vite-app"></div>` 空壳，勋章完全由 JavaScript 动态渲染。

### 检测方法

```javascript
const isZmpt = html.includes('id="vite-app"') && html.includes('modulepreload');
```

### 适配方案

使用 Chrome Extension API 在后台标签页中加载页面，等待 JS 渲染完成后注入脚本获取 DOM：

1. `chrome.tabs.create({ url, active: false })` → 创建后台标签页
2. 监听 `chrome.tabs.onUpdated` → 等待页面加载完成
3. `setTimeout(4000ms)` → 等待 JS 渲染完成
4. `chrome.scripting.executeScript({ target: { tabId }, func: () => document.getElementById('vite-app').innerHTML })` → 获取渲染后 DOM
5. `chrome.tabs.remove(tabId)` → 清理标签页
6. 将渲染后 DOM 传给 `extractMedalsFromCards()` 解析

### 注意事项

- 25 秒超时保护，防止标签页永久挂起
- 非浏览器环境（Node.js 测试）返回空数组
- manifest.json 需要 `"scripting"` 和 `"tabs"` 权限

### 其他 SPA 站点

- yemapt.org：UmiJS SPA（`id="root"` + `umi.js`），hash 路由 `#/consumer/badge`，尚未适配

## 代码修改全流程规范

每次修改必须识别以下同步点：
1. 核心逻辑（background.js 中的提取函数）
2. 分析脚本（scripts/analyze-html.js）
3. 单元测试（tests/unit/）
4. README.md（功能列表 + 更新日志）
5. 本 Skill 文档
6. CHANGELOG（如存在）

### 测试验证清单

修改完成后必须验证：
- [ ] 核心单元测试全部通过
- [ ] 集成测试全部通过
- [ ] `npm test`（25 项检查）全部通过
- [ ] 用调试包验证修复结果
- [ ] 确认其他站点未出现回归