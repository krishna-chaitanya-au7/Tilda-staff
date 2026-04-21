import StaffNotificationsScreen from '@/components/screens/StaffNotificationsScreen';
import { loadSessionSingleFacilityScope } from '@/lib/staffFacilityScope';

export default function FacilityNotificationsScreen() {
  return <StaffNotificationsScreen scopeLoader={loadSessionSingleFacilityScope} />;
}
