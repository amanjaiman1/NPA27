#!/usr/bin/env node
/**
 * A local stand-in for Supabase, for trying accounts and sync without a project.
 *
 *     npm run mock:supabase          # listens on http://localhost:54321
 *
 * Then run the app against it (see README → "Try multiple accounts locally").
 *
 * It implements only what this app calls: email/password auth (sign-up is
 * auto-confirmed), password reset (the email is printed here instead of sent),
 * the Auth admin calls (read, ban and delete a user; a banned account can't
 * sign in or refresh), reads/saves of `chronicle_state`, any function in
 * `public` through /rest/v1/rpc, Storage, and Realtime broadcast from the
 * database on private channels (joins decided by the policies on
 * realtime.messages, as on Supabase). Data lives in an
 * in-memory Postgres (PGlite) running the real `supabase/schema.sql` and
 * migrations, and every request runs as the caller's role with their JWT
 * claims, so Row Level Security is enforced exactly as on Supabase.
 *
 * Development only: tokens are signed with a fixed local secret, nothing is
 * persisted, and nothing here is fit to face the internet.
 */

import { createServer } from "node:http";
import { createHash, createHmac, randomUUID, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
const SECRET = "local-mock-secret-not-for-production";
const APP_URL = process.env.MOCK_APP_URL ?? "http://localhost:3000";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── tokens ─────────────────────────────────────────────────────── */

const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
function sign(payload) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [head, body, sig] = String(token ?? "").split(".");
  if (!head || !body || !sig) return null;
  const want = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  if (claims.exp && claims.exp < Date.now() / 1000) return null;
  return claims;
}

const ANON_KEY = sign({ role: "anon", iss: "mock-supabase", iat: 1_700_000_000 });
const SERVICE_KEY = sign({ role: "service_role", iss: "mock-supabase", iat: 1_700_000_000 });
const ENV = [
  `NEXT_PUBLIC_SUPABASE_URL=http://localhost:${PORT}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`,
  `SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}`,
].join("\n");

// `--print-env` writes the three variables the app needs, for an `.env.local`.
if (process.argv.includes("--print-env")) {
  console.log(ENV);
  process.exit(0);
}

/* ── database ───────────────────────────────────────────────────── */

const db = new PGlite();
const read = (p) => readFileSync(join(root, p), "utf8");
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text unique not null,
    encrypted_password text not null,
    raw_user_meta_data jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- Sign-up is auto-confirmed here, as the app's tests expect.
    email_confirmed_at timestamptz default now(),
    last_sign_in_at timestamptz,
    banned_until timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
// Supabase Storage's tables, so the attachments migration and its policies run.
await db.exec(read("supabase/tests/storage_shim.sql"));
// Supabase Realtime's messages table and `realtime.send`, so the live-update triggers and policies run.
await db.exec(read("supabase/tests/realtime_shim.sql"));
await db.exec(read("supabase/schema.sql"));
for (const f of readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(read(join("supabase/migrations", f)));
}

/** Object bytes, keyed by `<bucket>/<name>`. Their rows live in storage.objects. */
const blobs = new Map();

// PGlite has one connection, so requests take turns. After each one, what the
// database broadcast (once its transaction committed) goes out over Realtime.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(async () => {
    try {
      return await fn();
    } finally {
      await deliverBroadcasts().catch((e) => console.error("[realtime]", e));
    }
  });
  queue = run.catch(() => {});
  return run;
}

/** Runs `fn` as the caller would on Supabase: their role, their JWT claims, RLS on. */
function asCaller(claims, fn) {
  return serial(async () => {
    const role = ["anon", "authenticated", "service_role"].includes(claims?.role) ? claims.role : "anon";
    await db.exec("begin");
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims ?? {})]);
      const out = await fn();
      await db.exec("commit");
      return out;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  });
}
const asAdmin = (fn) => serial(fn);

/* ── users & sessions ───────────────────────────────────────────── */

const refreshTokens = new Map(); // token -> user id
let lastEmail = null;

const hash = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
};
const checkPw = (pw, stored) => {
  const [salt, h] = stored.split(":");
  const got = scryptSync(pw, salt, 32);
  return timingSafeEqual(got, Buffer.from(h, "hex"));
};

const iso = (v) => (v ? new Date(v).toISOString() : null);

