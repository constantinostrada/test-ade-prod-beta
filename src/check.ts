import { readFile } from "node:fs/promises";
import path from "node:path";
import { HttpChecker, type HttpCheckerOptions } from "./http.js";
import { parseMarkdown } from "./parser.js";
import { LocalResolver, classifyTarget } from "./resolver.js";
import { findMarkdownFiles } from "./walk.js";

export interface Finding {
  /** Path relative to the checked root, with forward slashes. */
  file: string;
  line: number;
  /** Target exactly as written in the markdown. */
  target: string;
  status: "broken" | "unreachable";
  reason: string;
}

export interface CheckResult {
  filesScanned: number;
  linksChecked: number;
  findings: Finding[];
  broken: number;
  unreachable: number;
}

/** Checks every markdown link under `root`. */
export async function checkDirectory(root: string, http: HttpCheckerOptions = {}): Promise<CheckResult> {
  const files = await findMarkdownFiles(root);
  const resolver = new LocalResolver(root);
  const checker = new HttpChecker(http);
  const pending: Promise<Finding | null>[] = [];

  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const { links } = parseMarkdown(await readFile(file, "utf8"));
    for (const link of links) {
      const kind = classifyTarget(link.target);
      if (kind === "skip") continue;
      const base = { file: rel, line: link.line, target: link.target };
      if (kind === "http") {
        pending.push(
          checker.check(link.target).then((r) => (r.status === "ok" ? null : { ...base, status: r.status, reason: r.reason })),
        );
      } else {
        pending.push(
          resolver.resolve(link.target, file).then((r) => (r.ok ? null : { ...base, status: "broken" as const, reason: r.reason })),
        );
      }
    }
  }

  const findings = (await Promise.all(pending)).filter((f): f is Finding => f !== null);
  return {
    filesScanned: files.length,
    linksChecked: pending.length,
    findings,
    broken: findings.filter((f) => f.status === "broken").length,
    unreachable: findings.filter((f) => f.status === "unreachable").length,
  };
}
