/* ════════════════════════════════════════════════════════════════
   ERRORS FROM THE PLATFORM FUNCTIONS
   The database raises `platform:<code>` with a plain sentence in DETAIL.
   This turns that into an HTTP status and a message a person can read.
   Anything unexpected becomes a 500 whose details stay in the server log.
   ════════════════════════════════════════════════════════════════ */

export class PlatformError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const STATUS: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_eligible: 403,
  not_found: 404,
  conflict: 409,
  closed: 409,
  last_super_admin: 409,
  audit_append_only: 409,
  invalid: 400,
  rate_limited: 429,
};

export interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/** The PostgREST error as a PlatformError with the right status. */
export function fromDbError(error: DbError): PlatformError {
  const message = error.message ?? "";
  const platform = /^platform:([a-z_]+)$/.exec(message.trim());
  if (platform) {
    const code = platform[1];
    return new PlatformError(STATUS[code] ?? 400, code, error.details || "That can't be done.");
  }
  if (error.code === "42501") return new PlatformError(403, "forbidden", "Not allowed.");
  // The function doesn't exist yet: the migration hasn't been run on this project.
  if (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(message)) {
    return new PlatformError(503, "not_migrated", "The Admin Center's database update hasn't been applied to this project yet.");
  }
  if (error.code === "23505") return new PlatformError(409, "conflict", "That already exists.");
  if (error.code === "23514" || error.code === "22P02" || error.code === "22007" || error.code === "22008") {
    return new PlatformError(400, "invalid", "One of the values isn't accepted.");
  }
  console.error(`[platform] database error ${error.code ?? ""}: ${message.slice(0, 300)}`);
  return new PlatformError(500, "server", "Something went wrong on the server. Try again.");
}

export function errorResponse(error: unknown): Response {
  const e =
    error instanceof PlatformError
      ? error
      : (console.error("[platform] unexpected error", error), new PlatformError(500, "server", "Something went wrong on the server. Try again."));
  return json({ error: e.message, code: e.code }, e.status);
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Private, per person: never stored by a browser or a shared cache.
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      ...headers,
    },
  });
}
