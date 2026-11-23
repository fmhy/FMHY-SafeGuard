const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModules, memoryStorage, cachedData, plain } = require("./helpers");

async function setup(
  overrides = {},
  fetch = async () => {
    throw new Error("Unexpected network request");
  },
) {
  const context = loadModules();
  const storage = memoryStorage(cachedData(overrides));
  const catalogue = context.SafeGuard.createCatalogue({ storage, fetch });
  await catalogue.initialize();
  return { catalogue, storage, context };
}

for (const list of ["starredSites", "safeSiteList"]) {
  test(`Neocities sites do not inherit the hosting platform's ${list} rating`, async () => {
    const { catalogue } = await setup({
      starredSites: [],
      safeSiteList: [],
      [list]: ["https://neocities.org"],
      fmhyResourceMap: {
        "https://neocities.org":
          "https://fmhy.net/developer-tools#website-hosting",
      },
    });
    for (const url of [
      "https://unlisted.neocities.org/",
      "https://unlisted.neocities.org/page",
      "http://www.unlisted.neocities.org/page?query=1#section",
    ]) {
      const result = catalogue.getSiteStatus(url);
      assert.equal(result.status, "no_data", url);
      assert.equal(result.matchedUrl, null, url);
      assert.equal(result.fmhyUrl, null, url);
    }
  });
}

test("listed Neocities sites keep their own ratings, paths and guide links", async () => {
  const { catalogue } = await setup({
    starredSites: ["https://neocities.org", "https://starred.neocities.org"],
    safeSiteList: [
      "https://safe.neocities.org",
      "https://partial.neocities.org/downloads",
    ],
    fmhyResourceMap: {
      "https://neocities.org":
        "https://fmhy.net/developer-tools#website-hosting",
      "https://safe.neocities.org": "https://fmhy.net/internet-tools#tools",
    },
  });
  for (const [url, status, matchedUrl] of [
    ["https://www.neocities.org/", "starred", "https://neocities.org"],
    ["https://neocities.org/help", "starred", "https://neocities.org"],
    [
      "https://starred.neocities.org/page",
      "starred",
      "https://starred.neocities.org",
    ],
    ["https://safe.neocities.org/page", "safe", "https://safe.neocities.org"],
    [
      "https://partial.neocities.org/downloads/tool",
      "safe",
      "https://partial.neocities.org/downloads",
    ],
    ["https://partial.neocities.org/downloads-copy", "no_data", null],
    ["https://partial.neocities.org/other", "no_data", null],
  ]) {
    const result = catalogue.getSiteStatus(url);
    assert.equal(result.status, status, url);
    assert.equal(result.matchedUrl, matchedUrl, url);
  }
  assert.equal(
    catalogue.getSiteStatus("https://safe.neocities.org/page").fmhyUrl,
    "https://fmhy.net/internet-tools#tools",
  );
});

for (const [url, status] of [
  ["https://unsafe.example/path", "unsafe"],
  ["http://sub.unsafe.example", "unsafe"],
  ["https://notunsafe.example", "no_data"],
  ["https://caution.example", "potentially_unsafe"],
  ["https://fmhy.net/tools", "fmhy"],
  ["https://safe.example/docs/chapter", "safe"],
  ["https://safe.example/other", "no_data"],
  ["https://starred.example/anything", "starred"],
  ["https://github.com/starred/repo/releases", "starred"],
  ["https://github.com/safe/repo/issues", "safe"],
  ["https://github.com/safe/repo-copy", "no_data"],
  ["https://github.com/unknown/repo", "no_data"],
  ["https://github.com/bad/repo/releases", "unsafe"],
  ["https://github.com/bad/repo-copy", "no_data"],
  ["https://github.com/", "no_data"],
  ["chrome://settings", "no_data"],
  [null, "no_data"],
  ["not a URL", "no_data"],
]) {
  test(`catalogue classifies ${url} as ${status}`, async () => {
    const { catalogue } = await setup();
    assert.equal(catalogue.getSiteStatus(url).status, status);
  });
}

test("status returns canonical guide paths, reasons and exact resource passwords", async () => {
  const { catalogue } = await setup();
  assert.deepEqual(
    plain(catalogue.getSiteStatus("https://safe.example/docs/chapter")),
    {
      status: "safe",
      matchedUrl: "https://safe.example/docs",
      isNew: false,
      fmhyUrl: "https://fmhy.net/privacy#tools",
      reason: null,
      password: null,
      inviteCode: null,
    },
  );
  assert.equal(
    catalogue.getSiteStatus("https://github.com/bad/repo/issues").reason,
    "Malicious repository",
  );
  assert.equal(
    catalogue.getSiteStatus("https://rentry.co/fmhyb64#gnarly").password,
    "gnarly",
  );
  assert.equal(
    catalogue.getSiteStatus("https://rentry.co/other").password,
    null,
  );
});

