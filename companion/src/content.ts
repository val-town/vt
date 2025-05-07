import { LOG_PREFIX } from "./consts.js";

browser.runtime.sendMessage({ action: "pageLoaded" })
  .then((response: string) => {
    console.log(
      LOG_PREFIX +
        "Detected page load on a *.web.val.run page, waking up daemon service worker",
    );
    console.log(LOG_PREFIX + response);
  })
  .catch((error: Error) => {
    console.error(LOG_PREFIX + "Error sending message:", error);
  });
