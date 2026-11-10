const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const { createDom, read, settle } = require("./helpers");

function seasonalTheme() {
  const context = vm.createContext({ URL });
  vm.runInContext(read("src/js/seasonal-theme.js"), context);
  return context.SafeGuard.seasonalTheme;
}

const themeOn = (...localDate) =>
  seasonalTheme().activeTheme(new Date(...localDate))?.id ?? null;

test("Halloween is active from October 1 through October 31 in local time", () => {
  assert.equal(themeOn(2026, 8, 30, 23, 59, 59), null);
  assert.equal(themeOn(2026, 9, 1, 0, 0, 0), "halloween");
  assert.equal(themeOn(2026, 9, 31, 23, 59, 59), "halloween");
  assert.equal(themeOn(2026, 10, 1, 0, 0, 0), null);
});

test("no seasonal theme is active mid-year or for an invalid date", () => {
  assert.equal(themeOn(2027, 5, 15, 12, 0, 0), null);
  assert.equal(themeOn(Number.NaN), null);
});

// Loads a real extension page with its scripts while the clock reads `now`.
async function page(name, now) {
  const env = createDom(
    read(`src/pub/${name}.html`),
    `chrome-extension://safeguard/pub/${name}.html`,
  );
  const RealDate = env.window.Date;
  env.window.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [now.getTime()]));
    }
    static now() {
      return now.getTime();
    }
  };
  for (const script of env.document.querySelectorAll("script[src]")) {
    env.load(path.posix.normalize(`src/pub/${script.getAttribute("src")}`));
  }
  env.document.dispatchEvent(new env.window.Event("DOMContentLoaded"));
  await settle();
  return env;
}

const seasonalAssets = (document) => ({
  theme: document.documentElement.dataset.seasonalTheme ?? null,
  stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((link) => link.href)
    .filter((href) => href.includes("halloween")),
  icons: [...document.querySelectorAll(".floating-icon")].map(
    (icon) => icon.src,
  ),
});

const pages = {
  index: 8,
  "settings-page": 4,
  "warning-page": 8,
  "welcome-page": 4,
};

for (const [name, iconCount] of Object.entries(pages)) {
  test(`${name} loads the Halloween stylesheet and icons in October`, async (t) => {
    const env = await page(name, new Date(2026, 9, 15, 12));
    t.after(() => env.window.close());
    const { theme, stylesheets, icons } = seasonalAssets(env.document);
    assert.equal(theme, "halloween");
    assert.deepEqual(stylesheets, [
      "chrome-extension://safeguard/pub/halloween.css",
    ]);
    assert.equal(icons.length, iconCount);
    assert.equal(
      icons[0],
      "chrome-extension://safeguard/res/icons/halloween/ghost.png",
    );
    assert.ok(
      env.document.querySelector(".floating-icon").matches(".halloween-icon-1"),
    );
  });

  test(`${name} loads nothing seasonal in November`, async (t) => {
    const env = await page(name, new Date(2026, 10, 1, 0, 0, 0));
    t.after(() => env.window.close());
    assert.deepEqual(seasonalAssets(env.document), {
      theme: null,
      stylesheets: [],
      icons: [],
    });
    assert.equal(
      env.document.querySelector('img[src*="halloween"], [class*="halloween"]'),
      null,
    );
  });
}

test("applying a seasonal theme twice adds its assets once", async (t) => {
  const env = await page("index", new Date(2026, 9, 31, 23, 59));
  t.after(() => env.window.close());
  const { activeTheme, apply } = env.window.SafeGuard.seasonalTheme;
  apply(
    env.document,
    activeTheme(new env.window.Date()),
    "chrome-extension://safeguard/",
  );
  const { stylesheets, icons } = seasonalAssets(env.document);
  assert.equal(stylesheets.length, 1);
  assert.equal(icons.length, 8);
});

test("icons wait for the body when the theme is applied from the head", (t) => {
  const { themes, apply } = seasonalTheme();
  const env = createDom("");
  t.after(() => env.window.close());
  env.document.body.remove();
  apply(env.document, themes[0], "chrome-extension://safeguard/");
  assert.equal(env.document.querySelectorAll(".floating-icon").length, 0);
  env.document.documentElement.append(env.document.createElement("body"));
  env.document.dispatchEvent(new env.window.Event("DOMContentLoaded"));
  assert.equal(env.document.querySelectorAll(".floating-icon").length, 8);
});
