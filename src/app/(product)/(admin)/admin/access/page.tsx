"use client";

import { useState } from "react";
import { ExternalLink, KeyRound, ShieldCheck, Terminal, UserMinus, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { AdminHeader, ErrorPanel, LoadingRows, ReasonDialog, When, actionLabel, actorLine } from "@/components/admin/ui";
import { useAdminActor } from "@/components/admin/admin-context";
import { adminApi, useAdmin } from "@/lib/platform/client";
import { GRANTABLE_ROLES, PLATFORM_ROLES, ROLE_LABEL, ROLE_SUMMARY, isPlatformRole, type GrantableRole } from "@/lib/platform/roles";
import type { AccessResponse, Member } from "@/lib/platform/types";

const GRANT_SQL = `insert into public.platform_admin_memberships (user_id, role)
values ('<account id>', 'super_admin')
on conflict (user_id) do update set role = 'super_admin';`;

const roleWord = (v: unknown) => (isPlatformRole(v) ? ROLE_LABEL[v] : String(v ?? "–"));

export default function AdminAccessPage() {
  const access = useAdmin<AccessResponse>("access");
  return (
    <div className="space-y-6">
      <AdminHeader
        icon={KeyRound}
        title="Admin access"
        description="Who can open the Admin Center, and what each role covers. Every grant, change and removal is recorded with who made it."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {PLATFORM_ROLES.map((r) => (
          <Card key={r} className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-paper">
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden /> {ROLE_LABEL[r]}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-paper/60">{ROLE_SUMMARY[r]}</p>
            {r === "super_admin" && <p className="mt-2 text-xs leading-relaxed text-paper/50">Only granted in the Supabase SQL Editor.</p>}
          </Card>
        ))}
      </div>
      <ErrorPanel error={access.error} onRetry={access.reload} />
      {/* min-w-0 on both columns: the SQL block scrolls inside its card instead of widening the page on a phone. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-labelledby="members-title" className="min-w-0 space-y-3">
          <h2 id="members-title" className="text-base font-semibold tracking-snugg text-paper">
            People with a role
          </h2>
          {access.loading && !access.data ? <LoadingRows rows={3} /> : access.data && <Members data={access.data} onChanged={access.reload} />}
        </section>
        <div className="min-w-0 space-y-6">
          <GrantForm onGranted={access.reload} />
          <SuperAdminNote />
        </div>
      </div>
      {access.data && <RoleHistory entries={access.data.history} />}
    </div>
  );
}

function Members({ data, onChanged }: { data: AccessResponse; onChanged: () => void }) {
  const { actor } = useAdminActor();
  const toast = useToast();
  const [change, setChange] = useState<{ member: Member; role: GrantableRole } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  return (
    <>
      <Card className="divide-y divide-line">
        {data.members.map((m) => {
          const self = m.id === actor.userId;
          const fixed = m.role === "super_admin";
          return (
            <div key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-paper">{m.email}</span>
                  {self && <Badge tone="outline">You</Badge>}
                  {m.suspended && <Badge tone="danger">Suspended</Badge>}
                </p>
                <p className="mt-0.5 text-xs text-paper/55">
                  Since <When at={m.grantedAt} date />
                  {m.grantedByEmail ? ` · granted by ${m.grantedByEmail}` : fixed ? " · added in the SQL Editor" : ""}
                </p>
              </div>
              {fixed || self || !m.role ? (
                <Badge tone="accent" className="self-start sm:self-auto">
                  {roleWord(m.role)}
                </Badge>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    aria-label={`Role for ${m.email}`}
                    value={m.role}
                    onChange={(e) => setChange({ member: m, role: e.target.value as GrantableRole })}
                    className="h-9 w-[9.5rem] py-1.5 text-xs"
                  >
                    {GRANTABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(m)} aria-label={`Remove ${m.email}'s role`}>
                    <UserMinus className="h-3.5 w-3.5" aria-hidden /> Remove
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <ReasonDialog
        open={Boolean(change)}
        onClose={() => setChange(null)}
        title={change ? `Make ${change.member.email} ${ROLE_LABEL[change.role]}?` : "Change role"}
        description={change ? ROLE_SUMMARY[change.role] : undefined}
        label="Why"
        required={false}
        tone="default"
        confirmLabel="Change role"
        placeholder="Taking over the Feedback Center."
        onConfirm={async (reason) => {
          if (!change) return;
          await adminApi.patch(`access/${change.member.id}`, { role: change.role, reason: reason || null });
          toast({ title: "Role changed", description: `${change.member.email} is now ${ROLE_LABEL[change.role]}.`, tone: "success" });
          onChanged();
        }}
      />
      <ReasonDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this role?"
        description={removing ? `${removing.email} keeps their account and data, and loses the Admin Center at once.` : undefined}
        label="Why"
        confirmLabel="Remove role"
        placeholder="Finished helping with the launch."
        onConfirm={async (reason) => {
          if (!removing) return;
          await adminApi.del(`access/${removing.id}`, { reason });
          toast({ title: "Role removed", description: removing.email, tone: "success" });
          onChanged();
        }}
      />
    </>
  );
}

function GrantForm({ onGranted }: { onGranted: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<GrantableRole>("moderator");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.post("access", { email: email.trim(), role, reason: reason.trim() || null });
      toast({ title: "Role granted", description: `${email.trim()} is now ${ROLE_LABEL[role]}.`, tone: "success" });
      setEmail("");
      setReason("");
      onGranted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={(e) => void grant(e)} className="space-y-4" noValidate>
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-snugg text-paper">
            <UserPlus className="h-4 w-4 text-accent" aria-hidden /> Give someone a role
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-paper/60">
            They need a DoOrDie account first. The Admin Center opens for them at /admin straight away; the link in their account menu
            follows within a few minutes.
          </p>
        </div>
        <Field label="Account email">
          <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required />
        </Field>
        <Field label="Role" hint={ROLE_SUMMARY[role]}>
          <Select value={role} onChange={(e) => setRole(e.target.value as GrantableRole)}>
            {GRANTABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Why" optional hint="Kept in the audit log.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-[64px]" placeholder="Helping with review moderation." />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !email.trim()} className="w-full">
          {busy ? "Granting…" : `Grant ${ROLE_LABEL[role]}`}
        </Button>
      </form>
    </Card>
  );
}

function SuperAdminNote() {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-snugg text-paper">
        <Terminal className="h-4 w-4 text-accent" aria-hidden /> Super Admins
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-paper/60">
        Super Admin is never granted from here, so a stolen session can&apos;t create another one. The owner runs this in the Supabase SQL
        Editor with the account id from Users; the setup guide in the project&apos;s docs has the full steps. The last Super Admin can&apos;t
        be removed.
      </p>
      <pre className="no-scrollbar mt-3 overflow-x-auto rounded-xl border border-line bg-paper/[0.03] p-3 font-mono text-[0.68rem] leading-relaxed text-paper/75">
        {GRANT_SQL}
      </pre>
      <a
        href="https://supabase.com/dashboard/project/_/sql/new"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
      >
        Open the SQL Editor <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </Card>
  );
}

/** The last 50 role changes, from the app and the SQL Editor alike. */
function RoleHistory({ entries }: { entries: AccessResponse["history"] }) {
  return (
    <section aria-labelledby="role-history-title" className="space-y-3">
      <h2 id="role-history-title" className="text-base font-semibold tracking-snugg text-paper">
        Role history
      </h2>
      {!entries.length ? (
        <p className="text-sm text-paper/55">No roles have changed yet.</p>
      ) : (
        <Card className="divide-y divide-line">
          {entries.map((e) => {
            const m = e.metadata ?? {};
            const what = "from" in m ? `${roleWord(m.from)} → ${roleWord(m.to)}` : roleWord(m.role);
            return (
              <div key={e.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-start sm:gap-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-paper">
                    <span className="font-semibold">{actionLabel(e.action)}</span>
                    <span className="text-paper/60"> · {what} · </span>
                    <span className="break-all">{e.targetEmail ?? (m.accountDeleted ? "a deleted account" : e.targetId)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-paper/55">{actorLine(e)}</p>
                  {e.reason && <p className="mt-1 text-xs text-paper/75">“{e.reason}”</p>}
                </div>
                <p className="shrink-0 text-xs text-paper/50">
                  <When at={e.createdAt} />
                </p>
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}
