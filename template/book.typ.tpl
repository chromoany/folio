// 由 Folio 生成（勿手改）：Markdown → 书籍版式 PDF 的 Typst 布局模板
#set document(title: "{{DOC_TITLE}}")
#set text(font: ("{{CJK_FONT}}", "SimSun"), size: {{BASE_SIZE}}, lang: "zh")
#set par(leading: {{LEADING}})

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

// 代码字体：raw 一律换等宽链。注意字体链第二个位置是代码块专用的中文字体：
// Consolas / Courier New 都不含汉字，不显式指定就会走系统兜底，落到度量不匹配的字体上导致中文又细又小（实测过）。
// 默认 NSimSun（新宋体）——Windows 自带的中文等宽字体，与 Consolas 同栅格，汉字对齐不散。
#show raw: set text(font: ("{{MONO_FONT}}", "{{MONO_CJK}}", "SimSun", "Courier New"))
// 行内代码跟随所在行字号（正文 {{BASE_SIZE}}、标题随标题字号）。
// 注意 Typst 的 raw 自带 0.8x 默认缩放，show 规则里 em 的基准是缩过之后的字号，
// 故乘 1/0.8 = 1.25 才等于环境字号（实测正文 10.5pt 与标题 16pt 都精确等大）；换 typst 版本后先核对这个比例。
#show raw.where(block: false): set text(size: 1.25em)
// 字号只缩代码块（monoSize，默认 8pt，长代码才塞得进版心）；早前行内代码也吃这一档，
// 正文里比汉字明显小一圈（issue 反馈「行内代码字体会被缩小」）。
#show raw.where(block: true): set text(size: {{MONO_SIZE}})
// 代码块：浅灰底
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
// 标题样式：上下间距随行距（{{LEADING}}）联动 —— 只改 #set par(leading:) 不会动到这里，
// 标题会一直保持旧间距（issue #1 反馈「哪怕选最大行距，标题还是很紧」）。
// 系数为相对行距的倍数：下方 ≥ 正文列表项间距（实测约 10pt，且不随行距变），上方再放大一档。
// 二轮反馈（「还是比正文都紧」）后统一抬高：H3/H4 的下方系数从 0.8/0.6 提到 1.3/1.25。
#show heading.where(level: 2): it => block(above: 1.8 * {{LEADING}}, below: 1.4 * {{LEADING}}, it)
#show heading.where(level: 3): it => block(above: 1.6 * {{LEADING}}, below: 1.3 * {{LEADING}}, it)
#show heading.where(level: 4): it => block(above: 1.5 * {{LEADING}}, below: 1.25 * {{LEADING}}, it)
#show heading.where(level: 5): it => block(above: 1.4 * {{LEADING}}, below: 1.2 * {{LEADING}}, it)
#show heading.where(level: 6): it => block(above: 1.3 * {{LEADING}}, below: 1.2 * {{LEADING}}, it)

{{TITLE_BLOCK}}
{{TOC_BLOCK}}

#include "body.typ"
