import { expo } from "@better-auth/expo";
import * as Sentry from "@sentry/cloudflare";
import { getDb } from "@zeeya/db";
import * as schema from "@zeeya/db/schema/auth";
import { env } from "@zeeya/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { waitUntil } from "cloudflare:workers";

const isDevelopment = env.ENVIRONMENT === "development";

// Google client IDs from one Google Cloud project, one per platform. Native
// sign-in sends Google's ID token; any of these is accepted as its audience.
const googleClientIds = [
  env.GOOGLE_WEB_CLIENT_ID,
  env.GOOGLE_IOS_CLIENT_ID,
  env.GOOGLE_ANDROID_CLIENT_ID,
].filter(Boolean);

function buildAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: schema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    // The public origin clients use.
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      env.CORS_ORIGIN,
      "zeeya://",
      "https://appleid.apple.com",
      // Expo Go / dev clients on a LAN IP; never trusted outside local dev.
      ...(isDevelopment ? ["exp://", "exp://**", "http://localhost:8081"] : []),
    ],
    // Sign-in is Google, plus Apple on iOS (App Store guideline 4.8). The app
    // uses each platform's native sign-in and sends the provider's ID token to
    // signIn.social. The optional secret also enables Google's browser flow.
    socialProviders: {
      google: {
        enabled: googleClientIds.length > 0,
        clientId: googleClientIds,
        clientSecret: env.GOOGLE_WEB_CLIENT_ID ? env.GOOGLE_CLIENT_SECRET || undefined : undefined,
      },
      apple: {
        enabled: Boolean(env.APPLE_APP_BUNDLE_IDENTIFIER),
        // Native iOS ID tokens carry the app's bundle ID as their audience.
        clientId: env.APPLE_APP_BUNDLE_IDENTIFIER,
        appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
      },
    },
    account: {
      accountLinking: {
        // Apple's "Hide My Email" gives a relay address that never matches the
        // user's Google email, so the two can only join through an explicit
        // linkSocial() while signed in (both identities proven).
        allowDifferentEmails: true,
      },
    },
    user: {
      // Better Auth owns deletion, session freshness, and linked-session cleanup.
      // This removes cloud identity only; financial data lives on the device.
      deleteUser: { enabled: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Signed session snapshot in a cookie, so most tRPC calls validate the
      // session without a Neon round-trip.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    // Database storage: the default in-memory store is per isolate on Workers.
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
      backgroundTasks: {
        handler: waitUntil,
      },
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: true,
        httpOnly: true,
      },
      crossSubDomainCookies: env.COOKIE_DOMAIN
        ? { enabled: true, domain: env.COOKIE_DOMAIN }
        : undefined,
    },
    onAPIError: {
      // Better Auth turns errors into responses rather than throwing, so the
      // server's Hono onError never sees them. Report internal failures only;
      // 4xx (e.g. an invalid ID token) are expected outcomes.
      onError: (error) => {
        if (error instanceof APIError && error.statusCode < 500) return;
        Sentry.captureException(error);
      },
    },
    plugins: [expo()],
  });
}

let auth: ReturnType<typeof buildAuth> | undefined;

// One instance per isolate. Bindings are module-scoped on Workers, so building
// it per request only repeats the plugin and adapter setup.
export function createAuth() {
  auth ??= buildAuth();
  return auth;
}
