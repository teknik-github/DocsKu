import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Fonts embedded in every PDF (subset by react-pdf, so only the glyphs used
 * end up in the file): Noto Sans for text, which covers Indonesian and the
 * rest of Latin, Greek and Cyrillic, and Noto Sans Mono for code (SIL Open
 * Font License, OFL-NotoSans.txt beside the files). Not JetBrains Mono: its
 * ligature tables crash react-pdf's font engine (fontkit) on text like "->".
 * The files are read from assets/fonts/pdf at runtime; next.config.ts lists
 * that folder in outputFileTracingIncludes so the standalone build ships it.
 */
export const SANS = "Noto Sans";
export const MONO = "Noto Sans Mono";

const dir = () => path.join(/*turbopackIgnore: true*/ process.cwd(), "assets", "fonts", "pdf");

const state = globalThis as unknown as { __docskuPdfFontsNoto?: boolean };

export function registerPdfFonts() {
  if (state.__docskuPdfFontsNoto) return;
  const file = (name: string) => path.join(dir(), name);
  Font.register({
    family: SANS,
    fonts: [
      { src: file("NotoSans-Regular.ttf"), fontWeight: 400 },
      { src: file("NotoSans-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: file("NotoSans-SemiBold.ttf"), fontWeight: 600 },
      { src: file("NotoSans-Bold.ttf"), fontWeight: 700 },
      { src: file("NotoSans-BoldItalic.ttf"), fontWeight: 700, fontStyle: "italic" },
    ],
  });
  Font.register({
    family: MONO,
    fonts: [
      { src: file("NotoSansMono-Regular.ttf"), fontWeight: 400 },
      { src: file("NotoSansMono-Regular.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: file("NotoSansMono-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Words are never split with a hyphen (the default rules are English).
  Font.registerHyphenationCallback((word) => [word]);
  state.__docskuPdfFontsNoto = true;
}
