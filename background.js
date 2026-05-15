const getCookieDomain = url => {
  try {
    const u = new URL(url);
    const parts = u.hostname.split('.');
    return parts.length > 2 ? `.${parts.slice(-2).join('.')}` : u.hostname;
  } catch {
    // Handle URLs without protocol
    if (url.includes('/')) return url.split('/')[0];
    return url;
  }
};

const fetchWithTimeout = (url, options = {}, timeout = 10000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));
};

const getColumnLayout = (tdsLength) => {
  if (tdsLength <= 0) return null;
  if (tdsLength % 10 === 0) return { stride: 10, actionIdx: 8, nameIdx: 2, priceIdx: 6, durationIdx: 4, bonusIdx: 5, stockIdx: 7, timeIdx: 3 };
  if (tdsLength % 9 === 0) return { stride: 9, actionIdx: 7, nameIdx: 1, priceIdx: 5, durationIdx: 3, bonusIdx: 4, stockIdx: 6, timeIdx: 2 };
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
      const actionTd = group[layout.actionIdx] || '';
      if (!actionTd.includes('value="购买"') && !actionTd.includes('value="購買"')) continue;

      const medalIdMatch = actionTd.match(/name="medal"\s+value="(\d+)"/);
      const medalId = medalIdMatch ? medalIdMatch[1] : '';

      const nameText = extractTdText(group[layout.nameIdx] || '');
      const nameH1 = nameText.match(/^(.+?)(?:\n|$)/);
      const name = nameH1 ? nameH1[1].trim() : '未知勋章';

      const price = extractTdText(group[layout.priceIdx] || '').trim();

      const durationRaw = extractTdText(group[layout.durationIdx] || '').trim();
      const duration = durationRaw === '不限' ? '不限' : durationRaw;

      const bonus = extractTdText(group[layout.bonusIdx] || '').trim();
      const stock = extractTdText(group[layout.stockIdx] || '').trim();

      const timeRaw = extractTdText(group[layout.timeIdx] || '').trim();
      const timeRange = timeRaw === '不限 ~ 不限' ? '不限' : timeRaw;

      medals.push({ name, price, duration, bonus, stock, timeRange, medalId });
    }
  }

  if (medals.length === 0) {
    const cardMedals = extractMedalsFromCards(html);
    if (cardMedals.length > 0) return cardMedals;
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

    const actionTd = tds[5] || '';
    if (!actionTd.includes('交换') || actionTd.includes('disabled')) continue;

    const nameHtml = tds[1] || '';
    const nameText = extractTdText(nameHtml);

    if (nameText.length < 10 || nameText === '简介') continue;

    const markerIdx = nameText.indexOf(' ⠀');
    const name = markerIdx > 0 ? nameText.substring(0, markerIdx).trim() : nameText;

    const price = extractTdText(tds[4] || '').trim();

    const stock = extractTdText(tds[2] || '').trim();

    const durationMatch = nameText.match(/(\d+)\s*天|永久/);
    const duration = durationMatch ? durationMatch[0] : '';

    const timeMatch = nameText.match(/可购买时间:\s*([^)]+)/);
    const timeRange = timeMatch ? timeMatch[1].trim() : '';

    medals.push({ name, price, duration, stock, timeRange });
  }

  return medals;
};

