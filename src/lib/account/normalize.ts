import type { JournalEntry, LifeEntry, Profile, Subject, ThemeMode } from "../types";
import { toISODate } from "../utils";
import { isThemeMode, legacyThemeMode, themeModeFromSurface } from "../theme";
import { upgradeEntryTopics } from "../topics";
import { normalizePlans } from "../roadmap";

/**
 * Brings a profile saved by an older version up to the current shape.
 *
 * An account that already has a named profile was set up before first-run
 * setup existed, so it is marked as set up instead of being sent through
 * setup again. And `useRoadmap`, the switch for the retired fixed CSE 2027
 * plan, is removed: the Roadmap is now everyone's own and has no switch.
 * Idempotent — running it twice changes nothing the second time.
 */
export function normalizeProfile(profile: Profile): Profile {
  let next = profile;
  if ("useRoadmap" in next) {
    next = { ...next };
    delete (next as Profile & { useRoadmap?: unknown }).useRoadmap;
  }
  if (next.onboardedAt || !next.name?.trim()) return next;
  return { ...next, onboardedAt: next.startDate || toISODate(new Date()) };
}

/* ── data written by older versions ──────────────────────────────── */

/**
 * The journal entry the morning check-in used to create for a day you hadn't
 * written yet: no study, nothing written, every rating at the default 3. It
 * carried only the wake-up and bedtime, which the Life Dashboard holds too.
 *
 * Those placeholders did real damage. Saving your actual entry later counted
 * as editing an existing day, so the day was never marked accomplished, and
 * the 3/5 moods it invented fed every mood average.
 */
export function isMorningStub(e: JournalEntry): boolean {
  const empty = (v: unknown[] | undefined) => !v || v.length === 0;
  return (
    empty(e.blocks) &&
    !e.totalHours &&
    empty(e.completedTopics) &&
    empty(e.topicsCompleted) &&
    empty(e.booksStudied) &&
    empty(e.revisionSessions) &&
    empty(e.mocksAttempted) &&
    empty(e.currentAffairs) &&
    empty(e.wins) &&
    empty(e.failures) &&
    empty(e.lessons) &&
    empty(e.tags) &&
    empty(e.fileIds) &&
    empty(e.attachments) &&
    !e.highlights?.trim() &&
    !e.reflection?.trim() &&
    e.mood === 3 &&
    e.energy === 3 &&
    (e.motivation ?? 3) === 3 &&
    e.focus === 3 &&
    e.tasksPlanned == null &&
    e.tasksDone == null
  );
}

/**
 * The same check-in also created a Life Dashboard day with invented readings:
 * sleep quality 3, 2 L of water, 120 minutes of screen time and zero for every
 * activity. Only that exact combination is treated as invented; anything you
 * changed is kept as you entered it.
 */
const STUB_LIFE_DEFAULTS: Partial<Record<keyof LifeEntry, number>> = {
  sleepQuality: 3,
  walkKm: 0,
  runKm: 0,
  exerciseMinutes: 0,
  waterLiters: 2,
  meditationMin: 0,
  screenTimeMin: 120,
  deepWorkHours: 0,
};

export function hasInventedLifeReadings(l: LifeEntry): boolean {
  return (
    l.weightKg === undefined &&
    !l.exerciseType &&
    (Object.keys(STUB_LIFE_DEFAULTS) as (keyof LifeEntry)[]).every((k) => l[k] === STUB_LIFE_DEFAULTS[k])
  );
}

function stripInventedLife(l: LifeEntry): LifeEntry {
  const next = { ...l };
  for (const k of Object.keys(STUB_LIFE_DEFAULTS) as (keyof LifeEntry)[]) delete next[k];
  return next;
}

/**
 * Cleans what older versions wrote, without touching anything a person
 * entered. Idempotent and deterministic, so two devices upgrading the same
 * account independently arrive at the same data and their syncs agree.
 *
 *  - Morning-stub journal days are removed; their wake-up and bedtime move to
 *    the Life Dashboard day if it lacks them.
 *  - Invented Life Dashboard readings become "not recorded".
 *  - Free-text completed topics are linked to the syllabus where the name is
 *    an unambiguous match.
 *  - Two journal days that ended up with the same id (moving an entry's date
 *    used to copy it) get distinct ids, so deleting one can't delete both.
 */
