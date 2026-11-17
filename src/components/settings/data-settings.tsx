"use client";

import { useMemo, useState } from "react";
import { Database, Download, ImageOff, Paperclip, RefreshCw, Split } from "lucide-react";
import { useChronicle, readCloudSnapshot } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ACCOUNT_FILE_QUOTA, totalFileBytes } from "@/lib/files";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataBackup } from "@/components/layout/data-backup";
import { useAccount } from "@/components/account/account-session";
import { describeSync } from "@/components/account/sync-label";
import { SettingsSection } from "./section";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DataSettings() {
  const { mode, sync, syncNow, conflicts, dismissConflicts } = useAccount();
  const journal = useChronicle((s) => s.journal);
  const files = useChronicle((s) => s.files);
  const removeLegacyAttachments = useChronicle((s) => s.removeLegacyAttachments);
  const confirm = useConfirm();
  const [removed, setRemoved] = useState<number | null>(null);
  const status = describeSync(sync, mode);

  // Size of what syncs. Recomputed when the journal changes, which is where
  // nearly all of it lives.
  const size = useMemo(() => {
    void journal;
    try {
      return new Blob([JSON.stringify(readCloudSnapshot())]).size;
    } catch {
      return 0;
    }
  }, [journal]);

  const fileBytes = useMemo(() => totalFileBytes(files), [files]);

  const legacy = useMemo(() => {
    let count = 0;
    let bytes = 0;
    for (const e of journal) {
      for (const a of e.attachments ?? []) {
        count++;
        bytes += a.dataUrl?.length ?? 0;
      }
    }
    return { count, bytes };
  }, [journal]);

  return (
    <SettingsSection
      id="data"
      icon={Database}
      title="Data & privacy"
      description="Everything here belongs to your account only. Download it whenever you like."
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper/[0.03] p-4 sm:flex-row sm:items-center">
          <status.icon
            className={cn(
              "h-5 w-5 shrink-0",
              status.tone === "warn" ? "text-danger" : "text-accent",
              status.spin && "animate-spin",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-paper">{status.label}</p>
            <p className="text-xs leading-relaxed text-paper/55">{status.detail}</p>
            <p className="mt-1 text-[0.7rem] text-paper/40">Your data: {formatBytes(size)}</p>
          </div>
          {mode === "cloud" && (
            <Button variant="ghost" size="sm" onClick={syncNow}>
              <RefreshCw className="h-3.5 w-3.5" /> Sync now
            </Button>
          )}
        </div>

        <div className="rounded-2xl border border-line p-4" data-testid="file-usage">
          <p className="flex items-center gap-2 text-sm font-semibold text-paper">
            <Paperclip className="h-4 w-4 text-accent" /> Attached files
          </p>
          <p className="mt-1 text-xs leading-relaxed text-paper/55">
            {files.length === 0
              ? "No files attached yet. Files you attach to journal days are kept in private storage that only your account can open."
              : `${files.length} file${files.length === 1 ? "" : "s"}, ${formatBytes(fileBytes)} of your ${formatBytes(ACCOUNT_FILE_QUOTA)}. Each file is stored once, however many days, goals or Life Dashboard days use it.`}
          </p>
          {files.length > 0 && (
            <Progress
              value={(fileBytes / ACCOUNT_FILE_QUOTA) * 100}
              className="mt-3"
              barClassName={fileBytes / ACCOUNT_FILE_QUOTA > 0.9 ? "bg-danger" : "bg-accent"}
            />
          )}
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold text-paper">Backup &amp; restore</p>
          <p className="mb-3 text-xs leading-relaxed text-paper/50">
            A JSON file of everything you&apos;ve logged, held by you, independent of the cloud. It lists your attached
            files but doesn&apos;t contain them: open a file from its journal day to download it.
          </p>
          <DataBackup />
        </div>

        {conflicts.length > 0 && (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-paper">
              <Split className="h-4 w-4 text-warning" />
              {conflicts.length === 1 ? "One edit clashed" : `${conflicts.length} edits clashed`} between devices
            </p>
            <p className="mt-1 text-xs leading-relaxed text-paper/60">
              The same thing was changed on two devices before they synced. This device&apos;s version
              was kept, and the other is saved here in case you want it back.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => download("upsc-chronicle-clashes.json", conflicts)}>
                <Download className="h-3.5 w-3.5" /> Download the other versions
              </Button>
              <Button variant="subtle" size="sm" onClick={dismissConflicts}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {legacy.count > 0 && (
          <div className="rounded-2xl border border-line p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-paper">
              <ImageOff className="h-4 w-4 text-accent" /> Old journal photos
            </p>
            <p className="mt-1 text-xs leading-relaxed text-paper/55">
              {legacy.count} photo{legacy.count === 1 ? "" : "s"} ({formatBytes(legacy.bytes)}) from an older
              version are stored inside your data rather than as files, and are re-sent every time it syncs.
              Download your data first to keep a copy, then remove them.
            </p>
            <Button
              variant="danger"
              size="sm"
              className="mt-3"
              onClick={async () => {
                const ok = await confirm({
                  title: `Remove ${legacy.count} old photo${legacy.count === 1 ? "" : "s"}?`,
                  description:
                    "They are deleted from your journal on every device. Your entries themselves stay. A backup you've downloaded keeps them.",
                  confirmLabel: "Remove photos",
                });
                if (ok) setRemoved(removeLegacyAttachments());
              }}
            >
              Remove old photos
            </Button>
          </div>
        )}
        {removed != null && (
          <p className="text-xs text-positive" role="status">
            Removed {removed} photo{removed === 1 ? "" : "s"}.
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
