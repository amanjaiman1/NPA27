import { supabase } from "./supabase";
import type { CloudSnapshot } from "./store";

/** One row per user holds the entire app state as a JSON blob. */
const TABLE = "chronicle_state";

export interface RemoteRow {
  data: CloudSnapshot;
  updatedAt: string; // ISO timestamp from the server
}

/** Fetch this user's saved snapshot, or null if they have none yet. */
export async function fetchRemote(userId: string): Promise<RemoteRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    data: (data.data ?? {}) as CloudSnapshot,
    updatedAt: data.updated_at as string,
  };
}

/** Upsert this user's snapshot. Returns the new server timestamp. */
export async function pushRemote(
  userId: string,
  snapshot: CloudSnapshot,
): Promise<string> {
  if (!supabase) throw new Error("Cloud sync is not configured.");
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { user_id: userId, data: snapshot, updated_at: updatedAt },
      { onConflict: "user_id" },
    );
  if (error) throw error;
  return updatedAt;
}
