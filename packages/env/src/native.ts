import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    EXPO_PUBLIC_SERVER_URL: z.url(),
    // Google sign-in (public OAuth client IDs). Unset hides the Google button.
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().optional(),
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: z.string().optional(),
  },
  // Expo only embeds statically referenced EXPO_PUBLIC_* properties. Passing
  // process.env itself works in Node tests but leaves native release builds
  // without their API URL and sign-in configuration.
  runtimeEnvStrict: {
    EXPO_PUBLIC_SERVER_URL: process.env.EXPO_PUBLIC_SERVER_URL,
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  },
  emptyStringAsUndefined: true,
});
