import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./memory-storage";
import { setActiveAccount, setStorageBackend } from "@/lib/account/scope";
import { useChronicle, blankChronicleState } from "@/lib/store";
import type { JournalEntry, LifeEntry } from "@/lib/types";
import {
  MAX_SLEEP_HOURS,
  bedDateFor,
  bedtimeNowNight,
  checkSleep,
  clockDelta,
  formatClock,
  formatDuration,
  meanClock,
  nightOf,
  parseClock,
  promptStartMinutes,
  sleepMinutes,
  sleepPromptKey,
  sleepStats,
  targetMinutes,
  usualClock,
} from "@/lib/sleep";
import { buildLifeReport } from "@/lib/life";

const D = "2026-11-17";

test("overnight sleep counts across midnight and onto the right calendar day", () => {
  assert.equal(sleepMinutes(D, "23:30", "07:00"), 450, "11:30 PM to 7:00 AM is 7h 30m");
  assert.equal(sleepMinutes(D, "23:00", "06:30"), 450);
  assert.equal(bedDateFor(D, "23:30", "07:00"), "2026-11-16", "the bedtime was the night before");
  assert.equal(sleepMinutes(D, "00:30", "07:00"), 390, "after midnight: the same day");
  assert.equal(bedDateFor(D, "00:30", "07:00"), D);
  assert.equal(sleepMinutes(D, "14:00", "15:30"), 90, "a daytime nap");
  assert.equal(sleepMinutes(D, "07:00", "07:00"), null, "no time asleep");
  assert.equal(sleepMinutes(D, "23:00", undefined), null, "missing wake-up");
  assert.equal(sleepMinutes(D, "25:00", "07:00"), null, "not a time");
});

test("a night across a clock change counts the hours that really passed", () => {
  const prev = process.env.TZ;
  // Not every runtime can change zone mid-process; only assert when it took.
  process.env.TZ = "Europe/London";
  const shifted = new Date(2026, 9, 25, 12).getTimezoneOffset() !== new Date(2026, 9, 24, 12).getTimezoneOffset();
  if (shifted) {
    // Clocks went back an hour at 02:00 on 25 Oct 2026: 23:00 to 07:00 was nine hours.
    assert.equal(sleepMinutes("2026-10-25", "23:00", "07:00"), 540);
  }
  process.env.TZ = prev;
});

test("impossible and unusual nights are caught before saving", () => {
  assert.deepEqual(
    { ok: checkSleep(D, undefined, "07:00").ok, reason: (checkSleep(D, undefined, "07:00") as { reason: string }).reason },
    { ok: false, reason: "missing" },
  );
  const same = checkSleep(D, "07:00", "07:00");
  assert.equal(same.ok, false);
  // 7 AM to 11 PM on the clock: AM and PM swapped. Sixteen hours is possible but long.
  const long = checkSleep(D, "07:00", "23:00");
  assert.equal(long.ok && long.level, "long");
  // A bedtime of 06:00 with a wake-up of 05:30 is 23h 30m: refused.
  const tooLong = checkSleep(D, "06:00", "05:30");
  assert.equal(tooLong.ok, false);
  assert.match((tooLong as { message: string }).message, /AM and PM/);
  const nap = checkSleep(D, "14:00", "15:00");
  assert.equal(nap.ok && nap.level, "short");
  const fine = checkSleep(D, "23:00", "06:30");
  assert.equal(fine.ok && fine.level, "ok");
});

