"use client";

import { Printer } from "lucide-react";
import { track } from "@/components/marketing/analytics";

/** Opens the browser's print dialog, where "Save as PDF" is also offered. */
export function PrintButton({ label = "Print or save as PDF", tool }: { label?: string; tool: string }) {
  return (
    <button
      onClick={() => {
        track("tool_use", { tool, action: "print" });
        window.print();
      }}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg shadow-accent hover:brightness-[1.08] print:hidden"
    >
      <Printer className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}
