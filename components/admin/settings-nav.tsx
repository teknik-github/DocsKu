"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Globe, Languages, LifeBuoy, ShieldCheck, MessageCircleQuestion, MessageSquare, Plug, Sparkles, Workflow, type LucideIcon } from "lucide-react";

export type SettingsSection = {
  id: "umum" | "ai" | "tanya-ai" | "otomatisasi" | "komentar" | "tinjauan" | "bahasa" | "keamanan" | "widget" | "integrasi";
  label: string;
  /** Short state shown under the label, e.g. "Aktif" or "Mati". */
  status?: { text: string; tone: "on" | "off" | "warn" | "plain" };
};

const ICONS: Record<SettingsSection["id"], LucideIcon> = {
  umum: Globe,
  ai: Sparkles,
  "tanya-ai": MessageCircleQuestion,
  otomatisasi: Workflow,
  komentar: MessageSquare,
  tinjauan: CalendarClock,
  bahasa: Languages,
  keamanan: ShieldCheck,
  widget: LifeBuoy,
  integrasi: Plug,
};

const DOT = { on: "bg-emerald-500", off: "bg-fg-subtle/40", warn: "bg-amber-500", plain: "" };

/**
 * Pengaturan's section list: a sticky column on wide screens, a sticky row of
 * chips on small ones. The section in view is marked as you scroll.
 */
export function SettingsNav({ sections }: { sections: SettingsSection[] }) {
  const [active, setActive] = useState<SettingsSection["id"] | undefined>(sections[0]?.id);
  /** A section picked by click or link stays marked until the reader scrolls by hand. */
  const picked = useRef(false);

  // A link like /admin/settings#komentar: the browser jumps before the streamed content has its
  // final height, so jump again once it's here.
  // Content above (images, previews) can still grow for a moment, so it is repeated briefly
  // unless the reader scrolls first.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !document.getElementById(id)) return;
    picked.current = true;
    let stopped = false;
    const stop = () => (stopped = true);
    const jump = () => {
      const el = document.getElementById(id);
      setActive(id as SettingsSection["id"]);
      if (!stopped && el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24 });
    };
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    window.addEventListener("keydown", stop, { once: true });
    const timers = [0, 150, 400, 900, 1600].map((ms) => setTimeout(jump, ms));
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, []);

  useEffect(() => {
    // Scrolling by hand (wheel, touch, keys) hands the marker back to the scroll position.
    const release = () => (picked.current = false);
    function onScroll() {
      if (picked.current) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = sections[0]?.id;
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top <= 140) current = section.id;
      }
      setActive(atBottom ? sections.at(-1)?.id : current);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchstart", release, { passive: true });
    window.addEventListener("keydown", release);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchstart", release);
      window.removeEventListener("keydown", release);
    };
  }, [sections]);

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    picked.current = true;
    setActive(id as SettingsSection["id"]);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24, behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav aria-label="Bagian pengaturan" className="sticky top-14 z-20 -mx-5 border-b border-line bg-page/95 px-5 py-2 backdrop-blur sm:-mx-8 sm:px-8 lg:top-6 lg:mx-0 lg:h-fit lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {sections.map((section) => {
          const Icon = ICONS[section.id];
          const current = section.id === active;
          return (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  go(section.id);
                }}
                aria-current={current ? "true" : undefined}
                className={`relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors lg:py-2 ${
                  current ? "bg-fill font-medium text-fg" : "text-fg-muted hover:bg-fill/70 hover:text-fg"
                }`}
              >
                {current && <span className="absolute top-2 bottom-2 left-0 hidden w-0.5 rounded-full bg-accent lg:block" aria-hidden />}
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block whitespace-nowrap">{section.label}</span>
                  {section.status && (
                    <span className="hidden items-center gap-1.5 text-[11px] font-normal text-fg-subtle lg:flex">
                      {section.status.tone !== "plain" && <span className={`size-1.5 shrink-0 rounded-full ${DOT[section.status.tone]}`} aria-hidden />}
                      <span className="truncate">{section.status.text}</span>
                    </span>
                  )}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
