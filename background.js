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

      medals.push({ name, price, duration, bonus, stock, timeRange });
    }
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

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({ sites: DEFAULT_SITES });
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
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
  return true;
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getCookieDomain, fetchWithTimeout, extractMedalsFromHtml, extractTdText, getColumnLayout, extractMedalsFromBuyCenter };
}