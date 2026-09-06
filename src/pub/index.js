document.addEventListener("DOMContentLoaded", async () => {
  const statusIcon = document.getElementById("status-icon");
  const statusMessage = document.getElementById("status-message");
  const fmhyResourceLink = document.getElementById("fmhy-resource-link");
  const errorMessage = document.getElementById("error-message");
  const reasonContainer = document.getElementById("reason-container");
  const reasonContent = document.getElementById("reason-content");
  const noteContainer = document.getElementById("note-container");
  const noteContent = document.getElementById("note-content");
  const noteMarkupTags = [
    "P",
    "STRONG",
    "EM",
    "A",
    "IMG",
    "CODE",
    "LI",
    "UL",
    "BR",
  ];

  const browserAPI = typeof browser !== "undefined" ? browser : chrome;
  const {
    renderTextWithLinks,
    formatDisplayUrl,
    parseMarkdown,
    showCopyableValue,
  } = SafeGuard.pageUi;
  document.getElementById("settingsButton").addEventListener("click", () => {
    browserAPI.runtime.openOptionsPage();
  });
  let activeTab;
  try {
    [activeTab] = await browserAPI.tabs.query({
      active: true,
      currentWindow: true,
    });
  } catch (error) {
    errorMessage.textContent = `Error: ${error.message}`;
  }
  async function fetchNoteForSite() {
    if (
      !activeTab?.url ||
      activeTab.url.startsWith(browserAPI.runtime.getURL(""))
    )
      return;
    try {
      const response = await browserAPI.runtime.sendMessage({
        action: "getNoteForSite",
        url: activeTab.url,
      });
      if (response?.note) {
        window.i18n.renderSanitizedMarkup(
          noteContent,
          parseMarkdown(response.note),
          noteMarkupTags,
        );
        noteContainer.classList.add("visible");
      } else {
        noteContainer.classList.remove("visible");
      }
    } catch (error) {
      console.error("Error loading FMHY note:", error);
      noteContainer.classList.remove("visible");
    }
  }

  const warningPageUrl = browserAPI.runtime.getURL("pub/warning-page.html");
  const settingsPageUrl = browserAPI.runtime.getURL("pub/settings-page.html");
  const welcomePageUrl = browserAPI.runtime.getURL("pub/welcome-page.html");
  let fmhyLinkContext = null;

  fmhyResourceLink.addEventListener("click", async (event) => {
    if (!fmhyLinkContext) return;
    event.preventDefault();
    await browserAPI.storage.local.set({
      pendingFmhyHighlight: {
        ...fmhyLinkContext,
        createdAt: Date.now(),
      },
    });
    await browserAPI.tabs.create({ url: fmhyLinkContext.fmhyUrl });
  });

  // Apply theme
  const { theme } = await SafeGuard.settings.read(browserAPI.storage.local);
  SafeGuard.settings.applyTheme(theme);

  // Wait for i18n to be ready
  if (window.i18n && window.i18n.ready) {
    await window.i18n.ready;
  }

  // Check site status immediately
  await checkSiteStatus();

  // Check for notes for this site
  await fetchNoteForSite();

  async function checkSiteStatus() {
    try {
      if (!activeTab || !activeTab.url) {
        throw new Error("No active tab found or URL is unavailable.");
      }

      const currentUrl = activeTab.url;

      // Handle browser internal pages (newtab, settings, etc.)
      if (
        currentUrl.startsWith("chrome://") ||
        currentUrl.startsWith("about:") ||
        currentUrl.startsWith("edge://") ||
        currentUrl.startsWith("brave://") ||
        currentUrl.startsWith("opera://") ||
        currentUrl.startsWith("vivaldi://")
      ) {
        handleStatusUpdate("browser_page", currentUrl);
        return;
      }

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
      let response;
      try {
        response = await browserAPI.runtime.sendMessage({
          action: "getSiteStatus",
          url: currentUrl,
        });
      } catch (msgError) {
        console.warn("Message send failed, retrying...", msgError);
        // Retry once after a short delay (background script may be initializing)
        await new Promise((resolve) => setTimeout(resolve, 100));
        response = await browserAPI.runtime.sendMessage({
          action: "getSiteStatus",
          url: currentUrl,
        });
      }

      if (!response || !response.status || response.status === "error") {
        throw new Error("Failed to get site status");
      }

      const displayUrl = formatDisplayUrl(response, currentUrl);

      // Update the popup with the result
      handleStatusUpdate(
        response.status,
        displayUrl,
        response.reason,
        response.password,
        response.inviteCode,
        response.fmhyUrl,
        response.matchedUrl,
      );
    } catch (error) {
      console.error("Error checking site status:", error);
      errorMessage.textContent = `Error: ${error.message}`;
      updateUI("error", "An error occurred while checking the site status");
    }
  }

  function handleStatusUpdate(
    status,
    displayUrl,
    reason,
    password,
    inviteCode,
    fmhyUrl,
    resourceUrl,
  ) {
    let message;

    if (fmhyUrl && (status === "safe" || status === "starred")) {
      fmhyResourceLink.href = fmhyUrl;
      fmhyResourceLink.classList.add("visible");
      fmhyLinkContext = { fmhyUrl, resourceUrl };
    } else {
      fmhyResourceLink.removeAttribute("href");
      fmhyResourceLink.classList.remove("visible");
      fmhyLinkContext = null;
    }

    // Handle reason display in dedicated container
    if (reason && (status === "unsafe" || status === "potentially_unsafe")) {
      renderTextWithLinks(reasonContent, reason);
      reasonContainer.classList.add("visible");
    } else {
      reasonContainer.classList.remove("visible");
    }

    showCopyableValue("password", password);
    showCopyableValue("invite-code", inviteCode);

    // Use i18n for status messages if available
    const getMessage = window.i18n
      ? window.i18n.getMessage
      : (key, sub) => null;

    switch (status) {
      case "unsafe":
        message =
          getMessage("statusUnsafe", displayUrl) ||
          `${displayUrl} is flagged as <strong>unsafe</strong>. It's recommended to avoid this site.`;
        break;
      case "potentially_unsafe":
        message =
          getMessage("statusPotentiallyUnsafe", displayUrl) ||
          `${displayUrl} is <strong>potentially unsafe</strong>. Proceed with caution.`;
        break;
      case "fmhy":
        message =
          getMessage("statusFmhy", displayUrl) ||
          `${displayUrl} is an <strong>FMHY</strong> related site. Proceed confidently.`;
        break;
      case "safe":
        message =
          getMessage("statusSafe", displayUrl) ||
          `${displayUrl} is <strong>safe</strong> to browse.`;
        break;
      case "starred":
        message =
          getMessage("statusStarred", displayUrl) ||
          `${displayUrl} is a <strong>starred</strong> site.`;
        break;
      case "browser_page":
        message = "This is a <strong>browser page</strong>.";
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
        message =
          getMessage("statusNoData", displayUrl) ||
          `No data available for <strong>${displayUrl}</strong>.`;
        break;
      default:
        message =
          getMessage("statusUnknown", displayUrl) ||
          `${displayUrl} is not in our database.`;
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
      browser_page: "../res/ext_icon_144.png",
      extension_page: "../res/ext_icon_144.png",
      no_data: "../res/icons/default.png",
      error: "../res/icons/error.png",
      unknown: "../res/icons/default.png",
    };

    statusIcon.src = icons[status] || icons["unknown"];
    statusIcon.alt =
      status === "no_data" ? "Not listed in FMHY" : "Site status";
    window.i18n.renderSanitizedMarkup(
      statusMessage,
      message || "An unknown error occurred.",
    );

    statusIcon.classList.add("active");
    setTimeout(() => statusIcon.classList.remove("active"), 300);
  }
});
