# Folio

[中文](README.zh.md) · English

<p align="center"><img src="assets/logo.png" alt="Folio" width="160"></p>

Convert Markdown files into a **book-style PDF** with a table of contents and page numbers.

## Features

- Auto-generated table of contents (real page numbers, clickable) and page-numbered footer
- Pandoc + Typst engine: math, syntax highlighting, tables, and lists work natively
- Single file or merge multiple files (each H1 starts on a new page)
- Standalone desktop app: bundled Chromium, no browser or Node.js needed
- Bilingual UI (Simplified Chinese / English): pick a language during install, switch anytime in Settings
- Configurable close behavior (tray or quit); automatic update check
- Fully offline

## Why Folio?

Most Markdown → PDF tools *print* a document; Folio *typesets* it into a real book.

- **Drop-in desktop app**: drag multiple .md files into the window → one click → a book with TOC; no CLI, no environment setup
- **Real page numbers in the TOC**: page numbers are measured after typesetting and clickable, not HTML anchors
- **Book layout**: chapters (H1) start on a new page, title block, and multi-file merging into one book — out of the box
- **Chinese-first, zero config**: no TeX Live, no CJK font setup; math is rendered natively by Typst
- **Fully offline**: Pandoc + Typst portable binaries bundled, ready to run

| | Folio | mdBook | Quarto / bookdown / Pandoc | Typora / Obsidian |
|---|---|---|---|---|
| Merge multiple files into one PDF | ✅ drag & drop | 🔶 website by default; single PDF needs a plugin | ✅ (CLI only) | ❌ single file only |
| Desktop GUI | ✅ built in | ❌ | ❌ | ✅ but single file only |
| Real page numbers in TOC | ✅ automatic, clickable | 🔶 plugin-provided | 🔶 requires engine/template setup | ❌ |
| Chinese / CJK | ✅ out of the box | ✅ native (web); PDF depends on plugin | 🔶 needs CJK font setup | 🔶 environment-dependent |
| Math | ✅ Typst native | 🔶 needs KaTeX plugin | LaTeX | MathJax |
| Install size | Portable binaries (Pandoc + Typst bundled) | Small (Rust toolchain) | TeX Live (GBs) | Electron / browser-dependent |

Merging multiple files is nothing special by itself — a one-line Pandoc command and most book tooling can do it. What makes Folio different is the whole package: a desktop GUI, a real-page-number TOC, Chinese-first typesetting and full offline use, all out of the box.

## Install

Recommended: download `folio-1.5.0-setup.exe` from [Releases](../../releases), double-click to install — a standalone desktop app with all dependencies bundled (pandoc + typst + Chromium), ready to use.

To run from source, [Node.js](https://nodejs.org/) v18+ is required:

```bash
node scripts/setup.cjs   # download pandoc / typst into vendor/
```

## Usage

### GUI

Launch **Folio** from the Start Menu / desktop shortcut (or run `folio.exe`); the standalone window opens: drop in `.md` files → fill in the title, etc. → click "Start" → download the PDF.

### CLI

```bash
node bin/folio.cjs book.md -o book.pdf --title "My Book"
node bin/folio.cjs ch1.md ch2.md -o book.pdf      # merge multiple files
node bin/folio.cjs -c config.example.json         # use a config file
```

Common flags: `--title` / `--subtitle`, `--toc-depth N`, `--no-toc`, `--no-chapter-break`, `--pandoc-bin` / `--typst-bin`. See `config.example.json` for all options.

## License

[MIT](LICENSE)
