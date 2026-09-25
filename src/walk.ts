import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);

/** Recursively lists `.md` files under `root`, sorted, skipping SKIP_DIRS at any depth. */
export async function findMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await visit(full);
      } else if (entry.name.toLowerCase().endsWith(".md")) {
        // Symlinked files count; symlinked directories are not followed (no loops).
        if (entry.isFile() || (entry.isSymbolicLink() && (await isFile(full)))) out.push(full);
      }
    }
  }
  await visit(root);
  return out.sort();
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}
