# 项目审计报告（2026-11-04）

> 审计对象：`c:\CommonTools\Edge\Ext\medal-checker-test`（PT 勋章扫描器，Chrome MV3 扩展）
> 审计依据：当前代码、2026-11-04 调试包（130 页）、线上存活探测（89 个域名）
> 审计范围：文档一致性、文档缺漏、架构、代码写法、测试覆盖、测试严谨性、工程规范

---

## 1. 现状描述

- **规模**：`background.js` 2086 行（扫描引擎 + 全部提取器）；`options/options.js` 选项页逻辑；`scripts/` 下 check/lint-fix/watch/analyze-html/build-snapshot 等工具；`tests/` 下 unit/integration/regression/browser 四类测试。
- **结构**：单 Service Worker（无构建、无框架、无打包依赖）；扫描入口 `scanSiteMedals()` 统一手动/定时两条路径；站点适配分三条路径（API 直抓 / HTML 正则 / 后台标签页渲染）。
- **质量水平**：209 项自动化测试全绿；`npm run check` 26 通过 / 0 警告 / 0 错误；回归快照覆盖 130 页、131 枚勋章；文档四件套（README / CODE_WIKI / SKILL / CHANGELOG）+ CODEBUDDY 规则文件齐备。
- **站点规模**：`DEFAULT_SITES` 清理前 74 条、清理后 **69 条**（文档曾误记 75；v1.14 已按存活探测移除 6 个失效站点并替换 1 个域名）。

---

## 2. 问题清单

### 2.1 调试包与适配（本次已修复）

| # | 位置 | 问题 | 严重程度 | 影响范围 |
|---|------|------|---------|---------|
| A1 | `background.js` `extractMedalsFromMedalItems()` | 取卡片内第一个 `data-id` 按钮；hdkyl.in / pt.novahd.top 的「赠送」排在「购买」之前，整卡被按赠送跳过 | 高 | 两站可购买勋章全部漏报（实测各 2 枚） |
| A2 | `background.js` 提取回退链 | 无 `nova-medal-card` 布局支持（pt.novahd.top：`article.nova-medal-card` + `dt`/`dd` + `nova-medal-sale`） | 高 | pt.novahd.top 全站 0 结果 |
| A3 | `background.js` `extractMedalsFromHtml()` | 名称单元格 `<h1>名称</h1>描述……` 时，`extractTdText` 折叠换行导致首行截断失效，描述被并入名称 | 中 | hdclone / kamept / crabpt 等站名称严重超长，影响 Diff 与展示 |
| A4 | `scripts/analyze-html.js` | 缺少 nova 布局检测分支，分析调试包时无法识别该布局 | 低 | 排查效率 |

> 以上 4 项已在 v1.14 修复：新增 9 个单元测试，快照重建并回归 130/130 通过。

### 2.2 调试包可诊断性（未修复，建议）

| # | 位置 | 问题 | 严重程度 | 影响范围 |
|---|------|------|---------|---------|
| B1 | `options/options.js` 调试包导出（约 L541） | 导出对象只有 `exportVersion / timestamp / dateStr / pages[{url,html}]`，**不含扩展版本、站点配置快照、扫描日志**。本次调试包含 15 个当前代码已不存在的域名、缺少 9 个当前站点，且 zmpt 保存的是 HTML（旧版行为），无法判断出自哪个构建 | 高 | 误导排查方向；无法复现“当时用的是哪版代码/站点表” |
| B2 | `background.js` 扫描循环（约 L1850）与 `pageHtmls` 结构 | 页面只有 `url/html`，**没有 HTTP 状态码/失败原因**；请求失败时 `html=""`，调试包无法区分「站点关闭」「Cookie 失效」「403/CF 挑战」「超时」 | 高 | 8 个空页面只能靠人工逐个复测；本次审计需额外做 89 域名存活探测 |
| B3 | 全项目 | 无「站点下线/改域名」的处置流程（何时从 `DEFAULT_SITES` 移除、如何记录替换域名） | 中 | 站点表会持续积累死链，扫描时间被浪费 |

### 2.3 站点存活（需用户决策）

**已实质关闭 / 域名失效（已按用户确认清理，v1.14）**

