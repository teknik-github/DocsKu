/**
 * How an activity entry reads at /admin/activity: "<actor> <verb> <target><after>",
 * e.g. "Sari menerbitkan *Instalasi*". `subject` replaces "<actor> <verb>" for
 * events without a signed-in actor ("Percobaan masuk gagal untuk …").
 */
export type ActivityText = {
  verb: string;
  /** Text after the target, e.g. " untuk 3 Nov 09.00". */
  after?: string;
  subject?: string;
  /** Hide the target (the verb already says it, e.g. "menyimpan navigasi"). */
  noTarget?: boolean;
  tone?: "danger" | "warn" | "good";
};

type Meta = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

const when = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: process.env.NEXT_PUBLIC_TIME_ZONE || "Asia/Jakarta",
});
const fmt = (v: unknown) => {
  const d = new Date(str(v));
  return Number.isNaN(d.getTime()) ? "" : when.format(d);
};

const ROLE: Record<string, string> = { admin: "Admin", editor: "Editor" };
const COMMENT_STATUS: Record<string, string> = { approved: "disetujui", pending: "disembunyikan", spam: "spam" };
const COMMENT_VERB: Record<string, string> = { approved: "menyetujui komentar", pending: "menyembunyikan komentar", spam: "menandai spam komentar" };

