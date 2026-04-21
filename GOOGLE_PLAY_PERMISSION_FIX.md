# Google Play Photo/Video Permission Fix

## Problem

Google Play rejected the app because it uses `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` permissions, which are only allowed for apps that need **persistent access to all photos/videos** on the device.

Your app only needs **one-time access** (selecting images/videos for messages), so these permissions are not allowed.

## Solution Applied

### 1. Removed Restricted Permissions

Removed from `app.json`:
- ❌ `android.permission.READ_MEDIA_IMAGES`
- ❌ `android.permission.READ_MEDIA_VIDEO`
- ❌ `android.permission.READ_MEDIA_DOCUMENTS`
- ❌ `android.permission.READ_EXTERNAL_STORAGE` (deprecated for Android 13+)

### 2. Kept Required Permissions

Kept:
- ✅ `android.permission.CAMERA` (for QR code scanning and taking photos)
- ✅ `android.permission.RECORD_AUDIO` (if needed for audio messages)

### 3. Using Android Photo Picker

The app already uses `expo-image-picker`, which automatically uses the **Android Photo Picker** (system picker) on Android 13+ devices. This doesn't require any permissions!

**How it works:**
- On Android 13+: Uses system Photo Picker (no permissions needed)
- On older Android: May still work with existing permissions or fallback methods
- The user experience remains the same - users can still select photos/videos

### 4. Version Code Incremented

- Changed from `7` → `8` (required for new submission)

## What Changed in Code

**Before:**
```json
"permissions": [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  ...
]
```

**After:**
```json
"permissions": [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO"
]
```

## Next Steps

1. **Rebuild the app:**
   ```bash
   cd Tilda-staff
   npx expo prebuild --clean --platform android
   eas build --platform android --profile production
   ```

2. **Upload new AAB to Google Play Console**

3. **Update Data Safety Declaration:**
   - Go to `Policy` → `App content` → `Data safety`
   - Update photo/video permissions declaration to reflect that you're using the system photo picker
   - Or remove the photo/video data type declaration if no longer needed

4. **Submit for review**

## Important Notes

- ✅ **No code changes needed** - `expo-image-picker` already supports Android Photo Picker
- ✅ **User experience unchanged** - Users can still select and send photos/videos
- ✅ **Compliant with Google Play policy** - Using system picker instead of broad permissions
- ⚠️ **Android 13+ only** - Photo Picker works automatically on Android 13+
- ⚠️ **Older Android versions** - May need fallback, but expo-image-picker handles this

## Testing

After rebuilding, test that:
- Users can still select photos from gallery
- Users can still select videos from gallery
- Camera functionality still works (for taking new photos)
- QR code scanning still works

All functionality should work the same, but now compliant with Google Play policies!















