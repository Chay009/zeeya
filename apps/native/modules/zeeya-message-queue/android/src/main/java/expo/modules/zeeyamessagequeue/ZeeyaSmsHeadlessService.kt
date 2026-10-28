package expo.modules.zeeyamessagequeue

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

// Runs the shared TypeScript ingestion path right after an SMS arrives while
// the app is in the background, so Malana decides whether it is a
// transaction before anything is shown. Only confirmed transactions notify.
class ZeeyaSmsHeadlessService : HeadlessJsTaskService() {
  // Allowed in the foreground: the user may open the app before the task
  // starts, and React Native throws otherwise. The JS side serializes runs.
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), TIMEOUT_MS, true)

  companion object {
    // Must match SMS_ARRIVED_TASK in features/capabilities/background/task.native.ts.
    private const val TASK_NAME = "ZeeyaSmsArrived"
    // How long Android lets the task run before stopping it.
    private const val TIMEOUT_MS = 30_000L

    fun start(context: Context) {
      try {
        context.startService(Intent(context, ZeeyaSmsHeadlessService::class.java))
        acquireWakeLockNow(context)
      } catch (_: IllegalStateException) {
        // Android refused a background start; the periodic sync catches up.
      }
    }
  }
}
