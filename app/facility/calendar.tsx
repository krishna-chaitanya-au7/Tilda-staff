import StaffCalendarScreen from '@/components/screens/StaffCalendarScreen';
import { loadSessionSingleFacilityScope } from '@/lib/staffFacilityScope';

export default function FacilityCalendarScreen() {
  return <StaffCalendarScreen scopeLoader={loadSessionSingleFacilityScope} />;
}
