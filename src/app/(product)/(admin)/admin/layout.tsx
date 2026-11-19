import type { Metadata } from "next";
import { AdminRoot } from "@/components/admin/admin-root";

/**
 * The Admin Center. Inside (product) to share its sign-in, dialogs and
 * toasts; outside (app), so no account, chronicle or sync loads here.
 * Private: never indexed, never in the sitemap, and every page's data comes
 * from /api/admin, which checks the caller's role on every request.
 */
export const metadata: Metadata = {
  title: { absolute: "Admin Center · DoOrDie" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "same-origin",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminRoot>{children}</AdminRoot>;
}
