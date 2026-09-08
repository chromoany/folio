# mdbook

[中文](README.zh.md) · English

<p align="center"><img src="assets/logo.png" alt="mdbook" width="160"></p>

Convert Markdown files into a book-style PDF with a table of contents and page numbers.

## Features

- Auto-generated table of contents (real page numbers, clickable) and page-numbered footer
- Pandoc + Typst engine: math, syntax highlighting, tables, and lists work natively
- Single file or merge multiple files (each H1 starts on a new page)
- Standalone desktop app: bundled Chromium, no browser or Node.js needed
- Configurable close behavior (tray or quit); automatic update check
- Fully offline

## Install

Recommended: download `mdbook-1.4.1-setup.exe` from [Releases](../../releases), double-click to install — a standalone desktop app with all dependencies bundled (pandoc + typst + Chromium), ready to use.

To run from source, [Node.js](https://nodejs.org/) v18+ is required:

```bash
node scripts/setup.cjs   # download pandoc / typst into vendor/
```

## Usage

### GUI

Launch **mdbook** from the Start Menu / desktop shortcut (or run `mdbook.exe`); the standalone window opens: drop in `.md` files → fill in the title, etc. → click "Start" → download the PDF.

### CLI

```bash
node bin/mdbook.cjs book.md -o book.pdf --title "My Book"
node bin/mdbook.cjs ch1.md ch2.md -o book.pdf      # merge multiple files
node bin/mdbook.cjs -c config.example.json         # use a config file
```

Common flags: `--title` / `--subtitle`, `--toc-depth N`, `--no-toc`, `--no-chapter-break`, `--pandoc-bin` / `--typst-bin`. See `config.example.json` for all options.

## License

[MIT](LICENSE)
