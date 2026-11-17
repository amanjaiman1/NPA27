"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { Modal } from "@/components/ui/modal";
import { SURFACES, PALETTES } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { WallpaperPicker } from "./wallpaper-picker";
import { InstallCard } from "@/components/pwa/install-prompt";

/** Background, colouring and wallpaper. Saved with the account, like everything else. */
export function AppearanceControls() {
  const surface = useChronicle((s) => s.surface);
  const palette = useChronicle((s) => s.palette);
  const setSurface = useChronicle((s) => s.setSurface);
  const setPalette = useChronicle((s) => s.setPalette);

  return (
    <div className="space-y-7">
      <section>
        <p className="eyebrow mb-3">Background</p>
        <div className="grid grid-cols-3 gap-2.5">
          {SURFACES.map((s) => {
            const active = surface === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSurface(s.id)}
                aria-pressed={active}
                className={cn(
                  "group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all",
                  active ? "border-accent ring-1 ring-accent/40" : "border-line hover:border-paper/30",
                )}
              >
                <span className="h-12 w-full rounded-lg border border-line" style={{ background: s.swatch }} />
                <span className="text-xs font-medium text-paper">{s.label}</span>
                <span className="text-[0.65rem] text-paper/45">{s.hint}</span>
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
