globalThis.SafeGuard ||= {};
SafeGuard.updatePageAction = (() => {
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;
  function updatePageAction(status, tabId) {
    const icons = {
      safe: {
        19: "res/icons/safe_19.png",
        38: "res/icons/safe_38.png",
      },
      unsafe: {
        19: "res/icons/unsafe_19.png",
        38: "res/icons/unsafe_38.png",
      },
      potentially_unsafe: {
        19: "res/icons/potentially_unsafe_19.png",
        38: "res/icons/potentially_unsafe_38.png",
      },
      starred: {
        19: "res/icons/starred_19.png",
        38: "res/icons/starred_38.png",
      },
      fmhy: {
        19: "res/icons/fmhy_19.png",
        38: "res/icons/fmhy_38.png",
      },
      extension_page: {
        19: "res/ext_icon_144.png",
        38: "res/ext_icon_144.png",
      },
      default: {
        19: "res/icons/default_19.png",
        38: "res/icons/default_38.png",
      },
    };

    const icon = icons[status] || icons["default"];

    return browserAPI.action.setIcon({
      tabId: tabId,
      path: icon,
    });
  }

  return updatePageAction;
})();
