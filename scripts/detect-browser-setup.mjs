#!/usr/bin/env node

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFERENCE_FILE = process.env.BROWSER_MODE_PREFERENCE_FILE || path.join(ROOT, '.browser-mode-preference.json');

function parseArgs(argv) {
  const options = {
    dedicatedProfileDir: process.env.DEDICATED_PROFILE_DIR || null,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dedicated-profile-dir') {
      options.dedicatedProfileDir = argv[index + 1] || options.dedicatedProfileDir;
      index += 1;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node detect-browser-setup.mjs [--dedicated-profile-dir <path>] [--json]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

const OPTIONS = parseArgs(process.argv.slice(2));

function checkPort(port, host = '127.0.0.1', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host);
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, timeoutMs);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.once('error', () => { clearTimeout(timer); resolve(false); });
  });
}

function getPrimaryActivePortFiles() {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || '';
  switch (os.platform()) {
    case 'darwin':
      return [
        path.join(home, 'Library/Application Support/Google/Chrome/DevToolsActivePort'),
        path.join(home, 'Library/Application Support/Google/Chrome Canary/DevToolsActivePort'),
        path.join(home, 'Library/Application Support/Chromium/DevToolsActivePort'),
        path.join(home, 'Library/Application Support/BraveSoftware/Brave-Browser/DevToolsActivePort'),
        path.join(home, 'Library/Application Support/Microsoft Edge/DevToolsActivePort'),
        path.join(home, 'Library/Application Support/Arc/User Data/DevToolsActivePort'),
      ];
    case 'linux':
      return [
        path.join(home, '.config/google-chrome/DevToolsActivePort'),
        path.join(home, '.config/chromium/DevToolsActivePort'),
        path.join(home, '.config/BraveSoftware/Brave-Browser/DevToolsActivePort'),
        path.join(home, '.config/microsoft-edge/DevToolsActivePort'),
      ];
    case 'win32':
      return [
        path.join(localAppData, 'Google/Chrome/User Data/DevToolsActivePort'),
        path.join(localAppData, 'Chromium/User Data/DevToolsActivePort'),
        path.join(localAppData, 'BraveSoftware/Brave-Browser/User Data/DevToolsActivePort'),
        path.join(localAppData, 'Microsoft/Edge/User Data/DevToolsActivePort'),
      ];
    default:
      return [];
  }
}

async function detectFromFiles(files) {
  for (const filePath of files) {
    try {
      const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
      const port = parseInt(lines[0], 10);
      if (port > 0 && port < 65536 && await checkPort(port)) {
        return { available: true, port, filePath, wsPath: lines[1] || null };
      }
    } catch {}
  }
  return { available: false, port: null, filePath: null, wsPath: null };
}

async function main() {
  let preference = null;
  try {
    if (fs.existsSync(PREFERENCE_FILE)) {
      preference = JSON.parse(fs.readFileSync(PREFERENCE_FILE, 'utf8'));
    }
  } catch {}

  const dedicatedProfileDir = OPTIONS.dedicatedProfileDir || preference?.preferredDedicatedProfileDir || null;
  const primary = await detectFromFiles(getPrimaryActivePortFiles());
  const dedicated = dedicatedProfileDir
    ? await detectFromFiles([path.join(dedicatedProfileDir, 'DevToolsActivePort')])
    : { available: false, port: null, filePath: null, wsPath: null, missingProfileDir: true };

  const result = {
    primary,
    dedicated: {
      ...dedicated,
      profileDir: dedicatedProfileDir,
    },
    preference,
  };

  if (OPTIONS.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (primary.available) {
    console.log(`primary: ready (port ${primary.port})`);
  } else {
    console.log('primary: not ready');
  }

  if (dedicated.available) {
    console.log(`dedicated: ready (port ${dedicated.port}, profile ${dedicatedProfileDir})`);
  } else if (dedicated.missingProfileDir) {
    console.log('dedicated: not ready (missing profile dir)');
  } else {
    console.log(`dedicated: not ready (profile ${dedicatedProfileDir})`);
  }

  if (preference?.preferredBrowserMode) {
    console.log(`preference: ${preference.preferredBrowserMode}`);
  } else {
    console.log('preference: not set');
  }
}

await main();
