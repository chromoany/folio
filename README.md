# Folio

**中文** · [English](README.en.md)

<div align="center">

<img src="assets/logo.png" alt="Folio" width="160">

[![最新版](https://img.shields.io/github/v/release/chromoany/folio?style=flat-square&label=%E6%9C%80%E6%96%B0%E7%89%88)](https://github.com/chromoany/folio/releases/latest)
[![下载量](https://img.shields.io/github/downloads/chromoany/folio/total?style=flat-square&label=%E4%B8%8B%E8%BD%BD%E9%87%8F)](https://github.com/chromoany/folio/releases)
[![许可](https://img.shields.io/badge/MIT-green?style=flat-square&label=%E8%AE%B8%E5%8F%AF)](LICENSE)
[![平台](https://img.shields.io/badge/Windows%2010%2B-0078D6?style=flat-square&label=%E5%B9%B3%E5%8F%B0)](#安装)
[![问题反馈](https://img.shields.io/github/issues/chromoany/folio?style=flat-square&label=%E9%97%AE%E9%A2%98%E5%8F%8D%E9%A6%88)](https://github.com/chromoany/folio/issues)

</div>

把 Markdown 文件转换成带目录和页码的**书籍版式 PDF**。

## 特性

- 自动生成目录（含真实页码、可点击跳转）和页脚页码
- Pandoc + Typst 引擎，公式、代码高亮、表格、列表原生支持，`mermaid` 图（流程图/时序图/饼图等）自动渲染成图嵌入（图的主题与连线样式可在转换选项里选择）
- 字体三档可选（正文字体 / 英文字体 / 代码等宽字体，分类同 LaTeX 的 CJKmainfont / mainfont / ttfamily），逐档下拉、列出本机可用字体
- 单文件 / 多文件合并（每个一级标题自动另起一页）
- 独立桌面应用：自带 Chromium 内核，无需浏览器、无需 Node.js
- 双语界面（简体中文 / English）：安装时可选语言，随时可在「设置」里切换
- 关闭窗口行为可配置（托盘 / 退出）；启动自动检查更新
- 黑夜模式：深色 / 浅色 / 跟随系统，随时可在「设置 → 外观主题」切换
- 完全离线运行

## 为什么选 Folio？

大多数 Markdown → PDF 工具只是把文档「打印」出来；Folio 把它「排」成一本真正的书。

- **桌面应用，拖入即转**：把多个 .md 文件拖进窗口 → 点一下 → 得到一本带目录的书；不写命令、不配环境
- **真实页码目录**：目录页码是排版后测出来的真实页码、可点击跳转，而非网页锚点
- **书籍版式**：章节自动另起页、封面标题、多文件合并成书，开箱即用
- **中文原生 + 零配置**：无需 TeX Live、无需配中文字体，公式走 Typst 原生渲染
- **完全离线**：Pandoc + Typst 便携二进制内嵌，双击即用

| | [**Folio**](#为什么选-folio) | mdBook | Quarto / bookdown / Pandoc | Typora / Obsidian |
|---|---|---|---|---|
| 多文件合并成单 PDF | ✅ 拖入即合并成书 | 🔶 原生输出网站，单 PDF 需插件 | ✅（仅命令行） | ❌ 只能单文件 |
| 桌面图形界面 | ✅ 内置 | ❌ | ❌ | ✅ 但只能单文件 |
| 真实页码目录 | ✅ 自动生成、可点击 | 🔶 插件提供 | 🔶 需配引擎/模板 | ❌ |
| 中文 / CJK | ✅ 开箱即用 | ✅ 网页原生，PDF 视插件 | 🔶 需配 CJK 字体 | 🔶 视环境 |
| 公式 | ✅ Typst 原生 | 🔶 需 KaTeX 插件 | LaTeX | MathJax |
| 安装体积 | 便携二进制（内嵌 Pandoc + Typst） | 小（Rust 工具链） | TeX Live 数 GB | Electron / 依赖浏览器 |

合并多个文件本身并不稀奇——Pandoc 一行命令、成书类工具基本都能做到；Folio 的不同在于把整件事做成了**开箱即用的书籍排版器**：桌面 GUI、真实页码目录、中文优先、完全离线，缺一不可。

## 安装

推荐到 [Releases](../../releases) 下载 `folio-1.7.15-setup.exe`，双击安装——独立桌面应用，自带全部依赖（Pandoc + Typst + Chromium 内核），装完即用。安装包未做代码签名，如首次运行遇到 SmartScreen 提示，点「更多信息 → 仍要运行」即可。

从源码运行需要 [Node.js](https://nodejs.org/) v18+：

```bash
node scripts/setup.cjs   # 下载 pandoc / typst 到 vendor/
```

## 使用

### 图形界面

从开始菜单 / 桌面快捷方式（或运行 `folio.exe`）启动，独立窗口直接打开：拖入 `.md` 文件 → 填书名等 → 点「开始转换」→ 下载 PDF。

选项卡片顶部有「调节方式」两档，按需要选（上次的选择会记住）：

| 档位 | 露出的选项 |
| --- | --- |
| **简单（挑方案）** | 只有两套预设：版式方案 + 字号方案。字体、字号、行距、纸张、页边距、标题样式一律用预设自带的默认值 |
| **详细（逐项调）** | 两套预设 + 字体四档、字号七项、行距、纸张、页边距、目录深度、标题样式、mermaid 主题与连线，逐项可改 |

两档都保留书名、副标题、输出路径、生成目录、每章另起一页、联网抓取远程图片。切换预设会把该预设的一整套默认值「填进」详细档的各个框里，填完仍可随便改；改过的值永远最后生效——**预设只是默认值，不是开关**。

### 命令行

```bash
node bin/folio.cjs 书.md -o 书.pdf --title "我的书"
node bin/folio.cjs 第1章.md 第2章.md -o 书.pdf   # 多文件合并
node bin/folio.cjs -c config.example.json        # 用配置文件
```

命令行没有档位的概念：只给 `--style` / `--preset` 就等价于界面的「简单」，再逐项给参数就是「详细」。

常用参数：`--title` / `--subtitle` 书名副标题，`--toc-depth N` 目录深度，`--style` 版式方案（`default` 书版式 / `ctexart` 对齐 LaTeX ctexart 的观感），`--preset` 字号方案（`default` / `small` 小五 / `normal` 五号 / `large` 小四，一套含正文 + 代码块 + 各级标题），`--leading` 行距与标题上下间距（默认 `1em`，嫌挤可调 `1.2em`），`--font-cjk` / `--font-latin` / `--font-mono` / `--font-mono-cjk` 正文字体 / 英文字体 / 代码等宽字体 / 代码块里的汉字（任意字族名，未安装会在日志提示），`--no-toc` 不生成目录，`--no-chapter-break` 一级标题不另起页，`--pandoc-bin` / `--typst-bin` 指定二进制路径。完整配置见 `config.example.json`。

#### 版式方案与字号方案

两者都是**可选项**，默认档与不加参数时完全一致（输出逐字节不变）：

| 选项 | 取值 | 效果 |
| --- | --- | --- |
| `--style` | `default`（默认） | 书版式：微软雅黑正文、一级标题带下划线、表格居中 |
| | `ctexart` | 对齐 LaTeX `ctexart`：宋体正文、黑体粗体与标题、楷体斜体、西文 `New Computer Modern`、代码 `DejaVu Sans Mono` + 仿宋、行距 0.8em、标题居中无下划线 |
| `--preset` | `default`（默认） | 原有字号：正文 10.5pt、代码块 8pt、标题 16/14/12/11pt |
| | `small` / `normal` / `large` | 小五 9pt / 五号 10.5pt / 小四 12pt（取自 ctexart 的中文字号体系），一套同时调正文、代码块与各级标题 |

两者都只提供**基线默认值**：预设是「一套默认值」，不是不可拆的开关。界面上改过的值、命令行的单项参数、配置文件里的字段都算「显式指定」，永远压过预设——比如 `--preset small` 配上一份写了 `font.size: "11pt"` 的配置，正文就是 11pt。西文字族用 typst 自带的 `New Computer Modern` 与 `DejaVu Sans Mono`，不需要另装字体（`Latin Modern` 只有装了 TeX Live 才有，不在默认值里）。

#### 更多逐项设置

界面「详细」档能改的每一项，在配置文件 / 命令行里都有对应（表格里是配置文件字段）：

| 想改什么 | 配置文件字段 | 命令行 |
| --- | --- | --- |
| 正文字体（中文） | `font.cjk` | `--font-cjk` |
| 英文字体（字母数字） | `font.latin`（空串 = 跟随中文字体） | `--font-latin` |
| 代码等宽字体 | `font.mono` | `--font-mono` |
| 代码块里的汉字 | `font.monoCjk` | `--font-mono-cjk` |
| 正文字号 / 代码字号 | `font.size` / `font.monoSize`（Typst 长度，如 `"10.5pt"`） | — |
| 一至四级标题字号 | `font.h1` … `font.h4`（数字，单位 pt） | — |
| 行距与标题上下间距 | `font.leading` | `--leading` |
| 纸张 | `page.paper`（任意 typst 纸型名，界面给 A4 / A5 / B5 / Letter） | — |
| 页边距 | `page.marginX` / `page.marginY`（Typst 长度，如 `"20mm"`） | — |
| 目录深度 | `toc.depth` | `--toc-depth` |
| 一级标题（含目录标题）居中 | `heading.center` | — |
| 标题下划线 | `heading.rule` | — |
| 中文粗体走黑体、斜体走楷体 | `heading.cjkStyles` | — |

`heading.*` 三项的默认值就是原有的书版式（左对齐、带下划线、中文用字族自带的粗体）；`ctexart` 给的是居中、无下划线、黑体楷体。

## Star 历史

[![Star 历史图表](https://api.star-history.com/svg?repos=chromoany/folio&type=Date)](https://star-history.com/#chromoany/folio&Date)

## License

[MIT](LICENSE)
