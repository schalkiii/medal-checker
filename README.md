# PT Medal Scanner

批量检测 PT 站点可购买勋章的 Chrome 扩展。支持 NexusPHP 标准勋章系统及部分自定义勋章系统。

## 亮点

相比原版（v0.1），本版本进行了全面重构和功能升级：

| 维度       | 原版                        | 现版                                                                                                                                 |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 勋章识别   | 简单正则计数 `value="购买"` | 智能列式解析引擎，自动适配 9/10 列表格 + buycenter + 卡片布局 + pterclub 猫站 + medal-item 布局 + hhanclub 网格布局 + si-qi BEM 布局 |
| 展示信息   | 仅显示勋章数量              | 名称、价格、有效期、加成、库存、限时购买窗口                                                                                         |
| 站点配置   | 手动逐条输入                | 一键检测已登录站点，73 个内置站点自动匹配                                                                                            |
| 检测体验   | 按钮卡住无反馈              | 实时进度条 + 百分比 + 当前站点 + 调试日志                                                                                            |
| 扫描历史   | 无                          | 60 次历史持久化，Diff 模式高亮新增勋章                                                                                               |
| 调试能力   | 无                          | 一键导出原始 HTML 调试包 + 本地分析脚本 + 实时调试信息                                                                               |
| UI 设计    | 基础双栏 900px              | 卡片式布局 1100px，渐变色按钮，勋章彩色标签                                                                                          |
| 开发工具链 | 无                          | ESLint + 语法检查 + 文件监控 + 74 项自动化测试 + 97 站点回归快照                                                                     |
| 代码量     | ~600 行                     | ~1300 行（含 600+ 行测试）                                                                                                           |

## 功能

- 批量扫描多个 PT 站点的勋章页面，检测可购买的勋章
- 自动翻页检测（支持 `?page=N` 和 pterclub `?page=page001` 分页）
- 支持 NexusPHP 10列/9列标准勋章表格
- 支持 `buycenter.php` 特殊勋章系统
- 支持卡片式勋章布局（`medal-card` + `<button>` / `<input>` 按钮）
- 支持 medal-item 卡片布局（`medal-item` + `buy-btn` / `gift-btn` 按钮）
- 支持 hhanclub Tailwind 网格布局（`medal-table` + 9 列网格）
- 支持 si-qi BEM 风格卡片布局（`medal-card` + `medal-card__title` + `meta-label`/`meta-value` 键值对）
- 支持 SPA 站点（Vue/Vite 渲染，如 zmpt.cc）
- 支持繁体中文站点（`購買`）
- 智能站点检测：点击按钮自动识别已登录的 PT 站点，实时进度条 + 调试日志显示
- 内置 73 个常见 PT 站点配置（隐藏式，仅显示已登录的）
- Diff 模式：对比历史扫描结果，高亮新增勋章
- 智能过滤：只看永久勋章 / 只看限时售卖 / 只看正收益勋章，可任意组合并与 Diff 模式叠加
- 一键打开所有有可购买勋章站点
- 配置导入/导出（兼容 PTPP 备份格式）
- 勋章详情展示：名称、价格、有效期、加成、库存、可购买时间
- 结果统计与可视化展示

## 安装

1. 下载此仓库的 ZIP 包
2. 解压到本地目录
3. 打开 Chrome 浏览器，进入 `chrome://extensions/`
4. 开启右上角的"开发者模式"
5. 点击"加载已解压的扩展程序"，选择解压后的目录

## 使用

### 首次使用

点击扩展图标打开选项页面：

1. 点击 **「检测站点 Cookie」** 按钮，自动识别已登录的 PT 站点（实时进度条显示检测进度，调试信息区展示每个站点的检测状态和耗时）
2. 检测结果会自动填充到站点列表并保存
3. 点击 **「开始扫描」**，等待扫描完成

> 也支持手动编辑站点列表，或通过「导入配置」按钮导入 PTPP 备份文件。

### 结果查看

- 每个站点显示可购买勋章的名称、价格、有效期、加成、库存、可购买时间
- 点击站点链接可直接跳转到勋章页面
- 点击「一键打开」在后台打开所有有可购买勋章的站点

### 智能过滤

支持 3 种过滤模式，可独立开关或任意组合：

- **♾️ 永久勋章**：仅显示有效期不限/永久的勋章
- **⏳ 限时售卖**：仅显示有明确可购买时间窗口的勋章
- **📈 正收益**：仅显示加成大于 0 的勋章

过滤按钮与 **Diff 模式** 完全兼容，可同时启用。例如：开启 Diff 模式 + 正收益过滤，则只显示本次新增且加成 > 0 的勋章。