const extractMedalsFromCards = (html) => {
  const medals = [];
  const startTag = '<div class="medal-cards">';
  const startIdx = html.indexOf(startTag);
  if (startIdx < 0) return medals;

  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx; i < html.length; i++) {
    if (html[i] === '<') {
      const tagEnd = html.indexOf('>', i);
      if (tagEnd < 0) break;
      const tag = html.substring(i, tagEnd + 1);
      if (tag.startsWith('<div ') || tag.startsWith('<div>')) depth++;
      else if (tag.startsWith('</div>')) {
        depth--;
        if (depth === 0) { endIdx = tagEnd + 1; break; }
      }
      i = tagEnd;
    }
  }
  if (endIdx < 0) return medals;

  const section = html.substring(startIdx, endIdx);

  const cards = [];
  let pos = 0;
  while (pos < section.length) {
    const cardStart = section.indexOf('<div class="medal-card ', pos);
    if (cardStart < 0) break;

    let d = 0;
    let cardEnd = -1;
    for (let i = cardStart; i < section.length; i++) {
      if (section[i] === '<') {
        const tagEnd = section.indexOf('>', i);
        if (tagEnd < 0) break;
        const tag = section.substring(i, tagEnd + 1);
        if (tag.startsWith('<div ') || tag.startsWith('<div>')) d++;
        else if (tag.startsWith('</div>')) {
          d--;
          if (d === 0) { cardEnd = tagEnd + 1; break; }
        }
        i = tagEnd;
      }
    }
    if (cardEnd > 0) {
      cards.push(section.substring(cardStart, cardEnd));
      pos = cardEnd;
    } else break;
  }

  for (const card of cards) {
    const actionMatch = card.match(/<input[^>]*\bclass="btn buy"[^>]*\/?\s*>/i);
    if (!actionMatch) continue;

    const actionHtml = actionMatch[0];
    if (!actionHtml.includes('value="购买"') && !actionHtml.includes('value="購買"')) continue;
    if (actionHtml.includes('disabled')) continue;

    const dataIdMatch = actionHtml.match(/data-id="(\d+)"/);
    const medalId = dataIdMatch ? dataIdMatch[1] : '';

    const nameMatch = card.match(/<div class="medal-name">([\s\S]*?)<\/div>/);
    const name = nameMatch ? nameMatch[1].trim() : '';

    let price = '', duration = '', bonus = '', stock = '', timeRange = '';
    const fieldPairs = card.match(/<strong>([^<]+)<\/strong>([\s\S]*?)<\/div>/g) || [];
    for (const pair of fieldPairs) {
      const labelMatch = pair.match(/<strong>([^<]+)<\/strong>/);
      const val = pair.replace(/<[^>]+>/g, '').replace(/：/g, ':').replace(/^[^:]*[:：]\s*/, '').trim();
      if (!labelMatch) continue;
      const label = labelMatch[1].replace(/[：:]/g, '').trim();
      if (label.includes('价格') || label.includes('價格')) price = val;
      else if (label.includes('有效期')) duration = val;
      else if (label.includes('加成')) bonus = val;
      else if (label.includes('库存') || label.includes('庫存')) stock = val;
      else if (label.includes('可购买') || label.includes('可購買')) timeRange = val;
    }

    if (name) medals.push({ name, price, duration, bonus, stock, timeRange, medalId });
  }
  return medals;
};

