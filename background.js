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
  if (tdsLength % 10 === 0) return { stride: 10, actionIdx: 8, nameIdx: 2, priceIdx: 6, durationIdx: 4 };
  if (tdsLength % 9 === 0) return { stride: 9, actionIdx: 7, nameIdx: 1, priceIdx: 5, durationIdx: 3 };
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

      medals.push({ name, price, duration });
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

    const durationMatch = nameText.match(/(\d+)\s*天|永久/);
    const duration = durationMatch ? durationMatch[0] : '';

    medals.push({ name, price, duration });
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