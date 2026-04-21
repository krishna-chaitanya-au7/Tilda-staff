const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withTabletOnly(config) {
  // Modify AndroidManifest.xml to restrict to tablets only
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];
    
    // Find or create the activity element
    let mainActivity = mainApplication.activity?.find(
      (activity) => activity.$['android:name'] === '.MainActivity'
    );
    
    if (!mainActivity) {
      // If MainActivity doesn't exist, create it
      mainActivity = {
        $: {
          'android:name': '.MainActivity',
        },
      };
      if (!mainApplication.activity) {
        mainApplication.activity = [];
      }
      mainApplication.activity.push(mainActivity);
    }
    
    // Use supports-screens with requiresSmallestWidthDp - this is the most reliable method
    // requiresSmallestWidthDp="600" explicitly requires tablet minimum width
    // This is the method Google Play Console recognizes most reliably
    
    // Remove compatible-screens if it exists (we'll use supports-screens instead)
    if (androidManifest.manifest['compatible-screens']) {
      delete androidManifest.manifest['compatible-screens'];
    }
    
    // Add or update supports-screens with explicit tablet-only configuration
    if (!androidManifest.manifest['supports-screens']) {
      androidManifest.manifest['supports-screens'] = [{}];
    }
    
    const supportsScreens = androidManifest.manifest['supports-screens'][0];
    
    // CRITICAL: requiresSmallestWidthDp="600" is the key - this is the tablet minimum
    // This explicitly tells Google Play that only devices with 600dp+ width can install
    supportsScreens.$ = {
      ...supportsScreens.$,
      'android:requiresSmallestWidthDp': '600',
      'android:smallScreens': 'false',
      'android:normalScreens': 'false',
      'android:largeScreens': 'true',
      'android:xlargeScreens': 'true',
      'android:anyDensity': 'true',
    };
    
    // Also add uses-feature to explicitly require large screen (tablet)
    // This helps Google Play Console recognize the tablet-only requirement
    if (!androidManifest.manifest['uses-feature']) {
      androidManifest.manifest['uses-feature'] = [];
    }
    
    // Check if large screen feature already exists
    const hasLargeScreen = androidManifest.manifest['uses-feature'].some(
      (feature) => feature.$ && feature.$['android:name'] === 'android.hardware.screen.large'
    );
    
    if (!hasLargeScreen) {
      // Add explicit large screen requirement (tablets only)
      androidManifest.manifest['uses-feature'].push({
        $: {
          'android:name': 'android.hardware.screen.large',
          'android:required': 'true',
        },
      });
    }
    
    return config;
  });

  return config;
};

