import browser from "webextension-polyfill";
import { HOME_PAGE } from "../consts.js";
import { VTDaemon } from "./VTDaemon.js";

const isFirefox = self.navigator.userAgent.includes("Firefox");

export function setupContextMenu(daemon: VTDaemon) {
  browser.runtime.onInstalled.addListener(() => {
    // Action for manifest v3, browser_action for manifest v2. Seems like it
    // can't hurt to add both!

    chrome.contextMenus.create({
      id: "wakeUpDaemon",
      title: "Connect to VT CLI",
      contexts: [isFirefox ? "browser_action" : "action"],
    });

    chrome.contextMenus.create({
      id: "aboutMenu",
      title: "About VT Companion",
      contexts: [isFirefox ? "browser_action" : "action"],
    });
  });

  browser.contextMenus.onClicked.addListener((info, _tab) => {
    if (info.menuItemId === "wakeUpDaemon") {
      console.log("Waking up the VT Connector daemon...");
      daemon.start();
    } else if (info.menuItemId === "aboutMenu") {
      browser.tabs.create({ url: HOME_PAGE });
    }
  });
}
