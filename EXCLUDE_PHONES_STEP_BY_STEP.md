# Step-by-Step: Filter and Exclude Phones in Device Catalog

## You're Currently On
**Equipment catalog** (Device catalog) page - This is the right place!

## Step-by-Step Instructions

### Step 1: Click "Manage exclusion rules"
- Look at the **top right** of the page, above the search bar
- You'll see a link: **"Manage exclusion rules"** (or "Exclusion rules verwalten" in German)
- **Click this link**

### Step 2: Add Filter for Phones
1. On the Device catalog page, look for the **"Add filter"** button (with a filter icon)
2. Click **"Add filter"**
3. Select **"Form factor"** or **"Geräteform"** from the dropdown
4. Choose **"Phone"** or **"Smartphone"** from the options
5. Click **"Apply"** or **"Anwenden"**

### Step 3: Select All Phones
1. After filtering, you'll see only phone devices in the table
2. At the **top of the table**, there should be a **checkbox** to select all
3. **Check the box** to select all phone devices
   - OR manually select individual phones if needed

### Step 4: Exclude Selected Phones
1. Above the table, look for **"Manage devices"** dropdown button
2. Click the **dropdown arrow** next to "Manage devices"
3. Select **"Exclude"** or **"Mark as incompatible"** or **"Ausschließen"**
4. Confirm the action when prompted

### Alternative Method: Using "Manage exclusion rules"

If you clicked "Manage exclusion rules" in Step 1:

1. **Create New Exclusion Rule:**
   - Click **"Create exclusion rule"** or **"Neue Ausschlussregel erstellen"**
   
2. **Set Rule Criteria:**
   - **Form factor:** Select **"Phone"** or **"Smartphone"**
   - **Action:** Select **"Exclude"** or **"Ausschließen"**
   
3. **Save the Rule:**
   - Click **"Save"** or **"Speichern"**
   - The rule will automatically exclude all phones

### Step 5: Verify Exclusion
1. **Remove the filter** or change filter to **"All devices"**
2. **Add filter** again → Select **"Form factor"** → **"Phone"**
3. Phones should now show as **"Excluded"** or **"Incompatible"** (red X or similar indicator)

### Step 6: Check Tablets Are Still Supported
1. **Change filter** to **"Form factor"** → **"Tablet"**
2. Tablets should still show as **"Supported"** or **"Compatible"** (green checkmark)

### Step 7: Save and Publish
1. After excluding phones, go back to **Release** → **Production**
2. Create or edit your release
3. Upload your new AAB (version 18)
4. **Save** and **Submit for review**

## Visual Guide

```
Equipment catalog page
    ↓
Click "Manage exclusion rules" (top right)
    ↓
OR Click "Add filter" → "Form factor" → "Phone"
    ↓
Select all phones (checkbox at top of table)
    ↓
Click "Manage devices" dropdown → "Exclude"
    ↓
Confirm exclusion
    ↓
Verify: Filter by "Phone" → Should show as "Excluded"
    ↓
Verify: Filter by "Tablet" → Should show as "Supported"
```

## Important Notes

- **"Manage exclusion rules"** is the easiest method - it creates a rule that automatically excludes all phones
- **Manual selection** works if you want to exclude specific phone models only
- After excluding, it may take a few minutes for the changes to reflect
- The exclusion will apply to future releases automatically

## If You Don't See "Exclude" Option

1. Try **"Mark as incompatible"** instead
2. Look for **"Remove from compatibility"**
3. Check if you need to be in **"Edit mode"** first
4. The option might be in a different menu - look for **"Actions"** or **"Device actions"**

## After Excluding Phones

Once phones are excluded:
- Dashboard will show **"Tablets only"** instead of **"Smartphones and tablets"**
- Phone users won't see your app in Play Store
- Only tablet users can install it













