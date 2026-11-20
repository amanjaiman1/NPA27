"use client";

import Link from "next/link";
import { Bell, Compass, Palette, Smartphone } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { withDefaults } from "@/lib/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { AppearanceControls } from "@/components/layout/appearance";
import { SettingsPane } from "@/components/notifications/settings-pane";
import { useAccount } from "@/components/account/account-session";
import { SettingsSection } from "@/components/settings/section";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { AccountSecurity, DangerZone } from "@/components/settings/account-settings";
import { DataSettings } from "@/components/settings/data-settings";
import { ReviewSettings } from "@/components/settings/review-settings";
import { InstallCard } from "@/components/pwa/install-prompt";
import { Button } from "@/components/ui/button";
import { useTour } from "@/components/tour/tour-context";

const JUMPS = [
  { id: "profile", label: "Profile & exam" },
  { id: "account", label: "Account", cloudOnly: true },
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "app", label: "App" },
  { id: "tour", label: "Feature tour" },
  { id: "review", label: "Review DoOrDie", cloudOnly: true },
  { id: "data", label: "Data" },
  { id: "danger", label: "Delete" },
];

/** Opens the feature tour, for anyone who wants to see it again. */
function TourLauncher() {
  const { open, prepare, fresh } = useTour();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-paper/65">
        {fresh ? "You haven't taken it yet." : "Six short chapters. Skip or leave it whenever you like."}
      </p>
      <Button onClick={open} onPointerEnter={prepare} onFocus={prepare} className="shrink-0">
        <Compass className="h-4 w-4" />
        Take the tour
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const hydrated = useHasHydrated();
  const notify = useChronicle((s) => s.notify);
  const { mode } = useAccount();
  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Your chronicle, your way."
        description="Your profile, your look, your notifications and your data. All of it belongs to your account alone."
      />

      <nav aria-label="Settings sections" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {JUMPS.filter((j) => mode === "cloud" || !j.cloudOnly).map((j) => (
          <Link
            key={j.id}
            href={`#${j.id}`}
            className="shrink-0 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-medium text-paper/65 transition-colors hover:border-paper/25 hover:text-paper"
          >
            {j.label}
          </Link>
        ))}
      </nav>

      <ProfileSettings />
      {mode === "cloud" && <AccountSecurity />}

      <SettingsSection id="appearance" icon={Palette} title="Appearance" description="Saved with your account, so it follows you to every device.">
        <AppearanceControls />
      </SettingsSection>

      <SettingsSection
        id="notifications"
        icon={Bell}
        title="Notifications"
        description="What's worth telling you, and when. Preferences are per account."
      >
        <SettingsPane settings={withDefaults(notify)} />
      </SettingsSection>

      <SettingsSection
        id="app"
        icon={Smartphone}
        title="Install the app"
        description="One tap away on your phone or computer, full screen, and it keeps working offline. Your data syncs when you're back online."
      >
        <InstallCard bare />
      </SettingsSection>

      <SettingsSection
        id="tour"
        icon={Compass}
        title="Feature tour"
        description="A short look at what every page does, with a live picture of each. It's also behind the compass at the top of every page."
      >
        <TourLauncher />
      </SettingsSection>

      <ReviewSettings />
      <DataSettings />
      <DangerZone />
    </div>
  );
}
