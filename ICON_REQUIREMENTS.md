# App Icon Requirements - Apple App Store

## Issue - RESOLVED ✅
Apple rejected the app because the icons **appeared to be placeholder icons**. 

**Solution Applied**: 
- ✅ Copied the approved icon from Tilda app (which was already approved by Apple)
- ✅ Updated iOS icon: `./assets/images/icon.png` (same as Tilda)
- ✅ Updated Android adaptive icon: `./assets/images/android-icon-foreground.png` (same as Tilda)
- ✅ Updated Android background color to match Tilda: `#ffffff`
- ✅ Incremented build number: 18 → 19

## Requirements

### iOS Icon
- **File**: `./assets/images/icon.png`
- **Size**: Exactly 1024x1024 pixels
- **Format**: PNG with transparency support
- **Content**: Must be a finalized, professional icon (NOT a placeholder)
- **Design**: Should be recognizable and consistent with your app branding

### Android Icons
- **Foreground**: `./assets/images/android-icon-foreground.png` (1024x1024)
- **Background**: `./assets/images/android-icon-background.png` (1024x1024)
- **Monochrome**: `./assets/images/android-icon-monochrome.png` (1024x1024)
- **Consistency**: All Android icons should match the iOS icon design

## Icon Design Guidelines

1. **No Placeholders**: Do NOT use default Expo, React Native, or template icons
2. **Consistency**: All icon sizes should look similar and recognizable
3. **Branding**: Icons should represent "Tilda Staff" app clearly
4. **Simplicity**: Icons should be clear and recognizable at small sizes
5. **No Text**: Avoid text in icons (Apple discourages text in app icons)

## Current Configuration

The `app.json` is now configured with:
- iOS icon: `./assets/images/icon.png`
- Android adaptive icons with foreground, background, and monochrome variants

## Next Steps

### Option 1: Create New Professional Icon (Recommended)

1. **Design a New 1024x1024 Icon**:
   - Start with a vector design (SVG) if possible - scales perfectly
   - Export at exactly 1024x1024 pixels
   - Use design tools: Figma, Adobe Illustrator, Sketch, or Canva
   - **Important**: Make it look professional and finalized - NOT like a template or placeholder

2. **Reference the Main Tilda App**:
   - Check `../Tilda/assets/icon.png` for design reference
   - Create a "Staff" variant that matches the Tilda branding
   - Ensure visual consistency between Tilda and Tilda Staff apps
   - If Tilda's icon is approved and professional, use it as a base

3. **Icon Design Elements**:
   - Use your app's brand colors and style
   - Include recognizable elements related to "Staff" or your app's purpose
   - Avoid generic shapes, default templates, or "coming soon" text
   - Make it distinctive and professional

### Option 2: Use Tilda App Icon as Base

If the main Tilda app has an approved, professional icon:

1. Check `../Tilda/assets/icon.png` - if it's a finalized design
2. Copy it as a starting point
3. Modify it to represent "Tilda Staff" (add badge, different color, staff icon, etc.)
4. Ensure the modification is clear and professional
5. Save as 1024x1024 PNG

### After Creating/Scaling the Icon

1. **Replace Icon Files**:
   - Replace `./assets/images/icon.png` with your finalized 1024x1024 icon
   - Verify the file is exactly 1024x1024 pixels (check file properties)
   - Replace Android icon files with matching designs
   - Ensure all files are exactly 1024x1024 pixels

3. **Test Icons**:
   - Use `npx expo prebuild` to generate native projects
   - Check icons appear correctly in iOS Simulator and Android Emulator
   - Verify icons look professional and not like placeholders

4. **Rebuild and Resubmit**:
   - ✅ Build number incremented: 18 → 19
   - Build new production build: `eas build --platform ios --profile production`
   - Submit to App Store Connect: `eas submit --platform ios`

## Tools for Creating Icons

### Design Tools
- **Figma** - Free, web-based, great for icon design
- **Adobe Illustrator** - Professional vector design
- **Canva** - Easy online editor with icon templates
- **Photopea** (https://www.photopea.com/) - Free Photoshop alternative

### Icon Generators
- **AppIcon.co** (https://www.appicon.co/) - Generates all sizes from one icon
- **IconKitchen** (https://icon.kitchen/) - Android adaptive icon generator

## Important Notes

- Apple reviewers check icons on actual devices (iPad Air 11-inch in your case)
- Icons must be finalized - no "coming soon" or placeholder text
- All icon sizes should be visually consistent
- The icon is the first thing users see - make it professional and representative of your app

## Verification Checklist

Before resubmitting:
- [ ] `icon.png` is 1024x1024 pixels
- [ ] `icon.png` is NOT a placeholder/default icon
- [ ] Android icons match iOS icon design
- [ ] All icons are consistent and recognizable
- [ ] Icons look professional and finalized
- [ ] Build number incremented
- [ ] Tested on iOS Simulator to verify icon appearance

