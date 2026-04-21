# Alternative Methods to Exclude Phones (When Form Factor Not Available)

## Problem
The "Select rule type" dropdown doesn't show "Form factor" option - only shows "RAM" and "System-on-a-Chip".

## Solution: Use Device Catalog Direct Method

Since exclusion rules don't have "Form factor" option, we need to exclude phones directly from the Device Catalog.

### Method 1: Direct Exclusion from Device Catalog (Recommended)

1. **Go Back to Device Catalog:**
   - Click the **"← Equipment catalog"** link at the top
   - OR navigate: **Review and optimize** → **Range and devices** → **Equipment catalog**

2. **Filter by Form Factor:**
   - Click **"Add filter"** button
   - Select **"Form factor"** or **"Geräteform"**
   - Choose **"Phone"** or **"Smartphone"**
   - Click **"Apply"**

3. **Select All Phones:**
   - Check the **checkbox at the top of the table** to select all phones
   - You should see all phone devices selected

4. **Exclude Selected Devices:**
   - Look for **"Manage devices"** dropdown (above the table)
   - Click the dropdown arrow
   - Select **"Exclude"** or **"Mark as incompatible"**
   - Confirm the action

5. **Verify:**
   - Phones should now show as **"Excluded"** or **"Incompatible"**
   - Change filter to **"Tablet"** - should still show as **"Supported"**

### Method 2: Use Advanced Settings → Form Factors Tab

1. **Navigate to Advanced Settings:**
   - Go to: **Test and publish** → **Advanced settings**
   - Click on **"Form factors"** tab (not "App availability")

2. **Exclude Phone Form Factor:**
   - In the Form factors tab, you should see a list of form factors
   - Find **"Phone"** or **"Smartphone"**
   - **Uncheck** or **disable** the Phone option
   - **Keep Tablet enabled**
   - **Save** changes

### Method 3: During Release Creation

1. **Go to Release:**
   - Navigate to: **Test and publish** → **Production** → **Create new release**

2. **Upload AAB:**
   - Upload your new AAB file (version 18)

3. **Check Device Compatibility Section:**
   - In the release page, look for **"Device compatibility"** or **"Supported devices"** section
   - You should see a table showing phones and tablets
   - Look for options to **exclude phones** or **mark as incompatible**

4. **Exclude Before Publishing:**
   - Before clicking "Save" or "Review release", exclude phones
   - Then proceed with publishing

### Method 4: Contact Google Play Support

If none of the above methods work:

1. **Contact Support:**
   - In Google Play Console, go to **Help** or **Support**
   - Explain that you need to exclude phones from your tablet-only app
   - They can manually exclude phones for you

2. **Provide Information:**
   - Tell them your app package: `tildastaff.app`
   - Explain it's a tablet-only app
   - Mention that "Form factor" is not available in exclusion rules

## Why Form Factor Might Not Be Available

- Google Play Console interface varies by account/app
- Some features may not be available for all apps
- The exclusion rules feature might be limited in your console version

## Recommended Action

**Use Method 1 (Device Catalog Direct Exclusion)** - This is the most reliable method and should work regardless of exclusion rules limitations.

## After Excluding Phones

1. **Verify in Dashboard:**
   - Go to **Dashboard**
   - Check **"Latest production release"**
   - Should show **"Tablets only"** instead of **"Smartphones and tablets"**

2. **Publish New Release:**
   - Upload version 18 AAB
   - Phones should automatically be excluded
   - Only tablets will be able to install













