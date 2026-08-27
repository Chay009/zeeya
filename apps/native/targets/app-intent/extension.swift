import AppIntents
import CryptoKit
import Foundation

@main
struct ZeeyaMessageImportExtension: AppIntentsExtension {}

private struct ShortcutMessageEnvelope: Codable {
  let version: Int
  let id: String
  let sender: String
  let body: String
  let receivedAt: Int64
  let capturedAt: Int64
}

private struct ShortcutMessageReceipt: Codable {
  let capturedAt: Int64
}

private let duplicateWindowMilliseconds: Int64 = 24 * 60 * 60 * 1_000

private func sha256(_ value: String) -> String {
  SHA256.hash(data: Data(value.utf8))
    .map { String(format: "%02x", $0) }
    .joined()
}

private func pruneExpiredReceipts(in directory: URL, nowMilliseconds: Int64) {
  let decoder = JSONDecoder()
  guard let files = try? FileManager.default.contentsOfDirectory(
    at: directory,
    includingPropertiesForKeys: nil,
    options: [.skipsHiddenFiles]
  ) else { return }

  for file in files where file.pathExtension == "json" {
    guard let data = try? Data(contentsOf: file),
      let receipt = try? decoder.decode(ShortcutMessageReceipt.self, from: data),
      nowMilliseconds >= receipt.capturedAt,
      nowMilliseconds - receipt.capturedAt < duplicateWindowMilliseconds
    else {
      try? FileManager.default.removeItem(at: file)
      continue
    }
  }
}

struct ImportFinancialMessageIntent: AppIntent {
  static var title: LocalizedStringResource = "Import Financial Message"
  static var description = IntentDescription(
    "Securely saves an incoming financial message for Zeeya to process on-device."
  )
  static var openAppWhenRun = false

  @Parameter(title: "Message")
  var message: String

  @Parameter(title: "Sender", default: "")
  var sender: String

  @Parameter(title: "Received At")
  var receivedAt: Date

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let now = Date()
    let nowMilliseconds = Int64(now.timeIntervalSince1970 * 1_000)

    guard let appGroupIdentifier = Bundle.main.object(
      forInfoDictionaryKey: "ZeeyaMessageQueueAppGroup"
    ) as? String,
      let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupIdentifier
      )
    else {
      throw ImportFinancialMessageError.sharedContainerUnavailable
    }

    guard let queueRootName = Bundle.main.object(
      forInfoDictionaryKey: "ZeeyaMessageQueueRoot"
    ) as? String,
      let queueVersion = Bundle.main.object(
        forInfoDictionaryKey: "ZeeyaMessageQueueVersion"
      ) as? String
    else {
      throw ImportFinancialMessageError.sharedContainerUnavailable
    }

    let queueRoot = container.appendingPathComponent(queueRootName, isDirectory: true)
    let directory = queueRoot.appendingPathComponent(queueVersion, isDirectory: true)
    let receiptDirectory = queueRoot.appendingPathComponent(
      "receipts-\(queueVersion)",
      isDirectory: true
    )
    for requiredDirectory in [directory, receiptDirectory] {
      try FileManager.default.createDirectory(
        at: requiredDirectory,
        withIntermediateDirectories: true,
        attributes: nil
      )
    }

    // Received At is a required Shortcut input and therefore belongs to the
    // delivery identity. A retry of one delivery keeps the same ID, while two
    // genuine identical messages at different times remain distinct. The
    // short-lived receipt avoids re-queuing ordinary retries; even after it is
    // pruned, the ledger still deduplicates the stable delivery ID.
    let receivedAtMilliseconds = Int64(receivedAt.timeIntervalSince1970 * 1_000)
    let deliveryHash = sha256(
      sender + "\u{0}" + message + "\u{0}" + String(receivedAtMilliseconds)
    )
    let receiptFile = receiptDirectory.appendingPathComponent("\(deliveryHash).json")
    let decoder = JSONDecoder()
    pruneExpiredReceipts(in: receiptDirectory, nowMilliseconds: nowMilliseconds)
    if let receiptData = try? Data(contentsOf: receiptFile),
      let receipt = try? decoder.decode(ShortcutMessageReceipt.self, from: receiptData),
      nowMilliseconds >= receipt.capturedAt,
      nowMilliseconds - receipt.capturedAt < duplicateWindowMilliseconds
    {
      return .result(dialog: "Already saved securely for Zeeya")
    }

    let id = deliveryHash
    let envelope = ShortcutMessageEnvelope(
      version: 1,
      id: id,
      sender: sender,
      body: message,
      receivedAt: receivedAtMilliseconds,
      capturedAt: nowMilliseconds
    )

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try encoder.encode(envelope)
    let temporaryFile = directory.appendingPathComponent(".\(UUID().uuidString).tmp")
    let finalFile = directory.appendingPathComponent("\(id).json")
    try data.write(
      to: temporaryFile,
      options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
    )
    if FileManager.default.fileExists(atPath: finalFile.path) {
      try FileManager.default.removeItem(at: temporaryFile)
    } else {
      do {
        try FileManager.default.moveItem(at: temporaryFile, to: finalFile)
      } catch {
        if FileManager.default.fileExists(atPath: finalFile.path) {
          try? FileManager.default.removeItem(at: temporaryFile)
        } else {
          throw error
        }
      }
    }

    let receipt = ShortcutMessageReceipt(capturedAt: nowMilliseconds)
    try encoder.encode(receipt).write(
      to: receiptFile,
      options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
    )

    return .result(dialog: "Saved securely for Zeeya")
  }
}

enum ImportFinancialMessageError: LocalizedError {
  case sharedContainerUnavailable

  var errorDescription: String? {
    switch self {
    case .sharedContainerUnavailable:
      return "Zeeya's secure message queue is unavailable. Rebuild or reinstall Zeeya."
    }
  }
}

struct ZeeyaAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: ImportFinancialMessageIntent(),
      phrases: ["Import message into \(.applicationName)"],
      shortTitle: "Import Financial Message",
      systemImageName: "message.badge.waveform"
    )
  }
}
