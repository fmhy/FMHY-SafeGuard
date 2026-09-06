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
