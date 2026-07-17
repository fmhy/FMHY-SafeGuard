// Cross-browser compatibility shim
const browserAPI = typeof browser !== "undefined" ? browser : chrome;
const contextMenuIdOpenFmhy = "open-fmhy-net";
const fmhyWebsiteURL = "https://fmhy.net/";

// Open welcome page on first install
browserAPI.runtime.onInstalled.addListener((details) => {
  createExtensionContextMenu();

  if (details.reason === "install") {
    browserAPI.tabs.create({
      url: browserAPI.runtime.getURL("pub/welcome-page.html")
    });
  }
});

// Ensure context menu exists when the browser starts
browserAPI.runtime.onStartup?.addListener(() => {
  createExtensionContextMenu();
});

function createExtensionContextMenu() {
  if (!browserAPI.contextMenus?.create) {
    return;
  }

  // Remove only this extension menu item to avoid affecting future entries.
  browserAPI.contextMenus.remove(contextMenuIdOpenFmhy, () => {
    browserAPI.contextMenus.create({
      id: contextMenuIdOpenFmhy,
      title: "Open FMHY.net",
      contexts: ["action"]
    });
  });
}

browserAPI.contextMenus?.onClicked.addListener((info) => {
  if (info.menuItemId !== contextMenuIdOpenFmhy) {
    return;
  }

  browserAPI.tabs.create({
    url: fmhyWebsiteURL
  });
});

// URLs and Constants
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

// State Variables
let unsafeSitesRegex = null;
let unsafeHostnamesRegex = null; // Domain-only regex for unsafe sites
let potentiallyUnsafeSitesRegex = null;
let potentiallyUnsafeHostnamesRegex = null; // Domain-only regex for potentially unsafe sites
let fmhySitesRegex = null;
let safeSites = [];
let starredSites = [];
let safeSiteIndex = new Map();
let starredSiteIndex = new Map();
let fmhyResourceMap = {};
let unsafeReasons = {}; // Object to store reasons for unsafe sites
const approvedUrls = new Map(); // Map to store approved URLs per tab
const checkedTabUrls = new Map(); // Last status-checked URL per tab
const notesCache = new Map(); // Cache for fetched notes
let userTrustedDomains = new Set(); // User-defined trusted domains
let userUntrustedDomains = new Set(); // User-defined untrusted domains
let initializationPromise = null;

// Base64 Starred Links (from rentry.co/FMHYB64) - stored encoded, decoded at runtime
const base64StarredLinksEncoded = [
  "aHR0cHM6Ly9nZW4ucGFyYW1vcmUuc3Uv",
  "aHR0cHM6Ly9tYXNzZ3JhdmUuZGV2Lw==",
  "aHR0cHM6Ly9naXRodWIuY29tL21hc3NncmF2ZWwvTWljcm9zb2Z0LUFjdGl2YXRpb24tU2NyaXB0cy8=",
  "aHR0cHM6Ly9teXJpZW50LmVyaXN0YS5tZS8=",
  "aHR0cHM6Ly9jYWJsZS5heXJhLmNoL21ha2Vta3Yv",
  "aHR0cHM6Ly9maXJlaGF3azUyLmNvbS8=",
  "aHR0cHM6Ly92YWRhcGF2Lm1vdi8=",
];
const base64StarredLinks = base64StarredLinksEncoded.map(e => atob(e));

