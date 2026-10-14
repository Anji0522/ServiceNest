import { spawn } from 'node:child_process';
import process from 'node:process';

const apiTarget = process.env.SERVICENEST_API_TARGET
  || `http://127.0.0.1:${process.env.API_PORT || 3001}`;
const hasApi = async () => {
  try {
    const response = await fetch(`${apiTarget}/api/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.json()).status === 'ok';
  } catch {
    return false;
  }
};
const apiAvailable = await hasApi();

const children = [];
if (!apiAvailable) {
  children.push(spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' }));
}
children.push(spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview'], { stdio: 'inherit' }));
let shuttingDown = false;

const stopChildren = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
};

for (const child of children) {
  child.on('error', (error) => {
    console.error('Could not start a preview process:', error);
    stopChildren();
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      console.error('A preview process exited with code', code);
      stopChildren();
      process.exitCode = code || 1;
    }
  });
}

process.on('SIGINT', stopChildren);
process.on('SIGTERM', stopChildren);
