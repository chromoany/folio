// 由 Folio 生成（勿手改）：Markdown → 书籍版式 PDF 的 Typst 布局模板
#set document(title: "{{DOC_TITLE}}")
#set text(font: ("{{CJK_FONT}}", "SimSun"), size: {{BASE_SIZE}}, lang: "zh")
#set par(leading: 0.75em)

#set page(
  paper: "{{PAPER}}",
  margin: (x: {{MARGIN_X}}, y: {{MARGIN_Y}}),
  footer: context {
    if counter(page).get().first() > 1 {
      align(center)[
        – #counter(page).display("1") –
      ]
    }
  },
)

// 代码块：等宽字体 + 浅灰底
// 注意字体链第二个位置是代码块专用的中文字体：Consolas / Courier New 都不含汉字，
// 不显式指定就会走系统兜底，落到度量不匹配的字体上导致中文又细又小（实测过）。
// 默认 NSimSun（新宋体）——Windows 自带的中文等宽字体，与 Consolas 同栅格，汉字对齐不散。
#show raw: set text(font: ("{{MONO_FONT}}", "{{MONO_CJK}}", "SimSun", "Courier New"), size: {{MONO_SIZE}})
#show raw.where(block: true): it => block(
  fill: rgb("#f6f8fa"),
  inset: (x: 7pt, y: 5pt),
  radius: 3pt,
  width: 100%,
  it,
)

// 标题样式
#show heading: set text(weight: "bold")
#show heading.where(level: 1): set text(size: 16pt)
#show heading.where(level: 2): set text(size: 14pt)
#show heading.where(level: 3): set text(size: 12pt)
#show heading.where(level: 4): set text(size: 11pt)
{{H1_SHOW}}
#show heading.where(level: 2): it => block(above: 0.9em, below: 0.5em, it)
#show heading.where(level: 3): it => block(above: 0.7em, below: 0.4em, it)
#show heading.where(level: 4): it => block(above: 0.55em, below: 0.3em, it)

{{TITLE_BLOCK}}
{{TOC_BLOCK}}

#include "body.typ"