test("user overrides take priority and reload when entries are removed", async () => {
  const { catalogue, storage } = await setup({
    userTrustedDomains: ["WWW.UNSAFE.EXAMPLE"],
    userUntrustedDomains: ["safe.example"],
  });
  assert.equal(
    catalogue.getSiteStatus("https://unsafe.example").status,
    "safe",
  );
  assert.equal(
    catalogue.getSiteStatus("https://safe.example/docs").status,
    "unsafe",
  );
  delete storage.data.userTrustedDomains;
  await catalogue.loadOverrides();
  assert.equal(
    catalogue.getSiteStatus("https://unsafe.example").status,
    "unsafe",
  );
});

test("the longest path-specific reason wins without crossing path boundaries", async () => {
  const { catalogue } = await setup({
    unsafeReasons: {
      "github.com/bad/repo": "Repository",
      "github.com/bad/repo/releases": "Release",
    },
  });
  assert.equal(
    catalogue.getSiteStatus("https://github.com/BAD/REPO/releases/latest?q=1")
      .reason,
    "Release",
  );
  assert.equal(
    catalogue.getSiteStatus("https://github.com/bad/repository").reason,
    null,
  );
});

test("compact SERP indexes omit shared hosts while keeping ordinary domains", async () => {
  const { storage } = await setup({
    unsafeSites: [
      "https://unsafe.example",
      "https://github.com/bad/repo",
      "https://neocities.org",
    ],
    safeSiteList: [
      "https://safe.example/docs",
      "https://github.com/safe/repo",
      "https://listed.neocities.org",
      "https://rentry.co/fmhy",
    ],
  });
  assert.deepEqual(storage.data.unsafeDomainList, ["unsafe.example"]);
  assert.deepEqual(storage.data.safeDomainList, [
    "safe.example",
    "listed.neocities.org",
  ]);
});

test("offline startup keeps cached classifications and the last successful timestamp", async () => {
  const lastUpdated = "2020-01-01T00:00:00.000Z";
  const { catalogue, storage } = await setup({ lastUpdated }, async () => {
    throw new Error("Offline");
  });
  assert.equal(
    catalogue.getSiteStatus("https://unsafe.example").status,
    "unsafe",
  );
  assert.equal(storage.data.lastUpdated, lastUpdated);
});

function remoteData(context, failedUrl) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const config = context.SafeGuard.config;
    const text =
      url === config.unsafeReasonsURL
        ? '{"new-unsafe.example":"Reason"}'
        : url === config.filterListURLUnsafe
          ? "new-unsafe.example"
          : url === config.filterListURLPotentiallyUnsafe
            ? "new-caution.example"
            : url === config.fmhyFilterListURL
              ? "fmhy.net"
              : "## Tools\n* ⭐ **[New](https://new-safe.example/path)** or [Mirror](https://mirror.example/) - Description";
    return {
      ok: url !== failedUrl,
      status: url === failedUrl ? 503 : 200,
      text: async () => text,
    };
  };
  return { calls, fetch };
}

test("refresh downloads each source once and atomically replaces lists, counts and indexes", async () => {
  const context = loadModules();
  const storage = memoryStorage(cachedData());
  const remote = remoteData(context);
  let notifications = 0;
  const catalogue = context.SafeGuard.createCatalogue({
    storage,
    fetch: remote.fetch,
    onUpdated: () => {
      notifications++;
    },
  });
  await catalogue.initialize();
  await Promise.all([
    catalogue.refresh(),
    catalogue.refresh(),
    catalogue.refresh(),
  ]);
  assert.equal(
    remote.calls.length,
    context.SafeGuard.config.safeListURLs.length + 4,
  );
  assert.equal(new Set(remote.calls).size, remote.calls.length);
  assert.equal(notifications, 1);
  assert.equal(
    catalogue.getSiteStatus("https://unsafe.example").status,
    "no_data",
  );
  assert.equal(
    catalogue.getSiteStatus("https://new-unsafe.example").status,
    "unsafe",
  );
  assert.equal(
    catalogue.getSiteStatus("https://new-safe.example/path").status,
    "starred",
  );
  assert.deepEqual(storage.data.safeDomainList, [
    "new-safe.example",
    "mirror.example",
  ]);
  assert.equal(storage.data.starredSiteCount, 2);
});

test("failed partial downloads retain every cached list and can be retried", async () => {
  const context = loadModules();
  const storage = memoryStorage(cachedData());
  let fail = true;
  const good = remoteData(context);
  const bad = remoteData(context, context.SafeGuard.config.safeListURLs[1]);
  const catalogue = context.SafeGuard.createCatalogue({
    storage,
    fetch: (url) => (fail ? bad : good).fetch(url),
  });
  await catalogue.initialize();
  const before = plain(storage.data);
  await assert.rejects(catalogue.refresh(), /503/);
  assert.deepEqual(storage.data, before);
  assert.equal(
    catalogue.getSiteStatus("https://safe.example/docs").status,
    "safe",
  );
  fail = false;
  await catalogue.refresh();
  assert.equal(
    catalogue.getSiteStatus("https://new-safe.example/path").status,
    "starred",
  );
});