### Diff 模式

- 开启「差异模式」后，新增的勋章会高亮显示
- 历史扫描数据自动持久化存储（最近 60 次）

### 配置导入/导出

支持标准 JSON 格式：

```json
{
  "sites": [{ "name": "站点名称", "url": "https://site.com/" }]
}
```

兼容 PTPP 备份文件：`PTPP → 参数备份与恢复 → 备份ZIP下载并解压 → 选择 options.json 导入`

## 开发

### 环境要求

- Node.js >= 18
- npm

### 安装依赖

```bash
npm install
```

### 质量检查

```bash
# 完整检查（文件完整性 + 语法 + ESLint + 跨文件引用）
npm run check

# ESLint 自动修复
npm run lint-fix

# 文件监控（修改后自动检查）
npm run watch
```

### 运行测试

```bash
npm test
```

测试包括：

- 单元测试（86 项）：background.js 核心函数（勋章提取、卡片布局、列布局检测、SPA 检测等）
- DOM 测试（14 项）：options 页面元素和交互
- 集成测试（6 项）：消息传递协议和 storage 数据流
- 回归测试（97 项）：基于真实调试包的 97 站点快照对比，覆盖 5 种布局类型

```bash
# 仅运行回归测试（需要 PT_Debug_*.json 调试包）
npm run test:regression

# 重新生成快照基线（修改提取逻辑后）
npm run snapshot PT_Debug_*.json
```

### 调试分析

导出扩展扫描的原始 HTML 后，用分析脚本排查勋章识别问题：

```bash
# 分析单个 HTML 文件
node scripts/analyze-html.js page.html

# 分析调试包（从扩展导出）
node scripts/analyze-html.js PT_Debug_*.json
```

## 技术架构

```
background.js          Service Worker - 核心扫描逻辑、勋章提取引擎、站点检测
options/options.html   选项页面 UI - 卡片式布局、渐变色按钮、勋章彩色标签
options/options.js     选项页面逻辑 - 结果显示、Diff 模式、智能过滤、配置管理
manifest.json          Chrome Extension Manifest V3 配置
scripts/               CI/CD 脚本（检查、修复、监控、分析、快照生成）
tests/                 测试套件（单元测试、DOM测试、集成测试、回归测试）
tests/fixtures/        回归测试快照（基于真实调试包的 97 站点基线数据）
```

### 勋章提取引擎

- `extractMedalsFromHtml()` - 标准 NexusPHP 勋章解析，自动检测 9列/10列表格布局，提取名称/价格/有效期/加成/库存/可购买时间；同时支持卡片式/medal-item/hhanclub/si-qi 多种布局回退
- `extractMedalsFromCards()` - 卡片式勋章布局解析，自动查找页面中所有 `medal-card` 元素，支持 `<input>` 和 `<button>` 两种购买按钮格式
- `extractMedalsFromMedalItems()` - medal-item 卡片布局解析，处理 `medal-item` + `medal-details` 表格 + `buy-btn`/`gift-btn` 按钮模式
- `extractMedalsFromHhanclub()` - hhanclub Tailwind 网格布局解析，9 列 CSS Grid 自动提取
- `extractMedalsFromSiqi()` - si-qi.xyz BEM 风格卡片布局解析，处理 `medal-card` + `medal-card__title` + `meta-label`/`meta-value` 键值对结构
- `extractMedalsFromBuyCenter()` - 特殊 buycenter.php 勋章系统解析
- `extractMedalsFromPterclub()` - pterclub.net（猫站）自定义表格布局解析
- `extractMedalsFromZmpt()` - zmpt.cc SPA 站点解析（chrome.tabs + scripting 注入）
- `getColumnLayout()` - 列布局检测，返回正确的列索引映射
- `extractTdText()` - HTML 表格单元格文本提取，保留 h1/br 结构

## 更新日志

### v1.8（当前版本）

- 新增 si-qi.xyz BEM 风格卡片布局支持
- 新增 `extractMedalsFromSiqi()` 提取器，处理 `medal-card` + `medal-card__title` + `meta-label`/`meta-value` 键值对结构
- 新增 11 个 si-qi 单元测试（含可购买/已购/赠送/过期/繁体/回退链场景，总计 97 个）
- 分析脚本 `analyze-html.js` 新增 si-qi BEM 布局检测分支，修复非字符串 HTML 导致的崩溃
- 适配决策：采用针对性适配（独立提取器），与 pterclub/hhanclub 等站点特异提取器模式一致，零回归风险

### v1.7

