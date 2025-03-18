document.addEventListener("DOMContentLoaded", async () => {
  console.log("Popup loaded, preparing to check site status...");

  const statusIcon = document.getElementById("status-icon");
  const statusMessage = document.getElementById("status-message");
  const errorMessage = document.getElementById("error-message");

  const browserAPI = typeof browser !== "undefined" ? browser : chrome;

  const warningPageUrl = browserAPI.runtime.getURL("pub/warning-page.html");
  const settingsPageUrl = browserAPI.runtime.getURL("pub/settings-page.html");
  const welcomePageUrl = browserAPI.runtime.getURL("pub/welcome-page.html");

  async function applyTheme() {
    try {
      const { theme } = await browserAPI.storage.sync.get("theme");
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      document.body.setAttribute(
        "data-theme",
        theme || (prefersDark ? "dark" : "light")
      );
    } catch (error) {
      console.error("Error applying theme:", error);
    }
  }
  await applyTheme();

  try {
    const [activeTab] = await browserAPI.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab || !activeTab.url) {
      throw new Error("No active tab found or URL is unavailable.");
    }

    const currentUrl = activeTab.url;
    const rootUrl = extractRootUrl(currentUrl);

    if (
      currentUrl.startsWith(warningPageUrl) ||
      currentUrl === settingsPageUrl ||
      currentUrl === welcomePageUrl
    ) {
      handleStatusUpdate("extension_page", currentUrl);
      return;
    }

    // Send both the full URL and root URL to the background for status checking
    const response = await browserAPI.runtime.sendMessage({
      action: "checkSiteStatus",
      url: currentUrl, // full path URL
      rootUrl: rootUrl, // root domain URL
    });

    if (!response || !response.status) {
      throw new Error(
        "Failed to retrieve site status from the background script."
      );
    }

    // Display the appropriate URL in the popup
    const displayUrl = response.matchedUrl || rootUrl;
    handleStatusUpdate(response.status, displayUrl);
  } catch (error) {
    console.error("Error while checking site status:", error);
    errorMessage.textContent = `Error: ${error.message}`;
    updateUI("error", "An error occurred while retrieving the site status.");
  }

  function handleStatusUpdate(status, displayUrl) {
    let message;

    switch (status) {
      case "unsafe":
        message = `${displayUrl} is flagged as <strong>unsafe</strong>. Be cautious when interacting with this site.`;
        break;
      case "potentially_unsafe":
        message = `${displayUrl} is <strong>potentially unsafe</strong>. Proceed with caution.`;
        break;
      case "fmhy":
        message = `${displayUrl} is an <strong>FMHY</strong> related site. Proceed confidently.`;
        break;
      case "safe":
        message = `${displayUrl} is <strong>safe</strong> to browse.`;
        break;
      case "starred":
        message = `${displayUrl} is a <strong>starred</strong> site.`;
        break;
      case "extension_page":
        if (displayUrl.startsWith(warningPageUrl)) {
          message =
            "You are on the <strong>Warning Page</strong>. This page warns you about potentially unsafe sites.";
        } else if (displayUrl === settingsPageUrl) {
          message =
            "This is the <strong>Settings Page</strong> of the extension. Customize your preferences here.";
        } else if (displayUrl === welcomePageUrl) {
          message =
            "Welcome to <strong>FMHY SafeGuard</strong>! Explore the extension's features and get started.";
        } else {
          message = "This is an <strong>extension page</strong>.";
        }
        break;
      case "no_data":
        message = `No data available for <strong>${displayUrl}</strong>.`;
        break;
      default:
        message = `An unknown status was received for <strong>${displayUrl}</strong>.`;
    }

    updateUI(status, message);
  }

  function updateUI(status, message) {
    const icons = {
      unsafe: "../res/icons/unsafe.png",
      potentially_unsafe: "../res/icons/potentially_unsafe.png",
      fmhy: "../res/icons/fmhy.png",
      safe: "../res/icons/safe.png",
      starred: "../res/icons/starred.png",
      extension_page: "../res/ext_icon_144.png",
      no_data: "../res/ext_icon_144.png",
      error: "../res/icons/error.png",
      unknown: "../res/ext_icon_144.png",
    };

    statusIcon.src = icons[status] || icons["unknown"];
    statusMessage.innerHTML = message || "An unknown error occurred.";

    statusIcon.classList.add("active");
    setTimeout(() => statusIcon.classList.remove("active"), 300);

    console.log(`UI updated: ${message}`);
  }

  document.getElementById("settingsButton").addEventListener("click", () => {
    browserAPI.runtime.openOptionsPage();
  });

  function extractRootUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch (error) {
      console.warn(`Failed to extract root URL from: ${url}`);
      return url;
    }
  }
});
