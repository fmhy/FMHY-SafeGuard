document.addEventListener("DOMContentLoaded", async () => {
  "use strict";
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;
  const { applyTheme, parseDomainList, nextUpdateTime } = SafeGuard.settings;
  const element = (id) => document.getElementById(id);
  const notification = element("notification");
  const updateStatus = element("updateStatus");
  const updateButton = element("updateNowBtn");
  const saveButton = element("saveSettings");
  const fields = {
    theme: ["themeSelect", "value"],
    language: ["languageSelect", "value"],
    showWarning: ["warningToggle", "checked"],
    updateFrequency: ["updateFrequency", "value"],
    highlightTrusted: ["highlightTrustedToggle", "checked"],
    highlightUntrusted: ["highlightUntrustedToggle", "checked"],
    showWarningBanners: ["showWarningBannersToggle", "checked"],
    trustedColor: ["trustedColor", "value"],
    untrustedColor: ["untrustedColor", "value"],
    userTrustedDomains: ["trustedDomains", "value"],
    userUntrustedDomains: ["untrustedDomains", "value"],
  };
  let notificationTimer;
  element("versionNumber").textContent =
    browserAPI.runtime.getManifest().version;

  function showNotification(message, isError = false) {
    notification.textContent = message;
    notification.style.background = isError
      ? "linear-gradient(120deg, #ff6b6b, #ff8787)"
      : "linear-gradient(120deg, var(--accent-purple), var(--accent-blue))";
    notification.classList.add("show");
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(
      () => notification.classList.remove("show"),
      3000,
    );
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!value || !Number.isFinite(date.getTime())) return "Never";
    const days = Math.floor(Math.abs(Date.now() - date.getTime()) / 86400000);
    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (days === 0) return `Today at ${time}`;
    if (days === 1) return `Yesterday at ${time}`;
    return `${date.toLocaleDateString()} ${time}`;
  }

  function describeNextUpdate(lastUpdated, frequency) {
    const timestamp = nextUpdateTime(lastUpdated, frequency);
    if (timestamp === null) return "Not scheduled";
    const remaining = timestamp - Date.now();
    if (remaining <= 0) return "Update pending...";
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    if (!hours) return `in ${minutes} minutes`;
    if (hours < 24) return `in ${hours}h ${minutes}m`;
    const days = Math.floor(hours / 24);
    return days === 1 ? "tomorrow" : `in ${days} days`;
  }

  async function updateNextUpdateStatus() {
    try {
      const data = await browserAPI.storage.local.get([
        "lastUpdated",
        "updateFrequency",
      ]);
      // Preserve the existing SVG instead of constructing it after every refresh.
      const icon = updateStatus.querySelector("svg");
      const text = document.createTextNode(
        `Next update ${describeNextUpdate(data.lastUpdated, data.updateFrequency)}`,
      );
      updateStatus.replaceChildren(...(icon ? [icon, text] : [text]));
    } catch (error) {
      console.error("Error reading update schedule:", error);
      updateStatus.textContent = "Unable to check next update time";
    }
  }

  async function loadFilterlistStats() {
    const counts = [
      "unsafeFilterCount",
      "potentiallyUnsafeFilterCount",
      "safeSiteCount",
    ];
    try {
      const stats = await browserAPI.storage.local.get({
        unsafeFilterCount: 0,
        potentiallyUnsafeFilterCount: 0,
        safeSiteCount: 0,
        lastUpdated: null,
      });
      for (const key of counts) element(key).textContent = stats[key];
      element("lastUpdated").textContent = formatDate(stats.lastUpdated);
      await updateNextUpdateStatus();
    } catch (error) {
      console.error("Error loading filter statistics:", error);
      for (const key of [...counts, "lastUpdated"])
        element(key).textContent = "Error";
    }
  }

  async function sendAction(action) {
    const response = await browserAPI.runtime.sendMessage({ action });
    if (!response || response.status === "error")
      throw new Error(response?.error || "No response from background");
    return response;
  }

  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    try {
      const settings = {};
      for (const [key, [id, property]] of Object.entries(fields)) {
        const value = element(id)[property];
        settings[key] = key.endsWith("Domains")
          ? parseDomainList(value)
          : value;
      }
      await browserAPI.storage.local.set(settings);
      await sendAction("updateAlarm");
      await sendAction("refreshAllTabs");
      showNotification("Settings saved and applied to all tabs!");
      await updateNextUpdateStatus();
    } catch (error) {
      console.error("Error saving settings:", error);
      showNotification("Error saving settings. Please try again.", true);
    } finally {
      saveButton.disabled = false;
    }
  });

  element("themeSelect").addEventListener("change", (event) =>
    applyTheme(event.target.value),
  );
  element("languageSelect").addEventListener("change", async (event) => {
    try {
      await browserAPI.storage.local.set({ language: event.target.value });
      await window.i18n?.setLanguage(event.target.value);
    } catch (error) {
      console.error("Error changing language:", error);
      showNotification("Unable to change language", true);
    }
  });
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (element("themeSelect").value === "system") applyTheme("system");
    });
  browserAPI.runtime.onMessage.addListener((message) => {
    if (message.type === "filterlistUpdated") loadFilterlistStats();
  });

  updateButton.addEventListener("click", async () => {
    const message = (key, fallback) => window.i18n?.getMessage(key) || fallback;
    const label = updateButton.querySelector("span") || updateButton;
    updateButton.disabled = true;
    updateButton.classList.add("updating");
    label.textContent = message("updating", "Updating...");
    try {
      await sendAction("forceUpdate");
      await loadFilterlistStats();
      showNotification(
        message("filterlistUpdated", "Filterlist updated successfully!"),
      );
    } catch (error) {
      console.error("Update failed:", error);
      showNotification(
        message("updateFailed", "Update failed. Please try again."),
        true,
      );
    } finally {
      updateButton.disabled = false;
      updateButton.classList.remove("updating");
      label.textContent = message("updateNow", "Update Now");
    }
  });

  try {
    const settings = await SafeGuard.settings.read(browserAPI.storage.local);
    for (const [key, [id, property]] of Object.entries(fields)) {
      element(id)[property] = Array.isArray(settings[key])
        ? settings[key].join("\n")
        : settings[key];
    }
    applyTheme(settings.theme);
    await loadFilterlistStats();
  } catch (error) {
    console.error("Error loading settings:", error);
    showNotification("Error loading settings", true);
  }
  const updateTimer = setInterval(updateNextUpdateStatus, 60000);
  window.addEventListener("unload", () => {
    clearInterval(updateTimer);
    clearTimeout(notificationTimer);
  });
});
