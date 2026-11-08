"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, ShieldCheck, ShieldOff } from "lucide-react";
import { confirmTwoFactor, disableTwoFactor, regenerateRecoveryCodes, startTwoFactor } from "@/app/admin/_actions/two-factor";
import { confirmDialog, promptDialog } from "@/components/admin/dialog";
import { Alert, Button, Field, Input } from "@/components/admin/ui";
import { formatDateTime } from "@/components/admin/format";
import { copyText } from "@/lib/copy-text";

type Status = { enabled: boolean; enabledAt: string | null; recoveryLeft: number };
type Setup = { secret: string; svg: string; sealed: string };

/** Profil → "Verifikasi dua langkah": turn TOTP on (QR + first code), show recovery codes once, turn it off. */
export function TwoFactorPanel({ status, available, siteName }: { status: Status; available: boolean; siteName: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    setError(null);
    const result = await startTwoFactor();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSetup(result);
    setCode("");
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!setup) return;
    setBusy(true);
    setError(null);
    const result = await confirmTwoFactor(setup.sealed, code);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSetup(null);
    setCodes(result.codes);
  }

  async function askProof(title: string, message: string, confirmLabel: string, tone: "default" | "danger" = "default") {
    return promptDialog({
      title,
      message,
      label: "Password atau kode autentikator",
      type: "password",
      confirmLabel,
      tone,
    });
  }

  async function disable() {
    const ok = await confirmDialog({
      title: "Nonaktifkan verifikasi dua langkah?",
      message: "Akun Anda hanya akan dilindungi password. Kode pemulihan yang lama tidak berlaku lagi.",
      confirmLabel: "Lanjut",
      tone: "danger",
    });
    if (!ok) return;
    const proof = await askProof("Konfirmasi identitas", "Masukkan password atau kode 6 digit dari aplikasi autentikator.", "Nonaktifkan", "danger");
    if (!proof) return;
    setBusy(true);
    setError(null);
    const result = await disableTwoFactor(proof);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function regenerate() {
    const proof = await askProof("Buat kode pemulihan baru", "Kode lama langsung tidak berlaku. Masukkan password atau kode 6 digit untuk melanjutkan.", "Buat kode baru");
    if (!proof) return;
    setBusy(true);
    setError(null);
    const result = await regenerateRecoveryCodes(proof);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setCodes(result.codes);
  }

  // Recovery codes, shown once right after they are made.
  if (codes) {
    return (
      <div className="space-y-4">
        <Alert tone="success">Simpan kode pemulihan ini sekarang. Kode ini tidak akan ditampilkan lagi.</Alert>
        <p className="text-sm text-fg-muted">
          Tiap kode bisa dipakai sekali untuk masuk jika ponsel Anda hilang. Simpan di pengelola password atau cetak dan simpan di tempat aman.
        </p>
        <RecoveryCodes codes={codes} siteName={siteName} />
        <Button
          variant="primary"
          onClick={() => {
            setCodes(null);
            router.refresh();
          }}
        >
          Sudah saya simpan
        </Button>
      </div>
    );
  }

  if (setup) {
    return (
      <form onSubmit={confirm} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted">
          <li>Buka aplikasi autentikator (Google Authenticator, 1Password, Authy, Microsoft Authenticator…).</li>
          <li>Pindai kode QR ini, atau masukkan kunci secara manual.</li>
          <li>Ketik kode 6 digit yang muncul di aplikasi.</li>
        </ol>
        <div className="flex flex-wrap items-start gap-5">
          {/* SVG generated on the server by the qrcode package from the otpauth URI. */}
          <div
            className="size-44 shrink-0 rounded-lg border border-line bg-white p-2 [&_svg]:size-full"
            role="img"
            aria-label="Kode QR untuk aplikasi autentikator"
            dangerouslySetInnerHTML={{ __html: setup.svg }}
          />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-xs font-medium text-fg-muted">Kunci manual</p>
              <code className="mt-1 block rounded-lg bg-fill px-2.5 py-2 font-mono text-xs break-all text-fg select-all" data-testid="totp-secret">
                {setup.secret.match(/.{1,4}/g)?.join(" ")}
              </code>
            </div>
            <Field label="Kode dari aplikasi">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123 456"
                maxLength={7}
                required
                autoFocus
                className="font-mono tracking-[0.2em]"
              />
            </Field>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="accent" disabled={busy || code.replace(/\s/g, "").length !== 6}>
            {busy ? "Memeriksa…" : "Aktifkan"}
          </Button>
          <Button variant="ghost" onClick={() => setSetup(null)}>
            Batal
          </Button>
        </div>
      </form>
    );
  }

  if (status.enabled) {
    return (
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <ShieldCheck className="size-4" />
          </span>
          <div className="text-sm">
            <p className="font-medium text-fg">Aktif{status.enabledAt && <span className="font-normal text-fg-muted"> sejak {formatDateTime(status.enabledAt)}</span>}</p>
            <p className={status.recoveryLeft <= 3 ? "text-amber-700 dark:text-amber-300" : "text-fg-muted"}>
              Sisa {status.recoveryLeft} kode pemulihan{status.recoveryLeft <= 3 ? ". Sebaiknya buat kode baru." : "."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={regenerate} disabled={busy}>
            Buat kode pemulihan baru
          </Button>
          <Button variant="danger" size="sm" onClick={disable} disabled={busy}>
            Nonaktifkan
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fill text-fg-muted">
          <ShieldOff className="size-4" />
        </span>
        <p className="text-sm text-fg-muted">
          Belum aktif. Setelah aktif, masuk ke dashboard butuh password <em>dan</em> kode 6 digit dari aplikasi autentikator di ponsel Anda.
        </p>
      </div>
      {available ? (
        <Button variant="accent" onClick={begin} disabled={busy}>
          {busy ? "Menyiapkan…" : "Aktifkan verifikasi dua langkah"}
        </Button>
      ) : (
        <p className="text-xs text-fg-subtle">Butuh ENCRYPTION_KEY di server untuk menyimpan kunci rahasia dengan aman.</p>
      )}
    </div>
  );
}

function RecoveryCodes({ codes, siteName }: { codes: string[]; siteName: string }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");
  function download() {
    const blob = new Blob([`Kode pemulihan ${siteName}\nTiap kode hanya bisa dipakai sekali.\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kode-pemulihan.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-fill/50 p-3 font-mono text-sm" data-testid="recovery-codes">
        {codes.map((c) => (
          <li key={c} className="text-fg">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            if (await copyText(text)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Disalin" : "Salin"}
        </Button>
        <Button variant="secondary" size="sm" onClick={download}>
          <Download className="size-3.5" />
          Unduh .txt
        </Button>
      </div>
    </div>
  );
}
