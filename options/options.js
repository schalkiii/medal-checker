document.addEventListener('DOMContentLoaded', () => {
  // 初始化所有元素引用
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
    clearResultsBtn: document.getElementById('clearResultsBtn')

  };
// 添加清除结果功能
elements.clearResultsBtn.addEventListener('click', () => {
  if (confirm('确定要清除所有扫描结果吗？')) {
    chrome.storage.local.remove('scanResults', () => {
      elements.resultList.innerHTML = '<div class="empty-result">🔄 暂无扫描结果</div>';
      elements.resultStats.innerHTML = '';
      addLog('已清除所有扫描结果');
    });
  }
});

  // 元素存在性验证
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

    // ======================
    // 日志系统
    // ======================
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

    // ======================
    // 结果展示系统
    // ======================
    function updateResultDisplay(results) {
  const validResults = results.filter(item => item.count > 0);
  elements.resultList.innerHTML = '';

  if (validResults.length === 0) {
    elements.resultList.innerHTML = '<div class="empty-result">🎯 点击扫描按钮开始检测</div>';
    elements.resultStats.innerHTML = '';
    return;
  }


      const totalBadges = validResults.reduce((sum, item) => sum + item.count, 0);
      elements.resultStats.innerHTML = `
        <div style="display: flex; justify-content: space-between; padding: 8px;">
          <span>🎯 有效站点：<strong>${validResults.length}</strong></span>
          <span>🏅 总勋章数：<strong style="color:#4CAF50;">${totalBadges}</strong></span>
        </div>
      `;

      validResults.forEach(item => {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.innerHTML = `
          <div>
            <div style="font-weight:500;">${item.siteName}</div>
            <div class="result-url">${item.url}</div>
          </div>
          <div style="color:#4CAF50; font-weight:bold;">
            ${item.count} 勋章
          </div>
        `;
        elements.resultList.appendChild(resultItem);
      });
    }

    // ======================
    // 配置管理系统
    // ======================
    // 初始化加载配置
    chrome.storage.local.get(['sites', 'scanResults'], ({ sites, scanResults }) => {
      elements.sitesTextarea.value = sites?.join('\n') || '';
      if (scanResults) updateResultDisplay(scanResults);
    });

    // 保存配置
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

    // 导入配置
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

    // 导出配置
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
      a.download = `PT_Config_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      addLog(`📤 已导出 ${sites.length} 个站点配置`);
    });

    // ======================
    // 扫描控制系统
    // ======================
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

    // 一键打开功能
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

    // ======================
    // 消息监听系统
    // ======================
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

    // ======================
    // 工具函数
    // ======================
    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(new Error('文件读取失败'));
        reader.readAsText(file);
      });
    }

  } catch (error) {
    console.error('初始化失败:', error);
    alert(`致命错误：${error.message}`);
  }
});
