# Chrome 扩展开发方法论

基于 PT Medal Scanner 项目的完整开发实践提炼。

## 核心理念

**迭代式增量开发**：每轮聚焦一个可验证的目标，小步快跑，每步都通过测试和检查验证。

## 开发流程

### 阶段一：代码理解（Code Understanding）

1. **全面勘探代码库**
   - 阅读所有源文件，理解模块职责
   - 绘制依赖关系图
   - 识别入口点、数据流、消息协议

2. **生成结构化文档**
   - 项目架构、模块职责、关键函数说明
   - 数据流图（消息传递、存储读写）
   - 这份文档是后续所有改动的"地图"

### 阶段二：工具链搭建（Toolchain）

在动手写功能之前，先建立质量保障体系：

1. **静态检查流水线**
   ```
   文件完整性 → manifest 校验 → 语法检查 → ESLint → 跨文件引用一致性
   ```

2. **测试套件**
   ```
   单元测试（核心函数） → DOM 测试（页面交互） → 集成测试（消息/存储）
   ```

3. **文件监控**
   - 修改代码后自动运行检查 + 修复
   - 快速反馈循环

4. **关键原则**
   - Chrome 扩展有 Service Worker 和 Options Page 两个独立上下文
   - 测试时必须 mock `chrome.*` API（`chrome.storage`, `chrome.cookies`, `chrome.runtime` 等）
   - 使用 `jsdom` 模拟 DOM 环境测试 options 页面

### 阶段三：功能迭代（Feature Iteration）

每一轮迭代的标准流程：

```
用户需求 → 理解现状 → 设计方案 → 实现 → 测试 → 验证 → 交付
```

**关键实践**：

1. **每次改动后立即验证**
   ```bash
   npm run check  # 24 项静态检查
   npm test       # 52 项自动化测试
   ```

2. **测试先行**
   - 新增功能前先写好测试用例
   - 用测试描述预期行为
   - 确保测试覆盖边界情况（空输入、无效输入、边缘 case）

3. **小步提交**
   - 每个 commit 聚焦一个可独立验证的改动
   - commit message 清晰描述"做了什么"和"为什么"

### 阶段四：调试驱动开发（Debug-Driven Development）

这是本项目最核心的方法论，特别适用于**网页内容解析**类项目：

1. **在扩展中埋入调试钩子**
   - 扫描过程中保存原始 HTML
   - 提供一键导出调试包的功能
   - 导出格式：`{ pages: [{ url, html }] }`

2. **本地分析脚本**
   - 加载调试数据，运行提取逻辑
   - 逐页面输出分析结果
   - 快速定位识别失败的页面

3. **分析 → 修复 → 验证循环**
   ```
   导出调试包 → 本地分析 → 定位问题 → 修改代码 → 重新分析 → 确认修复
   ```

4. **实际案例**
   - 发现 97 个页面中 0 个匹配 → 分析 HTML 结构 → 发现表格列数差异
   - 发现 springsunday 使用完全不同的系统 → 单独分析 → 确认无购买入口

## 技术决策原则

### 1. 通用优先，特殊兜底

```javascript
// ✅ 好：自动检测布局
const layout = getColumnLayout(tds.length);  // 支持 9/10 列

// ✅ 好：特殊站点单独处理
if (url.includes('buycenter.php')) {
  medals = extractMedalsFromBuyCenter(html);
}
```

### 2. 纯正则优于 DOM 解析

Chrome Service Worker 中没有 `DOMParser`，必须使用正则：

```javascript
// ❌ Service Worker 中不可用
const doc = new DOMParser().parseFromString(html, 'text/html');

// ✅ 正则解析，兼容 Service Worker
const rows = html.match(/<tr[\s\S]*?(?=<tr|$)/gi);
```

### 3. 容错设计

```javascript
// 处理缺失的 </tr> 闭合标签
/<tr[\s\S]*?(?=<tr|$)/gi  // 用下一个 <tr> 作为边界

// 处理 URLs without protocol
try { new URL(url) } catch { /* fallback parsing */ }
```

### 4. 数据驱动配置

```javascript
// 隐藏式内置配置，用户无需手动维护
const DEFAULT_SITES = [/* 69 个站点 */];

// 运行时检测，仅显示有 cookie 的站点
if (request.action === 'detectSites') { /* cookie 检测 */ }
```

## 项目结构规范

```
extension/
├── background.js          # Service Worker 入口
├── manifest.json          # MV3 配置
├── options/
│   ├── options.html       # UI（CSS 内联，避免额外请求）
│   └── options.js         # UI 逻辑
├── scripts/               # 开发工具
│   ├── check.js           # 完整检查流水线
│   ├── lint-fix.js        # ESLint 自动修复
│   ├── watch.js           # 文件监控
│   └── analyze-html.js    # 调试分析
├── tests/
│   ├── mocks/
│   │   └── chrome-mock.js # Chrome API Mock
│   ├── unit/              # 单元测试
│   ├── integration/       # 集成测试
│   └── run.js             # 测试运行器
├── package.json
├── eslint.config.mjs
└── .gitignore
```

## 消息协议设计

Chrome 扩展前后端通信通过 `chrome.runtime.sendMessage`：

```javascript
// Options → Background（action）
{ action: 'startScan' }
{ action: 'detectSites' }

// Background → Options（type）
{ type: 'scanLog', text, isError }
{ type: 'scanResult', data: results }
```

