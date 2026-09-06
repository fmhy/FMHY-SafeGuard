const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModules, memoryStorage, plain } = require("./helpers");
const { settings } = loadModules().SafeGuard;

test("initialization fills missing defaults without replacing explicit choices", async () => {
  const storage = memoryStorage({ theme: "dark", showWarning: false });
  await settings.initialize(storage);
  assert.equal(storage.data.showWarning, false);
  assert.equal(storage.data.theme, "dark");
  assert.equal(storage.writes[0].theme, undefined);
  assert.equal(storage.data.updateFrequency, "daily");
  storage.writes.length = 0;
  await settings.initialize(storage);
  assert.equal(storage.writes.length, 0);
});

test("domain input normalizes URLs, paths, whitespace and duplicates", () => {
  assert.deepEqual(
    plain(
      settings.parseDomainList(
        "WWW.Example.COM/path\nhttps://example.com?q=1\n# comment\n// comment\ninvalid domain\njavascript:alert(1)\nhttps://second.example/",
      ),
    ),
    ["example.com", "second.example"],
  );
});

for (const [frequency, minutes] of [
  ["daily", 1440],
  ["weekly", 10080],
  ["monthly", 43200],
]) {
  test(`${frequency} uses the same interval for due checks and displayed schedules`, async () => {
    const lastUpdated = "2026-01-01T15:00:00.000Z";
    const expected = Date.parse(lastUpdated) + minutes * 60000;
    const storage = memoryStorage({ lastUpdated, updateFrequency: frequency });
    assert.equal(settings.nextUpdateTime(lastUpdated, frequency), expected);
    assert.equal(await settings.shouldUpdate(storage, expected - 1), false);
    assert.equal(await settings.shouldUpdate(storage, expected), true);
    assert.deepEqual(plain(storage.reads[0]), [
      "lastUpdated",
      "updateFrequency",
    ]);
  });
}

test("invalid or missing timestamps trigger an update", async () => {
  assert.equal(
    await settings.shouldUpdate(memoryStorage({ lastUpdated: "invalid" })),
    true,
  );
  assert.equal(await settings.shouldUpdate(memoryStorage()), true);
});
