# Google Play Store - Tablet-Only App Configuration

## Issue: Play Store Asking for Mobile Screenshots

Even though your app is configured to be tablet-only, Google Play Store may still ask for mobile (phone) screenshots during the initial listing process.

## Solutions

### Option 1: Skip Phone Screenshots (Recommended)

In Google Play Console:

1. **Go to Store presence → Main store listing**
2. **Scroll to "Graphics" section**
3. **For "Phone screenshots"**:
   - You can try leaving it empty or uploading tablet screenshots
   - Google Play may accept tablet screenshots for the phone section if the app is truly tablet-only
4. **For "7-inch tablet screenshots"** and **"10-inch tablet screenshots"**:
   - Upload your tablet screenshots here (these are required)

### Option 2: Upload Tablet Screenshots to Phone Section

If Google Play still requires phone screenshots:

1. **Use your tablet screenshots** for the phone section
2. The screenshots won't be shown to phone users anyway (since the app won't be available on phones)
3. This is just to satisfy the Play Console requirement

### Option 3: Verify Device Compatibility Settings

1. **Go to Policy → App content → Device compatibility**
2. **Check that your app is marked as "Tablet only" or "Designed for tablets"**
3. After the app is published, Google Play will automatically filter it to tablets only based on your manifest configuration

## Current Configuration

✅ **Your app is properly configured for tablet-only**:
- `supports-screens` with `requiresSmallestWidthDp="600"` in AndroidManifest.xml restricts to tablets only
- `smallScreens="false"` and `normalScreens="false"` explicitly exclude phones
- `largeScreens="true"` and `xlargeScreens="true"` allow all tablet sizes
- The app requires minimum 600dp width (tablet minimum), ensuring phones cannot install it
- The app will NOT be available on phones once published

## Screenshot Requirements

**Required:**
- ✅ 7-inch tablet screenshots (at least 2)
- ✅ 10-inch tablet screenshots (at least 2)

**May be required (but can use tablet screenshots):**
- ⚠️ Phone screenshots (if required, use tablet screenshots)

## After Publishing

Once your app is published:
- Google Play will automatically filter the app to tablets only
- Phone users will NOT see your app in the Play Store
- Only tablet users will be able to download it

## Note

Google Play Console's screenshot requirements can be confusing for tablet-only apps. The important thing is:
1. Your manifest correctly restricts to tablets (✅ Done)
2. You provide tablet screenshots (✅ Required)
3. Phone screenshots may be required by the UI, but won't affect availability (you can use tablet screenshots)

The app will only be available on tablets regardless of what screenshots you upload to the phone section.



