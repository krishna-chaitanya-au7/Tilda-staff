# Submitting to App Store Connect

## Steps to Submit iOS App to App Store Connect

### Step 1: Build iOS App (if not already built)
```bash
cd Tilda-staff
eas build --platform ios --profile production --clear-cache
```

This will:
- Build the iOS app with the updated icons
- Upload it to EAS servers
- Generate an IPA file ready for submission

### Step 2: Submit to App Store Connect
```bash
eas submit --platform ios --profile production
```

This will:
- Automatically submit the latest build to App Store Connect
- Use your Apple credentials (you'll be prompted to authenticate)
- Upload the build to App Store Connect for review

## Current Configuration

✅ **Ready for submission**:
- Build number: 20
- Icons: Updated with approved Tilda icons
- iPad-only: Configured via `withIpadOnly.js` plugin
- Bundle ID: `tildastaff.app`

## Notes

- Make sure you're logged in to your Apple Developer account
- The submission process will ask for your Apple ID credentials
- After submission, you can track the review status in App Store Connect
- The app will go through Apple's review process (usually 24-48 hours)

## After Submission

1. Check App Store Connect for submission status
2. Wait for Apple's review
3. Once approved, the app will be available on the App Store (iPad only)

















