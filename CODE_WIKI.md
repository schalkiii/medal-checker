# PT勋章扫描器 (PT Medal Scanner) — Code Wiki

## 1. 项目概述

**PT勋章扫描器** 是一款 Chrome 浏览器扩展（Manifest V3），用于批量扫描多个 PT（Private Tracker）站点的勋章（Medal）页面，检测是否存在可购买的勋章。插件通过读取浏览器中已登录站点的 Cookie 来模拟用户请求，使用 DOMParser 解析勋章页面 HTML，提取勋章名称、价格、时效等详细信息，并提供一键打开站点链接、差异对比（diff 模式）等功能。

### 核心功能

| 功能 | 说明 |
|------|------|
| 多站点批量扫描 | 同时扫描多个 PT 站点的勋章页面，支持分页（最多 15 页） |
| 勋章详情提取 | 自动提取勋章名称、价格、有效期等信息 |
| 可点击跳转链接 | 扫描结果中的站点 URL 可直接点击在新标签页打开 |
| 差异模式 (Diff) | 对比历史扫描记录，高亮显示本次新增的勋章 |
| 持久化存储 | 扫描历史自动保存（最近 60 次），支持跨会话对比 |
| 配置导入/导出 | 支持标准 JSON 和 PTPP 备份文件格式 |

| 属性 | 值 |
|------|-----|
| 名称 | PT勋章扫描器 |
| 版本 | 1.0 |
| 类型 | Chrome Extension (Manifest V3) |
| 权限 | `cookies`, `storage`, `activeTab`, `<all_urls>` |
| 入口 | `options/options.html` (选项页即主界面) |

---

## 2. 项目目录结构

```
/workspace/
├── manifest.json           # Chrome 扩展清单文件
├── background.js           # Service Worker（后台扫描引擎 + HTML解析）
├── icon.png                # 扩展图标 (48x48)
├── LICENSE                 # 开源许可证
├── README.md               # 项目说明
├── CODE_WIKI.md            # 本文件：结构化代码文档
└── options/
    ├── options.html        # 选项页 / 主界面 HTML
    └── options.js          # 选项页前端逻辑（含 diff 模式）
```

---

## 3. 整体架构

```
┌──────────────────────────────────────────────────┐
│                  Chrome Extension                 │
│                                                  │
│  ┌──────────────┐      ┌──────────────────────┐  │
│  │  options.js  │◄────►│ chrome.storage.local │  │
│  │  (前端UI)     │      │  (配置 + 扫描结果)     │  │
│  └──────┬───────┘      └──────────────────────┘  │
│         │                                        │
│         │ chrome.runtime.sendMessage             │
│         │ / onMessage                            │
│         ▼                                        │
│  ┌──────────────┐      ┌──────────────────────┐  │
│  │ background.js│◄────►│ chrome.cookies API   │  │
│  │ (Service     │      │ (读取站点Cookie)       │  │
│  │  Worker)     │      └──────────────────────┘  │
│  └──────────────┘                                │
│         │                                        │
│         │ fetch() + Cookie header                │
│         ▼                                        │
│  ┌──────────────────────────────┐                │
│  │  PT 站点 medal.php 页面       │                │
│  │  (外部 HTTP 请求)             │                │
│  └──────────────────────────────┘                │
└──────────────────────────────────────────────────┘
```

### 3.1 数据流

1. **配置阶段**：用户在 `options.html` 中配置站点列表 → `options.js` 保存到 `chrome.storage.local`
2. **扫描触发**：用户点击"开始扫描" → `options.js` 发送 `startScan` 消息给 `background.js`
3. **Cookie 获取**：`background.js` 通过 `chrome.cookies.getAll()` 获取目标站点的 Cookie
4. **页面请求**：`background.js` 使用 `fetch()` 携带 Cookie 请求 `medal.php` 页面
5. **HTML 解析**：通过正则表达式匹配 `value="购买..."` 统计可购买勋章数量
6. **分页处理**：检测分页链接，遍历最多 15 页
7. **结果回传**：扫描结果通过 `chrome.runtime.sendMessage` 回传给 `options.js`
8. **结果展示**：`options.js` 更新 UI，显示站点名称、URL 和勋章数量