| 站点 | 证据（2026-11-04 探测） | 处置 |
|------|------------------------|------|
| `www.momentpt.top` | 返回告别页「Moment · 山水有相逢 / 故事就写到这里吧」，站点已停运 | 已移除 |
| `hdvideo.one` | `ENOTFOUND`（DNS 不解析）；同域生态的 `hdvideo.top` 正常在线（调试包内有 16KB 登录页） | 已替换为 `hdvideo.top` |
| `raingfh.top` | `ENOTFOUND` | 已移除 |
| `leaves.red` | `ECONNREFUSED` | 已移除 |
| `hdpt.xyz` | `ECONNRESET` | 已移除 |
| `greatposterwall.com` | `/medal.php`、`/medals.php`、`/mall.php`、`/medal_center.php` 全部返回「页面不存在」（登录态调试包同样如此） | 已移除（站点无此勋章页） |

**需二次核实（先保留）**

| 站点 | 证据 | 说明 |
|------|------|------|
| `zrpt.cc` | TLS 证书链校验失败（`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`） | 可能是本机证书库问题，需浏览器实测 |
| `www.icc2022.com` / `ptvicomo.net` | 反广告拦截跳转页（`Redirecting...`）+ Node 证书失败 | 逻辑上存活，自动化抓取受阻 |
| `pt.gtkpw.xyz` / `www.yhpp.cc` | 连接超时 | 调试包中 `pt.gtkpw.xyz` 曾成功返回 11KB，疑为临时/地域问题 |
| `1ptba.com` / `www.52movie.top` / `www.hitpt.com` / `piggo.me` / `ubits.club` / `audiences.me` / `zmpt.cc` | Cloudflare 403「Just a moment...」 | 站点在线，但服务端 fetch 易被挑战拦截；zmpt 走 API 分支不受页面影响 |

**仅存在于调试包、当前代码已无（无需处理）**：`share.ilolicon.com`、`pt.keepfrds.com`、`tracker.ldo.pics`、`www.ptlover.cc`、`ptlao.top`、`pt.cdy.pics`、`longpt.org`、`pt.hdclone.top`、`pt.vclib.online`、`pt.daxiangjiao.org`、`pt.1ctrl.cn`、`lp-bits.com`、`hdvideo.top`、`audiences.me` 等。

### 2.4 架构与代码写法（未修复，建议）

| # | 位置 | 问题 | 严重程度 | 影响范围 |
|---|------|------|---------|---------|
| C1 | `background.js` 各专用提取器（medal-item / hhanclub / si-qi / nova / zmptNew） | 5 处重复实现「按 `<div>` 深度计数切容器」；新增一种布局就要再抄一遍，易出现 article/div 混算（nova 已需同时统计 `article`+`div`） | 中 | 维护成本与漏扫风险 |
| C2 | `background.js` `extractMedalsFromHtml()` | 回退链为硬编码顺序（pterclub → cards → hhanclub → medal-item → si-qi → nova → zmptNew），新增布局需改入口函数 | 低 | 可维护性 |
| C3 | `background.js` 标准表格路径 | 只判断 `value="购买"`，未校验 `disabled`；若站点用「禁用但仍显示购买」的按钮会产生假阳性（本次调试包未出现该形态） | 低 | 潜在假阳性 |
| C4 | `background.js` 扫描分支 | API 站点用 URL 子串路由（`siteUrl.includes("zmpt.cc/medal.php")` 等），域名/路径稍变即静默回落 HTML 路径 | 中 | 路由脆弱性 |

### 2.5 测试覆盖与严谨性（未修复，建议）

| # | 位置 | 问题 | 严重程度 | 影响范围 |
|---|------|------|---------|---------|
| D1 | `tests/regression/snapshot.test.js`（L72-L76） | 快照只对比 `name/price/duration/bonus`，**不校验 `stock/timeRange/medalId`**；字段回退/单位变化不会被发现 | 中 | 回归盲区 |
| D2 | `tests/regression/snapshot.test.js`（L29-L35） | 依赖项目根目录外部 `PT_Debug_*.json`，缺失时静默跳过；CI/新环境等于没有回归 | 中 | 回归可能长期不执行 |
| D3 | `tests/unit/background.test.js` | 部分断言用 `name.includes(...)`，名称被描述污染时仍会通过（本次 A3 即此类漏检） | 中 | 弱断言放过真实缺陷 |
| D4 | 全项目 | 缺「提取器输入为真实站点 HTML 片段」的 fixture 化用例（目前多为手工构造的最小 DOM） | 低 | mock 过度简化可能掩盖真实结构差异 |

### 2.6 文档一致性（本次已修正 + 待核实）

