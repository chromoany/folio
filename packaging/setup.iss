; mdbook 1.1.1 —— Windows 安装脚本（Inno Setup 6）
; 更新点：
;   * 全新设计的软件图标 mdbook.ico（安装器图标 / 快捷方式图标 / 卸载显示图标）
;   * 桌面 + 开始菜单快捷方式改为安装时可勾选（默认勾选，符合常规软件）
;   * 开始菜单提供「卸载 mdbook」，并确保写入系统「应用」列表（可在设置/开始菜单右键卸载）
#define MyAppName "mdbook"
#define MyAppVersion "1.1.1"
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
OutputBaseFilename=mdbook-1.1.1-setup
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
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".git\*,.build\*,dist\*,packaging\*"
; 软件图标随安装复制，供快捷方式 / 卸载显示使用
Source: "mdbook.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\mdbook"; Filename: "{app}\启动.vbs"; WorkingDir: "{app}"; IconFilename: "{app}\mdbook.ico"; Tasks: startmenu
Name: "{group}\卸载 mdbook"; Filename: "{app}\unins000.exe"; Tasks: startmenu
Name: "{autodesktop}\mdbook"; Filename: "{app}\启动.vbs"; WorkingDir: "{app}"; IconFilename: "{app}\mdbook.ico"; Tasks: desktopicon

[Code]
function IsNodeInstalled(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('cmd.exe', '/c where node', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if not IsNodeInstalled() then
    MsgBox('未检测到 Node.js。mdbook 需要 Node.js（v18+）才能运行，请先到 https://nodejs.org/ 安装。', mbInformation, MB_OK);
end;
