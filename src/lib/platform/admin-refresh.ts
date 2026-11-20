/* ════════════════════════════════════════════════════════════════
   REFRESH DATA
   The Admin Center's one refresh, and the record of how fresh each
   kind of data on screen is.

   Every view that shows Admin Center data (a page's list, an open
   dialog, the Overview's figures, the audit log, your own role)
   registers here while it's mounted. "Refresh Data" asks every one of
   them to fetch afresh at the same time: one request per address
   however many views show it, at most four requests at once, each given
   15 seconds. A view that fails keeps what it showed. What came of each
   resource is kept for the header and its status panel: updated,
   failed, not part of your role, not set up, or not open.

   Nothing else is cached anywhere: a page you've left holds no data,
   so it can't go stale. It loads fresh the next time it opens. Between
   refreshes the live updates (components/platform/live-updates.ts) keep
   what's on screen current; views report those loads here too, so the
   panel can tell a manual refresh from an automatic one.

   No React here, so it can be tested on its own (tests/admin-refresh.
   test.ts). The hooks are in lib/platform/client.ts, the button in
   components/admin/refresh-data.tsx. Requests go to the same protected
   Admin API as every page, so each one checks the caller's role again.
   ════════════════════════════════════════════════════════════════ */

import type { Permission } from "./roles";

/* ── what there is to refresh ─────────────────────────────────── */

export const ADMIN_RESOURCE_IDS = [
  "overview",
  "users",
  "visits",
  "reviews",
  "feedback",
  "crashes",
  "announcements",
  "changelog",
  "settings",
  "access",
  "audit",
  "role",
] as const;
export type AdminResourceId = (typeof ADMIN_RESOURCE_IDS)[number];

export interface AdminResource {
  id: AdminResourceId;
  label: string;
  /** What it covers, in a few words, for the status panel. */
  covers: string;
  /** In scope for roles with this permission. The API refuses the rest anyway. */
  permission: Permission;
  /** Comes with another resource's answers rather than its own requests (visits come with the user list). */
  via?: AdminResourceId;
}

/** Every resource, in the order the status panel lists them. A new module adds one line here. */
export const ADMIN_RESOURCES: readonly AdminResource[] = [
  { id: "overview", label: "Overview", covers: "Figures from every module", permission: "admin.access" },
  { id: "users", label: "Users", covers: "Accounts, sign-ins and suspensions", permission: "users.read" },
  { id: "visits", label: "Visits", covers: "Who is on the site, and when each account came and went", permission: "users.read", via: "users" },
  { id: "reviews", label: "Reviews", covers: "Submissions, what's waiting, and moderation", permission: "reviews.moderate" },
  { id: "feedback", label: "Feedback", covers: "Messages, their status and answers", permission: "feedback.manage" },
  { id: "crashes", label: "Crash reports", covers: "What the app sent when something broke", permission: "feedback.manage" },
  { id: "announcements", label: "Announcements", covers: "Messages in the app, and who opened them", permission: "announcements.manage" },
  { id: "changelog", label: "Changelog", covers: "Public product updates", permission: "changelog.manage" },
  { id: "settings", label: "Platform settings", covers: "Reviews, display and the notice", permission: "settings.manage" },
  { id: "access", label: "Admin access", covers: "Who has a role, and every role change", permission: "access.manage" },
  { id: "audit", label: "Audit log", covers: "Every administrative action", permission: "audit.read" },
  { id: "role", label: "Your role", covers: "What your role lets you open", permission: "admin.access" },
];

const RESOURCE = new Map(ADMIN_RESOURCES.map((r) => [r.id, r]));
export const adminResource = (id: AdminResourceId): AdminResource => RESOURCE.get(id) as AdminResource;

/** The resource an Admin API address belongs to, or null for one that isn't data (none yet). */
export function adminResourceOf(path: string): AdminResourceId | null {
  switch (path.split(/[/?]/)[0]) {
    case "me":
      return "role";
    case "overview":
      return "overview";
    case "users":
      return "users";
    case "reviews":
      return "reviews";
    case "feedback":
      return "feedback";
    case "crashes":
      return "crashes";
    case "announcements":
      return "announcements";
    case "changelog":
      return "changelog";
    case "settings":
      return "settings";
    case "access":
      return "access";
    case "audit":
      return "audit";
    default:
      return null;
  }
}

