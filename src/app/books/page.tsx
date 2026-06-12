"use client";

import { useMemo, useState } from "react";
import { Plus, BookOpen, Star } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Book, BookStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Chip, EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { uid, sum, cn } from "@/lib/utils";

const STATUSES: BookStatus[] = ["Reading", "To Read", "Completed", "Reference"];

function emptyBook(): Book {
  return {
    id: uid("book"),
    title: "",
    author: "",
    totalPages: 300,
    currentPage: 0,
    status: "To Read",
    isStandard: false,
  };
}

function Stars({ value = 0 }: { value?: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3 w-3",
            i < value ? "fill-paper text-paper" : "text-paper/20",
          )}
        />
      ))}
    </span>
  );
}

export default function BooksPage() {
  const hydrated = useHasHydrated();
  const books = useChronicle((s) => s.books);
  const updateProgress = useChronicle((s) => s.updateBookProgress);
  const upsert = useChronicle((s) => s.upsertBook);
  const confirm = useConfirm();

  const [filter, setFilter] = useState<BookStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Book>(emptyBook());

  const filtered = useMemo(
    () => books.filter((b) => filter === "all" || b.status === filter),
    [books, filter],
  );

  const stats = useMemo(() => {
    const completed = books.filter((b) => b.status === "Completed").length;
    const reading = books.filter((b) => b.status === "Reading").length;
    const pagesRead = sum(books.map((b) => b.currentPage));
    return { completed, reading, pagesRead };
  }, [books]);

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Book Progress Tracking"
        title="The standard books, finished and revised."
        description="UPSC rewards depth over breadth. Track every source from cover to cover — and how many times you've been through it."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyBook());
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add book
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-paper/40">
            Completed
          </p>
          <p className="tabular mt-2 text-2xl font-semibold text-paper">
            {stats.completed}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-paper/40">
            Reading
          </p>
          <p className="tabular mt-2 text-2xl font-semibold text-paper">
            {stats.reading}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-paper/40">
            Pages read
          </p>
          <p className="tabular mt-2 text-2xl font-semibold text-paper">
            {stats.pagesRead.toLocaleString()}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {s}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="No books here"
          description="Add the standard references you're working through."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((b) => {
            const pct = Math.round((b.currentPage / b.totalPages) * 100);
            return (
              <Card key={b.id} className="flex gap-4 p-5">
                {/* spine */}
                <div className="relative hidden h-28 w-20 shrink-0 overflow-hidden rounded-lg border border-paper/10 bg-gradient-to-br from-paper/[0.12] to-paper/[0.02] sm:block">
                  <div className="absolute inset-y-0 left-1.5 w-px bg-paper/15" />
                  <div className="flex h-full items-center justify-center p-2 text-center">
                    <span className="line-clamp-4 text-[0.6rem] font-medium leading-tight text-paper/70">
                      {b.title}
                    </span>
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-paper">
                        {b.title}
                      </h3>
                      <p className="truncate text-xs text-paper/45">{b.author}</p>
                    </div>
                    {b.isStandard && <Badge tone="ghost">standard</Badge>}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone="outline">{b.status}</Badge>
                    {b.rating ? <Stars value={b.rating} /> : null}
                  </div>

                  <div className="mt-auto pt-3">
                    <div className="flex items-center justify-between text-[0.7rem] text-paper/45">
                      <span className="tabular">
                        {b.currentPage} / {b.totalPages} pp
                      </span>
                      <span className="tabular">{pct}%</span>
                    </div>
                    <Progress value={pct} className="mt-1.5" />
                    <input
                      type="range"
                      min={0}
                      max={b.totalPages}
                      value={b.currentPage}
                      onChange={(e) =>
                        updateProgress(b.id, parseInt(e.target.value, 10))
                      }
                      className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-paper/10 accent-paper"
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a book"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!draft.title.trim()) return;
                if (
                  await confirm({
                    title: "Add this book?",
                    description: `"${draft.title.trim()}" will be added to your reading tracker.`,
                    tone: "default",
                    confirmLabel: "Add book",
                  })
                ) {
                  upsert(draft);
                  setOpen(false);
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. Indian Polity"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Author">
              <Input
                value={draft.author}
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                placeholder="e.g. M. Laxmikanth"
              />
            </Field>
            <Field label="Status">
              <Select
                value={draft.status}
                onChange={(e) =>
                  setDraft({ ...draft, status: e.target.value as BookStatus })
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Total pages">
              <Input
                type="number"
                value={draft.totalPages}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    totalPages: parseInt(e.target.value, 10) || 1,
                  })
                }
              />
            </Field>
            <Field label="Current page">
              <Input
                type="number"
                value={draft.currentPage}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    currentPage: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
