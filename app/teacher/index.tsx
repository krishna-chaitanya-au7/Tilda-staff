import { Redirect } from 'expo-router';

export default function TeacherIndexRedirect() {
  return <Redirect href={'/teacher/attendance' as any} />;
}
