/* ════════════════════════════════════════════════════════════════
   THE ADMIN API
   Every /api/admin/* request lands here (app/api/admin/[...path]). Each
   route names the permission it needs, and the dispatcher runs
   requireAdmin() with it before the handler sees anything. There is no
   way to add a route without a permission: the type requires one, and a
   test checks every entry.

   Mutations must also come from the site's own pages and are limited per
   administrator. Everything goes through the platform_admin_* functions,
   which check the actor's role again and audit in the same transaction.
   Dependencies are injected so the tests can run this without a network.
   ════════════════════════════════════════════════════════════════ */

import type { Actor, Permission } from "../roles";
import {
  isUuid,
  parseAnnouncement,
  parseAnnouncementAction,
  parseAuditQuery,
  parseChangelog,
  parseChangelogAction,
  parseFeedbackPatch,
  parseFeedbackQuery,
  parseModeration,
  parseNote,
  parsePage,
  parseResponse,
  parseRestore,
  parseRoleChange,
  parseRoleGrant,
  parseSettings,
  parseSuspension,
  parseUserQuery,
  type Parsed,
} from "../validate";
import { REVIEW_STATUS } from "../content";
import { PUBLIC_TAGS } from "../public-content";
import { sameSite } from "@/lib/report-server";
import { errorResponse, json, PlatformError } from "./errors";
import { requireAdmin, type AuthDeps } from "./auth";

export { PUBLIC_TAGS };

