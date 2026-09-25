import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown } from "../src/parser.js";

const targets = (md: string) =>
  parseMarkdown(md).links.map((l) => ({ kind: l.kind, target: l.target, line: l.line }));

test("extracts all three link forms with line numbers", () => {
  const md = [
    "# Title",
    "",
    "See the [guide](./docs/guide.md) for details.",
    "![logo](images/logo.png \"Logo\")",
    "",
    "[spec]: https://example.com/spec",
    "Visit <https://example.com/home> today.",
  ].join("\n");

  assert.deepEqual(targets(md), [
    { kind: "inline", target: "./docs/guide.md", line: 3 },
    { kind: "image", target: "images/logo.png", line: 4 },
    { kind: "reference", target: "https://example.com/spec", line: 6 },
    { kind: "autolink", target: "https://example.com/home", line: 7 },
  ]);
});

test("ignores links inside fenced code blocks", () => {
  const md = [
    "before [a](a.md)",
    "```md",
    "[b](b.md)",
    "<https://inside.example>",
    "[ref]: c.md",
    "```",
    "~~~~",
    "[d](d.md)",
    "~~~",
    "still fenced [e](e.md)",
    "~~~~",
    "after [f](f.md)",
  ].join("\n");

  assert.deepEqual(
    targets(md).map((l) => [l.target, l.line]),
    [
      ["a.md", 1],
      ["f.md", 12],
    ],
  );
});

test("ignores links inside inline code spans", () => {
  const md = "Use `[x](x.md)` or ``<https://code.example>`` but see [y](y.md).";
  assert.deepEqual(targets(md), [{ kind: "inline", target: "y.md", line: 1 }]);
});

test("handles nested images, angle destinations, titles and parens", () => {
  const md = [
    "[![badge](https://img.example/b.svg)](https://ci.example/run)",
    "[spaced](<my file.md> 'title')",
    "[wiki](https://en.wikipedia.org/wiki/Foo_(bar))",
    "[anchor](#usage-1)",
  ].join("\n");

  assert.deepEqual(
    targets(md).map((l) => [l.kind, l.target]),
    [
      ["image", "https://img.example/b.svg"],
      ["inline", "https://ci.example/run"],
      ["inline", "my file.md"],
      ["inline", "https://en.wikipedia.org/wiki/Foo_(bar)"],
      ["inline", "#usage-1"],
    ],
  );
});

test("does not treat escaped brackets or footnotes as links", () => {
  const md = ["\\[not](a.md)", "[^1]: A footnote.", "[text] (spaced.md)"].join("\n");
  assert.deepEqual(targets(md), []);
});

test("collects ATX and setext headings outside code", () => {
  const md = [
    "# Project",
    "## Install ##",
    "```",
    "# not a heading",
    "```",
    "Usage",
    "-----",
    "Overview",
    "===",
  ].join("\n");
  assert.deepEqual(parseMarkdown(md).headings, ["Project", "Install", "Usage", "Overview"]);
});
