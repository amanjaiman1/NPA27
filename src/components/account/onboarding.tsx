"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Route } from "lucide-react";
import { useChronicle } from "@/lib/store";
import {
  HABIT_TEMPLATES,
  defaultSetup,
  estimatedPrelimsDate,
  type AccountSetup,
} from "@/lib/seed";
import { toISODate, cn } from "@/lib/utils";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthMessage } from "@/components/auth/auth-ui";
import { FullScreen } from "./boot-screen";
import { useAccount } from "./account-session";
import { OptionalSelect, TimezoneSelect, examChoices, examYear } from "./profile-fields";

/** Shows first-run setup until the account has been set up. */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const onboarded = useChronicle((s) => Boolean(s.profile.onboardedAt));
  if (!onboarded) return <Onboarding />;
  return <>{children}</>;
}

const STEPS = ["You", "Your exam", "Your routine"] as const;

function Onboarding() {
  const { user, mode } = useAccount();
  const auth = useAuth();
  const completeOnboarding = useChronicle((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState<AccountSetup>(() => ({
    ...defaultSetup(),
    name: user?.name ?? "",
  }));
  const [examDateTouched, setExamDateTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = toISODate(new Date());

  const patch = (p: Partial<AccountSetup>) => setSetup((s) => ({ ...s, ...p }));

  function problemFor(index: number): string | null {
    if (index === 0) {
      const name = setup.name.trim();
      if (!name) return "Tell us what to call you.";
      if (name.length > 60) return "Keep the name under 60 characters.";
    }
    if (index === 1) {
      if (!setup.examDate) return "Pick your Prelims date. An estimate is fine.";
      if (!setup.startDate || setup.startDate > today) return "The start date can't be in the future.";
    }
    if (index === 2) {
      if (!(setup.dailyHourTarget >= 1 && setup.dailyHourTarget <= 16))
        return "Set a daily target between 1 and 16 hours.";
    }
    return null;
  }

  function next() {
    const problem = problemFor(step);
    setError(problem);
    if (problem) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  }

  function finish() {
    const year = examYear(setup.targetExam);
    completeOnboarding({ ...setup, useRoadmap: year === 2027 && setup.useRoadmap });
    // Keep the account's own record of the name in step, for emails and the menu.
    if (mode === "cloud" && setup.name.trim() !== (user?.name ?? "")) void auth.updateName(setup.name);
  }

  const year = examYear(setup.targetExam);

  return (
    <FullScreen>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        className="w-full max-w-lg rounded-3xl border border-line bg-card p-6 shadow-lift sm:p-8"
      >
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8" />
          <div className="min-w-0">
            <p className="eyebrow">Set up your chronicle</p>
            <p className="text-xs text-paper/45">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-paper/10")}
            />
          ))}
        </div>

        <div className="mt-7 space-y-5">
          {step === 0 && (
            <>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tightest text-paper">
                  Welcome. Let&apos;s make this yours.
                </h1>
                <p className="mt-1.5 text-sm leading-relaxed text-paper/55">
                  Everything you log here is private to your account. Three quick steps and
                  your chronicle is ready.
                </p>
              </div>
              <Field label="What should we call you?">
                <Input
                  value={setup.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="Your name"
                  autoComplete="name"
                  autoFocus
                  maxLength={60}
                />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="font-display text-2xl font-bold tracking-tightest text-paper">
                Which attempt are you preparing for?
              </h1>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Target exam">
                  <Select
                    value={setup.targetExam}
                    onChange={(e) => {
                      const targetExam = e.target.value;
                      const y = examYear(targetExam);
                      patch({
                        targetExam,
                        ...(y && !examDateTouched ? { examDate: estimatedPrelimsDate(y) } : {}),
                      });
                    }}
                  >
                    {examChoices(setup.targetExam).map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Prelims date" hint="An estimate is fine; change it any time.">
                  <Input
                    type="date"
                    value={setup.examDate}
                    onChange={(e) => {
                      setExamDateTouched(true);
                      patch({ examDate: e.target.value });
                    }}
                  />
                </Field>
                <Field label="Preparation started">
                  <Input
                    type="date"
                    value={setup.startDate}
                    max={today}
                    onChange={(e) => patch({ startDate: e.target.value })}
                  />
                </Field>
                <Field label="Attempt">
                  <Select
                    value={String(setup.attemptNumber)}
                    onChange={(e) => patch({ attemptNumber: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? "First attempt" : `Attempt ${n}`}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Optional subject" hint="Adds it to your syllabus. You can add its topics later.">
                <OptionalSelect
                  value={setup.optionalSubject}
                  onChange={(optionalSubject) => patch({ optionalSubject })}
                />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="font-display text-2xl font-bold tracking-tightest text-paper">
                Your daily routine
              </h1>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Daily study target (hours)">
                  <Input
                    type="number"
                    min={1}
                    max={16}
                    step={0.5}
                    value={setup.dailyHourTarget}
                    onChange={(e) => patch({ dailyHourTarget: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Time zone" hint="Used to time your notifications.">
                  <TimezoneSelect value={setup.timezone} onChange={(timezone) => patch({ timezone })} />
                </Field>
              </div>

              <fieldset>
                <legend className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/60">
                  Habits to track
                </legend>
                <div className="flex flex-wrap gap-2">
                  {HABIT_TEMPLATES.map((h) => {
                    const on = setup.habits.includes(h.id);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          patch({
                            habits: on ? setup.habits.filter((x) => x !== h.id) : [...setup.habits, h.id],
                          })
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all",
                          on
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-line text-paper/60 hover:border-paper/25 hover:text-paper",
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                        {h.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[0.7rem] text-paper/40">Add your own later on the Habits page.</p>
              </fieldset>

              {year === 2027 && (
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-paper/[0.03] p-4">
                  <input
                    type="checkbox"
                    checked={setup.useRoadmap}
                    onChange={(e) => patch({ useRoadmap: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-paper">
                      <Route className="h-4 w-4 text-accent" /> Use the built-in CSE 2027 roadmap
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-paper/55">
                      A week-by-week plan from June 2026: GS2, GS3, GS1 then GS4, with Sociology
                      alongside. Switch it off any time in Settings.
                    </span>
                  </span>
                </label>
              )}
            </>
          )}

          {error && <AuthMessage tone="error">{error}</AuthMessage>}
        </div>

        <div className="mt-8 flex items-center gap-2.5">
          {step > 0 && (
            <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          )}
          <span className="flex-1" />
          <Button type="submit" size="lg">
            {step < STEPS.length - 1 ? (
              <>
                Continue <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Start my chronicle <Check className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </FullScreen>
  );
}
