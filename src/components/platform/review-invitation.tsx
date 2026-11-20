"use client";

/* The one place the app asks for a review: a card on the dashboard, shown
   only while the database says this account may be asked
   (platform_review_invite_due: enough real use, no review yet, not
   postponed or declined). "Later" asks again in two weeks, and the third
   "Later" or a "No thanks" stops asking. Nothing pops up or blocks the page. */

import { Suspense, lazy, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareHeart, PenLine } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { useInbox } from "@/components/platform/inbox";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** The five-step form, downloaded when a student chooses to write: most dashboard visits never do. */
const ReviewWizard = lazy(() => import("@/components/settings/review-wizard").then((m) => ({ default: m.ReviewWizard })));
const loadWizard = () => void import("@/components/settings/review-wizard");

export function ReviewInvitation({ className }: { className?: string }) {
  const inbox = useInbox();
  const toast = useToast();
  const router = useRouter();
  const name = useChronicle((s) => s.profile.name);
  const [writing, setWriting] = useState(false);
  /** Mounted from the first "Write a review" on, so closing it still animates. */
  const [opened, setOpened] = useState(false);
  // Kept while the form is open, so the card doesn't vanish under it.
  if (!inbox || (!inbox.reviewInvite && !writing)) return null;

  return (
    <>
      <Card role="region" className={cn("relative overflow-hidden p-5 sm:p-6", className)} aria-labelledby="review-invite-title">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-accent/[0.08] blur-2xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent/[0.12] text-accent">
              <MessageSquareHeart className="h-[1.1rem] w-[1.1rem]" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="eyebrow">A request from the team</p>
              <h2 id="review-invite-title" className="mt-1 text-[0.95rem] font-semibold leading-snug text-paper">
                How has DoOrDie been for your preparation?
              </h2>
              <p className="mt-1 max-w-2xl text-[0.82rem] leading-relaxed text-paper/70">
                You&apos;ve used it for a while now. A short review, good or bad, tells the team what to improve. It takes about
                three minutes, and nothing goes on the website unless you choose that.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              onPointerEnter={loadWizard}
              onFocus={loadWizard}
              onClick={() => {
                setOpened(true);
                setWriting(true);
              }}
            >
              <PenLine className="h-4 w-4" aria-hidden /> Write a review
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                inbox.answerInvite("postpone");
                toast({ title: "Maybe later, then", description: "You can write one any time from Settings." });
              }}
            >
              Later
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                inbox.answerInvite("dismiss");
                toast({ title: "We won't ask again", description: "If you change your mind, it's in Settings." });
              }}
            >
              No thanks
            </Button>
          </div>
        </div>
      </Card>
      {opened && (
        <Suspense fallback={null}>
      <ReviewWizard
        open={writing}
        initial={null}
        defaultName={name.trim().split(/\s+/)[0] ?? ""}
        source="invitation"
        onClose={() => setWriting(false)}
        onSaved={() => {
          setWriting(false);
          inbox.answerInvite("done");
          toast({
            title: "Review sent",
            description: "Thank you. You can see where it stands, or change it, in Settings.",
            tone: "success",
            action: { label: "Open Settings", onClick: () => router.push("/settings#review") },
          });
        }}
      />
        </Suspense>
      )}
    </>
  );
}
