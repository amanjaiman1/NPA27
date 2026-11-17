"use client";

import { useMemo } from "react";
import { Select } from "@/components/ui/form";
import { OPTIONAL_SUBJECTS, nextExamYear } from "@/lib/seed";

/** Target exam choices: the next four CSE years, plus whatever is already set. */
export function examChoices(current?: string): string[] {
  const first = nextExamYear();
  const years = [0, 1, 2, 3].map((i) => `UPSC CSE ${first + i}`);
  return current && !years.includes(current) ? [current, ...years] : years;
}

/** "UPSC CSE 2027" → 2027, or null for anything else. */
export function examYear(targetExam: string): number | null {
  const m = /\b(20\d\d)\b/.exec(targetExam);
  return m ? Number(m[1]) : null;
}

export function OptionalSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const options = OPTIONAL_SUBJECTS.includes(value) || !value ? OPTIONAL_SUBJECTS : [value, ...OPTIONAL_SUBJECTS];
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not decided yet</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </Select>
  );
}

export function TimezoneSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const zones = useMemo(() => {
    let list: string[] = [];
    try {
      list = Intl.supportedValuesOf("timeZone");
    } catch {
      list = [];
    }
    if (!list.length) list = ["Asia/Kolkata", "UTC"];
    return value && !list.includes(value) ? [value, ...list] : list;
  }, [value]);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {zones.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, " ")}
        </option>
      ))}
    </Select>
  );
}