---

## 4. 主要模块职责

### 4.1 `manifest.json` — 扩展清单

[manifest.json](file:///workspace/manifest.json)

- **manifest_version: 3** — 使用 Chrome 最新的 Manifest V3 规范
- **permissions**:
  - `cookies` — 读取浏览器中已登录站点的 Cookie
  - `storage` — 持久化存储站点配置和扫描结果
  - `activeTab` — 获取当前活动标签页信息
- **host_permissions: `<all_urls>`** — 允许向任意 URL 发起请求
- **background.service_worker** — 注册 `background.js` 作为 Service Worker
- **options_ui** — 将 `options/options.html` 设为选项页（`open_in_tab: true` 在新标签页中打开）
- **action** — 点击扩展图标时触发 `chrome.action.onClicked` 事件

### 4.2 `background.js` — 后台扫描引擎

[background.js](file:///workspace/background.js)

Service Worker，负责核心的勋章扫描逻辑。不直接操作 DOM，通过消息机制与前端通信。

#### 关键函数

| 函数 | 行号 | 职责 |
|------|------|------|
| `getCookieDomain(url)` | L1-L9 | 从 URL 中提取 Cookie 适用的域名（取最后两级） |
| `fetchWithTimeout(url, options, timeout)` | L12-L20 | 带超时控制的 `fetch` 封装，默认 10 秒超时，使用 `AbortController` |
| `extractMedalsFromHtml(html)` | L21-L77 | 使用 DOMParser 解析 HTML，提取勋章名称、价格、有效期 |
| `chrome.action.onClicked` 监听器 | L79-L81 | 点击扩展图标时打开选项页 |
| `chrome.runtime.onMessage` 监听器 | L83-L191 | 接收 `startScan` 消息，执行扫描流程并存储历史 |

#### `extractMedalsFromHtml` 详解（L21-L77）

这是新增的 HTML 解析函数，替代了原来简单的正则计数方式：

```
1. 使用 DOMParser 将 HTML 字符串解析为 DOM 树
2. 查找所有 value 包含 "购买" 的 <input> 元素
3. 对每个购买按钮，向上查找最近的容器（tr → td → div）
4. 从容器文本中提取：
   a. 勋章名称 — 匹配 "勋章名称/名称/勋章/徽章" 标签 或 <img alt> 属性
   b. 价格 — 匹配 "价格/售价/所需/需要/消耗/花费" 标签 或 数字+货币单位
   c. 有效期 — 匹配 "有效期/时效/期限" 标签 或 "永久/长期" 等关键词
5. 返回 { name, price, duration } 对象数组
```

#### 扫描历史持久化（L175-L186）

每次扫描完成后自动保存历史记录：

- 存储 key: `scanHistory`（`chrome.storage.local`）
- 数据结构: `[{ timestamp, dateStr, results }, ...]`
- 保留最近 60 次扫描记录（超出自动淘汰最旧的）

#### 扫描流程详解（`startScan` 处理函数，L83-L191）

```
1. 从 chrome.storage.local 读取 sites 配置
2. 遍历每个站点：
   a. 解析站点名称和 URL（格式：name|url）
   b. 获取域名对应的 Cookie（主域名 + 子域名）
   c. 去重 Cookie 列表
   d. 发送主请求（带 Cookie 头 + 10秒超时）
   e. 调用 extractMedalsFromHtml() 解析勋章详情
   f. 检测分页（href="?page=N"），遍历最多 15 页
   g. 聚合所有页面的勋章数据
   h. 记录日志并推送到前端
3. 保存扫描结果到 chrome.storage.local（scanResults）
4. 追加到扫描历史（scanHistory，最多 60 条）
5. 发送 scanResult 消息给前端
```

#### 分页检测正则

```javascript
/href\s*=\s*["']\?page=N["']/g
```
检测页面中是否存在指向第 N 页的链接。

### 4.3 `options/options.html` — 主界面

[options/options.html](file:///workspace/options/options.html)

选项页即插件主界面，采用双栏布局（CSS Grid）：

- **左侧栏（配置区）**：
  - 配置导入说明（支持标准 JSON 和 PTPP 备份文件）
  - 操作按钮组：导入配置、导出配置、保存配置
  - 站点配置文本框（`<textarea>`）
- **右侧栏（操作区）**：
  - 操作按钮组：开始扫描、一键打开
  - 实时日志区域（`#scanLog`）
  - 扫描结果展示区（`#resultBox` → `#resultList` + `#resultStats`）
  - 清除结果按钮

#### 关键 CSS 类

| 类名 | 用途 |
|------|------|
| `.main-container` | 双栏 Grid 布局容器 |
| `.config-section` | 左侧配置区块 |
| `.output-container` | 右侧输出区块 |
| `.action-buttons` | 按钮组 Grid 布局 |
| `.log-entry` | 单条日志条目 |
| `.result-site` | 单个站点结果卡片（含头 + 勋章列表） |
| `.result-site-header` | 站点卡片头部（名称 + 可点击链接 + 勋章数） |
| `.result-site-link` | 可点击的站点链接（蓝色，新标签页打开） |
| `.result-site-count` | 站点勋章数量 |
| `.medal-list` | 勋章列表容器 |
| `.medal-item` | 单条勋章条目（左侧灰边框） |
| `.medal-item.new-medal` | 新增勋章高亮（橙色左边框 + 黄色背景） |
| `.medal-name` | 勋章名称 |
| `.medal-meta` | 勋章元信息行（价格 + 有效期） |
| `.diff-badge` | "NEW" 橙色徽章 |
| `#diffToggleBtn` | 差异模式切换按钮（灰/绿状态切换） |
| `.config-notice` | 配置说明提示框（橙色左边框） |
| `.empty-result` | 空状态提示 |

### 4.4 `options/options.js` — 前端控制器

[options/options.js](file:///workspace/options/options.js)

选项页的前端逻辑，负责 UI 交互、配置管理、消息监听、结果展示和差异对比。

#### 状态管理（L17-L19）

| 变量 | 类型 | 用途 |
|------|------|------|
| `diffMode` | `boolean` | 差异模式开关状态 |
| `currentResults` | `array` | 当前扫描结果缓存，用于切换 diff 模式时即时重绘 |
| `previousResults` | `array` | 上一次扫描结果，用于 diff 对比 |

#### 核心函数

| 函数 | 行号 | 职责 |
|------|------|------|
| `verifyElements()` | L31-L37 | 验证所有关键 DOM 元素是否存在 |
| `addLog(message, isError)` | L43-L52 | 向日志区域添加带时间戳的日志条目 |
| `getMedalFingerprint(siteName, medal)` | L54-L56 | 生成勋章唯一指纹（站点名+勋章名），用于 diff 对比 |
| `computeDiff(current, previous)` | L58-L79 | 对比两次扫描结果，返回新增勋章集合 |
| `updateResultDisplay(results)` | L81-L154 | 渲染扫描结果：站点头（含可点击链接）+ 勋章详情列表 |
| `readFileAsText(file)` | L326-L333 | 使用 FileReader 异步读取文件内容 |

#### 差异模式（Diff）机制

```
1. 用户点击 "差异模式" 按钮切换 diffMode
2. 开启时从 scanHistory 获取倒数第二条记录作为 previousResults
3. computeDiff() 构建上次扫描的勋章指纹集合
4. 遍历当前结果，筛选出不在指纹集合中的勋章
5. 新增勋章以橙色左边框 + 黄色背景 + "NEW" 徽标高亮显示
6. 统计栏额外显示 "新增勋章" 数量
```

#### 事件处理

| 事件 | 元素 | 行号 | 行为 |
|------|------|------|------|
| `click` | `#clearResultsBtn` | L21-L29 | 清除扫描结果和历史记录（确认后从 storage 删除） |
| `click` | `#saveBtn` | L164-L178 | 解析文本框内容，保存站点配置到 storage |
| `click` | `#importBtn` | L180-L183 | 触发文件选择对话框 |
| `change` | `#fileInput` | L185-L213 | 读取 JSON 文件，解析并导入站点配置 |
| `click` | `#exportBtn` | L215-L245 | 将当前配置导出为 JSON 文件下载 |
| `click` | `#scanBtn` | L247-L264 | 触发扫描任务（防重入检查） |
| `click` | `#openAllBtn` | L266-L288 | 在后台标签页中打开所有有勋章的站点 |
| `click` | `#diffToggleBtn` | L290-L311 | 切换差异模式，重新渲染结果 |
| `chrome.runtime.onMessage` | — | L313-L324 | 监听 `scanLog` 和 `scanResult` 消息 |

#### 初始化流程（L156-L162）

```
DOMContentLoaded →
  1. 验证所有 DOM 元素
  2. 从 chrome.storage.local 加载 sites 配置、scanResults、scanHistory
  3. 如果 scanHistory >= 2 条，提取上一条作为 previousResults
  4. 恢复 UI 状态

---

## 5. 数据模型

### 5.1 站点配置（`sites`）

存储在 `chrome.storage.local` 中，key 为 `sites`。

```javascript
// 存储格式：字符串数组
["站点A|https://sitea.com/medal.php", "站点B|https://siteb.com/medal.php"]

// 导入/导出格式：JSON
{
  "sites": [
    { "name": "站点A", "url": "https://sitea.com/" },
    { "name": "站点B", "url": "https://siteb.com/" }
  ]
}
```

### 5.2 扫描结果（`scanResults`）

存储在 `chrome.storage.local` 中，key 为 `scanResults`。

```javascript
[
  {
    "siteName": "站点A",
    "count": 5,
    "url": "https://sitea.com/medal.php",
    "medals": [
      { "name": "黄金勋章", "price": "1000", "duration": "30天" },
      { "name": "白银勋章", "price": "500", "duration": "永久" }
    ]
  }
]
```

### 5.3 扫描历史（`scanHistory`）

存储在 `chrome.storage.local` 中，key 为 `scanHistory`。每次扫描完成后自动追加，保留最近 60 条。

```javascript
[
  {
    "timestamp": 1715587200000,
    "dateStr": "2026-05-12",
    "results": [ /* 同 scanResults 结构 */ ]
  },
  {
    "timestamp": 1715673600000,
    "dateStr": "2026-05-13",
    "results": [ /* 同 scanResults 结构 */ ]
  }
]
```

---

## 6. 消息协议

### 6.1 前端 → 后台

| 消息 | action | 说明 |
|------|--------|------|
| 开始扫描 | `startScan` | 触发后台开始扫描所有已配置的站点 |

### 6.2 后台 → 前端

| 消息 | type | 数据 | 说明 |
|------|------|------|------|
| 扫描日志 | `scanLog` | `{ text, isError }` | 实时推送扫描进度日志 |
| 扫描结果 | `scanResult` | `{ data: [...] }` | 扫描完成后推送汇总结果 |

---

## 7. 依赖关系

```
options.js ──依赖──► chrome.storage.local (读写)
options.js ──依赖──► chrome.runtime.sendMessage / onMessage
options.js ──依赖──► chrome.tabs.create (一键打开)

background.js ──依赖──► chrome.storage.local (读配置)
background.js ──依赖──► chrome.cookies.getAll (获取Cookie)
background.js ──依赖──► chrome.runtime.sendMessage / onMessage
background.js ──依赖──► fetch API (HTTP请求)
background.js ──依赖──► AbortController (超时控制)
```

### 外部依赖

- 无第三方 npm 包或 CDN 资源
- 纯原生 JavaScript + Chrome Extension API
- 零外部运行时依赖

---

## 8. 项目运行方式

### 8.1 开发模式加载

1. 下载/克隆项目代码到本地
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目根目录 `/workspace`
6. 扩展加载成功后，点击工具栏中的扩展图标即可打开控制台

### 8.2 配置站点

**方式一：手动输入**
在左侧文本框中按格式输入：
```
站点名称|https://example.com/medal.php
```

**方式二：JSON 导入**
准备 JSON 文件：
```json
{
  "sites": [
    { "name": "站点A", "url": "https://sitea.com/" },
    { "name": "站点B", "url": "https://siteb.com/" }
  ]
}
```
点击「导入配置」选择文件。

**方式三：PTPP 备份导入**
1. 在 PTPP 插件中：参数备份与恢复 → 备份 ZIP 下载并解压
2. 选择解压后的 `options.json` 导入

### 8.3 使用流程

1. 配置站点信息并保存
2. 确保已在目标 PT 站点登录（浏览器中有有效 Cookie）
3. 点击「开始扫描」
4. 观察实时日志和扫描结果（含勋章名称、价格、有效期）
5. 点击站点链接可直接跳转到勋章页面
6. 点击「差异模式」对比历史记录，橙色高亮显示新增勋章
7. 点击「一键打开」在新标签页中打开有勋章的站点

### 8.4 注意事项

- 必须先在浏览器中登录目标 PT 站点，插件才能获取有效 Cookie
- 每个请求有 10 秒超时限制
- 分页扫描最多支持 15 页
- 扩展图标点击可直接打开控制台

---

## 9. 质量检查流水线

项目内置了一套自动化质量检查流水线，支持静态分析、代码规范检查和文件监控自迭代。

### 9.1 检查项目

| 序号 | 检查项 | 说明 |
|------|--------|------|
| 1 | 文件完整性 | 验证 manifest.json、background.js、icon.png、options/ 等必要文件存在 |
| 2 | manifest.json 校验 | 验证 manifest_version、权限声明、service_worker、options_ui 路径正确性 |
| 3 | JS 语法检查 | 使用 `new Function()` 解析 JS 文件，检查是否存在语法错误 |
| 4 | HTML 结构检查 | 验证 DOCTYPE、标签闭合、`<div>` 嵌套匹配、脚本引用存在性 |
| 5 | ESLint 代码规范 | 基于 ESLint flat config 的代码风格和质量检查 |
| 6 | 跨文件引用检查 | 验证消息协议（action/type）前后端匹配、DOM 元素 ID 一致性 |

### 9.2 流水线架构

```
check.sh (Shell入口)
  ├── check  → scripts/check.js    (6项静态检查 + ESLint)
  ├── fix    → scripts/lint-fix.js  (ESLint --fix → check)
  └── watch  → scripts/watch.js     (文件监控 → 自动 fix)
```

### 9.3 使用命令

| 命令 | 功能 |
|------|------|
| `npm test` | 运行完整检查（等价 `npm run check`） |
| `npm run check` | 运行 6 项静态检查 |
| `npm run lint` | 仅运行 ESLint 检查 |
| `npm run lint:fix` | ESLint 自动修复 + 完整检查 |
| `npm run watch` | 启动文件监控模式（修改文件自动触发 lint:fix） |
| `bash check.sh check` | Shell 入口，运行完整检查 |
| `bash check.sh fix` | Shell 入口，自动修复 + 检查 |
| `bash check.sh watch` | Shell 入口，文件监控自迭代 |

### 9.4 自迭代流程 (watch 模式)

```
文件变更 → 500ms 防抖 → ESLint --fix → 6项检查 → 输出结果
                                    ↓ 失败
                              等待下次变更
```

监控文件列表：`background.js`、`options/options.js`、`options/options.html`、`manifest.json`

### 9.5 新增文件

| 文件 | 用途 |
|------|------|
| `package.json` | npm 项目配置，定义 scripts |
| `eslint.config.mjs` | ESLint flat config（Manifest V3 浏览器环境） |
| `scripts/check.js` | 核心检查脚本（6 项检查） |
| `scripts/lint-fix.js` | ESLint 自动修复 + 调用 check |
| `scripts/watch.js` | 文件监控 + 自动触发 lint:fix |
| `check.sh` | Shell 入口脚本 |

---

## 10. 安全与限制

| 方面 | 说明 |
|------|------|
| Cookie 安全 | Cookie 仅在 Service Worker 内部使用，不暴露给第三方 |
| 请求范围 | `<all_urls>` 权限允许请求任意 URL，但仅对用户配置的站点发起请求 |
| 超时控制 | 所有 fetch 请求均有 10 秒超时，防止长时间挂起 |
| 分页限制 | 最多扫描 15 页，防止无限循环 |
| 数据存储 | 所有数据存储在 `chrome.storage.local`，不上传到任何服务器 |

---

*文档生成时间：2026-05-13*