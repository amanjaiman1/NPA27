import type { ISODate, JournalEntry, LifeEntry } from "@/lib/types";
import type { LifeDraft } from "@/lib/life-entry";
import type { GoalDraft, HabitDrafts } from "@/lib/daily-capture";
import type { JournalDraftSnapshot } from "@/components/journal/journal-editor";

/**
 * Unsaved Daily Capture edits, kept so a reload, a tap on another page or a
 * switch to another day never loses them. Per browser tab (sessionStorage),
 * per account and per day: `upsc-capture-draft:<account id>:<date>`. Only
 * drafts live here; the records themselves are only ever written by saving.
 */
export interface CaptureDraft {
  v: 1;
  /** The saved records the edits started from, so a change made elsewhere meanwhile is noticed at save. */
  base?: { journal: JournalEntry | null; life: LifeEntry | null };
  journal?: JournalDraftSnapshot;
  life?: LifeDraft;
  goals?: Record<string, GoalDraft>;
  /** Goal ids the day's journal entry should be linked to. */
  links?: string[];
  habits?: HabitDrafts;
  at: string;
}

const PREFIX = "upsc-capture-draft:";
const key = (accountId: string, date: ISODate) => `${PREFIX}${accountId}:${date}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readDraft(accountId: string, date: ISODate): CaptureDraft | null {
  try {
    const raw = storage()?.getItem(key(accountId, date));
    if (!raw) return null;
    const d = JSON.parse(raw) as CaptureDraft;
    return d && d.v === 1 ? d : null;
  } catch {
    return null;
  }
}

export function writeDraft(accountId: string, date: ISODate, draft: Omit<CaptureDraft, "v" | "at"> | null): void {
  const s = storage();
  if (!s) return;
  try {
    if (!draft) s.removeItem(key(accountId, date));
    else s.setItem(key(accountId, date), JSON.stringify({ ...draft, v: 1, at: new Date().toISOString() }));
  } catch {
    // Storage full or blocked: the edit is still on screen, and leaving warns.
  }
}

/** Days with unsaved edits for this account, newest first. */
export function draftDates(accountId: string): ISODate[] {
  const s = storage();
  if (!s) return [];
  const prefix = `${PREFIX}${accountId}:`;
  const out: ISODate[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(prefix)) out.push(k.slice(prefix.length));
  }
  return out.sort().reverse();
}
