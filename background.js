const getCookieDomain = (url) => {
  try {
    const u = new URL(url);
    const parts = u.hostname.split(".");
    return parts.length > 2 ? `.${parts.slice(-2).join(".")}` : u.hostname;
  } catch {
    // Handle URLs without protocol
    if (url.includes("/")) return url.split("/")[0];
    return url;
  }
};

const fetchWithTimeout = (url, options = {}, timeout = 10000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
};

const getColumnLayout = (tdsLength) => {
  if (tdsLength <= 0) return null;
  if (tdsLength % 10 === 0)
    return {
      stride: 10,
      actionIdx: 8,
      nameIdx: 2,
      priceIdx: 6,
      durationIdx: 4,
      bonusIdx: 5,
      stockIdx: 7,
      timeIdx: 3,
    };
  if (tdsLength % 9 === 0)
    return {
      stride: 9,
      actionIdx: 7,
      nameIdx: 1,
      priceIdx: 5,
      durationIdx: 3,
      bonusIdx: 4,
      stockIdx: 6,
      timeIdx: 2,
    };
  return null;
};

const extractMedalsFromHtml = (html) => {
  const medals = [];
  const rows = html.match(/<tr[\s\S]*?(?=<tr|$)/gi) || [];

  for (const row of rows) {
    const tds = [];
    const tdRegex = /<td[^>]*>[\s\S]*?<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(row)) !== null) {
      tds.push(tdMatch[0]);
    }

    const layout = getColumnLayout(tds.length);
    if (!layout) continue;

    for (let i = 0; i + layout.stride - 1 < tds.length; i += layout.stride) {
      const group = tds.slice(i, i + layout.stride);
      const actionTd = group[layout.actionIdx] || "";
      if (
        !actionTd.includes('value="购买"') &&
        !actionTd.includes('value="購買"')
      )
        continue;

      const medalIdMatch = actionTd.match(/name="medal"\s+value="(\d+)"/);
      const medalId = medalIdMatch ? medalIdMatch[1] : "";

      const nameText = extractTdText(group[layout.nameIdx] || "");
      const nameH1 = nameText.match(/^(.+?)(?:\n|$)/);
      const name = nameH1 ? nameH1[1].trim() : "未知勋章";

      const price = extractTdText(group[layout.priceIdx] || "").trim();

      const durationRaw = extractTdText(group[layout.durationIdx] || "").trim();
      const duration = durationRaw === "不限" ? "不限" : durationRaw;

      const bonus = extractTdText(group[layout.bonusIdx] || "").trim();
      const stock = extractTdText(group[layout.stockIdx] || "").trim();

      const timeRaw = extractTdText(group[layout.timeIdx] || "").trim();
      const timeRange = timeRaw === "不限 ~ 不限" ? "不限" : timeRaw;

      medals.push({ name, price, duration, bonus, stock, timeRange, medalId });
    }
  }

  if (medals.length === 0) {
    const pterclubMedals = extractMedalsFromPterclub(html);
    if (pterclubMedals.length > 0) return pterclubMedals;

    const cardMedals = extractMedalsFromCards(html);
    if (cardMedals.length > 0) return cardMedals;

    const hhanclubMedals = extractMedalsFromHhanclub(html);
    if (hhanclubMedals.length > 0) return hhanclubMedals;

    const medalItemMedals = extractMedalsFromMedalItems(html);
    if (medalItemMedals.length > 0) return medalItemMedals;

    const siqiMedals = extractMedalsFromSiqi(html);
    if (siqiMedals.length > 0) return siqiMedals;

    // zmpt.cc 新版 CSS Modules 布局（经 SPA 渲染后的 DOM）
    const zmptNewMedals = extractMedalsFromZmptNew(html);
    if (zmptNewMedals.length > 0) return zmptNewMedals;
  }

  return medals;
};

const extractMedalsFromBuyCenter = (html) => {
  const medals = [];
  const rows = html.match(/<tr[\s\S]*?(?=<tr|$)/gi) || [];

  for (const row of rows) {
    const tds = [];
    const tdRegex = /<td[^>]*>[\s\S]*?<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(row)) !== null) {
      tds.push(tdMatch[0]);
    }

    if (tds.length < 6) continue;

    const actionTd = tds[5] || "";
    if (!actionTd.includes("交换") || actionTd.includes("disabled")) continue;

    const nameHtml = tds[1] || "";
    const nameText = extractTdText(nameHtml);

    if (nameText.length < 10 || nameText === "简介") continue;

    const markerIdx = nameText.indexOf(" ⠀");
    const name =
      markerIdx > 0 ? nameText.substring(0, markerIdx).trim() : nameText;

    const price = extractTdText(tds[4] || "").trim();

    const stock = extractTdText(tds[2] || "").trim();

    const durationMatch = nameText.match(/(\d+)\s*天|永久/);
    const duration = durationMatch ? durationMatch[0] : "";

    const timeMatch = nameText.match(/可购买时间:\s*([^)]+)/);
    const timeRange = timeMatch ? timeMatch[1].trim() : "";

    medals.push({ name, price, duration, stock, timeRange });
  }

  return medals;
};

const extractMedalsFromPterclub = (html) => {
  const medals = [];
  const medalRegex =
    /<input\s+type="submit"\s+name="medalchosen"\s+value="([^"]*)"([^>]*)>/gi;
  let match;

  while ((match = medalRegex.exec(html)) !== null) {
    const value = match[1];
    const attrs = match[2];

    if (attrs.includes("disabled")) continue;

    const codeMatch = value.match(/^(\d{3}-\d{3})/);
    if (!codeMatch) continue;

    const code = codeMatch[1];
    const priceMatch = value.match(/\(([\d,]+)\s*猫粮\)/);
    const price = priceMatch ? priceMatch[1].replace(/,/g, "") : "";

    const before = html.substring(Math.max(0, match.index - 600), match.index);
    const imgTagMatches = [...before.matchAll(/<img\s+title="([^"]*)"/gi)];
    const imgMatch =
      imgTagMatches.length > 0 ? imgTagMatches[imgTagMatches.length - 1] : null;
    const name = imgMatch ? imgMatch[1].trim() : "";

    if (!name) continue;

    medals.push({ name, price, medalId: code });
  }

  return medals;
};

// SPA 壳页面判定：zmpt.cc（Vite）、yemapt.org（umi）等站点的勋章由 JS 渲染，
// 静态 HTML 只有一个空挂载点。特征：含外部脚本引用，且剥离 script/style 后
// 几乎没有任何可见文本。普通 NexusPHP 页面文本量巨大，不会误判；
// "Redirecting..." 类跳转页没有外部脚本，同样不会误判。
const isSpaShell = (html) => {
  if (!html || typeof html !== "string") return false;
  if (!/<script[^>]*\ssrc\s*=/i.test(html)) return false;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  return text.length < 200;
};

// SPA 渲染相关常量：总超时需覆盖慢网络下的页面加载 + SPA hydrate；
// complete 之后 JS 渲染耗时不稳定（固定延时不可靠），改为轮询等待内容出现。
// 注意：挂载点内容的"已渲染"判定在页面上下文执行，阈值需内联在注入函数中
// （Service Worker 的常量无法被页面上下文引用）。
const SPA_RENDER_TIMEOUT_MS = 45000;
const SPA_POLL_DEADLINE_MS = 20000;
const SPA_POLL_INTERVAL_MS = 800;

// 在后台标签页中渲染 SPA 站点并取回渲染后的 HTML。
// 之所以必须开标签页：Service Worker 没有 DOM 环境，无法执行页面 JS；
// 标签页继承浏览器登录态，可直接拿到需要登录的勋章数据。
// 所有退出路径（含超时）都必须关闭标签页，否则每次扫描都会残留一个空标签。
const extractMedalsFromZmpt = async (siteUrl, _cookies) => {
  if (
    typeof chrome === "undefined" ||
    !chrome.tabs ||
    !chrome.tabs.onUpdated ||
    !chrome.scripting
  ) {
    return "";
  }

  return new Promise((resolve) => {
    let settled = false;
    let tabId = null;
    let timeoutId = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (tabId != null) {
        try {
          chrome.tabs.remove(tabId, () => {
            // 标签页可能已自行关闭，忽略 lastError
            if (chrome.runtime && chrome.runtime.lastError) {
              /* noop */
            }
          });
        } catch {
          /* 标签页已关闭时 remove 会抛错，忽略 */
        }
      }
      resolve(result);
    };

    timeoutId = setTimeout(() => finish(""), SPA_RENDER_TIMEOUT_MS);

    chrome.tabs.create({ url: siteUrl, active: false }, (tab) => {
      if (!tab || settled) {
        finish("");
        return;
      }
      tabId = tab.id;

      const listener = (updatedTabId, changeInfo) => {
        if (settled || updatedTabId !== tabId) return;
        if (changeInfo.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(listener);

        const readMountContent = () =>
          chrome.scripting
            .executeScript({
              target: { tabId },
              func: () => {
                const mount =
                  document.getElementById("vite-app") ||
                  document.getElementById("root") ||
                  document.getElementById("app");
                const mountHtml = mount ? mount.innerHTML : "";
                return mountHtml.trim().length > 200 ? mountHtml : "";
              },
            })
            .then((results) =>
              results && results[0] && results[0].result
                ? results[0].result
                : "",
            );

        const poll = async () => {
          const deadline = Date.now() + SPA_POLL_DEADLINE_MS;
          while (!settled && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, SPA_POLL_INTERVAL_MS));
            try {
              const rendered = await readMountContent();
              if (rendered) {
                finish(rendered);
                return;
              }
            } catch {
              // 页面仍在导航或注入被拒绝，继续轮询
            }
          }
          // 轮询超时：兜底读取整页 HTML（SPA 可能渲染在挂载点之外）
          if (!settled) {
            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId },
                func: () =>
                  document.documentElement
                    ? document.documentElement.outerHTML
                    : "",
              });
              const rendered =
                results && results[0] && results[0].result
                  ? results[0].result
                  : "";
              finish(rendered);
            } catch {
              finish("");
            }
          }
        };
        poll();
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  });
};

