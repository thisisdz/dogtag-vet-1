import {NextResponse} from "next/server";
import mongoose from "mongoose";
import {connectToDatabase} from "@/lib/db";

/**
 * `GET /api/healthz` - web-process readiness for a host's health checks (the Cloudflare Containers
 * watchdog, an uptime monitor), the web-side counterpart to the worker's own `/healthz` on
 * WORKER_HEALTH_PORT (src/worker/health.ts). 200 when this process can reach Mongo, 503 otherwise.
 * Public (auth.config.ts) and deliberately terse: no versions, hosts, or error text.
 */
export async function GET() {
  let connected = false;
  try {
    await connectToDatabase();
    const db = mongoose.connection.db;
    if (db) {
      await db.admin().command({ping: 1});
      connected = true;
    }
  } catch {
    connected = false;
  }
  return NextResponse.json(
    {status: connected ? "ok" : "degraded", mongo: {connected}},
    {status: connected ? 200 : 503, headers: {"Cache-Control": "no-store"}},
  );
}
