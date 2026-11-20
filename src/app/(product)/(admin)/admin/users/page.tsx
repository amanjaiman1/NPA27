"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/misc";
import { Field, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { AdminHeader, ErrorPanel, HistoryList, LoadingRows, Pager, ReasonDialog, SearchBox, When } from "@/components/admin/ui";
import { useAdminActor } from "@/components/admin/admin-context";
import { adminApi, useAdmin } from "@/lib/platform/client";
import { ROLE_LABEL } from "@/lib/platform/roles";
import { REVIEW_STATUS } from "@/lib/platform/content";
import { SUSPENSION_LENGTHS } from "@/lib/platform/validate";
import type { AccountBrief, Page, UserDetail } from "@/lib/platform/types";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "recent", label: "Joined in 30 days" },
  { value: "suspended", label: "Suspended" },
  { value: "unconfirmed", label: "Unconfirmed" },
  { value: "staff", label: "Staff" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];
const LIMIT = 25;

function StatusBadges({ user }: { user: AccountBrief }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {user.suspended && <Badge tone="danger">Suspended</Badge>}
      {!user.emailConfirmedAt && <Badge tone="warning">Email unconfirmed</Badge>}
      {user.role && (
        <Badge tone="accent">
          <ShieldCheck className="mr-1 h-3 w-3" aria-hidden />
          {ROLE_LABEL[user.role]}
        </Badge>
      )}
      {!user.suspended && user.emailConfirmedAt && !user.role && <Badge tone="ghost">Active</Badge>}
    </span>
  );
}

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const f = params.get("filter");
    if (f && FILTERS.some((x) => x.value === f)) setFilter(f as Filter);
    // "?id=…" opens one account, for links from Reviews and Feedback.
    const id = params.get("id");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) setOpen(id.toLowerCase());
  }, []);

  const path = useMemo(() => {
    const p = new URLSearchParams({ filter, limit: String(LIMIT), offset: String(offset) });
    if (q) p.set("q", q);
    return `users?${p}`;
  }, [q, filter, offset]);
  const list = useAdmin<Page<AccountBrief>>(path);

  return (
    <div className="space-y-6">
      <AdminHeader
        icon={Users}
        title="Users"
        description="Every account, with what's needed to run the platform: email, dates, status and role. What anyone writes in DoOrDie is never shown here."
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setOffset(0);
          }}
          placeholder="Search by email, or paste an account id"
          label="Search accounts"
        />
        <Segmented
          label="Show"
          compact
          options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setOffset(0);
          }}
        />
      </div>
      <ErrorPanel error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <LoadingRows /> : list.data && <UserTable page={list.data} onOpen={setOpen} />}
      {list.data && <Pager total={list.data.total} limit={list.data.limit} offset={list.data.offset} onChange={setOffset} />}
      <UserDialog id={open} onClose={() => setOpen(null)} onChanged={list.reload} />
    </div>
  );
}

function UserTable({ page, onOpen }: { page: Page<AccountBrief>; onOpen: (id: string) => void }) {
  if (!page.items.length) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-medium text-paper">No accounts match.</p>
        <p className="mt-1 text-xs text-paper/55">Try part of the email, or another filter.</p>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Accounts</caption>
        <thead className="border-b border-line bg-paper/[0.02] text-xs text-paper/55">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">Account</th>
            <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Joined</th>
            <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Last active</th>
            <th scope="col" className="hidden px-3 py-3 font-medium xl:table-cell">Last sign-in</th>
            <th scope="col" className="hidden px-3 py-3 font-medium sm:table-cell">Status</th>
            <th scope="col" className="px-5 py-3 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {page.items.map((u) => (
            <tr key={u.id} className="transition-colors hover:bg-paper/[0.02]">
              {/* w-full with max-w-0: the column takes the room left, and long emails truncate instead of widening the table. */}
              <td className="w-full max-w-0 px-5 py-3">
                <p className="truncate font-medium text-paper">{u.email}</p>
                <p className="hidden truncate font-mono text-[0.68rem] text-paper/45 sm:block">{u.id}</p>
                <div className="mt-1.5 sm:hidden">
                  <StatusBadges user={u} />
                </div>
              </td>
              <td className="hidden whitespace-nowrap px-3 py-3 text-paper/70 md:table-cell">
                <When at={u.createdAt} date />
              </td>
              <td className="hidden whitespace-nowrap px-3 py-3 text-paper/70 lg:table-cell">
                <When at={u.lastActiveAt} fallback="Not recorded" />
              </td>
              <td className="hidden whitespace-nowrap px-3 py-3 text-paper/70 xl:table-cell">
                <When at={u.lastSignInAt} />
              </td>
              <td className="hidden px-3 py-3 sm:table-cell">
                <StatusBadges user={u} />
              </td>
              <td className="px-5 py-3 text-right">
                <Button size="sm" variant="ghost" onClick={() => onOpen(u.id)} aria-label={`Manage ${u.email}`}>
                  Manage
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-paper/55">{label}</dt>
      <dd className="min-w-0 text-right text-paper">{children}</dd>
    </div>
  );
}