function userJson(u) {
  const at = new Date(u.created_at).toISOString();
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: iso(u.email_confirmed_at),
    confirmed_at: iso(u.email_confirmed_at),
    phone: "",
    last_sign_in_at: iso(u.last_sign_in_at),
    banned_until: iso(u.banned_until),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data ?? {},
    identities: [{ id: u.id, user_id: u.id, provider: "email", identity_data: { sub: u.id, email: u.email } }],
    created_at: at,
    updated_at: new Date(u.updated_at ?? u.created_at).toISOString(),
    is_anonymous: false,
  };
}

function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = sign({
    sub: u.id,
    role: "authenticated",
    aud: "authenticated",
    email: u.email,
    iat: now,
    exp: now + 3600,
    session_id: randomUUID(),
  });
  const refresh_token = randomBytes(24).toString("hex");
  refreshTokens.set(refresh_token, u.id);
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token, user: userJson(u) };
}

async function findUser(where, value) {
  const r = await asAdmin(() => db.query(`select * from auth.users where ${where} = $1`, [value]));
  return r.rows[0] ?? null;
}

/** Supabase Auth refuses to sign in, or refresh the session of, a banned account. */
const isBanned = (u) => Boolean(u.banned_until && new Date(u.banned_until).getTime() > Date.now());

/** A fresh session, stamping the sign-in time as Supabase does. */
async function signedIn(u) {
  await asAdmin(() => db.query("update auth.users set last_sign_in_at = now() where id = $1", [u.id]));
  return session(await findUser("id", u.id));
}

/* ── http ───────────────────────────────────────────────────────── */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  // `*` doesn't cover Authorization for browsers, so the common ones are named.
  "Access-Control-Allow-Headers":
    "*, authorization, apikey, content-type, x-upsert, cache-control, x-client-info, accept-profile, content-profile, prefer",
  "Access-Control-Expose-Headers": "*",
};
function send(res, status, body) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}
const authError = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });
const pgError = (res, e) =>
  send(res, e.code === "42501" ? 403 : 400, { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null });

/* ── any function in `public`, as PostgREST's /rpc ─────────────── */

const functions = new Map();
async function functionInfo(name) {
  if (!functions.has(name)) {
    const r = await asAdmin(() =>
      db.query(
        `select p.pronargs::int as nargs, coalesce(p.proargnames, '{}') as names,
                array(select format_type(t, null) from unnest(p.proargtypes::oid[]) as t) as types,
                p.proretset as returns_set, rt.typtype as ret_kind, format_type(p.prorettype, null) as ret
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
          where n.nspname = 'public' and p.proname = $1`,
        [name],
      ),
    );
    functions.set(name, r.rows[0] ?? null);
  }
  return functions.get(name);
}

const quoteIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;

/** Calls `name` with named arguments, cast to the function's own types, as the caller. */
async function callFunction(claims, name, args) {
  const info = await functionInfo(name);
  if (!info) return { status: 404, body: { code: "PGRST202", message: `Could not find the function public.${name}`, details: null, hint: null } };
  const values = [];
  const named = [];
  info.names.slice(0, info.nargs).forEach((arg, i) => {
    if (!(arg in args)) return; // the function's default applies
    const v = args[arg];
    const type = info.types[i];
    values.push(v === null || v === undefined ? null : /json/.test(type) ? JSON.stringify(v) : typeof v === "object" ? JSON.stringify(v) : String(v));
    named.push(`${quoteIdent(arg)} => $${values.length}::${type}`);
  });
  const call = `public.${quoteIdent(name)}(${named.join(", ")})`;
  const tableLike = info.returns_set || info.ret_kind === "c";
  const r = await asCaller(claims, () => db.query(tableLike ? `select * from ${call}` : `select ${call} as v`, values));
  if (info.ret === "void") return { status: 204 };
  return { status: 200, body: tableLike ? r.rows : (r.rows[0]?.v ?? null) };
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}
function bearerClaims(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  return verify(token);
}

