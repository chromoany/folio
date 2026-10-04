; Folio —— Windows 安装脚本（Inno Setup 6）
; 版本号单一来源是 package.json：由 scripts/package.cjs 编译时经 ISCC /DMyAppVersion=x.y.z 注入。
; 直接手跑 ISCC 时没有注入，会得到占位版本 0.0.0-dev（故意显眼，避免误发错误版本号的安装包）。
; v1.7.10 更新点：
;   * 修复：链接与图片不再让整本书编译失败——空目标 [文本](#)、指向不存在锚点的链接
;     降级为纯文本；本地图片按文件内容判定真实格式后随转换复制（文件扩展名与内容不符
;     不再解码失败）；缺失图片、typst 不支持的格式、远程图片以占位文字排版并记日志
;   * 修复：LaTeX 原料（\LaTeX 等 TeX 命令）此前被静默丢弃，现按原文字面排版
; v1.7.9 更新点：
;   * 修复：行内代码此前与代码块共用代码字号（默认 8pt），比正文字号小一圈；现行内代码
;     跟随所在行字号——正文里与正文等大、标题里与标题等大，代码块字号保持不变
; v1.7.8 更新点：
;   * 修复：三级/四级标题上下的间距仍比正文行距紧——v1.7.7 对这两级给的系数偏小，且正文
;     列表项之间的间距是排版引擎的固定值、不随行距设置变化；现各级标题上下间距统一抬到
;     不低于正文间距，标题上方再放大一档保持层级（实测四级标题下方 4.3pt → 11.3pt @1em）
; v1.7.7 更新点：
;   * 修复：行距设置此前只作用于正文，各级标题上下的间距是写死的固定值，调大行距后
;     标题反而显得更挤；现 H1–H6 的标题上下间距随行距同比例缩放
;   * 调整：标题默认间距整体放宽（二级标题上下间距约为原来的 1.9 倍，三、四级同步加大）；
;     行距的含义随之扩展为「正文行距 + 标题上下间距」
; v1.7.6 更新点：
;   * 新增：转换选项里可直接选行距（紧凑 0.85em / 标准 1em / 宽松 1.2em / 更宽松 1.4em），
;     与命令行 --leading / 配置 font.leading 同源生效
; v1.7.5 更新点：
;   * 调整：正文行距默认值由 0.75em 放宽到 1em（10.5pt 字号下行距约 18.5pt），解决行距太紧凑；
;     行距可经配置项 font.leading 或命令行 --leading 自定义（如 0.85em 收紧、1.2em 更松）
; v1.7.4 更新点：
;   * 安全：本地 GUI 服务增加请求来源校验（Host 白名单 + Origin 同源），堵死浏览器里
;     恶意网页对 127.0.0.1:4680 的跨源调用与 DNS rebinding；「打开文件 / 文件夹」
;     收口为仅限本次转换产出的 PDF 及其所在目录
;   * 修复：重启时清理旧进程的端口识别改为按列精确解析，不再误杀端口号相近的无关进程
;   * 修复：请求体按字节累积解码，大文件（多字节 UTF-8）不再被网络分包截断成乱码
; v1.7.3 更新点：
;   * 修复：单独一行的 --- 被 Pandoc 误判成表格边框，把该段正文排成「一个字一行」的竖排
;     窄条（长内容还会溢出页面）；现识别并还原为正常正文
;   * 修复：表格列宽由 Pandoc 按源文本字符数估算，中文列常被压到 1%~5% 而成竖条；
;     编译前自动把过窄列改为按内容自适应
;   * 新增：转换日志逐条报告对原文做的改动（跳过手写目录、为列表/表格补空行、还原被误判的
;     分隔线、放宽过窄列宽、重组 HTML 块），不再静默修改用户内容
; v1.7.2 更新点：
;   * 修复：代码块里的中文此前走系统兜底字体，渲染得又细又小、难以辨认；
;     现默认使用中文等宽字体 NSimSun（新宋体），可经 font.monoCjk 配置项更换
;   * 修复：表格单元格内代码 span 的 \| 未反转义，PDF 里显示成 x \| y（应为 x | y）——
;     Pandoc 的 markdown reader 未实现 GFM 的「表格内转义在其他行内 span 中也生效」规则
; v1.7.1 更新点：
;   * 修复：Markdown 中的 HTML 表格（含 rowspan/colspan 合并单元格）此前不生成表格、
;     单元格被压成一行文字；现可正确还原为表格，并保留单元格内的换行与粗体/等宽格式
;   * 修复：正文或标题中出现 @ 符号（如 @用户名）会导致整本 PDF 编译失败的问题
;   * 新增：设置弹窗底部显示当前版本号
; v1.7.0 更新点：
;   * 新增黑夜模式：界面「设置 → 外观主题」可选「跟随系统 / 浅色 / 深色」（默认跟随系统）；
;     深色下页面底色、卡片、输入框、按钮、日志框、弹窗等全部随主题切换，不再出现底/字撞色
; v1.6.2 更新点：
;   * 修复：表格紧跟在正文段落后（之间无空行）时，被 Pandoc 折叠成一行带 | 的普通文本，
;     PDF 不生成表格的问题（转换前自动为「表头行 + 分隔行」表格块补空行，GUI 与命令行均生效）
; v1.6.1 更新点：
;   * 修复：点击「下载 PDF」会连续弹出两个「另存为」对话框的问题
; v1.6.0 更新点：
;   * 安装体积精简：Electron locales 仅保留中英语言包；pandoc/typst 引擎经 UPX 压缩
;     （运行时自解压，转换功能与输出完全不变）
; v1.5.0 更新点：
;   * 安装时可选语言（简体中文 / English），向导全程随所选语言显示
;   * 安装完成页新增「立即启动 Folio」勾选项（默认勾选）
;   * 安装语言写入用户数据目录，软件界面默认跟随安装语言（之后可在「设置」里切换中英）
;   * 修复卸载后残留 resources 文件夹：运行时临时文件改到用户数据目录，卸载时彻底清空安装目录
;   * （继承 1.4.1）关闭行为可配置、托盘、自动检查更新、独立桌面版、图标、快捷方式可选、始终可选安装目录
; 注：AppId 保持与旧版（mdbook/Folio）一致，便于从旧版平滑升级
#define MyAppName "Folio"
; 版本号由 package.cjs 经 ISCC /DMyAppVersion 注入，此处仅兜底
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0-dev"
#endif
#define MyAppPublisher "chromoany"
#define MyAppURL "https://github.com/chromoany/folio"

[Setup]
AppId={{8A4D2C7E-6F1B-4C3E-9B5A-2D7F8E1A0C3B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\folio
DefaultGroupName=Folio
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=folio-{#MyAppVersion}-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=folio.ico
UninstallDisplayIcon={app}\folio.ico
UninstallDisplayName=Folio
; 始终显示「选择安装位置」页（升级时也显示，由下方 [Code] 预填上次目录）
UsePreviousAppDir=no
AppendDefaultDirName=no
Uninstallable=yes

[Languages]
; 两种语言都会在安装开始时弹出「选择语言」对话框（默认预选与系统匹配的语言）
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimp"; MessagesFile: "languages\ChineseSimplified.isl"

[CustomMessages]
; 按语言提供向导中的自定义文案（语言名与上方 [Languages] 的 Name 对应）
english.GroupShortcuts=Additional shortcuts:
chinesesimp.GroupShortcuts=附加快捷方式:
english.TaskStartMenu=Create a Start menu shortcut
chinesesimp.TaskStartMenu=创建开始菜单快捷方式
english.TaskDesktopIcon=Create a desktop icon
chinesesimp.TaskDesktopIcon=创建桌面图标
english.RunFolio=Launch Folio
chinesesimp.RunFolio=立即启动 Folio

[Tasks]
; 快捷方式：默认勾选，用户可在安装向导里取消
Name: "startmenu"; Description: "{cm:TaskStartMenu}"; GroupDescription: "{cm:GroupShortcuts}"
Name: "desktopicon"; Description: "{cm:TaskDesktopIcon}"; GroupDescription: "{cm:GroupShortcuts}"

[Files]
; Electron 桌面应用（folio.exe + Chromium 运行时 + 应用代码 + pandoc/typst）
Source: "..\.build\electron\folio-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; 软件图标随安装复制，供快捷方式 / 卸载显示使用
Source: "folio.ico"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; 升级时清理旧版（v1.1 及之前）直接铺在安装根目录的文件，避免残留
Type: filesandordirs; Name: "{app}\bin"
Type: filesandordirs; Name: "{app}\gui"
Type: filesandordirs; Name: "{app}\template"
Type: filesandordirs; Name: "{app}\vendor"
Type: filesandordirs; Name: "{app}\assets"
Type: filesandordirs; Name: "{app}\scripts"
Type: filesandordirs; Name: "{app}\examples"
Type: filesandordirs; Name: "{app}\packaging"
Type: files; Name: "{app}\启动.vbs"
Type: files; Name: "{app}\config.example.json"
Type: files; Name: "{app}\README.md"
Type: files; Name: "{app}\README.zh.md"
; v1.4.x 曾把转换临时文件写进 resources\app\.build（1.5 起改到用户数据目录），升级时清掉历史残留
Type: filesandordirs; Name: "{app}\resources\app\.build"

[Icons]
Name: "{group}\Folio"; Filename: "{app}\folio.exe"; WorkingDir: "{app}"; IconFilename: "{app}\folio.ico"; Tasks: startmenu
Name: "{group}\卸载 Folio"; Filename: "{app}\unins000.exe"; Tasks: startmenu
Name: "{autodesktop}\Folio"; Filename: "{app}\folio.exe"; WorkingDir: "{app}"; IconFilename: "{app}\folio.ico"; Tasks: desktopicon

[Run]
; 安装完成页出现「立即启动 Folio」勾选项（默认勾选），装完可直接运行
Filename: "{app}\folio.exe"; Description: "{cm:RunFolio}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 卸载时彻底清空安装目录（含运行期历史残留），避免留下 resources 等残留文件夹
Type: filesandordirs; Name: "{app}"

[Code]
// 升级时「选择安装位置」页预填上次安装目录，避免静默改回默认 C 盘导致重复安装
function GetPreviousInstallDir(): string;
var
  S: string;
begin
  Result := '';
  if RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupSetting("AppId")}_is1', 'InstallLocation', S) then
    Result := S
  else if RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupSetting("AppId")}_is1', 'InstallLocation', S) then
    Result := S
  else if RegQueryStringValue(HKCU32, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupSetting("AppId")}_is1', 'InstallLocation', S) then
    Result := S
  else if RegQueryStringValue(HKCU64, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupSetting("AppId")}_is1', 'InstallLocation', S) then
    Result := S;
end;

procedure InitializeWizard;
var
  Prev: string;
begin
  Prev := GetPreviousInstallDir();
  if (Prev <> '') and DirExists(Prev) then
    WizardForm.DirEdit.Text := Prev;
end;

// 安装结束时把向导所选语言写入 %APPDATA%\folio\install-lang.txt（zh / en），
// 软件首次启动据此选择界面语言；之后用户可在软件「设置」里随时切换
procedure CurStepChanged(CurStep: TSetupStep);
var
  LangCode: string;
  DataDir: string;
begin
  if CurStep = ssPostInstall then
  begin
    if ActiveLanguage() = 'chinesesimp' then
      LangCode := 'zh'
    else
      LangCode := 'en';
    DataDir := ExpandConstant('{userappdata}\folio');
    if not DirExists(DataDir) then
      CreateDir(DataDir);
    SaveStringToFile(AddBackslash(DataDir) + 'install-lang.txt', LangCode, False);
  end;
end;
