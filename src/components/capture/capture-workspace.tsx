"use client";

import { forwardRef, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CloudOff,
  Loader2,
  NotebookPen,
  RotateCcw,
  Target,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import type { ISODate, JournalEntry, LifeEntry } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import { habitContext, habitsMovedOn, movedSummary, summarizeToday, todayHabits } from "@/lib/habit-engine";
import { shiftDay, trackedFields } from "@/lib/life";
import { entryFromDraft } from "@/lib/life-entry";
import {
  applyGoalDraft,
  applyGoalLinks,
  applyHabitDrafts,
  goalChanges,
  goalUpdatedOn,
  habitChanges,
  hasGoalChanges,
  lifeRecorded,
  linkChanges,
  parseCaptureDate,
  parseSection,
  previewHabits,
  type CaptureSection,
  type GoalDraft,
  type HabitDrafts,
} from "@/lib/daily-capture";
import { useAccount, useSyncStatus } from "@/components/account/account-session";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { emptyEntry } from "@/components/journal/constants";
import {
  JournalFields,
  commitJournalEntry,
  prepareJournalEntry,
  useJournalEditor,
  type JournalCelebration,
} from "@/components/journal/journal-editor";
import { LifeFields, TrackedFieldsDialog, useLifeEditor } from "@/components/life/life-form";
import { GoalsTab } from "./goals-tab";
import { HabitTab } from "./habit-tab";
import { draftDates, readDraft, writeDraft } from "./draft-store";
import { cn, formatDate, formatHours, toISODate } from "@/lib/utils";

const SECTIONS: { id: CaptureSection; label: string; icon: LucideIcon }[] = [
  { id: "day", label: "Day Update", icon: NotebookPen },
  { id: "life", label: "Life", icon: Activity },
  { id: "goals", label: "Goals", icon: Target },
  { id: "habit", label: "Habit", icon: CircleCheck },
];
const LABEL = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label])) as Record<CaptureSection, string>;

type SectionState = "empty" | "progress" | "complete" | "unsaved" | "error" | "na";
interface SectionView {
  state: SectionState;
  /** The tab's figure: "3h 30m", "5/9", "2", "1/4". */
  badge: string;
  text: string;
  /** Counts towards the day's capture; null when the section has nothing to do. */
  done: boolean | null;
}

const BADGE: Record<SectionState, string> = {
  empty: "bg-paper/[0.06] text-paper/55",
  progress: "bg-warning/15 text-warning",
  complete: "bg-positive/15 text-positive",
  unsaved: "bg-accent/15 text-accent",
  error: "bg-danger/15 text-danger",
  na: "bg-paper/[0.06] text-paper/45",
};

const DOT: Record<SectionState, string> = {
  empty: "bg-paper/25",
  progress: "bg-warning",
  complete: "bg-positive",
  unsaved: "bg-accent",
  error: "bg-danger",
  na: "bg-paper/15",
};

interface SectionResult {
  ok: boolean;
  message?: string;
}
interface SaveOutcome {
  at: Date;
  results: Partial<Record<CaptureSection, SectionResult>>;
  goalErrors: Record<string, string>;
  /** Where the saved changes are: in the account, still on their way, or kept on this device. */
  cloud: "synced" | "pending" | "device" | null;
}

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong while saving.");
const sameRecord = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const longDate = (d: ISODate) => format(new Date(`${d}T00:00:00`), "EEEE, d MMMM yyyy");
const byDate = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date);

/**
 * Daily Capture: the day's journal, Life Dashboard readings, goal updates and
 * habit check-ins in one workspace, saved together.
 *
 * It owns no data. Each tab edits a draft of the records the standalone pages
 * use, and Save All Changes applies the drafts through the store's own
 * actions, in an order that keeps them consistent: the journal entry, then the
 * life entry (which mirrors bedtime and wake-up onto it), then goals, then
 * habit check-ins. The store persists to this account's storage and the sync
 * engine carries it to the cloud with its versioned, conflict-aware save.
 * Unsaved drafts are kept per account and day in this browser tab, so a
 * reload, another page or another day never loses them.
 */
