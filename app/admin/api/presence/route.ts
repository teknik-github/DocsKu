import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/request";
import { readSessionUser } from "@/lib/auth/session";
import { leavePresence, othersOnPage, touchPresence } from "@/lib/collab/presence";
import { currentVersion } from "@/lib/pages/service";
import { canEditPage } from "@/lib/auth/page-access";

/**
 * Editor heartbeat (fetch every ~20 s) and "left the page" (`navigator.sendBeacon`,
 * which can't call a server action). Answers who else has the page open and the
 * working copy's current version, so the editor can warn before a conflict.
 */
const bodySchema = z.object({
  pageId: z.uuid(),
  tabId: z.string().min(8).max(64).regex(/^[\w-]+$/),
  leave: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Permintaan lintas situs ditolak." }, { status: 403 });
  const user = await readSessionUser();
  if (!user) return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  const text = await request.text();
  if (text.length > 1000) return Response.json({ error: "Terlalu besar." }, { status: 413 });
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse(text));
  } catch {
    return Response.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
  // Only pages this person may edit (a contributor: their own); others look missing.
  const version = (await canEditPage(user, body.pageId)) ? await currentVersion(body.pageId) : null;
  if (!version) return Response.json({ error: "Halaman tidak ditemukan." }, { status: 404 });
  if (body.leave) {
    await leavePresence(body.pageId, user.id, body.tabId);
    return new Response(null, { status: 204 });
  }
  await touchPresence(body.pageId, user.id, body.tabId);
  const others = await othersOnPage(body.pageId, user.id, body.tabId);
  return Response.json({ others, version }, { headers: { "Cache-Control": "no-store" } });
}
