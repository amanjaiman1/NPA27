/* ════════════════════════════════════════════════════════════════
   MERGING TWO DEVICES' EDITS
   Pure functions, no imports. When two devices change the same account
   between syncs, the snapshot that reaches the cloud second is merged
   with the first rather than replacing it.

   `merge3` is the normal case: it knows the version both devices started
   from (the "base"), so it can tell an edit from a deletion. Each side's
   changes are kept, item by item: journal days are matched by date, every
   other list by `id`, objects field by field. Only when both devices
   changed the *same* field to different values is one side chosen — this
   device's — and the other value is returned in `conflicts`, so it can be
   shown and recovered rather than silently dropped.

   `mergeTwoWay` is for the one time there is no base (data written before
   versioned sync existed). Nothing is deleted; on a clash the preferred
   side wins and the other is reported.
   ════════════════════════════════════════════════════════════════ */

export interface MergeConflict {
  /** Where the clash happened, e.g. `journal[2026-11-01].reflection`. */
  path: string;
  /** The value that was kept. */
  kept: unknown;
  /** The value that lost. `undefined` means "the item was deleted". */
  discarded: unknown;
}

export interface MergeResult<T = unknown> {
  value: T;
  conflicts: MergeConflict[];
}

type Obj = Record<string, unknown>;

/** Lists matched by something other than `id`. Journal days are unique per date. */
const KEY_BY_PATH: Record<string, string> = {
  journal: "date",
  lifeLog: "date",
};

/**
 * Lists of plain values that behave as sets (order carries no meaning), so a
 * file linked to a goal on one device and another file linked on a second
 * device both survive the merge instead of clashing.
 */
const SET_PATHS = new Set([
  "accomplished",
  "notifyState.readIds",
  "notifyState.dismissedIds",
  "journal.fileIds",
  "goals.fileIds",
  "goals.journalDates",
  "lifeLog.fileIds",
]);

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Structural equality with JSON semantics: key order is ignored, `undefined` equals absent. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/** The path used to look up list policies: indices and keys stripped. */
function policyPath(path: string): string {
  return path.replace(/\[[^\]]*\]/g, "");
}

function keyFieldFor(path: string): string {
  return KEY_BY_PATH[policyPath(path)] ?? "id";
}

/** Map of key -> item when every item is an object with a unique string key. */
function keyed(list: unknown, field: string): Map<string, Obj> | null {
  if (!Array.isArray(list)) return null;
  const out = new Map<string, Obj>();
  for (const item of list) {
    if (!isObj(item)) return null;
    const k = item[field];
    if (typeof k !== "string" || !k || out.has(k)) return null;
    out.set(k, item);
  }
  return out;
}

function isPrimitiveList(list: unknown): list is (string | number)[] {
  return Array.isArray(list) && list.every((v) => typeof v === "string" || typeof v === "number");
}

/**
 * Order for a merged list: the remote order, with items that only this device
 * added slotted in after whatever preceded them locally. Lists with a natural
 * sort (journal by date and so on) are re-sorted by the store afterwards.
 */
function mergedOrder(remoteKeys: string[], localKeys: string[], keep: Set<string>): string[] {
  const order = remoteKeys.filter((k) => keep.has(k));
  const placed = new Set(order);
  localKeys.forEach((k, i) => {
    if (!keep.has(k) || placed.has(k)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = order.indexOf(localKeys[j]);
      if (idx >= 0) {
        at = idx + 1;
        break;
      }
    }
    order.splice(at, 0, k);
    placed.add(k);
  });
  return order;
}

function sortedSet(values: Iterable<string | number>): (string | number)[] {
  return [...new Set(values)].sort((a, b) =>
    typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)),
  );
}

/* ── three-way ─────────────────────────────────────────────────── */

export function merge3<T>(base: T, local: T, remote: T): MergeResult<T> {
  const conflicts: MergeConflict[] = [];
  const value = m3(base, local, remote, "", conflicts) as T;
  return { value, conflicts };
}

