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
  const backgroundUrl = browser.api.runtime.getURL(
    manifest.background.service_worker || "_generated_background_page.html",
  );
  const setIcon = browser.api.action.setIcon;
  browser.api.action.setIcon = async (details) => {
    // Chromium resolves icon paths relative to the worker, which lives in js/.
    for (const iconPath of Object.values(details.path)) {
      const iconUrl = new URL(iconPath, backgroundUrl);
      read(`src${iconUrl.pathname}`);
    }
    return setIcon(details);
  };
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
  const navigate = async (url, tabId = 1) => {
    browser.tabs.set(tabId, { id: tabId, url });
    await browser.api.tabs.onUpdated.emit(
      tabId,
      { url },
      browser.tabs.get(tabId),
    );
    await settle();
  };
  return { ...browser, context, request, navigate, errors };
}

for (const platform of ["chromium", "firefox"]) {
  test(`${platform} loads packaged toolbar icons for every site status`, async () => {
    const env = await start(platform);
    for (const [url, icon] of [
      ["https://starred.example", "starred_19.png"],
      ["https://safe.example/docs", "safe_19.png"],
      ["https://unsafe.example", "unsafe_19.png"],
      ["https://caution.example", "potentially_unsafe_19.png"],
      ["https://fmhy.net", "fmhy_19.png"],
      [env.api.runtime.getURL("pub/index.html"), "ext_icon_144.png"],
      ["https://unknown.example", "default_19.png"],
    ]) {
      await env.navigate(url);
      assert.deepEqual(env.errors, [], `Icon update failed for ${url}`);
      assert.ok(env.icons.at(-1).path[19].endsWith(`/${icon}`));
    }
  });

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

for (const platform of ["chromium", "firefox"]) {
  test(`${platform} approval covers paths, query strings, fragments and back navigation in the same tab`, async () => {
    const env = await start(platform);
    const original = "https://unsafe.example/approved";
    await env.navigate(original);
    assert.equal(env.navigations.length, 1);
    await env.navigate(env.tabs.get(1).url);
    assert.equal(
      (await env.request({ action: "approveSite", tabId: 1, url: original }))
        .status,
      "approved",
    );
    for (const url of [
      original,
      "https://unsafe.example/other",
      "https://unsafe.example/other?page=2#download",
      "https://www.unsafe.example/another",
      "http://unsafe.example/another",
      original,
    ]) {
      await env.navigate(url);
      assert.equal(env.navigations.length, 1, `Repeated warning for ${url}`);
      assert.match(env.icons.at(-1).path[19], /unsafe_19.png$/);
    }
    assert.equal(env.errors.length, 0);
  });

  test(`${platform} keeps approvals for multiple websites through worker restart and back navigation`, async () => {
    const storage = memoryStorage(cachedData());
    const first = await start(platform, createBrowser(storage));
    await first.request({
      action: "approveSite",
      tabId: 1,
      url: "https://unsafe.example/approved",
    });
    const second = await start(platform, createBrowser(storage));
    await second.request({
      action: "approveSite",
      tabId: 1,
      url: "https://github.com/bad/repo",
    });
    const restarted = await start(platform, createBrowser(storage));
    for (const url of [
      "https://github.com/bad/repo/releases",
      "https://unsafe.example/other",
      "https://github.com/bad/repo/issues",
    ]) {
      await restarted.navigate(url);
      assert.equal(restarted.navigations.length, 0, `Lost approval for ${url}`);
    }
    assert.equal(restarted.errors.length, 0);
  });

  test(`${platform} approval stays limited to its hostname and tab and expires on tab close`, async () => {
    const env = await start(
      platform,
      createBrowser(
        memoryStorage(
          cachedData({
            userUntrustedDomains: ["unsafe.example.evil.test"],
          }),
        ),
      ),
    );
    await env.request({
      action: "approveSite",
      tabId: 1,
      url: "https://unsafe.example/approved",
    });
    for (const [url, tabId] of [
      ["https://unsafe.example/other", 2],
      ["https://github.com/bad/repo", 1],
      ["https://sub.unsafe.example/page", 1],
      ["https://unsafe.example.evil.test/page", 1],
    ]) {
      const before = env.navigations.length;
      await env.navigate(url, tabId);
      assert.equal(
        env.navigations.length,
        before + 1,
        `Missing warning for ${url} in tab ${tabId}`,
      );
    }
    await env.api.tabs.onRemoved.emit(1);
    await settle();
    assert.equal(env.storage.data.proceedTab_1, undefined);
    const before = env.navigations.length;
    await env.navigate("https://unsafe.example/approved");
    assert.equal(env.navigations.length, before + 1);
    assert.equal(env.errors.length, 0);
  });

  test(`${platform} preserves approvals stored by the previous version`, async () => {
    const storage = memoryStorage(
      cachedData({
        proceedTab_1: "https://www.unsafe.example/approved?old=1",
      }),
    );
    const env = await start(platform, createBrowser(storage));
    await env.navigate("https://unsafe.example/other");
    assert.equal(env.navigations.length, 0);
    await env.request({
      action: "approveSite",
      tabId: 1,
      url: "https://github.com/bad/repo",
    });
    const restarted = await start(platform, createBrowser(storage));
    await restarted.navigate("https://unsafe.example/back");
    assert.equal(restarted.navigations.length, 0);
    assert.equal(restarted.errors.length, 0);
  });

  test(`${platform} failed approval writes keep warnings enabled`, async () => {
    const env = await start(platform);
    env.storage.set = async () => {
      throw new Error("Storage failed");
    };
    const response = await env.request({
      action: "approveSite",
      tabId: 1,
      url: "https://unsafe.example/approved",
    });
    assert.equal(response.status, "error");
    await env.navigate("https://unsafe.example/approved");
    assert.equal(env.navigations.length, 1);
    await env.navigate("https://unsafe.example/other");
    assert.equal(env.navigations.length, 2);
  });

  test(`${platform} repository approval covers sibling pages but not other repositories after restart`, async () => {
    const storage = memoryStorage(
      cachedData({
        unsafeReasons: {
          "github.com/first/unsafe-repo": "Repository A",
          "github.com/first/other-repo": "Repository B",
          "github.com/second/unsafe-repo": "Repository C",
          "github.com/first/unsafe-repo-copy": "Repository D",
        },
      }),
    );
    const env = await start(platform, createBrowser(storage));
    await env.request({
      action: "approveSite",
      tabId: 1,
      url: "https://github.com/first/unsafe-repo/releases/latest?download=1#files",
    });
    const restarted = await start(platform, createBrowser(storage));
    for (const url of [
      "https://github.com/first/unsafe-repo/issues",
      "https://www.github.com/first/unsafe-repo/tree/main",
      "https://github.com/first/unsafe-repo",
    ]) {
      await restarted.navigate(url);
      assert.equal(
        restarted.navigations.length,
        0,
        `Lost repository approval for ${url}`,
      );
    }
    for (const url of [
      "https://github.com/first/other-repo/releases",
      "https://github.com/second/unsafe-repo/releases",
      "https://github.com/first/unsafe-repo-copy/releases",
    ]) {
      assert.equal(
        (await restarted.request({ action: "getSiteStatus", url })).status,
        "unsafe",
      );
      const before = restarted.navigations.length;
      await restarted.navigate(url);
      assert.equal(
        restarted.navigations.length,
        before + 1,
        `Approval leaked to ${url}`,
      );
    }
    assert.equal(restarted.errors.length, 0);
  });

  test(`${platform} shared-host approvals preserve resource IDs in query strings and fragments`, async () => {
    const env = await start(
      platform,
      createBrowser(
        memoryStorage(
          cachedData({
            userUntrustedDomains: ["youtube.com", "matrix.to", "rentry.co"],
          }),
        ),
      ),
    );
    for (const [approved, other] of [
      [
        "https://youtube.com/watch?v=first",
        "https://youtube.com/watch?v=second",
      ],
      [
        "https://matrix.to/#/#first:matrix.org",
        "https://matrix.to/#/#second:matrix.org",
      ],
      ["https://rentry.co/first", "https://rentry.co/second"],
    ]) {
      await env.request({ action: "approveSite", tabId: 1, url: approved });
      const before = env.navigations.length;
      await env.navigate(approved);
      assert.equal(env.navigations.length, before);
      await env.navigate(other);
      assert.equal(
        env.navigations.length,
        before + 1,
        `Approval leaked to ${other}`,
      );
    }
  });

  test(`${platform} discards old shared-host approvals but preserves ordinary website approvals`, async () => {
    const storage = memoryStorage(
      cachedData({ proceedTab_1: ["github.com", "unsafe.example"] }),
    );
    const env = await start(platform, createBrowser(storage));
    await env.navigate("https://unsafe.example/other");
    assert.equal(env.navigations.length, 0);
    await env.navigate("https://github.com/bad/repo");
    assert.equal(env.navigations.length, 1);
  });

  test(`${platform} migrates legacy shared-host URL approval to its repository only`, async () => {
    const storage = memoryStorage(
      cachedData({
        proceedTab_1: "https://github.com/first/unsafe-repo/releases/latest",
        unsafeReasons: {
          "github.com/first/unsafe-repo": "Repository A",
          "github.com/second/unsafe-repo": "Repository B",
        },
      }),
    );
    const env = await start(platform, createBrowser(storage));
    await env.navigate("https://github.com/first/unsafe-repo/issues");
    assert.equal(env.navigations.length, 0);
    await env.navigate("https://github.com/second/unsafe-repo/releases");
    assert.equal(env.navigations.length, 1);
  });
}

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
