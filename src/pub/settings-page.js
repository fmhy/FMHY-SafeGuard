document.addEventListener("DOMContentLoaded", () => {
  // Cross-browser compatibility shim
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;
  // Load and display the extension version from manifest.json
  const manifest = browserAPI.runtime.getManifest();
  document.getElementById("versionNumber").textContent = manifest.version;

  // Get all DOM elements
  const themeSelect = document.getElementById("themeSelect");
  const warningToggle = document.getElementById("warningToggle");
  const updateFrequency = document.getElementById("updateFrequency");
  const saveButton = document.getElementById("saveSettings");
  const notification = document.getElementById("notification");
  const lastUpdated = document.getElementById("lastUpdated");
  const updateStatus = document.getElementById("updateStatus");
  const forceRefreshButton = document.getElementById("forceRefresh");

  // Get link highlighting elements
  const highlightTrustedToggle = document.getElementById(
    "highlightTrustedToggle"
  );
  const highlightUntrustedToggle = document.getElementById(
    "highlightUntrustedToggle"
  );
  const showWarningBannersToggle = document.getElementById(
    "showWarningBannersToggle"
  );
  const trustedColor = document.getElementById("trustedColor");
  const untrustedColor = document.getElementById("untrustedColor");

  // Get domain management elements
  const trustedDomains = document.getElementById("trustedDomains");
  const untrustedDomains = document.getElementById("untrustedDomains");

  // Theme application function
  function applyTheme(theme) {
    if (theme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      document.body.setAttribute("data-theme", prefersDark ? "dark" : "light");
    } else {
      document.body.setAttribute("data-theme", theme);
    }
  }

  // Format date function
  function formatDate(date) {
    if (!date) return "Never";
    const d = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now - d);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return (
        "Today at " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    } else if (diffDays === 1) {
      return (
        "Yesterday at " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    } else {
      return (
        d.toLocaleDateString() +
        " " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    }
  }

  // Calculate next update time
  function calculateNextUpdate(lastUpdate, frequency) {
    if (!lastUpdate) return "Not scheduled";
    const lastUpdateDate = new Date(lastUpdate);
    let nextUpdate = new Date(lastUpdateDate);

    switch (frequency) {
      case "daily":
        nextUpdate.setDate(nextUpdate.getDate() + 1);
        nextUpdate.setHours(0, 0, 0, 0);
        break;
      case "weekly":
        nextUpdate.setDate(nextUpdate.getDate() + 7);
        nextUpdate.setHours(0, 0, 0, 0);
        break;
      case "monthly":
        nextUpdate.setMonth(nextUpdate.getMonth() + 1);
        nextUpdate.setHours(0, 0, 0, 0);
        break;
      default:
        return "Not scheduled";
    }

    const now = new Date();
    if (nextUpdate < now) {
      return "Update pending...";
    }

    const timeUntil = nextUpdate - now;
    const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
    const minutesUntil = Math.floor(
      (timeUntil % (1000 * 60 * 60)) / (1000 * 60)
    );

    if (hoursUntil < 24) {
      if (hoursUntil === 0) {
        return `in ${minutesUntil} minutes`;
      } else {
        return `in ${hoursUntil}h ${minutesUntil}m`;
      }
    } else {
      const days = Math.floor(hoursUntil / 24);
      if (days === 1) {
        return "tomorrow";
      } else {
        return `in ${days} days`;
      }
    }
  }

  // Update the UI with next update time
  async function updateNextUpdateStatus() {
    try {
      // Get both lastUpdated and updateFrequency in a single storage call
      const data = await browserAPI.storage.local.get({
        lastUpdated: null,
        updateFrequency: "daily",
      });

      // Use the stored frequency setting directly
      const nextUpdateText = calculateNextUpdate(
        data.lastUpdated,
        data.updateFrequency
      );

      if (updateStatus) {
        // Clear current content
        while (updateStatus.firstChild) {
          updateStatus.removeChild(updateStatus.firstChild);
        }

        // Add spinning icon
        const svgIcon = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg"
        );
        svgIcon.setAttribute("class", "update-icon");
        svgIcon.setAttribute("viewBox", "0 0 24 24");
        svgIcon.setAttribute("width", "16");
        svgIcon.setAttribute("height", "16");

        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );
        path.setAttribute("fill", "currentColor");
        path.setAttribute(
          "d",
          "M12 4V2C6.477 2 2 6.477 2 12C2 17.523 6.477 22 12 22C17.523 22 22 17.523 22 12H20C20 16.418 16.418 20 12 20C7.582 20 4 16.418 4 12C4 7.582 7.582 4 12 4Z"
        );

        svgIcon.appendChild(path);
        updateStatus.appendChild(svgIcon);

        // Add text
        updateStatus.appendChild(
          document.createTextNode(`Next update ${nextUpdateText}`)
        );
      }
    } catch (error) {
      console.error("Error updating next update status:", error);
      if (updateStatus) {
        updateStatus.textContent = "Unable to check next update time";
      }
    }
  }

  // Load filterlist stats
  async function loadFilterlistStats() {
    try {
      const stats = await browserAPI.storage.local.get({
        unsafeFilterCount: 0,
        potentiallyUnsafeFilterCount: 0,
        safeSiteCount: 0,
        lastUpdated: null,
      });

      console.log("Fetched stats:", stats);

      document.getElementById("unsafeFilterCount").textContent =
        stats.unsafeFilterCount;
      document.getElementById("potentiallyUnsafeFilterCount").textContent =
        stats.potentiallyUnsafeFilterCount;
      document.getElementById("safeSiteCount").textContent =
        stats.safeSiteCount;
      document.getElementById("lastUpdated").textContent = formatDate(
        stats.lastUpdated
      );

      await updateNextUpdateStatus();
    } catch (error) {
      console.error("Error loading filterlist stats:", error);
      document.getElementById("unsafeFilterCount").textContent = "Error";
      document.getElementById("potentiallyUnsafeFilterCount").textContent =
        "Error";
      document.getElementById("safeSiteCount").textContent = "Error";
      document.getElementById("lastUpdated").textContent = "Error";
    }
  }

  // Load settings function
  async function loadSettings() {
    try {
      const settings = await browserAPI.storage.local.get([
        "theme",
        "showWarning",
        "updateFrequency",
        "lastUpdated",
        "nextUpdate",
        "highlightTrusted",
        "highlightUntrusted",
        "showWarningBanners",
        "trustedColor",
        "untrustedColor",
        "userTrustedDomains",
        "userUntrustedDomains",
      ]);

      console.log("Loaded settings:", settings);

      themeSelect.value = settings.theme || "system";
      applyTheme(settings.theme || "system");

      warningToggle.checked = settings.showWarning !== false;

      // Set updateFrequency with fallback to "daily"
      updateFrequency.value = settings.updateFrequency || "daily";
      console.log("Set updateFrequency to:", updateFrequency.value);

      // Set link highlighting settings
      highlightTrustedToggle.checked = settings.highlightTrusted !== false;
      highlightUntrustedToggle.checked = settings.highlightUntrusted !== false;
      showWarningBannersToggle.checked = settings.showWarningBanners !== false;

      if (settings.trustedColor) {
        trustedColor.value = settings.trustedColor;
      }

      if (settings.untrustedColor) {
        untrustedColor.value = settings.untrustedColor;
      }

      // Set domain lists
      if (
        settings.userTrustedDomains &&
        Array.isArray(settings.userTrustedDomains)
      ) {
        trustedDomains.value = settings.userTrustedDomains.join("\n");
      }

      if (
        settings.userUntrustedDomains &&
        Array.isArray(settings.userUntrustedDomains)
      ) {
        untrustedDomains.value = settings.userUntrustedDomains.join("\n");
      }

      if (settings.lastUpdated) {
        lastUpdated.textContent = formatDate(settings.lastUpdated);
      }

      if (settings.nextUpdate) {
        updateNextUpdateStatus();
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      showNotification("Error loading settings", true);
    }
  }

  // Show notification function
  function showNotification(message, isError = false) {
    if (notification) {
      notification.textContent = message;
      if (isError) {
        notification.style.background =
          "linear-gradient(120deg, #ff6b6b, #ff8787)";
      } else {
        notification.style.background =
          "linear-gradient(120deg, var(--accent-purple), var(--accent-blue))";
      }
      notification.classList.add("show");
      setTimeout(() => {
        notification.classList.remove("show");
      }, 3000);
    }
  }

  /**
   * Parse domains from textarea
   * @param {string} text - Textarea content
   * @returns {string[]} - Array of normalized domains
   */
  function parseDomainList(text) {
    if (!text) return [];

    return text
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
      .map((domain) => {
        // Remove protocols and paths
        if (domain.includes("://")) {
          try {
            return new URL(domain).hostname.replace(/^www\./, "");
          } catch (e) {
            return domain;
          }
        }
        // Just remove www prefix if no protocol
        return domain.replace(/^www\./, "");
      });
  }

  // Save settings function
  async function saveSettings() {
    try {
      const newSettings = {
        theme: themeSelect.value,
        showWarning: warningToggle.checked,
        updateFrequency: updateFrequency.value,
        highlightTrusted: highlightTrustedToggle.checked,
        highlightUntrusted: highlightUntrustedToggle.checked,
        showWarningBanners: showWarningBannersToggle.checked,
        trustedColor: trustedColor.value,
        untrustedColor: untrustedColor.value,
        userTrustedDomains: parseDomainList(trustedDomains.value),
        userUntrustedDomains: parseDomainList(untrustedDomains.value),
      };

      // Save all settings explicitly to local storage
      await browserAPI.storage.local.set(newSettings);

      // Calculate the next update time based on the new frequency
      const nextUpdate = calculateNextUpdate(
        new Date().toISOString(),
        newSettings.updateFrequency
      );

      // Update lastUpdated to now and store the next update time
      await browserAPI.storage.local.set({
        nextUpdate,
        lastUpdated: new Date().toISOString(),
      });

      // Tell the background script to update its alarm
      await browserAPI.runtime.sendMessage({ action: "updateAlarm" });

      // Apply settings to all open tabs
      await browserAPI.runtime.sendMessage({ action: "refreshAllTabs" });

      // Show notification and update status
      showNotification("Settings saved and applied to all tabs!");
      await updateNextUpdateStatus();
    } catch (error) {
      console.error("Error saving settings:", error);
      showNotification("Error saving settings. Please try again.", true);
    }
  }

  // For debugging - can be called from the browser console
  window.checkCurrentSettings = async function () {
    try {
      const data = await browserAPI.storage.local.get(null); // Get all storage
      console.log("All stored settings:", data);
      return data;
    } catch (error) {
      console.error("Error retrieving settings:", error);
      return null;
    }
  };

  // Event listeners
  document.addEventListener("DOMContentLoaded", async () => {
    // First load settings to ensure we have the correct values
    await loadSettings();
    // Then load filter stats
    await loadFilterlistStats();
    // Explicitly update the update status to ensure it's not stuck
    await updateNextUpdateStatus();

    // Log current settings for debugging
    console.log("Current update frequency:", updateFrequency.value);
    await window.checkCurrentSettings();
  });

  saveButton.addEventListener("click", saveSettings);

  if (themeSelect) {
    themeSelect.addEventListener("change", (e) => {
      applyTheme(e.target.value);
    });
  }

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (themeSelect && themeSelect.value === "system") {
        applyTheme("system");
      }
    });

  browserAPI.runtime.onMessage.addListener((message) => {
    if (message.type === "filterlistUpdated") {
      loadFilterlistStats();
    }
  });

  setInterval(updateNextUpdateStatus, 60000);
});
