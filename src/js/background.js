// Cross-browser compatibility shim
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// URLs and Constants
const filterListURLUnsafe =
  "https://raw.githubusercontent.com/fmhy/FMHYFilterlist/refs/heads/main/sitelist.txt";
const filterListURLPotentiallyUnsafe =
  "https://raw.githubusercontent.com/fmhy/FMHYFilterlist/refs/heads/main/sitelist-plus.txt";
const safeListURLs = [
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/privacy.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/ai.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/mobile.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/audio.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/developer-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/downloading.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/educational.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/file-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/gaming-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/gaming.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/image-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/internet-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/linux-macos.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/misc.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/non-english.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/nsfwpiracy.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/reading.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/social-media-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/storage.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/system-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/text-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/torrenting.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/video-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/video.md",
];
const fmhyFilterListURL =
  "https://raw.githubusercontent.com/fmhy/FMHY-SafeGuard/refs/heads/main/fmhy-filterlist.txt";

// State Variables
let unsafeSitesRegex = null;
let potentiallyUnsafeSitesRegex = null;
let fmhySitesRegex = null;
let safeSites = [];
let starredSites = [];
const approvedUrls = new Map(); // Map to store approved URLs per tab

// List of search engines to check against
const searchEngines = [
  "google.com",
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

// Helper Functions
function extractUrlsFromMarkdown(markdown) {
  const urlRegex = /https?:\/\/[^\s)]+/g;
  return markdown.match(urlRegex) || [];
}

function extractUrlsFromBookmarks(html) {
  console.log("Extracting URLs from bookmarks HTML...");

  // Try multiple regex patterns to handle different bookmark formats
  const patterns = [
    /<A HREF="(https?:\/\/[^\s"]+)"/gi, // Standard format
    /<a href="(https?:\/\/[^\s"]+)"/gi, // Lowercase format
    /href=["'](https?:\/\/[^\s"']+)["']/gi, // Generic href format
    /<DT><A[^>]*HREF="(https?:\/\/[^\s"]+)"[^>]*>([^<]+)/gi, // Full bookmark format
  ];

  const allUrls = [];

  // Try each pattern
  for (const pattern of patterns) {
    let matches;
    while ((matches = pattern.exec(html)) !== null) {
      if (matches[1]) {
        allUrls.push(matches[1]);
      }
    }
  }

  console.log(`Extracted ${allUrls.length} URLs from bookmarks HTML`);
  return allUrls;
}

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
  const escapedList = list.map((domain) =>
    domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  return new RegExp(`(${escapedList.join("|")})`, "i");
}

function extractUrlsFromFilterList(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("!"))
    .map((line) => normalizeUrl(line))
    .filter((url) => url !== null);
}

// Function to check if a URL is a search engine
function isSearchEngine(url) {
  try {
    const urlObj = new URL(url);
    return searchEngines.some(
      (domain) =>
        urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain)
    );
  } catch (error) {
    console.error("Error checking search engine:", error);
    return false;
  }
}

// Fetch and Update Functions
async function fetchFilterLists() {
  console.log("Fetching filter lists...");
  try {
    const [unsafeResponse, potentiallyUnsafeResponse, fmhyResponse] =
      await Promise.all([
        fetch(filterListURLUnsafe),
        fetch(filterListURLPotentiallyUnsafe),
        fetch(fmhyFilterListURL),
      ]);

    let unsafeSites = [];
    let potentiallyUnsafeSites = [];
    let fmhySites = [];

    if (unsafeResponse.ok) {
      const unsafeText = await unsafeResponse.text();
      unsafeSites = extractUrlsFromFilterList(unsafeText);
      unsafeSitesRegex = generateRegexFromList(unsafeSites);
    }

    if (potentiallyUnsafeResponse.ok) {
      const potentiallyUnsafeText = await potentiallyUnsafeResponse.text();
      potentiallyUnsafeSites = extractUrlsFromFilterList(potentiallyUnsafeText);
      potentiallyUnsafeSitesRegex = generateRegexFromList(
        potentiallyUnsafeSites
      );
    }

    if (fmhyResponse.ok) {
      const fmhyText = await fmhyResponse.text();
      fmhySites = extractUrlsFromFilterList(fmhyText);
      fmhySitesRegex = generateRegexFromList(fmhySites);
    }

    await browserAPI.storage.local.set({
      unsafeSites,
      potentiallyUnsafeSites,
      fmhySites,
      unsafeFilterCount: unsafeSites.length,
      potentiallyUnsafeFilterCount: potentiallyUnsafeSites.length,
      fmhyFilterCount: fmhySites.length,
      lastUpdated: new Date().toISOString(),
    });

    console.log("Filter lists fetched and stored successfully.");

    notifySettingsPage();
  } catch (error) {
    console.error("Error fetching filter lists:", error);
  }
}

