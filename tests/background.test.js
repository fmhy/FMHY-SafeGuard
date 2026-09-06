const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const {
  read,
  settle,
  memoryStorage,
  cachedData,
  createBrowser,
} = require("./helpers");

async function start(
  platform = "firefox",
  browser = createBrowser(memoryStorage(cachedData())),
) {
  const errors = [];
  const context = vm.createContext({
    URL,
    URLSearchParams,
    atob,
    setTimeout,
    clearTimeout,
    console: { log() {}, warn() {}, error: (...args) => errors.push(args) },
    [platform === "firefox" ? "browser" : "chrome"]: browser.api,
    fetch: async () => {
      throw new Error("Offline");
    },
  });
  const load = (file) =>
    vm.runInContext(read(`src/${file}`), context, { filename: file });
  const manifest = JSON.parse(read(`platform/${platform}/manifest.json`));
  if (platform === "chromium") {
    context.importScripts = (...files) =>
      files.forEach((file) => load(`js/${file}`));
    load(manifest.background.service_worker);
  } else {
    manifest.background.scripts.forEach(load);
  }
  await settle();
  const request = (message) =>
    new Promise((resolve, reject) => {
      const handled = browser.api.runtime.onMessage.listeners.some((listener) =>
        listener(message, {}, resolve),
      );
      if (!handled) reject(new Error("Unhandled message"));
    });
  const navigate = async (url) => {
    browser.tabs.set(1, { id: 1, url });
    await browser.api.tabs.onUpdated.emit(1, { url }, browser.tabs.get(1));
    await settle();
  };
  return { ...browser, context, request, navigate, errors };
}

for (const platform of ["chromium", "firefox"]) {
  test(`${platform} loads its actual background entry and shares popup and toolbar classification`, async () => {
    const env = await start(platform);
    assert.equal(env.api.runtime.onMessage.listeners.length, 1);
    const response = await env.request({
      action: "getSiteStatus",
      url: "https://github.com/bad/repo/releases",
    });
    assert.equal(response.status, "unsafe");
    assert.equal(response.reason, "Malicious repository");
    await env.navigate("https://github.com/bad/repo/releases");
    assert.match(env.icons.at(-1).path[19], /unsafe_19.png$/);
    const redirect = new URL(env.navigations.at(-1).url);
    assert.equal(
      redirect.searchParams.get("url"),
      "https://github.com/bad/repo/releases",
    );
    assert.equal(redirect.searchParams.get("reason"), response.reason);
    assert.equal(env.errors.length, 0);
  });
}

test("the showWarning setting prevents redirects while keeping unsafe toolbar status", async () => {
  const env = await start(
    "firefox",
    createBrowser(memoryStorage(cachedData({ showWarning: false }))),
  );
  await env.navigate("https://unsafe.example");
  assert.equal(env.navigations.length, 0);
  assert.match(env.icons.at(-1).path[19], /unsafe_19.png$/);
});

test("duplicate navigation events do not repeat work or inherit source-site status", async () => {
  const env = await start();
  await env.navigate("https://starred.example");
  await env.api.tabs.onUpdated.emit(1, { status: "complete" }, env.tabs.get(1));
  await settle();
  assert.equal(env.icons.length, 1);
  await env.navigate("https://unknown.example");
  assert.match(env.icons.at(-1).path[19], /default_19.png$/);
});

test("an explicit approval survives worker restart and remains limited to its tab and URL", async () => {
  const storage = memoryStorage(cachedData());
  const first = await start("chromium", createBrowser(storage));
  assert.equal(
    (
      await first.request({
        action: "approveSite",
        tabId: 1,
        url: "https://unsafe.example/approved",
      })
    ).status,
    "approved",
  );
  const restarted = await start("chromium", createBrowser(storage));
  await restarted.navigate("https://unsafe.example/approved");
  assert.equal(restarted.navigations.length, 0);
  await restarted.navigate("https://unsafe.example/other");
  assert.equal(restarted.navigations.length, 1);
  await restarted.api.tabs.onRemoved.emit(1);
  assert.equal(storage.data.proceedTab_1, undefined);
});

test("message requests wait for initialization and stale checks cannot redirect a new URL", async () => {
  const storage = memoryStorage(cachedData());
  const get = storage.get;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let first = true;
  storage.get = async (...args) => {
    if (first) {
      first = false;
      await gate;
    }
    return get(...args);
  };
  const env = await start("firefox", createBrowser(storage));
  let responded = false;
  const response = env
    .request({ action: "getSiteStatus", url: "https://unsafe.example" })
    .then((value) => {
      responded = true;
      return value;
    });
  await env.navigate("https://unsafe.example");
  await env.navigate("https://unknown.example");
  assert.equal(responded, false);
  release();
  assert.equal((await response).status, "unsafe");
  await settle();
  assert.equal(env.navigations.length, 0);
  assert.match(env.icons.at(-1).path[19], /default_19.png$/);
});

test("force-update failures return an error response and retain cached protection", async () => {
  const env = await start();
  const response = await env.request({ action: "forceUpdate" });
  assert.equal(response.status, "error");
  assert.match(response.error, /Offline/);
  assert.equal(
    (
      await env.request({
        action: "checkSiteStatus",
        url: "https://unsafe.example",
      })
    ).status,
    "unsafe",
  );
  assert.equal(
    env.api.runtime.onMessage.listeners[0](
      { action: "toString" },
      {},
      () => {},
    ),
    false,
  );
});
