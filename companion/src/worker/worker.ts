import { VTConnector } from "./VTConnector.js";

async function main() {
  console.log("Starting the VT Companion Daemon...");

  const ws = new VTConnector();
  await ws.getWebSocket()
    .then((ws) => {
      ws.addEventListener("message", async (e) => {
        const link = JSON.parse(e.data).link as string;

        console.log("Reloading tabs with link ", link);
        const tabs = (await chrome.tabs.query({}))
          .filter((t) => t.url?.match(link));

        console.log("Found tabs: ", tabs);
        if (tabs) {
          tabs.forEach(async (tab) => {
            await chrome.tabs.reload(tab.id!);
          });
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
    title: "Wake up reload daemon",
    contexts: ["action"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "wakeUpDaemon") {
    console.log("Context menu clicked, waking up daemon...");
    main();
  }
});
