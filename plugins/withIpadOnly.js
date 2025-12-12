const { withInfoPlist } = require('@expo/config-plugins');

module.exports = function withIpadOnly(config) {
  return withInfoPlist(config, (config) => {
    // Ensure UIDeviceFamily is set to iPad only (2)
    config.modResults.UIDeviceFamily = [2];
    // Explicitly mark as not iPhone app
    config.modResults.LSRequiresIPhoneOS = false;
    return config;
  });
};

