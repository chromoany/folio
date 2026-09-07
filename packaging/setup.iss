; mdbook 1.2.0 —— Windows 安装脚本（Inno Setup 6）
; 更新点：
;   * 全新独立桌面版：Electron 打包，自带 Chromium 内核，无需浏览器、无需 Node.js
;   * 全新设计的软件图标 mdbook.ico（安装器图标 / 快捷方式图标 / 卸载显示图标）
;   * 桌面 + 开始菜单快捷方式指向 mdbook.exe（安装时可勾选，默认勾选）
;   * 开始菜单提供「卸载 mdbook」，并确保写入系统「应用」列表
#define MyAppName "mdbook"
#define MyAppVersion "1.2.0"
#define MyAppPublisher "chromoany"
#define MyAppURL "https://github.com/chromoany/mdbook"

[Setup]
AppId={{8A4D2C7E-6F1B-4C3E-9B5A-2D7F8E1A0C3B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\mdbook
DefaultGroupName=mdbook
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=mdbook-1.2.0-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=mdbook.ico
UninstallDisplayIcon={app}\mdbook.ico
UninstallDisplayName=mdbook
; 保证卸载信息写入 Windows「已安装的应用」列表，可在设置/开始菜单右键卸载
UsePreviousAppDir=yes
AppendDefaultDirName=no
Uninstallable=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
; 快捷方式：默认勾选（像正常软件那样出现），用户可在安装向导里取消
Name: "startmenu"; Description: "创建开始菜单快捷方式"; GroupDescription: "快捷方式:"
Name: "desktopicon"; Description: "创建桌面图标"; GroupDescription: "快捷方式:"

[Files]
; Electron 桌面应用（mdbook.exe + Chromium 运行时 + 应用代码 + pandoc/typst）
Source: "..\.build\electron\mdbook-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; 软件图标随安装复制，供快捷方式 / 卸载显示使用
Source: "mdbook.ico"; DestDir: "{app}"; Flags: ignoreversion

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

[Icons]
Name: "{group}\mdbook"; Filename: "{app}\mdbook.exe"; WorkingDir: "{app}"; IconFilename: "{app}\mdbook.ico"; Tasks: startmenu
Name: "{group}\卸载 mdbook"; Filename: "{app}\unins000.exe"; Tasks: startmenu
Name: "{autodesktop}\mdbook"; Filename: "{app}\mdbook.exe"; WorkingDir: "{app}"; IconFilename: "{app}\mdbook.ico"; Tasks: desktopicon
