const getCookieDomain = url => {
  try {
    const u = new URL(url);
    const parts = u.hostname.split('.');
    return parts.length > 2 ? `.${parts.slice(-2).join('.')}` : u.hostname;
  } catch {
    return url;
  }
};
// 点击插件图标时打开 options 页面
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

          const response = await fetch(siteUrl, {
            headers: {
              Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
              'User-Agent': navigator.userAgent
            }
          });

          if (!response.ok) {
            sendLog(`请求失败：${siteName} (HTTP ${response.status})`, true);
            continue;
          }

          const html = await response.text();
          let count = (html.match(/value="购买"/g) || []).length;
          let all_pages=1
          for (let i=1;i<5;i++)
          {
              const query_str = `href\\s*=\\s*["']\\?page=${i}["']`;
              let re = new RegExp(query_str, 'g');
              let has_next_page = (html.match(re) || []).length;
              if (has_next_page>0)
              {
                  let  new_url=siteUrl+"?page="+i;
                  let  response2 = await fetch(new_url, {
                       headers: {
                       Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
                       'User-Agent': navigator.userAgent
                      }
                  });
                  let html2 = await response2.text();
                  let count2 = (html2.match(/value="购买"/g) || []).length;
                  count= count+count2;
                  all_pages=all_pages+1;
              }else
              {
                  break;
              }

          
          }
          results.push({ siteName, count, url: siteUrl });
          sendLog(`${siteName}: 共${all_pages}页，发现 ${count} 个可购买勋章`);
        } catch (error) {
          sendLog(`扫描失败：${siteName} (${error.message})`, true);
        }
      }

      await chrome.storage.local.set({ scanResults: results });
      chrome.runtime.sendMessage({ type: 'scanResult', data: results });
    });
  }
  return true;
});
