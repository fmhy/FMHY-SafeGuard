globalThis.SafeGuard ||= {};
SafeGuard.createLinkRenderer = (getSettings) => {
  "use strict";
  const { normalizeDomain } = SafeGuard.settings;
  const originals = new WeakMap();
  const badges = new WeakMap();
  function remember(link) {
    if (!originals.has(link))
      originals.set(link, {
        textShadow: link.style.textShadow,
        fontWeight: link.style.fontWeight,
      });
  }
  function clear(link) {
    const original = originals.get(link);
    if (original) {
      link.style.textShadow = original.textShadow;
      link.style.fontWeight = original.fontWeight;
      originals.delete(link);
    }
    badges.get(link)?.remove();
    badges.delete(link);
    link.removeAttribute("data-fmhy-unsafe");
    link.removeAttribute("data-fmhy-safe");
    link.removeAttribute("data-fmhy-processed");
  }
  function clearAll() {
    document.querySelectorAll("a[data-fmhy-processed]").forEach(clear);
    document
      .querySelectorAll(".fmhy-unsafe-badge")
      .forEach((badge) => badge.remove());
  }
  function setUnsafeBadgeContent(badge, reason) {
    badge.replaceChildren();
    const icon = document.createElement("span");
    icon.style.cssText = "display: inline-block; font-size: 14px;";
    icon.textContent = "⚠️";
    badge.append(
      icon,
      document.createTextNode(
        ` FMHY Unsafe Site${reason ? `: ${reason}` : ""}`,
      ),
    );
  }

  function ensureBraveStyles() {
    let style = document.getElementById("fmhy-brave-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "fmhy-brave-style";
      document.head.appendChild(style);
    }

    style.textContent = `
    a[data-fmhy-unsafe="true"] {
      text-shadow: 0 0 4px ${getSettings().untrustedColor} !important;
      font-weight: bold !important;
    }

    a[data-fmhy-safe="true"] {
      text-shadow: 0 0 4px ${getSettings().trustedColor} !important;
      font-weight: bold !important;
    }

    .fmhy-unsafe-badge {
      display: inline-block !important;
      color: #ffffff !important;
      background-color: #ff0000 !important;
      border-radius: 4px !important;
      padding: 0 5px !important;
      font-size: 12px !important;
      font-weight: bold !important;
      white-space: nowrap !important;
      min-width: 95px !important;
      width: fit-content !important;
    }
  `;
  }

  function highlightLink(link, type) {
    remember(link);
    const color =
      type === "trusted"
        ? getSettings().trustedColor
        : getSettings().untrustedColor;
    link.style.textShadow = `0 0 4px ${color}`;
    link.style.fontWeight = "bold";
  }

  // Add a warning banner after an unsafe link
  function addWarningBanner(link, reason = null) {
    remember(link);
    const currentDomain = normalizeDomain(window.location.hostname);

    // Prefer result metadata on Brave, with normal inline placement as fallback.
    if (currentDomain.includes("brave")) {
      try {
        // Find the closest search result container
        const resultContainer = link.closest("article, li, .snippet");

        // Brave displays site-level badges beside its result metadata.
        const siteDiv = resultContainer?.querySelector(".site");

        if (siteDiv) {
          // Check if we already added a badge to this site div
          if (!siteDiv.querySelector(".fmhy-unsafe-badge")) {
            const badge = document.createElement("span");
            badge.className = "fmhy-unsafe-badge";
            setUnsafeBadgeContent(badge, reason);
            siteDiv.appendChild(badge);
            badges.set(link, badge);
          }
          return;
        }
      } catch (e) {
        console.error("[FMHY SafeGuard] Error styling Brave Search link:", e);
      }
    }

    // For all other search engines, create a badge element
    const badge = document.createElement("span");
    Object.assign(badge.style, {
      backgroundColor: "#ff0000",
      color: "#fff",
      padding: "2px 6px",
      fontWeight: "bold",
      borderRadius: "4px",
      fontSize: "12px",
      display: "inline-block",
      transform: "rotate(180deg) scaleX(-1) !important",
      WebkitTransform: "rotate(180deg) scaleX(-1) !important",
      msTransform: "rotate(180deg) scaleX(-1) !important",
      position: "relative",
      zIndex: "9999",
    });

    badge.className = "fmhy-unsafe-badge";
    badges.set(link, badge);

    // Add the warning icon and text
    setUnsafeBadgeContent(badge, reason);

    // Google-specific margin adjustment
    if (currentDomain.includes("google")) {
      badge.style.margin = "0 15px";
    }

    // Different insertion strategy for Google vs other engines
    if (currentDomain.includes("google")) {
      // For Google, find a suitable container
      let container = link;
      let parent = link.parentElement;

      // Look for a suitable container
      for (let i = 0; i < 3 && parent; i++) {
        if (
          parent.tagName === "DIV" ||
          parent.tagName === "LI" ||
          parent.querySelector("cite") ||
          parent.querySelector(".link")
        ) {
          container = parent;
          break;
        }
        parent = parent.parentElement;
      }

      // Try to place after cite element if it exists
      const citeElement = container.querySelector("cite");
      if (citeElement) {
        citeElement.after(badge);
      } else {
        // Insert after the title
        const resultTitle =
          container.querySelector("h3") ||
          container.querySelector("a[href]") ||
          link;
        if (resultTitle.nextSibling) {
          container.insertBefore(badge, resultTitle.nextSibling);
        } else {
          container.appendChild(badge);
        }
      }
    } else {
      // For other search engines, use the simple approach
      link.after(badge);
    }
  }

  return {
    clear,
    clearAll,
    highlightLink,
    addWarningBanner,
    ensureBraveStyles,
  };
};
