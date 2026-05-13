const getCookieDomain = url => {
  try {
    const u = new URL(url);
    const parts = u.hostname.split('.');
    return parts.length > 2 ? `.${parts.slice(-2).join('.')}` : u.hostname;
  } catch {
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

const extractMedalsFromHtml = (html) => {
  const medals = [];
  const purchaseRegex = /<input[^>]*value="购买[^"]*"[^>]*>/gi;
  let match;
  const positions = [];

  while ((match = purchaseRegex.exec(html)) !== null) {
    positions.push(match.index);
  }

  for (const pos of positions) {
    const before = html.slice(Math.max(0, pos - 2000), pos);
    const after = html.slice(pos, pos + 2000);

    const containerStarts = [];
    const trIdx = before.lastIndexOf('<tr');
    if (trIdx !== -1) containerStarts.push(trIdx);
    if (trIdx === -1) {
      const tdIdx = before.lastIndexOf('<td');
      if (tdIdx !== -1) containerStarts.push(tdIdx);
    }
    if (containerStarts.length === 0) {
      const divIdx = before.lastIndexOf('<div');
      if (divIdx !== -1) containerStarts.push(divIdx);
    }

    let containerHtml;
    if (containerStarts.length > 0) {
      const start = Math.max(...containerStarts);
      containerHtml = html.slice(start, pos + 2000);
    } else {
      containerHtml = before + after;
    }

    const altMatch = containerHtml.match(/alt\s*=\s*["']([^"']+)["']/i);
    const altText = altMatch ? altMatch[1].trim() : '';

    const text = containerHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    extractMedalInfo(text, medals, altText);
  }

  return medals;
};

const extractMedalInfo = (text, medals, altText = '') => {
  const namePatterns = [
    /(?:勋章名称|名称|勋章|徽章)[：:]\s*(.+?)(?:\s|$)/,
  ];
  let name = '';
  for (const p of namePatterns) {
    const m = text.match(p);
    if (m) { name = m[1].trim(); break; }
  }
  if (!name && altText) {
    name = altText;
  }
  if (!name) {
    const lines = text.split(/[，。,.\n]/).filter(l => l.trim().length > 0 && l.trim().length < 30);
    name = lines[0] ? lines[0].trim() : '未知勋章';
  }

  const pricePatterns = [
    /(?:价格|售价|所需|需要|消耗|花费)[：:]\s*([\d,]+)/,
    /([\d,]+)\s*(?:积分|魔力|金币|银币|铜币| bonus|points?)/i,
  ];
  let price = '';
  for (const p of pricePatterns) {
    const m = text.match(p);
    if (m) { price = m[1].trim(); break; }
  }

  const durationPatterns = [
    /(?:有效期|时效|期限|持续时间|时长)[：:]\s*(.+?)(?:\s|$)/,
    /(永久|长期|无期限|不限时)/,
    /(\d+\s*(?:天|日|周|月|年|小时|day|week|month|year|hour))/i,
  ];
  let duration = '';
  for (const p of durationPatterns) {
    const m = text.match(p);
    if (m) { duration = m[1].trim(); break; }
  }

  medals.push({ name, price, duration });
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
          let medals = extractMedalsFromHtml(html);
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
  module.exports = { getCookieDomain, fetchWithTimeout, extractMedalsFromHtml, extractMedalInfo };
}