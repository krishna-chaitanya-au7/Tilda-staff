import { Redirect } from 'expo-router';

// Kindergarten staff: no dashboard — go straight to attendance
export default function FacilityIndexRedirect() {
  return <Redirect href="/facility/attendance" />;
}
