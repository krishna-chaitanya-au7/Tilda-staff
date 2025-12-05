import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      // 1. Check if a session exists in storage
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.replace('/login');
        return;
      }

      // 2. Fetch user details to determine role/access
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('user_type, id')
        .eq('auth_id', session.user.id)
        .single();

      if (userError || !userData) {
        await supabase.auth.signOut();
        router.replace('/login');
        return;
      }

      // 3. Fetch access rights
      const { data: userAccessData } = await supabase
        .from('user_access')
        .select('*')
        .or(`user_id.eq.${userData.id},user_id.eq.${session.user.id}`);

      const userType = userData.user_type;
      const hasFacilityAccess = userAccessData?.some(
        (access: any) => access.resource_type === 'facility'
      );
      const hasSupervisorAccess = userAccessData?.some(
        (access: any) => access.resource_type === 'supervisor'
      );

      // 4. Redirect based on role
      if (hasFacilityAccess || userType === 'facility' || userType === 'facility_staff') {
        router.replace('/facility');
      } else if (
        hasSupervisorAccess ||
        userType === 'supervisor' ||
        userType === 'supervisor_staff'
      ) {
        router.replace('/supervisor');
      } else {
        // Valid user but no specific portal access - go to login or a generic page
        // For now, going to login seems safest to avoid infinite loop at '/'
        await supabase.auth.signOut();
        router.replace('/login');
      }

    } catch (e) {
      console.error('Session check failed', e);
      router.replace('/login');
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
