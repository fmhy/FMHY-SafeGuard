// Loaded as a classic script in both browser workers and extension pages.
globalThis.SafeGuard ||= {};
SafeGuard.resources = (() => {
  "use strict";
  const { sharedResourceHosts, searchEngines } = SafeGuard.config;
  function normalizeUrl(url) {
    if (!url) {
      console.warn("Received null or undefined URL.");
      return null;
    }

    try {
      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }

      const urlObj = new URL(url);

      // Remove 'www.' prefix consistently
      if (urlObj.hostname.startsWith("www.")) {
        urlObj.hostname = urlObj.hostname.substring(4);
      }

      // Clear search parameters and hash
      urlObj.search = "";
      urlObj.hash = "";

      // Remove trailing slash consistently
      let normalized = urlObj.href.replace(/\/+$/, "");

      return normalized;
    } catch (error) {
      console.warn(`Invalid URL skipped: ${url} - ${error.message}`);
      return null;
    }
  }

  function normalizeResourceUrl(url) {
    if (!url) {
      console.warn("Received null or undefined resource URL.");
      return null;
    }

    try {
      const source = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const urlObj = new URL(source);

      if (urlObj.hostname.startsWith("www.")) {
        urlObj.hostname = urlObj.hostname.substring(4);
      }

      const normalizedPath = urlObj.pathname.replace(/\/+$/, "");
      urlObj.pathname = normalizedPath || "/";

      const normalized = urlObj.href;
      return urlObj.search || urlObj.hash
        ? normalized
        : normalized.replace(/\/+$/, "");
    } catch (error) {
      console.warn(`Invalid resource URL skipped: ${url} - ${error.message}`);
      return null;
    }
  }

  function isSharedResourceHost(hostname) {
    const domain = hostname.replace(/^www\./, "").toLowerCase();
    for (const host of sharedResourceHosts) {
      if (domain === host || domain.endsWith(`.${host}`)) return true;
    }
    return false;
  }

  function urlMatchesListedResource(currentUrl, listedUrl) {
    const normalizedCurrent = normalizeResourceUrl(currentUrl);
    const normalizedListed = normalizeResourceUrl(listedUrl);
    if (!normalizedCurrent || !normalizedListed) return false;

    const current = new URL(normalizedCurrent);
    const listed = new URL(normalizedListed);
    const currentHost = current.hostname.replace(/^www\./, "").toLowerCase();
    const listedHost = listed.hostname.replace(/^www\./, "").toLowerCase();
    const sharedHost =
      isSharedResourceHost(currentHost) || isSharedResourceHost(listedHost);
    const hostMatches = sharedHost
      ? currentHost === listedHost
      : currentHost === listedHost || currentHost.endsWith(`.${listedHost}`);
    if (!hostMatches) return false;

    const currentPath = current.pathname.replace(/\/+$/, "").toLowerCase();
    const listedPath = listed.pathname.replace(/\/+$/, "").toLowerCase();
    const currentGreasyForkScript = currentPath.match(
      /^\/(?:[^/]+\/)?scripts\/(\d+)/,
    );
    const listedGreasyForkScript = listedPath.match(
      /^\/(?:[^/]+\/)?scripts\/(\d+)/,
    );
    if (
      currentHost === "greasyfork.org" &&
      listedHost === "greasyfork.org" &&
      currentGreasyForkScript &&
      listedGreasyForkScript &&
      currentGreasyForkScript?.[1] === listedGreasyForkScript?.[1]
    ) {
      return true;
    }
    const isGistPlatformPage =
      currentHost === "gist.github.com" &&
      ["/starred", "/discover"].includes(currentPath) &&
      listedHost === "gist.github.com" &&
      !listedPath;
    if (isGistPlatformPage) return true;
    const isEnteAuthRedirect =
      currentHost === "auth.ente.com" &&
      currentPath === "/login" &&
      listedHost === "ente.com" &&
      listedPath === "/auth";
    if (isEnteAuthRedirect) return true;
    const pathMatches = !listedPath
      ? !sharedHost || !currentPath
      : currentPath === listedPath || currentPath.startsWith(`${listedPath}/`);
    if (!pathMatches) return false;

    const queryIdentifiesResource = ["youtube.com", "archive.org"].includes(
      listedHost,
    );
    if (queryIdentifiesResource) {
      for (const [key, value] of listed.searchParams) {
        if (current.searchParams.get(key) !== value) return false;
      }
    }
    const fragmentIdentifiesResource = [
      "rentry.co",
      "rentry.org",
      "matrix.to",
    ].includes(listedHost);
    if (
      fragmentIdentifiesResource &&
      listed.hash &&
      current.hash.toLowerCase() !== listed.hash.toLowerCase()
    ) {
      return false;
    }
    return true;
  }

  function buildResourceIndex(urls) {
    const index = new Map();

    for (const url of urls) {
      const normalizedUrl = normalizeResourceUrl(url);
      if (!normalizedUrl) continue;

      const parsedUrl = new URL(normalizedUrl);
      const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
      const firstPathSegment =
        parsedUrl.pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
      const resources = index.get(hostname) || {
        all: [],
        roots: [],
        byFirstPathSegment: new Map(),
      };

      resources.all.push(normalizedUrl);
      if (!firstPathSegment) {
        resources.roots.push(normalizedUrl);
      } else {
        const pathResources =
          resources.byFirstPathSegment.get(firstPathSegment) || [];
        pathResources.push(normalizedUrl);
        resources.byFirstPathSegment.set(firstPathSegment, pathResources);
      }
      index.set(hostname, resources);
    }

    return index;
  }

  function findMatchingListedResource(currentUrl, resourceIndex) {
    const normalizedUrl = normalizeResourceUrl(currentUrl);
    if (!normalizedUrl) return undefined;

    const parsedUrl = new URL(normalizedUrl);
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    const firstPathSegment =
      parsedUrl.pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
    const candidateHosts = [hostname];

    // Normal sites can inherit a resource classification from a listed parent
    // domain. Shared platforms must remain scoped to their exact hostname.
    if (!isSharedResourceHost(hostname)) {
      const labels = hostname.split(".");
      for (let index = 1; index < labels.length - 1; index += 1) {
        candidateHosts.push(labels.slice(index).join("."));
      }
    }

    for (const candidateHost of candidateHosts) {
      const indexedResources = resourceIndex.get(candidateHost);
      if (!indexedResources) continue;

      let resources;
      if (Array.isArray(indexedResources)) {
        resources = indexedResources;
      } else if (isSharedResourceHost(candidateHost)) {
        const pathResources = firstPathSegment
          ? indexedResources.byFirstPathSegment.get(firstPathSegment) || []
          : [];
        resources = firstPathSegment
          ? pathResources.concat(indexedResources.roots)
          : indexedResources.roots;
      } else {
        resources = indexedResources.all;
      }

      const match = resources.find((listedUrl) =>
        urlMatchesListedResource(normalizedUrl, listedUrl),
      );
      if (match) return match;
    }

    return undefined;
  }

  function extractRootUrl(url) {
    if (!url) {
      console.warn("Received null or undefined URL for root extraction.");
      return null;
    }

    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch (error) {
      console.warn(`Failed to extract root URL from: ${url}`);
      return null;
    }
  }

  function generateRegexFromList(list) {
    if (!list.length) return /(?!)/;

    const boundedPatterns = list.map((entry) => {
      const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return entry.includes("://")
        ? `^${escaped}(?=$|[/?#])`
        : `(?:^|\\.)${escaped}$`;
    });
    return new RegExp(`(?:${boundedPatterns.join("|")})`, "i");
  }

  function extractUrlsFromFilterList(text) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("!"))
      .map((line) => normalizeUrl(line))
      .filter((url) => url !== null);
  }

  // Extract hostnames from a list of URLs for domain-level matching
  // Only extract hostnames from domain-only URLs (no significant path)
  // URLs with paths like rentry.co/FMHY should NOT match at domain level
  function extractHostnamesFromUrls(urls) {
    return urls
      .map((url) => {
        try {
          const urlObj = new URL(url);
          // Only include hostname if the URL has no significant path
          // (path is empty, "/", or just trailing slash)
          const path = urlObj.pathname;
          if (path === "" || path === "/") {
            return urlObj.hostname;
          }
          return null; // Don't include hostnames from URLs with paths
        } catch (e) {
          // If not a valid URL, it's likely just a domain - include it
          return url;
        }
      })
      .filter((hostname) => hostname !== null);
  }

  function extractUniqueHostnamesFromUrls(urls) {
    const hostnames = new Set();

    for (const url of urls) {
      try {
        const source = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        const hostname = new URL(source).hostname
          .replace(/^www\./, "")
          .toLowerCase();
        if (hostname) hostnames.add(hostname);
      } catch (error) {
        // Ignore malformed entries; the URL lists are validated separately.
      }
    }

    return [...hostnames];
  }

  // Function to check if a URL is a search engine
  function isSearchEngine(url) {
    try {
      const urlObj = new URL(url);
      return searchEngines.some(
        (domain) =>
          urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain),
      );
    } catch (error) {
      console.error("Error checking search engine:", error);
      return false;
    }
  }

  return {
    normalizeUrl,
    normalizeResourceUrl,
    isSharedResourceHost,
    urlMatchesListedResource,
    buildResourceIndex,
    findMatchingListedResource,
    extractRootUrl,
    generateRegexFromList,
    extractUrlsFromFilterList,
    extractHostnamesFromUrls,
    extractUniqueHostnamesFromUrls,
    isSearchEngine,
  };
})();
