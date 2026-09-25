import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { HttpChecker } from "../src/http.js";
import { startServer, type TestServer } from "./server.js";

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.close());

test("2xx is ok, 404 and 410 are broken", async () => {
  const checker = new HttpChecker();
  assert.deepEqual(await checker.check(`${server.url}/fine`), { status: "ok", code: 200 });
  assert.deepEqual(await checker.check(`${server.url}/status/404`), { status: "broken", reason: "HTTP 404" });
  assert.deepEqual(await checker.check(`${server.url}/status/410`), { status: "broken", reason: "HTTP 410" });
});

test("a server that never responds is unreachable after the 5s timeout", async () => {
  const checker = new HttpChecker();
  const started = Date.now();
  const result = await checker.check(`${server.url}/hang`);
  const elapsed = Date.now() - started;
  assert.deepEqual(result, { status: "unreachable", reason: "timeout after 5s" });
  assert.ok(elapsed >= 4900 && elapsed < 6500, `took ${elapsed}ms`);
});

test("connection refused is unreachable, not broken", async () => {
  const closed = http.createServer();
  await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
  const { port } = closed.address() as AddressInfo;
  await new Promise((r) => closed.close(r));

  const result = await new HttpChecker().check(`http://127.0.0.1:${port}/`);
  assert.deepEqual(result, { status: "unreachable", reason: "connection refused (ECONNREFUSED)" });
});

test("never more than 8 requests in flight", async () => {
  const checker = new HttpChecker();
  const urls = Array.from({ length: 20 }, (_, i) => `${server.url}/slow/${i}`);
  const results = await Promise.all(urls.map((u) => checker.check(u)));
  assert.ok(results.every((r) => r.status === "ok"));
  assert.equal(urls.filter((u) => server.hits.get(new URL(u).pathname) === 1).length, 20);
  assert.ok(server.maxInFlight() <= 8, `max in flight ${server.maxInFlight()}`);
  assert.equal(server.maxInFlight(), 8); // the limit is actually used
});

test("each distinct URL is requested once per run", async () => {
  const checker = new HttpChecker();
  const url = `${server.url}/status/404?dedupe`;
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => checker.check(url)));
  results.push(await checker.check(`${url}#fragment`));
  assert.equal(server.hits.get("/status/404?dedupe"), 1);
  for (const r of results) assert.deepEqual(r, { status: "broken", reason: "HTTP 404" });
});
