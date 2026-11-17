import { test } from "node:test";
import assert from "node:assert/strict";
import type { JournalEntry, LifeEntry } from "@/lib/types";
import {
  CORE_LIFE_FIELDS,
  MIN_GROUP,
  MIN_PAIRS,
  buildLifeReport,
  factorLinks,
  normalizeSpan,
  presetSpan,
  previousSpan,
  shiftDay,
  trackedFields,
} from "@/lib/life";
import { draftFromEntry, entryFromDraft, sleepFromTimes } from "@/lib/life-entry";

const TODAY = "2026-11-15";

const journalDay = (date: string, hours: number, mood = 4): JournalEntry => ({
  id: `j-${date}`,
  date,
  blocks: [],
  totalHours: hours,
  mood,
  energy: 3,
  motivation: 3,
  focus: 3,
});

const metric = (r: ReturnType<typeof buildLifeReport>, id: string) => r.metrics.find((m) => m.id === id)!;

test("a day without a reading is left out, while a recorded zero counts", () => {
  const span = { from: "2026-11-09", to: "2026-11-15" };
  const lifeLog: LifeEntry[] = [
    { id: "a", date: "2026-11-10", waterLiters: 3 },
    { id: "b", date: "2026-11-11", waterLiters: 0 },
    { id: "c", date: "2026-11-12", sleepHours: 7 },
  ];
  const r = buildLifeReport({ journal: [], lifeLog, span, tracked: ["water", "sleep"] });
  const water = metric(r, "water");
  assert.equal(water.value, 1.5, "(3 + 0) / 2 recorded days, not / 7");
  assert.equal(water.recorded, 2);
  assert.equal(water.days, 7);
  assert.equal(metric(r, "sleep").value, 7);
  assert.equal(metric(r, "sleep").recorded, 1);
  assert.equal(metric(r, "studyHours").value, null, "no journal at all: unknown, not 0 hours");
  assert.equal(metric(r, "mood").value, null);
  assert.equal(r.coverage.life, 3);
  assert.equal(r.coverage.journal, 0);
});

test("only tracked fields are reported", () => {
  const r = buildLifeReport({ journal: [], lifeLog: [], span: presetSpan("7d", TODAY), tracked: ["sleep"] });
  const ids = r.metrics.map((m) => m.id);
  assert.ok(ids.includes("sleep"));
  assert.ok(!ids.includes("water"));
  assert.ok(!ids.includes("weight"));
  assert.ok(ids.includes("studyHours"), "study comes from the journal and is always shown");
});

test("comparisons use the same number of days immediately before", () => {
  const span = { from: "2026-11-09", to: "2026-11-15" };
  assert.deepEqual(previousSpan(span), { from: "2026-11-02", to: "2026-11-08" });
  const journal = [journalDay("2026-11-03", 4), journalDay("2026-11-10", 6), journalDay("2026-11-11", 3)];
  const r = buildLifeReport({ journal, lifeLog: [], span, tracked: [] });
  const study = metric(r, "studyHours");
  assert.equal(study.value, 9);
  assert.equal(study.previous, 4);
  assert.equal(study.change, 5);
  const obs = r.observations.find((o) => o.id === "study-vs-previous");
  assert.ok(obs?.text.includes("5 h more"), obs?.text);
  assert.ok(!/%/.test(obs!.text), "observations speak in hours, not percentages");
});

test("charts tell an unlogged day apart from a day with zero study", () => {
  const span = { from: "2026-11-13", to: "2026-11-15" };
  const r = buildLifeReport({ journal: [journalDay("2026-11-14", 0)], lifeLog: [], span, tracked: [] });
  assert.equal(r.granularity, "day");
  const [d13, d14] = r.buckets;
  assert.equal(d13.journalDays, 0, "no entry: the chart shows a gap");
  assert.equal(d14.journalDays, 1);
  assert.equal(d14.studyHours, 0, "an entry with no hours is a real zero");
  const rows = new Map(r.daily.map((d) => [d.date, d]));
  assert.equal(rows.get("2026-11-13")!.study, null);
  assert.equal(rows.get("2026-11-14")!.study, 0);
});

test("a comparison needs enough days on both sides before it is shown", () => {
  const span = { from: "2026-10-17", to: TODAY };
  const journal: JournalEntry[] = [];
  const lifeLog: LifeEntry[] = [];
  // One fewer long night than needed.
  for (let i = 0; i < MIN_GROUP - 1; i++) {
    const d = shiftDay(TODAY, -i);
    journal.push(journalDay(d, 8));
    lifeLog.push({ id: d, date: d, sleepHours: 8 });
  }
  for (let i = 10; i < 10 + MIN_GROUP; i++) {
    const d = shiftDay(TODAY, -i);
    journal.push(journalDay(d, 3));
    lifeLog.push({ id: d, date: d, sleepHours: 5.5 });
  }
  const without = buildLifeReport({ journal, lifeLog, span, tracked: ["sleep"] });
  assert.equal(without.observations.find((o) => o.id === "sleep-study"), undefined);

  const d = shiftDay(TODAY, -5);
  const withOne = buildLifeReport({
    journal: [...journal, journalDay(d, 8)],
    lifeLog: [...lifeLog, { id: d, date: d, sleepHours: 8 }],
    span,
    tracked: ["sleep"],
  });
  const o = withOne.observations.find((x) => x.id === "sleep-study");
  assert.ok(o, "shown once both sides have enough nights");
  assert.match(o!.basis, /not what causes what/);
});

