import { Info, Megaphone, Sparkles, TriangleAlert, Wrench } from "lucide-react";
import { ANNOUNCEMENT_CATEGORY, type AnnouncementCategory } from "@/lib/platform/content";
import { cn } from "@/lib/utils";
import { RichText } from "./rich-text";

export const ANNOUNCEMENT_ICON: Record<AnnouncementCategory, React.ElementType> = {
  product_update: Sparkles,
  new_feature: Sparkles,
  maintenance: Wrench,
  important: TriangleAlert,
  general: Megaphone,
};

/** One announcement, as students see it. The Admin Center's preview uses the same card. */
export function AnnouncementBody({
  title,
  body,
  category,
  date,
  className,
}: {
  title: string;
  body: string;
  category: AnnouncementCategory;
  date?: React.ReactNode;
  className?: string;
}) {
  const Icon = ANNOUNCEMENT_ICON[category] ?? Info;
  return (
    <div className={cn("flex gap-3.5", className)}>
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
          category === "important" ? "bg-danger/10 text-danger" : category === "maintenance" ? "bg-warning/10 text-warning" : "bg-accent/[0.12] text-accent",
        )}
      >
        <Icon className="h-[1.1rem] w-[1.1rem]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.7rem] font-semibold text-paper/55">
          {ANNOUNCEMENT_CATEGORY.label[category]}
          {date ? <> · {date}</> : null}
        </p>
        <h3 className="mt-0.5 text-[0.95rem] font-semibold leading-snug tracking-snugg text-paper">{title}</h3>
        <RichText text={body} className="mt-2 text-sm text-paper/75" />
      </div>
    </div>
  );
}