// Base64 Links (from rentry.co/FMHYB64) - stored encoded, decoded at runtime
const base64SafeLinksEncoded = [
  "aHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvMTNCODIzdWt4ZFZNb2Nvd28xczVYblQzdHpjaU9mcnVoVVZlUEVOS2MwMW8v",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9kZXRhaWxzL0BjaGFkbWFzdGVyP3NvcnQ9LWRvd25sb2FkcyZhbmQlNUIlNUQ9c3ViamVjdCUzQSUyMmZibiUyMg==",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9kZXRhaWxzL1RPU0VDX1YyMDE3LTA0LTIz",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9kZXRhaWxzL3Rvc2Vj",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9kZXRhaWxzL3NvZnR3YXJlbGlicmFyeV9mbGFzaA==",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vS0dLaHZaWlQ=",
  "aHR0cHM6Ly9naXRodWIuY29tL2t1cm9uZzAwL0dhbWVQcm9ncmFtQm9va3M=",
  "aHR0cHM6Ly9kaXNjb3JkLmNvbS9pbnZpdGUvNGpyRjlWNGg1aA==",
  "aHR0cHM6Ly9zbWJ4YXJjaGl2ZS53b2hsc29mdC5ydS8=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vcDQ3VGY5Y3o=",
  "aHR0cHM6Ly9raW5kbGVtb2RkaW5nLm9yZy8=",
  "aHR0cHM6Ly9kaXNjb3JkLmNvbS9pbnZpdGUvd0RiYlpURjVRRg==",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9RnVsbCtSZXRyb2FjaGlldmVtZW50cytjb2xsZWN0aW9uJTJDK1VwZGF0ZWQrSnVsKzMlMkMrMjAyNA==",
  "aHR0cHM6Ly9naXRodWIuY29tL1VsdHJhR29kQXpnb3JhdGgvVW5vZmZpY2lhbC1SQS1EQVRz",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vZDlNaEQxd2Y=",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9kZXRhaWxzL21hbmdhX2xpYnJhcnk=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vTkNRYTRaVjM=",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9kZXRhaWxzL3JhZGlvbm93aGVyZQ==",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vQWNka255RFk=",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9kZXRhaWxzL25ld3NwYXBlcnM=",
  "aHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvMVRGZFFQYXBlbzhEZS1nUDdBSTIxd3pDVV9wbWhfYXhfNWhmWi1HaEpXbm8v",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9kZXRhaWxzL3ZpbnRhZ2Vzb2Z0d2FyZQ==",
  "aHR0cHM6Ly93d3cudG9ycmVudGVjaC5vcmcv",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vckZLcnE5R1c=",
  "aHR0cHM6Ly9jb2RlYy5reWl2LnVhLw==",
  "aHR0cHM6Ly9jb2RlYy5reWl2LnVhL2FkMGJlLmh0bWw=",
  "aHR0cHM6Ly9jb2RlYy5reWl2LnVhL0F1ZGkwLmh0bQ==",
  "aHR0cHM6Ly9yZW50cnkuY28vR2FtZS1Nb2Rz",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9bmF0aXZlLWxpbnV4LWdhbWVzLWNvbGxlY3Rpb24mYW5kJTVCJTVEPW1lZGlhdHlwZSUzQSUyMmNvbGxlY3Rpb24lMjI=",
  "aHR0cHM6Ly9naXRodWIuY29tL2FtaWF5d2ViL0h5dGFsZS1GMlA=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vTXR3dm5NTFc=",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9c3ViamVjdCUzQSUyMm5vLWludHJvJTIyJnNvcnQ9LXdlZWs=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20va1I2WWVUdUg=",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9Y3JlYXRvciUzQSUyMkFsdlJvJTIy",
  "aHR0cHM6Ly9ncnVudG1vZHMuY29tLw==",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vaWV5bkttbk0=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vRFBHYnZrc1U=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vN3B2eGFmclg=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vS1NuZ25lZGU=",
  "aHR0cHM6Ly9naXRodWIuY29tL2x1Y2hpbmEtZ2FicmllbC9PU1gtUFJPWE1PWA==",
  "aHR0cHM6Ly9yZW50cnkuY28vc3dpdGNoZW11bGF0aW9u",
  "aHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vZG9jdW1lbnQvZC8xcHJ4T0phRTRXaFBlWU5IVzE3VzVVYVdaeFpEZ0I4ZTV3Tkh4dDJPNEZLdnMv",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vZTFjRjh6M2g=",
  "aHR0cHM6Ly9iZWFtbmcud2VzdXBwbHkuY3gv",
  "aHR0cHM6Ly9tb2UubW9oa2cxMDE3LnByby8=",
  "aHR0cHM6Ly93d3cuc2hvZGFuLmlvL3NlYXJjaD9xdWVyeT1zZXJ2ZXIlM0ErY2FsaWJyZQ==",
  "aHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vc3Vnb2lkb2dvLzJlNjA3NzI3Y2Q2MTMyNGIyZDI5MmRhOTY5NjFkZTNm",
  "aHR0cHM6Ly9ncmVhc3lmb3JrLm9yZy9lbi9zY3JpcHRzLzQ2NTI3Ng==",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vYTFSZ1NaVVo=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vWmVpTFRNZXM=",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9Y3JlYXRvciUzQSUyMnN0cnVnZ2xleiUyMittaXh0YXBlcw==",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9ZGptaXhlc19jb2xsZWN0aW9uX2J5X29WUE4udG8mc29ydD10aXRsZSZhbmQlNUIlNUQ9c3ViamVjdCUzQSUyMmxpdmVzZXRzJTIy",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vajNzRks2dGE=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vMUU1c0hQRFA=",
  "aHR0cHM6Ly9zbTY0cm9taGFja3MuY29tLw==",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9Y3JlYXRvciUzQSUyMkFycXVpdmlzdGEuZXhlJTIy",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vaXZVZ1hBRGo=",
  "aHR0cHM6Ly9wb2tlbWVyYWxkLmNvbS8=",
  "aHR0cHM6Ly93d3cuaGFja2RleC5hcHAv",
  "aHR0cHM6Ly93d3cucG9rZWhhcmJvci5jb20v",
  "aHR0cHM6Ly93d3cucG9rZW1vbmNvZGVycy5jb20v",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vR2lpdzJWeEM=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vZEN4YzIxUEQ=",
  "aHR0cHM6Ly9yZW50cnkuY28vZ25hcmx5X3JlcGFja3M=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vN1NYd0RFaXk=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vd2NnckxMNEc=",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9kZXRhaWxzL0ByYXZlZG93bmxvYWRzP3F1ZXJ5PXJhdmUrbGlicmFyeQ==",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vRzloV3hxVmk=",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9Y3JlYXRvciUzQSUyMlVua25vd24lMjIrK09mZmljaWFsbHkrVHJhbnNsYXRlZCtMaWdodCtOb3ZlbHMr",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vVnRVVEVLcDI=",
  "aHR0cHM6Ly9yb21oZWF2ZW4uY29tL2NzZg==",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vWThjRWMwUDA=",
  "aHR0cHM6Ly9naXRodWIuY29tL1RlYW0tUmVzdXJnZW50",
  "aHR0cHM6Ly9yZW50cnkuY28vYWZmaW5pdHlub2xvZ2lu",
  "aHR0cHM6Ly9zbXdkYi5tZS8=",
  "aHR0cHM6Ly9kZXYuc251YmJ5LnRvcC8=",
  "aHR0cHM6Ly93d3cuMTMzN3gudG8vdXNlci9LYU9zS3Jldy8=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vckpxZ3J1TXY=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vUEZwdmYzSzA=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vNFdIdVpNVHY=",
  "aHR0cHM6Ly93d3cuMTMzN3gudG8vc29ydC1zZWFyY2gvZG9kaS9zZWVkZXJzL2Rlc2MvMS8=",
  "aHR0cHM6Ly92ay5jb20vZG91amlubXVzaWM=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vS2sydXplaVA=",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9UElDT3dlc29tZQ==",
  "aHR0cHM6Ly9mb3J1bXMubXlkaWdpdGFsbGlmZS5uZXQvZm9ydW1zL21pY3Jvc29mdC1vZmZpY2UuMzUvP29yZGVyPXZpZXdfY291bnQ=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vaGhYNk50eHc=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vdURteTE1aUQ=",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9R09BK1BzeVRyYW5jZStMaXZlc2V0cw==",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vTUQ3Z002ZGU=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20veEhWdTFFSDg=",
  "aHR0cHM6Ly9naXRodWIuY29tL0V6ei1sb2wvYm9paWktZnJlZS9yZWxlYXNlcw==",
  "aHR0cHM6Ly9kaXNjb3JkLmNvbS9pbnZpdGUvRVZ6clcyWWRUSw==",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vc0hMQ3VLRTM=",
  "aHR0cHM6Ly9naXRodWIuY29tL3F0Y2hhb3MvcHlfbWVnYV9hY2NvdW50X2dlbmVyYXRvcg==",
  "aHR0cHM6Ly9naXRodWIuY29tL2Ytby9NRUdBLUFjY291bnQtR2VuZXJhdG9y",
  "aHR0cHM6Ly9naXRodWIuY29tL3F0Y2hhb3MvcHlfbWVnYV9hY2NvdW50X2dlbmVyYXRvci9pc3N1ZXMvMTYjaXNzdWVjb21tZW50LTI1Nzk2MzUzNzQ=",
  "aHR0cHM6Ly9naXRodWIuY29tL2hhcnJ5ZWZmaW5wb3R0ZXIvSVNBQUM=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vQW44NFVqNEQ=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vUG53OXJFMUQ=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vY2lKNE1meUY=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vNEZSOGVyeXI=",
  "aHR0cHM6Ly9yZW50cnkuY28vb25ia3NkZ3U=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vUDNoVFVrNlI=",
  "aHR0cHM6Ly9naXRodWIuY29tL2JyYWRyZXZhbnMvbXlyaWVudC1kb3dubG9hZGVy",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9RE9PTStXQURzJnNvcnQ9LWRvd25sb2Fkcw==",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vOHdjeW0zcFc=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vejEyVWp4blk=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vVlljZzhFZVQ=",
  "aHR0cHM6Ly9wYXN0ZWJpbi5jb20vOEdRQkNoa0E=",
  "aHR0cHM6Ly9saWIybGlmZS5pbi8=",
  "aHR0cHM6Ly9oY3M2NC5jb20v",
  "aHR0cHM6Ly9tYWRva2FtaS5hbC8=",
  "aHR0cHM6Ly9zaW5mbGl4LmNsdWIv",
  "aHR0cHM6Ly9zdGFydGJhY2submV0Lw==",
  "aHR0cHM6Ly9rcG9wZXhwbG9yZXIubmV0Lw==",
  "aHR0cHM6Ly9jYW52YS5jb20vYnJhbmQvam9pbj90b2tlbj1nUkh2bnZSbm1qTE5ZRm5xU3o1LVJ3JnJlZmVycmVyPXRlYW0taW52aXRl",
  "aHR0cHM6Ly9oYXlhc2UubW9lLw==",
  "aHR0cHM6Ly9yb21jZW50ZXIuY29tLw==",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9kZXRhaWxzL0BhcmNoaXZlcl9lcGg=",
  "aHR0cHM6Ly9hY2VzdHJlYW1zZWFyY2gubmV0L2VuLw==",
  "aHR0cHM6Ly9saWdodGRsLnh5ei8=",
  "aHR0cHM6Ly9zY2VuZWNhdC5jb20v",
  "aHR0cHM6Ly9ldGRsLmluLw==",
  "aHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvMXNGSE5RS0ozSDgxblhpU1Bxc2xZdXJxdUJGSnJVLVg5cW9yMTR1WEJ1ZW8v",
  "aHR0cHM6Ly9zY2xvdWR4LmxvbC8=",
  "aHR0cHM6Ly94LmNvbS9yaXBwZXJzYXJjaGl2ZQ==",
  "aHR0cHM6Ly90Lm1lL0dBTUVTTmludGVuZG9TV0lUQ0g=",
  "aHR0cHM6Ly9pc2FpZHViLmZyZWUv",
  "aHR0cHM6Ly90Lm1lL0VzZXRLZXlSb2JvdA==",
  "aHR0cHM6Ly90Lm1lL2VzZXRrZXl6X2JvdA==",
  "aHR0cHM6Ly9ib290bGVnLnJhZGlvY2xhc2guY29tLw==",
  "aHR0cHM6Ly9hY2VybW92aWVzLmZ1bi8=",
  "aHR0cHM6Ly9hcmNoaXZlLm9yZy9zZWFyY2g/cXVlcnk9Y3JlYXRvciUzQSUyMk0lQzMlQTBnaXRvJTIyK29mZmljaWFsJnNvcnQ9LXdlZWsmYW5kJTVCJTVEPXN1YmplY3QlM0ElMjJtYWdpcGFjayUyMg==",
  "aHR0cDovL3cxNy5tb25rcnVzLndzLw==",
  "aHR0cHM6Ly9tb25rcnVzLmR2dXp1LmNvbS8=",
  "aHR0cHM6Ly92ay5jb20vbW9ua3J1cw==",
  "aHR0cHM6Ly90Lm1lL3JlYWxfbW9ua3J1cw==",
  "aHR0cHM6Ly9tZWRhbGJ5cGFzcy52ZXJjZWwuYXBwLw==",
  "aHR0cHM6Ly9hLjExMTQ3Ny54eXov",
  "aHR0cHM6Ly93d3cueGJpbnMub3JnL2FwcGxpc3QucGhw",
  "aHR0cHM6Ly9kaXNjb3JkLmdnL3NhdHZybg==",
  "aHR0cHM6Ly9yZW50cnkuY28vUk9NLUNvbGxlY3Rpb25z",
  "aHR0cHM6Ly9mbHVmZmxlLmNjL2FxZw==",
  "aHR0cHM6Ly9yZW50cnkuY28vamV0YnJhaW5zZnJlZQ==",
  "aHR0cHM6Ly9naXRsYWIuY29tL2lnbmFjaW9jYXN0cm8vYS1kb3ZlLWlzLWR1bWIv",
  "aHR0cHM6Ly9nYW1lcy5vdm9zaW1wYXRpY28uY29tLw==",
  "aHR0cHM6Ly9teXJpZW50Lm1haG91Lm9uZS8=",
  "aHR0cHM6Ly9sb3N0YjF0LmdpdGh1Yi5pby9yb21zZWFyY2gv",
  "aHR0cHM6Ly9yZXBhY2tzYnkuZHlyZW4ubG9sL2NiLmh0bWw=",
  "aHR0cHM6Ly93d3cuY2xvd25zZWMuY29tLzNkcy8=",
  "aHR0cHM6Ly9zaXRlcy5nb29nbGUuY29tL3ZpZXcvM2RzbW92aWVzLw==",
  "aHR0cHM6Ly9naXRodWIuY29tL0Nvc21pY1NjYWxlL1BTQkJOLURlZmluaXRpdmUtRW5nbGlzaC1QYXRjaA==",
];
const base64DecodedLinks = base64SafeLinksEncoded.map(e => atob(e));
const base64StarredSiteIndex = buildResourceIndex(base64StarredLinks);
const base64SafeSiteIndex = buildResourceIndex(base64DecodedLinks);

