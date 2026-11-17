# 审计报告（2026-11-17）

审计对象：PT 勋章扫描器 Chrome MV3 扩展（`main` @ `5dff31c`）
审计范围：全部源码、测试、脚本与文档；本次只做审计，不改代码。

## 一、现状描述

- 规模：源码 4 个 JS 文件（`background.js` 2159 行、`options/options.js` 682 行、`scripts/analyze-html.js` 414 行、`scripts/check.js` 251 行），前端页面 `options/options.html` 939 行；测试 5 个文件约 3650 行。
- 结构：单 Service Worker 承载扫描/解析/调度/推送；`options.js` 负责配置与渲染；`scripts/` 提供静态检查、快照生成、调试包分析与文件监控；测试分单元 / DOM / 集成 / 回归 / 浏览器（未接线）五层。
- 质量水平：核心解析器按站点布局分派，回退链清晰，注释记录了真实站点证据；265 项自动化测试 + 126 页回归快照；`npm run check` 26 项全绿。主要短板在「导入导出往返一致性」「分页路径与首页不一致」「回归只比 4 个字段」与文档行号引用过期。

## 二、问题清单

| ID | 位置 | 问题 | 严重度 | 影响范围 |
|----|------|------|--------|----------|
| A1 | `options/options.js` 导入逻辑（`#fileInput` change 回调，约 L348-L354）与导出逻辑（约 L366-L380） | 导入时无条件 `url.replace(/\/+$/,'') + '/medal.php'`；导出只剥 `/medal.php`。非 `medal.php` 路由（`hxpt.org/medals`、`rousi.pro/medals`、`ttg/mall.php?cid=5`、`sunnypt/bounty`、`yemapt` hash、`htpt/buycenter.php`）导入后全部变成错误地址 | 高 | 配置导入导出功能对 6 类站点直接失效，用户自备份无法恢复 |
| A2 | `background.js` `scanSiteMedals()` 分页循环（L1991） | 第 2 页起调用 `extractMedalsFromHtml()`，未走 `extractMedalsForSite()`；`buycenter.php` 这类由 URL 门控的布局分页后会解析为 0 | 中高 | 任何「非标准列序 + 有分页」站点的后续页漏报；与首页解析口径不一致 |
| A3 | `tests/regression/snapshot.test.js` L71-L84 | 详情比对只覆盖 `name/price/duration/bonus`，`stock/timeRange/medalId` 退化不会被发现 | 中 | 库存、可购买时间、勋章 ID 的解析回归可静默通过 |
| A4 | `manifest.json` permissions；`background.js` L2167-L2168 | 全量页面 HTML 写入 `chrome.storage.local`，但没有 `unlimitedStorage`；当前调试包 6.6MB 已接近 10MB 配额，`set` 失败又不检查 `lastError` | 中 | 站点/分页增长后调试包静默缺页，排查时拿不到证据 |
| A5 | `background.js` `setupAlarm()` L2258-L2268 | `scheduleConfig.time` 未校验；非法值产生 `NaN` 延迟传给 `chrome.alarms.create` | 低中 | 用户手改 storage 或旧格式配置时定时任务异常 |
| A6 | `background.js` L2181 | 扫描完成后直接 `chrome.runtime.sendMessage`，选项页已关闭时抛未捕获异常 | 低 | Service Worker 控制台报错，不影响数据 |
| A7 | `package.json` L9 `lint` 脚本 | 直接调用 `eslint`，依赖 `node_modules/.bin` 链接；本机 `.bin` 缺失时 `npm run lint` 直接失败（`npm run check` 内部已有兜底） | 低 | 开发体验与 CI 一致性；与「Lint 清零」规则冲突 |
| A8 | `tests/browser/extension.test.js` L1、`tests/run.js` L7-L11 | 顶层 `require('puppeteer')`，该依赖未安装；文件也未被 `npm test` 调度，长期处于「既跑不了也不报错」状态 | 低 | 浏览器层测试形同虚设；误删/误改无人发现 |
| A9 | `tests/unit/background.test.js` | `fetchWithTimeout`、`performScheduledScan`、`extractHourlyMagicFromText` 无直接用例 | 低 | 网络超时链路、定时扫描、文字兜底解析缺回归保护 |
| A10 | `CODE_WIKI.md`（18 处 `L###` 引用） | options.js 的函数/事件行号全部过期（如 `getMedalFingerprint` 实际 L78，文档写 L54；`readFileAsText` 实际 L786，文档写 L326） | 低 | 维护者按文档跳转会读错位置 |
| A11 | `background.js` `getColumnLayout()` L23-L48 | 先判 `% 10` 再判 `% 9`：9 列布局若单行含 10 枚（90 个 td）会被误判为 10 列 | 低 | 极少数非标准表格误解析；现有站点未触发 |

