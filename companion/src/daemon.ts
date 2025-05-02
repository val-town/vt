import { VTConnector } from "./connect";

async function main() {
  console.log("Starting the VT Companion Daemon...");

  const ws = new VTConnector();
  await ws.getWebSocket()
    .then((ws) => {
      ws.addEventListener("message", async (e) => {
        const link = JSON.parse(e.data).link as string;
        console.log("Received link: ", link);
        const allTabs = await chrome.tabs.query({})
      });
    })
    .catch((err) =>
      console.error("Error connecting to WebSocket server: ", err)
    );
}

main();
