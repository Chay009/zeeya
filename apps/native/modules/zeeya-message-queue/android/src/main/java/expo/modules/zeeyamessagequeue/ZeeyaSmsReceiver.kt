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
    ZeeyaSmsSignalStore.record(context.applicationContext, System.currentTimeMillis())
  }
}
