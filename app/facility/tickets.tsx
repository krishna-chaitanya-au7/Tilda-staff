import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import StaffTicketsScreen from '@/components/screens/StaffTicketsScreen';
import {
  getFacilityTypeName,
  resolveFacilityIdFromAccess,
  type StaffUserForPortal,
  type UserAccessRow,
} from '@/lib/facilityPermissions';
import { loadSessionSingleFacilityScope } from '@/lib/staffFacilityScope';
import { supabase } from '@/lib/supabase';

/** Deep links: only Kita (kindergarten) facilities use the Tickets UI. */
export default function FacilityTicketsScreen() {
  const [gate, setGate] = useState<'loading' | 'allow' | 'deny'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) {
          setGate('deny');
          return;
        }
        const { data: uRow } = await supabase
          .from('users')
          .select('id, user_type, record_id, auth_id')
          .eq('auth_id', user.id)
          .maybeSingle();
        if (!uRow || cancelled) {
          setGate('deny');
          return;
        }
        const { data: accessRows } = await supabase
          .from('user_access')
          .select('resource_type, resource_id')
          .or(`user_id.eq.${uRow.id},user_id.eq.${user.id}`);
        const facilityId = resolveFacilityIdFromAccess(
          uRow as StaffUserForPortal,
          (accessRows || []) as UserAccessRow[]
        );
        if (!facilityId || cancelled) {
          setGate('deny');
          return;
        }
        const t = await getFacilityTypeName(facilityId);
        if (cancelled) return;
        setGate(String(t || '').toLowerCase() === 'kindergarten' ? 'allow' : 'deny');
      } catch {
        if (!cancelled) setGate('deny');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (gate === 'deny') {
    return <Redirect href="/facility/attendance" />;
  }
  return <StaffTicketsScreen scopeLoader={loadSessionSingleFacilityScope} />;
}
