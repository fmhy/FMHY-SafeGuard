const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDom,
  createBrowser,
  memoryStorage,
  read,
  settle,
} = require("./helpers");

async function searchPage(
  host,
  data = {},
  html = '<article><div class="site svelte-result"></div><a style="font-weight: 400" href="https://unsafe.example/">Result</a></article>',
  platform,
) {
  const browser = createBrowser(
    memoryStorage({
      unsafeDomainList: ["unsafe.example"],
      safeDomainList: ["safe.example"],
      unsafeReasons: { "unsafe.example": "<img src=x onerror=alert(1)>" },
      ...data,
    }),
  );
  const env = createDom(html, `https://${host}/search`, browser);
  const files = platform
    ? JSON.parse(read(`platform/${platform}/manifest.json`))
        .content_scripts.filter(({ matches }) =>
          matches.some((pattern) => {
            // Search fixtures use HTTPS /search; these manifests match every path.
            const allowedHost = pattern.split("/")[2];
            return allowedHost.startsWith("*.")
              ? host === allowedHost.slice(2) ||
                  host.endsWith(allowedHost.slice(1))
              : host === allowedHost;
          }),
        )
        .flatMap(({ js }) => js)
    : ["config", "settings", "link-renderer", "content"].map(
        (name) => `js/${name}.js`,
      );
  for (const file of files) env.load(`src/${file}`);
  await settle();
  return env;
}

for (const host of ["www.google.com", "search.brave.com", "www.bing.com"]) {
  test(`${host} highlights unsafe links, then removes decorations when disabled`, async (t) => {
    const env = await searchPage(host);
    t.after(() => env.window.close());
    const link = env.document.querySelector("a");
    assert.equal(link.dataset.fmhyProcessed, "true");
    assert.equal(link.style.fontWeight, "bold");
    assert.equal(env.document.querySelectorAll(".fmhy-unsafe-badge").length, 1);
    assert.equal(env.document.querySelector(".fmhy-unsafe-badge img"), null);
    await env.browser.storage.set({
      highlightUntrusted: false,
      showWarningBanners: false,
    });
    await env.browser.api.storage.onChanged.emit(
      { highlightUntrusted: {}, showWarningBanners: {} },
      "local",
    );
    await settle();
    assert.equal(link.style.fontWeight, "400");
    assert.equal(link.hasAttribute("data-fmhy-unsafe"), false);
    assert.equal(env.document.querySelector(".fmhy-unsafe-badge"), null);
  });
}

for (const platform of ["chromium", "firefox"]) {
  test(`${platform} manifest enables Kagi search warnings and highlighting`, async (t) => {
    for (const host of ["kagi.com", "www.kagi.com"]) {
      const env = await searchPage(host, {}, undefined, platform);
      t.after(() => env.window.close());
      assert.equal(env.document.querySelector("a").style.fontWeight, "bold");
      assert.ok(env.document.querySelector(".fmhy-unsafe-badge"));
    }
  });
}

test("reused search anchors lose the old classification when their href changes", async (t) => {
  const env = await searchPage("www.bing.com");
  t.after(() => env.window.close());
  const link = env.document.querySelector("a");
  link.href = "https://unknown.example";
  await settle();
  assert.equal(link.style.fontWeight, "400");
  assert.equal(env.document.querySelector(".fmhy-unsafe-badge"), null);
});

test("Brave badges do not enable a disabled link highlight", async (t) => {
  const env = await searchPage("search.brave.com", {
    highlightUntrusted: false,
  });
  t.after(() => env.window.close());
  assert.ok(env.document.querySelector(".fmhy-unsafe-badge"));
  assert.equal(
    env.document.querySelector("a").hasAttribute("data-fmhy-unsafe"),
    false,
  );
  assert.equal(env.document.querySelector("a").style.fontWeight, "400");
});

test("Brave warnings survive missing or changed result metadata without enabling highlights", async (t) => {
  for (const metadata of [
    '<div class="site"></div>',
    '<div class="svelte-new site extra"></div>',
    "",
  ]) {
    const env = await searchPage(
      "search.brave.com",
      {
        highlightTrusted: false,
        highlightUntrusted: false,
        showWarningBanners: true,
      },
      `<article>${metadata}<a href="https://unsafe.example/">Unsafe</a><a href="https://safe.example/">Safe</a></article>`,
    );
    t.after(() => env.window.close());
    const badge = env.document.querySelector(".fmhy-unsafe-badge");
    assert.ok(
      badge,
      `A warning is visible with metadata: ${metadata || "none"}`,
    );
    assert.equal(
      badge.parentElement,
      env.document.querySelector(metadata ? ".site" : "article"),
    );
    assert.equal(
      env.document.querySelectorAll("[data-fmhy-unsafe], [data-fmhy-safe]")
        .length,
      0,
    );
    for (const link of env.document.querySelectorAll("a")) {
      assert.equal(link.style.textShadow, "");
      assert.equal(link.style.fontWeight, "");
    }
    await env.browser.storage.set({ showWarningBanners: false });
    await env.browser.api.storage.onChanged.emit(
      { showWarningBanners: {} },
      "local",
    );
    await settle();
    assert.equal(env.document.querySelector(".fmhy-unsafe-badge"), null);
  }
});

test("removed badges are restored without duplicate decorations", async (t) => {
  const env = await searchPage("www.bing.com");
  t.after(() => env.window.close());
  env.document.querySelector(".fmhy-unsafe-badge").remove();
  await new Promise((resolve) => setTimeout(resolve, 150));
  await settle();
  assert.equal(env.document.querySelectorAll(".fmhy-unsafe-badge").length, 1);
  assert.equal(env.document.querySelector("a").style.fontWeight, "bold");
});

test("content scripts use compact indexes and react to refreshed lists", async (t) => {
  const env = await searchPage("www.bing.com");
  t.after(() => env.window.close());
  assert.equal(
    env.browser.storage.reads.some(
      (keys) => Array.isArray(keys) && keys.includes("safeSiteList"),
    ),
    false,
  );
  await env.browser.storage.set({ unsafeDomainList: [], unsafeReasons: {} });
  await env.browser.api.runtime.onMessage.emit({ type: "filterlistUpdated" });
  await settle();
  assert.equal(env.document.querySelector(".fmhy-unsafe-badge"), null);
  assert.equal(env.document.querySelector("a").style.fontWeight, "400");
});

test("legacy URL caches still provide highlighting", async (t) => {
  const env = await searchPage("www.bing.com", {
    unsafeDomainList: undefined,
    safeDomainList: undefined,
    unsafeSites: ["https://unsafe.example"],
    safeSiteList: ["https://safe.example"],
  });
  t.after(() => env.window.close());
  assert.equal(env.document.querySelector("a").style.fontWeight, "bold");
});

test("FMHY guide highlights the matching resource and consumes its pending request", async (t) => {
  const browser = createBrowser(
    memoryStorage({
      pendingFmhyHighlight: {
        fmhyUrl: "https://fmhy.net/privacy#tools",
        resourceUrl: "https://safe.example/docs",
        createdAt: Date.now(),
      },
    }),
  );
  const env = createDom(
    '<div class="vp-doc"><ul><li><a href="https://safe.example/docs">Resource</a></li></ul></div>',
    "https://fmhy.net/privacy#tools",
    browser,
  );
  t.after(() => env.window.close());
  env.load("src/js/fmhy-highlight.js");
  await settle();
  assert.equal(
    env.document
      .querySelector("li")
      .classList.contains("vp-search-highlight-target"),
    true,
  );
  assert.equal(browser.storage.data.pendingFmhyHighlight, undefined);
});
