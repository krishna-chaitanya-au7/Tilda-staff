import StaffCalendarScreen from '@/components/screens/StaffCalendarScreen';
import { loadSessionSupervisorScope } from '@/lib/staffFacilityScope';

export default function SupervisorCalendarScreen() {
  return <StaffCalendarScreen scopeLoader={loadSessionSupervisorScope} />;
}
