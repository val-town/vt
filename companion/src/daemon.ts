import { VTConnector } from "./connect";

async function main() {
  console.log("Starting the VT Companion Daemon...");

  const ws = new VTConnector();
  await ws.getWebSocket()
    .then((ws) => {
      ws.addEventListener("message", async (e) => {
        const link = JSON.parse(e.data).link as string;
        const tab = (await chrome.tabs.query({}))
          .find((t) => t.url === link);
        if (tab) {
          console.log("Tab already open, reloading...");
          console.log(tab)
          // Reload the tab if it is already open
          await chrome.tabs.reload(tab.id!);
        }
      });
    })
    .catch((err) =>
      console.error("Error connecting to WebSocket server: ", err)
    );
}

main();
