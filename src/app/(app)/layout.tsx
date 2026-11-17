import { RequireAccount } from "@/components/account/require-account";
import { OnboardingGate } from "@/components/account/onboarding";
import { SleepGate } from "@/components/sleep/sleep-gate";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Every page of the app sits behind these, in this order: a signed-in account
 * with its own data loaded, then first-run setup if it hasn't been done, then
 * the daily sleep check-in, then the shell.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAccount>
      <OnboardingGate>
        <SleepGate>
          <AppShell>{children}</AppShell>
        </SleepGate>
      </OnboardingGate>
    </RequireAccount>
  );
}