export interface AdminDeps extends AuthDeps {
  rpc: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<T>;
  /** Supabase Auth's ban: "none" lifts it, "<n>h" sets it. */
  setBan: (userId: string, banDuration: string) => Promise<void>;
  /** A short-lived link to a feedback screenshot. */
  signScreenshot: (path: string) => Promise<string | null>;
  revalidate: (tags: string[]) => void;
  /** False once an administrator has made too many changes in a short time. */
  allowMutation: (actorId: string) => boolean;
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface Ctx {
  actor: Actor;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  deps: AdminDeps;
}

export interface AdminRoute {
  method: Method;
  /** Segments after /api/admin/, with `:name` for an id. */
  path: string;
  permission: Permission;
  run: (ctx: Ctx) => Promise<unknown>;
}

function take<T>(parsed: Parsed<T>): T {
  if (!parsed.ok) throw new PlatformError(400, "invalid", parsed.error);
  return parsed.value;
}

const actorArgs = (ctx: Ctx) => ({ p_actor: ctx.actor.userId });

export const ADMIN_ROUTES: AdminRoute[] = [
  {
    method: "GET",
    path: "me",
    permission: "admin.access",
    run: async ({ actor }) => actor,
  },
  {
    method: "GET",
    path: "overview",
    permission: "admin.access",
    run: (ctx) => ctx.deps.rpc("platform_admin_overview", actorArgs(ctx)),
  },

  /* ── users ── */
  {
    method: "GET",
    path: "users",
    permission: "users.read",
    run: (ctx) => {
      const q = take(parseUserQuery(ctx.query));
      return ctx.deps.rpc("platform_admin_list_users", {
        ...actorArgs(ctx),
        p_search: q.search,
        p_filter: q.filter,
        p_limit: q.limit,
        p_offset: q.offset,
      });
    },
  },
  {
    method: "GET",
    path: "users/:id",
    permission: "users.read",
    run: (ctx) => ctx.deps.rpc("platform_admin_get_user", { ...actorArgs(ctx), p_user: ctx.params.id }),
  },
  {
    method: "POST",
    path: "users/:id/suspend",
    permission: "users.suspend",
    run: async (ctx) => {
      const s = take(parseSuspension(ctx.body));
      const target = { ...actorArgs(ctx), p_user: ctx.params.id };
      await ctx.deps.rpc("platform_admin_account_check", { ...target, p_action: "suspend" });
      await ctx.deps.setBan(ctx.params.id, s.banDuration);
      try {
        return await ctx.deps.rpc("platform_admin_account_record", {
          ...target,
          p_action: "suspend",
          p_reason: s.reason,
          p_until: s.until,
        });
      } catch (e) {
        // Not recorded, so not done: lift the ban again rather than leave an unaudited one.
        await ctx.deps.setBan(ctx.params.id, "none").catch(() => {});
        throw e;
      }
    },
  },
  {
    method: "POST",
    path: "users/:id/restore",
    permission: "users.suspend",
    run: async (ctx) => {
      const r = take(parseRestore(ctx.body));
      const target = { ...actorArgs(ctx), p_user: ctx.params.id };
      await ctx.deps.rpc("platform_admin_account_check", { ...target, p_action: "restore" });
      await ctx.deps.setBan(ctx.params.id, "none");
      return ctx.deps.rpc("platform_admin_account_record", { ...target, p_action: "restore", p_reason: r.reason });
    },
  },

  /* ── reviews ── */
  {
    method: "GET",
    path: "reviews",
    permission: "reviews.moderate",
    run: (ctx) => {
      const status = ctx.query.get("status") ?? "pending";
      if (status !== "all" && !(REVIEW_STATUS.ids as string[]).includes(status)) {
        throw new PlatformError(400, "invalid", "Unknown status.");
      }
      const page = parsePage(ctx.query, 20);
      return ctx.deps.rpc("platform_admin_list_reviews", {
        ...actorArgs(ctx),
        p_status: status,
        p_limit: page.limit,
        p_offset: page.offset,
      });
    },
  },
  {
    method: "GET",
    path: "reviews/:id",
    permission: "reviews.moderate",
    run: (ctx) => ctx.deps.rpc("platform_admin_get_review", { ...actorArgs(ctx), p_id: ctx.params.id }),
  },
  {
    method: "POST",
    path: "reviews/:id/moderate",
    permission: "reviews.moderate",
    run: async (ctx) => {
      const m = take(parseModeration(ctx.body));
      const out = await ctx.deps.rpc("platform_admin_moderate_review", {
        ...actorArgs(ctx),
        p_id: ctx.params.id,
        p_action: m.action,
        p_reason: m.reason,
        p_seen: m.seen,
      });
      ctx.deps.revalidate([PUBLIC_TAGS.testimonials]);
      return out;
    },
  },
  {
    method: "PUT",
    path: "reviews/:id/response",
    permission: "reviews.moderate",
    run: async (ctx) => {
      const r = take(parseResponse(ctx.body, 1000));
      const out = await ctx.deps.rpc("platform_admin_respond_review", {
        ...actorArgs(ctx),
        p_id: ctx.params.id,
        p_response: r.response,
      });
      ctx.deps.revalidate([PUBLIC_TAGS.testimonials]);
      return out;
    },
  },

  /* ── feedback ── */
  {
    method: "GET",
    path: "feedback",
    permission: "feedback.manage",
    run: (ctx) => {
      const q = take(parseFeedbackQuery(ctx.query));
      return ctx.deps.rpc("platform_admin_list_feedback", {
        ...actorArgs(ctx),
        p_filters: q.filters,
        p_limit: q.limit,
        p_offset: q.offset,
      });
    },
  },
  {
    method: "GET",
    path: "feedback/:id",
    permission: "feedback.manage",
    run: (ctx) => withScreenshot(ctx, ctx.deps.rpc("platform_admin_get_feedback", { ...actorArgs(ctx), p_id: ctx.params.id })),
  },
  {
    method: "PATCH",
    path: "feedback/:id",
    permission: "feedback.manage",
    run: async (ctx) => {
      const patch = take(parseFeedbackPatch(ctx.body));
      const out = await ctx.deps.rpc("platform_admin_update_feedback", { ...actorArgs(ctx), p_id: ctx.params.id, p_patch: patch });
      // The changelog says how many requests each entry answered.
      if ("changelogEntryId" in patch) ctx.deps.revalidate([PUBLIC_TAGS.changelog]);
      return out;
    },
  },
  {
    method: "POST",
    path: "feedback/:id/notes",
    permission: "feedback.manage",
    run: (ctx) => {
      const n = take(parseNote(ctx.body));
      return withScreenshot(ctx, ctx.deps.rpc("platform_admin_add_feedback_note", { ...actorArgs(ctx), p_id: ctx.params.id, p_body: n.body }));
    },
  },
  {
    method: "PUT",
    path: "feedback/:id/response",
    permission: "feedback.manage",
    run: (ctx) => {
      const r = take(parseResponse(ctx.body, 2000));
      return withScreenshot(
        ctx,
        ctx.deps.rpc("platform_admin_respond_feedback", { ...actorArgs(ctx), p_id: ctx.params.id, p_response: r.response }),
      );
    },
  },

  /* ── announcements ── */
  {
    method: "GET",
    path: "announcements",
    permission: "announcements.manage",
    run: (ctx) => ctx.deps.rpc("platform_admin_list_announcements", actorArgs(ctx)),
  },
  {
    method: "POST",
    path: "announcements",
    permission: "announcements.manage",
    run: (ctx) =>
      ctx.deps.rpc("platform_admin_save_announcement", { ...actorArgs(ctx), p_id: null, p_fields: take(parseAnnouncement(ctx.body)) }),
  },
  {
    method: "PATCH",
    path: "announcements/:id",
    permission: "announcements.manage",
    run: (ctx) =>
      ctx.deps.rpc("platform_admin_save_announcement", {
        ...actorArgs(ctx),
        p_id: ctx.params.id,
        p_fields: take(parseAnnouncement(ctx.body)),
      }),
  },
  {
    method: "POST",
    path: "announcements/:id/action",
    permission: "announcements.manage",
    run: (ctx) => {
      const a = take(parseAnnouncementAction(ctx.body));
      return ctx.deps.rpc("platform_admin_announcement_action", {
        ...actorArgs(ctx),
        p_id: ctx.params.id,
        p_action: a.action,
        p_starts_at: a.startsAt,
        p_ends_at: a.endsAt,
      });
    },
  },
  {
    method: "DELETE",
    path: "announcements/:id",
    permission: "announcements.manage",
    run: (ctx) => ctx.deps.rpc("platform_admin_delete_announcement", { ...actorArgs(ctx), p_id: ctx.params.id }),
  },

  /* ── changelog ── */
  {
    method: "GET",
    path: "changelog",
    permission: "changelog.manage",
    run: (ctx) => ctx.deps.rpc("platform_admin_list_changelog", actorArgs(ctx)),
  },
  {
    method: "POST",
    path: "changelog",
    permission: "changelog.manage",
    run: (ctx) => ctx.deps.rpc("platform_admin_save_changelog", { ...actorArgs(ctx), p_id: null, p_fields: take(parseChangelog(ctx.body)) }),
  },
  {
    method: "PATCH",
    path: "changelog/:id",
    permission: "changelog.manage",
    run: async (ctx) => {
      const out = await ctx.deps.rpc("platform_admin_save_changelog", {
        ...actorArgs(ctx),
        p_id: ctx.params.id,
        p_fields: take(parseChangelog(ctx.body)),
      });
      ctx.deps.revalidate([PUBLIC_TAGS.changelog]);
      return out;
    },
  },
  {
    method: "POST",
    path: "changelog/:id/action",
    permission: "changelog.manage",
    run: async (ctx) => {
      const a = take(parseChangelogAction(ctx.body));
      const out = await ctx.deps.rpc("platform_admin_changelog_action", {
        ...actorArgs(ctx),
        p_id: ctx.params.id,
        p_action: a.action,
        p_published_at: a.publishedAt,
      });
      ctx.deps.revalidate([PUBLIC_TAGS.changelog]);
      return out;
    },
  },
  {
    method: "DELETE",
    path: "changelog/:id",
    permission: "changelog.manage",
    run: (ctx) => ctx.deps.rpc("platform_admin_delete_changelog", { ...actorArgs(ctx), p_id: ctx.params.id }),
  },

  /* ── settings ── */
  {
    method: "GET",
    path: "settings",
    permission: "settings.manage",
    run: (ctx) => ctx.deps.rpc("platform_admin_get_settings", actorArgs(ctx)),
  },
  {
    method: "PATCH",
    path: "settings",
    permission: "settings.manage",
    run: async (ctx) => {
      const out = await ctx.deps.rpc("platform_admin_update_settings", { ...actorArgs(ctx), p_values: take(parseSettings(ctx.body)) });
      ctx.deps.revalidate([PUBLIC_TAGS.site, PUBLIC_TAGS.testimonials]);
      return out;
    },
  },

  /* ── access ── */
  {
    method: "GET",
    path: "access",
    permission: "access.manage",
    run: (ctx) => ctx.deps.rpc("platform_admin_list_members", actorArgs(ctx)),
  },
  {
    method: "POST",
    path: "access",
    permission: "access.manage",
    run: async (ctx) => {
      const g = take(parseRoleGrant(ctx.body));
      const found = await ctx.deps.rpc<{ id: string } | null>("platform_admin_find_account", { ...actorArgs(ctx), p_email: g.email });
      if (!found?.id) throw new PlatformError(404, "not_found", "No account uses that email. They need to sign up first.");
      return ctx.deps.rpc("platform_admin_set_role", { ...actorArgs(ctx), p_user: found.id, p_role: g.role, p_reason: g.reason });
    },
  },
  {
    method: "PATCH",
    path: "access/:id",
    permission: "access.manage",
    run: (ctx) => {
      const c = take(parseRoleChange(ctx.body));
      return ctx.deps.rpc("platform_admin_set_role", { ...actorArgs(ctx), p_user: ctx.params.id, p_role: c.role, p_reason: c.reason });
    },
  },
  {
    method: "DELETE",
    path: "access/:id",
    permission: "access.manage",
    run: (ctx) => {
      const r = take(parseRestore(ctx.body));
      return ctx.deps.rpc("platform_admin_revoke_role", { ...actorArgs(ctx), p_user: ctx.params.id, p_reason: r.reason });
    },
  },

  /* ── audit ── */
  {
    method: "GET",
    path: "audit",
    permission: "audit.read",
    run: (ctx) => {
      const q = take(parseAuditQuery(ctx.query));
      return ctx.deps.rpc("platform_admin_audit", { ...actorArgs(ctx), p_filters: q.filters, p_limit: q.limit, p_before: q.before });
    },
  },
];

/** Adds a short-lived screenshot link to a feedback item, for its viewer only. */
async function withScreenshot(ctx: Ctx, pending: Promise<unknown>): Promise<unknown> {
  const item = (await pending) as { screenshotPath?: string | null } & Record<string, unknown>;
  if (!item?.screenshotPath) return item;
  return { ...item, screenshotUrl: await ctx.deps.signScreenshot(item.screenshotPath).catch(() => null) };
}

export function matchRoute(method: string, segments: string[]): { route: AdminRoute; params: Record<string, string> } | null {
  for (const route of ADMIN_ROUTES) {
    if (route.method !== method) continue;
    const parts = route.path.split("/");
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) {
        // Ids are UUIDs; anything else can't name a row.
        if (!isUuid(segments[i])) {
          matched = false;
          break;
        }
        params[parts[i].slice(1)] = segments[i].toLowerCase();
      } else if (parts[i] !== segments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { route, params };
  }
  return null;
}

const MAX_BODY = 64_000;

async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY) throw new PlatformError(413, "too_large", "That request is too large.");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new PlatformError(400, "invalid", "Expected JSON.");
  }
}

