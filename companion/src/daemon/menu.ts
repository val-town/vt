import { HOME_PAGE } from "../consts.js";
import { VTDaemon } from "./VTDaemon.js";

export function setupContextMenu(daemon: VTDaemon) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "wakeUpDaemon",
      title: "Connect to VT CLI",
      contexts: ["action"],
    });

    chrome.contextMenus.create({
      id: "aboutMenu",
      title: "About VT Companion",
      contexts: ["action"],
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "wakeUpDaemon") {
      console.log("Waking up the VT Connector daemon...");
      daemon.start();
    } else if (info.menuItemId === "aboutMenu") {
      chrome.tabs.create({ url: HOME_PAGE });
    }
  });
}
