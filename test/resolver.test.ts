import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { LocalResolver, classifyTarget } from "../src/resolver.js";
import { headingAnchors, slug } from "../src/slug.js";
import { makeTree } from "./helpers.js";

const README = [
  "# linkdoc",
  "## Install",
  "## Usage",
  "text",
  "## Usage",
  "## Exit codes & CI",
].join("\n");

async function fixture() {
  const root = await makeTree({
    "README.md": README,
    "docs/guide.md": "[home](../README.md)",
    "docs/deep/nested/page.md": "",
    "docs/assets/diagram.png": "",
    "src/index.ts": "",
  });
  return { root, resolver: new LocalResolver(root), guide: path.join(root, "docs/guide.md") };
}

test("classifies targets", () => {
  assert.equal(classifyTarget("#install"), "anchor");
  assert.equal(classifyTarget("./a.md"), "relative");
  assert.equal(classifyTarget("../a.md#x"), "relative");
  assert.equal(classifyTarget("https://example.com"), "http");
  assert.equal(classifyTarget("HTTP://example.com"), "http");
  assert.equal(classifyTarget("mailto:a@b.c"), "skip");
  assert.equal(classifyTarget("tel:+123"), "skip");
  assert.equal(classifyTarget("ftp://x"), "skip");
  assert.equal(classifyTarget(""), "skip");
});

test("resolves relative paths against the containing file's directory", async () => {
  const { resolver, guide } = await fixture();
  assert.deepEqual(await resolver.resolve("../README.md", guide), { ok: true });
  assert.deepEqual(await resolver.resolve("./deep/nested/page.md", guide), { ok: true });
  assert.deepEqual(await resolver.resolve("deep/nested", guide), { ok: true }); // directory
  assert.deepEqual(await resolver.resolve("assets/diagram.png", guide), { ok: true });
  assert.deepEqual(await resolver.resolve("../src/index.ts?plain=1", guide), { ok: true });
  assert.deepEqual(await resolver.resolve("/src/index.ts", guide), { ok: true }); // repo-root absolute
});

test("reports missing files and directories", async () => {
  const { resolver, guide } = await fixture();
  assert.deepEqual(await resolver.resolve("./nope.md", guide), {
    ok: false,
    reason: "file not found: docs/nope.md",
  });
  assert.deepEqual(await resolver.resolve("../missing-dir/", guide), {
    ok: false,
    reason: "file not found: missing-dir",
  });
  assert.equal((await resolver.resolve("./nope.md#install", guide)).ok, false);
});

test("resolves anchors in other files and the same file", async () => {
  const { root, resolver, guide } = await fixture();
  const readme = path.join(root, "README.md");
  assert.deepEqual(await resolver.resolve("../README.md#install", guide), { ok: true });
  assert.deepEqual(await resolver.resolve("#usage", readme), { ok: true });
  assert.deepEqual(await resolver.resolve("#exit-codes--ci", readme), { ok: true });
  assert.deepEqual(await resolver.resolve("../README.md#nope", guide), {
    ok: false,
    reason: "anchor #nope not found in README.md",
  });
  assert.equal((await resolver.resolve("#missing", readme)).ok, false);
});

test("anchor check fails when the heading is absent even though the file exists", async () => {
  const root = await makeTree({ "README.md": "# linkdoc\n## Setup\n", "a.md": "" });
  const resolver = new LocalResolver(root);
  const result = await resolver.resolve("./README.md#install", path.join(root, "a.md"));
  assert.deepEqual(result, { ok: false, reason: "anchor #install not found in README.md" });
});

test("duplicate headings get -1, -2 suffixes", async () => {
  const { root, resolver } = await fixture();
  const readme = path.join(root, "README.md");
  assert.deepEqual(await resolver.resolve("#usage-1", readme), { ok: true });
  assert.equal((await resolver.resolve("#usage-2", readme)).ok, false);
  assert.deepEqual([...headingAnchors(["A", "A", "A", "A-1"])], ["a", "a-1", "a-2", "a-1-1"]);
});

test("slugs follow GitHub rules", () => {
  assert.equal(slug("Install"), "install");
  assert.equal(slug("Exit codes & CI"), "exit-codes--ci");
  assert.equal(slug("`linkdoc [path]`"), "linkdoc-path");
  assert.equal(slug("What's *new* in v2.0?"), "whats-new-in-v20");
  assert.equal(slug("[Docs](./docs) and snake_case"), "docs-and-snake_case");
  assert.equal(slug("Café à la carte"), "café-à-la-carte");
});

test("anchors on non-markdown files are not checked", async () => {
  const { resolver, guide } = await fixture();
  assert.deepEqual(await resolver.resolve("../src/index.ts#L10", guide), { ok: true });
});
