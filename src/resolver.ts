import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseMarkdown } from "./parser.js";
import { headingAnchors } from "./slug.js";

export type TargetKind = "anchor" | "relative" | "http" | "skip";

const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/;
const MARKDOWN_EXT = /\.(md|markdown)$/i;

/** Decides how a raw link target is checked. */
export function classifyTarget(target: string): TargetKind {
  if (target === "" || target.startsWith("//")) return "skip";
  if (target.startsWith("#")) return "anchor";
  const scheme = target.match(SCHEME);
  if (scheme) return /^https?$/i.test(scheme[1]) ? "http" : "skip";
  return "relative";
}

export type LocalResult = { ok: true } | { ok: false; reason: string };

/**
 * Resolves relative paths and #anchors against the filesystem. File stats and
 * heading anchors are cached per instance, so one instance serves a whole run.
 */
export class LocalResolver {
  private readonly anchors = new Map<string, Promise<Set<string>>>();
  private readonly stats = new Map<string, Promise<"file" | "dir" | null>>();

  /** @param root Directory that `/absolute` targets resolve against. */
  constructor(private readonly root: string) {}

  async resolve(target: string, fromFile: string): Promise<LocalResult> {
    const hashAt = target.indexOf("#");
    const pathPart = hashAt === -1 ? target : target.slice(0, hashAt);
    const fragment = hashAt === -1 ? "" : target.slice(hashAt + 1);
    const filePart = pathPart.split("?")[0];

    let resolved = fromFile;
    if (filePart !== "") {
      const decoded = safeDecode(filePart);
      resolved = decoded.startsWith("/")
        ? path.join(this.root, decoded)
        : path.resolve(path.dirname(fromFile), decoded);
      const kind = await this.kindOf(resolved);
      if (!kind) return { ok: false, reason: `file not found: ${this.display(resolved)}` };
      if (kind === "dir") return { ok: true };
    }

    if (fragment === "" || !MARKDOWN_EXT.test(resolved)) return { ok: true };

    const anchors = await this.anchorsOf(resolved);
    const wanted = safeDecode(fragment);
    if (anchors.has(wanted) || anchors.has(wanted.toLowerCase())) return { ok: true };
    return { ok: false, reason: `anchor #${fragment} not found in ${this.display(resolved)}` };
  }

  private display(file: string): string {
    const rel = path.relative(this.root, file);
    return (rel === "" || rel.startsWith("..") ? file : rel).split(path.sep).join("/");
  }

  private kindOf(file: string): Promise<"file" | "dir" | null> {
    let cached = this.stats.get(file);
    if (!cached) {
      cached = stat(file).then(
        (s) => (s.isDirectory() ? "dir" : "file"),
        () => null,
      );
      this.stats.set(file, cached);
    }
    return cached;
  }

  private anchorsOf(file: string): Promise<Set<string>> {
    let cached = this.anchors.get(file);
    if (!cached) {
      cached = readFile(file, "utf8").then((text) => headingAnchors(parseMarkdown(text).headings));
      this.anchors.set(file, cached);
    }
    return cached;
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
