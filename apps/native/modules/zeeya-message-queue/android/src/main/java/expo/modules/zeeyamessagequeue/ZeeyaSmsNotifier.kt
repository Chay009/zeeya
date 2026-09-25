package expo.modules.zeeyamessagequeue

import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

object ZeeyaSmsNotifier {
  private const val channelId = "financial-activity"
  private const val notificationId = 7401

  fun isAppVisible(): Boolean {
    val state = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(state)
    return state.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND ||
      state.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
  }

  fun show(context: Context, pendingCount: Int) {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(
          channelId,
          "Financial activity",
          NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
          description = "Privacy-safe notices when Zeeya has new messages to process"
          lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
        },
      )
    }

    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent()
    val contentIntent = PendingIntent.getActivity(
      context,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val title = if (pendingCount == 1) "New message ready" else "New messages ready"
    val body = if (pendingCount == 1) {
      "Open Zeeya to process the latest message."
    } else {
      "Open Zeeya to process $pendingCount recent messages."
    }
    val notification = NotificationCompat.Builder(context, channelId)
      .setSmallIcon(android.R.drawable.stat_notify_more)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(contentIntent)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .build()
    manager.notify(notificationId, notification)
  }

  fun dismiss(context: Context) {
    context.getSystemService(NotificationManager::class.java).cancel(notificationId)
  }
}
