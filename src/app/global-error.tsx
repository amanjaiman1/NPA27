"use client";

import { useEffect, useState } from "react";
import { reportCrash, sendCrashReport, type SendResult } from "@/lib/crash-report";

/**
 * The last line: the root layout itself failed, so this replaces the whole
 * document. It can't count on the app's styles, fonts or providers having
 * loaded, so it brings its own small stylesheet and nothing else.
 */
const css = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: #f7f6fc; color: #181828; }
.card { width: 100%; max-width: 440px; padding: 32px; border-radius: 20px; background: #fff;
  border: 1px solid rgba(24, 24, 40, 0.1); box-shadow: 0 24px 60px -30px rgba(24, 24, 40, 0.35); }
h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -0.01em; }
p { margin: 0; font-size: 14px; line-height: 1.6; color: rgba(24, 24, 40, 0.7); }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.btn { appearance: none; border: 0; cursor: pointer; font: inherit; font-size: 14px; font-weight: 600;
  height: 40px; padding: 0 18px; border-radius: 999px; text-decoration: none; display: inline-flex; align-items: center; }
.primary { background: #6c5ce7; color: #fff; }
.ghost { background: transparent; color: inherit; border: 1px solid rgba(24, 24, 40, 0.18); }
.note { margin-top: 20px; font-size: 12px; color: rgba(24, 24, 40, 0.55); }
@media (prefers-color-scheme: dark) {
  body { background: #000; color: #ededed; }
  .card { background: #141416; border-color: rgba(255, 255, 255, 0.1); }
  p { color: rgba(237, 237, 237, 0.7); }
  .primary { background: #f5f5f5; color: #000; }
  .ghost { border-color: rgba(255, 255, 255, 0.2); }
  .note { color: rgba(237, 237, 237, 0.55); }
}
`;

const NOTE: Partial<Record<SendResult, string>> = {
  sent: "A crash report went to the team: the error and the page's address, nothing you wrote.",
  off: "Crash reports are switched off in Settings, so nothing was sent.",
  ask: "Send the team a crash report? It holds the error and the page's address, nothing you wrote.",
  failed: "The crash report couldn't be sent.",
};

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [result, setResult] = useState<SendResult | "sending" | null>(null);

  useEffect(() => {
    void reportCrash({ error, source: "root", digest: error.digest }).then(setResult);
  }, [error]);

  async function send() {
    setResult("sending");
    setResult(await sendCrashReport({ error, source: "root", digest: error.digest }));
  }

  const note = result && result !== "sending" ? NOTE[result] : undefined;

  return (
    <html lang="en">
      <head>
        <title>Something went wrong | DoOrDie</title>
        <meta name="robots" content="noindex" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main className="card" role="alert">
          <h1>DoOrDie couldn&apos;t load.</h1>
          <p>
            Something failed before the page could appear. Nothing you saved has been lost. Reloading
            usually fixes it.
          </p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <a className="btn ghost" href="/">
              Go to the home page
            </a>
          </div>
          {note && (
            <p className="note" aria-live="polite">
              {note}
            </p>
          )}
          {(result === "ask" || result === "sending") && (
            <div className="actions">
              <button type="button" className="btn ghost" onClick={() => void send()} disabled={result === "sending"}>
                {result === "sending" ? "Sending…" : "Send crash report"}
              </button>
            </div>
          )}
          {error.digest && <p className="note">Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
