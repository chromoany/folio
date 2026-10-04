-- Folio 组件（勿删）：pandoc Lua 过滤器 —— 收集 pandoc markdown reader 的缺口修补
-- 由 bin/folio.cjs 经 --lua-filter 调用
-- 当前六项修补：
--   ① HTML 断链：reader 不解析 HTML，raw html 被 typst writer 静默丢弃（见下方【断链根因】）
--   ② 表格单元格内代码 span 的 `\|` 未反转义（见 unescape_pipe_code）
--   ③ 分隔线被误判成表格：单独一行的 `---` 被 multiline table 抢走（见 unwrap_dash_table）
--   ④ 空链接目标 / 死锚点：`[文本](#)`、`[文本](#不存在)` 会让 typst 编译失败，降级为纯文本
--   ⑤ 图片兜底：本地图片复制进转换目录（typst 只认转换目录内的路径），并按文件**内容**嗅探
--      真实格式、强制正确扩展名——typst 按扩展名选解码器，「.jpg 名配 PNG 内容」这类错名文件
--      会解码失败整本编译挂；缺失 / 格式不支持 / 远程图片（离线管线不联网抓取）降级为占位文字。
--      远程图片若 FOLIO_MEDIA_MANIFEST 存在（用户开了联网抓取）则只登记 URL 到清单、留好文件名，
--      抓取与失败兜底都由 bin/folio.cjs 在 Node 侧做（pandoc 自带 HTTP 栈会硬崩，勿在 Lua 里抓）
--   ⑥ raw TeX 原样保留为文字：`\LaTeX` 这类 TeX 命令会被 typst writer 静默丢弃（内容丢失）
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
--
-- 【环境变量】（由 bin/folio.cjs 设置，缺省时对应修补自动降级为不动作）
--   FOLIO_FILTER_REPORT  改动统计报告文件路径
--   FOLIO_MEDIA_DIR      图片落盘目录（转换运行目录下的 media/，typst 从 body.typ 相对引用）
--   FOLIO_SRC_DIRS       原始 md 文件所在目录列表（';' 分隔），相对图片路径按此解析
--   FOLIO_LANG           界面语言 zh/en，占位文字随语言切换

local FORMAT = 'html'
local BLOCK_TAGS = {
  table = true, div = true, section = true, details = true, figure = true,
  aside = true, blockquote = true, ul = true, ol = true, dl = true,
  center = true, article = true, nav = true, header = true, footer = true, main = true,
}

local STATS = {
  html_blocks = 0, dash_tables = 0,
  empty_links = 0, dead_links = 0,
  img_copied = 0, img_missing = 0,
  raw_tex = 0,
}