test("times are typed the way people write them", () => {
  const bed = (t: string) => parseClock(t, { format: "12h", context: "bed" });
  const wake = (t: string) => parseClock(t, { format: "12h", context: "wake" });
  assert.equal(bed("11"), "23:00", "a bedtime of 11 is at night");
  assert.equal(bed("1"), "01:00", "and 1 is after midnight");
  assert.equal(bed("12"), "00:00");
  assert.equal(wake("7"), "07:00");
  assert.equal(wake("6:30"), "06:30");
  assert.equal(parseClock("11:30 pm"), "23:30");
  assert.equal(parseClock("11.30p"), "23:30");
  assert.equal(parseClock("12am"), "00:00");
  assert.equal(parseClock("12 pm"), "12:00");
  assert.equal(parseClock("2330"), "23:30");
  assert.equal(parseClock("0645"), "06:45");
  assert.equal(parseClock("23:05", { format: "24h" }), "23:05");
  assert.equal(parseClock("7", { format: "24h", context: "bed" }), "07:00", "24-hour clocks are taken literally");
  for (const bad of ["", "25:00", "13pm", "7:75", "abc", "12345"]) assert.equal(parseClock(bad), null, bad);
});

test("times show on a 12- or 24-hour clock, and durations in hours and minutes", () => {
  assert.equal(formatClock("23:05", "12h"), "11:05 PM");
  assert.equal(formatClock("00:30", "12h"), "12:30 AM");
  assert.equal(formatClock("12:00", "12h"), "12:00 PM");
  assert.equal(formatClock("07:00", "24h"), "07:00");
  assert.equal(formatDuration(450), "7h 30m");
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(480), "8h");
});

test("average clock times wrap around midnight", () => {
  assert.equal(meanClock(["23:30", "00:30"]), "00:00", "not noon");
  assert.equal(meanClock(["22:00", "23:00", "00:00"]), "23:00");
  assert.equal(meanClock([undefined, "06:30"]), "06:30");
  assert.equal(meanClock([]), null);
});

const night = (date: string, extra: Partial<LifeEntry>): LifeEntry => ({ id: `life-${date}`, date, ...extra });

test("averages use recorded nights only, and leave out impossible ones", () => {
  const today = "2026-11-17";
  const log: LifeEntry[] = [
    night("2026-11-17", { sleepHours: 7, bedtime: "23:30", wakeTime: "06:30" }),
    night("2026-11-16", { sleepHours: 8, bedtime: "23:00", wakeTime: "07:00" }),
    night("2026-11-15", { waterLiters: 2 }), // no sleep that day: not a night of 0
    night("2026-11-14", { sleepHours: 30 }), // impossible: shown, not averaged
    night("2026-11-01", { sleepHours: 5 }), // outside the week
  ];
  const week = sleepStats(log, today, 7);
  assert.equal(week.nights, 2);
  assert.equal(week.avgHours, 7.5);
  assert.equal(week.excluded, 1);
  assert.equal(week.avgBedtime, "23:15");
  assert.equal(sleepStats(log, today, 30).nights, 3);
  assert.equal(nightOf(log[3])!.implausible, true);
  assert.equal(nightOf(log[2]), null, "a day with no sleep fields isn't a night");

  // The Life Dashboard report follows the same rule.
  const report = buildLifeReport({ journal: [], lifeLog: log, span: { from: "2026-11-11", to: today }, tracked: ["sleep"] });
  const sleep = report.metrics.find((m) => m.id === "sleep")!;
  assert.equal(sleep.value, 7.5);
  assert.equal(sleep.recorded, 2);
  assert.ok(MAX_SLEEP_HOURS < 30);
});

test("time asleep entered by hand is told apart from time in bed", () => {
  const n = nightOf(night(D, { bedtime: "23:00", wakeTime: "07:00", sleepHours: 7 }))!;
  assert.equal(n.timesMinutes, 480);
  assert.equal(n.manualHours, true);
  assert.equal(nightOf(night(D, { bedtime: "23:00", wakeTime: "07:00", sleepHours: 8 }))!.manualHours, false);
  assert.equal(nightOf(night(D, { bedtime: "23:00" }))!.pending, true, "a bedtime waiting for its wake-up");
});

test("your usual times need a few nights, and round to five minutes", () => {
  const log = [night("2026-11-15", { bedtime: "23:02" }), night("2026-11-16", { bedtime: "23:20" })];
  assert.equal(usualClock(log, "bedtime"), null, "two nights isn't usual yet");
  log.push(night("2026-11-17", { bedtime: "23:11" }));
  assert.equal(usualClock(log, "bedtime"), "23:10");
});

