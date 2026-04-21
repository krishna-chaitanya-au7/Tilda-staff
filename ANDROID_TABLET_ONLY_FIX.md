# Android Tablet-Only Fix

## Problem
After publishing to Google Play Store, the app was showing as "not compatible" for both Android mobile and tablet devices.

## Root Cause
The previous configuration used `compatible-screens` which is an **exclusionary list**. This approach:
- Requires listing every possible combination of screen size and density
- If a device doesn't match exactly one of the listed combinations, it's excluded
- Can be too restrictive and cause compatibility issues with Google Play Store

## Solution
Changed to use `supports-screens` with `requiresSmallestWidthDp="600"`, which is:
- The **recommended approach** by Google Play Store for tablet-only apps
- More flexible and works better with device filtering
- Uses a minimum width requirement (600dp = tablet minimum) instead of exact matches

## Changes Made

### 1. Updated Plugin (`plugins/withTabletOnly.js`)
- Removed `compatible-screens` approach
- Added `supports-screens` with:
  - `requiresSmallestWidthDp="600"` - Requires minimum 600dp width (tablets only)
  - `smallScreens="false"` - Explicitly excludes phones
  - `normalScreens="false"` - Explicitly excludes phones
  - `largeScreens="true"` - Allows 7" tablets
  - `xlargeScreens="true"` - Allows 10" tablets
  - `anyDensity="true"` - Supports all screen densities

### 2. Updated Version Code
- Incremented `versionCode` from 9 to 10 in `app.json` (required for new release)

### 3. Updated Documentation
- Updated `GOOGLE_PLAY_TABLET_ONLY.md` to reflect new configuration

## Next Steps

### 1. Rebuild the App
You need to rebuild the Android app so the new manifest configuration is applied:

```bash
# Clean and rebuild
cd Tilda-staff
npx expo prebuild --clean
eas build --platform android --profile production
```

### 2. Verify the AndroidManifest.xml
After rebuilding, check that `android/app/src/main/AndroidManifest.xml` contains:

```xml
<supports-screens
    android:requiresSmallestWidthDp="600"
    android:smallScreens="false"
    android:normalScreens="false"
    android:largeScreens="true"
    android:xlargeScreens="true"
    android:anyDensity="true" />
```

**Important:** The old `compatible-screens` section should be **removed**.

### 3. Test the Build
Before publishing:
- Test on an Android tablet to ensure it works
- Verify the APK/AAB shows tablet-only in Google Play Console

### 4. Publish to Google Play Store
1. Upload the new build to Google Play Console
2. The app should now be correctly filtered to tablets only
3. Mobile phones will not see the app in the Play Store
4. Tablets will be able to install it

## Verification

After publishing, you can verify:
1. **In Google Play Console:**
   - Go to **Release → Production → App bundle explorer**
   - Check device compatibility - should show tablets only

2. **On Devices:**
   - Try accessing the app from a phone - should not appear in Play Store
   - Try accessing from a tablet - should be available

## Technical Details

### Why `requiresSmallestWidthDp="600"`?
- 600dp is the minimum width for Android tablets
- Phones typically have 320-480dp width
- This ensures only tablets can install the app

### Why `supports-screens` instead of `compatible-screens`?
- `compatible-screens` is exclusionary (must match exactly)
- `supports-screens` is inclusionary (supports these and larger)
- Google Play Store prefers `supports-screens` for better device filtering
- More flexible for future device compatibility

## Notes

- The iOS configuration remains unchanged (already working with `UIDeviceFamily: [2]`)
- This change only affects Android builds
- You may need to wait a few hours after publishing for Google Play Store to update device compatibility














