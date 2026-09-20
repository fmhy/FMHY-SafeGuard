import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  checkFirefoxDeclarations,
  checkFirefoxLintReport,
} from "./firefox-compatibility.mjs";

try {
  // Inspect the exact build that web-ext will submit, not just the source manifest.
  const manifest = JSON.parse(
    await readFile(
      new URL("../dist/firefox/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  const metadata = JSON.parse(
    await readFile(
      new URL("../.github/amo-metadata.json", import.meta.url),
      "utf8",
    ),
  );
  checkFirefoxDeclarations(manifest, metadata);
  // This fixed command uses a shell so npx.cmd also resolves on Windows.
  const lint = spawnSync(
    "npx --yes web-ext@10.6.0 lint --source-dir dist/firefox --output json --no-input --no-config-discovery",
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (lint.error) throw lint.error;
  const report = JSON.parse(lint.stdout);
  checkFirefoxLintReport(report);
  if (lint.status !== 0)
    throw new Error(`web-ext lint exited with status ${lint.status}.`);
  for (const warning of report.warnings) {
    console.warn(`web-ext warning: ${warning.code}: ${warning.message}`);
  }
  console.log(
    `Firefox compatibility checks passed: desktop ${manifest.browser_specific_settings.gecko.strict_min_version}+, Android ${manifest.browser_specific_settings.gecko_android.strict_min_version}+. AMO metadata includes both platforms.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