test("the morning check-in starts two hours before your usual wake-up, between 3 and 7 AM", () => {
  assert.equal(promptStartMinutes([]), 7 * 60, "no history: 7 AM as before");
  const early = ["2026-11-14", "2026-11-15", "2026-11-16"].map((d) => night(d, { wakeTime: "05:30" }));
  assert.equal(promptStartMinutes(early), 3 * 60 + 30);
  const late = ["2026-11-14", "2026-11-15", "2026-11-16"].map((d) => night(d, { wakeTime: "10:00" }));
  assert.equal(promptStartMinutes(late), 7 * 60, "never later than 7 AM");
  // Before the start it's still yesterday's check-in.
  assert.equal(sleepPromptKey(new Date(2026, 10, 17, 5, 0), 7 * 60), "2026-11-16");
  assert.equal(sleepPromptKey(new Date(2026, 10, 17, 5, 0), 3 * 60 + 30), "2026-11-17");
});

test("going to bed now belongs to tonight in the evening and to today after midnight", () => {
  assert.equal(bedtimeNowNight(new Date(2026, 10, 17, 22, 40)), "2026-11-18");
  assert.equal(bedtimeNowNight(new Date(2026, 10, 18, 1, 15)), "2026-11-18");
  assert.equal(bedtimeNowNight(new Date(2026, 10, 18, 11, 0)), null, "midday: pick the times by hand");
});

test("a sleep goal is a target, measured against nights, never stored as one", () => {
  assert.equal(targetMinutes({ bedtime: "22:30", wakeTime: "06:00" }), 450);
  assert.equal(targetMinutes({ bedtime: "22:30" }), null);
  assert.equal(clockDelta("23:15", "22:30"), 45);
  assert.equal(clockDelta("00:15", "23:45"), 30, "the short way round midnight");
  assert.equal(clockDelta("22:00", "22:30"), -30);
});

/* ── the store ──────────────────────────────────────────────── */

const store = () => useChronicle.getState();
const entry = (date: string, over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `j-${date}`,
  date,
  blocks: [],
  totalHours: 2,
  mood: 4,
  energy: 4,
  motivation: 4,
  focus: 4,
  ...over,
});

beforeEach(() => {
  setStorageBackend(new MemoryStorage() as unknown as Storage);
  setActiveAccount(null);
  useChronicle.setState(blankChronicleState());
});

test("recording a night keeps every other reading on that day", () => {
  useChronicle.setState({ lifeLog: [night(D, { waterLiters: 2.5, note: "long walk", fileIds: ["f1"] })] });
  store().recordSleep({ date: D, bedtime: "23:30", wakeTime: "07:00" });
  assert.deepEqual(store().lifeLog[0], {
    id: `life-${D}`,
    date: D,
    waterLiters: 2.5,
    note: "long walk",
    fileIds: ["f1"],
    bedtime: "23:30",
    wakeTime: "07:00",
    sleepHours: 7.5,
  });
});

test("a bedtime can be saved first and the wake-up added later", () => {
  store().recordSleep({ date: D, bedtime: "23:10" });
  assert.deepEqual(store().lifeLog[0], { id: `life-${D}`, date: D, bedtime: "23:10" }, "no hours invented");
  store().recordSleep({ date: D, wakeTime: "06:40" });
  assert.equal(store().lifeLog[0].sleepHours, 7.5);
  assert.equal(store().lifeLog[0].bedtime, "23:10", "the bedtime stays");
});

