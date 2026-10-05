# Folio

[中文](README.md) · **English**

<div align="center">

<img src="assets/logo.png" alt="Folio" width="160">

[![Version](https://img.shields.io/github/v/release/chromoany/folio?style=flat-square&label=Version)](https://github.com/chromoany/folio/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/chromoany/folio/total?style=flat-square&label=Downloads)](https://github.com/chromoany/folio/releases)
[![License](https://img.shields.io/badge/MIT-green?style=flat-square&label=License)](LICENSE)
[![Platform](https://img.shields.io/badge/Windows%2010%2B-0078D6?style=flat-square&label=Platform)](#install)
[![Issues](https://img.shields.io/github/issues/chromoany/folio?style=flat-square&label=Issues)](https://github.com/chromoany/folio/issues)

</div>

Convert Markdown files into a **book-style PDF** with a table of contents and page numbers.

## Features

- Auto-generated table of contents (real page numbers, clickable) and page-numbered footer
- Pandoc + Typst engine: math, syntax highlighting, tables, and lists work natively; `mermaid` diagrams (flowcharts, sequence, pie, …) are rendered into the PDF (diagram theme and line style are selectable in the conversion options)
- Three font families selectable (body / Latin / monospace, classified like LaTeX's CJKmainfont / mainfont / ttfamily); each dropdown lists the fonts available on this machine
- Single file or merge multiple files (each H1 starts on a new page)
- Standalone desktop app: bundled Chromium, no browser or Node.js needed
- Bilingual UI (Simplified Chinese / English): pick a language during install, switch anytime in Settings
- Configurable close behavior (tray or quit); automatic update check
- Dark mode: dark / light / follow system, switchable anytime in Settings → Theme
- Fully offline

## Why Folio?

Most Markdown → PDF tools *print* a document; Folio *typesets* it into a real book.

- **Drop-in desktop app**: drag multiple .md files into the window → one click → a book with TOC; no CLI, no environment setup
- **Real page numbers in the TOC**: page numbers are measured after typesetting and clickable, not HTML anchors
- **Book layout**: chapters (H1) start on a new page, title block, and multi-file merging into one book — out of the box
- **Chinese-first, zero config**: no TeX Live, no CJK font setup; math is rendered natively by Typst
- **Fully offline**: Pandoc + Typst portable binaries bundled, ready to run

| | [**Folio**](#why-folio) | mdBook | Quarto / bookdown / Pandoc | Typora / Obsidian |
|---|---|---|---|---|
| Merge multiple files into one PDF | ✅ drag & drop | 🔶 website by default; single PDF needs a plugin | ✅ (CLI only) | ❌ single file only |
| Desktop GUI | ✅ built in | ❌ | ❌ | ✅ but single file only |
| Real page numbers in TOC | ✅ automatic, clickable | 🔶 plugin-provided | 🔶 requires engine/template setup | ❌ |
| Chinese / CJK | ✅ out of the box | ✅ native (web); PDF depends on plugin | 🔶 needs CJK font setup | 🔶 environment-dependent |
| Math | ✅ Typst native | 🔶 needs KaTeX plugin | LaTeX | MathJax |
| Install size | Portable binaries (Pandoc + Typst bundled) | Small (Rust toolchain) | TeX Live (GBs) | Electron / browser-dependent |

Merging multiple files is nothing special by itself — a one-line Pandoc command and most book tooling can do it. What makes Folio different is the whole package: a desktop GUI, a real-page-number TOC, Chinese-first typesetting and full offline use, all out of the box.

## Install

Recommended: download `folio-1.7.15-setup.exe` from [Releases](../../releases), double-click to install — a standalone desktop app with all dependencies bundled (pandoc + typst + Chromium), ready to use. The installer is not code-signed; if SmartScreen shows a prompt on first run, click "More info → Run anyway".

To run from source, [Node.js](https://nodejs.org/) v18+ is required:

```bash
node scripts/setup.cjs   # download pandoc / typst into vendor/
```

## Usage

### GUI

Launch **Folio** from the Start Menu / desktop shortcut (or run `folio.exe`); the standalone window opens: drop in `.md` files → fill in the title, etc. → click "Start" → download the PDF.

At the top of the Options card there are two modes (your choice is remembered):

| Mode | What you get |
| --- | --- |
| **Simple (pick a preset)** | Just the two presets: layout + font size. Fonts, sizes, line spacing, paper, margins and heading style all follow the presets |
| **Detailed (tune everything)** | The two presets plus four font families, seven sizes, line spacing, paper, margins, TOC depth, heading style, mermaid theme & curve — each one adjustable |

Both modes keep the book title, subtitle, output path, "table of contents", "new page per chapter" and "fetch remote images". Switching a preset **fills** its whole set of defaults into the Detailed fields, and you can then change any of them; whatever you set always wins — a preset is a set of defaults, not a switch.

### CLI

```bash
node bin/folio.cjs book.md -o book.pdf --title "My Book"
node bin/folio.cjs ch1.md ch2.md -o book.pdf      # merge multiple files
node bin/folio.cjs -c config.example.json         # use a config file
```

The CLI has no modes: passing only `--style` / `--preset` equals the GUI's Simple mode; adding individual flags is Detailed mode.

Common flags: `--title` / `--subtitle`, `--toc-depth N`, `--style` (layout preset: `default` book layout / `ctexart` to match the look of the LaTeX ctexart class), `--preset` (font size preset: `default` / `small` / `normal` / `large` — one set covering body, code block and headings), `--leading` (line spacing and heading spacing, default `1em`; try `1.2em` for a looser feel), `--font-cjk` / `--font-latin` / `--font-mono` / `--font-mono-cjk` (body / Latin / monospace / CJK-inside-code family; any installed family name, a missing one is reported in the log), `--no-toc`, `--no-chapter-break`, `--pandoc-bin` / `--typst-bin`. See `config.example.json` for all options.

#### Layout and size presets

Both are **opt-in options**; the default settings produce exactly the same output as before (byte for byte):

| Option | Value | Effect |
| --- | --- | --- |
| `--style` | `default` | Book layout: Microsoft YaHei body, ruled level-1 headings, centered tables |
| | `ctexart` | Match LaTeX `ctexart`: SimSun body, SimHei bold & headings, KaiTi italic, `New Computer Modern` for Latin, `DejaVu Sans Mono` + FangSong for code, 0.8em line spacing, centered unruled headings |
| `--preset` | `default` | Original sizes: 10.5pt body, 8pt code blocks, 16/14/12/11pt headings |
| | `small` / `normal` / `large` | 9pt / 10.5pt / 12pt body (the ctexart Chinese size system), one set that scales body, code block and headings together |

A preset only supplies **baseline defaults** — a set of defaults, not an indivisible switch. Values you changed in the GUI, individual CLI flags and config-file fields all count as "explicit" and always win: `--preset small` together with a config containing `font.size: "11pt"` gives you an 11pt body. Latin text uses the `New Computer Modern` and `DejaVu Sans Mono` families that ship with typst, so no extra fonts are needed (`Latin Modern` only exists with a TeX Live install and is deliberately not a default).

#### More fine-grained settings

Every item available in the GUI's Detailed mode has a config-file (and where noted, CLI) equivalent:

| What to change | Config field | CLI |
| --- | --- | --- |
| Chinese body font | `font.cjk` | `--font-cjk` |
| Latin font (letters & digits) | `font.latin` (empty = follow the Chinese font) | `--font-latin` |
| Monospace font (code) | `font.mono` | `--font-mono` |
| Chinese glyphs inside code | `font.monoCjk` | `--font-mono-cjk` |
| Body / code font size | `font.size` / `font.monoSize` (a typst length, e.g. `"10.5pt"`) | — |
| H1–H4 sizes | `font.h1` … `font.h4` (numbers, in pt) | — |
| Line spacing & heading spacing | `font.leading` | `--leading` |
| Paper size | `page.paper` (any typst paper name; the GUI offers A4 / A5 / B5 / Letter) | — |
| Margins | `page.marginX` / `page.marginY` (typst lengths, e.g. `"20mm"`) | — |
| TOC depth | `toc.depth` | `--toc-depth` |
| Center level-1 headings (and the TOC title) | `heading.center` | — |
| Underline headings | `heading.rule` | — |
| Chinese bold → SimHei, italic → KaiTi | `heading.cjkStyles` | — |

The `heading.*` defaults are the original book layout (left-aligned, underlined, Chinese bold from the family itself); `ctexart` uses centered, unruled headings with SimHei/KaiTi.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=chromoany/folio&type=Date)](https://star-history.com/#chromoany/folio&Date)

## License

[MIT](LICENSE)