test("habit links need at least the minimum shared days", () => {
  const span = { from: "2026-10-01", to: TODAY };
  const journal: JournalEntry[] = [];
  const lifeLog: LifeEntry[] = [];
  for (let i = 0; i < MIN_PAIRS - 1; i++) {
    const d = shiftDay(TODAY, -i);
    journal.push(journalDay(d, 2 + i));
    lifeLog.push({ id: d, date: d, exerciseMinutes: 10 + i * 5 });
  }
  assert.equal(factorLinks(lifeLog, journal, span, ["exercise"]).length, 0);
  const d = shiftDay(TODAY, -MIN_PAIRS);
  const links = factorLinks([...lifeLog, { id: d, date: d, exerciseMinutes: 80 }], [...journal, journalDay(d, 12)], span, ["exercise"]);
  assert.equal(links.length, 1);
  assert.equal(links[0].n, MIN_PAIRS);
  assert.ok(links[0].r > 0.9);
  assert.equal(factorLinks(lifeLog, journal, span, ["water"]).length, 0, "untracked habits aren't reported");
});

test("spans never run past today or backwards", () => {
  assert.deepEqual(normalizeSpan({ from: "2026-11-20", to: "2026-11-30" }, TODAY), { from: TODAY, to: TODAY });
  assert.deepEqual(normalizeSpan({ from: "2026-11-10", to: "2026-11-01" }, TODAY), { from: "2026-11-01", to: "2026-11-01" });
  assert.deepEqual(presetSpan("lastMonth", TODAY), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(presetSpan("7d", TODAY), { from: "2026-11-09", to: TODAY });
});

test("the form asks for what you chose, else what you've used, else a short core list", () => {
  assert.deepEqual(trackedFields(undefined, []), CORE_LIFE_FIELDS);
  assert.deepEqual(trackedFields(undefined, [{ id: "a", date: TODAY, weightKg: 70 }, { id: "b", date: TODAY, bedtime: "23:00" }]), ["sleep", "weight"]);
  assert.deepEqual(trackedFields(["water", "deepWork"], [{ id: "a", date: TODAY, weightKg: 70 }]), ["water", "deepWork"]);
});

test("the life form keeps blanks as not recorded and a typed 0 as 0", () => {
  const draft = draftFromEntry(TODAY);
  assert.equal(draft.numbers.waterLiters, "", "nothing is pre-filled");
  assert.equal(entryFromDraft(draft, TODAY).entry, null, "an untouched form saves nothing");

  draft.numbers.waterLiters = "0";
  draft.numbers.screenTimeMin = "95.6";
  const { entry, errors } = entryFromDraft(draft, TODAY);
  assert.deepEqual(errors, {});
  assert.equal(entry!.waterLiters, 0);
  assert.equal(entry!.screenTimeMin, 96, "minutes are whole numbers");
  assert.equal("sleepHours" in entry!, false);
  assert.equal("sleepQuality" in entry!, false);
});

test("the life form works out sleep from the times, checks ranges and refuses future days", () => {
  assert.equal(sleepFromTimes("23:30", "06:45"), 7.25);
  assert.equal(sleepFromTimes("23:20", "06:40"), 7.33);
  assert.equal(sleepFromTimes("01:00", "07:00"), 6, "after midnight");
  assert.equal(sleepFromTimes("23:30", ""), null);

  const d = draftFromEntry(TODAY);
  d.bedtime = "23:00";
  d.wakeTime = "06:30";
  assert.equal(entryFromDraft(d, TODAY).entry!.sleepHours, 7.5);

  d.numbers.sleepHours = "30";
  d.numbers.weightKg = "abc";
  const bad = entryFromDraft(d, TODAY);
  assert.ok(bad.errors.sleepHours);
  assert.ok(bad.errors.weightKg);

  const future = draftFromEntry("2026-11-16");
  future.numbers.waterLiters = "2";
  assert.ok(entryFromDraft(future, TODAY).errors.date);
});

test("saving a life day keeps its linked files and readings the form didn't show", () => {
  const existing: LifeEntry = { id: "life-x", date: TODAY, weightKg: 70.4, fileIds: ["f1"] };
  const d = draftFromEntry(TODAY, existing);
  assert.equal(d.numbers.weightKg, "70.4");
  d.numbers.waterLiters = "2.5";
  const { entry } = entryFromDraft(d, TODAY, existing);
  assert.equal(entry!.weightKg, 70.4);
  assert.equal(entry!.waterLiters, 2.5);
  assert.deepEqual(entry!.fileIds, ["f1"]);

  const onlyFiles = entryFromDraft(draftFromEntry(TODAY), TODAY, { id: "l", date: TODAY, fileIds: ["f2"] });
  assert.deepEqual(onlyFiles.entry?.fileIds, ["f2"], "a day holding only links is still kept");
});