## 三、改进建议

**A1 导入导出往返一致**
- 做法：抽出 `normalizeImportUrl(url)`：仅当 `new URL(url).pathname` 为空或 `/` 时补 `/medal.php`，否则原样保留；导入映射改用它。同步在 `tests/unit/options.test.js` 增加导出→导入往返用例（含 `hxpt /medals`、`ttg mall.php?cid=5`、`yemapt #hash`）。
- 文件：`options/options.js`、`tests/unit/options.test.js`
- 验证：`node tests/unit/options.test.js`；手工导出后重新导入，文本框 URL 不变。

**A2 分页统一入口**
- 做法：`extractMedalsFromHtml(pageHtml)` → `extractMedalsForSite(pageHtml, pageUrl)`。
- 文件：`background.js`
- 验证：新增扫描流程用例（mock `fetch` 返回 buycenter 两页），断言第 2 页勋章被计入；`node tests/unit/background.test.js`。

**A3 回归比对补齐字段**
- 做法：详情比对加入 `stock/timeRange/medalId`。
- 文件：`tests/regression/snapshot.test.js`
- 验证：`node tests/run.js` 全绿（快照已含这些字段，不需要重建）。

**A4 调试包存储**
- 做法：`manifest.json` 增加 `unlimitedStorage`；`chrome.storage.local.set({ debugData }, cb)` 检查 `chrome.runtime.lastError` 并 `sendLog` 警告。
- 文件：`manifest.json`、`background.js`
- 验证：`npm run check` 校验 manifest 与权限引用；本地扫描后确认调试包页数完整。

**A5 定时配置校验**
- 做法：`/^\d{1,2}:\d{2}$/` + 范围校验，不合法直接 `return`。
- 文件：`background.js`、`tests/unit/background.test.js`（新增非法时间不建 alarm）
- 验证：`node tests/unit/background.test.js`。

**A6 消息发送保护**
- 做法：`scanResult` 的 `sendMessage` 包 `try/catch`（与 detectSites 一致）。
- 文件：`background.js`

**A7 lint 入口可运行**
- 做法：`lint` 改为 `node ./node_modules/eslint/bin/eslint.js background.js options/options.js`（与 `scripts/check.js` 的兜底一致）。
- 文件：`package.json`
- 验证：`npm run lint` 零 error。

**A8 浏览器测试诚实化**
- 做法：顶层 `require('puppeteer')` 改为 try/catch；缺依赖时打印「跳过（需 npm i -D puppeteer）」并以 0 退出；`package.json` 增加 `test:browser`。
- 文件：`tests/browser/extension.test.js`、`package.json`

**A9 补 3 组用例**
- `fetchWithTimeout`：超时 abort、正常清理定时器；
- `performScheduledScan`：无 webhook / 无站点直接返回；有站点时写入 `scanResults`；
- `extractHourlyMagicFromText`：命中「当前每小时…获取」、负数/缺失返回 null。
- 文件：`tests/unit/background.test.js`

**A10 文档行号去脆化**
- 做法：删除 `CODE_WIKI.md` 中 `L###` 行号引用，改用函数名/事件名定位。
- 文件：`CODE_WIKI.md`

## 四、优先级与并行性

| 批次 | 条目 | 并行性 | affected_files |
|------|------|--------|----------------|
| P0 | A1 | 可并行（与其余无交集） | `options/options.js`、`tests/unit/options.test.js` |
| P0 | A2 | 可并行 | `background.js`、`tests/unit/background.test.js` |
| P1 | A3 | 可并行 | `tests/regression/snapshot.test.js` |
| P1 | A4 | 与 A2/A5/A6 串行（同文件 `background.js`） | `manifest.json`、`background.js` |
| P1 | A5/A6 | 与 A2/A4 串行（同文件） | `background.js`、`tests/unit/background.test.js` |
| P1 | A7 | 可并行 | `package.json` |
| P2 | A8 | 可并行 | `tests/browser/extension.test.js`、`package.json`（与 A7 同文件，串行） |
| P2 | A9 | 与 A5 同文件，串行 | `tests/unit/background.test.js` |
| P2 | A10 | 可并行 | `CODE_WIKI.md` |

执行顺序建议：A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8 → A9 → A10，最后跑 `npm test` + `npm run lint` 并同步 CHANGELOG。
