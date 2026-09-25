import http from "node:http";
import type { AddressInfo } from "node:net";

export interface TestServer {
  url: string;
  /** Requests received, keyed by path. */
  hits: Map<string, number>;
  /** Highest number of requests being handled at the same moment. */
  maxInFlight: () => number;
  close: () => Promise<void>;
}

/**
 * Local HTTP server on 127.0.0.1 with path-driven behaviour:
 *   /status/<code>  → responds with that status
 *   /hang           → never responds
 *   /slow/<name>    → 200 after 100ms
 *   anything else   → 200
 */
export async function startServer(): Promise<TestServer> {
  const hits = new Map<string, number>();
  let inFlight = 0;
  let max = 0;

  const server = http.createServer((req, res) => {
    const p = req.url ?? "/";
    hits.set(p, (hits.get(p) ?? 0) + 1);
    inFlight++;
    max = Math.max(max, inFlight);
    res.on("close", () => inFlight--); // also fires when the client aborts
    const done = (code: number) => {
      res.writeHead(code, { "content-type": "text/plain" }).end(String(code));
    };

    const status = p.match(/^\/status\/(\d{3})/);
    if (status) return done(Number(status[1]));
    if (p.startsWith("/hang")) return; // never answer
    if (p.startsWith("/slow/")) return void setTimeout(() => done(200), 100);
    done(200);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    hits,
    maxInFlight: () => max,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
