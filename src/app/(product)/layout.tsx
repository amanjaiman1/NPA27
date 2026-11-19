import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { ToastProvider } from "@/components/ui/toast";
import { PwaLayer } from "@/components/pwa/pwa-layer";
import { CrashReporter } from "@/components/feedback/crash-reporter";

/**
 * The private side: the app (`(app)`) and its sign-in screens (`(auth)`).
 *
 * Kept out of search results with noindex. That is only about search results;
 * privacy is enforced by the account gate and the database's row-level
 * security, never by this tag or robots.txt.
 *
 * The account provider lives here rather than in the root layout, so the
 * public pages never download Supabase or the app's state. Both groups share
 * this layout, which keeps one provider mounted from sign-in through to the
 * dashboard.
 */
export const metadata: Metadata = {
  title: { absolute: "DoOrDie — Your Preparation, Documented" },
  robots: { index: false, follow: false },
};

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <ToastProvider>
          {children}
          <PwaLayer />
          <CrashReporter />
        </ToastProvider>
      </ConfirmProvider>
    </AuthProvider>
  );
}
