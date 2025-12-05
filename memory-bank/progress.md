# Progress Status

## What Works
- **Dashboard**: 
    - Live stats (Children, Facilities, Tickets, Groups, Caterers, Users).
    - Corrected child counting logic (approved only).
    - Clean header.
- **Attendance**: 
    - List view, filters, logs, messaging.
    - **Performance**: Resolved critical UI freeze issue on real devices.
- **Messages**: 
    - **3-Column Desktop Layout**: List | Chat | Participants.
    - **Dynamic Search**: "New Conversation" now searches server-side.
    - **Participants Card**: Visible inline on desktop, modal on mobile.
    - Thread list, chat history, **Poll creation**, **File attachments**.
    - **Media Handling**: Full-screen image preview and file opening support.
- **User Details**:
    - Profile, tabs, burger menu, parent linking.
- **Grouping**:
    - Flex-based table layout.

## Recent Fixes
- **Polls**: 
    - Fixed "blank message after reload" by refactoring data fetching to load votes separately, avoiding complex nested join issues.
    - Fixed "disappearing poll" issue by preserving optimistic data.
    - Added **optimistic voting** for instant UI feedback.
    - Fixed rendering to show "Umfrage: [Question]" title.
- **Media & Files**:
    - **Image Preview**: Added full-screen modal for images.
    - **File Opening**: Added `Linking.openURL` for documents (PDFs).
- **Build Stability**:
    - Installed missing `react-native-qrcode-svg`, `react-native-svg`, and `expo-document-picker`.
    - Fixed TypeScript errors in Grouping and Resource Selection screens.
    - Fixed missing styles and imports in components.
- **File Attachments**: Switched to `expo-document-picker` and fixed upload errors by using `fetch` API. Added UI support for non-image files.
- **Image Upload**: Replaced deprecated `readAsStringAsync` with `fetch` API for file uploads.
- **Poll Rendering**: Fixed blank poll messages by correctly mapping fetched poll data and adding Realtime listeners for polls and votes.
- **Poll Creation**: Removed non-existent `created_by` column from `msg_polls` insert to match server schema.
- **Attendance UI**: Fixed "unclickable" buttons on real devices.
- **Authentication**: Fixed issue where app would sign out on restart.
- **QR Requests**: Fixed foreign key violation error.

## Known Issues
- None reported at this moment.

## Pending Features
- None explicitly pending.
