/**
 * Saves a file on this device through the browser's own download, the same
 * way for every export in the app. Ask first with `useConfirmedDownload`
 * (components/ui/confirm-download.tsx): nothing should land on the device
 * without the person saying yes.
 */
export function saveFile(name: string, content: string | Blob, type = "text/plain;charset=utf-8"): void {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let go a moment later: some browsers start the download after the click returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name from a label: "Weekly 9–15 Nov" is "weekly-9-15-nov". */
export function fileSafe(s: string): string {
  return s
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