export function upgradeRecords(
  journal: JournalEntry[],
  lifeLog: LifeEntry[],
  subjects: Subject[],
): { journal: JournalEntry[]; lifeLog: LifeEntry[]; changed: boolean } {
  let changed = false;
  const lifeByDate = new Map(lifeLog.map((l) => [l.date, l] as const));
  const nextLife = new Map(lifeByDate);

  const keptJournal: JournalEntry[] = [];
  const seenIds = new Set<string>();
  for (const raw of journal) {
    if (isMorningStub(raw)) {
      changed = true;
      if (raw.wakeTime || raw.sleepTime) {
        const life = nextLife.get(raw.date);
        if (!life) {
          nextLife.set(raw.date, {
            id: `life-${raw.date}`,
            date: raw.date,
            ...(raw.sleepTime ? { bedtime: raw.sleepTime } : {}),
            ...(raw.wakeTime ? { wakeTime: raw.wakeTime } : {}),
          });
        } else if ((!life.bedtime && raw.sleepTime) || (!life.wakeTime && raw.wakeTime)) {
          nextLife.set(raw.date, {
            ...life,
            bedtime: life.bedtime || raw.sleepTime || undefined,
            wakeTime: life.wakeTime || raw.wakeTime || undefined,
          });
        }
      }
      continue;
    }
    let e = upgradeEntryTopics(raw, subjects);
    if (seenIds.has(e.id)) e = { ...e, id: `${e.id}_${e.date}` };
    seenIds.add(e.id);
    if (e !== raw) changed = true;
    keptJournal.push(e);
  }

  for (const [date, l] of nextLife) {
    if (hasInventedLifeReadings(l)) {
      nextLife.set(date, stripInventedLife(l));
      changed = true;
    }
  }
  if (!changed) return { journal, lifeLog, changed };
  const life = [...nextLife.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { journal: keptJournal, lifeLog: life, changed };
}

type SnapshotLike = {
  profile?: Profile;
  wallpaper?: unknown;
  wallpaperDim?: unknown;
  palette?: unknown;
  material?: unknown;
  themeMode?: ThemeMode;
  surface?: unknown;
  reduceTransparency?: boolean;
  journal?: JournalEntry[];
  lifeLog?: LifeEntry[];
  subjects?: Subject[];
  plans?: unknown;
};

/**
 * Applies every normalisation to a whole or partial snapshot — a persisted
 * store on load, or a snapshot pulled from the cloud that a device on an older
 * version wrote.
 */
export function normalizeSnapshot<T extends SnapshotLike>(snapshot: T): T {
  let next: T = snapshot;
  // Retired appearance choices: wallpapers, colour palettes and the Liquid
  // Glass material. A device on an older version can still send them; they
  // are dropped and nothing else changes.
  if ("wallpaper" in next || "wallpaperDim" in next || "palette" in next || "material" in next) {
    next = { ...next };
    delete next.wallpaper;
    delete next.wallpaperDim;
    delete next.palette;
    delete next.material;
  }
  if (next.profile) {
    const profile = normalizeProfile(next.profile);
    if (profile !== next.profile) next = { ...next, profile };
  }
  // Two themes, Light and Dark. Older devices may send Blue Glass or Auto
  // (see `legacyThemeMode`), or, from before that, one of five surfaces.
  if (next.themeMode !== undefined && !isThemeMode(next.themeMode)) {
    next = { ...next, themeMode: legacyThemeMode(next.themeMode) };
  } else if (next.themeMode === undefined && next.surface !== undefined) {
    next = { ...next, themeMode: themeModeFromSurface(next.surface) };
  }
  if ("surface" in next) {
    next = { ...next };
    delete next.surface;
  }
  if (next.reduceTransparency !== undefined && typeof next.reduceTransparency !== "boolean") {
    next = { ...next, reduceTransparency: false };
  }
  if (Array.isArray(next.journal) && Array.isArray(next.lifeLog)) {
    const up = upgradeRecords(next.journal, next.lifeLog, next.subjects ?? []);
    if (up.changed) next = { ...next, journal: up.journal, lifeLog: up.lifeLog };
  }
  // Plans from another device, an older version or a backup, made consistent.
  if (next.plans !== undefined) next = { ...next, plans: normalizePlans(next.plans) };
  return next;
}
