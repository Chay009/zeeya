require 'json'

native_capabilities_path = File.expand_path('../../../config/native-capabilities.json', __dir__)
native_capabilities = JSON.parse(File.read(native_capabilities_path))

Pod::Spec.new do |s|
  s.name           = 'ZeeyaMessageQueue'
  s.version        = '1.0.0'
  s.summary        = 'Reads Zeeya message envelopes queued by its App Intent.'
  s.description    = 'An iOS-only Expo module bridging Zeeya App Group queue files to JavaScript.'
  s.author         = 'Zeeya'
  s.homepage       = 'https://github.com/Chay009/zeeya'
  s.platforms      = { :ios => native_capabilities.fetch('iosDeploymentTarget') }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
