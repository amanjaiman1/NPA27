"use client";

import { useRef, useState } from "react";
import { Download, Upload, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  useChronicle,
  readCloudSnapshot,
  SNAPSHOT_KEYS,
} from "@/lib/store";
import type { CloudSnapshot } from "@/lib/store";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAccount } from "@/components/account/account-session";

/** Bumped alongside the store's persisted `version`. Stamped into backups. */
const BACKUP_SCHEMA_VERSION = 10;
const BACKUP_APP_ID = "the-upsc-chronicle";

type Note = { kind: "ok" | "err"; text: string } | null;

interface BackupFile {
  app?: string;
  account?: { id?: string };
  data?: Partial<CloudSnapshot>;
  /** The browser-storage format (`{ state, version }`) is accepted too. */
  state?: Partial<CloudSnapshot>;
}

/**
 * Export / import the signed-in account's chronicle as a portable JSON file.
 *
 * Exports contain this account's data and nothing else — the store only ever
 * holds the active account. Restoring replaces this account's data and, when
 * signed in, syncs it to the cloud.
 */
export function DataBackup() {
  const applyCloudSnapshot = useChronicle((s) => s.applyCloudSnapshot);
  const { accountId } = useAccount();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<Note>(null);

  function handleExport() {
    try {
      const payload = {
        app: BACKUP_APP_ID,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        account: { id: accountId },
        data: readCloudSnapshot(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `upsc-chronicle-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNote({ kind: "ok", text: "Backup downloaded to your device." });
    } catch {
      setNote({ kind: "err", text: "Couldn't create the backup. Try again." });
    }
  }

  async function handleImport(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile & Partial<CloudSnapshot>;
      // Our export ({ data }), the browser-storage format ({ state }), or a raw snapshot.
      const data = (parsed?.data ?? parsed?.state ?? parsed) as Partial<CloudSnapshot>;

      const known = SNAPSHOT_KEYS.some(
        (k) => data && Object.prototype.hasOwnProperty.call(data, k),
      );
      if (!known) {
        setNote({ kind: "err", text: "That doesn't look like a Chronicle backup file." });
        return;
      }

      const otherAccount = parsed.account?.id && parsed.account.id !== accountId;
      const ok = await confirm({
        title: "Restore this backup?",
        description:
          (otherAccount ? "This file was exported from a different account. " : "") +
          "It will replace the data in your account, on this device and in the cloud. " +
          "Download a backup of your current data first if you might want it back.",
        confirmLabel: "Restore backup",
        tone: "danger",
      });
      if (!ok) return;

      applyCloudSnapshot(data);
      setNote({ kind: "ok", text: "Backup restored. Your chronicle is back." });
    } catch {
      setNote({ kind: "err", text: "Couldn't read that file. Make sure it's a valid backup." });
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          onClick={handleExport}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-soft transition-all hover:opacity-90"
        >
          <Download className="h-4 w-4" />
          Download my data (JSON)
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-paper/[0.03] px-4 py-2.5 text-sm font-medium text-paper/80 transition-all hover:border-paper/30 hover:bg-paper/[0.06]"
        >
          <Upload className="h-4 w-4" />
          Restore from file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImport(file);
            e.target.value = ""; // allow re-importing the same file
          }}
        />
      </div>

      {note && (
        <p
          className={
            "mt-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs " +
            (note.kind === "ok"
              ? "border border-accent/30 bg-accent/10 text-paper/80"
              : "border border-danger/30 bg-danger/10 text-paper/80")
          }
        >
          {note.kind === "ok" ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          )}
          {note.text}
        </p>
      )}
    </div>
  );
}
