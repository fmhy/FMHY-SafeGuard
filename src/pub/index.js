document.addEventListener("DOMContentLoaded", async () => {
  console.log("Popup loaded, preparing to check site status...");

  const statusIcon = document.getElementById("status-icon");
  const statusMessage = document.getElementById("status-message");
  const errorMessage = document.getElementById("error-message");

  const browserAPI = typeof browser !== "undefined" ? browser : chrome;

  const warningPageUrl = browserAPI.runtime.getURL("pub/warning-page.html");
  const settingsPageUrl = browserAPI.runtime.getURL("pub/settings-page.html");
  const welcomePageUrl = browserAPI.runtime.getURL("pub/welcome-page.html");

  // Apply theme
  await applyTheme();

  // Check site status immediately
  await checkSiteStatus();

  // Add settings button listener
  document.getElementById("settingsButton").addEventListener("click", () => {
    browserAPI.runtime.openOptionsPage();
  });

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

  async function checkSiteStatus() {
    console.log("Checking site status from popup");
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
      console.log("Current URL:", currentUrl);
      console.log("Root URL:", rootUrl);

      // Handle extension pages
      if (
        currentUrl.startsWith(warningPageUrl) ||
        currentUrl === settingsPageUrl ||
        currentUrl === welcomePageUrl ||
        currentUrl.startsWith(browserAPI.runtime.getURL(""))
      ) {
        handleStatusUpdate("extension_page", currentUrl);
        return;
      }

      // Get the status from the background script
      const response = await browserAPI.runtime.sendMessage({
        action: "getSiteStatus",
        url: currentUrl,
      });

      console.log("Status response:", response);
      if (!response || !response.status) {
        throw new Error("Failed to get site status");
      }

      // Determine what URL to display
      let displayUrl;

      // If we have a matched URL from the background, format it appropriately
      if (response.matchedUrl) {
        try {
          const matchedUrlObj = new URL(response.matchedUrl);
          const currentUrlObj = new URL(currentUrl);
          const isRepoSite = [
            "github.com",
            "gitlab.com",
            "sourceforge.net",
          ].some(
            (domain) =>
              matchedUrlObj.hostname === domain ||
              matchedUrlObj.hostname.endsWith("." + domain)
          );

          if (isRepoSite) {
            // For repo sites, extract the domain and path parts that were matched
            const pathParts = matchedUrlObj.pathname
              .split("/")
              .filter((p) => p);
            if (pathParts.length >= 2) {
              displayUrl = `${matchedUrlObj.hostname}/${pathParts[0]}/${pathParts[1]}`;
            } else {
              // If the matched URL doesn't have enough path parts but current URL does,
              // use the current URL's path for better display (but only for no_data status)
              if (response.status === "no_data") {
                const currentPathParts = currentUrlObj.pathname
                  .split("/")
                  .filter((p) => p);
                if (currentPathParts.length >= 2) {
                  displayUrl = `${currentUrlObj.hostname}/${currentPathParts[0]}/${currentPathParts[1]}`;
                } else {
                  displayUrl = matchedUrlObj.hostname + matchedUrlObj.pathname;
                }
              } else {
                displayUrl = matchedUrlObj.hostname + matchedUrlObj.pathname;
              }
            }
          } else {
            // For regular sites, just show the hostname from the matched URL
            displayUrl = matchedUrlObj.hostname;
          }
        } catch (e) {
          console.error("Error formatting matched URL:", e);
          displayUrl = response.matchedUrl;
        }
      } else {
        // Fallback to current URL if no match
        const urlObj = new URL(currentUrl);
        const isRepoSite = ["github.com", "gitlab.com", "sourceforge.net"].some(
          (domain) =>
            urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain)
        );

        if (isRepoSite) {
          // For repo sites, extract the domain and first two path segments (user/repo)
          const pathParts = urlObj.pathname.split("/").filter((p) => p);
          if (pathParts.length >= 2) {
            displayUrl = `${urlObj.hostname}/${pathParts[0]}/${pathParts[1]}`;
          } else {
            displayUrl = urlObj.hostname + urlObj.pathname;
          }
        } else {
          // For regular sites, just show the hostname
          displayUrl = urlObj.hostname;
        }
      }

      // Update the popup with the result
      handleStatusUpdate(response.status, displayUrl);
    } catch (error) {
      console.error("Error checking site status:", error);
      errorMessage.textContent = `Error: ${error.message}`;
      updateUI("error", "An error occurred while checking the site status");
    }
  }

  function handleStatusUpdate(status, displayUrl) {
    let message;

    switch (status) {
      case "unsafe":
        message = `${displayUrl} is flagged as <strong>unsafe</strong>. Its Recommended To Avoid this Site.`;
        break;
      case "potentially_unsafe":
        message = `${displayUrl} is <strong>potentially unsafe</strong>. Proceed with caution.`;
        break;
      case "fmhy":
        message = `${displayUrl} is a <strong>FMHY</strong> related site. Proceed confidently.`;
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
