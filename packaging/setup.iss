; mdbook 1.0 —— Windows 安装脚本（Inno Setup 6）
#define MyAppName "mdbook"
#define MyAppVersion "1.0"
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
OutputBaseFilename=mdbook-1.0-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\启动.vbs

[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".git\*,.build\*,dist\*,packaging\*"

[Icons]
Name: "{group}\mdbook"; Filename: "{app}\启动.vbs"; WorkingDir: "{app}"
Name: "{autodesktop}\mdbook"; Filename: "{app}\启动.vbs"; WorkingDir: "{app}"

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
