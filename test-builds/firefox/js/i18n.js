// i18n helper for FMHY SafeGuard
// This script handles internationalization for HTML pages

(function() {
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;

  // Cache for loaded translations
  let translations = {};
  let currentLanguage = "en";
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
    allowedTagNames = DEFAULT_ALLOWED_MARKUP
  ) {
    const parsedDocument = new DOMParser().parseFromString(
      String(markup || ""),
      "text/html"
    );
    const allowedTags = new Set(allowedTagNames);
    const content = document.createDocumentFragment();

    for (const child of parsedDocument.body.childNodes) {
      content.append(sanitizeMarkupNode(child, allowedTags));
    }

    container.replaceChildren(content);
  }

  // Supported languages
  const SUPPORTED_LANGUAGES = ["en", "es", "ru", "de", "pt", "fr", "ja"];

  // Get the user's preferred language from storage
  async function getPreferredLanguage() {
    try {
      const { language } = await browserAPI.storage.local.get("language");
      if (language && language !== "auto" && SUPPORTED_LANGUAGES.includes(language)) {
        return language;
      }
    } catch (e) {
      console.error("Error getting language preference:", e);
    }
    // Fall back to browser language or English
    const browserLang = browserAPI.i18n.getUILanguage().split("-")[0];
    return SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : "en";
  }

  // Load translations from JSON file
  async function loadTranslations(lang) {
    if (translations[lang]) {
      return translations[lang];
    }

    try {
      const url = browserAPI.runtime.getURL(`_locales/${lang}/messages.json`);
      const response = await fetch(url);
      if (response.ok) {
        translations[lang] = await response.json();
        return translations[lang];
      }
    } catch (e) {
      console.error(`Error loading translations for ${lang}:`, e);
    }

    // Fall back to English if loading fails
    if (lang !== "en") {
      return loadTranslations("en");
    }
    return {};
  }

  // Get a message from loaded translations
  function getMessageFromTranslations(key, substitutions) {
    const langData = translations[currentLanguage] || translations["en"] || {};
    const entry = langData[key];

    if (!entry || !entry.message) {
      // Fall back to browser API
      return browserAPI.i18n.getMessage(key, substitutions) || key;
    }

    let message = entry.message;

    // Handle substitutions (e.g., $DOMAIN$)
    if (substitutions) {
      const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
      subs.forEach((sub, index) => {
        // Replace $1, $2, etc. and named placeholders
        message = message.replace(new RegExp(`\\$${index + 1}`, "g"), sub);
        if (entry.placeholders) {
          Object.keys(entry.placeholders).forEach((name) => {
            const placeholder = entry.placeholders[name];
            if (placeholder.content === `$${index + 1}`) {
              message = message.replace(new RegExp(`\\$${name.toUpperCase()}\\$`, "g"), sub);
            }
          });
        }
      });
    }

    return message;
  }

  // Apply translations to elements with data-i18n attribute
  function applyTranslations() {
    // Translate elements with data-i18n attribute (text content)
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.getAttribute("data-i18n");
      const message = getMessageFromTranslations(key);
      if (message && message !== key) {
        element.textContent = message;
      }
    });

    // Translate the limited rich-text messages used by the warning page.
    document.querySelectorAll("[data-i18n-html]").forEach((element) => {
      const key = element.getAttribute("data-i18n-html");
      const message = getMessageFromTranslations(key);
      if (message && message !== key) {
        renderSanitizedMarkup(element, message);
      }
    });

    // Translate placeholders
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      const key = element.getAttribute("data-i18n-placeholder");
      const message = getMessageFromTranslations(key);
      if (message && message !== key) {
        element.placeholder = message;
      }
    });

    // Translate titles (tooltips)
    document.querySelectorAll("[data-i18n-title]").forEach((element) => {
      const key = element.getAttribute("data-i18n-title");
      const message = getMessageFromTranslations(key);
      if (message && message !== key) {
        element.title = message;
      }
    });

    // Translate page title
    const titleElement = document.querySelector("title[data-i18n]");
    if (titleElement) {
      const key = titleElement.getAttribute("data-i18n");
      const message = getMessageFromTranslations(key);
      if (message && message !== key) {
        document.title = message;
      }
    }
  }

  // Promise that resolves when i18n is ready
  let readyResolve;
  const readyPromise = new Promise(resolve => { readyResolve = resolve; });

  // Initialize i18n system
  async function init() {
    currentLanguage = await getPreferredLanguage();
    await loadTranslations(currentLanguage);
    // Also load English as fallback
    if (currentLanguage !== "en") {
      await loadTranslations("en");
    }
    applyTranslations();
    readyResolve(); // Signal that i18n is ready
  }

  // Run initialization when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose functions globally for use in other scripts
  window.i18n = {
    getMessage: getMessageFromTranslations,
    applyTranslations: applyTranslations,
    renderSanitizedMarkup,
    setLanguage: async function(lang) {
      if (SUPPORTED_LANGUAGES.includes(lang) || lang === "auto") {
        if (lang === "auto") {
          const browserLang = browserAPI.i18n.getUILanguage().split("-")[0];
          currentLanguage = SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : "en";
        } else {
          currentLanguage = lang;
        }
        await loadTranslations(currentLanguage);
        applyTranslations();
      }
    },
    getCurrentLanguage: function() {
      return currentLanguage;
    },
    ready: readyPromise
  };
})();