async function fetchSafeSites() {
  console.log("Fetching safe sites from multiple URLs...");
  try {
    const fetchPromises = safeListURLs.map((url) => fetch(url));
    const responses = await Promise.all(fetchPromises);

    // Extract URLs from each markdown document
    let allUrls = [];
    for (const response of responses) {
      if (response.ok) {
        const markdown = await response.text();
        const urls = extractUrlsFromMarkdown(markdown);
        allUrls = allUrls.concat(urls);
      } else {
        console.warn(`Failed to fetch from ${response.url}`);
      }
    }

    // Normalize URLs and remove duplicates
    safeSites = [...new Set(allUrls.map((url) => normalizeUrl(url.trim())))];

    // Store safe sites for content script use
    await browserAPI.storage.local.set({
      safeSiteCount: safeSites.length,
      safeSiteList: safeSites,
    });

    console.log("Stored safe site count:", safeSites.length);
  } catch (error) {
    console.error("Error fetching safe sites:", error);
  }
}

async function fetchStarredSites() {
  console.log("Fetching starred sites from Markdown guides...");

  try {
    // Fetch all the Markdown files in safeListURLs
    const fetchPromises = safeListURLs.map((url) => fetch(url));
    const responses = await Promise.all(fetchPromises);

    // From each markdown, pull out only those lines containing a star (⭐)
    let starredUrls = [];
    for (const response of responses) {
      if (!response.ok) {
        console.warn(`Failed to fetch ${response.url}`);
        continue;
      }
      const markdown = await response.text();
      markdown.split("\n").forEach((line) => {
        if (line.includes("⭐")) {
          // reuse your existing URL regex logic:
          const match = line.match(/https?:\/\/[^\s)]+/);
          if (match) starredUrls.push(match[0].trim());
        }
      });
    }

    // Normalize, dedupe and store
    starredSites = Array.from(
      new Set(
        starredUrls
          .map((url) => normalizeUrl(url))
          .filter((url) => url !== null)
      )
    );

    await browserAPI.storage.local.set({
      starredSites,
      starredSiteCount: starredSites.length,
    });

    console.log(`Stored ${starredSites.length} starred sites`);
  } catch (error) {
    console.error("Error fetching starred sites:", error);
  }
}

// UI Update Functions
function updatePageAction(status, tabId) {
  const icons = {
    safe: {
      19: "../res/icons/safe_19.png",
      38: "../res/icons/safe_38.png",
    },
    unsafe: {
      19: "../res/icons/unsafe_19.png",
      38: "../res/icons/unsafe_38.png",
    },
    potentially_unsafe: {
      19: "../res/icons/potentially_unsafe_19.png",
      38: "../res/icons/potentially_unsafe_38.png",
    },
    starred: {
      19: "../res/icons/starred_19.png",
      38: "../res/icons/starred_38.png",
    },
    fmhy: {
      19: "../res/icons/fmhy_19.png",
      38: "../res/icons/fmhy_38.png",
    },
    extension_page: {
      19: "../res/ext_icon_144.png",
      38: "../res/ext_icon_144.png",
    },
    default: {
      19: "../res/icons/default_19.png",
      38: "../res/icons/default_38.png",
    },
  };

  const icon = icons[status] || icons["default"];

  browserAPI.action.setIcon({
    tabId: tabId,
    path: icon,
  });
}

