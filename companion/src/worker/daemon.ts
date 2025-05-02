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
          })
        }
      });
    })
    .catch((err) => console.error("Error connecting to WebSocket server: ", err));
}

main();