test("a failed storage write cannot publish an in-memory snapshot", async () => {
  const { catalogue, storage, context } = await setup();
  const remote = remoteData(context);
  const second = context.SafeGuard.createCatalogue({
    storage,
    fetch: remote.fetch,
  });
  await second.initialize();
  storage.set = async () => {
    throw new Error("Quota exceeded");
  };
  await assert.rejects(second.refresh(), /Quota/);
  assert.equal(
    second.getSiteStatus("https://unsafe.example").status,
    catalogue.getSiteStatus("https://unsafe.example").status,
  );
});

test("note requests share in-flight work and failed requests can retry", async () => {
  let requests = 0;
  const { catalogue } = await setup({}, async () => {
    requests++;
    if (requests === 1) throw new Error("Offline");
    return { ok: true, text: async () => "A note" };
  });
  await assert.rejects(catalogue.getNoteForSite("https://1337x.to"), /Offline/);
  const notes = await Promise.all([
    catalogue.getNoteForSite("https://1337x.to"),
    catalogue.getNoteForSite("https://1337x.st"),
  ]);
  assert.equal(requests, 2);
  assert.equal(notes[0].note, "A note");
  assert.equal(notes[1].slug, "1337x-ranks");
});

test("refresh marks listings missing from the previous snapshot as new", async () => {
  const context = loadModules();
  const storage = memoryStorage(cachedData());
  const remote = remoteData(context);
  const catalogue = context.SafeGuard.createCatalogue({
    storage,
    fetch: remote.fetch,
  });
  await catalogue.initialize();
  const before = Date.now();
  await catalogue.refresh();
  assert.deepEqual(Object.keys(storage.data.newListings).sort(), [
    "https://mirror.example",
    "https://new-safe.example/path",
  ]);
  assert.deepEqual(Object.keys(storage.data.newDomainList).sort(), [
    "mirror.example",
    "new-safe.example",
  ]);
  assert.ok(storage.data.newDomainList["mirror.example"] >= before);
  assert.equal(
    catalogue.getSiteStatus("https://new-safe.example/path/page").isNew,
    true,
  );
  assert.equal(catalogue.getSiteStatus("https://mirror.example/").isNew, true);
  assert.equal(
    catalogue.getSiteStatus("https://new-unsafe.example").isNew,
    false,
  );

  // A later refresh keeps the original first-seen time.
  const firstSeen = storage.data.newListings["https://mirror.example"];
  await catalogue.refresh();
  assert.equal(storage.data.newListings["https://mirror.example"], firstSeen);
});

test("the first download is a baseline, not a list of new sites", async () => {
  const context = loadModules();
  const storage = memoryStorage();
  const remote = remoteData(context);
  const catalogue = context.SafeGuard.createCatalogue({
    storage,
    fetch: remote.fetch,
  });
  await catalogue.initialize();
  assert.deepEqual(plain(storage.data.newListings), {});
  assert.deepEqual(plain(storage.data.newDomainList), {});
  assert.equal(
    catalogue.getSiteStatus("https://new-safe.example/path").isNew,
    false,
  );
});

test("new listings expire after the window and bulk list changes are ignored", async () => {
  const context = loadModules();
  const days = context.SafeGuard.config.newListingDays;
  const old = Date.now() - days * 86400000 - 1;
  const recent = Date.now() - 60000;
  const { catalogue } = await setup({
    newListings: {
      "https://safe.example/docs": old,
      "https://github.com/safe/repo": recent,
    },
  });
  assert.equal(
    catalogue.getSiteStatus("https://safe.example/docs").isNew,
    false,
  );
  assert.equal(
    catalogue.getSiteStatus("https://github.com/safe/repo").isNew,
    true,
  );

  // Dozens of unseen links at once (a new guide page) set a new baseline.
  const bulk = loadModules();
  const storage = memoryStorage(cachedData());
  const remote = remoteData(bulk);
  const links = Array.from(
    { length: 60 },
    (_, index) => `* [Site ${index}](https://bulk${index}.example/)`,
  ).join("\n");
  const second = bulk.SafeGuard.createCatalogue({
    storage,
    fetch: async (url) =>
      bulk.SafeGuard.config.safeListURLs.includes(url)
        ? { ok: true, status: 200, text: async () => links }
        : remote.fetch(url),
  });
  await second.initialize();
  await second.refresh();
  assert.deepEqual(plain(storage.data.newListings), {});
  assert.deepEqual(plain(storage.data.newDomainList), {});
});
