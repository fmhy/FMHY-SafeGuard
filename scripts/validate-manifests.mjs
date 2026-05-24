import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const manifestPaths = {
  chromium: path.join(repoRoot, "platform", "chromium", "manifest.json"),
  firefox: path.join(repoRoot, "platform", "firefox", "manifest.json"),
  safari: path.join(repoRoot, "platform", "safari", "manifest.json"),
};

const requiredSafariPermissions = ["storage", "tabs", "alarms", "contextMenus"];

async function loadManifest(platform, manifestPath) {
  try {
    const raw = await readFile(manifestPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${platform} manifest is invalid: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateSafariManifest(manifest) {
  assert(manifest.manifest_version === 3, "Safari manifest must use manifest_version 3");
  assert(manifest.name === "__MSG_extensionName__", "Safari manifest must keep the localized extension name");
  assert(manifest.default_locale === "en", "Safari manifest must set default_locale to en");
  assert(typeof manifest.version === "string" && manifest.version.length > 0, "Safari manifest must include a version");
  assert(manifest.icons && typeof manifest.icons === "object", "Safari manifest must include icons");
  assert(manifest.action?.default_popup === "pub/index.html", "Safari manifest must include the popup");
  assert(manifest.options_page === "pub/settings-page.html", "Safari manifest must include the options page");
  assert(Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0, "Safari manifest must include content_scripts");

  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  for (const permission of requiredSafariPermissions) {
    assert(permissions.includes(permission), `Safari manifest must include permission: ${permission}`);
  }

  const hostPermissions = Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [];
  assert(
    hostPermissions.includes("https://raw.githubusercontent.com/*"),
    "Safari manifest must include https://raw.githubusercontent.com/* in host_permissions"
  );
}

async function main() {
  const manifests = {};

  for (const [platform, manifestPath] of Object.entries(manifestPaths)) {
    manifests[platform] = await loadManifest(platform, manifestPath);
  }

  validateSafariManifest(manifests.safari);

  console.log("Manifest validation passed for chromium, firefox, and safari.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
