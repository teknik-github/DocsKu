"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Link2, Loader2, Plus, X } from "lucide-react";
import { changeOwnPassword } from "@/app/admin/_actions/users";
import { checkUsername, setAvatar, updateEmail, updatePublicProfile } from "@/app/admin/_actions/profile";
import { AVATAR_MAX_BYTES, BIO_MAX, JOB_TITLE_MAX, MAX_LINKS, suggestUsername, usernameError, type AuthorLink } from "@/lib/authors";
import { Avatar } from "@/components/avatar";
import { confirmDialog } from "@/components/admin/dialog";
import { Alert, Button, Field, Input, Textarea } from "@/components/admin/ui";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** The photo in the profile header: upload (to the media library), change, or remove. */
export function AvatarEditor({ name, avatar }: { name: string; avatar: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!IMAGE_TYPES.includes(file.type)) return setError("Pilih gambar PNG, JPG, WebP, atau GIF.");
    if (file.size > AVATAR_MAX_BYTES) return setError("Ukuran foto maksimal 2 MB.");
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/admin/api/media", { method: "POST", body });
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Unggahan gagal.");
      const result = await setAvatar(data.url);
      if (!result.ok) throw new Error(result.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unggahan gagal.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    const ok = await confirmDialog({ title: "Hapus foto profil?", message: "Inisial nama Anda akan dipakai sebagai gantinya.", confirmLabel: "Hapus foto", tone: "danger" });
    if (!ok) return;
    setBusy(true);
    const result = await setAvatar(null);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <div className="relative">
        <Avatar name={name} src={avatar} size={96} className="text-3xl ring-4 ring-surface" />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={avatar ? "Ganti foto profil" : "Unggah foto profil"}
          title={avatar ? "Ganti foto" : "Unggah foto"}
          className="absolute right-0 bottom-0 inline-flex size-8 items-center justify-center rounded-full border border-line bg-surface text-fg-muted shadow-sm hover:text-fg disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label="Pilih foto profil"
        data-testid="avatar-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex gap-3 text-xs">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="font-medium text-accent hover:underline">
          {avatar ? "Ganti foto" : "Unggah foto"}
        </button>
        {avatar && (
          <button type="button" onClick={remove} disabled={busy} className="text-fg-muted hover:text-red-600">
            Hapus
          </button>
        )}
      </div>
      {error && <p className="max-w-48 text-center text-xs text-red-600 sm:text-left dark:text-red-400">{error}</p>}
    </div>
  );
}

type Profile = { name: string; username: string | null; jobTitle: string | null; bio: string | null; links: AuthorLink[]; avatar: string | null };

