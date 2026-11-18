"use client";

import { ArrowRight } from "lucide-react";
import { promptInstall, useInstallState } from "@/lib/pwa";

/*
 * Kept apart from install-app.tsx on purpose: that file is used by the site's
 * layout, on every public page, and this one only by the home page. While one
 * file served both, every public page also downloaded the home page's own
 * code, the film player included (about 12 KB more per page, measured with
 * scripts/seo-audit.mjs).
 */

/**
 * The same offer inside a page, under text that talks about installing: a
 * button where the browser can install, the steps written out where it
 * can't, and nothing at all once the app is installed.
 */
export function InstallAppInline() {
  const { canPrompt, manual } = useInstallState();
  if (canPrompt) {
    return (
      <button
        type="button"
        data-track="install_page"
        onClick={() => void promptInstall()}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
      >
        Install the app <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    );
  }
  if (manual === "ios") {
    return (
      <p className="mt-3 text-sm text-paper/65">
        On an iPhone or iPad: tap <span className="font-semibold text-paper">Share</span>, then{" "}
        <span className="font-semibold text-paper">Add to Home Screen</span>.
      </p>
    );
  }
  if (manual === "mac-safari") {
    return (
      <p className="mt-3 text-sm text-paper/65">
        In Safari on a Mac: <span className="font-semibold text-paper">File</span>, then{" "}
        <span className="font-semibold text-paper">Add to Dock</span>.
      </p>
    );
  }
  return null;
}
