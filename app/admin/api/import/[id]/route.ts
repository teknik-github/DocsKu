import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/request";
import { readSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { discardImport, runImport } from "@/lib/import";
import { logActivity } from "@/lib/activity";

const choicesSchema = z.object({
  items: z.array(z.object({ key: z.string().max(10), include: z.boolean(), title: z.string().max(200), slug: z.string().max(200) })).max(500),
  category: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("auto"), tab: z.string().trim().max(80) }),
    z.object({ mode: z.literal("section"), sectionId: z.string().max(80) }),
    z.object({ mode: z.literal("none") }),
  ]),
});

/** Step 2 of Halaman → Impor: creates the drafts chosen in the preview. */
export async function POST(request: Request, { params }: RouteContext<"/admin/api/import/[id]">) {
  if (!isSameOrigin(request)) return Response.json({ error: "Permintaan dari situs lain ditolak." }, { status: 403 });
  const user = await readSessionUser();
  if (!user) return Response.json({ error: "Sesi Anda berakhir. Silakan masuk lagi." }, { status: 401 });
  if (!can(user, "pages.import")) return Response.json({ error: "Kontributor tidak bisa mengimpor halaman." }, { status: 403 });
  const parsed = choicesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pilihan impor tidak valid." }, { status: 400 });
  const { id } = await params;
  const result = await runImport(id, parsed.data, user);
  if ("error" in result) return Response.json(result, { status: 422 });
  await logActivity({
    user,
    action: "page.import",
    meta: { count: result.created.length, images: result.images, sections: result.sections, slugs: result.created.slice(0, 20).map((page) => page.slug) },
  });
  return Response.json(result);
}

/** "Batal": forget the uploaded files. */
export async function DELETE(request: Request, { params }: RouteContext<"/admin/api/import/[id]">) {
  if (!isSameOrigin(request)) return Response.json({ error: "Permintaan dari situs lain ditolak." }, { status: 403 });
  const user = await readSessionUser();
  if (!user) return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  if (!can(user, "pages.import")) return Response.json({ error: "Kontributor tidak bisa mengimpor halaman." }, { status: 403 });
  await discardImport((await params).id, user.id);
  return new Response(null, { status: 204 });
}
