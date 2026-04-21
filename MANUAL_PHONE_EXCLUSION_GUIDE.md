# Manual Phone Exclusion in Google Play Console

## Current Situation
Even with correct manifest configuration, Google Play Console is still showing phones as compatible. You need to **manually exclude phones** in Google Play Console.

## Step-by-Step Instructions

### Method 1: Device Catalog (Recommended)

1. **Go to Device Catalog:**
   - In Google Play Console, navigate to: **Release** → **Production** → **Device catalog**
   - OR: **Test and publish** → **Device catalog**

2. **Filter by Form Factor:**
   - Click on **"Filters"** or **"Form factor"** dropdown
   - Select **"Phone"** or **"Smartphone"**

3. **Select All Phones:**
   - Check the box at the top to **"Select all"** phones
   - OR manually select all phone devices

4. **Exclude Phones:**
   - Click **"Actions"** or **"Exclude"** button
   - Select **"Exclude from compatibility"** or **"Mark as incompatible"**
   - Confirm the action

5. **Verify:**
   - Phones should now show as **"Excluded"** or **"Incompatible"**
   - Only tablets should show as **"Compatible"**

### Method 2: Advanced Settings (If Available)

1. **Go to Advanced Settings:**
   - Navigate to: **Test and publish** → **Advanced settings**
   - Scroll down to **"Device targeting"** section

2. **Exclude Phone Form Factor:**
   - Look for **"Exclude devices"** or **"Device targeting"** option
   - Select **"Phone"** or **"Smartphone"** form factor
   - Click **"Exclude"** or **"Exclude all phones"**
   - Save changes

### Method 3: During Release Review

1. **When Creating New Release:**
   - Go to **Release** → **Production** → **Create new release**
   - Upload your new AAB (version 18)
   - In the **"Device compatibility"** section, you should see phones listed
   - Look for an option to **"Exclude phones"** or **"Mark phones as incompatible"**

2. **Before Publishing:**
   - Review the device compatibility table
   - If phones are still shown, look for exclusion options
   - Exclude phones before clicking **"Save"** or **"Review release"**

## After Excluding Phones

1. **Publish the Release:**
   - Save and submit the release for review
   - Wait for Google Play to process (24-48 hours)

2. **Verify in Dashboard:**
   - Go to **Dashboard**
   - Check **"Latest production release"**
   - It should now show **"Tablets only"** instead of **"Smartphones and tablets"**

3. **Check Device Catalog:**
   - Go to **Device catalog**
   - Filter by **"Phone"** - should show as **"Excluded"**
   - Filter by **"Tablet"** - should show as **"Compatible"**

## Current Manifest Configuration (Correct)

Your manifest now has:
- ✅ `<uses-feature android:name="android.hardware.screen.large" android:required="true"/>`
- ✅ `<supports-screens android:requiresSmallestWidthDp="600" .../>`

Both are correct. The manual exclusion in Google Play Console will ensure phones are excluded even if the manifest alone doesn't fully filter them.

## Important Notes

- **Manual exclusion is required** - Google Play Console sometimes doesn't fully respect manifest-only configuration
- **Both methods work together** - Manifest configuration + manual exclusion = guaranteed tablet-only
- **Changes take time** - After excluding phones, it may take 24-48 hours to fully propagate
- **Version 18** - The new build includes both `uses-feature` and `supports-screens` configurations

## If You Can't Find the Exclusion Option

If you don't see an option to exclude phones:
1. **Contact Google Play Support** - They can help exclude phones manually
2. **Check App Bundle Explorer** - Go to **Release** → **Production** → **App bundle explorer** → Check device compatibility
3. **Wait for Processing** - Sometimes Google Play needs time to process manifest changes (24-48 hours)













