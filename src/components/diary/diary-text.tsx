"use client";

import { Fragment, useMemo } from "react";
import { parseDiary, type Inline } from "@/lib/diary";
import { cn } from "@/lib/utils";

/**
 * An entry's light Markdown, drawn as elements. The text only ever becomes
 * text nodes, never HTML, so nothing written in an entry can run.
 */
export function DiaryText({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseDiary(text), [text]);
  if (!blocks.length) return <p className={cn("text-paper/45", className)}>Nothing written yet.</p>;
  return (
    <div className={cn("space-y-3 text-[0.95rem] leading-[1.75] text-paper/85", className)}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h":
            return (
              <h3 key={i} className="pt-1 text-[1.05rem] font-semibold tracking-[-0.01em] text-paper">
                <Spans parts={b.text} />
              </h3>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-accent/50 pl-3.5 italic text-paper/75">
                <Lines lines={b.lines} />
              </blockquote>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5 marker:text-accent/70">
                {b.items.map((it, k) => (
                  <li key={k}>
                    <Spans parts={it} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5 marker:text-paper/50">
                {b.items.map((it, k) => (
                  <li key={k}>
                    <Spans parts={it} />
                  </li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={i} className="whitespace-pre-wrap break-words">
                <Lines lines={b.lines} />
              </p>
            );
        }
      })}
    </div>
  );
}

function Lines({ lines }: { lines: Inline[][] }) {
  return (
    <>
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          <Spans parts={l} />
        </Fragment>
      ))}
    </>
  );
}

function Spans({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "strong" ? (
          <strong key={i} className="font-semibold text-paper">
            {p.text}
          </strong>
        ) : p.kind === "em" ? (
          <em key={i}>{p.text}</em>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}