/* ── views ─────────────────────────────────────────────────────── */

/** Fetches an Admin API address (`users?filter=all`), giving up when `signal` aborts. */
export type AdminFetch = <T>(path: string, signal: AbortSignal) => Promise<T>;

/** What a view gets for a refresh. */
export interface RefreshContext {
  signal: AbortSignal;
  /** The Admin API: one request per address within a refresh, however many views ask. */
  get: <T>(path: string) => Promise<T>;
}

/** How a resource that comes with a view's answer fared (visits, with the user list). */
export type AlsoOutcome =
  | { state: "updated" }
  | { state: "failed"; problem: string }
  /** Not set up on this project: not a failure. */
  | { state: "unavailable"; problem: string };

export interface ViewReport {
  /** Something the view had open no longer exists: a deleted account, a removed review. */
  gone?: boolean;
  also?: Partial<Record<AdminResourceId, AlsoOutcome>>;
}

export interface AdminView {
  resource: AdminResourceId;
  /** Views with the same key show the same address. */
  key: string;
  /**
   * Fetches afresh through `ctx.get` and puts the answer on screen.
   * Resolves once it's there (or once a newer answer is); rejects with
   * the failure, keeping what was shown.
   */
  refresh: (ctx: RefreshContext) => Promise<ViewReport | void>;
}

/* ── what happened ─────────────────────────────────────────────── */

export type ResourceState =
  /** In scope, but nothing of it is on screen: it loads fresh when opened. */
  | "unopened"
  /** On screen, first load under way. */
  | "loading"
  /** A Refresh Data is fetching it. */
  | "refreshing"
  | "updated"
  /** The last attempt failed; what's on screen is older. */
  | "failed"
  /** Refused as outside the role (a role changed since the page opened). */
  | "skipped"
  /** Not set up on this project yet. */
  | "unavailable";

/** How the data on screen was last loaded. */
export type UpdateKind = "opened" | "reloaded" | "live" | "refresh";

export interface ResourceStatus extends AdminResource {
  state: ResourceState;
  /** Views showing it now. */
  views: number;
  /** When the data on screen was last loaded, and how. */
  updatedAt: number | null;
  updatedBy: UpdateKind | null;
  /** Why the last attempt failed, in words a person can act on. */
  problem: string | null;
  note: string | null;
}

export interface RefreshSummary {
  id: number;
  startedAt: number;
  finishedAt: number;
  /** Everything asked for came back / some of it / none of it. */
  outcome: "success" | "partial" | "failed";
  /**
   * The Admin Center itself ended during the run: the role was removed
   * ("no_access") or the session ended ("signed_out"). The screen says so;
   * nothing else should.
   */
  ended: "no_access" | "signed_out" | null;
  updated: AdminResourceId[];
  failed: AdminResourceId[];
  /** Outside the role: never asked for. */
  skipped: AdminResourceId[];
  /** Not open: nothing held, so nothing to refresh. */
  unopened: AdminResourceId[];
  unavailable: AdminResourceId[];
  /** Every failure was for want of a connection. */
  offline: boolean;
}

export interface AdminRefreshSnapshot {
  running: boolean;
  /** What the run under way covers, or null for everything. */
  runningOnly: readonly AdminResourceId[] | null;
  /** The last finished Refresh Data, with any retries since folded in. */
  last: RefreshSummary | null;
  resources: readonly ResourceStatus[];
}

/* ── failures, in words ────────────────────────────────────────── */

/** A failure that isn't an answer from the API: the refresh's own timeout. */
export class RefreshTimeout extends Error {
  readonly status = 0;
  readonly code = "timeout";
  constructor() {
    super("The server took too long to answer.");
  }
}

