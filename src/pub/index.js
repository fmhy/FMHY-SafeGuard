document.addEventListener("DOMContentLoaded", async () => {
  console.log("Popup loaded, preparing to check site status...");

  const statusIcon = document.getElementById("status-icon");
  const statusMessage = document.getElementById("status-message");
  const errorMessage = document.getElementById("error-message");
  const reasonContainer = document.getElementById("reason-container");
  const reasonContent = document.getElementById("reason-content");
  const noteContainer = document.getElementById("note-container");
  const noteContent = document.getElementById("note-content");

  const browserAPI = typeof browser !== "undefined" ? browser : chrome;

  const warningPageUrl = browserAPI.runtime.getURL("pub/warning-page.html");
  const settingsPageUrl = browserAPI.runtime.getURL("pub/settings-page.html");
  const welcomePageUrl = browserAPI.runtime.getURL("pub/welcome-page.html");

  // Apply theme
  await applyTheme();

  // Wait for i18n to be ready
  if (window.i18n && window.i18n.ready) {
    await window.i18n.ready;
  }

  // Check site status immediately
  await checkSiteStatus();

  // Check for notes for this site
  await fetchNoteForSite();

  // Add settings button listener
  document.getElementById("settingsButton").addEventListener("click", () => {
    browserAPI.runtime.openOptionsPage();
  });

  async function applyTheme() {
    try {
      const { theme } = await browserAPI.storage.local.get("theme");
      if (theme && theme !== "system") {
        // Apply specific theme (dark, light, or amoled)
        document.body.setAttribute("data-theme", theme);
      } else {
        // System default - detect preference
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;
        document.body.setAttribute("data-theme", prefersDark ? "dark" : "light");
      }
    } catch (error) {
      console.error("Error applying theme:", error);
    }
  }

  // Simple markdown to HTML converter
  function parseMarkdown(md) {
    if (!md) return "";

    // Store images/links to protect from URL linking
    const imgTags = [];
    const markdownLinks = [];

    let result = md
      // Remove the main header (#### Title) since we show "FMHY Note" already
      .replace(/^#{1,4}\s+.*$/gm, '')
      // Trim leading/trailing whitespace
      .trim();

    // Protect HTML img tags from URL linking
    result = result.replace(/<img[^>]*>/gi, (match) => {
      imgTags.push(match);
      return `[[HTMLIMG_${imgTags.length - 1}]]`;
    });

    // Convert markdown images ![alt](url) to placeholder
    result = result.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => {
      imgTags.push(`<img src="${url}" alt="${alt}" />`);
      return `[[HTMLIMG_${imgTags.length - 1}]]`;
    });

    result = result
      // Bold (must come before italic)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Markdown links [text](url) - use placeholder to avoid double-linking
      .replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
        markdownLinks.push(`<a href="${url}" target="_blank">${text}</a>`);
        return `[[MDLINK_${markdownLinks.length - 1}]]`;
      });

    // Raw URLs (convert before restoring markdown links and images)
    result = result.replace(/(https?:\/\/[^\s<>\)\]]+)/g, '<a href="$1" target="_blank">$1</a>');

    // Restore markdown links from placeholders
    result = result.replace(/\[\[MDLINK_(\d+)\]\]/g, (match, index) => markdownLinks[parseInt(index)]);

    // Restore images from placeholders
    result = result.replace(/\[\[HTMLIMG_(\d+)\]\]/g, (match, index) => imgTags[parseInt(index)]);

    result = result
      // Code
      .replace(/`(.*?)`/g, '<code>$1</code>')
      // List items - convert to proper list
      .replace(/^[\*\-]\s+(.*)$/gm, '<li>$1</li>');

    // Wrap consecutive li tags in ul
    result = result.replace(/(<li>.*?<\/li>\s*)+/gs, '<ul>$&</ul>');

    // Convert double newlines to paragraph breaks
    result = result.replace(/\n\n+/g, '</p><p>');

    // Convert single newlines to line breaks
    result = result.replace(/\n/g, '<br>');

    // Wrap in paragraph if content exists
    if (result.trim()) {
      result = '<p>' + result + '</p>';
      // Clean up empty paragraphs
      result = result.replace(/<p>\s*<\/p>/g, '');
    }

    return result;
  }

  // Fetch and display note for current site
  async function fetchNoteForSite() {
    console.log("fetchNoteForSite: Starting note fetch...");
    try {
      const [activeTab] = await browserAPI.tabs.query({
        active: true,
        currentWindow: true,
      });

      console.log("fetchNoteForSite: Active tab:", activeTab?.url);

      if (!activeTab || !activeTab.url) {
        console.log("fetchNoteForSite: No active tab or URL");
        return;
      }

      // Skip extension pages
      if (activeTab.url.startsWith(browserAPI.runtime.getURL(""))) {
        console.log("fetchNoteForSite: Skipping extension page");
        return;
      }

      console.log("fetchNoteForSite: Sending message to background...");

      // Use callback style for better cross-browser compatibility
      browserAPI.runtime.sendMessage(
        { action: "getNoteForSite", url: activeTab.url },
        (response) => {
          console.log("fetchNoteForSite: Got response in callback:", response);

          if (browserAPI.runtime.lastError) {
            console.error("fetchNoteForSite: Runtime error:", browserAPI.runtime.lastError);
            return;
          }

          if (response && response.note) {
            const htmlContent = parseMarkdown(response.note);
            console.log("fetchNoteForSite: Parsed HTML:", htmlContent.substring(0, 100));
            noteContent.innerHTML = htmlContent;
            noteContainer.classList.add("visible");
            console.log(`fetchNoteForSite: Displayed note for: ${response.slug}`);
          } else {
            console.log("fetchNoteForSite: No note found or null response");
            noteContainer.classList.remove("visible");
          }
        }
      );
    } catch (error) {
      console.error("fetchNoteForSite: Error:", error);
      noteContainer.classList.remove("visible");
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
        await new Promise(resolve => setTimeout(resolve, 100));
        response = await browserAPI.runtime.sendMessage({
          action: "getSiteStatus",
          url: currentUrl,
        });
      }

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
      handleStatusUpdate(response.status, displayUrl, response.reason, response.password, response.inviteCode);
    } catch (error) {
      console.error("Error checking site status:", error);
      errorMessage.textContent = `Error: ${error.message}`;
      updateUI("error", "An error occurred while checking the site status");
    }
  }

  function handleStatusUpdate(status, displayUrl, reason, password, inviteCode) {
    let message;

    // Handle reason display in dedicated container
    if (reason && (status === "unsafe" || status === "potentially_unsafe")) {
      // Convert URLs to clickable links
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const formattedReason = reason.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
      reasonContent.innerHTML = formattedReason;
      reasonContainer.classList.add("visible");
    } else {
      reasonContainer.classList.remove("visible");
    }

    // Handle password display
    const passwordContainer = document.getElementById("password-container");
    const passwordText = document.getElementById("password-text");
    const passwordContent = document.getElementById("password-content");
    if (password && passwordContainer && passwordText) {
      passwordText.textContent = password;
      passwordContainer.classList.add("visible");
      // Add click-to-copy functionality
      passwordContent.onclick = async () => {
        try {
          await navigator.clipboard.writeText(password);
          passwordContent.classList.add("copied");
          setTimeout(() => passwordContent.classList.remove("copied"), 1000);
        } catch (err) {
          console.error("Failed to copy password:", err);
        }
      };
    } else if (passwordContainer) {
      passwordContainer.classList.remove("visible");
    }

    // Handle invite code display
    const inviteCodeContainer = document.getElementById("invite-code-container");
    const inviteCodeText = document.getElementById("invite-code-text");
    const inviteCodeContent = document.getElementById("invite-code-content");
    if (inviteCode && inviteCodeContainer && inviteCodeText) {
      inviteCodeText.textContent = inviteCode;
      inviteCodeContainer.classList.add("visible");
      // Add click-to-copy functionality
      inviteCodeContent.onclick = async () => {
        try {
          await navigator.clipboard.writeText(inviteCode);
          inviteCodeContent.classList.add("copied");
          setTimeout(() => inviteCodeContent.classList.remove("copied"), 1000);
        } catch (err) {
          console.error("Failed to copy invite code:", err);
        }
      };
    } else if (inviteCodeContainer) {
      inviteCodeContainer.classList.remove("visible");
    }

    // Use i18n for status messages if available
    const getMessage = window.i18n ? window.i18n.getMessage : (key, sub) => null;

    switch (status) {
      case "unsafe":
        message = getMessage("statusUnsafe", displayUrl) || `${displayUrl} is flagged as <strong>unsafe</strong>. It's recommended to avoid this site.`;
        break;
      case "potentially_unsafe":
        message = getMessage("statusPotentiallyUnsafe", displayUrl) || `${displayUrl} is <strong>potentially unsafe</strong>. Proceed with caution.`;
        break;
      case "fmhy":
        message = getMessage("statusFmhy", displayUrl) || `${displayUrl} is an <strong>FMHY</strong> related site. Proceed confidently.`;
        break;
      case "safe":
        message = getMessage("statusSafe", displayUrl) || `${displayUrl} is <strong>safe</strong> to browse.`;
        break;
      case "starred":
        message = getMessage("statusStarred", displayUrl) || `${displayUrl} is a <strong>starred</strong> site.`;
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
        message = getMessage("statusNoData", displayUrl) || `No data available for <strong>${displayUrl}</strong>.`;
        break;
      default:
        message = getMessage("statusUnknown", displayUrl) || `${displayUrl} is not in our database.`;
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
