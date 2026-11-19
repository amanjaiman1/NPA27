"use client";

import { useState } from "react";
import { KeyRound, LogOut, ShieldAlert, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { passwordProblem } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthMessage, PasswordInput } from "@/components/auth/auth-ui";
import { useAccount } from "@/components/account/account-session";
import { eraseAccountFromDevice } from "@/lib/account/session";
import { useChronicle } from "@/lib/store";
import { SaveNote, SettingsSection } from "./section";

/** Email, password and signing out. Cloud accounts only. */
export function AccountSecurity() {
  const auth = useAuth();
  const { user, signOut } = useAccount();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const problem = !current
      ? "Enter your current password."
      : (passwordProblem(next) ?? (next !== confirmNext ? "The new passwords don't match." : null));
    if (problem) return setNote({ kind: "err", text: problem });
    setBusy(true);
    const verified = await auth.verifyPassword(current);
    const result = verified.error ? verified : await auth.updatePassword(next);
    setBusy(false);
    if (result.error) return setNote({ kind: "err", text: result.error });
    setCurrent("");
    setNext("");
    setConfirmNext("");
    setNote({ kind: "ok", text: "Password changed." });
  }

  return (
    <SettingsSection
      id="account"
      icon={KeyRound}
      title="Account & security"
      description="Your sign-in details. Signing out also removes your data from this browser once it's synced."
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper/[0.03] p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-paper/45">Signed in as</p>
            <p className="truncate text-sm font-medium text-paper">{user?.email}</p>
          </div>
          <Button variant="ghost" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>

        <form onSubmit={changePassword} className="space-y-4">
          <p className="text-sm font-semibold text-paper">Change password</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Current password">
              <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="New password">
              <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password">
              <PasswordInput value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="ghost" disabled={busy}>
              {busy ? "Saving…" : "Change password"}
            </Button>
            <SaveNote note={note} />
          </div>
        </form>
      </div>
    </SettingsSection>
  );
}

/** Deleting the account (cloud) or wiping this browser (local-only builds). */
export function DangerZone() {
  const { mode, accountId } = useAccount();
  const resetData = useChronicle((s) => s.resetData);
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);

  if (mode === "local") {
    return (
      <SettingsSection
        id="danger"
        icon={ShieldAlert}
        tone="danger"
        title="Erase this browser's data"
        description="Accounts aren't set up in this build, so your chronicle lives only in this browser."
      >
        <Button
          variant="danger"
          onClick={async () => {
            const ok = await confirm({
              title: "Erase everything in this browser?",
              description: "Every journal entry, mock, mistake and setting here is deleted. Download a backup first if you want to keep it.",
              confirmLabel: "Erase everything",
            });
            if (!ok) return;
            resetData();
            await eraseAccountFromDevice(accountId);
            window.location.replace("/dashboard");
          }}
        >
          <Trash2 className="h-4 w-4" /> Erase all data
        </Button>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      id="danger"
      icon={ShieldAlert}
      tone="danger"
      title="Delete account"
      description="Permanently deletes your account and everything in it, from the cloud and from this browser."
    >
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" /> Delete my account
      </Button>
      <DeleteAccountDialog open={open} onClose={() => setOpen(false)} />
    </SettingsSection>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const { endAfterDeletion } = useAccount();
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (phrase !== "DELETE") return setError("Type DELETE to confirm.");
    if (!password) return setError("Enter your password.");
    setBusy(true);
    setError(null);
    // Signing in again proves it's really you, and gives the server a fresh token.
    const verified = await auth.verifyPassword(password);
    if (verified.error) {
      setBusy(false);
      return setError(verified.error);
    }
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ confirm: "DELETE" }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) {
      setBusy(false);
      return setError(body?.error ?? "Couldn't reach the server. Nothing was deleted.");
    }
    await endAfterDeletion();
    window.location.replace("/welcome?deleted=1");
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="Delete your account?"
      description="This can't be undone."
      className="sm:max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void remove()} disabled={busy}>
            {busy ? "Deleting…" : "Delete forever"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-paper/60">
          Your journal, study hours, syllabus progress, mocks, mistakes, goals, habits, roadmap,
          Personal Diary, performance reviews, the coach&apos;s history, attached files, settings and
          notification devices are deleted from the cloud and from this browser. Other devices lose access the next time they sync. Download your data from
          Settings → Data first if you want a copy.
        </p>
        <Field label="Type DELETE to confirm">
          <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Your password">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {error && <AuthMessage tone="error">{error}</AuthMessage>}
      </div>
    </Modal>
  );
}
