// Loaded as a classic script in both browser workers and extension pages.
globalThis.SafeGuard ||= {};
SafeGuard.guideParser = (() => {
  "use strict";

  function extractUrlsFromMarkdown(markdown) {
    const urlRegex = /https?:\/\/[^\s)>]+/g;
    return markdown.match(urlRegex) || [];
  }

  function extractStarredUrlsFromMarkdown(markdown) {
    const starredUrls = [];

    for (const line of markdown.split("\n")) {
      if (!line.includes("⭐")) continue;

      const descriptionSeparator = line.search(/\s+-\s+/);
      const resourceGroup =
        descriptionSeparator === -1
          ? null
          : line.slice(0, descriptionSeparator);
      const sections = resourceGroup
        ? [resourceGroup]
        : line.match(/\*\*.*?\*\*/g) || [];
      for (const section of sections) {
        const links = section.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g);
        for (const match of links) {
          starredUrls.push(match[1]);
        }
      }
    }

    return starredUrls;
  }

  function extractFmhyResourceMap(markdown, guideUrl) {
    const resourceMap = {};
    let sectionUrl = guideUrl;

    for (const line of markdown.split("\n")) {
      const heading = line.match(/^#{2,3}\s+(.+?)\s*$/);
      if (heading) {
        const anchor = heading[1]
          .replace(/<[^>]+>/g, "")
          .replace(/[*_`]/g, "")
          .trim()
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s-]/gu, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-+|-+$/g, "");
        sectionUrl = anchor ? `${guideUrl}#${anchor}` : guideUrl;
      }

      for (const match of line.matchAll(
        /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g,
      )) {
        resourceMap[match[1]] = sectionUrl;
      }
      for (const match of line.matchAll(/<(https?:\/\/[^>\s]+)>/g)) {
        resourceMap[match[1]] = sectionUrl;
      }
    }

    return resourceMap;
  }

  return {
    extractUrlsFromMarkdown,
    extractStarredUrlsFromMarkdown,
    extractFmhyResourceMap,
  };
})();