- 新增 zmpt.cc SPA 站点支持（Vue/Vite 渲染，chrome.tabs + scripting 注入获取渲染后 DOM）
- 新增 `extractMedalsFromMedalItems()` 通用提取器，支持 medal-item 卡片布局（agsvpt.cn、hdkyl.in、qingwapt.com 等）
- 新增 `extractMedalsFromHhanclub()` 特异性提取器，支持 hhanclub.net Tailwind 9 列网格布局
- 新增 4 个 SPA 检测单元测试 + 11 个 medal-item 单元测试 + 9 个 hhanclub 单元测试（总计 86 个）
- 分析脚本 `analyze-html.js` 新增 SPA / hhanclub / medal-item 布局检测分支
- 修复 check.js 中 ESLint 警告被误计为错误的 bug
- DEFAULT_SITES 更新：新增 hhanclub.net、hdbao.cc、dstudio.me、musopia.vip、playlet.cc；agsvpt.com → pt.agsvpt.cn；playletpt.xyz → playlet.cc
- 站点总数：69 → 73

### v1.6

- 修复 hxpt.org 卡片布局勋章链接精度问题（URL 已有 query string 时使用 `&` 替代 `?`）
- options.js 勋章链接生成逻辑优化

### v1.5

- 新增 pterclub.net（猫站）自定义表格布局支持
- `extractMedalsFromPterclub()` 处理 `name="medalchosen"` 提交按钮格式
- 勋章名称从 `<img title>` 提取，价格从 `value="CODE (PRICE 猫粮)"` 正则提取
- 分页支持 `?page=page001` 格式（pterclub 特有）
- 新增 8 个 pterclub 单元测试（总计 62 个）
- DEFAULT_SITES 更新：`pterclub.com` → `pterclub.net`，`rousi.zip` → `rousi.pro`

### v1.4

- 卡片布局勋章解析引擎全面泛化，覆盖 longtpt、ptlgs、cspt、si-qi、hxpt、luckpt、dubhe 等 6 个新站点
- `medal-card` 标签使用 `\b` 词边界匹配，不依赖尾部空格
- 购买按钮匹配泛化：`\bbuy\b` 匹配任意含 "buy" 词的 class
- 名称提取 3 层回退：medal-name/medal-title/medal-card\_\_name → img alt → 首 h1-h4
- 字段提取 5 种 label-value 模式 + `<strong>` 后备
- 勋章总数从 35 提升到 83（+137%），覆盖 12 个站点
- 新增 8 个泛化模式单元测试

### v1.3

- 针对容器类、按钮类勋章提取引擎全面升级，新增卡片式布局（`medal-container` + `<button>`）支持
- 修复 13city、piggo、joyhd 等使用卡片布局的站点无法解析勋章的问题
- `extractMedalsFromCards()` 不再依赖容器标签匹配，直接在全页面中查找 `medal-card` 元素
- 购买按钮检测同时支持 `<input>` 和 `<button>` 标签，容忍 class 属性尾部空格
- 分析脚本 `analyze-html.js` 新增卡片布局分析分支，实时显示购买按钮数和可用数
- 新增回归测试体系：基于真实调试包 97 站点快照对比，覆盖 table/card/buycenter 共 5 种布局
- `npm run test:regression` 快速验证无回归，`npm run snapshot` 重新生成基线快照

### v1.2

- 新增 3 个智能过滤按钮：只看永久勋章、只看限时售卖、只看正收益勋章
- 过滤按钮与 Diff 模式完全兼容，可任意组合开关
- 统计栏实时显示当前启用的过滤条件
- 新增「打开过滤结果」按钮，根据过滤选择只打开匹配的勋章页面

### v1.1

- 站点检测添加实时进度条 + 百分比 + 当前站点显示
- 调试信息实时展示每个站点的检测状态和耗时
- 90秒超时保护，防止检测按钮永久卡住
- 消息通信增加超时恢复机制

### v1.0

- 全新的勋章提取引擎，基于列位置精准解析 NexusPHP 9列/10列表格
- 支持 buycenter.php 非标准勋章系统
- 智能站点检测：69 个内置站点，一键检测已登录站点
- 勋章详情展示：价格、有效期、加成、库存、可购买时间
- Diff 模式：历史对比，高亮新增勋章
- 扫描历史持久化（60 次）
- 调试数据导出 + 本地分析脚本
- 卡片式 UI 设计，1100px 宽布局
- 完整测试套件（63 项测试）和 CI 检查流水线（25 项检查）

### v0.1（原版）

- 基础勋章计数（简单正则匹配）
- 基础双栏 UI（900px）
- 配置导入/导出

## 许可证

MIT