// List of search engines to check against
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

// Notes Mapping - Maps domains to their corresponding FMHY note slugs
const notesMapping = {
  // Torrent sites
  "1337x.to": "1337x-ranks", "1337x.st": "1337x-ranks", "1337x.is": "1337x-ranks",
  "1337x.gd": "1337x-ranks", "1337x.so": "1337x-ranks", "1337x.tw": "1337x-ranks",
  // Audiobookbay
  "audiobookbay.is": "audiobookbay-warning", "audiobookbay.se": "audiobookbay-warning",
  "audiobookbay.fi": "audiobookbay-warning", "audiobookbay.nl": "audiobookbay-warning",
  // Aurora Store
  "auroraoss.com": "aurora-note",
  // APKMirror
  "apkmirror.com": "apkmirror-extensions",
  // BuzzHeavier
  "buzzheavier.com": "buzzheavier-warning",
  // ChatGPT
  "chat.openai.com": "chatgpt-limits", "chatgpt.com": "chatgpt-limits",
  // Crystal Disk Info
  "crystalmark.info": "crystaldiskinfo",
  // CS.RIN.RU
  "cs.rin.ru": "csrin-search", "csrin.org": "csrin-search",
  // DODI Repacks
  "dodi-repacks.site": "dodi-warning",
  // FileBin
  "filebin.net": "filebin-warning",
  // FileLu
  "filelu.com": "filelu-warning",
  // FileZilla
  "filezilla-project.org": "filezilla",
  // Fluxy Repacks
  "fluxyrepacks.site": "fluxy-repacks",
  // Foxit Reader
  "foxit.com": "foxit-warning",
  // FreeGOGPCGames
  "freegogpcgames.com": "freegogpcgames-note",
  // Glitchwave
  "glitchwave.com": "glitchwave-note",
  // Google Translate
  "translate.google.com": "google-translate-note",
  // HDO Box
  "hdo.app": "hdo-box-note",
  // Hugging Face
  "huggingface.co": "hugging-face-warning",
  // InstaEclipse
  "instaeclipse.com": "instaeclipse-note",
  // IRC Highway
  "irchighway.net": "irc-highway-note",
  // JDownloader
  "jdownloader.org": "jdownloader",
  // LiteAPK / ModYolo
  "liteapks.com": "liteapk-modyolo-note", "modyolo.com": "liteapk-modyolo-note",
  // Mobilism
  "mobilism.me": "mobilism-ranks", "mobilism.org": "mobilism-ranks",
  "forum.mobilism.org": "mobilism-ranks", "forum.mobilism.me": "mobilism-ranks",
  // ModelScope
  "modelscope.cn": "modelscope",
  // Mori
  "mori.space": "mori-note",
  // movie-web / pstream
  "movie-web.app": "movie-web", "pstream.org": "movie-web", "pstream.mov": "movie-web",
  // MovieParadise
  "movieparadise.org": "movieparadise-code",
  // MVSEP
  "mvsep.com": "mvsep-note",
  // OpenAsar
  "openasar.dev": "openasar",
  // OpenRGB
  "openrgb.org": "openrgb-beta",
  // Pollinations AI
  "pollinations.ai": "pollinations-limits", "chat.pollinations.ai": "pollinations-limits",
  // Proton VPN
  "protonvpn.com": "proton-torrenting",
  // REAPER DAW
  "reaper.fm": "reaper-note",
  // SaNET / SoftArchive
  "sanet.st": "sanet-warning", "sanet.lc": "sanet-warning", "sanet.cd": "sanet-warning",
  "softarchive.is": "softarchive-mirrors",
  // Soft98
  "soft98.ir": "soft98-note",
  // Sora
  "soraapp.tv": "sora",
  // Spicetify
  "spicetify.app": "spicetify-note",
  // Sport7
  "sport7.live": "sport7",
  // Steam
  "store.steampowered.com": "steam-controller-support",
  // Tautulli
  "tautulli.com": "tautulli-note",
  // TeamSpeak
  "teamspeak.com": "teamspeak-warning",
  // Thunderbird
  "thunderbird.net": "thunderbird",
  // TinyURL
  "tinyurl.com": "tinyurl-note",
  // Video DownloadHelper
  "downloadhelper.net": "video-downloadhelper",
  // VuenXX
  "vuenxx.com": "vuenxx-note",
  // WeLib
  "welib.org": "welib-note",
  // WinRAR
  "rarlab.com": "winrar", "win-rar.com": "winrar",
  // YTS / Yify
  "yts.mx": "yts-yify-note", "yts.rs": "yts-yify-note", "yts.lt": "yts-yify-note",
  "yts.am": "yts-yify-note", "yts.ag": "yts-yify-note", "yts.pm": "yts-yify-note",
  // 4PDA
  "4pda.to": "captcha-4pda",
  // Eruda
  "eruda.liriliri.io": "eruda",
  // Twitch alternate player
  "twitch.tv": "alt-twitch-player-extensions",
  // WARP alternatives
  "1.1.1.1": "alt-warp-clients",
  // Eaglercraft
  "eaglercraft.com": "eaglercraft-note", "eagler.xyz": "eaglercraft-note",
  // Bookmarkeddit
  "bookmarkeddit.com": "bookmarkeddit",
  // RGShows
  "rgshows.to": "rgshows-autoplay", "rgshows.me": "rgshows-autoplay",
  // OneClick
  "oneclick.download": "oneclick-note",
  // Forest
  "forestapp.cc": "forest-extensions",
  // Flicker proxy
  "flicker.city": "flicker-proxy",
  // Dolby
  "dolby.com": "dolby-access-atmos-note",
  // Bypass Freedlink
  "freedlink.org": "bypass-freedlink", "freedl.ink": "bypass-freedlink",
  // Limit bypass
  "12ft.io": "limit-bypass-note", "archive.is": "limit-bypass-note",
  // Malware removal forums
  "malwaretips.com": "malware-removal-forums", "bleepingcomputer.com": "malware-removal-forums",
  // Advanced calculators
  "desmos.com": "advanced-logic-calculators", "wolframalpha.com": "advanced-logic-calculators",
  "symbolab.com": "advanced-logic-calculators",
};

// Pattern-based matching for dynamic domains
const notesPatterns = [
  // Torrent sites with multiple TLDs
  { pattern: /(?:^|\.)1337x\./i, noteSlug: "1337x-ranks" },
  { pattern: /(?:^|\.)yts\./i, noteSlug: "yts-yify-note" },
  { pattern: /(?:^|\.)audiobookbay\./i, noteSlug: "audiobookbay-warning" },
  { pattern: /(?:^|\.)sanet\./i, noteSlug: "sanet-warning" },
  { pattern: /(?:^|\.)softarchive\./i, noteSlug: "softarchive-mirrors" },
  { pattern: /(?:^|\.)mobilism\./i, noteSlug: "mobilism-ranks" },
  { pattern: /(?:^|\.)rgshows\./i, noteSlug: "rgshows-autoplay" },
  // Sites with known subdomains
  { pattern: /(?:^|\.)twitch\.tv$/i, noteSlug: "alt-twitch-player-extensions" },
  { pattern: /(?:^|\.)huggingface\.co$/i, noteSlug: "hugging-face-warning" },
  { pattern: /(?:^|\.)pollinations\.ai$/i, noteSlug: "pollinations-limits" },
  { pattern: /(?:^|\.)4pda\./i, noteSlug: "captcha-4pda" },
  // Archive mirrors
  { pattern: /^archive\.(is|today|ph|fo|li|vn|md)$/i, noteSlug: "limit-bypass-note" },
];

