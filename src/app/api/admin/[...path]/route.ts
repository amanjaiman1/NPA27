import { revalidateTag } from "next/cache";
import { liveAuthDeps } from "@/lib/platform/server/auth";
import { handleAdminRequest, mutationLimiter, type AdminDeps } from "@/lib/platform/server/admin-api";
import { PlatformError } from "@/lib/platform/server/errors";
import { serviceClient, serviceRpc } from "@/lib/platform/server/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The whole Admin API, one route table (lib/platform/server/admin-api.ts).
 * Each route verifies the caller's token, reads their role fresh and checks
 * the permission it needs before anything else runs.
 */
const deps: AdminDeps = {
  ...liveAuthDeps,
  rpc: serviceRpc,
  async setBan(userId, banDuration) {
    const client = serviceClient();
    if (!client) throw new PlatformError(503, "not_configured", "The service-role key isn't set on the server.");
    const { error } = await client.auth.admin.updateUserById(userId, { ban_duration: banDuration });
    if (error) {
      console.error(`[admin] Supabase Auth refused the change: ${error.message}`);
      throw new PlatformError(502, "auth_failed", "Supabase Auth didn't accept the change. Nothing was changed.");
    }
  },
  async signScreenshot(path) {
    const { data } = (await serviceClient()?.storage.from("platform-feedback").createSignedUrl(path, 300)) ?? {};
    return data?.signedUrl ?? null;
  },
  revalidate: (tags) => tags.forEach((t) => revalidateTag(t)),
  allowMutation: mutationLimiter(),
};

type Params = { params: { path?: string[] } };
const handle = (request: Request, { params }: Params) => handleAdminRequest(request, params.path ?? [], deps);

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
