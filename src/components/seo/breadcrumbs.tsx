import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { breadcrumbList, type Crumb } from "@/lib/seo/schema";
import { JsonLd } from "./json-ld";

/**
 * The visible trail and its BreadcrumbList markup, from one list, so the two
 * can never disagree. The first crumb is always Home; the last is the page.
 */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const trail: Crumb[] = [{ name: "Home", path: "/" }, ...crumbs];
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-xs text-paper/55">
        <ol className="flex flex-wrap items-center gap-1">
          {trail.map((c, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={c.path} className="flex items-center gap-1">
                {last ? (
                  <span aria-current="page" className="text-paper/75">
                    {c.name}
                  </span>
                ) : (
                  <>
                    <Link href={c.path} className="hover:text-paper">
                      {c.name}
                    </Link>
                    <ChevronRight className="h-3 w-3 text-paper/35" aria-hidden />
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbList(trail)} />
    </>
  );
}
