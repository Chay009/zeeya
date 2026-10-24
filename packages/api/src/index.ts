import { initTRPC, TRPCError } from "@trpc/server";
import { z, ZodError } from "zod";

import type { Context } from "./context";

export const t = initTRPC.context<Context>().create({
  // Input validation failures carry the Zod issues as a tree mirroring the
  // input, so the app can tell which field was rejected and why.
  // (z.treeifyError: ZodError#flatten is deprecated in Zod v4.)
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === "BAD_REQUEST" && error.cause instanceof ZodError
            ? z.treeifyError(error.cause)
            : null,
      },
    };
  },
});

export { TRPC_MAX_BATCH_SIZE } from "./limits";

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  // Narrows session to non-null for every procedure built on this one.
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});