// Hardcoded site passwords - Maps domains to their passwords
const sitePasswords = {
  "cs.rin.ru": "cs.rin.ru",
  "csrin.org": "csrin.org",
  "steamrip.com": "steamrip.com",
  "online-fix.me": "online-fix.me",
  "ovagames.com": "www.ovagames.com",
  "g4u.to": "404",
  "elenemigos.com": "elenemigos.com",
  "triahgames.com": "www.triahgames.com",
  "soft98.ir": "soft98.ir",
  "iptv.watchott.ru": "FREE-MEDIA",
};

// Passwords for resources that share a host and must be matched by URL.
const siteUrlPasswords = {
  "https://rentry.co/fmhyb64#gnarly": "gnarly",
  "https://rentry.co/fmhyb64#alvro": "ByAlvRo",
};

// Hardcoded site invite codes - Maps domains to their invite codes
const siteInviteCodes = {
  "ee3.me": "mpgh",
  "rips.cc": "1hack",
};

// Get password for a domain
function getPasswordForDomain(hostname, url = "") {
  const urlPassword = siteUrlPasswords[url.toLowerCase().replace(/\/$/, "")];
  if (urlPassword) return urlPassword;

  const domain = hostname.replace(/^www\./, "").toLowerCase();
  return sitePasswords[domain] || null;
}

// Get invite code for a domain
function getInviteCodeForDomain(hostname) {
  const domain = hostname.replace(/^www\./, "").toLowerCase();
  return siteInviteCodes[domain] || null;
}

// Get note slug for a domain
function getNoteSlugForDomain(hostname) {
  const domain = hostname.replace(/^www\./, "").toLowerCase();
  if (notesMapping[domain]) return notesMapping[domain];
  for (const { pattern, noteSlug } of notesPatterns) {
    if (pattern.test(domain)) return noteSlug;
  }
  return null;
}

// Get reason for an unsafe domain
async function getReasonForDomain(hostname) {
  const domain = hostname.replace(/^www\./, "").toLowerCase();

  // If in-memory unsafeReasons is empty, try loading from storage
  if (!unsafeReasons || Object.keys(unsafeReasons).length === 0) {
    try {
      const stored = await browserAPI.storage.local.get("unsafeReasons");
      if (stored.unsafeReasons && Object.keys(stored.unsafeReasons).length > 0) {
        unsafeReasons = stored.unsafeReasons;
        console.log(`getReasonForDomain: Loaded ${Object.keys(unsafeReasons).length} unsafe reasons from storage`);
      } else {
        // Storage is also empty, fetch from URL
        console.log("getReasonForDomain: Storage empty, fetching from URL...");
        const response = await fetch(unsafeReasonsURL);
        if (response.ok) {
          unsafeReasons = await response.json();
          await browserAPI.storage.local.set({ unsafeReasons });
          console.log(`getReasonForDomain: Fetched and stored ${Object.keys(unsafeReasons).length} unsafe reasons`);
        }
      }
    } catch (e) {
      console.error("Error loading unsafeReasons:", e);
    }
  }

  // Try exact match first
  if (unsafeReasons && unsafeReasons[domain]) return unsafeReasons[domain];
  // Try with www prefix
  if (unsafeReasons && unsafeReasons["www." + domain]) return unsafeReasons["www." + domain];
  return null;
}

function getReasonKeyForUrl(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = urlObj.pathname.replace(/\/+$/, "").toLowerCase();
    return pathname ? `${domain}${pathname}` : null;
  } catch (error) {
    return null;
  }
}

async function getReasonForUrl(url) {
  const reasonKey = getReasonKeyForUrl(url);
  if (!reasonKey) return null;

  const hostname = new URL(url).hostname;
  await getReasonForDomain(hostname);

  const matchedKey = Object.keys(unsafeReasons)
    .filter((key) => key.includes("/") && (reasonKey === key || reasonKey.startsWith(`${key}/`)))
    .sort((a, b) => b.length - a.length)[0];

  return matchedKey ? unsafeReasons[matchedKey] : null;
}

// Fetch note content from GitHub
async function fetchNoteContent(noteSlug) {
  // Check cache first
  if (notesCache.has(noteSlug)) {
    return notesCache.get(noteSlug);
  }

  try {
    const response = await fetch(`${notesBaseURL}${noteSlug}.md`);
    if (!response.ok) {
      console.log(`Note not found: ${noteSlug}`);
      return null;
    }
    const content = await response.text();
    notesCache.set(noteSlug, content);
    return content;
  } catch (error) {
    console.error(`Error fetching note ${noteSlug}:`, error);
    return null;
  }
}
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
      descriptionSeparator === -1 ? null : line.slice(0, descriptionSeparator);
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

    for (const match of line.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g)) {
      resourceMap[match[1]] = sectionUrl;
    }
    for (const match of line.matchAll(/<(https?:\/\/[^>\s]+)>/g)) {
      resourceMap[match[1]] = sectionUrl;
    }
  }

  return resourceMap;
}

function getFmhyUrlForMatch(matchedUrl) {
  const normalizedUrl = normalizeResourceUrl(matchedUrl);
  if (!normalizedUrl) return null;
  return fmhyResourceMap[normalizedUrl] || null;
}

function extractUrlsFromBookmarks(html) {
  console.log("Extracting URLs from bookmarks HTML...");

  // Try multiple regex patterns to handle different bookmark formats
  const patterns = [
    /<A HREF="(https?:\/\/[^\s"]+)"/gi, // Standard format
    /<a href="(https?:\/\/[^\s"]+)"/gi, // Lowercase format
    /href=["'](https?:\/\/[^\s"']+)["']/gi, // Generic href format
    /<DT><A[^>]*HREF="(https?:\/\/[^\s"]+)"[^>]*>([^<]+)/gi, // Full bookmark format
  ];

  const allUrls = [];

  // Try each pattern
  for (const pattern of patterns) {
    let matches;
    while ((matches = pattern.exec(html)) !== null) {
      if (matches[1]) {
        allUrls.push(matches[1]);
      }
    }
  }

  console.log(`Extracted ${allUrls.length} URLs from bookmarks HTML`);
  return allUrls;
}

function normalizeUrl(url) {
  if (!url) {
    console.warn("Received null or undefined URL.");
    return null;
  }

  try {
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    const urlObj = new URL(url);

    // Remove 'www.' prefix consistently
    if (urlObj.hostname.startsWith("www.")) {
      urlObj.hostname = urlObj.hostname.substring(4);
    }

    // Clear search parameters and hash
    urlObj.search = "";
    urlObj.hash = "";

    // Remove trailing slash consistently
    let normalized = urlObj.href.replace(/\/+$/, "");

    return normalized;
  } catch (error) {
    console.warn(`Invalid URL skipped: ${url} - ${error.message}`);
    return null;
  }
}

function normalizeResourceUrl(url) {
  if (!url) {
    console.warn("Received null or undefined resource URL.");
    return null;
  }

  try {
    const source = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const urlObj = new URL(source);

    if (urlObj.hostname.startsWith("www.")) {
      urlObj.hostname = urlObj.hostname.substring(4);
    }

    const normalizedPath = urlObj.pathname.replace(/\/+$/, "");
    urlObj.pathname = normalizedPath || "/";

    const normalized = urlObj.href;
    return urlObj.search || urlObj.hash
      ? normalized
      : normalized.replace(/\/+$/, "");
  } catch (error) {
    console.warn(`Invalid resource URL skipped: ${url} - ${error.message}`);
    return null;
  }
}

function isSharedResourceHost(hostname) {
  const domain = hostname.replace(/^www\./, "").toLowerCase();
  for (const host of sharedResourceHosts) {
    if (domain === host || domain.endsWith(`.${host}`)) return true;
  }
  return false;
}

function urlMatchesListedResource(currentUrl, listedUrl) {
  const normalizedCurrent = normalizeResourceUrl(currentUrl);
  const normalizedListed = normalizeResourceUrl(listedUrl);
  if (!normalizedCurrent || !normalizedListed) return false;

  const current = new URL(normalizedCurrent);
  const listed = new URL(normalizedListed);
  const currentHost = current.hostname.replace(/^www\./, "").toLowerCase();
  const listedHost = listed.hostname.replace(/^www\./, "").toLowerCase();
  const sharedHost = isSharedResourceHost(currentHost) || isSharedResourceHost(listedHost);
  const hostMatches = sharedHost
    ? currentHost === listedHost
    : currentHost === listedHost || currentHost.endsWith(`.${listedHost}`);
  if (!hostMatches) return false;

  const currentPath = current.pathname.replace(/\/+$/, "").toLowerCase();
  const listedPath = listed.pathname.replace(/\/+$/, "").toLowerCase();
  const currentGreasyForkScript = currentPath.match(
    /^\/(?:[^/]+\/)?scripts\/(\d+)/
  );
  const listedGreasyForkScript = listedPath.match(
    /^\/(?:[^/]+\/)?scripts\/(\d+)/
  );
  if (
    currentHost === "greasyfork.org" &&
    listedHost === "greasyfork.org" &&
    currentGreasyForkScript?.[1] === listedGreasyForkScript?.[1]
  ) {
    return true;
  }
  const isGistPlatformPage =
    currentHost === "gist.github.com" &&
    ["/starred", "/discover"].includes(currentPath) &&
    listedHost === "gist.github.com" &&
    !listedPath;
  if (isGistPlatformPage) return true;
  const isEnteAuthRedirect =
    currentHost === "auth.ente.com" &&
    currentPath === "/login" &&
    listedHost === "ente.com" &&
    listedPath === "/auth";
  if (isEnteAuthRedirect) return true;
  const pathMatches = !listedPath
    ? !sharedHost || !currentPath
    : currentPath === listedPath || currentPath.startsWith(`${listedPath}/`);
  if (!pathMatches) return false;

  const queryIdentifiesResource = ["youtube.com", "archive.org"].includes(
    listedHost
  );
  if (queryIdentifiesResource) {
    for (const [key, value] of listed.searchParams) {
      if (current.searchParams.get(key) !== value) return false;
    }
  }
  const fragmentIdentifiesResource = [
    "rentry.co",
    "rentry.org",
    "matrix.to",
  ].includes(listedHost);
  if (
    fragmentIdentifiesResource &&
    listed.hash &&
    current.hash.toLowerCase() !== listed.hash.toLowerCase()
  ) {
    return false;
  }
  return true;
}

