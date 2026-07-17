// FMHY SafeLink Guard - Content Script
// Implements visual marking of safe/unsafe links similar to the userscript

"use strict";

// Cross-browser compatibility shim
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Track processed elements to avoid reprocessing
let processedLinks = new WeakMap();
const processedDomains = new Set();
const highlightCountTrusted = new Map();
const highlightCountUntrusted = new Map();

// Dynamic-page processing state
let reprocessTimer = null;
let pageObserver = null;

// Helper function to find a parent element by tag name
function findParentByTag(element, maxDepth, tagNames) {
  let parent = element;
  let depth = 0;
  while (depth < maxDepth && parent.parentElement) {
    parent = parent.parentElement;
    depth++;
    if (tagNames.includes(parent.tagName)) {
      return parent;
    }
  }
  return null;
}

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
let unsafeReasons = {};

function setUnsafeBadgeContent(badge, reason) {
  badge.replaceChildren();
  const icon = document.createElement("span");
  icon.style.cssText = "display: inline-block; font-size: 14px;";
  icon.textContent = "⚠️";
  badge.append(
    icon,
    document.createTextNode(
      ` FMHY Unsafe Site${reason ? `: ${reason}` : ""}`,
    ),
  );
}

// Search engines where highlighting should be applied
const searchEngines = [
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "kagi.com",
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
  display: inline-block;
  transform: rotate(0deg) !important;
  transform-origin: center center;
  vertical-align: middle;
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

    console.log(
      `[FMHY SafeGuard] Loaded ${unsafeDomains.size} unsafe domains and ${safeDomains.size} safe domains`
    );
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

function ensureBraveStyles() {
  let style = document.getElementById("fmhy-brave-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "fmhy-brave-style";
    document.head.appendChild(style);
  }

  style.textContent = `
    a[data-fmhy-unsafe="true"] {
      text-shadow: 0 0 4px ${settings.untrustedColor} !important;
      font-weight: bold !important;
    }

    a[data-fmhy-safe="true"] {
      text-shadow: 0 0 4px ${settings.trustedColor} !important;
      font-weight: bold !important;
    }

    .fmhy-unsafe-badge {
      display: inline-block !important;
      color: #ffffff !important;
      background-color: #ff0000 !important;
      border-radius: 4px !important;
      padding: 0 5px !important;
      font-size: 12px !important;
      font-weight: bold !important;
      white-space: nowrap !important;
      min-width: 95px !important;
      width: fit-content !important;
    }
  `;
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
      if (
        mutation.type === "attributes" &&
        mutation.target.tagName === "A"
      ) {
        processLink(mutation.target, currentDomain);
        continue;
      }

      // Check if existing badges were removed
      if (mutation.removedNodes && mutation.removedNodes.length) {
        for (const node of mutation.removedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList &&
              (node.classList.contains('fmhy-badge-wrapper') ||
                node.textContent && node.textContent.includes('FMHY Unsafe Site'))) {
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
      reprocessTimer = setTimeout(() => {
        document.querySelectorAll("a[href]").forEach((link) => {
          processedLinks.delete(link);
          processLink(link, currentDomain);
        });
      }, 100);
    }
  });

  // Watch for both childList and attributes changes, and subtree modifications
  pageObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href']
  });
}