const extractTdText = (tdHtml) => {
  return tdHtml
    .replace(/<h1[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const DEFAULT_SITES = [
  '13city.org|https://13city.org/medal.php',
  '1ptba.com|https://1ptba.com/medal.php',
  '52movie.top|https://www.52movie.top/medal.php',
  'agsvpt.com|https://www.agsvpt.com/medal.php',
  'bilibili.download|https://bilibili.download/medal.php',
  'cangbao.ge|https://cangbao.ge/medal.php',
  'carpt.net|https://carpt.net/medal.php',
  'cc.mypt.cc|https://cc.mypt.cc/medal.php',
  'crabpt.vip|https://crabpt.vip/medal.php',
  'cspt.top|https://cspt.top/medal.php',
  'cyanbug.net|https://cyanbug.net/medal.php',
  'discfan.net|https://discfan.net/medal.php',
  'dubhe.site|https://dubhe.site/medal.php',
  'duckboobee.org|https://duckboobee.org/medal.php',
  'gamegamept.com|https://www.gamegamept.com/medal.php',
  'greatposterwall.com|https://greatposterwall.com/medal.php',
  'hdfans.org|http://hdfans.org/medal.php',
  'hdkyl.in|https://www.hdkyl.in/medal.php',
  'hdpt.xyz|https://hdpt.xyz/medal.php',
  'hdtime.org|https://hdtime.org/medal.php',
  'hdvideo.one|https://hdvideo.one/medal.php',
  'hitpt.com|https://www.hitpt.com/medal.php',
  'htpt.cc (buycenter)|https://www.htpt.cc/buycenter.php',
  'hxpt.org|https://www.hxpt.org/medal.php',
  'icc2022.com|https://www.icc2022.com/medal.php',
  'kamept.com|https://kamept.com/medal.php',
  'kufei.org|https://kufei.org/medal.php',
  'leaves.red|https://leaves.red/medal.php',
  'lemonhd.net|https://lemonhd.net/medal.php',
  'momentpt.top|https://www.momentpt.top/medal.php',
  'njtupt.top|https://njtupt.top/medal.php',
  'okpt.net|https://www.okpt.net/medal.php',
  'oshen.win|http://www.oshen.win/medal.php',
  'p.t-baozi.cc|https://p.t-baozi.cc/medal.php',
  'pandapt.net|https://pandapt.net/medal.php',
  'piggo.me|https://piggo.me/medal.php',
  'playletpt.xyz|https://playletpt.xyz/medal.php',
  'pt.0ff.cc|https://pt.0ff.cc/medal.php',
  'pt.aling.de|https://pt.aling.de/medal.php',
  'pt.gtkpw.xyz|https://pt.gtkpw.xyz/medal.php',
  'pt.lajidui.top|https://pt.lajidui.top/medal.php',
  'pt.luckpt.de|https://pt.luckpt.de/medal.php',
  'pt.muxuege.org|https://pt.muxuege.org/medal.php',
  'pt.novahd.top|https://pt.novahd.top/medal.php',
  'pt.soulvoice.club|https://pt.soulvoice.club/medal.php',
  'pt.xingyungept.org|https://pt.xingyungept.org/medal.php',
  'ptcafe.club|https://ptcafe.club/medal.php',
  'pterclub.com|https://pterclub.com/medal.php',
  'ptfans.cc|https://ptfans.cc/medal.php',
  'ptlgs.org|https://ptlgs.org/medal.php',
  'ptskit.com|https://www.ptskit.com/medal.php',
  'ptzone.xyz|https://ptzone.xyz/medal.php',
  'qingwapt.com|https://qingwapt.com/medal.php',
  'raingfh.top|https://raingfh.top/medal.php',
  'rousi.zip|https://rousi.zip/medal.php',
  'sewerpt.com|https://sewerpt.com/medal.php',
  'si-qi.xyz|https://si-qi.xyz/medal.php',
  'springsunday.net (badges)|https://springsunday.net/badges.php',
  'tangpt.top|https://www.tangpt.top/medal.php',
  'tokyo-manga.top|https://www.tokyo-manga.top/medal.php',
  'totheglory.im (mall)|https://totheglory.im/mall.php',
  'ubits.club|https://ubits.club/medal.php',
  'wintersakura.net|https://wintersakura.net/medal.php',
  'wukongwendao.top|https://wukongwendao.top/medal.php',
  'xingtan.one|https://xingtan.one/medal.php',
  'yhpp.cc|https://www.yhpp.cc/medal.php',
  'zmpt.cc|https://zmpt.cc/medal.php',
  'zrpt.cc|https://zrpt.cc/medal.php',
];

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'detectSites') {
    const DETECT_TIMEOUT = 90000;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { sendResponse({ found: [], notFound: [], total: DEFAULT_SITES.length, timedOut: true }); } catch { /* background may terminate */ }
    }, DETECT_TIMEOUT);

    (async () => {
      const found = [];
      const notFound = [];
      const debugLogs = [];
      const total = DEFAULT_SITES.length;

      for (let i = 0; i < total; i++) {
        if (timedOut) break;
        const site = DEFAULT_SITES[i];
        const [name, url] = site.split('|');
        const startTime = Date.now();

        const sendProgress = (status, detail = '') => {
          try {
            chrome.runtime.sendMessage({
              type: 'detectProgress',
              current: i + 1,
              total,
              siteName: name,
              siteUrl: url,
              status,
              detail,
              elapsed: Date.now() - startTime
            });
          } catch { /* options page may close */ }
        };

        sendProgress('checking');

        try {
          const domain = getCookieDomain(url);
          const [cookiesMain, cookiesSub] = await Promise.all([
            chrome.cookies.getAll({ url }),
            chrome.cookies.getAll({ domain })
          ]);
          const allCookies = [...new Set([...cookiesMain, ...cookiesSub])];
          if (allCookies.length > 0) {
            found.push(site);
            debugLogs.push(`${name}: ✅ 已登录 (${allCookies.length} cookies)`);
            sendProgress('found', `${allCookies.length} 个 cookie`);
          } else {
            notFound.push(name);
            debugLogs.push(`${name}: ❌ 未登录`);
            sendProgress('notfound');
          }
        } catch (err) {
          notFound.push(name);
          debugLogs.push(`${name}: ⚠️ 检测异常 - ${err.message}`);
          sendProgress('error', err.message);
        }
      }

      clearTimeout(timer);
      if (!timedOut) {
        try { sendResponse({ found, notFound, total, timedOut: false, debugLogs }); } catch { /* background may terminate */ }
      }
    })();
    return true;
  }

  if (request.action === 'startScan') {
    chrome.storage.local.get(['sites'], async ({ sites }) => {
      const results = [];
      const sendLog = (text, isError = false) => {
        chrome.runtime.sendMessage({ type: 'scanLog', text, isError });
      };

      if (!sites || sites.length === 0) {
        sendLog('错误：未配置任何扫描站点', true);
        return;
      }

      const allPageHtmls = [];

      for (const site of sites) {
        const [siteName, siteUrl] = site.split('|');
        try {
          const domain = getCookieDomain(siteUrl);
          const [cookiesMain, cookiesSub] = await Promise.all([
            chrome.cookies.getAll({ url: siteUrl }),
            chrome.cookies.getAll({ domain })
          ]);
          const cookies = [...new Set([...cookiesMain, ...cookiesSub])];

          if (cookies.length === 0) {
            sendLog(`警告：${siteName} 未找到有效Cookie`, true);
            continue;
          }

          const response = await fetchWithTimeout(siteUrl, {
            headers: {
              Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
              'User-Agent': navigator.userAgent
            }
          }, 10000);

          if (!response.ok) {
            sendLog(`请求失败：${siteName} (HTTP ${response.status})`, true);
            continue;
          }

          const html = await response.text();
          const pageHtmls = [{ url: siteUrl, html }];
          allPageHtmls.push(...pageHtmls);
          let medals = siteUrl.includes('buycenter.php')
            ? extractMedalsFromBuyCenter(html)
            : extractMedalsFromHtml(html);
          let all_pages = 1;

          for (let i = 1; i < 15; i++) {
            const query_str = `href\\s*=\\s*["']\\?page=${i}["']`;
            const re = new RegExp(query_str, 'g');
            const has_next_page = (html.match(re) || []).length;

            if (has_next_page > 0) {
              try {
                const new_url = siteUrl + '?page=' + i;
                const response2 = await fetchWithTimeout(new_url, {
                  headers: {
                    Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
                    'User-Agent': navigator.userAgent
                  }
                }, 10000);

                const html2 = await response2.text();
                pageHtmls.push({ url: new_url, html: html2 });
                allPageHtmls.push({ url: new_url, html: html2 });
                const pageMedals = extractMedalsFromHtml(html2);
                medals = medals.concat(pageMedals);
                all_pages++;
              } catch (error) {
                if (error.name === 'AbortError') {
                  sendLog(`分页请求超时：${siteName} 第${i}页`, true);
                } else {
                  sendLog(`分页请求失败：${siteName} 第${i}页 (${error.message})`, true);
                }
                break;
              }
            } else {
              break;
            }
          }

          results.push({
            siteName,
            count: medals.length,
            url: siteUrl,
            medals
          });
          sendLog(`${siteName}: 共${all_pages}页，发现 ${medals.length} 个可购买勋章`);
        } catch (error) {
          if (error.name === 'AbortError') {
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

      chrome.storage.local.get(['scanHistory'], ({ scanHistory }) => {
        const history = scanHistory || [];
        history.push(scanEntry);
        if (history.length > 60) history.shift();
        chrome.storage.local.set({ scanHistory: history });
      });

      chrome.runtime.sendMessage({ type: 'scanResult', data: results });
    });
  }
if (request.action === 'updateScheduleConfig') {
    const { scheduleConfig } = request;
    setupAlarm(scheduleConfig);
    sendResponse({ success: true });
    return true;
  }

  return true;
});

// ===== 定时任务 & 飞书推送 =====

const ALARM_NAME = 'dailyMedalScan';

function sendToFeishu(webhookUrl, results, scanTime) {
  const totalMedals = results.reduce((sum, r) => sum + r.count, 0);
  const validSites = results.filter(r => r.count > 0);

  const lines = [
    [{ tag: 'text', text: `扫描时间: ${scanTime}` }],
    [{ tag: 'text', text: `共扫描 ${results.length} 个站点，发现 ${totalMedals} 个可购买勋章` }],
    [{ tag: 'text', text: '' }]
  ];

  if (validSites.length === 0) {
    lines.push([{ tag: 'text', text: '😴 没有发现可购买的勋章' }]);
  } else {
    for (const site of validSites) {
      lines.push([
        { tag: 'text', text: `\n📌 ${site.siteName}（${site.count}个）` }
      ]);
      for (const medal of site.medals) {
        const parts = [`  • ${medal.name}`];
        if (medal.price) parts.push(`💰${medal.price}`);
        if (medal.duration) parts.push(`⏱${medal.duration}`);
        if (medal.bonus) parts.push(`📈${medal.bonus}`);
        lines.push([{ tag: 'text', text: parts.join(' ') }]);
      }
    }
  }

  const payload = {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: '🏅 PT勋章扫描报告',
          content: lines
        }
      }
    }
  };

  return fetchWithTimeout(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, 15000);
}

