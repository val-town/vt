import { HOME_PAGE } from "../consts.js";
import { VTDaemon } from "./VTDaemon.js";

export function setupContextMenu(daemon: VTDaemon) {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: "wakeUpDaemon",
      title: "Connect to VT CLI",
      contexts: ["browser_action"],
    });

    browser.contextMenus.create({
      id: "aboutMenu",
      title: "About VT Companion",
      contexts: ["browser_action"],
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "wakeUpDaemon") {
      console.log("Waking up the VT Connector daemon...");
      daemon.start();
    } else if (info.menuItemId === "aboutMenu") {
      browser.tabs.create({ url: HOME_PAGE });
    }
  });
}
