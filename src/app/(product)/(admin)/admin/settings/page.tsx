"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, SlidersHorizontal, UserPlus } from "lucide-react";
import { AppNoticeBar } from "@/components/platform/app-notice";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { AdminHeader, ErrorPanel, LoadingRows, When } from "@/components/admin/ui";
import { adminApi, useAdmin } from "@/lib/platform/client";
import { SETTINGS, settingProblem, type SettingDef, type SettingKey } from "@/lib/platform/validate";
import type { SettingsResponse } from "@/lib/platform/types";

const GROUPS: { title: string; description: string; keys: SettingKey[] }[] = [
  { title: "Reviews", description: "Who may send a review. Usage is counted from the dates of an account's records, never from what they wrote.", keys: ["reviews_open", "review_min_days", "review_min_usage_days", "review_invite_enabled"] },
  { title: "Publishing reviews", description: "What the website shows while an edit waits, and when a review earns its own page.", keys: ["review_edit_policy", "review_story_min_chars"] },
  { title: "Reviews on the website", description: "Where published reviews appear, and when an average may be shown. Featured ones first, then the newest; never chosen by rating.", keys: ["testimonials_on_home", "testimonials_home_count", "testimonials_on_feature_pages", "review_aggregate_min"] },
  { title: "Verification badges", description: "What the two earned badges need. The other two follow from the review rule and the records themselves.", keys: ["verified_active_usage_days", "established_member_days"] },
  { title: "Roles", description: "What Moderators and Admins may do beyond their usual part.", keys: ["moderators_handle_feedback", "moderators_hide_reviews", "admins_read_audit"] },
  { title: "Contact", description: "How the public site tells people to reach the team.", keys: ["support_email"] },
  { title: "Announcements", description: "What a new announcement starts with.", keys: ["announcement_default_days", "announcement_default_category"] },
  { title: "Notice in the app", description: "A single line at the top of every page of the app, for everyone, while it's on.", keys: ["app_notice"] },
];

type Notice = { enabled: boolean; message: string; tone: "info" | "warning" };

