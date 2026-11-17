"use client";

import Link from "next/link";
import { ArrowRight, Check, Moon, Sun, SunMoon } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { Modal } from "@/components/ui/modal";
import { THEME_MODES, PALETTES, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { WallpaperPicker } from "./wallpaper-picker";
import { InstallCard } from "@/components/pwa/install-prompt";

const MODE_ICON: Record<ThemeMode, typeof Sun> = { light: Sun, dark: Moon, system: SunMoon };

/** A miniature of the app on a surface: canvas, a card, a line of text and the accent. */
function ThemePreview({ mode }: { mode: ThemeMode }) {
  const half = (surface: "white" | "black") => (
    <span data-surface={surface} className="flex h-full flex-1 flex-col gap-1 bg-ink p-1.5">
      <span className="block h-1.5 w-8 rounded-full bg-paper/70" />
      <span className="mt-auto flex flex-col gap-1 rounded-md border border-line bg-card p-1.5">
        <span className="block h-1 w-10 rounded-full bg-paper/40" />
        <span className="block h-1.5 w-6 rounded-full bg-accent" />
      </span>
    </span>
  );
  return (
    <span className="flex h-14 w-full overflow-hidden rounded-lg border border-line">
      {mode === "light" && half("white")}
      {mode === "dark" && half("black")}
      {mode === "system" && (
        <>
          {half("white")}
          {half("black")}
        </>
      )}
    </span>
  );
}

/** Theme, colouring and wallpaper. Saved with the account, like everything else. */
export function AppearanceControls() {
  const mode = useChronicle((s) => s.themeMode);
  const palette = useChronicle((s) => s.palette);
  const setThemeMode = useChronicle((s) => s.setThemeMode);
  const setPalette = useChronicle((s) => s.setPalette);

  return (
    <div className="space-y-7">
      <section>
        <p className="eyebrow mb-3">Theme</p>
        <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Theme">
          {THEME_MODES.map((m) => {
            const active = mode === m.id;
            const Icon = MODE_ICON[m.id];
            return (
              <button
                key={m.id}
                onClick={() => setThemeMode(m.id)}
                role="radio"
                aria-checked={active}
                className={cn(
                  "group relative flex flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition-all",
                  active ? "border-accent ring-1 ring-accent/40" : "border-line hover:border-paper/30",
                )}
              >
                <ThemePreview mode={m.id} />
                <span className="flex items-center gap-1.5 text-xs font-semibold text-paper">
                  <Icon className="h-3.5 w-3.5" /> {m.label}
                </span>
                <span className="text-[0.65rem] leading-snug text-paper/55">{m.hint}</span>
                {active && (
                  <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-fg">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <p className="eyebrow mb-3">Internal colouring</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {PALETTES.map((p) => {
            const active = palette === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPalette(p.id)}
                aria-pressed={active}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl border p-3 transition-all",
                  active ? "border-accent ring-1 ring-accent/40" : "border-line hover:border-paper/30",
                )}
              >
                <span className="flex shrink-0 overflow-hidden rounded-full border border-line shadow-soft">
                  {p.swatches.map((c, i) => (
                    <span key={i} className="h-7 w-3.5" style={{ backgroundColor: c }} />
                  ))}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block truncate text-xs font-medium text-paper">{p.label}</span>
                  <span className="block truncate text-[0.65rem] text-paper/45">{p.hint}</span>
                </span>
                {active && (
                  <span className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-accent text-accent-fg">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="border-t border-line pt-6">
        <WallpaperPicker />
      </section>
    </div>
  );
}

export function AppearanceModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Appearance"
      description="Personalise how your chronicle looks. Saved with your account."
      className="sm:max-w-lg"
    >
      <div className="space-y-7">
        <AppearanceControls />

        <section className="border-t border-line pt-6">
          <InstallCard />
        </section>

        <Link
          href="/settings"
          onClick={onClose}
          className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm font-medium text-paper/75 transition-colors hover:border-paper/25 hover:text-paper"
        >
          Profile, notifications, backups and your account
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Modal>
  );
}
