const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise(setImmediate);
};
const modules = [
  "config",
  "settings",
  "resources",
  "guide-parser",
  "site-metadata",
  "curated-resources",
  "catalogue",
];

function event() {
  const listeners = [];
  return {
    listeners,
    addListener: (listener) => listeners.push(listener),
    emit: (...args) =>
      Promise.all(listeners.map((listener) => listener(...args))),
  };
}

function memoryStorage(initial = {}) {
  const data = structuredClone(initial);
  const writes = [];
  const reads = [];
  return {
    data,
    writes,
    reads,
    async get(keys) {
      reads.push(keys);
      if (keys === null) return { ...data };
      const defaults =
        typeof keys === "object" && !Array.isArray(keys) ? keys : {};
      const names =
        typeof keys === "string"
          ? [keys]
          : Array.isArray(keys)
            ? keys
            : Object.keys(keys);
      return Object.fromEntries(
        names
          .filter((key) => key in data || key in defaults)
          .map((key) => [
            key,
            data[key] === undefined ? defaults[key] : data[key],
          ]),
      );
    },
    async set(values) {
      writes.push(plain(values));
      Object.assign(data, plain(values));
    },
    async remove(key) {
      delete data[key];
    },
  };
}

function cachedData(overrides = {}) {
  return {
    resourceIdentityVersion: 2,
    unsafeSites: ["https://unsafe.example"],
    potentiallyUnsafeSites: ["https://caution.example"],
    fmhySites: ["https://fmhy.net"],
    unsafeReasons: {
      "unsafe.example": "Malware",
      "github.com/bad/repo": "Malicious repository",
    },
    safeSiteList: ["https://safe.example/docs", "https://github.com/safe/repo"],
    starredSites: [
      "https://starred.example",
      "https://github.com/starred/repo",
    ],
    fmhyResourceMap: {
      "https://safe.example/docs": "https://fmhy.net/privacy#tools",
    },
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function loadModules(extra = {}) {
  const context = vm.createContext({
    URL,
    URLSearchParams,
    console,
    atob,
    setTimeout,
    clearTimeout,
    ...extra,
  });
  for (const name of modules)
    vm.runInContext(read(`src/js/${name}.js`), context, { filename: name });
  return context;
}

function createBrowser(storage = memoryStorage()) {
  const tabs = new Map([[1, { id: 1, url: "https://safe.example/docs" }]]);
  const icons = [];
  const navigations = [];
  const messages = [];
  const api = {
    storage: { local: storage, onChanged: event() },
    runtime: {
      onMessage: event(),
      onInstalled: event(),
      onStartup: event(),
      getURL: (file) => `chrome-extension://safeguard/${file}`,
      getManifest: () => ({ version: "1.4.0" }),
      openOptionsPage: async () => {},
      sendMessage: async (message) => {
        messages.push(message);
        return { status: "updated" };
      },
    },
    i18n: { getUILanguage: () => "en-US", getMessage: () => "" },
    action: {
      setIcon: async (value) => {
        icons.push(plain(value));
      },
    },
    alarms: {
      onAlarm: event(),
      clear: async () => true,
      create: async () => {},
    },
    contextMenus: { onClicked: event(), create() {}, remove: async () => {} },
    tabs: {
      onUpdated: event(),
      onActivated: event(),
      onRemoved: event(),
      query: async () => [...tabs.values()],
      get: async (id) => ({ ...tabs.get(id) }),
      sendMessage: async () => {},
      update: async (id, update) => {
        navigations.push({ id, ...update });
        Object.assign(tabs.get(id), update);
      },
      create: async (value) => {
        navigations.push(value);
      },
    },
  };
  return { api, storage, tabs, icons, navigations, messages };
}

function createDom(
  html = "",
  url = "https://www.google.com/search",
  browser = createBrowser(),
) {
  const dom = new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  dom.window.chrome = browser.api;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(read(`src/${new URL(url).pathname.slice(1)}`)),
  });
  const load = (file) => dom.window.eval(read(file));
  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    browser,
    load,
  };
}

module.exports = {
  root,
  read,
  plain,
  settle,
  modules,
  event,
  memoryStorage,
  cachedData,
  loadModules,
  createBrowser,
  createDom,
};
