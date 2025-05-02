# medal-checker
pt站点勋章批量检测，浏览器插件，zip下载，解压后浏览器加载插件

# 📋 配置导入说明
支持标准JSON格式，导入时站点地址自动补全medal.php：
{
  "sites": [
    { "name": "站点A", "url": "https://sitea.com/" },
    { "name": "站点B", "url": "https://siteb.com/" }
  ]
}
# 兼容PTPP备份文件：
PTPP → 参数备份与恢复 → 备份ZIP下载并解压 → 选择 options.json导入
