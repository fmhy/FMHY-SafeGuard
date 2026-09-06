const test = require("node:test");
const strict = require("node:assert/strict");
const { loadModules, plain } = require("./helpers");
const assert = {
  ...strict,
  deepEqual: (actual, expected) => strict.deepEqual(plain(actual), expected),
};
const context = loadModules();
require("node:vm").runInContext(
  require("./helpers").read("src/js/page-ui.js"),
  context,
);
const functions = {
  ...context.SafeGuard.resources,
  ...context.SafeGuard.guideParser,
  ...context.SafeGuard.pageUi,
};

test("unrelated Greasy Fork pages do not match when neither URL has a script ID", () => {
  assert.equal(
    functions.urlMatchesListedResource(
      "https://greasyfork.org/en/other",
      "https://greasyfork.org/en/about",
    ),
    false,
  );
});

test("large resource indexes find only matching hosts and owners", () => {
  const urls = Array.from(
    { length: 25000 },
    (_, index) => `https://resource-${index}.example/item`,
  );
  urls.push(
    ...Array.from(
      { length: 10000 },
      (_, index) => `https://github.com/owner-${index}/repo`,
    ),
  );
  const index = functions.buildResourceIndex(urls);
  assert.equal(
    functions.findMatchingListedResource("https://unknown.example/item", index),
    undefined,
  );
  assert.equal(
    functions.findMatchingListedResource(
      "https://resource-42.example/item",
      index,
    ),
    "https://resource-42.example/item",
  );
  assert.equal(
    functions.findMatchingListedResource(
      "https://github.com/owner-9999/repo/issues",
      index,
    ),
    "https://github.com/owner-9999/repo",
  );
});

test("all bold links on a starred guide line are treated as starred", () => {
  const extractStarredUrlsFromMarkdown =
    functions.extractStarredUrlsFromMarkdown;
  const markdown =
    "* ⭐ **[First](https://first.example/)** or **[Second](https://second.example/)** / [Related](https://related.example/)";

  assert.deepEqual(extractStarredUrlsFromMarkdown(markdown), [
    "https://first.example/",
    "https://second.example/",
  ]);
});

test("unbolded alternatives on a starred guide line are also starred", () => {
  const extractStarredUrlsFromMarkdown =
    functions.extractStarredUrlsFromMarkdown;
  const markdown =
    "* ⭐ **[GitHub Gists](https://gist.github.com/)** or [GitLab Snippets](https://docs.gitlab.com/user/snippets/) - Multi-Syntax / [Related](https://related.example/)";

  assert.deepEqual(extractStarredUrlsFromMarkdown(markdown), [
    "https://gist.github.com/",
    "https://docs.gitlab.com/user/snippets/",
  ]);
});

test("Markdown autolinks are extracted without angle brackets", () => {
  const extractUrlsFromMarkdown = functions.extractUrlsFromMarkdown;

  assert.deepEqual(
    extractUrlsFromMarkdown("* <https://rentry.co/m2hkqhwb> - Mirror details"),
    ["https://rentry.co/m2hkqhwb"],
  );
});

test("filter-list regexes require URL and hostname boundaries", () => {
  const generateRegexFromList = functions.generateRegexFromList;
  const urlRegex = generateRegexFromList([
    "https://github.com/fvision8/fvreleases",
  ]);
  const hostnameRegex = generateRegexFromList(["unsafe.example"]);
  const emptyRegex = generateRegexFromList([]);

  assert.equal(urlRegex.test("https://github.com/fvision8/fvreleases"), true);
  assert.equal(
    urlRegex.test("https://github.com/fvision8/fvreleases/app"),
    true,
  );
  assert.equal(
    urlRegex.test("https://github.com/fvision8/fvreleases-copy"),
    false,
  );
  assert.equal(
    urlRegex.test("https://github.com.evil/fvision8/fvreleases"),
    false,
  );
  assert.equal(hostnameRegex.test("unsafe.example"), true);
  assert.equal(hostnameRegex.test("sub.unsafe.example"), true);
  assert.equal(hostnameRegex.test("notunsafe.example"), false);
  assert.equal(emptyRegex.test("https://anything.example"), false);
});

