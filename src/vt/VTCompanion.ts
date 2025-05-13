import {
  VT_COMPANION_HOST,
  VT_COMPANION_PORTS,
} from "~/companion/src/consts.ts";

/**
 * VTCompanion is manages a WebSocket server for communication with the VT
 * companion browser extension.
 */
export default class VTCompanion {
  private socket?: WebSocket;

  /**
   * Constructs a new VTCompanion instance.
   *
   * @param ports Candidate ports for the WebSocket server to listen on.
   * @param host The host address to listen on (default: "localhost").
   * @param onConnect A callback function to be called when a client connects.
   */
  constructor(
    {
      ports,
      host,
      onConnect,
    }: {
      ports?: number[];
      host?: string;
      onConnect?: () => void;
    } = {},
  ) {
    this.ports = ports ?? VT_COMPANION_PORTS;
    this.host = host ?? VT_COMPANION_HOST;
    this.onConnect = onConnect ?? (() => {});
  }

  public readonly ports: number[];
  public readonly host: string;
  private onConnect: () => void;

  /**
   * Sends a message to the connected WebSocket client.
   *
   * @param link The message to send.
   */
  public reloadTab(link: string) {
    if (this.socket) {
      this.socket.send(JSON.stringify({ link }));
    }
  }

  /**
   * Starts the WebSocket server.
   *
   * Attempts to start the server on the configured port, and if that fails,
   * tries the next ports.
   *
   * @returns A Deno server instance, or undefined if no port was available.
   */
  public start() {
    for (const port of this.ports) {
      try {
        return Deno.serve(
          {
            port: port,
            hostname: this.host,
            onListen: () => {},
          },
          (req) => {
            const { socket, response } = Deno.upgradeWebSocket(req);
            this.socket = socket;
            socket.addEventListener("open", this.onConnect);
            return response;
          },
        );
      } catch (e) {
        if (!(e instanceof Deno.errors.AddrInUse)) throw e;
      }
    }
    return undefined;
  }
}
