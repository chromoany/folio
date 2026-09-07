# mdbook

[English](README.md) · 中文

把 Markdown 文件转换成带目录和页码的书籍版式 PDF。

## 特性

- 自动生成目录（含真实页码、可点击跳转）和页脚页码
- Pandoc + Typst 引擎，公式、代码高亮、表格、列表原生支持
- 单文件 / 多文件合并（每个一级标题自动另起一页）
- 完全离线运行

## 安装

推荐到 [Releases](../../releases) 下载 `mdbook-1.1-setup.exe`，双击安装，自带全部依赖，装完即用。

从源码运行需要 [Node.js](https://nodejs.org/) v18+：

```bash
node scripts/setup.cjs   # 下载 pandoc / typst 到 vendor/
```

## 使用

### 图形界面

双击 `启动.vbs`，浏览器会自动打开本地页面：拖入 `.md` 文件 → 填书名等 → 点「开始转换」→ 下载 PDF。

### 命令行

```bash
node bin/mdbook.cjs 书.md -o 书.pdf --title "我的书"
node bin/mdbook.cjs 第1章.md 第2章.md -o 书.pdf   # 多文件合并
node bin/mdbook.cjs -c config.example.json        # 用配置文件
```

常用参数：`--title` / `--subtitle` 书名副标题，`--toc-depth N` 目录深度，`--no-toc` 不生成目录，`--no-chapter-break` 一级标题不另起页，`--pandoc-bin` / `--typst-bin` 指定二进制路径。完整配置见 `config.example.json`。

## License

[MIT](LICENSE)
