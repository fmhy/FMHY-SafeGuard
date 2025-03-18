// FMHY SafeLink Guard - Content Script
// Implements visual marking of safe/unsafe links similar to the userscript

"use strict";

// Cross-browser compatibility shim
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Track processed elements to avoid reprocessing
const processedLinks = new WeakSet();
const processedDomains = new Set();
const highlightCountTrusted = new Map();
const highlightCountUntrusted = new Map();

// Default settings
let settings = {
  highlightTrusted: true,
  highlightUntrusted: true,
  showWarningBanners: true,
  trustedColor: "#32cd32",
  untrustedColor: "#ff4444",
};

// Domain lists
let unsafeDomains = new Set();
let safeDomains = new Set();
let userTrusted = new Set();
let userUntrusted = new Set();

// Search engines where highlighting should be applied
const searchEngines = [
  "google.com",
  "google.", // Covers all Google country domains like google.co.uk, google.fr, etc.
  "bing.com",
  "duckduckgo.com",
  "librey.org",
  "4get.ca",
  "mojeek.com",
  "qwant.com",
  "swisscows.com",
  "yacy.net",
  "startpage.com",
  "search.brave.com",
  "ekoru.org",
  "gibiru.com",
  "searx.org",
  "searx.", // Covers all SearX instances
  "searxng.", // Covers all SearXNG instances
  "whoogle.", // Covers all Whoogle instances
  "metager.org",
  "ecosia.org",
  "yandex.com",
  "yandex.", // Covers all Yandex country domains
  "yahoo.com",
  "yahoo.", // Covers all Yahoo country domains
  "baidu.com",
  "naver.com",
  "seznam.cz",
];

// FMHY domains to exclude
const fmhyDomains = [
  "fmhy.net",
  "fmhy.pages.dev",
  "fmhy.lol",
  "fmhy.vercel.app",
  "fmhy.xyz",
];

// CSS for warning banners
const warningStyle = `
  background-color: #ff0000;
  color: #fff;
  padding: 2px 6px;
  font-weight: bold;
  border-radius: 4px;
  font-size: 12px;
  margin-left: 6px;
  z-index: 9999;
`;

// Main initialization
function init() {
  loadSettings()
    .then(() => loadDomainLists())
    .then(() => {
      processPage();
      setupObserver();
    })
    .catch((err) =>
      console.error("[FMHY SafeGuard] Error initializing content script:", err)
    );
}

// Check if current site is a search engine where we should apply highlighting
function isSupportedSite(domain) {
  // Don't highlight on FMHY sites
  if (fmhyDomains.some((fmhyDomain) => domain.endsWith(fmhyDomain))) {
    console.log(
      `[FMHY SafeGuard] Skipping highlighting on FMHY domain: ${domain}`
    );
    return false;
  }

  // Only highlight on search engines
  return searchEngines.some((searchDomain) => domain.includes(searchDomain));
}

// Load user settings from storage
async function loadSettings() {
  try {
    const data = await browserAPI.storage.local.get([
      "highlightTrusted",
      "highlightUntrusted",
      "showWarningBanners",
      "trustedColor",
      "untrustedColor",
      "userTrustedDomains",
      "userUntrustedDomains",
    ]);

    // Apply stored settings or use defaults
    settings.highlightTrusted =
      data.highlightTrusted !== undefined
        ? data.highlightTrusted
        : settings.highlightTrusted;
    settings.highlightUntrusted =
      data.highlightUntrusted !== undefined
        ? data.highlightUntrusted
        : settings.highlightUntrusted;
    settings.showWarningBanners =
      data.showWarningBanners !== undefined
        ? data.showWarningBanners
        : settings.showWarningBanners;

    if (data.trustedColor) settings.trustedColor = data.trustedColor;
    if (data.untrustedColor) settings.untrustedColor = data.untrustedColor;

    // Load user trusted/untrusted domains
    if (data.userTrustedDomains) {
      userTrusted = new Set(data.userTrustedDomains);
    }

    if (data.userUntrustedDomains) {
      userUntrusted = new Set(data.userUntrustedDomains);
    }

    console.log("[FMHY SafeGuard] Settings loaded:", settings);
  } catch (error) {
    console.error("[FMHY SafeGuard] Error loading settings:", error);
  }
}

