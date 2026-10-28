package expo.modules.zeeyamessagequeue

import android.app.ActivityManager
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
    ZeeyaSmsSignalStore.record(applicationContext, System.currentTimeMillis())
    // In the foreground the app's own listener ingests; in the background the
    // headless task does, and notifies only for transactions.
    if (ZeeyaSmsSignalStore.isSyncOnArrivalEnabled(applicationContext) && !isAppVisible()) {
      ZeeyaSmsHeadlessService.start(applicationContext)
    }
  }

  private fun isAppVisible(): Boolean {
    val state = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(state)
    return state.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
  }
}
