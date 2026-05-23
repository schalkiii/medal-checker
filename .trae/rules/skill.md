# Skill 文档 - PT Medal Scanner

## 诊断勋章解析失败的方法学

### 问题描述

站点勋章无法被解析，`extractMedalsFromHtml()` 返回 0 个结果。

### 诊断步骤

1. **导出调试包**：在扩展选项页点击「导出调试数据」获取 `PT_Debug_*.json`
2. **运行分析脚本**：`node scripts/analyze-html.js PT_Debug_*.json`
3. **查看站点分类**：脚本会输出该站点属于表格布局、buycenter 还是卡片布局
4. **定位失败原因**：检查输出中的勋章数、购买按钮数、可用按钮数是否与实际一致

### 卡片布局的常见问题

#### 问题 1：容器标签不匹配

`extractMedalsFromCards()` 曾在查找容器标签时硬编码 `<div class="medal-cards">`（v1.2 及之前），但部分站点（如 13city）使用 `<div class="medal-container">`。

**解决方案**（v1.3+）：不再依赖容器标签来限定搜索范围，直接在整个 HTML 中查找 `<div class="medal-card ` 元素。这样可以兼容 `medal-cards`、`medal-container` 以及没有明确容器的页面。

#### 问题 2：购买按钮类型不匹配

v1.2 及之前只匹配 `<input class="btn buy" ... value="购买">`，但卡片布局站点使用 `<button ... class="btn buy ">`。

**解决方案**（v1.3+）：正则改为 `/<(?:input|button)[^>]*\bclass="btn buy[^"]*"[^>]*\/?\s*>/i`，同时匹配两种标签。

#### 问题 3：class 属性尾部空格

某些站点的 `class="btn buy "` 尾部有空格（如 13city），之前的精确匹配 `class="btn buy"` 无法匹配。

**解决方案**（v1.3+）：使用 `class="btn buy[^"]*"` 容忍尾部空格。

#### 问题 4：容器未正确闭合

部分站点的 HTML 中，`medal-container` 的 `</div>` 可能缺失（被外层 `<td>` 隐式闭合），导致深度计数无法返回 0。

**解决方案**（v1.3+）：不依赖容器边界来提取卡片，直接在全局 HTML 中查找每个 `medal-card`。

### 验证步骤

1. 运行 `node scripts/analyze-html.js PT_Debug_*.json` 确认目标站点正确输出
2. 运行 `node tests/unit/background.test.js` 确认所有测试通过
3. 运行 `npm test` 确认 25 项检查全部通过

### 历史参考

- 2026-05-16: 修复 13city 卡片布局解析问题（v1.3）
  - 修改文件：`background.js`（extractMedalsFromCards 重构）
  - 同步更新：`scripts/analyze-html.js`（卡片布局分析分支）
  - 新增测试：11 个卡片布局单元测试（54→54，覆盖 medal-cards+input 和 medal-container+button）
  - 测试数从 43 增至 54

- 2026-05-23: 适配 pterclub.net 勋章解析（v1.5）
  - 新增 `extractMedalsFromPterclub()` 函数处理猫站自定义表格布局
  - 特征：`<input type="submit" name="medalchosen" value="CODE (PRICE 猫粮)">`
  - 名称提取：从 `<img title="NAME">` 的上一个匹配获取
  - 价格提取：从 value 属性中正则提取 `(数字 猫粮)`
  - 分页：pterclub 使用 `?page=page001` 格式，需特殊处理
  - 新增测试：8 个 pterclub 单元测试（62→62，但重新分配了测试）

## pterclub（猫站）布局适配指南

### 布局特征

猫站的勋章页面使用自定义表格布局，不同于标准 NexusPHP：

```html
<table>
  <!-- 分类头部 -->
  <tr><td class="colhead" colspan="6"><font class="big">[042] 类别名</font></td></tr>
  <!-- 勋章行 -->
  <tr>
    <td colspan="6"><div class="text">
      <img title="勋章名称" src="..." />
      <form action="?page=page010&action=buymedal" method="post">
        <input type="submit" name="medalchosen" value="042-001 (52,099 猫粮)" disabled="disabled" />
      </form>
    </div></td>
  </tr>
</table>
```

### 关键点

1. 提交按钮使用 `name="medalchosen"`，不是标准的 `name="medal" value="购买"`
2. 价格内嵌在 value 属性中：`value="CODE (PRICE 猫粮)"`
3. 页面上所有按钮都可能 disabled，即使非 disabled 也由服务端校验价格
4. 分页格式：`?page=page001` 到 `?page=page010`

### 注意事项

- 名称提取时必须取 **最后一个** `<img title>` 而非第一个（因为窗口中可能包含上一个勋章图片）
- 使用 `matchAll` + 取最后一个元素来正确获取最近的图片

## 代码修改全流程规范

### 变更影响范围分析

每次修改必须识别以下同步点：
1. 核心逻辑（background.js 中的提取函数）
2. 分析脚本（scripts/analyze-html.js）
3. 单元测试（tests/unit/）
4. README.md（功能列表 + 更新日志）
5. 本 Skill 文档
6. CHANGELOG（如存在）

### 测试验证清单

修改完成后必须验证：
- [ ] 核心单元测试全部通过
- [ ] 集成测试全部通过
- [ ] `npm test`（25 项检查）全部通过
- [ ] 用调试包验证修复结果
- [ ] 确认其他站点未出现回归