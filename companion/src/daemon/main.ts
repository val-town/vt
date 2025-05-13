importScripts("../browser-polyfill.js");

import { setupContextMenu } from "./menu.js";
import { VTDaemon } from "./VTDaemon.js";

const daemon = VTDaemon.getInstance();
setupContextMenu(daemon);
daemon.start();

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "pageLoaded") {
    if (daemon.isRunning()) {
      sendResponse("VT connector service worker is awake and running");
    } else {
      sendResponse("VT connector service worker was asleep and is waking up");
      daemon.start();
      sendResponse("VT connector service worker is awake and running");
    }
  }
  // Return true to indicate you wish to send a response asynchronously
  // This is needed for Firefox compatibility
  return true;
});
