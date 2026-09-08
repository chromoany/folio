# Folio

[English](README.md) · 中文

<p align="center"><img src="assets/logo.png" alt="Folio" width="160"></p>

把 Markdown 文件转换成带目录和页码的**书籍版式 PDF**。

## 特性

- 自动生成目录（含真实页码、可点击跳转）和页脚页码
- Pandoc + Typst 引擎，公式、代码高亮、表格、列表原生支持
- 单文件 / 多文件合并（每个一级标题自动另起一页）
- 独立桌面应用：自带 Chromium 内核，无需浏览器、无需 Node.js
- 双语界面（简体中文 / English）：安装时可选语言，随时可在「设置」里切换
- 关闭窗口行为可配置（托盘 / 退出）；启动自动检查更新
- 完全离线运行

## 为什么选 Folio？

大多数 Markdown → PDF 工具只是把文档「打印」出来；Folio 把它「排」成一本真正的书。

- **真实页码目录**：目录页码是排版后测出来的真实页码、可点击跳转，而非网页锚点
- **书籍版式**：章节自动另起页、封面标题、多文件合并成书，开箱即用
- **中文原生 + 零配置**：无需 TeX Live、无需配中文字体，公式走 Typst 原生渲染
- **完全离线**：Pandoc + Typst 便携二进制内嵌，双击即用

| | Folio | Pandoc + LaTeX | VS Code / Typora / md-to-pdf |
|---|---|---|---|
| 产物 | 书籍 | 文档 | 文档 |
| 真实页码目录 | ✅ | 需手写 LaTeX 模板 | ❌ |
| 中文 | ✅ 开箱即用 | 需配 xeCJK | 视环境而定 |
| 公式 | Typst 原生 | LaTeX | 视插件而定 |
| 安装体积 | 便携二进制 | TeX Live 数 GB | 依赖浏览器 |

## 安装

推荐到 [Releases](../../releases) 下载 `folio-1.5.0-setup.exe`，双击安装——独立桌面应用，自带全部依赖（Pandoc + Typst + Chromium 内核），装完即用。

从源码运行需要 [Node.js](https://nodejs.org/) v18+：

```bash
node scripts/setup.cjs   # 下载 pandoc / typst 到 vendor/
```

## 使用

### 图形界面

从开始菜单 / 桌面快捷方式（或运行 `folio.exe`）启动，独立窗口直接打开：拖入 `.md` 文件 → 填书名等 → 点「开始转换」→ 下载 PDF。

### 命令行

```bash
node bin/folio.cjs 书.md -o 书.pdf --title "我的书"
node bin/folio.cjs 第1章.md 第2章.md -o 书.pdf   # 多文件合并
node bin/folio.cjs -c config.example.json        # 用配置文件
```

常用参数：`--title` / `--subtitle` 书名副标题，`--toc-depth N` 目录深度，`--no-toc` 不生成目录，`--no-chapter-break` 一级标题不另起页，`--pandoc-bin` / `--typst-bin` 指定二进制路径。完整配置见 `config.example.json`。

## License

[MIT](LICENSE)
