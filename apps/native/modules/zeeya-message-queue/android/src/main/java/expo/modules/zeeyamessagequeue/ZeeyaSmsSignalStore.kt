package expo.modules.zeeyamessagequeue

import android.content.Context
import android.content.SharedPreferences

data class PendingSmsSignal(
  val generation: Long,
  val count: Int,
  val lastReceivedAt: Long,
)

object ZeeyaSmsSignalStore {
  private const val PREFERENCES_NAME = "zeeya_realtime_sms"
  private const val PENDING_COUNT_KEY = "pending_count"
  private const val LAST_RECEIVED_AT_KEY = "last_received_at"
  private const val GENERATION_KEY = "generation"
  private const val SYNC_ON_ARRIVAL_ENABLED_KEY = "sync_on_arrival_enabled"
  private const val LEGACY_SYNC_ON_ARRIVAL_ENABLED_KEY = "background_notification_enabled"

  private val observers = mutableSetOf<(PendingSmsSignal) -> Unit>()

  private fun preferences(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  fun record(context: Context, receivedAt: Long) {
    val (next, observersSnapshot) = synchronized(this) {
      val preferences = preferences(context)
      val next = PendingSmsSignal(
        generation = preferences.getLong(GENERATION_KEY, 0) + 1,
        count = preferences.getInt(PENDING_COUNT_KEY, 0) + 1,
        lastReceivedAt = maxOf(receivedAt, preferences.getLong(LAST_RECEIVED_AT_KEY, 0)),
      )
      preferences.edit()
        .putInt(PENDING_COUNT_KEY, next.count)
        .putLong(LAST_RECEIVED_AT_KEY, next.lastReceivedAt)
        .putLong(GENERATION_KEY, next.generation)
        .commit()
      next to observers.toList()
    }
    // Observer callbacks cross the native/JS boundary and may re-enter this
    // store. Notify from the snapshot after releasing the monitor so an SMS
    // broadcast is never held behind arbitrary JS work.
    observersSnapshot.forEach { observer -> observer(next) }
  }

  @Synchronized
  fun peek(context: Context): PendingSmsSignal? {
    val preferences = preferences(context)
    val count = preferences.getInt(PENDING_COUNT_KEY, 0)
    if (count == 0) return null

    return PendingSmsSignal(
      generation = preferences.getLong(GENERATION_KEY, 0),
      count = count,
      lastReceivedAt = preferences.getLong(LAST_RECEIVED_AT_KEY, 0),
    )
  }

  @Synchronized
  fun acknowledge(context: Context, acknowledgedGeneration: Long) {
    val preferences = preferences(context)
    if (preferences.getInt(PENDING_COUNT_KEY, 0) == 0) return
    // A newer SMS arrived after the sync started; keep it pending.
    if (preferences.getLong(GENERATION_KEY, 0) != acknowledgedGeneration) return

    preferences.edit()
      .remove(PENDING_COUNT_KEY)
      .remove(LAST_RECEIVED_AT_KEY)
      .commit()
  }

  fun setSyncOnArrivalEnabled(context: Context, enabled: Boolean) {
    preferences(context).edit().putBoolean(SYNC_ON_ARRIVAL_ENABLED_KEY, enabled).apply()
  }

  // Installs from before the rename only have the old key until the app
  // next writes the preference.
  fun isSyncOnArrivalEnabled(context: Context): Boolean {
    val preferences = preferences(context)
    return preferences.getBoolean(
      SYNC_ON_ARRIVAL_ENABLED_KEY,
      preferences.getBoolean(LEGACY_SYNC_ON_ARRIVAL_ENABLED_KEY, false),
    )
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
