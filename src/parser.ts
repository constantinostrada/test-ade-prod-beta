/**
 * Line-oriented markdown scanner. Extracts link targets (with 1-based line
 * numbers) and heading texts, ignoring anything inside fenced code blocks or
 * inline code spans. It is not a full CommonMark parser; it covers the link
 * forms linkdoc checks.
 */

export type LinkKind = "inline" | "image" | "reference" | "autolink";

export interface Link {
  kind: LinkKind;
  /** Target exactly as written, minus enclosing `<…>` when present. */
  target: string;
  /** 1-based line number in the source file. */
  line: number;
}

export interface ParsedMarkdown {
  links: Link[];
  /** Heading texts in document order (raw markdown, not slugged). */
  headings: string[];
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ATX_HEADING = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const REFERENCE_DEF = /^ {0,3}\[([^\]]+)\]:[ \t]*(?:<([^>\n]*)>|(\S+))/;
const AUTOLINK = /<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*)>/g;
// Lines that cannot be the text of a setext heading.
const NOT_SETEXT_TEXT = /^ {0,3}(?:[-*+>]|\d+[.)]|#|\||<)/;

export function parseMarkdown(source: string): ParsedMarkdown {
  const lines = source.split(/\r?\n/);
  const links: Link[] = [];
  const headings: string[] = [];

  let fence: { char: string; length: number } | null = null;
  let previousText: string | null = null; // candidate setext heading text

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;

    if (fence) {
      const close = raw.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }

    const open = raw.match(FENCE_OPEN);
    // A backtick fence's info string may not contain backticks.
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      fence = { char: open[1][0], length: open[1].length };
      previousText = null;
      continue;
    }

    if (raw.trim() === "") {
      previousText = null;
      continue;
    }

    if (previousText !== null && SETEXT_UNDERLINE.test(raw)) {
      headings.push(previousText.trim());
      previousText = null;
      continue;
    }

    const atx = raw.match(ATX_HEADING);
    if (atx) {
      headings.push((atx[1] ?? "").trim());
      previousText = null;
    } else {
      previousText = NOT_SETEXT_TEXT.test(raw) ? null : raw;
    }

    const def = raw.match(REFERENCE_DEF);
    if (def && !def[1].startsWith("^")) {
      links.push({ kind: "reference", target: def[2] ?? def[3], line: lineNo });
      continue;
    }

    const masked = maskCodeSpans(raw);
    const { found, rest } = extractInlineLinks(masked);
    for (const l of found) links.push({ ...l, line: lineNo });
    for (const m of rest.matchAll(AUTOLINK)) {
      links.push({ kind: "autolink", target: m[1], line: lineNo });
    }
  }

  return { links, headings };
}

/** Replaces inline code spans (and escaped chars) with spaces, keeping offsets. */
export function maskCodeSpans(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      out += "  ";
      i += 2;
      continue;
    }
    if (ch === "`") {
      let run = 0;
      while (line[i + run] === "`") run++;
      const ticks = "`".repeat(run);
      // Find a closing run of exactly the same length.
      let j = i + run;
      let close = -1;
      while ((j = line.indexOf(ticks, j)) !== -1) {
        let len = 0;
        while (line[j + len] === "`") len++;
        if (len === run) {
          close = j;
          break;
        }
        j += len;
      }
      if (close === -1) {
        out += ticks; // unmatched backticks are literal
        i += run;
      } else {
        out += " ".repeat(close + run - i);
        i = close + run;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Finds `[text](dest)` / `![alt](dest)` on a masked line. Returns the links and
 * the line with those links blanked out, so autolink scanning doesn't see them.
 */
function extractInlineLinks(line: string): { found: Omit<Link, "line">[]; rest: string } {
  const found: Omit<Link, "line">[] = [];
  const chars = line.split("");
  const stack: number[] = [];

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "[") {
      stack.push(i);
    } else if (ch === "]") {
      const openAt = stack.pop();
      if (openAt === undefined || line[i + 1] !== "(") continue;
      const dest = parseDestination(line, i + 2);
      if (!dest) continue;
      const isImage = openAt > 0 && line[openAt - 1] === "!";
      found.push({ kind: isImage ? "image" : "inline", target: dest.target });
      // Blank only the destination: the link text may hold a nested image.
      for (let k = i + 1; k < dest.end; k++) chars[k] = " ";
      i = dest.end - 1;
    }
  }
  return { found, rest: chars.join("") };
}

/** Parses a link destination (and optional title) starting just after `(`. */
function parseDestination(line: string, start: number): { target: string; end: number } | null {
  let i = start;
  while (line[i] === " " || line[i] === "\t") i++;

  let target: string;
  if (line[i] === "<") {
    const close = line.indexOf(">", i + 1);
    if (close === -1) return null;
    target = line.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    const begin = i;
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === " " || c === "\t") break;
      if (c === "(") depth++;
      else if (c === ")") {
        if (depth === 0) break;
        depth--;
      }
    }
    target = line.slice(begin, i);
  }

  // Skip an optional title up to the closing paren.
  while (line[i] === " " || line[i] === "\t") i++;
  if (line[i] === '"' || line[i] === "'" || line[i] === "(") {
    const closer = line[i] === "(" ? ")" : line[i];
    const close = line.indexOf(closer, i + 1);
    if (close === -1) return null;
    i = close + 1;
    while (line[i] === " " || line[i] === "\t") i++;
  }
  if (line[i] !== ")") return null;
  return { target, end: i + 1 };
}
