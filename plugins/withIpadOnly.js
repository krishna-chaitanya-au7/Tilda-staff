const { withInfoPlist, withXcodeProject } = require('@expo/config-plugins');

module.exports = function withIpadOnly(config) {
  // First, modify Info.plist
  config = withInfoPlist(config, (config) => {
    // Ensure UIDeviceFamily is set to iPad only (2)
    // This is the critical setting - must be an array with only 2
    config.modResults.UIDeviceFamily = [2];
    // Explicitly mark as not iPhone app
    config.modResults.LSRequiresIPhoneOS = false;
    return config;
  });

  // Also modify Xcode project to ensure device family is set correctly
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    
    Object.keys(configurations).forEach((configUuid) => {
      const buildSettings = configurations[configUuid].buildSettings;
      if (buildSettings) {
        // Set TARGETED_DEVICE_FAMILY to 2 (iPad only)
        // This ensures the Xcode project itself is configured for iPad
        buildSettings.TARGETED_DEVICE_FAMILY = '"2"';
        // Remove any iPhone-specific settings
        delete buildSettings['TARGETED_DEVICE_FAMILY_IPHONE'];
      }
    });
    
    return config;
  });

  return config;
};


