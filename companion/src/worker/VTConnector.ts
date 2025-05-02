import {
  MAX_PORT_ATTEMPTS,
  VT_COMPANION_HOST,
  VT_COMPANION_PORT,
} from "../consts.js";
import { delay } from "@std/async";

export class VTConnector {
  private webSocket: WebSocket | null = null;
  private isConnecting = false;

  constructor(
    private readonly host = VT_COMPANION_HOST,
    private readonly basePort = VT_COMPANION_PORT,
    private readonly maxPortAttempts = MAX_PORT_ATTEMPTS,
    private readonly reconnectDelay = 750,
  ) {
    console.log("VT Connector initialized");
  }

  /**
   * Get the current WebSocket connection or establish one if needed
   */
  async getWebSocket(): Promise<WebSocket> {
    // If we have a working connection, return it
    if (this.webSocket?.readyState === WebSocket.OPEN) return this.webSocket;

    // If we're in the process of connecting, wait for it to complete
    if (this.isConnecting) {
      while (this.isConnecting) await delay(100);
      if (this.webSocket?.readyState === WebSocket.OPEN) return this.webSocket;
    }

    // Otherwise initiate a new connection
    return this.connect();
  }

  /**
   * Establish a connection to the WebSocket server
   */
  private async connect(): Promise<WebSocket> {
    this.isConnecting = true;

    try {
      console.log("Attempting to connect to VT WebSocket...");

      while (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
        try {
          const connectionPromises: Promise<WebSocket>[] = [];
          for (
            let portOffset = 0;
            portOffset < this.maxPortAttempts;
            portOffset++
          ) {
            const currentPort = this.basePort + portOffset;
            const connectionPromise = this.connectToPort(currentPort)
              .then((ws) => {
                this.webSocket = ws;
                this.startKeepAlive();
                return ws;
              })
              .catch((portError) => {
                console.log(
                  `Failed to connect on port ${currentPort}:`,
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
        } catch (error) {
          console.error("Failed to connect to any port:", error);
          await delay(this.reconnectDelay);
          console.log("Attempting to reconnect...");
        }
      }

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
      if (this.webSocket?.readyState === WebSocket.OPEN) {
        this.webSocket.send("keepalive");
      } else this.reconnect();
    });
  }

  private async reconnect() {
    if (!this.isConnecting) await this.connect();
  }
}
