// Cross-browser compatibility shim
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// URLs and Constants
const filterListURLUnsafe =
  "https://raw.githubusercontent.com/fmhy/FMHYFilterlist/refs/heads/main/sitelist.txt";
const filterListURLPotentiallyUnsafe =
  "https://raw.githubusercontent.com/fmhy/FMHYFilterlist/refs/heads/main/sitelist-plus.txt";
const safeListURLs = [
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/adblockvpnguide.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/ai.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/android-iosguide.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/audiopiracyguide.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/devtools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/downloadpiracyguide.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/edupiracyguide.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/file-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/gaming-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/gamingpiracyguide.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/img-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/internet-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/linuxguide.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/miscguide.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/non-english.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/nsfwpiracy.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/readingpiracyguide.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/social-media-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/storage.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/system-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/text-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/torrentpiracyguide.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/video-tools.md",
  "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/videopiracyguide.md",
];
const starredListURL =
  "https://raw.githubusercontent.com/fmhy/bookmarks/refs/heads/main/fmhy_in_bookmarks_starred_only.html";
const fmhyFilterListURL =
  "https://raw.githubusercontent.com/fmhy/FMHY-SafeGuard/refs/heads/main/fmhy-filterlist.txt";

// State Variables
let unsafeSitesRegex = null;
let potentiallyUnsafeSitesRegex = null;
let fmhySitesRegex = null;
let safeSites = [];
let starredSites = [];
const approvedUrls = new Map(); // Map to store approved URLs per tab

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
  console.log("Fetching starred sites...");
  try {
    const response = await fetch(starredListURL);
    if (response.ok) {
      const html = await response.text();
      const urls = extractUrlsFromBookmarks(html);
      starredSites = [...new Set([...urls.map(normalizeUrl), ...starredSites])];

      // Store starred sites in storage for persistence
      await browserAPI.storage.local.set({
        starredSites: starredSites,
        starredSiteCount: starredSites.length,
      });

      console.log(`Stored ${starredSites.length} starred sites`);
    }
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
});

function getStatusFromLists(url) {
  // Skip null, empty or non-string URLs
  if (!url || typeof url !== "string") {
    console.warn(`getStatusFromLists: Invalid URL provided: ${url}`);
    return "no_data";
  }

  // Create URL variations to check consistently across all lists
  const originalUrl = url;
  const urlWithSlash = url.endsWith("/") ? url : url + "/";
  const urlWithoutSlash = url.endsWith("/") ? url.slice(0, -1) : url;
  const urlVariations = [originalUrl, urlWithSlash, urlWithoutSlash];

  // Special handling for repository hosting sites
  const urlObj = new URL(url);
  const isRepoSite = ["github.com", "gitlab.com", "sourceforge.net"].some(
    (domain) =>
      urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain)
  );

  // For repository sites, we need to check the full path, not just the domain
  if (isRepoSite) {
    // Check unsafe and potentially unsafe lists first using regex
    if (unsafeSitesRegex?.test(url)) return "unsafe";
    if (potentiallyUnsafeSitesRegex?.test(url)) return "potentially_unsafe";
    if (fmhySitesRegex?.test(url)) return "fmhy";

    // For repo sites, check for exact matches in starred and safe lists
    // Skip domain-only matching which we do later in the function
    for (const variant of urlVariations) {
      if (starredSites.includes(variant)) return "starred";
    }

    for (const variant of urlVariations) {
      if (safeSites.includes(variant)) return "safe";
    }

    // If no match found for the specific repository, return no_data
    // We skip the domain-level matching for repository hosting sites
    return "no_data";
  }

  // For non-repository sites, continue with standard checks
  if (unsafeSitesRegex?.test(url)) return "unsafe";
  if (potentiallyUnsafeSitesRegex?.test(url)) return "potentially_unsafe";
  if (fmhySitesRegex?.test(url)) return "fmhy";

  // Check for starred status with all URL variations - highest priority after unsafe/fmhy
  for (const variant of urlVariations) {
    if (starredSites.includes(variant)) {
      return "starred";
    }
  }

  // Check for safe status with all URL variations - lower priority than starred
  for (const variant of urlVariations) {
    if (safeSites.includes(variant)) {
      return "safe";
    }
  }

  // Try matching the domain part only for safe sites
  try {
    const domain = urlObj.hostname;

    // First check if domain matches any starred site (priority)
    for (const starredUrl of starredSites) {
      try {
        const starredUrlObj = new URL(starredUrl);
        if (starredUrlObj.hostname === domain) {
          return "starred";
        }
      } catch (e) {
        // Skip invalid URLs in starredSites
        continue;
      }
    }

    // Then check for safe site domain matches
    for (const safeUrl of safeSites) {
      try {
        const safeUrlObj = new URL(safeUrl);
        if (safeUrlObj.hostname === domain) {
          return "safe";
        }
      } catch (e) {
        // Skip invalid URLs in safeSites
        continue;
      }
    }
  } catch (e) {
    // If URL parsing fails, skip domain matching
  }

  return "no_data";
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
  }
  return true;
});

// Listen for settings updates from the settings page
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "settingsUpdated") {
    setupUpdateSchedule(); // Adjust update schedule based on new settings
    sendResponse({ status: "Settings updated successfully" });
    return true; // Indicates asynchronous response handling
  }
});

browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
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

// Add well-known safe sites manually as a fallback
function addKnownSafeSites() {
  // Known safe sites from FMHY that should be recognized
  const knownSafeSites = [
    // Common gaming sites
    "https://fitgirl-repacks.site",
    "https://pcgamestorrents.com",
    "https://steamunlocked.net",
    "https://gog-games.com",

    // Common tools/software sites
    // GitHub URLs should be evaluated per repository, not by domain
    "https://gitlab.com",
    "https://sourceforge.net",

    // Media streaming/download sites
    "https://archive.org",
    "https://nyaa.si",
    "https://rutracker.org",
    "https://1337x.to",

    // Known safe GitHub repositories
    "https://github.com/hydralauncher/hydra",

    // Add more known safe sites here as needed
  ];

  // Process and add to safeSites
  const normalizedSites = knownSafeSites
    .map((site) => normalizeUrl(site))
    .filter((site) => site);

  // Add to safeSites if not already present
  for (const site of normalizedSites) {
    if (!safeSites.includes(site)) {
      console.log(`Adding known safe site: ${site}`);
      safeSites.push(site);
    }
  }

  console.log(`Added ${normalizedSites.length} known safe sites as fallback`);
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

initializeExtension();
