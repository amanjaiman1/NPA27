import { Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The product-wide notice a Super Admin sets in the Admin Center: one line
 * at the top of the app ("Planned maintenance on Sunday, 9–10 pm IST").
 * Shared by the app and the settings page's preview, so both look the same.
 */
export function AppNoticeBar({ message, tone, className }: { message: string; tone: "info" | "warning"; className?: string }) {
  const Icon = tone === "warning" ? TriangleAlert : Info;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border px-4 py-2.5 text-sm leading-relaxed text-paper",
        tone === "warning" ? "border-warning/35 bg-warning/10" : "border-accent/30 bg-accent/[0.08]",
        className,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "warning" ? "text-warning" : "text-accent")} aria-hidden />
      <p className="min-w-0 flex-1 break-words">{message}</p>
    </div>
  );
}
