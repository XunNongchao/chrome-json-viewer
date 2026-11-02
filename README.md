# JSON 格式化预览 Chrome 扩展

一个轻量的 Chrome Manifest V3 扩展，用于在浏览网页时快速格式化并预览 JSON。选中页面中的 JSON 文本后，可以通过右键菜单打开独立预览页；也可以点击扩展图标，手动粘贴 JSON 进行格式化查看。

## 功能特性

- 右键菜单格式化网页中选中的 JSON 文本。
- 独立预览页面，左侧保留原始输入，右侧展示树形 JSON。
- 自动修复非标准 JSON，右侧直接预览修复后的结果（左侧原文保持不变）：
  - 转义过的 JSON，如 `[{\"a\":\"1\"}]`，支持多层转义；
  - 被整体字符串化的 JSON，如 `"{\"a\":1}"`；
  - 被引号、Markdown 代码块、变量赋值、JSONP 回调等包裹（含不成对的引号），如 `'{a:"1"}`；
  - JSONC / JSON5 风格语法：注释、尾随逗号、单引号字符串、无引号键、十六进制数字等；
  - Python 字面量 `True` / `False` / `None`，以及网页复制带来的不间断空格等特殊空白字符。
- 支持对象、数组节点展开与收起。
- 收起对象或数组时显示子节点数量。
- 顶部工具栏支持一键展开、一键收起、复制格式化 JSON、压缩左侧 JSON。
- 支持 `Ctrl+F` / `Command+F` 在右侧格式化结果中搜索，并高亮、滚动到命中内容。
- 支持浅色与深色主题切换。
- 无需后端服务，所有格式化与预览都在浏览器本地完成。

## 安装方式

1. 下载或克隆本项目到本地。
2. 打开 Chrome，并进入 `chrome://extensions/`。
3. 开启右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目目录。

安装完成后，Chrome 工具栏会出现“JSON格式化”扩展图标。

## 使用方式

### 右键预览选中文本

1. 在任意网页中选中一段 JSON 文本。
2. 右键点击选中文本。
3. 选择 `JSON格式化`。
4. 扩展会打开独立页面并展示格式化后的 JSON 树。

### 手动粘贴 JSON

1. 点击 Chrome 工具栏中的扩展图标。
2. 在左侧输入框中粘贴 JSON。
3. 右侧会自动解析并展示格式化结果。

## 项目结构

```text
.
├── assets/icons/              # 扩展图标
├── background.js              # 右键菜单与扩展入口
├── formatter.css              # 预览页样式
├── formatter.html             # 预览页结构
├── formatter.js               # JSON 解析、渲染、搜索与交互逻辑
├── json-repair.js             # 宽松解析：反转义、去除包裹、JSONC 语法修复
├── manifest.json              # Chrome 扩展配置
└── THIRD_PARTY_NOTICES.md     # 第三方资源说明
```

## 扩展权限

本扩展使用以下 Chrome 权限：

- `contextMenus`：注册右键菜单入口。
- `storage`：在打开预览页时临时传递选中的 JSON 文本。
- `clipboardWrite`：支持复制格式化后的 JSON。

## 开发说明

本项目是原生 HTML、CSS、JavaScript 实现，不需要安装依赖或构建步骤。修改代码后，可在 `chrome://extensions/` 中点击扩展的刷新按钮重新加载。

## 第三方资源

图标基于 Lucide 开源 SVG 图标库，许可证信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