**设计原则**：
- `action` 表示"要做什么"（请求方向）
- `type` 表示"发生了什么"（通知方向）
- 跨文件引用检查确保前后端消息类型一致

## 勋章提取引擎设计

核心挑战：不同 PT 站点使用不同版本的 NexusPHP，表格列数和结构有差异。

```
标准 10 列: ID | 图片 | 名称 | 时间 | 有效期 | 加成 | 价格 | 库存 | 操作 | 赠送
简化  9 列:      图片 | 名称 | 时间 | 有效期 | 加成 | 价格 | 库存 | 操作 | 赠送
特殊  6 列:      图片 | 名称 | ... | ... | 价格 | 操作（buycenter）
```

**解决方案**：

1. `getColumnLayout(tdsLength)` — 自动检测布局
2. `extractMedalsFromHtml()` — 标准 NexusPHP 解析
3. `extractMedalsFromBuyCenter()` — 特殊系统解析
4. `extractTdText()` — 结构化文本提取（保留 h1/br）

**关键细节**：
- 操作按钮必须精确匹配 `value="购买"` 而非 `includes('购买')`，避免误匹配"已经购买"
- 部分站点省略 `</tr>` 闭合标签，用前瞻断言 `(?=<tr|$)` 处理
- 部分站点多个勋章放在同一个 `<tr>` 中，按 stride 分组

**卡片布局泛化原则（v1.10 教训）**：
- 容器匹配必须用正则且允许 class 后无空格：`<div class="medal-card">`、`class="medal-card locked"`、`class="medal-card" data-id=` 都是合法变体；硬编码 `'<div class="medal-card '`（带尾空格）会静默漏掉整个站点（v1.7 曾把 v1.6 的泛化正则改回硬编码，导致 hxpt/luckpt/cspt/longpt 四个站点集体漏扫一个版本周期）
- 正则同时排除派生容器：`medal-card(?![-\w])` 排除 `medal-card__title`（si-qi 专用）、`medal-card-list`、`medal-cards`
- 购买按钮双重判定：class 含独立单词 `\bbuy\b`（覆盖 buy-btn/buy-action/...-buy 变体）或文本恰为购买/購買；disabled 与"已经购买/已过可购买时间/需要更多魔力值"等状态按钮必须排除——注意"需要更多魔力值"是买不起而非不可买，按产品口径不计入
- 字段标签-值容器各站差异极大（detail-label/meta-label/stat-item/medal-detail-item/strong），用模式清单覆盖 + data-\* 属性兜底；同一字段后者覆盖前者（如 hxpt"定价"之后的"购买价(过期+50%)"才是实扣价）

**SPA 站点渲染原则（v1.10 教训）**：
- Service Worker 无 DOM，SPA 站点（Vite/umi 壳）必须借后台标签页渲染；壳检测用「含外部脚本 + 剥离 script/style 后几乎无文本」，比硬编码 `id="vite-app"` 更通用（yemapt 用 `id="root"`）
- complete 之后 JS 渲染耗时不稳定：固定延时（如 4s）不可靠，必须轮询挂载点内容直到非空
- 所有退出路径（含总超时）都必须 `chrome.tabs.remove`，否则每次扫描残留一个空标签页
- 定时扫描与手动扫描必须共用同一扫描函数，否则适配能力会 drifting（v1.10 前定时扫描不走卡片/SPA 分支）

**分页抓取原则（v1.10 教训）**：
- 分页条可能带省略号（`1 2 … 12 13 14`），只匹配相邻页码会漏掉折叠页；解法是工作流式抓取：每抓一页就从该页分页条发现新页码
- 分页索引约定不统一：0 索引站点（base=第0页，`?page=1` 是第二页）与 1 索引站点并存；以「首页分页条是否链接 ?page=1」判定，并用「?page=1 内容与首页勋章名集合相同」去重兜底
- 拼接分页 URL 时站点可能已带查询参数（`mall.php?cid=5`），必须用 `&` 而非 `?`

## 常见陷阱

| 问题 | 原因 | 解决 |
|------|------|------|
| `DOMParser is not defined` | Service Worker 无 DOM API | 使用纯正则解析 |
| 按钮值误匹配 | `includes('购买')` 匹配了"已经购买" | 精确匹配 `value="购买"` |
| `</tr>` 缺失导致行截断 | NexusPHP HTML 不规范 | 前瞻断言 `(?=<tr\|$)` |
| `0 % 10 === 0` 为 true | JS 中 0 能被任何非零数整除 | 添加 `tdsLength <= 0` 检查 |
| 不同站点列数不同 | NexusPHP 版本差异 | `getColumnLayout()` 自动检测 |
| 整站漏扫但无报错 | 容器匹配硬编码尾空格，正则写死 | 正则匹配 + 调试包按钮信号核对 |
| SPA 站点抓回空数组 | 固定延时短于渲染耗时 / 超时未关标签 | 轮询等待 + 超时也 remove |
| 异步测试假通过 | 同步 `test()` 包裹 async fn，断言永不执行 | `testAsync` 入队 + 末尾统一 await |
| 测试进程 45s 不退出 | 未被 await 的渲染调用留下兜底定时器 | 异步用例必须真正 await |
| mock 与实现不同步 | mock 缺 tabs.onUpdated/scripting 导致流程走不通 | 扩展 mock 并驱动事件 |
| 测试间状态污染 | 共享全局 chrome mock | `spawnSync` 进程隔离 |