function buildResourceIndex(urls) {
  const index = new Map();

  for (const url of urls) {
    const normalizedUrl = normalizeResourceUrl(url);
    if (!normalizedUrl) continue;

    const parsedUrl = new URL(normalizedUrl);
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    const firstPathSegment =
      parsedUrl.pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
    const resources = index.get(hostname) || {
      all: [],
      roots: [],
      byFirstPathSegment: new Map(),
    };

    resources.all.push(normalizedUrl);
    if (!firstPathSegment) {
      resources.roots.push(normalizedUrl);
    } else {
      const pathResources =
        resources.byFirstPathSegment.get(firstPathSegment) || [];
      pathResources.push(normalizedUrl);
      resources.byFirstPathSegment.set(firstPathSegment, pathResources);
    }
    index.set(hostname, resources);
  }

  return index;
}

function findMatchingListedResource(currentUrl, resourceIndex) {
  const normalizedUrl = normalizeResourceUrl(currentUrl);
  if (!normalizedUrl) return undefined;

  const parsedUrl = new URL(normalizedUrl);
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  const firstPathSegment =
    parsedUrl.pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
  const candidateHosts = [hostname];

  // Normal sites can inherit a resource classification from a listed parent
  // domain. Shared platforms must remain scoped to their exact hostname.
  if (!isSharedResourceHost(hostname)) {
    const labels = hostname.split(".");
    for (let index = 1; index < labels.length - 1; index += 1) {
      candidateHosts.push(labels.slice(index).join("."));
    }
  }

  for (const candidateHost of candidateHosts) {
    const indexedResources = resourceIndex.get(candidateHost);
    if (!indexedResources) continue;

    let resources;
    if (Array.isArray(indexedResources)) {
      resources = indexedResources;
    } else if (isSharedResourceHost(candidateHost)) {
      const pathResources = firstPathSegment
        ? indexedResources.byFirstPathSegment.get(firstPathSegment) || []
        : [];
      resources = firstPathSegment
        ? pathResources.concat(indexedResources.roots)
        : indexedResources.roots;
    } else {
      resources = indexedResources.all;
    }

    const match = resources.find((listedUrl) =>
      urlMatchesListedResource(normalizedUrl, listedUrl)
    );
    if (match) return match;
  }

  return undefined;
}

function extractRootUrl(url) {
  if (!url) {
    console.warn("Received null or undefined URL for root extraction.");
    return null;
  }

  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch (error) {
    console.warn(`Failed to extract root URL from: ${url}`);
    return null;
  }
}

function generateRegexFromList(list) {
  if (!list.length) return /(?!)/;

  const boundedPatterns = list.map((entry) => {
    const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return entry.includes("://")
      ? `^${escaped}(?=$|[/?#])`
      : `(?:^|\\.)${escaped}$`;
  });
  return new RegExp(`(?:${boundedPatterns.join("|")})`, "i");
}

function extractUrlsFromFilterList(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("!"))
    .map((line) => normalizeUrl(line))
    .filter((url) => url !== null);
}

// Extract hostnames from a list of URLs for domain-level matching
// Only extract hostnames from domain-only URLs (no significant path)
// URLs with paths like rentry.co/FMHY should NOT match at domain level
function extractHostnamesFromUrls(urls) {
  return urls.map((url) => {
    try {
      const urlObj = new URL(url);
      // Only include hostname if the URL has no significant path
      // (path is empty, "/", or just trailing slash)
      const path = urlObj.pathname;
      if (path === "" || path === "/") {
        return urlObj.hostname;
      }
      return null; // Don't include hostnames from URLs with paths
    } catch (e) {
      // If not a valid URL, it's likely just a domain - include it
      return url;
    }
  }).filter((hostname) => hostname !== null);
}

function extractUniqueHostnamesFromUrls(urls) {
  const hostnames = new Set();

  for (const url of urls) {
    try {
      const source = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const hostname = new URL(source).hostname
        .replace(/^www\./, "")
        .toLowerCase();
      if (hostname) hostnames.add(hostname);
    } catch (error) {
      // Ignore malformed entries; the URL lists are validated separately.
    }
  }

  return [...hostnames];
}

// Function to check if a URL is a search engine
function isSearchEngine(url) {
  try {
    const urlObj = new URL(url);
    return searchEngines.some(
      (domain) =>
        urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain)
    );
  } catch (error) {
    console.error("Error checking search engine:", error);
    return false;
  }
}

// Fetch and Update Functions
async function fetchFilterLists() {
  console.log("Fetching filter lists...");
  try {
    const [unsafeResponse, potentiallyUnsafeResponse, fmhyResponse, reasonsResponse] =
      await Promise.all([
        fetch(filterListURLUnsafe),
        fetch(filterListURLPotentiallyUnsafe),
        fetch(fmhyFilterListURL),
        fetch(unsafeReasonsURL),
      ]);

    let unsafeSites = [];
    let potentiallyUnsafeSites = [];
    let fmhySites = [];

    if (unsafeResponse.ok) {
      const unsafeText = await unsafeResponse.text();
      unsafeSites = extractUrlsFromFilterList(unsafeText);
      unsafeSitesRegex = generateRegexFromList(unsafeSites);
      // Also generate hostname-only regex for domain-level matching
      const unsafeHostnames = extractHostnamesFromUrls(unsafeSites);
      unsafeHostnamesRegex = generateRegexFromList(unsafeHostnames);
    }

    if (potentiallyUnsafeResponse.ok) {
      const potentiallyUnsafeText = await potentiallyUnsafeResponse.text();
      potentiallyUnsafeSites = extractUrlsFromFilterList(potentiallyUnsafeText);
      potentiallyUnsafeSitesRegex = generateRegexFromList(
        potentiallyUnsafeSites
      );
      // Also generate hostname-only regex for domain-level matching
      const potentiallyUnsafeHostnames = extractHostnamesFromUrls(potentiallyUnsafeSites);
      potentiallyUnsafeHostnamesRegex = generateRegexFromList(potentiallyUnsafeHostnames);
    }

    if (fmhyResponse.ok) {
      const fmhyText = await fmhyResponse.text();
      fmhySites = extractUrlsFromFilterList(fmhyText);
      fmhySitesRegex = generateRegexFromList(fmhySites);
    }

    // Fetch unsafe site reasons
    if (reasonsResponse.ok) {
      try {
        unsafeReasons = await reasonsResponse.json();
        console.log(`Loaded ${Object.keys(unsafeReasons).length} unsafe site reasons`);
      } catch (e) {
        console.error("Error parsing unsafe reasons JSON:", e);
        unsafeReasons = {};
      }
    } else {
      console.warn("Failed to fetch unsafe reasons, status:", reasonsResponse.status);
      unsafeReasons = {};
    }

    await browserAPI.storage.local.set({
      unsafeSites,
      unsafeDomainList: extractUniqueHostnamesFromUrls(unsafeSites),
      potentiallyUnsafeSites,
      fmhySites,
      unsafeReasons,
      unsafeFilterCount: unsafeSites.length,
      potentiallyUnsafeFilterCount: potentiallyUnsafeSites.length,
      fmhyFilterCount: fmhySites.length,
      lastUpdated: new Date().toISOString(),
    });
    checkedTabUrls.clear();

    console.log("Filter lists fetched and stored successfully.");

    notifySettingsPage();
  } catch (error) {
    console.error("Error fetching filter lists:", error);
  }
}

