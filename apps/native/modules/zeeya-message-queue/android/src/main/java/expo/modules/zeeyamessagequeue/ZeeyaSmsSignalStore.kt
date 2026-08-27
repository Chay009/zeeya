package expo.modules.zeeyamessagequeue

import android.content.Context

data class PendingSmsSignal(
  val generation: Long,
  val count: Int,
  val lastReceivedAt: Long,
)

object ZeeyaSmsSignalStore {
  private const val preferencesName = "zeeya_realtime_sms"
  private const val pendingCountKey = "pending_count"
  private const val lastReceivedAtKey = "last_received_at"
  private const val generationKey = "generation"

  private val observers = mutableSetOf<(PendingSmsSignal) -> Unit>()

  fun record(context: Context, receivedAt: Long): PendingSmsSignal {
    val (next, observersSnapshot) = synchronized(this) {
      val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
      val next = PendingSmsSignal(
        generation = preferences.getLong(generationKey, 0) + 1,
        count = preferences.getInt(pendingCountKey, 0) + 1,
        lastReceivedAt = maxOf(receivedAt, preferences.getLong(lastReceivedAtKey, 0)),
      )
      preferences.edit()
        .putInt(pendingCountKey, next.count)
        .putLong(lastReceivedAtKey, next.lastReceivedAt)
        .putLong(generationKey, next.generation)
        .commit()
      next to observers.toList()
    }
    // Observer callbacks cross the native/JS boundary and may re-enter this
    // store. Notify from the snapshot after releasing the monitor so an SMS
    // broadcast is never held behind arbitrary JS work.
    observersSnapshot.forEach { observer -> observer(next) }
    return next
  }

  @Synchronized
  fun peek(context: Context): PendingSmsSignal? {
    val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    val count = preferences.getInt(pendingCountKey, 0)
    if (count == 0) return null

    return PendingSmsSignal(
      generation = preferences.getLong(generationKey, 0),
      count = count,
      lastReceivedAt = preferences.getLong(lastReceivedAtKey, 0),
    )
  }

  @Synchronized
  fun acknowledge(context: Context, acknowledgedGeneration: Long) {
    val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    val currentCount = preferences.getInt(pendingCountKey, 0)
    if (currentCount == 0) return
    val currentGeneration = preferences.getLong(generationKey, 0)
    if (currentGeneration != acknowledgedGeneration) return

    preferences.edit()
      .remove(pendingCountKey)
      .remove(lastReceivedAtKey)
      .commit()
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