async function handleAuth(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  if (req.method === "POST" && path === "/signup") {
    const { email, password, data } = await body(req);
    if (!email || !password) return authError(res, 422, "validation_failed", "Email and password are required");
    if (await findUser("email", email.toLowerCase())) return authError(res, 422, "user_already_exists", "User already registered");
    const id = randomUUID();
    await asAdmin(() =>
      db.query("insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, $3, $4)", [
        id,
        email.toLowerCase(),
        hash(password),
        JSON.stringify(data ?? {}),
      ]),
    );
    console.log(`  signed up ${email} (${id})`);
    return send(res, 200, await signedIn(await findUser("id", id)));
  }
  if (req.method === "POST" && path === "/token") {
    const grant = url.searchParams.get("grant_type");
    const b = await body(req);
    if (grant === "password") {
      const u = await findUser("email", String(b.email ?? "").toLowerCase());
      if (!u || !checkPw(String(b.password ?? ""), u.encrypted_password))
        return authError(res, 400, "invalid_credentials", "Invalid login credentials");
      if (isBanned(u)) return authError(res, 400, "user_banned", "User is banned");
      return send(res, 200, await signedIn(u));
    }
    if (grant === "refresh_token") {
      const id = refreshTokens.get(b.refresh_token);
      const u = id && (await findUser("id", id));
      if (!u) return authError(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
      if (isBanned(u)) return authError(res, 400, "user_banned", "User is banned");
      refreshTokens.delete(b.refresh_token);
      return send(res, 200, session(u));
    }
    return authError(res, 400, "validation_failed", "unsupported grant");
  }
  if (path === "/user") {
    const claims = bearerClaims(req);
    const u = claims?.sub && (await findUser("id", claims.sub));
    if (!u) return authError(res, 401, "bad_jwt", "invalid JWT");
    if (req.method === "GET") return send(res, 200, userJson(u));
    if (req.method === "PUT") {
      const b = await body(req);
      if (b.password) {
        if (checkPw(b.password, u.encrypted_password))
          return authError(res, 422, "same_password", "New password should be different from the old password.");
        await asAdmin(() => db.query("update auth.users set encrypted_password = $2, updated_at = now() where id = $1", [u.id, hash(b.password)]));
      }
      if (b.data) {
        await asAdmin(() =>
          db.query("update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb, updated_at = now() where id = $1", [u.id, JSON.stringify(b.data)]),
        );
      }
      return send(res, 200, userJson(await findUser("id", u.id)));
    }
  }
  if (req.method === "POST" && path === "/logout") return send(res, 204);
  if (req.method === "POST" && path === "/recover") {
    const { email } = await body(req);
    const u = await findUser("email", String(email ?? "").toLowerCase());
    if (u) {
      const s = session(u);
      const redirect = url.searchParams.get("redirect_to") ?? `${APP_URL}/reset-password`;
      lastEmail = {
        to: u.email,
        link: `${redirect}#access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=3600&refresh_token=${s.refresh_token}&token_type=bearer&type=recovery`,
      };
      console.log(`  ✉ password reset for ${u.email}:\n    ${lastEmail.link}`);
    }
    return send(res, 200, {});
  }
  if (req.method === "POST" && path === "/resend") return send(res, 200, {});
  const adminMatch = /^\/admin\/users\/([0-9a-f-]{36})$/.exec(path);
  if (adminMatch) {
    if (bearerClaims(req)?.role !== "service_role") return authError(res, 403, "not_admin", "User not allowed");
    const u = await findUser("id", adminMatch[1]);
    if (!u) return authError(res, 404, "user_not_found", "User not found");
    if (req.method === "GET") return send(res, 200, userJson(u));
    if (req.method === "PUT") {
      // Only what the app sends: `ban_duration`, "none" or a number of hours such as "876000h".
      const b = await body(req);
      if (typeof b.ban_duration === "string") {
        const hours = /^(\d+)h$/.exec(b.ban_duration)?.[1];
        if (b.ban_duration !== "none" && !hours) return authError(res, 400, "validation_failed", "invalid ban_duration");
        await asAdmin(() =>
          db.query("update auth.users set banned_until = $2, updated_at = now() where id = $1", [
            u.id,
            hours ? new Date(Date.now() + Number(hours) * 3_600_000).toISOString() : null,
          ]),
        );
        console.log(`  ${hours ? "banned" : "unbanned"} ${u.email}`);
      }
      return send(res, 200, userJson(await findUser("id", u.id)));
    }
    if (req.method === "DELETE") {
      await asAdmin(() => db.query("delete from auth.users where id = $1", [u.id]));
      console.log(`  deleted account ${u.email}`);
      return send(res, 200, userJson(u));
    }
  }
  return authError(res, 404, "not_found", `no mock for ${req.method} ${path}`);
}

const COLUMNS = new Set(["data", "version", "updated_at", "user_id"]);
const columnSql = (c) =>
  c === "version" ? "version::int as version" : c === "updated_at" ? "to_json(updated_at) #>> '{}' as updated_at" : c;

async function handleRest(req, res, url) {
  const claims = bearerClaims(req) ?? { role: "anon" };
  const path = url.pathname.replace(/^\/rest\/v1/, "");
  try {
    if (path === "/rpc/save_chronicle_state" && req.method === "POST") {
      const b = await body(req);
      const rows = await asCaller(claims, () =>
        db.query(
          "select saved, version::int as version, to_json(updated_at) #>> '{}' as updated_at from public.save_chronicle_state($1::jsonb, $2::bigint)",
          [JSON.stringify(b.p_data), b.p_base_version],
        ),
      );
      return send(res, 200, rows.rows);
    }
    const rpc = /^\/rpc\/([a-z_][a-z0-9_]*)$/.exec(path);
    if (rpc && (req.method === "POST" || req.method === "GET")) {
      const args = req.method === "POST" ? await body(req) : Object.fromEntries(url.searchParams);
      const out = await callFunction(claims, rpc[1], args ?? {});
      return send(res, out.status, out.body);
    }
    if (path === "/chronicle_state") {
      const filter = url.searchParams.get("user_id")?.replace(/^eq\./, "");
      if (req.method === "GET") {
        const cols = (url.searchParams.get("select") ?? "*").split(",").filter((c) => COLUMNS.has(c));
        const rows = await asCaller(claims, () =>
          db.query(
            `select ${(cols.length ? cols : [...COLUMNS]).map(columnSql).join(", ")} from public.chronicle_state${filter ? " where user_id = $1" : ""}`,
            filter ? [filter] : [],
          ),
        );
        return send(res, 200, rows.rows);
      }
      // Direct writes exist only so tests can prove they are refused.
      if (req.method === "PATCH") {
        const b = await body(req);
        await asCaller(claims, () => db.query("update public.chronicle_state set data = $2 where user_id = $1", [filter, JSON.stringify(b.data ?? {})]));
        return send(res, 204);
      }
      if (req.method === "DELETE") {
        await asCaller(claims, () => db.query("delete from public.chronicle_state where user_id = $1", [filter]));
        return send(res, 204);
      }
      if (req.method === "POST") {
        const b = await body(req);
        await asCaller(claims, () => db.query("insert into public.chronicle_state (user_id, data) values ($1, $2)", [b.user_id, JSON.stringify(b.data ?? {})]));
        return send(res, 201);
      }
    }
    return send(res, 404, { code: "PGRST404", message: `no mock for ${req.method} ${path}` });
  } catch (e) {
    return pgError(res, e);
  }
}

/* ── storage ────────────────────────────────────────────────────── */

const storageError = (res, status, error, message) => send(res, status, { statusCode: String(status), error, message });

async function bucketRow(id) {
  const r = await asAdmin(() => db.query("select * from storage.buckets where id = $1", [id]));
  return r.rows[0] ?? null;
}

/**
 * The slice of the Storage API the app uses: upload, signed links, list and
 * delete. Every object row is read and written as the caller, so the bucket's
 * policies decide exactly as they would on Supabase; only the bytes are kept
 * in memory here.
 */
async function handleStorage(req, res, url) {
  const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ""));
  const claims = bearerClaims(req) ?? { role: "anon" };

  // A signed link being followed, or one being minted.
  let m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(path);
  if (m && req.method === "GET") {
    const tok = verify(url.searchParams.get("token"));
    const key = `${m[1]}/${m[2]}`;
    if (!tok || tok.url !== key) return storageError(res, 400, "InvalidJWT", "invalid signature");
    const blob = blobs.get(key);
    if (!blob) return storageError(res, 404, "not_found", "Object not found");
    const headers = { ...CORS, "Content-Type": blob.type, "Content-Length": blob.bytes.length, "Cache-Control": "max-age=3600" };
    const dl = url.searchParams.get("download");
    if (dl !== null) headers["Content-Disposition"] = `attachment; filename="${(dl || m[2].split("/").pop()).replace(/"/g, "")}"`;
    res.writeHead(200, headers);
    return res.end(blob.bytes);
  }
  if (m && req.method === "POST") {
    const b = await body(req);
    const rows = await asCaller(claims, () =>
      db.query("select id from storage.objects where bucket_id = $1 and name = $2", [m[1], m[2]]),
    );
    if (!rows.rows.length) return storageError(res, 400, "not_found", "Object not found");
    const now = Math.floor(Date.now() / 1000);
    const token = sign({ url: `${m[1]}/${m[2]}`, iat: now, exp: now + Math.max(1, Number(b.expiresIn) || 60) });
    return send(res, 200, {
      signedURL: `/object/sign/${m[1]}/${m[2].split("/").map(encodeURIComponent).join("/")}?token=${token}`,
    });
  }

  m = /^\/object\/list\/([^/]+)$/.exec(path);
  if (m && req.method === "POST") {
    const b = await body(req);
    const prefix = String(b.prefix ?? "").replace(/\/+$/, "");
    const rows = await asCaller(claims, () =>
      db.query(
        "select id, name, to_json(created_at) #>> '{}' as created_at, to_json(updated_at) #>> '{}' as updated_at, metadata from storage.objects where bucket_id = $1 and name like $2 order by name limit $3 offset $4",
        [m[1], prefix ? `${prefix}/%` : "%", Number(b.limit) || 100, Number(b.offset) || 0],
      ),
    );
    return send(res, 200, rows.rows.map((r) => ({ ...r, name: prefix ? r.name.slice(prefix.length + 1) : r.name })));
  }

  m = /^\/object\/([^/]+)$/.exec(path);
  if (m && req.method === "DELETE") {
    const b = await body(req);
    const names = Array.isArray(b.prefixes) ? b.prefixes.map(String) : [];
    const deleted = [];
    for (const name of names) {
      const r = await asCaller(claims, () =>
        db.query("delete from storage.objects where bucket_id = $1 and name = $2 returning id, name, bucket_id", [m[1], name]),
      );
      for (const row of r.rows) {
        blobs.delete(`${m[1]}/${row.name}`);
        deleted.push(row);
      }
    }
    return send(res, 200, deleted);
  }

  m = /^\/object\/([^/]+)\/(.+)$/.exec(path);
  if (m && (req.method === "POST" || req.method === "PUT")) {
    const bytes = await rawBody(req);
    const bucket = await bucketRow(m[1]);
    if (!bucket) return storageError(res, 404, "Bucket not found", "Bucket not found");
    const type = String(req.headers["content-type"] ?? "application/octet-stream").split(";")[0].trim();
    if (bucket.file_size_limit && bytes.length > Number(bucket.file_size_limit))
      return storageError(res, 413, "Payload too large", "The object exceeded the maximum allowed size");
    if (bucket.allowed_mime_types?.length && !bucket.allowed_mime_types.includes(type))
      return storageError(res, 415, "invalid_mime_type", `mime type ${type} is not supported`);
    try {
      await asCaller(claims, () =>
        db.query("insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ($1, $2, $3, $4, $5)", [
          m[1],
          m[2],
          claims.sub ?? null,
          claims.sub ?? null,
          JSON.stringify({ size: bytes.length, mimetype: type }),
        ]),
      );
    } catch (e) {
      if (e.code === "23505") return storageError(res, 409, "Duplicate", "The resource already exists");
      if (e.code === "42501") return storageError(res, 403, "Unauthorized", "new row violates row-level security policy");
      throw e;
    }
    blobs.set(`${m[1]}/${m[2]}`, { bytes, type });
    console.log(`  stored ${m[2]} (${bytes.length} bytes, ${type})`);
    return send(res, 200, { Key: `${m[1]}/${m[2]}`, Id: randomUUID() });
  }
  return storageError(res, 404, "not_found", `no mock for ${req.method} ${path}`);
}