export function CaptureWorkspace({
  onClose,
  onCelebrate,
}: {
  onClose: () => void;
  /** A first entry for the day was saved: the celebration is the page's to show. */
  onCelebrate: (c: JournalCelebration) => void;
}) {
  const params = useSearchParams();
  const paramKey = params.toString();
  const { accountId, mode, flush, syncNow } = useAccount();
  const { sync } = useSyncStatus();
  const confirm = useConfirm();
  const toast = useToast();
  const today = toISODate(useNow(60_000));

  const [date, setDate] = useState<ISODate>(() => parseCaptureDate(params.get("date"), toISODate(new Date())));
  const [section, setSection] = useState<CaptureSection>(() => parseSection(params.get("section")));
  const [visited, setVisited] = useState<Set<CaptureSection>>(() => new Set([parseSection(params.get("section"))]));
  const [loaded, setLoaded] = useState<ISODate | null>(null);
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  /** Set once everything is saved, so closing doesn't keep a stale draft. */
  const skipPersist = useRef(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const savingRef = useRef(false);
  const dateRef = useRef(date);
  dateRef.current = date;

  const journal = useChronicle((s) => s.journal);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const goals = useChronicle((s) => s.goals);
  const habits = useChronicle((s) => s.habits);
  const revisions = useChronicle((s) => s.revisions);
  const plans = useChronicle((s) => s.plans);
  const subjects = useChronicle((s) => s.subjects);
  const profile = useChronicle((s) => s.profile);

  const savedEntry = useMemo(() => journal.find((j) => j.date === date), [journal, date]);
  const journalEd = useJournalEditor(savedEntry ?? emptyEntry(date));
  const lifeEd = useLifeEditor(date);
  const [goalDrafts, setGoalDrafts] = useState<Record<string, GoalDraft>>({});
  const [habitDrafts, setHabitDrafts] = useState<HabitDrafts>({});
  /** The saved records the day's edits started from, to notice changes made elsewhere meanwhile. */
  const baseRef = useRef<{ journal: JournalEntry | null; life: LifeEntry | null }>({ journal: null, life: null });

  const { reset: resetJournal, setGoalIds } = journalEd;
  const { load: loadLife } = lifeEd;

  /** Opens a day: what's saved for it, with any unsaved draft kept from before on top. */
  const loadDay = useCallback(
    (day: ISODate, keepDrafts = true) => {
      const s = useChronicle.getState();
      const entry = s.journal.find((j) => j.date === day) ?? null;
      const life = s.lifeLog.find((l) => l.date === day) ?? null;
      const stash = keepDrafts ? readDraft(accountId, day) : null;
      baseRef.current = stash?.base ?? { journal: entry, life };
      resetJournal(entry ?? emptyEntry(day), stash?.journal);
      if (stash?.links) setGoalIds(stash.links);
      loadLife(day, stash?.life);
      setGoalDrafts(stash?.goals ?? {});
      setHabitDrafts(stash?.habits ?? {});
      setRestored(Boolean(stash));
      setOutcome(null);
      setLoaded(day);
    },
    [accountId, resetJournal, setGoalIds, loadLife],
  );

  useEffect(() => {
    loadDay(date);
  }, [date, loadDay]);

  /* ── what's unsaved ─────────────────────────────────────────── */

  const linkDiff = useMemo(() => linkChanges(goals, journalEd.goalIds, date), [goals, journalEd.goalIds, date]);
  const goalIdsChanged = useMemo(
    () =>
      Object.keys(goalDrafts).filter((id) => {
        const g = goals.find((x) => x.id === id);
        return g ? hasGoalChanges(goalChanges(g, goalDrafts[id], date)) : false;
      }),
    [goalDrafts, goals, date],
  );
  const habitIdsChanged = useMemo(() => habitChanges(habits, habitDrafts, date), [habits, habitDrafts, date]);
  const dirty: Record<CaptureSection, boolean> = {
    day: journalEd.dirty,
    life: lifeEd.dirty,
    goals: linkDiff.length > 0 || goalIdsChanged.length > 0,
    habit: habitIdsChanged.length > 0,
  };
  const anyDirty = dirty.day || dirty.life || dirty.goals || dirty.habit;
  const ready = loaded === date && journalEd.base.date === date && lifeEd.draft.date === date;

  // A day nobody is editing follows its saved records, e.g. when another device syncs.
  useEffect(() => {
    if (!ready || journalEd.dirty || savingRef.current) return;
    if (savedEntry ? savedEntry !== baseRef.current.journal : baseRef.current.journal) {
      baseRef.current.journal = savedEntry ?? null;
      resetJournal(savedEntry ?? emptyEntry(date));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedEntry]);
  useEffect(() => {
    if (!ready || lifeEd.dirty || savingRef.current) return;
    if ((lifeEd.saved ?? null) !== baseRef.current.life) {
      baseRef.current.life = lifeEd.saved ?? null;
      loadLife(date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifeEd.saved]);

  /* ── drafts survive reloads, other pages and other days ─────── */

  const persistRef = useRef<() => void>(() => {});
  persistRef.current = () => {
    if (!ready) return;
    if (!anyDirty) return writeDraft(accountId, date, null);
    const pick = <T,>(ids: string[], from: Record<string, T>) => Object.fromEntries(ids.map((id) => [id, from[id]]));
    writeDraft(accountId, date, {
      base: baseRef.current,
      journal: dirty.day ? journalEd.snapshot() : undefined,
      links: linkDiff.length ? journalEd.goalIds : undefined,
      life: dirty.life ? lifeEd.draft : undefined,
      goals: goalIdsChanged.length ? pick(goalIdsChanged, goalDrafts) : undefined,
      habits: habitIdsChanged.length ? pick(habitIdsChanged, habitDrafts) : undefined,
    });
  };
  useEffect(() => {
    const t = window.setTimeout(() => persistRef.current(), 350);
    return () => window.clearTimeout(t);
  }, [ready, anyDirty, journalEd.draft, journalEd.sessionFiles, journalEd.goalIds, lifeEd.draft, goalDrafts, habitDrafts]);
  useEffect(
    () => () => {
      if (!skipPersist.current) persistRef.current();
    },
    [],
  );
  useEffect(() => {
    if (!anyDirty && !journalEd.uploading) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      persistRef.current();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [anyDirty, journalEd.uploading]);

  const otherDrafts = useMemo(
    () => (loaded ? draftDates(accountId).filter((d) => d !== date) : []),
    // Re-read when the day changes or a save settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, date, loaded, outcome],
  );

  const loggedDays = useMemo(() => new Set(journal.map((j) => j.date)), [journal]);
  const waitingDays = useMemo(() => new Set([...otherDrafts, ...(anyDirty ? [date] : [])]), [otherDrafts, anyDirty, date]);

  /* ── the day and the tab live in the address ────────────────── */

  const changeDate = useCallback((next: ISODate) => {
    if (!next || next === dateRef.current) return;
    persistRef.current(); // this day's unsaved edits wait for it under its own key
    setDate(next);
  }, []);
  const selectSection = useCallback((s: CaptureSection) => {
    setSection(s);
    setVisited((v) => (v.has(s) ? v : new Set(v).add(s)));
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (date !== today) qs.set("date", date);
    if (section !== "day") qs.set("section", section);
    const next = qs.toString();
    if (next !== window.location.search.replace(/^\?/, "")) window.history.replaceState(null, "", next ? `/journal?${next}` : "/journal");
  }, [date, section, today]);

  // Links into the page: ?new=1 (today's entry), ?date=…, ?section=…, and
  // the journal's old ?tab=topics|analysis, which now live on History.
  useEffect(() => {
    const p = new URLSearchParams(paramKey);
    const fresh = p.get("new") === "1";
    changeDate(fresh ? toISODate(new Date()) : parseCaptureDate(p.get("date"), toISODate(new Date())));
    selectSection(fresh ? "day" : parseSection(p.get("section")));
  }, [paramKey, changeDate, selectSection]);

  /* ── the Habit Engine's view of the day, unsaved edits included ─ */

  const deferredDraft = useDeferredValue(journalEd.draft);
  const { blocks, completedTopics, revisionSessions } = deferredDraft;
  const previewJournal = useMemo(() => {
    if (!journalEd.dirty) return journal;
    const p = prepareJournalEntry({ ...deferredDraft, date }, today);
    return p.entry ? [...journal.filter((j) => j.date !== date), p.entry].sort(byDate) : journal;
    // Only what the engine reads from an entry rebuilds the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journal, journalEd.dirty, blocks, completedTopics, revisionSessions, date, today]);
  const previewLife = useMemo(() => {
    if (!lifeEd.dirty) return lifeLog;
    const rest = lifeLog.filter((l) => l.date !== date);
    return lifeEd.entry ? [...rest, lifeEd.entry].sort(byDate) : rest;
  }, [lifeLog, lifeEd.dirty, lifeEd.entry, date]);
  const habitsPreview = useMemo(() => previewHabits(habits, habitDrafts, date), [habits, habitDrafts, date]);
  const weekStart = profile.weekStart;
  const ctx = useMemo(
    () => habitContext({ journal: previewJournal, lifeLog: previewLife, revisions, plans, subjects, profile: { weekStart } }, date),
    [previewJournal, previewLife, revisions, plans, subjects, weekStart, date],
  );
  const habitList = useMemo(() => todayHabits(habitsPreview, ctx), [habitsPreview, ctx]);
  const habitSummary = useMemo(() => summarizeToday(habitList), [habitList]);

  /* ── how far the day has got, from the records ──────────────── */

  const tracked = useMemo(() => trackedFields(profile.lifeFields, lifeLog), [profile.lifeFields, lifeLog]);
  const views = useMemo<Record<CaptureSection, SectionView>>(() => {
    const failed = (s: CaptureSection) => Boolean(outcome?.results[s] && !outcome.results[s]!.ok);
    const lead = (s: CaptureSection, text: string) => (failed(s) && dirty[s] ? `Not saved · ${text}` : dirty[s] ? `Unsaved · ${text}` : text);
    const editing = (s: CaptureSection): SectionState | null => (failed(s) && dirty[s] ? "error" : dirty[s] ? "unsaved" : null);

    const hours = savedEntry?.totalHours ? formatHours(savedEntry.totalHours) : null;
    const day: SectionView = {
      state: editing("day") ?? (savedEntry ? "complete" : "empty"),
      badge: dirty.day ? "Edited" : savedEntry ? (hours ?? "Saved") : "New",
      text: dirty.day ? lead("day", savedEntry ? "edited" : "new entry") : savedEntry ? (hours ? `Saved · ${hours}` : "Saved") : "Not started",
      done: Boolean(savedEntry) && !dirty.day,
    };

    const recorded = lifeRecorded(dirty.life ? lifeEd.entry : lifeEd.saved, tracked);
    const life: SectionView = {
      state: editing("life") ?? (lifeEd.saved ? "complete" : "empty"),
      badge: `${recorded}/${tracked.length}`,
      text: lead("life", `${recorded}/${tracked.length} recorded`),
      done: Boolean(lifeEd.saved) && !dirty.life,
    };

    const active = goals.filter((g) => g.status === "Active").length;
    const updated = goals.filter((g) => goalUpdatedOn(g, date)).length;
    const pending = new Set([...goalIdsChanged, ...linkDiff.map((g) => g.id)]).size;
    const goalsView: SectionView =
      !dirty.goals && !active && !updated
        ? { state: "na", badge: "–", text: "No active goals", done: null }
        : {
            state: editing("goals") ?? (updated ? "complete" : "empty"),
            badge: dirty.goals ? `${pending}` : `${updated}`,
            text: dirty.goals ? lead("goals", `${pending} to save`) : updated ? `${updated} updated` : "None updated",
            done: updated > 0 && !dirty.goals,
          };

    const { due, done } = habitSummary;
    const habit: SectionView = !due
      ? { state: editing("habit") ?? "na", badge: "–", text: lead("habit", "Nothing due"), done: null }
      : {
          state: editing("habit") ?? (done === due ? "complete" : done ? "progress" : "empty"),
          badge: `${done}/${due}`,
          text: lead("habit", `${done}/${due} done`),
          done: done === due && !dirty.habit,
        };
    return { day, life, goals: goalsView, habit };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, dirty.day, dirty.life, dirty.goals, dirty.habit, savedEntry, lifeEd.entry, lifeEd.saved, tracked, goals, date, goalIdsChanged, linkDiff, habitSummary]);

  const applicable = SECTIONS.filter((s) => views[s.id].done !== null).length;
  const captured = SECTIONS.filter((s) => views[s.id].done === true).length;

  /* ── Save All Changes ───────────────────────────────────────── */

  const saveAll = useCallback(async () => {
    if (savingRef.current || !anyDirty) return;
    if (journalEd.uploading) {
      toast({ title: "Files are still uploading", description: "Save once they've finished.", tone: "error" });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const s = () => useChronicle.getState();
    const results: SaveOutcome["results"] = {};
    const goalErrors: Record<string, string> = {};
    let earned: JournalCelebration | null = null;
    let journalSaved = false;

    try {
      // 1. The journal entry, with its goal links, files, topics and revisions.
      if (dirty.day) {
        try {
          const prepared = prepareJournalEntry({ ...journalEd.draft, date }, today);
          if (!prepared.entry) throw new Error(prepared.error);
          const latest = s().journal.find((j) => j.date === date) ?? null;
          if (!sameRecord(latest, baseRef.current.journal)) {
            const ok = await confirm({
              title: "This day's entry changed elsewhere",
              description: `${formatDate(date)} was updated on another device or tab after you started. Saving replaces that version with yours.`,
              confirmLabel: "Save mine",
              cancelLabel: "Not now",
            });
            if (!ok) throw new Error("Not saved, so the other version stays. Review the entry and save again.");
          }
          earned = commitJournalEntry(journalEd, prepared.entry, { isEdit: Boolean(latest) }).celebration;
          journalSaved = true;
          results.day = { ok: true };
        } catch (e) {
          results.day = { ok: false, message: message(e) };
          journalEd.setError(message(e));
        }
      }

      // 2. The life entry. It mirrors bedtime and wake-up onto the journal, so it goes second.
      if (dirty.life) {
        try {
          lifeEd.setTouched(true);
          const latest = s().lifeLog.find((l) => l.date === date) ?? null;
          const { entry, errors } = entryFromDraft(lifeEd.draft, today, latest ?? undefined);
          if (Object.keys(errors).length) throw new Error("Some readings need fixing. They're marked in the form.");
          if (!sameRecord(latest, baseRef.current.life)) {
            const ok = await confirm({
              title: "This day's readings changed elsewhere",
              description: `${formatDate(date)} was updated on another device or tab after you started. Saving replaces those readings with yours.`,
              confirmLabel: "Save mine",
              cancelLabel: "Not now",
            });
            if (!ok) throw new Error("Not saved, so the other readings stay. Review them and save again.");
          }
          if (entry) s().upsertLifeEntry(entry);
          else if (latest) s().deleteLifeEntry(date);
          results.life = { ok: true };
        } catch (e) {
          results.life = { ok: false, message: message(e) };
        }
      }

      // 3. Goals: each update goes to the original goal.
      if (dirty.goals) {
        const done: string[] = [];
        for (const id of goalIdsChanged) {
          try {
            applyGoalDraft(s, id, goalDrafts[id], date);
            done.push(id);
          } catch (e) {
            goalErrors[id] = message(e);
          }
        }
        if (done.length)
          setGoalDrafts((d) => {
            const next = { ...d };
            for (const id of done) delete next[id];
            return next;
          });
        if (linkDiff.length && !journalSaved) {
          if (s().journal.some((j) => j.date === date)) applyGoalLinks(s, journalEd.goalIds, date);
          else goalErrors.__links = "Goal links need a Day Update for this day. Save the Day Update and they'll be linked.";
        }
        const failures = Object.keys(goalErrors).length;
        results.goals = failures ? { ok: false, message: `${failures === 1 ? "One update" : `${failures} updates`} didn't save.` } : { ok: true };
      }

      // 4. Manual check-ins. Connected habits read the records saved above.
      if (dirty.habit) {
        try {
          applyHabitDrafts(s, habitDrafts, date);
          setHabitDrafts({});
          results.habit = { ok: true };
        } catch (e) {
          results.habit = { ok: false, message: message(e) };
        }
      }

      // Saved sections now show what was saved; failed ones keep their edits.
      const after = s();
      if (results.day?.ok) {
        const fresh = after.journal.find((j) => j.date === date) ?? null;
        baseRef.current.journal = fresh;
        resetJournal(fresh ?? emptyEntry(date));
      }
      if (results.life?.ok) {
        baseRef.current.life = after.lifeLog.find((l) => l.date === date) ?? null;
        loadLife(date);
      }

      const list = Object.entries(results) as [CaptureSection, SectionResult][];
      const okCount = list.filter(([, r]) => r.ok).length;
      let cloud: SaveOutcome["cloud"] = null;
      setOutcome({ at: new Date(), results, goalErrors, cloud });
      if (okCount) {
        cloud = mode === "cloud" ? ((await flush(10_000)) ? "synced" : "pending") : "device";
        setOutcome({ at: new Date(), results, goalErrors, cloud });
      }

      const failedNames = list.filter(([, r]) => !r.ok).map(([k]) => LABEL[k]);
      if (!failedNames.length) {
        const moved = movedSummary(habitsMovedOn(after.habits, habitContext(after, today), date, ["journal", "life", "revision"]));
        toast({
          title: `${formatDate(date)} saved`,
          description: [list.map(([k]) => LABEL[k]).join(", ") + " saved.", moved].filter(Boolean).join(" "),
        });
      } else {
        toast({
          title: okCount ? "Some changes didn't save" : "Nothing was saved",
          description: `${failedNames.join(", ")} didn't save. Your edits are still here to fix and save again.`,
          tone: "error",
        });
      }
      if (earned) onCelebrate(earned);
      if (!failedNames.length) {
        // Everything is saved: the form closes, as every entry form does.
        skipPersist.current = true;
        writeDraft(accountId, date, null);
        onClose();
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [anyDirty, journalEd, lifeEd, dirty.day, dirty.life, dirty.goals, dirty.habit, date, today, confirm, goalIdsChanged, goalDrafts, linkDiff, habitDrafts, resetJournal, loadLife, mode, flush, toast, accountId, onCelebrate, onClose]);

  const discardAll = useCallback(async () => {
    const ok = await confirm({
      title: `Discard unsaved changes for ${formatDate(date)}?`,
      description: "Every tab goes back to what's saved. Files uploaded in this edit are removed.",
      confirmLabel: "Discard",
      tone: "danger",
    });
    if (!ok) return;
    journalEd.discardUploads(new Set());
    writeDraft(accountId, date, null);
    loadDay(date, false);
  }, [confirm, date, journalEd, accountId, loadDay]);

  // Ctrl/⌘ + S saves everything, as in any editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveAll]);

  const onGoalDraft = useCallback(
    (id: string, next: GoalDraft | null) =>
      setGoalDrafts((d) => {
        const copy = { ...d };
        if (next) copy[id] = next;
        else delete copy[id];
        return copy;
      }),
    [],
  );
  const onHabitToggle = useCallback((id: string, want: boolean) => {
    const isSaved = useChronicle.getState().habits.find((h) => h.id === id)?.log?.[dateRef.current] === true;
    setHabitDrafts((d) => {
      const copy = { ...d };
      if (want === isSaved) delete copy[id];
      else copy[id] = want;
      return copy;
    });
  }, []);

  const unsavedNames = SECTIONS.filter((s) => dirty[s.id]).map((s) => s.label);
  const failures = outcome ? (Object.entries(outcome.results) as [CaptureSection, SectionResult][]).filter(([, r]) => !r.ok) : [];

  const panel = (id: CaptureSection) => {
    switch (id) {
      case "day":
        return (
          <div className="space-y-4">
            {journalEd.error && <Notice tone="danger">{journalEd.error}</Notice>}
            {journalEd.uploading && <Notice>Waiting for files to finish uploading…</Notice>}
            <JournalFields editor={journalEd} isEdit={Boolean(savedEntry)} variant="page" />
          </div>
        );
      case "life":
        return (
          <div className="space-y-4">
            <PanelIntro
              title={lifeEd.saved ? "The day's readings" : "Log the day"}
              text={`${lifeEd.saved ? `Showing what's saved for ${formatDate(date)}.` : `Nothing saved for ${formatDate(date)} yet.`} Empty boxes are saved as not recorded, never as zero.`}
              link={{ href: "/wellbeing", label: "Life Dashboard" }}
            />
            {lifeEd.touched && !lifeEd.valid && <Notice tone="danger">Fix the highlighted fields to save.</Notice>}
            {outcome?.results.life && !outcome.results.life.ok && dirty.life && lifeEd.valid && (
              <Notice tone="danger">{outcome.results.life.message}</Notice>
            )}
            <LifeFields editor={lifeEd} onChooseFields={() => setFieldsOpen(true)} variant="page" />
          </div>
        );
      case "goals":
        return (
          <GoalsTab
            date={date}
            drafts={goalDrafts}
            onDraft={onGoalDraft}
            links={journalEd.goalIds}
            onLinks={setGoalIds}
            canLink={Boolean(savedEntry) || journalEd.dirty}
            errors={outcome?.goalErrors ?? {}}
          />
        );
      case "habit":
        return (
          <HabitTab
            date={date}
            list={habitList}
            summary={habitSummary}
            saved={habits}
            drafts={habitDrafts}
            onToggle={onHabitToggle}
            hasHabits={habits.some((h) => !h.archived)}
            previewing={journalEd.dirty || lifeEd.dirty}
          />
        );
    }
  };

  const requestClose = useCallback(async () => {
    if (savingRef.current) return;
    if (anyDirty || journalEd.uploading) {
      const ok = await confirm({
        title: "Close without saving?",
        description: journalEd.uploading
          ? "Files are still uploading. Closing stops them; everything else stays as a draft."
          : `Your changes for ${formatDate(date)} stay as a draft and come back when you open Daily Capture again.`,
        confirmLabel: "Close",
        cancelLabel: "Keep editing",
      });
      if (!ok) return;
      persistRef.current();
    }
    onClose();
  }, [anyDirty, journalEd.uploading, confirm, date, onClose]);

  const footer = (
    <>
      <p className="mr-auto hidden min-w-0 truncate text-[0.76rem] text-paper/55 sm:block">
        {saving ? "Saving…" : anyDirty ? `Unsaved: ${unsavedNames.join(", ")}` : "Ctrl + S saves all tabs"}
      </p>
      {anyDirty && (
        <Button variant="ghost" onClick={() => void discardAll()} disabled={saving} className="hidden sm:inline-flex">
          Discard
        </Button>
      )}
      <Button variant="ghost" onClick={() => void requestClose()} disabled={saving}>
        Close
      </Button>
      <SaveAllButton saving={saving} disabled={!anyDirty} onClick={() => void saveAll()} />
    </>
  );

  return (
    <>
      <TrackedFieldsDialog open={fieldsOpen} onClose={() => setFieldsOpen(false)} />
      <Modal
        open
        onClose={() => void requestClose()}
        title="Daily Capture"
        description={`${longDate(date)}${date === today ? " · Today" : ""}`}
        className="sm:max-w-5xl"
        footer={footer}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-line p-1.5">
            <WeekStrip date={date} today={today} logged={loggedDays} waiting={waitingDays} onPick={changeDate} />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-line px-2 pb-0.5 pt-2">
              <SaveStatus saving={saving} anyDirty={anyDirty} outcome={outcome} failures={failures} mode={mode} sync={sync} onRetry={() => (anyDirty ? void saveAll() : syncNow())} />
              <div className="flex items-center gap-2.5" role="group" aria-label={date === today ? "Today's progress" : "Progress for this day"}>
                <div className="flex gap-1" aria-hidden>
                  {SECTIONS.map((s) => (
                    <span key={s.id} className={cn("h-1.5 w-6 rounded-full transition-colors duration-300", DOT[views[s.id].state])} />
                  ))}
                </div>
                <p className="text-[0.76rem] text-paper/60">
                  <span className="tabular font-semibold text-paper">
                    {captured} of {applicable}
                  </span>{" "}
                  captured
                </p>
              </div>
            </div>
          </div>

          {restored && anyDirty && (
            <Notice
              action={
                <button type="button" onClick={() => void discardAll()} className="font-semibold text-accent hover:underline">
                  Discard them
                </button>
              }
            >
              Unsaved changes you made earlier for this day are back. Save them when you&rsquo;re ready.
            </Notice>
          )}
          {otherDrafts.length > 0 && (
            <Notice>
              Unsaved changes are also waiting on{" "}
              {otherDrafts.slice(0, 3).map((d, i) => (
                <span key={d}>
                  {i > 0 && ", "}
                  <button type="button" onClick={() => changeDate(d)} className="font-semibold text-accent hover:underline">
                    {formatDate(d)}
                  </button>
                </span>
              ))}
              {otherDrafts.length > 3 && ` and ${otherDrafts.length - 3} more`}.
            </Notice>
          )}

          {/* The tabs stay in view while the form scrolls. */}
          <div className="sticky top-0 z-10 -mx-5 bg-card px-5 pb-2 pt-1">
            <CaptureTabs section={section} onSelect={selectSection} views={views} />
          </div>

          <div>
            {SECTIONS.map((s) =>
              visited.has(s.id) ? (
                <div key={s.id} role="tabpanel" id={`capture-panel-${s.id}`} aria-labelledby={`capture-tab-${s.id}`} hidden={section !== s.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={section === s.id ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {panel(s.id)}
                  </motion.div>
                </div>
              ) : null,
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

const SaveAllButton = forwardRef<
  HTMLButtonElement,
  { saving: boolean; disabled: boolean; onClick: () => void; className?: string; size?: "sm" | "md" }
>(function SaveAllButton({ saving, disabled, onClick, className, size = "md" }, ref) {
  return (
    <Button ref={ref} size={size} onClick={onClick} disabled={disabled || saving} aria-busy={saving} className={className}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
      {saving ? "Saving…" : "Save All Changes"}
    </Button>
  );
});

function SaveStatus({
  saving,
  anyDirty,
  outcome,
  failures,
  mode,
  sync,
  onRetry,
}: {
  saving: boolean;
  anyDirty: boolean;
  outcome: SaveOutcome | null;
  failures: [CaptureSection, SectionResult][];
  mode: string;
  sync: ReturnType<typeof useSyncStatus>["sync"];
  onRetry: () => void;
}) {
  let tone = "text-paper/60";
  let icon: React.ReactNode = <Check className="h-3.5 w-3.5" aria-hidden />;
  let text: React.ReactNode;
  let retry = false;

  if (saving) {
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />;
    text = outcome ? "Saving to your account…" : "Saving…";
  } else if (failures.length) {
    tone = "text-danger";
    icon = <AlertTriangle className="h-3.5 w-3.5" aria-hidden />;
    const all = failures.length === Object.keys(outcome?.results ?? {}).length;
    text = `${all ? "Couldn't save" : "Partly saved"}: ${failures.map(([k]) => LABEL[k]).join(", ")} ${failures.length === 1 ? "needs" : "need"} another look`;
    retry = anyDirty;
  } else if (anyDirty) {
    tone = "text-accent";
    icon = <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />;
    text = "Unsaved changes";
  } else if (outcome) {
    const time = format(outcome.at, "HH:mm");
    const offline = sync.status === "offline" || sync.status === "error";
    if (mode !== "cloud") text = `Saved at ${time} on this device`;
    else if (outcome.cloud === "synced" && !sync.pending) text = `Saved at ${time} · synced to your account`;
    else if (offline) {
      tone = "text-warning";
      icon = <CloudOff className="h-3.5 w-3.5" aria-hidden />;
      text = `Saved at ${time} on this device · syncs when you're back online`;
      retry = true;
    } else {
      icon = <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />;
      text = `Saved at ${time} · syncing to your account…`;
    }
    if (tone === "text-paper/60" && !offline) tone = "text-positive";
  } else {
    text = "Everything's saved";
  }

  return (
    <p className={cn("flex min-h-[1.25rem] flex-wrap items-center gap-1.5 text-[0.76rem] font-medium", tone)} role="status" aria-live="polite">
      {icon}
      <span>{text}</span>
      {retry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
          <RotateCcw className="h-3 w-3" aria-hidden /> Retry
        </button>
      )}
    </p>
  );
}

/** Seven days around the one shown, each marked when it's logged or has unsaved edits. */
function WeekStrip({
  date,
  today,
  logged,
  waiting,
  onPick,
}: {
  date: ISODate;
  today: ISODate;
  logged: Set<ISODate>;
  waiting: Set<ISODate>;
  onPick: (d: ISODate) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const end = shiftDay(date, 3) < today ? shiftDay(date, 3) : today;
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(end, i - 6));
  const arrow = "grid h-10 w-9 shrink-0 place-items-center rounded-xl text-paper/60 hover:bg-paper/[0.05] hover:text-paper disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onPick(shiftDay(date, -1))} aria-label="Previous day" className={arrow}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
        {days.map((d) => {
          const on = d === date;
          const day = new Date(`${d}T00:00:00`);
          const state = waiting.has(d) ? ", unsaved changes" : logged.has(d) ? ", logged" : "";
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-pressed={on}
              aria-label={`${longDate(d)}${state}`}
              className={cn(
                "flex min-w-0 flex-col items-center gap-0.5 rounded-2xl py-2 transition-colors duration-200",
                on ? "bg-accent text-accent-fg shadow-accent" : "text-paper/75 hover:bg-paper/[0.05] hover:text-paper",
              )}
            >
              <span className={cn("text-[0.6rem] font-semibold uppercase tracking-[0.08em]", on ? "opacity-85" : "text-paper/45")}>
                {d === today ? (
                  <>
                    <span className="sm:hidden">{format(day, "EEE")}</span>
                    <span className="hidden sm:inline">Today</span>
                  </>
                ) : (
                  format(day, "EEE")
                )}
              </span>
              <span className="tabular text-[1.02rem] font-semibold leading-tight">{format(day, "d")}</span>
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  waiting.has(d) ? "bg-warning" : logged.has(d) ? (on ? "bg-accent-fg" : "bg-positive") : "bg-transparent",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => onPick(shiftDay(date, 1))} disabled={date >= today} aria-label="Next day" className={arrow}>
        <ChevronRight className="h-4 w-4" />
      </button>
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="Pick any day"
          onClick={() => {
            try {
              picker.current?.showPicker();
            } catch {
              picker.current?.focus();
            }
          }}
          className="grid h-10 w-10 place-items-center rounded-xl border border-line text-paper/70 hover:text-paper"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        <input
          ref={picker}
          type="date"
          value={date}
          max={today}
          onChange={(e) => onPick(parseCaptureDate(e.target.value, today))}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      </div>
    </div>
  );
}

function CaptureTabs({
  section,
  onSelect,
  views,
}: {
  section: CaptureSection;
  onSelect: (s: CaptureSection) => void;
  views: Record<CaptureSection, SectionView>;
}) {
  const refs = useRef<Partial<Record<CaptureSection, HTMLButtonElement | null>>>({});

  function onKeyDown(e: React.KeyboardEvent) {
    const i = SECTIONS.findIndex((s) => s.id === section);
    const n =
      e.key === "ArrowRight" ? (i + 1) % SECTIONS.length : e.key === "ArrowLeft" ? (i + SECTIONS.length - 1) % SECTIONS.length : e.key === "Home" ? 0 : e.key === "End" ? SECTIONS.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault();
    onSelect(SECTIONS[n].id);
    refs.current[SECTIONS[n].id]?.focus();
  }

  return (
    <div role="tablist" aria-label="Daily Capture sections" onKeyDown={onKeyDown} className="lg-track grid grid-cols-4 gap-1 rounded-2xl border border-line p-1.5">
      {SECTIONS.map((s) => {
        const active = section === s.id;
        const v = views[s.id];
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            type="button"
            role="tab"
            id={`capture-tab-${s.id}`}
            aria-selected={active}
            aria-controls={`capture-panel-${s.id}`}
            tabIndex={active ? 0 : -1}
            title={v.text}
            onClick={() => onSelect(s.id)}
            className={cn(
              "relative flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 sm:flex-row sm:gap-2.5 sm:px-3.5 sm:py-3",
              active ? "text-paper" : "text-paper/60 hover:text-paper",
            )}
          >
            {active && (
              <motion.span
                layoutId="capture-tab"
                className="absolute inset-0 rounded-xl border border-line bg-card shadow-soft"
                transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                aria-hidden
              />
            )}
            <Icon className={cn("relative h-[1.1rem] w-[1.1rem] shrink-0", active && "text-accent")} aria-hidden />
            <span className="relative min-w-0 truncate text-[0.74rem] font-semibold sm:text-[0.88rem]">{s.label}</span>
            <span className={cn("tabular relative rounded-full px-1.5 py-px text-[0.62rem] font-semibold sm:ml-auto sm:px-2 sm:text-[0.68rem]", BADGE[v.state])}>
              {v.badge}
            </span>
            <span className="sr-only">, {v.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function PanelIntro({ title, text, link }: { title: string; text: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 px-1">
      <div className="min-w-0">
        <h2 className="text-[1.02rem] font-semibold tracking-snugg text-paper">{title}</h2>
        <p className="mt-0.5 text-[0.8rem] text-paper/60">{text}</p>
      </div>
      {link && (
        <Link href={link.href} className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-accent hover:underline">
          {link.label} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function Notice({ children, tone, action }: { children: React.ReactNode; tone?: "danger"; action?: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border px-3.5 py-2.5 text-[0.78rem]",
        tone === "danger" ? "border-danger/35 bg-danger/10 text-paper/85" : "border-line bg-paper/[0.03] text-paper/70",
      )}
      role={tone === "danger" ? "alert" : undefined}
    >
      {tone === "danger" && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />}
      <p className="min-w-0 flex-1">{children}</p>
      {action}
    </div>
  );
}
