"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ════════════════════════════════════════════════════════════════
   GOOGLE ANALYTICS 4, OPT-IN, PUBLIC PAGES ONLY
   Off unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set at build time. Even then
   nothing loads until the visitor agrees in the banner, and the choice is
   remembered on this device.

   It is mounted by the public site's layout and the sign-in screens only.
   While it is unmounted (inside the app itself) Google's opt-out flag is
   set, so nothing about anyone's preparation is ever sent.

   Page views are sent from here, so in GA4 turn off Enhanced measurement →
   Page views → "Page changes based on browser history events", or client
   navigations are counted twice. See docs/SEO_SETUP_GUIDE.md.
   ════════════════════════════════════════════════════════════════ */

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "";
const CONSENT_KEY = "doordie-analytics-consent";

type Choice = "granted" | "denied";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const disableFlag = `ga-disable-${GA_ID}`;
function setDisabled(disabled: boolean) {
  (window as unknown as Record<string, boolean>)[disableFlag] = disabled;
}

function loadGa() {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js expects the arguments object itself.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);
}

/** Sends an event if analytics is on and allowed; otherwise does nothing. */
export function track(event: string, params: Record<string, string | number> = {}) {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  if ((window as unknown as Record<string, boolean>)[disableFlag]) return;
  window.gtag("event", event, params);
}

function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function Analytics() {
  const pathname = usePathname();
  // `undefined` until the stored choice has been read, so the banner never
  // flashes for someone who already answered.
  const [choice, setChoice] = useState<Choice | null | undefined>(undefined);

  useEffect(() => {
    if (!GA_ID) return;
    setChoice(readChoice());
    setDisabled(false);
    return () => setDisabled(true);
  }, []);

  useEffect(() => {
    if (choice === "granted") loadGa();
  }, [choice]);

  useEffect(() => {
    if (choice !== "granted") return;
    track("page_view", { page_location: window.location.href, page_path: pathname, page_title: document.title });
  }, [choice, pathname]);

  // Any element with data-track="name" reports a click as cta_click.
  useEffect(() => {
    if (choice !== "granted") return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-track]") as HTMLElement | null;
      if (!el?.dataset.track) return;
      track("cta_click", {
        cta: el.dataset.track,
        link_url: el instanceof HTMLAnchorElement ? el.pathname : "",
        page_path: window.location.pathname,
      });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [choice]);

  if (!GA_ID || choice !== null) return null;

  const choose = (c: Choice) => {
    try {
      localStorage.setItem(CONSENT_KEY, c);
    } catch {
      /* storage blocked: ask again next time */
    }
    setChoice(c);
  };

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-line bg-card p-4 shadow-lift sm:inset-x-auto sm:left-5 sm:bottom-5 sm:max-w-sm"
    >
      <p className="text-sm font-semibold text-paper">Can we count your visit?</p>
      <p className="mt-1 text-xs leading-relaxed text-paper/65">
        With your permission we use Google Analytics, which sets cookies, to see which pages help aspirants. It runs on
        these public pages only, never inside your account.{" "}
        <Link href="/privacy-policy" className="font-semibold text-accent hover:underline">
          Privacy policy
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => choose("granted")}
          className="h-9 rounded-full bg-accent px-4 text-xs font-semibold text-accent-fg hover:brightness-[1.08]"
        >
          Allow analytics
        </button>
        <button
          onClick={() => choose("denied")}
          className="h-9 rounded-full border border-line px-4 text-xs font-semibold text-paper/75 hover:border-paper/25 hover:text-paper"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}

/**
 * Lets a visitor change their mind: forgets the stored choice, so the banner
 * asks again. Shown on the privacy policy. Renders nothing when analytics is off.
 */
export function AnalyticsChoiceReset() {
  const [cleared, setCleared] = useState(false);
  if (!GA_ID) return null;
  return (
    <button
      onClick={() => {
        try {
          localStorage.removeItem(CONSENT_KEY);
        } catch {
          /* nothing stored */
        }
        setCleared(true);
        window.location.reload();
      }}
      className="inline-flex h-10 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold text-paper hover:border-paper/25"
    >
      {cleared ? "Choice cleared" : "Change my analytics choice"}
    </button>
  );
}