type Failure = { status?: number; code?: string };
export type FailureKind = "forbidden" | "session" | "gone" | "offline" | "timeout" | "unavailable" | "busy" | "server";

export function failureKind(error: unknown): FailureKind {
  const e = (error ?? {}) as Failure;
  if (e.code === "timeout") return "timeout";
  if (e.code === "not_migrated" || e.code === "not_configured") return "unavailable";
  if (e.status === 401) return "session";
  if (e.status === 403) return "forbidden";
  if (e.status === 404) return "gone";
  if (e.status === 429) return "busy";
  if (e.status === 0 || e.code === "offline") return "offline";
  return "server";
}

/** What went wrong, for the panel. Never the server's own words: they can say more than an admin needs. */
export const FAILURE_TEXT: Record<FailureKind, string> = {
  forbidden: "Not part of your role any more.",
  session: "Your session has ended. Sign in again to refresh.",
  gone: "It no longer exists.",
  offline: "Couldn't reach the server. Check your connection.",
  timeout: "The server took too long to answer.",
  unavailable: "Not set up on this project yet.",
  busy: "Too many requests just now. Try again in a minute.",
  server: "The server couldn't answer just now.",
};

export const describeFailure = (error: unknown): string => FAILURE_TEXT[failureKind(error)];

/* ── the order answers go on screen in ─────────────────────────── */

/**
 * For one view: an answer goes on screen only if no newer request's
 * answer already has, whichever arrives first, and never once the view
 * has moved to another address. So a slow, older request can never
 * overwrite a newer one (a live update, a refresh), and a newer request
 * that fails doesn't stop an older one that worked.
 */
export function createResponseOrder() {
  let started = 0;
  let shown = 0;
  let floor = 0;
  return {
    /** A new request: its number. */
    begin: () => ++started,
    /** The view moved to another address: every request so far is obsolete. */
    reset: () => {
      floor = started;
    },
    /** Whether request `n`'s answer may go on screen. If so, it's now the one shown. */
    take(n: number): boolean {
      if (n <= floor || n <= shown) return false;
      shown = n;
      return true;
    },
    /** Request `n` is the newest started, so it decides the loading state and any error. */
    isLatest: (n: number) => n === started && n > floor,
    /** A newer answer than `n`'s is on screen, or `n` is from before the address changed. */
    superseded: (n: number) => n <= shown || n <= floor,
  };
}

/* ── the store ─────────────────────────────────────────────────── */

interface Entry {
  views: Set<number>;
  state: ResourceState;
  updatedAt: number | null;
  updatedBy: UpdateKind | null;
  problem: string | null;
  note: string | null;
}

const blank = (): Entry => ({ views: new Set(), state: "unopened", updatedAt: null, updatedBy: null, problem: null, note: null });
const entries = new Map<AdminResourceId, Entry>(ADMIN_RESOURCE_IDS.map((id) => [id, blank()]));
const views = new Map<number, AdminView>();
let viewSeq = 0;
let runSeq = 0;
/** Bumped by a reset, so a run that outlives the session it began in changes nothing. */
let epoch = 0;
let current: { promise: Promise<RefreshSummary>; controller: AbortController; only: AdminResourceId[] | null } | null = null;
let last: RefreshSummary | null = null;
let clock: () => number = () => Date.now();

const entry = (id: AdminResourceId) => entries.get(id) as Entry;
/** Views on screen for a resource: its own, or its source's. */
const viewCount = (r: AdminResource) => entry(r.via ?? r.id).views.size;

const listeners = new Set<() => void>();
let snapshot: AdminRefreshSnapshot = build();

function build(): AdminRefreshSnapshot {
  return {
    running: current !== null,
    runningOnly: current?.only ?? null,
    last,
    resources: ADMIN_RESOURCES.map((r) => {
      const e = entry(r.id);
      return { ...r, state: e.state, views: viewCount(r), updatedAt: e.updatedAt, updatedBy: e.updatedBy, problem: e.problem, note: e.note };
    }),
  };
}

function emit() {
  snapshot = build();
  for (const listener of [...listeners]) listener();
}

