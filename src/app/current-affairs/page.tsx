"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Bookmark, Newspaper } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { CurrentAffair, CACategory } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { relativeDay, toISODate, uid, cn } from "@/lib/utils";

const CATEGORIES: CACategory[] = [
  "Polity",
  "Economy",
  "Environment",
  "International",
  "Science & Tech",
  "Society",
  "Schemes",
  "Reports & Indices",
  "Geography",
  "Misc",
];

function emptyCA(): CurrentAffair {
  return {
    id: uid("ca"),
    date: toISODate(new Date()),
    title: "",
    source: "",
    category: "Polity",
    tags: [],
    summary: "",
    prelimsRelevant: true,
    mainsRelevant: true,
    bookmarked: false,
  };
}

export default function CurrentAffairsPage() {
  const hydrated = useHasHydrated();
  const items = useChronicle((s) => s.currentAffairs);
  const toggleBookmark = useChronicle((s) => s.toggleBookmark);
  const upsert = useChronicle((s) => s.upsertCurrentAffair);

  const [cat, setCat] = useState<CACategory | "all" | "saved">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CurrentAffair>(emptyCA());
  const [tagInput, setTagInput] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...items]
      .filter((i) => {
        if (cat === "saved") return i.bookmarked;
        if (cat !== "all") return i.category === cat;
        return true;
      })
      .filter(
        (i) =>
          !q ||
          i.title.toLowerCase().includes(q) ||
          i.summary.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [items, cat, query]);

  const today = toISODate(new Date());
  const savedCount = items.filter((i) => i.bookmarked).length;

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Current Affairs Vault"
        title="The news, distilled and never lost."
        description="A searchable archive of everything that matters — tagged, categorised, and linked to the syllabus."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyCA());
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add note
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the vault…"
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={cat === "all"} onClick={() => setCat("all")}>
            All
          </Chip>
          <Chip active={cat === "saved"} onClick={() => setCat("saved")}>
            Saved · {savedCount}
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-5 w-5" />}
          title="Nothing here yet"
          description="Add a current affairs note or adjust your filters."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((i) => (
            <Card key={i.id} hover className="flex flex-col p-5">
              <div className="mb-2 flex items-start justify-between gap-3">
                <Badge tone="default">{i.category}</Badge>
                <button
                  onClick={() => toggleBookmark(i.id)}
                  className={cn(
                    "shrink-0 transition-colors",
                    i.bookmarked ? "text-paper" : "text-paper/30 hover:text-paper/60",
                  )}
                >
                  <Bookmark
                    className={cn("h-4 w-4", i.bookmarked && "fill-paper")}
                  />
                </button>
              </div>
              <h3 className="text-[0.95rem] font-semibold leading-snug text-paper">
                {i.title}
              </h3>
              <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-paper/55">
                {i.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {i.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-paper/[0.05] px-1.5 py-0.5 text-[0.65rem] text-paper/50"
                  >
                    #{t}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-paper/[0.06] pt-3 text-[0.7rem] text-paper/40">
                <span>
                  {i.source} · {relativeDay(i.date, today)}
                </span>
                <span className="flex gap-1.5">
                  {i.prelimsRelevant && <Badge tone="ghost">P</Badge>}
                  {i.mainsRelevant && <Badge tone="ghost">M</Badge>}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add to the vault"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!draft.title.trim()) return;
                const tags = tagInput
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean);
                upsert({ ...draft, tags });
                setTagInput("");
                setOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Headline">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="What happened?"
            />
          </Field>
          <Field label="Summary">
            <Textarea
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              placeholder="Why it matters for the exam…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <Select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value as CACategory })
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Source">
              <Input
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                placeholder="e.g. The Hindu"
              />
            </Field>
          </div>
          <Field label="Tags" hint="comma separated">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="RBI, Monetary Policy"
            />
          </Field>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-paper/70">
              <input
                type="checkbox"
                checked={draft.prelimsRelevant}
                onChange={(e) =>
                  setDraft({ ...draft, prelimsRelevant: e.target.checked })
                }
                className="h-4 w-4 accent-paper"
              />
              Prelims
            </label>
            <label className="flex items-center gap-2 text-sm text-paper/70">
              <input
                type="checkbox"
                checked={draft.mainsRelevant}
                onChange={(e) =>
                  setDraft({ ...draft, mainsRelevant: e.target.checked })
                }
                className="h-4 w-4 accent-paper"
              />
              Mains
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
