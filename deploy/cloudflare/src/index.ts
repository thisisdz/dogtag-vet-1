import {Container, getContainer} from "@cloudflare/containers";

/**
 * DogTag's manual verification deployment (https://verify.dogtagapp.com) on Cloudflare.
 *
 * Two always-on containers, each exactly one instance:
 *   WebContainer  - the Next.js app (../../Dockerfile), port 3000, receives all traffic.
 *   JobsContainer - the background worker (../../Dockerfile.worker): chain-activity follower,
 *                   payment watcher, boot recovery. It MUST be a singleton (its chain cursors live in
 *                   one database), which is why it is one fixed-name instance with max_instances 1.
 *
 * App configuration reaches both containers as environment variables built from an explicit
 * allow-list below - never by spreading `env` (that would hand the containers this Worker's own
 * bindings). DEV_LOGIN is deliberately NOT on the list: this deployment never runs the password-less
 * dev sign-in.
 */
interface Env {
  WEB: DurableObjectNamespace<WebContainer>;
  JOBS: DurableObjectNamespace<JobsContainer>;
  /** "true" once this deployment's database is the only one the jobs worker should follow. */
  JOBS_ENABLED?: string;
  [key: string]: unknown;
}

/** Settings passed into the app (vars in wrangler.jsonc + secrets set with `wrangler secret put`). */
const APP_ENV_KEYS = [
  // secrets
  "MONGODB_URI",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "EMAIL_SERVER",
  // vars
  "NODE_ENV",
  "PUBLIC_BASE_URL",
  "AUTH_URL",
  "AUTH_TRUST_HOST",
  "TRUSTED_PROXY_HOPS",
  "EMAIL_FROM",
  "ROAX_RPC_URL",
  "ROAX_CHAIN_ID",
  "ROAX_EXPLORER_URL",
  "VET_ISSUER_FACTORY_ADDRESS",
  "ENTITY_REGISTRY_ADDRESS",
  "DOGTAG_SBT_ADDRESS",
  "VERIFICATION_REGISTRY_ADDRESS",
  "DELEGATION_REGISTRY_ADDRESS",
  "ADMIN_PORTAL_URL",
  "OPERATOR_LOW_PLASMA",
  "TOKEN_RUSD_ROAX_ADDRESS",
  "DOGTAG_APP_MODE",
  "DOGTAG_APP_URL_SCHEME",
  "DOGTAG_APP_STORE_URL",
  "DOGTAG_PLAY_STORE_URL",
  "MANUAL_VERIFICATION_CLAIM_TTL_DAYS",
  "MANUAL_VERIFICATION_STORAGE_QUOTA_MB",
] as const;

function appEnv(env: Env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of APP_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value !== "") out[key] = value;
  }
  return out;
}

/**
 * Both containers stay up permanently: the minute cron below keeps them active, and if the idle
 * timer fires anyway we deliberately do NOT stop (overriding the default, which would). A crashed
 * process simply exits; the next request or cron tick starts it again.
 */
abstract class AlwaysOnContainer extends Container<Env> {
  sleepAfter = "30m";
  enableInternet = true; // MongoDB Atlas, the ROAX RPC and SMTP are all outside Cloudflare

  override async onActivityExpired(): Promise<void> {
    // Stay running - see class comment.
  }

  override onError(error: unknown): void {
    console.error(`[${this.constructor.name}] container error`, error);
  }
}

/** The constructor context type exactly as `Container` declares it. */
type ContainerCtx = ConstructorParameters<typeof Container<Env>>[0];

export class WebContainer extends AlwaysOnContainer {
  defaultPort = 3000;

  constructor(ctx: ContainerCtx, env: Env) {
    super(ctx, env);
    this.envVars = {...appEnv(env), PORT: "3000", HOSTNAME: "0.0.0.0"};
  }
}

export class JobsContainer extends AlwaysOnContainer {
  defaultPort = 8091;

  constructor(ctx: ContainerCtx, env: Env) {
    super(ctx, env);
    this.envVars = {...appEnv(env), WORKER_HEALTH_PORT: "8091"};
  }
}

const web = (env: Env) => getContainer(env.WEB, "web");
const jobs = (env: Env) => getContainer(env.JOBS, "jobs");

export default {
  /** Every request goes to the single web container. The original request is forwarded as-is
   * (CF-Connecting-IP intact, so the app's rate limits see the real visitor), plus the public
   * host/scheme for anything in the app that builds absolute URLs from the request. */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const forwarded = new Request(request);
    forwarded.headers.set("X-Forwarded-Host", url.host);
    forwarded.headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
    return web(env).fetch(forwarded);
  },

  /** Every minute: keep the web container warm (and start it again after a host restart), and the
   * jobs container running once enabled. Failures are logged for Workers Logs alerts. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(ping("web", web(env), "http://web/api/healthz"));
    if (env.JOBS_ENABLED === "true") ctx.waitUntil(ping("jobs", jobs(env), "http://jobs/livez"));
  },
};

async function ping(name: string, stub: {fetch(request: Request): Promise<Response>}, url: string): Promise<void> {
  try {
    const res = await stub.fetch(new Request(url));
    if (!res.ok) console.error(`[cron] ${name} health ${res.status}: ${(await res.text()).slice(0, 300)}`);
  } catch (err) {
    console.error(`[cron] ${name} unreachable`, err);
  }
}