export function subscribeAdminRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getAdminRefreshSnapshot = (): AdminRefreshSnapshot => snapshot;

/** The snapshot before anything has loaded, for the server render. */
const initial = build();
export const getAdminRefreshServerSnapshot = (): AdminRefreshSnapshot => initial;

/** Resources that travel with `id`'s answers (users → visits), and `id` itself. */
const withRiders = (id: AdminResourceId): AdminResource[] => ADMIN_RESOURCES.filter((r) => r.id === id || r.via === id);

/** A view comes on screen. Returns the way to take it off. */
export function registerAdminView(view: AdminView): () => void {
  const id = ++viewSeq;
  views.set(id, view);
  const e = entry(view.resource);
  e.views.add(id);
  for (const r of withRiders(view.resource)) {
    const x = entry(r.id);
    if (x.state === "unopened") x.state = "loading";
  }
  emit();
  return () => {
    if (!views.delete(id)) return;
    e.views.delete(id);
    if (!e.views.size) {
      // Nothing of it on screen: nothing held, nothing to be stale.
      for (const r of withRiders(view.resource)) {
        const x = entry(r.id);
        if (x.state !== "refreshing") Object.assign(x, { state: "unopened", problem: null, note: null });
      }
    }
    emit();
  };
}

/** A view loaded its data by itself: on opening, after a change made here, or from a live update. */
export function noteAdminLoad(resource: AdminResourceId, kind: Exclude<UpdateKind, "refresh">, report?: ViewReport | void): void {
  const at = clock();
  Object.assign(entry(resource), { state: "updated", updatedAt: at, updatedBy: kind, problem: null, note: report?.gone ? FAILURE_TEXT.gone : null });
  // What came with the answer (visits, with the user list): as the view says, or fine if it says nothing.
  for (const r of withRiders(resource)) {
    if (r.id === resource) continue;
    const outcome = report?.also?.[r.id] ?? { state: "updated" as const };
    Object.assign(
      entry(r.id),
      outcome.state === "updated"
        ? { state: "updated", updatedAt: at, updatedBy: kind, problem: null }
        : { state: outcome.state, problem: outcome.problem },
    );
  }
  emit();
}

/** A view's own load failed (opening a page, or reloading after a change). Live failures keep quiet. */
export function noteAdminLoadFailed(resource: AdminResourceId, error: unknown): void {
  const kind = failureKind(error);
  const e = entry(resource);
  e.state = kind === "forbidden" ? "skipped" : kind === "unavailable" ? "unavailable" : "failed";
  e.problem = FAILURE_TEXT[kind];
  emit();
}

/* ── one refresh ───────────────────────────────────────────────── */

export interface RefreshOptions {
  /** What the signed-in role may do: resources outside it are never asked for. */
  can: (permission: Permission) => boolean;
  fetch: AdminFetch;
  /** Only these resources (a retry), with whatever travels with them. */
  only?: readonly AdminResourceId[];
  /** Per request. */
  timeoutMs?: number;
  /** Requests at once. */
  concurrency?: number;
}

const TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;

/** Runs `task` once a slot is free; at most `max` at a time, in the order asked. */
function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        // Through a promise, so a task that throws at once still frees its slot.
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            // The slot passes straight to the next in line.
            const next = queue.shift();
            if (next) next();
            else active--;
          });
      };
      if (active < max) {
        active++;
        start();
      } else queue.push(start);
    });
}

/** `run`, given up after `ms` (a RefreshTimeout) or when `outer` aborts. The request is cancelled either way. */
function bounded<T>(run: (signal: AbortSignal) => Promise<T>, outer: AbortSignal, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop = () => controller.abort();
  const timeout = new Promise<never>((_, reject) => {
    stop = () => {
      reject({ status: 0, code: "aborted" });
      controller.abort();
    };
    timer = setTimeout(() => {
      reject(new RefreshTimeout());
      controller.abort();
    }, ms);
  });
  if (outer.aborted) stop();
  else outer.addEventListener("abort", stop, { once: true });
  const request = run(controller.signal);
  // Whatever the request does after the race is over, nothing is left unhandled.
  request.catch(() => undefined);
  return Promise.race([request, timeout]).finally(() => {
    clearTimeout(timer);
    outer.removeEventListener("abort", stop);
  });
}

