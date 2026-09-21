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

test("resource matching stops at the hosting provider while preserving listed sites", () => {
  for (const [current, listed, matches] of [
    ["https://unlisted.neocities.org/page", "https://neocities.org", false],
    [
      "https://www.unlisted.neocities.org/page",
      "https://www.neocities.org/",
      false,
    ],
    ["https://listed.neocities.org/page", "https://listed.neocities.org", true],
    ["https://other.neocities.org/page", "https://listed.neocities.org", false],
    ["https://sub.ordinary.example/page", "https://ordinary.example", true],
    ["https://sub.notneocities.org/page", "https://notneocities.org", true],
  ]) {
    assert.equal(
      functions.urlMatchesListedResource(current, listed),
      matches,
      current,
    );
    assert.equal(
      functions.findMatchingListedResource(
        current,
        functions.buildResourceIndex([listed]),
      ),
      matches ? listed : undefined,
      current,
    );
  }
});

test("approval identities group known repositories and scripts without crossing resource boundaries", () => {
  const { getApprovalKey } = functions;
  for (const [approved, sameResource, otherResource] of [
    [
      "https://github.com/owner/repo/releases",
      "https://github.com/owner/repo/issues?sort=new#top",
      "https://github.com/owner/repo-copy",
    ],
    [
      "https://gist.github.com/owner/abc/revisions",
      "https://gist.github.com/owner/abc#file",
      "https://gist.github.com/owner/def",
    ],
    [
      "https://raw.githubusercontent.com/owner/repo/main/file",
      "https://raw.githubusercontent.com/owner/repo/next/file",
      "https://raw.githubusercontent.com/owner/other/main/file",
    ],
    [
      "https://codeberg.org/owner/repo/releases",
      "https://codeberg.org/owner/repo/issues",
      "https://codeberg.org/owner/other",
    ],
    [
      "https://gitlab.com/group/subgroup/project/-/releases",
      "https://gitlab.com/group/subgroup/project/-/issues",
      "https://gitlab.com/group/subgroup/other/-/issues",
    ],
    [
      "https://sourceforge.net/projects/tool/files/latest",
      "https://sourceforge.net/projects/tool/reviews",
      "https://sourceforge.net/projects/tool-copy/files",
    ],
    [
      "https://greasyfork.org/en/scripts/12345-first/code",
      "https://greasyfork.org/fr/scripts/12345-first/feedback",
      "https://greasyfork.org/en/scripts/67890-second",
    ],
  ]) {
    assert.equal(
      getApprovalKey(approved),
      getApprovalKey(sameResource),
      approved,
    );
    assert.notEqual(
      getApprovalKey(approved),
      getApprovalKey(otherResource),
      otherResource,
    );
  }
});

test("approval identities retain exact URLs for shared hosts without a known resource boundary", () => {
  const { getApprovalKey } = functions;
  for (const host of context.SafeGuard.config.sharedResourceHosts) {
    assert.notEqual(
      getApprovalKey(`https://${host}/`),
      getApprovalKey(`https://${host}/owner/resource`),
      host,
    );
    assert.notEqual(
      getApprovalKey(`https://${host}/owner/resource`),
      getApprovalKey(`https://${host}/owner/other`),
      host,
    );
  }
  for (const [one, other] of [
    ["https://youtube.com/watch?v=one", "https://youtube.com/watch?v=other"],
    [
      "https://matrix.to/#/#one:matrix.org",
      "https://matrix.to/#/#other:matrix.org",
    ],
    [
      "https://drive.google.com/open?id=one",
      "https://drive.google.com/open?id=other",
    ],
    [
      "https://gitlab.com/group/subgroup/one",
      "https://gitlab.com/group/subgroup/other",
    ],
    ["https://mega.nz/#one", "https://mega.nz/#other"],
  ]) {
    assert.notEqual(getApprovalKey(one), getApprovalKey(other), other);
  }
});
