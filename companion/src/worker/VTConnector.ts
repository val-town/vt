import { VT_COMPANION_HOST, VT_COMPANION_PORTS } from "../consts.js";
import { delay } from "@std/async";

export class VTConnector {
  private webSocket: WebSocket | null = null;
  private isConnecting = false;
  private gaveUp = false;
  private connectionAttempts = 0;

  constructor(
    private readonly host = VT_COMPANION_HOST,
    private readonly ports = VT_COMPANION_PORTS, // List of ports
    private readonly reconnectDelay = 750,
    private readonly keepAliveInterval = 100,
    private readonly maxReconnectAttempts = 3,
  ) {
    console.log("VT Connector initialized");
  }

  /**
   * Get the current WebSocket connection or establish one if needed
   */
  async getWebSocket(): Promise<WebSocket> {
    if (this.webSocket?.readyState === WebSocket.OPEN) return this.webSocket;
    if (this.isConnecting) {
      while (this.isConnecting) await delay(100);
      if (this.webSocket?.readyState === WebSocket.OPEN) return this.webSocket;
    }
    return this.connect();
  }

  /**
   * Establish a connection to the WebSocket server
   */
  private async connect(): Promise<WebSocket> {
    if (this.webSocket?.readyState === WebSocket.OPEN) return this.webSocket;
    if (this.gaveUp) {
      console.error(
        "Gave up on reconnecting. No further attempts will be made.",
      );
      throw new Error("Gave up on reconnecting");
    }

    this.isConnecting = true;
    try {
      console.log("Attempting to connect to VT WebSocket...");

      while (
        !this.webSocket || this.webSocket.readyState !== WebSocket.OPEN
      ) {
        if (this.connectionAttempts >= this.maxReconnectAttempts) {
          console.error(
            `Max reconnect attempts reached (${this.maxReconnectAttempts}).`,
          );
          this.gaveUp = true;
          throw new Error("Max reconnect attempts reached");
        }

        const connectionPromises: Promise<WebSocket>[] = [];
        for (const port of this.ports) {
          const connectionPromise = this.connectToPort(port)
            .then((ws) => {
              this.webSocket = ws;
              this.gaveUp = false; // Reset gaveUp on successful connection
              this.startKeepAlive();
              return ws;
            })
            .catch((portError) => {
              console.log(
                `Failed to connect on port ${port}:`,
                portError,
              );
              throw portError;
            });
          connectionPromises.push(connectionPromise);
          await delay(200); // Stagger the connection attempts
        }

        try {
          this.webSocket = await Promise.race(connectionPromises);
        } catch (error) {
          console.error("Failed to connect to any port:", error);
          await delay(this.reconnectDelay);
          console.log("Attempting to reconnect...");
        }

        this.connectionAttempts++;
      }

      this.connectionAttempts = 0;
      return this.webSocket;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Attempt to connect to a specific port
   */
  private connectToPort(port: number): Promise<WebSocket> {
    console.log(`Attempting to connect on port ${port}...`);

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(`ws://${this.host}:${port}`);

        ws.onopen = (event) => {
          console.log(`Opened VT WebSocket connection on port ${port}`);
          console.log({ event });
          resolve(ws);
        };

        ws.onclose = (event) => {
          console.log(`Closed VT WebSocket connection on port ${port}`);
          console.log({ event });
          if (this.webSocket === ws) {
            this.webSocket = null;
            this.reconnect();
          }
        };

        delay(4000).then(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close();
            reject(new Error(`Connection timeout on port ${port}`));
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Start a keep-alive mechanism to maintain the WebSocket connection
   */
  private startKeepAlive(): void {
    setInterval(() => {
      if (this.webSocket?.readyState === WebSocket.OPEN && !this.gaveUp) {
        this.webSocket.send("keepalive");
      } else this.reconnect();
    }, this.keepAliveInterval);
  }

  private async reconnect() {
    if (!this.isConnecting && !this.gaveUp) await this.connect();
  }
}
