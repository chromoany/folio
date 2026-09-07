'use strict';
/**
 * 启动器：先杀掉占用端口的旧服务（确保用最新代码），再启动新服务。
 * 由根目录「启动.vbs」调用。启动器退出后，新服务在后台继续运行。
 */
const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.MDBOOK_GUI_PORT || 4680);

function killPortOwner(port) {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', windowsHide: true });
    for (const line of out.split(/\r?\n/)) {
      if (line.includes(`:${port}`) && line.toUpperCase().includes('LISTENING')) {
        const pid = line.trim().split(/\s+/).pop();
        if (/^\d+$/.test(pid)) {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', windowsHide: true });
        }
      }
    }
  } catch (_) {}
}

killPortOwner(PORT);
setTimeout(() => {
  const child = spawn(process.execPath, [path.join(__dirname, 'server.cjs')], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}, 600);
