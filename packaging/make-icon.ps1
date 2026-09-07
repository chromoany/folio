# mdbook 图标生成脚本（System.Drawing）
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File make-icon.ps1
# 说明: mdbook = Markdown -> 书籍版式 PDF。概念：一本摊开的书（还原“成书”），
#       中央书脊挂一枚琥珀色书签（作 M 的意象 / 标记），配蓝靛->紫罗兰渐变底。
# 输出: ../packaging/mdbook.ico（多分辨率） 与 预览 PNG。

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$OutDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$IcoPath = Join-Path $OutDir 'mdbook.ico'
$Png256  = Join-Path $OutDir 'mdbook-256.png'

function Color255([int]$r,[int]$g,[int]$b,[int]$a=255) {
    [System.Drawing.Color]::FromArgb($a,$r,$g,$b)
}

function Draw-MdbookIcon([System.Drawing.Bitmap]$bmp,[int]$size) {
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $s = [single]$size
    # 相对坐标 -> 绝对 PointF
    function Pf([double]$fx,[double]$fy) {
        [System.Drawing.PointF]::new([single]($fx*$s),[single]($fy*$s))
    }

    # ---- 圆角方形渐变底 ----
    $rect = [System.Drawing.RectangleF]::new(0,0,$s,$s)
    $rad  = [single]($s*0.22)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = [single]$rad*2
    $path.AddArc($rect.Left,$rect.Top,$d,$d,180,90)
    $path.AddArc($rect.Right-$d,$rect.Top,$d,$d,270,90)
    $path.AddArc($rect.Right-$d,$rect.Bottom-$d,$d,$d,0,90)
    $path.AddArc($rect.Left,$rect.Bottom-$d,$d,$d,90,90)
    $path.CloseFigure()
    $grad = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect,(Color255 78 124 255),(Color255 138 92 255),[System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillPath($grad,$path)
    $grad.Dispose()

    # ---- 摊开的书：左页 + 右页（外角略高、书脊略低，形成开卷）----
    $white  = New-Object System.Drawing.SolidBrush((Color255 255 255 255))
    $leftP  = [System.Drawing.PointF[]]@( (Pf 0.235 0.345),(Pf 0.500 0.415),(Pf 0.500 0.690),(Pf 0.235 0.645) )
    $rightP = [System.Drawing.PointF[]]@( (Pf 0.500 0.415),(Pf 0.765 0.345),(Pf 0.765 0.645),(Pf 0.500 0.690) )
    $left   = [System.Drawing.Drawing2D.GraphicsPath]::new(); $left.AddPolygon($leftP)
    $right  = [System.Drawing.Drawing2D.GraphicsPath]::new(); $right.AddPolygon($rightP)
    $g.FillPath($white,$left)
    $g.FillPath($white,$right)

    # ---- 右页外侧一小卷折角（加“文档/转换”质感）----
    $foldP   = [System.Drawing.PointF[]]@( (Pf 0.688 0.352),(Pf 0.765 0.345),(Pf 0.765 0.415),(Pf 0.700 0.400) )
    $fold    = [System.Drawing.Drawing2D.GraphicsPath]::new(); $fold.AddPolygon($foldP)
    $foldBr  = New-Object System.Drawing.SolidBrush((Color255 218 209 255))
    $g.FillPath($foldBr,$fold)

    # ---- 中央书脊（渐变色竖线）----
    $spine = New-Object System.Drawing.Pen((Color255 138 92 255),[single]($s*0.008))
    $g.DrawLine($spine,(Pf 0.500 0.415),(Pf 0.500 0.690))

    # ---- 琥珀色书签（底部带分叉）----
    $markP   = [System.Drawing.PointF[]]@( (Pf 0.470 0.330),(Pf 0.530 0.330),(Pf 0.530 0.520),(Pf 0.500 0.470),(Pf 0.470 0.520) )
    $mark    = [System.Drawing.Drawing2D.GraphicsPath]::new(); $mark.AddPolygon($markP)
    $markBr  = New-Object System.Drawing.SolidBrush((Color255 255 208 84))
    $g.FillPath($markBr,$mark)

    $white.Dispose(); $foldBr.Dispose(); $markBr.Dispose(); $spine.Dispose()
    $path.Dispose(); $left.Dispose(); $right.Dispose(); $fold.Dispose(); $mark.Dispose()
    $g.Dispose()
}

# ---- 渲染所有尺寸并打包为 ICO ----
$sizes = @(16,24,32,48,64,128,256)
$blobs = @()
foreach ($sz in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($sz,$sz,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $null = Draw-MdbookIcon $bmp $sz
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $blobs += ,$ms.ToArray()
    if ($sz -eq 256) { $bmp.Save($Png256, [System.Drawing.Imaging.ImageFormat]::Png) }
    $bmp.Dispose(); $ms.Dispose()
}

$count = $blobs.Count
$pos   = 6 + 16*$count
$parts = [System.Collections.Generic.List[byte]]::new()
$parts.AddRange([byte[]](0,0))
$parts.AddRange([byte[]](1,0))
$parts.AddRange([byte[]]([byte]$count,0))
for ($i=0; $i -lt $count; $i++) {
    $sz   = $sizes[$i]
    $w    = if ($sz -ge 256) { 0 } else { $sz }
    $h    = if ($sz -ge 256) { 0 } else { $sz }
    $data = $blobs[$i]
    $parts.AddRange([byte[]]([byte]$w,[byte]$h,0,0))
    $parts.AddRange([byte[]](1,0))
    $parts.AddRange([byte[]](32,0))
    $parts.AddRange([byte[]]([byte]($data.Length -band 0xFF),[byte](($data.Length -shr 8) -band 0xFF),[byte](($data.Length -shr 16) -band 0xFF),[byte](($data.Length -shr 24) -band 0xFF)))
    $parts.AddRange([byte[]]([byte]($pos -band 0xFF),[byte](($pos -shr 8) -band 0xFF),[byte](($pos -shr 16) -band 0xFF),[byte](($pos -shr 24) -band 0xFF)))
    $pos += $data.Length
}
foreach ($b in $blobs) { $parts.AddRange($b) }

[System.IO.File]::WriteAllBytes($IcoPath,$parts.ToArray())
Write-Output "OK  -> $IcoPath  ($($blobs.Count) sizes)"
Write-Output "    -> $Png256"
