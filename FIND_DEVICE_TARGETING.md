# How to Find Device Targeting in Google Play Console

## Current Location
You're in **Advanced settings** → **App availability** tab. You need to go to the **"Form factors"** tab.

## Step-by-Step Instructions

### 1. Click on "Form factors" Tab
- In the **Advanced settings** page, you'll see several tabs at the top:
  - App availability (currently selected)
  - **Form factors** ← **CLICK THIS ONE**
  - Managed Play Store
  - Play while downloading
  - Alignment according to mobile network provider
  - App Actions

### 2. In the "Form factors" Tab
- This tab will show you all device form factors (Phone, Tablet, TV, etc.)
- You should see options to **exclude** or **include** specific form factors
- Look for **"Phone"** or **"Smartphone"** and click to **exclude** it

### 3. Alternative: Device Catalog
If you don't see exclusion options in Form factors tab:

1. **Go to Device Catalog:**
   - Navigate to: **Test and publish** → **Device catalog**
   - OR: **Release** → **Production** → **Device catalog**

2. **Filter and Exclude:**
   - Use the filter to show only **"Phone"** devices
   - Select all phones
   - Click **"Exclude"** or **"Mark as incompatible"**

## Quick Navigation Path

**Option 1: Form factors tab (in Advanced settings)**
```
Advanced settings → Form factors tab → Exclude "Phone"
```

**Option 2: Device Catalog**
```
Test and publish → Device catalog → Filter by "Phone" → Exclude all
```

**Option 3: During Release**
```
Release → Production → Create new release → Device compatibility section
```

## What to Look For

In the **Form factors** tab, you should see:
- List of form factors (Phone, Tablet, TV, etc.)
- Toggle switches or checkboxes to include/exclude each form factor
- **Uncheck or disable "Phone"** to exclude it
- **Keep "Tablet" enabled** to allow it

## If You Still Can't Find It

The device targeting feature might be in a different location depending on your Google Play Console version. Try:

1. **Search in Google Play Console:**
   - Use the search bar at the top
   - Search for "device targeting" or "form factors"

2. **Check Release Page:**
   - Go to **Release** → **Production**
   - When creating/editing a release, look for device compatibility options

3. **Contact Support:**
   - If you can't find it, Google Play Support can help exclude phones manually













