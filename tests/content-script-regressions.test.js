const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const contentScript = fs.readFileSync(
  path.join(__dirname, "..", "src", "js", "content.js"),
  "utf8",
);
const backgroundScript = fs.readFileSync(
  path.join(__dirname, "..", "src", "js", "background.js"),
  "utf8",
);
const popupHtml = fs.readFileSync(
  path.join(__dirname, "..", "src", "pub", "index.html"),
  "utf8",
);
const popupScript = fs.readFileSync(
  path.join(__dirname, "..", "src", "pub", "index.js"),
  "utf8",
);
const warningPageScript = fs.readFileSync(
  path.join(__dirname, "..", "src", "pub", "warning-page.js"),
  "utf8",
);
const i18nScript = fs.readFileSync(
  path.join(__dirname, "..", "src", "js", "i18n.js"),
  "utf8",
);
const fmhyHighlightScriptPath = path.join(
  __dirname,
  "..",
  "src",
  "js",
  "fmhy-highlight.js",
);
const chromiumManifest = fs.readFileSync(
  path.join(__dirname, "..", "platform", "chromium", "manifest.json"),
  "utf8",
);
const firefoxManifest = fs.readFileSync(
  path.join(__dirname, "..", "platform", "firefox", "manifest.json"),
  "utf8",
);

