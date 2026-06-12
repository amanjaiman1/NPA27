"use client";

import { useMemo, useState } from "react";
import { Plus, TrendingUp, Target, Award, Trash2 } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { MockTest, MockType } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented, EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/form";
import { LineChart } from "@/components/charts/line-chart";
import { mockSeries } from "@/lib/selectors";
import { formatDate, toISODate, uid, avg, round } from "@/lib/utils";

const TYPES: MockType[] = [
  "Prelims GS",
  "Prelims CSAT",
  "Mains GS",
  "Mains Essay",
  "Mains Optional",
  "Sectional",
];

function emptyMock(): MockTest {
  return {
    id: uid("m"),
    date: toISODate(new Date()),
    name: "",
    type: "Prelims GS",
    provider: "",
    score: 0,
    max: 200,
  };
}

export default function MocksPage() {
  const hydrated = useHasHydrated();
  const mocks = useChronicle((s) => s.mocks);
  const upsert = useChronicle((s) => s.upsertMock);
  const remove = useChronicle((s) => s.deleteMock);

  const [type, setType] = useState<MockType | "all">("Prelims GS");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MockTest>(emptyMock());

  const series = useMemo(
    () => mockSeries(mocks, type === "all" ? undefined : type),
    [mocks, type],
  );
  const linePoints = series.map((s) => ({
    label: formatDate(s.date),
    value: s.pct,
    meta: `${s.name} · ${s.score}/${s.max}`,
  }));

  const stats = useMemo(() => {
    if (!series.length) return null;
    const pcts = series.map((s) => s.pct);
    const best = series.reduce((m, s) => (s.pct > m.pct ? s : m), series[0]);
    const recent = pcts.slice(-3);
    const earlier = pcts.slice(0, 3);
    const delta =
      recent.length && earlier.length
        ? round(avg(recent) - avg(earlier), 0)
        : 0;
    return {
      average: round(avg(pcts), 0),
      best,
      delta,
      count: series.length,
    };
  }, [series]);

  const tableRows = useMemo(
    () =>
      [...mocks]
        .filter((m) => type === "all" || m.type === type)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [mocks, type],
  );

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mock Test Analytics"
        title="Where preparation meets the scoreboard."
        description="Mocks are rehearsals, not verdicts. Track the trendline — the direction matters more than any single number."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyMock());
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Log mock
          </Button>
        }
      />

      <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
        <Segmented
          value={type}
          onChange={(v) => setType(v as MockType | "all")}
          options={[
            { label: "All", value: "all" },
            ...TYPES.map((t) => ({ label: t, value: t })),
          ]}
        />
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-paper/40">
              <Target className="h-4 w-4" />
              <span className="text-[0.7rem] uppercase tracking-wider">Average</span>
            </div>
            <p className="tabular mt-2 text-2xl font-semibold text-paper">
              {stats.average}%
            </p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-paper/40">
              <Award className="h-4 w-4" />
              <span className="text-[0.7rem] uppercase tracking-wider">Best</span>
            </div>
            <p className="tabular mt-2 text-2xl font-semibold text-paper">
              {stats.best.pct}%
            </p>
            <p className="mt-1 text-xs text-paper/40">{stats.best.score}/{stats.best.max}</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-paper/40">
              <TrendingUp className="h-4 w-4" />
              <span className="text-[0.7rem] uppercase tracking-wider">Momentum</span>
            </div>
            <p className="tabular mt-2 text-2xl font-semibold text-paper">
              {stats.delta > 0 ? "+" : ""}
              {stats.delta}%
            </p>
            <p className="mt-1 text-xs text-paper/40">recent vs early</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-paper/40">
              <span className="text-[0.7rem] uppercase tracking-wider">Attempts</span>
            </div>
            <p className="tabular mt-2 text-2xl font-semibold text-paper">
              {stats.count}
            </p>
            <p className="mt-1 text-xs text-paper/40">in this category</p>
          </Card>
        </div>
      )}

      <Card className="p-6">
        <p className="eyebrow mb-1">Score trend</p>
        <h3 className="mb-5 text-base font-semibold text-paper">
          {type === "all" ? "All mocks" : type} · % score over time
        </h3>
        {linePoints.length > 1 ? (
          <LineChart data={linePoints} formatValue={(v) => `${v}%`} target={50} height={240} />
        ) : (
          <p className="py-10 text-center text-sm text-paper/40">
            Log at least two mocks to see a trend.
          </p>
        )}
      </Card>

      {tableRows.length === 0 ? (
        <EmptyState
          icon={<Target className="h-5 w-5" />}
          title="No mocks logged yet"
          description="Record your first mock to start tracking performance."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper/[0.08] text-left text-[0.7rem] uppercase tracking-wider text-paper/40">
                  <th className="px-5 py-3 font-medium">Test</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 text-right font-medium">Score</th>
                  <th className="px-5 py-3 text-right font-medium">%</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {tableRows.map((m) => {
                  const pct = Math.round((m.score / m.max) * 100);
                  return (
                    <tr
                      key={m.id}
                      className="group border-b border-paper/[0.05] last:border-0 transition-colors hover:bg-paper/[0.02]"
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-paper">{m.name}</p>
                        {m.provider && (
                          <p className="text-xs text-paper/40">{m.provider}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone="outline">{m.type}</Badge>
                      </td>
                      <td className="px-5 py-3 text-paper/50">
                        {formatDate(m.date)}
                      </td>
                      <td className="tabular px-5 py-3 text-right text-paper/80">
                        {m.score}/{m.max}
                      </td>
                      <td className="tabular px-5 py-3 text-right font-semibold text-paper">
                        {pct}%
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => remove(m.id)}
                          className="text-paper/25 opacity-0 transition-opacity hover:text-paper group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Log a mock test"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!draft.name.trim() || draft.max <= 0) return;
                upsert(draft);
                setOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Test name">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Prelims FLT #12"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select
                value={draft.type}
                onChange={(e) =>
                  setDraft({ ...draft, type: e.target.value as MockType })
                }
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Provider">
              <Input
                value={draft.provider ?? ""}
                onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                placeholder="e.g. Vision IAS"
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Score">
              <Input
                type="number"
                value={draft.score}
                onChange={(e) =>
                  setDraft({ ...draft, score: parseFloat(e.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Max">
              <Input
                type="number"
                value={draft.max}
                onChange={(e) =>
                  setDraft({ ...draft, max: parseFloat(e.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
