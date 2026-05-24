import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const srcDir = path.join(repoRoot, "src");
const safariManifest = path.join(repoRoot, "platform", "safari", "manifest.json");
const distRoot = path.join(repoRoot, "dist");
const distSafari = path.join(distRoot, "safari");

async function buildSafariSource() {
  await rm(distSafari, { recursive: true, force: true });
  await mkdir(distRoot, { recursive: true });
  await cp(srcDir, distSafari, { recursive: true });
  await cp(safariManifest, path.join(distSafari, "manifest.json"));

  console.log(`Safari source prepared at ${distSafari}`);
}

buildSafariSource().catch((error) => {
  console.error("Failed to build Safari source:", error);
  process.exitCode = 1;
});