/** One account: its metadata, suspension, and what administrators have done to it. */
function UserDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { actor, can } = useAdminActor();
  const toast = useToast();
  const user = useAdmin<UserDetail>(id ? `users/${id}` : null);
  const [ask, setAsk] = useState<"suspend" | "restore" | null>(null);
  const [length, setLength] = useState<string>("indefinite");
  const u = id && user.data?.id === id ? user.data : null;
  const self = u?.id === actor.userId;
  const mayChange = can("users.suspend") && u && !self && !u.role;

  async function act(kind: "suspend" | "restore", reason: string) {
    if (!u) return;
    await adminApi.post(`users/${u.id}/${kind}`, kind === "suspend" ? { reason, length } : { reason: reason || null });
    toast({ title: kind === "suspend" ? "Account suspended" : "Account restored", description: u.email });
    user.reload();
    onChanged();
  }

  return (
    <Modal open={Boolean(id)} onClose={onClose} title={u?.email ?? "Account"} description="Account details only. Nothing the person wrote in DoOrDie." className="sm:max-w-lg">
      {user.error && <ErrorPanel error={user.error} onRetry={user.reload} />}
      {!u && !user.error && <LoadingRows rows={2} />}
      {u && (
        <div className="space-y-5">
          <StatusBadges user={u} />
          <dl className="divide-y divide-line rounded-2xl border border-line px-4">
            <Detail label="Account id">
              <span className="break-all font-mono text-xs">{u.id}</span>
            </Detail>
            <Detail label="Joined">
              <When at={u.createdAt} />
            </Detail>
            <Detail label="Email confirmed">
              <When at={u.emailConfirmedAt} fallback="Not yet" />
            </Detail>
            <Detail label="Last active">
              <When at={u.lastActiveAt} fallback="Not recorded" />
            </Detail>
            <Detail label="Last sign-in">
              <When at={u.lastSignInAt} />
            </Detail>
            {u.suspended && (
              <Detail label="Suspended until">
                <When at={u.bannedUntil} />
              </Detail>
            )}
            <Detail label="Review">{u.reviewStatus ? REVIEW_STATUS.label[u.reviewStatus] : "None"}</Detail>
            <Detail label="Feedback sent">{u.feedbackCount}</Detail>
          </dl>

          {can("users.suspend") && (
            <div className="rounded-2xl border border-line bg-paper/[0.02] p-4">
              {self ? (
                <p className="text-xs text-paper/60">This is your account. Nobody can suspend their own.</p>
              ) : u.role ? (
                <p className="text-xs text-paper/60">
                  This account has the {ROLE_LABEL[u.role]} role. A Super Admin has to remove it before the account can be suspended.
                </p>
              ) : u.suspended ? (
                <Button variant="ghost" onClick={() => setAsk("restore")}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Restore account
                </Button>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-relaxed text-paper/60">
                    Suspending stops new sign-ins at once. A session already open lasts until its token expires, within the hour. Nothing is deleted.
                  </p>
                  <Button variant="danger" onClick={() => setAsk("suspend")} disabled={!mayChange} className="shrink-0">
                    <Ban className="h-4 w-4" aria-hidden /> Suspend
                  </Button>
                </div>
              )}
            </div>
          )}

          <section aria-label="History">
            <p className="eyebrow mb-2">History</p>
            <HistoryList entries={u.history} empty="No administrator has changed this account." />
          </section>
        </div>
      )}

      <ReasonDialog
        open={ask === "suspend"}
        onClose={() => setAsk(null)}
        title="Suspend this account?"
        description={u ? `${u.email} won't be able to sign in. Their data stays as it is.` : undefined}
        label="Why"
        confirmLabel="Suspend account"
        placeholder="Repeated spam in feedback."
        onConfirm={(reason) => act("suspend", reason)}
      >
        <Field label="For">
          <Select value={length} onChange={(e) => setLength(e.target.value)}>
            {SUSPENSION_LENGTHS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
      </ReasonDialog>
      <ReasonDialog
        open={ask === "restore"}
        onClose={() => setAsk(null)}
        title="Restore this account?"
        description="They can sign in again straight away."
        label="Note"
        required={false}
        tone="default"
        confirmLabel="Restore account"
        onConfirm={(reason) => act("restore", reason)}
      />
    </Modal>
  );
}