const extractMedalsFromMedalItems = (html) => {
  const medals = [];
  const items = [];
  let pos = 0;

  while (pos < html.length) {
    const itemStart = html.indexOf('<div class="medal-item">', pos);
    if (itemStart < 0) break;

    let d = 0;
    let itemEnd = -1;
    for (let i = itemStart; i < html.length; i++) {
      if (html[i] === "<") {
        const tagEnd = html.indexOf(">", i);
        if (tagEnd < 0) break;
        const tag = html.substring(i, tagEnd + 1);
        if (tag.startsWith("<div ") || tag.startsWith("<div>")) d++;
        else if (tag.startsWith("</div>")) {
          d--;
          if (d === 0) {
            itemEnd = tagEnd + 1;
            break;
          }
        }
        i = tagEnd;
      }
    }

    if (itemEnd > 0) {
      items.push(html.substring(itemStart, itemEnd));
      pos = itemEnd;
    } else break;
  }

  for (const item of items) {
    const btnMatch =
      item.match(
        /<input[^>]*type="button"[^>]*class="[^"]*(?:buy-btn|gift-btn)[^"]*"[^>]*>/i,
      ) || item.match(/<input[^>]*type="button"[^>]*data-id="\d+"[^>]*>/i);
    if (!btnMatch) continue;

    const btnHtml = btnMatch[0];
    if (btnHtml.includes("disabled")) continue;

    const valMatch = btnHtml.match(/value="([^"]*)"/);
    const btnValue = valMatch ? valMatch[1] : "";
    if (btnValue === "仅授予" || btnValue === "交换" || btnValue === "赠送")
      continue;

    const dataIdMatch = btnHtml.match(/data-id="(\d+)"/);
    const medalId = dataIdMatch ? dataIdMatch[1] : "";

    const h2Match = item.match(/<h2>([\s\S]*?)<\/h2>/);
    let name;
    if (h2Match) {
      name = h2Match[1].replace(/<[^>]+>/g, "").trim();
    } else {
      const imgMatch = item.match(/<img[^>]*alt="([^"]*)"[^>]*>/i);
      name = imgMatch ? imgMatch[1].trim() : "";
    }

    let price = "",
      duration = "",
      bonus = "",
      stock = "",
      timeRange = "";
    const detailsMatch = item.match(
      /<table class="medal-details">([\s\S]*?)<\/table>/,
    );
    if (detailsMatch) {
      const rows = detailsMatch[1].match(/<tr>[\s\S]*?<\/tr>/g) || [];
      for (const row of rows) {
        const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
        if (tds.length >= 2) {
          const label = tds[0].replace(/<[^>]+>/g, "").trim();
          const value = tds[1].replace(/<[^>]+>/g, "").trim();
          if (label.includes("价格") || label.includes("價格")) price = value;
          else if (label.includes("有效期")) duration = value;
          else if (label.includes("加成")) bonus = value;
          else if (label.includes("库存") || label.includes("庫存"))
            stock = value;
        }
      }
    }

    const pTags = item.match(/<p>([\s\S]*?)<\/p>/g) || [];
    for (const p of pTags) {
      const text = p.replace(/<[^>]+>/g, "").trim();
      if (text.includes("~") && text !== "不限~不限") {
        timeRange = text;
        break;
      }
    }

    if (name)
      medals.push({ name, price, duration, bonus, stock, timeRange, medalId });
  }
  return medals;
};

const extractMedalsFromHhanclub = (html) => {
  const medals = [];
  const rows = [];
  let pos = 0;

  while (pos < html.length) {
    const rowStart = html.indexOf('<div class="medal-table py-5', pos);
    if (rowStart < 0) break;

    let d = 0;
    let rowEnd = -1;
    for (let i = rowStart; i < html.length; i++) {
      if (html[i] === "<") {
        const tagEnd = html.indexOf(">", i);
        if (tagEnd < 0) break;
        const tag = html.substring(i, tagEnd + 1);
        if (tag.startsWith("<div ") || tag.startsWith("<div>")) d++;
        else if (tag.startsWith("</div>")) {
          d--;
          if (d === 0) {
            rowEnd = tagEnd + 1;
            break;
          }
        }
        i = tagEnd;
      }
    }

    if (rowEnd > 0) {
      rows.push(html.substring(rowStart, rowEnd));
      pos = rowEnd;
    } else break;
  }

  for (const rowContent of rows) {
    const btnMatch = rowContent.match(
      /<input[^>]*type="button"[^>]*data-id="(\d+)"[^>]*value="([^"]*)"[^>]*>/,
    );
    if (!btnMatch) continue;

    const medalId = btnMatch[1];
    const btnValue = btnMatch[2];

    if (btnMatch[0].includes("disabled")) continue;
    if (btnValue !== "购买" && btnValue !== "購買") continue;

    const imgMatch = rowContent.match(/<img[^>]*alt='([^']*)'/);
    const name = imgMatch ? imgMatch[1].trim() : "";
    if (!name) continue;

    const cells = rowContent.match(/<div[^>]*>([\s\S]*?)<\/div>/g) || [];
    let price = "",
      stock = "",
      bonus = "",
      duration = "";
    if (cells.length >= 8) {
      price = cells[3].replace(/<[^>]+>/g, "").trim();
      stock = cells[4].replace(/<[^>]+>/g, "").trim();
      bonus = cells[6].replace(/<[^>]+>/g, "").trim();
      duration = cells[7].replace(/<[^>]+>/g, "").trim();
    }

    medals.push({ name, price, duration, bonus, stock, medalId });
  }
  return medals;
};

// 判断标签是否为可用的购买按钮：
// <button> 要求文本恰为 购买/購買，<input> 要求 value 恰为 购买/購買，
// 避免误匹配"已经购买""已过可购买时间""需要更多魔力值"等状态按钮
const isEnabledBuyButton = (card, tag) => {
  if (!tag || tag.includes("disabled")) return false;
  if (tag.startsWith("<button")) {
    const after = card.substring(card.indexOf(tag) + tag.length);
    const closeIdx = after.indexOf("</button>");
    const text = (closeIdx >= 0 ? after.substring(0, closeIdx) : "")
      .replace(/<[^>]+>/g, "")
      .trim();
    return text === "购买" || text === "購買";
  }
  return tag.includes('value="购买"') || tag.includes('value="購買"');
};

// 查找卡片中的购买按钮标签。
// ① 优先匹配 class 含独立单词 buy 的 input/button——覆盖
// hxpt(action-btn btn-primary buy)、longpt(medal-action-btn-unified buy)、
// luckpt(btn buy-action primary btn-buy)、cspt(btn btn-primary buy-btn) 等变体；
// ② 回退匹配文本恰为 购买/購買 的 <button>（class 无 buy 的站点兜底）。
const findBuyButtonTag = (card) => {
  const classBuyMatch = card.match(
    /<(?:input|button)[^>]*\bclass="[^"]*\bbuy\b[^"]*"[^>]*>/i,
  );
  if (classBuyMatch && isEnabledBuyButton(card, classBuyMatch[0])) {
    return classBuyMatch[0];
  }
  const buttons = card.match(/<button[^>]*>[\s\S]*?<\/button>/gi) || [];
  for (const btn of buttons) {
    if (btn.includes("disabled")) continue;
    const text = btn.replace(/<[^>]+>/g, "").trim();
    if (text === "购买" || text === "購買") return btn;
  }
  return null;
};

