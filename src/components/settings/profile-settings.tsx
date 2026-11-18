"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { useChronicle } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { buildOptionalSubject, deviceTimeZone, optionalSubjectId } from "@/lib/seed";
import { toISODate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useAuth } from "@/components/auth/auth-provider";
import { useAccount } from "@/components/account/account-session";
import {
  OptionalSelect,
  TimezoneSelect,
  examChoices,
} from "@/components/account/profile-fields";
import { SaveNote, SettingsSection } from "./section";

type Draft = Pick<
  Profile,
  | "name"
  | "mission"
  | "targetExam"
  | "examDate"
  | "startDate"
  | "attemptNumber"
  | "optionalSubject"
  | "dailyHourTarget"
  | "timezone"
>;

function draftFrom(p: Profile): Draft {
  return {
    name: p.name,
    mission: p.mission ?? "",
    targetExam: p.targetExam,
    examDate: p.examDate,
    startDate: p.startDate,
    attemptNumber: p.attemptNumber,
    optionalSubject: p.optionalSubject,
    dailyHourTarget: p.dailyHourTarget,
    timezone: p.timezone ?? deviceTimeZone(),
  };
}

export function ProfileSettings() {
  const profile = useChronicle((s) => s.profile);
  const subjects = useChronicle((s) => s.subjects);
  const updateProfile = useChronicle((s) => s.updateProfile);
  const upsertSubject = useChronicle((s) => s.upsertSubject);
  const auth = useAuth();
  const { mode, user } = useAccount();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(profile));
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const today = toISODate(new Date());
  const patch = (p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setNote(null);
  };

  function save(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return setNote({ kind: "err", text: "Your name can't be empty." });
    if (!draft.examDate) return setNote({ kind: "err", text: "Pick your Prelims date." });
    if (!draft.startDate || draft.startDate > today)
      return setNote({ kind: "err", text: "The start date can't be in the future." });
    if (!(draft.dailyHourTarget >= 1 && draft.dailyHourTarget <= 16))
      return setNote({ kind: "err", text: "Set a daily target between 1 and 16 hours." });

    updateProfile({ ...draft, name, mission: draft.mission?.trim() || undefined });

    // A newly chosen optional joins the syllabus. A previous one stays, with
    // whatever progress it has, until it's removed from the Subjects page.
    if (draft.optionalSubject && !subjects.some((s) => s.id === optionalSubjectId(draft.optionalSubject))) {
      upsertSubject(buildOptionalSubject(draft.optionalSubject));
    }
    if (mode === "cloud" && name !== (user?.name ?? "")) void auth.updateName(name);
    setNote({ kind: "ok", text: "Saved." });
  }

  return (
    <SettingsSection
      id="profile"
      icon={UserRound}
      title="Profile & exam"
      description="Your countdowns, targets and notifications all work from these."
    >
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} maxLength={60} autoComplete="name" />
          </Field>
          <Field label="Mission (optional)" hint="One line, shown on your dashboard.">
            <Input
              value={draft.mission ?? ""}
              onChange={(e) => patch({ mission: e.target.value })}
              placeholder="e.g. Serve in my home state"
              maxLength={80}
            />
          </Field>
          <Field label="Target exam">
            <Select value={draft.targetExam} onChange={(e) => patch({ targetExam: e.target.value })}>
              {examChoices(draft.targetExam).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prelims date">
            <Input type="date" value={draft.examDate} onChange={(e) => patch({ examDate: e.target.value })} />
          </Field>
          <Field label="Preparation started">
            <Input type="date" value={draft.startDate} max={today} onChange={(e) => patch({ startDate: e.target.value })} />
          </Field>
          <Field label="Attempt">
            <Select value={String(draft.attemptNumber)} onChange={(e) => patch({ attemptNumber: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "First attempt" : `Attempt ${n}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Optional subject">
            <OptionalSelect value={draft.optionalSubject} onChange={(optionalSubject) => patch({ optionalSubject })} />
          </Field>
          <Field label="Daily study target (hours)">
            <Input
              type="number"
              min={1}
              max={16}
              step={0.5}
              value={draft.dailyHourTarget}
              onChange={(e) => patch({ dailyHourTarget: Number(e.target.value) })}
            />
          </Field>
          <Field label="Time zone" hint="When background notifications may arrive.">
            <TimezoneSelect value={draft.timezone ?? ""} onChange={(timezone) => patch({ timezone })} />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit">Save profile</Button>
          <SaveNote note={note} />
        </div>
      </form>
    </SettingsSection>
  );
}
