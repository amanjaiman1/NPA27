"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Moon, Activity, Droplets, BrainCircuit, SlidersHorizontal, X } from "lucide-react";
import type { ISODate, LifeEntry, LifeField } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { LIFE_FIELDS, trackedFields } from "@/lib/life";
import {
  EXERCISE_TYPES,
  LIFE_INPUTS,
  draftFromEntry,
  draftsDiffer,
  entryFromDraft,
  inputDef,
  type LifeDraft,
  type LifeDraftErrors,
  type LifeNumberKey,
} from "@/lib/life-entry";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { habitContext, habitsMovedOn, movedSummary } from "@/lib/habit-engine";
import { FileLinker } from "@/components/attachments/file-linker";
import { cn, formatDate, toISODate } from "@/lib/utils";
import { timeFormatOf } from "@/lib/sleep";
import { SleepTimes } from "@/components/sleep/sleep-editor";
import { shiftDay } from "@/lib/life";

function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="mt-1 text-[0.72rem] text-danger" role="alert">
      {children}
    </p>
  );
}

function Group({ icon: Icon, title, children }: { icon: typeof Moon; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 flex items-center gap-2 text-[0.78rem] font-semibold tracking-snugg text-paper/80">
        <Icon className="h-4 w-4 text-accent" /> {title}
      </legend>
      {children}
    </fieldset>
  );
}

/** Which fields make up each part of the form. */
const GROUPS: { title: string; icon: typeof Moon; fields: LifeField[] }[] = [
  { title: "Sleep", icon: Moon, fields: ["sleep"] },
  { title: "Movement", icon: Activity, fields: ["exercise", "walk", "run"] },
  { title: "Habits and body", icon: Droplets, fields: ["water", "meditation", "screen", "weight"] },
  { title: "Focus", icon: BrainCircuit, fields: ["deepWork"] },
];

export interface LifeEditor {
  draft: LifeDraft;
  setDraft: React.Dispatch<React.SetStateAction<LifeDraft>>;
  /** What's saved for the draft's day, as a draft. */
  base: LifeDraft;
  touched: boolean;
  setTouched: (v: boolean) => void;
  /** Opens a day: what's saved for it, or `restore` (an unsaved draft kept from before). */
  load: (day: ISODate, restore?: LifeDraft) => void;
  dirty: boolean;
  entry: LifeEntry | null;
  errors: LifeDraftErrors;
  valid: boolean;
  /** The saved record for the draft's day. */
  saved?: LifeEntry;
}

/** A draft of one day's Life Dashboard readings. Nothing is saved until the caller saves `entry`. */
export function useLifeEditor(date: ISODate): LifeEditor {
  const lifeLog = useChronicle((s) => s.lifeLog);
  const [draft, setDraft] = useState<LifeDraft>(() => draftFromEntry(date, lifeLog.find((l) => l.date === date)));
  const [base, setBase] = useState<LifeDraft>(draft);
  const [touched, setTouched] = useState(false);
  const saved = lifeLog.find((l) => l.date === draft.date);

  const load = useCallback((day: ISODate, restore?: LifeDraft) => {
    const fresh = draftFromEntry(day, useChronicle.getState().lifeLog.find((l) => l.date === day));
    setDraft(restore && restore.date === day ? restore : fresh);
    setBase(fresh);
    setTouched(false);
  }, []);

  const dirty = draftsDiffer(draft, base);
  const { entry, errors } = useMemo(() => entryFromDraft(draft, toISODate(new Date()), saved), [draft, saved]);
  const valid = Object.keys(errors).length === 0;
  return useMemo(
    () => ({ draft, setDraft, base, touched, setTouched, load, dirty, entry, errors, valid, saved }),
    [draft, base, touched, load, dirty, entry, errors, valid, saved],
  );
}

/**
 * The readings themselves: only the fields you track are shown, every box
 * starts empty unless that day already has a reading, and an empty box is
 * saved as "not recorded", never as zero. `page` sets the groups out as cards,
 * for Daily Capture.
 */
