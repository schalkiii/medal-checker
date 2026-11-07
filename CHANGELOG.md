# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，所有显著变更均记录于此。

## [未发布] - 2026-11-07

### 修复：回归基线漏计 URL 门控的 buycenter 布局

- 新增 `extractMedalsForSite(html, siteUrl)`：把「buycenter.php 走独立列序、其余走通用表格」的分流收成唯一入口，`scanSiteMedals()` 与回归脚本、快照生成脚本共用
- 问题背景：回归脚本只调 `extractMedalsFromHtml(page.html)`，而海棠 `buycenter.php` 由 URL 门控走另一套解析，于是该页在基线里长期记 0 枚——扩展运行时实际能取到 2 枚（「小肥羊徽章」「介个就是爱情」），这两枚一直没有回归保护
- 重建快照：130 页 / **18 个有勋章页 / 133 枚**（原 17 页 / 131 枚；其中 80 个站点首页 104 → **106 枚**）。首页数与油猴脚本基于同一调试包的比对结论（106 枚）就此对齐
- 新增 1 项单元测试（URL 分流），总计 263 项

### 核对：站点表全量存活复核

内置 69 站与油猴脚本合并去重成 112 个地址，逐个做 DNS + HTTP + 正文特征探测：

- 110 个唯一域名全部可解析，ENOTFOUND 为 0；2026-11-04 清理的 6 个域名（joyhd / ecust.pp.ua / sanpro.pw / a4apt / pt.541542 / nex.jivon）两次解析仍为 ENOTFOUND，维持移除
- `greatposterwall.com/medal.php` 返回 200 但正文是站内「页面不存在」（软 404），`hdpt.xyz` 返回 200 但已是域名停放待售页——v1.14 的移除判断正确，但只看状态码会误判，判定一律以正文特征为准
- `wukongwendao.top` 仍在世：域名可解析，页面返回反爬 JS 挑战（`?ch=1&js=<JWT>`），不属于停站
- 403 / 522 / 连接重置的一律保留：那是 Cloudflare 拦匿名请求或本机代理噪声（同一批里 `carpt.net` 也会 ECONNRESET，而该站确定在位）
- `icc2022.com` / `ptvicomo.net` 本机 TLS 握手被服务器中断（`schannel: server closed abruptly`，连首页都取不到响应），按用户确认停运处理，从 `DEFAULT_SITES` 移除（**内置站点 69 → 68**）
- `yhpp.cc` 的 `medal.php` 返回 301 且 `Location` 指向自身（无限重定向），按用户确认停运处理，从 `DEFAULT_SITES` 移除（**内置站点 68 → 67**）

### 文档

- `CODEBUDDY.md`：`npm run snapshot` 更正为必须带调试包参数；补「存活判定看正文特征」约束与 2026-11-07 复核结果

## [1.15] - 2026-11-06

### 新增：时魔与勋章加成回本估算

按「24 小时持续做种」判断某枚勋章的魔力加成能否赚回票价，数据取自各站的魔力值明细页 `mybonus.php`。

