import { createServer, type Server } from "node:http";
import type { Logger } from "./logger.js";

export type HealthState = {
  isSocketOpen(): boolean;
  disconnectedSince(): Date | null;
  channelCount(): number;
};

export function startHealthServer(port: number, state: HealthState, logger: Logger): Server {
  const server = createServer((req, res) => {
    if (req.url !== "/healthz") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }

    const disconnectedSince = state.disconnectedSince();
    const disconnectedMs = disconnectedSince ? Date.now() - disconnectedSince.getTime() : 0;
    const healthy = state.isSocketOpen() && disconnectedMs < 120_000;

    res.writeHead(healthy ? 200 : 500, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: healthy,
        socket_open: state.isSocketOpen(),
        disconnected_ms: disconnectedMs,
        channels: state.channelCount(),
      }),
    );
  });

  server.listen(port, () => {
    logger.info({ port }, "health server listening");
  });

  return server;
}
