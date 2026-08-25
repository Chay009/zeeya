Pod::Spec.new do |s|
  s.name           = 'ZeeyaMessageQueue'
  s.version        = '1.0.0'
  s.summary        = 'Reads Zeeya message envelopes queued by its App Intent.'
  s.description    = 'An iOS-only Expo module bridging Zeeya App Group queue files to JavaScript.'
  s.author         = 'Zeeya'
  s.homepage       = 'https://github.com/Chay009/zeeya'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
