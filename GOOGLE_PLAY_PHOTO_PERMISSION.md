# Google Play Photo/Video Permission Declaration

## Error Message

"All developers requesting access to photo and video permissions must inform Google Play about the main function of their app."

## What This Means

Google Play requires you to declare why your app needs photo/video permissions. This is a policy requirement to ensure apps use these sensitive permissions appropriately.

## How to Fix in Google Play Console

### Step 1: Navigate to Data Safety Section

1. **Go to Google Play Console**
2. **Select your app** (Tilda Staff)
3. **Go to**: `Policy` → `App content` → `Data safety`
4. Or directly: `Policy` → `App content` → `Data safety` → `Data types`

### Step 2: Declare Photo/Video Permissions

1. **Find the "Photos and videos" section**
2. **Click "Add data type"** or edit existing entry
3. **Select**: "Photos and videos"
4. **Answer the questions**:

   **Question 1: "Does your app collect or share this data type?"**
   - Select: **"Yes, this data is collected"** (or "Yes, this data is shared" if you share it)

   **Question 2: "Is this data required for your app to function, or can users choose whether it's collected?"**
   - Select: **"Users can choose whether this data is collected"** (since users choose to send photos/videos)

   **Question 3: "Why is this data collected?"**
   - Select: **"App functionality"** or **"Messaging or communication"**
   - Based on your app: **"Messaging or communication"** is most appropriate
   - Add description: "To allow users to send images and videos in messages"

   **Question 4: "How is this data used?"**
   - Select: **"App functionality"** or **"Messaging"**
   - Description: "Users can attach photos and videos to messages within the app"

### Step 3: Declare Camera Permission (if separate)

1. **Find "Camera" section** (if shown separately)
2. **Declare camera usage**:
   - **Purpose**: "App functionality"
   - **Description**: "To scan QR codes and take photos for messages"

### Step 4: Save and Submit

1. **Click "Save"** after completing all declarations
2. **Return to your release** and try to save again
3. The error should be resolved

## Your App's Use Cases

Based on your permissions and descriptions:

**Photo/Video Permissions (READ_MEDIA_IMAGES, READ_MEDIA_VIDEO):**
- **Purpose**: Messaging/Communication
- **Use**: Users send images and videos in messages
- **User Choice**: Yes (users choose when to attach media)

**Camera Permission:**
- **Purpose**: App functionality
- **Use**: Scan QR codes and take photos for messages
- **User Choice**: Yes (users choose when to use camera)

## Quick Answer

In Google Play Console:
1. Go to `Policy` → `App content` → `Data safety`
2. Find "Photos and videos" section
3. Declare: **"Messaging or communication"** as the purpose
4. Description: **"To allow users to send images and videos in messages"**
5. Save and return to your release

## Note

This is a **Google Play Console form requirement**, not a code change. You don't need to modify your app code - just fill out the declaration form in the Play Console.
















