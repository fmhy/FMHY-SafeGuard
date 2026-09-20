const test = require("node:test");
const assert = require("node:assert/strict");
const { read } = require("./helpers");
const checks = import("../tools/firefox-compatibility.mjs");
const manifest = () => JSON.parse(read("platform/firefox/manifest.json"));
const metadata = () => JSON.parse(read(".github/amo-metadata.json"));
const cleanReport = () => ({
  summary: { errors: 0 },
  errors: [],
  warnings: [],
  notices: [],
});

test("Firefox submission declares both desktop and Android compatibility", async () => {
  const { checkFirefoxDeclarations } = await checks;
  assert.doesNotThrow(() => checkFirefoxDeclarations(manifest(), metadata()));
});

test("Firefox upload is blocked when its Android manifest declaration is removed", async () => {
  const { checkFirefoxDeclarations } = await checks;
  const source = manifest();
  delete source.browser_specific_settings.gecko_android;
  assert.throws(
    () => checkFirefoxDeclarations(source, metadata()),
    /gecko_android.strict_min_version/,
  );
});

test("Firefox upload is blocked when AMO metadata drops either application", async () => {
  const { checkFirefoxDeclarations } = await checks;
  for (const compatibility of [["firefox"], ["android"], undefined]) {
    assert.throws(
      () =>
        checkFirefoxDeclarations(manifest(), { version: { compatibility } }),
      /both firefox and android/,
    );
  }
});

test("Firefox upload requires usable minimum versions and event-page backgrounds", async () => {
  const { checkFirefoxDeclarations } = await checks;
  for (const minimum of [undefined, "*", 120, "invalid"]) {
    const source = manifest();
    source.browser_specific_settings.gecko_android.strict_min_version = minimum;
    assert.throws(
      () => checkFirefoxDeclarations(source, metadata()),
      /strict_min_version/,
    );
  }
  const source = manifest();
  source.background = { service_worker: "js/background.js" };
  assert.throws(
    () => checkFirefoxDeclarations(source, metadata()),
    /service workers/,
  );
});

for (const code of [
  "PERMISSION_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION",
  "KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION",
  "ANDROID_INCOMPATIBLE_API",
  "KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION",
]) {
  test(`Firefox upload blocks ${code} even when web-ext reports it as a warning`, async () => {
    const { checkFirefoxLintReport } = await checks;
    const report = cleanReport();
    report.warnings.push({
      code,
      message: "Unsupported on the declared minimum",
      file: "manifest.json",
    });
    assert.throws(() => checkFirefoxLintReport(report), new RegExp(code));
  });
}

test("Firefox upload fails closed on linter errors or invalid reports", async () => {
  const { checkFirefoxLintReport } = await checks;
  const report = cleanReport();
  report.errors.push({ code: "JSON_INVALID", message: "Invalid manifest" });
  report.summary.errors = 1;
  assert.throws(() => checkFirefoxLintReport(report), /JSON_INVALID/);
  assert.throws(
    () => checkFirefoxLintReport({}),
    /invalid web-ext lint report/,
  );
});

test("Firefox compatibility checking leaves unrelated store notices nonblocking", async () => {
  const { checkFirefoxLintReport } = await checks;
  const report = cleanReport();
  report.warnings.push({
    code: "MISSING_DATA_COLLECTION_PERMISSIONS",
    message: "Existing extension notice",
  });
  assert.doesNotThrow(() => checkFirefoxLintReport(report));
});
