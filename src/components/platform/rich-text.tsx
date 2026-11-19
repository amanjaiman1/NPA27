import { Fragment } from "react";
import { parseDiary, type Inline } from "@/lib/diary";
import { cn } from "@/lib/utils";

/**
 * Announcement and changelog text: paragraphs, headings, lists, quotes,
 * bold and italic (the diary's light Markdown, lib/diary.ts). Everything
 * becomes text nodes, never HTML, so nothing an administrator types can
 * run in a reader's browser. No hooks, so it renders on the server too.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseDiary(text);
  if (!blocks.length) return null;
  return (
    <div className={cn("space-y-3 leading-relaxed", className)}>
      {blocks.map((b, i) => {
        if (b.kind === "h") {
          return (
            <h3 key={i} className="pt-1 font-semibold text-paper">
              <Spans parts={b.text} />
            </h3>
          );
        }
        if (b.kind === "quote") {
          return (
            <blockquote key={i} className="border-l-2 border-accent/50 pl-3.5 italic">
              <Lines lines={b.lines} />
            </blockquote>
          );
        }
        if (b.kind === "p") {
          return (
            <p key={i} className="whitespace-pre-wrap break-words">
              <Lines lines={b.lines} />
            </p>
          );
        }
        const List = b.kind === "ul" ? "ul" : "ol";
        return (
          <List key={i} className={cn("space-y-1 pl-5", b.kind === "ul" ? "list-disc marker:text-accent/70" : "list-decimal")}>
            {b.items.map((it, k) => (
              <li key={k}>
                <Spans parts={it} />
              </li>
            ))}
          </List>
        );
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
