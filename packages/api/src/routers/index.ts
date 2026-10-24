import { createAuth } from "@zeeya/auth";

import { publicProcedure, router } from "../index";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  // Which sign-in providers this deployment accepts, read from Better Auth's
  // own config, so the app never shows a button the server would reject.
  authProviders: publicProcedure.query(() => {
    const { google, apple } = createAuth().options.socialProviders;
    return {
      google: google.enabled === true,
      apple: apple.enabled === true,
      googleBrowser: google.enabled === true && Boolean(google.clientSecret),
    };
  }),
});
export type AppRouter = typeof appRouter;
