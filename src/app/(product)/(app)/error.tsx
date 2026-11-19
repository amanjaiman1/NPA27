"use client";

import { ErrorScreen } from "@/components/feedback/error-screen";

/** A page of the app failed to show. The sidebar and top bar stay, so the rest of the app is one click away. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} />;
}
