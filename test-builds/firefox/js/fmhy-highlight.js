(() => {
  "use strict";

  const browserAPI = typeof browser !== "undefined" ? browser : chrome;

  function normalizeResourceUrl(value) {
    try {
      const url = new URL(value);
      url.hash = "";
      return url.href.replace(/\/+$/, "");
    } catch (error) {
      return null;
    }
  }

  function findMatchingResult(targetUrl) {
    const matchingLink = Array.from(
      document.querySelectorAll(".vp-doc a[href]"),
    ).find((link) => normalizeResourceUrl(link.href) === targetUrl);
    return matchingLink?.closest("li, p") || null;
  }

  function waitForMatchingResult(targetUrl, timeoutMs = 10000) {
    const existingResult = findMatchingResult(targetUrl);
    if (existingResult) return Promise.resolve(existingResult);

    return new Promise((resolve) => {
      let timeoutId;
      const observer = new MutationObserver(() => {
        const resultLine = findMatchingResult(targetUrl);
        if (!resultLine) return;
        observer.disconnect();
        clearTimeout(timeoutId);
        resolve(resultLine);
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  async function highlightPendingResource() {
    const { pendingFmhyHighlight } = await browserAPI.storage.local.get(
      "pendingFmhyHighlight",
    );
    if (!pendingFmhyHighlight) return;

    const isFresh = Date.now() - pendingFmhyHighlight.createdAt < 30000;
    const currentPage = `${location.origin}${location.pathname}${location.hash}`;
    if (!isFresh || currentPage !== pendingFmhyHighlight.fmhyUrl) return;

    const targetUrl = normalizeResourceUrl(pendingFmhyHighlight.resourceUrl);
    const resultLine = await waitForMatchingResult(targetUrl);
    if (!resultLine) return;

    await browserAPI.storage.local.remove("pendingFmhyHighlight");
    resultLine.scrollIntoView({ block: "center", behavior: "auto" });
    resultLine.classList.add("vp-search-highlight-target");
    setTimeout(
      () => resultLine.classList.remove("vp-search-highlight-target"),
      2000,
    );
  }

  highlightPendingResource().catch((error) =>
    console.error("[FMHY SafeGuard] Unable to highlight FMHY resource:", error),
  );
})();
