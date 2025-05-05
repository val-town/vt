import { setupContextMenu } from "./menu.js";
import { VTDaemon } from "./VTDaemon.js";

const daemon = VTDaemon.getInstance();
setupContextMenu(daemon);
daemon.start();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "pageLoaded") {
    if (daemon.isRunning()) {
      sendResponse("VT connector service worker is awake and running");
    } else {
      sendResponse("VT connector service worker was asleep and is waking up");
      daemon.start();
      sendResponse("VT connector service worker is awake and running");
    }
  }
});