/* ── realtime ───────────────────────────────────────────────────────
   Broadcast from the database, as the app uses it (src/lib/platform/live.ts):
   triggers call `realtime.send` (supabase/tests/realtime_shim.sql), and the
   rows it adds go out, once their transaction has committed, to the
   WebSockets that joined the topic. The WebSocket speaks the Phoenix
   protocol realtime-js 2.x speaks (JSON arrays, "2.0.0").

   Joining is decided the way Supabase Realtime decides it: insert a message
   on the topic, try to read it back as the account (with its token's claims
   and the topic set), roll back. So the policies on realtime.messages in the
   migrations are what let anyone in. Private channels only; nobody may send
   from a browser. */

/** topic -> sockets joined to it, with the join ref each used. */
const subscribers = new Map();
let realtimeSent = 0;
let lastMessageId = 0;

/** Sends what the database broadcast since last time, then forgets it. Runs inside `serial`. */
async function deliverBroadcasts() {
  const r = await db.query("select id, topic, event, payload, private from realtime.messages where id > $1 order by id", [lastMessageId]);
  if (!r.rows.length) return;
  for (const m of r.rows) {
    lastMessageId = Math.max(lastMessageId, Number(m.id));
    if (m.private) deliver(m.topic, m.event, m.payload);
  }
  await db.query("delete from realtime.messages where id > 0 and id <= $1", [lastMessageId]);
}

