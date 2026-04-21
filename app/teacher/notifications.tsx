import StaffNotificationsScreen from '@/components/screens/StaffNotificationsScreen';
import { loadSessionSingleFacilityScope } from '@/lib/staffFacilityScope';

export default function TeacherNotificationsScreen() {
  return <StaffNotificationsScreen scopeLoader={loadSessionSingleFacilityScope} />;
}