export default function AdminSettingsPage() {
  const settings = useAdmin<SettingsResponse>("settings");
  return (
    <div className="space-y-6">
      <AdminHeader
        icon={SlidersHorizontal}
        title="Platform settings"
        description="Typed, checked and recorded: every change goes in the audit log with its old and new value."
      />
      <ErrorPanel error={settings.error} onRetry={settings.reload} />
      {settings.loading && !settings.data ? (
        <LoadingRows rows={3} />
      ) : (
        settings.data && (
          <div className="grid gap-6 xl:grid-cols-2">
            {GROUPS.map((g) => (
              <SettingsGroup key={g.title} group={g} data={settings.data as SettingsResponse} onSaved={settings.set} />
            ))}
            <Card className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/[0.12] text-accent">
                  <UserPlus className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-snugg text-paper">New sign-ups</h2>
                  <p className="mt-1 text-sm leading-relaxed text-paper/65">
                    Whether new accounts can be created is a Supabase setting: Authentication, then Sign In / Providers, then
                    &ldquo;Allow new users to sign up&rdquo;. Changing it needs Supabase&apos;s management access, which the app
                    deliberately doesn&apos;t hold, so it isn&apos;t a switch here.
                  </p>
                  <a
                    href="https://supabase.com/dashboard/project/_/auth/providers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
                  >
                    Open it in Supabase <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </div>
              </div>
            </Card>
          </div>
        )
      )}
    </div>
  );
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const OFF_NOTICE: Notice = { enabled: false, message: "", tone: "info" };

/** A value in words, for "Default: …". */
function describe(def: SettingDef, v: unknown): string {
  switch (def.kind) {
    case "boolean":
      return v ? "On" : "Off";
    case "integer":
      return `${v} ${def.unit}`;
    case "email":
      return v ? String(v) : "None";
    case "choice":
      return def.options.find((o) => o.id === v)?.label ?? String(v);
    case "notice":
      return (v as Notice | undefined)?.enabled ? "On" : "Off";
  }
}

/**
 * One card of settings, saved together. Only the keys that differ from the
 * server's values are sent. When another card saves, this card takes the new
 * values for the fields it hasn't touched and keeps the ones it has.
 */
function SettingsGroup({ group, data, onSaved }: { group: (typeof GROUPS)[number]; data: SettingsResponse; onSaved: (d: SettingsResponse) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, unknown>>(() => Object.fromEntries(group.keys.map((k) => [k, data.values[k]])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = useRef(data.values);

  useEffect(() => {
    const prev = base.current;
    base.current = data.values;
    setDraft((d) => Object.fromEntries(group.keys.map((k) => [k, same(d[k], prev[k]) ? data.values[k] : d[k]])));
  }, [data, group.keys]);

  const changed = group.keys.filter((k) => !same(draft[k], data.values[k]));
  const problems = Object.fromEntries(changed.map((k) => [k, settingProblem(k, draft[k])]));
  const invalid = Object.values(problems).some(Boolean);

  async function save() {
    if (!changed.length || invalid) return;
    setBusy(true);
    setError(null);
    try {
      const next = await adminApi.patch<SettingsResponse>("settings", Object.fromEntries(changed.map((k) => [k, draft[k]])));
      onSaved(next);
      toast({ title: "Settings saved", description: group.title, tone: "success" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <h2 className="text-base font-semibold tracking-snugg text-paper">{group.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-paper/65">{group.description}</p>
      <div className="mt-5 flex-1 divide-y divide-line">
        {group.keys.map((k) => (
          <SettingRow
            key={k}
            id={k}
            value={draft[k]}
            fallback={data.defaults[k]}
            stamp={data.changed[k]}
            problem={problems[k] ?? null}
            onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
        {changed.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setDraft(Object.fromEntries(group.keys.map((k) => [k, data.values[k]])));
              setError(null);
            }}
          >
            Discard
          </Button>
        )}
        <Button size="sm" onClick={() => void save()} disabled={!changed.length || invalid || busy}>
          {busy ? "Saving…" : changed.length ? "Save changes" : "Saved"}
        </Button>
      </div>
    </Card>
  );
}

function SettingRow({
  id,
  value,
  fallback,
  stamp,
  problem,
  onChange,
}: {
  id: SettingKey;
  value: unknown;
  fallback: unknown;
  stamp: { at: string; by: string | null } | undefined;
  problem: string | null;
  onChange: (v: unknown) => void;
}) {
  const def: SettingDef = SETTINGS[id];
  const helpId = useId();
  const meta = (
    <p className="mt-2 text-[0.7rem] leading-relaxed text-paper/45">
      Default: {describe(def, fallback)}
      {stamp && (
        <>
          {" · "}Changed {stamp.by ? `by ${stamp.by} ` : ""}on <When at={stamp.at} />
        </>
      )}
    </p>
  );
  const row = "py-4 first:pt-0 last:pb-0";

  if (def.kind === "boolean") {
    return (
      <div className={row}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-paper">{def.label}</p>
            <p id={helpId} className="mt-0.5 text-xs leading-relaxed text-paper/55">
              {def.help}
            </p>
          </div>
          <Switch checked={value === true} onChange={onChange} label={def.label} describedBy={helpId} />
        </div>
        {meta}
      </div>
    );
  }

  if (def.kind === "notice") return <NoticeRow value={value} problem={problem} onChange={onChange} meta={meta} help={def.help} />;

  return (
    <div className={row}>
      {def.kind === "integer" ? (
        <Field label={`${def.label} (${def.unit})`} hint={def.help} error={problem}>
          <Input
            type="number"
            inputMode="numeric"
            min={def.min}
            max={def.max}
            step={1}
            value={typeof value === "number" && Number.isFinite(value) ? String(value) : ""}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            className="max-w-[10rem]"
          />
        </Field>
      ) : def.kind === "email" ? (
        <Field label={def.label} hint={def.help} error={problem} optional>
          <Input
            type="email"
            autoComplete="off"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value.trim())}
            placeholder="help@example.com"
          />
        </Field>
      ) : (
        <Field label={def.label} hint={def.help} error={problem}>
          <Select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className="max-w-xs">
            {def.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {meta}
    </div>
  );
}

/** The product-wide notice: on or off, its words and its tone, with a preview. */
function NoticeRow({ value, problem, onChange, meta, help }: { value: unknown; problem: string | null; onChange: (v: Notice) => void; meta: React.ReactNode; help: string }) {
  const n: Notice = { ...OFF_NOTICE, ...((value as Partial<Notice> | null) ?? {}) };
  const helpId = useId();
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-paper">Show the notice</p>
          <p id={helpId} className="mt-0.5 text-xs leading-relaxed text-paper/55">
            {help}
          </p>
        </div>
        <Switch checked={n.enabled} onChange={(enabled) => onChange({ ...n, enabled })} label="Show the notice" describedBy={helpId} />
      </div>
      <Field label="Message" className="mt-4" error={problem} hint={`${n.message.length} of 240 characters.`}>
        <Input
          value={n.message}
          maxLength={240}
          onChange={(e) => onChange({ ...n, message: e.target.value })}
          placeholder="DoOrDie will be down for maintenance on Sunday, 9–10 pm IST."
        />
      </Field>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-[0.78rem] font-semibold tracking-snugg text-paper/60">Tone</span>
        <Segmented
          label="Tone"
          options={[
            { value: "info", label: "Information" },
            { value: "warning", label: "Warning" },
          ]}
          value={n.tone}
          onChange={(tone) => onChange({ ...n, tone })}
        />
      </div>
      {n.message.trim() && (
        <div className="mt-4">
          <p className="eyebrow mb-2">Preview</p>
          <AppNoticeBar message={n.message.trim()} tone={n.tone} />
        </div>
      )}
      {meta}
    </div>
  );
}
