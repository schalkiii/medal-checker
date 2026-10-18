# PT 勋章扫描器 — Agent 指南

Chrome MV3 扩展：扫描 75 个内置 PT 站点的勋章页，找出**当前真正可购买**的勋章。

## 跑起来

```bash
npm test                 # 单元 + DOM + 集成（200 项）
npm run check            # 静态检查流水线（完整性/manifest/语法/ESLint/跨文件引用）
npm run lint             # 仅 ESLint（单引号、分号、no-undef=error）
node scripts/analyze-html.js PT_Debug_*.json   # 分析导出的调试包
npm run test:regression  # 需自备根目录 PT_Debug_*.json，缺失时自动跳过
npm run snapshot         # 用调试包重建 tests/fixtures/snapshot.json 基线
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

## 当前状态与下一步

- v1.13：三站 API 直抓落地，200 项测试全绿，ESLint 0 error。
- 待办：用户重载扩展后做线上验证；`.trae/rules/skill.md` 是过期规则文档（含已被证伪的硬编码容器匹配写法），待清理。
