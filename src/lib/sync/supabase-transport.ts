import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  SyncError,
  type RemoteDoc,
  type RemoteHead,
  type SaveOutcome,
  type Snapshot,
  type SyncTransport,
} from "./engine";

/**
 * The sync engine's view of Supabase: three calls against the caller's own
 * `chronicle_state` row. Row Level Security limits every read to that row, and
 * the only write path is `save_chronicle_state`, which acts on `auth.uid()`.
 *
 * Every call first checks that the signed-in user is still the account this
 * transport was made for. After a sign-out or a switch, a request that was
 * already queued fails instead of reading or writing the wrong account.
 */
export function createSupabaseTransport(client: SupabaseClient, accountId: string): SyncTransport {
  async function assertAccount(): Promise<void> {
    const { data } = await client.auth.getSession();
    const id = data.session?.user.id;
    // No usable session yet (an expired token while offline): retry later.
    if (!id) throw new SyncError("Waiting to reconnect your session.", "auth");
    if (id !== accountId) throw new SyncError("The signed-in account changed.", "stopped");
  }

  return {
    async head(): Promise<RemoteHead | null> {
      await assertAccount();
      const { data, error, status } = await client
        .from("chronicle_state")
        .select("version, updated_at")
        .eq("user_id", accountId)
        .maybeSingle();
      if (error) throw classify(error, status);
      return data ? { version: Number(data.version), updatedAt: data.updated_at ?? null } : null;
    },

    async fetch(): Promise<RemoteDoc | null> {
      await assertAccount();
      const { data, error, status } = await client
        .from("chronicle_state")
        .select("data, version, updated_at")
        .eq("user_id", accountId)
        .maybeSingle();
      if (error) throw classify(error, status);
      if (!data) return null;
      return {
        data: (data.data ?? {}) as Snapshot,
        version: Number(data.version),
        updatedAt: data.updated_at ?? null,
      };
    },

    async save(snapshot: Snapshot, baseVersion: number): Promise<SaveOutcome> {
      await assertAccount();
      const { data, error, status } = await client.rpc("save_chronicle_state", {
        p_data: snapshot,
        p_base_version: baseVersion,
      });
      if (error) throw classify(error, status);
      const row = (Array.isArray(data) ? data[0] : data) as
        | { saved: boolean; version: number | string | null; updated_at: string | null }
        | undefined;
      if (!row) throw new SyncError("The cloud didn't confirm the save.", "server");
      return {
        saved: Boolean(row.saved),
        head: { version: Number(row.version ?? 0), updatedAt: row.updated_at ?? null },
      };
    },
  };
}

/** Turns a PostgREST failure into something the engine can act on. */
function classify(error: PostgrestError, status: number): SyncError {
  const code = error.code ?? "";
  const message = error.message ?? "Sync failed.";
  if (status === 0 || /fetch|network|load failed/i.test(message)) {
    return new SyncError("You're offline. Changes are saved on this device.", "network");
  }
  if (status === 401 || code === "PGRST301" || code === "PGRST303") {
    return new SyncError("Your session needs refreshing.", "auth");
  }
  // Column, function or schema missing: the database migration hasn't been run.
  if (["42703", "42883", "PGRST202", "PGRST204", "PGRST200"].includes(code)) {
    return new SyncError(
      "Cloud sync needs a database update. Run the SQL migration described in the README.",
      "schema",
    );
  }
  if (["22023", "23514", "42501"].includes(code) || status === 413) {
    return new SyncError(`The cloud refused this save: ${message}`, "rejected");
  }
  if (status === 429 || status >= 500) {
    return new SyncError("The cloud is busy. Retrying shortly.", "network");
  }
  return new SyncError(message, "server");
}