async function notifySettingsPage() {
  const tabs = await browserAPI.tabs.query({});
  for (const tab of tabs) {
    try {
      await browserAPI.tabs.sendMessage(tab.id, { type: "filterlistUpdated" });
    } catch (e) {
      // Ignore errors for tabs that can't receive messages
    }
  }
}

// Site Status Checking
function checkSiteAndUpdatePageAction(tabId, url) {
  console.log(
    `checkSiteAndUpdatePageAction: Checking status for ${url} on tab ${tabId}`
  );

  if (!url) {
    updatePageAction("default", tabId);
    return;
  }

  const normalizedUrl = normalizeUrl(url.trim());
  const rootUrl = extractRootUrl(normalizedUrl);

  // Detect if the URL is an internal extension page (settings page or warning page)
  const extUrlBase = browserAPI.runtime.getURL("");
  if (url.startsWith(extUrlBase)) {
    console.log("Detected extension page: " + url);
    updatePageAction("extension_page", tabId);
    return;
  }

  // Create variations of the URL to check
  // Some URLs might be stored with or without trailing slashes or www
  let status = "no_data";
  let matchedUrl = normalizedUrl;

  // First check the full URL
  status = getStatusFromLists(normalizedUrl);

  // If not found, try with trailing slash
  if (status === "no_data" && !normalizedUrl.endsWith("/")) {
    status = getStatusFromLists(normalizedUrl + "/");
    if (status !== "no_data") matchedUrl = normalizedUrl + "/";
  }

  // If not found, try without trailing slash
  if (status === "no_data" && normalizedUrl.endsWith("/")) {
    status = getStatusFromLists(normalizedUrl.slice(0, -1));
    if (status !== "no_data") matchedUrl = normalizedUrl.slice(0, -1);
  }

  // If still no match, check the root URL
  if (status === "no_data") {
    status = getStatusFromLists(rootUrl);
    if (status !== "no_data") matchedUrl = rootUrl;

    // Try root URL with trailing slash
    if (status === "no_data" && !rootUrl.endsWith("/")) {
      status = getStatusFromLists(rootUrl + "/");
      if (status !== "no_data") matchedUrl = rootUrl + "/";
    }
  }

  // Apply the correct icon status to the tab
  updatePageAction(status, tabId);

  // Handle unsafe sites that need warning page redirection if not approved
  if (status === "unsafe" && !approvedUrls.get(tabId)?.includes(rootUrl)) {
    openWarningPage(tabId, rootUrl);
  }
}

// Update Schedule Management
async function shouldUpdate() {
  try {
    const { lastUpdated } = await browserAPI.storage.local.get("lastUpdated");
    const { updateFrequency = "daily" } = await browserAPI.storage.sync.get({
      updateFrequency: "daily",
    });

    if (!lastUpdated) return true;

    const lastUpdate = new Date(lastUpdated);
    const now = new Date();
    const diffHours = (now - lastUpdate) / (1000 * 60 * 60);

    if (updateFrequency === "daily") {
      return diffHours >= 24;
    } else if (updateFrequency === "weekly") {
      return diffHours >= 168;
    } else if (updateFrequency === "monthly") {
      return diffHours >= 720;
    }
    return false;
  } catch (error) {
    console.error("Error checking update schedule:", error);
    return false;
  }
}

async function setupUpdateSchedule() {
  await browserAPI.alarms.clearAll();

  // Get the user's preferred update frequency from storage
  const { updateFrequency } = await browserAPI.storage.sync.get({
    updateFrequency: "daily",
  });

  // Determine period in minutes based on selected frequency
  let periodInMinutes;
  switch (updateFrequency) {
    case "weekly":
      periodInMinutes = 10080; // 7 days in minutes
      break;
    case "monthly":
      periodInMinutes = 43200; // 30 days in minutes
      break;
    default:
      periodInMinutes = 1440; // 24 hours in minutes for daily updates
  }

  // Create the alarm based on calculated period
  browserAPI.alarms.create("checkUpdate", {
    periodInMinutes: periodInMinutes,
  });
}

