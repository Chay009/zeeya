import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { getConfig, getConfigFilePaths, type ConfigContext } from "expo/config";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import appConfig from "../app.config";

const projectRoot = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
const expoCli = require.resolve("expo/bin/cli");

const SplashPluginSchema = z.tuple([
  z.literal("expo-splash-screen"),
  z.object({ image: z.string().min(1) }).passthrough(),
]);

const IntrospectionSchema = z.object({
  extra: z.object({
    eas: z.object({
      build: z.object({
        experimental: z.object({
          ios: z.object({
            appExtensions: z.array(z.unknown()),
          }),
        }),
      }),
    }),
  }),
  _internal: z.object({
    modResults: z.object({
      android: z.object({
        manifest: z.object({
          manifest: z.object({
            "uses-permission": z.array(
              z.object({ $: z.record(z.string(), z.string()).optional() }),
            ),
            application: z.array(
              z.object({
                receiver: z
                  .array(
                    z.object({
                      $: z.record(z.string(), z.string()).optional(),
                      "intent-filter": z
                        .array(
                          z.object({
                            action: z.array(
                              z.object({ $: z.record(z.string(), z.string()).optional() }),
                            ),
                          }),
                        )
                        .optional(),
                    }),
                  )
                  .optional(),
              }),
            ),
          }),
        }),
      }),
      ios: z.object({
        infoPlist: z.record(z.string(), z.unknown()),
        entitlements: z.record(z.string(), z.unknown()),
        podfileProperties: z.record(z.string(), z.unknown()),
      }),
    }),
  }),
});

function compileNativeContract() {
  const output = execFileSync(
    process.execPath,
    [expoCli, "config", "--type", "introspect", "--json"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const jsonLine = output.trim().split(/\r?\n/).at(-1);

  if (!jsonLine) {
    throw new Error("Expo config introspection returned no JSON output.");
  }

  const compiled = IntrospectionSchema.parse(JSON.parse(jsonLine));
  const modResults = compiled._internal.modResults;
  const permissions = modResults.android.manifest.manifest["uses-permission"];
  const receivers = modResults.android.manifest.manifest.application[0]?.receiver ?? [];

  return {
    readSmsDeclarationCount: permissions.filter(
      (permission) => permission.$?.["android:name"] === "android.permission.READ_SMS",
    ).length,
    receiveSmsDeclarationCount: permissions.filter(
      (permission) => permission.$?.["android:name"] === "android.permission.RECEIVE_SMS",
    ).length,
    realtimeSmsReceivers: receivers.filter(
      (receiver) =>
        receiver.$?.["android:name"] === "expo.modules.zeeyamessagequeue.ZeeyaSmsReceiver",
    ),
    queueInfo: {
      appGroup: modResults.ios.infoPlist.ZeeyaMessageQueueAppGroup,
      root: modResults.ios.infoPlist.ZeeyaMessageQueueRoot,
      version: modResults.ios.infoPlist.ZeeyaMessageQueueVersion,
    },
    appGroups: modResults.ios.entitlements["com.apple.security.application-groups"],
    deploymentTarget: modResults.ios.podfileProperties["ios.deploymentTarget"],
    usesSqlCipher: modResults.ios.podfileProperties["expo.sqlite.useSQLCipher"],
    appExtensions: compiled.extra.eas.build.experimental.ios.appExtensions,
  };
}

describe("Zeeya native capability configuration", () => {
  it("evaluates one dynamic Expo config for the platform identity and Android SMS permission", () => {
    const paths = getConfigFilePaths(projectRoot);
    const { exp } = getConfig(projectRoot, { skipSDKVersionRequirement: true });

    expect(paths.dynamicConfigPath).toBe(path.join(projectRoot, "app.config.ts"));
    expect(exp.android).toMatchObject({
      package: "com.anonymous.zeeya",
      permissions: expect.arrayContaining([
        "android.permission.READ_SMS",
        "android.permission.RECEIVE_SMS",
      ]),
    });
    expect(exp.ios).toMatchObject({
      bundleIdentifier: "com.anonymous.zeeya",
      infoPlist: {
        ZeeyaMessageQueueAppGroup: "group.com.anonymous.zeeya",
        ZeeyaMessageQueueRoot: "message-queue",
        ZeeyaMessageQueueVersion: "v1",
      },
      entitlements: {
        "com.apple.security.application-groups": ["group.com.anonymous.zeeya"],
      },
    });
    expect(exp.plugins).not.toContain("./plugins/withReadSmsPermission.js");

    const splashPlugin = SplashPluginSchema.parse(
      exp.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen"),
    );
    expect(splashPlugin[1].image).toBe("./assets/images/android-icon-foreground.png");
    expect(existsSync(path.join(projectRoot, splashPlugin[1].image))).toBe(true);
  }, 15_000);

  it("rejects a second plugin owner outside the dynamic config", () => {
    const context = {
      projectRoot,
      staticConfigPath: path.join(projectRoot, "app.json"),
      packageJsonPath: path.join(projectRoot, "package.json"),
      config: {
        name: "zeeya",
        slug: "zeeya",
        plugins: ["expo-router"],
      },
    } satisfies ConfigContext;

    expect(() => appConfig(context)).toThrow(
      /Declare Expo plugins in app\.config\.ts so Zeeya's native plugin order has one owner/,
    );
  });

  it("compiles the Android permission and iOS queue contract through Expo's real mod graph", () => {
    const first = compileNativeContract();
    const second = compileNativeContract();

    expect(first).toMatchObject({
      readSmsDeclarationCount: 1,
      receiveSmsDeclarationCount: 1,
      queueInfo: {
        appGroup: "group.com.anonymous.zeeya",
        root: "message-queue",
        version: "v1",
      },
      appGroups: ["group.com.anonymous.zeeya"],
      deploymentTarget: "17.0",
      usesSqlCipher: "true",
    });
    expect(first.realtimeSmsReceivers).toEqual([
      {
        $: {
          "android:name": "expo.modules.zeeyamessagequeue.ZeeyaSmsReceiver",
          "android:exported": "true",
          "android:permission": "android.permission.BROADCAST_SMS",
        },
        "intent-filter": [
          {
            action: [
              {
                $: { "android:name": "android.provider.Telephony.SMS_RECEIVED" },
              },
            ],
          },
        ],
      },
    ]);
    expect(first.appExtensions).toContainEqual({
      bundleIdentifier: "com.anonymous.zeeya.shortcuts",
      targetName: "ZeeyaMessageImport",
      entitlements: {
        "com.apple.security.application-groups": ["group.com.anonymous.zeeya"],
      },
    });
    expect(second).toEqual(first);
  }, 30_000);
});
