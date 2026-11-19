/* ════════════════════════════════════════════════════════════════
   SENDING A LIVE UPDATE
   One message on the private Realtime channel, through Supabase's
   REST broadcast endpoint with the service-role key (the only key that
   may send on it). Server only.

   It never fails the administrator's change: the change is already
   saved, and an app that misses the message still reloads when it next
   opens or comes back to the screen. Waits at most a couple of seconds.
   ════════════════════════════════════════════════════════════════ */

import { LIVE_EVENT, LIVE_TOPIC, type LiveArea, type LivePayload } from "../live";

const TIMEOUT_MS = 2_500;

export async function broadcastPlatformUpdate(areas: LiveArea[]): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !areas.length) return false;

  const payload: LivePayload = { areas: [...new Set(areas)], at: new Date().toISOString() };
  const post = (path: string, body: unknown) =>
    fetch(`${url}${path}`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  try {
    let res = await post(`/realtime/v1/api/broadcast/${encodeURIComponent(LIVE_TOPIC)}/events/${encodeURIComponent(LIVE_EVENT)}?private=true`, payload);
    // A Realtime that predates the per-topic endpoint still has the batch one.
    if (res.status === 404 || res.status === 405) {
      res = await post("/realtime/v1/api/broadcast", { messages: [{ topic: LIVE_TOPIC, event: LIVE_EVENT, payload, private: true }] });
    }
    if (!res.ok) console.warn(`[live] Supabase Realtime refused the update (${res.status}).`);
    return res.ok;
  } catch (e) {
    console.warn(`[live] Couldn't reach Supabase Realtime: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
