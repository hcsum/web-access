#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DEDICATED_PROFILE_DIR = path.join(os.homedir(), '.web-access', 'chromium-dedicated-profile');
const STATE_FILE = process.env.BROWSER_MODE_PREFERENCE_FILE || path.join(ROOT, '.browser-mode-preference.json');

function parseArgs(argv) {
  const options = {
    command: 'get',
    browser: null,
    browserApp: null,
    dedicatedProfileDir: DEFAULT_DEDICATED_PROFILE_DIR,
    json: false,
  };

  let commandSet = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!commandSet && ['get', 'set', 'clear'].includes(arg)) {
      options.command = arg;
      commandSet = true;
      continue;
    }
    if (arg === '--browser') {
      options.browser = argv[index + 1] || options.browser;
      index += 1;
      continue;
    }
    if (arg === '--browser-app') {
      options.browserApp = argv[index + 1] || options.browserApp;
      index += 1;
      continue;
    }
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
      console.log('Usage: node browser-mode-preference.mjs [get|set|clear] [--browser primary|dedicated] [--browser-app <name>] [--dedicated-profile-dir <path>] [--json]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.command === 'set' && !['primary', 'dedicated'].includes(options.browser)) {
    throw new Error('The set command requires --browser primary|dedicated');
  }

  return options;
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function clearState() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

function formatOutput(state, json) {
  if (json) {
    console.log(JSON.stringify({ stateFile: STATE_FILE, preference: state }, null, 2));
    return;
  }

  if (!state) {
    console.log(`preference: not set (${STATE_FILE})`);
    return;
  }

  console.log(`preference: ${state.preferredBrowserMode}`);
  if (state.preferredBrowserApp) {
    console.log(`browserApp: ${state.preferredBrowserApp}`);
  }
  if (state.preferredDedicatedProfileDir) {
    console.log(`dedicatedProfileDir: ${state.preferredDedicatedProfileDir}`);
  }
  console.log(`updatedAt: ${state.updatedAt}`);
}

function buildState(options) {
  const state = {
    preferredBrowserMode: options.browser,
    updatedAt: new Date().toISOString(),
  };

  if (options.browser === 'dedicated') {
    state.preferredBrowserApp = options.browserApp || null;
    state.preferredDedicatedProfileDir = options.dedicatedProfileDir;
  }

  return state;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === 'clear') {
    clearState();
    formatOutput(null, options.json);
    return;
  }

  if (options.command === 'set') {
    const state = buildState(options);
    writeState(state);
    formatOutput(state, options.json);
    return;
  }

  formatOutput(readState(), options.json);
}

main();