// 勋章名称提取：专用 class 容器 → 购买按钮 data-name → img alt → 首个 h1-h4
const extractCardMedalName = (card, buyTag) => {
  const nameMatch = card.match(
    /<(?:h[1-4]|div|span)\s+class="(?:medal-name|medal-title|medal-card__name|cread-name)"[^>]*>([\s\S]*?)<\/(?:h[1-4]|div|span)>/i,
  );
  if (nameMatch) {
    const name = nameMatch[1].replace(/<[^>]+>/g, "").trim();
    if (name) return name;
  }
  const dataName = buyTag.match(/data-name="([^"]*)"/i);
  if (dataName && dataName[1].trim()) return dataName[1].trim();
  const imgMatch = card.match(/<img[^>]*\balt="([^"]*)"[^>]*>/i);
  if (imgMatch && imgMatch[1].trim()) return imgMatch[1].trim();
  const fallbackH = card.match(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/i);
  if (fallbackH) {
    return fallbackH[2]
      .replace(/<[^>]+>/g, "")
      .trim()
      .replace(/\s*\(#\d+\)\s*$/, "");
  }
  return "";
};

const normalizeFieldValue = (raw) =>
  raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// 各站点"标签-值"容器组合差异很大，用模式清单统一覆盖：
// detail-label/value(longpt)、meta-label/value(luckpt/si-qi，div 与 span 两种)、
// medal-card__label/value、stat-label/value、stat-item 内文 + stat-value(cspt)、
// medal-detail-item 的 span + strong(hxpt)
const CARD_FIELD_PATTERNS = [
  /<span\s+class="detail-label"[^>]*>([\s\S]*?)<\/span>\s*<span\s+class="detail-value"[^>]*>([\s\S]*?)<\/span>/gi,
  /<div\s+class="meta-label"[^>]*>([\s\S]*?)<\/div>\s*<div\s+class="meta-value"[^>]*>([\s\S]*?)<\/div>/gi,
  /<span\s+class="meta-label"[^>]*>([\s\S]*?)<\/span>\s*<span\s+class="meta-value"[^>]*>([\s\S]*?)<\/span>/gi,
  /<span\s+class="medal-card__label"[^>]*>([\s\S]*?)<\/span>\s*<span\s+class="medal-card__value"[^>]*>([\s\S]*?)<\/span>/gi,
  /<span\s+class="stat-label"[^>]*>([\s\S]*?)<\/span>\s*<span\s+class="stat-value"[^>]*>([\s\S]*?)<\/span>/gi,
  /<div\s+class="stat-item"[^>]*>([^<]*?)\s*[：:]?\s*<span\s+class="stat-value[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
  /<div\s+class="medal-detail-item"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<strong[^>]*>([\s\S]*?)<\/strong>/gi,
];

// 标签 → 字段映射；同一卡片内后者覆盖前者（如 hxpt"定价"之后的"购买价(过期+50%)"
// 才是实际扣费价，应覆盖列表价）
const assignCardField = (fields, rawLabel, rawValue) => {
  const label = rawLabel.replace(/<[^>]+>/g, "").replace(/[：:]/g, "").trim();
  const value = normalizeFieldValue(rawValue);
  if (!label || !value) return;
  if (
    label.includes("价格") ||
    label.includes("價格") ||
    label.includes("定价") ||
    label.includes("售价") ||
    label.includes("购买价")
  )
    fields.price = value;
  else if (label.includes("有效期") || label.includes("时长"))
    fields.duration = value;
  else if (label.includes("加成")) fields.bonus = value;
  else if (label.includes("库存") || label.includes("庫存"))
    fields.stock = value;
  else if (
    label.includes("可购买") ||
    label.includes("可購買") ||
    label.includes("销售时间") ||
    label.includes("售卖时间")
  )
    fields.timeRange = value;
};

// 从卡片提取价格/有效期/加成/库存/可购买时间；标签模式缺失时回退旧式
// <strong>标签:</strong>值 结构（13city/playlet 等），再用购买按钮的
// data-* 结构化属性兜底
const extractCardMedalFields = (card, buyTag) => {
  const fields = { price: "", duration: "", bonus: "", stock: "", timeRange: "" };
  let matched = false;

  for (const pattern of CARD_FIELD_PATTERNS) {
    pattern.lastIndex = 0;
    let pair;
    while ((pair = pattern.exec(card)) !== null) {
      matched = true;
      assignCardField(fields, pair[1], pair[2]);
    }
  }

  if (!matched) {
    // 旧式：<div><strong>价格：</strong>24,000</div>
    const strongPairsOld = card.match(/<strong>([^<]+)<\/strong>([\s\S]*?)<\/div>/g) || [];
    for (const pair of strongPairsOld) {
      const labelMatch = pair.match(/<strong>([^<]+)<\/strong>/);
      if (!labelMatch) continue;
      const val = pair
        .replace(/<[^>]+>/g, " ")
        .replace(/：/g, ":")
        .replace(/^[^:]*[:：]\s*/, "")
        .trim();
      assignCardField(fields, labelMatch[1], val);
    }
    // 新式：<div><span>定价:</span><strong>188,888</strong></div>
    if (!fields.price && !fields.duration) {
      const strongPairsNew =
        card.match(
          /<(?:div|span|td)[^>]*>\s*<span[^>]*>([^<]+)[:：]?\s*<\/span>\s*<strong[^>]*>([^<]+)<\/strong>/gi,
        ) || [];
      for (const pair of strongPairsNew) {
        const m = pair.match(
          /<span[^>]*>([^<]+)[:：]?\s*<\/span>\s*<strong[^>]*>([^<]+)<\/strong>/i,
        );
        if (m) assignCardField(fields, m[1], m[2]);
      }
    }
  }

  // cspt 可购买时间独立容器：<div class="sale-time">📅 2026-10-01 00:00:00 ~ 不限</div>
  if (!fields.timeRange) {
    const saleTimeMatch = card.match(/<div\s+class="sale-time"[^>]*>([\s\S]*?)<\/div>/i);
    if (saleTimeMatch) {
      fields.timeRange = normalizeFieldValue(saleTimeMatch[1]).replace(/^[^0-9不]+/, "");
    }
  }

  if (!fields.price) {
    const m = buyTag.match(/data-(?:price-formatted|buy-price|price)="([^"]*)"/i);
    if (m) fields.price = m[1].trim();
  }
  if (!fields.duration) {
    const m = buyTag.match(/data-duration="([^"]*)"/i);
    if (m) fields.duration = m[1].trim();
  }
  if (!fields.bonus) {
    const m = buyTag.match(/data-bonus="([^"]*)"/i);
    if (m) fields.bonus = m[1].trim();
  }
  if (!fields.timeRange) {
    const begin = buyTag.match(/data-sale-begin="([^"]*)"/i);
    const end = buyTag.match(/data-sale-end="([^"]*)"/i);
    if (begin && end) fields.timeRange = `${begin[1].trim()} ~ ${end[1].trim()}`;
  }
  // 库存/可购买时间可能挂在卡片内其他按钮上（如 hxpt 的"详情"按钮带
  // data-inventory / data-sale-begin），购买按钮上没有时回退查整卡
  if (!fields.stock) {
    const m = card.match(/data-inventory="([^"]*)"/i);
    if (m) fields.stock = m[1].trim();
  }
  if (!fields.timeRange) {
    const begin = card.match(/data-sale-begin="([^"]*)"/i);
    const end = card.match(/data-sale-end="([^"]*)"/i);
    if (begin && end) fields.timeRange = `${begin[1].trim()} ~ ${end[1].trim()}`;
  }
  // 行内"XX加成：值"文本兜底（如 luckpt 头部的 幸运星加成：1.000%）
  if (!fields.bonus) {
    const m = card.match(/加成[：:]\s*([+\d][\d.]*%?)/);
    if (m) fields.bonus = m[1];
  }
  return fields;
};