/** Whether a token's account may read messages on `topic`: Supabase Realtime's own check. */
function mayJoin(topic, claims) {
  const role = claims?.role === "authenticated" || claims?.role === "anon" ? claims.role : null;
  if (!role) return Promise.resolve(false);
  return serial(async () => {
    await db.exec("begin");
    try {
      const row = await db.query(
        "insert into realtime.messages (topic, extension, event, payload, private) values ($1, 'broadcast', 'join', '{}'::jsonb, true) returning id",
        [topic],
      );
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claims', $1, true), set_config('realtime.topic', $2, true)", [JSON.stringify(claims), topic]);
      const seen = await db.query("select count(*)::int as n from realtime.messages where id = $1", [row.rows[0].id]);
      return seen.rows[0].n === 1;
    } catch {
      return false;
    } finally {
      await db.exec("rollback");
    }
  });
}

function wsFrame(text) {
  const data = Buffer.from(text);
  const head = data.length < 126 ? Buffer.from([0x81, data.length]) : data.length < 65536 ? Buffer.from([0x81, 126, data.length >> 8, data.length & 255]) : null;
  if (!head) {
    const big = Buffer.alloc(10);
    big[0] = 0x81;
    big[1] = 127;
    big.writeBigUInt64BE(BigInt(data.length), 2);
    return Buffer.concat([big, data]);
  }
  return Buffer.concat([head, data]);
}

