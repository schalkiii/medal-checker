# PT Medal Scanner

批量检测 PT 站点可购买勋章的 Chrome 扩展。支持 NexusPHP 标准勋章系统及部分自定义勋章系统。

## 功能

- 批量扫描多个 PT 站点的勋章页面，检测可购买的勋章
- 自动翻页检测（支持 `?page=N` 分页）
- 支持 NexusPHP 10列/9列标准勋章表格
- 支持 `buycenter.php` 特殊勋章系统
- 支持繁体中文站点（`購買`）
- Diff 模式：对比历史扫描结果，高亮新增勋章
- 一键打开所有有可购买勋章站点
- 配置导入/导出（兼容 PTPP 备份格式）
- 结果统计与可视化展示
- 内置 69 个常见 PT 站点默认配置

## 安装

1. 下载此仓库的 ZIP 包
2. 解压到本地目录
3. 打开 Chrome 浏览器，进入 `chrome://extensions/`
4. 开启右上角的"开发者模式"
5. 点击"加载已解压的扩展程序"，选择解压后的目录

## 使用

### 首次使用

安装后扩展会自动加载默认的 69 个 PT 站点配置。点击扩展图标打开选项页面：

1. 在文本区域中查看和编辑站点列表（每行格式：`站点名称|站点URL`）
2. 点击"保存配置"
3. 点击"开始扫描"

### 结果查看

- 每个站点显示可购买勋章的名称、价格、有效期、加成、库存、可购买时间
- 点击站点链接可直接跳转到勋章页面
- 点击"一键打开"在后台打开所有有可购买勋章的站点

### Diff 模式

- 开启"差异模式"后，新增的勋章会高亮显示
- 历史扫描数据自动持久化存储

### 配置导入/导出

支持标准 JSON 格式：

```json
{
  "sites": [
    { "name": "站点名称", "url": "https://site.com/" }
  ]
}
```

兼容 PTPP 备份文件：`PTPP → 参数备份与恢复 → 备份ZIP下载并解压 → 选择 options.json 导入`

## 开发

### 环境要求

- Node.js >= 18
- npm

### 安装依赖

```bash
npm install
```

### 质量检查

```bash
# 完整检查（文件完整性 + 语法 + ESLint + 跨文件引用）
npm run check

# ESLint 自动修复
npm run lint-fix

# 文件监控（修改后自动检查）
npm run watch
```

### 运行测试

```bash
npm test
```

测试包括：
- 单元测试：background.js 核心函数（勋章提取、域名解析等）
- DOM 测试：options 页面元素和交互
- 集成测试：消息传递协议和 storage 数据流

### 调试分析

导出扩展扫描的原始 HTML 后，用分析脚本排查勋章识别问题：

```bash
# 分析单个 HTML 文件
node scripts/analyze-html.js page.html

# 分析调试包（从扩展导出）
node scripts/analyze-html.js PT_Debug_*.json
```

## 技术架构

```
background.js          Service Worker - 核心扫描逻辑、HTML解析、勋章提取
options/options.html   选项页面 UI
options/options.js     选项页面逻辑 - 结果显示、配置管理、Diff 模式
manifest.json          Chrome Extension Manifest V3 配置
scripts/               CI/CD 脚本（检查、修复、监控、分析）
tests/                 测试套件（单元测试、DOM测试、集成测试）
```

### 勋章提取引擎

- `extractMedalsFromHtml()` - 标准 NexusPHP 勋章解析，自动检测 9列/10列表格布局
- `extractMedalsFromBuyCenter()` - 特殊 buycenter.php 勋章系统解析
- `getColumnLayout()` - 列布局检测，返回正确的列索引映射

## 支持站点

扩展内置了 69 个常见 PT 站点的默认配置，涵盖 NexusPHP 标准勋章系统和 buycenter.php 自定义系统。首次安装时自动加载。

## 许可证

MIT