// Process a single link
function processLink(link, currentDomain) {
  // Skip unchanged links while allowing search engines to reuse an anchor for
  // a different result.
  if (processedLinks.get(link) === link.href) return;
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
      if (currentDomain.includes("brave")) {
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
      if (currentDomain.includes("brave")) {
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

// Highlight a link based on its trustworthiness
function highlightLink(link, type) {
  const color =
    type === "trusted" ? settings.trustedColor : settings.untrustedColor;
  link.style.textShadow = `0 0 4px ${color}`;
  link.style.fontWeight = "bold";
}

// Add a warning banner after an unsafe link
function addWarningBanner(link, reason = null) {
  const currentDomain = normalizeDomain(window.location.hostname);

  // Special handling for Brave Search - use original highlighting style
  if (currentDomain.includes("brave")) {
    try {
      // Mark the link with attribute for CSS styling
      link.setAttribute('data-fmhy-unsafe', 'true');

      // Find the closest search result container
      let resultContainer = link.closest('article') || link.closest('li') || link.closest('.snippet');

      if (!resultContainer) {
        // If no direct container, traverse up a few levels
        resultContainer = link;
        let depth = 0;
        while (depth < 5 && resultContainer.parentElement) {
          resultContainer = resultContainer.parentElement;
          depth++;
          if (resultContainer.tagName === 'ARTICLE' || resultContainer.tagName === 'LI') {
            break;
          }
        }
      }

      // Look for the site div specifically (what the user requested)
      const siteDiv = resultContainer.querySelector('div[class^="site svelte-"]');

      if (siteDiv) {
        // Check if we already added a badge to this site div
        if (!siteDiv.querySelector('.fmhy-unsafe-badge')) {
          const badge = document.createElement('span');
          badge.className = 'fmhy-unsafe-badge';
          setUnsafeBadgeContent(badge, reason);
          siteDiv.appendChild(badge);
        }
      }

      return; // Exit early
    } catch (e) {
      console.error("[FMHY SafeGuard] Error styling Brave Search link:", e);
    }
  }

  // For all other search engines, create a badge element
  const badge = document.createElement("span");
  Object.assign(badge.style, {
    backgroundColor: "#ff0000",
    color: "#fff",
    padding: "2px 6px",
    fontWeight: "bold",
    borderRadius: "4px",
    fontSize: "12px",
    display: "inline-block",
    transform: "rotate(180deg) scaleX(-1) !important",
    WebkitTransform: "rotate(180deg) scaleX(-1) !important",
    msTransform: "rotate(180deg) scaleX(-1) !important",
    position: "relative",
    zIndex: "9999"
  });

  // Add the warning icon and text
  setUnsafeBadgeContent(badge, reason);

  // Google-specific margin adjustment
  if (currentDomain.includes("google")) {
    badge.style.margin = "0 15px";
  }

  // Different insertion strategy for Google vs other engines
  if (currentDomain.includes("google")) {
    // For Google, find a suitable container
    let container = link;
    let parent = link.parentElement;

    // Look for a suitable container
    for (let i = 0; i < 3 && parent; i++) {
      if (parent.tagName === "DIV" || parent.tagName === "LI" ||
        parent.querySelector("cite") || parent.querySelector(".link")) {
        container = parent;
        break;
      }
      parent = parent.parentElement;
    }

    // Try to place after cite element if it exists
    const citeElement = container.querySelector("cite");
    if (citeElement) {
      citeElement.after(badge);
    } else {
      // Insert after the title
      const resultTitle = container.querySelector("h3") || container.querySelector("a[href]") || link;
      if (resultTitle.nextSibling) {
        container.insertBefore(badge, resultTitle.nextSibling);
      } else {
        container.appendChild(badge);
      }
    }
  } else {
    // For other search engines, use the simple approach
    link.after(badge);
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

// Listen for messages from background script
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "processPage") {
    processPage();
  }
});

// Function to refresh page highlighting
function refreshPage() {
  // Reload settings and reprocess the page
  loadSettings()
    .then(() => loadDomainLists())
    .then(() => {
      // Clear processed state and reprocess
      // WeakMap does not support clear(), so create a fresh instance.
      processedLinks = new WeakMap();
      processedDomains.clear();
      highlightCountTrusted.clear();
      highlightCountUntrusted.clear();

      // Restart processing with a single fresh observer.
      processPage();
      setupObserver();
    });
}

// Clean up dynamic-page work when the page is unloaded
window.addEventListener('unload', () => {
  pageObserver?.disconnect();
  if (reprocessTimer) clearTimeout(reprocessTimer);
});

// Start the script
init();