// Event Listeners
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "checkSiteStatus") {
    const { url, rootUrl } = message;

    // Attempt to match with the full URL first (for specific paths)
    let status = getStatusFromLists(url);
    let matchedUrl = url;

    // If no specific match, try the root URL
    if (status === "no_data") {
      status = getStatusFromLists(rootUrl);
      matchedUrl = rootUrl;
    }

    sendResponse({ status, matchedUrl });
    return true;
  }

  if (message.action === "getSiteStatus") {
    try {
      // Get the URL from the message
      const url = message.url;
      if (!url) {
        sendResponse({ status: "no_data", matchedUrl: null });
        return true;
      }

      console.log(`getSiteStatus: checking status for ${url}`);

      // Normalize the URL
      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl) {
        sendResponse({ status: "no_data", matchedUrl: null });
        return true;
      }

      // Extract domain for domain-level checking
      const urlObj = new URL(normalizedUrl);
      const domain = urlObj.hostname;

      // First check if it's an extension page
      if (url.startsWith(browserAPI.runtime.getURL(""))) {
        sendResponse({ status: "extension_page", matchedUrl: url });
        return true;
      }

      // Special handling for repository sites
      const isRepoSite = ["github.com", "gitlab.com", "sourceforge.net"].some(
        (domain) =>
          urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain)
      );

      // Variables to track status and matched URL
      let status = "no_data";
      let matchedUrl = null;

      // Check full URL first
      if (unsafeSitesRegex?.test(normalizedUrl)) {
        status = "unsafe";
        matchedUrl = normalizedUrl;
      } else if (potentiallyUnsafeSitesRegex?.test(normalizedUrl)) {
        status = "potentially_unsafe";
        matchedUrl = normalizedUrl;
      } else if (fmhySitesRegex?.test(normalizedUrl)) {
        status = "fmhy";
        matchedUrl = normalizedUrl;
      } else if (starredSites.includes(normalizedUrl)) {
        status = "starred";
        matchedUrl = normalizedUrl;
      } else if (safeSites.includes(normalizedUrl)) {
        status = "safe";
        matchedUrl = normalizedUrl;
      }

      // If no match for full URL and it's a repository site, don't try domain matching
      if (status === "no_data" && isRepoSite) {
        console.log(`No match for repository URL: ${normalizedUrl}`);
        sendResponse({ status: "no_data", matchedUrl: normalizedUrl });
        return true;
      }

      // If no match for full URL and it's a regular site, try domain-level matching
      if (status === "no_data" && !isRepoSite) {
        console.log(`No match for full URL, trying domain: ${domain}`);

        // Check domain against regex patterns
        if (unsafeSitesRegex?.test(domain)) {
          status = "unsafe";
          matchedUrl = `https://${domain}`;
        } else if (potentiallyUnsafeSitesRegex?.test(domain)) {
          status = "potentially_unsafe";
          matchedUrl = `https://${domain}`;
        } else if (fmhySitesRegex?.test(domain)) {
          status = "fmhy";
          matchedUrl = `https://${domain}`;
        }

        // Check domain against starred and safe lists
        if (status === "no_data") {
          for (const starredUrl of starredSites) {
            try {
              const starredUrlObj = new URL(starredUrl);
              if (starredUrlObj.hostname === domain) {
                status = "starred";
                matchedUrl = starredUrl;
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }

        if (status === "no_data") {
          for (const safeUrl of safeSites) {
            try {
              const safeUrlObj = new URL(safeUrl);
              if (safeUrlObj.hostname === domain) {
                status = "safe";
                matchedUrl = safeUrl;
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }
      }

      console.log(
        `getSiteStatus result for ${url}: ${status}, matched: ${matchedUrl}`
      );
      sendResponse({ status: status, matchedUrl: matchedUrl });
    } catch (error) {
      console.error("Error in getSiteStatus handler:", error);
      sendResponse({
        status: "no_data",
        matchedUrl: null,
        error: error.message,
      });
    }
    return true; // Keep the message channel open for async response
  }
});

function getStatusFromLists(url) {
  // Skip null, empty or non-string URLs
  if (!url || typeof url !== "string") {
    console.warn(`getStatusFromLists: Invalid URL provided: ${url}`);
    return "no_data";
  }

  try {
    // Special handling for repository hosting sites
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const isRepoSite = ["github.com", "gitlab.com", "sourceforge.net"].some(
      (domain) =>
        urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain)
    );

    // For repository sites, need exact path matching
    if (isRepoSite) {
      // Check unsafe and potentially unsafe first
      if (unsafeSitesRegex?.test(url)) return "unsafe";
      if (potentiallyUnsafeSitesRegex?.test(url)) return "potentially_unsafe";
      if (fmhySitesRegex?.test(url)) return "fmhy";
      if (starredSites.includes(url)) return "starred";
      if (safeSites.includes(url)) return "safe";
      return "no_data"; // No domain-only matches for repos
    }

    // For normal sites, direct checks first (full URL)
    if (unsafeSitesRegex?.test(url)) return "unsafe";
    if (potentiallyUnsafeSitesRegex?.test(url)) return "potentially_unsafe";
    if (fmhySitesRegex?.test(url)) return "fmhy";
    if (starredSites.includes(url)) return "starred";
    if (safeSites.includes(url)) return "safe";

    // Then check domain-level
    if (unsafeSitesRegex?.test(domain)) return "unsafe";
    if (potentiallyUnsafeSitesRegex?.test(domain)) return "potentially_unsafe";
    if (fmhySitesRegex?.test(domain)) return "fmhy";

    // Try domain-level checks for starred and safe
    for (const starredUrl of starredSites) {
      try {
        const starredUrlObj = new URL(starredUrl);
        if (starredUrlObj.hostname === domain) return "starred";
      } catch (e) {
        continue;
      }
    }

    for (const safeUrl of safeSites) {
      try {
        const safeUrlObj = new URL(safeUrl);
        if (safeUrlObj.hostname === domain) return "safe";
      } catch (e) {
        continue;
      }
    }

    return "no_data";
  } catch (e) {
    console.warn(`Error in getStatusFromLists: ${e.message}`);
    return "no_data";
  }
}

async function openWarningPage(tabId, unsafeUrl) {
  const normalizedUrl = normalizeUrl(unsafeUrl);
  const tabApprovedUrls = approvedUrls.get(tabId) || [];

  // Check if URL has already been approved for this tab to avoid loop
  if (tabApprovedUrls.includes(normalizedUrl)) {
    console.log(`URL ${unsafeUrl} was already approved for tab ${tabId}`);
    return;
  }

  // Fetch the warning page setting
  const { warningPage } = await browserAPI.storage.sync.get({
    warningPage: true,
  });

  if (!warningPage) {
    console.log("Warning page is disabled by the user settings.");
    return;
  }

  // Add temporary approval to avoid repeated redirection
  tabApprovedUrls.push(normalizedUrl);
  approvedUrls.set(tabId, tabApprovedUrls);

  // Redirect to the warning page if it is enabled in settings
  const warningPageUrl = browserAPI.runtime.getURL(
    `../pub/warning-page.html?url=${encodeURIComponent(unsafeUrl)}`
  );
  browserAPI.tabs.update(tabId, { url: warningPageUrl });
}

// Listen for settings updates from the settings page
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "settingsUpdated") {
    setupUpdateSchedule(); // Adjust update schedule based on new settings
    sendResponse({ status: "Settings updated successfully" });
    return true; // Indicates asynchronous response handling
  }
});

