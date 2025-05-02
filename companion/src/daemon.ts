import { VTConnector } from "~/companion/src/connect.ts";

async function main() {
  console.log("Starting the VT Companion Daemon...");

  const ws = new VTConnector();
  await ws.getWebSocket()
    .then((ws) => {
      ws.addEventListener("message", (e) => {
        console.log("Message from server: ", e.data);
      });
    })
    .catch((err) =>
      console.error("Error connecting to WebSocket server: ", err)
    );
}

main();