async function fetchResourceLists() {
  console.log("Fetching FMHY resource guides...");
  try {
    const fetchPromises = safeListURLs.map((url) => fetch(url));
    const responses = await Promise.all(fetchPromises);

    // Extract URLs from each markdown document
    let allUrls = [];
    let starredUrls = [];
    fmhyResourceMap = {};
    for (let index = 0; index < responses.length; index++) {
      const response = responses[index];
      if (response.ok) {
        const markdown = await response.text();
        const urls = extractUrlsFromMarkdown(markdown);
        allUrls = allUrls.concat(urls);
        starredUrls.push(...extractStarredUrlsFromMarkdown(markdown));
        const guideName = new URL(safeListURLs[index]).pathname
          .split("/")
          .pop()
          .replace(/\.md$/, "");
        const guideUrl = `https://fmhy.net/${guideName}`;
        const guideMap = extractFmhyResourceMap(markdown, guideUrl);
        for (const [resourceUrl, fmhyUrl] of Object.entries(guideMap)) {
          const normalizedResourceUrl = normalizeResourceUrl(resourceUrl);
          if (normalizedResourceUrl) fmhyResourceMap[normalizedResourceUrl] = fmhyUrl;
        }
      } else {
        console.warn(`Failed to fetch from ${response.url}`);
      }
    }

    // Normalize URLs and remove duplicates
    safeSites = [
      ...new Set(allUrls.map((url) => normalizeResourceUrl(url.trim()))),
    ].filter((url) => url !== null);
    starredSites = [
      ...new Set(starredUrls.map((url) => normalizeResourceUrl(url))),
    ].filter((url) => url !== null);
    safeSiteIndex = buildResourceIndex(safeSites);
    starredSiteIndex = buildResourceIndex(starredSites);
    checkedTabUrls.clear();

    // Store safe sites for content script use
    await browserAPI.storage.local.set({
      safeSiteCount: safeSites.length,
      safeSiteList: safeSites,
      safeDomainList: extractUniqueHostnamesFromUrls(safeSites),
      starredSiteCount: starredSites.length,
      starredSites,
      fmhyResourceMap,
      resourceIdentityVersion,
    });

    console.log(
      `Stored ${safeSites.length} safe and ${starredSites.length} starred resources`
    );
  } catch (error) {
    console.error("Error fetching FMHY resource guides:", error);
  }
}

// UI Update Functions
function updatePageAction(status, tabId) {
  const icons = {
    safe: {
      19: "../res/icons/safe_19.png",
      38: "../res/icons/safe_38.png",
    },
    unsafe: {
      19: "../res/icons/unsafe_19.png",
      38: "../res/icons/unsafe_38.png",
    },
    potentially_unsafe: {
      19: "../res/icons/potentially_unsafe_19.png",
      38: "../res/icons/potentially_unsafe_38.png",
    },
    starred: {
      19: "../res/icons/starred_19.png",
      38: "../res/icons/starred_38.png",
    },
    fmhy: {
      19: "../res/icons/fmhy_19.png",
      38: "../res/icons/fmhy_38.png",
    },
    extension_page: {
      19: "../res/ext_icon_144.png",
      38: "../res/ext_icon_144.png",
    },
    default: {
      19: "../res/icons/default_19.png",
      38: "../res/icons/default_38.png",
    },
  };

  const icon = icons[status] || icons["default"];

  browserAPI.action.setIcon({
    tabId: tabId,
    path: icon,
  });
}

async function notifySettingsPage() {
  const tabs = await browserAPI.tabs.query({});
  for (const tab of tabs) {
    try {
      await browserAPI.tabs.sendMessage(tab.id, { type: "filterlistUpdated" });
    } catch (e) {
      // Ignore errors for tabs that can't receive messages
    }
  }
}

// Site Status Checking
async function checkSiteAndUpdatePageAction(tabId, url) {
  if (initializationPromise) await initializationPromise;

  console.log(
    `checkSiteAndUpdatePageAction: Checking status for ${url} on tab ${tabId}`
  );

  if (!url) {
    updatePageAction("default", tabId);
    return;
  }

  const normalizedUrl = normalizeUrl(url.trim());
  const resourceUrl = normalizeResourceUrl(url.trim());
  const rootUrl = extractRootUrl(normalizedUrl);
  const requiresResourcePath = normalizedUrl
    ? isSharedResourceHost(new URL(normalizedUrl).hostname)
    : false;

  // Detect if the URL is an internal extension page (settings page or warning page)
  const extUrlBase = browserAPI.runtime.getURL("");
  if (url.startsWith(extUrlBase)) {
    console.log("Detected extension page: " + url);
    updatePageAction("extension_page", tabId);
    return;
  }

  // Create variations of the URL to check
  // Some URLs might be stored with or without trailing slashes or www
  let status = "no_data";
  let matchedUrl = normalizedUrl;

  // First check the full URL
  status = getStatusFromLists(resourceUrl);

  // If still no match, check the root URL
  if (
    status === "no_data" &&
    !requiresResourcePath &&
    rootUrl !== resourceUrl
  ) {
    status = getStatusFromLists(rootUrl);
    if (status !== "no_data") matchedUrl = rootUrl;
  }

  // A path-specific reason can classify a resource even when it is absent from
  // the domain filter lists. Keep the toolbar icon aligned with the popup.
  if (status === "no_data" && await getReasonForUrl(url)) {
    status = "unsafe";
    matchedUrl = normalizedUrl;
  }

  // Apply the correct icon status to the tab
  updatePageAction(status, tabId);

  // Handle unsafe sites that need warning page redirection if not approved
  const tabApprovedUrls = approvedUrls.get(tabId) || [];
  const isApproved = tabApprovedUrls.includes(normalizedUrl) || tabApprovedUrls.includes(rootUrl);
  if (status === "unsafe" && !isApproved) {
    openWarningPage(tabId, url);
  }
}

// Update Schedule Management
async function shouldUpdate() {
  try {
    const { lastUpdated, updateFrequency = "daily" } =
      await browserAPI.storage.local.get(["lastUpdated", "updateFrequency"]);

    if (!lastUpdated) return true;

    const lastUpdate = new Date(lastUpdated);
    const now = new Date();
    const diffHours = (now - lastUpdate) / (1000 * 60 * 60);

    if (updateFrequency === "daily") {
      return diffHours >= 24;
    } else if (updateFrequency === "weekly") {
      return diffHours >= 168;
    } else if (updateFrequency === "monthly") {
      return diffHours >= 720;
    }
    return false;
  } catch (error) {
    console.error("Error checking update schedule:", error);
    return false;
  }
}

async function setupUpdateSchedule() {
  await browserAPI.alarms.clearAll();

  // Get the user's preferred update frequency from storage
  const { updateFrequency } = await browserAPI.storage.local.get({
    updateFrequency: "daily",
  });

  // Determine period in minutes based on selected frequency
  let periodInMinutes;
  switch (updateFrequency) {
    case "weekly":
      periodInMinutes = 10080; // 7 days in minutes
      break;
    case "monthly":
      periodInMinutes = 43200; // 30 days in minutes
      break;
    default:
      periodInMinutes = 1440; // 24 hours in minutes for daily updates
  }

  // Create the alarm based on calculated period
  browserAPI.alarms.create("checkUpdate", {
    periodInMinutes: periodInMinutes,
  });
}