export function LifeFields({
  editor,
  onChooseFields,
  variant = "dialog",
}: {
  editor: LifeEditor;
  onChooseFields: () => void;
  variant?: "dialog" | "page";
}) {
  const lifeLog = useChronicle((s) => s.lifeLog);
  const profile = useChronicle((s) => s.profile);
  const { draft, setDraft, base, touched, errors, saved } = editor;
  const page = variant === "page";
  const fields = useMemo(() => new Set(trackedFields(profile.lifeFields, lifeLog)), [profile.lifeFields, lifeLog]);
  const format = timeFormatOf(profile);

  function setNumber(key: LifeNumberKey, value: string) {
    setDraft((d) => ({ ...d, numbers: { ...d.numbers, [key]: value } }));
  }

  function setTime(which: "bedtime" | "wakeTime", value: string) {
    setDraft((d) => ({ ...d, [which]: value }));
  }

  const show = (k: keyof typeof errors) => (touched || draft.numbers[k as LifeNumberKey] !== base.numbers[k as LifeNumberKey] ? errors[k] : undefined);

  const numberInput = (key: LifeNumberKey) => {
    const d = inputDef(key);
    const err = show(key);
    return (
      <div key={key}>
        <Field label={`${d.label} (${d.unit})`}>
          <Input
            type="number"
            inputMode="decimal"
            min={d.min}
            max={d.max}
            step={d.step}
            value={draft.numbers[key]}
            onChange={(e) => setNumber(key, e.target.value)}
            placeholder="Not recorded"
            aria-invalid={Boolean(err)}
            className={cn(err && "border-danger/60")}
          />
        </Field>
        <FieldError>{err}</FieldError>
      </div>
    );
  };

  const trackedNames = LIFE_FIELDS.filter((f) => fields.has(f.id)).map((f) => f.label.toLowerCase());
  const groups = GROUPS.filter((g) => g.fields.some((f) => fields.has(f)));

  const groupBody = (g: (typeof GROUPS)[number]) =>
    g.title === "Sleep" ? (
      <>
        <SleepTimes
          date={draft.date}
          bedtime={draft.bedtime}
          wakeTime={draft.wakeTime}
          onBedtime={(v) => setTime("bedtime", v)}
          onWakeTime={(v) => setTime("wakeTime", v)}
          format={format}
          target={profile.sleepTarget}
        />
        <FieldError>{touched ? errors.sleepTimes : undefined}</FieldError>
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
          <div>
            {numberInput("sleepHours")}
            <p className="mt-1 text-[0.7rem] text-paper/50">Leave empty to count bedtime to wake-up.</p>
          </div>
          <div>
            <p className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/60">How well you slept</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, sleepQuality: d.sleepQuality === v ? undefined : v }))}
                  aria-pressed={draft.sleepQuality === v}
                  aria-label={`Sleep quality ${v} of 5`}
                  className={cn(
                    "h-9 flex-1 rounded-xl border text-xs font-semibold transition-all",
                    draft.sleepQuality != null && v <= draft.sleepQuality
                      ? "border-accent bg-accent text-accent-fg"
                      : "field border-line bg-paper/[0.03] text-paper/55 hover:border-paper/25 hover:text-paper",
                  )}
                >
                  {v}
                </button>
              ))}
              {draft.sleepQuality != null && (
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, sleepQuality: undefined }))}
                  aria-label="Clear sleep quality"
                  className="grid h-9 w-8 shrink-0 place-items-center rounded-xl text-paper/45 hover:text-paper"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1 text-[0.7rem] text-paper/45">
              {draft.sleepQuality == null ? "Not rated" : "1 poor · 5 great. Tap again to clear."}
            </p>
          </div>
        </div>
      </>
    ) : (
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        {LIFE_INPUTS.filter((d) => g.fields.includes(d.field) && fields.has(d.field)).map((d) =>
          d.key === "exerciseMinutes" ? (
            <div key="exercise" className="contents">
              {numberInput("exerciseMinutes")}
              <Field label="Activity">
                <Select
                  value={draft.exerciseType}
                  onChange={(e) => setDraft((x) => ({ ...x, exerciseType: e.target.value as LifeDraft["exerciseType"] }))}
                >
                  <option value="">Not recorded</option>
                  {EXERCISE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : (
            numberInput(d.key)
          ),
        )}
      </div>
    );

  const tracking = (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5", page ? "bg-paper/[0.03]" : "bg-paper/[0.02]")}>
      <p className="min-w-0 flex-1 text-[0.75rem] text-paper/65">You track {trackedNames.length ? trackedNames.join(", ") : "nothing yet"}.</p>
      <button type="button" onClick={onChooseFields} className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold text-accent hover:underline">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Change
      </button>
    </div>
  );

  const note = (
    <Field label="A line about the day" hint="Optional. Up to 280 characters.">
      <Input
        value={draft.note}
        onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
        maxLength={280}
        placeholder="e.g. Slept badly, short walk after lunch"
      />
    </Field>
  );

  const files = (
    <div className="space-y-2">
      <p className="text-[0.78rem] font-semibold tracking-snugg text-paper/60">Files from your journal</p>
      <p className="text-[0.7rem] text-paper/50">
        Links are saved straight away and never copy the file. Files from this day&rsquo;s journal entry are listed first.
      </p>
      <FileLinker target={{ kind: "life", date: draft.date }} fileIds={saved?.fileIds} suggestDate={draft.date} emptyHint="No files linked to this day." />
    </div>
  );

  if (page) {
    return (
      <div className="space-y-5" data-testid="life-form">
        {tracking}
        <div className="divide-y divide-line">
          {groups.map((g) => (
            <div key={g.title} className="py-6 first:pt-2">
              <Group icon={g.icon} title={g.title}>
                {groupBody(g)}
              </Group>
            </div>
          ))}
          <div className="space-y-6 py-6">
            {note}
            {files}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7" data-testid="life-form">
      {tracking}
      {groups.map((g) => (
        <Group key={g.title} icon={g.icon} title={g.title}>
          {groupBody(g)}
        </Group>
      ))}
      {note}
      {files}
    </div>
  );
}

/** Logging a day on the Life Dashboard, in a dialog. */
export function LifeForm({
  open,
  date,
  onClose,
  onChooseFields,
}: {
  open: boolean;
  /** The day to open on. */
  date: ISODate;
  onClose: () => void;
  onChooseFields: () => void;
}) {
  const upsertLifeEntry = useChronicle((s) => s.upsertLifeEntry);
  const deleteLifeEntry = useChronicle((s) => s.deleteLifeEntry);
  const confirm = useConfirm();
  const toast = useToast();
  const today = toISODate(new Date());
  const editor = useLifeEditor(date);
  const { draft, dirty, entry, errors, valid, saved, load, setTouched, touched } = editor;

  useEffect(() => {
    if (open) load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date]);

  async function changeDate(day: ISODate) {
    if (!day || day === draft.date) return;
    if (dirty) {
      const ok = await confirm({
        title: `Discard what you typed for ${formatDate(draft.date)}?`,
        description: `The form will show what's saved for ${formatDate(day)} instead.`,
        confirmLabel: "Discard and switch",
        cancelLabel: "Keep editing",
      });
      if (!ok) return;
    }
    load(day);
  }

  async function close() {
    if (dirty) {
      const ok = await confirm({
        title: "Discard these changes?",
        description: "Nothing you changed here will be saved. Linked files stay linked.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      });
      if (!ok) return;
    }
    onClose();
  }

  function save() {
    setTouched(true);
    if (!valid) {
      toast({ title: "Some readings need fixing", description: "They're marked in the form.", tone: "error" });
      return;
    }
    if (entry) upsertLifeEntry(entry);
    else if (saved) deleteLifeEntry(saved.date);
    onClose();
    const after = useChronicle.getState();
    toast({
      title: entry ? `${formatDate(draft.date)} saved` : `${formatDate(draft.date)} cleared`,
      description: entry ? movedSummary(habitsMovedOn(after.habits, habitContext(after, today), draft.date, ["life"])) : undefined,
    });
  }

  const yesterday = shiftDay(today, -1);

  return (
    <Modal
      open={open}
      onClose={close}
      title={saved ? "Edit the day" : "Log the day"}
      description="Fill in what you know. Empty boxes are saved as not recorded, never as zero."
      className="sm:max-w-xl"
      footer={
        <>
          {touched && !valid && (
            <p className="mr-auto text-xs text-danger" role="alert">
              Fix the highlighted fields to save.
            </p>
          )}
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!dirty}>
            <Check className="h-4 w-4" /> Save
          </Button>
        </>
      }
    >
      <div className="space-y-7">
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Day" className="w-44">
              <Input type="date" value={draft.date} max={today} onChange={(e) => changeDate(e.target.value)} aria-invalid={Boolean(errors.date)} />
            </Field>
            <div className="flex gap-1.5 pb-1">
              {[
                { label: "Today", day: today },
                { label: "Yesterday", day: yesterday },
              ].map((o) => (
                <button
                  key={o.day}
                  type="button"
                  onClick={() => changeDate(o.day)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    draft.date === o.day ? "border-accent/35 bg-accent/15 text-accent" : "border-line text-paper/60 hover:text-paper",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <FieldError>{errors.date}</FieldError>
          <p className="text-[0.72rem] text-paper/55">
            {saved ? `Showing what's saved for ${formatDate(draft.date)}.` : `Nothing saved for ${formatDate(draft.date)} yet.`}
          </p>
        </div>
        <LifeFields editor={editor} onChooseFields={onChooseFields} />
      </div>
    </Modal>
  );
}

/** Choose which measurements the form asks for and the dashboard reports on. */
export function TrackedFieldsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useChronicle((s) => s.profile);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const updateProfile = useChronicle((s) => s.updateProfile);
  const [chosen, setChosen] = useState<Set<LifeField>>(new Set());

  useEffect(() => {
    if (open) setChosen(new Set(trackedFields(profile.lifeFields, lifeLog)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(f: LifeField) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="What you track"
      description="The form asks only for these, and the reports cover only these. Readings you've already saved are kept either way."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={chosen.size === 0}
            onClick={() => {
              updateProfile({ lifeFields: LIFE_FIELDS.map((f) => f.id).filter((id) => chosen.has(id)) });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <ul className="space-y-1.5">
        {LIFE_FIELDS.map((f) => {
          const on = chosen.has(f.id);
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => toggle(f.id)}
                aria-pressed={on}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  on ? "border-accent/45 bg-accent/[0.07]" : "border-line hover:border-paper/20",
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                    on ? "border-accent bg-accent text-accent-fg" : "border-paper/30",
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-paper">{f.label}</span>
                  <span className="block text-[0.7rem] text-paper/50">{f.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {chosen.size === 0 && <p className="mt-3 text-[0.75rem] text-danger">Choose at least one.</p>}
    </Modal>
  );
}