const TEXT: Record<string, (m: Meta) => ActivityText> = {
  "page.create": (m) => ({
    verb: m.via === "ai" ? "membuat halaman dari AI Chat" : "membuat halaman",
    after: m.template ? ` dari templat “${str(m.template)}”` : "",
  }),
  "page.edit": () => ({ verb: "mengubah draf" }),
  "page.publish": (m) => (m.scheduled ? { verb: "menerbitkan sesuai jadwal", tone: "good" } : { verb: "menerbitkan", tone: "good" }),
  "page.schedule": (m) => ({ verb: "menjadwalkan", after: m.publishAt ? ` untuk ${fmt(m.publishAt)}` : "" }),
  "page.unpublish": () => ({ verb: "menarik dari situs", tone: "warn" }),
  "page.unschedule": () => ({ verb: "membatalkan jadwal terbit" }),
  "page.delete": () => ({ verb: "menghapus halaman", tone: "danger" }),
  "page.restore": (m) => ({ verb: "memulihkan revisi lama", after: m.revisionAt ? ` (${fmt(m.revisionAt)})` : "" }),
  "page.slug": (m) => ({ verb: "mengubah alamat", after: ` dari /docs/${str(m.from)} ke /docs/${str(m.to)}` }),
  "page.feature": () => ({ verb: "menandai sebagai unggulan" }),
  "page.unfeature": () => ({ verb: "melepas tanda unggulan" }),
  "page.visibility": (m) => ({ verb: str(m.visibility ?? m.to) === "internal" ? "menjadikan internal" : "menjadikan publik" }),
  "page.review": () => ({ verb: "menandai sudah ditinjau", tone: "good" }),
  "page.owner": () => ({ verb: "mengubah penanggung jawab" }),
  "page.author": (m) => ({ verb: "mengganti penulis", after: m.author ? ` menjadi ${str(m.author)}` : "" }),
  "template.create": () => ({ verb: "menyimpan templat" }),
  "template.update": () => ({ verb: "mengubah templat" }),
  "template.delete": () => ({ verb: "menghapus templat", tone: "danger" }),

  "category.create": () => ({ verb: "membuat kategori" }),
  "category.rename": (m) => ({ verb: "mengganti nama kategori", after: m.from ? ` (sebelumnya ${str(m.from)})` : "" }),
  "category.delete": () => ({ verb: "menghapus kategori", tone: "danger" }),
  "category.move": (m) => (m.count ? { verb: `memindahkan ${num(m.count)} halaman ke` } : { verb: "memindahkan halaman ke" }),
  "category.image": () => ({ verb: "mengganti gambar kategori" }),
  "category.image_remove": () => ({ verb: "menghapus gambar kategori" }),
  "navigation.save": () => ({ verb: "menyimpan navigasi", noTarget: true }),
  "home.publish": (m) => ({ verb: m.locale ? `menerbitkan beranda bahasa ${str(m.locale).toUpperCase()}` : "menerbitkan beranda", noTarget: true, tone: "good" }),
  "home.discard": (m) => ({ verb: m.locale ? `membuang draf beranda bahasa ${str(m.locale).toUpperCase()}` : "membuang draf beranda", noTarget: true }),
  "home.translate": (m) => ({ verb: m.ai ? "menerjemahkan beranda dengan AI ke" : "menyalin beranda ke", after: "" }),

  "settings.save": () => ({ verb: "mengubah pengaturan" }),
  "theme.layout": () => ({ verb: "mengganti tata letak dokumentasi menjadi" }),
  "theme.color": () => ({ verb: "mengganti warna tema menjadi" }),
  "theme.authors": (m) => ({ verb: m.show ? "menampilkan penulis di artikel" : "menyembunyikan penulis di artikel", noTarget: true }),

  "user.setup": () => ({ verb: "membuat akun admin pertama", noTarget: true }),
  "user.create": (m) => ({ verb: "menambahkan pengguna", after: m.role ? ` sebagai ${ROLE[str(m.role)] ?? str(m.role)}` : "" }),
  "user.delete": () => ({ verb: "menghapus pengguna", tone: "danger" }),
  "user.role": (m) => ({ verb: "mengubah peran", after: ` menjadi ${ROLE[str(m.to)] ?? str(m.to)}` }),
  "user.password_reset": () => ({ verb: "mengatur ulang password", tone: "warn" }),
  "user.password": () => ({ verb: "mengganti password sendiri", noTarget: true }),
  "user.profile": (m) => ({
    verb: m.emailTo ? `mengganti email akunnya ke ${str(m.emailTo)}` : Array.isArray(m.fields) && m.fields.join() === "avatar" ? (m.removed ? "menghapus foto profil" : "mengganti foto profil") : "memperbarui profil",
    noTarget: true,
  }),
  "user.2fa_reset": () => ({ verb: "mengatur ulang verifikasi dua langkah milik", tone: "warn" }),

  "media.upload": () => ({ verb: "mengunggah" }),
  "media.delete": () => ({ verb: "menghapus media", tone: "danger" }),
  "redirect.create": (m) => ({ verb: "membuat redirect", after: m.to ? ` → ${str(m.to)}` : "" }),
  "redirect.delete": () => ({ verb: "menghapus redirect", tone: "danger" }),

  "comment.moderate": (m) =>
    num(m.count) > 1
      ? { verb: `menandai ${num(m.count)} komentar sebagai ${COMMENT_STATUS[str(m.status)] ?? str(m.status)}`, noTarget: true }
      : { verb: COMMENT_VERB[str(m.status)] ?? "memoderasi komentar" },
  "comment.delete": (m) => (num(m.count) > 1 ? { verb: `menghapus ${num(m.count)} komentar`, noTarget: true, tone: "danger" } : { verb: "menghapus komentar", tone: "danger" }),
  "comment.reply": () => ({ verb: "membalas komentar" }),
  "comment.create": () => ({ verb: "berkomentar sebagai tim di" }),

  "token.create": () => ({ verb: "membuat token MCP" }),
  "token.revoke": () => ({ verb: "mencabut token MCP", tone: "warn" }),
  "mcp.create": () => ({ verb: "menambahkan server MCP" }),
  "mcp.update": () => ({ verb: "memperbarui server MCP" }),
  "mcp.enable": (m) => ({ verb: m.tool ? `mengaktifkan tool ${str(m.tool)} di server MCP` : "mengaktifkan server MCP" }),
  "mcp.disable": (m) => ({ verb: m.tool ? `mematikan tool ${str(m.tool)} di server MCP` : "mematikan server MCP" }),
  "mcp.delete": () => ({ verb: "menghapus server MCP", tone: "danger" }),

  "auth.login": (m) => ({ verb: m.method === "recovery" ? "masuk dengan kode pemulihan" : "masuk", noTarget: true, tone: m.method === "recovery" ? "warn" : undefined }),
  "auth.logout": () => ({ verb: "keluar", noTarget: true }),
  "auth.login_failed": () => ({ verb: "", subject: "Percobaan masuk dengan password salah untuk", tone: "danger" }),
  "auth.2fa_failed": () => ({ verb: "", subject: "Kode verifikasi dua langkah salah untuk", tone: "danger" }),
  "auth.2fa_enable": () => ({ verb: "mengaktifkan verifikasi dua langkah", noTarget: true, tone: "good" }),
  "auth.2fa_disable": () => ({ verb: "menonaktifkan verifikasi dua langkah", noTarget: true, tone: "warn" }),
  "auth.2fa_codes": () => ({ verb: "membuat kode pemulihan baru", noTarget: true }),
};

export function activityText(action: string, meta: Meta): ActivityText {
  return TEXT[action]?.(meta) ?? { verb: `melakukan ${action} pada` };
}

/** Where the entry's target is managed in the dashboard, if anywhere. */
export function activityHref(type: string | null, id: string | null): string | null {
  switch (type) {
    case "page":
      return id ? `/admin/pages/${id}` : null;
    case "category":
      return id ? `/admin/pages?kategori=${encodeURIComponent(id)}` : "/admin/pages";
    case "user":
      return "/admin/users";
    case "media":
      return "/admin/media";
    case "redirect":
      return "/admin/redirects";
    case "template":
      return "/admin/templates";
    case "settings":
      return id ? `/admin/settings#${id}` : "/admin/settings";
    case "comment":
      return "/admin/comments";
    case "token":
    case "mcp":
      return "/admin/mcp";
    case "theme":
      return "/admin/theme";
    case "home":
      return "/admin/home";
    case "navigation":
      return "/admin/navigation";
    default:
      return null;
  }
}
