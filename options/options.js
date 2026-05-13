document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    sitesTextarea: document.getElementById('sites'),
    logElement: document.getElementById('scanLog'),
    importBtn: document.getElementById('importBtn'),
    exportBtn: document.getElementById('exportBtn'),
    saveBtn: document.getElementById('saveBtn'),
    fileInput: document.getElementById('fileInput'),
    scanBtn: document.getElementById('scanBtn'),
    openAllBtn: document.getElementById('openAllBtn'),
    resultList: document.getElementById('resultList'),
    resultStats: document.getElementById('resultStats'),
    clearResultsBtn: document.getElementById('clearResultsBtn'),
    diffToggleBtn: document.getElementById('diffToggleBtn')
  };

  let diffMode = false;
  let currentResults = null;
  let previousResults = null;

  const verifyElements = () => {
    Object.entries(elements).forEach(([name, element]) => {
      if (!element) {
        throw new Error(`关键元素 ${name} 未找到，请检查HTML结构`);
      }
    });
  };

  try {
    verifyElements();
    let isScanning = false;

    function addLog(message, isError = false) {
      const logEntry = document.createElement('div');
      logEntry.className = 'log-entry';
      logEntry.innerHTML = `
        <span class="timestamp">[${new Date().toLocaleTimeString()}]</span>
        <span style="color: ${isError ? '#e53935' : 'inherit'}">${message}</span>
      `;
      elements.logElement.appendChild(logEntry);
      elements.logElement.scrollTop = elements.logElement.scrollHeight;
    }

    elements.clearResultsBtn.addEventListener('click', () => {
      if (confirm('确定要清除所有扫描结果和历史记录吗？')) {
        chrome.storage.local.remove(['scanResults', 'scanHistory'], () => {
          elements.resultList.innerHTML = '<div class="empty-result">🔄 暂无扫描结果</div>';
          elements.resultStats.innerHTML = '';
          addLog('已清除所有扫描结果和历史记录');
        });
      }
    });

    function getMedalFingerprint(siteName, medal) {
      return `${siteName}::${medal.name}`;
    }

    function computeDiff(current, previous) {
      if (!previous || previous.length === 0) return {};

      const prevFingerprints = new Set();
      previous.forEach(site => {
        (site.medals || []).forEach(m => {
          prevFingerprints.add(getMedalFingerprint(site.siteName, m));
        });
      });

      const diffMap = {};
      current.forEach(site => {
        const newMedals = (site.medals || []).filter(m =>
          !prevFingerprints.has(getMedalFingerprint(site.siteName, m))
        );
        if (newMedals.length > 0) {
          diffMap[site.siteName] = new Set(newMedals.map(m => getMedalFingerprint(site.siteName, m)));
        }
      });

      return diffMap;
    }

    function updateResultDisplay(results) {
      currentResults = results;
      const validResults = results.filter(item => item.count > 0);
      elements.resultList.innerHTML = '';

      if (validResults.length === 0) {
        elements.resultList.innerHTML = '<div class="empty-result">🎯 点击扫描按钮开始检测</div>';
        elements.resultStats.innerHTML = '';
        return;
      }

      let diffMap = {};
      if (diffMode) {
        diffMap = computeDiff(results, previousResults);
      }

      const totalBadges = validResults.reduce((sum, item) => sum + item.count, 0);
      let totalNewBadges = 0;
      if (diffMode) {
        totalNewBadges = Object.values(diffMap).reduce((sum, s) => sum + s.size, 0);
      }

      elements.resultStats.innerHTML = `
        <div style="display: flex; justify-content: space-between; padding: 8px; flex-wrap: wrap; gap: 8px;">
          <span>🎯 有效站点：<strong>${validResults.length}</strong></span>
          <span>🏅 总勋章数：<strong style="color:#4CAF50;">${totalBadges}</strong></span>
          ${diffMode ? `<span>🆕 新增勋章：<strong style="color:#FF9800;">${totalNewBadges}</strong></span>` : ''}
          ${diffMode ? '<span style="color:#888; font-size:12px;">橙色高亮 = 本次新增</span>' : ''}
        </div>
      `;

      validResults.forEach(site => {
        const siteDiv = document.createElement('div');
        siteDiv.className = 'result-site';

        const header = document.createElement('div');
        header.className = 'result-site-header';
        header.innerHTML = `
          <div>
            <span class="result-site-name">${site.siteName}</span>
            <a class="result-site-link" href="${site.url}" target="_blank" title="点击跳转到勋章页面">🔗 ${site.url}</a>
          </div>
          <span class="result-site-count">${site.count} 勋章</span>
        `;
        siteDiv.appendChild(header);

        if (site.medals && site.medals.length > 0) {
          const medalList = document.createElement('div');
          medalList.className = 'medal-list';

          site.medals.forEach(medal => {
            const fp = getMedalFingerprint(site.siteName, medal);
            const isNew = diffMode && diffMap[site.siteName] && diffMap[site.siteName].has(fp);

            const medalItem = document.createElement('div');
            medalItem.className = 'medal-item' + (isNew ? ' new-medal' : '');

            const parts = [];
            if (medal.price) parts.push(`<span class="price">💰 ${medal.price}</span>`);
            if (medal.duration) parts.push(`<span class="duration">⏱ ${medal.duration}</span>`);

            medalItem.innerHTML = `
              <span class="medal-name">${medal.name}${isNew ? '<span class="diff-badge">NEW</span>' : ''}</span>
              <span class="medal-meta">${parts.join('')}</span>
            `;
            medalList.appendChild(medalItem);
          });

          siteDiv.appendChild(medalList);
        }

        elements.resultList.appendChild(siteDiv);
      });
    }

    chrome.storage.local.get(['sites', 'scanResults', 'scanHistory'], ({ sites, scanResults, scanHistory }) => {
      elements.sitesTextarea.value = sites?.join('\n') || '';
      if (scanResults) updateResultDisplay(scanResults);
      if (scanHistory && scanHistory.length >= 2) {
        previousResults = scanHistory[scanHistory.length - 2].results;
      }
    });

    elements.saveBtn.addEventListener('click', () => {
      const sites = elements.sitesTextarea.value
        .split('\n')
        .filter(line => line.includes('|'))
        .map(line => line.trim());

      if (sites.length === 0) {
        addLog('❌ 配置保存失败：未检测到有效数据', true);
        return;
      }

      chrome.storage.local.set({ sites }, () => {
        addLog(`✅ 配置已保存（${sites.length} 个站点）`);
      });
    });

    elements.importBtn.addEventListener('click', () => {
      elements.fileInput.value = '';
      elements.fileInput.click();
    });

    elements.fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await readFileAsText(file);
        const data = JSON.parse(text);

        if (!data?.sites || !Array.isArray(data.sites)) {
          throw new Error('缺少必要的 sites 数组');
        }

        const sites = data.sites.map(site => {
          if (!site.name || !site.url) {
            throw new Error('无效的站点格式');
          }
          const cleanUrl = site.url.replace(/\/+$/, '') + '/medal.php';
          return `${site.name}|${cleanUrl}`;
        });

        elements.sitesTextarea.value = sites.join('\n');
        addLog(`📥 成功导入 ${sites.length} 个站点`);

      } catch (error) {
        addLog(`❌ 导入失败：${error.message}`, true);
      } finally {
        e.target.value = '';
      }
    });

    elements.exportBtn.addEventListener('click', () => {
      const sites = elements.sitesTextarea.value
        .split('\n')
        .filter(line => line.includes('|'))
        .map(line => {
          const [name, url] = line.split('|');
          return {
            name: name.trim(),
            url: url.replace(/\/medal\.php$/, '')
          };
        });

      if (sites.length === 0) {
        addLog('❌ 导出失败：无有效配置', true);
        return;
      }

      const blob = new Blob(
        [JSON.stringify({ sites }, null, 2)],
        { type: 'application/json' }
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PT_Config_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();

      URL.revokeObjectURL(url);
      addLog(`📤 已导出 ${sites.length} 个站点配置`);
    });

    elements.scanBtn.addEventListener('click', () => {
      if (isScanning) {
        addLog('⚠️ 扫描正在进行中...', true);
        return;
      }

      chrome.storage.local.get(['sites'], ({ sites }) => {
        if (!sites || sites.length === 0) {
          addLog('❌ 请先配置站点信息', true);
          return;
        }

        isScanning = true;
        elements.logElement.innerHTML = '';
        addLog('🚀 扫描任务启动...');
        chrome.runtime.sendMessage({ action: 'startScan' });
      });
    });

    elements.openAllBtn.addEventListener('click', async () => {
      const { scanResults } = await chrome.storage.local.get(['scanResults']);

      if (!scanResults || scanResults.length === 0) {
        addLog('⚠️ 没有可用扫描结果', true);
        return;
      }

      const validSites = scanResults.filter(item => item.count > 0);
      if (validSites.length === 0) {
        addLog('⚠️ 未检测到可用勋章', true);
        return;
      }

      validSites.forEach(site => {
        chrome.tabs.create({
          url: site.url,
          active: false
        });
      });

      addLog(`🌐 已在后台打开 ${validSites.length} 个站点`);
    });

    elements.diffToggleBtn.addEventListener('click', () => {
      diffMode = !diffMode;
      if (diffMode) {
        elements.diffToggleBtn.classList.add('active');
        elements.diffToggleBtn.innerHTML = '🔄 差异模式 ✓';
        addLog('🔄 差异模式已开启，将高亮本次扫描新增的勋章');

        chrome.storage.local.get(['scanHistory'], ({ scanHistory }) => {
          if (scanHistory && scanHistory.length >= 2) {
            previousResults = scanHistory[scanHistory.length - 2].results;
          } else {
            addLog('⚠️ 暂无历史扫描记录可供对比', true);
          }
          if (currentResults) updateResultDisplay(currentResults);
        });
      } else {
        elements.diffToggleBtn.classList.remove('active');
        elements.diffToggleBtn.innerHTML = '🔄 差异模式';
        addLog('差异模式已关闭');
        if (currentResults) updateResultDisplay(currentResults);
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'scanLog') {
        addLog(message.text, message.isError);
      }

      if (message.type === 'scanResult') {
        isScanning = false;
        chrome.storage.local.set({ scanResults: message.data });
        updateResultDisplay(message.data);
        addLog('🎉 扫描完成');
      }
    });

    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = _e => reject(new Error('文件读取失败'));
        reader.readAsText(file);
      });
    }

  } catch (error) {
    console.error('初始化失败:', error);
    alert(`致命错误：${error.message}`);
  }
});