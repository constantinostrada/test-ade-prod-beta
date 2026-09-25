/** GitHub-style heading anchors. */

/** Strips inline markdown so the slug is built from the rendered text. */
function renderedText(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links and images → their text
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, "$1") // reference-style links
    .replace(/<[^>]+>/g, "") // inline HTML tags
    .replace(/[`*~]/g, ""); // code and emphasis markers
}

/** Slug for one heading, without duplicate handling. */
export function slug(heading: string): string {
  return renderedText(heading)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/** Anchors for a document's headings, suffixing duplicates with -1, -2, … */
export function headingAnchors(headings: string[]): Set<string> {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const heading of headings) {
    const base = slug(heading);
    let candidate = base;
    let n = seen.get(base) ?? 0;
    while (anchors.has(candidate)) {
      n++;
      candidate = `${base}-${n}`;
    }
    seen.set(base, n);
    anchors.add(candidate);
  }
  return anchors;
}