// Load domain lists from extension storage
async function loadDomainLists() {
  try {
    const { unsafeSites, safeSiteList } = await browserAPI.storage.local.get([
      "unsafeSites",
      "safeSiteList",
    ]);

    if (unsafeSites && Array.isArray(unsafeSites)) {
      unsafeDomains = new Set(
        unsafeSites.map((site) => normalizeDomain(new URL(site).hostname))
      );
    }

    if (safeSiteList && Array.isArray(safeSiteList)) {
      safeDomains = new Set(
        safeSiteList.map((site) => normalizeDomain(new URL(site).hostname))
      );
    }

    // Apply user overrides
    applyUserOverrides();

    console.log(
      `[FMHY SafeGuard] Loaded ${unsafeDomains.size} unsafe domains and ${safeDomains.size} safe domains`
    );
  } catch (error) {
    console.error("[FMHY SafeGuard] Error loading domain lists:", error);
  }
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
    console.log(
      `[FMHY SafeGuard] Skipping highlighting on non-search engine: ${currentDomain}`
    );
    return;
  }

  console.log(
    `[FMHY SafeGuard] Processing links on search engine: ${currentDomain}`
  );
  document
    .querySelectorAll("a[href]")
    .forEach((link) => processLink(link, currentDomain));
}

// Set up mutation observer to handle dynamically added content
function setupObserver() {
  const currentDomain = normalizeDomain(window.location.hostname);

  // Skip setting up observer if not on a supported site
  if (!isSupportedSite(currentDomain)) {
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // If it's a link itself
          if (node.tagName === "A" && node.href) {
            processLink(node, currentDomain);
          }

          // Process any links inside the added node
          node
            .querySelectorAll("a[href]")
            .forEach((link) => processLink(link, currentDomain));
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// Process a single link
function processLink(link, currentDomain) {
  // Skip if already processed
  if (processedLinks.has(link)) return;
  processedLinks.add(link);

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
      if (
        settings.highlightUntrusted &&
        getHighlightCount(highlightCountUntrusted, linkDomain) < 2
      ) {
        highlightLink(link, "untrusted");
        incrementHighlightCount(highlightCountUntrusted, linkDomain);
      }

      if (settings.showWarningBanners && !processedDomains.has(linkDomain)) {
        addWarningBanner(link);
        processedDomains.add(linkDomain);
      }
    }
    // Handle trusted links
    else if (userTrusted.has(linkDomain) || safeDomains.has(linkDomain)) {
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

// Highlight a link based on its trustworthiness
function highlightLink(link, type) {
  const color =
    type === "trusted" ? settings.trustedColor : settings.untrustedColor;
  link.style.textShadow = `0 0 4px ${color}`;
  link.style.fontWeight = "bold";
}

// Add a warning banner after an unsafe link
function addWarningBanner(link) {
  const warning = document.createElement("span");
  warning.textContent = "⚠️ FMHY Unsafe Site";
  warning.style = warningStyle;
  link.after(warning);
}

// Helper functions
function normalizeDomain(hostname) {
  return hostname.replace(/^www\./, "").toLowerCase();
}

function getHighlightCount(map, domain) {
  return map.get(domain) || 0;
}

function incrementHighlightCount(map, domain) {
  if (map.size > 1000) map.clear(); // Reset if too large
  map.set(domain, getHighlightCount(map, domain) + 1);
}

// Listen for settings changes
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    let settingsChanged = false;

    for (let key in changes) {
      if (
        key === "highlightTrusted" ||
        key === "highlightUntrusted" ||
        key === "showWarningBanners" ||
        key === "trustedColor" ||
        key === "untrustedColor" ||
        key === "userTrustedDomains" ||
        key === "userUntrustedDomains"
      ) {
        settingsChanged = true;
      }
    }

    if (settingsChanged) {
      refreshPage();
    }
  }
});

// Handle messages from background script
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "refreshSettings") {
    refreshPage();
    sendResponse({ status: "success" });
    return true;
  }
  return false;
});

// Function to refresh page highlighting
function refreshPage() {
  // Reload settings and reprocess the page
  loadSettings()
    .then(() => loadDomainLists())
    .then(() => {
      // Clear processed state and reprocess
      processedLinks.clear();
      processedDomains.clear();
      highlightCountTrusted.clear();
      highlightCountUntrusted.clear();
      processPage();
    });
}

// Start the script
init();
