package expo.modules.zeeyamessagequeue

import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class ZeeyaMessageQueueModule : Module() {
  private var smsObserver: ((PendingSmsSignal) -> Unit)? = null

  override fun definition() = ModuleDefinition {
    Name("ZeeyaMessageQueue")

    Events("onSmsReceived")

    AsyncFunction("peekPendingSmsSignal") {
      val context = appContext.reactContext
        ?: throw MessageQueueContextUnavailableException()
      ZeeyaSmsSignalStore.peek(context)?.toBundle()
    }

    AsyncFunction("acknowledgePendingSmsSignal") { generation: Long ->
      val context = appContext.reactContext
        ?: throw MessageQueueContextUnavailableException()
      ZeeyaSmsSignalStore.acknowledge(context, generation)
    }

    OnStartObserving("onSmsReceived") {
      val weakModule = WeakReference(this@ZeeyaMessageQueueModule)
      val observer: (PendingSmsSignal) -> Unit = { signal ->
        weakModule.get()?.sendEvent("onSmsReceived", signal.toBundle())
      }
      ZeeyaSmsSignalStore.addObserver(observer)
      smsObserver = observer
    }

    OnStopObserving("onSmsReceived") {
      ZeeyaSmsSignalStore.removeObserver(smsObserver)
      smsObserver = null
    }
  }

  private fun PendingSmsSignal.toBundle() = bundleOf(
    "generation" to generation,
    "count" to count,
    "lastReceivedAt" to lastReceivedAt,
  )
}

private class MessageQueueContextUnavailableException : Exception(
  "Zeeya's Android SMS signal store is unavailable before React context initialization.",
)