function setupAlarm(scheduleConfig) {
  chrome.alarms.clear(ALARM_NAME, () => {
    if (!scheduleConfig || !scheduleConfig.enabled) return;

    const [hour, minute] = scheduleConfig.time.split(':').map(Number);
    const now = new Date();
    const scheduled = new Date(now);
    scheduled.setHours(hour, minute, 0, 0);
    if (scheduled <= now) scheduled.setDate(scheduled.getDate() + 1);
    const delayMs = scheduled - now;
    const delayMinutes = Math.ceil(delayMs / 60000);

    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: delayMinutes,
      periodInMinutes: 1440
    });
  });
}

async function performScheduledScan() {
  const { sites, scheduleConfig } = await chrome.storage.local.get(['sites', 'scheduleConfig']);
  const webhookUrl = scheduleConfig?.webhookUrl;

  if (!sites || sites.length === 0) return;
  if (!webhookUrl) return;

  const results = [];

  for (const site of sites) {
    const [siteName, siteUrl] = site.split('|');
    try {
      const domain = getCookieDomain(siteUrl);
      const [cookiesMain, cookiesSub] = await Promise.all([
        chrome.cookies.getAll({ url: siteUrl }),
        chrome.cookies.getAll({ domain })
      ]);
      const cookies = [...new Set([...cookiesMain, ...cookiesSub])];

      if (cookies.length === 0) continue;

      const response = await fetchWithTimeout(siteUrl, {
        headers: {
          Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
          'User-Agent': navigator.userAgent
        }
      }, 10000);

      if (!response.ok) continue;

      const html = await response.text();
      let medals = siteUrl.includes('buycenter.php')
        ? extractMedalsFromBuyCenter(html)
        : extractMedalsFromHtml(html);

      for (let i = 1; i < 15; i++) {
        const re = new RegExp(`href\\s*=\\s*["']\\?page=${i}["']`, 'g');
        if ((html.match(re) || []).length > 0) {
          try {
            const newUrl = siteUrl + '?page=' + i;
            const r2 = await fetchWithTimeout(newUrl, {
              headers: {
                Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
                'User-Agent': navigator.userAgent
              }
            }, 10000);
            const h2 = await r2.text();
            medals = medals.concat(extractMedalsFromHtml(h2));
          } catch {
            break;
          }
        } else {
          break;
        }
      }

      results.push({ siteName, count: medals.length, url: siteUrl, medals });
    } catch {
      // skip failed sites silently
    }
  }

  const now = new Date();
  const scanTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateStr = now.toISOString().slice(0, 10);
  const timestamp = Date.now();

  const scanEntry = { timestamp, dateStr, results };
  const { scanHistory } = await chrome.storage.local.get(['scanHistory']);
  const history = scanHistory || [];
  history.push(scanEntry);
  if (history.length > 60) history.shift();
  await chrome.storage.local.set({ scanResults: results, scanHistory: history });

  try {
    await sendToFeishu(webhookUrl, results, scanTime);
  } catch {
    // silently fail
  }
}

chrome.runtime.onStartup?.addListener(() => {
  chrome.storage.local.get(['scheduleConfig'], ({ scheduleConfig }) => {
    setupAlarm(scheduleConfig);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['scheduleConfig'], ({ scheduleConfig }) => {
    setupAlarm(scheduleConfig);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    performScheduledScan();
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getCookieDomain, fetchWithTimeout, extractMedalsFromHtml, extractTdText, getColumnLayout, extractMedalsFromBuyCenter, extractMedalsFromCards, sendToFeishu, setupAlarm, performScheduledScan, ALARM_NAME };
}