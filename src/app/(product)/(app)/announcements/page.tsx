"use client";

import { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { AnnouncementBody } from "@/components/platform/announcement-card";
import { useInbox } from "@/components/platform/inbox";
import type { MyAnnouncement } from "@/lib/platform/types";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

function Item({ a, fresh }: { a: MyAnnouncement; fresh: boolean }) {
  return (
    <Card id={a.id} className="scroll-mt-24 p-5 sm:p-6">
      {fresh && (
        <Badge tone="accent" className="mb-3">
          New
        </Badge>
      )}
      <AnnouncementBody
        title={a.title}
        body={a.body}
        category={a.category}
        date={<time dateTime={a.startsAt}>{day.format(new Date(a.startsAt))}</time>}
      />
    </Card>
  );
}

/** Everything the team has announced, newest first. Opening it marks them read. */
export default function AnnouncementsPage() {
  const inbox = useInbox();
  // Which were unread when the page opened, so they stay marked "New" while it's open.
  const [fresh, setFresh] = useState<Set<string> | null>(null);
  const markAll = useRef(inbox?.markAllRead);
  markAll.current = inbox?.markAllRead;
  const unreadIds = inbox?.items.filter((a) => !a.readAt).map((a) => a.id).join(",") ?? "";

  useEffect(() => {
    if (!unreadIds) return;
    setFresh((prev) => new Set([...(prev ?? []), ...unreadIds.split(",")]));
    markAll.current?.();
  }, [unreadIds]);

  const items = inbox?.items ?? [];
  const now = items.filter((a) => a.active);
  const earlier = items.filter((a) => !a.active);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Megaphone}
        eyebrow="From the team"
        title="Announcements"
        description="New features, changes and planned maintenance, from the people who make DoOrDie."
      />
      {!inbox ? (
        <EmptyState
          icon={<Megaphone className="h-5 w-5" />}
          title="Announcements come with an account"
          description="This copy of DoOrDie keeps everything on this device, so there's no team inbox to show."
        />
      ) : !items.length ? (
        <EmptyState icon={<Megaphone className="h-5 w-5" />} title="Nothing announced yet" description="When the team has news, it appears here and at the top of the app." />
      ) : (
        <>
          {now.length > 0 && (
            <section aria-label="Current" className="space-y-4">
              {now.map((a) => (
                <Item key={a.id} a={a} fresh={Boolean(fresh?.has(a.id))} />
              ))}
            </section>
          )}
          {earlier.length > 0 && (
            <section aria-labelledby="earlier-title" className="space-y-4">
              <h2 id="earlier-title" className="eyebrow pt-2">
                Earlier
              </h2>
              {earlier.map((a) => (
                <Item key={a.id} a={a} fresh={false} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
