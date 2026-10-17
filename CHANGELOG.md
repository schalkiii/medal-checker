# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，所有显著变更均记录于此。

## [1.11] - 2026-10-18

### 新增

- 新增站点 sunnypt.top（赏金公会-荣誉勋章 `https://sunnypt.top/bounty?tab=renown`，内置站点 73 → 74）
- sunnypt.top 为 Next.js SPA：静态 HTML 是无数据空壳，勋章数据来自独立 API（`api.sunnypt.top`）。采用 API 直抓方案，不开标签页：
  - `GET https://sunnypt.top/api/auth/session`（带 Cookie）→ `data.accessToken`（JWT）
  - `GET api.sunnypt.top/api/v1/medals/list`（`Authorization: Bearer`，无需 Cookie）→ 勋章列表
  - `GET api.sunnypt.top/api/v1/medals/my` → 已拥有勋章；`GET api.sunnypt.top/api/v1/user/seed-bonus` → 贝利余额
- 新增 `scanSunnyptBounty()` / `parseSunnyptMedals()`：「可购买」判定复刻 Web 端按钮逻辑（售卖时间窗内 + 未拥有 + 有库存）；余额不足不排除（前端「魔力不足」筛选处理）；时间按 UTC+8 格式化与站点展示一致
- 新增 9 个 sunnypt 单元测试（background 152 → 161，全套 185 项）

### 技术决策

- SPA 站点接入优先级：先找数据 API（Network 面板 / performance API）→ 解决认证（Cookie / 会话 JWT / 页面令牌）→ 最后才开标签页渲染
- 经 Kimi WebBridge 读取用户登录态页面实证：页面无 XHR 数据请求外的其它通道，API 认证为 NextAuth JWT，Bearer 头充分（无 Cookie 返回 401）

## [1.10] - 2026-10-17

### 修复

- **zmpt.cc SPA 渲染失败导致漏扫**：原实现用固定 4 秒延时等待 SPA 渲染，实际渲染耗时不稳定导致读回空内容（debug 包中该页面 HTML 为空数组）；且 25 秒总超时路径不关闭标签页，每次扫描残留一个后台空标签。现改为轮询等待挂载点内容（每 800ms，最长 20s），总超时提升至 45s，所有退出路径均关闭标签页
- **`extractMedalsFromCards()` 容器匹配退化**：v1.7 起误将 v1.6 的泛化正则改回硬编码 `'<div class="medal-card '`（要求 class 后带空格），导致 `<div class="medal-card">`（hxpt/longpt）与 `class="medal-card" data-id=`（luckpt）等容器整体漏扫；同时按钮匹配要求 `class="btn buy"`，漏掉 `action-btn btn-primary buy`（hxpt）、`medal-action-btn-unified buy`（longpt）、`btn buy-action primary btn-buy`（luckpt）、`btn btn-primary buy-btn`（cspt）等变体
- **yemapt.org SPA 站点漏扫**：SPA 检测硬编码 `id="vite-app"` + `modulepreload`，无法识别 umi 应用（`id="root"`）壳页面
- **定时扫描（飞书推送）能力缺失**：`performScheduledScan()` 未走卡片/SPA 分支且分页逻辑与手动扫描不一致，导致定时推送遗漏大量勋章
- **分页 URL 拼接错误**：站点 URL 已带查询参数时（如 `totheglory.im/mall.php?cid=5`）拼接 `?page=N` 产生非法 URL
- **勋章链接无法直达所在分页**：链接回退逻辑在带查询参数的站点 URL 上误用 `?` 连接 `medal=` 参数

### 新增

- `isSpaShell()`：通用 SPA 壳检测（外部脚本 + 剥离 script/style 后几乎无可见文本），覆盖 Vite/umi 等壳形态，不误判普通页面与 Meta 跳转页
- `collectPageNumbers()` / `buildPageUrl()`：分页页码收集与 URL 拼接工具
- `scanSiteMedals()`：单站扫描流程（首页 + 全部分页 + SPA 回退），手动扫描与定时扫描共用
- `testAsync()`：异步测试 runner，修复同步 `test()` 包裹 async fn 导致断言永不执行的假通过问题

### 变更

- 分页抓取改为工作流式：收集分页条全部页码（含省略号折叠的中间页，翻页逐步发现），优先抓取最小页码保证列表有序，上限 20 页
- 分页索引约定自适应：0 索引站点（base=第0页）页码显示 N+1，1 索引站点显示 N；`?page=1` 与首页勋章名集合相同时自动去重并翻转假设
- 购买按钮判定泛化：class 含独立单词 `buy` 或文本恰为购买/購買；disabled 与"已经购买/已过可购买时间/需要更多魔力值"等状态按钮不计入
- 字段提取覆盖 7 种标签-值模式（detail-label/meta-label/stat-item/medal-detail-item/sale-time 等）+ data-\* 属性兜底；同一字段后者覆盖前者（hxpt"购买价"覆盖"定价"）
- `extractMedalsFromZmptNew()` 并入 `extractMedalsFromHtml()` 统一回退链
- chrome mock 扩展 `tabs.onUpdated` / `tabs.remove` / `scripting.executeScript`

### 测试

- 新增 30 个单元测试（SPA 壳检测 5、泛化卡片布局 10、SPA 渲染器 3、分页工具 7、单站扫描 5）
- 总计：background 152 + options 18 + 集成 6 = 176 项全部通过
- 基于 2026-10-17 真实调试包验证：可购买勋章从 38 个恢复至 198 个（新增 hxpt 60、luckpt 87、cspt 10、longpt 3）

## [1.9] - 2026-05-28

- 适配 zmpt.cc 新版 CSS Modules 布局（`extractMedalsFromZmptNew()`）

## [1.8] - 2026-05-27

- 新增 si-qi.xyz BEM 风格卡片布局支持（`extractMedalsFromSiqi()`）

## [1.7] - 2026-05-26

- 新增 zmpt.cc SPA 站点支持（chrome.tabs + scripting 注入）
- 新增 medal-item / hhanclub 布局提取器

## [1.6] - 2026-05-25

- 修复 hxpt.org 卡片布局勋章链接精度问题（URL 已有 query string 时使用 `&` 替代 `?`）

## [1.4] - 2026-05-24

- 卡片布局勋章解析引擎全面泛化，覆盖 6 个新站点

## [1.0] - 2026-05-23

- 首个正式版本：列式解析引擎、站点检测、Diff 模式、调试包导出
