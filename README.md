# mdbook

[中文](README.zh.md) · English

Convert Markdown files into a book-style PDF with a table of contents and page numbers.

## Features

- Auto-generated table of contents (real page numbers, clickable) and page-numbered footer
- Pandoc + Typst engine: math, syntax highlighting, tables, and lists work natively
- Single file or merge multiple files (each H1 starts on a new page)
- Fully offline

## Install

Recommended: download `mdbook-1.1-setup.exe` from [Releases](../../releases), double-click to install — all dependencies bundled, ready to use.

To run from source, [Node.js](https://nodejs.org/) v18+ is required:

```bash
node scripts/setup.cjs   # download pandoc / typst into vendor/
```

## Usage

### GUI

Double-click `启动.vbs`; a browser opens a local page automatically: drop in `.md` files → fill in the title, etc. → click "Start" → download the PDF.

### CLI

```bash
node bin/mdbook.cjs book.md -o book.pdf --title "My Book"
node bin/mdbook.cjs ch1.md ch2.md -o book.pdf      # merge multiple files
node bin/mdbook.cjs -c config.example.json         # use a config file
```

Common flags: `--title` / `--subtitle`, `--toc-depth N`, `--no-toc`, `--no-chapter-break`, `--pandoc-bin` / `--typst-bin`. See `config.example.json` for all options.

## License

[MIT](LICENSE)
