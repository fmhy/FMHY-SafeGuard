(() => {
  // FMHY SafeLink Guard - Content Script
  // Implements visual marking of safe/unsafe links similar to the userscript

  "use strict";

  // Cross-browser compatibility shim
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;
  const { normalizeDomain, highlightKeys } = SafeGuard.settings;
  const { searchEngines } = SafeGuard.config;
  const renderer = SafeGuard.createLinkRenderer(() => settings);
  const { highlightLink, addWarningBanner, ensureBraveStyles } = renderer;

  // Track processed elements to avoid reprocessing
  let processedLinks = new WeakMap();
  const processedDomains = new Set();
  const highlightCountTrusted = new Map();
  const highlightCountUntrusted = new Map();

  // Dynamic-page processing state
  let reprocessTimer = null;
  let pageObserver = null;

  // Default settings
  let settings = { ...SafeGuard.settings.defaults };

  // Domain lists
  let unsafeDomains = new Set();
  let safeDomains = new Set();
  let userTrusted = new Set();
  let userUntrusted = new Set();
  let unsafeReasons = {};

  // FMHY domains to exclude
  const fmhyDomains = [
    "fmhy.net",
    "fmhy.pages.dev",
    "fmhy.lol",
    "fmhy.vercel.app",
    "fmhy.xyz",
  ];

  // Main initialization
  // Check if current site is a search engine where we should apply highlighting
  function isSupportedSite(domain) {
    // Don't highlight on FMHY sites
    if (fmhyDomains.some((fmhyDomain) => domain.endsWith(fmhyDomain))) {
      return false;
    }

    // Only highlight on search engines
    return searchEngines.some((searchDomain) => domain.includes(searchDomain));
  }

  // Load user settings from storage
  async function loadSettings() {
    settings = await SafeGuard.settings.read(browserAPI.storage.local);
    userTrusted = new Set(settings.userTrustedDomains.map(normalizeDomain));
    userUntrusted = new Set(settings.userUntrustedDomains.map(normalizeDomain));
  }

  // Load domain lists from extension storage
  async function loadDomainLists() {
    try {
      const compactData = await browserAPI.storage.local.get([
        "unsafeDomainList",
        "safeDomainList",
        "unsafeReasons",
      ]);
      let unsafeDomainList = Array.isArray(compactData.unsafeDomainList)
        ? compactData.unsafeDomainList
        : null;
      let safeDomainList = Array.isArray(compactData.safeDomainList)
        ? compactData.safeDomainList
        : null;

      // Preserve compatibility with data cached by older extension versions.
      const fallbackKeys = [];
      if (!unsafeDomainList) fallbackKeys.push("unsafeSites");
      if (!safeDomainList) fallbackKeys.push("safeSiteList");
      if (fallbackKeys.length > 0) {
        const fallbackData = await browserAPI.storage.local.get(fallbackKeys);
        if (!unsafeDomainList) {
          unsafeDomainList = extractDomainsFromUrls(fallbackData.unsafeSites);
        }
        if (!safeDomainList) {
          safeDomainList = extractDomainsFromUrls(fallbackData.safeSiteList);
        }
      }

      unsafeDomains = new Set(unsafeDomainList || []);
      safeDomains = new Set(safeDomainList || []);

      if (compactData.unsafeReasons) {
        unsafeReasons = compactData.unsafeReasons;
      }

      // Apply user overrides
      applyUserOverrides();
    } catch (error) {
      console.error("[FMHY SafeGuard] Error loading domain lists:", error);
    }
  }

  function extractDomainsFromUrls(urls) {
    const domains = new Set();

    for (const site of urls || []) {
      try {
        domains.add(normalizeDomain(new URL(site).hostname));
      } catch (error) {
        // Ignore malformed entries from legacy caches.
      }
    }

    return [...domains];
  }

  // Apply user trusted/untrusted overrides
  function applyUserOverrides() {
    userTrusted.forEach((domain) => {
      safeDomains.add(domain);
      unsafeDomains.delete(domain);
    });

    userUntrusted.forEach((domain) => {
      unsafeDomains.add(domain);
      safeDomains.delete(domain);
    });
  }

  // Process all links in the page
  function processPage() {
    const currentDomain = normalizeDomain(window.location.hostname);

    // Only process links on search engines and not on FMHY sites
    if (!isSupportedSite(currentDomain)) {
      return;
    }

    document
      .querySelectorAll("a[href]")
      .forEach((link) => processLink(link, currentDomain));
  }

  // Set up mutation observer to handle dynamically added content
  function setupObserver() {
    const currentDomain = normalizeDomain(window.location.hostname);
    pageObserver?.disconnect();
    pageObserver = null;

    // Skip setting up observer if not on a supported site
    if (!isSupportedSite(currentDomain)) {
      return;
    }

    if (currentDomain.includes("brave")) {
      ensureBraveStyles();
    }

    pageObserver = new MutationObserver((mutations) => {
      let needsReprocess = false;

      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target.tagName === "A") {
          processLink(mutation.target, currentDomain);
          continue;
        }

        // Check if existing badges were removed
        if (mutation.removedNodes && mutation.removedNodes.length) {
          for (const node of mutation.removedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (
                node.matches(".fmhy-unsafe-badge, .fmhy-badge-wrapper") ||
                node.querySelector(".fmhy-unsafe-badge")
              ) {
                needsReprocess = true;
                break;
              }
            }
          }
        }

        // Process added nodes
        if (mutation.addedNodes && mutation.addedNodes.length) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // If it's a link itself
              if (node.tagName === "A" && node.href) {
                processLink(node, currentDomain);
              }

              // Process any links inside the added node
              if (node.querySelectorAll) {
                node
                  .querySelectorAll("a[href]")
                  .forEach((link) => processLink(link, currentDomain));
              }
            }
          }
        }
      }

      // If badges were removed, reprocess the page
      if (needsReprocess) {
        // Use setTimeout to avoid too frequent reprocessing
        clearTimeout(reprocessTimer);
        reprocessTimer = setTimeout(refreshPage, 100);
      }
    });

    // Watch for both childList and attributes changes, and subtree modifications
    pageObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"],
    });
  }

  // Process a single link
  function processLink(link, currentDomain) {
    // Skip unchanged links while allowing search engines to reuse an anchor for
    // a different result.
    if (processedLinks.get(link) === link.href) return;
    renderer.clear(link);
    processedLinks.set(link, link.href);

    // Use an extension-owned data attribute to avoid colliding with site classes.
    link.setAttribute("data-fmhy-processed", "true");

    try {
      // Skip links without proper URLs
      if (
        !link.href ||
        link.href.startsWith("javascript:") ||
        link.href.startsWith("#")
      ) {
        return;
      }

      const linkDomain = normalizeDomain(new URL(link.href).hostname);

      // Skip if the current site is safe AND the link is internal
      if (
        (safeDomains.has(currentDomain) || userTrusted.has(currentDomain)) &&
        linkDomain === currentDomain
      ) {
        return;
      }

      // Handle untrusted links
      if (
        userUntrusted.has(linkDomain) ||
        (!userTrusted.has(linkDomain) && unsafeDomains.has(linkDomain))
      ) {
        if (currentDomain.includes("brave") && settings.highlightUntrusted) {
          link.setAttribute("data-fmhy-unsafe", "true");
          link.removeAttribute("data-fmhy-safe");
        }

        if (
          settings.highlightUntrusted &&
          getHighlightCount(highlightCountUntrusted, linkDomain) < 2
        ) {
          highlightLink(link, "untrusted");
          incrementHighlightCount(highlightCountUntrusted, linkDomain);
        }

        if (settings.showWarningBanners && !processedDomains.has(linkDomain)) {
          const reason = getReasonForDomain(linkDomain);
          addWarningBanner(link, reason);
          processedDomains.add(linkDomain);
        }
      }
      // Handle trusted links
      else if (userTrusted.has(linkDomain) || safeDomains.has(linkDomain)) {
        if (currentDomain.includes("brave") && settings.highlightTrusted) {
          link.setAttribute("data-fmhy-safe", "true");
          link.removeAttribute("data-fmhy-unsafe");
        }

        if (
          settings.highlightTrusted &&
          getHighlightCount(highlightCountTrusted, linkDomain) < 2
        ) {
          highlightLink(link, "trusted");
          incrementHighlightCount(highlightCountTrusted, linkDomain);
        }
      }
    } catch (error) {
      console.warn("[FMHY SafeGuard] Error processing link:", error);
    }
  }

  // Helper functions
  function getReasonForDomain(hostname) {
    const domain = hostname.replace(/^www\./, "").toLowerCase();
    // Try exact match first
    if (unsafeReasons[domain]) return unsafeReasons[domain];
    // Try with www prefix
    if (unsafeReasons["www." + domain]) return unsafeReasons["www." + domain];
    return null;
  }

  function getHighlightCount(map, domain) {
    return map.get(domain) || 0;
  }

  function incrementHighlightCount(map, domain) {
    if (map.size > 1000) map.clear(); // Reset if too large
    map.set(domain, getHighlightCount(map, domain) + 1);
  }

  // Settings and catalogue changes both invalidate the current decorations.
  const refreshKeys = new Set([
    ...highlightKeys,
    "unsafeDomainList",
    "safeDomainList",
    "unsafeReasons",
  ]);
  browserAPI.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      Object.keys(changes).some((key) => refreshKeys.has(key))
    )
      refreshPage();
  });
  browserAPI.runtime.onMessage.addListener((message) => {
    if (message.action === "processPage") processPage();
    if (
      message.action === "refreshSettings" ||
      message.type === "filterlistUpdated"
    )
      refreshPage();
  });

  let refreshing = false;
  let refreshRequested = false;
  async function refreshPage() {
    refreshRequested = true;
    if (refreshing) return;
    refreshing = true;
    try {
      do {
        refreshRequested = false;
        await loadSettings();
        await loadDomainLists();
      } while (refreshRequested);
      pageObserver?.disconnect();
      if (reprocessTimer) clearTimeout(reprocessTimer);
      renderer.clearAll();
      processedLinks = new WeakMap();
      processedDomains.clear();
      highlightCountTrusted.clear();
      highlightCountUntrusted.clear();
      processPage();
      setupObserver();
    } catch (error) {
      console.error("[FMHY SafeGuard] Error refreshing highlights:", error);
    } finally {
      refreshing = false;
    }
  }

  // Clean up dynamic-page work when the page is unloaded
  window.addEventListener("unload", () => {
    pageObserver?.disconnect();
    if (reprocessTimer) clearTimeout(reprocessTimer);
  });

  // Start the script
  refreshPage();
})();