function wsSend(socket, message) {
  if (!socket.destroyed) socket.write(wsFrame(JSON.stringify(message)));
}

function deliver(topic, event, payload) {
  const joined = subscribers.get(`realtime:${topic}`);
  if (!joined) return 0;
  for (const [socket, joinRef] of joined) {
    wsSend(socket, [joinRef, null, `realtime:${topic}`, "broadcast", { type: "broadcast", event, payload }]);
    realtimeSent++;
  }
  return joined.size;
}

function leaveAll(socket) {
  for (const joined of subscribers.values()) joined.delete(socket);
}

function onRealtimeMessage(socket, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const [joinRef, ref, topic, event, payload] = Array.isArray(msg) ? msg : [msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload];
  const reply = (status, response = {}) => wsSend(socket, [joinRef ?? null, ref ?? null, topic, "phx_reply", { status, response }]);
  if (topic === "phoenix" && event === "heartbeat") return reply("ok");
  if (event === "phx_join") {
    const name = String(topic).replace(/^realtime:/, "");
    const refused = () => reply("error", { reason: "Unauthorized: You do not have permissions to read from this Channel topic: " + name });
    if (payload?.config?.private !== true) return refused();
    void mayJoin(name, verify(payload?.access_token)).then((ok) => {
      if (!ok) return refused();
      if (!subscribers.has(topic)) subscribers.set(topic, new Map());
      subscribers.get(topic).set(socket, joinRef);
      reply("ok", { postgres_changes: [] });
    });
    return;
  }
  if (event === "phx_leave") {
    subscribers.get(topic)?.delete(socket);
    return reply("ok");
  }
  if (event === "access_token") return; // a refreshed token: still the same account
  if (event === "broadcast") return reply("error", { reason: "Unauthorized: only the server sends on this channel" });
}

function acceptWebSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) return socket.destroy();
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  let buffer = Buffer.alloc(0);
  let text = [];
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 2) return;
      const fin = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let length = buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const maskAt = offset;
      if (masked) offset += 4;
      if (buffer.length < offset + length) return;
      const data = Buffer.from(buffer.subarray(offset, offset + length));
      if (masked) for (let i = 0; i < data.length; i++) data[i] ^= buffer[maskAt + (i % 4)];
      buffer = buffer.subarray(offset + length);
      if (opcode === 0x8) {
        leaveAll(socket);
        socket.end(Buffer.from([0x88, 0]));
        return;
      }
      if (opcode === 0x9) {
        socket.write(Buffer.concat([Buffer.from([0x8a, data.length]), data]));
        continue;
      }
      if (opcode === 0x1 || opcode === 0x0) {
        text.push(data);
        if (fin) {
          onRealtimeMessage(socket, Buffer.concat(text).toString("utf8"));
          text = [];
        }
      }
    }
  });
  const gone = () => leaveAll(socket);
  socket.on("close", gone);
  socket.on("error", gone);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "OPTIONS") return send(res, 204);
  try {
    if (url.pathname.startsWith("/auth/v1")) return await handleAuth(req, res, url);
    if (url.pathname.startsWith("/rest/v1")) return await handleRest(req, res, url);
    if (url.pathname.startsWith("/storage/v1")) return await handleStorage(req, res, url);
    if (url.pathname === "/__mock/realtime") {
      // Tests only: who is listening on which topic, and how many messages went out.
      const listening = [...subscribers].map(([topic, joined]) => ({ topic, sockets: joined.size }));
      return send(res, 200, { listening, sent: realtimeSent });
    }
    if (url.pathname === "/__mock/last-email") return send(res, 200, lastEmail);
    if (url.pathname === "/__mock/sql" && req.method === "POST") {
      // Tests only: run SQL as the database owner, as the Supabase SQL Editor does.
      const { sql } = await body(req);
      try {
        const results = await asAdmin(() => db.exec(String(sql ?? "")));
        return send(res, 200, results.at(-1)?.rows ?? []);
      } catch (e) {
        return send(res, 400, { code: e.code, message: e.message, details: e.detail ?? null });
      }
    }
    if (url.pathname === "/__mock/storage") {
      // By owner id (works after the account is gone) or by email.
      const user = url.searchParams.get("user");
      const r = await asAdmin(() =>
        user
          ? db.query(
              "select name, (metadata ->> 'size')::int as size from storage.objects where split_part(name, '/', 1) = $1 order by name",
              [user],
            )
          : db.query(
              "select o.name, (o.metadata ->> 'size')::int as size from storage.objects o join auth.users u on u.id::text = split_part(o.name, '/', 1) where u.email = $1 order by o.name",
              [String(url.searchParams.get("email") ?? "").toLowerCase()],
            ),
      );
      return send(res, 200, r.rows.map((row) => ({ ...row, stored: blobs.has(`chronicle-attachments/${row.name}`) })));
    }
    if (url.pathname === "/__mock/snapshot") {
      const r = await asAdmin(() =>
        db.query(
          "select s.data, s.version::int as version from public.chronicle_state s join auth.users u on u.id = s.user_id where u.email = $1",
          [String(url.searchParams.get("email") ?? "").toLowerCase()],
        ),
      );
      return send(res, 200, r.rows[0] ?? null);
    }
    if (url.pathname === "/__mock/rows") {
      const r = await asAdmin(() => db.query("select u.email, s.version::int as version, octet_length(s.data::text)::int as bytes from public.chronicle_state s join auth.users u on u.id = s.user_id order by u.email"));
      return send(res, 200, r.rows);
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: String(e?.message ?? e) });
  }
});
server.on("upgrade", (req, socket) => {
  if (new URL(req.url, `http://localhost:${PORT}`).pathname === "/realtime/v1/websocket") acceptWebSocket(req, socket);
  else socket.destroy();
});
server.listen(PORT, () => {
  console.log(`Mock Supabase on http://localhost:${PORT}\n${ENV.replace(/^/gm, "  ")}`);
});
