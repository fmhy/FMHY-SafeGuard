import { cp, mkdir, readFile, rm, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--test-builds"))
  throw new Error("Usage: node tools/build.mjs [--test-builds]");
const testBuilds = args.includes("--test-builds");
const destination = path.join(root, testBuilds ? "test-builds" : "dist");

async function rejectSymlink(directory) {
  try {
    if ((await lstat(directory)).isSymbolicLink())
      throw new Error(`Refusing to replace linked directory: ${directory}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await rejectSymlink(destination);
await mkdir(destination, { recursive: true });
for (const platform of ["chromium", "firefox"]) {
  const name = testBuilds && platform === "chromium" ? "chrome" : platform;
  const target = path.resolve(destination, name);
  // Only these two fixed children can be replaced. Never accept an output path from the CLI.
  if (path.dirname(target) !== path.resolve(destination))
    throw new Error(`Invalid build target: ${target}`);
  await rejectSymlink(target);
  const manifestPath = path.join(root, "platform", platform, "manifest.json");
  JSON.parse(await readFile(manifestPath, "utf8"));
  await rm(target, { recursive: true, force: true });
  await cp(path.join(root, "src"), target, { recursive: true });
  await cp(manifestPath, path.join(target, "manifest.json"));
  console.log(`Built ${path.relative(root, target)}`);
}