local MEDIA_DIR = os.getenv('FOLIO_MEDIA_DIR')
local MANIFEST = os.getenv('FOLIO_MEDIA_MANIFEST') -- 远程图片抓取清单；不设 = 不抓取，走占位文字
local SRC_DIRS = {}
do
  local s = os.getenv('FOLIO_SRC_DIRS') or ''
  for d in s:gmatch('[^;]+') do
    if d ~= '' then SRC_DIRS[#SRC_DIRS + 1] = d end
  end
end
local LANG = os.getenv('FOLIO_LANG') or 'zh'

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
  local out, i = {}, 1
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
        STATS.html_blocks = STATS.html_blocks + 1
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
  return out
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

-- 单独一行的分隔线会被 pandoc 的 markdown reader 抢去当 multiline table 的边框：
--     上文
--     <空行>
--     ---
--     第一行正文        <- 上面那条分隔线之后**不留空行**，这一行就成了表头
--     第二行正文
--     <空行>
--     ---               <- 再出现一条分隔线，表格闭合
-- 结果是「单列、无表头」的 Table：一或几行正文被塞进单元格。typst writer 随后按
-- 4/--columns（默认 5.56%）估算列宽，typst 把这一列压成「一个字一行」的竖条，
-- 长内容还会直接溢出页面 —— 全程零报错（silent degradation，只能看渲染结果才发现）。
-- 反证：`-f gfm` 读同一段不会退化成表格；管道表 / 网格表有表头行，列宽另算，不适用本例。
-- 修法：既然是误判就不是用户要的表格 —— 把单元格内容按块还原回正文（`Plain` 升级成 `Para`）。
-- 判据三重收紧，避免误伤真表格：
--   ① 单列           —— `---` 没有列分隔符，误判产物必然是单列
--   ② 无表头         —— 管道表 / 网格表都带表头行
--   ③ 列宽窄或未指定 —— 误判的列宽要么是 nil（未指定），要么是 writer 按 4/--columns 估出来的
--                       小数值（默认 5.56%）；而 HTML reader 解析出的单列表格列宽是 1.0
--                       （实测），真实网格表由源宽度决定，都不会落进来
local function is_dash_misparse(tbl)
  if #tbl.colspecs ~= 1 then return false end
  if #tbl.head.rows ~= 0 then return false end
  if tbl.caption and tbl.caption.long and #tbl.caption.long > 0 then return false end
  local w = tbl.colspecs[1][2] -- pandoc 的 Lua 里列宽就是数字，未指定时为 nil（ColWidthDefault）
  if w ~= nil and (type(w) ~= 'number' or w > 0.5) then return false end
  return true
end

local function unwrap_dash_table(tbl)
  local out = {}
  local function add(blks)
    for _, b in ipairs(blks) do
      if b.t == 'Plain' then out[#out + 1] = pandoc.Para(b.content)
      else out[#out + 1] = b end
    end
  end
  local function add_row(row)
    for _, cell in ipairs(row.cells) do add(cell.contents) end
  end
  for _, row in ipairs(tbl.head.rows) do add_row(row) end
  for _, body in ipairs(tbl.bodies) do
    for _, row in ipairs(body.body) do add_row(row) end
  end
  for _, row in ipairs(tbl.foot.rows) do add_row(row) end
  return out
end

-- —— ④ 链接兜底：空目标 / 死锚点 ————————————————————————————————
-- pandoc 的 typst writer 对 `[文本](#)` 产出 `#link()[文本]`（link() 缺参数）、
-- 对 `[文本](#不存在)` 产出 `#link(<不存在>)[文本]`（label 不存在），两者都让 typst
-- 硬报错、整本编译失败。这类链接在导出稿（Notion/Typora 模板）里常是装饰性占位。
-- 修法：目标为空或锚点在本文档里不存在时，退化为纯文本（保留文字，不再假装可点）。

local function percent_decode(s)
  return (s:gsub('%%(%x%x)', function(h) return string.char(tonumber(h, 16)) end))
end

-- 文档内的锚点全集（pandoc typst writer 从这些元素的 identifier 生成 <label>）
local function collect_ids(doc)
  local ids = {}
  local function add(el)
    if el.identifier and el.identifier ~= '' then ids[el.identifier] = true end
  end
  doc:walk({
    Header = add, Div = add, Span = add,
    Figure = add, CodeBlock = add, Table = add,
  })
  return ids
end

-- —— ⑤⑥ 图片兜底与 raw TeX 保留 ————————————————————————————————

local function str_inlines(s)
  local out = {}
  for w in s:gmatch('%S+') do
    if #out > 0 then out[#out + 1] = pandoc.Space() end
    out[#out + 1] = pandoc.Str(w)
  end
  if #out == 0 then out[1] = pandoc.Str('') end
  return out
end

local function file_exists(p)
  local f = io.open(p, 'rb')
  if f then f:close() return true end
  return false
end

local function read_file(p)
  local f = io.open(p, 'rb')
  if not f then return nil end
  local data = f:read('*a')
  f:close()
  return data
end

local B64CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local B64MAP = {}
for i = 1, #B64CHARS do B64MAP[B64CHARS:sub(i, i)] = i - 1 end

local function b64decode(s)
  local out, acc, bits = {}, 0, 0
  for c in s:gmatch('.') do
    local v = B64MAP[c]
    if v then
      acc = acc * 64 + v
      bits = bits + 6
      if bits >= 8 then
        bits = bits - 8
        out[#out + 1] = string.char(math.floor(acc / 2 ^ bits) % 256)
        acc = acc % 2 ^ bits
      end
    end
  end
  return table.concat(out)
end

-- 按文件内容嗅探真实图片格式：typst 按扩展名选解码器，落盘文件的扩展名必须与内容一致；
-- typst 排版不支持的格式返回 nil，调用方降级为占位文字
local function sniff_ext(data)
  if not data or #data < 4 then return nil end
  if data:sub(2, 4) == 'PNG' then return 'png' end
  if data:sub(1, 3) == '\255\216\255' then return 'jpg' end
  if data:sub(1, 4) == 'GIF8' then return 'gif' end
  if data:sub(1, 2) == 'BM' then return 'bmp' end
  if data:sub(1, 4) == 'RIFF' and data:sub(9, 12) == 'WEBP' then return 'webp' end
  local head = data:sub(1, 512)
  if head:find('<svg', 1, true) or (head:find('<%?xml', 1, true) and head:find('svg', 1, true)) then
    return 'svg'
  end
  return nil
end

local mediaCount = 0
local function media_name(src, ext)
  mediaCount = mediaCount + 1
  local base
  if src:match('^data:') then
    base = 'data-image'
  else
    base = (src:match('([^/\\]+)$') or 'image'):gsub('[<>:"/\\|?*]', '_')
    base = base:gsub('%?.*$', ''):gsub('#.*$', ''):gsub('%.[^%.]*$', '')
    base = base:sub(1, 40)
  end
  if base == '' or base == '.' or base == '..' then base = 'image' end
  return 'img-' .. mediaCount .. '-' .. base .. '.' .. ext
end

-- 相对路径按原始 md 所在目录解析（转换时 md 被复制进临时目录，cwd 不再是原文目录）
local function resolve_local(src)
  if not src or src == '' then return nil end
  local s = src:gsub('^%./', '')
  if s:match('^%a:[/\\]') or s:match('^[/\\]') then
    return file_exists(s) and s or nil
  end
  for _, d in ipairs(SRC_DIRS) do
    local p = d .. '/' .. s
    if file_exists(p) then return p end
  end
  return nil
end

local function missing_placeholder(img)
  local alt = ''
  if img.caption then alt = pandoc.utils.stringify(img.caption) end
  local src = img.src or ''
  local text
  if LANG == 'en' then
    text = '[image missing: ' .. (alt ~= '' and (alt .. ' -> ') or '') .. src .. ']'
  else
    text = '[图片缺失: ' .. (alt ~= '' and (alt .. ' -> ') or '') .. src .. ']'
  end
  return pandoc.Emph(str_inlines(text))
end

local function save_media(img, data, ext)
  local name = media_name(img.src or 'image', ext)
  local f = io.open(MEDIA_DIR .. '/' .. name, 'wb')
  if not f then return nil end
  f:write(data)
  f:close()
  img.src = 'media/' .. name
  STATS.img_copied = STATS.img_copied + 1
  return img
end

local remoteCount = 0
local function fix_image(img)
  if not MEDIA_DIR then return nil end -- 手跑 pandoc 时保持原行为
  local src = img.src or ''
  local data
  if src:match('^data:image/') then
    local b64 = src:match('^data:image/[%w%+%-%.]+;base64,(.+)$')
    if b64 then data = b64decode(b64) end
  elseif src:match('^%a[%w+.-]*://') then
    if MANIFEST then
      -- 抓取交给 Node 侧：登记 URL、先占一个文件名；抓到什么格式由 folio.cjs 按内容正名
      remoteCount = remoteCount + 1
      local name = 'remote-' .. remoteCount .. '.png'
      local f = io.open(MANIFEST, 'a')
      if f then
        f:write(name .. '\t' .. src .. '\n')
        f:close()
      end
      img.src = 'media/' .. name
      return img
    end
    data = nil -- 未开抓取：远程图片走占位文字
  else
    local p = resolve_local(src)
    if p then data = read_file(p) end
  end
  local ext = sniff_ext(data)
  if ext then
    local saved = save_media(img, data, ext)
    if saved then return saved end
  end
  STATS.img_missing = STATS.img_missing + 1
  return missing_placeholder(img)
end

function Pandoc(doc)
  doc.blocks = fix_blocks(doc.blocks)
  doc = doc:walk({ Inlines = fix_inlines })
  doc = doc:walk({ Table = unescape_pipe_code })
  doc = doc:walk({
    Table = function(tbl)
      if is_dash_misparse(tbl) then
        STATS.dash_tables = STATS.dash_tables + 1
        return unwrap_dash_table(tbl) -- 返回块列表：pandoc 用这些块替换掉该元素
      end
    end,
  })
  local ids = collect_ids(doc)
  doc = doc:walk({
    Link = function(l)
      local t = (l.target or ''):gsub('%s+', '')
      if t == '' or t == '#' then
        STATS.empty_links = STATS.empty_links + 1
        return l.content
      end
      local frag = t:match('^#(.+)$')
      if frag and not ids[percent_decode(frag)] then
        STATS.dead_links = STATS.dead_links + 1
        return l.content
      end
    end,
    Image = fix_image,
    RawInline = function(r)
      if r.format == 'tex' or r.format == 'latex' then
        STATS.raw_tex = STATS.raw_tex + 1
        return str_inlines(r.text)
      end
    end,
    RawBlock = function(r)
      if r.format == 'tex' or r.format == 'latex' then
        STATS.raw_tex = STATS.raw_tex + 1
        return pandoc.Para(str_inlines(r.text))
      end
    end,
  })
  -- 统计交给 bin/folio.cjs：优先写报告文件（路径由环境变量给，stdio 被 inherit 时也能拿到），
  -- 再往 stderr 写一行机器可读的版本，便于单独手跑 pandoc 时诊断
  local order = {
    'html_blocks', 'dash_tables', 'empty_links', 'dead_links',
    'img_copied', 'img_missing', 'raw_tex',
  }
  local buf = {}
  for _, k in ipairs(order) do buf[#buf + 1] = k .. '=' .. tostring(STATS[k]) end
  local line = table.concat(buf, '\n') .. '\n'
  local report = os.getenv('FOLIO_FILTER_REPORT')
  if report then
    local f = io.open(report, 'w')
    if f then
      f:write(line)
      f:close()
    end
  end
  io.stderr:write('[folio-filter] ' .. line)
  return doc
end