| # | 位置 | 问题 | 状态 |
|---|------|------|------|
| E1 | `SKILL.md` | 「24 项静态检查 / 52 项自动化测试 / 69 个站点」过期 | 已修正为 26 / 209 / 74 |
| E2 | `README.md` | 「74 项自动化测试 + 97 站点回归快照」「~1300 行」过期 | 已修正为 209 / 130 / ~2100 |
| E3 | `README.md`、`SKILL.md`、`CODEBUDDY.md` | 站点数误记 75（实际 74） | 已修正 |
| E4 | `CHANGELOG.md` v1.13 | 「内置站点 74 → 75」与代码事实不符 | 在 v1.14 条目中注明误记 |
| E5 | `SKILL.md` L223 | Kimi WebBridge 路径写作 `~/.codebuddy/skills/kimi-webbridge`，本机实际为 `~/.trae-cn/skills/kimi-webbridge` | 待核实（跨工具环境差异） |
| E6 | `tests/regression/snapshot.test.js` L8 | 横幅硬编码「97 站点」 | 已修正为不带数字 |
| E7 | `CODE_WIKI.md` | 行号区间标注（如 `L175-L186`）随代码增长漂移 | 待核实（建议改为函数名索引） |

---

## 3. 改进建议

### 建议 1（高，可并行）：调试包补齐可诊断元数据（对应 B1/B2）
- **做法**：`background.js` 扫描时按站点记录 `{ url, html, status, error, usedApi, pageCount }`；`debugData` 增加 `version: chrome.runtime.getManifest().version`、`sites: DEFAULT_SITES`（或当前配置）、`logs`（scanLog 摘要）。`options/options.js` 导出时原样带上。
- **文件**：`background.js`（`scanSiteMedals` 返回值、扫描循环、`debugData` 构造）、`options/options.js`（导出对象）、`tests/unit/background.test.js`。
- **验证**：扫描后导出调试包，确认含 `version/status/error/logs`；空页面能直接看出 403/404/超时原因。

### 建议 2（高，已完成）：清理死站点（对应 2.3）
- **已执行（v1.14）**：删除 `momentpt.top`、`raingfh.top`、`leaves.red`、`hdpt.xyz`、`greatposterwall.com`；`hdvideo.one` 替换为 `hdvideo.top`；`DEFAULT_SITES` 74 → 69，文档计数同步。
- **验证**：`npm test` 全绿（209 项 + 回归 130/130 + 检查 26/0/0）。

### 建议 3（中，可并行）：抽取容器切片公共函数（对应 C1）
- **做法**：新增 `extractTagBlocks(html, tagName, classKeyword)`，统一处理 `<div>`/`<article>` 深度计数；让 medal-item / hhanclub / si-qi / nova / zmptNew 复用。
- **文件**：`background.js`、`tests/unit/background.test.js`。
- **验证**：209 项测试全绿 + 130 页快照回归零差异（纯等价重构）。

### 建议 4（中）：加强回归断言与执行率（对应 D1/D2）
- **做法**：快照对比增加 `stock/timeRange/medalId`；`tests/run.js` 在缺失调试包时输出醒目提示（不阻断），并允许用 `tests/fixtures/snapshot-pages/` 内置样例替代外部包。
- **文件**：`tests/regression/snapshot.test.js`、`tests/run.js`。
- **验证**：故意改一个字段的提取逻辑，回归应失败；无调试包时提示清晰。

### 建议 5（低）：表格购买按钮增加禁用态校验（对应 C3）
- **做法**：标准表格路径对 `actionTd` 内的购买按钮同时要求非 `disabled`。
- **文件**：`background.js`、`tests/unit/background.test.js`。
- **验证**：构造「disabled + value=购买」用例应为 0；快照回归不变。

### 建议 6（低）：文档事实核对（对应 E5/E7）
- **做法**：把 `SKILL.md` 的 Kimi 路径改为按环境探测；`CODE_WIKI.md` 行号标注改为函数名索引。
- **文件**：`SKILL.md`、`CODE_WIKI.md`。
- **验证**：按文档中的路径/函数名可实际定位。

---

## 4. 优先级与并行性

| 优先级 | 建议 | 可并行 | 依赖 |
|--------|------|--------|------|
| P0 | 建议 1（调试包元数据） | 是（与建议 3/4/5 文件不冲突，可同批不同 agent） | 无 |
| P0 | 建议 2（死站点清理） | 是 | **已完成（v1.14）** |
| P1 | 建议 3（容器切片复用） | 是（纯 background.js 重构，勿与建议 5 同改同一段） | 建议 5 先/后二选一 |
| P1 | 建议 4（回归断言） | 是（只动 tests/） | 无 |
| P2 | 建议 5（禁用态校验） | 否（与建议 3 同文件同区域，需串行） | 建议 3 之后 |
| P2 | 建议 6（文档核对） | 是 | 无 |

> 本次已完成的修复（A1–A4）与文档同步（E1–E4、E6）不在此清单内，见 CHANGELOG v1.14。
