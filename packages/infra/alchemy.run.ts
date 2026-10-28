import alchemy from "alchemy";
import {
  R2Bucket,
  RateLimit,
  TanStackStart,
  VersionMetadata,
  Worker,
} from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("zeeya");

// Public gateway hostname (e.g. "api.zeeya.app"). When set, the gateway is served
// only there and gets no workers.dev URL; unset (local dev, throwaway stages)
// it falls back to a workers.dev URL.
const apiDomain = process.env.API_DOMAIN;
// Free accounts reject custom CPU limits and enforce their own fixed allowance.
const workersPaidPlan = process.env.WORKERS_PAID_PLAN === "true";

export const server = await Worker("server", {
  name: "zeeya-backend",
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  // No public route, workers.dev hostname, or version-preview hostname.
  // Only the gateway's private Service Binding can reach this Worker.
  url: false,
  previewSubdomains: false,
  // Paid-plan CPU safeguard per invocation; network/Neon wait is excluded.
  // Start with auth headroom, then tune from deployed CPU measurements.
  limits: workersPaidPlan ? { cpu_ms: 1_000 } : undefined,
  bindings: {
    ENVIRONMENT: app.local ? "development" : app.stage,
    DATABASE_URL: alchemy.secret.env.DATABASE_URL!,
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    // The public origin clients use (https://<API_DOMAIN> when deployed).
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    // Optional parent domain (e.g. "zeeya.app") so the session cookie set on
    // the API host is also sent from the web host.
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN ?? "",
    // Sign in with Google (all platforms) and Apple (iOS). Public client IDs,
    // not secrets: native sign-in only needs them to verify ID tokens. A
    // provider whose IDs are unset is disabled.
    GOOGLE_WEB_CLIENT_ID: process.env.GOOGLE_WEB_CLIENT_ID ?? "",
    GOOGLE_CLIENT_SECRET: alchemy.secret(process.env.GOOGLE_CLIENT_SECRET ?? ""),
    GOOGLE_IOS_CLIENT_ID: process.env.GOOGLE_IOS_CLIENT_ID ?? "",
    GOOGLE_ANDROID_CLIENT_ID: process.env.GOOGLE_ANDROID_CLIENT_ID ?? "",
    APPLE_APP_BUNDLE_IDENTIFIER: process.env.APPLE_APP_BUNDLE_IDENTIFIER ?? "",
    // tRPC only (apps/server/src/limits.ts); Better Auth limits its own routes.
    API_LIMITER: RateLimit({ namespace_id: 1002, simple: { limit: 300, period: 60 } }),
    // Unset disables error reporting (local dev).
    SENTRY_DSN: process.env.SENTRY_DSN ?? "",
    // Lets Sentry tag events with the deployed Worker version.
    CF_VERSION_METADATA: VersionMetadata(),
    // Brand logos (apps/server/src/logos.ts): downloaded once through the
    // Logo.dev API with its secret key, then served from R2.
    // R2 bucket names must be lowercase; stage names (e.g. a machine name) may not be.
    LOGOS: await R2Bucket("logos", { name: `zeeya-logos-${app.stage.toLowerCase()}` }),
    LOGO_DEV_SECRET_KEY: alchemy.secret(process.env.LOGO_DEV_SECRET_KEY ?? ""),
    LOGO_LIMITER: RateLimit({ namespace_id: 1003, simple: { limit: 600, period: 60 } }),
  },
  dev: {
    port: 3002,
  },
});

export const gateway = await Worker("api-gateway", {
  name: "zeeya-api",
  cwd: "../../apps/server",
  entrypoint: "src/gateway.ts",
  compatibility: "node",
  url: !apiDomain,
  previewSubdomains: false,
  domains: apiDomain ? [apiDomain] : undefined,
  // Forwarding only: substantially less CPU headroom than the auth backend.
  limits: workersPaidPlan ? { cpu_ms: 50 } : undefined,
  bindings: { BACKEND: server },
  dev: { port: 3000 },
});

const apiUrl = apiDomain ? `https://${apiDomain}` : gateway.url!;

// Mobile deployments do not provision the unused web app.
export const web =
  process.env.DEPLOY_WEB === "true"
    ? await TanStackStart("web", {
        cwd: "../../apps/web",
        bindings: {
          VITE_SERVER_URL: apiUrl,
          DATABASE_URL: alchemy.secret.env.DATABASE_URL!,
          CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
          BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
          BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
        },
      })
    : undefined;

if (web) console.log(`Web -> ${web.url}`);
console.log(`API -> ${apiUrl}`);

await app.finalize();
