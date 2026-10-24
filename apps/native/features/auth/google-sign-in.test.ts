import { describe, expect, it, vi } from "vitest";
import { configureGoogleSignIn } from "./google-sign-in";

describe("optional Google sign-in initialization", () => {
  it("keeps local finances usable when the native SDK rejects configuration", () => {
    const configure = vi.fn(() => {
      throw new Error("Native configuration unavailable");
    });
    const native = { GoogleOneTapSignIn: { configure } };
    expect(
      configureGoogleSignIn({ webClientId: "client", iosClientId: null }, () => native),
    ).toBeNull();
    expect(configure).toHaveBeenCalledOnce();
  });
});
