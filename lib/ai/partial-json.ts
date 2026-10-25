/**
 * Reads the top-level string fields of a JSON object that is still arriving,
 * e.g. tool-call arguments streamed by the model: `{"title":"Pan` gives
 * `{ title: "Pan" }`. Nested objects and non-string values are skipped. A
 * value only ever grows as more text arrives (an escape sequence cut in half
 * waits for the rest), so callers may send just the new part.
 */
export function partialStringFields(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const n = src.length;
  let i = 0;
  let depth = 0;
  let expectKey = false;
  let afterColon = false;
  let key: string | null = null;

  while (i < n) {
    const c = src[i];
    if (c === '"') {
      const [value, end, done] = readString(src, i + 1);
      if (depth === 1 && expectKey) {
        key = value;
        expectKey = false;
      } else if (depth === 1 && afterColon && key !== null) {
        out[key] = value;
        key = null;
      }
      if (!done) break;
      i = end;
      continue;
    }
    if (c === "{" || c === "[") {
      depth++;
      if (depth === 1) expectKey = c === "{";
    } else if (c === "}" || c === "]") {
      depth--;
    } else if (depth === 1 && c === ",") {
      expectKey = true;
      afterColon = false;
      key = null;
    } else if (depth === 1 && c === ":") {
      afterColon = true;
    }
    i++;
  }
  return out;
}

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };

/** Decodes a JSON string starting after its opening quote: [value, index after the closing quote, closed?]. */
function readString(src: string, start: number): [string, number, boolean] {
  let out = "";
  let i = start;
  while (i < src.length) {
    // Copy the plain run up to the next quote or backslash in one go.
    let j = i;
    while (j < src.length && src[j] !== '"' && src[j] !== "\\") j++;
    out += src.slice(i, j);
    if (j >= src.length) return [out, src.length, false];
    if (src[j] === '"') return [out, j + 1, true];
    const e = src[j + 1];
    if (e === undefined) return [out, src.length, false];
    if (e === "u") {
      const hex = src.slice(j + 2, j + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return [out, src.length, false];
      out += String.fromCharCode(parseInt(hex, 16));
      i = j + 6;
    } else {
      out += ESCAPES[e] ?? e;
      i = j + 2;
    }
  }
  return [out, src.length, false];
}