function loadFunction(source, name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start =
    asyncStart !== -1 ? asyncStart : source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should be defined`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) {
      return Function(`return (${source.slice(start, index + 1)})`)();
    }
  }

  throw new Error(`Could not read ${name}`);
}

function loadFunctionWithDependencies(source, name, dependencies) {
  const fn = loadFunction(source, name);
  return Function(
    ...Object.keys(dependencies),
    `return (${fn.toString()});`,
  )(...Object.values(dependencies));
}

const sharedResourceHosts = new Set([
  "github.com",
  "gist.github.com",
  "raw.githubusercontent.com",
  "greasyfork.org",
  "youtube.com",
  "chromewebstore.google.com",
  "colab.research.google.com",
  "modrinth.com",
  "f-droid.org",
  "xdaforums.com",
  "start.me",
  "sites.google.com",
  "matrix.to",
  "codepen.io",
  "vk.com",
  "gitlab.com",
  "codeberg.org",
  "sourceforge.net",
  "linktr.ee",
  "rentry.co",
  "rentry.org",
  "pastebin.com",
  "archive.org",
  "drive.google.com",
  "docs.google.com",
  "discord.com",
  "discord.gg",
  "t.me",
  "mega.nz",
  "mediafire.com",
  "gofile.io",
  "pixeldrain.com",
  "huggingface.co",
]);

test("processed link tracking can be reset after settings change", () => {
  assert.match(contentScript, /let processedLinks = new WeakMap\(\);/);
  assert.match(contentScript, /processedLinks = new WeakMap\(\);/);
});

test("processed links use an extension-owned data attribute", () => {
  assert.match(
    contentScript,
    /link\.setAttribute\("data-fmhy-processed", "true"\);/,
  );
  assert.doesNotMatch(contentScript, /classList\.add\("fmhy-processed"\)/);
});

test("links are reprocessed only when their destination changes", () => {
  assert.match(
    contentScript,
    /if \(processedLinks\.get\(link\) === link\.href\) return;/,
  );
  assert.match(contentScript, /processedLinks\.set\(link, link\.href\);/);
});

test("Brave highlighting is mutation-driven instead of polling the full page", () => {
  assert.doesNotMatch(
    contentScript,
    /braveSearchBadgeInterval\s*=\s*setInterval\(/,
  );
  assert.match(contentScript, /let pageObserver = null;/);
  assert.match(contentScript, /pageObserver\?\.disconnect\(\);/);
});

test("warning redirects honor the setting saved by the options page", () => {
  assert.match(
    backgroundScript,
    /storage\.local\.get\(\{\s*showWarning: true,\s*\}\)/,
  );
  assert.match(backgroundScript, /if \(!showWarning\)/);
  assert.doesNotMatch(backgroundScript, /storage\.sync\.get\(\{\s*warningPage:/);
});

test("all bold links on a starred guide line are treated as starred", () => {
  const extractStarredUrlsFromMarkdown = loadFunction(
    backgroundScript,
    "extractStarredUrlsFromMarkdown",
  );
  const markdown =
    "* ⭐ **[First](https://first.example/)** or **[Second](https://second.example/)** / [Related](https://related.example/)";

  assert.deepEqual(extractStarredUrlsFromMarkdown(markdown), [
    "https://first.example/",
    "https://second.example/",
  ]);
});

test("unbolded alternatives on a starred guide line are also starred", () => {
  const extractStarredUrlsFromMarkdown = loadFunction(
    backgroundScript,
    "extractStarredUrlsFromMarkdown",
  );
  const markdown =
    "* ⭐ **[GitHub Gists](https://gist.github.com/)** or [GitLab Snippets](https://docs.gitlab.com/user/snippets/) - Multi-Syntax / [Related](https://related.example/)";

  assert.deepEqual(extractStarredUrlsFromMarkdown(markdown), [
    "https://gist.github.com/",
    "https://docs.gitlab.com/user/snippets/",
  ]);
});

test("Markdown autolinks are extracted without angle brackets", () => {
  const extractUrlsFromMarkdown = loadFunction(
    backgroundScript,
    "extractUrlsFromMarkdown",
  );

  assert.deepEqual(
    extractUrlsFromMarkdown("* <https://rentry.co/m2hkqhwb> - Mirror details"),
    ["https://rentry.co/m2hkqhwb"],
  );
});

test("unsafe navigation is checked as soon as the tab URL changes", () => {
  assert.match(
    backgroundScript,
    /tabs\.onUpdated\.addListener\(async \(tabId, changeInfo, tab\) => \{\s*if \(changeInfo\.url && shouldCheckTabUrl\(tabId, changeInfo\.url\)\) \{\s*await checkSiteAndUpdatePageAction\(tabId, changeInfo\.url\);\s*return;/,
  );
});

test("filter-list regexes require URL and hostname boundaries", () => {
  const generateRegexFromList = loadFunction(
    backgroundScript,
    "generateRegexFromList",
  );
  const urlRegex = generateRegexFromList([
    "https://github.com/fvision8/fvreleases",
  ]);
  const hostnameRegex = generateRegexFromList(["unsafe.example"]);
  const emptyRegex = generateRegexFromList([]);

  assert.equal(urlRegex.test("https://github.com/fvision8/fvreleases"), true);
  assert.equal(urlRegex.test("https://github.com/fvision8/fvreleases/app"), true);
  assert.equal(urlRegex.test("https://github.com/fvision8/fvreleases-copy"), false);
  assert.equal(urlRegex.test("https://github.com.evil/fvision8/fvreleases"), false);
  assert.equal(hostnameRegex.test("unsafe.example"), true);
  assert.equal(hostnameRegex.test("sub.unsafe.example"), true);
  assert.equal(hostnameRegex.test("notunsafe.example"), false);
  assert.equal(emptyRegex.test("https://anything.example"), false);
});

test("unsafe reasons are rendered without interpolating remote text as HTML", () => {
  assert.match(popupScript, /function renderTextWithLinks\(/);
  assert.match(warningPageScript, /function renderTextWithLinks\(/);
  assert.match(contentScript, /function setUnsafeBadgeContent\(/);
  assert.doesNotMatch(popupScript, /reasonContent\.innerHTML/);
  assert.doesNotMatch(warningPageScript, /reasonText.*\.innerHTML|\.innerHTML.*reasonText/);
  assert.doesNotMatch(contentScript, /badge\.innerHTML/);
  assert.match(popupScript, /link\.textContent = url/);
  assert.match(warningPageScript, /link\.textContent = url/);
  assert.match(contentScript, /document\.createTextNode/);
});

test("popup and translations render rich text through the shared sanitizer", () => {
  assert.doesNotMatch(popupScript, /\.innerHTML\s*=/);
  assert.doesNotMatch(i18nScript, /\.innerHTML\s*=/);
  assert.match(i18nScript, /function renderSanitizedMarkup\(/);
  assert.match(i18nScript, /protocol === "https:" \|\| protocol === "http:"/);
  assert.match(
    popupScript,
    /window\.i18n\.renderSanitizedMarkup\(\s*noteContent,/,
  );
  assert.match(
    popupScript,
    /window\.i18n\.renderSanitizedMarkup\(\s*statusMessage,/,
  );
});

test("root-only popup labels omit their trailing slash", () => {
  const formatHostAndPath = loadFunction(popupScript, "formatHostAndPath");

  assert.equal(formatHostAndPath(new URL("https://github.com/")), "github.com");
  assert.equal(formatHostAndPath(new URL("https://rentry.co/")), "rentry.co");
  assert.equal(
    formatHostAndPath(new URL("https://docs.gitlab.com/user/snippets/")),
    "docs.gitlab.com/user/snippets",
  );
});

test("guide resources map to their FMHY page section", () => {
  const extractFmhyResourceMap = loadFunction(
    backgroundScript,
    "extractFmhyResourceMap",
  );
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
  const extractFmhyResourceMap = loadFunction(
    backgroundScript,
    "extractFmhyResourceMap",
  );
  const markdown = [
    "## Reading",
    "### LibGen Mirrors",
    "* <https://rentry.co/m2hkqhwb> - Differences between the mirrors",
  ].join("\n");

  assert.deepEqual(
    extractFmhyResourceMap(markdown, "https://fmhy.net/storage"),
    {
      "https://rentry.co/m2hkqhwb":
        "https://fmhy.net/storage#libgen-mirrors",
    },
  );
});

test("popup exposes a View on FMHY link for mapped resources", () => {
  assert.match(popupHtml, /id="fmhy-resource-link"/);
  assert.match(popupScript, /response\.fmhyUrl/);
  assert.match(popupHtml, /View on FMHY/);
});

test("opening an FMHY resource highlights its matching guide line", () => {
  assert.equal(fs.existsSync(fmhyHighlightScriptPath), true);
  const fmhyHighlightScript = fs.readFileSync(fmhyHighlightScriptPath, "utf8");

  assert.match(popupScript, /pendingFmhyHighlight/);
  assert.match(fmhyHighlightScript, /vp-search-highlight-target/);
  assert.match(fmhyHighlightScript, /closest\("li, p"\)/);
  assert.match(fmhyHighlightScript, /waitForMatchingResult/);
  assert.match(fmhyHighlightScript, /MutationObserver/);
  assert.match(chromiumManifest, /js\/fmhy-highlight\.js/);
  assert.match(firefoxManifest, /js\/fmhy-highlight\.js/);
});

test("FMHY passwords and invite codes match the current guide", () => {
  assert.match(backgroundScript, /"steamrip\.com": "steamrip\.com"/);
  assert.match(backgroundScript, /"iptv\.watchott\.ru": "FREE-MEDIA"/);
  assert.match(
    backgroundScript,
    /"https:\/\/rentry\.co\/fmhyb64#gnarly": "gnarly"/,
  );
  assert.match(
    backgroundScript,
    /"https:\/\/rentry\.co\/fmhyb64#alvro": "ByAlvRo"/,
  );
  assert.match(backgroundScript, /"ee3\.me": "mpgh"/);
  assert.match(backgroundScript, /"rips\.cc": "1hack"/);
});

test("shared-host passwords require an exact resource URL", () => {
  assert.doesNotMatch(backgroundScript, /"rentry\.co":/);
  assert.match(
    backgroundScript,
    /getPasswordForDomain\(domain, url\)/,
  );
});

test("path-specific unsafe reasons preserve the repository path", () => {
  const getReasonKeyForUrl = loadFunction(
    backgroundScript,
    "getReasonKeyForUrl",
  );

  assert.equal(
    getReasonKeyForUrl(
      "https://github.com/FVision8/FVReleases/releases?tab=readme#downloads",
    ),
    "github.com/fvision8/fvreleases/releases",
  );
  assert.equal(getReasonKeyForUrl("https://linktr.ee/flixvision/"), "linktr.ee/flixvision");
  assert.equal(getReasonKeyForUrl("https://github.com/"), null);
});

test("path-specific reasons can classify otherwise unmatched URLs", () => {
  assert.match(backgroundScript, /const pathSpecificReason = await getReasonForUrl\(url\)/);
  assert.match(
    backgroundScript,
    /if \(status === "no_data" && pathSpecificReason\)/,
  );
});

test("the popup uses the neutral icon when a site is not in FMHY", () => {
  assert.match(
    popupScript,
    /no_data: "\.\.\/res\/icons\/default\.png"/,
  );
  assert.match(
    popupScript,
    /unknown: "\.\.\/res\/icons\/default\.png"/,
  );
  assert.match(
    popupScript,
    /statusIcon\.alt = status === "no_data" \? "Not listed in FMHY" : "Site status"/,
  );
});

test("shared hosts require the same path-bound resource", () => {
  const normalizeUrl = loadFunction(backgroundScript, "normalizeUrl");
  const normalizeResourceUrl = loadFunctionWithDependencies(
    backgroundScript,
    "normalizeResourceUrl",
    { normalizeUrl },
  );
  const isSharedResourceHost = loadFunctionWithDependencies(
    backgroundScript,
    "isSharedResourceHost",
    { sharedResourceHosts },
  );
  const urlMatchesListedResource = loadFunctionWithDependencies(
    backgroundScript,
    "urlMatchesListedResource",
    { normalizeResourceUrl, isSharedResourceHost },
  );

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

test("resource matching only scans candidates for the current hostname", () => {
  const normalizeUrl = loadFunction(backgroundScript, "normalizeUrl");
  const normalizeResourceUrl = loadFunctionWithDependencies(
    backgroundScript,
    "normalizeResourceUrl",
    { normalizeUrl },
  );
  const buildResourceIndex = loadFunctionWithDependencies(
    backgroundScript,
    "buildResourceIndex",
    { normalizeResourceUrl },
  );

  let comparisonCount = 0;
  const findMatchingListedResource = loadFunctionWithDependencies(
    backgroundScript,
    "findMatchingListedResource",
    {
      normalizeResourceUrl,
      isSharedResourceHost: () => false,
      urlMatchesListedResource: (currentUrl, listedUrl) => {
        comparisonCount += 1;
        return currentUrl === listedUrl;
      },
    },
  );
  const resources = Array.from(
    { length: 25000 },
    (_, index) => `https://resource-${index}.example/item`,
  );
  resources.push("https://target.example/item");
  const resourceIndex = buildResourceIndex(resources);

  assert.equal(
    findMatchingListedResource(
      "https://unknown.example/item",
      resourceIndex,
    ),
    undefined,
  );
  assert.equal(comparisonCount, 0);

  assert.equal(
    findMatchingListedResource(
      "https://target.example/item",
      resourceIndex,
    ),
    "https://target.example/item",
  );
  assert.equal(comparisonCount, 1);
});