// 通用勋章卡片提取器：覆盖各站点自定义的 medal-card 卡片布局
// （13city、playlet、hxpt、luckpt、cspt、longpt 等）。
// 容器匹配必须用正则：兼容 class="medal-card"、class="medal-card locked"、
// class="medal-card" data-id= 等变体；若退化为硬编码 '<div class="medal-card '
// （要求 class 后带空格），longpt/hxpt/luckpt 等站点会整体漏扫。
// 正则同时排除 medal-card__xxx 子元素与 medal-card-list 等派生容器。
const extractMedalsFromCards = (html) => {
  const medals = [];
  const cards = [];
  let pos = 0;
  const cardTagRegex = /<div[^>]*\bclass=["']medal-card(?![-\w])[^>]*>/gi;

  let cardMatch;
  while ((cardMatch = cardTagRegex.exec(html)) !== null) {
    const cardStart = cardMatch.index;
    if (cardStart < pos) continue;

    // 深度计数找到容器闭合
    let d = 0;
    let cardEnd = -1;
    for (let i = cardStart; i < html.length; i++) {
      if (html[i] === "<") {
        const tagEnd = html.indexOf(">", i);
        if (tagEnd < 0) break;
        const tag = html.substring(i, tagEnd + 1);
        if (tag.startsWith("<div ") || tag.startsWith("<div>")) d++;
        else if (tag.startsWith("</div>")) {
          d--;
          if (d === 0) {
            cardEnd = tagEnd + 1;
            break;
          }
        }
        i = tagEnd;
      }
    }

    if (cardEnd > 0) {
      cards.push(html.substring(cardStart, cardEnd));
      pos = cardEnd;
    } else break;
  }

  for (const card of cards) {
    // si-qi 的 medal-card__title BEM 布局由 extractMedalsFromSiqi 专用处理，此处跳过
    if (card.includes("medal-card__title")) continue;

    const buyTag = findBuyButtonTag(card);
    if (!buyTag) continue;

    const dataIdMatch = buyTag.match(/data-id="(\d+)"/);
    const medalId = dataIdMatch ? dataIdMatch[1] : "";

    const name = extractCardMedalName(card, buyTag);
    if (!name) continue;

    medals.push({
      name,
      ...extractCardMedalFields(card, buyTag),
      medalId,
    });
  }
  return medals;
};

// si-qi.xyz 等 BEM 风格 medal-card 布局
// 特征：<div class="medal-card"> + <div class="medal-card__title"><h2>NAME (#ID)</h2></div>
// + <span class="meta-label">LABEL</span><span class="meta-value">VALUE</span>
// + <input type="button" class="" data-id="X" value="购买">
const extractMedalsFromSiqi = (html) => {
  // 结构特征双重检测，避免误匹配其他 medal-card 变体
  if (!html.includes("medal-card__title") || !html.includes("meta-label")) {
    return [];
  }

  const medals = [];
  const cards = [];
  let pos = 0;

  // 提取所有 medal-card 容器（含 "medal-card owned" 变体）
  while (pos < html.length) {
    const cardStart = html.indexOf('<div class="medal-card', pos);
    if (cardStart < 0) break;

    // 确认是 medal-card 容器而非 medal-card__ 子元素
    const tagEnd = html.indexOf(">", cardStart);
    if (tagEnd < 0) break;
    const openTag = html.substring(cardStart, tagEnd + 1);
    // 排除 medal-card__image / medal-card__body 等子元素
    if (openTag.includes("medal-card__")) {
      pos = tagEnd + 1;
      continue;
    }

    // 深度计数找到容器闭合
    let d = 0;
    let cardEnd = -1;
    for (let i = cardStart; i < html.length; i++) {
      if (html[i] === "<") {
        const tEnd = html.indexOf(">", i);
        if (tEnd < 0) break;
        const tag = html.substring(i, tEnd + 1);
        if (tag.startsWith("<div ") || tag.startsWith("<div>")) d++;
        else if (tag.startsWith("</div>")) {
          d--;
          if (d === 0) {
            cardEnd = tEnd + 1;
            break;
          }
        }
        i = tEnd;
      }
    }

    if (cardEnd > 0) {
      cards.push(html.substring(cardStart, cardEnd));
      pos = cardEnd;
    } else break;
  }

  for (const card of cards) {
    // 匹配带 data-id 的按钮（class 可为空、gift 等）
    const btnMatch = card.match(
      /<input[^>]*type="button"[^>]*data-id="\d+"[^>]*>/i,
    );
    if (!btnMatch) continue;

    const btnHtml = btnMatch[0];
    if (btnHtml.includes("disabled")) continue;

    const valMatch = btnHtml.match(/value="([^"]*)"/);
    const btnValue = valMatch ? valMatch[1] : "";
    // 仅保留"购买"/"購買"按钮，过滤"赠送"/"已经购买"/"已过可购买时间"等
    if (btnValue !== "购买" && btnValue !== "購買") continue;

    const dataIdMatch = btnHtml.match(/data-id="(\d+)"/);
    const medalId = dataIdMatch ? dataIdMatch[1] : "";

    // 名称从 medal-card__title 内的 <h2> 提取
    let name;
    const titleMatch = card.match(
      /<div class="medal-card__title">[\s\S]*?<h2>([\s\S]*?)<\/h2>/i,
    );
    if (titleMatch) {
      name = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    } else {
      // 回退到 img alt
      const imgMatch = card.match(/<img[^>]*alt="([^"]*)"[^>]*>/i);
      name = imgMatch ? imgMatch[1].trim() : "";
    }
    if (!name) continue;

    // 从 meta-label/meta-value 键值对提取字段
    let price = "",
      duration = "",
      bonus = "",
      stock = "",
      timeRange = "";
    const metaPairs =
      card.match(
        /<span class="meta-label">([^<]*)<\/span>\s*<span class="meta-value">([^<]*)<\/span>/g,
      ) || [];
    for (const pair of metaPairs) {
      const labelMatch = pair.match(/<span class="meta-label">([^<]*)<\/span>/);
      const valueMatch = pair.match(/<span class="meta-value">([^<]*)<\/span>/);
      if (!labelMatch || !valueMatch) continue;
      const label = labelMatch[1].trim();
      const value = valueMatch[1].trim();
      if (label.includes("价格") || label.includes("價格")) price = value;
      else if (label.includes("有效期")) duration = value;
      else if (label.includes("加成")) bonus = value;
      else if (label.includes("库存") || label.includes("庫存")) stock = value;
      else if (label.includes("可购买") || label.includes("可購買"))
        timeRange = value;
    }

    medals.push({ name, price, duration, bonus, stock, timeRange, medalId });
  }
  return medals;
};

// zmpt.cc 新版 CSS Modules 布局（Vue/Vite SPA 渲染后 DOM）
// 特征：<div class="index-module__card___XXX"> + <div class="index-module__title___XXX">
// + <div class="index-module__label___XXX">LABEL</div><div class="index-module__content___XXX">VALUE</div>
// + <div class="index-module__control___XXX"><button>购买</button></div>
// CSS Modules 类名带 hash 后缀（如 ___90vxo），不能硬编码完整类名
const extractMedalsFromZmptNew = (html) => {
  // 结构特征双重检测，避免误匹配
  if (
    !html.includes("index-module__card") ||
    !html.includes("index-module__label")
  ) {
    return [];
  }

  const medals = [];
  const cards = [];
  let pos = 0;

  // 提取所有 card-wrap 容器（包含 card 内部结构）
  // card-wrap 是卡片的最外层，card 是内部容器
  while (pos < html.length) {
    const cardStart = html.indexOf('<div class="index-module__card-wrap', pos);
    if (cardStart < 0) break;

    // 深度计数找到容器闭合
    let d = 0;
    let cardEnd = -1;
    for (let i = cardStart; i < html.length; i++) {
      if (html[i] === "<") {
        const tEnd = html.indexOf(">", i);
        if (tEnd < 0) break;
        const tag = html.substring(i, tEnd + 1);
        if (tag.startsWith("<div ") || tag.startsWith("<div>")) d++;
        else if (tag.startsWith("</div>")) {
          d--;
          if (d === 0) {
            cardEnd = tEnd + 1;
            break;
          }
        }
        i = tEnd;
      }
    }

    if (cardEnd > 0) {
      cards.push(html.substring(cardStart, cardEnd));
      pos = cardEnd;
    } else break;
  }

  for (const card of cards) {
    // 查找 control 区域内的按钮
    const controlMatch = card.match(
      /<div class="index-module__control[^"]*">([\s\S]*?)<\/div>/,
    );
    if (!controlMatch) continue;

    const controlHtml = controlMatch[1];
    // 提取所有 button 元素
    const buttons = controlHtml.match(/<button[^>]*>[\s\S]*?<\/button>/g) || [];

    // 查找可用的购买按钮（非 disabled，文本为"购买"或"購買"）
    let hasBuyButton = false;
    for (const btn of buttons) {
      if (btn.includes("disabled")) continue;
      const btnText = btn.replace(/<[^>]+>/g, "").trim();
      if (btnText === "购买" || btnText === "購買") {
        hasBuyButton = true;
        break;
      }
    }
    if (!hasBuyButton) continue;

    // 名称从 title 区域的第一个 <div> 提取
    let name;
    const titleMatch = card.match(
      /<div class="index-module__title[^"]*"><div>([^<]*)<\/div>/,
    );
    if (titleMatch) {
      name = titleMatch[1].trim();
    } else {
      // 回退到 img alt
      const imgMatch = card.match(/<img[^>]*alt="([^"]*)"[^>]*>/i);
      name = imgMatch ? imgMatch[1].trim() : "";
    }
    if (!name) continue;

    // 时间范围从 time-limit 区域提取
    let timeRange = "";
    const timeMatch = card.match(
      /<div class="index-module__time-limit[^"]*"><div>([^<]*)<\/div>/,
    );
    if (timeMatch) {
      timeRange = timeMatch[1].trim();
    }

    // 字段从 label/content 键值对提取
    let price = "",
      duration = "",
      bonus = "",
      stock = "";
    // 匹配所有 item 中的 label/content 对
    const itemPairs =
      card.match(
        /<div class="index-module__label[^"]*">([^<]*)<\/div>\s*<div class="index-module__content[^"]*">([\s\S]*?)<\/div>/g,
      ) || [];
    for (const pair of itemPairs) {
      const labelMatch = pair.match(
        /<div class="index-module__label[^"]*">([^<]*)<\/div>/,
      );
      // content 可能包含嵌套元素（如优先级 input），取纯文本
      const contentMatch = pair.match(
        /<div class="index-module__content[^"]*">([\s\S]*?)<\/div>/,
      );
      if (!labelMatch || !contentMatch) continue;
      const label = labelMatch[1].trim();
      // content 取纯文本，去除嵌套标签和内部多余空白
      const value = contentMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, "")
        .trim();
      if (label.includes("价格") || label.includes("價格")) price = value;
      else if (label.includes("有效期")) duration = value;
      else if (label.includes("加成")) bonus = value;
      else if (label.includes("库存") || label.includes("庫存")) stock = value;
    }

    medals.push({
      name,
      price,
      duration,
      bonus,
      stock,
      timeRange,
      medalId: "",
    });
  }
  return medals;
};