function createContext(options: RefreshOptions, signal: AbortSignal): RefreshContext {
  const requests = new Map<string, Promise<unknown>>();
  const slot = limiter(options.concurrency ?? CONCURRENCY);
  const ms = options.timeoutMs ?? TIMEOUT_MS;
  return {
    signal,
    get<T>(path: string): Promise<T> {
      let p = requests.get(path);
      if (!p) {
        p = slot(() => bounded((s) => options.fetch<T>(path, s), signal, ms));
        requests.set(path, p);
      }
      return p as Promise<T>;
    },
  };
}

/** Everything `only` names, with whatever travels with each and whatever each travels with. */
function scopeOf(only: readonly AdminResourceId[] | undefined): Set<AdminResourceId> {
  if (!only) return new Set(ADMIN_RESOURCE_IDS);
  const scope = new Set<AdminResourceId>();
  for (const id of only) {
    const source = adminResource(id).via ?? id;
    for (const r of withRiders(source)) scope.add(r.id);
  }
  return scope;
}

/**
 * What was asked for while a run that doesn't cover it was going (a retry
 * of one resource, then everything): one run after it, covering all of it.
 * `only` null is everything.
 */
let next: { only: Set<AdminResourceId> | null; options: RefreshOptions; promise: Promise<RefreshSummary> } | null = null;

const covers = (outer: readonly AdminResourceId[] | null, inner: Set<AdminResourceId>) => outer === null || [...inner].every((id) => outer.includes(id));

/**
 * Refresh Data: every view on screen, for every resource the role
 * covers, fetched afresh at once. Pressing again while it runs joins
 * the run under way rather than starting another. Asking for something
 * the run under way doesn't cover waits for it, then runs.
 */