test("editing times updates the hours, and time asleep entered by hand wins", () => {
  store().recordSleep({ date: D, bedtime: "23:00", wakeTime: "07:00" });
  assert.equal(store().lifeLog[0].sleepHours, 8);
  store().recordSleep({ date: D, bedtime: "00:00" });
  assert.equal(store().lifeLog[0].sleepHours, 7);
  store().recordSleep({ date: D, hours: 6.5 });
  assert.equal(store().lifeLog[0].sleepHours, 6.5);
  store().recordSleep({ date: D, hours: MAX_SLEEP_HOURS + 1 });
  assert.equal(store().lifeLog[0].sleepHours, 6.5, "impossible hours are ignored");
  store().recordSleep({ date: D, quality: 4 });
  assert.equal(store().lifeLog[0].sleepQuality, 4);
  store().recordSleep({ date: D, quality: 9 });
  assert.equal(store().lifeLog[0].sleepQuality, 4, "out of range ratings are ignored");
});

test("older nights recorded as hours only keep their hours when a time is added", () => {
  useChronicle.setState({ lifeLog: [night(D, { sleepHours: 7.2 })] });
  store().recordSleep({ date: D, bedtime: "23:00" });
  assert.equal(store().lifeLog[0].sleepHours, 7.2);
});

test("deleting a night removes only its sleep, and an emptied day goes", () => {
  useChronicle.setState({
    lifeLog: [
      night(D, { bedtime: "23:00", wakeTime: "07:00", sleepHours: 8, sleepQuality: 3, waterLiters: 2 }),
      night("2026-11-16", { bedtime: "23:00", wakeTime: "06:00", sleepHours: 7 }),
    ],
  });
  store().clearSleep(D);
  assert.deepEqual(store().lifeLog.find((l) => l.date === D), { id: `life-${D}`, date: D, waterLiters: 2 });
  store().clearSleep("2026-11-16");
  assert.equal(store().lifeLog.some((l) => l.date === "2026-11-16"), false, "nothing else that day: the day goes");
});

test("the journal day follows the times but is never created for them", () => {
  useChronicle.setState({ journal: [entry(D, { sleepTime: "22:00", wakeTime: "05:00" })] });
  store().recordSleep({ date: D, bedtime: "23:30", wakeTime: "07:00" });
  assert.equal(store().journal[0].sleepTime, "23:30");
  assert.equal(store().journal[0].wakeTime, "07:00");
  store().recordSleep({ date: "2026-11-16", bedtime: "23:00" });
  assert.equal(store().journal.length, 1, "no placeholder journal entry");
  store().recordSleep({ date: D, quality: 5 });
  assert.equal(store().journal[0].sleepTime, "23:30", "a rating alone doesn't touch the journal times");
});

test("the morning check-in is answered by saving or by skipping, and that syncs", () => {
  store().recordSleep({ date: D, bedtime: "23:00", wakeTime: "06:30", promptKey: D });
  assert.equal(store().lastSleepPrompt, D);
  store().dismissSleepPrompt("2026-11-18");
  assert.equal(store().lastSleepPrompt, "2026-11-18");
  store().logDailySleep({ date: "2026-11-19", promptKey: "2026-11-19", sleepTime: "23:00", wakeTime: "07:00", sleepHours: 8 });
  assert.equal(store().lifeLog.find((l) => l.date === "2026-11-19")?.sleepHours, 8);
});

test("Liquid Glass is its own setting: it never changes the theme, and the theme never changes it", () => {
  store().setThemeMode("dark");
  store().setMaterial("glass");
  assert.equal(store().themeMode, "dark");
  assert.equal(store().material, "glass");
  store().setThemeMode("light");
  assert.equal(store().material, "glass", "switching theme keeps glass on");
  store().setMaterial("standard");
  assert.equal(store().themeMode, "light", "turning glass off keeps the theme");
  store().setReduceTransparency(true);
  assert.equal(store().reduceTransparency, true);
  // Both travel with the account's synced data.
  store().applyCloudSnapshot({ material: "glass", reduceTransparency: false, themeMode: "dark" });
  assert.equal(store().material, "glass");
  assert.equal(store().reduceTransparency, false);
  // A material this version doesn't know reads as Standard.
  store().applyCloudSnapshot({ material: "frosted" as never });
  assert.equal(store().material, "standard");
  // Signing out clears it with everything else.
  useChronicle.setState(blankChronicleState());
  assert.equal(store().material, "standard");
});