const extractTdText = (tdHtml) => {
  return tdHtml
    .replace(/<h1[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// 提取用户当前可用「魔力值」（Magic Points）
// 各 PT 站点表头通常带有 魔力/魔法/麦力/余额 等余额信息，这里做尽力而为的提取。
// 返回数字；提取不到时返回 null。
// 注意：JS 正则中 \b 对 CJK 字符无效（CJK 不属于 \w），因此这里不使用 \b。
const MAGIC_KEYWORDS = ["魔力", "魔法", "麦力", "麦粒", "magic", "余额"];
const extractMagicBalance = (html) => {
  if (!html) return null;
  const patterns = [
    // 关键字 + 可选冒号 + 标签包裹的数字，例如 魔力: <b>12345</b>
    new RegExp(
      `(?:${MAGIC_KEYWORDS.join("|")})\\s*[:：]?\\s*<[^>]*>\\s*([\\d,]{2,})(?!\\s*%)`,
      "i",
    ),
    // 关键字 + 冒号/空格 + 数字，例如 魔法 99,999 / 麦力：12,345
    new RegExp(
      `(?:${MAGIC_KEYWORDS.join("|")})[\\s:：]*([\\d,]{2,})(?!\\s*%)`,
      "i",
    ),
    // 关键字后 50 字符内的 2 位以上数字（兜底，排除百分比加成）
    new RegExp(
      `(?:${MAGIC_KEYWORDS.join("|")})[\\s\\S]{0,50}?([\\d,]{2,})(?!\\s*%)`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const num = parseFloat(String(m[1]).replace(/,/g, ""));
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return null;
};

// 将勋章价格字符串解析为数字。支持 "1,000"、"1000 魔力"、"2000猫粮"、"免费"。
const parsePriceNumber = (price) => {
  if (price == null) return null;
  const cleaned = String(price).replace(/[^\d.]/g, "");
  if (cleaned === "") return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

// 为某个分页提取出的勋章批量打上页码与分页 URL，供前端跳转使用。
const tagMedalsWithPage = (medals, page, pageUrl) => {
  if (!Array.isArray(medals)) return medals;
  return medals.map((m) => ({ ...m, page, pageUrl }));
};

const DEFAULT_SITES = [
  "13city.org|https://13city.org/medal.php",
  "1ptba.com|https://1ptba.com/medal.php",
  "52movie.top|https://www.52movie.top/medal.php",
  "agsvpt.cn|https://pt.agsvpt.cn/medal.php",
  "bilibili.download|https://bilibili.download/medal.php",
  "cangbao.ge|https://cangbao.ge/medal.php",
  "carpt.net|https://carpt.net/medal.php",
  "cc.mypt.cc|https://cc.mypt.cc/medal.php",
  "crabpt.vip|https://crabpt.vip/medal.php",
  "cspt.top|https://cspt.top/medal.php",
  "cyanbug.net|https://cyanbug.net/medal.php",
  "discfan.net|https://discfan.net/medal.php",
  "dstudio.me|https://dstudio.me/medal.php",
  "dubhe.site|https://dubhe.site/medal.php",
  "duckboobee.org|https://duckboobee.org/medal.php",
  "gamegamept.com|https://www.gamegamept.com/medal.php",
  "greatposterwall.com|https://greatposterwall.com/medal.php",
  "hdbao.cc|https://hdbao.cc/medal.php",
  "hdfans.org|http://hdfans.org/medal.php",
  "hdkyl.in|https://www.hdkyl.in/medal.php",
  "hdpt.xyz|https://hdpt.xyz/medal.php",
  "hdtime.org|https://hdtime.org/medal.php",
  "hdvideo.one|https://hdvideo.one/medal.php",
  "hhanclub.net|https://hhanclub.net/medal.php",
  "hitpt.com|https://www.hitpt.com/medal.php",
  "htpt.cc (buycenter)|https://www.htpt.cc/buycenter.php",
  "hxpt.org|https://www.hxpt.org/medal.php",
  "icc2022.com|https://www.icc2022.com/medal.php",
  "kamept.com|https://kamept.com/medal.php",
  "kufei.org|https://kufei.org/medal.php",
  "leaves.red|https://leaves.red/medal.php",
  "lemonhd.net|https://lemonhd.net/medal.php",
  "momentpt.top|https://www.momentpt.top/medal.php",
  "musopia.vip|https://www.musopia.vip/medal.php",
  "njtupt.top|https://njtupt.top/medal.php",
  "okpt.net|https://www.okpt.net/medal.php",
  "oshen.win|http://www.oshen.win/medal.php",
  "p.t-baozi.cc|https://p.t-baozi.cc/medal.php",
  "pandapt.net|https://pandapt.net/medal.php",
  "piggo.me|https://piggo.me/medal.php",
  "playlet.cc|https://playlet.cc/medal.php",
  "pt.0ff.cc|https://pt.0ff.cc/medal.php",
  "pt.aling.de|https://pt.aling.de/medal.php",
  "pt.gtkpw.xyz|https://pt.gtkpw.xyz/medal.php",
  "pt.lajidui.top|https://pt.lajidui.top/medal.php",
  "pt.luckpt.de|https://pt.luckpt.de/medal.php",
  "pt.muxuege.org|https://pt.muxuege.org/medal.php",
  "pt.novahd.top|https://pt.novahd.top/medal.php",
  "pt.soulvoice.club|https://pt.soulvoice.club/medal.php",
  "pt.xingyungept.org|https://pt.xingyungept.org/medal.php",
  "ptcafe.club|https://ptcafe.club/medal.php",
  "pterclub.net|https://pterclub.net/medal.php",
  "ptfans.cc|https://ptfans.cc/medal.php",
  "ptlgs.org|https://ptlgs.org/medal.php",
  "ptskit.com|https://www.ptskit.com/medal.php",
  "ptzone.xyz|https://ptzone.xyz/medal.php",
  "qingwapt.com|https://qingwapt.com/medal.php",
  "raingfh.top|https://raingfh.top/medal.php",
  "rousi.pro|https://rousi.pro/medal.php",
  "sewerpt.com|https://sewerpt.com/medal.php",
  "si-qi.xyz|https://si-qi.xyz/medal.php",
  "springsunday.net (badges)|https://springsunday.net/badges.php",
  "sunnypt.top|https://sunnypt.top/bounty?tab=renown",
  "tangpt.top|https://www.tangpt.top/medal.php",
  "tokyo-manga.top|https://www.tokyo-manga.top/medal.php",
  "totheglory.im (mall)|https://totheglory.im/mall.php",
  "ubits.club|https://ubits.club/medal.php",
  "wintersakura.net|https://wintersakura.net/medal.php",
  "wukongwendao.top|https://wukongwendao.top/medal.php",
  "xingtan.one|https://xingtan.one/medal.php",
  "yhpp.cc|https://www.yhpp.cc/medal.php",
  "yemapt.org|https://www.yemapt.org/#/user/growth?tab=badge",
  "zmpt.cc|https://zmpt.cc/medal.php",
  "zrpt.cc|https://zrpt.cc/medal.php",
];

// 分页抓取上限：防止个别站点分页条链出过多页面导致扫描时间失控
const MAX_PAGE_FETCHES = 20;

// 从 HTML 分页条中收集所有 ?page=N 页码。
// 省略号折叠的中间页（如 "1 2 … 12 13 14" 中的 3-11）在首页没有链接，
// 只有翻到相邻页才会在其分页条中暴露，因此抓取循环需要逐步发现。
// pterclub 使用 ?page=page001 形式，单独处理。
const collectPageNumbers = (html, isPterclub) => {
  const nums = new Set();
  const re = isPterclub ? /page=page(\d+)/gi : /[?&]page=(\d+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) nums.add(n);
  }
  return [...nums].sort((a, b) => a - b);
};

// 拼接分页 URL：站点 URL 已带查询参数时用 & 而非 ?
// （如 totheglory 的 mall.php?cid=5，拼成 ?page=1 会得到非法 URL）
const buildPageUrl = (siteUrl, pageNum, isPterclub) => {
  const separator = siteUrl.includes("?") ? "&" : "?";
  return isPterclub
    ? siteUrl + separator + "page=page" + String(pageNum).padStart(3, "0")
    : siteUrl + separator + "page=" + pageNum;
};

// 判断两页勋章是否完全相同（按名称集合），用于 1 索引站点的重复页去重
const isSameMedalSet = (pageA, pageB) => {
  if (pageA.length === 0 || pageB.length === 0) return false;
  if (pageA.length !== pageB.length) return false;
  const names = new Set(pageA.map((m) => m.name));
  return pageB.every((m) => names.has(m.name));
};

// ===== zmpt.cc（Vite SPA + Java API）=====
// 页面 HTML 只有空挂载点，勋章数据来自 /javaapi/user/queryAllMedals（纯 Cookie 认证，
// 无需额外令牌）。「可购买」判定复刻站点前端按钮逻辑：
//   已拥有 → 佩戴/取消佩戴；不在售卖时间窗 → 已过可购买时间；
//   seedBonus < 价格 → 需要更多电力值；否则 → 购买
// 库存展示为 `inventory || "无限"`，不参与可购买判定。
const ZMPT_MEDALS_API = "https://zmpt.cc/javaapi/user/queryAllMedals";

// "YYYY-MM-DD HH:mm:ss" 墙钟字符串 → epoch 秒。
// 站点为中文站，时间串按 UTC+8 墙钟理解（与站点展示一致，避免依赖运行机器时区）。
const parseWallClockTime = (str) => {
  if (!str || typeof str !== "string") return 0;
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  const [, year, month, day, hour, minute, second] = m.map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute, second) / 1000) - 8 * 3600;
};

// queryAllMedals 响应 → 标准勋章对象数组。
// 过滤链顺序与站点前端一致：未拥有 → 售卖窗内 → 余额足够。
const parseZmptApiMedals = (json, nowSec) => {
  const result = json && json.result;
  if (!result || !Array.isArray(result.medalGroups)) return [];
  const balance = Number(result.seedBonus);
  const now = typeof nowSec === "number" ? nowSec : Math.floor(Date.now() / 1000);
  const medals = [];

  for (const group of result.medalGroups) {
    const list = (group && group.medalList) || [];
    for (const m of list) {
      if (!m || typeof m !== "object") continue;
      // 已拥有：前端以 userMedalsVO 判定，hasMedal 为同义冗余字段
      if (m.userMedalsVO || m.hasMedal) continue;
      const begin = parseWallClockTime(m.saleBeginTime);
      const end = parseWallClockTime(m.saleEndTime);
      // 无售卖时间窗（如官组勋章）或未开始/已结束
      if (!begin || !end || now < begin || now > end) continue;
      const price = Number(m.price) || 0;
      // 买不起：前端显示禁用的「需要更多电力值」，与其它站点的买不起口径一致
      if (Number.isFinite(balance) && price > balance) continue;

      const bonus = Number(m.bonusAdditionFactor);
      medals.push({
        name: String(m.name || "未知勋章"),
        price: price.toLocaleString("en-US"),
        duration: m.duration > 0 ? `${m.duration} 天` : "永久有效",
        bonus: bonus > 0 ? `${trimNumber(bonus * 100)}%` : "0%",
        // 站点展示为 inventory || "无限"（0/缺失都显示无限）
        stock: m.inventory ? String(m.inventory) : "无限",
        timeRange: `${m.saleBeginTime} - ${m.saleEndTime}`,
        medalId: String(m.id ?? ""),
      });
    }
  }
  return medals;
};

// zmpt 勋章扫描：Cookie 直接调 queryAllMedals，无需开标签页渲染。
// 出错时抛异常，由调用方的 try/catch 统一记录日志。
async function scanZmptApi(siteUrl, cookies) {
  const res = await fetchWithTimeout(
    ZMPT_MEDALS_API,
    {
      headers: {
        Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
        "User-Agent": navigator.userAgent,
      },
    },
    10000,
  );
  if (!res.ok) {
    throw new Error(`勋章接口请求失败 (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (!json || json.success !== true || !json.result) {
    const reason = json && json.errorMsg ? json.errorMsg : "响应格式异常";
    throw new Error(`勋章接口返回失败 (${reason})`);
  }
  const medals = parseZmptApiMedals(json);
  const seed = Number(json.result.seedBonus);
  const balance = Number.isFinite(seed) && seed > 0 ? seed : null;
  // 调试包保存接口原始 JSON（比渲染后 HTML 更利于排查字段变化）
  const pageHtmls = [{ url: siteUrl, html: JSON.stringify(json) }];
  return { medals, balance, pageHtmls, pageCount: 1 };
}

// ===== yemapt.org（umi SPA + JSON API，积分兑换制）=====
// 页面只渲染当前分组的徽章（42 个分散在 8 个分组），且「立即兑换」按钮恒可用
// （站点提示"兑换前，请先确认是否满足兑换条件"，服务端才校验），
// 因此必须走 API 并自行核对全部条件——只上报「条件全部满足且当前可兑换」的徽章。
const YEMAPT_API_BASE = "https://www.yemapt.org/api";

// 条件字段与用户数据的对应关系（字段语义经站点前端与管理端表单核实）。
// 时间为 null/空表示无限制；数值条件为 0 表示无要求。
const parseYemaptBadges = (badgeJson, profile, checkIn, nowSec) => {
  const list =
    (badgeJson && badgeJson.data && badgeJson.data.badgeUserInfoList) || [];
  if (!Array.isArray(list) || list.length === 0) return [];
  const user = profile || {};
  const now = typeof nowSec === "number" ? nowSec : Math.floor(Date.now() / 1000);
  const bonus = Number(user.bonus) || 0;
  const level = Number(user.level) || 0;
  const uploadSize = Number(user.promotionUploadSize) || 0;
  const downloadSize = Number(user.promotionDownloadSize) || 0;
  const invitedNum = Number(user.invitedNum) || 0;
  const validTorrentNum = Number(user.ownerValidTorrentNum) || 0;
  const seededTorrentNum = Number(user.ownerSeededTorrentNum) || 0;
  const checkInDays = Number(checkIn && checkIn.continuousCheckInDays) || 0;
  // 注册天数：按墙钟解析注册时间后取整
  const registerAt = parseWallClockTime(user.registerTime);
  const registerDays = registerAt > 0 ? Math.floor((now - registerAt) / 86400) : 0;

  const medals = [];
  for (const item of list) {
    const badge = item && item.badge;
    if (!badge) continue;
    if (item.has) continue; // 已获得
    const c = badge.condition || {};

    // 兑换时间窗（起兑/截止均可缺省）
    const begin = parseWallClockTime(c.startTime);
    const end = parseWallClockTime(c.endTime);
    if (begin > 0 && now < begin) continue;
    if (end > 0 && now > end) continue;

    // 数量上限：numLimit > 0 时按全站已获得数判断是否已兑完
    const numLimit = Number(c.numLimit) || 0;
    const globalHasNum = Number(badge.globalHasNum) || 0;
    if (numLimit > 0 && globalHasNum >= numLimit) continue;

    // 全部条件逐一核对，任一不满足即排除
    if (Number(c.requiredPoint) > bonus) continue;
    if (Number(c.level) > level) continue;
    if (Number(c.continuousCheckIn) > checkInDays) continue;
    if (Number(c.promotionUploadSize) > uploadSize) continue;
    if (Number(c.promotionDownloadSize) > downloadSize) continue;
    if (Number(c.inviteQualifyNum) > invitedNum) continue;
    if (Number(c.registerDays) > registerDays) continue;
    if (Number(c.validTorrentNum) > validTorrentNum) continue;
    if (Number(c.seededTorrentNum) > seededTorrentNum) continue;

    medals.push({
      name: String(badge.keyShowName || "未知徽章"),
      price: (Number(c.requiredPoint) || 0).toLocaleString("en-US"),
      duration: "永久有效",
      bonus: "0%",
      stock: numLimit > 0 ? String(Math.max(0, numLimit - globalHasNum)) : "无限",
      timeRange:
        begin > 0 || end > 0
          ? `${c.startTime || "不限"} ~ ${c.endTime || "不限"}`
          : "不限",
      medalId: String(badge.id ?? ""),
    });
  }
  return medals;
};

// yemapt 徽章扫描：并行拉取徽章列表 / 用户详情 / 签到信息，按条件全满足过滤。
// 出错时抛异常，由调用方的 try/catch 统一记录日志。
async function scanYemaptBadges(siteUrl, cookies) {
  const headers = {
    Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "User-Agent": navigator.userAgent,
  };
  const [badgeRes, detailRes, checkInRes] = await Promise.all([
    fetchWithTimeout(`${YEMAPT_API_BASE}/badge/fetchBadgeList`, { headers }, 10000),
    fetchWithTimeout(`${YEMAPT_API_BASE}/consumer/fetchSelfDetail`, { headers }, 10000),
    fetchWithTimeout(`${YEMAPT_API_BASE}/consumer/fetchCheckInPageInfo`, { headers }, 10000),
  ]);
  if (!badgeRes.ok) {
    throw new Error(`徽章接口请求失败 (HTTP ${badgeRes.status})`);
  }
  const badgeJson = await badgeRes.json();
  if (!badgeJson || badgeJson.success !== true) {
    throw new Error("徽章接口返回失败（可能未登录）");
  }
  // 用户详情/签到信息缺失时按空数据处理：条件里相应要求非 0 的徽章会被自然排除
  const detailJson = detailRes.ok ? await detailRes.json() : {};
  const checkInJson = checkInRes.ok ? await checkInRes.json() : {};
  const profile = (detailJson && detailJson.data) || {};
  const checkIn = (checkInJson && checkInJson.data) || {};

  const medals = parseYemaptBadges(badgeJson, profile, checkIn);
  const bonus = Number(profile.bonus);
  const balance = Number.isFinite(bonus) && bonus > 0 ? bonus : null;
  // 调试包保存徽章接口原始响应
  const pageHtmls = [{ url: siteUrl, html: JSON.stringify(badgeJson) }];
  return { medals, balance, pageHtmls, pageCount: 1 };
}

// ===== sunnypt.top（Next.js SPA + 独立 API）=====
// 页面 HTML 只是客户端渲染的空壳（约 30KB，无勋章数据），数据来自
// api.sunnypt.top 的 JSON 接口，认证方式为 NextAuth 会话中的 JWT：
//   1) GET https://sunnypt.top/api/auth/session（带 Cookie）→ data.accessToken
//   2) GET https://api.sunnypt.top/api/v1/medals/list（Authorization: Bearer <JWT>）
// 因此无需像 zmpt 那样开标签页渲染，纯 HTTP 即可直抓。
const SUNNYPT_API_BASE = "https://api.sunnypt.top";

// Unix 秒 → "YYYY-MM-DD HH:mm"（按 UTC+8 格式化，与站点自身展示一致；
// 加 8 小时后用 UTC getter 取值，避免依赖运行机器的时区）
const formatSunnyptTime = (unixSec) => {
  if (!unixSec || unixSec <= 0) return "不限";
  const d = new Date((unixSec + 8 * 3600) * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

// 数字去尾零：1 → "1"、0.5 → "0.5"（用于加成百分比展示）
const trimNumber = (num) => String(Number(num.toFixed(4)));

// 将 medals/list 接口数据映射为标准勋章对象。
// 「可购买」判定复刻 Web 端按钮逻辑：售卖时间窗内 + 未拥有 + 有库存；
// 余额不足不在此排除——前端「魔力不足」筛选按 balance 过滤，与其它站点语义一致。
const parseSunnyptMedals = (listData, myData, nowSec) => {
  if (!Array.isArray(listData)) return [];
  const ownedIds = new Set(
    (Array.isArray(myData) ? myData : [])
      .map((m) => m && m.medal_id)
      .filter((id) => id != null),
  );
  const now = typeof nowSec === "number" ? nowSec : Math.floor(Date.now() / 1000);
  const medals = [];

  for (const item of listData) {
    if (!item || typeof item !== "object") continue;
    const begin = Number(item.sale_begin_time) || 0;
    const end = Number(item.sale_end_time) || 0;
    // 未开始或已结束的售卖窗口
    if (begin > 0 && now < begin) continue;
    if (end > 0 && now > end) continue;
    // 已拥有（medals/my 返回 [{ medal_id, expire_at }]）
    if (ownedIds.has(item.id)) continue;
    // 库存：-1 为无限，0 为售罄
    const inventory = Number(item.inventory);
    if (inventory === 0) continue;

    const bonus = Number(item.bonus_addition_factor);
    medals.push({
      name: String(item.name || "未知勋章"),
      price: Number(item.price || 0).toLocaleString("en-US"),
      // duration 单位按天理解（当前在架勋章均为 0，即永久）
      duration: item.duration > 0 ? `${item.duration} 天` : "永久",
      // bonus_addition_factor 为加成比率（0.01 = 1%）
      bonus: bonus > 0 ? `${trimNumber(bonus * 100)}%` : "0%",
      stock: inventory < 0 ? "无限" : String(inventory),
      timeRange: `${formatSunnyptTime(begin)} ~ ${formatSunnyptTime(end)}`,
      medalId: String(item.id ?? ""),
    });
  }
  return medals;
};

// sunnypt 赏金页扫描：会话取 JWT → 并行拉取勋章列表/已拥有/贝利余额 → 映射过滤。
// 出错时抛异常，由调用方的 try/catch 统一记录日志。
async function scanSunnyptBounty(siteUrl, cookies) {
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const ua = { "User-Agent": navigator.userAgent };

  // 1. NextAuth 会话端点取 JWT（HttpOnly Cookie 由扩展的 chrome.cookies 读取）
  const sessionUrl = new URL("/api/auth/session", siteUrl).href;
  const sessionRes = await fetchWithTimeout(
    sessionUrl,
    { headers: { Cookie: cookieHeader, ...ua } },
    10000,
  );
  if (!sessionRes.ok) {
    throw new Error(`会话获取失败 (HTTP ${sessionRes.status})`);
  }
  const sessionJson = await sessionRes.json();
  const token = sessionJson && sessionJson.data && sessionJson.data.accessToken;
  if (!token) {
    throw new Error("未获取到访问令牌（可能未登录或会话已过期）");
  }

  // 2. 勋章列表 / 已拥有 / 贝利余额并行拉取（API 只需 Bearer 头，不带 Cookie）
  const authHeaders = { Authorization: `Bearer ${token}`, ...ua };
  const [listRes, myRes, bonusRes] = await Promise.all([
    fetchWithTimeout(`${SUNNYPT_API_BASE}/api/v1/medals/list`, { headers: authHeaders }, 10000),
    fetchWithTimeout(`${SUNNYPT_API_BASE}/api/v1/medals/my`, { headers: authHeaders }, 10000),
    fetchWithTimeout(`${SUNNYPT_API_BASE}/api/v1/user/seed-bonus`, { headers: authHeaders }, 10000),
  ]);
  if (!listRes.ok) {
    throw new Error(`勋章列表获取失败 (HTTP ${listRes.status})`);
  }
  const listJson = await listRes.json();
  const myJson = myRes.ok ? await myRes.json() : { data: [] };
  let balance = null;
  if (bonusRes.ok) {
    const bonusJson = await bonusRes.json();
    const seedBonus = bonusJson && bonusJson.data && bonusJson.data.seed_bonus;
    if (typeof seedBonus === "number" && seedBonus > 0) balance = seedBonus;
  }

  const medals = parseSunnyptMedals(listJson && listJson.data, myJson && myJson.data);
  // 调试包保存 API 原始响应（JSON 比渲染后 HTML 更有利于排查字段变化）
  const pageHtmls = [{ url: siteUrl, html: JSON.stringify(listJson) }];
  return { medals, balance, pageHtmls, pageCount: 1 };
}

// 扫描单个站点：抓取首页与全部分页，返回勋章列表（含页码/分页 URL 打标，
// 供前端点击跳转到勋章所在的具体分页）、魔力值与调试用页面 HTML。
// startScan（手动扫描）与 performScheduledScan（定时扫描）共用本函数，
// 保证两条路径的站点适配能力一致（卡片布局 / SPA / 分页全量抓取）。
async function scanSiteMedals(siteName, siteUrl, cookies, sendLog) {
  // API 直抓站点（静态 HTML 无勋章数据，但存在可直连的 JSON 接口）
  // sunnypt.top：Next.js SPA，会话 JWT → api.sunnypt.top
  if (siteUrl.includes("sunnypt.top/bounty")) {
    return await scanSunnyptBounty(siteUrl, cookies);
  }
  // zmpt.cc：Vite SPA，Cookie 直调 /javaapi/user/queryAllMedals
  if (siteUrl.includes("zmpt.cc/medal.php")) {
    return await scanZmptApi(siteUrl, cookies);
  }
  // yemapt.org：umi SPA，Cookie 直调 /api/badge/fetchBadgeList 等（积分兑换制）
  if (siteUrl.includes("yemapt.org")) {
    return await scanYemaptBadges(siteUrl, cookies);
  }

  const pageHtmls = [{ url: siteUrl, html: "" }];
  const fetchPage = (url) =>
    fetchWithTimeout(
      url,
      {
        headers: {
          Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
          "User-Agent": navigator.userAgent,
        },
      },
      10000,
    ).then((response) => response.text());

  const response = await fetchWithTimeout(
    siteUrl,
    {
      headers: {
        Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
        "User-Agent": navigator.userAgent,
      },
    },
    10000,
  );
  if (!response.ok) {
    sendLog(`请求失败：${siteName} (HTTP ${response.status})`, true);
    return { medals: [], balance: null, pageHtmls, pageCount: 0 };
  }

  const html = await response.text();
  pageHtmls[0].html = html;

  const isPterclub = html.includes('name="medalchosen"');
  const isBuyCenter = siteUrl.includes("buycenter.php");
  let medals = isBuyCenter
    ? extractMedalsFromBuyCenter(html)
    : extractMedalsFromHtml(html);

  // SPA 壳页面（zmpt.cc 的 Vite 应用、yemapt.org 的 umi 应用）：
  // 静态 HTML 只有一个空挂载点，必须在后台标签页渲染后再提取
  if (medals.length === 0 && isSpaShell(html)) {
    sendLog(`${siteName}: 检测到 SPA 页面，正在后台渲染提取...`);
    const renderedHtml = await extractMedalsFromZmpt(siteUrl, cookies);
    if (renderedHtml) {
      pageHtmls[0].html = renderedHtml;
      medals = isBuyCenter
        ? extractMedalsFromBuyCenter(renderedHtml)
        : extractMedalsFromHtml(renderedHtml);
    }
  }

  // 第 1 页勋章打标（用于前端跳转具体分页）
  medals = tagMedalsWithPage(medals, 1, siteUrl);
  // 尝试提取用户当前魔力值，用于「魔力不足」筛选
  const balance = extractMagicBalance(html);

  // 分页索引约定自适应：0 索引站点（base 即第 0 页）的分页条一定链接
  // ?page=1；1 索引站点（base 即第 1 页）通常从 ?page=2 起链。
  // 据此决定页码显示用 N+1 还是 N（URL 始终使用实际抓取的分页地址）。
  const basePageNumbers = collectPageNumbers(html, isPterclub);
  let zeroIndexed = basePageNumbers.includes(1);
  const pending = new Set(basePageNumbers);
  const fetched = new Set();
  let pageCount = 0;

  // 工作流式抓取：每抓一页就从该页分页条发现新页码，始终优先抓取
  // 最小待抓页码，保证勋章列表按分页顺序排列
  while (pending.size > 0 && pageCount < MAX_PAGE_FETCHES) {
    const pageNum = Math.min(...pending);
    pending.delete(pageNum);
    if (fetched.has(pageNum)) continue;
    fetched.add(pageNum);

    const pageUrl = buildPageUrl(siteUrl, pageNum, isPterclub);
    let pageHtml;
    try {
      pageHtml = await fetchPage(pageUrl);
    } catch (error) {
      if (error.name === "AbortError") {
        sendLog(`分页请求超时：${siteName} 第${pageNum}页`, true);
      } else {
        sendLog(
          `分页请求失败：${siteName} 第${pageNum}页 (${error.message})`,
          true,
        );
      }
      break;
    }

    pageHtmls.push({ url: pageUrl, html: pageHtml });
    for (const discovered of collectPageNumbers(pageHtml, isPterclub)) {
      if (!fetched.has(discovered)) pending.add(discovered);
    }

    const pageMedals = extractMedalsFromHtml(pageHtml);
    // 1 索引站点把当前页也链进分页条时，?page=1 会与首页重复：按名称集合
    // 去重，同时翻转索引假设，让后续分页按 1 索引约定显示页码
    if (pageNum === 1 && zeroIndexed && isSameMedalSet(medals, pageMedals)) {
      zeroIndexed = false;
      continue;
    }
    medals = medals.concat(
      tagMedalsWithPage(
        pageMedals,
        zeroIndexed ? pageNum + 1 : pageNum,
        pageUrl,
      ),
    );
    pageCount++;
  }

  return { medals, balance, pageHtmls, pageCount: pageCount + 1 };
}

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "detectSites") {
    const DETECT_TIMEOUT = 90000;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        sendResponse({
          found: [],
          notFound: [],
          total: DEFAULT_SITES.length,
          timedOut: true,
        });
      } catch {
        /* background may terminate */
      }
    }, DETECT_TIMEOUT);

    (async () => {
      const found = [];
      const notFound = [];
      const debugLogs = [];
      const total = DEFAULT_SITES.length;

      for (let i = 0; i < total; i++) {
        if (timedOut) break;
        const site = DEFAULT_SITES[i];
        const [name, url] = site.split("|");
        const startTime = Date.now();

        const sendProgress = (status, detail = "") => {
          try {
            chrome.runtime.sendMessage({
              type: "detectProgress",
              current: i + 1,
              total,
              siteName: name,
              siteUrl: url,
              status,
              detail,
              elapsed: Date.now() - startTime,
            });
          } catch {
            /* options page may close */
          }
        };

        sendProgress("checking");

        try {
          const domain = getCookieDomain(url);
          const [cookiesMain, cookiesSub] = await Promise.all([
            chrome.cookies.getAll({ url }),
            chrome.cookies.getAll({ domain }),
          ]);
          const allCookies = [...new Set([...cookiesMain, ...cookiesSub])];
          if (allCookies.length > 0) {
            found.push(site);
            debugLogs.push(`${name}: ✅ 已登录 (${allCookies.length} cookies)`);
            sendProgress("found", `${allCookies.length} 个 cookie`);
          } else {
            notFound.push(name);
            debugLogs.push(`${name}: ❌ 未登录`);
            sendProgress("notfound");
          }
        } catch (err) {
          notFound.push(name);
          debugLogs.push(`${name}: ⚠️ 检测异常 - ${err.message}`);
          sendProgress("error", err.message);
        }
      }

      clearTimeout(timer);
      if (!timedOut) {
        try {
          sendResponse({ found, notFound, total, timedOut: false, debugLogs });
        } catch {
          /* background may terminate */
        }
      }
    })();
    return true;
  }

  if (request.action === "startScan") {
    chrome.storage.local.get(["sites"], async ({ sites }) => {
      const results = [];
      const sendLog = (text, isError = false) => {
        chrome.runtime.sendMessage({ type: "scanLog", text, isError });
      };

      if (!sites || sites.length === 0) {
        sendLog("错误：未配置任何扫描站点", true);
        return;
      }

      const allPageHtmls = [];

      for (const site of sites) {
        const [siteName, siteUrl] = site.split("|");
        try {
          const domain = getCookieDomain(siteUrl);
          const [cookiesMain, cookiesSub] = await Promise.all([
            chrome.cookies.getAll({ url: siteUrl }),
            chrome.cookies.getAll({ domain }),
          ]);
          const cookies = [...new Set([...cookiesMain, ...cookiesSub])];

          if (cookies.length === 0) {
            sendLog(`警告：${siteName} 未找到有效Cookie`, true);
            continue;
          }

          const { medals, balance, pageHtmls, pageCount } =
            await scanSiteMedals(siteName, siteUrl, cookies, sendLog);
          allPageHtmls.push(...pageHtmls);

          if (pageCount === 0) continue;

          results.push({
            siteName,
            count: medals.length,
            url: siteUrl,
            medals,
            balance: balance != null ? balance : null,
          });
          sendLog(
            `${siteName}: 共${pageCount}页，发现 ${medals.length} 个可购买勋章${
              balance != null ? `，魔力值 ${balance}` : ""
            }`,
          );
        } catch (error) {
          if (error.name === "AbortError") {
            sendLog(`请求超时：${siteName}（10秒无响应）`, true);
          } else {
            sendLog(`扫描失败：${siteName} (${error.message})`, true);
          }
        }
      }

      const timestamp = Date.now();
      const dateStr = new Date(timestamp).toISOString().slice(0, 10);
      const scanEntry = { timestamp, dateStr, results };

      await chrome.storage.local.set({ scanResults: results });

      const debugData = { timestamp: Date.now(), dateStr, pages: allPageHtmls };
      chrome.storage.local.set({ debugData });

      // 差异基准：取「本次扫描之前」最近一次扫描结果，
      // 随 scanResult 消息返回给前端，避免连续多次扫描时把上一次已出现过的勋章再次误标为 NEW。
      chrome.storage.local.get(["scanHistory"], ({ scanHistory }) => {
        const history = scanHistory || [];
        const prevEntry = history.length > 0 ? history[history.length - 1] : null;
        const previousResults = prevEntry ? prevEntry.results : null;

        history.push(scanEntry);
        if (history.length > 60) history.shift();
        chrome.storage.local.set({ scanHistory: history });

        chrome.runtime.sendMessage({ type: "scanResult", data: results, previousResults });
      });
    });
  }
  if (request.action === "updateScheduleConfig") {
    const { scheduleConfig } = request;
    setupAlarm(scheduleConfig);
    sendResponse({ success: true });
    return true;
  }

  return true;
});

// ===== 定时任务 & 飞书推送 =====

const ALARM_NAME = "dailyMedalScan";

function sendToFeishu(webhookUrl, results, scanTime) {
  const totalMedals = results.reduce((sum, r) => sum + r.count, 0);
  const validSites = results.filter((r) => r.count > 0);

  const lines = [
    [{ tag: "text", text: `扫描时间: ${scanTime}` }],
    [
      {
        tag: "text",
        text: `共扫描 ${results.length} 个站点，发现 ${totalMedals} 个可购买勋章`,
      },
    ],
    [{ tag: "text", text: "" }],
  ];

  if (validSites.length === 0) {
    lines.push([{ tag: "text", text: "😴 没有发现可购买的勋章" }]);
  } else {
    for (const site of validSites) {
      lines.push([
        { tag: "text", text: `\n📌 ${site.siteName}（${site.count}个）` },
      ]);
      for (const medal of site.medals) {
        const parts = [`  • ${medal.name}`];
        if (medal.price) parts.push(`💰${medal.price}`);
        if (medal.duration) parts.push(`⏱${medal.duration}`);
        if (medal.bonus) parts.push(`📈${medal.bonus}`);
        lines.push([{ tag: "text", text: parts.join(" ") }]);
      }
    }
  }

  const payload = {
    msg_type: "post",
    content: {
      post: {
        zh_cn: {
          title: "🏅 PT勋章扫描报告",
          content: lines,
        },
      },
    },
  };

  return fetchWithTimeout(
    webhookUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    15000,
  );
}

function setupAlarm(scheduleConfig) {
  chrome.alarms.clear(ALARM_NAME, () => {
    if (!scheduleConfig || !scheduleConfig.enabled) return;

    const [hour, minute] = scheduleConfig.time.split(":").map(Number);
    const now = new Date();
    const scheduled = new Date(now);
    scheduled.setHours(hour, minute, 0, 0);
    if (scheduled <= now) scheduled.setDate(scheduled.getDate() + 1);
    const delayMs = scheduled - now;
    const delayMinutes = Math.ceil(delayMs / 60000);

    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: delayMinutes,
      periodInMinutes: 1440,
    });
  });
}

async function performScheduledScan() {
  const { sites, scheduleConfig } = await chrome.storage.local.get([
    "sites",
    "scheduleConfig",
  ]);
  const webhookUrl = scheduleConfig?.webhookUrl;

  if (!sites || sites.length === 0) return;
  if (!webhookUrl) return;

  const results = [];
  // 定时扫描静默执行：sendLog 为空操作，避免向选项页发送消息
  const sendLog = () => {};

  for (const site of sites) {
    const [siteName, siteUrl] = site.split("|");
    try {
      const domain = getCookieDomain(siteUrl);
      const [cookiesMain, cookiesSub] = await Promise.all([
        chrome.cookies.getAll({ url: siteUrl }),
        chrome.cookies.getAll({ domain }),
      ]);
      const cookies = [...new Set([...cookiesMain, ...cookiesSub])];

      if (cookies.length === 0) continue;

      const { medals, balance, pageCount } = await scanSiteMedals(
        siteName,
        siteUrl,
        cookies,
        sendLog,
      );
      if (pageCount === 0) continue;

      results.push({
        siteName,
        count: medals.length,
        url: siteUrl,
        medals,
        balance: balance != null ? balance : null,
      });
    } catch {
      // skip failed sites silently
    }
  }

  const now = new Date();
  const scanTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dateStr = now.toISOString().slice(0, 10);
  const timestamp = Date.now();

  const scanEntry = { timestamp, dateStr, results };
  const { scanHistory } = await chrome.storage.local.get(["scanHistory"]);
  const history = scanHistory || [];
  history.push(scanEntry);
  if (history.length > 60) history.shift();
  await chrome.storage.local.set({
    scanResults: results,
    scanHistory: history,
  });

  try {
    await sendToFeishu(webhookUrl, results, scanTime);
  } catch {
    // silently fail
  }
}

chrome.runtime.onStartup?.addListener(() => {
  chrome.storage.local.get(["scheduleConfig"], ({ scheduleConfig }) => {
    setupAlarm(scheduleConfig);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["scheduleConfig"], ({ scheduleConfig }) => {
    setupAlarm(scheduleConfig);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    performScheduledScan();
  }
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getCookieDomain,
    fetchWithTimeout,
    extractMedalsFromHtml,
    extractTdText,
    getColumnLayout,
    extractMedalsFromBuyCenter,
    extractMedalsFromCards,
    extractMedalsFromPterclub,
    extractMedalsFromZmpt,
    extractMedalsFromMedalItems,
    extractMedalsFromHhanclub,
    extractMedalsFromSiqi,
    extractMedalsFromZmptNew,
    extractMagicBalance,
    parsePriceNumber,
    tagMedalsWithPage,
    isSpaShell,
    collectPageNumbers,
    buildPageUrl,
    scanSiteMedals,
    scanSunnyptBounty,
    parseSunnyptMedals,
    formatSunnyptTime,
    scanZmptApi,
    parseZmptApiMedals,
    scanYemaptBadges,
    parseYemaptBadges,
    parseWallClockTime,
    sendToFeishu,
    setupAlarm,
    performScheduledScan,
    ALARM_NAME,
  };
}
