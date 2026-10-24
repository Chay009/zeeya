import UIKit
import UserNotifications
import UserNotificationsUI

final class NotificationViewController: UIViewController, UNNotificationContentExtension {
  private let brandLabel = UILabel()
  private let titleLabel = UILabel()
  private let bodyLabel = UILabel()

  override func viewDidLoad() {
    super.viewDidLoad()

    view.backgroundColor = .secondarySystemGroupedBackground
    brandLabel.text = "ZEEYA  ·  ACTIVITY"
    brandLabel.font = .systemFont(ofSize: 11, weight: .bold)
    brandLabel.textColor = .secondaryLabel
    titleLabel.font = .systemFont(ofSize: 20, weight: .semibold)
    titleLabel.textColor = .label
    titleLabel.numberOfLines = 2
    bodyLabel.font = .systemFont(ofSize: 14)
    bodyLabel.textColor = .secondaryLabel
    bodyLabel.numberOfLines = 0

    let stack = UIStackView(arrangedSubviews: [brandLabel, titleLabel, bodyLabel])
    stack.axis = .vertical
    stack.alignment = .leading
    stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)

    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
      stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
      stack.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
    ])
  }

  func didReceive(_ notification: UNNotification) {
    // This target only handles the count-only financialactivity category.
    // Never read the ledger or display merchant, amount, account, or SMS text.
    titleLabel.text = notification.request.content.title
    bodyLabel.text = notification.request.content.body
    preferredContentSize = CGSize(width: view.bounds.width, height: 140)
  }
}
