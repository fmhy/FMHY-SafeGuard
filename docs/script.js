(() => {
  "use strict";
  document.documentElement.classList.add("js");

  const body = document.body;
  const themeToggle = document.getElementById("themeToggle");
  const themeLabel = themeToggle?.querySelector(".theme-label");
  const themePicker = document.getElementById("themePicker");
  const themeTrigger = document.getElementById("themeTrigger");
  const themeTriggerIcon = document.getElementById("themeTriggerIcon");
  const themeMenu = document.getElementById("themeMenu");
  const themeOptions = [...document.querySelectorAll("[data-theme-value]")];
  const menuToggle = document.getElementById("menuToggle");
  const mobileMenu = document.getElementById("mobileMenu");
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const themes = ["light", "dark", "amoled"];

  function getSystemTheme() {
    return systemTheme.matches ? "dark" : "light";
  }

  function getCurrentTheme() {
    return themes.includes(body.dataset.theme)
      ? body.dataset.theme
      : getSystemTheme();
  }

  function updateThemeControls() {
    const currentTheme = getCurrentTheme();

    if (themeToggle && themeLabel) {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      themeLabel.textContent = nextTheme === "light" ? "Light" : "Dark";
      themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
      themeToggle.setAttribute(
        "aria-pressed",
        String(currentTheme === "light"),
      );
    }

    if (themeTrigger && themeTriggerIcon) {
      themeTrigger.setAttribute(
        "aria-label",
        `Choose theme. Current theme: ${currentTheme}`,
      );
      themeTriggerIcon.className = `theme-icon theme-icon-${currentTheme}`;
    }

    themeOptions.forEach((option) => {
      option.setAttribute(
        "aria-checked",
        String(option.dataset.themeValue === currentTheme),
      );
    });
  }

  function setTheme(theme, persist = true) {
    if (!themes.includes(theme)) return;
    body.dataset.theme = theme;
    if (persist) localStorage.setItem("theme", theme);
    updateThemeControls();
  }

  function closeThemeMenu(restoreFocus = false) {
    if (!themeMenu || !themeTrigger) return;
    themeMenu.hidden = true;
    themeTrigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) themeTrigger.focus();
  }

  function openThemeMenu(focusSelected = false) {
    if (!themeMenu || !themeTrigger) return;
    closeMobileMenu();
    themeMenu.hidden = false;
    themeTrigger.setAttribute("aria-expanded", "true");
    if (focusSelected) {
      themeOptions
        .find((option) => option.getAttribute("aria-checked") === "true")
        ?.focus();
    }
  }

  const savedTheme = localStorage.getItem("theme");
  setTheme(themes.includes(savedTheme) ? savedTheme : getSystemTheme(), false);

  themeToggle?.addEventListener("click", () => {
    const nextTheme = getCurrentTheme() === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });

  systemTheme.addEventListener("change", () => {
    if (!localStorage.getItem("theme")) setTheme(getSystemTheme(), false);
  });

  themeTrigger?.addEventListener("click", () => {
    if (!themeMenu) return;
    if (themeMenu.hidden) openThemeMenu();
    else closeThemeMenu();
  });

  themeTrigger?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openThemeMenu(true);
  });

  themeOptions.forEach((option, index) => {
    option.addEventListener("click", () => {
      setTheme(option.dataset.themeValue);
      closeThemeMenu(true);
    });

    option.addEventListener("keydown", (event) => {
      let nextIndex = null;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setTheme(option.dataset.themeValue);
        closeThemeMenu(true);
        return;
      }
      if (event.key === "ArrowDown")
        nextIndex = (index + 1) % themeOptions.length;
      if (event.key === "ArrowUp")
        nextIndex = (index - 1 + themeOptions.length) % themeOptions.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = themeOptions.length - 1;
      if (event.key === "Escape") {
        event.preventDefault();
        closeThemeMenu(true);
        return;
      }
      if (nextIndex === null) return;
      event.preventDefault();
      themeOptions[nextIndex].focus();
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (themePicker && !themePicker.contains(event.target)) closeThemeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && themeMenu && !themeMenu.hidden) {
      event.preventDefault();
      closeThemeMenu(true);
    }
  });

  function closeMobileMenu() {
    if (!mobileMenu || !menuToggle) return;
    mobileMenu.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
  }

  menuToggle?.addEventListener("click", () => {
    if (!mobileMenu) return;
    closeThemeMenu();
    const isOpen = !mobileMenu.hidden;
    mobileMenu.hidden = isOpen;
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
  });

  mobileMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });

  function observeSections() {
    const navLinks = [...document.querySelectorAll(".nav-links a")];
    const trackedSections = [...document.querySelectorAll("section[id]")];

    if ("IntersectionObserver" in window && trackedSections.length) {
      const sectionObserver = new IntersectionObserver(
        (entries) => {
          const visibleEntry = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

          if (!visibleEntry) return;
          navLinks.forEach((link) => {
            const isActive =
              link.getAttribute("href") === `#${visibleEntry.target.id}`;
            link.classList.toggle("active", isActive);
            if (isActive) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
          });
        },
        { rootMargin: "-25% 0px -60%", threshold: [0.05, 0.25, 0.5] },
      );

      trackedSections.forEach((section) => sectionObserver.observe(section));
    }
  }

  function revealContent() {
    const revealItems = document.querySelectorAll(".reveal");
    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
    } else {
      const revealObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -8%", threshold: 0.12 },
      );

      revealItems.forEach((item) => revealObserver.observe(item));
    }
  }

  observeSections();
  revealContent();
})();