// Listen for tab updates
browserAPI.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    // Always check the site status
    checkSiteAndUpdatePageAction(tabId, tab.url);
  }
});

browserAPI.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await browserAPI.tabs.get(activeInfo.tabId);
  if (tab.url) {
    checkSiteAndUpdatePageAction(tab.id, tab.url);
  }
});

browserAPI.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "checkUpdate") {
    const needsUpdate = await shouldUpdate();
    if (needsUpdate) {
      await fetchFilterLists();
    }
  }
});

browserAPI.tabs.onRemoved.addListener((tabId) => {
  approvedUrls.delete(tabId);
  browserAPI.storage.local.remove(`proceedTab_${tabId}`);
});

// Initialize settings with defaults if needed
async function initializeSettings() {
  const defaultSettings = {
    theme: "system",
    showWarning: true,
    updateFrequency: "daily",
    highlightTrusted: true,
    highlightUntrusted: true,
    showWarningBanners: true,
    trustedColor: "#32cd32",
    untrustedColor: "#ff4444",
    userTrustedDomains: [],
    userUntrustedDomains: [],
  };

  // Check for existing settings
  const existingSettings = await browserAPI.storage.local.get(
    Object.keys(defaultSettings)
  );

  // Merge with defaults for any missing settings
  const mergedSettings = { ...defaultSettings, ...existingSettings };

  // Save the merged settings
  await browserAPI.storage.local.set(mergedSettings);

  console.log("Settings initialized:", mergedSettings);
}

