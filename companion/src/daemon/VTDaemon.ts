import { deadline } from "@std/async";
import { VTConnector } from "./VTConnector.js";
import { normalizeUrl } from "./utils.js";

export class VTDaemon {
  private running = false;
  private static instance: VTDaemon;

  private constructor() {}

  public static getInstance(): VTDaemon {
    if (!VTDaemon.instance) {
      VTDaemon.instance = new VTDaemon();
    }
    return VTDaemon.instance;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public async start() {
    console.log("Starting the VT Companion Daemon...");

    await deadline((async () => new VTConnector().getWebSocket())(), 5000)
      .then((ws) => {
        console.log("Connected to VT CLI websocket");

        if (this.running) {
          console.log("VT Connector is already running");
          return;
        }
        this.running = true;

        ws.addEventListener("close", (e) => {
          console.log("VT Connector websocket closed: ", e);
          this.running = false;
        });

        ws.addEventListener("message", async (e) => {
          const link = JSON.parse(e.data).link as string;

          console.log("Reloading tabs with link ", link);
          const normalizedLink = normalizeUrl(link);
          (await chrome.tabs.query({}))
            .filter((t) =>
              t.url && normalizeUrl(t.url).includes(normalizedLink)
            )
            .forEach(async (tab) => await chrome.tabs.reload(tab.id!));
        });
      })
      .catch((err) =>
        console.error("Error connecting to WebSocket server: ", err)
      );
  }
}
