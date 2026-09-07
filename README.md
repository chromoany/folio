# mdbook —— Markdown → 书籍版式 PDF

给定一个（或多个）Markdown 文件，自动生成带 **目录（可查到每部分页码）** 和 **页脚页码** 的 PDF。

- 引擎：**Pandoc**（md → Typst）+ **Typst**（排版出 PDF）
- 目录页码由 Typst `outline` 两遍排版自动算出来，是**真实页码**，且可点击跳转
- 公式用 `$...$` / `$$...$$`，Typst 原生渲染；代码块自动语法高亮
- 单文件 / 多文件合并都支持
- 完全离线：转换全程不联网，字体用系统自带

## 安装

需要 [Node.js](https://nodejs.org/)（v18+），以及 pandoc、typst 两个便携版二进制。

> 本仓库不含 `vendor/` 二进制（体积大），首次使用运行下面的脚本下载；或直接用 Releases 里的安装包。

```bash
node scripts/setup.cjs
```

脚本会用 Node 自带 fetch 联网，把最新版 pandoc / typst 下载解压到 `vendor/`。也可以手动放成 `vendor/pandoc/pandoc.exe`、`vendor/typst/typst.exe`，或安装到 PATH 后由命令自动找到。

## 下载（Windows 安装包）

到 [Releases](../../releases) 下载 `mdbook-1.0-setup.exe`，双击安装：装到所选目录 + 开始菜单/桌面快捷方式 + 卸载。安装包自带 pandoc/typst 二进制，**装完即可离线使用**。

## 图形界面（双击即用）

双击项目根目录的 `启动.vbs`，会自动打开界面（浏览器本地页面，不联网）：

1. 点「选择 .md 文件」或直接**拖入**（可多选，顺序即章节顺序，可 ↑↓ 调整）
2. 填书名 / 副标题 / 目录深度（可选）
3. 点「开始转换」，完成后**下载 PDF**；若填了输出路径则直接写到该处并可「打开 PDF」

> 输出路径留空 → 浏览器下载（原生保存框）；填绝对路径（如 `D:\...\书.pdf`）→ 直接落盘。
> 想不靠浏览器、用命令行走批处理，看下面的 CLI。

## 用法

```bash
# 单文件
node bin/mdbook.cjs 书.md -o 书.pdf --title "我的书" --subtitle "副标题"

# 多文件合并（按给定顺序，每个 H1 自动另起一页）
node bin/mdbook.cjs 第1章.md 第2章.md 第3章.md -o 书.pdf --title "区域赛模板"

# 用配置文件
node bin/mdbook.cjs -c config.example.json
```

## 配置项（config.json）

见 `config.example.json`。常用：

| 键 | 说明 |
|---|---|
| `inputs` / `output` | 输入 md（数组）/ 输出 PDF |
| `title` / `subtitle` | 书名 / 副标题（可空） |
| `toc.enabled` / `toc.depth` | 是否要目录 / 目录列到几级标题 |
| `chapterBreak` | 每个 H1 是否另起一页 |
| `page.paper` / `page.marginX/Y` | 纸张 / 页边距 |
| `font.cjk` / `font.mono` / `font.size` | 中文字体 / 代码字体 / 正文字号 |

## 命令行参数

| 参数 | 说明 |
|---|---|
| `-o` / `--output` | 输出 PDF |
| `-c` / `--config` | 配置文件 |
| `--title` / `--subtitle` | 书名 / 副标题 |
| `--toc-depth N` | 目录深度 |
| `--no-toc` | 不生成目录 |
| `--no-chapter-break` | H1 不另起页 |
| `--pandoc-bin` / `--typst-bin` | 指定二进制路径 |

## 原理

1. `pandoc <inputs> -t typst -o body.typ`：Markdown → Typst（公式/代码/表格/列表都转好）
2. 把 `body.typ` 注入 `template/book.typ.tpl`，生成 `main.typ`（目录、页脚页码、字体、分章）
3. `typst compile main.typ out.pdf`：两遍排版，目录页码自动回填真实值

## 说明

- 中文字体默认 `Microsoft YaHei`（Windows 自带），可改 `font.cjk`
- 书页结构：书名 + 目录排在最前面（目录条目多会自然续页），之后每章（H1）另起一页；第 1 页无页脚页码，其余页脚带「– 页码 –」
- 验证目录页码：`node scripts/check-toc.cjs book.pdf`（解析 PDF 书签，打印每条标题对应页码）
- 中间产物在 `.build/`（`body.typ` / `main.typ`），排查问题时可直接看
- 若 md 里含旧方案的 `<a id>` / `<div style="page-break-*">` 等原始 HTML，Pandoc+Typst 会忽略，不影响输出

## License

[MIT](LICENSE)
