import type { CheckResult } from "./check.js";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Human-readable report: one line per finding, then a summary line. */
export function formatReport(result: CheckResult): string {
  const lines = result.findings.map(
    (f) => `${f.status === "broken" ? "BROKEN     " : "UNREACHABLE"}  ${f.file}:${f.line}  ${f.target}  (${f.reason})`,
  );
  if (lines.length > 0) lines.push("");
  lines.push(
    `${plural(result.filesScanned, "file")} scanned, ${plural(result.linksChecked, "link")} checked: ` +
      `${result.broken} broken, ${result.unreachable} unreachable`,
  );
  return lines.join("\n") + "\n";
}
