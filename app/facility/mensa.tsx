import StaffMensaScreen from '@/components/screens/StaffMensaScreen';
import { loadSessionSingleFacilityScope } from '@/lib/staffFacilityScope';

export default function FacilityMensaScreen() {
  return <StaffMensaScreen scopeLoader={loadSessionSingleFacilityScope} />;
}
