// Loaded as a classic script in both browser workers and extension pages.
globalThis.SafeGuard ||= {};
SafeGuard.config = (() => {
  "use strict";

  const filterListURLUnsafe =
    "https://raw.githubusercontent.com/fmhy/FMHYFilterlist/refs/heads/main/sitelist.txt";
  const filterListURLPotentiallyUnsafe =
    "https://raw.githubusercontent.com/fmhy/FMHYFilterlist/refs/heads/main/sitelist-plus.txt";
  const safeListURLs = [
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/privacy.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/ai.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/mobile.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/audio.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/developer-tools.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/downloading.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/educational.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/file-tools.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/gaming-tools.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/gaming.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/image-tools.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/internet-tools.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/linux-macos.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/misc.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/non-english.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/reading.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/social-media-tools.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/storage.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/system-tools.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/text-tools.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/torrenting.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/video-tools.md",
    "https://raw.githubusercontent.com/fmhy/edit/refs/heads/main/docs/video.md",
  ];
  const fmhyFilterListURL =
    "https://raw.githubusercontent.com/fmhy/FMHY-SafeGuard/refs/heads/main/fmhy-filterlist.txt";
  const unsafeReasonsURL =
    "https://raw.githubusercontent.com/fmhy/FMHYFilterlist/refs/heads/main/filterlists-reasons.json";
  const notesBaseURL =
    "https://raw.githubusercontent.com/fmhy/edit/main/docs/.vitepress/notes/";
  const resourceIdentityVersion = 2;
  const sharedResourceHosts = new Set([
    "github.com",
    "gist.github.com",
    "raw.githubusercontent.com",
    "greasyfork.org",
    "youtube.com",
    "chromewebstore.google.com",
    "colab.research.google.com",
    "modrinth.com",
    "f-droid.org",
    "xdaforums.com",
    "start.me",
    "sites.google.com",
    "matrix.to",
    "codepen.io",
    "vk.com",
    "gitlab.com",
    "codeberg.org",
    "sourceforge.net",
    "linktr.ee",
    "rentry.co",
    "rentry.org",
    "pastebin.com",
    "archive.org",
    "drive.google.com",
    "docs.google.com",
    "discord.com",
    "discord.gg",
    "t.me",
    "mega.nz",
    "mediafire.com",
    "gofile.io",
    "pixeldrain.com",
    "huggingface.co",
  ]);

  const searchEngines = [
    "google.com",
    "bing.com",
    "duckduckgo.com",
    "kagi.com",
    "librey.org",
    "4get.ca",
    "mojeek.com",
    "qwant.com",
    "swisscows.com",
    "yacy.net",
    "startpage.com",
    "search.brave.com",
    "ekoru.org",
    "gibiru.com",
    "searx.org",
    "searx.", // Covers all SearX instances
    "searxng.", // Covers all SearXNG instances
    "whoogle.", // Covers all Whoogle instances
    "metager.org",
    "ecosia.org",
    "yandex.com",
    "yandex.", // Covers all Yandex country domains
    "yahoo.com",
    "yahoo.", // Covers all Yahoo country domains
    "baidu.com",
    "naver.com",
    "seznam.cz",
  ];

  return {
    filterListURLUnsafe,
    filterListURLPotentiallyUnsafe,
    safeListURLs,
    fmhyFilterListURL,
    unsafeReasonsURL,
    notesBaseURL,
    resourceIdentityVersion,
    sharedResourceHosts,
    searchEngines,
  };
})();