- **抓取时机**：`scanSiteMedals()` 只在**该站确有可购买勋章**时，才由 `withHourlyMagic()` 多发一次时魔请求；`buildBonusUrls()` 只取 origin 再拼接，yemapt 的 hash 路由与 sunnypt 的查询串不会拼出非法地址。候选有两套地址（`mybonus.php` → 解析不到再试 `mybonus_new.php`），海棠 PT 把兑换商店与魔力统计分家在这两页
- **乘数基数用站点自己的口径**：取拆解表「勋章加成」行的**基础魔力**，而不是总时魔——站点算勋章奖励时不含"低保"（按做种数计的固定收益）。carpt 实测总时魔 149.285 中只有 99.285 参与勋章加成（用总时魔会把收益高估 50%），cyanbug 的差值更是 1000，且各站差值无法统一推导，只能读不能算
- **`extractHourlyMagic()` 按列名前缀定位**，不写死下标：nova 在「基本奖励」与「勋章加成」之间插入做种奖励/等级奖励加成等额外行，discfan 表头为繁体「基礎魔力/系數/獲得魔力」，zmpt 币种叫"电力"；「合计」列取数据行末位（个别站点表头省略该格，按表头长度推算会串列）
- **老版正文页兜底** `extractHourlyMagicFromText()`：kamept 等无拆解表的页面读「你当前每小时能获取X个魔力值」；锚定结论句，避免抓到公式说明里的"做种每小时将得到…0.5个魔力值"
- **`computeMedalPayback()`** 输出每小时增量魔力、窗口内增量、回本时长与能否回本；加成解析不出百分号（或价格不可解析、时魔缺失）时返回 null 而不是猜 0；加成 ≤ 0（站点存在 `-5%`/`-100%` 负加成勋章）不给回本时长
- **前端**：站点头部按余额同款千分位显示 `⚡ 时魔 7,035.79`（取不到标 `⚡ 时魔未知`），每条勋章显示 `✓ 24h 内回本`（绿）、`⏳ 回本 169 天` 或 `⏳ 无法回本`；勋章加成行缺失而退回总时魔估算时标 `≈`，明确口径偏乐观
- **回本时长一律折算成「天」**（≥10 天取整带千分位、<10 天留一位小数）：11190 小时这种数字对做种决策没有直觉意义；24 小时内可回本的已由 ✓ 分支接走，故不会出现「0.1 天」
- **适配好学（hxpt.org）改版**：勋章图鉴从 `medal.php` 迁到 `/medals`（旧路径已 404），新布局是 Next.js 服务端直出的 `article.mcard` 卡片，字段在 `ul.spec` 的 `<li><span>标签</span><b>值</b></li>` 里。新增 `extractMedalsFromHxptCards()` 并入回退链末尾（不影响既有布局）；「购买」是 `button.btn-primary`，而「仅授予」「已领取」是 `span`、「佩戴」表示已获得，因此只认文本恰为 购买/購買 的 button。真实页面实测取到 61 枚可购买勋章
- **渲染型时魔来源**：好学的「预计时收益」不写在静态 HTML 里（静态只有 i18n 标签文案），必须后台标签渲染后读取。新增 `RENDER_HOURLY_PAGES` + `extractRenderedHourlyMagic()`，静态 `mybonus.php`/`mybonus_new.php` 都取不到时才走渲染兜底；同一页的「当前余额」顺带补进 `balance`（好学勋章页本身没有余额，此前「魔力不足」筛选对该站一直无效），已有余额不被覆盖
- 内置站点表 `DEFAULT_SITES` 里好学条目改为 `https://www.hxpt.org/medals`；**已保存的站点列表需重新点「检测站点 Cookie」或手工改**，因为扫描用的是 storage 里的 `sites`，`DEFAULT_SITES` 只驱动检测
- **时魔 0 按事实保留**：此刻未做种的站点会报 0，据此判为无法回本，不当作解析失败（`extractHourlyMagicFromText` 只在负数/非数值时放弃）
- **两条扫描链路一致**：手动扫描与定时扫描都携带 `hourly`，避免选项页渲染历史结果时显示时有时无；时魔请求失败只降级为 `hourly = null`，不影响勋章结果

### 工程

- 新增 53 项测试（46 项解析与计算单测 + 7 项前端展示用例），总计 **262 项**全部通过
- `tests/run.js` 的每个测试子进程原本写死 30 秒超时：本机实测同一套用例在机器繁忙时要 51 秒（HEAD 基线同样如此），子进程被 kill 后只剩一句红字、既不报用例结果也不说原因。改为默认 180 秒（可用 `PT_TEST_TIMEOUT` 覆盖），并在超时/被信号终止时明确打印原因
- `npm run lint` 零 error / 零 warning；`npm run check` 全部通过；回归快照 130 页无变化（新提取器带结构特征自守卫，不抢既有布局的解析）
- 校验方式：在页面内 `fetch(location.href).then(r => r.text())` 取原始响应字节落盘，再喂给解析器（`document.outerHTML` 已被浏览器补标签、插 `tbody`，不能作为正则解析的用例）

### 文档