/** "Profil publik": name, username (/penulis/…), job title, bio and links, with a live preview of the author box. */
export function PublicProfileForm({ profile, origin }: { profile: Profile; origin: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof updatePublicProfile>>, formData: FormData) => {
    const result = await updatePublicProfile(prev, formData);
    // The sidebar and the header card show the name; refresh them.
    if (result?.success) router.refresh();
    return result;
  }, undefined);
  const errors = state?.fieldErrors ?? {};

  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username ?? "");
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [links, setLinks] = useState<AuthorLink[]>(profile.links);
  const [check, setCheck] = useState<{ value: string; ok: boolean; error?: string } | null>(null);

  // Format errors show at once; availability is asked of the server after a pause.
  const localError = username ? usernameError(username) : null;
  useEffect(() => {
    if (!username || localError || username === profile.username) return;
    const value = username;
    const timer = setTimeout(async () => {
      const result = await checkUsername(value);
      setCheck({ value, ok: result.ok, error: result.ok ? undefined : result.error });
    }, 400);
    return () => clearTimeout(timer);
  }, [username, localError, profile.username]);
  const remote = check && check.value === username ? check : null;
  const usernameMessage = errors.username ?? localError ?? remote?.error;
  const suggestion = suggestUsername(name);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-4">
        {state?.success && <Alert tone="success">{state.success}</Alert>}
        {state?.error && <Alert>{state.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama" error={errors.name}>
            <Input name="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Jabatan" hint="Contoh: DevOps Engineer, Technical Writer." error={errors.jobTitle}>
            <Input name="jobTitle" maxLength={JOB_TITLE_MAX} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="DevOps Engineer" />
          </Field>
        </div>

        <div>
          <label htmlFor="profile-username" className="mb-1.5 block text-sm font-medium text-fg">
            Username
          </label>
          <div className={`flex items-center overflow-hidden rounded-lg border bg-surface focus-within:ring-2 focus-within:ring-accent/30 ${usernameMessage ? "border-red-400" : "border-line focus-within:border-accent"}`}>
            <span className="hidden shrink-0 border-r border-line bg-fill px-2.5 py-2 text-sm text-fg-subtle sm:block">/penulis/</span>
            <input
              id="profile-username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              placeholder={suggestion || "nama-anda"}
              aria-invalid={Boolean(usernameMessage)}
              aria-describedby="profile-username-help"
              className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-sm text-fg outline-none placeholder:text-fg-subtle"
            />
            {username && !usernameMessage && (remote?.ok || username === profile.username) && <Check className="mr-2.5 size-4 shrink-0 text-emerald-600" aria-label="Tersedia" />}
          </div>
          <p id="profile-username-help" className={`mt-1 text-xs ${usernameMessage ? "text-red-600 dark:text-red-400" : "text-fg-subtle"}`}>
            {usernameMessage ??
              (username ? (
                <>
                  Halaman penulis: <span className="font-mono break-all">{origin}/penulis/{username}</span>
                </>
              ) : (
                <>
                  Kosongkan jika tidak ingin punya halaman penulis.
                  {suggestion && !usernameError(suggestion) && (
                    <>
                      {" "}
                      <button type="button" onClick={() => setUsername(suggestion)} className="font-medium text-accent hover:underline">
                        Pakai “{suggestion}”
                      </button>
                    </>
                  )}
                </>
              ))}
          </p>
        </div>

        <Field label="Bio singkat" error={errors.bio}>
          <Textarea
            name="bio"
            rows={4}
            maxLength={BIO_MAX}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Contoh: Raffi adalah seorang DevOps Engineer yang mengurus infrastruktur dan otomatisasi deployment."
          />
          <span className={`mt-1 block text-right text-xs tabular-nums ${bio.length > BIO_MAX - 20 ? "text-amber-600" : "text-fg-subtle"}`}>
            {bio.length}/{BIO_MAX}
          </span>
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg">Tautan</legend>
          <input type="hidden" name="links" value={JSON.stringify(links)} />
          <div className="space-y-2">
            {links.map((link, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
                <Input
                  aria-label={`Nama tautan ${i + 1}`}
                  placeholder="GitHub"
                  maxLength={40}
                  value={link.label}
                  onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
                  className="col-span-1"
                />
                <Input
                  aria-label={`Alamat tautan ${i + 1}`}
                  placeholder="https://github.com/nama"
                  inputMode="url"
                  value={link.url}
                  onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                  className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
                />
                <Button variant="ghost" size="sm" aria-label={`Hapus tautan ${i + 1}`} onClick={() => setLinks(links.filter((_, j) => j !== i))} className="col-start-2 row-start-1 h-9 sm:col-start-auto sm:row-start-auto">
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          {errors.links && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.links}</p>}
          {links.length < MAX_LINKS && (
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => setLinks([...links, { label: "", url: "https://" }])}>
              <Plus className="size-3.5" />
              Tambah tautan
            </Button>
          )}
        </fieldset>

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button type="submit" disabled={pending || Boolean(localError) || remote?.ok === false}>
            {pending ? "Menyimpan…" : "Simpan profil publik"}
          </Button>
        </div>
      </div>

      {/* How readers see it at the end of an article. */}
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-fg-subtle">Pratinjau di akhir artikel</p>
        <div className="rounded-xl border border-line bg-page p-4 lg:sticky lg:top-6">
          <p className="mb-3 text-[10px] font-medium tracking-wide text-fg-subtle uppercase">Tentang penulis</p>
          <div className="flex items-start gap-3">
            <Avatar name={name || "?"} src={profile.avatar} size={44} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">{name || "Nama Anda"}</p>
              {jobTitle && <p className="truncate text-xs text-accent">{jobTitle}</p>}
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed break-words whitespace-pre-line text-fg-muted">{bio || "Bio singkat Anda tampil di sini."}</p>
          {links.some((l) => l.label.trim()) && (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
              {links
                .filter((l) => l.label.trim())
                .map((l, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <Link2 className="size-3" />
                    {l.label}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

/** "Akun": the sign-in email. */
export function EmailForm({ email }: { email: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof updateEmail>>, formData: FormData) => {
    const result = await updateEmail(prev, formData);
    if (result?.success) router.refresh();
    return result;
  }, undefined);
  return (
    <form action={action} className="space-y-3">
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      {state?.error && <Alert>{state.error}</Alert>}
      <Field label="Email" hint="Untuk masuk ke dasbor. Tidak pernah ditampilkan di situs." error={state?.fieldErrors?.email}>
        <Input name="email" type="email" required autoComplete="email" defaultValue={state?.values?.email ?? email} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan email"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, undefined);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3">
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <Field label="Password saat ini" error={errors.current}>
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Password baru" hint="Minimal 10 karakter." error={errors.password}>
          <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
        </Field>
        <Field label="Ulangi password baru" error={errors.confirm}>
          <Input name="confirm" type="password" autoComplete="new-password" required />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Ganti password"}
      </Button>
    </form>
  );
}

