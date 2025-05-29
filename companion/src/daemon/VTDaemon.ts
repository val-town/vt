import browser from "webextension-polyfill";
import { deadline } from "@std/async";
import { VTConnector } from "./VTConnector.js";
import { normalizeUrl } from "./utils.js";

export class VTDaemon {
  private ws: WebSocket | null = null;
  private static instance: VTDaemon;

  private constructor() {}

  public static getInstance(): VTDaemon {
    if (!VTDaemon.instance) {
      VTDaemon.instance = new VTDaemon();
    }
    return VTDaemon.instance;
  }

  public isRunning(): boolean {
    return this.ws !== null && this.ws.readyState === 1;
  }

  public async start() {
    console.log("Starting the VT Companion Daemon...");

    await deadline((() => new VTConnector().getWebSocket())(), 5000)
      .then((ws) => {
        if (this.isRunning()) {
          console.log("VT Connector is already running");
          return;
        }
        console.log("Connected to VT CLI websocket");

        this.ws = ws;

        ws.addEventListener("close", (e) => {
          console.log("VT Connector websocket closed: ", e);
          this.ws = null;
        });

        ws.addEventListener("error", (e) => {
          console.error("VT Connector websocket error: ", e);
          this.ws = null;
        });

        ws.addEventListener("open", () => {
          console.log("VT Connector websocket opened");
        });

        ws.addEventListener("message", async (e) => {
          const link = JSON.parse(e.data).link as string;

          console.log("Reloading tabs with link ", link);
          const normalizedLink = normalizeUrl(link);
          (await browser.tabs.query({}))
            .filter((tab) => {
              if (!tab.url) return false;
              const tabUrl = normalizeUrl(tab.url);
              // Check if tabUrl is a substring of normalizedLink (tab is parent of link)
              // or if normalizedLink is a substring of tabUrl (link is parent of tab).
              // Libraries like React Router may use a fake URL for routing.
              return tabUrl.includes(normalizedLink) ||
                normalizedLink.includes(tabUrl);
            })
            .forEach(async (tab) => {
              console.log("Reloading tab ", tab.id, " with link ", link);
              await browser.tabs.reload(tab.id!);
            });
        });
      })
      .catch((err) =>
        console.error("Error connecting to WebSocket server: ", err)
      );
  }
}
