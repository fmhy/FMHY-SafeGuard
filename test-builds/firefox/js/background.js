// Firefox loads dependencies through its manifest. Chromium uses a worker.
if (typeof importScripts === "function") {
  importScripts(
    "config.js",
    "settings.js",
    "resources.js",
    "guide-parser.js",
    "site-metadata.js",
    "curated-resources.js",
    "catalogue.js",
    "toolbar.js",
  );
}

(() => {
  "use strict";
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;
  const storage = browserAPI.storage.local;
  const { normalizeResourceUrl } = SafeGuard.resources;
  const { updatePageAction } = SafeGuard;
  const checkedTabUrls = new Map();
  const navigationVersions = new Map();
  const approvedUrls = new Map();
  const contextMenuId = "open-fmhy-net";
  const catalogue = SafeGuard.createCatalogue({
    storage,
    fetch,
    onUpdated: notifyUpdated,
  });
  const ready = initialize();

  async function broadcast(message) {
    const tabs = await browserAPI.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        try {
          await browserAPI.tabs.sendMessage(tab.id, message);
        } catch {
          /* Restricted tabs cannot receive messages. */
        }
      }),
    );
  }

  async function notifyUpdated() {
    checkedTabUrls.clear();
    try {
      await browserAPI.runtime.sendMessage({ type: "filterlistUpdated" });
    } catch {
      /* No extension page is open. */
    }
    await broadcast({ type: "filterlistUpdated" });
  }

  async function setupUpdateSchedule() {
    const { updateFrequency } = await SafeGuard.settings.read(storage);
    await browserAPI.alarms.clear("checkUpdate");
    await browserAPI.alarms.create("checkUpdate", {
      periodInMinutes: SafeGuard.settings.periodInMinutes(updateFrequency),
    });
  }

  async function initialize() {
    await catalogue.initialize();
    await setupUpdateSchedule();
  }

  function reportError(error) {
    console.error("FMHY SafeGuard:", error);
  }

  async function createContextMenu() {
    if (!browserAPI.contextMenus?.create) return;
    if (typeof browser !== "undefined") {
      try {
        await browserAPI.contextMenus.remove(contextMenuId);
      } catch {
        /* The menu does not exist on first install. */
      }
    } else {
      // Keep callback support for Chromium versions covered by the manifest.
      await new Promise((resolve) => {
        browserAPI.contextMenus.remove(contextMenuId, () => {
          void browserAPI.runtime.lastError;
          resolve();
        });
      });
    }
    browserAPI.contextMenus.create({
      id: contextMenuId,
      title: "Open FMHY.net",
      contexts: ["action"],
    });
  }

  browserAPI.runtime.onInstalled.addListener((details) => {
    createContextMenu().catch(reportError);
    if (details.reason === "install") {
      browserAPI.tabs
        .create({ url: browserAPI.runtime.getURL("pub/welcome-page.html") })
        .catch(reportError);
    }
  });
  browserAPI.runtime.onStartup?.addListener(() =>
    createContextMenu().catch(reportError),
  );
  browserAPI.contextMenus?.onClicked.addListener((info) => {
    if (info.menuItemId === contextMenuId)
      browserAPI.tabs.create({ url: "https://fmhy.net/" }).catch(reportError);
  });

  function getSiteStatus(url) {
    if (
      typeof url === "string" &&
      url.startsWith(browserAPI.runtime.getURL(""))
    ) {
      return { status: "extension_page", matchedUrl: url };
    }
    return catalogue.getSiteStatus(url);
  }

  async function checkTab(tabId, url) {
    const identity = /^https?:\/\//i.test(url)
      ? normalizeResourceUrl(url)
      : url;
    if (checkedTabUrls.get(tabId) === identity) return;
    checkedTabUrls.set(tabId, identity);
    const version = (navigationVersions.get(tabId) || 0) + 1;
    navigationVersions.set(tabId, version);
    try {
      await ready;
      const result = getSiteStatus(url);
      const { showWarning } = await SafeGuard.settings.read(storage);
      const currentTab = await browserAPI.tabs.get(tabId);
      // Never let a slow storage read redirect a newer navigation.
      if (navigationVersions.get(tabId) !== version || currentTab.url !== url)
        return;
      await updatePageAction(result.status, tabId);
      if (result.status !== "unsafe" || !showWarning) return;
      const approvalKey = `proceedTab_${tabId}`;
      const stored = await storage.get(approvalKey);
      if (
        approvedUrls.get(tabId)?.has(identity) ||
        stored[approvalKey] === identity
      )
        return;
      const latestTab = await browserAPI.tabs.get(tabId);
      if (navigationVersions.get(tabId) !== version || latestTab.url !== url)
        return;
      const warningUrl = new URL(
        browserAPI.runtime.getURL("pub/warning-page.html"),
      );
      warningUrl.searchParams.set("url", url);
      if (result.reason) warningUrl.searchParams.set("reason", result.reason);
      await browserAPI.tabs.update(tabId, { url: warningUrl.href });
    } catch (error) {
      if (navigationVersions.get(tabId) === version)
        checkedTabUrls.delete(tabId);
      reportError(error);
    }
  }

  const handlers = {
    getSiteStatus: (message) => getSiteStatus(message.url),
    checkSiteStatus: (message) => getSiteStatus(message.url),
    getNoteForSite: (message) => catalogue.getNoteForSite(message.url),
    updateAlarm: async () => {
      await setupUpdateSchedule();
      return { status: "updated" };
    },
    settingsUpdated: async () => {
      await setupUpdateSchedule();
      return { status: "Settings updated successfully" };
    },
    forceUpdate: async () => {
      await catalogue.refresh();
      return { status: "updated" };
    },
    refreshAllTabs: async () => {
      await catalogue.loadOverrides();
      checkedTabUrls.clear();
      await broadcast({ action: "refreshSettings" });
      const tabs = await browserAPI.tabs.query({});
      await Promise.all(
        tabs.filter((tab) => tab.url).map((tab) => checkTab(tab.id, tab.url)),
      );
      return { status: "refreshed" };
    },
    approveSite: async ({ tabId, url }) => {
      if (
        !Number.isInteger(tabId) ||
        typeof url !== "string" ||
        !/^https?:\/\//i.test(url)
      ) {
        throw new Error("Invalid site approval");
      }
      const identity = normalizeResourceUrl(url);
      if (!identity) throw new Error("Invalid site approval URL");
      const approved = approvedUrls.get(tabId) || new Set();
      approved.add(identity);
      approvedUrls.set(tabId, approved);
      await storage.set({ [`proceedTab_${tabId}`]: identity });
      await updatePageAction("unsafe", tabId);
      return { status: "approved" };
    },
  };

  browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const action = message?.action || message?.type;
    if (!Object.hasOwn(handlers, action)) return false;
    ready
      .then(() => handlers[action](message, sender))
      .then(sendResponse, (error) => {
        reportError(error);
        sendResponse({ status: "error", error: error.message });
      });
    return true;
  });

  browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) checkTab(tabId, changeInfo.url);
    else if (changeInfo.status === "complete" && tab.url)
      checkTab(tabId, tab.url);
  });
  browserAPI.tabs.onActivated.addListener(({ tabId }) => {
    browserAPI.tabs
      .get(tabId)
      .then((tab) => tab.url && checkTab(tabId, tab.url))
      .catch(reportError);
  });
  browserAPI.tabs.onRemoved.addListener((tabId) => {
    approvedUrls.delete(tabId);
    checkedTabUrls.delete(tabId);
    navigationVersions.delete(tabId);
    storage.remove(`proceedTab_${tabId}`).catch(reportError);
  });
  browserAPI.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== "checkUpdate") return;
    ready
      .then(async () => {
        if (await SafeGuard.settings.shouldUpdate(storage))
          await catalogue.refresh();
      })
      .catch(reportError);
  });
  browserAPI.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      (changes.userTrustedDomains || changes.userUntrustedDomains)
    ) {
      ready
        .then(() => catalogue.loadOverrides())
        .then(() => checkedTabUrls.clear())
        .catch(reportError);
    }
  });
  ready.catch(reportError);
})();
