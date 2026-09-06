// Loaded as a classic script in both browser workers and extension pages.
globalThis.SafeGuard ||= {};
SafeGuard.pageUi = (() => {
  "use strict";

  function formatHostAndPath(urlObj) {
    return (
      urlObj.hostname +
      urlObj.pathname.replace(/\/+$/, "") +
      urlObj.search +
      urlObj.hash
    );
  }

  function renderTextWithLinks(container, text) {
    container.replaceChildren();
    const urlRegex = /https?:\/\/[^\s]+/g;
    let lastIndex = 0;

    for (const match of text.matchAll(urlRegex)) {
      container.append(
        document.createTextNode(text.slice(lastIndex, match.index)),
      );
      const url = match[0];
      const link = document.createElement("a");
      link.href = url;
      link.textContent = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      container.append(link);
      lastIndex = match.index + url.length;
    }

    container.append(document.createTextNode(text.slice(lastIndex)));
  }

  const DEFAULT_ALLOWED_MARKUP = ["STRONG"];

  function isSafeRemoteUrl(value) {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch (error) {
      return false;
    }
  }

  function sanitizeMarkupNode(sourceNode, allowedTags) {
    if (sourceNode.nodeType === 3) {
      return document.createTextNode(sourceNode.textContent);
    }

    const fragment = document.createDocumentFragment();
    if (sourceNode.nodeType !== 1) return fragment;

    const tagName = sourceNode.tagName.toUpperCase();
    const destination = allowedTags.has(tagName)
      ? document.createElement(tagName.toLowerCase())
      : fragment;

    if (tagName === "A" && destination !== fragment) {
      const href = sourceNode.getAttribute("href");
      if (isSafeRemoteUrl(href)) {
        destination.href = href;
        destination.target = "_blank";
        destination.rel = "noopener noreferrer";
      } else {
        for (const child of sourceNode.childNodes) {
          fragment.append(sanitizeMarkupNode(child, allowedTags));
        }
        return fragment;
      }
    } else if (tagName === "IMG" && destination !== fragment) {
      const src = sourceNode.getAttribute("src");
      if (!isSafeRemoteUrl(src)) return fragment;
      destination.src = src;
      destination.alt = sourceNode.getAttribute("alt") || "";
      destination.loading = "lazy";
      destination.referrerPolicy = "no-referrer";
    }

    for (const child of sourceNode.childNodes) {
      destination.append(sanitizeMarkupNode(child, allowedTags));
    }

    return destination;
  }

  function renderSanitizedMarkup(
    container,
    markup,
    allowedTagNames = DEFAULT_ALLOWED_MARKUP,
  ) {
    const parsedDocument = new DOMParser().parseFromString(
      String(markup || ""),
      "text/html",
    );
    const allowedTags = new Set(allowedTagNames);
    const content = document.createDocumentFragment();

    for (const child of parsedDocument.body.childNodes) {
      content.append(sanitizeMarkupNode(child, allowedTags));
    }

    container.replaceChildren(content);
  }

  function parseMarkdown(md) {
    if (!md) return "";

    // Store images/links to protect from URL linking
    const imgTags = [];
    const markdownLinks = [];

    let result = md
      // Remove the main header (#### Title) since we show "FMHY Note" already
      .replace(/^#{1,4}\s+.*$/gm, "")
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
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      // Markdown links [text](url) - use placeholder to avoid double-linking
      .replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
        markdownLinks.push(`<a href="${url}" target="_blank">${text}</a>`);
        return `[[MDLINK_${markdownLinks.length - 1}]]`;
      });

    // Raw URLs (convert before restoring markdown links and images)
    result = result.replace(
      /(https?:\/\/[^\s<>)\]]+)/g,
      '<a href="$1" target="_blank">$1</a>',
    );

    // Restore markdown links from placeholders
    result = result.replace(
      /\[\[MDLINK_(\d+)\]\]/g,
      (match, index) => markdownLinks[parseInt(index)],
    );

    // Restore images from placeholders
    result = result.replace(
      /\[\[HTMLIMG_(\d+)\]\]/g,
      (match, index) => imgTags[parseInt(index)],
    );

    result = result
      // Code
      .replace(/`(.*?)`/g, "<code>$1</code>")
      // List items - convert to proper list
      .replace(/^[*-]\s+(.*)$/gm, "<li>$1</li>");

    // Wrap consecutive li tags in ul
    result = result.replace(/(<li>.*?<\/li>\s*)+/gs, "<ul>$&</ul>");

    // Convert double newlines to paragraph breaks
    result = result.replace(/\n\n+/g, "</p><p>");

    // Convert single newlines to line breaks
    result = result.replace(/\n/g, "<br>");

    // Wrap in paragraph if content exists
    if (result.trim()) {
      result = "<p>" + result + "</p>";
      // Clean up empty paragraphs
      result = result.replace(/<p>\s*<\/p>/g, "");
    }

    return result;
  }

  function formatDisplayUrl(response, currentUrl) {
    const repositoryHosts = new Set([
      "github.com",
      "gitlab.com",
      "codeberg.org",
      "sourceforge.net",
    ]);
    const { sharedResourceHosts } = SafeGuard.config;
    const source = response.matchedUrl || currentUrl;
    try {
      let parsed = new URL(source);
      if (repositoryHosts.has(parsed.hostname)) {
        let parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length < 2 && response.status === "no_data") {
          parsed = new URL(currentUrl);
          parts = parsed.pathname.split("/").filter(Boolean);
        }
        return parts.length >= 2
          ? parsed.hostname + "/" + parts.slice(0, 2).join("/")
          : formatHostAndPath(parsed);
      }
      return response.matchedUrl || sharedResourceHosts.has(parsed.hostname)
        ? formatHostAndPath(parsed)
        : parsed.hostname;
    } catch {
      return source;
    }
  }

  function showCopyableValue(id, value) {
    const container = document.getElementById(id + "-container");
    const text = document.getElementById(id + "-text");
    const content = document.getElementById(id + "-content");
    if (!container || !text || !content) return;
    container.classList.toggle("visible", Boolean(value));
    text.textContent = value || "";
    content.onclick = value
      ? async () => {
          try {
            await navigator.clipboard.writeText(value);
            content.classList.add("copied");
            setTimeout(() => content.classList.remove("copied"), 1000);
          } catch (error) {
            console.error("Failed to copy value:", error);
          }
        }
      : null;
  }

  return {
    formatDisplayUrl,
    showCopyableValue,
    formatHostAndPath,
    renderTextWithLinks,
    renderSanitizedMarkup,
    parseMarkdown,
  };
})();