test("shared-host matching narrows candidates by the first path segment", () => {
  const normalizeUrl = loadFunction(backgroundScript, "normalizeUrl");
  const normalizeResourceUrl = loadFunctionWithDependencies(
    backgroundScript,
    "normalizeResourceUrl",
    { normalizeUrl },
  );
  const buildResourceIndex = loadFunctionWithDependencies(
    backgroundScript,
    "buildResourceIndex",
    { normalizeResourceUrl },
  );

  let comparisonCount = 0;
  const findMatchingListedResource = loadFunctionWithDependencies(
    backgroundScript,
    "findMatchingListedResource",
    {
      normalizeResourceUrl,
      isSharedResourceHost: (hostname) => hostname === "github.com",
      urlMatchesListedResource: (currentUrl, listedUrl) => {
        comparisonCount += 1;
        return currentUrl.startsWith(`${listedUrl}/`);
      },
    },
  );
  const resources = Array.from(
    { length: 10000 },
    (_, index) => `https://github.com/owner-${index}/project`,
  );
  resources.push("https://github.com/target-owner/project");
  const resourceIndex = buildResourceIndex(resources);

  assert.equal(
    findMatchingListedResource(
      "https://github.com/target-owner/project/issues/1",
      resourceIndex,
    ),
    "https://github.com/target-owner/project",
  );
  assert.ok(
    comparisonCount <= 2,
    `expected at most 2 candidate comparisons, received ${comparisonCount}`,
  );
});

