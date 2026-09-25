import { stat } from "node:fs/promises";
import path from "node:path";
import { checkDirectory } from "./check.js";
import type { HttpCheckerOptions } from "./http.js";
import { formatReport } from "./report.js";

export const USAGE = `Usage: linkdoc [path]

Checks every link in the markdown files under [path] (default: current directory).

Exit codes:
  0  no broken links (unreachable links alone do not fail)
  1  at least one broken link
  2  invalid usage, or [path] missing / not a directory
`;

export interface Io {
  cwd: string;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

/** Runs the CLI and returns the process exit code. */
export async function main(argv: string[], io: Io, http: HttpCheckerOptions = {}): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    io.stdout(USAGE);
    return 0;
  }
  const unknown = argv.find((a) => a.startsWith("-"));
  if (unknown || argv.length > 1) {
    io.stderr(`linkdoc: ${unknown ? `unknown option ${unknown}` : "expected at most one path"}\n\n${USAGE}`);
    return 2;
  }

  const arg = argv[0] ?? ".";
  const root = path.resolve(io.cwd, arg);
  const info = await stat(root).catch(() => null);
  if (!info) {
    io.stderr(`linkdoc: path not found: ${arg}\n`);
    return 2;
  }
  if (!info.isDirectory()) {
    io.stderr(`linkdoc: not a directory: ${arg}\n`);
    return 2;
  }

  const result = await checkDirectory(root, http);
  io.stdout(formatReport(result));
  return result.broken > 0 ? 1 : 0;
}
