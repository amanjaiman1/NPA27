"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, Droplet, Moon, Sun, SunMoon } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { THEME_MODES, PALETTES, surfaceFor, type ThemeMode } from "@/lib/theme";
import { deviceTimeFormat } from "@/lib/sleep";
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

/**
 * A small scene in Liquid Glass on the theme that's showing: the canvas glow,
 * a pane with its sheen and lit edge, and an accent pill.
 */
function GlassPreview({ mode }: { mode: ThemeMode }) {
  const surface = surfaceFor(mode);
  return (
    <span
      data-material="glass"
      data-surface={surface}
      className="relative block h-24 overflow-hidden rounded-xl border border-line bg-ink"
      aria-hidden
    >
      <span className="absolute inset-0 bg-aura" style={{ opacity: "var(--wash, 1)" }} />
      <span className="absolute left-[8%] top-[18%] h-10 w-10 rounded-full bg-[rgb(var(--aura-1)/0.55)] blur-md" />
      <span className="absolute right-[12%] top-[38%] h-12 w-12 rounded-full bg-[rgb(var(--aura-2)/0.5)] blur-md" />
      <span className="absolute inset-x-[14%] bottom-3 top-4 flex flex-col justify-between rounded-2xl border border-line bg-card p-3 shadow-soft">
        <span className="block h-1.5 w-16 rounded-full bg-paper/60" />
        <span className="block h-1 w-24 rounded-full bg-paper/30" />
        <span className="block h-3 w-12 rounded-full bg-accent" />
      </span>
    </span>
  );
}

/** Liquid Glass, transparency and the clock: how things are drawn, on any theme. */
function MaterialControls() {
  const mode = useChronicle((s) => s.themeMode);
  const material = useChronicle((s) => s.material);
  const reduce = useChronicle((s) => s.reduceTransparency);
  const setMaterial = useChronicle((s) => s.setMaterial);
  const setReduce = useChronicle((s) => s.setReduceTransparency);
  const timeFormat = useChronicle((s) => s.profile.timeFormat);
  const updateProfile = useChronicle((s) => s.updateProfile);
  const glassId = useId();
  const reduceId = useId();
  const device = deviceTimeFormat();

  return (
    <>
      <section data-testid="glass-settings">
        <p className="eyebrow mb-3">Liquid Glass</p>
        <div className="space-y-4 rounded-2xl border border-line p-4">
          <div className="flex items-start gap-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
              <Droplet className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-paper" id={`${glassId}-label`}>
                Liquid Glass
              </p>
              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-paper/60" id={`${glassId}-desc`}>
                Transform your interface with translucent surfaces, subtle depth and luminous glass effects. It works with
                Light, Dark and Auto, and keeps your theme as it is.
              </p>
            </div>
            <Switch
              checked={material === "glass"}
              onChange={(on) => setMaterial(on ? "glass" : "standard")}
              label="Liquid Glass"
              describedBy={`${glassId}-desc`}
            />
          </div>
          <GlassPreview mode={mode} />
          <div className="flex items-start gap-4 border-t border-line pt-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-paper">Reduce transparency</p>
              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-paper/60" id={reduceId}>
                Nearly solid surfaces and no blur, easier to read over a busy wallpaper. Also makes the frosted bars solid in
                Standard. Devices that ask for less transparency get this automatically.
              </p>
            </div>
            <Switch checked={reduce} onChange={setReduce} label="Reduce transparency" describedBy={reduceId} />
          </div>
        </div>
      </section>

      <section>
        <p className="eyebrow mb-3">Clock</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Show times as">
          {(
            [
              { id: undefined, label: `Device · ${device === "12h" ? "11:30 PM" : "23:30"}` },
              { id: "12h" as const, label: "12-hour · 11:30 PM" },
              { id: "24h" as const, label: "24-hour · 23:30" },
            ] as const
          ).map((o) => {
            const on = timeFormat === o.id;
            return (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => updateProfile({ timeFormat: o.id })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  on ? "border-accent/40 bg-accent/15 text-accent" : "border-line bg-card text-paper/65 hover:text-paper",
                )}
              >
                {on && <Clock className="h-3 w-3" />}
                {o.label}
              </button>
            );
          })}
        </div>
      </section>
    </>
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

      <MaterialControls />

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