// Event Listeners
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "checkSiteStatus") {
    const { url, rootUrl } = message;

    // Attempt to match with the full URL first (for specific paths)
    let status = getStatusFromLists(url);
    let matchedUrl = url;

    // If no specific match, try the root URL
    if (status === "no_data") {
      status = getStatusFromLists(rootUrl);
      matchedUrl = rootUrl;
    }

    // Get reason if unsafe
    let reason = null;
    if (status === "unsafe" || status === "potentially_unsafe") {
      try {
        const urlObj = new URL(matchedUrl);
        reason = getReasonForDomain(urlObj.hostname);
      } catch (e) {
        console.error("Error getting reason:", e);
      }
    }

    sendResponse({ status, matchedUrl, reason });
    return true;
  }

  if (message.action === "getSiteStatus") {
    (async () => {
      try {
        if (initializationPromise) await initializationPromise;

        // Get the URL from the message
        const url = message.url;
        if (!url) {
          sendResponse({ status: "no_data", matchedUrl: null });
          return;
        }

        console.log(`getSiteStatus: checking status for ${url}`);

        // Normalize the URL
        const normalizedUrl = normalizeUrl(url);
        const resourceUrl = normalizeResourceUrl(url);
        if (!normalizedUrl || !resourceUrl) {
          sendResponse({ status: "no_data", matchedUrl: null });
          return;
        }

        // Extract domain for domain-level checking
        const urlObj = new URL(normalizedUrl);
        const domain = urlObj.hostname;

        // First check if it's an extension page
        if (url.startsWith(browserAPI.runtime.getURL(""))) {
          sendResponse({ status: "extension_page", matchedUrl: url });
          return;
        }

        const requiresResourcePath = isSharedResourceHost(domain);

        // Variables to track status and matched URL
        let status = "no_data";
        let matchedUrl = null;

        // Check full URL first
        if (unsafeSitesRegex?.test(normalizedUrl)) {
          status = "unsafe";
          matchedUrl = normalizedUrl;
        } else if (potentiallyUnsafeSitesRegex?.test(normalizedUrl)) {
          status = "potentially_unsafe";
          matchedUrl = normalizedUrl;
        } else if (fmhySitesRegex?.test(normalizedUrl)) {
          status = "fmhy";
          matchedUrl = normalizedUrl;
        } else if ((matchedUrl = findMatchingListedResource(
          resourceUrl,
          starredSiteIndex,
        ))) {
          status = "starred";
        } else if ((matchedUrl = findMatchingListedResource(
          resourceUrl,
          safeSiteIndex,
        ))) {
          status = "safe";
        } else if ((matchedUrl = findMatchingListedResource(
          resourceUrl,
          base64StarredSiteIndex,
        ))) {
          status = "starred";
        } else if ((matchedUrl = findMatchingListedResource(
          resourceUrl,
          base64SafeSiteIndex,
        ))) {
          status = "safe";
        }

        // Shared hosts require a matching resource path; normal sites can use domain rules.
        if (status === "no_data" && !requiresResourcePath) {
          console.log(`No match for full URL, trying domain: ${domain}`);

          // Check domain against regex patterns (use hostname-only regex for domain matching)
          // Note: FMHY sites only match exact URLs, not domain-level
          if (unsafeHostnamesRegex?.test(domain)) {
            status = "unsafe";
            matchedUrl = `https://${domain}`;
          } else if (potentiallyUnsafeHostnamesRegex?.test(domain)) {
            status = "potentially_unsafe";
            matchedUrl = `https://${domain}`;
          }
        }

        const pathSpecificReason = await getReasonForUrl(url);
        if (status === "no_data" && pathSpecificReason) {
          status = "unsafe";
          matchedUrl = normalizedUrl;
        }

        // Get reason if unsafe
        let reason = null;
        if (status === "unsafe" || status === "potentially_unsafe") {
          reason = pathSpecificReason || await getReasonForDomain(domain);
        }

        // Get password if available
        const password = getPasswordForDomain(domain, url);

        // Get invite code if available
        const inviteCode = getInviteCodeForDomain(domain);

        console.log(
          `getSiteStatus result for ${url}: ${status}, matched: ${matchedUrl}`
        );
        const fmhyUrl = getFmhyUrlForMatch(matchedUrl);
        sendResponse({
          status,
          matchedUrl,
          fmhyUrl,
          reason,
          password,
          inviteCode,
        });
      } catch (error) {
        console.error("Error in getSiteStatus handler:", error);
        sendResponse({
          status: "no_data",
          matchedUrl: null,
          error: error.message,
        });
      }
    })();
    return true; // Keep the message channel open for async response
  }

  // Handle note requests for websites
  if (message.action === "getNoteForSite") {
    const url = message.url;
    if (!url) {
      sendResponse({ note: null });
      return true;
    }

    try {
      const urlObj = new URL(url);
      const noteSlug = getNoteSlugForDomain(urlObj.hostname);
      console.log(`getNoteForSite: domain=${urlObj.hostname}, slug=${noteSlug}`);

      if (!noteSlug) {
        sendResponse({ note: null });
        return true;
      }

      // Fetch note content asynchronously
      fetchNoteContent(noteSlug).then(noteContent => {
        console.log(`getNoteForSite: fetched content for ${noteSlug}, length=${noteContent?.length || 0}`);
        sendResponse({ note: noteContent, slug: noteSlug });
      }).catch(error => {
        console.error("Error fetching note content:", error);
        sendResponse({ note: null, error: error.message });
      });

      return true; // Keep channel open for async response
    } catch (error) {
      console.error("Error in getNoteForSite handler:", error);
      sendResponse({ note: null, error: error.message });
      return true;
    }
  }

  // Return false for unhandled message types
  return false;
});

function getStatusFromLists(url) {
  // Skip null, empty or non-string URLs
  if (!url || typeof url !== "string") {
    console.warn(`getStatusFromLists: Invalid URL provided: ${url}`);
    return "no_data";
  }

  try {
    // Special handling for repository hosting sites
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const normalizedDomain = domain.replace(/^www\./, "").toLowerCase();

    // Check user-defined domains first (highest priority)
    if (userTrustedDomains.has(normalizedDomain)) {
      return "safe";
    }
    if (userUntrustedDomains.has(normalizedDomain)) {
      return "unsafe";
    }
    const requiresResourcePath = isSharedResourceHost(domain);

    if (unsafeSitesRegex?.test(url)) return "unsafe";
    if (potentiallyUnsafeSitesRegex?.test(url)) return "potentially_unsafe";
    if (fmhySitesRegex?.test(url)) return "fmhy";
    if (findMatchingListedResource(url, starredSiteIndex)) return "starred";
    if (findMatchingListedResource(url, safeSiteIndex)) return "safe";
    if (findMatchingListedResource(url, base64StarredSiteIndex)) return "starred";
    if (findMatchingListedResource(url, base64SafeSiteIndex)) return "safe";

    if (requiresResourcePath) return "no_data";

    // Then check domain-level (use hostname-only regex for domain matching)
    // Note: FMHY sites only match exact URLs, not domain-level
    if (unsafeHostnamesRegex?.test(domain)) return "unsafe";
    if (potentiallyUnsafeHostnamesRegex?.test(domain)) return "potentially_unsafe";

    return "no_data";
  } catch (e) {
    console.warn(`Error in getStatusFromLists: ${e.message}`);
    return "no_data";
  }
}

async function openWarningPage(tabId, unsafeUrl) {
  const normalizedUrl = normalizeUrl(unsafeUrl);
  const tabApprovedUrls = approvedUrls.get(tabId) || [];

  // Check if URL has already been approved for this tab to avoid loop
  if (tabApprovedUrls.includes(normalizedUrl)) {
    console.log(`URL ${unsafeUrl} was already approved for tab ${tabId}`);
    return;
  }

  // Fetch the warning page setting
  const { showWarning } = await browserAPI.storage.local.get({
    showWarning: true,
  });

  if (!showWarning) {
    console.log("Warning page is disabled by the user settings.");
    return;
  }

  // Add temporary approval to avoid repeated redirection
  tabApprovedUrls.push(normalizedUrl);
  approvedUrls.set(tabId, tabApprovedUrls);

  // Get the reason for this unsafe site
  let hostname;
  try {
    hostname = new URL(unsafeUrl).hostname;
  } catch (e) {
    hostname = unsafeUrl.replace(/^https?:\/\//, "").split("/")[0];
  }
  const reason = await getReasonForUrl(unsafeUrl) || await getReasonForDomain(hostname);
  console.log(`openWarningPage: hostname=${hostname}, reason=${reason ? "found" : "not found"}`);

  // Redirect to the warning page if it is enabled in settings
  let warningPageUrl = browserAPI.runtime.getURL(
    `../pub/warning-page.html?url=${encodeURIComponent(unsafeUrl)}`
  );
  if (reason) {
    warningPageUrl += `&reason=${encodeURIComponent(reason)}`;
  }
  console.log(`openWarningPage: redirecting to ${warningPageUrl}`);
  browserAPI.tabs.update(tabId, { url: warningPageUrl });
}

// Listen for settings updates from the settings page
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "settingsUpdated") {
    setupUpdateSchedule(); // Adjust update schedule based on new settings
    sendResponse({ status: "Settings updated successfully" });
    return true; // Indicates asynchronous response handling
  }
  // Don't return anything for messages we don't handle - let other listeners process them
});

function shouldCheckTabUrl(tabId, url) {
  const normalizedUrl = normalizeResourceUrl(url) || url;
  if (checkedTabUrls.get(tabId) === normalizedUrl) return false;

  checkedTabUrls.set(tabId, normalizedUrl);
  return true;
}

// Listen for tab updates
browserAPI.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && shouldCheckTabUrl(tabId, changeInfo.url)) {
    await checkSiteAndUpdatePageAction(tabId, changeInfo.url);
    return;
  }

  if (
    changeInfo.status === "complete" &&
    tab.url &&
    shouldCheckTabUrl(tabId, tab.url)
  ) {
    // Always check the site status
    await checkSiteAndUpdatePageAction(tabId, tab.url);
  }
});

browserAPI.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await browserAPI.tabs.get(activeInfo.tabId);
  if (tab.url && shouldCheckTabUrl(tab.id, tab.url)) {
    await checkSiteAndUpdatePageAction(tab.id, tab.url);
  }
});

browserAPI.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "checkUpdate") {
    const needsUpdate = await shouldUpdate();
    if (needsUpdate) {
      await fetchFilterLists();
    }
  }
});

