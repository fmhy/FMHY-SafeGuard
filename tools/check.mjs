import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : path.join(directory, entry.name),
      ),
    )
  ).flat();
}
let checked = 0;
for (const directory of ["src", "docs", "platform"]) {
  for (const file of await files(path.join(root, directory))) {
    if (file.endsWith(".js"))
      new vm.Script(await readFile(file, "utf8"), { filename: file });
    else if (file.endsWith(".json")) JSON.parse(await readFile(file, "utf8"));
    else if (file.endsWith(".html")) {
      const html = await readFile(file, "utf8");
      for (const [, reference] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
        if (/^(?:[a-z]+:|\/\/)/i.test(reference)) continue;
        await access(
          path.resolve(path.dirname(file), reference.split(/[?#]/)[0]),
        );
      }
    }
    checked++;
  }
}
let version;
for (const platform of ["chromium", "firefox"]) {
  const manifest = JSON.parse(
    await readFile(
      path.join(root, "platform", platform, "manifest.json"),
      "utf8",
    ),
  );
  if (version && manifest.version !== version)
    throw new Error("Browser versions differ");
  version = manifest.version;
  const references = [
    ...Object.values(manifest.icons),
    manifest.action.default_popup,
    manifest.options_page,
    ...Object.values(manifest.action.default_icon),
    ...(manifest.background.scripts || [manifest.background.service_worker]),
    ...manifest.content_scripts.flatMap((script) => [
      ...(script.js || []),
      ...(script.css || []),
    ]),
  ];
  for (const reference of references)
    await access(path.join(root, "src", reference));
}
console.log(`Checked ${checked} source files and both browser manifests.`);