test("root-only popup labels omit their trailing slash", () => {
  const formatHostAndPath = functions.formatHostAndPath;

  assert.equal(formatHostAndPath(new URL("https://github.com/")), "github.com");
  assert.equal(formatHostAndPath(new URL("https://rentry.co/")), "rentry.co");
  assert.equal(
    formatHostAndPath(new URL("https://docs.gitlab.com/user/snippets/")),
    "docs.gitlab.com/user/snippets",
  );
});

test("guide resources map to their FMHY page section", () => {
  const extractFmhyResourceMap = functions.extractFmhyResourceMap;
  const markdown = [
    "## Privacy Tools",
    "### ▷ VPN Services",
    "* **[Example VPN](https://vpn.example/download)**",
  ].join("\n");

  assert.deepEqual(
    extractFmhyResourceMap(markdown, "https://fmhy.net/privacy"),
    { "https://vpn.example/download": "https://fmhy.net/privacy#vpn-services" },
  );
});

test("Markdown autolinks map to their FMHY page section", () => {
  const extractFmhyResourceMap = functions.extractFmhyResourceMap;
  const markdown = [
    "## Reading",
    "### LibGen Mirrors",
    "* <https://rentry.co/m2hkqhwb> - Differences between the mirrors",
  ].join("\n");

  assert.deepEqual(
    extractFmhyResourceMap(markdown, "https://fmhy.net/storage"),
    {
      "https://rentry.co/m2hkqhwb": "https://fmhy.net/storage#libgen-mirrors",
    },
  );
});

test("shared hosts require the same path-bound resource", () => {
  const { urlMatchesListedResource } = functions;

  assert.equal(
    urlMatchesListedResource(
      "https://github.com/fmhy/FMHY-SafeGuard/releases",
      "https://github.com/fmhy/FMHY-SafeGuard",
    ),
    true,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://github.com/fmhy/FMHYFilterlist",
      "https://github.com/fmhy/FMHY-SafeGuard",
    ),
    false,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://github.com/",
      "https://github.com/fmhy/FMHY-SafeGuard",
    ),
    false,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://codeberg.org/example/tool/releases",
      "https://codeberg.org/example/tool",
    ),
    true,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://rentry.co/another-page",
      "https://rentry.co/fmhy",
    ),
    false,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://linktr.ee/flixvision",
      "https://linktr.ee/another-profile",
    ),
    false,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://gist.github.com/starred",
      "https://gist.github.com/",
    ),
    true,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://gist.github.com/example/dangerous-gist",
      "https://gist.github.com/",
    ),
    false,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://www.youtube.com/watch?v=listed&t=30",
      "https://www.youtube.com/watch?v=listed",
    ),
    true,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://www.youtube.com/watch?v=unlisted",
      "https://www.youtube.com/watch?v=listed",
    ),
    false,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://matrix.to/#/#listed:matrix.org",
      "https://matrix.to/#/#listed:matrix.org",
    ),
    true,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://matrix.to/#/#other:matrix.org",
      "https://matrix.to/#/#listed:matrix.org",
    ),
    false,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://github.com/fmhy/FMHY-SafeGuard",
      "https://github.com/fmhy/FMHY-SafeGuard#readme",
    ),
    true,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://greasyfork.org/en/scripts/453320-simple-sponsor-skipper",
      "https://greasyfork.org/en/scripts/453320",
    ),
    true,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://greasyfork.org/en/scripts/999999-unlisted-script",
      "https://greasyfork.org/en/scripts/453320",
    ),
    false,
  );
});

test("compact domain indexes deduplicate normalized hostnames", () => {
  const extractUniqueHostnamesFromUrls =
    functions.extractUniqueHostnamesFromUrls;

  assert.deepEqual(
    extractUniqueHostnamesFromUrls([
      "https://www.example.com/path",
      "https://example.com/other",
      "https://github.com/fmhy/FMHY-SafeGuard",
      "not a valid URL",
    ]),
    ["example.com", "github.com"],
  );
});

test("normal subdomains only inherit the matching listed path", () => {
  const { urlMatchesListedResource } = functions;

  assert.equal(
    urlMatchesListedResource(
      "https://auth.ente.com/auth",
      "https://ente.com/auth/",
    ),
    true,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://auth.ente.com/login",
      "https://ente.com/auth/",
    ),
    true,
  );
  assert.equal(
    urlMatchesListedResource(
      "https://auth.ente.com/photos",
      "https://ente.com/auth/",
    ),
    false,
  );
  assert.equal(
    urlMatchesListedResource("https://rentry.co/", "https://rentry.co/fmhy"),
    false,
  );
});
