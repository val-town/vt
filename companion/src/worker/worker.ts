import { deadline } from "@std/async";
import { VTConnector } from "./VTConnector.js";

async function main() {
  console.log("Starting the VT Companion Daemon...");

  await deadline((async () => new VTConnector().getWebSocket())(), 5000)
    .then((ws) => {
      console.log("Connected to VT CLI websocket");

      ws.addEventListener("message", async (e) => {
        const link = JSON.parse(e.data).link as string;

        console.log("Reloading tabs with link ", link);
        const normalizeUrl = (url: string) => {
          const urlObj = new URL(url);
          return urlObj.origin + urlObj.pathname;
        };

        const normalizedLink = normalizeUrl(link);
        const tabs = (await chrome.tabs.query({}))
          .filter((t) => t.url && normalizeUrl(t.url).includes(normalizedLink));

        console.log("Found tabs: ", tabs);
        if (tabs) {
          tabs.forEach(async (tab) => await chrome.tabs.reload(tab.id!));
        }
      });
    })
    .catch((err) =>
      console.error("Error connecting to WebSocket server: ", err)
    );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "pageLoaded") {
    sendResponse({ status: "VT connector service worker is awake" });
    main();
  }
});

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
    main();
  } else if (info.menuItemId === "aboutMenu") {
    chrome.tabs.create({ url: "https://jsr.io/@valtown/vt" });
  }
});
