import StaffMensaScreen from '@/components/screens/StaffMensaScreen';
import { loadSessionSingleFacilityScope } from '@/lib/staffFacilityScope';

export default function TeacherMensaScreen() {
  return <StaffMensaScreen scopeLoader={loadSessionSingleFacilityScope} />;
}