browserAPI.tabs.onRemoved.addListener((tabId) => {
  approvedUrls.delete(tabId);
  checkedTabUrls.delete(tabId);
  browserAPI.storage.local.remove(`proceedTab_${tabId}`);
});

// Initialize settings with defaults if needed
async function initializeSettings() {
  const defaultSettings = {
    theme: "system",
    showWarning: true,
    updateFrequency: "daily",
    highlightTrusted: true,
    highlightUntrusted: true,
    showWarningBanners: true,
    trustedColor: "#32cd32",
    untrustedColor: "#ff4444",
    userTrustedDomains: [],
    userUntrustedDomains: [],
  };

  // Check for existing settings
  const existingSettings = await browserAPI.storage.local.get(
    Object.keys(defaultSettings)
  );

  const missingSettings = Object.fromEntries(
    Object.entries(defaultSettings).filter(
      ([key]) => existingSettings[key] === undefined
    )
  );

  if (Object.keys(missingSettings).length > 0) {
    await browserAPI.storage.local.set(missingSettings);
  }

  console.log("Settings initialized:", {
    ...defaultSettings,
    ...existingSettings,
  });
}

// Load user-defined trusted/untrusted domains from storage
async function loadUserDomains() {
  try {
    const { userTrustedDomains: trusted, userUntrustedDomains: untrusted } =
      await browserAPI.storage.local.get(["userTrustedDomains", "userUntrustedDomains"]);

    if (trusted && Array.isArray(trusted)) {
      userTrustedDomains = new Set(trusted.map(d => d.toLowerCase().replace(/^www\./, "")));
      console.log(`Loaded ${userTrustedDomains.size} user trusted domains`);
    }

    if (untrusted && Array.isArray(untrusted)) {
      userUntrustedDomains = new Set(untrusted.map(d => d.toLowerCase().replace(/^www\./, "")));
      console.log(`Loaded ${userUntrustedDomains.size} user untrusted domains`);
    }
  } catch (error) {
    console.error("Error loading user domains:", error);
  }
}

// Listen for storage changes to update user domains
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.userTrustedDomains || changes.userUntrustedDomains) {
      checkedTabUrls.clear();
      loadUserDomains().then(() => {
        console.log("User domains reloaded after settings change");
      });
    }
  }
});

// Extension initialization
async function initializeExtension() {
  console.log("Initializing extension...");

  try {
    await initializeSettings();
    await loadUserDomains();
    if (await shouldUpdate()) {
      await Promise.all([fetchFilterLists(), fetchResourceLists()]);
    } else {
      // Load data from storage
      try {
        const storedData = await browserAPI.storage.local.get([
          "unsafeSites",
          "unsafeDomainList",
          "potentiallyUnsafeSites",
          "fmhySites",
          "starredSites",
          "safeSiteList",
          "safeDomainList",
          "fmhyResourceMap",
          "unsafeReasons",
          "resourceIdentityVersion",
        ]);
        const hasCurrentResourceIdentity =
          storedData.resourceIdentityVersion === resourceIdentityVersion;
        const compactDomainUpdates = {};

        if (storedData.unsafeSites && storedData.unsafeSites.length > 0) {
          unsafeSitesRegex = generateRegexFromList(storedData.unsafeSites);
          // Also generate hostname-only regex for domain-level matching
          const unsafeHostnames = extractHostnamesFromUrls(storedData.unsafeSites);
          unsafeHostnamesRegex = generateRegexFromList(unsafeHostnames);
          if (!Array.isArray(storedData.unsafeDomainList)) {
            compactDomainUpdates.unsafeDomainList =
              extractUniqueHostnamesFromUrls(storedData.unsafeSites);
          }
        }

        if (
          storedData.potentiallyUnsafeSites &&
          storedData.potentiallyUnsafeSites.length > 0
        ) {
          potentiallyUnsafeSitesRegex = generateRegexFromList(
            storedData.potentiallyUnsafeSites
          );
          // Also generate hostname-only regex for domain-level matching
          const potentiallyUnsafeHostnames = extractHostnamesFromUrls(storedData.potentiallyUnsafeSites);
          potentiallyUnsafeHostnamesRegex = generateRegexFromList(potentiallyUnsafeHostnames);
        }

        if (storedData.fmhySites && storedData.fmhySites.length > 0) {
          fmhySitesRegex = generateRegexFromList(storedData.fmhySites);
        }

        if (storedData.unsafeReasons && Object.keys(storedData.unsafeReasons).length > 0) {
          unsafeReasons = storedData.unsafeReasons;
          console.log(`Loaded ${Object.keys(unsafeReasons).length} unsafe reasons from storage`);
        } else {
          // If no unsafe reasons in storage, fetch them now
          console.log("No unsafeReasons in storage, fetching...");
          try {
            const reasonsResponse = await fetch(unsafeReasonsURL);
            if (reasonsResponse.ok) {
              unsafeReasons = await reasonsResponse.json();
              await browserAPI.storage.local.set({ unsafeReasons });
              console.log(`Fetched and stored ${Object.keys(unsafeReasons).length} unsafe reasons`);
            }
          } catch (e) {
            console.error("Error fetching unsafeReasons:", e);
          }
        }

        let needsResourceRefresh = !hasCurrentResourceIdentity;

        // Load starred sites from storage
        if (
          hasCurrentResourceIdentity &&
          storedData.starredSites &&
          storedData.starredSites.length > 0
        ) {
          starredSites = storedData.starredSites;
          starredSiteIndex = buildResourceIndex(starredSites);
          console.log(
            `Loaded ${starredSites.length} starred sites from storage`
          );
        } else {
          needsResourceRefresh = true;
        }

        fmhyResourceMap = storedData.fmhyResourceMap || {};

        // Load safe sites and their FMHY guide locations from storage
        if (
          hasCurrentResourceIdentity &&
          storedData.safeSiteList &&
          storedData.safeSiteList.length > 0
        ) {
          safeSites = storedData.safeSiteList;
          safeSiteIndex = buildResourceIndex(safeSites);
          if (!Array.isArray(storedData.safeDomainList)) {
            compactDomainUpdates.safeDomainList =
              extractUniqueHostnamesFromUrls(safeSites);
          }
          console.log(`Loaded ${safeSites.length} safe sites from storage`);
          const hasLegacyAnchors = Object.values(fmhyResourceMap).some(
            (fmhyUrl) => fmhyUrl.includes("#-")
          );
          if (Object.keys(fmhyResourceMap).length === 0 || hasLegacyAnchors) {
            needsResourceRefresh = true;
          }
        } else {
          needsResourceRefresh = true;
        }

        if (Object.keys(compactDomainUpdates).length > 0) {
          await browserAPI.storage.local.set(compactDomainUpdates);
        }

        if (needsResourceRefresh) {
          await fetchResourceLists();
        }
      } catch (error) {
        console.error("Error loading from storage:", error);
      }
    }

    // Set up the update schedule
    await setupUpdateSchedule();

    console.log("Extension initialized successfully.");
  } catch (error) {
    console.error("Error during initialization:", error);
  }
}

// Extension message handling
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateAlarm") {
    setupUpdateSchedule().then(() => {
      sendResponse({ status: "updated" });
    });
    return true;
  }

  if (message.action === "forceUpdate") {
    console.log("Force update triggered manually");
    Promise.all([
      fetchFilterLists(),
      fetchResourceLists()
    ]).then(() => {
      sendResponse({ status: "updated" });
    }).catch((error) => {
      console.error("Force update failed:", error);
      sendResponse({ status: "error", error: error.message });
    });
    return true;
  }

  if (message.action === "refreshAllTabs") {
    // Get all tabs and refresh
    browserAPI.tabs.query({}).then(async (tabs) => {
      for (const tab of tabs) {
        try {
          await browserAPI.tabs.sendMessage(tab.id, {
            action: "refreshSettings",
          });
        } catch (error) {
          console.log(`Could not refresh tab ${tab.id}: ${error.message}`);
        }
      }
      sendResponse({ status: "refreshed" });
    });
    return true;
  }

  // Don't return anything for unhandled messages
});

// Add listener for approval from the warning page
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "approveSite") {
    const { tabId, url } = message;
    const rootUrl = extractRootUrl(url);

    // Fetch existing approved URLs from storage
    browserAPI.storage.local.get("approvedUrls", (result) => {
      const approvedUrls = result.approvedUrls || [];

      // Add the root URL if not already approved
      if (!approvedUrls.includes(rootUrl)) {
        approvedUrls.push(rootUrl);
        browserAPI.storage.local.set({ approvedUrls });
        console.log(`approveSite: ${rootUrl} approved globally.`);
      }

      // Set the toolbar icon to "unsafe" immediately
      updatePageAction("unsafe", tabId);
      sendResponse({ status: "approved" });
    });
    return true;
  }
});

initializationPromise = initializeExtension();
