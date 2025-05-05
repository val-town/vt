import { LOG_PREFIX } from "./consts.js";

chrome.runtime.sendMessage({ action: "pageLoaded" }, (response) => {
  console.log(
    LOG_PREFIX +
      "Detected page load on a *.web.val.run page, waking up daemon service worker",
  );
  console.log(LOG_PREFIX + response);
});
