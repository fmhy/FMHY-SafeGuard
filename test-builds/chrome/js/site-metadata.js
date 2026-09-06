// Loaded as a classic script in both browser workers and extension pages.
globalThis.SafeGuard ||= {};
SafeGuard.siteMetadata = (() => {
  "use strict";

  const notesMapping = {
    // Torrent sites
    "1337x.to": "1337x-ranks",
    "1337x.st": "1337x-ranks",
    "1337x.is": "1337x-ranks",
    "1337x.gd": "1337x-ranks",
    "1337x.so": "1337x-ranks",
    "1337x.tw": "1337x-ranks",
    // Audiobookbay
    "audiobookbay.is": "audiobookbay-warning",
    "audiobookbay.se": "audiobookbay-warning",
    "audiobookbay.fi": "audiobookbay-warning",
    "audiobookbay.nl": "audiobookbay-warning",
    // Aurora Store
    "auroraoss.com": "aurora-note",
    // APKMirror
    "apkmirror.com": "apkmirror-extensions",
    // BuzzHeavier
    "buzzheavier.com": "buzzheavier-warning",
    // ChatGPT
    "chat.openai.com": "chatgpt-limits",
    "chatgpt.com": "chatgpt-limits",
    // Crystal Disk Info
    "crystalmark.info": "crystaldiskinfo",
    // CS.RIN.RU
    "cs.rin.ru": "csrin-search",
    "csrin.org": "csrin-search",
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
    "liteapks.com": "liteapk-modyolo-note",
    "modyolo.com": "liteapk-modyolo-note",
    // Mobilism
    "mobilism.me": "mobilism-ranks",
    "mobilism.org": "mobilism-ranks",
    "forum.mobilism.org": "mobilism-ranks",
    "forum.mobilism.me": "mobilism-ranks",
    // ModelScope
    "modelscope.cn": "modelscope",
    // Mori
    "mori.space": "mori-note",
    // movie-web / pstream
    "movie-web.app": "movie-web",
    "pstream.org": "movie-web",
    "pstream.mov": "movie-web",
    // MovieParadise
    "movieparadise.org": "movieparadise-code",
    // MVSEP
    "mvsep.com": "mvsep-note",
    // OpenAsar
    "openasar.dev": "openasar",
    // OpenRGB
    "openrgb.org": "openrgb-beta",
    // Pollinations AI
    "pollinations.ai": "pollinations-limits",
    "chat.pollinations.ai": "pollinations-limits",
    // Proton VPN
    "protonvpn.com": "proton-torrenting",
    // REAPER DAW
    "reaper.fm": "reaper-note",
    // SaNET / SoftArchive
    "sanet.st": "sanet-warning",
    "sanet.lc": "sanet-warning",
    "sanet.cd": "sanet-warning",
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
    "rarlab.com": "winrar",
    "win-rar.com": "winrar",
    // YTS / Yify
    "yts.mx": "yts-yify-note",
    "yts.rs": "yts-yify-note",
    "yts.lt": "yts-yify-note",
    "yts.am": "yts-yify-note",
    "yts.ag": "yts-yify-note",
    "yts.pm": "yts-yify-note",
    // 4PDA
    "4pda.to": "captcha-4pda",
    // Eruda
    "eruda.liriliri.io": "eruda",
    // Twitch alternate player
    "twitch.tv": "alt-twitch-player-extensions",
    // WARP alternatives
    "1.1.1.1": "alt-warp-clients",
    // Eaglercraft
    "eaglercraft.com": "eaglercraft-note",
    "eagler.xyz": "eaglercraft-note",
    // Bookmarkeddit
    "bookmarkeddit.com": "bookmarkeddit",
    // RGShows
    "rgshows.to": "rgshows-autoplay",
    "rgshows.me": "rgshows-autoplay",
    // OneClick
    "oneclick.download": "oneclick-note",
    // Forest
    "forestapp.cc": "forest-extensions",
    // Flicker proxy
    "flicker.city": "flicker-proxy",
    // Dolby
    "dolby.com": "dolby-access-atmos-note",
    // Bypass Freedlink
    "freedlink.org": "bypass-freedlink",
    "freedl.ink": "bypass-freedlink",
    // Limit bypass
    "12ft.io": "limit-bypass-note",
    "archive.is": "limit-bypass-note",
    // Malware removal forums
    "malwaretips.com": "malware-removal-forums",
    "bleepingcomputer.com": "malware-removal-forums",
    // Advanced calculators
    "desmos.com": "advanced-logic-calculators",
    "wolframalpha.com": "advanced-logic-calculators",
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
    {
      pattern: /(?:^|\.)twitch\.tv$/i,
      noteSlug: "alt-twitch-player-extensions",
    },
    { pattern: /(?:^|\.)huggingface\.co$/i, noteSlug: "hugging-face-warning" },
    { pattern: /(?:^|\.)pollinations\.ai$/i, noteSlug: "pollinations-limits" },
    { pattern: /(?:^|\.)4pda\./i, noteSlug: "captcha-4pda" },
    // Archive mirrors
    {
      pattern: /^archive\.(is|today|ph|fo|li|vn|md)$/i,
      noteSlug: "limit-bypass-note",
    },
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

  return { getPasswordForDomain, getInviteCodeForDomain, getNoteSlugForDomain };
})();
