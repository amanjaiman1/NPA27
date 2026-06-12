import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "solid" | "outline" | "ghost";

const tones: Record<Tone, string> = {
  default: "bg-paper/[0.06] text-paper/80 border border-paper/10",
  solid: "bg-paper text-ink border border-transparent",
  outline: "bg-transparent text-paper/70 border border-paper/20",
  ghost: "bg-transparent text-paper/50 border border-transparent",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium tracking-snugg",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
