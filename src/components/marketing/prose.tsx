import { cn } from "@/lib/utils";

/**
 * Long-form text: guides and legal pages. Content is written as plain h2, p,
 * ul and table elements; `.prose-doordie` in globals.css styles them.
 */
export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("prose-doordie", className)}>{children}</div>;
}

/** A highlighted aside inside long-form text. */
export function Callout({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <aside className="rounded-2xl border border-accent/30 bg-accent/5 p-5 text-[0.98rem] leading-relaxed text-paper/80">
      {title && <p className="mb-1.5 font-semibold text-paper">{title}</p>}
      <div className="space-y-2">{children}</div>
    </aside>
  );
}

/** Wraps a table so it scrolls sideways on narrow screens instead of overflowing. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="table-wrap">{children}</div>;
}
