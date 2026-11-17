import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One block of the settings page, addressable by `#id`. */
export function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  tone = "default",
  children,
}: {
  id: string;
  icon: React.ElementType;
  title: string;
  description?: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24" aria-labelledby={`${id}-title`}>
      <Card className={cn("p-5 sm:p-6", tone === "danger" && "border-danger/30")}>
        <div className="mb-5 flex items-start gap-3">
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
              tone === "danger" ? "bg-danger/10 text-danger" : "bg-accent/[0.12] text-accent",
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-base font-semibold tracking-snugg text-paper">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs leading-relaxed text-paper/50">{description}</p>}
          </div>
        </div>
        {children}
      </Card>
    </section>
  );
}

/** Inline result of a save, under a form. */
export function SaveNote({ note }: { note: { kind: "ok" | "err"; text: string } | null }) {
  if (!note) return null;
  return (
    <p
      role={note.kind === "err" ? "alert" : "status"}
      className={cn("text-xs", note.kind === "ok" ? "text-positive" : "text-danger")}
    >
      {note.text}
    </p>
  );
}
