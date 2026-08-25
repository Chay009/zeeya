import ExpoModulesCore
import Foundation

public class ZeeyaMessageQueueModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZeeyaMessageQueue")

    AsyncFunction("listPending") { () throws -> [[String: String]] in
      let directory = try Self.queueDirectory()
      let files = try FileManager.default.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: nil,
        options: [.skipsHiddenFiles]
      )

      return try files
        .filter { $0.pathExtension == "json" }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
        .map { file in
          let contents = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
          [
            "fileName": file.lastPathComponent,
            "contents": contents,
          ]
        }
    }

    AsyncFunction("acknowledge") { (fileName: String) throws in
      let file = try Self.pendingFile(fileName)
      if FileManager.default.fileExists(atPath: file.path) {
        try FileManager.default.removeItem(at: file)
      }
    }

    AsyncFunction("quarantine") { (fileName: String) throws in
      let file = try Self.pendingFile(fileName)
      if FileManager.default.fileExists(atPath: file.path) {
        // JS has already retained the privacy-safe file name and validation
        // reason. Do not keep malformed raw financial content on disk.
        try FileManager.default.removeItem(at: file)
      }
    }
  }

  private static func queueDirectory() throws -> URL {
    guard let appGroup = Bundle.main.object(
      forInfoDictionaryKey: "ZeeyaMessageQueueAppGroup"
    ) as? String,
      let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroup
      ) else {
      throw QueueContainerUnavailableException()
    }

    guard let queueRoot = Bundle.main.object(
      forInfoDictionaryKey: "ZeeyaMessageQueueRoot"
    ) as? String,
      let queueVersion = Bundle.main.object(
        forInfoDictionaryKey: "ZeeyaMessageQueueVersion"
      ) as? String else {
      throw QueueContainerUnavailableException()
    }

    let directory = container
      .appendingPathComponent(queueRoot, isDirectory: true)
      .appendingPathComponent(queueVersion, isDirectory: true)
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true,
      attributes: nil
    )
    return directory
  }

  private static func pendingFile(_ fileName: String) throws -> URL {
    guard fileName == (fileName as NSString).lastPathComponent,
          (fileName as NSString).pathExtension == "json" else {
      throw InvalidQueueFileNameException(fileName)
    }
    return try queueDirectory().appendingPathComponent(fileName, isDirectory: false)
  }

}

private class QueueContainerUnavailableException: Exception {
  override var reason: String {
    "Zeeya's shared iOS message queue is not configured for this build."
  }
}

private class InvalidQueueFileNameException: GenericException<String> {
  override var reason: String {
    "Invalid pending-message file name: \(param)"
  }
}