- README 新增「时魔与回本估算」章节（公式、口径、边界），并修正智能过滤计数（实际 4 种：永久/限时/正收益/魔力不足，此前记为 3 种）
- CODE_WIKI 数据流补第 9 步「时魔回本」并修正重复的序号；SKILL 增补「换算口径对齐站点自身计算」「附属数据源拿不到就不给结论」两条方法论与 5 条常见陷阱

## [1.14] - 2026-11-04

### 修复（依据 2026-11-04 调试包定位）

- **hdkyl.in / pt.novahd.top 漏报可购买勋章**
  - `extractMedalsFromMedalItems()` 原先取卡片内第一个 `data-id` 按钮；两站按钮顺序为「赠送」在前、「购买」在后，整卡被按赠送跳过。改为优先选取 value 恰为 `购买`/`購買` 且未禁用的按钮，找不到时保留旧兜底口径
  - 新增 `extractMedalsFromNovaCards()`：适配 pt.novahd.top 的 `article.nova-medal-card` + `dl.nova-medal-meta`（`dt`/`dd`）+ `.nova-medal-sale` 布局
  - `CARD_FIELD_PATTERNS` 增加通用 `dt`/`dd` 键值对模式
- **标准表格勋章名称混入描述**（hdclone / kamept / crabpt）
  - 名称单元格为 `<h1>名称</h1>描述……`，`extractTdText` 折叠换行后首行切分失效，导致名称包含整段描述；改为优先取 `<h1>` 内容

### 工程

- `scripts/analyze-html.js` 新增 nova-medal-card 布局检测分支
- 用 2026-11-04 调试包重建 `tests/fixtures/snapshot.json`（130 页 / 131 枚 / 17 个有勋章站点）
- 新增 9 个单元测试（礼物按钮顺序、nova 布局、名称纯净性），总计 209 项全部通过
- `npm run check`：26 通过 / 0 警告 / 0 错误

### 站点清理

- 依据 2026-11-04 存活探测（89 个域名）移除已实质失效的站点，内置站点 74 → 69：
  - `momentpt.top`（停运告别页）、`raingfh.top`（DNS 不解析）、`leaves.red`（拒绝连接）、`hdpt.xyz`（连接重置）、`greatposterwall.com`（勋章页 404）
  - `hdvideo.one`（DNS 不解析）替换为在线的 `hdvideo.top`
- **站点域名迁移**：`zrpt.cc` → `naturept.top`、`pt.gtkpw.xyz` → `pt.gtk.pw`（旧域名已不可用，用户确认新域名）
- 证书异常（`icc2022.com` / `ptvicomo.net`）与超时（`yhpp.cc`）站点证据不足，保留并在审计报告中标记待核实

### 文档

- README / CODE_WIKI / SKILL / CODEBUDDY 同步 nova 布局与测试数量；修正 SKILL 中过期的站点数与检查项数
- **修正内置站点计数**：清理前 `DEFAULT_SITES` 实际为 74 个条目（README/SKILL/CODEBUDDY 曾误记 75），清理后为 69 个

## [1.13] - 2026-10-18

### 新增

- **新增站点 yemapt.org**（我的成长-徽章 `#/user/growth?tab=badge`，内置站点 74 → 75）——此前该站点从未加入 DEFAULT_SITES，实际从未被扫描过
- `scanYemaptBadges()` / `parseYemaptBadges()`：API 直抓 + **条件全满足**口径（方案 A），不开标签页
  - 数据源：`/api/badge/fetchBadgeList`（全部 42 个徽章，DOM 只渲染当前分组的 6 个）+ `/api/consumer/fetchSelfDetail`（等级/积分/上传下载/邀请/有效种子/做种）+ `/api/consumer/fetchCheckInPageInfo`（连续签到天数）
  - 逐项校验 9 类条件 + 兑换时间窗 + 数量上限（`numLimit` 与 `globalHasNum`）
  - 已获得（`has: true`）不报

### 技术要点

- **站点不做前端条件校验**：源码实证「立即兑换」按钮恒可用（`description:"兑换前，请先确认是否满足兑换条件" / okText:"我确认满足"`），服务端才校验——因此按钮状态不能作为可兑换依据
- **条件值单位**：`promotionUploadSize` / `promotionDownloadSize` 条件为**字节**（如"上传100GB纪念"= 107374182400），非管理端表单标注的 GB
- `parseWallClockTime()` 由 zmpt 的墙钟解析提取为通用函数（UTC+8），zmpt / yemapt 共用
- 调试包保存徽章接口原始 JSON

