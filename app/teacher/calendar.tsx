import StaffCalendarScreen from '@/components/screens/StaffCalendarScreen';
import { loadSessionSingleFacilityScope } from '@/lib/staffFacilityScope';

export default function TeacherCalendarScreen() {
  return <StaffCalendarScreen scopeLoader={loadSessionSingleFacilityScope} />;
}
