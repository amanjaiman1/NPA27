"use client";

import { AlertTriangle, BellOff, Check } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  RULES,
  type Category,
  type NotifySettings,
  type RuleId,
} from "@/lib/notifications";
import {
  useNotificationPermission,
  type PermissionState,
} from "./use-notifications";

/** A compact pill switch — the app has no shared one, and this is its only user. */
function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        "disabled:pointer-events-none disabled:opacity-40",
        checked ? "border-accent bg-accent" : "border-line bg-paper/[0.08]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-[1.125rem] w-[1.125rem] rounded-full transition-all duration-200",
          checked ? "left-[1.4375rem] bg-accent-fg" : "left-0.5 bg-paper/60",
        )}
      />
    </button>
  );
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-paper">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-paper/45">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function HourSelect({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="tabular h-9 shrink-0 rounded-full border border-line bg-card px-3 text-xs text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, "0")}:00
        </option>
      ))}
    </select>
  );
}

/** The permission block — the only place the browser prompt is ever raised. */
function PermissionBlock({
  permission,
  request,
  settings,
  update,
}: {
  permission: PermissionState;
  request: () => Promise<PermissionState>;
  settings: NotifySettings;
  update: (patch: Partial<NotifySettings>) => void;
}) {
  if (permission === "unsupported") {
    return (
      <div className="flex gap-3 rounded-2xl border border-line bg-paper/[0.04] p-3.5">
        <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-paper/45" />
        <p className="text-xs leading-relaxed text-paper/60">
          This browser can&apos;t show system notifications. The list above still
          works — it&apos;s computed from your own data, not pushed to you.
        </p>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="flex gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-3.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p className="text-xs leading-relaxed text-paper/70">
          Notifications are blocked for this site. A page can&apos;t ask again
          once that&apos;s set — you&apos;ll need to allow it in your
          browser&apos;s site settings (the icon beside the address bar).
        </p>
      </div>
    );
  }

  if (permission === "default") {
    return (
      <button
        onClick={async () => {
          const result = await request();
          /* Only turn delivery on if the ask actually succeeded. */
          if (result === "granted") update({ deliver: true });
        }}
        className="w-full rounded-2xl border border-accent/40 bg-accent/10 p-3.5 text-left transition-colors hover:bg-accent/15"
      >
        <p className="text-sm font-semibold text-paper">
          Enable system notifications
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-paper/55">
          Your browser will ask for permission. Without it, everything above
          still works — you just have to open the bell to see it.
        </p>
      </button>
    );
  }

  return (
    <Row
      title="System notifications"
      hint="Permission granted. Turn this off to keep everything inside the app."
    >
      <Switch
        label="System notifications"
        checked={settings.deliver}
        onChange={(v) => update({ deliver: v })}
      />
    </Row>
  );
}

export function SettingsPane({ settings }: { settings: NotifySettings }) {
  const update = useChronicle((s) => s.updateNotifySettings);
  const { permission, request } = useNotificationPermission();

  const toggleRule = (id: RuleId) =>
    update({
      mutedRules: settings.mutedRules.includes(id)
        ? settings.mutedRules.filter((r) => r !== id)
        : [...settings.mutedRules, id],
    });

  const toggleCategory = (c: Category) =>
    update({
      mutedCategories: settings.mutedCategories.includes(c)
        ? settings.mutedCategories.filter((x) => x !== c)
        : [...settings.mutedCategories, c],
    });

  const categories = [...new Set(RULES.map((r) => r.category))];

  return (
    <div className="space-y-6">
      <PermissionBlock
        permission={permission}
        request={request}
        settings={settings}
        update={update}
      />

      {/* ── delivery ─────────────────────────────────────────── */}
      <section>
        <p className="eyebrow mb-1">Delivery</p>
        <div className="divide-y divide-line">
          <Row
            title="Daily digest"
            hint="One summary a day instead of a toast per thing."
          >
            <Switch
              label="Daily digest"
              checked={settings.digest}
              onChange={(v) => update({ digest: v })}
            />
          </Row>

          {settings.digest ? (
            <Row title="Digest time" hint="When the summary arrives.">
              <HourSelect
                label="Digest hour"
                value={settings.digestHour}
                onChange={(v) => update({ digestHour: v })}
              />
            </Row>
          ) : (
            <>
              <Row
                title="Quiet hours"
                hint="Nothing is delivered inside this window. The list still fills up."
              >
                <div className="flex shrink-0 items-center gap-1.5">
                  <HourSelect
                    label="Quiet from"
                    value={settings.quietFrom}
                    onChange={(v) => update({ quietFrom: v })}
                  />
                  <span className="text-xs text-paper/40">to</span>
                  <HourSelect
                    label="Quiet to"
                    value={settings.quietTo}
                    onChange={(v) => update({ quietTo: v })}
                  />
                </div>
              </Row>
              <Row
                title="Most per day"
                hint="Critical warnings ignore this limit."
              >
                <select
                  aria-label="Maximum per day"
                  value={settings.maxPerDay}
                  onChange={(e) => update({ maxPerDay: Number(e.target.value) })}
                  className="tabular h-9 shrink-0 rounded-full border border-line bg-card px-3 text-xs text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
                >
                  {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Row>
            </>
          )}

          <Row
            title="Remind me after"
            hint="When an unlogged day or an unticked habit becomes worth mentioning."
          >
            <HourSelect
              label="Reminder hour"
              value={settings.reminderHour}
              onChange={(v) => update({ reminderHour: v })}
            />
          </Row>
        </div>
      </section>

      {/* ── categories ───────────────────────────────────────── */}
      <section>
        <p className="eyebrow mb-2.5">Categories</p>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const on = !settings.mutedCategories.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                aria-pressed={on}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  on
                    ? "border-accent/40 bg-accent/10 text-paper"
                    : "border-line text-paper/40 hover:text-paper/70",
                )}
              >
                {on && <Check className="h-3 w-3 text-accent" />}
                {CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── individual rules ─────────────────────────────────── */}
      <section>
        <p className="eyebrow mb-1">What to watch for</p>
        <div className="divide-y divide-line">
          {RULES.map((r) => {
            const categoryMuted = settings.mutedCategories.includes(r.category);
            return (
              <Row key={r.id} title={r.label} hint={r.description}>
                <Switch
                  label={r.label}
                  disabled={categoryMuted}
                  checked={!categoryMuted && !settings.mutedRules.includes(r.id)}
                  onChange={() => toggleRule(r.id)}
                />
              </Row>
            );
          })}
        </div>
      </section>
    </div>
  );
}