### 测试

- 新增 7 个 yemapt 单元测试（覆盖 11 类排除场景：积分/等级/签到/上传/已拥有/邀请/种子/截止时间/数量兑完/注册天数）
- 总计：background 176 + options 18 + 集成 6 = 200 项全部通过
- 线上验证：42 个徽章中当前 0 个条件全满足（连续签到 5 天 / 有效种子 0 / 做种 0 / 上传 243GB），与站点实际状态一致

### 工程收尾

- **扩展版本随发布号递增**：`manifest.json` 1.0 → 1.13
- **检查流水线归零**：`npm run check` 由 24 通过/14 警告 → **26 通过 / 0 警告 / 0 错误**
  - ESLint 步骤改用本地入口 `node_modules/eslint/bin/eslint.js`（`.bin` 链接缺失时 `npx` 会报找不到命令，产生 9 条无关 npm 警告）
  - 引号规则按文件分治：`background.js` 双引号、`options/**` 单引号（此前统一要求单引号，与实际风格不符，产生 412 条 `quotes` 警告）；`options.js` 残留 11 处双引号字符串同步改为单引号
  - 跨文件引用检查修正三处误报：`message.type !== 'x'` 的取反写法未被识别（`detectProgress`）、飞书载荷 `msg_type` 被当成消息类型（`post`）、HTML 内联脚本中的 `getElementById('themeToggle')` 未被统计
- **清理过期资产**：删除 `.trae/rules/skill.md`（Trae 遗留规则文档，无 v1.10+ 内容且教了已被证伪的硬编码容器匹配写法）、其他工具内部目录 `.workbuddy/`（已加入 `.gitignore`）
- **回归测试门控修复**：`tests/run.js` 与 `snapshot.test.js` 各写死不同日期（`2026-05-19` / `2026-05-23`）导致永不运行，改为自动发现任意 `PT_Debug_*.json`，缺失时明确提示跳过
- 文档事实修正：CODE_WIKI 移除不存在的 DOMParser 解析描述、补齐 manifest 权限声明、分页上限 15→20；新增 `CODEBUDDY.md` 项目规则文件

## [1.12] - 2026-10-18

### 变更

- **zmpt.cc 改为 API 直抓**：Cookie 直调 `/javaapi/user/queryAllMedals`，不再每次扫描都开后台标签页渲染
- `parseZmptApiMedals()` 复刻站点前端按钮判定逻辑（源自 `BWLmrAUr.js` 源码）：未拥有（`userMedalsVO`/`hasMedal`）→ 售卖时间窗内 → `seedBonus` ≥ 价格；`inventory` 展示为 `inventory || "无限"`，不参与可买性判定
- `parseZmptTime()` 按 UTC+8 解析墙钟时间串（`Date.UTC(...) - 8*3600`），不依赖运行机器时区
- 调试包对 API 站点改为保存接口原始 JSON（比渲染后 HTML 更利于排查字段变化）
- 测试中 SPA 渲染用例改用中性域名，避免被新增的 API 分支拦截

### 调研（未实施）

- **yemapt.org** 同样存在数据 API `/api/badge/fetchBadgeList`（返回全部 42 个徽章的完整条件与拥有状态，优于 DOM 只渲染当前分组的 6 个），但「立即兑换」按钮的可用性依赖 10+ 项用户数据条件（连续签到/上传下载量/等级/注册天数/邀请达标数/有效种子数/做种数/积分/起兑与截止时间），未能从压缩产物中隔离出站点判定逻辑，暂保留标签页渲染方案；现有提取器只认「购买」按钮，yemapt 实际仍为 0 结果，待产品口径明确后再实现

### 测试

- 新增 8 个 zmpt API 单元测试（使用 2026-10-18 真实接口响应作 fixture）
- 总计：background 169 + options 18 + 集成 6 = 193 项全部通过

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
