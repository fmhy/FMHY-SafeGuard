const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  createDom,
  createBrowser,
  memoryStorage,
  cachedData,
  read,
  settle,
} = require("./helpers");

async function page(name, browser = createBrowser(), query = "") {
  const env = createDom(
    read(`src/pub/${name}.html`),
    `chrome-extension://safeguard/pub/${name}.html${query}`,
    browser,
  );
  await settle();
  for (const script of env.document.querySelectorAll("script[src]")) {
    env.load(path.posix.normalize(`src/pub/${script.getAttribute("src")}`));
  }
  env.document.dispatchEvent(new env.window.Event("DOMContentLoaded"));
  await settle();
  return env;
}

test("popup renders canonical site details and sanitized notes, and opens the matching guide", async (t) => {
  const browser = createBrowser();
  browser.api.runtime.sendMessage = async (message) =>
    message.action === "getNoteForSite"
      ? {
          note: '**Note** [unsafe](javascript:alert(1)) <img src="https://example.com/image.png" onerror="alert(1)">',
          slug: "note",
        }
      : {
          status: "safe",
          matchedUrl: "https://safe.example/docs",
          fmhyUrl: "https://fmhy.net/privacy#tools",
          password: "code",
        };
  const env = await page("index", browser);
  t.after(() => env.window.close());
  assert.match(
    env.document.getElementById("status-message").textContent,
    /safe.example\/docs/,
  );
  assert.equal(env.document.querySelector("#note-content [onerror]"), null);
  assert.equal(
    env.document.querySelector('#note-content a[href^="javascript:"]'),
    null,
  );
  assert.equal(
    env.document.getElementById("password-text").textContent,
    "code",
  );
  env.document.getElementById("fmhy-resource-link").click();
  await settle();
  assert.equal(
    browser.storage.data.pendingFmhyHighlight.resourceUrl,
    "https://safe.example/docs",
  );
  assert.equal(browser.navigations[0].url, "https://fmhy.net/privacy#tools");
});

test("unknown popup sites use the neutral icon", async (t) => {
  const browser = createBrowser();
  browser.api.runtime.sendMessage = async () => ({
    status: "no_data",
    matchedUrl: null,
  });
  const env = await page("index", browser);
  t.after(() => env.window.close());
  assert.match(
    env.document.getElementById("status-icon").src,
    /icons\/default.png$/,
  );
  assert.equal(
    env.document.getElementById("status-icon").alt,
    "Not listed in FMHY",
  );
});

test("settings save preferences without changing the successful update timestamp", async (t) => {
  const browser = createBrowser(
    memoryStorage(cachedData({ theme: "dark", showWarning: false })),
  );
  const lastUpdated = browser.storage.data.lastUpdated;
  const env = await page("settings-page", browser);
  t.after(() => env.window.close());
  assert.equal(env.document.body.dataset.theme, "dark");
  assert.equal(env.document.getElementById("warningToggle").checked, false);
  env.document.getElementById("trustedDomains").value =
    "WWW.Example.COM/path\nhttps://example.com\n# comment";
  env.document.getElementById("saveSettings").click();
  await settle();
  assert.equal(browser.storage.data.lastUpdated, lastUpdated);
  assert.deepEqual(browser.storage.data.userTrustedDomains, ["example.com"]);
  assert.deepEqual(
    browser.messages.map((message) => message.action),
    ["updateAlarm", "refreshAllTabs"],
  );
  assert.match(
    env.document.getElementById("notification").textContent,
    /Settings saved/,
  );
});

test("settings show failed updates and always restore the update button", async (t) => {
  const browser = createBrowser();
  browser.api.runtime.sendMessage = async () => ({
    status: "error",
    error: "Offline",
  });
  const env = await page("settings-page", browser);
  t.after(() => env.window.close());
  const button = env.document.getElementById("updateNowBtn");
  button.click();
  await settle();
  assert.equal(button.disabled, false);
  assert.match(
    env.document.getElementById("notification").textContent,
    /failed/i,
  );
});

test("warning pages preserve percent escapes and render reasons as text", async (t) => {
  const unsafeUrl = "https://unsafe.example/path%25name?q=a%2Fb";
  const reason =
    "100% unsafe <img src=x onerror=alert(1)> https://evidence.example/";
  const query = `?${new URLSearchParams({ url: unsafeUrl, reason })}`;
  const env = await page("warning-page", createBrowser(), query);
  t.after(() => env.window.close());
  assert.equal(env.document.getElementById("unsafeUrl").textContent, unsafeUrl);
  assert.equal(env.document.querySelector("#reasonText img"), null);
  assert.equal(env.document.getElementById("reasonText").textContent, reason);
  assert.equal(
    env.document.querySelector("#reasonText a").rel,
    "noopener noreferrer",
  );
});

test("welcome page loads its shared rendering and translation dependencies", async (t) => {
  const env = await page("welcome-page");
  t.after(() => env.window.close());
  await env.window.i18n.ready;
  assert.equal(env.window.i18n.getCurrentLanguage(), "en");
  assert.ok(env.document.querySelector("[data-i18n]").textContent);
});

test("popup formatting preserves repository and shared-host resource identities", (t) => {
  const env = createDom();
  t.after(() => env.window.close());
  env.load("src/js/config.js");
  env.load("src/js/page-ui.js");
  const format = env.window.SafeGuard.pageUi.formatDisplayUrl;
  assert.equal(
    format(
      { matchedUrl: "https://codeberg.org/owner/repo/issues", status: "safe" },
      "https://codeberg.org/owner/repo/issues",
    ),
    "codeberg.org/owner/repo",
  );
  for (const host of env.window.SafeGuard.config.sharedResourceHosts) {
    if (
      ["github.com", "gitlab.com", "codeberg.org", "sourceforge.net"].includes(
        host,
      )
    )
      continue;
    assert.equal(
      format(
        { matchedUrl: `https://${host}/item?id=1#part` },
        `https://${host}/item`,
      ),
      `${host}/item?id=1#part`,
    );
  }
});