export function refreshAdminData(options: RefreshOptions): Promise<RefreshSummary> {
  if (current) {
    const scope = scopeOf(options.only);
    if (covers(current.only, scope)) return current.promise;
    if (next) {
      next.only = next.only === null || !options.only ? null : new Set([...next.only, ...scope]);
      next.options = options;
      return next.promise;
    }
    const queuedIn = epoch;
    const queued = { only: options.only ? scope : null, options, promise: Promise.resolve() as unknown as Promise<RefreshSummary> };
    queued.promise = current.promise
      .catch(() => undefined)
      .then(() => {
        if (next === queued) next = null;
        if (queuedIn !== epoch) throw new Error("The Admin Center session ended.");
        return refreshAdminData({ ...queued.options, only: queued.only ? [...queued.only] : undefined });
      });
    next = queued;
    return queued.promise;
  }
  const myEpoch = epoch;
  const controller = new AbortController();
  const id = ++runSeq;
  const startedAt = clock();
  const scope = scopeOf(options.only);

  // The plan, taken now: views that come on screen during the run load fresh by themselves.
  type Plan = { resource: AdminResource; views: AdminView[] };
  const plan: Plan[] = [];
  const skipped: AdminResourceId[] = [];
  const unopened: AdminResourceId[] = [];
  for (const r of ADMIN_RESOURCES) {
    if (!scope.has(r.id)) continue;
    if (!options.can(r.permission)) {
      skipped.push(r.id);
      continue;
    }
    if (r.via) continue; // settled with its source
    const shown = [...entry(r.id).views].map((v) => views.get(v)).filter((v): v is AdminView => Boolean(v));
    if (!shown.length) unopened.push(r.id);
    else plan.push({ resource: r, views: shown });
  }
  for (const r of ADMIN_RESOURCES) {
    if (scope.has(r.id) && r.via && options.can(r.permission) && !plan.some((p) => p.resource.id === r.via)) unopened.push(r.id);
  }
  for (const p of plan) for (const r of withRiders(p.resource.id)) if (options.can(r.permission)) entry(r.id).state = "refreshing";

  const ctx = createContext(options, controller.signal);
  const promise = (async (): Promise<RefreshSummary> => {
    const results = await Promise.all(
      plan.map(async (p) => {
        // Through a promise each, so a view that throws at once fails alone.
        const settled = await Promise.allSettled(p.views.map((v) => Promise.resolve().then(() => v.refresh(ctx))));
        return { plan: p, settled, at: clock() };
      }),
    );
    if (myEpoch !== epoch) throw new Error("The Admin Center session ended.");

    const updated: AdminResourceId[] = [];
    const failed: AdminResourceId[] = [];
    const unavailable: AdminResourceId[] = [];
    const failures: unknown[] = [];
    let ended: RefreshSummary["ended"] = null;
    const set = (rid: AdminResourceId, patch: Partial<Entry>) => Object.assign(entry(rid), patch);

    for (const { plan: p, settled, at } of results) {
      const rid = p.resource.id;
      // A view whose own request failed but which already shows a newer answer (a live update
      // that started after it) resolves by itself: it's up to date. So what's left here failed.
      const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => s.reason);
      const reports = settled.filter((s): s is PromiseFulfilledResult<ViewReport | void> => s.status === "fulfilled").map((s) => s.value);
      const riders = withRiders(rid).filter((r) => r.id !== rid && options.can(r.permission));
      const forbidden = rejected.find((e) => failureKind(e) === "forbidden");

      if (rid === "role" && rejected.length && (forbidden || failureKind(rejected[0]) === "session")) {
        // Not a resource failing: the Admin Center itself is over for this session.
        ended = forbidden ? "no_access" : "signed_out";
        failed.push(rid);
        failures.push(rejected[0]);
        set(rid, { state: "failed", problem: forbidden ? "This account no longer has an Admin Center role." : FAILURE_TEXT.session });
        continue;
      }
      if (forbidden) {
        skipped.push(rid, ...riders.map((r) => r.id));
        for (const r of [p.resource, ...riders]) set(r.id, { state: "skipped", problem: FAILURE_TEXT.forbidden });
        continue;
      }
      if (rejected.length) {
        const kind = failureKind(rejected[0]);
        if (kind === "unavailable") {
          unavailable.push(rid);
          set(rid, { state: "unavailable", problem: FAILURE_TEXT.unavailable });
        } else {
          failed.push(rid);
          failures.push(rejected[0]);
          set(rid, { state: "failed", problem: FAILURE_TEXT[kind] });
        }
        for (const r of riders) {
          failed.push(r.id);
          set(r.id, { state: "failed", problem: `Comes with ${p.resource.label}, which couldn't be refreshed.` });
        }
        continue;
      }
      updated.push(rid);
      // A live update that landed after this resource's views finished is the newer: it keeps its time.
      const later = (entry(rid).updatedAt ?? 0) > at && entry(rid).updatedBy !== "refresh";
      set(rid, {
        state: "updated",
        updatedAt: later ? entry(rid).updatedAt : at,
        updatedBy: later ? entry(rid).updatedBy : "refresh",
        problem: null,
        note: reports.some((r) => r?.gone) ? "Something you had open no longer exists." : null,
      });
      for (const r of riders) {
        const outcome = reports.map((x) => x?.also?.[r.id]).find((o) => o && o.state !== "updated") ?? { state: "updated" as const };
        if (outcome.state === "updated") {
          updated.push(r.id);
          set(r.id, { state: "updated", updatedAt: at, updatedBy: "refresh", problem: null, note: null });
        } else if (outcome.state === "unavailable") {
          unavailable.push(r.id);
          set(r.id, { state: "unavailable", problem: outcome.problem });
        } else {
          failed.push(r.id);
          failures.push({ code: "server" });
          set(r.id, { state: "failed", problem: outcome.problem });
        }
      }
    }
    // Views that left the screen during the run: nothing of them is held any more.
    for (const r of ADMIN_RESOURCES) {
      if (scope.has(r.id) && viewCount(r) === 0 && entry(r.id).state !== "skipped") set(r.id, { state: "unopened", problem: null, note: null });
    }

    const finishedAt = clock();
    const asked = updated.length + failed.length;
    const summary: RefreshSummary = {
      id,
      startedAt,
      finishedAt,
      outcome: ended ? "failed" : !failed.length ? "success" : failed.length === asked ? "failed" : "partial",
      ended,
      updated,
      failed,
      skipped,
      unopened,
      unavailable,
      offline: failures.length > 0 && failures.every((e) => failureKind(e) === "offline"),
    };
    // A retry changes the record of the refresh it followed; on its own (a page that failed to
    // open, retried before any Refresh Data) it isn't a Refresh Data, and the header doesn't say so.
    if (!options.only) last = summary;
    else if (last) last = fold(last, summary);
    return summary;
  })();

  current = { promise, controller, only: options.only ? [...scope] : null };
  emit();
  promise
    .finally(() => {
      if (myEpoch !== epoch || current?.promise !== promise) return;
      current = null;
      emit();
    })
    .catch(() => undefined);
  return promise;
}

