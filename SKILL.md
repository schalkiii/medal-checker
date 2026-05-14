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

## 常见陷阱

| 问题 | 原因 | 解决 |
|------|------|------|
| `DOMParser is not defined` | Service Worker 无 DOM API | 使用纯正则解析 |
| 按钮值误匹配 | `includes('购买')` 匹配了"已经购买" | 精确匹配 `value="购买"` |
| `</tr>` 缺失导致行截断 | NexusPHP HTML 不规范 | 前瞻断言 `(?=<tr\|$)` |
| `0 % 10 === 0` 为 true | JS 中 0 能被任何非零数整除 | 添加 `tdsLength <= 0` 检查 |
| 不同站点列数不同 | NexusPHP 版本差异 | `getColumnLayout()` 自动检测 |
| 测试间状态污染 | 共享全局 chrome mock | `spawnSync` 进程隔离 |