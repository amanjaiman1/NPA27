"use client";

import { ErrorScreen } from "@/components/feedback/error-screen";

/** A sign-in screen, or the app's frame itself, failed to show. */
export default function ProductError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} source="root" fullPage />;
}
