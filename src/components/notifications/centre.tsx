"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  Clock,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useChronicle } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import {
  PRIORITY_LABEL,
  type NoticeView,
  type Priority,
} from "@/lib/notifications";
import { useNotifications } from "./use-notifications";
import { SettingsPane } from "./settings-pane";

/** How long "later" is, per priority. Urgent things come back sooner. */
const SNOOZE_DAYS: Record<Priority, number> = {
  critical: 1,
  high: 1,
  normal: 3,
  low: 7,
};

/**
 * Semantic colours rather than the accent, deliberately: the accent is
 * user-chosen and is crimson by default, which would make a `normal` dot
 * indistinguishable from a `critical` one. This ramp — red, amber, blue, grey —
 * holds on all six surfaces. The group heading carries the same information in
 * words, so colour is reinforcement and never the only channel.
 */
const DOT: Record<Priority, string> = {
  critical: "bg-danger",
  high: "bg-warning",
  normal: "bg-info",
  low: "bg-paper/30",
};

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`;
}

function NoticeRow({
  notice,
  today,
  onNavigate,
}: {
  notice: NoticeView;
  today: string;
  onNavigate: () => void;
}) {
  const markRead = useChronicle((s) => s.markNoticeRead);
  const dismiss = useChronicle((s) => s.dismissNotice);
  const snooze = useChronicle((s) => s.snoozeNotice);

  return (
    <div
      className={cn(
        "group relative rounded-2xl border px-3.5 py-3 transition-colors",
        notice.read
          ? "border-line/60 bg-transparent"
          : "border-line bg-paper/[0.04]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
            DOT[notice.priority],
            notice.read && "opacity-35",
          )}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-semibold leading-snug tracking-snugg",
              notice.read ? "text-paper/55" : "text-paper",
            )}
          >
            {notice.title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-paper/50">
            {notice.body}
          </p>

          <div className="mt-2.5 flex items-center gap-1">
            <Link
              href={notice.href}
              onClick={() => {
                /* Acting on it counts as reading it. */
                markRead(notice.id);
                onNavigate();
              }}
              className="flex items-center gap-1 rounded-full bg-paper/[0.07] px-2.5 py-1 text-[0.7rem] font-semibold text-paper transition-colors hover:bg-paper/[0.12]"
            >
              {notice.cta}
              <ArrowRight className="h-3 w-3" />
            </Link>

            <span className="flex-1" />

            {!notice.read && (
              <button
                onClick={() => markRead(notice.id)}
                aria-label={`Mark "${notice.title}" as read`}
                title="Mark as read"
                className="grid h-7 w-7 place-items-center rounded-full text-paper/35 transition-colors hover:bg-paper/[0.07] hover:text-paper"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() =>
                snooze(
                  notice.id,
                  shiftIso(today, SNOOZE_DAYS[notice.priority]),
                )
              }
              aria-label={`Snooze "${notice.title}"`}
              title={`Hide for ${SNOOZE_DAYS[notice.priority]} day${
                SNOOZE_DAYS[notice.priority] === 1 ? "" : "s"
              }`}
              className="grid h-7 w-7 place-items-center rounded-full text-paper/35 transition-colors hover:bg-paper/[0.07] hover:text-paper"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => dismiss(notice.id)}
              aria-label={`Dismiss "${notice.title}"`}
              title="Dismiss"
              className="grid h-7 w-7 place-items-center rounded-full text-paper/35 transition-colors hover:bg-paper/[0.07] hover:text-paper"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const { inbox, settings, today } = useNotifications();
  const markMany = useChronicle((s) => s.markNoticesRead);
  const [tab, setTab] = useState<"inbox" | "settings">("inbox");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* The backdrop is a real element so a tap anywhere outside closes it. */}
      <motion.div
        className="fixed inset-0 z-[55] bg-scrim/40 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-label="Notifications"
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        /* A sheet on a phone, a dropdown under the bell on a desktop. */
        className="fixed inset-x-2 bottom-2 top-16 z-[56] flex flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-lift sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[4.6rem] sm:h-auto sm:max-h-[min(34rem,calc(100dvh-6rem))] sm:w-[24rem]"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="font-display text-base font-semibold tracking-snugg text-paper">
            {tab === "inbox" ? "Notifications" : "Notification settings"}
          </h2>
          <span className="flex-1" />

          {tab === "inbox" && inbox.unread > 0 && (
            <button
              onClick={() => markMany(inbox.items.map((i) => i.id))}
              title="Mark all as read"
              aria-label="Mark all as read"
              className="grid h-8 w-8 place-items-center rounded-full text-paper/45 transition-colors hover:bg-paper/[0.07] hover:text-paper"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setTab(tab === "inbox" ? "settings" : "inbox")}
            title={tab === "inbox" ? "Settings" : "Back to notifications"}
            aria-label={tab === "inbox" ? "Notification settings" : "Back to notifications"}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-paper/[0.07]",
              tab === "settings" ? "text-accent" : "text-paper/45 hover:text-paper",
            )}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            aria-label="Close notifications"
            className="grid h-8 w-8 place-items-center rounded-full text-paper/45 transition-colors hover:bg-paper/[0.07] hover:text-paper"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4">
          {tab === "settings" ? (
            <SettingsPane settings={settings} />
          ) : inbox.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-paper/[0.06] text-accent">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-paper">Nothing needs you</p>
              <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-paper/45">
                Revisions are on schedule, today is logged and no goal is
                slipping. This list is worked out from your data, so it fills
                itself back in.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {inbox.groups.map((group) => (
                <section key={group.priority}>
                  <p className="eyebrow mb-2">
                    {PRIORITY_LABEL[group.priority]}
                  </p>
                  <div className="space-y-2">
                    {group.items.map((n) => (
                      <NoticeRow
                        key={n.id}
                        notice={n}
                        today={today}
                        onNavigate={onClose}
                      />
                    ))}
                  </div>
                </section>
              ))}

              <p className="pt-1 text-center text-[0.7rem] leading-relaxed text-paper/35">
                Worked out from your own data — nothing is stored, so anything
                you resolve disappears on its own.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

/**
 * The bell, its unread count, and the panel behind it. Self-contained so the
 * topbar only has to render one element, and so the whole feature can be pulled
 * out by deleting one line.
 */
export function NotificationCentre() {
  const [open, setOpen] = useState(false);
  const { inbox } = useNotifications();
  const mounted = useMounted();

  /**
   * The count is hydration-sensitive — it comes from localStorage, which the
   * server cannot know — so it is only rendered after mount. Without this the
   * server's "no badge" markup and the client's "3" disagree.
   */
  const unread = mounted ? inbox.unread : 0;
  /** Anything critical or high changes the badge from informational to urgent. */
  const urgent = inbox.items.some(
    (i) => !i.read && (i.priority === "critical" || i.priority === "high"),
  );

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        title="Notifications"
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-full text-paper/55 transition-all hover:bg-paper/[0.07] hover:text-paper"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span
            className={cn(
              "tabular absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.6rem] font-bold leading-none",
              /* `text-ink` inverts with the surface, which `text-white` would
                 not: on a dark surface `--danger` is a light rose, and white on
                 it is unreadable. */
              urgent ? "bg-danger text-ink" : "bg-accent text-accent-fg",
            )}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && <Panel onClose={() => setOpen(false)} />}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