test("FMHY resource guides are fetched only once per refresh", async () => {
  const fetchResourceLists = loadFunctionWithDependencies(
    backgroundScript,
    "fetchResourceLists",
    {
      safeListURLs: [
        "https://example.com/first.md",
        "https://example.com/second.md",
      ],
      extractUrlsFromMarkdown: () => [],
      extractFmhyResourceMap: () => ({}),
      extractStarredUrlsFromMarkdown: () => [],
      normalizeResourceUrl: (url) => url,
      buildResourceIndex: () => new Map(),
      browserAPI: {
        storage: {
          local: {
            set: async () => {},
          },
        },
      },
      resourceIdentityVersion: 2,
      safeSites: [],
      starredSites: [],
      safeSiteIndex: new Map(),
      starredSiteIndex: new Map(),
      fmhyResourceMap: {},
      checkedTabUrls: new Map(),
      console: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
      fetch: async () => {
        fetchResourceLists.requestCount += 1;
        return {
          ok: true,
          text: async () => "# Guide",
        };
      },
    },
  );
  fetchResourceLists.requestCount = 0;

  await fetchResourceLists();

  assert.equal(fetchResourceLists.requestCount, 2);
  assert.doesNotMatch(backgroundScript, /async function fetchSafeSites\(/);
  assert.doesNotMatch(backgroundScript, /async function fetchStarredSites\(/);
  assert.doesNotMatch(backgroundScript, /docs\/nsfwpiracy\.md/);
});

test("compact domain indexes deduplicate normalized hostnames", () => {
  const extractUniqueHostnamesFromUrls = loadFunction(
    backgroundScript,
    "extractUniqueHostnamesFromUrls",
  );

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

test("content scripts prefer compact domain indexes over full resource lists", async () => {
  const requestedKeys = [];
  const loadDomainLists = loadFunctionWithDependencies(
    contentScript,
    "loadDomainLists",
    {
      browserAPI: {
        storage: {
          local: {
            get: async (keys) => {
              requestedKeys.push(keys);
              return {
                unsafeDomainList: ["unsafe.example"],
                safeDomainList: ["safe.example"],
                unsafeReasons: {},
              };
            },
          },
        },
      },
      unsafeDomains: new Set(),
      safeDomains: new Set(),
      unsafeReasons: {},
      normalizeDomain: (hostname) => hostname.replace(/^www\./, "").toLowerCase(),
      applyUserOverrides: () => {},
      console: {
        log: () => {},
        error: () => {},
      },
    },
  );

  await loadDomainLists();

  assert.deepEqual(requestedKeys, [
    ["unsafeDomainList", "safeDomainList", "unsafeReasons"],
  ]);
});

test("settings initialization writes only missing defaults", async () => {
  const writes = [];
  const initializeSettings = loadFunctionWithDependencies(
    backgroundScript,
    "initializeSettings",
    {
      browserAPI: {
        storage: {
          local: {
            get: async () => ({
              theme: "dark",
              showWarning: false,
            }),
            set: async (settings) => writes.push(settings),
          },
        },
      },
      console: { log() {} },
    },
  );

  await initializeSettings();

  assert.equal(writes.length, 1);
  assert.equal(writes[0].theme, undefined);
  assert.equal(writes[0].showWarning, undefined);
  assert.equal(writes[0].updateFrequency, "daily");
  assert.equal(writes[0].highlightTrusted, true);
});

test("update checks read their schedule in one storage operation", async () => {
  const storageGets = [];
  const shouldUpdate = loadFunctionWithDependencies(
    backgroundScript,
    "shouldUpdate",
    {
      browserAPI: {
        storage: {
          local: {
            get: async (keys) => {
              storageGets.push(keys);
              return {
                lastUpdated: new Date().toISOString(),
                updateFrequency: "daily",
              };
            },
          },
        },
      },
      console: { error() {} },
    },
  );

  assert.equal(await shouldUpdate(), false);
  assert.deepEqual(storageGets, [["lastUpdated", "updateFrequency"]]);
});

test("the same tab URL is only checked once per navigation", () => {
  const shouldCheckTabUrl = loadFunctionWithDependencies(
    backgroundScript,
    "shouldCheckTabUrl",
    {
      normalizeResourceUrl: (url) => url,
      checkedTabUrls: new Map(),
    },
  );

  assert.equal(shouldCheckTabUrl(7, "https://example.com/page"), true);
  assert.equal(shouldCheckTabUrl(7, "https://example.com/page"), false);
  assert.equal(shouldCheckTabUrl(7, "https://example.com/next"), true);
  assert.equal(shouldCheckTabUrl(8, "https://example.com/next"), true);
});

test("status checks wait for resource-list initialization", () => {
  assert.match(backgroundScript, /let initializationPromise = null;/);
  assert.match(
    backgroundScript,
    /async function checkSiteAndUpdatePageAction\(tabId, url\) \{\s*if \(initializationPromise\) await initializationPromise;/,
  );
  assert.match(
    backgroundScript,
    /if \(message\.action === "getSiteStatus"\) \{\s*\(async \(\) => \{\s*try \{\s*if \(initializationPromise\) await initializationPromise;/,
  );
  assert.match(
    backgroundScript,
    /initializationPromise = initializeExtension\(\);/,
  );
});

test("cross-domain redirects do not inherit a source site's status", () => {
  assert.doesNotMatch(chromiumManifest, /"webNavigation"/);
  assert.doesNotMatch(firefoxManifest, /"webNavigation"|"webRequest"/);
  assert.doesNotMatch(backgroundScript, /redirectOrigins|getRedirectOrigin/);
  assert.doesNotMatch(popupScript, /tabId: activeTab\.id/);
});

test("normal subdomains only inherit the matching listed path", () => {
  const normalizeUrl = loadFunction(backgroundScript, "normalizeUrl");
  const normalizeResourceUrl = loadFunctionWithDependencies(
    backgroundScript,
    "normalizeResourceUrl",
    { normalizeUrl },
  );
  const isSharedResourceHost = loadFunctionWithDependencies(
    backgroundScript,
    "isSharedResourceHost",
    { sharedResourceHosts },
  );
  const urlMatchesListedResource = loadFunctionWithDependencies(
    backgroundScript,
    "urlMatchesListedResource",
    { normalizeResourceUrl, isSharedResourceHost },
  );

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
    urlMatchesListedResource(
      "https://rentry.co/",
      "https://rentry.co/fmhy",
    ),
    false,
  );
});

test("status matching isolates shared resources and recognizes matching subdomains", () => {
  const normalizeUrl = loadFunction(backgroundScript, "normalizeUrl");
  const normalizeResourceUrl = loadFunctionWithDependencies(
    backgroundScript,
    "normalizeResourceUrl",
    { normalizeUrl },
  );
  const isSharedResourceHost = loadFunctionWithDependencies(
    backgroundScript,
    "isSharedResourceHost",
    { sharedResourceHosts },
  );
  const urlMatchesListedResource = loadFunctionWithDependencies(
    backgroundScript,
    "urlMatchesListedResource",
    { normalizeResourceUrl, isSharedResourceHost },
  );
  const buildResourceIndex = loadFunctionWithDependencies(
    backgroundScript,
    "buildResourceIndex",
    { normalizeResourceUrl },
  );
  const findMatchingListedResource = loadFunctionWithDependencies(
    backgroundScript,
    "findMatchingListedResource",
    {
      normalizeResourceUrl,
      isSharedResourceHost,
      urlMatchesListedResource,
    },
  );
  const starredSiteIndex = buildResourceIndex([
    "https://github.com/fmhy/FMHY-SafeGuard",
    "https://gist.github.com/",
    "https://docs.gitlab.com/user/snippets/",
    "https://ente.com/auth",
    "https://mullvad.net",
  ]);
  const safeSiteIndex = buildResourceIndex([
    "https://github.com/fmhy/FMHYFilterlist",
  ]);
  const getStatusFromLists = loadFunctionWithDependencies(
    backgroundScript,
    "getStatusFromLists",
    {
      userTrustedDomains: new Set(),
      userUntrustedDomains: new Set(),
      isSharedResourceHost,
      findMatchingListedResource,
      unsafeSitesRegex: null,
      potentiallyUnsafeSitesRegex: null,
      fmhySitesRegex: null,
      starredSiteIndex,
      safeSiteIndex,
      base64StarredSiteIndex: new Map(),
      base64SafeSiteIndex: new Map(),
      unsafeHostnamesRegex: null,
      potentiallyUnsafeHostnamesRegex: null,
    },
  );

  assert.equal(getStatusFromLists("https://github.com/"), "no_data");
  assert.equal(
    getStatusFromLists("https://github.com/fmhy/FMHY-SafeGuard/releases"),
    "starred",
  );
  assert.equal(
    getStatusFromLists("https://github.com/fmhy/FMHYFilterlist/issues"),
    "safe",
  );
  assert.equal(
    getStatusFromLists("https://github.com/fmhy/unlisted-repository"),
    "no_data",
  );
  assert.equal(getStatusFromLists("https://auth.ente.com/auth"), "starred");
  assert.equal(getStatusFromLists("https://auth.ente.com/login"), "starred");
  assert.equal(getStatusFromLists("https://auth.ente.com/photos"), "no_data");
  assert.equal(getStatusFromLists("https://gist.github.com/starred"), "starred");
  assert.equal(
    getStatusFromLists("https://gist.github.com/example/dangerous-gist"),
    "no_data",
  );
  assert.equal(
    getStatusFromLists("https://docs.gitlab.com/user/snippets/"),
    "starred",
  );
  assert.equal(getStatusFromLists("https://mullvad.net/en"), "starred");
});

test("the popup preserves Codeberg owner and repository names", () => {
  assert.match(
    popupScript,
    /const repositoryHosts = new Set\(\[[\s\S]*"codeberg\.org"[\s\S]*\]\)/,
  );
  assert.match(
    popupScript,
    /repositoryHosts\.has\(matchedUrlObj\.hostname\)/,
  );
  assert.match(
    popupScript,
    /displayUrl = `\$\{matchedUrlObj\.hostname\}\/\$\{pathParts\[0\]\}\/\$\{pathParts\[1\]\}`/,
  );
});

test("the popup preserves paths for every shared resource host", () => {
  const backgroundHosts = backgroundScript.match(
    /const sharedResourceHosts = new Set\(\[([\s\S]*?)\]\);/,
  )[1].match(/"([^"]+)"/g);
  const popupHosts = popupScript.match(
    /const sharedResourceHosts = new Set\(\[([\s\S]*?)\]\);/,
  )[1].match(/"([^"]+)"/g);

  assert.deepEqual(popupHosts, backgroundHosts);
  assert.ok(backgroundHosts.includes('"linktr.ee"'));
  for (const host of [
    '"greasyfork.org"',
    '"youtube.com"',
    '"chromewebstore.google.com"',
    '"colab.research.google.com"',
    '"modrinth.com"',
    '"f-droid.org"',
    '"xdaforums.com"',
    '"start.me"',
    '"sites.google.com"',
    '"matrix.to"',
    '"codepen.io"',
    '"vk.com"',
  ]) {
    assert.ok(backgroundHosts.includes(host));
  }
  assert.match(
    popupScript,
    /sharedResourceHosts\.has\(matchedUrlObj\.hostname\)/,
  );
  assert.match(
    popupScript,
    /displayUrl = formatHostAndPath\(matchedUrlObj\)/,
  );
});

test("path-specific unsafe reasons also update the toolbar icon", () => {
  assert.match(
    backgroundScript,
    /async function checkSiteAndUpdatePageAction\(tabId, url\)/,
  );
  assert.match(
    backgroundScript,
    /if \(status === "no_data" && await getReasonForUrl\(url\)\) \{\s*status = "unsafe";/,
  );
  assert.match(
    backgroundScript,
    /updatePageAction\(status, tabId\);/,
  );
});

test("live resource data preserves query and fragment identities", () => {
  assert.match(
    backgroundScript,
    /allUrls\.map\(\(url\) => normalizeResourceUrl\(url\.trim\(\)\)\)/,
  );
  assert.match(
    backgroundScript,
    /const resourceUrl = normalizeResourceUrl\(url\);/,
  );
  assert.match(
    backgroundScript,
    /findMatchingListedResource\(\s*resourceUrl,\s*(?:starred|safe)SiteIndex,/,
  );
  assert.match(
    backgroundScript,
    /storedData\.resourceIdentityVersion === resourceIdentityVersion/,
  );
});

test("the toolbar does not inherit root status on shared hosts", () => {
  assert.match(
    backgroundScript,
    /const requiresResourcePath = normalizedUrl\s*\? isSharedResourceHost\(new URL\(normalizedUrl\)\.hostname\)\s*: false;/,
  );
  assert.match(
    backgroundScript,
    /status === "no_data" &&\s*!requiresResourcePath &&\s*rootUrl !== resourceUrl\s*\) \{\s*status = getStatusFromLists\(rootUrl\);/,
  );
});

test("the popup preserves canonical paths for ordinary FMHY resources", () => {
  assert.match(
    popupScript,
    /displayUrl = formatHostAndPath\(matchedUrlObj\);/,
  );
});
