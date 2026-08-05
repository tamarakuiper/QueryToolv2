const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const APP_ROOT = path.resolve(__dirname, '..', '..');

function createLocalStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    },
    clear() {
      data.clear();
    }
  };
}

function createFetchFromDisk(rootDir) {
  return async function fetchFromDisk(relPath) {
    const normalized = String(relPath).replace(/^\/+/, '');
    const fullPath = path.join(rootDir, normalized);
    try {
      const text = await fs.promises.readFile(fullPath, 'utf8');
      return {
        ok: true,
        status: 200,
        async json() {
          return JSON.parse(text);
        }
      };
    } catch (err) {
      return {
        ok: false,
        status: 404,
        async json() {
          throw err;
        }
      };
    }
  };
}

function createWindow(overrides = {}) {
  const localStorage = overrides.localStorage || createLocalStorage();
  const fetch = overrides.fetch || createFetchFromDisk(APP_ROOT);

  const window = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    performance,
    Promise,
    localStorage,
    fetch,
    navigator: { userAgent: 'node-test' }
  };

  Object.assign(window, overrides.window || {});
  window.window = window;
  window.globalThis = window;

  return window;
}

function loadScripts(scriptPaths, options = {}) {
  const window = options.window || createWindow(options);
  const context = vm.createContext(window);

  scriptPaths.forEach((scriptPath) => {
    const fullPath = path.resolve(APP_ROOT, scriptPath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, context, { filename: scriptPath });
  });

  return { window, context };
}

module.exports = {
  APP_ROOT,
  createWindow,
  createLocalStorage,
  createFetchFromDisk,
  loadScripts
};
