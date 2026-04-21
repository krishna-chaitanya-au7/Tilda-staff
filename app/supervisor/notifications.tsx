import StaffNotificationsScreen from '@/components/screens/StaffNotificationsScreen';
import { loadSessionSupervisorScope } from '@/lib/staffFacilityScope';

export default function SupervisorNotificationsScreen() {
  return <StaffNotificationsScreen scopeLoader={loadSessionSupervisorScope} />;
}