// Extension initialization
async function initializeExtension() {
  console.log("Initializing extension...");

  try {
    await initializeSettings();

    // Check if we need to update
    if (await shouldUpdate()) {
      await fetchFilterLists();
      await fetchSafeSites();
      await fetchStarredSites();
    } else {
      // Load data from storage
      try {
        const storedData = await browserAPI.storage.local.get([
          "unsafeSites",
          "potentiallyUnsafeSites",
          "fmhySites",
          "starredSites",
          "safeSiteList",
        ]);

        if (storedData.unsafeSites && storedData.unsafeSites.length > 0) {
          unsafeSitesRegex = generateRegexFromList(storedData.unsafeSites);
        }

        if (
          storedData.potentiallyUnsafeSites &&
          storedData.potentiallyUnsafeSites.length > 0
        ) {
          potentiallyUnsafeSitesRegex = generateRegexFromList(
            storedData.potentiallyUnsafeSites
          );
        }

        if (storedData.fmhySites && storedData.fmhySites.length > 0) {
          fmhySitesRegex = generateRegexFromList(storedData.fmhySites);
        }

        // Load starred sites from storage
        if (storedData.starredSites && storedData.starredSites.length > 0) {
          starredSites = storedData.starredSites;
          console.log(
            `Loaded ${starredSites.length} starred sites from storage`
          );
        } else {
          // If no starred sites in storage, fetch them now
          await fetchStarredSites();
        }

        // Load safe sites from storage
        if (storedData.safeSiteList && storedData.safeSiteList.length > 0) {
          safeSites = storedData.safeSiteList;
          console.log(`Loaded ${safeSites.length} safe sites from storage`);
        } else {
          // If no safe sites in storage, fetch them now
          await fetchSafeSites();
        }
      } catch (error) {
        console.error("Error loading from storage:", error);
      }
    }

    // Add fallback known sites - only for safe sites, not for starred
    addKnownSafeSites();

    // Set up the update schedule
    await setupUpdateSchedule();

    console.log("Extension initialized successfully.");
  } catch (error) {
    console.error("Error during initialization:", error);
  }
}

// Extension message handling
browserAPI.runtime.onMessage.addListener(
  async (message, sender, sendResponse) => {
    if (message.action === "updateAlarm") {
      await setupUpdateSchedule();
      return true;
    }

    if (message.action === "refreshAllTabs") {
      // Get all tabs
      const tabs = await browserAPI.tabs.query({});

      // Send refresh message to all tabs
      for (const tab of tabs) {
        try {
          await browserAPI.tabs.sendMessage(tab.id, {
            action: "refreshSettings",
          });
        } catch (error) {
          // Content script might not be loaded in some tabs, ignore errors
          console.log(`Could not refresh tab ${tab.id}: ${error.message}`);
        }
      }

      return true;
    }

    return false;
  }
);

// Add listener for approval from the warning page
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "approveSite") {
    const { tabId, url } = message;
    const rootUrl = extractRootUrl(url);

    // Fetch existing approved URLs from storage
    browserAPI.storage.local.get("approvedUrls", (result) => {
      const approvedUrls = result.approvedUrls || [];

      // Add the root URL if not already approved
      if (!approvedUrls.includes(rootUrl)) {
        approvedUrls.push(rootUrl);
        browserAPI.storage.local.set({ approvedUrls });
        console.log(`approveSite: ${rootUrl} approved globally.`);
      }

      // Set the toolbar icon to "unsafe" immediately
      updatePageAction("unsafe", tabId);
      sendResponse({ status: "approved" });
    });
    return true;
  }
});

initializeExtension();
