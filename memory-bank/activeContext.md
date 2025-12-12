# Active Context

## Current Focus
- Feature Parity: Implementing "Came Late" / "Left Early" options in Attendance screen.
- Debugging: Resolving "Failed to save event" error when adding notes.

## Recent Changes
### Attendance Screen (`Tilda-staff/app/supervisor/attendance.tsx`)
- Integrated `AttendanceEventDialog` for time/comment input.
- Added `StatusOptionsModal` for "Came Late", "Left Early", and "Reset" options.
- **Improved `saveAttendanceEvent`**: Added handling for temporary IDs (from optimistic updates) to prevent "Failed to save event" errors when adding notes immediately after taking attendance. If a temporary ID is found, it attempts to fetch the real ID from the database before updating.
- **Reset Option**: Confirmed "Zurücksetzen" (Reset) exists in the web version and ensured it is present in the mobile version. It resets the attendance status to "Pending".

### Attendance Event Dialog (`Tilda-staff/components/AttendanceEventDialog.tsx`)
- Implemented native `DateTimePicker` for better UX.
- Added validation for time input.

## Active Decisions
- **Reset Functionality**: The "Reset" option sets the status to "Pending", matching the web behavior. It does not explicitly clear the notes history in the database, but the UI might hide them based on status.
- **Time Input**: Using native picker is preferred over text input for mobile.

## Next Steps
- Verify if the "Failed to save event" error is resolved with the temp ID handling.
- If not, get the specific error message from the user.
