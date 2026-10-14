import { spawn } from 'node:child_process';
import process from 'node:process';

const children = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
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
    console.error('Could not start a development process:', error);
    stopChildren();
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`A development process exited with code ${code}.`);
      stopChildren();
      process.exitCode = code || 1;
    }
  });
}

process.on('SIGINT', stopChildren);
process.on('SIGTERM', stopChildren);
