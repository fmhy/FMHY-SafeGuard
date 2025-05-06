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

// Timers for periodic checking
let reprocessTimer = null;
let braveSearchInterval = null;
let braveScrollTimer = null;
let braveSearchBadgeInterval = null;

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
  
  // Special handling for Brave Search - continuously recheck and re-add badges/highlighting for all site types
  if (currentDomain.includes("brave")) {
    // Track domains we've processed to avoid repetitive work
    const braveProcessedDomains = new Set();
    
    // Set up a more frequent interval specifically for Brave Search
    braveSearchBadgeInterval = setInterval(() => {
      // Process all links in Brave Search results
      document.querySelectorAll('a[href]').forEach(link => {
        try {
          if (!link.href || link.href.startsWith('javascript:') || link.href.startsWith('#')) {
            return;
          }
          
          const linkDomain = normalizeDomain(new URL(link.href).hostname);
          
          // Skip internal Brave links
          if (linkDomain.includes('brave.com')) {
            return;
          }
          
          // Always check all links, even if we've seen them before
          // This ensures styling is reapplied if Brave removes it
          
          // CASE 1: Unsafe sites (user untrusted or in unsafe list)
          if (userUntrusted.has(linkDomain) || 
              (!userTrusted.has(linkDomain) && unsafeDomains.has(linkDomain))) {
            
            // Mark as unsafe
            link.setAttribute('data-fmhy-unsafe', 'true');
            
            // Apply highlighting with !important to ensure it's not overridden
            link.style.setProperty('text-shadow', `0 0 4px ${settings.untrustedColor}`, 'important');
            link.style.setProperty('font-weight', 'bold', 'important');
            
            // Force style recalculation by toggling a property
            link.style.display = 'inline';
            link.style.display = '';
            
            // Also apply a class for redundancy
            link.classList.add('fmhy-highlighted-unsafe');
            
            // Add badge for unsafe sites
            const resultContainer = link.closest('article') || 
                                  link.closest('li') || 
                                  link.closest('.snippet') || 
                                  findParentByTag(link, 5, ['ARTICLE', 'LI', 'DIV']);
            
            if (resultContainer) {
              const siteDiv = resultContainer.querySelector('div[class^="site svelte-"]');
              
              if (siteDiv && !siteDiv.querySelector('.fmhy-unsafe-badge')) {
                const badge = document.createElement('span');
                badge.className = 'fmhy-unsafe-badge';
                badge.innerHTML = '<span style="display: inline-block; font-size: 14px;">⚠️</span> FMHY Unsafe Site';
                badge.dataset.domain = linkDomain;
                siteDiv.appendChild(badge);
              }
            }
          }
          // CASE 2: Safe sites (user trusted or in safe list)
          else if (userTrusted.has(linkDomain) || safeDomains.has(linkDomain)) {
            // Mark as safe
            link.setAttribute('data-fmhy-safe', 'true');
            
            // Only add highlighting if the setting is enabled
            if (settings.highlightTrusted) {
              link.style.setProperty('text-shadow', `0 0 4px ${settings.trustedColor}`, 'important');
              link.style.setProperty('font-weight', 'bold', 'important');
            }
          }
        } catch (e) {}
      });
    }, 50); // Check more frequently to ensure styling persists
  }

  const observer = new MutationObserver((mutations) => {
    let needsReprocess = false;
    
    for (const mutation of mutations) {
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
        // Instead of full reprocessing, just scan for unprocessed links
        document
          .querySelectorAll("a[href]:not(.fmhy-processed)")
          .forEach((link) => processLink(link, currentDomain));
      }, 100);
    }
  });

  // Watch for both childList and attributes changes, and subtree modifications
  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    attributes: true,
    attributeFilter: ['href']
  });
}

// Process a single link
function processLink(link, currentDomain) {
  // Skip if already processed
  if (processedLinks.has(link)) return;
  processedLinks.add(link);
  
  // Add a class to mark as processed for easier detection
  link.classList.add("fmhy-processed");

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
  const currentDomain = normalizeDomain(window.location.hostname);
  
  // Special handling for Brave Search - use original highlighting style
  if (currentDomain.includes("brave")) {
    try {
      // Mark the link with attribute for CSS styling
      link.setAttribute('data-fmhy-unsafe', 'true');
      
      // Use the original highlighting approach with text shadow
      link.style.setProperty('text-shadow', `0 0 4px ${settings.untrustedColor}`, 'important');
      link.style.setProperty('font-weight', 'bold', 'important');
      
      // Add CSS for the badge styling only
      if (!document.getElementById('fmhy-brave-style')) {
        const style = document.createElement('style');
        style.id = 'fmhy-brave-style';
        style.textContent = `
          a[data-fmhy-unsafe="true"] {
            text-shadow: 0 0 4px ${settings.untrustedColor} !important;
            font-weight: bold !important;
          }
          
          .fmhy-unsafe-badge {
            display: inline-block !important;
            color: #ffffff !important;
            background-color: #ff0000 !important;
            border-radius: 4px !important;
            padding: 0px 5px !important;
            font-size: 12px !important;
            font-weight: bold !important;
            white-space: nowrap !important;
            min-width: 95px !important;
            width: fit-content !important;
          }
        `;
        document.head.appendChild(style);
      }
      
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
          badge.innerHTML = '<span style="display: inline-block; font-size: 14px;">⚠️</span> FMHY Unsafe Site';
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
  badge.innerHTML = '<span style="display: inline-block; font-size: 14px;">⚠️</span> FMHY Unsafe Site';
  
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
      // Note: WeakSet doesn't support clear(), create a new instance instead
      processedLinks = new WeakSet();
      processedDomains.clear();
      highlightCountTrusted.clear();
      highlightCountUntrusted.clear();
      
      // Clear any existing Brave Search interval and restart the observer
      if (braveSearchBadgeInterval) {
        clearInterval(braveSearchBadgeInterval);
        braveSearchBadgeInterval = null;
      }
      
      // Restart the processing
      processPage();
      setupObserver();
    });
}

// Clean up timers when the page is unloaded
window.addEventListener('unload', () => {
  if (braveSearchBadgeInterval) clearInterval(braveSearchBadgeInterval);
  if (braveSearchInterval) clearInterval(braveSearchInterval);
  if (braveScrollTimer) clearTimeout(braveScrollTimer);
  if (reprocessTimer) clearTimeout(reprocessTimer);
});

// Start the script
init();
