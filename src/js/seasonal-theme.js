// @ts-check
// Loaded as a classic script in the <head> of extension pages. Seasons are
// data: add an entry to `themes` to introduce another one.
globalThis.SafeGuard ||= {};
SafeGuard.seasonalTheme = (() => {
  "use strict";

  /**
   * A calendar day in local time. Months run from 1 to 12.
   * @typedef {{ readonly month: number, readonly day: number }} MonthDay
   */

  /**
   * @typedef {object} SeasonalTheme
   * @property {string} id Names the icon classes and the root data attribute.
   * @property {MonthDay} start First active day, inclusive.
   * @property {MonthDay} end Last active day, inclusive. An end before the
   *   start wraps over the new year.
   * @property {string} stylesheet Path from the extension root.
   * @property {readonly string[]} icons Paths from the extension root, cycled
   *   across the page's icon slots.
   */

  /** @type {readonly SeasonalTheme[]} */
  const themes = Object.freeze([
    Object.freeze({
      id: "halloween",
      start: Object.freeze({ month: 10, day: 1 }),
      end: Object.freeze({ month: 10, day: 31 }),
      stylesheet: "pub/halloween.css",
      icons: Object.freeze([
        "res/icons/halloween/ghost.png",
        "res/icons/halloween/pumpkin.png",
        "res/icons/halloween/skull.png",
        "res/icons/halloween/zombie.png",
      ]),
    }),
  ]);

  // Pages may lower this with <body data-seasonal-icons="n">.
  const DEFAULT_ICON_COUNT = 8;

  /** @param {MonthDay} value */
  const ordinal = ({ month, day }) => month * 100 + day;

  /**
   * Returns the season active on `date` in local time, or null. Invalid dates
   * match no season.
   * @param {Date} date
   * @returns {SeasonalTheme | null}
   */
  function activeTheme(date) {
    const today = ordinal({ month: date.getMonth() + 1, day: date.getDate() });
    return (
      themes.find(({ start, end }) => {
        const from = ordinal(start);
        const to = ordinal(end);
        return from <= to
          ? today >= from && today <= to
          : today >= from || today <= to;
      }) ?? null
    );
  }

  /**
   * Loads the theme's stylesheet and floating icons into `doc`. Does nothing
   * when `theme` is null or a theme is already applied. Icons are added once
   * the body exists, so this is safe to call from the <head>.
   * @param {Document} doc
   * @param {SeasonalTheme | null} theme
   * @param {string | URL} root URL of the extension root.
   */
  function apply(doc, theme, root) {
    const rootElement = doc.documentElement;
    if (!theme || rootElement.dataset.seasonalTheme) return;
    rootElement.dataset.seasonalTheme = theme.id;

    const stylesheet = doc.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = new URL(theme.stylesheet, root).href;
    doc.head.append(stylesheet);

    const addIcons = () => {
      const body = /** @type {HTMLElement} */ (doc.body);
      const count = Number(body.dataset.seasonalIcons) || DEFAULT_ICON_COUNT;
      const icons = doc.createDocumentFragment();
      for (let slot = 1; slot <= count; slot++) {
        const icon = doc.createElement("img");
        icon.src = new URL(
          theme.icons[(slot - 1) % theme.icons.length],
          root,
        ).href;
        icon.alt = "";
        icon.className = `floating-icon ${theme.id}-icon-${slot}`;
        icon.setAttribute("aria-hidden", "true");
        icons.append(icon);
      }
      body.prepend(icons);
    };
    if (doc.body) addIcons();
    else doc.addEventListener("DOMContentLoaded", addIcons, { once: true });
  }

  if (typeof document !== "undefined") {
    // This script lives one level below the extension root, as do the pages.
    const script = document.currentScript;
    const base =
      script instanceof HTMLScriptElement && script.src
        ? script.src
        : document.baseURI;
    apply(document, activeTheme(new Date()), new URL("../", base));
  }

  return { themes, activeTheme, apply };
})();
