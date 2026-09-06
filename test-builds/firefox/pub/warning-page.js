document.addEventListener("DOMContentLoaded", async () => {
  "use strict";
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;
  const { renderTextWithLinks } = SafeGuard.pageUi;
  const params = new URLSearchParams(window.location.search);
  // URLSearchParams already decodes query values. A second decode corrupts literal percent signs.
  const unsafeUrl = params.get("url") || "unknown site";
  const reasonText = document.getElementById("reasonText");
  const reasonContainer = document.getElementById("reasonContainer");
  const proceed = document.getElementById("proceed");
  document.getElementById("unsafeUrl").textContent = unsafeUrl;

  function showReason(reason) {
    if (!reason) return;
    renderTextWithLinks(reasonText, reason);
    reasonContainer.style.display = "block";
  }

  showReason(params.get("reason"));
  document
    .getElementById("goBack")
    .addEventListener("click", () => window.history.go(-2));
  proceed.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to proceed? This site may be unsafe."))
      return;
    proceed.disabled = true;
    try {
      const [tab] = await browserAPI.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!Number.isInteger(tab?.id))
        throw new Error("The current tab is unavailable");
      const response = await browserAPI.runtime.sendMessage({
        action: "approveSite",
        tabId: tab.id,
        url: unsafeUrl,
      });
      if (response?.status !== "approved")
        throw new Error(response?.error || "Approval failed");
      await browserAPI.tabs.update(tab.id, { url: unsafeUrl });
    } catch (error) {
      console.error("Unable to proceed to site:", error);
      showReason("Unable to open this site. Please try again.");
    } finally {
      proceed.disabled = false;
    }
  });

  if (!params.get("reason")) {
    try {
      const response = await browserAPI.runtime.sendMessage({
        action: "getSiteStatus",
        url: unsafeUrl,
      });
      showReason(response?.reason);
    } catch (error) {
      console.error("Unable to load unsafe-site reason:", error);
    }
  }
});
