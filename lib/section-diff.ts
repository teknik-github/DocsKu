/**
 * An AI edit's Markdown compared with the page's, section by section (## headings
 * outside code fences). Shared by the chat's diff view and the Telegram bot.
 */

export type Section = { key: string; heading: string; text: string };
export type SectionRow = { key: string; heading: string; status: "same" | "changed" | "added" | "removed"; base?: string; proposed?: string };

/** Splits Markdown at "## " headings outside code fences; the part before the first heading is the intro. */
export function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { key: "", heading: "", text: "" };
  let fence: string | null = null;
  const seen = new Map<string, number>();
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker) fence = fence ? (marker.startsWith(fence[0]) && marker.length >= fence.length ? null : fence) : marker;
    if (!fence && /^##\s+\S/.test(line)) {
      if (current.text.trim() || current.heading) sections.push(current);
      const heading = line.replace(/^##\s+/, "").trim();
      const norm = heading.toLocaleLowerCase("id");
      const n = (seen.get(norm) ?? 0) + 1;
      seen.set(norm, n);
      current = { key: `${norm}#${n}`, heading, text: `${line}\n` };
    } else {
      current.text += `${line}\n`;
    }
  }
  if (current.text.trim() || current.heading) sections.push(current);
  return sections.map((section) => ({ ...section, text: section.text.replace(/\n+$/, "\n") }));
}

export function compareSections(base: string, proposed: string): SectionRow[] {
  const before = splitSections(base);
  const after = splitSections(proposed);
  const baseIndex = new Map(before.map((section, i) => [section.key, i]));
  const used = new Set<number>();
  const rows: SectionRow[] = [];
  let last = -1;
  const removedUpTo = (limit: number) => {
    for (let i = last + 1; i < limit; i++) {
      if (used.has(i)) continue;
      used.add(i);
      rows.push({ key: `-${before[i].key}`, heading: before[i].heading, status: "removed", base: before[i].text });
    }
  };
  for (const section of after) {
    const match = baseIndex.get(section.key);
    if (match !== undefined && !used.has(match)) {
      removedUpTo(match);
      used.add(match);
      last = Math.max(last, match);
      const same = before[match].text.trim() === section.text.trim();
      rows.push({ key: section.key, heading: section.heading, status: same ? "same" : "changed", base: before[match].text, proposed: section.text });
    } else {
      rows.push({ key: `+${section.key}`, heading: section.heading, status: "added", proposed: section.text });
    }
  }
  removedUpTo(before.length);
  return rows;
}