/** A retry folded into the run it followed: the same finishing time, the retried resources' new outcome. */
function fold(prev: RefreshSummary, retry: RefreshSummary): RefreshSummary {
  const retried = new Set([...retry.updated, ...retry.failed, ...retry.skipped, ...retry.unopened, ...retry.unavailable]);
  const keep = (list: AdminResourceId[]) => list.filter((id) => !retried.has(id));
  const updated = [...keep(prev.updated), ...retry.updated];
  const failed = [...keep(prev.failed), ...retry.failed];
  const asked = updated.length + failed.length;
  return {
    ...prev,
    updated,
    failed,
    skipped: [...keep(prev.skipped), ...retry.skipped],
    unopened: [...keep(prev.unopened), ...retry.unopened],
    unavailable: [...keep(prev.unavailable), ...retry.unavailable],
    outcome: retry.ended ? "failed" : !failed.length ? "success" : failed.length === asked ? "failed" : "partial",
    ended: retry.ended ?? prev.ended,
    offline: failed.length > 0 && retry.offline && prev.offline,
  };
}

/** Tries one resource again (and whatever travels with it). */
export function retryAdminResource(id: AdminResourceId, options: Omit<RefreshOptions, "only">): Promise<RefreshSummary> {
  return refreshAdminData({ ...options, only: [id] });
}

/**
 * A new session (sign-out, another account): forget every outcome and
 * stop the run under way. Views on screen stay registered; they're the
 * new session's.
 */
export function resetAdminRefresh(): void {
  epoch++;
  current?.controller.abort();
  current = null;
  next = null;
  last = null;
  for (const [, e] of entries) Object.assign(e, { state: e.views.size ? "loading" : "unopened", updatedAt: null, updatedBy: null, problem: null, note: null });
  emit();
}

/** Tests only: a fixed clock. */
export function setAdminRefreshClock(now: () => number): void {
  clock = now;
}

/**
 * The newest page of an append-only, newest-first list (the audit log),
 * merged into what's shown: entries in it replace their shown copies, new
 * ones go on top, and older pages already loaded stay. If it doesn't reach
 * what's shown (more happened than a page holds), it replaces everything:
 * `restart`.
 */
export function mergeNewestPage<T extends { id: number }>(shown: readonly T[], fresh: readonly T[], limit: number): { items: T[]; restart: boolean } {
  if (!shown.length) return { items: [...fresh], restart: true };
  if (!fresh.length) return { items: [...shown], restart: false };
  const newestFresh = fresh[0].id;
  const oldestFresh = fresh[fresh.length - 1].id;
  if (fresh.length >= limit && oldestFresh > shown[0].id) return { items: [...fresh], restart: true };
  // Anything shown that's newer than this page came from a later answer: it stays on top.
  return { items: [...shown.filter((e) => e.id > newestFresh), ...fresh, ...shown.filter((e) => e.id < oldestFresh)], restart: false };
}