function m3(base: unknown, local: unknown, remote: unknown, path: string, out: MergeConflict[]): unknown {
  if (deepEqual(local, remote)) return local;
  if (deepEqual(local, base)) return remote; // only the other device changed it
  if (deepEqual(remote, base)) return local; // only this device changed it

  // Both changed it, differently. Merge inside when the shapes allow.
  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const result: Obj = {};
    const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
    for (const k of keys) {
      const v = m3(b[k], local[k], remote[k], path ? `${path}.${k}` : k, out);
      if (v !== undefined) result[k] = v;
    }
    return result;
  }

  if (Array.isArray(local) && Array.isArray(remote)) {
    const field = keyFieldFor(path);
    const lk = keyed(local, field);
    const rk = keyed(remote, field);
    const bk = keyed(Array.isArray(base) ? base : [], field) ?? new Map<string, Obj>();
    if (lk && rk) {
      const merged = new Map<string, unknown>();
      const all = new Set([...rk.keys(), ...lk.keys(), ...bk.keys()]);
      for (const k of all) {
        const v = m3(bk.get(k), lk.get(k), rk.get(k), `${path}[${k}]`, out);
        if (v !== undefined) merged.set(k, v);
      }
      const order = mergedOrder([...rk.keys()], [...lk.keys()], new Set(merged.keys()));
      return order.map((k) => merged.get(k));
    }
    if (SET_PATHS.has(policyPath(path)) && isPrimitiveList(local) && isPrimitiveList(remote)) {
      const b = new Set(isPrimitiveList(base) ? base : []);
      const l = new Set(local);
      const r = new Set(remote);
      const keep = [...new Set([...local, ...remote])].filter(
        (x) => (l.has(x) && r.has(x)) || (l.has(x) && !b.has(x)) || (r.has(x) && !b.has(x)),
      );
      return sortedSet(keep);
    }
  }

  // Deleted on one side, changed on the other: keep the change. Nothing lost.
  if (local === undefined) return remote;
  if (remote === undefined) return local;

  // A genuine clash on a single value. Keep this device's, report the other.
  out.push({ path, kept: local, discarded: remote });
  return local;
}

/* ── two-way (no common base) ──────────────────────────────────── */

export function mergeTwoWay<T>(local: T, remote: T, prefer: "local" | "remote"): MergeResult<T> {
  const conflicts: MergeConflict[] = [];
  const value = m2(local, remote, prefer, "", conflicts) as T;
  return { value, conflicts };
}

function m2(
  local: unknown,
  remote: unknown,
  prefer: "local" | "remote",
  path: string,
  out: MergeConflict[],
): unknown {
  if (deepEqual(local, remote)) return local;
  if (local === undefined) return remote;
  if (remote === undefined) return local;

  if (isObj(local) && isObj(remote)) {
    const result: Obj = {};
    const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
    for (const k of keys) {
      const v = m2(local[k], remote[k], prefer, path ? `${path}.${k}` : k, out);
      if (v !== undefined) result[k] = v;
    }
    return result;
  }

  if (Array.isArray(local) && Array.isArray(remote)) {
    const field = keyFieldFor(path);
    const lk = keyed(local, field);
    const rk = keyed(remote, field);
    if (lk && rk) {
      const merged = new Map<string, unknown>();
      for (const k of new Set([...rk.keys(), ...lk.keys()])) {
        merged.set(k, m2(lk.get(k), rk.get(k), prefer, `${path}[${k}]`, out));
      }
      return mergedOrder([...rk.keys()], [...lk.keys()], new Set(merged.keys())).map((k) => merged.get(k));
    }
    if (SET_PATHS.has(policyPath(path)) && isPrimitiveList(local) && isPrimitiveList(remote)) {
      return sortedSet([...local, ...remote]);
    }
  }

  const kept = prefer === "local" ? local : remote;
  const discarded = prefer === "local" ? remote : local;
  out.push({ path, kept, discarded });
  return kept;
}
