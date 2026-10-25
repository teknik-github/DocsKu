import { revalidatePath, revalidateTag } from "next/cache";
import { authorizedInternal } from "@/lib/internal-auth";
import { forgetRedirects } from "@/lib/redirects";

/**
 * Marks every page and cached read as stale. instrumentation.ts calls it once
 * when the server starts: Next.js keeps revalidations in memory only, so after
 * a restart (or in an image built in CI against an empty database) it would
 * otherwise serve the HTML prerendered at build time until something changes.
 */
export async function POST(request: Request) {
  if (!authorizedInternal(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  revalidatePath("/", "layout");
  for (const tag of ["pages", "navigation", "settings"]) revalidateTag(tag, { expire: 0 });
  forgetRedirects();
  return Response.json({ ok: true });
}
