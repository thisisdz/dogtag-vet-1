import {NextResponse} from "next/server";
import mongoose from "mongoose";
import {connectToDatabase} from "@/lib/db";

/** Coarse, non-sensitive category of a failed Mongo connection - enough for an operator to tell a
 * mistyped connection string from a network or DNS problem, without exposing hosts or messages. */
type MongoFailure = "config" | "dns" | "auth" | "network" | "timeout" | "unknown";

function classify(err: unknown): MongoFailure {
  const text = `${(err as {name?: string})?.name ?? ""} ${(err as {code?: string})?.code ?? ""} ${String((err as {message?: string})?.message ?? err)}`;
  if (/Missing required environment variable|Invalid scheme|MongoParseError|URI must include|Invalid connection string/i.test(text)) return "config";
  if (/querySrv|querytxt|ENOTFOUND|EAI_AGAIN|ESERVFAIL|ENODATA/i.test(text)) return "dns";
  if (/Authentication failed|bad auth|AuthenticationFailed|not authorized/i.test(text)) return "auth";
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|SSL|TLS|certificate/i.test(text)) return "network";
  if (/timed out|Timeout|Server selection/i.test(text)) return "timeout";
  return "unknown";
}

/**
 * `GET /api/healthz` - web-process readiness for a host's health checks (the Cloudflare Containers
 * watchdog, an uptime monitor), the web-side counterpart to the worker's own `/healthz` on
 * WORKER_HEALTH_PORT (src/worker/health.ts). 200 when this process can reach Mongo, 503 otherwise.
 * Public (auth.config.ts) and deliberately terse: no versions, hosts or error text - only a coarse
 * failure category. The full error goes to the server log, with any connection string removed.
 */
export async function GET() {
  let connected = false;
  let failure: MongoFailure | undefined;
  try {
    await connectToDatabase();
    const db = mongoose.connection.db;
    if (db) {
      await db.admin().command({ping: 1});
      connected = true;
    }
  } catch (err) {
    failure = classify(err);
    console.error(
      `[healthz] mongo connection failed (${failure}):`,
      String((err as {message?: string})?.message ?? err).replace(/mongodb(\+srv)?:\/\/\S+/g, "<uri>"),
    );
  }
  return NextResponse.json(
    {status: connected ? "ok" : "degraded", mongo: {connected, ...(failure ? {failure} : {})}},
    {status: connected ? 200 : 503, headers: {"Cache-Control": "no-store"}},
  );
}
