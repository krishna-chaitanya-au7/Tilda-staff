# Active Context

## Current Focus
- Refining the "Messages" screen layout and functionality (Search, Participants Card).
- Polishing the "Dashboard" data accuracy.
- **CRITICAL FIX**: Resolved "unclickable" UI issue in Supervisor Attendance screen.

## Recent Changes
- **Supervisor Attendance (`supervisor/attendance.tsx`)**:
    - **Re-enabled Auto-Scroll (GPU Transform)**: Re-implemented auto-scroll using **Reanimated Transforms** (`translateY`). This approach moves the entire list layer on the GPU without triggering layout recalculations or JS bridge traffic, ensuring the app remains clickable and responsive.
    - **Optimized Real-time Logs**: Updated `fetchLogs` to support silent refreshes, preventing full loading spinner flashes when new audit logs arrive via Supabase subscription.
    - **Updated Log Formatting (Strict)**: Updated `AttendanceLogsPanel` to match the web app's *strict* filtering logic (Supervision/Lunch changes only).
- **Messages Screen (`supervisor/messages.tsx`)**:
    - **3-Column Layout**: Implemented a responsive 3-column layout (List | Chat | Participants) for large screens (>= 1200px width).
    - **New Conversation Search**: Implemented robust **dynamic search** (`performSearch`) that queries Supabase for children/parents.
    - **Modal UI**: Adjusted "New Conversation" modal size.
    - **Icon Update**: Changed participants icon to `people`/`people-outline` and adjusted position (right margin 2px) to align with user request.
- **Dashboard (`supervisor/index.tsx`)**:
    - **Child Count Fix**: Updated logic to filter by `is_approved` and count unique `user_id`.
    - **Header Cleanup**: Removed the "Willkommen zurück" subtitle.
- **Groups Settings (`supervisor/groups-settings.tsx`)**:
    - **Header Consistency**: Updated header layout and safe area insets to match the main "Grouping" tab and other screens.

## Next Steps
- Verify the GPU-accelerated auto-scroll on the real device.
- Verify the "Messages" search logic works with real partial matches.
- Confirm the 3-column layout behaves correctly on resize.
- Verify Dashboard stats.
