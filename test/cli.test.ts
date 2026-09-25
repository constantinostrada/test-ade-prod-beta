import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeTree } from "./helpers.js";
import { startServer, type TestServer } from "./server.js";

const CLI = fileURLToPath(new URL("../src/cli.js", import.meta.url));

function run(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { cwd }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code as number) : 0, stdout, stderr });
    });
  });
}

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.close());

const VALID = {
  "README.md": "# Demo\n## Install\n\nSee [guide](docs/guide.md#usage) and [mail](mailto:a@b.c).\n",
  "docs/guide.md": "# Guide\n## Usage\n\nBack [home](../README.md) or [install](../README.md#install).\n",
};

test("no argument checks the current directory", async () => {
  const root = await makeTree({ ...VALID, "docs/bad.md": "[x](./nope.md)\n" });
  const res = await run([], root);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /^BROKEN\s+docs\/bad\.md:1\s+\.\/nope\.md\s+\(file not found: docs\/nope\.md\)$/m);
  assert.match(res.stdout, /3 files scanned, 4 links checked: 1 broken, 0 unreachable/);
});

test("a path argument checks only that directory", async () => {
  const root = await makeTree({ ...VALID, "other/bad.md": "[x](./nope.md)\n" });
  const res = await run(["./docs"], root);
  assert.equal(res.code, 0, res.stdout);
  assert.match(res.stdout, /^1 file scanned, 2 links checked: 0 broken, 0 unreachable$/m);
});

test("a missing path or a file path is an error", async () => {
  const root = await makeTree(VALID);
  const missing = await run(["./missing"], root);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /linkdoc: path not found: \.\/missing/);
  const file = await run(["README.md"], root);
  assert.equal(file.code, 2);
  assert.match(file.stderr, /linkdoc: not a directory: README\.md/);
});

test("node_modules, .git and dist are skipped at any depth", async () => {
  const bad = "[x](./nope.md)\n";
  const root = await makeTree({
    ...VALID,
    "node_modules/pkg/README.md": bad,
    ".git/info.md": bad,
    "dist/out.md": bad,
    "packages/a/node_modules/dep/doc.md": bad,
    "packages/a/dist/x/doc.md": bad,
    "packages/a/.git/doc.md": bad,
    "packages/a/README.md": "ok\n",
  });
  const res = await run([], root);
  assert.equal(res.code, 0, res.stdout);
  assert.match(res.stdout, /^3 files scanned/m);
});

test("valid repo exits 0; one broken relative link exits 1", async () => {
  const root = await makeTree(VALID);
  assert.equal((await run([], root)).code, 0);

  const broken = await makeTree({ ...VALID, "docs/guide.md": VALID["docs/guide.md"] + "[gone](./nope.md)\n" });
  const res = await run([], broken);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /docs\/guide\.md:5\s+\.\/nope\.md\s+\(file not found: docs\/nope\.md\)/);
});

test("missing anchor is reported as broken", async () => {
  const root = await makeTree({ "README.md": "# Demo\n## Setup\n", "a.md": "[i](./README.md#install)\n" });
  const res = await run([], root);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /BROKEN\s+a\.md:1\s+\.\/README\.md#install\s+\(anchor #install not found in README\.md\)/);
});

test("an HTTP 404 is broken and exits 1", async () => {
  const root = await makeTree({ "a.md": `[dead](${server.url}/status/404)\n[fine](${server.url}/ok)\n` });
  const res = await run([], root);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /BROKEN\s+a\.md:1\s+http:\S+\/status\/404\s+\(HTTP 404\)/);
  assert.match(res.stdout, /2 links checked: 1 broken, 0 unreachable/);
});

test("a hanging host is unreachable, not broken, and exits 0", async () => {
  const root = await makeTree({ "a.md": `[slow](${server.url}/hang)\n` });
  const started = Date.now();
  const res = await run([], root);
  const elapsed = Date.now() - started;
  assert.equal(res.code, 0, res.stdout);
  assert.match(res.stdout, /UNREACHABLE\s+a\.md:1\s+http:\S+\/hang\s+\(timeout after 5s\)/);
  assert.match(res.stdout, /0 broken, 1 unreachable/);
  assert.ok(elapsed >= 4900 && elapsed < 8000, `took ${elapsed}ms`);
});

test("a URL used in 5 places across 3 files is requested once", async () => {
  const url = `${server.url}/status/410?shared`;
  const root = await makeTree({
    "a.md": `[one](${url})\n[two](${url})\n`,
    "b.md": `<${url}>\n\n[ref]: ${url}\n`,
    "sub/c.md": `![img](${url})\n`,
  });
  const res = await run([], root);
  assert.equal(server.hits.get("/status/410?shared"), 1);
  const findings = res.stdout.split("\n").filter((l) => l.startsWith("BROKEN"));
  assert.equal(findings.length, 5);
  for (const line of findings) assert.ok(line.endsWith(`${url}  (HTTP 410)`), line);
  assert.deepEqual(
    findings.map((l) => l.split(/\s+/)[1]),
    ["a.md:1", "a.md:2", "b.md:1", "b.md:3", "sub/c.md:1"],
  );
});
