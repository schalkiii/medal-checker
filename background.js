const getCookieDomain = url => {
  try {
    const u = new URL(url);
    const parts = u.hostname.split('.');
    return parts.length > 2 ? `.${parts.slice(-2).join('.')}` : u.hostname;
  } catch {
    return url;
  }
};

// 带超时控制的fetch封装
const fetchWithTimeout = (url, options = {}, timeout = 10000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));
};

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

      for (const [index, site] of sites.entries()) {
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

          // 主请求（带10秒超时）
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
          let count = (html.match(/value="购买"/g) || []).length;
          let all_pages = 1;

          // 分页请求处理
          for (let i = 1; i < 15; i++) {
            const query_str = `href\\s*=\\s*["']\\?page=${i}["']`;
            let re = new RegExp(query_str, 'g');
            let has_next_page = (html.match(re) || []).length;

            if (has_next_page > 0) {
              try {
                const new_url = siteUrl + "?page=" + i;
                // 分页请求（带10秒超时）
                const response2 = await fetchWithTimeout(new_url, {
                  headers: {
                    Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
                    'User-Agent': navigator.userAgent
                  }
                }, 10000);

                const html2 = await response2.text();
                const count2 = (html2.match(/value="购买"/g) || []).length;
                count += count2;
                all_pages++;
              } catch (error) {
                // 分页请求错误处理
                if (error.name === 'AbortError') {
                  sendLog(`分页请求超时：${siteName} 第${i}页`, true);
                } else {
                  sendLog(`分页请求失败：${siteName} 第${i}页 (${error.message})`, true);
                }
                break; // 分页请求失败时停止后续分页
              }
            } else {
              break;
            }
          }

          results.push({ siteName, count, url: siteUrl });
          sendLog(`${siteName}: 共${all_pages}页，发现 ${count} 个可购买勋章`);
        } catch (error) {
          // 主请求错误处理
          if (error.name === 'AbortError') {
            sendLog(`请求超时：${siteName}（10秒无响应）`, true);
          } else {
            sendLog(`扫描失败：${siteName} (${error.message})`, true);
          }
        }
      }

      await chrome.storage.local.set({ scanResults: results });
      chrome.runtime.sendMessage({ type: 'scanResult', data: results });
    });
  }
  return true;
});
