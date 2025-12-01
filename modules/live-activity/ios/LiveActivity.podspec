require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = package['version']
  s.summary        = 'Live Activity module for BeerSelector'
  s.description    = 'Expo module for iOS Live Activities with beer queue display'
  s.license        = 'MIT'
  s.author         = 'BeerSelector'
  s.homepage       = 'https://github.com/beerselector'
  s.platforms      = { :ios => '17.6' }
  s.source         = { git: 'https://github.com/beerselector/beerselector.git' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
