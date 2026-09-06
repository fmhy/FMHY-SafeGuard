globalThis.SafeGuard ||= {};
SafeGuard.settings = (() => {
  "use strict";

  const defaults = Object.freeze({
    theme: "system",
    language: "auto",
    showWarning: true,
    updateFrequency: "daily",
    highlightTrusted: true,
    highlightUntrusted: true,
    showWarningBanners: true,
    trustedColor: "#32cd32",
    untrustedColor: "#ff4444",
    userTrustedDomains: [],
    userUntrustedDomains: [],
  });
  const updatePeriods = Object.freeze({
    daily: 1440,
    weekly: 10080,
    monthly: 43200,
  });
  const highlightKeys = [
    "highlightTrusted",
    "highlightUntrusted",
    "showWarningBanners",
    "trustedColor",
    "untrustedColor",
    "userTrustedDomains",
    "userUntrustedDomains",
  ];

  function normalizeDomain(hostname) {
    return hostname
      .trim()
      .toLowerCase()
      .replace(/^www\./, "");
  }

  function parseDomainList(text) {
    const domains = new Set();
    for (const line of text.split(/\r?\n/)) {
      const value = line.trim();
      if (!value || value.startsWith("#") || value.startsWith("//")) continue;
      try {
        const url = new URL(value.includes("://") ? value : `https://${value}`);
        if (!["https:", "http:"].includes(url.protocol) || !url.hostname)
          continue;
        domains.add(normalizeDomain(url.hostname));
      } catch {
        // Ignore malformed lines instead of saving domains that can never match.
      }
    }
    return [...domains];
  }

  async function read(storage) {
    return storage.get(defaults);
  }

  async function initialize(storage) {
    const existing = await storage.get(Object.keys(defaults));
    const missing = Object.fromEntries(
      Object.entries(defaults).filter(([key]) => existing[key] === undefined),
    );
    if (Object.keys(missing).length) await storage.set(missing);
  }

  function periodInMinutes(frequency) {
    return updatePeriods[frequency] || updatePeriods.daily;
  }

  function nextUpdateTime(lastUpdated, frequency) {
    const timestamp = Date.parse(lastUpdated);
    return Number.isFinite(timestamp)
      ? timestamp + periodInMinutes(frequency) * 60000
      : null;
  }

  async function shouldUpdate(storage, now = Date.now()) {
    const { lastUpdated, updateFrequency } = await storage.get([
      "lastUpdated",
      "updateFrequency",
    ]);
    const next = nextUpdateTime(lastUpdated, updateFrequency);
    return next === null || now >= next;
  }

  function applyTheme(theme) {
    const resolved = ["light", "dark", "amoled"].includes(theme)
      ? theme
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    document.body.setAttribute("data-theme", resolved);
  }

  return {
    defaults,
    highlightKeys,
    normalizeDomain,
    parseDomainList,
    read,
    initialize,
    periodInMinutes,
    nextUpdateTime,
    shouldUpdate,
    applyTheme,
  };
})();
