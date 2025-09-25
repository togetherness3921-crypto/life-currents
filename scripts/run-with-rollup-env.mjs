#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const viteBin = resolve(__dirname, '../node_modules/vite/bin/vite.js');
const args = process.argv.slice(2);
const child = spawn(process.execPath, [viteBin, ...args], {
    stdio: 'inherit',
    env: {
        ...process.env,
        ROLLUP_SKIP_NODEJS_NATIVE: 'true',
    },
});
child.on('close', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 0);
});
child.on('error', (error) => {
    console.error('Failed to start Vite with Rollup env override:', error);
    process.exit(1);
});
