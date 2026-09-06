"use strict";
globalThis.SafeGuard ||= {};
SafeGuard.createCatalogue = ({
  storage,
  fetch: fetchRemote,
  onUpdated = () => {},
}) => {
  const config = SafeGuard.config;
  const resources = SafeGuard.resources;
  const parser = SafeGuard.guideParser;
  const metadata = SafeGuard.siteMetadata;
  const { normalizeDomain } = SafeGuard.settings;
  const cacheKeys = [
    "unsafeSites",
    "potentiallyUnsafeSites",
    "fmhySites",
    "unsafeReasons",
    "safeSiteList",
    "starredSites",
    "fmhyResourceMap",
    "resourceIdentityVersion",
  ];
  const fallbackStarred = resources.buildResourceIndex(
    SafeGuard.curatedResources.base64StarredLinks,
  );
  const fallbackSafe = resources.buildResourceIndex(
    SafeGuard.curatedResources.base64DecodedLinks,
  );
  const noteCache = new Map();
  let snapshot = {};
  let indexes;
  let trusted = new Set();
  let untrusted = new Set();
  let refreshPromise;

  function compile(data) {
    const urls = (key) => (Array.isArray(data[key]) ? data[key] : []);
    return {
      unsafe: resources.generateRegexFromList(urls("unsafeSites")),
      potentiallyUnsafe: resources.generateRegexFromList(
        urls("potentiallyUnsafeSites"),
      ),
      fmhy: resources.generateRegexFromList(urls("fmhySites")),
      unsafeHosts: resources.generateRegexFromList(
        resources.extractHostnamesFromUrls(urls("unsafeSites")),
      ),
      potentiallyUnsafeHosts: resources.generateRegexFromList(
        resources.extractHostnamesFromUrls(urls("potentiallyUnsafeSites")),
      ),
      starred: resources.buildResourceIndex(urls("starredSites")),
      safe: resources.buildResourceIndex(urls("safeSiteList")),
    };
  }

  function apply(data) {
    const nextIndexes = compile(data);
    snapshot = data;
    indexes = nextIndexes;
  }
  apply(snapshot);

  async function loadOverrides() {
    const data = await storage.get([
      "userTrustedDomains",
      "userUntrustedDomains",
    ]);
    const domainSet = (values) =>
      new Set(
        (Array.isArray(values) ? values : [])
          .filter((value) => typeof value === "string")
          .map(normalizeDomain),
      );
    trusted = domainSet(data.userTrustedDomains);
    untrusted = domainSet(data.userUntrustedDomains);
  }

  async function fetchText(url) {
    const response = await fetchRemote(url);
    if (!response.ok)
      throw new Error(`Could not update ${url}: HTTP ${response.status}`);
    return response.text();
  }

  async function download() {
    const [unsafeText, potentiallyUnsafeText, fmhyText, reasonsText, guides] =
      await Promise.all([
        fetchText(config.filterListURLUnsafe),
        fetchText(config.filterListURLPotentiallyUnsafe),
        fetchText(config.fmhyFilterListURL),
        fetchText(config.unsafeReasonsURL),
        Promise.all(config.safeListURLs.map(fetchText)),
      ]);
    const unsafeReasons = JSON.parse(reasonsText);
    if (
      !unsafeReasons ||
      Array.isArray(unsafeReasons) ||
      typeof unsafeReasons !== "object" ||
      Object.values(unsafeReasons).some((reason) => typeof reason !== "string")
    ) {
      throw new Error("Invalid unsafe-site reasons data");
    }
    const allUrls = [];
    const starredUrls = [];
    const fmhyResourceMap = {};
    guides.forEach((markdown, index) => {
      allUrls.push(...parser.extractUrlsFromMarkdown(markdown));
      starredUrls.push(...parser.extractStarredUrlsFromMarkdown(markdown));
      const name = new URL(config.safeListURLs[index]).pathname
        .split("/")
        .pop()
        .replace(/\.md$/, "");
      const guideMap = parser.extractFmhyResourceMap(
        markdown,
        `https://fmhy.net/${name}`,
      );
      for (const [url, guide] of Object.entries(guideMap)) {
        const normalized = resources.normalizeResourceUrl(url);
        if (normalized) fmhyResourceMap[normalized] = guide;
      }
    });
    const uniqueResources = (urls) => [
      ...new Set(urls.map(resources.normalizeResourceUrl).filter(Boolean)),
    ];
    const unsafeSites = resources.extractUrlsFromFilterList(unsafeText);
    const potentiallyUnsafeSites = resources.extractUrlsFromFilterList(
      potentiallyUnsafeText,
    );
    const fmhySites = resources.extractUrlsFromFilterList(fmhyText);
    const safeSiteList = uniqueResources(allUrls);
    const starredSites = uniqueResources(starredUrls);
    return {
      unsafeSites,
      potentiallyUnsafeSites,
      fmhySites,
      unsafeReasons,
      safeSiteList,
      starredSites,
      fmhyResourceMap,
      resourceIdentityVersion: config.resourceIdentityVersion,
      unsafeDomainList: resources.extractUniqueHostnamesFromUrls(unsafeSites),
      safeDomainList: resources.extractUniqueHostnamesFromUrls(safeSiteList),
      unsafeFilterCount: unsafeSites.length,
      potentiallyUnsafeFilterCount: potentiallyUnsafeSites.length,
      fmhyFilterCount: fmhySites.length,
      safeSiteCount: safeSiteList.length,
      starredSiteCount: starredSites.length,
      lastUpdated: new Date().toISOString(),
    };
  }

  function refresh() {
    // Concurrent popup, startup and alarm requests share one complete refresh.
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const next = await download();
        const nextIndexes = compile(next);
        await storage.set(next);
        snapshot = next;
        indexes = nextIndexes;
        noteCache.clear();
        await onUpdated();
      })().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  async function initialize() {
    await SafeGuard.settings.initialize(storage);
    await loadOverrides();
    const stored = await storage.get(cacheKeys);
    const currentIdentity =
      stored.resourceIdentityVersion === config.resourceIdentityVersion;
    apply(
      currentIdentity
        ? stored
        : {
            ...stored,
            safeSiteList: [],
            starredSites: [],
            fmhyResourceMap: {},
          },
    );
    // Older versions did not persist the compact indexes used by content scripts.
    await storage.set({
      unsafeDomainList: resources.extractUniqueHostnamesFromUrls(
        snapshot.unsafeSites || [],
      ),
      safeDomainList: resources.extractUniqueHostnamesFromUrls(
        snapshot.safeSiteList || [],
      ),
    });
    const missingLists = cacheKeys.some((key) => stored[key] === undefined);
    const legacyAnchors = Object.values(stored.fmhyResourceMap || {}).some(
      (url) => url.includes("#-"),
    );
    if (
      !currentIdentity ||
      missingLists ||
      legacyAnchors ||
      (await SafeGuard.settings.shouldUpdate(storage))
    ) {
      try {
        await refresh();
      } catch (error) {
        // Keep the last usable snapshot when starting offline.
        console.error(
          "Could not refresh FMHY data; using cached lists:",
          error,
        );
      }
    }
  }

  function getReasonForDomain(hostname) {
    const reasons = snapshot.unsafeReasons || {};
    const domain = normalizeDomain(hostname);
    return reasons[domain] || reasons[`www.${domain}`] || null;
  }

  function getReasonForUrl(url) {
    try {
      const parsed = new URL(url);
      const key =
        normalizeDomain(parsed.hostname) +
        parsed.pathname.replace(/\/+$/, "").toLowerCase();
      let matchedKey = "";
      for (const candidate of Object.keys(snapshot.unsafeReasons || {})) {
        if (
          candidate.includes("/") &&
          candidate.length > matchedKey.length &&
          (key === candidate || key.startsWith(`${candidate}/`))
        )
          matchedKey = candidate;
      }
      return matchedKey ? snapshot.unsafeReasons[matchedKey] : null;
    } catch {
      return null;
    }
  }

  function classify(url) {
    const noData = { status: "no_data", matchedUrl: null };
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return noData;
    const normalizedUrl = resources.normalizeUrl(url);
    const resourceUrl = resources.normalizeResourceUrl(url);
    if (!normalizedUrl || !resourceUrl) return noData;
    const domain = new URL(normalizedUrl).hostname;
    const result = (status, matchedUrl = normalizedUrl) => ({
      status,
      matchedUrl,
    });
    if (trusted.has(domain)) return result("safe");
    if (untrusted.has(domain)) return result("unsafe");
    for (const [regex, status] of [
      [indexes.unsafe, "unsafe"],
      [indexes.potentiallyUnsafe, "potentially_unsafe"],
      [indexes.fmhy, "fmhy"],
    ]) {
      if (regex.test(normalizedUrl)) return result(status);
    }
    for (const [index, status] of [
      [indexes.starred, "starred"],
      [indexes.safe, "safe"],
      [fallbackStarred, "starred"],
      [fallbackSafe, "safe"],
    ]) {
      const match = resources.findMatchingListedResource(resourceUrl, index);
      if (match) return result(status, match);
    }
    if (!resources.isSharedResourceHost(domain)) {
      if (indexes.unsafeHosts.test(domain))
        return result("unsafe", `https://${domain}`);
      if (indexes.potentiallyUnsafeHosts.test(domain))
        return result("potentially_unsafe", `https://${domain}`);
    }
    return getReasonForUrl(url) ? result("unsafe") : noData;
  }

  function getSiteStatus(url) {
    const result = classify(url);
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return result;
    try {
      const domain = new URL(url).hostname;
      return {
        ...result,
        fmhyUrl: result.matchedUrl
          ? snapshot.fmhyResourceMap?.[
              resources.normalizeResourceUrl(result.matchedUrl)
            ] || null
          : null,
        reason: ["unsafe", "potentially_unsafe"].includes(result.status)
          ? getReasonForUrl(url) || getReasonForDomain(domain)
          : null,
        password: metadata.getPasswordForDomain(domain, url),
        inviteCode: metadata.getInviteCodeForDomain(domain),
      };
    } catch {
      return result;
    }
  }

  async function getNoteForSite(url) {
    let slug;
    try {
      slug = metadata.getNoteSlugForDomain(new URL(url).hostname);
    } catch {
      return { note: null };
    }
    if (!slug) return { note: null };
    if (!noteCache.has(slug)) {
      const pending = fetchText(`${config.notesBaseURL}${slug}.md`).catch(
        (error) => {
          noteCache.delete(slug);
          throw error;
        },
      );
      noteCache.set(slug, pending);
    }
    return { note: await noteCache.get(slug), slug };
  }

  return { initialize, refresh, loadOverrides, getSiteStatus, getNoteForSite };
};
