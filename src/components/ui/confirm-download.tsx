"use client";

import { useCallback } from "react";
import { Download } from "lucide-react";
import { saveFile } from "@/lib/download";
import { useConfirm } from "./confirm-dialog";

export interface DownloadRequest {
  /** The question: "Download all your data?" */
  title: string;
  /** What the file holds, in a sentence. */
  description: string;
  fileName: string;
  /** Built only after you confirm, so a cancelled export does no work. */
  content: () => string | Blob;
  /** The file's type, e.g. "application/json". */
  type?: string;
}

/**
 * Every export asks before it saves anything: what the file holds, its
 * name, and that it isn't protected once it's on the device. Resolves to
 * `true` once the file is handed to the browser, `false` if you cancelled.
 */
export function useConfirmedDownload() {
  const confirm = useConfirm();
  return useCallback(
    async (req: DownloadRequest): Promise<boolean> => {
      const ok = await confirm({
        title: req.title,
        description: `${req.description} It's saved to this device as “${req.fileName}”.`,
        consequence: "The file isn't protected: anyone who can open files on this device can read it.",
        confirmLabel: "Download",
        tone: "default",
        icon: Download,
      });
      if (!ok) return false;
      saveFile(req.fileName, req.content(), req.type);
      return true;
    },
    [confirm],
  );
}
