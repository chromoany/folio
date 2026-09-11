-- Folio 组件（勿删）：pandoc Lua 过滤器 —— 收集 pandoc markdown reader 的缺口修补
-- 由 bin/folio.cjs 经 --lua-filter 调用；只读输入 AST，不写任何文件
-- 当前两项修补：
--   ① HTML 断链：reader 不解析 HTML，raw html 被 typst writer 静默丢弃（见下方【断链根因】）
--   ② 表格单元格内代码 span 的 `\|` 未反转义（见文件末尾 unescape_pipe_code）
--
-- 【断链根因】
--   pandoc 的 markdown reader 不解析 HTML：`-f markdown` 遇到 <table> 只吐一串
--   RawBlock(Format "html")，标签之间的文字退化成裸 Plain；typst writer 无法表达 raw html，
--   静默丢弃这些 RawBlock -> 表格只剩光秃秃的单元格文字（"转 typst 简直灾难"就是这个）
--   反证：同一段 HTML 交给 html reader（-f html）能正确解析出 rowspan/colspan，
--         typst writer 输出也完全正确（table.cell(rowspan: 2)[...]）=> 断链在 reader 侧，不在 writer 侧
--
-- 【本过滤器】把连续的 raw html 片段重组成完整 HTML 字符串，交给 html reader 解析成原生 AST 再塞回。
--   关键：必须按「根标签深度配平」判定结束，用「见到第一个闭合标签就收手」会在 </th> 处截断，
--         得到不平衡的 HTML 片段，解析结果残缺（实测会把整张表弄丢）。

local FORMAT = 'html'
local BLOCK_TAGS = {
  table = true, div = true, section = true, details = true, figure = true,
  aside = true, blockquote = true, ul = true, ol = true, dl = true,
  center = true, article = true, nav = true, header = true, footer = true, main = true,
}

local function inlines_to_html(inlines)
  local d = pandoc.Pandoc({ pandoc.Plain(inlines) })
  local s = pandoc.write(d, FORMAT)
  return (s:gsub('^%s*<p[^>]*>', ''):gsub('</p>%s*$', ''))
end

-- 该 raw block 是否开启一个块级 HTML 元素；返回标签名
local function root_tag(text)
  local tag = text:match('^%s*<([%a][%w%-]*)')
  if tag and BLOCK_TAGS[tag:lower()] then return tag:lower() end
  return nil
end

-- 统计一段 HTML 片段对根标签的净深度贡献
local function delta(html, tag)
  local d = 0
  for _ in html:gmatch('<' .. tag .. '[%s>/]') do d = d + 1 end
  for _ in html:gmatch('</' .. tag .. '%s*>') do d = d - 1 end
  return d
end

local function fix_blocks(bs)
  local out, i, hits = {}, 1, 0
  while i <= #bs do
    local b = bs[i]
    local tag = (b.t == 'RawBlock' and b.format == FORMAT) and root_tag(b.text) or nil
    if tag then
      local parts, j, depth, closed = {}, i, 0, false
      while j <= #bs and not closed do
        local c = bs[j]
        if c.t == 'RawBlock' and c.format == FORMAT then
          parts[#parts + 1] = c.text
          depth = depth + delta(c.text, tag)
          j = j + 1
        elseif c.t == 'Plain' or c.t == 'Para' then
          local h = inlines_to_html(c.content)
          parts[#parts + 1] = h
          depth = depth + delta(h, tag) -- 文字里也可能夹着标签
          j = j + 1
        else
          break
        end
        if depth <= 0 then closed = true end
      end
      local ok, parsed = pcall(pandoc.read, table.concat(parts, '\n'), FORMAT)
      if ok and closed and #parsed.blocks > 0 then
        for _, nb in ipairs(parsed.blocks) do out[#out + 1] = nb end
        hits = hits + 1
        i = j
      else
        out[#out + 1] = b -- 不完整就别动，避免吞掉后文
        i = i + 1
      end
    else
      out[#out + 1] = b
      i = i + 1
    end
  end
  return out, hits
end

-- 行内：把连续的 raw inline html 重建成原生内联，保住 <b> <br> <sub> 语义
local function fix_inlines(inlines)
  local out, i = {}, 1
  while i <= #inlines do
    local x = inlines[i]
    if x.t == 'RawInline' and x.format == FORMAT then
      local parts, j = {}, i
      while j <= #inlines and inlines[j].t == 'RawInline' and inlines[j].format == FORMAT do
        parts[#parts + 1] = inlines[j].text
        j = j + 1
      end
      while j <= #inlines and (inlines[j].t == 'Str' or inlines[j].t == 'Space') do
        parts[#parts + 1] = inlines_to_html({ inlines[j] })
        j = j + 1
      end
      local ok, parsed = pcall(pandoc.read, table.concat(parts, ''), FORMAT)
      if ok and #parsed.blocks > 0 then
        for _, y in ipairs(parsed.blocks[1].content) do out[#out + 1] = y end
        i = j
      else
        out[#out + 1] = x
        i = i + 1
      end
    else
      out[#out + 1] = x
      i = i + 1
    end
  end
  return out
end

-- 表格单元格内的代码 span：pandoc 的 markdown reader 不把 `\|` 反转义成 `|`。
-- GFM 规范要求「表格里写竖线必须转义，且该转义在代码 span 等其他行内 span 内部同样生效」，
-- 而 pandoc 的 gfm reader 会正确产出 Code "a | b"、markdown reader 却留着 Code "a \| b"，
-- 于是 typst 的 raw span 原样把反斜杠打出来（表格里显示成 `x \| y`）。
-- 注意必须限定在表格内：表格**外** `` `a \| b` `` 的反斜杠本就该是字面量，两个 reader 都如此。
-- 取舍：网格表（+---+）里的竖线本来不需要转义，此处也会一并反转义；但网格表里写 `\|`
--       表达「字面反斜杠+竖线」的情况极罕见，而管道表里 `\|` 是刚需，故按前者让步。
local function unescape_pipe_code(tbl)
  return tbl:walk({
    Code = function(el)
      local fixed = el.text:gsub('\\|', '|')
      if fixed ~= el.text then
        el.text = fixed
        return el
      end
    end,
  })
end

function Pandoc(doc)
  local blocks, hits = fix_blocks(doc.blocks)
  doc.blocks = blocks
  doc = doc:walk({ Inlines = fix_inlines })
  doc = doc:walk({ Table = unescape_pipe_code })
  io.stderr:write('[pandoc-html-fix] 重组块级 HTML ' .. hits .. ' 处\n')
  return doc
end
