"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, Flower2, Moon, Sun } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { THEME_MODES, surfaceFor, type ThemeMode } from "@/lib/theme";
import { deviceTimeFormat } from "@/lib/sleep";
import { cn } from "@/lib/utils";
import { InstallCard } from "@/components/pwa/install-prompt";

const MODE_ICON: Record<ThemeMode, typeof Sun> = { light: Sun, dark: Moon, lavender: Flower2 };

/**
 * A miniature of a theme in its own colours and glass: the backdrop, a
 * sidebar and a page pane, a line of text and the accent. It follows Reduce
 * transparency too, so it shows what you'll get.
 */
function ThemePreview({ mode, reduced }: { mode: ThemeMode; reduced: boolean }) {
  return (
    <span
      data-surface={surfaceFor(mode)}
      data-transparency={reduced ? "reduced" : undefined}
      className="relative flex h-20 w-full gap-1.5 overflow-hidden rounded-xl border border-line bg-ink p-2"
      aria-hidden
    >
      <span className="app-backdrop absolute inset-0" />
      <span className="relative flex w-7 flex-col items-center gap-1.5 rounded-lg border border-line bg-card py-2">
        <span className="block h-2 w-2 rounded-full bg-accent" />
        <span className="block h-1 w-3 rounded-full bg-paper/30" />
        <span className="block h-1 w-3 rounded-full bg-paper/30" />
      </span>
      <span className="relative flex flex-1 flex-col justify-between rounded-lg border border-line bg-card p-2 shadow-soft">
        <span className="block h-1.5 w-14 max-w-full rounded-full bg-paper/70" />
        <span className="block h-1 w-20 max-w-full rounded-full bg-paper/30" />
        <span className="block h-2.5 w-10 max-w-full rounded-full bg-accent" />
      </span>
    </span>
  );
}

/** A small heading for a group of settings, in sentence case. */
function GroupTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mb-3 text-sm font-semibold text-paper">
      {children}
    </h3>
  );
}

export function AppearanceControls() {
  const mode = useChronicle((s) => s.themeMode);
  const setThemeMode = useChronicle((s) => s.setThemeMode);
  const reduce = useChronicle((s) => s.reduceTransparency);
  const setReduce = useChronicle((s) => s.setReduceTransparency);
  const timeFormat = useChronicle((s) => s.profile.timeFormat);
  const updateProfile = useChronicle((s) => s.updateProfile);
  const themeId = useId();
  const reduceId = useId();
  const clockId = useId();
  const device = deviceTimeFormat();

  return (
    <div className="space-y-7">
      <section>
        <GroupTitle id={themeId}>Theme</GroupTitle>
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5" role="radiogroup" aria-labelledby={themeId}>
          {THEME_MODES.map((m) => {
            const active = mode === m.id;
            const Icon = MODE_ICON[m.id];
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setThemeMode(m.id)}
                role="radio"
                aria-checked={active}
                className={cn(
                  "group relative flex min-w-0 flex-col items-start gap-2 rounded-2xl border p-2 text-left transition-all sm:p-2.5",
                  active ? "border-accent ring-1 ring-accent/40" : "border-line hover:border-paper/30",
                )}
              >
                <ThemePreview mode={m.id} reduced={reduce} />
                <span className="flex min-w-0 items-center gap-1.5 px-0.5 text-[0.8rem] font-semibold text-paper sm:text-sm">
                  <Icon className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{m.label}</span>
                </span>
                {/* On a phone the three cards are narrow: the preview says it. */}
                <span className="hidden px-0.5 text-xs leading-snug text-paper/60 sm:block">{m.hint}</span>
                {active && (
                  <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-fg sm:right-4 sm:top-4">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex items-start gap-4 rounded-2xl border border-line p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-paper">Reduce transparency</p>
          <p className="mt-0.5 text-xs leading-relaxed text-paper/60" id={reduceId}>
            Nearly solid panels and no blur, in any theme, for easier reading. Devices that ask for less transparency
            get this automatically.
          </p>
        </div>
        <Switch checked={reduce} onChange={setReduce} label="Reduce transparency" describedBy={reduceId} />
      </section>

      <section>
        <GroupTitle id={clockId}>Clock</GroupTitle>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={clockId}>
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
                  on ? "border-accent/40 bg-accent/15 text-accent" : "glass-ghost border-line text-paper/65 hover:text-paper",
                )}
              >
                {on && <Clock className="h-3 w-3" />}
                {o.label}
              </button>
            );
          })}
        </div>
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
