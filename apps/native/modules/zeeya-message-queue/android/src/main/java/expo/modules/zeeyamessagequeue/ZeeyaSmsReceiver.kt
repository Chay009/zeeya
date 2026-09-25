package expo.modules.zeeyamessagequeue

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class ZeeyaSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    // A BroadcastReceiver has only a short execution window. Persist a
    // privacy-safe signal immediately; the shared TypeScript ingestion path
    // reads the canonical inbox row, parses it with Malana, and deduplicates
    // it through the existing SQLite ledger.
    val applicationContext = context.applicationContext
    val signal = ZeeyaSmsSignalStore.record(applicationContext, System.currentTimeMillis())
    if (
      ZeeyaSmsSignalStore.isBackgroundNotificationEnabled(applicationContext) &&
      !ZeeyaSmsNotifier.isAppVisible()
    ) {
      // Do not inspect or display SMS contents here. The receiver's only
      // immediate background work is a generic, privacy-safe OS notice;
      // canonical inbox ingestion and parsing remain in the shared JS/SQL
      // path on the next permitted worker or app launch.
      ZeeyaSmsNotifier.show(applicationContext, signal.count)
    }
  }
}
