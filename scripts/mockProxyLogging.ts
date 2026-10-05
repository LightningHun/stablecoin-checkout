import type { IncomingMessage } from "node:http";
import { createLogger } from "vite";
import type { Logger, ProxyOptions } from "vite";

export function createMockProxyLogging(logger: Logger = createLogger()) {
  const connections = new Map<number, { expected: boolean }>();
  const expectedErrors = new WeakSet<Error>();
  const logError = logger.error.bind(logger);
  logger.error = (message, options) => {
    if (options?.error instanceof Error && expectedErrors.delete(options.error))
      return;
    logError(message, options);
  };

  const configure: NonNullable<ProxyOptions["configure"]> = (proxy) => {
    proxy.on("proxyReq", (upstream) => {
      const socket = upstream.socket;
      if (!socket) return;
      const connection = { expected: false };
      let port: number | undefined;
      const register = () => {
        port = socket.localPort;
        if (port !== undefined) connections.set(port, connection);
      };
      if (socket.connecting) socket.once("connect", register);
      else register();
      // Mark the exact error before Vite's existing handler logs and responds.
      upstream.prependOnceListener("error", (error: NodeJS.ErrnoException) => {
        if (
          connection.expected &&
          error.code === "ECONNRESET" &&
          error.message === "socket hang up"
        )
          expectedErrors.add(error);
      });
      upstream.once("close", () => {
        socket.off("connect", register);
        if (port !== undefined && connections.get(port) === connection)
          connections.delete(port);
      });
    });
  };

  return {
    logger,
    configure,
    onDisconnect(request: IncomingMessage) {
      const port = request.socket.remotePort;
      const connection = port === undefined ? undefined : connections.get(port);
      if (connection) connection.expected = true;
    },
  };
}
