/**
 * External URL checks: bounded concurrency, per-request timeout and a per-run
 * cache so each distinct URL hits the network once.
 */

export type HttpResult =
  | { status: "ok"; code: number }
  | { status: "broken"; reason: string }
  | { status: "unreachable"; reason: string };

export interface HttpCheckerOptions {
  /** Max requests in flight at once. Default 8. */
  concurrency?: number;
  /** Per-request timeout in milliseconds. Default 5000. */
  timeoutMs?: number;
}

export class HttpChecker {
  private readonly cache = new Map<string, Promise<HttpResult>>();
  private readonly queue: Array<() => void> = [];
  private active = 0;
  private readonly concurrency: number;
  private readonly timeoutMs: number;

  constructor(options: HttpCheckerOptions = {}) {
    this.concurrency = options.concurrency ?? 8;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  /** Checks a URL; repeated calls for the same URL share one request. */
  check(url: string): Promise<HttpResult> {
    const key = url.split("#")[0];
    let cached = this.cache.get(key);
    if (!cached) {
      cached = this.limited(() => this.request(key));
      this.cache.set(key, cached);
    }
    return cached;
  }

  private async limited<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      // The finishing task hands its slot straight to us (active unchanged),
      // so a newcomer can't slip in between and exceed the limit.
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await task();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }

  private async request(url: string): Promise<HttpResult> {
    try {
      new URL(url);
    } catch {
      return { status: "broken", reason: "invalid URL" };
    }
    try {
      // GET rather than HEAD: many servers answer HEAD wrongly, and a HEAD→GET
      // fallback would send two requests. The body is discarded unread.
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "user-agent": "linkdoc", accept: "*/*" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      await res.body?.cancel().catch(() => {});
      if (res.status === 429) return { status: "unreachable", reason: "HTTP 429 (rate limited)" };
      if (res.status >= 400) return { status: "broken", reason: `HTTP ${res.status}` };
      return { status: "ok", code: res.status };
    } catch (err) {
      return { status: "unreachable", reason: describeNetworkError(err, this.timeoutMs) };
    }
  }
}

function describeNetworkError(err: unknown, timeoutMs: number): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return `timeout after ${timeoutMs / 1000}s`;
  }
  const code = e?.cause?.code;
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `DNS lookup failed (${code})`;
    case "ECONNREFUSED":
      return "connection refused (ECONNREFUSED)";
    case "ECONNRESET":
    case "UND_ERR_SOCKET":
      return `connection reset (${code})`;
  }
  if (code) return `network error (${code})`;
  return `network error (${e?.cause?.message ?? e?.message ?? String(err)})`;
}
