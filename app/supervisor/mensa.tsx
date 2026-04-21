import StaffMensaScreen from '@/components/screens/StaffMensaScreen';
import { loadSessionSupervisorScope } from '@/lib/staffFacilityScope';

export default function SupervisorMensaScreen() {
  return <StaffMensaScreen scopeLoader={loadSessionSupervisorScope} />;
}
