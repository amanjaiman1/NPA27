"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import type { TimeFormat } from "@/lib/types";
import { clockMinutes, clockParts, formatClock, parseClock, toClock } from "@/lib/sleep";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export interface TimeChip {
  /** "Now", "Usual". */
  label: string;
  value: string;
}

/**
 * A row of toggle buttons that keyboard users move through with the arrow
 * keys (one tab stop for the whole grid), and touch users tap.
 */
function OptionGrid({
  label,
  options,
  value,
  columns,
  onSelect,
}: {
  label: string;
  options: { value: number; text: string; aria: string }[];
  value: number | null;
  columns: number;
  onSelect: (v: number) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const [focusIndex, setFocusIndex] = useState(Math.max(0, selectedIndex));
  useEffect(() => {
    if (selectedIndex >= 0) setFocusIndex(selectedIndex);
  }, [selectedIndex]);

  function move(to: number) {
    const i = (to + options.length) % options.length;
    setFocusIndex(i);
    refs.current[i]?.focus();
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      onKeyDown={(e) => {
        const i = focusIndex;
        if (e.key === "ArrowRight") move(i + 1);
        else if (e.key === "ArrowLeft") move(i - 1);
        else if (e.key === "ArrowDown") move(i + columns);
        else if (e.key === "ArrowUp") move(i - columns);
        else if (e.key === "Home") move(0);
        else if (e.key === "End") move(options.length - 1);
        else return;
        e.preventDefault();
      }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            tabIndex={i === focusIndex ? 0 : -1}
            aria-pressed={on}
            aria-label={o.aria}
            onClick={() => onSelect(o.value)}
            onFocus={() => setFocusIndex(i)}
            className={cn(
              "tabular h-11 rounded-xl border text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              on
                ? "border-accent bg-accent text-accent-fg"
                : "field border-line bg-paper/[0.03] text-paper/80 hover:border-paper/25 hover:text-paper",
            )}
          >
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The picker: two taps — an hour, then a minute — and it closes. Typing works
 * too ("2330", "11:30 pm"), and ±5 nudges the minute. AM/PM is one switch, and
 * starts where that time usually is (PM for a bedtime, AM for a wake-up).
 */
export function TimeSheet({
  open,
  onClose,
  title,
  description,
  value,
  onChange,
  format,
  context,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  value: string;
  onChange: (hhmm: string) => void;
  format: TimeFormat;
  context?: "bed" | "wake";
}) {
  const [draft, setDraft] = useState<string>(value);
  const [pm, setPm] = useState(true);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const typeId = useId();

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    const m = clockMinutes(value);
    setPm(m != null ? m >= 720 : context !== "wake");
    setTyped("");
    setTypedError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const minutes = clockMinutes(draft);
  const hour24 = minutes == null ? null : Math.floor(minutes / 60);
  const minute = minutes == null ? null : minutes % 60;

  const hourOptions = useMemo(() => {
    if (format === "24h") {
      return Array.from({ length: 24 }, (_, h) => ({ value: h, text: String(h).padStart(2, "0"), aria: `${h} hours` }));
    }
    return [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => {
      const v = (h % 12) + (pm ? 12 : 0);
      return { value: v, text: String(h), aria: `${h} ${pm ? "PM" : "AM"}` };
    });
  }, [format, pm]);
  const minuteOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: i * 5, text: `:${String(i * 5).padStart(2, "0")}`, aria: `${i * 5} minutes` })),
    [],
  );

  function commit(hhmm: string) {
    onChange(hhmm);
    onClose();
  }

  function pickHour(h: number) {
    setDraft(toClock(h * 60 + (minute ?? 0)));
  }
  function pickMinute(m: number) {
    if (hour24 == null) return;
    commit(toClock(hour24 * 60 + m));
  }
  function setMeridiem(next: boolean) {
    setPm(next);
    if (hour24 != null && next !== hour24 >= 12) setDraft(toClock((minutes as number) + (next ? 720 : -720)));
  }
  function nudge(delta: number) {
    if (minutes == null) return;
    const next = toClock(minutes + delta);
    setDraft(next);
    setPm((clockMinutes(next) as number) >= 720);
  }
  function applyTyped() {
    const parsed = parseClock(typed, { format, context });
    if (!parsed) {
      setTypedError("Couldn't read that. Try 23:30, 2330 or 11:30 pm.");
      return;
    }
    commit(parsed);
  }

  const parts = clockParts(draft, format);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className="sm:max-w-sm"
      footer={
        <>
          {value && (
            <Button
              variant="subtle"
              size="sm"
              className="mr-auto"
              onClick={() => commit("")}
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => (draft ? commit(draft) : onClose())} disabled={!draft}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-5" data-testid="time-sheet">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => nudge(-5)}
            disabled={minutes == null}
            aria-label="5 minutes earlier"
            className="field grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-paper/[0.03] text-paper/70 transition-colors hover:text-paper disabled:opacity-40"
          >
            <Minus className="h-4 w-4" />
          </button>
          <p className="tabular text-center font-display text-[2.4rem] font-bold leading-none tracking-tightest text-paper" aria-live="polite">
            {parts.main}
            {parts.suffix && <span className="ml-1.5 text-lg font-semibold text-paper/60">{parts.suffix}</span>}
          </p>
          <button
            type="button"
            onClick={() => nudge(5)}
            disabled={minutes == null}
            aria-label="5 minutes later"
            className="field grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-paper/[0.03] text-paper/70 transition-colors hover:text-paper disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {format === "12h" && (
          <div className="mx-auto flex w-fit gap-1 rounded-full border border-line bg-card p-1 shadow-soft" role="group" aria-label="AM or PM">
            {[
              { label: "AM", on: !pm, value: false },
              { label: "PM", on: pm, value: true },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={o.on}
                onClick={() => setMeridiem(o.value)}
                className={cn(
                  "rounded-full px-5 py-1.5 text-xs font-semibold transition-colors",
                  o.on ? "bg-accent text-accent-fg" : "text-paper/60 hover:text-paper",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        <div>
          <p className="eyebrow mb-2">Hour</p>
          <OptionGrid label="Hour" options={hourOptions} value={hour24} columns={6} onSelect={pickHour} />
        </div>
        <div>
          <p className="eyebrow mb-2">Minute {hour24 == null && <span className="normal-case tracking-normal text-paper/45">· pick an hour first</span>}</p>
          <OptionGrid label="Minute" options={minuteOptions} value={minute != null && minute % 5 === 0 ? minute : null} columns={6} onSelect={pickMinute} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyTyped();
          }}
        >
          <label htmlFor={typeId} className="mb-1.5 block text-[0.72rem] font-semibold text-paper/60">
            Or type it
          </label>
          <div className="flex gap-2">
            <Input
              id={typeId}
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setTypedError(null);
              }}
              placeholder={format === "12h" ? "e.g. 11:30 pm or 2330" : "e.g. 23:30 or 2330"}
              autoComplete="off"
              enterKeyHint="done"
              aria-invalid={Boolean(typedError)}
              aria-describedby={typedError ? `${typeId}-err` : undefined}
            />
            <Button type="submit" variant="ghost" disabled={!typed.trim()}>
              Set
            </Button>
          </div>
          {typedError && (
            <p id={`${typeId}-err`} className="mt-1 text-[0.72rem] text-danger" role="alert">
              {typedError}
            </p>
          )}
        </form>
      </div>
    </Modal>
  );
}

/**
 * One clock time, shown large. Tapping it opens the picker; the chips below
 * set it in one tap ("Now", your usual time).
 */
export function TimeField({
  label,
  icon: Icon,
  value,
  onChange,
  format,
  context,
  dayLabel,
  sheetDescription,
  chips = [],
  size = "lg",
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (hhmm: string) => void;
  format: TimeFormat;
  context?: "bed" | "wake";
  /** The calendar day this time falls on, e.g. "Sun 16 Nov". */
  dayLabel?: string;
  sheetDescription?: string;
  chips?: TimeChip[];
  size?: "lg" | "md";
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const parts = clockParts(value, format);
  const visibleChips = chips.filter((c) => c.value && c.value !== value);

  return (
    <div role="group" aria-labelledby={labelId} className="min-w-0">
      <p id={labelId} className="mb-1.5 flex items-center gap-1.5 text-[0.75rem] font-semibold text-paper/65">
        {Icon && <Icon className="h-3.5 w-3.5 text-accent" />}
        {label}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={
          value
            ? `${label}: ${formatClock(value, format)}${dayLabel ? `, ${dayLabel}` : ""}. Change`
            : `${label}: not set. Set the time`
        }
        className={cn(
          "field group flex w-full flex-col items-start rounded-2xl border border-line bg-paper/[0.03] text-left transition-colors",
          "hover:border-paper/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
          size === "lg" ? "px-4 py-3" : "px-3.5 py-2.5",
        )}
      >
        {value ? (
          <span
            className={cn(
              "tabular font-display font-bold leading-none tracking-tightest text-paper",
              size === "lg" ? "text-[1.7rem]" : "text-xl",
            )}
          >
            {parts.main}
            {parts.suffix && <span className="ml-1 text-sm font-semibold text-paper/55">{parts.suffix}</span>}
          </span>
        ) : (
          <span className={cn("font-semibold text-paper/45", size === "lg" ? "py-1 text-base" : "text-sm")}>Set time</span>
        )}
        {dayLabel && <span className="mt-1.5 text-[0.68rem] text-paper/50">{dayLabel}</span>}
      </button>
      {visibleChips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleChips.map((c) => (
            <button
              key={`${c.label}-${c.value}`}
              type="button"
              onClick={() => onChange(c.value)}
              aria-label={`${label}: set to ${c.label.toLowerCase()}, ${formatClock(c.value, format)}`}
              className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.7rem] font-semibold text-paper/70 transition-colors hover:border-accent/40 hover:text-paper"
            >
              {c.label} · {formatClock(c.value, format)}
            </button>
          ))}
        </div>
      )}
      <TimeSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description={sheetDescription}
        value={value}
        onChange={onChange}
        format={format}
        context={context}
      />
    </div>
  );
}