/**
 * One admin request, start to finish. Authentication comes before routing,
 * so an unknown address tells someone without access nothing.
 */
export async function handleAdminRequest(request: Request, segments: string[], deps: AdminDeps): Promise<Response> {
  try {
    const method = request.method.toUpperCase();
    const mutating = method !== "GET" && method !== "HEAD";
    if (mutating && !sameSite(request)) {
      throw new PlatformError(403, "cross_site", "Changes are accepted from this site's own pages only.");
    }
    const match = matchRoute(method, segments);
    if (!match) {
      await requireAdmin(request, "admin.access", deps);
      throw new PlatformError(404, "not_found", "No such address in the Admin API.");
    }
    const actor = await requireAdmin(request, match.route.permission, deps);
    if (mutating && !deps.allowMutation(actor.userId)) {
      throw new PlatformError(429, "rate_limited", "That's a lot of changes in a short time. Wait a few minutes.");
    }
    const body = mutating ? await readJson(request) : undefined;
    const data = await match.route.run({ actor, params: match.params, query: new URL(request.url).searchParams, body, deps });
    return json({ data: data ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}

/** At most 120 changes per administrator in 10 minutes, per server instance. */
export function mutationLimiter(limit = 120, windowMs = 600_000): (actorId: string) => boolean {
  const hits = new Map<string, number[]>();
  return (actorId) => {
    const now = Date.now();
    const recent = (hits.get(actorId) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(actorId, recent);
      return false;
    }
    recent.push(now);
    hits.set(actorId, recent);
    return true;
  };
}
