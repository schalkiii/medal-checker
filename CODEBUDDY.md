# PT 勋章扫描器 — Agent 指南

Chrome MV3 扩展：扫描 69 个内置 PT 站点的勋章页，找出**当前真正可购买**的勋章。

## 跑起来

```bash
npm test                 # 单元 + DOM + 集成（263 项）
npm run check            # 静态检查流水线（完整性/manifest/语法/ESLint/跨文件引用）
npm run lint             # 仅 ESLint（单引号、分号、no-undef=error）
node scripts/analyze-html.js PT_Debug_*.json   # 分析导出的调试包
npm run test:regression  # 需自备根目录 PT_Debug_*.json，缺失时自动跳过
npm run snapshot -- PT_Debug_*.json   # 用调试包重建 tests/fixtures/snapshot.json 基线（必须带文件参数）
```

## 技术栈

MV3 Service Worker + 原生 JS（无构建、无框架、无依赖打包）；options 页原生 DOM；测试为 Node 手写 runner + jsdom。
**Service Worker 没有 DOM / DOMParser** —— 所有 HTML 解析必须用正则，不要引入 DOM 解析方案。

## 目录与约定

| 位置 | 职责 |
|---|---|
| `background.js` | 扫描引擎与全部提取器（单文件，按功能分区写注释） |
| `options/` | 选项页 UI 与逻辑（结果显示、过滤、Diff、配置） |
| `scripts/` | check / lint-fix / watch / analyze-html / build-snapshot |
| `tests/` | unit / integration / regression + `mocks/chrome-mock.js` |
| 文档 | README（用户向）、CODE_WIKI（架构）、SKILL（方法论与踩坑）、CHANGELOG（版本） |

- 注释、文档、commit message 一律中文。
- 新增/修改提取器必须同步 `tests/unit/background.test.js` 并更新 CHANGELOG。
- 手动扫描与定时扫描共用 `scanSiteMedals()`，改扫描逻辑不要只改一条路径。

## 站点适配三条路径（按代价从低到高选）

1. **API 直抓**（zmpt.cc、sunnypt.top、yemapt.org）：找站点 JSON 接口 + 认证方式，不开标签页。
2. **纯 HTML + 正则**：绝大多数 NexusPHP 站点。
3. **后台标签页渲染**：仅剩未适配 API 的 SPA（`isSpaShell()` 判定）。

「可购买」判定必须复刻站点前端按钮逻辑（余额/时间窗/已拥有等），不能只看按钮文字是否存在。

站点地址的存活判定必须核**正文特征**，不能只看 HTTP 状态码：域名停放页和站内「页面不存在」软 404 都可能返回 200（`hdpt.xyz`、`greatposterwall.com` 都是这样），而反爬 JS 挑战页（`?ch=1&js=<JWT>`）也不等于停站（`wukongwendao.top`）。只有 DNS 两次 ENOTFOUND 才是停站证据。

## 当前状态与下一步

- v1.15（manifest 版本已对齐）：时魔与勋章加成回本估算——`mybonus.php` 拆解表按列名前缀定位，乘数基数取「勋章加成」行的基础魔力（不含低保），263 项测试全绿（+46 解析计算 +7 前端展示）。
- v1.14：nova-medal-card 布局 + medal-item 送礼按钮顺序修复 + 表格名称 h1 修复，209 项测试全绿。
- `npm run check`：26 通过 / 0 警告 / 0 错误。引号规则按文件分治——`background.js` 双引号、`options/**` 单引号。`npm run lint` 只覆盖这两个交付文件，`tests/`、`scripts/` 不在其配置 env 内（Node 全局量会报 no-undef），不要把它们塞进 lint 命令。
- 测试子进程超时默认 180 秒（`PT_TEST_TIMEOUT` 可覆盖）；机器繁忙时整套 background 用例实测约 50 秒，别把超时当成断言失败。
- 待办：用户重载扩展后对三个 API 站点做线上验证。站点表已按 2026-11-07 全量复核（内置 69 站与油猴脚本合并去重成 112 个地址，逐个 DNS + HTTP + 正文特征）：无新增死站，6 个 ENOTFOUND 域名（joyhd / ecust.pp.ua / sanpro.pw / a4apt / pt.541542 / nex.jivon）维持移除，`wukongwendao.top` 仍在世；`greatposterwall` / `hdpt.xyz` 的移除判断正确，但两者 HTTP 都回 200。仍待核实：`icc2022.com` / `ptvicomo.net` TLS 握手被服务器中断、`yhpp.cc` 301 重定向死循环。
- 注意：扫描使用的是用户保存的 `sites` 配置，`DEFAULT_SITES` 仅用于「检测已登录站点」；域名迁移后需同步更新选项页里的已保存站点列表。
- 回归测试需自备根目录 `PT_Debug_*.json`（已 gitignore，当前快照来源为 `PT_Debug_2026-11-04.json`，130 页 / 18 个有勋章页 / 133 枚）。快照必须用 `extractMedalsForSite()` 生成与比对：URL 门控的 buycenter 布局若只走 `extractMedalsFromHtml()` 会被记成 0 枚（海棠实测 2 枚），缺失时自动跳过。
