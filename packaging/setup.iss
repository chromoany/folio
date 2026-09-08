; Folio 1.6.1 —— Windows 安装脚本（Inno Setup 6）
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
#define MyAppVersion "1.6.1"
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
OutputBaseFilename=folio-1.6.1-setup
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
