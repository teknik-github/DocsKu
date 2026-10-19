"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { fetchAiModels, saveAiSettings, testAiConnection, type AiForm } from "@/app/admin/_actions/ai";
import { AI_PRESETS, type AiProvider, type AiSettingsView } from "@/lib/ai/presets";
import { Alert, Button, Field, Input, Panel, Select } from "@/components/admin/ui";

export function AiSettingsForm({ initial }: { initial: AiSettingsView }) {
  const [view, setView] = useState(initial);
  const [form, setForm] = useState<AiForm>({
    enabled: initial.enabled,
    provider: initial.provider,
    baseUrl: initial.baseUrl,
    model: initial.model,
    temperature: initial.temperature,
    maxTokens: initial.maxTokens,
    thinking: initial.thinking,
    apiKey: "",
  });
  const [models, setModels] = useState<string[]>([]);
  const [detect, setDetect] = useState<{ state: "idle" | "loading" | "done" | "error"; error?: string }>({ state: "idle" });
  const [manual, setManual] = useState(false);
  const detectRun = useRef(0);
  const detectTimer = useRef<number | undefined>(undefined);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<AiForm>) => setForm((current) => ({ ...current, ...patch }));
  const preset = AI_PRESETS[form.provider];

  /**
   * Asks the provider which models it offers (GET /models) and keeps the
   * current model if it's listed, else picks the preset's suggestion or the first.
   */
  async function detectModels(values: AiForm) {
    const run = ++detectRun.current;
    setDetect({ state: "loading" });
    const result = await fetchAiModels(values);
    if (run !== detectRun.current) return; // a newer detection replaced this one
    if (!result.ok || result.models.length === 0) {
      setModels([]);
      setManual(true);
      setDetect({ state: "error", error: result.ok ? "Penyedia tidak mengembalikan daftar model." : result.error });
      return;
    }
    setModels(result.models);
    setManual(false);
    setDetect({ state: "done" });
    setForm((current) => {
      if (result.models.includes(current.model)) return current;
      const suggested = AI_PRESETS[current.provider].models.find((m) => result.models.includes(m));
      return { ...current, model: suggested ?? result.models[0] };
    });
  }

  /** Re-detects shortly after the address or key stops changing. */
  function detectSoon(values: AiForm, delay = 700) {
    window.clearTimeout(detectTimer.current);
    detectTimer.current = window.setTimeout(() => void detectModels(values), delay);
  }

  const canDetect = (values: AiForm) =>
    /^https?:\/\/\S+$/.test(values.baseUrl) && (!AI_PRESETS[values.provider].needsKey || view.hasKey || values.apiKey.length >= 8);

  // Detect once on load when the provider can already be reached.
  useEffect(() => {
    // detectModels only sets state after the provider responds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canDetect(form)) void detectModels(form);
    return () => window.clearTimeout(detectTimer.current);
    // Runs once; later changes re-detect from their change handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(patch: Partial<AiForm>, redetect = false) {
    const next = { ...form, ...patch };
    setForm(next);
    if (redetect && canDetect(next)) detectSoon(next);
  }

  function chooseProvider(provider: AiProvider) {
    const next = AI_PRESETS[provider];
    const values = { ...form, provider, baseUrl: next.baseUrl || form.baseUrl, model: next.models[0] ?? "" };
    setForm(values);
    setModels([]);
    setDetect({ state: "idle" });
    if (canDetect(values)) detectSoon(values, 0);
  }

  function run(task: () => Promise<void>) {
    setMessage(null);
    startTransition(task);
  }

  const save = (extra: Partial<AiForm> = {}) =>
    run(async () => {
      const result = await saveAiSettings({ ...form, ...extra });
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      setView(result.view);
      set({ apiKey: "" });
      setMessage({ tone: "success", text: "Pengaturan AI disimpan." });
    });

  const test = () =>
    run(async () => {
      const result = await testAiConnection(form);
      setMessage(
        result.ok
          ? { tone: "success", text: `Koneksi berhasil. Model menjawab: “${result.reply.slice(0, 80)}”` }
          : { tone: "error", text: result.error },
      );
    });


  return (
    <Panel className="max-w-3xl space-y-5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-accent" />
            AI Write
          </h2>
          <p className="mt-1 text-xs text-fg-subtle">
            Bantuan menulis di editor: perintah <code>/ai</code>, tombol AI saat teks dipilih, dan deskripsi otomatis.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="accent-accent" />
          Aktif
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Penyedia">
          <Select value={form.provider} onChange={(e) => chooseProvider(e.target.value as AiProvider)}>
            {Object.entries(AI_PRESETS).map(([id, p]) => (
              <option key={id} value={id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Alamat API" hint="Endpoint kompatibel OpenAI (tanpa /chat/completions).">
          <Input value={form.baseUrl} onChange={(e) => update({ baseUrl: e.target.value }, true)} className="font-mono text-xs" />
        </Field>
        <Field
          label="Model"
          hint={
            detect.state === "loading"
              ? undefined
              : detect.state === "done"
                ? `${models.length} model terdeteksi otomatis.`
                : detect.state === "error"
                  ? `Deteksi otomatis gagal: ${detect.error} Ketik nama model secara manual.`
                  : "Model terdeteksi otomatis setelah alamat API dan API key diisi."
          }
        >
          <div className="flex gap-2">
            {manual || models.length === 0 ? (
              <Input
                value={form.model}
                onChange={(e) => set({ model: e.target.value })}
                placeholder="nama-model"
                aria-label="Nama model"
                className="font-mono text-xs"
              />
            ) : (
              <Select value={form.model} onChange={(e) => set({ model: e.target.value })} aria-label="Model" className="font-mono text-xs">
                {!models.includes(form.model) && form.model && <option value={form.model}>{form.model}</option>}
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="h-9"
              onClick={() => void detectModels(form)}
              disabled={detect.state === "loading" || !canDetect(form)}
              title="Deteksi ulang model"
              aria-label="Deteksi ulang model"
            >
              {detect.state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </Button>
          </div>
          {detect.state === "loading" && <span className="mt-1 block text-xs text-fg-subtle">Mendeteksi model…</span>}
          {models.length > 0 && (
            <button type="button" onClick={() => setManual(!manual)} className="mt-1 text-xs text-fg-subtle underline hover:text-fg">
              {manual ? "Pilih dari daftar" : "Ketik nama model sendiri"}
            </button>
          )}
        </Field>
        <Field
          label="API key"
          hint={
            view.keyFromEnv
              ? "Memakai AI_API_KEY dari .env.local."
              : view.hasKey
                ? `Tersimpan terenkripsi (${view.keyHint}). Kosongkan untuk tetap memakainya.`
                : preset.needsKey
                  ? "Wajib untuk penyedia ini. Disimpan terenkripsi, tidak pernah dikirim ke browser."
                  : "Opsional untuk penyedia ini."
          }
        >
          <Input
            type="password"
            autoComplete="off"
            value={form.apiKey}
            disabled={view.keyFromEnv}
            onChange={(e) => update({ apiKey: e.target.value }, true)}
            placeholder={view.hasKey ? "••••••••" : form.provider === "deepseek" ? "sk-…" : ""}
          />
        </Field>
        <Field label={`Kreativitas (temperature): ${form.temperature.toFixed(1)}`} hint="Rendah = konsisten, tinggi = lebih bervariasi.">
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.1}
            value={form.temperature}
            onChange={(e) => set({ temperature: Number(e.target.value) })}
            className="w-full accent-accent"
          />
        </Field>
        <Field label="Panjang jawaban maksimum (token)">
          <Input
            type="number"
            min={100}
            max={32000}
            step={100}
            value={form.maxTokens}
            onChange={(e) => set({ maxTokens: Number(e.target.value) || 2000 })}
          />
        </Field>
      </div>

      {form.provider === "deepseek" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.thinking} onChange={(e) => set({ thinking: e.target.checked })} className="mt-0.5 accent-accent" />
          <span>
            Mode berpikir (thinking)
            <span className="block text-xs text-fg-subtle">Lebih teliti untuk tulisan panjang, tetapi lebih lambat dan lebih mahal. Bawaan: mati.</span>
          </span>
        </label>
      )}

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="accent" onClick={() => save()} disabled={pending}>
          {pending ? "Memproses…" : "Simpan"}
        </Button>
        <Button variant="secondary" onClick={test} disabled={pending}>
          Tes koneksi
        </Button>
        {view.hasKey && !view.keyFromEnv && (
          <Button variant="ghost" onClick={() => confirm("Hapus API key yang tersimpan?") && save({ apiKey: "", clearKey: true })} disabled={pending}>
            Hapus API key
          </Button>
        )}
      </div>
    </Panel>
  );
}
