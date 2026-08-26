import { AndroidConfig, type ConfigPlugin, withAndroidManifest } from "expo/config-plugins";

const RECEIVER_CLASS = "expo.modules.zeeyamessagequeue.ZeeyaSmsReceiver";
const SMS_RECEIVED_ACTION = "android.provider.Telephony.SMS_RECEIVED";

const withRealtimeSmsReceiver: ConfigPlugin = (config) =>
  withAndroidManifest(config, (androidConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidConfig.modResults);
    const receivers = application.receiver ?? [];
    const otherReceivers = receivers.filter(
      (receiver) => receiver.$?.["android:name"] !== RECEIVER_CLASS,
    );

    const receiver = {
      $: {
        "android:name": RECEIVER_CLASS,
        "android:exported": "true" as const,
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": SMS_RECEIVED_ACTION } }],
        },
      ],
    };
    // @expo/config-plugins' ManifestReceiver type omits the standard
    // receiver-level permission even though Android supports it. Assigning
    // it after construction keeps the plugin type-safe while preventing
    // untrusted apps from spoofing SMS arrival broadcasts.
    Object.assign(receiver.$, { "android:permission": "android.permission.BROADCAST_SMS" });

    application.receiver = [...otherReceivers, receiver];

    return androidConfig;
  });

export default withRealtimeSmsReceiver;
