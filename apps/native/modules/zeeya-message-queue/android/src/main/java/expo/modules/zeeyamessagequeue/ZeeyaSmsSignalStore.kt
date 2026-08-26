package expo.modules.zeeyamessagequeue

import android.content.Context

data class PendingSmsSignal(
  val count: Int,
  val lastReceivedAt: Long,
)

object ZeeyaSmsSignalStore {
  private const val preferencesName = "zeeya_realtime_sms"
  private const val pendingCountKey = "pending_count"
  private const val lastReceivedAtKey = "last_received_at"

  private val observers = mutableSetOf<(PendingSmsSignal) -> Unit>()

  @Synchronized
  fun record(context: Context, receivedAt: Long): PendingSmsSignal {
    val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    val next = PendingSmsSignal(
      count = preferences.getInt(pendingCountKey, 0) + 1,
      lastReceivedAt = maxOf(receivedAt, preferences.getLong(lastReceivedAtKey, 0)),
    )
    preferences.edit()
      .putInt(pendingCountKey, next.count)
      .putLong(lastReceivedAtKey, next.lastReceivedAt)
      .commit()
    observers.toList().forEach { observer -> observer(next) }
    return next
  }

  @Synchronized
  fun consume(context: Context): PendingSmsSignal? {
    val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    val count = preferences.getInt(pendingCountKey, 0)
    if (count == 0) return null

    val pending = PendingSmsSignal(
      count = count,
      lastReceivedAt = preferences.getLong(lastReceivedAtKey, 0),
    )
    preferences.edit()
      .remove(pendingCountKey)
      .remove(lastReceivedAtKey)
      .commit()
    return pending
  }

  @Synchronized
  fun addObserver(observer: (PendingSmsSignal) -> Unit) {
    observers.add(observer)
  }

  @Synchronized
  fun removeObserver(observer: ((PendingSmsSignal) -> Unit)?) {
    if (observer != null) observers.remove(observer)
  }
}
